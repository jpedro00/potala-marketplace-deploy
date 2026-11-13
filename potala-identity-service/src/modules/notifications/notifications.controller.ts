import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { NotificationsService } from './notifications.service';
import {
  notificationTemplates,
  NotificationTemplate,
} from './notification-templates';

class EnqueueDto {
  @IsUUID() userId!: string;
  @IsIn(
    Object.keys(notificationTemplates).filter(
      (v) => !['PASSWORD_RESET', 'EMAIL_CONFIRMATION'].includes(v),
    ),
  )
  template!: NotificationTemplate;
  @IsString() @MinLength(8) @MaxLength(180) idempotencyKey!: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Get() inbox(@CurrentUser() user: AuthenticatedUser) {
    return this.service.inbox(user.id);
  }
  @Patch(':id/read') read(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.read(user.id, id);
  }
}

@Public()
@UseGuards(InternalApiKeyGuard)
@Controller('internal/notifications')
export class InternalNotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Post() enqueue(@Body() dto: EnqueueDto) {
    return this.service.enqueue(dto.userId, dto.template, dto.idempotencyKey);
  }
  @Post('dispatch') dispatch() {
    return this.service.dispatch();
  }
}
