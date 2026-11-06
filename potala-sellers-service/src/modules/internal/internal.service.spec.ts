import { SellerMembershipRole, SellerStatus } from '@prisma/client';
import { InternalService } from './internal.service';
import { createPrismaMock } from '../../test-utils/prisma.mock';
import { IdentityServiceClient } from '../../clients/identity-service.client';

function createIdentityClientMock() {
  return {
    introspectSession: jest.fn(),
    getUserById: jest.fn(),
  } as unknown as jest.Mocked<IdentityServiceClient>;
}

describe('InternalService getMembershipByUserId', () => {
  it('returns null when the user has no store membership', async () => {
    const prisma = createPrismaMock();
    prisma.sellerMembership.findUnique.mockResolvedValue(null);
    const service = new InternalService(prisma, createIdentityClientMock());

    await expect(service.getMembershipByUserId('user-1')).resolves.toBeNull();
  });

  it('returns the same shape SellerContextGuard builds locally', async () => {
    const prisma = createPrismaMock();
    prisma.sellerMembership.findUnique.mockResolvedValue({
      id: 'membership-1',
      userId: 'user-1',
      sellerId: 'seller-1',
      role: SellerMembershipRole.OWNER,
      seller: { status: SellerStatus.ACTIVE },
    });
    const service = new InternalService(prisma, createIdentityClientMock());

    await expect(service.getMembershipByUserId('user-1')).resolves.toEqual({
      membershipId: 'membership-1',
      userId: 'user-1',
      sellerId: 'seller-1',
      membershipRole: SellerMembershipRole.OWNER,
      sellerStatus: SellerStatus.ACTIVE,
    });
    expect(prisma.sellerMembership.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      include: { seller: true },
    });
  });
});
