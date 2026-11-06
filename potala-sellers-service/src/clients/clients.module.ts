import { Global, Module } from '@nestjs/common';
import { IdentityServiceClient } from './identity-service.client';

/**
 * Global, like PrismaModule: IdentityServiceClient is needed both by the
 * app-wide SessionAuthGuard (APP_GUARD in app.module.ts) and by
 * InternalService — simplest to provide it once at the root instead of
 * re-importing a feature module into two unrelated places.
 */
@Global()
@Module({
  providers: [IdentityServiceClient],
  exports: [IdentityServiceClient],
})
export class ClientsModule {}
