import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { MessagingSocketAdapter } from './realtime/messaging-socket.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  const port = Number(configService.get<string>('API_PORT') ?? '4000');

  const webOrigin =
    configService.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173';

  app.useWebSocketAdapter(
    new MessagingSocketAdapter(app, configService),
  );

  /*
   * Adds secure HTTP response headers.
   */
  app.use(helmet());

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
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
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

  await app.listen(port, '127.0.0.1');

  console.log(`NT Message API is running at http://localhost:${port}/api/v1`);
}

void bootstrap();
