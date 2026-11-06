import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { InventoryService, StockSnapshot } from '../inventory/inventory.service';
import { InventoryItemDto } from './dto/inventory-items.dto';

export interface ResolvedProductVariant {
  variantId: string;
  productId: string;
  sellerId: string;
  productStatus: string;
  productTitle: string;
  sku: string;
  variantName: string;
  /** variant.priceCents override when set, else product.priceCents — the same "effective price" the storefront would show. */
  unitPriceCents: number;
  availableQuantity: number;
}

/**
 * Backs this service's own /internal/* routes (see internal.controller.ts) —
 * added specifically for orders-service, this service's first internal-API
 * consumer. Two jobs: resolving authoritative product/variant/price/seller
 * data (orders-service must never trust productId/variantId/price/sellerId
 * coming from its own client — see docs/internal-api-contract.md), and
 * exposing InventoryService's already-ported reserve/release/commit
 * operations over HTTP, batched so a whole order's worth of lines succeeds
 * or fails together.
 */
@Injectable()
export class InternalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  /**
   * Ids with no matching variant are simply absent from the result — never
   * an error here. The caller (orders-service) is the one that knows
   * whether a missing id means "invalid cart line" and should respond to
   * its own client accordingly.
   */
  async resolveVariants(variantIds: string[]): Promise<ResolvedProductVariant[]> {
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: {
        product: {
          select: { id: true, sellerId: true, status: true, title: true, priceCents: true },
        },
        inventory: { select: { quantity: true, reservedQuantity: true } },
      },
    });

    return variants.map((variant) => ({
      variantId: variant.id,
      productId: variant.product.id,
      sellerId: variant.product.sellerId,
      productStatus: variant.product.status,
      productTitle: variant.product.title,
      sku: variant.sku,
      variantName: variant.name,
      unitPriceCents: variant.priceCents ?? variant.product.priceCents,
      availableQuantity: variant.inventory
        ? variant.inventory.quantity - variant.inventory.reservedQuantity
        : 0,
    }));
  }

  /**
   * All-or-nothing: every item is reserved inside a single Postgres
   * transaction, so a caller never has to reason about partial reservation —
   * either the whole batch succeeded (returns every snapshot) or none of it
   * did (the transaction rolls back and the original exception — e.g.
   * InsufficientStockException — propagates, translated to an HTTP status by
   * the global exception filter, same as any other endpoint here).
   */
  async reserveBatch(items: InventoryItemDto[]): Promise<StockSnapshot[]> {
    return this.prisma.$transaction((tx) =>
      Promise.all(
        items.map((item) =>
          this.inventoryService.reserve(item.variantId, item.quantity, tx),
        ),
      ),
    );
  }

  /** Same all-or-nothing batching as reserveBatch, for the release compensation path. */
  async releaseBatch(items: InventoryItemDto[]): Promise<StockSnapshot[]> {
    return this.prisma.$transaction((tx) =>
      Promise.all(
        items.map((item) =>
          this.inventoryService.release(item.variantId, item.quantity, tx),
        ),
      ),
    );
  }

  /** Same all-or-nothing batching as reserveBatch, for the payment-approved path. */
  async commitBatch(items: InventoryItemDto[]): Promise<StockSnapshot[]> {
    return this.prisma.$transaction((tx) =>
      Promise.all(
        items.map((item) =>
          this.inventoryService.commitReservedStock(item.variantId, item.quantity, tx),
        ),
      ),
    );
  }
}
