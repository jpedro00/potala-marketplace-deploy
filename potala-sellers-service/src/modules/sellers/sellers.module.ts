import { Module } from '@nestjs/common';
import { PublicSellersController } from './public-sellers.controller';
import { SellerOnboardingController } from './seller-onboarding.controller';
import { SellerSettingsController } from './seller-settings.controller';
import { SellersService } from './sellers.service';

@Module({
  controllers: [
    SellerOnboardingController,
    SellerSettingsController,
    PublicSellersController,
  ],
  providers: [SellersService],
})
export class SellersModule {}
