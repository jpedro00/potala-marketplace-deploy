export const MAX_CATEGORY_NAME_LENGTH = 120;

/** Used when a name normalizes to an empty slug (e.g. only symbols/emoji) — mirrors PRODUCT_SLUG_FALLBACK's role in products.constants.ts. */
export const CATEGORY_SLUG_FALLBACK = 'categoria';

/** Suffix probes while looking for a free slug before inserting/renaming — same pattern as MAX_PRODUCT_SLUG_ATTEMPTS. */
export const MAX_CATEGORY_SLUG_ATTEMPTS = 50;
