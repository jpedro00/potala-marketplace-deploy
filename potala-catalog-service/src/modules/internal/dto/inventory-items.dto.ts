import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

/** Mirrors orders-service's own MAX_CHECKOUT_ITEMS. */
export const MAX_INVENTORY_ITEMS = 50;

export class InventoryItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  variantId!: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class InventoryItemsDto {
  @ApiProperty({ type: [InventoryItemDto] })
  @ValidateNested({ each: true })
  @Type(() => InventoryItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_INVENTORY_ITEMS)
  items!: InventoryItemDto[];
}
