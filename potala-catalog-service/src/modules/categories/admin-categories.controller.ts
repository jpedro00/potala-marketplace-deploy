import { RequirePermission } from '../../common/permissions/require-permission.decorator';
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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/types/identity-enums';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/**
 * New this session, backing the admin "gerenciar categorias" screen — the
 * gap that forced an INSERT direct in Supabase during the "novo produto"
 * test earlier. No extra guard here beyond @Roles(Role.ADMIN): unlike
 * seller/* routes, this service's global SessionAuthGuard + RolesGuard
 * (app.module.ts) already fully gate it — there is no per-tenant context to
 * resolve the way SellerContextGuard resolves sellerId.
 *
 * Flat list only (no parentId) and no DELETE — both explicit scope
 * decisions made with Arthur, not gaps. See CreateCategoryDto/
 * UpdateCategoryDto for the reasoning on each.
 */
@ApiTags('admin-categories')
@Controller('admin/categories')
@Roles(Role.ADMIN)
export class AdminCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @RequirePermission('catalog:category:manage', {mode:'PLATFORM'})
  @Get()
  @ApiOperation({ summary: 'List every category, ACTIVE and INACTIVE' })
  listAll() {
    return this.categoriesService.listAll();
  }

  @RequirePermission('catalog:category:manage', {mode:'PLATFORM'})
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a category (slug auto-derived from name)' })
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @RequirePermission('catalog:category:manage', {mode:'PLATFORM'})
  @Patch(':id')
  @ApiOperation({
    summary:
      'Rename and/or change status of a category (slug regenerates on rename)',
  })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }
}
