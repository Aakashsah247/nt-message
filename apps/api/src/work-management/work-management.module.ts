import { Module } from '@nestjs/common';

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
import { PerformanceReportsService } from './performance-reports.service';
import { WorkReportsController } from './work-reports.controller';
import { WorkReportsService } from './work-reports.service';
import { WorkRetentionService } from './work-retention.service';
import { WorkNotificationsService } from './work-notifications.service';
import { WorkScopeService } from './work-scope.service';
import { WorkStatusTransitionService } from './work-status-transition.service';

@Module({
  imports: [PrismaModule, AuthModule],
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
    PerformanceReportsService,
    WorkReportsService,
    WorkRetentionService,
    WorkScopeService,
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
    PerformanceReportsService,
    WorkReportsService,
    WorkRetentionService,
    WorkScopeService,
  ],
})
export class WorkManagementModule {}
