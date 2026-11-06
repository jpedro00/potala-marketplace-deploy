import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

/** Mirrors orders-service's own MAX_CHECKOUT_ITEMS — a single checkout resolves at most this many distinct variants. */
export const MAX_RESOLVE_VARIANT_IDS = 50;

export class ResolveVariantsDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'Variant ids to resolve. Ids with no matching variant are silently omitted from the response — the caller diffs the response against what it asked for.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_RESOLVE_VARIANT_IDS)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  variantIds!: string[];
}
