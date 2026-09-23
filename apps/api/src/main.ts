import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { MessagingSocketAdapter } from './realtime/messaging-socket.adapter';
import { assertProductionSecurityConfig } from './security/production-security-config';
import { SecretRedactingLogger } from './security/secret-redacting-logger';
import { configureTrustedProxy } from './security/trusted-proxy';
import { ProductionExceptionFilter } from './security/production-exception.filter';
import { requestCorrelationMiddleware } from './security/request-correlation';
import { assertProductionRateLimitTopology } from './security/rate-limit-production-config';

async function bootstrap(): Promise<void> {
  const logger = new SecretRedactingLogger();
  const app = await NestFactory.create(AppModule, { logger });

  const configService = app.get(ConfigService);

  assertProductionSecurityConfig(configService);
  assertProductionRateLimitTopology(configService);

  configureTrustedProxy(app, configService);

  const port = Number(
    configService.get<string>('API_PORT') ??
      configService.get<string>('PORT') ??
      '4000',
  );

  const host = configService.get<string>('API_HOST')?.trim() || '127.0.0.1';

  const webOrigin =
    configService.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173';

  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  // Generate our own correlation id instead of trusting a client-supplied value.
  app.use(requestCorrelationMiddleware);
  app.useGlobalFilters(new ProductionExceptionFilter(logger, isProduction));

  app.useWebSocketAdapter(new MessagingSocketAdapter(app, configService));

  /*
   * Adds secure HTTP response headers.
   *
   * The web app and API run on different origins in development
   * (localhost:5173 -> localhost:4000). Helmet's default
   * Cross-Origin-Resource-Policy is "same-origin", which blocks
   * protected media blob downloads even when the API returns 200 OK.
   */
  app.use(
    helmet({
      // The API does not serve the React document. The web static host owns
      // the browser CSP so its policy can reflect frontend resources without
      // coupling API responses to a document policy.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false,
      frameguard: { action: 'deny' },
      hsts: isProduction
        ? {
            maxAge: 31_536_000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
      noSniff: true,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  /*
   * Allows NestJS to read cookies from requests.
   */
  app.use(cookieParser());

  /*
   * Allows the React frontend to send requests
   * and authentication cookies.
   */
  app.enableCors({
    origin: webOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Range'],
    exposedHeaders: [
      'Accept-Ranges',
      'Content-Disposition',
      'Content-Length',
      'Content-Range',
      'Content-Type',
    ],
  });

  /*
   * Removes unknown request fields and validates DTOs.
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api/v1');

  await app.listen(port, host);

  logger.log(
    `NT Message API is running on ${host}:${port} with prefix /api/v1`,
  );
}

void bootstrap();
