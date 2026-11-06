import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CategoryStatus } from '@prisma/client';
import { MAX_CATEGORY_NAME_LENGTH } from '../categories.constants';

const TrimString = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

/**
 * Both fields optional (partial update) — a name-only rename doesn't force
 * the caller to also resend status, and vice-versa. Renaming regenerates the
 * slug from the new name (CategoriesService.update) — nothing in this
 * codebase depends on a category's slug staying stable across a rename, so
 * keeping slug in sync with name was chosen over freezing it at creation.
 *
 * No hard delete anywhere in this module: `status: INACTIVE` is how a
 * category is retired, same reasoning as sellers-service's
 * approve/reject/suspend (status transitions, not deletion) — and
 * Product.categoryId is ON DELETE RESTRICT in the schema, so a real DELETE
 * would fail the moment any product referenced the category anyway.
 */
export class UpdateCategoryDto {
  @ApiPropertyOptional({ maxLength: MAX_CATEGORY_NAME_LENGTH })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(MAX_CATEGORY_NAME_LENGTH)
  name?: string;

  @ApiPropertyOptional({ enum: CategoryStatus })
  @IsOptional()
  @IsEnum(CategoryStatus)
  status?: CategoryStatus;
}
