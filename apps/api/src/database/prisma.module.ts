import { Global, Module } from '@nestjs/common';
import { DatabaseController } from './database.controller';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  controllers: [DatabaseController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
