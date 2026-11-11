import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ContactModule } from './modules/contact/contact.module';
import { InternalReportsModule } from './modules/internal-reports/internal-reports.module';
import { hasApiRoutePrefix } from './common/http/api-route';
import { ExecutionContext, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfig } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { ClientsModule } from './clients/clients.module';
import { SessionAuthGuard } from './common/guards/session.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { OriginGuard } from './common/guards/origin.guard';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { INTERNAL_PATH_SEGMENT } from './common/constants/auth.constants';
import { CategoriesModule } from './modules/categories/categories.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { InternalModule } from './modules/internal/internal.module';
import { ProductsModule } from './modules/products/products.module';
import { HealthModule } from './modules/health/health.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { ContentsModule } from './modules/contents/contents.module';

function requestPath(context: ExecutionContext): string {
  const request = context.switchToHttp().getRequest<{ originalUrl?: string }>();
  return request.originalUrl ?? '';
}

function isInternalHttpPath(context: ExecutionContext): boolean {
  return hasApiRoutePrefix(requestPath(context), INTERNAL_PATH_SEGMENT);
}

/**
 * Two throttler groups now, same pattern as sellers-service: this service
 * gained its own /internal/* routes (modules/internal) when orders-service
 * became a consumer, so server-to-server traffic needs its own, higher
 * limit, split from the public 'default' group by isInternalHttpPath.
 */
@Module({
  imports: [
    AnalyticsModule,
    ContactModule,
    InternalReportsModule,
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const throttle = config.get('throttle', { infer: true });
        return {
          throttlers: [
            {
              name: 'default',
              ttl: throttle.ttlMs,
              limit: throttle.limit,
              skipIf: (context) => isInternalHttpPath(context),
            },
            {
              name: 'internal',
              ttl: throttle.ttlMs,
              limit: throttle.internalLimit,
              skipIf: (context) => !isInternalHttpPath(context),
            },
          ],
        };
      },
    }),
    PrismaModule,
    ClientsModule,
    CategoriesModule,
    InventoryModule,
    InternalModule,
    ProductsModule,
    ContentsModule,
    ActivitiesModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
  ],
})
export class AppModule {}
