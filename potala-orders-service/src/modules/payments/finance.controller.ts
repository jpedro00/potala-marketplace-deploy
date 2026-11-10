import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { FinanceService } from './finance.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/types/identity-enums';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { RequirePermission } from '../../common/permissions/require-permission.decorator';

export class CreateFinancialPolicyDto {
  @IsIn(['PLATFORM', 'SELLER', 'CATEGORY', 'PRODUCT']) scope!: string;
  @IsOptional() @IsUUID('4') scopeId?: string;
  @IsInt() @Min(0) @Max(10000) commissionBps!: number;
  @IsInt() @Min(0) @Max(10000) gatewayFeeBps!: number;
  @IsInt() @Min(0) @Max(2147483647) fixedFeeCents!: number;
}
export class PrepareRefundDto {
  @IsInt() @Min(1) @Max(2147483647) amountCents!: number;
  @IsString() @Matches(/^[A-Za-z0-9_-]{16,128}$/) idempotencyKey!: string;
}

@Controller('admin/finance')
@Roles(Role.ADMIN)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}
  @Get('policies')
  @RequirePermission('finance:commission:read', {mode: 'PLATFORM'})
  list() { return this.finance.listPolicies(); }
  @Post('policies')
  @RequirePermission('finance:commission:manage', {mode: 'PLATFORM'})
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFinancialPolicyDto) { return this.finance.createPolicy(user.id, dto); }
  @Post('payments/:id/refund-preparations')
  @RequirePermission('finance:refund:execute', {mode: 'PLATFORM'})
  refund(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({version: '4'})) id: string, @Body() dto: PrepareRefundDto) { return this.finance.prepareRefund(user.id, id, dto.amountCents, dto.idempotencyKey); }
}
