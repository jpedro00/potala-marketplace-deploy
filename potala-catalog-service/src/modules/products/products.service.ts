import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { CategoryStatus, Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  buildPage,
  PAGINATION_ORDER_CREATED_AT_ID_DESC,
  prismaIdCursorArgs,
  requireCursor,
  resolvePagination,
} from '../../common/pagination/pagination';
import { slugify } from '../../common/utils/text';
import { buildSearchVariants } from './search-variants';
import {
  DEFAULT_PRODUCT_VARIANT_NAME,
  MAX_PRICE_CENTS,
  MAX_PRODUCT_DESCRIPTION_LENGTH,
  MAX_PRODUCT_SLUG_ATTEMPTS,
  MAX_PRODUCT_SLUG_RETRIES,
  MAX_PRODUCT_TITLE_LENGTH,
  MAX_PRODUCT_VARIANTS,
  MAX_STOCK_QUANTITY,
  MAX_VARIANT_NAME_LENGTH,
  MAX_VARIANT_SKU_LENGTH,
  MIN_PRICE_CENTS,
  MIN_PRODUCT_VARIANTS,
  MIN_STOCK_QUANTITY,
  PRODUCT_SLUG_FALLBACK,
} from './products.constants';
import { CreateProductDto } from './dto/create-product.dto';
import { PublicProductsQueryDto } from './dto/public-products-query.dto';
import { AttributesService } from '../product-attributes/attributes.service';

type CatalogClient = Prisma.TransactionClient | PrismaService;

type NormalizedVariant = {
  name: string;
  sku: string;
  quantity: number;
  priceCents: number | null;
};

type CreatedVariant = {
  id: string;
  name: string;
  sku: string;
  priceCents: number | null;
  inventory: { quantity: number; reservedQuantity: number };
};

/**
 * Ported from the monolith's modules/products/products.service.ts. The only
 * behavioral difference: `sellerId` here always arrives already resolved and
 * confirmed by SellerContextGuard (a network call to sellers-service), the
 * same trust boundary the monolith's local guard provided — so, exactly
 * like the monolith, this service never re-validates sellerId against a
 * seller store itself (there is nothing local to check it against — see
 * docs/internal-api-contract.md).
 */
@Injectable()
export class ProductsService {
  readonly defaultVariantName = DEFAULT_PRODUCT_VARIANT_NAME;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    @Optional() private readonly attributesService?: AttributesService,
  ) {}

  async listForSeller(sellerId: string, query: PaginationQueryDto = {}) {
    const { limit, cursor } = resolvePagination(query);

    // Scoped in SQL, not by comparing sellerId after a global read: a cursor
    // from another store must be looked up as if it did not exist.
    await requireCursor(cursor, async (id) => {
      const product = await this.prisma.product.findFirst({
        where: { id, sellerId },
        select: { id: true },
      });
      return product !== null;
    });

    const rows = await this.prisma.product.findMany({
      ...prismaIdCursorArgs(limit, cursor),
      where: { sellerId },
      include: { variants: { include: { inventory: true } } },
      orderBy: PAGINATION_ORDER_CREATED_AT_ID_DESC,
    });

    return buildPage(rows, limit);
  }

  /**
   * Tenant-scoped in SQL on purpose. A product owned by another seller must be
   * indistinguishable from a product that does not exist, otherwise the 403
   * itself confirms the id to a foreign tenant.
   */
  async getForSeller(sellerId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, sellerId },
      include: {
        images: { orderBy: { position: 'asc' } },
        variants: { include: { inventory: true } },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  /**
   * Narrow on purpose (see UpdateProductStatusDto): only ACTIVE/INACTIVE are
   * seller-settable. Scoped to sellerId in the WHERE, same
   * indistinguishable-404 reasoning as getForSeller — a product owned by
   * another store must 404, not 403 (403 would confirm the id exists).
   */
  async updateStatusForSeller(
    sellerId: string,
    productId: string,
    // `ProductStatus` is generated as `type ProductStatus = (typeof ProductStatus)[keyof typeof ProductStatus]`
    // in this Prisma client version, not a real TS enum — `ProductStatus.ACTIVE`
    // only works as a VALUE, not as a type (TS2702). `typeof` here reads the
    // value's literal type instead.
    status: typeof ProductStatus.ACTIVE | typeof ProductStatus.INACTIVE,
  ) {
    const existing = await this.prisma.product.findFirst({
      where: { id: productId, sellerId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: { status },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { position: 'asc' } },
        variants: { include: { inventory: true } },
      },
    });
  }

  /**
   * Sets a variant's on-hand stock directly — a seller-facing manual
   * adjustment (the "Estoque" screen), not a checkout reservation (that
   * path is InventoryService.reserve/release/commitReservedStock, called
   * only by orders-service via /internal/inventory/*). Scoped to sellerId
   * AND productId on ProductVariant itself (no need to also look up
   * Product — ProductVariant.sellerId is already authoritative, enforced
   * by the composite FK to Product(id, sellerId) at the database level).
   * Same indistinguishable-404 reasoning as getForSeller/
   * updateStatusForSeller: a variant belonging to another store, or to a
   * different product than the one in the URL, must 404, never 403.
   */
  async updateVariantStockForSeller(
    sellerId: string,
    productId: string,
    variantId: string,
    quantity: number,
  ) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId, sellerId },
      select: { id: true },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    const snapshot = await this.inventoryService.setQuantity(
      variantId,
      quantity,
    );

    return {
      variantId: snapshot.variantId,
      quantity: snapshot.quantity,
      reservedQuantity: snapshot.reservedQuantity,
      availableQuantity: snapshot.availableQuantity,
    };
  }

  /**
   * "Todos os produtos" (admin) -- pedido de Arthur ("pode seguir com
   * esse"), ver status-migracao-microservicos.md. Cross-tenant de
   * propósito (sem sellerId no WHERE) -- o oposto de listForSeller acima,
   * mesmo padrão de cursor usado em todo canto. Sem busca/filtro
   * server-side: mesmo minimalismo já usado pelo admin/customers e
   * admin/orders reais (só limit/cursor) -- ver AdminProductsController.
   */
  async listForAdmin(query: PaginationQueryDto = {}) {
    const { limit, cursor } = resolvePagination(query);

    await requireCursor(cursor, async (id) => {
      const product = await this.prisma.product.findUnique({
        where: { id },
        select: { id: true },
      });
      return product !== null;
    });

    const rows = await this.prisma.product.findMany({
      ...prismaIdCursorArgs(limit, cursor),
      include: { variants: { include: { inventory: true } } },
      orderBy: PAGINATION_ORDER_CREATED_AT_ID_DESC,
    });

    return buildPage(rows, limit);
  }

  /**
   * Admin-only status toggle, cross-tenant on purpose -- the
   * marketplace-wide equivalent of updateStatusForSeller above, same
   * narrow ACTIVE/INACTIVE restriction (see UpdateProductStatusDto's
   * comment on why REVIEW/REJECTED are left out: that's a moderation
   * workflow that doesn't exist yet, and this isn't it -- it's just the
   * admin pulling or restoring a listing across any store, same shape as
   * AdminService.blockCustomer/unblockCustomer in identity-service). No
   * sellerId in the WHERE -- that's the whole point here, not a 404-vs-403
   * concern like getForSeller/updateStatusForSeller (there is no tenant to
   * hide this from).
   */
  async setStatusForAdmin(
    productId: string,
    status: typeof ProductStatus.ACTIVE | typeof ProductStatus.INACTIVE,
  ) {
    const existing = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: { status },
      include: { variants: { include: { inventory: true } } },
    });
  }

  /**
   * Public storefront listing — no session required. Only ACTIVE products
   * are ever returned; DRAFT/REVIEW/REJECTED/INACTIVE stay invisible here
   * regardless of who owns them, same as the public detail lookup below.
   */
  async listPublished(query: PublicProductsQueryDto = {}) {
    const { limit, cursor } = resolvePagination(query);

    await requireCursor(cursor, async (id) => {
      const product = await this.prisma.product.findFirst({
        where: { id, status: ProductStatus.ACTIVE },
        select: { id: true },
      });
      return product !== null;
    });

    const where: Prisma.ProductWhereInput = { status: ProductStatus.ACTIVE };
    if(query.attributes&&!query.itemType)throw new BadRequestException('Select itemType for attribute filters');
    if(query.itemType)where.itemType=query.itemType;
    if(query.attributes)where.AND=await (this.attributesService??new AttributesService(this.prisma)).filters(query.itemType!,query.attributes);
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.sellerId) {
      where.sellerId = query.sellerId;
    }
    if (query.q) {
      // Bug de produção (05/10): "cristal" não encontrava o produto/categoria
      // "Cristais" porque a busca era um simples substring-match contra
      // Product.title. Ampliamos para também considerar Category.name, e
      // para o par singular/plural comprovado (cristal/cristais) via
      // buildSearchVariants -- helper pequeno e restrito, NÃO um stemmer
      // genérico (ver comentário em search-variants.ts). Qualquer outro
      // termo continua gerando exatamente a mesma busca de hoje (substring
      // único em title/category, sem variante artificial).
      const searchTerms = buildSearchVariants(query.q);
      if (searchTerms.length > 0) {
        where.OR = searchTerms.flatMap((term) => [
          { title: { contains: term, mode: 'insensitive' } },
          { category: { name: { contains: term, mode: 'insensitive' } } },
        ]);
      }
    }

    const rows = await this.prisma.product.findMany({
      ...prismaIdCursorArgs(limit, cursor),
      where,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { position: 'asc' }, take: 1 },
        variants: { include: { inventory: true } },
      },
      orderBy: PAGINATION_ORDER_CREATED_AT_ID_DESC,
    });

    return buildPage(rows, limit);
  }

  /**
   * Public product detail. `status: ACTIVE` is part of the WHERE, not a
   * post-fetch check — a DRAFT/INACTIVE product must 404 here exactly like
   * a nonexistent id, so this endpoint can never be used to preview an
   * unpublished product by guessing its UUID.
   */
  async getPublishedById(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, status: ProductStatus.ACTIVE },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { position: 'asc' } },
        variants: { include: { inventory: true } },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async createForSeller(sellerId: string, dto: CreateProductDto) {
    const title = this.normalizeTitle(dto.title);
    const description = this.normalizeDescription(dto.description);
    const priceCents = this.normalizePriceCents(dto.priceCents, 'priceCents');
    const variants = this.normalizeVariants(dto);
    const baseSlug = slugify(title, PRODUCT_SLUG_FALLBACK);

    for (let attempt = 0; attempt <= MAX_PRODUCT_SLUG_RETRIES; attempt += 1) {
      try {
        return await this.createInTransaction(sellerId, dto.categoryId, {
          title,
          description,
          priceCents,
          variants,
          baseSlug,
          imageUrls: dto.imageUrls,
        });
      } catch (error) {
        if (
          attempt < MAX_PRODUCT_SLUG_RETRIES &&
          this.uniqueViolationTarget(error) === 'slug'
        ) {
          continue;
        }
        this.rethrowCreateFailure(error);
      }
    }

    throw new ConflictException('Could not allocate a unique product slug');
  }

  /**
   * SKU uniqueness is per seller, enforced by @@unique([sellerId, sku]).
   * sellerId on ProductVariant must match Product.sellerId (PostgreSQL composite FK).
   */
  async assertSkuAvailable(
    sellerId: string,
    sku: string,
    client: CatalogClient = this.prisma,
  ): Promise<void> {
    const existing = await client.productVariant.findUnique({
      where: { sellerId_sku: { sellerId, sku } },
    });
    if (existing) {
      throw new ConflictException('SKU already exists for this store');
    }
  }

  private async createInTransaction(
    sellerId: string,
    categoryId: string,
    input: {
      title: string;
      description: string;
      priceCents: number;
      variants: NormalizedVariant[];
      baseSlug: string;
      imageUrls?: string[];
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const category = await this.assertCategoryAcceptsProducts(tx, categoryId);

      const skus = new Set<string>();
      for (const variant of input.variants) {
        if (skus.has(variant.sku)) {
          throw new ConflictException('SKU already exists for this store');
        }
        skus.add(variant.sku);
        await this.assertSkuAvailable(sellerId, variant.sku, tx);
      }

      const slug = await this.nextAvailableProductSlug(
        tx,
        sellerId,
        input.baseSlug,
      );

      const product = await tx.product.create({
        data: {
          sellerId,
          categoryId,
          title: input.title,
          slug,
          description: input.description,
          priceCents: input.priceCents,
          status: ProductStatus.DRAFT,
        },
      });

      const createdVariants: CreatedVariant[] = [];
      for (const variant of input.variants) {
        const createdVariant = await tx.productVariant.create({
          data: {
            productId: product.id,
            sellerId,
            sku: variant.sku,
            name: variant.name,
            priceCents: variant.priceCents,
          },
        });

        const inventory = await tx.inventory.create({
          data: {
            variantId: createdVariant.id,
            quantity: variant.quantity,
            reservedQuantity: 0,
          },
        });

        createdVariants.push({
          id: createdVariant.id,
          name: createdVariant.name,
          sku: createdVariant.sku,
          priceCents: createdVariant.priceCents,
          inventory: {
            quantity: inventory.quantity,
            reservedQuantity: inventory.reservedQuantity,
          },
        });
      }

      let createdImages: { id: string; url: string; alt: string | null; position: number }[] = [];
      if (input.imageUrls && input.imageUrls.length > 0) {
        await tx.productImage.createMany({
          data: input.imageUrls.map((url, position) => ({
            productId: product.id,
            url,
            position,
          })),
        });
        // createMany doesn't return rows (Prisma/Postgres driver limitation
        // here) — re-read so the response always reflects what was stored,
        // same reasoning as re-selecting after a raw write elsewhere in
        // this service.
        createdImages = await tx.productImage.findMany({
          where: { productId: product.id },
          orderBy: { position: 'asc' },
        });
      }

      return {
        id: product.id,
        title: product.title,
        slug: product.slug,
        description: product.description,
        priceCents: product.priceCents,
        status: product.status,
        category: {
          id: category.id,
          name: category.name,
          slug: category.slug,
          status: category.status,
        },
        variants: createdVariants,
        images: createdImages,
      };
    });
  }

  private normalizeTitle(rawTitle: string): string {
    const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
    if (!title) {
      throw new BadRequestException('title must not be empty');
    }
    if (title.length > MAX_PRODUCT_TITLE_LENGTH) {
      throw new BadRequestException(
        `title must be at most ${MAX_PRODUCT_TITLE_LENGTH} characters`,
      );
    }
    return title;
  }

  private normalizeDescription(rawDescription?: string): string {
    const description = rawDescription?.trim() ?? '';
    if (description.length > MAX_PRODUCT_DESCRIPTION_LENGTH) {
      throw new BadRequestException(
        `description must be at most ${MAX_PRODUCT_DESCRIPTION_LENGTH} characters`,
      );
    }
    return description;
  }

  private normalizePriceCents(value: number, field: string): number {
    if (
      !Number.isInteger(value) ||
      value < MIN_PRICE_CENTS ||
      value > MAX_PRICE_CENTS
    ) {
      throw new BadRequestException(
        `${field} must be an integer between ${MIN_PRICE_CENTS} and ${MAX_PRICE_CENTS}`,
      );
    }
    return value;
  }

  private normalizeVariants(dto: CreateProductDto): NormalizedVariant[] {
    if (
      !Array.isArray(dto.variants) ||
      dto.variants.length < MIN_PRODUCT_VARIANTS
    ) {
      throw new BadRequestException('At least one variant is required');
    }
    if (dto.variants.length > MAX_PRODUCT_VARIANTS) {
      throw new BadRequestException(
        `A product can have at most ${MAX_PRODUCT_VARIANTS} variants`,
      );
    }

    return dto.variants.map((variant) => {
      const name = variant.name?.trim() ?? '';
      const sku = variant.sku?.trim() ?? '';

      if (!name) {
        throw new BadRequestException('variant name must not be empty');
      }
      if (name.length > MAX_VARIANT_NAME_LENGTH) {
        throw new BadRequestException(
          `variant name must be at most ${MAX_VARIANT_NAME_LENGTH} characters`,
        );
      }
      if (!sku) {
        throw new BadRequestException('variant sku must not be empty');
      }
      if (sku.length > MAX_VARIANT_SKU_LENGTH) {
        throw new BadRequestException(
          `variant sku must be at most ${MAX_VARIANT_SKU_LENGTH} characters`,
        );
      }
      if (
        !Number.isInteger(variant.quantity) ||
        variant.quantity < MIN_STOCK_QUANTITY ||
        variant.quantity > MAX_STOCK_QUANTITY
      ) {
        throw new BadRequestException(
          `quantity must be an integer between ${MIN_STOCK_QUANTITY} and ${MAX_STOCK_QUANTITY}`,
        );
      }
      if (variant.priceCents !== undefined && variant.priceCents !== null) {
        this.normalizePriceCents(variant.priceCents, 'variant priceCents');
      }

      return {
        name,
        sku,
        quantity: variant.quantity,
        priceCents: variant.priceCents ?? null,
      };
    });
  }

  private async assertCategoryAcceptsProducts(
    client: CatalogClient,
    categoryId: string,
  ) {
    const category = await this.requireCategory(client, categoryId);
    if (category.status !== CategoryStatus.ACTIVE) {
      throw new BadRequestException('Category is not available');
    }
    return category;
  }

  private async requireCategory(client: CatalogClient, categoryId: string) {
    const category = await client.category.findUnique({
      where: { id: categoryId },
      select: { id: true, name: true, slug: true, status: true },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  private async nextAvailableProductSlug(
    client: CatalogClient,
    sellerId: string,
    baseSlug: string,
  ): Promise<string> {
    for (let suffix = 0; suffix < MAX_PRODUCT_SLUG_ATTEMPTS; suffix += 1) {
      const slug = suffix === 0 ? baseSlug : `${baseSlug}-${suffix}`;
      const taken = await client.product.findUnique({
        where: { sellerId_slug: { sellerId, slug } },
        select: { id: true },
      });
      if (!taken) {
        return slug;
      }
    }
    throw new ConflictException('Could not allocate a unique product slug');
  }

  /**
   * Prisma 6 reports meta.target either as field names or as the physical
   * constraint name (variantes_produto_vendedor_id_sku_key /
   * produtos_vendedor_id_slug_key). Both shapes are normalized here so a slug
   * collision is never reported as a duplicated SKU.
   */
  private uniqueViolationTarget(
    error: unknown,
  ): 'sku' | 'slug' | 'other' | null {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return null;
    }

    const rawTarget = error.meta?.target;
    const target = (
      Array.isArray(rawTarget) ? rawTarget.join(',') : String(rawTarget ?? '')
    ).toLowerCase();

    if (target.includes('slug')) {
      return 'slug';
    }
    if (target.includes('sku')) {
      return 'sku';
    }
    return 'other';
  }

  private rethrowCreateFailure(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }

    switch (this.uniqueViolationTarget(error)) {
      case 'sku':
        throw new ConflictException('SKU already exists for this store');
      case 'slug':
        throw new ConflictException(
          'Could not allocate a unique product slug. Try a slightly different title.',
        );
      case 'other':
        throw new ConflictException('Resource already exists');
      default:
        throw error;
    }
  }
}
