import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { PublicOrganizationController } from './public-organization.controller';

@Module({
  imports: [AuthModule],

  controllers: [OrganizationController, PublicOrganizationController],

  providers: [OrganizationService],

  exports: [OrganizationService],
})
export class OrganizationModule {}
