import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { SellersServiceClient } from '../../clients/sellers-service.client';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, SessionService, SellersServiceClient],
  exports: [AuthService, PasswordService, SessionService],
})
export class AuthModule {}
