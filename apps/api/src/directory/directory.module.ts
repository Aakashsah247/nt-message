import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../database/prisma.module';

import { DirectoryController } from './directory.controller';
import { DirectoryService } from './directory.service';

@Module({
  imports: [PrismaModule, AuthModule],

  controllers: [DirectoryController],

  providers: [DirectoryService],
})
export class DirectoryModule {}
