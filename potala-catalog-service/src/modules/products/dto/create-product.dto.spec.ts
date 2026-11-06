import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './create-product.dto';
import {
  MAX_PRICE_CENTS,
  MAX_PRODUCT_DESCRIPTION_LENGTH,
  MAX_PRODUCT_TITLE_LENGTH,
  MAX_PRODUCT_VARIANTS,
  MAX_STOCK_QUANTITY,
  MAX_VARIANT_NAME_LENGTH,
  MAX_VARIANT_SKU_LENGTH,
} from '../products.constants';

const CATEGORY_ID = '00000000-0000-4000-8000-0000000000ca';

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Camiseta Potala',
    categoryId: CATEGORY_ID,
    priceCents: 4990,
    variants: [{ name: 'Padrão', sku: 'CAM-PADRAO', quantity: 10 }],
    ...overrides,
  };
}

describe('CreateProductDto', () => {
  async function errorsOf(plain: Record<string, unknown>) {
    const dto = plainToInstance(CreateProductDto, plain);
    return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  }

  it('accepts a product with a default variant', async () => {
    expect(await errorsOf(validPayload())).toHaveLength(0);
  });

  it('rejects an empty variants array', async () => {
    const errors = await errorsOf(validPayload({ variants: [] }));
    expect(errors.some((error) => error.property === 'variants')).toBe(true);
  });

  it('rejects a negative product price', async () => {
    const errors = await errorsOf(validPayload({ priceCents: -1 }));
    expect(errors.some((error) => error.property === 'priceCents')).toBe(true);
  });

  it('rejects a negative variant quantity', async () => {
    const errors = await errorsOf(
      validPayload({
        variants: [{ name: 'Padrão', sku: 'X', quantity: -1 }],
      }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects sellerId in the body', async () => {
    const errors = await errorsOf(validPayload({ sellerId: 'other-seller' }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an invalid categoryId', async () => {
    const errors = await errorsOf(validPayload({ categoryId: 'not-a-uuid' }));
    expect(errors.some((error) => error.property === 'categoryId')).toBe(true);
  });

  describe('whitespace', () => {
    it('rejects a whitespace-only title', async () => {
      const errors = await errorsOf(validPayload({ title: '   ' }));
      const titleError = errors.find((error) => error.property === 'title');
      expect(titleError?.constraints).toHaveProperty('isNotEmpty');
    });

    it('rejects a whitespace-only variant name', async () => {
      const errors = await errorsOf(
        validPayload({
          variants: [{ name: '   ', sku: 'CAM-PADRAO', quantity: 1 }],
        }),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects a whitespace-only variant sku', async () => {
      const errors = await errorsOf(
        validPayload({
          variants: [{ name: 'Padrão', sku: '   ', quantity: 1 }],
        }),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('trims surrounding whitespace instead of rejecting real values', async () => {
      const dto = plainToInstance(
        CreateProductDto,
        validPayload({
          title: '  Camiseta Potala  ',
          description: '  linha 1\nlinha 2  ',
          variants: [
            { name: '  Padrão  ', sku: '  CAM-PADRAO  ', quantity: 1 },
          ],
        }),
      );

      expect(await validate(dto)).toHaveLength(0);
      expect(dto.title).toBe('Camiseta Potala');
      expect(dto.description).toBe('linha 1\nlinha 2');
      expect(dto.variants[0].name).toBe('Padrão');
      expect(dto.variants[0].sku).toBe('CAM-PADRAO');
    });
  });

  describe('limits', () => {
    it('accepts values exactly at the maximum limits', async () => {
      const errors = await errorsOf(
        validPayload({
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
      );
      expect(errors).toHaveLength(0);
    });

    it('rejects a title above the limit', async () => {
      const errors = await errorsOf(
        validPayload({ title: 'a'.repeat(MAX_PRODUCT_TITLE_LENGTH + 1) }),
      );
      expect(
        errors.find((error) => error.property === 'title')?.constraints,
      ).toHaveProperty('maxLength');
    });

    it('rejects a description above the limit', async () => {
      const errors = await errorsOf(
        validPayload({
          description: 'd'.repeat(MAX_PRODUCT_DESCRIPTION_LENGTH + 1),
        }),
      );
      expect(
        errors.find((error) => error.property === 'description')?.constraints,
      ).toHaveProperty('maxLength');
    });

    it('rejects a priceCents above the limit', async () => {
      const errors = await errorsOf(
        validPayload({ priceCents: MAX_PRICE_CENTS + 1 }),
      );
      expect(
        errors.find((error) => error.property === 'priceCents')?.constraints,
      ).toHaveProperty('max');
    });

    it('rejects a variant name above the limit', async () => {
      const errors = await errorsOf(
        validPayload({
          variants: [
            {
              name: 'n'.repeat(MAX_VARIANT_NAME_LENGTH + 1),
              sku: 'CAM-PADRAO',
              quantity: 1,
            },
          ],
        }),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects a sku above the limit', async () => {
      const errors = await errorsOf(
        validPayload({
          variants: [
            {
              name: 'Padrão',
              sku: 's'.repeat(MAX_VARIANT_SKU_LENGTH + 1),
              quantity: 1,
            },
          ],
        }),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects a quantity above the limit', async () => {
      const errors = await errorsOf(
        validPayload({
          variants: [
            {
              name: 'Padrão',
              sku: 'CAM-PADRAO',
              quantity: MAX_STOCK_QUANTITY + 1,
            },
          ],
        }),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects more variants than the maximum', async () => {
      const variants = Array.from(
        { length: MAX_PRODUCT_VARIANTS + 1 },
        (_unused, index) => ({
          name: `Variante ${index}`,
          sku: `SKU-${index}`,
          quantity: 1,
        }),
      );
      const errors = await errorsOf(validPayload({ variants }));
      expect(
        errors.find((error) => error.property === 'variants')?.constraints,
      ).toHaveProperty('arrayMaxSize');
    });
  });
});
