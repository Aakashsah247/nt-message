import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Controller('health/database')
export class DatabaseController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async checkDatabase() {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    };
  }
}
