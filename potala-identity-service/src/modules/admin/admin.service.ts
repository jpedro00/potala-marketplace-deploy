import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PasswordService } from '../auth/password.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  PAGINATION_ORDER_CREATED_AT_ID_DESC,
  buildPage,
  prismaIdCursorArgs,
  requireCursor,
  resolvePagination,
} from '../../common/pagination/pagination';
import { CreateAdminDto } from './dto/create-admin.dto';

const CUSTOMER_LIST_SELECT = {
  id: true,
  email: true,
  status: true,
  createdAt: true,
  profile: { select: { fullName: true, phone: true } },
} as const;

type BlockableStatus = Extract<UserStatus, 'ACTIVE' | 'BLOCKED'>;

/**
 * Slice of the monolith's original admin module that never got ported when
 * identity-service was split out — sellers-service's own AdminService has
 * a comment marking this gap explicitly: "user review/list/ban endpoints
 * stay in identity-service". Filling it now: list + block/unblock for
 * users who have a CustomerProfile (customers, as opposed to sellers or
 * admins, who don't have one).
 *
 * Unlike sellers-service/catalog-service, this service has no AuditLog
 * model — adding one would mean a schema migration, and this feature was
 * chosen specifically because it needs none (User.status already has
 * ACTIVE/BLOCKED). Block/unblock is therefore not audit-logged here;
 * `reason` is accepted and echoed back in the response, never persisted.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async listCustomers(query: PaginationQueryDto = {}) {
    const { limit, cursor } = resolvePagination(query);
    await requireCursor(cursor, async (id) => {
      const user = await this.prisma.user.findUnique({
        where: { id },
        select: { id: true },
      });
      return user !== null;
    });

    const rows = await this.prisma.user.findMany({
      ...prismaIdCursorArgs(limit, cursor),
      where: { customerProfile: { isNot: null } },
      orderBy: PAGINATION_ORDER_CREATED_AT_ID_DESC,
      select: CUSTOMER_LIST_SELECT,
    });

    return buildPage(
      rows.map((row) => ({
        id: row.id,
        email: row.email,
        status: row.status,
        fullName: row.profile?.fullName ?? null,
        phone: row.profile?.phone ?? null,
        createdAt: row.createdAt,
      })),
      limit,
    );
  }

  async setCustomerStatus(userId: string, status: BlockableStatus, reason?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { customerProfile: true },
    });
    if (!user || !user.customerProfile) {
      throw new NotFoundException('Customer not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status },
    });

    return {
      id: updated.id,
      email: updated.email,
      status: updated.status,
      reason: reason?.trim() || null,
    };
  }

  /**
   * Only reachable by an already-authenticated ADMIN (AdminController is
   * gated by @Roles(Role.ADMIN) globally via SessionAuthGuard/RolesGuard)
   * — there is no @Public() admin self-registration route anywhere, by
   * explicit decision (confirmado com o Arthur, ver status doc). Mirrors
   * AuthService.registerCustomer's shape (User + UserRole + UserProfile in
   * one transaction) plus AdminProfile — the same structure prisma/seed.ts
   * already uses to create the very first admin, just reachable over HTTP
   * now instead of only at deploy time.
   */
  async createAdmin(dto: CreateAdminDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
        },
      });

      await tx.userRole.create({
        data: { userId: user.id, role: Role.ADMIN },
      });

      const profile = await tx.userProfile.create({
        data: { userId: user.id, fullName: dto.name.trim() },
      });

      await tx.adminProfile.create({ data: { userId: user.id } });

      return { user, profile };
    });

    return {
      id: created.user.id,
      email: created.user.email,
      fullName: created.profile.fullName,
      createdAt: created.user.createdAt,
    };
  }

  /**
   * Cross-tenant by design (the opposite of listCustomers' customer scope):
   * every user with an AdminProfile, cursor-paginated same as everywhere
   * else in this project. No search/filter — same minimalism already used
   * by every other admin list screen (Sellers, Customers, Products...).
   */
  async listAdmins(query: PaginationQueryDto = {}) {
    const { limit, cursor } = resolvePagination(query);
    await requireCursor(cursor, async (id) => {
      const user = await this.prisma.user.findUnique({
        where: { id },
        select: { id: true },
      });
      return user !== null;
    });

    const rows = await this.prisma.user.findMany({
      ...prismaIdCursorArgs(limit, cursor),
      where: { adminProfile: { isNot: null } },
      orderBy: PAGINATION_ORDER_CREATED_AT_ID_DESC,
      select: {
        id: true,
        email: true,
        createdAt: true,
        profile: { select: { fullName: true } },
      },
    });

    return buildPage(
      rows.map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.profile?.fullName ?? null,
        createdAt: row.createdAt,
      })),
      limit,
    );
  }
}
