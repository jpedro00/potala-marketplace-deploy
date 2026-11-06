import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SellerStatus } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/types/identity-enums';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AdminService } from './admin.service';
import { ReviewSellerDto } from './dto/review-seller.dto';

/**
 * Ported from the monolith's modules/admin/admin.controller.ts, `Seller`-only
 * slice. No explicit @UseGuards here: SessionAuthGuard and RolesGuard are
 * registered globally in app.module.ts and read the @Roles metadata below,
 * same as the origin monolith relied on its own global guards.
 */
@ApiTags('admin')
@Controller('admin')
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('sellers')
  listSellers(@Query() query: PaginationQueryDto) {
    return this.adminService.listSellers(query);
  }

  @Patch('sellers/:id/approve')
  approveSeller(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: ReviewSellerDto = {},
  ) {
    return this.adminService.updateSellerStatus(
      user.id,
      id,
      SellerStatus.ACTIVE,
      body.reason,
    );
  }

  @Patch('sellers/:id/reject')
  rejectSeller(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: ReviewSellerDto = {},
  ) {
    return this.adminService.updateSellerStatus(
      user.id,
      id,
      SellerStatus.REJECTED,
      body.reason,
    );
  }

  @Patch('sellers/:id/suspend')
  suspendSeller(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: ReviewSellerDto = {},
  ) {
    return this.adminService.updateSellerStatus(
      user.id,
      id,
      SellerStatus.SUSPENDED,
      body.reason,
    );
  }
}
