import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentSeller } from '../../common/decorators/current-seller.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/types/identity-enums';
import {
  AuthenticatedUser,
  SellerContext,
} from '../../common/types/authenticated-user';
import {
  SellerActiveGuard,
  SellerContextGuard,
} from '../../common/guards/seller.guard';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';
import { RequirePermission } from '../../common/permissions/require-permission.decorator';
import { ActivitiesService } from './activities.service';
import {
  ActivitiesQueryDto,
  ActivityDetailsDto,
  ActivityPaymentDto,
  ActivityStatusDto,
  MaterialDto,
  SaveActivityDto,
} from './activities.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
const uuid = new ParseUUIDPipe({ version: '4' });
@Controller('activities')
export class PublicActivitiesController {
  constructor(private readonly service: ActivitiesService) {}
  @Public() @Get() list(@Query() q: ActivitiesQueryDto) {
    return this.service.list(q.kind, undefined, false, q);
  }
  @Public() @Get(':id') get(@Param('id', uuid) id: string) {
    return this.service.get(id);
  }
  @Post(':id/enroll') enroll(
    @Param('id', uuid) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.enroll(id, user.id);
  }
}
@Controller('me/enrollments')
export class EnrollmentsController {
  constructor(private readonly service: ActivitiesService) {}
  @Get() @Header('Cache-Control', 'private, no-store') list(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: PaginationQueryDto,
  ) {
    return this.service.mine(u.id, q);
  }
  @Post(':id/cancel') cancel(
    @Param('id', uuid) id: string,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.cancel(id, u.id);
  }
  @Get(':id/materials') materials(
    @Param('id', uuid) id: string,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.materials(id, u.id);
  }
  @Get(':id/materials/:materialId/download') async download(
    @Param('id', uuid) id: string,
    @Param('materialId', uuid) materialId: string,
    @CurrentUser() u: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const m = await this.service.download(id, materialId, u.id);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${m.filename}"`,
    );
    res
      .type(m.mimeType)
      .send(m.data ? Buffer.from(m.data) : Buffer.from(m.content, 'utf8'));
  }
}
@Roles(Role.SELLER)
@UseGuards(SellerContextGuard, SellerActiveGuard)
@Controller('seller/activities')
export class SellerActivitiesController {
  constructor(private readonly service: ActivitiesService) {}
  @Patch(':id/details')
  @Header('Cache-Control', 'private, no-store')
  details(
    @Param('id', uuid) id: string,
    @Body() dto: ActivityDetailsDto,
    @CurrentSeller() s: SellerContext,
  ) {
    return this.service.updateDetails(id, dto, s.sellerId);
  }
  @Get() @Header('Cache-Control', 'private, no-store') list(
    @CurrentSeller() s: SellerContext,
    @Query() q: PaginationQueryDto,
  ) {
    return this.service.list(undefined, s.sellerId, false, q);
  }
  @Post() create(
    @Body() dto: SaveActivityDto,
    @CurrentSeller() s: SellerContext,
  ) {
    return this.service.create(dto, s.sellerId);
  }
  @Put(':id') update(
    @Param('id', uuid) id: string,
    @Body() dto: SaveActivityDto,
    @CurrentSeller() s: SellerContext,
  ) {
    return this.service.update(id, dto, s.sellerId);
  }
  @Get(':id/enrollments') participants(
    @Param('id', uuid) id: string,
    @CurrentSeller() s: SellerContext,
    @Query() q: PaginationQueryDto,
  ) {
    return this.service.participants(id, s.sellerId, q);
  }
  @Post(':id/enrollments/:enrollmentId/revoke') revoke(
    @Param('id', uuid) id: string,
    @Param('enrollmentId', uuid) enrollmentId: string,
    @CurrentSeller() s: SellerContext,
  ) {
    return this.service.revoke(id, enrollmentId, s.sellerId);
  }
  @Patch(':id') status(
    @Param('id', uuid) id: string,
    @Body() dto: ActivityStatusDto,
    @CurrentSeller() s: SellerContext,
  ) {
    return this.service.setStatus(id, dto.status, s.sellerId);
  }
  @Post(':id/materials') material(
    @Param('id', uuid) id: string,
    @Body() dto: MaterialDto,
    @CurrentSeller() s: SellerContext,
  ) {
    return this.service.addMaterial(id, dto, s.sellerId);
  }
}
@Roles(Role.ADMIN)
@Controller('admin/activities')
export class AdminActivitiesController {
  constructor(private readonly service: ActivitiesService) {}
  @RequirePermission('catalog:activity:manage', { mode: 'PLATFORM' })
  @Patch(':id/details')
  @Header('Cache-Control', 'private, no-store')
  details(@Param('id', uuid) id: string, @Body() dto: ActivityDetailsDto) {
    return this.service.updateDetails(id, dto);
  }
  @RequirePermission('catalog:activity:read', { mode: 'PLATFORM' })
  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@Query() q: PaginationQueryDto) {
    return this.service.list(undefined, undefined, true, q);
  }
  @RequirePermission('catalog:activity:manage', { mode: 'PLATFORM' })
  @Post()
  create(@Body() dto: SaveActivityDto) {
    return this.service.create(dto);
  }
  @RequirePermission('catalog:activity:manage', { mode: 'PLATFORM' })
  @Put(':id')
  update(@Param('id', uuid) id: string, @Body() dto: SaveActivityDto) {
    return this.service.update(id, dto);
  }
  @RequirePermission('catalog:enrollment:read', { mode: 'PLATFORM' })
  @Get(':id/enrollments')
  participants(@Param('id', uuid) id: string, @Query() q: PaginationQueryDto) {
    return this.service.participants(id, undefined, q);
  }
  @RequirePermission('catalog:enrollment:manage', { mode: 'PLATFORM' })
  @Post(':id/enrollments/:enrollmentId/revoke')
  revoke(
    @Param('id', uuid) id: string,
    @Param('enrollmentId', uuid) enrollmentId: string,
  ) {
    return this.service.revoke(id, enrollmentId);
  }
  @RequirePermission('catalog:activity:manage', { mode: 'PLATFORM' })
  @Patch(':id')
  status(@Param('id', uuid) id: string, @Body() dto: ActivityStatusDto) {
    return this.service.setStatus(id, dto.status);
  }
  @RequirePermission('catalog:activity:manage', { mode: 'PLATFORM' })
  @Post(':id/materials')
  material(@Param('id', uuid) id: string, @Body() dto: MaterialDto) {
    return this.service.addMaterial(id, dto);
  }
}
@Public()
@UseGuards(InternalApiKeyGuard)
@Controller('internal/activities/enrollments')
export class InternalActivitiesController {
  constructor(private readonly service: ActivitiesService) {}
  @Get(':id') snapshot(@Param('id', uuid) id: string) {
    return this.service.snapshot(id);
  }
  @Post(':id/payment') payment(
    @Param('id', uuid) id: string,
    @Body() dto: ActivityPaymentDto,
  ) {
    return this.service.payment(id, dto);
  }
}
