import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccountClasses } from '../auth/decorators/account-classes.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { AccountClassesGuard } from '../auth/guards/account-classes.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { AccountClass } from '../generated/prisma/client';
import { CancelDutyAssignmentDto } from './dto/cancel-duty-assignment.dto';
import { CreateDutyCoverageRequirementDto } from './dto/create-duty-coverage-requirement.dto';
import { CreateBulkDutyScheduleDto } from './dto/create-bulk-duty-schedule.dto';
import { CreateDutyHolidayDto } from './dto/create-duty-holiday.dto';
import { CreateDutyLeaveDto } from './dto/create-duty-leave.dto';
import { CreateDutyScheduleDto } from './dto/create-duty-schedule.dto';
import { CreateDutyShiftTemplateDto } from './dto/create-duty-shift-template.dto';
import { DutyRosterQueryDto } from './dto/duty-roster-query.dto';
import { DutyShiftTemplateQueryDto } from './dto/duty-shift-template-query.dto';
import { ListDutyHolidaysQueryDto } from './dto/list-duty-holidays-query.dto';
import { ListDutyAssignmentsQueryDto } from './dto/list-duty-assignments-query.dto';
import { ListDutyCoverageRequirementsQueryDto } from './dto/list-duty-coverage-requirements-query.dto';
import { UpdateDutyAssignmentDto } from './dto/update-duty-assignment.dto';
import { UpdateDutyCoverageRequirementDto } from './dto/update-duty-coverage-requirement.dto';
import { UpdateDutyHolidayDto } from './dto/update-duty-holiday.dto';
import { UpdateDutyShiftTemplateDto } from './dto/update-duty-shift-template.dto';
import { UpdateDutyWeeklyOffDto } from './dto/update-duty-weekly-off.dto';
import { UpdateWorkAvailabilityDto } from './dto/update-work-availability.dto';
import { DutyAuthorizationService } from './duty-authorization.service';
import { DutyAvailabilityService } from './duty-availability.service';
import { DutyCoverageRequirementsService } from './duty-coverage-requirements.service';
import { DutyScheduleService } from './duty-schedule.service';
import { DutyScopeV3Service } from './duty-scope-v3.service';

const ALL_ACCOUNT_CLASSES = [
  AccountClass.SUPER_ADMIN,
  AccountClass.OFFICE_USER,
] as const;

const OFFICE_USER_ONLY = [AccountClass.OFFICE_USER] as const;

@Controller('duty')
@UseGuards(AccessTokenGuard, AccountClassesGuard)
export class DutyManagementController {
  constructor(
    private readonly dutyScheduleService: DutyScheduleService,
    private readonly dutyScopeV3Service: DutyScopeV3Service,
    private readonly dutyAuthorizationService: DutyAuthorizationService,
    private readonly dutyAvailabilityService: DutyAvailabilityService,
    private readonly dutyCoverageRequirementsService: DutyCoverageRequirementsService,
  ) {}

  @Get('me')
  @AccountClasses(...OFFICE_USER_ONLY)
  getMyDuty(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.dutyAvailabilityService.getMyDutySummary(user);
  }

  @Patch('me/availability')
  @AccountClasses(...OFFICE_USER_ONLY)
  updateMyAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateWorkAvailabilityDto,
  ): Promise<unknown> {
    return this.dutyAvailabilityService.updateMyAvailability(user, dto);
  }

  @Get('work-items/:workItemId/help-recommendations')
  @AccountClasses(...OFFICE_USER_ONLY)
  listHelpRecommendations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
  ): Promise<unknown> {
    return this.dutyAvailabilityService.listHelpRecommendations(
      user,
      workItemId,
    );
  }

  @Get('management/access-context')
  @AccountClasses(...ALL_ACCOUNT_CLASSES)
  getDutyAccessContext(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.dutyAuthorizationService.getContext(user);
  }

  @Get('management/supervisor-options')
  @AccountClasses(...OFFICE_USER_ONLY)
  listSupervisorOptions(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.dutyScopeV3Service.listSupervisorOptions(user);
  }

  @Get('management/summary')
  @AccountClasses(...ALL_ACCOUNT_CLASSES)
  getManagementSummary(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.dutyScheduleService.getManagementSummary(user);
  }

  @Get('management/help-recommendations')
  @AccountClasses(...ALL_ACCOUNT_CLASSES)
  listManagementHelpRecommendations(
    @CurrentUser() user: AuthenticatedUser,
    @Query('orgUnitId', new ParseUUIDPipe({ version: '4' }))
    orgUnitId: string,
  ): Promise<unknown> {
    return this.dutyAvailabilityService.listManagementHelpRecommendations(
      user,
      orgUnitId,
    );
  }

  @Get('management/shift-templates')
  @AccountClasses(...ALL_ACCOUNT_CLASSES)
  listShiftTemplates(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DutyShiftTemplateQueryDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.listShiftTemplates(user, query);
  }

  // Coverage targets are effective-dated planned staffing rules, never attendance records.
  @Get('management/coverage-requirements')
  @AccountClasses(...ALL_ACCOUNT_CLASSES)
  listCoverageRequirements(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDutyCoverageRequirementsQueryDto,
  ): Promise<unknown> {
    return this.dutyCoverageRequirementsService.listRequirements(user, query);
  }

  @Post('management/coverage-requirements')
  @AccountClasses(...OFFICE_USER_ONLY)
  createCoverageRequirement(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDutyCoverageRequirementDto,
  ): Promise<unknown> {
    return this.dutyCoverageRequirementsService.createRequirement(user, dto);
  }

  @Patch('management/coverage-requirements/:requirementId')
  @AccountClasses(...OFFICE_USER_ONLY)
  updateCoverageRequirement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requirementId', new ParseUUIDPipe({ version: '4' }))
    requirementId: string,
    @Body() dto: UpdateDutyCoverageRequirementDto,
  ): Promise<unknown> {
    return this.dutyCoverageRequirementsService.updateRequirement(
      user,
      requirementId,
      dto,
    );
  }

  @Get('management/coverage-requirements/:requirementId/audit')
  @AccountClasses(...ALL_ACCOUNT_CLASSES)
  getCoverageRequirementAudit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requirementId', new ParseUUIDPipe({ version: '4' }))
    requirementId: string,
  ): Promise<unknown> {
    return this.dutyCoverageRequirementsService.getRequirementAudit(
      user,
      requirementId,
    );
  }

  @Post('management/shift-templates')
  @AccountClasses(...OFFICE_USER_ONLY)
  createShiftTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDutyShiftTemplateDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.createShiftTemplate(user, dto);
  }

  @Patch('management/shift-templates/:templateId')
  @AccountClasses(...OFFICE_USER_ONLY)
  updateShiftTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('templateId', new ParseUUIDPipe({ version: '4' }))
    templateId: string,
    @Body() dto: UpdateDutyShiftTemplateDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.updateShiftTemplate(user, templateId, dto);
  }

  @Delete('management/shift-templates/:templateId')
  @AccountClasses(...OFFICE_USER_ONLY)
  deleteShiftTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('templateId', new ParseUUIDPipe({ version: '4' }))
    templateId: string,
  ): Promise<unknown> {
    return this.dutyScheduleService.deleteShiftTemplate(user, templateId);
  }

  // Roster summaries load scoped people first and avoid returning raw branch-wide history.
  @Get('management/roster')
  @AccountClasses(...ALL_ACCOUNT_CLASSES)
  getRoster(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DutyRosterQueryDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.getRoster(user, query);
  }

  // Preview performs all scope, overlap, leave and holiday checks without writing rows.
  @Post('management/assignments/preview')
  @AccountClasses(...OFFICE_USER_ONLY)
  previewBulkSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBulkDutyScheduleDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.previewBulkSchedule(user, dto);
  }

  // Bulk creation repeats server-side validation before any transaction is committed.
  @Post('management/assignments/bulk')
  @AccountClasses(...OFFICE_USER_ONLY)
  createBulkSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBulkDutyScheduleDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.createBulkSchedule(user, dto);
  }

  // Audit history is scoped through the same assignment visibility checks as the roster.
  @Get('management/assignments/:assignmentId/audit')
  @AccountClasses(...ALL_ACCOUNT_CLASSES)
  getAssignmentAudit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assignmentId', new ParseUUIDPipe({ version: '4' }))
    assignmentId: string,
  ): Promise<unknown> {
    return this.dutyScheduleService.getAssignmentAudit(user, assignmentId);
  }

  // Assignment views separate personal creation, management oversight and audited overrides.
  @Get('management/assignments')
  @AccountClasses(...ALL_ACCOUNT_CLASSES)
  listAssignments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDutyAssignmentsQueryDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.listAssignments(user, query);
  }

  @Post('management/assignments')
  @AccountClasses(...OFFICE_USER_ONLY)
  createSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDutyScheduleDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.createSchedule(user, dto);
  }

  @Patch('management/assignments/:assignmentId')
  @AccountClasses(...OFFICE_USER_ONLY)
  updateAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assignmentId', new ParseUUIDPipe({ version: '4' }))
    assignmentId: string,
    @Body() dto: UpdateDutyAssignmentDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.updateAssignment(
      user,
      assignmentId,
      dto,
    );
  }

  @Post('management/assignments/:assignmentId/cancel')
  @AccountClasses(...OFFICE_USER_ONLY)
  cancelAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assignmentId', new ParseUUIDPipe({ version: '4' }))
    assignmentId: string,
    @Body() dto: CancelDutyAssignmentDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.cancelAssignment(
      user,
      assignmentId,
      dto,
    );
  }

  @Post('management/leaves')
  @AccountClasses(...OFFICE_USER_ONLY)
  createLeave(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDutyLeaveDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.createLeave(user, dto);
  }

  @Get('calendar')
  @AccountClasses(...ALL_ACCOUNT_CLASSES)
  getDutyCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDutyHolidaysQueryDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.getDutyCalendar(user, query);
  }

  @Post('management/holidays')
  @AccountClasses(...OFFICE_USER_ONLY)
  createHoliday(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDutyHolidayDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.createHoliday(user, dto);
  }

  @Patch('management/holidays/:holidayId')
  @AccountClasses(...OFFICE_USER_ONLY)
  updateHoliday(
    @CurrentUser() user: AuthenticatedUser,
    @Param('holidayId', new ParseUUIDPipe({ version: '4' })) holidayId: string,
    @Body() dto: UpdateDutyHolidayDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.updateHoliday(user, holidayId, dto);
  }

  @Post('management/holidays/:holidayId/cancel')
  @AccountClasses(...OFFICE_USER_ONLY)
  cancelHoliday(
    @CurrentUser() user: AuthenticatedUser,
    @Param('holidayId', new ParseUUIDPipe({ version: '4' })) holidayId: string,
  ): Promise<unknown> {
    return this.dutyScheduleService.cancelHoliday(user, holidayId);
  }

  @Get('management/weekly-off')
  @AccountClasses(...ALL_ACCOUNT_CLASSES)
  getWeeklyOff(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.dutyScheduleService.getWeeklyOff(user);
  }

  @Patch('management/weekly-off')
  @AccountClasses(...OFFICE_USER_ONLY)
  updateWeeklyOff(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateDutyWeeklyOffDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.updateWeeklyOff(user, dto);
  }
}
