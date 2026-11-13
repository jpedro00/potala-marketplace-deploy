import { Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { RecoveryController } from './recovery.controller';
@Module({
  imports: [AuthModule],
  controllers: [RecoveryController],
})
export class RecoveryModule {}
