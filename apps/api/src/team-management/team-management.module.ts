import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../database/prisma.module';
import { OrganizationModule } from '../organization/organization.module';
import { TeamManagementController } from './team-management.controller';
import { TeamManagementService } from './team-management.service';

@Module({
  imports: [PrismaModule, AuthModule, OrganizationModule],
  controllers: [TeamManagementController],
  providers: [TeamManagementService],
  exports: [TeamManagementService],
})
export class TeamManagementModule {}
