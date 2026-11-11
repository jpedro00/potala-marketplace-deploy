import { hasApiRoutePrefix } from './common/http/api-route';
import { ExecutionContext, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfig } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { SessionAuthGuard } from './common/guards/session.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { OriginGuard } from './common/guards/origin.guard';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import {
  AUTH_PATH_SEGMENT,
  INTERNAL_PATH_SEGMENT,
} from './common/constants/auth.constants';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CustomersModule } from './modules/customers/customers.module';
import { InternalModule } from './modules/internal/internal.module';
import { HealthModule } from './modules/health/health.module';
import { AdminModule } from './modules/admin/admin.module';
import { InternalReportsModule } from './modules/internal-reports/internal-reports.module';

function requestPath(context: ExecutionContext): string {
  const request = context.switchToHttp().getRequest<{ originalUrl?: string }>();
  return request.originalUrl ?? '';
}

function isAuthHttpPath(context: ExecutionContext): boolean {
  return hasApiRoutePrefix(requestPath(context), AUTH_PATH_SEGMENT);
}

function isInternalHttpPath(context: ExecutionContext): boolean {
  return hasApiRoutePrefix(requestPath(context), INTERNAL_PATH_SEGMENT);
}

@Module({
  imports: [
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
              skipIf: (context) =>
                isAuthHttpPath(context) || isInternalHttpPath(context),
            },
            {
              name: 'auth',
              ttl: throttle.ttlMs,
              limit: throttle.authLimit,
              skipIf: (context) => !isAuthHttpPath(context),
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
    AuthModule,
    UsersModule,
    CustomersModule,
    InternalModule,
    HealthModule,
    AdminModule,
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
