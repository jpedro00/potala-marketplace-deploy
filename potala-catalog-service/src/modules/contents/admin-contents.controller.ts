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
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/types/identity-enums';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ContentsService } from './contents.service';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { RejectContentDto } from './dto/reject-content.dto';

/**
 * Backs um domínio inteiro novo -- v1 mínimo escolhido pelo Arthur (28/09):
 * só cadastro e moderação pelo admin (ver comentário do model Content em
 * schema.prisma). Sem guard extra além de @Roles(Role.ADMIN), mesmo padrão
 * de AdminCategoriesController -- guards globais já bastam, não há tenant
 * pra resolver aqui.
 */
@ApiTags('admin-contents')
@Controller('admin/contents')
@Roles(Role.ADMIN)
export class AdminContentsController {
  constructor(private readonly contentsService: ContentsService) {}

  @RequirePermission('catalog:content:read', {mode:'PLATFORM'})
  @Get()
  @ApiOperation({ summary: 'Lists every content record, newest first.' })
  list(@Query() query: PaginationQueryDto) {
    return this.contentsService.listForAdmin(query);
  }

  @RequirePermission('catalog:content:manage', {mode:'PLATFORM'})
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Creates a content record (always born DRAFT).' })
  create(@Body() dto: CreateContentDto) {
    return this.contentsService.create(dto);
  }

  @RequirePermission('catalog:content:manage', {mode:'PLATFORM'})
  @Patch(':id')
  @ApiOperation({ summary: 'Updates the editable fields of a content record.' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateContentDto,
  ) {
    return this.contentsService.update(id, dto);
  }

  @RequirePermission('catalog:content:manage', {mode:'PLATFORM'})
  @Patch(':id/submit-for-review')
  @ApiOperation({ summary: 'DRAFT -> REVIEW.' })
  submitForReview(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.contentsService.submitForReview(id);
  }

  @RequirePermission('catalog:content:manage', {mode:'PLATFORM'})
  @Patch(':id/approve')
  @ApiOperation({ summary: 'REVIEW -> PUBLISHED.' })
  approve(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.contentsService.approve(id);
  }

  @RequirePermission('catalog:content:manage', {mode:'PLATFORM'})
  @Patch(':id/reject')
  @ApiOperation({
    summary: 'REVIEW -> REJECTED, with an optional moderation note.',
  })
  reject(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RejectContentDto,
  ) {
    return this.contentsService.reject(id, dto);
  }

  @RequirePermission('catalog:content:manage', {mode:'PLATFORM'})
  @Patch(':id/archive')
  @ApiOperation({ summary: 'PUBLISHED -> ARCHIVED.' })
  archive(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.contentsService.archive(id);
  }
}
