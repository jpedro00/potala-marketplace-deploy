import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { InternalController } from './internal.controller';
import { InternalService } from './internal.service';

@Module({
  imports: [InventoryModule],
  controllers: [InternalController],
  providers: [InternalService],
})
export class InternalModule {}
