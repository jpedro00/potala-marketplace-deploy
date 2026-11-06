import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './modules/health/health.module';

/**
 * Deliberately minimal: this gateway has no database and, aside from
 * /health, no business logic of its own — everything else is proxied at the
 * raw Express layer in main.ts (see proxy/), below where Nest modules and
 * guards would even see the request. There is no PrismaModule, no
 * ThrottlerModule (see common/rate-limit/ for why), no Swagger (nothing here
 * to document — aggregating the downstream services' own OpenAPI docs behind
 * one gateway is a possible future addition, not needed for v1).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      validate: validateEnv,
    }),
    HealthModule,
  ],
})
export class AppModule {}
