import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { SellerStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RequestWithAuth } from '../types/authenticated-user';

/**
 * Ported from the monolith's common/guards/seller.guard.ts unchanged in
 * behavior: it still resolves the caller's SellerMembership from THIS
 * service's own database (membros_vendedor), the same table the monolith
 * queried — only PrismaService's connection now points at the `sellers`
 * schema instead of the whole database.
 */
@Injectable()
export class SellerContextGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const user = request.authUser;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const membership = await this.prisma.sellerMembership.findUnique({
      where: { userId: user.id },
      include: { seller: true },
    });

    if (!membership) {
      throw new ForbiddenException('Seller membership not found');
    }

    request.sellerContext = {
      membershipId: membership.id,
      userId: membership.userId,
      sellerId: membership.sellerId,
      membershipRole: membership.role,
      sellerStatus: membership.seller.status,
    };

    return true;
  }
}

@Injectable()
export class SellerActiveGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const seller = request.sellerContext;

    if (!seller) {
      throw new ForbiddenException('Seller context is required');
    }

    if (seller.sellerStatus !== SellerStatus.ACTIVE) {
      throw new ForbiddenException(
        'Seller store is not active. Operational actions are blocked.',
      );
    }

    return true;
  }
}
