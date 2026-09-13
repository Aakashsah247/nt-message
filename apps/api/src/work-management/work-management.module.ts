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
import { WorkLifecycleService } from './work-lifecycle.service';
import { WorkReportsController } from './work-reports.controller';
import { WorkReportsService } from './work-reports.service';
import { WorkReportsV3Service } from './work-reports-v3.service';
import { WorkRuntimeV3Controller } from './work-runtime-v3.controller';
import { WorkRuntimeV3CollaborationService } from './work-runtime-v3-collaboration.service';
import { WorkRuntimeV3EscalationService } from './work-runtime-v3-escalation.service';
import { WorkRuntimeV3NotificationsService } from './work-runtime-v3-notifications.service';
import { WorkRuntimeV3StageService } from './work-runtime-v3-stage.service';
import { WorkRuntimeV3SlaService } from './work-runtime-v3-sla.service';
import { WorkRuntimeV3Service } from './work-runtime-v3.service';
import { WorkRetentionService } from './work-retention.service';
import { WorkNotificationsService } from './work-notifications.service';
import { WorkScopeService } from './work-scope.service';
import { WorkSalesCommunicationService } from './work-sales-communication.service';
import { WorkStatusTransitionService } from './work-status-transition.service';
import { WorkTypeV3Controller } from './work-type-v3.controller';
import { WorkTypeV3Service } from './work-type-v3.service';

@Module({
  imports: [PrismaModule, AuthModule, AttachmentsModule, OrganizationModule],
  controllers: [
    WorkItemsController,
    DutyManagementController,
    WorkReportsController,
    WorkRuntimeV3Controller,
    WorkTypeV3Controller,
  ],
  providers: [
    DutyAuthorizationService,
    DutyAvailabilityService,
    DutyCoverageRequirementsService,
    DutyNotificationsService,
    DutyScheduleService,
    DutyScopeV3Service,
    WorkLifecycleService,
    WorkNotificationsService,
    WorkReportsService,
    WorkReportsV3Service,
    WorkRetentionService,
    WorkRuntimeV3Service,
    WorkRuntimeV3CollaborationService,
    WorkRuntimeV3EscalationService,
    WorkRuntimeV3NotificationsService,
    WorkRuntimeV3StageService,
    WorkRuntimeV3SlaService,
    WorkScopeService,
    WorkSalesCommunicationService,
    WorkStatusTransitionService,
    WorkTypeV3Service,
  ],
  exports: [
    DutyAuthorizationService,
    DutyAvailabilityService,
    DutyCoverageRequirementsService,
    DutyScheduleService,
    DutyScopeV3Service,
    WorkLifecycleService,
    WorkNotificationsService,
    WorkReportsV3Service,
    WorkRetentionService,
    WorkRuntimeV3Service,
    WorkRuntimeV3CollaborationService,
    WorkRuntimeV3EscalationService,
    WorkRuntimeV3NotificationsService,
    WorkRuntimeV3StageService,
    WorkRuntimeV3SlaService,
    WorkScopeService,
    WorkSalesCommunicationService,
    WorkTypeV3Service,
  ],
})
export class WorkManagementModule {}
