import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentSeller } from '../../common/decorators/current-seller.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  SellerActiveGuard,
  SellerContextGuard,
} from '../../common/guards/seller.guard';
import { Role } from '../../common/types/identity-enums';
import { SellerContext } from '../../common/types/authenticated-user';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductStatusDto } from './dto/update-product.dto';
import { UpdateVariantStockDto } from './dto/update-variant-stock.dto';
import { ProductsService } from './products.service';

/**
 * Ported from the monolith's modules/products/seller-products.controller.ts.
 * SellerContextGuard/SellerActiveGuard resolve sellerId over the network now
 * (via sellers-service) instead of a local table — everything downstream of
 * @CurrentSeller() is unchanged.
 */
@ApiTags('seller-products')
@Controller('seller/products')
@Roles(Role.SELLER)
@UseGuards(SellerContextGuard, SellerActiveGuard)
export class SellerProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({
    summary: 'List products of the authenticated store (ACTIVE sellers only)',
  })
  list(
    @CurrentSeller() seller: SellerContext,
    @Query() query: PaginationQueryDto,
  ) {
    return this.productsService.listForSeller(seller.sellerId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create a product with variants and inventory (ACTIVE sellers only)',
  })
  create(
    @CurrentSeller() seller: SellerContext,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.createForSeller(seller.sellerId, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a product belonging to the authenticated store',
  })
  getOne(
    @CurrentSeller() seller: SellerContext,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.productsService.getForSeller(seller.sellerId, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Publish or unpublish a product of the authenticated store',
  })
  updateStatus(
    @CurrentSeller() seller: SellerContext,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateProductStatusDto,
  ) {
    return this.productsService.updateStatusForSeller(
      seller.sellerId,
      id,
      dto.status,
    );
  }

  @Patch(':productId/variants/:variantId/stock')
  @ApiOperation({
    summary:
      'Set a variant\'s total on-hand stock (manual seller adjustment, not a checkout reservation)',
  })
  updateVariantStock(
    @CurrentSeller() seller: SellerContext,
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @Param('variantId', new ParseUUIDPipe({ version: '4' })) variantId: string,
    @Body() dto: UpdateVariantStockDto,
  ) {
    return this.productsService.updateVariantStockForSeller(
      seller.sellerId,
      productId,
      variantId,
      dto.quantity,
    );
  }
}
