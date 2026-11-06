export const MAX_CONTENT_TITLE_LENGTH = 160;
export const MAX_CONTENT_INSTRUCTOR_LENGTH = 120;
export const MAX_CONTENT_CATEGORY_LENGTH = 120;
export const MAX_CONTENT_DESCRIPTION_LENGTH = 5000;
export const MAX_CONTENT_MODERATION_NOTE_LENGTH = 2000;

export const MIN_CONTENT_PRICE_CENTS = 0;
/**
 * Same ceiling used elsewhere in this service for a single unit price
 * (see products.constants.ts) -- one price must fit in a Prisma Int /
 * PostgreSQL int4 column. Declared locally rather than imported, same
 * "own domain, own constants" pattern already used by
 * categories.constants.ts for its slug-attempt ceiling.
 */
export const MAX_CONTENT_PRICE_CENTS = 100_000_000;
