import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async getOwnProfile(userId: string) {
    const profile = await this.prisma.customerProfile.findUnique({
      where: { userId },
      include: {
        addresses: true,
        user: { include: { profile: true } },
      },
    });

    if (!profile) {
      throw new NotFoundException('Customer profile not found');
    }

    return {
      id: profile.id,
      fullName: profile.user.profile?.fullName ?? null,
      phone: profile.user.profile?.phone ?? null,
      addresses: profile.addresses,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  /**
   * PATCH /customers/me — atualiza UserProfile (fullName/phone). Todo
   * cliente autenticado já tem UserProfile (criado no registro, ver
   * RegisterCustomerDto/AuthService), então update() direto é seguro sem
   * upsert.
   */
  async updateOwnProfile(userId: string, dto: UpdateProfileDto) {
    await this.prisma.userProfile.update({
      where: { userId },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      },
    });
    return this.getOwnProfile(userId);
  }

  /**
   * Resolve CustomerProfile.id a partir do userId autenticado — Address
   * referencia CustomerProfile, não User diretamente (ver schema.prisma).
   * Todo endpoint de endereço abaixo passa por aqui primeiro, o que já
   * garante o escopo por dono (nunca aceita um customerId vindo do
   * client).
   */
  private async resolveCustomerProfileId(userId: string): Promise<string> {
    const profile = await this.prisma.customerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('Customer profile not found');
    }
    return profile.id;
  }

  /**
   * POST /customers/me/addresses — mesma regra do antigo mock local
   * (AccountDataContext.saveAddress, ver marketing-place-potala-): o
   * primeiro endereço do cliente sempre nasce padrão, independente do que
   * veio no DTO; um `isDefault: true` explícito também desmarca qualquer
   * padrão anterior. Nunca deixa dois endereços padrão ao mesmo tempo.
   */
  async createAddress(userId: string, dto: CreateAddressDto) {
    const customerId = await this.resolveCustomerProfileId(userId);
    const existingCount = await this.prisma.address.count({
      where: { customerId },
    });
    const makeDefault = dto.isDefault === true || existingCount === 0;

    return this.prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.address.updateMany({
          where: { customerId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.address.create({
        data: {
          customerId,
          label: dto.label,
          recipient: dto.recipient,
          street: dto.street,
          number: dto.number,
          complement: dto.complement,
          neighborhood: dto.neighborhood,
          city: dto.city,
          state: dto.state.toUpperCase(),
          postalCode: dto.postalCode,
          isDefault: makeDefault,
        },
      });
    });
  }

  private async requireOwnAddress(customerId: string, addressId: string) {
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, customerId },
    });
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    return address;
  }

  async updateAddress(userId: string, addressId: string, dto: UpdateAddressDto) {
    const customerId = await this.resolveCustomerProfileId(userId);
    await this.requireOwnAddress(customerId, addressId);
    const makeDefault = dto.isDefault === true;

    return this.prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.address.updateMany({
          where: { customerId, isDefault: true, id: { not: addressId } },
          data: { isDefault: false },
        });
      }
      return tx.address.update({
        where: { id: addressId },
        data: {
          ...(dto.label !== undefined ? { label: dto.label } : {}),
          ...(dto.recipient !== undefined ? { recipient: dto.recipient } : {}),
          ...(dto.street !== undefined ? { street: dto.street } : {}),
          ...(dto.number !== undefined ? { number: dto.number } : {}),
          ...(dto.complement !== undefined ? { complement: dto.complement } : {}),
          ...(dto.neighborhood !== undefined ? { neighborhood: dto.neighborhood } : {}),
          ...(dto.city !== undefined ? { city: dto.city } : {}),
          ...(dto.state !== undefined ? { state: dto.state.toUpperCase() } : {}),
          ...(dto.postalCode !== undefined ? { postalCode: dto.postalCode } : {}),
          ...(makeDefault ? { isDefault: true } : {}),
        },
      });
    });
  }

  /**
   * Mesma regra de negócio do mock local removido (removeAddress em
   * AccountDataContext): nunca deixa remover o endereço padrão direto —
   * o cliente precisa marcar outro como padrão antes (ou, se for o único,
   * não há pra onde promover). Duas mensagens distintas, iguais às que já
   * existiam na UI.
   */
  async deleteAddress(userId: string, addressId: string) {
    const customerId = await this.resolveCustomerProfileId(userId);
    const existing = await this.requireOwnAddress(customerId, addressId);
    if (existing.isDefault) {
      const total = await this.prisma.address.count({ where: { customerId } });
      if (total > 1) {
        throw new BadRequestException(
          'Defina outro endereço como padrão antes de remover o atual.',
        );
      }
      throw new BadRequestException(
        'Não é possível remover o único endereço padrão sem cadastrar outro.',
      );
    }
    await this.prisma.address.delete({ where: { id: addressId } });
  }

  async setDefaultAddress(userId: string, addressId: string) {
    const customerId = await this.resolveCustomerProfileId(userId);
    await this.requireOwnAddress(customerId, addressId);
    return this.prisma.$transaction(async (tx) => {
      await tx.address.updateMany({
        where: { customerId, isDefault: true },
        data: { isDefault: false },
      });
      return tx.address.update({
        where: { id: addressId },
        data: { isDefault: true },
      });
    });
  }
}
