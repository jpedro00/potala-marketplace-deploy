import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MAX_CATEGORY_NAME_LENGTH } from '../categories.constants';

/** Trims before IsNotEmpty/MaxLength so whitespace-only input is rejected, not stored — same helper shape as create-product.dto.ts. */
const TrimString = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

/**
 * No `slug` field on purpose — same decision products.service.ts already
 * makes for product slugs: always derived from `name` via slugify(), never
 * accepted from the client. No `parentId` either — admin scope for this v1
 * is a flat list (decision made explicitly with Arthur), not the
 * parent/child hierarchy the schema's self-relation already supports.
 */
export class CreateCategoryDto {
  @ApiProperty({ maxLength: MAX_CATEGORY_NAME_LENGTH })
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_CATEGORY_NAME_LENGTH)
  name!: string;
}
