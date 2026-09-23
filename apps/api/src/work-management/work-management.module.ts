import { Module } from '@nestjs/common';

import { AttachmentsModule } from '../attachments/attachments.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../database/prisma.module';
import { OrganizationModule } from '../organization/organization.module';
import { DutyManagementController } from './duty-management.controller';
import { DutyAuthorizationService } from './duty-authorization.service';
import { DutyAvailabilityService } from './duty-availability.service';
import { DutyCoverageRequirementsService } from './duty-coverage-requirements.service';
import { DutyNotificationsService } from './duty-notifications.service';
import { DutyScheduleService } from './duty-schedule.service';
import { DutyScopeV3Service } from './duty-scope-v3.service';
import { WorkItemsController } from './work-items.controller';
import { WorkAttachmentRetentionService } from './work-attachment-retention.service';
import { WorkItemsService } from './work-items.service';
import { WorkLifecycleService } from './work-lifecycle.service';
import { WorkReportsController } from './work-reports.controller';
import { WorkReportsService } from './work-reports.service';
import { WorkReportsClassicService } from './work-reports-classic.service';
import { WorkRetentionService } from './work-retention.service';
import { WorkNotificationsService } from './work-notifications.service';
import { WorkScopeService } from './work-scope.service';
import { WorkSalesCommunicationService } from './work-sales-communication.service';
import { WorkSlaService } from './work-sla.service';
import { WorkStatusTransitionService } from './work-status-transition.service';
import { WorkTypeV3Controller } from './work-type-v3.controller';
import { WorkTypeV3Service } from './work-type-v3.service';

@Module({
  imports: [PrismaModule, AuthModule, AttachmentsModule, OrganizationModule],
  controllers: [
    WorkItemsController,
    DutyManagementController,
    WorkReportsController,
    WorkTypeV3Controller,
  ],
  providers: [
    DutyAuthorizationService,
    DutyAvailabilityService,
    DutyCoverageRequirementsService,
    DutyNotificationsService,
    DutyScheduleService,
    DutyScopeV3Service,
    WorkItemsService,
    WorkAttachmentRetentionService,
    WorkLifecycleService,
    WorkNotificationsService,
    WorkReportsService,
    WorkReportsClassicService,
    WorkRetentionService,
    WorkScopeService,
    WorkSalesCommunicationService,
    WorkSlaService,
    WorkStatusTransitionService,
    WorkTypeV3Service,
  ],
  exports: [
    WorkItemsService,
    DutyAuthorizationService,
    DutyAvailabilityService,
    DutyCoverageRequirementsService,
    DutyScheduleService,
    DutyScopeV3Service,
    WorkLifecycleService,
    WorkNotificationsService,
    WorkReportsClassicService,
    WorkRetentionService,
    WorkScopeService,
    WorkSalesCommunicationService,
    WorkSlaService,
    WorkTypeV3Service,
  ],
})
export class WorkManagementModule {}
