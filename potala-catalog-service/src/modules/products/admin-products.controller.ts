import { RequirePermission } from '../../common/permissions/require-permission.decorator';
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Role } from '../../common/types/identity-enums';
import { ProductsService } from './products.service';

/**
 * "Todos os produtos" (admin) -- pedido de Arthur ("pode seguir com
 * esse"), ver status-migracao-microservicos.md. No extra guard beyond
 * @Roles(Role.ADMIN), mesmo raciocínio de AdminCategoriesController: o
 * global SessionAuthGuard + RolesGuard (app.module.ts) já bastam -- não há
 * tenant/sellerId pra resolver aqui, é o oposto (cross-tenant de
 * propósito).
 *
 * Cursor-paginado, sem busca/filtro server-side -- mesmo padrão
 * minimalista já usado por AdminCustomersController/AdminOrdersController
 * (só limit/cursor, ver PaginationQueryDto). Sem GET /:id nem tela de
 * detalhe: a antiga ProductDetailView.tsx (frontend) era 100% mock --
 * moderationNote, timeline e attributes não existem no schema Product --
 * e foi cortada, mesma decisão de escopo já tomada com
 * SellersView/CustomersView reais (nenhuma das duas linka pra detalhe por
 * falta de GET .../:id de verdade).
 *
 * Ativar/desativar reaproveita a mesma restrição de
 * UpdateProductStatusDto (só ACTIVE/INACTIVE) -- ver o comentário daquele
 * DTO e de ProductsService.setStatusForAdmin: REVIEW/REJECTED continuam de
 * fora, moderação de verdade (fluxo de aprovação) não existe nesta v1.
 */
@ApiTags('admin-products')
@Controller('admin/products')
@Roles(Role.ADMIN)
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @RequirePermission('catalog:product:read', {mode:'COLLECTION'})
  @Get()
  @ApiOperation({ summary: 'List every product, any seller, any status' })
  list(@Query() query: PaginationQueryDto) {
    return this.productsService.listForAdmin(query);
  }

  @RequirePermission('catalog:product:update', {mode:'SELLER_OWNED'})
  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate a product belonging to any store' })
  activate(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.productsService.setStatusForAdmin(id, ProductStatus.ACTIVE);
  }

  @RequirePermission('catalog:product:update', {mode:'SELLER_OWNED'})
  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate a product belonging to any store' })
  deactivate(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.productsService.setStatusForAdmin(id, ProductStatus.INACTIVE);
  }
}
