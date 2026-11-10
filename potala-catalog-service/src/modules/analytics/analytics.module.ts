import { Module } from '@nestjs/common';
import { AdminAnalyticsController, InternalAnalyticsController, PublicAnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  controllers: [PublicAnalyticsController, AdminAnalyticsController, InternalAnalyticsController],
  providers: [AnalyticsService], exports: [AnalyticsService],
})
export class AnalyticsModule {}
