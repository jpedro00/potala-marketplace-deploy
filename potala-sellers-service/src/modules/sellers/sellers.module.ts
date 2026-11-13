import { Module } from '@nestjs/common';
import { PublicSellersController } from './public-sellers.controller';
import { SellerOnboardingController } from './seller-onboarding.controller';
import { SellerSettingsController } from './seller-settings.controller';
import { SellersService } from './sellers.service';
import { DeliverySettingsController, DeliverySettingsService, InternalDeliverySettingsController } from './delivery-settings.controller';

@Module({
  controllers: [
    DeliverySettingsController, InternalDeliverySettingsController,
    SellerOnboardingController,
    SellerSettingsController,
    PublicSellersController,
  ],
  providers: [SellersService, DeliverySettingsService],
})
export class SellersModule {}
