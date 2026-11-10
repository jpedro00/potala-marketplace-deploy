import {
  IsOptional,
  IsString,
  IsISO8601,
  IsUUID,
  IsIn,
  MaxLength,
} from 'class-validator';
import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  SetMetadata,
} from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/types/identity-enums';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { RequirePermission } from '../../common/permissions/require-permission.decorator';
import { ReportsService } from './reports.service';
class ReportQueryDto {
  @IsOptional() @IsIn(['csv', 'xlsx']) format?: string;
  @IsOptional() @IsUUID() sellerId?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsString() @MaxLength(50) status?: string;
}
@Controller('admin/reports')
@Roles(Role.ADMIN)
@RequirePermission('reports:operational:export', { mode: 'COLLECTION' })
@SetMetadata('verifiedScopeFilter', true)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get() list() {
    return this.reports.list();
  }
  @Get(':view/export') async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('view') view: string,
    @Query() query: ReportQueryDto,
    @Res() response: Response,
  ) {
    const format = query.format ?? 'csv';
    const body = await this.reports.export(user, view, query, format);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader(
      'Content-Type',
      format === 'csv'
        ? 'text/csv; charset=utf-8'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${view}.${format}"`,
    );
    response.send(body);
  }
}
