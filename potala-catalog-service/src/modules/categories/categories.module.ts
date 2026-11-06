import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { SellerCategoriesController } from './seller-categories.controller';
import { AdminCategoriesController } from './admin-categories.controller';
import { PublicCategoriesController } from './public-categories.controller';

@Module({
  controllers: [
    SellerCategoriesController,
    AdminCategoriesController,
    PublicCategoriesController,
  ],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
