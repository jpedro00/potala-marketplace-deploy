import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';
import { RequirePermission } from '../../common/permissions/require-permission.decorator';
import { Role } from '../../common/types/identity-enums';
import { AnalyticsPeriodDto, PurchaseAnalyticsDto, RecordAnalyticsDto, WithdrawAnalyticsDto } from './analytics.dto';
import { AnalyticsService } from './analytics.service';

@Controller('public/analytics')
export class PublicAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Public()
  @Post('events')
  @HttpCode(202)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  record(@Body() dto: RecordAnalyticsDto) { return this.analytics.record(dto); }

  @Public()
  @Post('withdraw')
  @HttpCode(200)
  withdraw(@Body() dto: WithdrawAnalyticsDto) { return this.analytics.withdraw(dto.sessionId); }
}

@Controller('admin/analytics')
@Roles(Role.ADMIN)
export class AdminAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  @RequirePermission('marketing:analytics:read', { mode: 'PLATFORM' })
  summary(@Query() dto: AnalyticsPeriodDto) { return this.analytics.summary(dto); }
}

@Controller('internal/analytics')
@Public()
@UseGuards(InternalApiKeyGuard)
export class InternalAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post('purchases')
  @HttpCode(200)
  purchase(@Body() dto: PurchaseAnalyticsDto) { return this.analytics.purchase(dto); }
}
