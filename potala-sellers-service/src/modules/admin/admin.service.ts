import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SellerStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  PAGINATION_ORDER_CREATED_AT_ID_DESC,
  buildPage,
  prismaIdCursorArgs,
  requireCursor,
  resolvePagination,
} from '../../common/pagination/pagination';

const SELLER_LIST_SELECT = {
  id: true,
  legalName: true,
  tradeName: true,
  slug: true,
  documentType: true,
  documentNumber: true,
  email: true,
  status: true,
  statusReason: true,
  reviewedAt: true,
  commissionBps: true,
  createdAt: true,
} as const;

type ReviewableStatus = Extract<
  SellerStatus,
  'ACTIVE' | 'REJECTED' | 'SUSPENDED'
>;

const ACTION_BY_STATUS: Record<ReviewableStatus, string> = {
  [SellerStatus.ACTIVE]: 'SELLER_APPROVED',
  [SellerStatus.REJECTED]: 'SELLER_REJECTED',
  [SellerStatus.SUSPENDED]: 'SELLER_SUSPENDED',
};

/** Ported from the monolith's modules/admin/admin.service.ts, `Seller`-only slice: user review/list/ban endpoints stay in identity-service. */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listSellers(query: PaginationQueryDto = {}) {
    const { limit, cursor } = resolvePagination(query);
    await requireCursor(cursor, async (id) => {
      const seller = await this.prisma.seller.findUnique({
        where: { id },
        select: { id: true },
      });
      return seller !== null;
    });

    const rows = await this.prisma.seller.findMany({
      ...prismaIdCursorArgs(limit, cursor),
      orderBy: PAGINATION_ORDER_CREATED_AT_ID_DESC,
      select: SELLER_LIST_SELECT,
    });

    return buildPage(rows, limit);
  }

  async updateSellerStatus(
    actorUserId: string,
    sellerId: string,
    status: ReviewableStatus,
    reason?: string,
  ) {
    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
    });
    if (!seller) {
      throw new NotFoundException('Seller not found');
    }

    const action = ACTION_BY_STATUS[status];
    if (!action) {
      throw new BadRequestException(`Unsupported status transition: ${status}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.seller.update({
        where: { id: sellerId },
        data: {
          status,
          statusReason: reason?.trim() || null,
          reviewedAt: new Date(),
          reviewedByUserId: actorUserId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId,
          action,
          entityType: 'Seller',
          entityId: sellerId,
          metadata: { from: seller.status, to: status, reason: reason ?? null },
        },
      });

      return next;
    });

    return {
      id: updated.id,
      tradeName: updated.tradeName,
      status: updated.status,
      statusReason: updated.statusReason,
      reviewedAt: updated.reviewedAt,
    };
  }
}
