export const MIN_PRODUCT_VARIANTS = 1;
export const MAX_PRODUCT_VARIANTS = 50;

export const MAX_PRODUCT_TITLE_LENGTH = 160;
export const MAX_PRODUCT_DESCRIPTION_LENGTH = 5000;
export const MAX_VARIANT_NAME_LENGTH = 120;
export const MAX_VARIANT_SKU_LENGTH = 100;

export const MIN_PRICE_CENTS = 0;
/**
 * Ceiling for a single unit price (R$ 1.000.000,00 in cents), not for any
 * aggregate. Catalog prices are Prisma Int / PostgreSQL int4 (max 2147483647)
 * and this bound only guarantees that one price fits in that column.
 */
export const MAX_PRICE_CENTS = 100_000_000;

export const MIN_STOCK_QUANTITY = 0;
/**
 * Ceiling for total on-hand stock of one variant. It is NOT a purchasable
 * amount: MAX_PRICE_CENTS * MAX_STOCK_QUANTITY overflows int4 by far, so it
 * must never be read as a bound on any monetary product.
 *
 * orders-service (not built yet) must therefore define its own, much
 * smaller OrderItem.quantity limit, and compute lineTotalCents / subtotals /
 * totals with an explicit overflow check against the int4 ceiling before
 * persisting. Order and payment amounts are expected to stay Prisma Int /
 * PostgreSQL int4 there too, matching the monolith's original plan — no
 * BigInt migration is planned as part of this catalog work.
 */
export const MAX_STOCK_QUANTITY = 1_000_000;

/**
 * New this session (public storefront work): there is still no image
 * upload endpoint (deliberately out of scope, see README.md gaps list) —
 * sellers paste a URL they host elsewhere instead. Kept small since this
 * is meant to unblock a real public storefront, not to be a real media
 * pipeline.
 */
export const MAX_PRODUCT_IMAGE_URLS = 6;
export const MAX_IMAGE_URL_LENGTH = 2048;

/** Suffix probes while looking for a free (sellerId, slug) before inserting. */
export const MAX_PRODUCT_SLUG_ATTEMPTS = 50;
/** Whole-transaction retries when another request took the slug between probe and insert. */
export const MAX_PRODUCT_SLUG_RETRIES = 3;
export const PRODUCT_SLUG_FALLBACK = 'produto';

/**
 * In the origin monolith this lived in common/constants/auth.constants.ts —
 * an odd placement for a product-domain default with no relation to
 * authentication. Relocated here during the port (same value, same use:
 * ProductsService.defaultVariantName) since this is a fresh service, not a
 * behavioral change.
 */
export const DEFAULT_PRODUCT_VARIANT_NAME = 'Padrão';
