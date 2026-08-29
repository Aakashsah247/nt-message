import { Module } from '@nestjs/common';

import { AttachmentsModule } from '../attachments/attachments.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../database/prisma.module';
import { DutyManagementController } from './duty-management.controller';
import { DutyAvailabilityService } from './duty-availability.service';
import { DutyCoverageRequirementsService } from './duty-coverage-requirements.service';
import { DutyNotificationsService } from './duty-notifications.service';
import { DutyScheduleService } from './duty-schedule.service';
import { WorkItemsController } from './work-items.controller';
import { WorkItemsService } from './work-items.service';
import { WorkLifecycleService } from './work-lifecycle.service';
import { WorkManagementQueryService } from './work-management-query.service';
import { WorkReportsController } from './work-reports.controller';
import { WorkReportsService } from './work-reports.service';
import { WorkRetentionService } from './work-retention.service';
import { WorkNotificationsService } from './work-notifications.service';
import { WorkScopeService } from './work-scope.service';
import { WorkSalesCommunicationService } from './work-sales-communication.service';
import { WorkStatusTransitionService } from './work-status-transition.service';

@Module({
  imports: [PrismaModule, AuthModule, AttachmentsModule],
  controllers: [
    WorkItemsController,
    DutyManagementController,
    WorkReportsController,
  ],
  providers: [
    DutyAvailabilityService,
    DutyCoverageRequirementsService,
    DutyNotificationsService,
    DutyScheduleService,
    WorkItemsService,
    WorkLifecycleService,
    WorkManagementQueryService,
    WorkNotificationsService,
    WorkReportsService,
    WorkRetentionService,
    WorkScopeService,
    WorkSalesCommunicationService,
    WorkStatusTransitionService,
  ],
  exports: [
    DutyAvailabilityService,
    DutyCoverageRequirementsService,
    DutyScheduleService,
    WorkItemsService,
    WorkLifecycleService,
    WorkManagementQueryService,
    WorkNotificationsService,
    WorkReportsService,
    WorkRetentionService,
    WorkScopeService,
    WorkSalesCommunicationService,
  ],
})
export class WorkManagementModule {}
