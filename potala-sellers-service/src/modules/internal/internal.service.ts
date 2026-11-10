import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  SellerMembershipRole,
  SellerStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { slugify } from '../../common/utils/text';
import { IdentityServiceClient } from '../../clients/identity-service.client';
import { CreateSellerDto } from './dto/create-seller.dto';

/** Digits-only length identity-service's own check-digit validation guarantees per type. */
const DOCUMENT_DIGIT_LENGTH: Record<string, number> = { CPF: 11, CNPJ: 14 };

export interface CreateSellerResult {
  sellerId: string;
  tradeName: string;
  slug: string;
  status: SellerStatus;
  membershipId: string;
  membershipRole: SellerMembershipRole;
}

/** Same shape as this service's own local SellerContext (common/types/authenticated-user.ts). */
export interface SellerMembershipLookup {
  membershipId: string;
  userId: string;
  sellerId: string;
  membershipRole: SellerMembershipRole;
  sellerStatus: SellerStatus;
}

@Injectable()
export class InternalService {
  private readonly logger = new Logger(InternalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly identityServiceClient: IdentityServiceClient,
  ) {}

  /**
   * Implements the sellers-service side of the two-phase seller
   * registration documented in docs/internal-api-contract.md. Called only
   * by identity-service, immediately after it commits the User locally — if
   * anything here throws, identity-service compensates by deleting that
   * User. There is no distributed transaction across the two schemas; this
   * method's own $transaction only covers what is local to `sellers`.
   */
  async createSellerForOwner(dto: CreateSellerDto): Promise<CreateSellerResult> {
    const expectedLength = DOCUMENT_DIGIT_LENGTH[dto.documentType];
    if (dto.documentNumberDigits.length !== expectedLength) {
      throw new UnprocessableEntityException(
        `documentNumberDigits must have ${expectedLength} digits for ${dto.documentType}`,
      );
    }

    // Defense in depth: userId just came from a user identity-service claims
    // to have created moments ago, but this service never trusts a foreign
    // id it hasn't verified itself — see docs/internal-api-contract.md.
    const owner = await this.identityServiceClient.getUserById(dto.userId);
    if (!owner) {
      throw new UnprocessableEntityException(
        'userId does not correspond to an existing user',
      );
    }

    const existingMembership = await this.prisma.sellerMembership.findUnique({
      where: { userId: dto.userId },
    });
    if (existingMembership) {
      throw new UnprocessableEntityException(
        'User already has a store membership',
      );
    }

    const baseSlug = slugify(dto.tradeName);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const slug = await this.nextAvailableSlug(tx, baseSlug);

        const seller = await tx.seller.create({
          data: {
            legalName: dto.legalName.trim(),
            tradeName: dto.tradeName.trim(),
            slug,
            documentType: dto.documentType,
            documentNumber: dto.documentNumberDigits,
            email: dto.storeEmail.trim().toLowerCase(),
            phone: dto.phone.trim(),
            description: dto.description?.trim(),
            status: SellerStatus.PENDING,
            // commissionBps stays null: no commercial default while
            // PENDING/undefined — same rule as the origin monolith.
          },
        });

        const membership = await tx.sellerMembership.create({
          data: {
            userId: dto.userId,
            sellerId: seller.id,
            role: SellerMembershipRole.OWNER,
          },
        });

        return { seller, membership };
      });

      return {
        sellerId: created.seller.id,
        tradeName: created.seller.tradeName,
        slug: created.seller.slug,
        status: created.seller.status,
        membershipId: created.membership.id,
        membershipRole: created.membership.role,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // The pre-check above already guards the common userId race; in
        // practice this is the (documentType, documentNumber) unique
        // constraint — the 409 documented in the internal contract.
        this.logger.warn(
          `Duplicate store creation attempt for document ${dto.documentType}/${dto.documentNumberDigits}`,
        );
        throw new ConflictException(
          'A store with this document already exists',
        );
      }
      throw error;
    }
  }

  private async nextAvailableSlug(
    tx: Prisma.TransactionClient,
    baseSlug: string,
  ): Promise<string> {
    let slug = baseSlug;
    let suffix = 0;
    while (await tx.seller.findUnique({ where: { slug } })) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }
    return slug;
  }

  /**
   * Added while building catalog-service, which needs to resolve "is this
   * authenticated userId a seller, and which store/role/status" without a
   * local `membros_vendedor` table of its own — the same problem
   * SellerContextGuard solves locally in THIS service, just one hop further
   * away. Returns the exact shape the local guard already builds
   * (SellerContext), so catalog-service's own network-based guard can trust
   * it the same way. Returns null when the user has no store membership —
   * the caller maps that to 404, never to a default/empty context. See
   * docs/internal-api-contract.md.
   */
  async getMembershipByUserId(
    userId: string,
  ): Promise<SellerMembershipLookup | null> {
    const membership = await this.prisma.sellerMembership.findUnique({
      where: { userId },
      include: { seller: true },
    });

    if (!membership) {
      return null;
    }

    return {
      membershipId: membership.id,
      userId: membership.userId,
      sellerId: membership.sellerId,
      membershipRole: membership.role,
      sellerStatus: membership.seller.status,
    };
  }

  async getPaymentSettings(sellerId: string) {
    const seller = await this.prisma.seller.findUnique({where: {id: sellerId}, include: {paymentSettings: true}});
    if (!seller) throw new NotFoundException('Seller not found');
    return {sellerId, status: seller.status, acceptPix: seller.paymentSettings?.acceptPix ?? false, acceptCard: seller.paymentSettings?.acceptCard ?? false, recipientRef: seller.paymentSettings?.recipientRef ?? null, provider: seller.paymentSettings?.provider ?? null, revision: seller.paymentSettings?.revision ?? 0};
  }
}
