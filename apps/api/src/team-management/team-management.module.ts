import { Module } from '@nestjs/common';

import { PrismaModule } from '../database/prisma.module';
import { TeamManagementController } from './team-management.controller';
import { TeamManagementService } from './team-management.service';

@Module({
  imports: [PrismaModule],
  controllers: [TeamManagementController],
  providers: [TeamManagementService],
})
export class TeamManagementModule {}
