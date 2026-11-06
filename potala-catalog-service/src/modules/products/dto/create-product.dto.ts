import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  MAX_IMAGE_URL_LENGTH,
  MAX_PRICE_CENTS,
  MAX_PRODUCT_DESCRIPTION_LENGTH,
  MAX_PRODUCT_IMAGE_URLS,
  MAX_PRODUCT_TITLE_LENGTH,
  MAX_PRODUCT_VARIANTS,
  MAX_STOCK_QUANTITY,
  MAX_VARIANT_NAME_LENGTH,
  MAX_VARIANT_SKU_LENGTH,
  MIN_PRICE_CENTS,
  MIN_PRODUCT_VARIANTS,
  MIN_STOCK_QUANTITY,
} from '../products.constants';

/** Trims before IsNotEmpty/MaxLength so whitespace-only input is rejected, not stored. */
const TrimString = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

export class CreateProductVariantDto {
  @ApiProperty({ example: 'Padrão', maxLength: MAX_VARIANT_NAME_LENGTH })
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_VARIANT_NAME_LENGTH)
  name!: string;

  @ApiProperty({
    example: 'CAMISETA-PRETA-M',
    maxLength: MAX_VARIANT_SKU_LENGTH,
  })
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_VARIANT_SKU_LENGTH)
  sku!: string;

  @ApiPropertyOptional({
    description: 'Optional override of the product list price, in cents',
    minimum: MIN_PRICE_CENTS,
    maximum: MAX_PRICE_CENTS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_PRICE_CENTS)
  @Max(MAX_PRICE_CENTS)
  priceCents?: number;

  @ApiProperty({
    minimum: MIN_STOCK_QUANTITY,
    maximum: MAX_STOCK_QUANTITY,
    description: 'On-hand quantity; reservedQuantity is always 0',
  })
  @Type(() => Number)
  @IsInt()
  @Min(MIN_STOCK_QUANTITY)
  @Max(MAX_STOCK_QUANTITY)
  quantity!: number;
}

export class CreateProductDto {
  @ApiProperty({ maxLength: MAX_PRODUCT_TITLE_LENGTH })
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PRODUCT_TITLE_LENGTH)
  title!: string;

  @ApiPropertyOptional({ maxLength: MAX_PRODUCT_DESCRIPTION_LENGTH })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(MAX_PRODUCT_DESCRIPTION_LENGTH)
  description?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  categoryId!: string;

  @ApiProperty({ minimum: MIN_PRICE_CENTS, maximum: MAX_PRICE_CENTS })
  @Type(() => Number)
  @IsInt()
  @Min(MIN_PRICE_CENTS)
  @Max(MAX_PRICE_CENTS)
  priceCents!: number;

  @ApiProperty({
    type: [CreateProductVariantDto],
    minItems: MIN_PRODUCT_VARIANTS,
    maxItems: MAX_PRODUCT_VARIANTS,
  })
  @IsArray()
  @ArrayMinSize(MIN_PRODUCT_VARIANTS)
  @ArrayMaxSize(MAX_PRODUCT_VARIANTS)
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantDto)
  variants!: CreateProductVariantDto[];

  /**
   * URLs already hosted elsewhere by the seller — no upload endpoint exists
   * (see products.constants.ts). Stored as ProductImage rows in creation
   * order (position = array index). Optional: a product with no images is
   * still valid, the public storefront just falls back to a placeholder.
   */
  @ApiPropertyOptional({
    type: [String],
    maxItems: MAX_PRODUCT_IMAGE_URLS,
    description: 'Image URLs hosted elsewhere by the seller, in display order',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PRODUCT_IMAGE_URLS)
  @IsUrl({ require_protocol: true }, { each: true })
  @MaxLength(MAX_IMAGE_URL_LENGTH, { each: true })
  imageUrls?: string[];
}
