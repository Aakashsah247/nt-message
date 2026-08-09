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
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { AccountRole } from '../generated/prisma/client';
import { CancelDutyAssignmentDto } from './dto/cancel-duty-assignment.dto';
import { CreateDutyCoverageRequirementDto } from './dto/create-duty-coverage-requirement.dto';
import { CreateBulkDutyScheduleDto } from './dto/create-bulk-duty-schedule.dto';
import { CreateDutyExceptionDto } from './dto/create-duty-exception.dto';
import { CreateDutyScheduleDto } from './dto/create-duty-schedule.dto';
import { CreateDutyShiftTemplateDto } from './dto/create-duty-shift-template.dto';
import { DutyRosterQueryDto } from './dto/duty-roster-query.dto';
import { ListDutyAssignmentsQueryDto } from './dto/list-duty-assignments-query.dto';
import { ListDutyCoverageRequirementsQueryDto } from './dto/list-duty-coverage-requirements-query.dto';
import { UpdateDutyAssignmentDto } from './dto/update-duty-assignment.dto';
import { UpdateDutyCoverageRequirementDto } from './dto/update-duty-coverage-requirement.dto';
import { UpdateDutyShiftTemplateDto } from './dto/update-duty-shift-template.dto';
import { UpdateWorkAvailabilityDto } from './dto/update-work-availability.dto';
import { DutyAvailabilityService } from './duty-availability.service';
import { DutyCoverageRequirementsService } from './duty-coverage-requirements.service';
import { DutyScheduleService } from './duty-schedule.service';

const ALL_ACCOUNT_ROLES = [
  AccountRole.SUPER_ADMIN,
  AccountRole.SENIOR_MANAGEMENT,
  AccountRole.TEAM_MANAGER,
  AccountRole.EMPLOYEE,
] as const;

const DUTY_MANAGER_ROLES = [
  AccountRole.SUPER_ADMIN,
  AccountRole.SENIOR_MANAGEMENT,
  AccountRole.TEAM_MANAGER,
] as const;

@Controller('duty')
@UseGuards(AccessTokenGuard, RolesGuard)
export class DutyManagementController {
  constructor(
    private readonly dutyScheduleService: DutyScheduleService,
    private readonly dutyAvailabilityService: DutyAvailabilityService,
    private readonly dutyCoverageRequirementsService: DutyCoverageRequirementsService,
  ) {}

  @Get('me')
  @Roles(...ALL_ACCOUNT_ROLES)
  getMyDuty(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.dutyAvailabilityService.getMyDutySummary(user);
  }

  @Patch('me/availability')
  @Roles(...ALL_ACCOUNT_ROLES)
  updateMyAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateWorkAvailabilityDto,
  ): Promise<unknown> {
    return this.dutyAvailabilityService.updateMyAvailability(user, dto);
  }

  @Get('work-items/:workItemId/help-recommendations')
  @Roles(AccountRole.EMPLOYEE)
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

  @Get('management/summary')
  @Roles(...DUTY_MANAGER_ROLES)
  getManagementSummary(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.dutyScheduleService.getManagementSummary(user);
  }

  @Get('management/help-recommendations')
  @Roles(...DUTY_MANAGER_ROLES)
  listManagementHelpRecommendations(
    @CurrentUser() user: AuthenticatedUser,
    @Query('departmentId', new ParseUUIDPipe({ version: '4' }))
    departmentId: string,
  ): Promise<unknown> {
    return this.dutyAvailabilityService.listManagementHelpRecommendations(
      user,
      departmentId,
    );
  }

  @Get('management/shift-templates')
  @Roles(...DUTY_MANAGER_ROLES)
  listShiftTemplates(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.dutyScheduleService.listShiftTemplates(user);
  }

  // Coverage targets are effective-dated planned staffing rules, never attendance records.
  @Get('management/coverage-requirements')
  @Roles(...DUTY_MANAGER_ROLES)
  listCoverageRequirements(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDutyCoverageRequirementsQueryDto,
  ): Promise<unknown> {
    return this.dutyCoverageRequirementsService.listRequirements(user, query);
  }

  @Post('management/coverage-requirements')
  @Roles(...DUTY_MANAGER_ROLES)
  createCoverageRequirement(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDutyCoverageRequirementDto,
  ): Promise<unknown> {
    return this.dutyCoverageRequirementsService.createRequirement(user, dto);
  }

  @Patch('management/coverage-requirements/:requirementId')
  @Roles(...DUTY_MANAGER_ROLES)
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
  @Roles(...DUTY_MANAGER_ROLES)
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
  @Roles(...DUTY_MANAGER_ROLES)
  createShiftTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDutyShiftTemplateDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.createShiftTemplate(user, dto);
  }

  @Patch('management/shift-templates/:templateId')
  @Roles(...DUTY_MANAGER_ROLES)
  updateShiftTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('templateId', new ParseUUIDPipe({ version: '4' }))
    templateId: string,
    @Body() dto: UpdateDutyShiftTemplateDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.updateShiftTemplate(user, templateId, dto);
  }

  @Delete('management/shift-templates/:templateId')
  @Roles(...DUTY_MANAGER_ROLES)
  deleteShiftTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('templateId', new ParseUUIDPipe({ version: '4' }))
    templateId: string,
  ): Promise<unknown> {
    return this.dutyScheduleService.deleteShiftTemplate(user, templateId);
  }

  // Roster summaries load scoped people first and avoid returning raw branch-wide history.
  @Get('management/roster')
  @Roles(...DUTY_MANAGER_ROLES)
  getRoster(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DutyRosterQueryDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.getRoster(user, query);
  }

  // Preview performs all scope, overlap, leave and holiday checks without writing rows.
  @Post('management/assignments/preview')
  @Roles(...DUTY_MANAGER_ROLES)
  previewBulkSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBulkDutyScheduleDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.previewBulkSchedule(user, dto);
  }

  // Bulk creation repeats server-side validation before any transaction is committed.
  @Post('management/assignments/bulk')
  @Roles(...DUTY_MANAGER_ROLES)
  createBulkSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBulkDutyScheduleDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.createBulkSchedule(user, dto);
  }

  // Audit history is scoped through the same assignment visibility checks as the roster.
  @Get('management/assignments/:assignmentId/audit')
  @Roles(...DUTY_MANAGER_ROLES)
  getAssignmentAudit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assignmentId', new ParseUUIDPipe({ version: '4' }))
    assignmentId: string,
  ): Promise<unknown> {
    return this.dutyScheduleService.getAssignmentAudit(user, assignmentId);
  }

  // Assignment views separate personal creation, management oversight and audited overrides.
  @Get('management/assignments')
  @Roles(...DUTY_MANAGER_ROLES)
  listAssignments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDutyAssignmentsQueryDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.listAssignments(user, query);
  }

  @Post('management/assignments')
  @Roles(...DUTY_MANAGER_ROLES)
  createSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDutyScheduleDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.createSchedule(user, dto);
  }

  @Patch('management/assignments/:assignmentId')
  @Roles(...DUTY_MANAGER_ROLES)
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
  @Roles(...DUTY_MANAGER_ROLES)
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

  @Post('management/exceptions')
  @Roles(...DUTY_MANAGER_ROLES)
  createException(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDutyExceptionDto,
  ): Promise<unknown> {
    return this.dutyScheduleService.createException(user, dto);
  }
}
