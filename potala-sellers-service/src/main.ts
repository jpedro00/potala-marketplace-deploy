import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { API_GLOBAL_PREFIX } from './common/constants/auth.constants';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '8mb' });
  const config = app.get(ConfigService<AppConfig, true>);
  const logger = new Logger('Bootstrap');

  app.set('trust proxy', 1);
  app.setGlobalPrefix(API_GLOBAL_PREFIX);

  // Lets process signals such as SIGTERM/SIGINT trigger the Nest shutdown
  // lifecycle, so PrismaService.onModuleDestroy closes the pool when the
  // platform recycles the container. The lifecycle also runs on an explicit
  // app.close(); what the hooks add is the trigger by signal.
  app.enableShutdownHooks();

  app.use(helmet());
  // Needed even though this service never sets the session cookie: it reads
  // the same cookie identity-service issued, directly off incoming requests
  // (SessionAuthGuard), since there is no api-gateway yet to forward a
  // trusted identity header instead.
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  app.enableCors({
    origin: config.get('frontendUrl', { infer: true }),
    credentials: true,
  });

  if (config.get('swaggerEnabled', { infer: true })) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Marketplace Potala — sellers-service')
        .setDescription(
          'Lojas, onboarding e revisão administrativa. Autenticação via o mesmo cookie HttpOnly emitido por identity-service, validado por chamada interna (ainda sem api-gateway). Prefixo global /api/v1. Rotas /internal/* exigem x-internal-api-key e são para uso serviço-a-serviço apenas.',
        )
        .setVersion('0.1.0')
        .addServer('/', 'Current host')
        .build(),
    );
    SwaggerModule.setup(`${API_GLOBAL_PREFIX}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: false },
    });
    logger.log(`Swagger available at /${API_GLOBAL_PREFIX}/docs`);
  }

  const port = config.get('port', { infer: true });
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  logger.log(`sellers-service listening on ${host}:${port}`);
}

void bootstrap();
