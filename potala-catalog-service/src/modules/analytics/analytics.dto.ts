import { Equals, IsDateString, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const CLIENT_ANALYTICS_EVENTS = [
  'page_view', 'view_item', 'add_to_cart', 'begin_checkout', 'sign_up',
  'seller_application', 'contact_click', 'view_activity', 'enroll', 'download',
] as const;

export class RecordAnalyticsDto {
  @IsUUID('4')
  id!: string;

  @IsUUID('4')
  sessionId!: string;

  @Equals(true)
  consent!: true;

  @IsIn(CLIENT_ANALYTICS_EVENTS)
  event!: typeof CLIENT_ANALYTICS_EVENTS[number];

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  activityId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  quantity?: number;
}

export class PurchaseAnalyticsDto {
  @IsUUID()
  orderId!: string;

  @IsUUID('4')
  sessionId!: string;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  valueCents!: number;
}

export class WithdrawAnalyticsDto {
  @IsUUID('4')
  sessionId!: string;
}

export class AnalyticsPeriodDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
