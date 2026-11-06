import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  SellerActiveGuard,
  SellerContextGuard,
} from '../../common/guards/seller.guard';
import { Role } from '../../common/types/identity-enums';
import { CategoriesService } from './categories.service';

/**
 * New in this session: exposes CategoriesService.listActive() over HTTP for
 * the first time — the service existed since the initial port but had no
 * controller (same gap the monolith it was ported from also had, see
 * categories.service.ts). Added specifically to unblock the seller "new
 * product" screen, which needs a real categoryId to satisfy
 * CreateProductDto.categoryId.
 *
 * Guarded the same way as /seller/products (seller membership + ACTIVE
 * store), not just plain authentication: the only reason this frontend
 * ever calls this endpoint is to fill the "new product" form, and creating
 * a product itself already requires an ACTIVE store (SellerActiveGuard on
 * SellerProductsController.create) — so gating the category list the same
 * way introduces no new restriction in practice, and keeps this route
 * inside the same trust boundary as the rest of "/seller/products*"
 * instead of opening a second, looser one.
 */
@ApiTags('seller-categories')
@Controller('seller/categories')
@Roles(Role.SELLER)
@UseGuards(SellerContextGuard, SellerActiveGuard)
export class SellerCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({
    summary: 'List active categories, for populating product creation forms',
  })
  async listActive() {
    const categories = await this.categoriesService.listActive();
    return categories.map(({ id, name, slug }) => ({ id, name, slug }));
  }
}
