import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { RateLimiter } from './common/rate-limit/rate-limiter';
import { rateLimitMiddleware } from './common/rate-limit/rate-limit.middleware';
import { blockInternalPaths } from './proxy/block-internal.middleware';
import { buildProxyRoutes } from './proxy/proxy-routes';
import { createServiceProxy } from './proxy/create-service-proxy';

async function bootstrap(): Promise<void> {
  // bodyParser: false is not optional here. Nest wires its own JSON/urlencoded
  // body parser globally during NestFactory.create(), before any app.use()
  // call in this function runs. If left on, that parser consumes the raw
  // request stream for every JSON request BEFORE http-proxy-middleware ever
  // sees it — the proxy would then forward an empty body to identity-service
  // /sellers-service, silently breaking every POST/PATCH (login, register,
  // approve/reject/suspend...). This gateway has nothing of its own that
  // needs a parsed body (no DTOs, no @Body() anywhere), so parsing is simply
  // turned off and every body is forwarded as an untouched byte stream.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const config = app.get(ConfigService<AppConfig, true>);
  const logger = new Logger('Bootstrap');

  app.set('trust proxy', 1);
  app.enableShutdownHooks();
  app.use(helmet());
  app.useGlobalFilters(new GlobalExceptionFilter());

  app.enableCors({
    origin: config.get('frontendUrl', { infer: true }),
    credentials: true,
  });

  const rateLimit = config.get('rateLimit', { infer: true });
  const limiter = new RateLimiter(rateLimit);
  app.use(rateLimitMiddleware(limiter));
  // Bounds the limiter's memory to roughly two windows' worth of distinct
  // callers instead of growing forever; unref() so this timer never keeps
  // the process alive on its own.
  setInterval(() => limiter.sweep(), rateLimit.windowMs * 2).unref();

  // Must run before any proxy mount below: a request to a /internal/* path
  // is rejected here and never reaches buildProxyRoutes' targets.
  app.use(blockInternalPaths);

  const proxyTimeoutMs = config.get('proxyTimeoutMs', { infer: true });
  const routes = buildProxyRoutes({
    identityServiceUrl: config.get('identityServiceUrl', { infer: true }),
    sellersServiceUrl: config.get('sellersServiceUrl', { infer: true }),
    catalogServiceUrl: config.get('catalogServiceUrl', { infer: true }),
    ordersServiceUrl: config.get('ordersServiceUrl', { infer: true }),
  });
  for (const route of routes) {
    app.use(
      route.mountPath,
      createServiceProxy({
        serviceName: route.serviceName,
        target: route.targetBaseUrl,
        timeoutMs: proxyTimeoutMs,
      }),
    );
    logger.log(`${route.mountPath} -> ${route.targetBaseUrl}`);
  }

  const port = config.get('port', { infer: true });
  await app.listen(port, '0.0.0.0');
  logger.log(`api-gateway listening on 0.0.0.0:${port}`);
}

void bootstrap();
