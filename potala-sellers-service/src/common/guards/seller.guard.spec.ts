import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SellerMembershipRole, SellerStatus } from '@prisma/client';
import { SellerActiveGuard, SellerContextGuard } from './seller.guard';
import { createPrismaMock } from '../../test-utils/prisma.mock';
import { RequestWithAuth } from '../types/authenticated-user';
import { Role, UserStatus } from '../types/identity-enums';

function createContext(request: Partial<RequestWithAuth>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('SellerContextGuard', () => {
  it('rejects an unauthenticated request', async () => {
    const prisma = createPrismaMock();
    const guard = new SellerContextGuard(prisma);

    await expect(
      guard.canActivate(createContext({})),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a user with no seller membership', async () => {
    const prisma = createPrismaMock();
    prisma.sellerMembership.findUnique.mockResolvedValue(null);
    const guard = new SellerContextGuard(prisma);

    await expect(
      guard.canActivate(
        createContext({
          authUser: {
            id: 'user-1',
            email: 'a@test.com',
            status: UserStatus.ACTIVE,
            roles: [Role.SELLER],
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('attaches sellerContext for a member with a store', async () => {
    const prisma = createPrismaMock();
    prisma.sellerMembership.findUnique.mockResolvedValue({
      id: 'membership-1',
      userId: 'user-1',
      sellerId: 'seller-1',
      role: SellerMembershipRole.OWNER,
      seller: { status: SellerStatus.PENDING },
    });
    const guard = new SellerContextGuard(prisma);

    const request: Partial<RequestWithAuth> = {
      authUser: {
        id: 'user-1',
        email: 'a@test.com',
        status: UserStatus.ACTIVE,
        roles: [Role.SELLER],
      },
    };
    await guard.canActivate(createContext(request));

    expect(request.sellerContext).toEqual({
      membershipId: 'membership-1',
      userId: 'user-1',
      sellerId: 'seller-1',
      membershipRole: SellerMembershipRole.OWNER,
      sellerStatus: SellerStatus.PENDING,
    });
  });
});

describe('SellerActiveGuard', () => {
  it('rejects when sellerContext is missing', () => {
    const guard = new SellerActiveGuard();
    expect(() => guard.canActivate(createContext({}))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a PENDING store', () => {
    const guard = new SellerActiveGuard();
    const request: Partial<RequestWithAuth> = {
      sellerContext: {
        membershipId: 'm1',
        userId: 'u1',
        sellerId: 's1',
        membershipRole: SellerMembershipRole.OWNER,
        sellerStatus: SellerStatus.PENDING,
      },
    };
    expect(() => guard.canActivate(createContext(request))).toThrow(
      ForbiddenException,
    );
  });

  it('allows an ACTIVE store', () => {
    const guard = new SellerActiveGuard();
    const request: Partial<RequestWithAuth> = {
      sellerContext: {
        membershipId: 'm1',
        userId: 'u1',
        sellerId: 's1',
        membershipRole: SellerMembershipRole.OWNER,
        sellerStatus: SellerStatus.ACTIVE,
      },
    };
    expect(guard.canActivate(createContext(request))).toBe(true);
  });
});
