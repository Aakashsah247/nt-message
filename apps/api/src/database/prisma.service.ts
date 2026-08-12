import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');

    const adapter = new PrismaPg({
      connectionString,
    });

    super({
      adapter,
    });
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async connectWithRetry(maxAttempts = 5, delayMs = 2000): Promise<void> {
    let attempt = 0;
    while (attempt < maxAttempts) {
      try {
        await this.$connect();
        return;
      } catch (error) {
        attempt += 1;
        if (attempt >= maxAttempts) {
          throw new Error(
            `Prisma failed to connect to the database after ${maxAttempts} attempts. ` +
              `Please verify DATABASE_URL is correct and the PostgreSQL server is running on localhost:5433.
` +
              `Original error: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        await this.delay(delayMs);
      }
    }
  }

  async onModuleInit(): Promise<void> {
    await this.connectWithRetry();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
