import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { LegacyOrganizationCompatibilityService } from './legacy-organization-compatibility.service';

import { OrganizationAuthorityService } from './organization-authority.service';
import { OrganizationDelegationService } from './organization-delegation.service';
import { OrganizationDelegationController } from './organization-delegation.controller';
import { OrganizationAuthorizationService } from './organization-authorization.service';
import { OrganizationController } from './organization.controller';
import { OrganizationHierarchyController } from './organization-hierarchy.controller';
import { OrganizationHierarchyService } from './organization-hierarchy.service';
import { OrganizationPeopleController } from './organization-people.controller';
import { OrganizationPeopleService } from './organization-people.service';
import { OrganizationService } from './organization.service';
import { PublicOrganizationController } from './public-organization.controller';

@Module({
  imports: [AuthModule],

  controllers: [
    OrganizationController,
    OrganizationHierarchyController,
    OrganizationDelegationController,
    OrganizationPeopleController,
    PublicOrganizationController,
  ],

  providers: [
    OrganizationService,
    LegacyOrganizationCompatibilityService,
    OrganizationAuthorityService,
    OrganizationAuthorizationService,
    OrganizationDelegationService,
    OrganizationHierarchyService,
    OrganizationPeopleService,
  ],

  exports: [
    OrganizationService,
    LegacyOrganizationCompatibilityService,
    OrganizationAuthorityService,
    OrganizationAuthorizationService,
    OrganizationDelegationService,
    OrganizationHierarchyService,
    OrganizationPeopleService,
  ],
})
export class OrganizationModule {}
