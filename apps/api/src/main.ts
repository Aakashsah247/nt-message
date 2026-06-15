import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const port = Number(configService.get<string>('API_PORT') ?? '4000');

  app.setGlobalPrefix('api/v1');

  await app.listen(port);

  console.log(`NT Message API is running at http://localhost:${port}/api/v1`);
}

void bootstrap();
