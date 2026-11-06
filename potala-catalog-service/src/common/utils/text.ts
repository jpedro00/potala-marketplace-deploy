/** Ported unchanged from the monolith's common/utils/text.ts (also mirrored in sellers-service). */
export function slugify(input: string, fallback = 'produto'): string {
  const slug = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug.length > 0 ? slug : fallback;
}
