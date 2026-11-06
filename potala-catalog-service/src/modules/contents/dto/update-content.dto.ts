import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ContentFormat } from '@prisma/client';
import {
  MAX_CONTENT_CATEGORY_LENGTH,
  MAX_CONTENT_DESCRIPTION_LENGTH,
  MAX_CONTENT_INSTRUCTOR_LENGTH,
  MAX_CONTENT_PRICE_CENTS,
  MAX_CONTENT_TITLE_LENGTH,
  MIN_CONTENT_PRICE_CENTS,
} from '../contents.constants';

const TrimString = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

/**
 * All fields optional (partial update). No `status` here either -- same
 * reasoning as CreateContentDto: status only moves through the dedicated
 * submit-for-review/approve/reject/archive endpoints, never a bare PATCH
 * field a caller could set to any value.
 */
export class UpdateContentDto {
  @ApiPropertyOptional({ maxLength: MAX_CONTENT_TITLE_LENGTH })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(MAX_CONTENT_TITLE_LENGTH)
  title?: string;

  @ApiPropertyOptional({ maxLength: MAX_CONTENT_INSTRUCTOR_LENGTH })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(MAX_CONTENT_INSTRUCTOR_LENGTH)
  instructor?: string;

  @ApiPropertyOptional({ maxLength: MAX_CONTENT_CATEGORY_LENGTH })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(MAX_CONTENT_CATEGORY_LENGTH)
  category?: string;

  @ApiPropertyOptional({ enum: ContentFormat })
  @IsOptional()
  @IsEnum(ContentFormat)
  format?: ContentFormat;

  @ApiPropertyOptional({
    minimum: MIN_CONTENT_PRICE_CENTS,
    maximum: MAX_CONTENT_PRICE_CENTS,
  })
  @IsOptional()
  @IsInt()
  @Min(MIN_CONTENT_PRICE_CENTS)
  @Max(MAX_CONTENT_PRICE_CENTS)
  priceCents?: number;

  @ApiPropertyOptional({ maxLength: MAX_CONTENT_DESCRIPTION_LENGTH })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(MAX_CONTENT_DESCRIPTION_LENGTH)
  description?: string;
}
