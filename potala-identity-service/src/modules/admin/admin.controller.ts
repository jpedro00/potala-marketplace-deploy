import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AdminService } from './admin.service';
import { BlockUserDto } from './dto/block-user.dto';
import { CreateAdminDto } from './dto/create-admin.dto';

/**
 * No explicit @UseGuards here: SessionAuthGuard and RolesGuard are
 * registered globally in app.module.ts and read the @Roles metadata below
 * — same pattern already used by sellers-service's own AdminController.
 * This is also what makes POST /admin/admins safe: it is never @Public(),
 * so only an already-authenticated ADMIN can create another one.
 */
@ApiTags('admin')
@Controller('admin')
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('customers')
  listCustomers(@Query() query: PaginationQueryDto) {
    return this.adminService.listCustomers(query);
  }

  @Patch('customers/:id/block')
  blockCustomer(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: BlockUserDto = {},
  ) {
    return this.adminService.setCustomerStatus(id, 'BLOCKED', body.reason);
  }

  @Patch('customers/:id/unblock')
  unblockCustomer(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: BlockUserDto = {},
  ) {
    return this.adminService.setCustomerStatus(id, 'ACTIVE', body.reason);
  }

  @Get('admins')
  listAdmins(@Query() query: PaginationQueryDto) {
    return this.adminService.listAdmins(query);
  }

  @Post('admins')
  createAdmin(@Body() dto: CreateAdminDto) {
    return this.adminService.createAdmin(dto);
  }
}
