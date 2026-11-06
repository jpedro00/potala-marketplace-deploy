import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CategoryStatus, Prisma, ProductStatus } from '@prisma/client';
import { ProductsService } from './products.service';
import { buildSearchVariants } from './search-variants';
import { InventoryService } from '../inventory/inventory.service';
import { createPrismaMock, PrismaMock } from '../../test-utils/prisma.mock';
import { PAGINATION_ORDER_CREATED_AT_ID_DESC } from '../../common/pagination/pagination';
import { CreateProductDto } from './dto/create-product.dto';
import {
  DEFAULT_PRODUCT_VARIANT_NAME,
  MAX_PRICE_CENTS,
  MAX_PRODUCT_DESCRIPTION_LENGTH,
  MAX_PRODUCT_SLUG_RETRIES,
  MAX_PRODUCT_TITLE_LENGTH,
  MAX_PRODUCT_VARIANTS,
  MAX_STOCK_QUANTITY,
  MAX_VARIANT_NAME_LENGTH,
  MAX_VARIANT_SKU_LENGTH,
} from './products.constants';

const SELLER_A = 'seller-a';
const SELLER_B = 'seller-b';
const PRODUCT_1 = '00000000-0000-4000-8000-000000000001';
const PRODUCT_20 = '00000000-0000-4000-8000-000000000020';
const PRODUCT_21 = '00000000-0000-4000-8000-000000000021';

function productRow(id: string, sellerId = SELLER_A) {
  return {
    id,
    sellerId,
    variants: [{ id: `v-${id}`, inventory: { quantity: 1 } }],
  };
}

describe('ProductsService SKU', () => {
  it('uses a default variant name for products without size/color', () => {
    const service = new ProductsService(createPrismaMock(), new InventoryService(createPrismaMock()));
    expect(service.defaultVariantName).toBe(DEFAULT_PRODUCT_VARIANT_NAME);
  });

  it('allows the same SKU for different sellers', async () => {
    const prisma = createPrismaMock();
    prisma.productVariant.findUnique.mockResolvedValue(null);
    const service = new ProductsService(prisma, new InventoryService(prisma));
    await expect(
      service.assertSkuAvailable('seller-a', 'ABC'),
    ).resolves.toBeUndefined();
    await expect(
      service.assertSkuAvailable('seller-b', 'ABC'),
    ).resolves.toBeUndefined();
    expect(prisma.productVariant.findUnique).toHaveBeenCalledWith({
      where: { sellerId_sku: { sellerId: 'seller-a', sku: 'ABC' } },
    });
    expect(prisma.productVariant.findUnique).toHaveBeenCalledWith({
      where: { sellerId_sku: { sellerId: 'seller-b', sku: 'ABC' } },
    });
  });

  it('rejects a duplicated SKU for the same seller', async () => {
    const prisma = createPrismaMock();
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 'variant-1',
      sellerId: 'seller-a',
      sku: 'ABC',
    });
    const service = new ProductsService(prisma, new InventoryService(prisma));
    await expect(
      service.assertSkuAvailable('seller-a', 'ABC'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ProductsService list pagination', () => {
  it('uses default take 21 and scopes to the authenticated seller', async () => {
    const prisma = createPrismaMock();
    prisma.product.findMany.mockResolvedValue([productRow(PRODUCT_1)]);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    const page = await service.listForSeller(SELLER_A, {});

    expect(prisma.product.findMany).toHaveBeenCalledWith({
      take: 21,
      where: { sellerId: SELLER_A },
      include: { variants: { include: { inventory: true } } },
      orderBy: PAGINATION_ORDER_CREATED_AT_ID_DESC,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.variants[0]?.inventory).toEqual({ quantity: 1 });
    expect(page.pageInfo).toEqual({ hasNextPage: false, nextCursor: null });
  });

  it('returns the first page with hasNextPage and nextCursor', async () => {
    const prisma = createPrismaMock();
    const rows = Array.from({ length: 21 }, (_, index) =>
      productRow(
        `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      ),
    );
    prisma.product.findMany.mockResolvedValue(rows);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    const page = await service.listForSeller(SELLER_A, {});

    expect(page.items).toHaveLength(20);
    expect(page.pageInfo.hasNextPage).toBe(true);
    expect(page.pageInfo.nextCursor).toBe(PRODUCT_20);
    expect(page.items.some((item) => item.id === PRODUCT_21)).toBe(false);
  });

  it('requests the next page from the previous cursor in SQL', async () => {
    const prisma = createPrismaMock();
    prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_20 });
    prisma.product.findMany.mockResolvedValue([productRow(PRODUCT_21)]);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    const page = await service.listForSeller(SELLER_A, {
      cursor: PRODUCT_20,
      limit: 20,
    });

    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: PRODUCT_20, sellerId: SELLER_A },
      select: { id: true },
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      take: 21,
      skip: 1,
      cursor: { id: PRODUCT_20 },
      where: { sellerId: SELLER_A },
      include: { variants: { include: { inventory: true } } },
      orderBy: PAGINATION_ORDER_CREATED_AT_ID_DESC,
    });
    expect(page.pageInfo.nextCursor).toBeNull();
    expect(page.pageInfo.hasNextPage).toBe(false);
  });

  it('rejects a cursor that does not belong to the seller', async () => {
    const prisma = createPrismaMock();
    prisma.product.findFirst.mockResolvedValue(null);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.listForSeller(SELLER_A, { cursor: PRODUCT_1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('scopes the cursor lookup by seller instead of reading it globally', async () => {
    const prisma = createPrismaMock();
    prisma.product.findFirst.mockResolvedValue(null);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await service
      .listForSeller(SELLER_A, { cursor: PRODUCT_1 })
      .catch(() => undefined);

    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: PRODUCT_1, sellerId: SELLER_A },
      select: { id: true },
    });
    expect(prisma.product.findUnique).not.toHaveBeenCalled();
  });

  it('returns the same error for a missing cursor and a foreign cursor', async () => {
    const prisma = createPrismaMock();
    prisma.product.findFirst.mockResolvedValue(null);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    const missing = await service
      .listForSeller(SELLER_A, { cursor: PRODUCT_20 })
      .catch((error: unknown) => error);
    const foreign = await service
      .listForSeller(SELLER_A, { cursor: PRODUCT_21 })
      .catch((error: unknown) => error);

    expect(missing).toBeInstanceOf(BadRequestException);
    expect(foreign).toBeInstanceOf(BadRequestException);
    expect((foreign as BadRequestException).getStatus()).toBe(
      (missing as BadRequestException).getStatus(),
    );
    expect((foreign as BadRequestException).message).toBe(
      (missing as BadRequestException).message,
    );
  });

  it('never uses a sellerId supplied by the client for the cursor lookup', async () => {
    const prisma = createPrismaMock();
    prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_20 });
    prisma.product.findMany.mockResolvedValue([]);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await service.listForSeller(SELLER_A, {
      cursor: PRODUCT_20,
      sellerId: SELLER_B,
    } as never);

    expect(prisma.product.findFirst.mock.calls[0]?.[0].where.sellerId).toBe(
      SELLER_A,
    );
    expect(prisma.product.findFirst.mock.calls[0]?.[0].where.sellerId).not.toBe(
      SELLER_B,
    );
  });

  it('never reads sellerId from the query string', async () => {
    const prisma = createPrismaMock();
    prisma.product.findMany.mockResolvedValue([]);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await service.listForSeller(SELLER_A, {
      limit: 20,
      sellerId: SELLER_B,
    } as never);

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sellerId: SELLER_A } }),
    );
    expect(prisma.product.findMany.mock.calls[0]?.[0].where.sellerId).not.toBe(
      SELLER_B,
    );
  });

  it('caps Prisma take at 101 when limit is 100', async () => {
    const prisma = createPrismaMock();
    prisma.product.findMany.mockResolvedValue([]);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await service.listForSeller(SELLER_A, { limit: 100 });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101, where: { sellerId: SELLER_A } }),
    );
  });
});

describe('ProductsService getForSeller tenant isolation', () => {
  it('returns the product when it belongs to the authenticated seller', async () => {
    const prisma = createPrismaMock();
    prisma.product.findFirst.mockResolvedValue(productRow(PRODUCT_1));
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(service.getForSeller(SELLER_A, PRODUCT_1)).resolves.toEqual(
      productRow(PRODUCT_1),
    );
  });

  it('scopes the Prisma query by seller instead of filtering afterwards', async () => {
    const prisma = createPrismaMock();
    prisma.product.findFirst.mockResolvedValue(productRow(PRODUCT_1));
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await service.getForSeller(SELLER_A, PRODUCT_1);

    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: PRODUCT_1, sellerId: SELLER_A },
      include: {
        images: { orderBy: { position: 'asc' } },
        variants: { include: { inventory: true } },
      },
    });
    expect(prisma.product.findUnique).not.toHaveBeenCalled();
  });

  it('returns the same NotFound for a missing id and for another seller product', async () => {
    const prisma = createPrismaMock();
    prisma.product.findFirst.mockResolvedValue(null);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    const missing = await service
      .getForSeller(SELLER_A, PRODUCT_20)
      .catch((error: unknown) => error);
    const foreign = await service
      .getForSeller(SELLER_A, PRODUCT_21)
      .catch((error: unknown) => error);

    expect(missing).toBeInstanceOf(NotFoundException);
    expect(foreign).toBeInstanceOf(NotFoundException);
    expect((foreign as NotFoundException).getStatus()).toBe(404);
    expect((foreign as NotFoundException).message).toBe(
      (missing as NotFoundException).message,
    );
  });

  it('never reveals the owning seller in the error message', async () => {
    const prisma = createPrismaMock();
    prisma.product.findFirst.mockResolvedValue(null);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    const error = await service
      .getForSeller(SELLER_A, PRODUCT_21)
      .catch((caught: unknown) => caught);

    expect((error as NotFoundException).message).not.toMatch(/seller/i);
    expect((error as NotFoundException).message).not.toContain(SELLER_B);
  });
});

describe('ProductsService updateVariantStockForSeller', () => {
  const VARIANT_ID = '00000000-0000-4000-8000-0000000000v1';

  it('scopes the ownership check by sellerId AND productId on the variant itself', async () => {
    const prisma = createPrismaMock();
    prisma.productVariant.findFirst.mockResolvedValue({ id: VARIANT_ID });
    prisma.$queryRaw.mockResolvedValue([
      { variante_id: VARIANT_ID, quantidade: 10, quantidade_reservada: 2 },
    ]);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    const snapshot = await service.updateVariantStockForSeller(
      SELLER_A,
      PRODUCT_1,
      VARIANT_ID,
      10,
    );

    expect(prisma.productVariant.findFirst).toHaveBeenCalledWith({
      where: { id: VARIANT_ID, productId: PRODUCT_1, sellerId: SELLER_A },
      select: { id: true },
    });
    expect(snapshot).toEqual({
      variantId: VARIANT_ID,
      quantity: 10,
      reservedQuantity: 2,
      availableQuantity: 8,
    });
  });

  it('404s (not 403) for a variant belonging to another seller, without touching InventoryService', async () => {
    const prisma = createPrismaMock();
    prisma.productVariant.findFirst.mockResolvedValue(null);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.updateVariantStockForSeller(SELLER_A, PRODUCT_1, VARIANT_ID, 10),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('404s for a variant that exists but belongs to a different product than the one in the URL', async () => {
    const prisma = createPrismaMock();
    prisma.productVariant.findFirst.mockResolvedValue(null);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.updateVariantStockForSeller(SELLER_A, PRODUCT_20, VARIANT_ID, 10),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('propagates CannotSetQuantityBelowReservedException when the target is below what is reserved', async () => {
    const prisma = createPrismaMock();
    prisma.productVariant.findFirst.mockResolvedValue({ id: VARIANT_ID });
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.productVariant.findUnique.mockResolvedValue({
      inventory: { id: 'inv-1' },
    });
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.updateVariantStockForSeller(SELLER_A, PRODUCT_1, VARIANT_ID, 1),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

const CATEGORY_ID = '00000000-0000-4000-8000-0000000000ca';

function createDto(
  overrides: Partial<CreateProductDto> = {},
): CreateProductDto {
  return {
    title: 'Camiseta Potala',
    categoryId: CATEGORY_ID,
    priceCents: 4990,
    variants: [{ name: 'Padrão', sku: 'CAM-PADRAO', quantity: 10 }],
    ...overrides,
  };
}

function stubCatalogCreate(prisma: PrismaMock) {
  prisma.category.findUnique.mockResolvedValue({
    id: CATEGORY_ID,
    name: 'Roupas',
    slug: 'roupas',
    status: CategoryStatus.ACTIVE,
  });
  prisma.productVariant.findUnique.mockResolvedValue(null);
  prisma.product.findUnique.mockResolvedValue(null);
  prisma.product.create.mockResolvedValue({
    id: 'product-1',
    title: 'Camiseta Potala',
    slug: 'camiseta-potala',
    description: '',
    priceCents: 4990,
    status: ProductStatus.DRAFT,
    sellerId: SELLER_A,
  });
  prisma.productVariant.create.mockImplementation(
    async (args: {
      data: { sku: string; name: string; priceCents: number | null };
    }) => ({
      id: `variant-${args.data.sku}`,
      name: args.data.name,
      sku: args.data.sku,
      priceCents: args.data.priceCents,
    }),
  );
  prisma.inventory.create.mockImplementation(
    async (args: { data: { quantity: number; reservedQuantity: number } }) => ({
      quantity: args.data.quantity,
      reservedQuantity: args.data.reservedQuantity,
    }),
  );
}

describe('ProductsService createForSeller', () => {
  it('creates a product with one default variant and inventory reservedQuantity 0', async () => {
    const prisma = createPrismaMock();
    stubCatalogCreate(prisma);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    const created = await service.createForSeller(SELLER_A, createDto());

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sellerId: SELLER_A,
        categoryId: CATEGORY_ID,
        title: 'Camiseta Potala',
        slug: 'camiseta-potala',
        priceCents: 4990,
        status: ProductStatus.DRAFT,
      }),
    });
    expect(prisma.productVariant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: 'product-1',
        sellerId: SELLER_A,
        sku: 'CAM-PADRAO',
        name: 'Padrão',
      }),
    });
    expect(prisma.inventory.create).toHaveBeenCalledWith({
      data: {
        variantId: 'variant-CAM-PADRAO',
        quantity: 10,
        reservedQuantity: 0,
      },
    });
    expect(created.variants).toHaveLength(1);
    expect(created.variants[0]?.inventory).toEqual({
      quantity: 10,
      reservedQuantity: 0,
    });
  });

  it('creates inventory for every variant', async () => {
    const prisma = createPrismaMock();
    stubCatalogCreate(prisma);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    const created = await service.createForSeller(
      SELLER_A,
      createDto({
        variants: [
          { name: 'P', sku: 'CAM-P', quantity: 3 },
          { name: 'M', sku: 'CAM-M', quantity: 5, priceCents: 5200 },
        ],
      }),
    );

    expect(prisma.productVariant.create).toHaveBeenCalledTimes(2);
    expect(prisma.inventory.create).toHaveBeenCalledTimes(2);
    expect(created.variants.map((variant) => variant.sku)).toEqual([
      'CAM-P',
      'CAM-M',
    ]);
    expect(
      created.variants.every(
        (variant) => variant.inventory.reservedQuantity === 0,
      ),
    ).toBe(true);
  });

  it('never uses sellerId from the body', async () => {
    const prisma = createPrismaMock();
    stubCatalogCreate(prisma);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await service.createForSeller(SELLER_A, {
      ...createDto(),
      sellerId: SELLER_B,
    } as CreateProductDto & { sellerId: string });

    expect(prisma.product.create.mock.calls[0]?.[0].data.sellerId).toBe(
      SELLER_A,
    );
    expect(prisma.productVariant.create.mock.calls[0]?.[0].data.sellerId).toBe(
      SELLER_A,
    );
    expect(prisma.product.create.mock.calls[0]?.[0].data.sellerId).not.toBe(
      SELLER_B,
    );
  });

  it('rejects a missing category', async () => {
    const prisma = createPrismaMock();
    prisma.category.findUnique.mockResolvedValue(null);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.createForSeller(SELLER_A, createDto()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('rejects an inactive category', async () => {
    const prisma = createPrismaMock();
    prisma.category.findUnique.mockResolvedValue({
      id: CATEGORY_ID,
      name: 'Arquivo',
      slug: 'arquivo',
      status: CategoryStatus.INACTIVE,
    });
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.createForSeller(SELLER_A, createDto()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('rejects a negative product price', async () => {
    const prisma = createPrismaMock();
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.createForSeller(SELLER_A, createDto({ priceCents: -1 })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a negative variant quantity', async () => {
    const prisma = createPrismaMock();
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.createForSeller(
        SELLER_A,
        createDto({
          variants: [{ name: 'Padrão', sku: 'X', quantity: -4 }],
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an empty variants list', async () => {
    const prisma = createPrismaMock();
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.createForSeller(SELLER_A, createDto({ variants: [] })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a duplicated SKU for the same seller', async () => {
    const prisma = createPrismaMock();
    prisma.category.findUnique.mockResolvedValue({
      id: CATEGORY_ID,
      name: 'Roupas',
      slug: 'roupas',
      status: CategoryStatus.ACTIVE,
    });
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 'existing',
      sku: 'CAM-PADRAO',
    });
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.createForSeller(SELLER_A, createDto()),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('maps a unique SKU race to a friendly conflict and does not return a product', async () => {
    const prisma = createPrismaMock();
    stubCatalogCreate(prisma);
    prisma.productVariant.create
      .mockResolvedValueOnce({
        id: 'variant-1',
        name: 'P',
        sku: 'CAM-P',
        priceCents: null,
      })
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['sellerId', 'sku'] },
        }),
      );
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.createForSeller(
        SELLER_A,
        createDto({
          variants: [
            { name: 'P', sku: 'CAM-P', quantity: 1 },
            { name: 'M', sku: 'CAM-M', quantity: 1 },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.inventory.create).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicated SKUs in the same payload', async () => {
    const prisma = createPrismaMock();
    prisma.category.findUnique.mockResolvedValue({
      id: CATEGORY_ID,
      name: 'Roupas',
      slug: 'roupas',
      status: CategoryStatus.ACTIVE,
    });
    prisma.productVariant.findUnique.mockResolvedValue(null);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.createForSeller(
        SELLER_A,
        createDto({
          variants: [
            { name: 'P', sku: 'CAM-P', quantity: 1 },
            { name: 'M', sku: 'CAM-P', quantity: 1 },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('rejects duplicated SKUs that only differ by surrounding whitespace', async () => {
    const prisma = createPrismaMock();
    stubCatalogCreate(prisma);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.createForSeller(
        SELLER_A,
        createDto({
          variants: [
            { name: 'P', sku: '  CAM-P  ', quantity: 1 },
            { name: 'M', sku: 'CAM-P', quantity: 1 },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('keeps SKU comparison case-sensitive', async () => {
    const prisma = createPrismaMock();
    stubCatalogCreate(prisma);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    const created = await service.createForSeller(
      SELLER_A,
      createDto({
        variants: [
          { name: 'P', sku: 'CAM-P', quantity: 1 },
          { name: 'M', sku: 'cam-p', quantity: 1 },
        ],
      }),
    );

    expect(created.variants.map((variant) => variant.sku)).toEqual([
      'CAM-P',
      'cam-p',
    ]);
  });
});

describe('ProductsService createForSeller whitespace', () => {
  it('rejects a whitespace-only title', async () => {
    const prisma = createPrismaMock();
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.createForSeller(SELLER_A, createDto({ title: '   ' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only variant name', async () => {
    const prisma = createPrismaMock();
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.createForSeller(
        SELLER_A,
        createDto({ variants: [{ name: '   ', sku: 'CAM-P', quantity: 1 }] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only variant sku', async () => {
    const prisma = createPrismaMock();
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.createForSeller(
        SELLER_A,
        createDto({ variants: [{ name: 'Padrão', sku: '   ', quantity: 1 }] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('stores trimmed values', async () => {
    const prisma = createPrismaMock();
    stubCatalogCreate(prisma);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await service.createForSeller(
      SELLER_A,
      createDto({
        title: '  Camiseta Potala  ',
        description: '  Algodão  ',
        variants: [{ name: '  Padrão  ', sku: '  CAM-P  ', quantity: 1 }],
      }),
    );

    expect(prisma.product.create.mock.calls[0]?.[0].data).toMatchObject({
      title: 'Camiseta Potala',
      description: 'Algodão',
    });
    expect(prisma.productVariant.create.mock.calls[0]?.[0].data).toMatchObject({
      name: 'Padrão',
      sku: 'CAM-P',
    });
  });
});

describe('ProductsService createForSeller limits', () => {
  it('accepts values exactly at the maximum limits', async () => {
    const prisma = createPrismaMock();
    stubCatalogCreate(prisma);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.createForSeller(
        SELLER_A,
        createDto({
          title: 'a'.repeat(MAX_PRODUCT_TITLE_LENGTH),
          description: 'd'.repeat(MAX_PRODUCT_DESCRIPTION_LENGTH),
          priceCents: MAX_PRICE_CENTS,
          variants: [
            {
              name: 'n'.repeat(MAX_VARIANT_NAME_LENGTH),
              sku: 's'.repeat(MAX_VARIANT_SKU_LENGTH),
              quantity: MAX_STOCK_QUANTITY,
              priceCents: MAX_PRICE_CENTS,
            },
          ],
        }),
      ),
    ).resolves.toBeDefined();
  });

  it.each([
    ['title', { title: 'a'.repeat(MAX_PRODUCT_TITLE_LENGTH + 1) }],
    [
      'description',
      { description: 'd'.repeat(MAX_PRODUCT_DESCRIPTION_LENGTH + 1) },
    ],
    ['priceCents', { priceCents: MAX_PRICE_CENTS + 1 }],
    [
      'variant name',
      {
        variants: [
          {
            name: 'n'.repeat(MAX_VARIANT_NAME_LENGTH + 1),
            sku: 'CAM-P',
            quantity: 1,
          },
        ],
      },
    ],
    [
      'sku',
      {
        variants: [
          {
            name: 'Padrão',
            sku: 's'.repeat(MAX_VARIANT_SKU_LENGTH + 1),
            quantity: 1,
          },
        ],
      },
    ],
    [
      'quantity',
      {
        variants: [
          { name: 'Padrão', sku: 'CAM-P', quantity: MAX_STOCK_QUANTITY + 1 },
        ],
      },
    ],
    [
      'variant priceCents',
      {
        variants: [
          {
            name: 'Padrão',
            sku: 'CAM-P',
            quantity: 1,
            priceCents: MAX_PRICE_CENTS + 1,
          },
        ],
      },
    ],
  ])('rejects %s above the limit', async (_field, overrides) => {
    const prisma = createPrismaMock();
    stubCatalogCreate(prisma);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.createForSeller(
        SELLER_A,
        createDto(overrides as Partial<CreateProductDto>),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('rejects more variants than the maximum', async () => {
    const prisma = createPrismaMock();
    stubCatalogCreate(prisma);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.createForSeller(
        SELLER_A,
        createDto({
          variants: Array.from(
            { length: MAX_PRODUCT_VARIANTS + 1 },
            (_unused, index) => ({
              name: `Variante ${index}`,
              sku: `SKU-${index}`,
              quantity: 1,
            }),
          ),
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });
});

function uniqueViolation(target: string[] | string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { target },
  });
}

describe('ProductsService createForSeller P2002 discrimination', () => {
  it.each([
    ['field array', ['sellerId', 'sku']],
    ['constraint name', 'variantes_produto_vendedor_id_sku_key'],
  ])('reports a SKU conflict for a %s target', async (_shape, target) => {
    const prisma = createPrismaMock();
    stubCatalogCreate(prisma);
    prisma.productVariant.create.mockRejectedValue(uniqueViolation(target));
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.createForSeller(SELLER_A, createDto()),
    ).rejects.toMatchObject({
      status: 409,
      message: 'SKU already exists for this store',
    });
  });

  it.each([
    ['field array', ['sellerId', 'slug']],
    ['constraint name', 'produtos_vendedor_id_slug_key'],
  ])('never mentions SKU for a slug %s target', async (_shape, target) => {
    const prisma = createPrismaMock();
    stubCatalogCreate(prisma);
    prisma.product.create.mockRejectedValue(uniqueViolation(target));
    const service = new ProductsService(prisma, new InventoryService(prisma));

    const error = await service
      .createForSeller(SELLER_A, createDto())
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).not.toMatch(/sku/i);
    expect((error as ConflictException).message).toMatch(/slug/i);
  });

  it('falls back to a generic conflict for an unrelated unique', async () => {
    const prisma = createPrismaMock();
    stubCatalogCreate(prisma);
    prisma.product.create.mockRejectedValue(uniqueViolation(['someOtherKey']));
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.createForSeller(SELLER_A, createDto()),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Resource already exists',
    });
  });

  it('rethrows non-P2002 Prisma errors untouched', async () => {
    const prisma = createPrismaMock();
    stubCatalogCreate(prisma);
    const failure = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: '6.19.3',
    });
    prisma.product.create.mockRejectedValue(failure);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(service.createForSeller(SELLER_A, createDto())).rejects.toBe(
      failure,
    );
  });
});

describe('ProductsService createForSeller slug retry', () => {
  it('retries with the next suffix when the slug is taken between probe and insert', async () => {
    const prisma = createPrismaMock();
    stubCatalogCreate(prisma);
    prisma.product.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'taken' })
      .mockResolvedValueOnce(null);
    prisma.product.create.mockRejectedValueOnce(
      uniqueViolation(['sellerId', 'slug']),
    );
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.createForSeller(SELLER_A, createDto()),
    ).resolves.toBeDefined();

    expect(prisma.product.create).toHaveBeenCalledTimes(2);
    expect(prisma.product.create.mock.calls[0]?.[0].data.slug).toBe(
      'camiseta-potala',
    );
    expect(prisma.product.create.mock.calls[1]?.[0].data.slug).toBe(
      'camiseta-potala-1',
    );
  });

  it('gives up after a bounded number of retries instead of looping forever', async () => {
    const prisma = createPrismaMock();
    stubCatalogCreate(prisma);
    prisma.product.create.mockRejectedValue(
      uniqueViolation(['sellerId', 'slug']),
    );
    const service = new ProductsService(prisma, new InventoryService(prisma));

    const error = await service
      .createForSeller(SELLER_A, createDto())
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).not.toMatch(/sku/i);
    expect(prisma.product.create).toHaveBeenCalledTimes(
      MAX_PRODUCT_SLUG_RETRIES + 1,
    );
  });
});


describe('ProductsService createForSeller image URLs', () => {
  it('stores image URLs as ProductImage rows, in order, and re-reads them into the response', async () => {
    const prisma = createPrismaMock();
    stubCatalogCreate(prisma);
    prisma.productImage.findMany.mockResolvedValue([
      { id: 'img-1', url: 'https://cdn.example.com/a.jpg', alt: null, position: 0 },
      { id: 'img-2', url: 'https://cdn.example.com/b.jpg', alt: null, position: 1 },
    ]);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    const created = await service.createForSeller(
      SELLER_A,
      createDto({
        imageUrls: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
      }),
    );

    expect(prisma.productImage.createMany).toHaveBeenCalledWith({
      data: [
        { productId: 'product-1', url: 'https://cdn.example.com/a.jpg', position: 0 },
        { productId: 'product-1', url: 'https://cdn.example.com/b.jpg', position: 1 },
      ],
    });
    expect(created.images).toHaveLength(2);
  });

  it('skips ProductImage writes entirely when no imageUrls are given', async () => {
    const prisma = createPrismaMock();
    stubCatalogCreate(prisma);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    const created = await service.createForSeller(SELLER_A, createDto());

    expect(prisma.productImage.createMany).not.toHaveBeenCalled();
    expect(created.images).toEqual([]);
  });
});

describe('ProductsService updateStatusForSeller', () => {
  it("publishes a seller's own product", async () => {
    const prisma = createPrismaMock();
    prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_1 });
    prisma.product.update.mockResolvedValue({
      id: PRODUCT_1,
      status: ProductStatus.ACTIVE,
    });
    const service = new ProductsService(prisma, new InventoryService(prisma));

    const updated = await service.updateStatusForSeller(
      SELLER_A,
      PRODUCT_1,
      ProductStatus.ACTIVE,
    );

    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: PRODUCT_1, sellerId: SELLER_A },
      select: { id: true },
    });
    expect(updated.status).toBe(ProductStatus.ACTIVE);
  });

  it("404s on a product that does not belong to the caller's store (never 403)", async () => {
    const prisma = createPrismaMock();
    prisma.product.findFirst.mockResolvedValue(null);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.updateStatusForSeller(SELLER_B, PRODUCT_1, ProductStatus.ACTIVE),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });
});

describe('ProductsService listPublished / getPublishedById (public storefront)', () => {
  it('only ever queries for ACTIVE products, and applies the categoryId filter (exact match, fora do OR de busca textual)', async () => {
    const prisma = createPrismaMock();
    prisma.product.findMany.mockResolvedValue([]);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await service.listPublished({ categoryId: CATEGORY_ID, q: 'cristal' });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: ProductStatus.ACTIVE,
          categoryId: CATEGORY_ID,
          OR: [
            { title: { contains: 'cristal', mode: 'insensitive' } },
            {
              category: { name: { contains: 'cristal', mode: 'insensitive' } },
            },
            { title: { contains: 'cristais', mode: 'insensitive' } },
            {
              category: { name: { contains: 'cristais', mode: 'insensitive' } },
            },
          ],
        },
      }),
    );
  });

  // A) q="cristais" busca por title/category tanto "cristais" quanto "cristal".
  it('A) q="cristais" inclui title/category "cristais" e "cristal" no OR', async () => {
    const prisma = createPrismaMock();
    prisma.product.findMany.mockResolvedValue([]);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await service.listPublished({ q: 'cristais' });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: ProductStatus.ACTIVE,
          OR: [
            { title: { contains: 'cristais', mode: 'insensitive' } },
            {
              category: { name: { contains: 'cristais', mode: 'insensitive' } },
            },
            { title: { contains: 'cristal', mode: 'insensitive' } },
            {
              category: { name: { contains: 'cristal', mode: 'insensitive' } },
            },
          ],
        },
      }),
    );
  });

  // B) q="cristal" busca por title/category tanto "cristal" quanto "cristais"
  // -- este é o bug de produção original (05/10): "cristal" não encontrava
  // o produto/categoria "Cristais".
  it('B) q="cristal" inclui title/category "cristal" e "cristais" no OR', async () => {
    const prisma = createPrismaMock();
    prisma.product.findMany.mockResolvedValue([]);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await service.listPublished({ q: 'cristal' });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: ProductStatus.ACTIVE,
          OR: [
            { title: { contains: 'cristal', mode: 'insensitive' } },
            {
              category: { name: { contains: 'cristal', mode: 'insensitive' } },
            },
            { title: { contains: 'cristais', mode: 'insensitive' } },
            {
              category: { name: { contains: 'cristais', mode: 'insensitive' } },
            },
          ],
        },
      }),
    );
  });

  // C) a categoria participa da busca textual: um produto cujo title NÃO
  // contém o termo buscado, mas cuja categoria se chama "Cristais", deve
  // ser encontrável buscando "cristal" -- validado aqui no nível do `where`
  // enviado ao Prisma (o relacionamento category.name faz parte do OR).
  it('C) a categoria participa da busca textual (category.name entra no OR)', async () => {
    const prisma = createPrismaMock();
    prisma.product.findMany.mockResolvedValue([]);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await service.listPublished({ q: 'cristal' });

    const callArgs = prisma.product.findMany.mock.calls[0][0];
    const orClauses = callArgs.where.OR as Array<Record<string, unknown>>;
    expect(orClauses.some((clause) => 'category' in clause)).toBe(true);
  });

  // D) um termo sem par conhecido (ex. "livro") NÃO ganha nenhuma variante
  // artificial -- nem no helper isolado, nem no `where` efetivo. Garante
  // que a busca para o resto do catálogo continua idêntica à atual.
  it('D) termo não relacionado (ex. "livro") não ganha variante artificial', async () => {
    expect(buildSearchVariants('livro')).toEqual(['livro']);

    const prisma = createPrismaMock();
    prisma.product.findMany.mockResolvedValue([]);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await service.listPublished({ q: 'livro' });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: ProductStatus.ACTIVE,
          OR: [
            { title: { contains: 'livro', mode: 'insensitive' } },
            {
              category: { name: { contains: 'livro', mode: 'insensitive' } },
            },
          ],
        },
      }),
    );
  });

  // E) sem q, o comportamento de hoje é preservado: nenhum OR é adicionado
  // ao where.
  it('E) q ausente mantém o comportamento atual (sem OR de busca textual)', async () => {
    const prisma = createPrismaMock();
    prisma.product.findMany.mockResolvedValue([]);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await service.listPublished({});

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: ProductStatus.ACTIVE },
      }),
    );
  });

  // G) orderBy e os argumentos de paginação por cursor não são afetados
  // pela mudança no filtro de busca textual.
  it('G) orderBy e paginação por cursor permanecem intactos com q presente', async () => {
    const prisma = createPrismaMock();
    prisma.product.findMany.mockResolvedValue([]);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await service.listPublished({ q: 'cristal' });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: PAGINATION_ORDER_CREATED_AT_ID_DESC,
        take: expect.any(Number),
      }),
    );
  });

  // F) categoryId continua funcionando como filtro exato, inclusive sem q.
  it('F) categoryId continua funcionando como filtro exato (sem q)', async () => {
    const prisma = createPrismaMock();
    prisma.product.findMany.mockResolvedValue([]);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await service.listPublished({ categoryId: CATEGORY_ID });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: ProductStatus.ACTIVE,
          categoryId: CATEGORY_ID,
        },
      }),
    );
  });

  it('applies a sellerId filter when provided (vitrine pública do vendedor)', async () => {
    const prisma = createPrismaMock();
    prisma.product.findMany.mockResolvedValue([]);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await service.listPublished({ sellerId: SELLER_A });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: ProductStatus.ACTIVE,
          sellerId: SELLER_A,
        },
      }),
    );
  });

  it('rejects a cursor pointing at a non-ACTIVE (or foreign) product id', async () => {
    const prisma = createPrismaMock();
    prisma.product.findFirst.mockResolvedValue(null);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(
      service.listPublished({ cursor: PRODUCT_20 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns an ACTIVE product by id', async () => {
    const prisma = createPrismaMock();
    prisma.product.findFirst.mockResolvedValue({
      id: PRODUCT_1,
      status: ProductStatus.ACTIVE,
    });
    const service = new ProductsService(prisma, new InventoryService(prisma));

    const product = await service.getPublishedById(PRODUCT_1);

    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PRODUCT_1, status: ProductStatus.ACTIVE },
      }),
    );
    expect(product.id).toBe(PRODUCT_1);
  });

  it('404s a DRAFT product looked up through the public endpoint (never leaks unpublished products)', async () => {
    const prisma = createPrismaMock();
    prisma.product.findFirst.mockResolvedValue(null);
    const service = new ProductsService(prisma, new InventoryService(prisma));

    await expect(service.getPublishedById(PRODUCT_1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
