import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import {
  NotificationsController,
  InternalNotificationsController,
} from './notifications.controller';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';
import { NotificationDispatcher } from './notification-dispatcher.service';

@Module({
  controllers: [NotificationsController, InternalNotificationsController],
  providers: [
    NotificationsService,
    InternalApiKeyGuard,
    NotificationDispatcher,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
