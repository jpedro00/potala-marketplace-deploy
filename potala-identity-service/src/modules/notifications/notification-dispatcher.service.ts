import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDispatcher.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private readonly notifications: NotificationsService) {}

  onModuleInit() {
    if (process.env.NOTIFICATION_DISPATCH_ENABLED !== 'true') return;
    if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
      this.logger.warn(
        'Notification dispatch disabled: transport is not configured',
      );
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, 10000);
    this.timer.unref();
    this.logger.log('Brevo notification worker enabled; interval=10s');
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.notifications.dispatch();
    } catch {
      this.logger.warn(
        'Notification dispatch unavailable; queued messages retained',
      );
    } finally {
      this.running = false;
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
