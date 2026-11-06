import { NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import {
  CannotCommitReservedStockException,
  CannotReleaseReservationException,
  CannotSetQuantityBelowReservedException,
  InsufficientStockException,
  InvalidStockLevelException,
  InvalidStockQuantityException,
  InvalidVariantIdException,
} from './inventory.exceptions';
import { createPrismaMock } from '../../test-utils/prisma.mock';

const VARIANT_ID = '00000000-0000-4000-8000-0000000000aa';

type StockState = {
  quantity: number;
  reservedQuantity: number;
};

function sqlOf(strings: TemplateStringsArray): string {
  return strings.join('?');
}

function isReserveSql(sql: string): boolean {
  return (
    sql.includes('"quantidade_reservada" = "quantidade_reservada" +') &&
    !sql.includes('"quantidade" = "quantidade" -')
  );
}

function isCommitSql(sql: string): boolean {
  return (
    sql.includes('"quantidade" = "quantidade" -') &&
    sql.includes('"quantidade_reservada" = "quantidade_reservada" -')
  );
}

function isReleaseSql(sql: string): boolean {
  return (
    sql.includes('"quantidade_reservada" = "quantidade_reservada" -') &&
    !sql.includes('"quantidade" = "quantidade" -')
  );
}

/**
 * Serializes mock UPDATEs like a row lock. This is NOT PostgreSQL;
 * it only models the UPDATE ... WHERE contract the service relies on.
 */
function mockAtomicQueryRaw(state: StockState) {
  let queue = Promise.resolve();

  return jest.fn((strings: TemplateStringsArray, ...params: unknown[]) => {
    const run = queue.then(async () => {
      await Promise.resolve();
      const sql = sqlOf(strings);
      const quantity = params[0] as number;

      if (isReserveSql(sql)) {
        if (state.quantity - state.reservedQuantity >= quantity) {
          state.reservedQuantity += quantity;
          return [toRow(state)];
        }
        return [];
      }

      if (isCommitSql(sql)) {
        if (state.reservedQuantity >= quantity && state.quantity >= quantity) {
          state.quantity -= quantity;
          state.reservedQuantity -= quantity;
          return [toRow(state)];
        }
        return [];
      }

      if (isReleaseSql(sql)) {
        if (state.reservedQuantity >= quantity) {
          state.reservedQuantity -= quantity;
          return [toRow(state)];
        }
        return [];
      }

      throw new Error(`Unexpected inventory SQL: ${sql}`);
    });

    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  });
}

function toRow(state: StockState) {
  return {
    variante_id: VARIANT_ID,
    quantidade: state.quantity,
    quantidade_reservada: state.reservedQuantity,
  };
}

describe('InventoryService quantity validation', () => {
  const service = new InventoryService(createPrismaMock());

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects %s',
    async (quantity) => {
      await expect(
        service.reserve(VARIANT_ID, quantity),
      ).rejects.toBeInstanceOf(InvalidStockQuantityException);
    },
  );

  it('rejects a non-uuid variantId before touching the database', async () => {
    const prisma = createPrismaMock();
    const inventory = new InventoryService(prisma);
    await expect(inventory.reserve('not-a-uuid', 1)).rejects.toBeInstanceOf(
      InvalidVariantIdException,
    );
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('InventoryService reserve', () => {
  it('issues a single atomic UPDATE with availability in the WHERE clause', async () => {
    const prisma = createPrismaMock();
    prisma.$queryRaw.mockResolvedValue([
      { variante_id: VARIANT_ID, quantidade: 5, quantidade_reservada: 1 },
    ]);
    const service = new InventoryService(prisma);

    const snapshot = await service.reserve(VARIANT_ID, 1);

    expect(prisma.productVariant.findUnique).not.toHaveBeenCalled();
    const sql = sqlOf(prisma.$queryRaw.mock.calls[0][0]);
    expect(sql).toContain('UPDATE "catalog"."estoques"');
    expect(sql).toContain('"quantidade" - "quantidade_reservada"');
    expect(sql).toContain('"atualizado_em" = CURRENT_TIMESTAMP');
    expect(snapshot).toEqual({
      variantId: VARIANT_ID,
      quantity: 5,
      reservedQuantity: 1,
      availableQuantity: 4,
    });
  });

  it('maps a missing variant after 0 updated rows', async () => {
    const prisma = createPrismaMock();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.productVariant.findUnique.mockResolvedValue(null);
    const service = new InventoryService(prisma);

    await expect(service.reserve(VARIANT_ID, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('maps missing inventory after 0 updated rows', async () => {
    const prisma = createPrismaMock();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.productVariant.findUnique.mockResolvedValue({ inventory: null });
    const service = new InventoryService(prisma);

    await expect(service.reserve(VARIANT_ID, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('maps insufficient stock when the row exists but WHERE matches nothing', async () => {
    const prisma = createPrismaMock();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.productVariant.findUnique.mockResolvedValue({
      inventory: { id: 'inv-1' },
    });
    const service = new InventoryService(prisma);

    await expect(service.reserve(VARIANT_ID, 1)).rejects.toBeInstanceOf(
      InsufficientStockException,
    );
  });
});

describe('InventoryService release and commit', () => {
  it('releases reserved units atomically', async () => {
    const prisma = createPrismaMock();
    prisma.$queryRaw.mockResolvedValue([
      { variante_id: VARIANT_ID, quantidade: 5, quantidade_reservada: 0 },
    ]);
    const service = new InventoryService(prisma);

    const snapshot = await service.release(VARIANT_ID, 2);
    const sql = sqlOf(prisma.$queryRaw.mock.calls[0][0]);
    expect(sql).toContain('"quantidade_reservada" >=');
    expect(sql).toContain('"atualizado_em" = CURRENT_TIMESTAMP');
    expect(sql).not.toContain('"quantidade" = "quantidade" -');
    expect(snapshot.reservedQuantity).toBe(0);
  });

  it('commits reserved stock by decrementing quantity and reservedQuantity together', async () => {
    const prisma = createPrismaMock();
    prisma.$queryRaw.mockResolvedValue([
      { variante_id: VARIANT_ID, quantidade: 4, quantidade_reservada: 0 },
    ]);
    const service = new InventoryService(prisma);

    const snapshot = await service.commitReservedStock(VARIANT_ID, 1);
    const sql = sqlOf(prisma.$queryRaw.mock.calls[0][0]);
    expect(sql).toContain('"quantidade" = "quantidade" -');
    expect(sql).toContain('"quantidade_reservada" = "quantidade_reservada" -');
    expect(sql).toContain('"quantidade_reservada" >=');
    expect(sql).toContain('"quantidade" >=');
    expect(sql).toContain('"atualizado_em" = CURRENT_TIMESTAMP');
    expect(snapshot).toEqual({
      variantId: VARIANT_ID,
      quantity: 4,
      reservedQuantity: 0,
      availableQuantity: 4,
    });
  });

  it('fails release when reservedQuantity is too low', async () => {
    const prisma = createPrismaMock();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.productVariant.findUnique.mockResolvedValue({
      inventory: { id: 'inv-1' },
    });
    const service = new InventoryService(prisma);

    await expect(service.release(VARIANT_ID, 1)).rejects.toBeInstanceOf(
      CannotReleaseReservationException,
    );
  });

  it('fails commit when reserved stock cannot be consumed', async () => {
    const prisma = createPrismaMock();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.productVariant.findUnique.mockResolvedValue({
      inventory: { id: 'inv-1' },
    });
    const service = new InventoryService(prisma);

    await expect(
      service.commitReservedStock(VARIANT_ID, 1),
    ).rejects.toBeInstanceOf(CannotCommitReservedStockException);
  });
});

describe('InventoryService setQuantity', () => {
  it('rejects a non-uuid variantId before touching the database', async () => {
    const prisma = createPrismaMock();
    const service = new InventoryService(prisma);

    await expect(
      service.setQuantity('not-a-uuid', 5),
    ).rejects.toBeInstanceOf(InvalidVariantIdException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1_000_001])(
    'rejects %s as an invalid stock level',
    async (quantity) => {
      const prisma = createPrismaMock();
      const service = new InventoryService(prisma);

      await expect(
        service.setQuantity(VARIANT_ID, quantity),
      ).rejects.toBeInstanceOf(InvalidStockLevelException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    },
  );

  it('accepts 0 (out of stock), unlike reserve/release/commit', async () => {
    const prisma = createPrismaMock();
    prisma.$queryRaw.mockResolvedValue([
      { variante_id: VARIANT_ID, quantidade: 0, quantidade_reservada: 0 },
    ]);
    const service = new InventoryService(prisma);

    const snapshot = await service.setQuantity(VARIANT_ID, 0);

    expect(snapshot).toEqual({
      variantId: VARIANT_ID,
      quantity: 0,
      reservedQuantity: 0,
      availableQuantity: 0,
    });
  });

  it('issues a single atomic UPDATE keyed on the target value, not a delta', async () => {
    const prisma = createPrismaMock();
    prisma.$queryRaw.mockResolvedValue([
      { variante_id: VARIANT_ID, quantidade: 20, quantidade_reservada: 3 },
    ]);
    const service = new InventoryService(prisma);

    const snapshot = await service.setQuantity(VARIANT_ID, 20);
    const sql = sqlOf(prisma.$queryRaw.mock.calls[0][0]);

    expect(sql).toContain('UPDATE "catalog"."estoques"');
    expect(sql).toContain('"quantidade" =');
    expect(sql).not.toContain('"quantidade" = "quantidade" -');
    expect(sql).toContain('"quantidade_reservada" <=');
    expect(sql).toContain('"atualizado_em" = CURRENT_TIMESTAMP');
    expect(snapshot).toEqual({
      variantId: VARIANT_ID,
      quantity: 20,
      reservedQuantity: 3,
      availableQuantity: 17,
    });
  });

  it('rejects a target below the currently reserved quantity', async () => {
    const prisma = createPrismaMock();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.productVariant.findUnique.mockResolvedValue({
      inventory: { id: 'inv-1' },
    });
    const service = new InventoryService(prisma);

    await expect(
      service.setQuantity(VARIANT_ID, 1),
    ).rejects.toBeInstanceOf(CannotSetQuantityBelowReservedException);
  });

  it('maps a missing variant after 0 updated rows, same as reserve/release/commit', async () => {
    const prisma = createPrismaMock();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.productVariant.findUnique.mockResolvedValue(null);
    const service = new InventoryService(prisma);

    await expect(
      service.setQuantity(VARIANT_ID, 5),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('InventoryService last-unit race (modeled)', () => {
  it('lets only one of two concurrent reserve(1) succeed when quantity=1', async () => {
    const prisma = createPrismaMock();
    const state: StockState = { quantity: 1, reservedQuantity: 0 };
    prisma.$queryRaw.mockImplementation(mockAtomicQueryRaw(state));
    prisma.productVariant.findUnique.mockResolvedValue({
      inventory: { id: 'inv-1' },
    });
    const service = new InventoryService(prisma);

    const results = await Promise.allSettled([
      service.reserve(VARIANT_ID, 1),
      service.reserve(VARIANT_ID, 1),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      status: 'rejected',
      reason: expect.any(InsufficientStockException),
    });
    expect(state).toEqual({ quantity: 1, reservedQuantity: 1 });
    expect(
      (fulfilled[0] as PromiseFulfilledResult<{ reservedQuantity: number }>)
        .value.reservedQuantity,
    ).toBe(1);
  });
});
