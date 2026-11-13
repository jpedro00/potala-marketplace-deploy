import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { RecoveryService } from './recovery.service';

class RequestActionDto {
  @IsEmail() @MaxLength(255) email!: string;
  @IsOptional() @IsString() @MaxLength(300) callbackOrigin?: string;
}
class ConfirmActionDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) token!: string;
}
class ResetActionDto extends ConfirmActionDto {
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
}
@Public()
@Controller('auth')
export class RecoveryController {
  constructor(private readonly service: RecoveryService) {}
  @Post('password/forgot') @HttpCode(200) forgot(
    @Body() dto: RequestActionDto,
  ) {
    return this.service.request(
      dto.email,
      'PASSWORD_RESET',
      dto.callbackOrigin,
    );
  }
  @Post('password/reset') @HttpCode(200) reset(@Body() dto: ResetActionDto) {
    return this.service.consume(dto.token, 'PASSWORD_RESET', dto.password);
  }
  @Post('email/request') @HttpCode(200) requestEmail(
    @Body() dto: RequestActionDto,
  ) {
    return this.service.request(
      dto.email,
      'EMAIL_CONFIRMATION',
      dto.callbackOrigin,
    );
  }
  @Post('email/confirm') @HttpCode(200) confirm(@Body() dto: ConfirmActionDto) {
    return this.service.consume(dto.token, 'EMAIL_CONFIRMATION');
  }
}
