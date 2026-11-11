import { ReportsDomainClient } from './reports-domain.client';
import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportsDomainClient],
})
export class ReportsModule {}
