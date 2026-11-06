import { Global, Module } from '@nestjs/common';
import { IdentityServiceClient } from './identity-service.client';
import { SellersServiceClient } from './sellers-service.client';

/**
 * Global, like PrismaModule: both clients are needed by app-wide guards
 * (SessionAuthGuard via APP_GUARD in app.module.ts, SellerContextGuard on
 * the seller/products route group) — simplest to provide them once at the
 * root instead of re-importing a feature module into multiple unrelated
 * places, same reasoning sellers-service uses for its own ClientsModule.
 */
@Global()
@Module({
  providers: [IdentityServiceClient, SellersServiceClient],
  exports: [IdentityServiceClient, SellersServiceClient],
})
export class ClientsModule {}
