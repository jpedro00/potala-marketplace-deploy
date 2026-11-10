import { Module } from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import {
  AdminActivitiesController,
  EnrollmentsController,
  InternalActivitiesController,
  PublicActivitiesController,
  SellerActivitiesController,
} from './activities.controller';
@Module({
  controllers: [
    AdminActivitiesController,
    EnrollmentsController,
    InternalActivitiesController,
    PublicActivitiesController,
    SellerActivitiesController,
  ],
  providers: [ActivitiesService],
})
export class ActivitiesModule {}
