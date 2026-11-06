import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CustomersService } from './customers.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('customers')
@Controller('customers')
@Roles(Role.CUSTOMER)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Return the authenticated customer profile' })
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.customersService.getOwnProfile(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: "Update the authenticated customer's display name/phone" })
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.customersService.updateOwnProfile(user.id, dto);
  }

  @Post('me/addresses')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a new address for the authenticated customer' })
  createAddress(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAddressDto) {
    return this.customersService.createAddress(user.id, dto);
  }

  @Patch('me/addresses/:id')
  @ApiOperation({ summary: "Update one of the authenticated customer's addresses" })
  updateAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.customersService.updateAddress(user.id, id, dto);
  }

  @Delete('me/addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove one of the authenticated customer's addresses" })
  removeAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.customersService.deleteAddress(user.id, id);
  }

  @Patch('me/addresses/:id/default')
  @ApiOperation({ summary: 'Set one address as the default for the authenticated customer' })
  setDefaultAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.customersService.setDefaultAddress(user.id, id);
  }
}
