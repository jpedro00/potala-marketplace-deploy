import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { MAX_STOCK_QUANTITY, MIN_STOCK_QUANTITY } from '../products.constants';

/**
 * Absolute target quantity, not a delta — mirrors how the seller-facing
 * "Estoque" screen edits it (type a new total, save). Unlike
 * CreateProductVariantDto.quantity (the initial stock at product creation,
 * same bounds), this is applied through InventoryService.setQuantity, which
 * enforces at the database level that the target can never drop below
 * whatever is currently reserved (ProductsService.updateVariantStockForSeller
 * maps that into a 409, not silently clamped here).
 */
export class UpdateVariantStockDto {
  @ApiProperty({ minimum: MIN_STOCK_QUANTITY, maximum: MAX_STOCK_QUANTITY })
  @IsInt()
  @Min(MIN_STOCK_QUANTITY)
  @Max(MAX_STOCK_QUANTITY)
  quantity!: number;
}
