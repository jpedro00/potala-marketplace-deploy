import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ProductStatus } from '@prisma/client';

/**
 * Deliberately narrow: the seller may only publish/unpublish their own
 * product (DRAFT/INACTIVE -> ACTIVE, or ACTIVE -> INACTIVE). REVIEW and
 * REJECTED imply a moderation workflow that does not exist yet (no admin
 * review screen, no endpoint) — out of scope here, same reasoning as the
 * rest of this v1's deliberate gaps (see README.md).
 */
const SELLER_SETTABLE_STATUSES = [
  ProductStatus.ACTIVE,
  ProductStatus.INACTIVE,
] as const;

export class UpdateProductStatusDto {
  @ApiPropertyOptional({ enum: SELLER_SETTABLE_STATUSES })
  @IsIn(SELLER_SETTABLE_STATUSES)
  status!: (typeof SELLER_SETTABLE_STATUSES)[number];
}
