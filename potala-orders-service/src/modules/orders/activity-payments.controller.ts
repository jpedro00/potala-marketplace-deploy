import { Body, Controller, Post } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Role } from '../../common/types/identity-enums';
import { OrdersService } from './orders.service';

export class ActivityPaymentDto {
  @IsUUID('4') enrollmentId!: string;
  @IsOptional() @IsIn(['PIX', 'CARD']) paymentMethod?: 'PIX' | 'CARD';
  @IsOptional() @IsBoolean() analyticsConsent?: boolean;
  @IsOptional() @IsUUID('4') analyticsSessionId?: string;
}
@Controller('me/activity-payments')
@Roles(Role.CUSTOMER, Role.SELLER)
export class ActivityPaymentsController {
  constructor(private readonly orders: OrdersService) {}
  @Post()
  pay(@CurrentUser() user: AuthenticatedUser, @Body() dto: ActivityPaymentDto) { return this.orders.payActivity(user.id, dto); }
}
