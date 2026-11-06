import { NotFoundException } from '@nestjs/common';
import { SellerStatus } from '@prisma/client';
import { SellersService } from './sellers.service';
import { createPrismaMock } from '../../test-utils/prisma.mock';

describe('SellersService.getOnboardingStatus', () => {
  const sellerContext = {
    membershipId: 'membership-1',
    userId: 'user-1',
    sellerId: 'seller-1',
    membershipRole: 'OWNER' as const,
    sellerStatus: SellerStatus.PENDING,
  };

  function baseSeller(status: SellerStatus) {
    return {
      id: 'seller-1',
      tradeName: 'Loja Teste',
      slug: 'loja-teste',
      status,
      statusReason: null,
      reviewedAt: null,
    };
  }

  it('reports PENDING as blocked, awaiting review', async () => {
    const prisma = createPrismaMock();
    prisma.seller.findUniqueOrThrow.mockResolvedValue(
      baseSeller(SellerStatus.PENDING),
    );
    const service = new SellersService(prisma);

    const result = await service.getOnboardingStatus(sellerContext);

    expect(result.canOperate).toBe(false);
    expect(result.message).toMatch(/awaiting administrative review/);
  });

  it('reports ACTIVE as operational', async () => {
    const prisma = createPrismaMock();
    prisma.seller.findUniqueOrThrow.mockResolvedValue(
      baseSeller(SellerStatus.ACTIVE),
    );
    const service = new SellersService(prisma);

    const result = await service.getOnboardingStatus(sellerContext);

    expect(result.canOperate).toBe(true);
    expect(result.message).toBe('Store is active.');
  });

  it('reports REJECTED as blocked', async () => {
    const prisma = createPrismaMock();
    prisma.seller.findUniqueOrThrow.mockResolvedValue(
      baseSeller(SellerStatus.REJECTED),
    );
    const service = new SellersService(prisma);

    const result = await service.getOnboardingStatus(sellerContext);

    expect(result.canOperate).toBe(false);
    expect(result.message).toMatch(/rejected/);
  });

  it('reports SUSPENDED as blocked', async () => {
    const prisma = createPrismaMock();
    prisma.seller.findUniqueOrThrow.mockResolvedValue(
      baseSeller(SellerStatus.SUSPENDED),
    );
    const service = new SellersService(prisma);

    const result = await service.getOnboardingStatus(sellerContext);

    expect(result.canOperate).toBe(false);
    expect(result.message).toMatch(/suspended/);
  });

  it('always echoes the caller membership role from sellerContext, not the database', async () => {
    const prisma = createPrismaMock();
    prisma.seller.findUniqueOrThrow.mockResolvedValue(
      baseSeller(SellerStatus.ACTIVE),
    );
    const service = new SellersService(prisma);

    const result = await service.getOnboardingStatus({
      ...sellerContext,
      membershipRole: 'MANAGER' as const,
    });

    expect(result.membershipRole).toBe('MANAGER');
  });
});

describe('SellersService.getPublicBySlug', () => {
  function activeSeller() {
    return {
      id: 'seller-1',
      tradeName: 'Loja Teste',
      slug: 'loja-teste',
      description: 'Uma loja de teste.',
      status: SellerStatus.ACTIVE,
      ratingAverage: { toString: () => '4.50' } as unknown as number,
    };
  }

  it('returns the public shape for an ACTIVE seller', async () => {
    const prisma = createPrismaMock();
    prisma.seller.findUnique.mockResolvedValue(activeSeller());
    const service = new SellersService(prisma);

    const result = await service.getPublicBySlug('loja-teste');

    expect(result).toEqual({
      id: 'seller-1',
      tradeName: 'Loja Teste',
      slug: 'loja-teste',
      description: 'Uma loja de teste.',
      ratingAverage: 4.5,
    });
    expect(prisma.seller.findUnique).toHaveBeenCalledWith({
      where: { slug: 'loja-teste' },
    });
  });

  it('404s on a nonexistent slug', async () => {
    const prisma = createPrismaMock();
    prisma.seller.findUnique.mockResolvedValue(null);
    const service = new SellersService(prisma);

    await expect(service.getPublicBySlug('inexistente')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s on a non-ACTIVE seller — never leaks PENDING/REJECTED/SUSPENDED by slug', async () => {
    const prisma = createPrismaMock();
    prisma.seller.findUnique.mockResolvedValue({
      ...activeSeller(),
      status: SellerStatus.PENDING,
    });
    const service = new SellersService(prisma);

    await expect(service.getPublicBySlug('loja-teste')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
