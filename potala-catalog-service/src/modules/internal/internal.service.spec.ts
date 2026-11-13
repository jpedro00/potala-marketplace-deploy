import { InternalService } from './internal.service';
import { InventoryService } from '../inventory/inventory.service';
import { InsufficientStockException } from '../inventory/inventory.exceptions';
import { createPrismaMock } from '../../test-utils/prisma.mock';

describe('InternalService', () => {
  describe('resolveVariants', () => {
    it('maps found variants, falling back to the product price when the variant has none', async () => {
      const prisma = createPrismaMock();
      prisma.productVariant.findMany.mockResolvedValue([
        {
          id: '00000000-0000-4000-8000-000000000001',
          sku: 'SKU-1',
          name: 'Padrão',
          priceCents: null,
          product: {
            id: 'p1',
            categoryId: 'category-1',
            sellerId: 's1',
            status: 'ACTIVE',
            title: 'Produto 1',
            priceCents: 1000,
          },
          inventory: { quantity: 10, reservedQuantity: 3 },
        },
        {
          id: '00000000-0000-4000-8000-000000000002',
          sku: 'SKU-2',
          name: 'Grande',
          priceCents: 2500,
          product: {
            id: 'p1',
            categoryId: 'category-1',
            sellerId: 's1',
            status: 'ACTIVE',
            title: 'Produto 1',
            priceCents: 1000,
          },
          inventory: null,
        },
      ]);
      const service = new InternalService(
        prisma,
        new InventoryService(prisma),
      );

      const result = await service.resolveVariants(['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']);

      expect(result).toEqual([
        {
          variantId: '00000000-0000-4000-8000-000000000001',
          productId: 'p1',
          categoryId: 'category-1',
          itemType: 'PHYSICAL',
          sellerId: 's1',
          productStatus: 'ACTIVE',
          productTitle: 'Produto 1',
          sku: 'SKU-1',
          variantName: 'Padrão',
          unitPriceCents: 1000,
          availableQuantity: 7,
        },
        {
          variantId: '00000000-0000-4000-8000-000000000002',
          productId: 'p1',
          categoryId: 'category-1',
          itemType: 'PHYSICAL',
          sellerId: 's1',
          productStatus: 'ACTIVE',
          productTitle: 'Produto 1',
          sku: 'SKU-2',
          variantName: 'Grande',
          unitPriceCents: 2500,
          availableQuantity: 0,
        },
      ]);
    });

    it('simply omits ids with no matching variant', async () => {
      const prisma = createPrismaMock();
      prisma.productVariant.findMany.mockResolvedValue([]);
      const service = new InternalService(prisma, new InventoryService(prisma));

      const result = await service.resolveVariants(['missing']);

      expect(result).toEqual([]);
    });
  });

  describe('reserveBatch', () => {
    it('reserves every item inside a single transaction', async () => {
      const prisma = createPrismaMock();
      prisma.$queryRaw.mockResolvedValue([
        { variante_id: '00000000-0000-4000-8000-000000000001', quantidade: 10, quantidade_reservada: 4 },
      ]);
      const service = new InternalService(prisma, new InventoryService(prisma));

      const result = await service.reserveBatch([
        { variantId: '00000000-0000-4000-8000-000000000001', quantity: 1 },
        { variantId: '00000000-0000-4000-8000-000000000002', quantity: 2 },
      ]);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it('rolls back and propagates InsufficientStockException when any item fails', async () => {
      const prisma = createPrismaMock();
      // reserve() calls $queryRaw synchronously (before its own await
      // suspends), so Promise.all's per-item map calls land on $queryRaw in
      // array order: first call -> v1 (succeeds), second call -> v2 (fails).
      prisma.$queryRaw
        .mockResolvedValueOnce([
          { variante_id: '00000000-0000-4000-8000-000000000001', quantidade: 10, quantidade_reservada: 4 },
        ])
        .mockResolvedValueOnce([]);
      prisma.productVariant.findUnique.mockResolvedValue({
        inventory: { id: 'inv-1' },
      });
      const service = new InternalService(prisma, new InventoryService(prisma));

      await expect(
        service.reserveBatch([
          { variantId: '00000000-0000-4000-8000-000000000001', quantity: 1 },
          { variantId: '00000000-0000-4000-8000-000000000002', quantity: 999 },
        ]),
      ).rejects.toThrow(InsufficientStockException);
    });
  });
});
