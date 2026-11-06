import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductsService } from './products.service';
import { AdminProductsController } from './admin-products.controller';
import { SellerProductsController } from './seller-products.controller';
import { PublicProductsController } from './public-products.controller';

/**
 * Imports InventoryModule so ProductsService can call InventoryService
 * (used by updateVariantStockForSeller, the seller stock-edit endpoint) —
 * ProductsModule already owned the seller-facing trust boundary (sellerId
 * scoping) for everything else under /seller/products, so the stock edit
 * lives here too rather than as a new controller inside InventoryModule.
 */
@Module({
  imports: [InventoryModule],
  controllers: [
    AdminProductsController,
    SellerProductsController,
    PublicProductsController,
  ],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
