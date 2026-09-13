import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';


import { OrganizationAuthorityService } from './organization-authority.service';
import { OrganizationDelegationService } from './organization-delegation.service';
import { OrganizationDelegationController } from './organization-delegation.controller';
import { OrganizationAuthorizationService } from './organization-authorization.service';
import { OrganizationHierarchyController } from './organization-hierarchy.controller';
import { OrganizationHierarchyService } from './organization-hierarchy.service';
import { OrganizationPeopleController } from './organization-people.controller';
import { OrganizationPeopleService } from './organization-people.service';

@Module({
  imports: [AuthModule],

  controllers: [
    OrganizationHierarchyController,
    OrganizationDelegationController,
    OrganizationPeopleController,
  ],

  providers: [
    OrganizationAuthorityService,
    OrganizationAuthorizationService,
    OrganizationDelegationService,
    OrganizationHierarchyService,
    OrganizationPeopleService,
  ],

  exports: [
    OrganizationAuthorityService,
    OrganizationAuthorizationService,
    OrganizationDelegationService,
    OrganizationHierarchyService,
    OrganizationPeopleService,
  ],
})
export class OrganizationModule {}
