import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
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
 * No `status` field on purpose -- every content record is born DRAFT
 * (ContentsService.create), same reasoning as Product always starting
 * DRAFT: moving out of it is a deliberate, separate action
 * (submit-for-review), never something the create payload can shortcut.
 */
export class CreateContentDto {
  @ApiProperty({ maxLength: MAX_CONTENT_TITLE_LENGTH })
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_CONTENT_TITLE_LENGTH)
  title!: string;

  @ApiProperty({ maxLength: MAX_CONTENT_INSTRUCTOR_LENGTH })
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_CONTENT_INSTRUCTOR_LENGTH)
  instructor!: string;

  @ApiProperty({ maxLength: MAX_CONTENT_CATEGORY_LENGTH })
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_CONTENT_CATEGORY_LENGTH)
  category!: string;

  @ApiProperty({ enum: ContentFormat })
  @IsEnum(ContentFormat)
  format!: ContentFormat;

  @ApiProperty({
    minimum: MIN_CONTENT_PRICE_CENTS,
    maximum: MAX_CONTENT_PRICE_CENTS,
  })
  @IsInt()
  @Min(MIN_CONTENT_PRICE_CENTS)
  @Max(MAX_CONTENT_PRICE_CENTS)
  priceCents!: number;

  @ApiPropertyOptional({ maxLength: MAX_CONTENT_DESCRIPTION_LENGTH })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(MAX_CONTENT_DESCRIPTION_LENGTH)
  description?: string;
}
