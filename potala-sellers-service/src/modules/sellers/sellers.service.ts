import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UpdatePaymentSettingsDto } from './dto/update-payment-settings.dto';
import { SellerStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SellerContext } from '../../common/types/authenticated-user';
import { UpdateSellerSettingsDto } from './dto/update-seller-settings.dto';

/** Ported unchanged from the monolith's modules/sellers/sellers.service.ts. */
const ONBOARDING_MESSAGES: Record<SellerStatus, string> = {
  [SellerStatus.PENDING]:
    'Store is awaiting administrative review. Catalog, inventory and sales remain blocked.',
  [SellerStatus.ACTIVE]: 'Store is active.',
  [SellerStatus.REJECTED]:
    'Store application was rejected. Catalog, inventory and sales remain blocked.',
  [SellerStatus.SUSPENDED]:
    'Store is suspended. Catalog, inventory and sales remain blocked.',
};

@Injectable()
export class SellersService {
  constructor(private readonly prisma: PrismaService) {}

  async getPaymentSettings(context: SellerContext) {
    if (context.membershipRole !== 'OWNER') throw new ForbiddenException('Only the store owner can access payment settings');
    const settings = await this.prisma.sellerPaymentSettings.findUnique({where: {sellerId: context.sellerId}});
    return {acceptPix: settings?.acceptPix ?? false, acceptCard: settings?.acceptCard ?? false, payoutSchedule: settings?.payoutSchedule ?? 'MANUAL', revision: settings?.revision ?? 0, recipientConfigured: Boolean(settings?.recipientRef), bankLabel: settings?.bankLabel ?? null, accountLast4: settings?.accountLast4 ?? null, gatewayStatus: 'UNAVAILABLE', message: 'Preferences only. Charges and payouts require a configured payment provider.'};
  }

  async updatePaymentSettings(context: SellerContext, dto: UpdatePaymentSettingsDto) {
    if (context.membershipRole !== 'OWNER') throw new ForbiddenException('Only the store owner can change payment settings');
    await this.prisma.$transaction(async tx => {
      await tx.sellerPaymentSettings.upsert({where: {sellerId: context.sellerId}, create: {sellerId: context.sellerId, ...dto}, update: {...dto, revision: {increment: 1}}});
      await tx.auditLog.create({data: {actorUserId: context.userId, action: 'SELLER_PAYMENT_PREFERENCES_UPDATED', entityType: 'Seller', entityId: context.sellerId, metadata: {...dto}}});
    });
    return this.getPaymentSettings(context);
  }

  /**
   * Perfil da própria loja pra tela "Configurações" (ver
   * status-migracao-microservicos.md). Campos exibidos mas NÃO editáveis
   * aqui (legalName, documentType/documentNumber, email, status,
   * commissionBps) continuam só de leitura — edição deles fica fora de
   * escopo desta rodada (dados legais/administrativos).
   */
  async getSelf(sellerContext: SellerContext) {
    const seller = await this.prisma.seller.findUniqueOrThrow({
      where: { id: sellerContext.sellerId },
    });

    return {
      id: seller.id,
      membershipRole: sellerContext.membershipRole,
      legalName: seller.legalName,
      tradeName: seller.tradeName,
      slug: seller.slug,
      documentType: seller.documentType,
      documentNumber: seller.documentNumber,
      email: seller.email,
      phone: seller.phone,
      description: seller.description,
      status: seller.status,
      commissionBps: seller.commissionBps,
      createdAt: seller.createdAt,
      updatedAt: seller.updatedAt,
    };
  }

  /**
   * Só tradeName/phone/description são graváveis aqui — ver
   * UpdateSellerSettingsDto pro porquê do resto ficar de fora. Mesmo
   * padrão de auditoria de AdminService.updateSellerStatus (AuditLog),
   * pra manter rastreável quem mudou o quê mesmo sendo a própria loja.
   */
  async updateSelf(sellerContext: SellerContext, dto: UpdateSellerSettingsDto) {
    if (sellerContext.membershipRole !== 'OWNER') throw new ForbiddenException('Only the store owner can change store settings');
    await this.prisma.$transaction(async (tx) => {
      const next = await tx.seller.update({
        where: { id: sellerContext.sellerId },
        data: {
          ...(dto.tradeName !== undefined ? { tradeName: dto.tradeName.trim() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description.trim() || null }
            : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: sellerContext.userId,
          action: 'SELLER_SETTINGS_UPDATED',
          entityType: 'Seller',
          entityId: sellerContext.sellerId,
          metadata: { ...dto },
        },
      });

      return next;
    });

    return this.getSelf({ ...sellerContext });
  }

  async getOnboardingStatus(sellerContext: SellerContext) {
    const seller = await this.prisma.seller.findUniqueOrThrow({
      where: { id: sellerContext.sellerId },
    });

    return {
      sellerId: seller.id,
      tradeName: seller.tradeName,
      slug: seller.slug,
      status: seller.status,
      statusReason: seller.statusReason,
      reviewedAt: seller.reviewedAt,
      membershipRole: sellerContext.membershipRole,
      canOperate: seller.status === SellerStatus.ACTIVE,
      message: ONBOARDING_MESSAGES[seller.status],
    };
  }

  /**
   * Vitrine pública da loja (/vendedor/[slug] no frontend), New this
   * session. Sem sessão, sem guard de tenant — mas SÓ uma loja ACTIVE é
   * visível aqui: PENDING/REJECTED/SUSPENDED dá o mesmo 404 de uma loja
   * inexistente, mesmo padrão já usado por
   * ProductsService.getPublishedById em catalog-service (nunca vaza se
   * uma loja existe ou não por tentativa de slug). Sem coverImageSrc no
   * schema — não existe upload de capa nesta v1, mesmo gap já documentado
   * pra imagem de produto; o frontend usa um fallback genérico.
   */
  async getPublicBySlug(slug: string) {
    const seller = await this.prisma.seller.findUnique({ where: { slug } });
    if (!seller || seller.status !== SellerStatus.ACTIVE) {
      throw new NotFoundException('Seller not found');
    }

    return {
      id: seller.id,
      tradeName: seller.tradeName,
      slug: seller.slug,
      description: seller.description,
      // Prisma.Decimal serializa como string via toJSON() por padrão — convertido
      // pra number aqui pra não surpreender o frontend (mesmo raciocínio de
      // sempre: dinheiro/percentual como tipo previsível, nunca ambíguo).
      ratingAverage: Number(seller.ratingAverage),
    };
  }
}
