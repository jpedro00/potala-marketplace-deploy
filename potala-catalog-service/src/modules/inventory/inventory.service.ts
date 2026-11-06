import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  assertInventoryExists as throwUnlessInventoryPresent,
  CannotCommitReservedStockException,
  CannotReleaseReservationException,
  CannotSetQuantityBelowReservedException,
  InsufficientStockException,
  InvalidStockLevelException,
  InvalidStockQuantityException,
  InvalidVariantIdException,
} from './inventory.exceptions';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Ceiling for setQuantity's target value — same bound as
 * products.constants.ts's MAX_STOCK_QUANTITY (kept as a local literal
 * instead of importing across modules, since InventoryModule has no other
 * dependency on ProductsModule and this is the only place it would need
 * one). Reserve/release/commitReservedStock don't need an upper bound of
 * their own: they only ever move units already sitting in this table.
 */
const MAX_QUANTITY = 1_000_000;

export type StockClient = Prisma.TransactionClient | PrismaService;

export type StockSnapshot = {
  variantId: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
};

type StockRow = {
  variante_id: string;
  quantidade: number | bigint;
  quantidade_reservada: number | bigint;
};

/**
 * Ported from the monolith's modules/inventory/inventory.service.ts, with one
 * required fix: the raw SQL below now targets "catalog"."estoques"
 * (schema-qualified) instead of bare "estoques". In the monolith the table
 * lived in the default `public` schema, so Postgres's search_path resolved
 * the bare name; here it lives in the `catalog` schema (Prisma multiSchema),
 * and $queryRaw does not get Prisma's automatic schema-qualification the way
 * typed Prisma Client calls do — this only affects the raw UPDATE statements
 * below, since requireExistingInventory's `client.productVariant.findUnique`
 * is a typed call and was never affected. Found via the "Catalog service is
 * unavailable" 500 orders-service hit at real checkout (POST
 * /internal/inventory/reserve -> 500, PrismaClientKnownRequestError 42P01
 * "relation \"estoques\" does not exist") — this class had never been
 * exercised end-to-end before that test.
 *
 * Now wired to /internal/inventory/* (see modules/internal) as orders-service's
 * reserve/release/commit calls at checkout — ProductsService.createInTransaction
 * still creates the initial Inventory row directly via `tx.inventory.create`,
 * bypassing this class, same as the monolith did.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically reserve units. PostgreSQL evaluates availability in the UPDATE
   * WHERE clause — never SELECT then UPDATE.
   */
  async reserve(
    variantId: string,
    quantity: number,
    client: StockClient = this.prisma,
  ): Promise<StockSnapshot> {
    this.assertArgs(variantId, quantity);

    const rows = await client.$queryRaw<StockRow[]>`
      UPDATE "catalog"."estoques"
      SET
        "quantidade_reservada" = "quantidade_reservada" + ${quantity},
        "atualizado_em" = CURRENT_TIMESTAMP
      WHERE "variante_id" = ${variantId}::uuid
        AND "quantidade" - "quantidade_reservada" >= ${quantity}
      RETURNING "variante_id", "quantidade", "quantidade_reservada"
    `;

    if (rows.length === 0) {
      await this.requireExistingInventory(variantId, client);
      throw new InsufficientStockException();
    }

    return this.toSnapshot(rows[0]);
  }

  /**
   * Atomically release a previous reservation. Never lets reservedQuantity go negative.
   */
  async release(
    variantId: string,
    quantity: number,
    client: StockClient = this.prisma,
  ): Promise<StockSnapshot> {
    this.assertArgs(variantId, quantity);

    const rows = await client.$queryRaw<StockRow[]>`
      UPDATE "catalog"."estoques"
      SET
        "quantidade_reservada" = "quantidade_reservada" - ${quantity},
        "atualizado_em" = CURRENT_TIMESTAMP
      WHERE "variante_id" = ${variantId}::uuid
        AND "quantidade_reservada" >= ${quantity}
      RETURNING "variante_id", "quantidade", "quantidade_reservada"
    `;

    if (rows.length === 0) {
      await this.requireExistingInventory(variantId, client);
      throw new CannotReleaseReservationException();
    }

    return this.toSnapshot(rows[0]);
  }

  /**
   * Atomically turn a reservation into consumed stock (sale).
   * Does not create Order / payment — checkout will call this inside a short DB transaction.
   */
  async commitReservedStock(
    variantId: string,
    quantity: number,
    client: StockClient = this.prisma,
  ): Promise<StockSnapshot> {
    this.assertArgs(variantId, quantity);

    const rows = await client.$queryRaw<StockRow[]>`
      UPDATE "catalog"."estoques"
      SET
        "quantidade" = "quantidade" - ${quantity},
        "quantidade_reservada" = "quantidade_reservada" - ${quantity},
        "atualizado_em" = CURRENT_TIMESTAMP
      WHERE "variante_id" = ${variantId}::uuid
        AND "quantidade_reservada" >= ${quantity}
        AND "quantidade" >= ${quantity}
      RETURNING "variante_id", "quantidade", "quantidade_reservada"
    `;

    if (rows.length === 0) {
      await this.requireExistingInventory(variantId, client);
      throw new CannotCommitReservedStockException();
    }

    return this.toSnapshot(rows[0]);
  }

  /**
   * Sets the total on-hand quantity directly — a seller-facing manual stock
   * edit (see ProductsService.updateVariantStockForSeller), not a checkout
   * reservation. Unlike reserve/release/commitReservedStock, 0 is a valid
   * target (marks a variant fully out of stock). The PostgreSQL CHECK
   * quantidade_reservada <= quantidade means a target below the currently
   * reserved amount must be rejected — atomically, in the same
   * UPDATE ... WHERE, never read-then-write.
   */
  async setQuantity(
    variantId: string,
    quantity: number,
    client: StockClient = this.prisma,
  ): Promise<StockSnapshot> {
    if (!UUID_V4.test(variantId)) {
      throw new InvalidVariantIdException();
    }
    if (
      !Number.isInteger(quantity) ||
      quantity < 0 ||
      quantity > MAX_QUANTITY
    ) {
      throw new InvalidStockLevelException();
    }

    const rows = await client.$queryRaw<StockRow[]>`
      UPDATE "catalog"."estoques"
      SET
        "quantidade" = ${quantity},
        "atualizado_em" = CURRENT_TIMESTAMP
      WHERE "variante_id" = ${variantId}::uuid
        AND "quantidade_reservada" <= ${quantity}
      RETURNING "variante_id", "quantidade", "quantidade_reservada"
    `;

    if (rows.length === 0) {
      await this.requireExistingInventory(variantId, client);
      throw new CannotSetQuantityBelowReservedException();
    }

    return this.toSnapshot(rows[0]);
  }

  private assertArgs(variantId: string, quantity: number): void {
    if (!UUID_V4.test(variantId)) {
      throw new InvalidVariantIdException();
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new InvalidStockQuantityException();
    }
  }

  private async requireExistingInventory(
    variantId: string,
    client: StockClient,
  ): Promise<void> {
    const variant = await client.productVariant.findUnique({
      where: { id: variantId },
      select: { inventory: { select: { id: true } } },
    });
    throwUnlessInventoryPresent(variant);
  }

  private toSnapshot(row: StockRow): StockSnapshot {
    const quantity = Number(row.quantidade);
    const reservedQuantity = Number(row.quantidade_reservada);
    return {
      variantId: row.variante_id,
      quantity,
      reservedQuantity,
      availableQuantity: quantity - reservedQuantity,
    };
  }
}
