import { NotFoundException } from '@nestjs/common';
import { SellerStatus } from '@prisma/client';
import { AdminService } from './admin.service';
import { createPrismaMock } from '../../test-utils/prisma.mock';
import { PAGINATION_MAX_LIMIT } from '../../common/pagination/pagination.constants';

const ID_A = '00000000-0000-4000-8000-00000000000a';

function sellerRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ID_A,
    legalName: 'Loja Teste LTDA',
    tradeName: 'Loja Teste',
    slug: 'loja-teste',
    documentType: 'CNPJ',
    documentNumber: '12345678000199',
    email: 'loja@example.com',
    status: SellerStatus.PENDING,
    statusReason: null,
    reviewedAt: null,
    commissionBps: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('AdminService.listSellers', () => {
  it('returns the first page with the default limit', async () => {
    const prisma = createPrismaMock();
    prisma.seller.findMany.mockResolvedValue([sellerRow()]);
    const service = new AdminService(prisma);

    const page = await service.listSellers();

    expect(page.items).toHaveLength(1);
    expect(page.pageInfo).toEqual({ hasNextPage: false, nextCursor: null });
    expect(prisma.seller.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 21 }),
    );
  });

  it('paginates by cursor on the next page', async () => {
    const prisma = createPrismaMock();
    prisma.seller.findUnique.mockResolvedValue({ id: ID_A });
    prisma.seller.findMany.mockResolvedValue([sellerRow()]);
    const service = new AdminService(prisma);

    await service.listSellers({ cursor: ID_A });

    expect(prisma.seller.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 1, cursor: { id: ID_A } }),
    );
  });

  it('rejects an unknown cursor', async () => {
    const prisma = createPrismaMock();
    prisma.seller.findUnique.mockResolvedValue(null);
    const service = new AdminService(prisma);

    await expect(service.listSellers({ cursor: ID_A })).rejects.toThrow(
      /Invalid cursor/,
    );
  });

  it('rejects limit above 100', async () => {
    const prisma = createPrismaMock();
    const service = new AdminService(prisma);

    await expect(
      service.listSellers({ limit: PAGINATION_MAX_LIMIT + 1 }),
    ).rejects.toThrow();
  });
});

describe('AdminService.updateSellerStatus', () => {
  it('throws NotFoundException for an unknown seller', async () => {
    const prisma = createPrismaMock();
    prisma.seller.findUnique.mockResolvedValue(null);
    const service = new AdminService(prisma);

    await expect(
      service.updateSellerStatus('admin-1', ID_A, SellerStatus.ACTIVE),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('approves a PENDING seller and records SELLER_APPROVED', async () => {
    const prisma = createPrismaMock();
    prisma.seller.findUnique.mockResolvedValue(sellerRow());
    prisma.seller.update.mockResolvedValue(
      sellerRow({ status: SellerStatus.ACTIVE, reviewedAt: new Date() }),
    );
    const service = new AdminService(prisma);

    const result = await service.updateSellerStatus(
      'admin-1',
      ID_A,
      SellerStatus.ACTIVE,
    );

    expect(result.status).toBe(SellerStatus.ACTIVE);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: 'admin-1',
        action: 'SELLER_APPROVED',
        entityType: 'Seller',
        entityId: ID_A,
        metadata: { from: SellerStatus.PENDING, to: SellerStatus.ACTIVE, reason: null },
      }),
    });
  });

  it('rejects a seller with a reason and records SELLER_REJECTED', async () => {
    const prisma = createPrismaMock();
    prisma.seller.findUnique.mockResolvedValue(sellerRow());
    prisma.seller.update.mockResolvedValue(
      sellerRow({ status: SellerStatus.REJECTED, statusReason: 'Documento inválido' }),
    );
    const service = new AdminService(prisma);

    await service.updateSellerStatus(
      'admin-1',
      ID_A,
      SellerStatus.REJECTED,
      'Documento inválido',
    );

    expect(prisma.seller.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ statusReason: 'Documento inválido' }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'SELLER_REJECTED' }),
    });
  });

  it('suspends an ACTIVE seller and records SELLER_SUSPENDED', async () => {
    const prisma = createPrismaMock();
    prisma.seller.findUnique.mockResolvedValue(
      sellerRow({ status: SellerStatus.ACTIVE }),
    );
    prisma.seller.update.mockResolvedValue(
      sellerRow({ status: SellerStatus.SUSPENDED }),
    );
    const service = new AdminService(prisma);

    const result = await service.updateSellerStatus(
      'admin-1',
      ID_A,
      SellerStatus.SUSPENDED,
    );

    expect(result.status).toBe(SellerStatus.SUSPENDED);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'SELLER_SUSPENDED' }),
    });
  });

  it('trims a blank reason down to null', async () => {
    const prisma = createPrismaMock();
    prisma.seller.findUnique.mockResolvedValue(sellerRow());
    prisma.seller.update.mockResolvedValue(sellerRow());
    const service = new AdminService(prisma);

    await service.updateSellerStatus('admin-1', ID_A, SellerStatus.ACTIVE, '   ');

    expect(prisma.seller.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ statusReason: null }),
      }),
    );
  });
});
