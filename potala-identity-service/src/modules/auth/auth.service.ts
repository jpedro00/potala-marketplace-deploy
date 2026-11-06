import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { parseBrazilianDocument } from '../../common/utils/brazilian-document';
import {
  CreateSellerForOwnerResult,
  SellersServiceClient,
} from '../../clients/sellers-service.client';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { RegisterSellerDto } from './dto/register-seller.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { PublicUser, toPublicUser } from './auth.serializer';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
    private readonly sellersServiceClient: SellersServiceClient,
  ) {}

  async registerCustomer(dto: RegisterCustomerDto): Promise<{
    user: PublicUser;
    profile: { id: string; fullName: string; phone: string | null };
    customer: { id: string };
  }> {
    const email = dto.email.trim().toLowerCase();
    await this.ensureEmailIsAvailable(email);
    const passwordHash = await this.passwordService.hash(dto.password);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          status: UserStatus.ACTIVE,
        },
      });

      await tx.userRole.create({
        data: { userId: user.id, role: Role.CUSTOMER },
      });

      const profile = await tx.userProfile.create({
        data: {
          userId: user.id,
          fullName: dto.name.trim(),
          phone: dto.phone?.trim(),
        },
      });

      const customer = await tx.customerProfile.create({
        data: { userId: user.id },
      });

      return { user, profile, customer };
    });

    return {
      user: toPublicUser({
        ...created.user,
        roles: [{ role: Role.CUSTOMER }],
      }),
      profile: {
        id: created.profile.id,
        fullName: created.profile.fullName,
        phone: created.profile.phone,
      },
      customer: { id: created.customer.id },
    };
  }

  /**
   * Two-phase, cross-service registration. Phase 1 (local, transactional):
   * User + UserRole(SELLER) + UserProfile — identity-service's own data.
   * Phase 2 (remote, synchronous HTTP): sellers-service creates Seller
   * (PENDING) + SellerMembership(OWNER) — see docs/internal-api-contract.md.
   *
   * There is no distributed transaction across the two schemas. If phase 2
   * fails, we compensate by deleting the just-created User (cascades to its
   * role and profile) so a failed store creation never leaves an orphaned
   * login behind. This is an intentional MVP tradeoff documented in the
   * architecture analysis: synchronous HTTP + compensation, not a saga/event
   * bus, because the current traffic volume does not justify that
   * infrastructure yet.
   */
  async registerSeller(dto: RegisterSellerDto): Promise<{
    user: PublicUser;
    profile: { id: string; fullName: string };
    seller: CreateSellerForOwnerResult;
  }> {
    const email = dto.email.trim().toLowerCase();
    await this.ensureEmailIsAvailable(email);

    const parsedDocument = parseBrazilianDocument(
      dto.documentType,
      dto.documentNumber,
    );
    if (!parsedDocument.ok) {
      throw new BadRequestException(parsedDocument.message);
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          status: UserStatus.ACTIVE,
        },
      });

      await tx.userRole.create({
        data: { userId: user.id, role: Role.SELLER },
      });

      const profile = await tx.userProfile.create({
        data: {
          userId: user.id,
          fullName: dto.ownerName.trim(),
        },
      });

      return { user, profile };
    });

    try {
      const seller = await this.sellersServiceClient.createSellerForOwner({
        userId: created.user.id,
        ownerName: dto.ownerName.trim(),
        legalName: dto.legalName.trim(),
        tradeName: dto.tradeName.trim(),
        documentType: dto.documentType,
        documentNumberDigits: parsedDocument.digits,
        storeEmail: dto.storeEmail.trim().toLowerCase(),
        phone: dto.phone.trim(),
        description: dto.description?.trim(),
      });

      return {
        user: toPublicUser({
          ...created.user,
          roles: [{ role: Role.SELLER }],
        }),
        profile: {
          id: created.profile.id,
          fullName: created.profile.fullName,
        },
        seller,
      };
    } catch (error) {
      await this.prisma.user.delete({ where: { id: created.user.id } }).catch(
        (cleanupError: unknown) => {
          this.logger.error(
            `Failed to compensate user ${created.user.id} after seller creation failure — manual cleanup required`,
            cleanupError instanceof Error ? cleanupError.stack : undefined,
          );
        },
      );
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<{ user: PublicUser; token: string }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await this.passwordService.verify(
      user.passwordHash,
      dto.password,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === UserStatus.BLOCKED) {
      throw new UnauthorizedException('Account is blocked');
    }

    const { token } = await this.sessionService.createSession(user.id);
    return { user: toPublicUser(user), token };
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) {
      return;
    }
    await this.sessionService.revokeByToken(token);
  }

  /**
   * Identity-only view. Unlike the monolith's /auth/me, this never joins
   * Seller data (that table does not exist in this schema anymore). A
   * frontend showing a SELLER-role user their store status must call
   * sellers-service's own GET /seller/onboarding/status once that service
   * exists — see the architecture analysis for why this is a second call
   * instead of a cross-service join.
   */
  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        roles: true,
        profile: true,
        customerProfile: true,
        adminProfile: true,
      },
    });

    return {
      user: toPublicUser(user),
      profile: user.profile
        ? {
            id: user.profile.id,
            fullName: user.profile.fullName,
            phone: user.profile.phone,
          }
        : null,
      customer: user.customerProfile ? { id: user.customerProfile.id } : null,
      admin: user.adminProfile ? { id: user.adminProfile.id } : null,
    };
  }

  private async ensureEmailIsAvailable(email: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }
  }
}
