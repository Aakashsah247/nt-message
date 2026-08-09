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
import { CancelWorkItemDto } from './dto/cancel-work-item.dto';
import { CoordinateWorkHelpDto } from './dto/coordinate-work-help.dto';
import { CreateWorkItemDto } from './dto/create-work-item.dto';
import { ListWorkAssigneesQueryDto } from './dto/list-work-assignees-query.dto';
import { ListWorkItemsQueryDto } from './dto/list-work-items-query.dto';
import { ManageWorkRetentionDto } from './dto/manage-work-retention.dto';
import { ManageWorkSupportDto } from './dto/manage-work-support.dto';
import { ReassignWorkDto } from './dto/reassign-work.dto';
import { RequestWorkHelpDto } from './dto/request-work-help.dto';
import { RespondWorkHelpDto } from './dto/respond-work-help.dto';
import { ReviewWorkCompletionDto } from './dto/review-work-completion.dto';
import { SubmitWorkCompletionDto } from './dto/submit-work-completion.dto';
import { UpdateWorkItemDto } from './dto/update-work-item.dto';
import { WorkItemsService } from './work-items.service';
import { WorkLifecycleService } from './work-lifecycle.service';
import { WorkManagementQueryService } from './work-management-query.service';
import { WorkRetentionService } from './work-retention.service';

const ALL_ACCOUNT_ROLES = [
  AccountRole.SUPER_ADMIN,
  AccountRole.SENIOR_MANAGEMENT,
  AccountRole.TEAM_MANAGER,
  AccountRole.EMPLOYEE,
] as const;

const WORK_ASSIGNER_ROLES = [
  AccountRole.SUPER_ADMIN,
  AccountRole.SENIOR_MANAGEMENT,
  AccountRole.TEAM_MANAGER,
] as const;

@Controller('work-items')
@UseGuards(AccessTokenGuard, RolesGuard)
export class WorkItemsController {
  constructor(
    private readonly workItemsService: WorkItemsService,
    private readonly workLifecycleService: WorkLifecycleService,
    private readonly workManagementQueryService: WorkManagementQueryService,
    private readonly workRetentionService: WorkRetentionService,
  ) {}

  @Post()
  @Roles(...WORK_ASSIGNER_ROLES)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkItemDto,
  ) {
    // The service derives organization scope from server-owned employee records.
    return this.workItemsService.create(user, dto);
  }

  @Get()
  @Roles(...ALL_ACCOUNT_ROLES)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListWorkItemsQueryDto,
  ) {
    return this.workItemsService.list(user, query);
  }

  @Get('employee/dashboard-summary')
  @Roles(AccountRole.EMPLOYEE)
  getEmployeeDashboardSummary(@CurrentUser() user: AuthenticatedUser) {
    // The dashboard summary remains account-scoped and never exposes another employee's work.
    return this.workItemsService.getEmployeeDashboardSummary(user);
  }

  @Get('management/dashboard-summary')
  @Roles(...WORK_ASSIGNER_ROLES)
  getManagementDashboardSummary(@CurrentUser() user: AuthenticatedUser) {
    // Management summaries remain restricted to the current organization scope.
    return this.workManagementQueryService.getDashboardSummary(user);
  }

  @Get('management/assignment-options')
  @Roles(...WORK_ASSIGNER_ROLES)
  listManagementAssignmentOptions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListWorkAssigneesQueryDto,
  ) {
    return this.workManagementQueryService.listAssignmentOptions(user, query);
  }

  @Get('help-requests/pending')
  @Roles(...ALL_ACCOUNT_ROLES)
  listPendingHelpRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.workLifecycleService.listPendingHelpRequests(user);
  }

  @Post('help-requests/:helpRequestId/respond')
  @Roles(...ALL_ACCOUNT_ROLES)
  respondToHelpRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('helpRequestId', new ParseUUIDPipe({ version: '4' }))
    helpRequestId: string,
    @Body() dto: RespondWorkHelpDto,
  ) {
    return this.workLifecycleService.respondToHelpRequest(
      user,
      helpRequestId,
      dto,
    );
  }

  @Post('help-requests/:helpRequestId/coordinate')
  @Roles(...WORK_ASSIGNER_ROLES)
  coordinateHelpRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('helpRequestId', new ParseUUIDPipe({ version: '4' }))
    helpRequestId: string,
    @Body() dto: CoordinateWorkHelpDto,
  ) {
    return this.workLifecycleService.coordinateHelpRequest(
      user,
      helpRequestId,
      dto,
    );
  }

  @Post(':workItemId/retention/hold')
  @Roles(AccountRole.SUPER_ADMIN)
  placeRetentionHold(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: ManageWorkRetentionDto,
  ) {
    return this.workRetentionService.placeHold(user, workItemId, dto);
  }

  @Delete(':workItemId/retention/hold')
  @Roles(AccountRole.SUPER_ADMIN)
  releaseRetentionHold(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
  ) {
    return this.workRetentionService.releaseHold(user, workItemId);
  }

  @Post(':workItemId/retention/deletion-request')
  @Roles(AccountRole.SUPER_ADMIN)
  requestDeletionReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: ManageWorkRetentionDto,
  ) {
    return this.workRetentionService.requestDeletionReview(
      user,
      workItemId,
      dto,
    );
  }

  @Delete(':workItemId/retention/deletion-request')
  @Roles(AccountRole.SUPER_ADMIN)
  cancelDeletionReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
  ) {
    return this.workRetentionService.cancelDeletionReview(user, workItemId);
  }

  @Get(':workItemId/activity')
  @Roles(...ALL_ACCOUNT_ROLES)
  listActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
  ) {
    return this.workItemsService.listActivity(user, workItemId);
  }

  @Get(':workItemId/completion-reports')
  @Roles(...ALL_ACCOUNT_ROLES)
  listCompletionReports(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
  ) {
    return this.workLifecycleService.listCompletionReports(user, workItemId);
  }

  @Get(':workItemId/help-requests')
  @Roles(...ALL_ACCOUNT_ROLES)
  listHelpRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
  ) {
    return this.workLifecycleService.listHelpRequests(user, workItemId);
  }

  @Post(':workItemId/acknowledge')
  @Roles(...ALL_ACCOUNT_ROLES)
  acknowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
  ) {
    return this.workItemsService.acknowledge(user, workItemId);
  }

  @Post(':workItemId/start')
  @Roles(...ALL_ACCOUNT_ROLES)
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
  ) {
    return this.workItemsService.start(user, workItemId);
  }

  @Post(':workItemId/help-requests')
  @Roles(...ALL_ACCOUNT_ROLES)
  requestHelp(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: RequestWorkHelpDto,
  ) {
    return this.workLifecycleService.requestHelp(user, workItemId, dto);
  }

  @Post(':workItemId/completion-reports')
  @Roles(...ALL_ACCOUNT_ROLES)
  submitCompletion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: SubmitWorkCompletionDto,
  ) {
    return this.workLifecycleService.submitCompletion(user, workItemId, dto);
  }

  @Patch(':workItemId')
  @Roles(...WORK_ASSIGNER_ROLES)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: UpdateWorkItemDto,
  ) {
    return this.workLifecycleService.update(user, workItemId, dto);
  }

  @Post(':workItemId/review/request-information')
  @Roles(...WORK_ASSIGNER_ROLES)
  requestMoreInformation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: ReviewWorkCompletionDto,
  ) {
    return this.workLifecycleService.requestMoreInformation(
      user,
      workItemId,
      dto,
    );
  }

  @Post(':workItemId/review/close')
  @Roles(...WORK_ASSIGNER_ROLES)
  close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: ReviewWorkCompletionDto,
  ) {
    return this.workLifecycleService.close(user, workItemId, dto);
  }

  @Post(':workItemId/review/reopen')
  @Roles(...WORK_ASSIGNER_ROLES)
  reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: ReviewWorkCompletionDto,
  ) {
    return this.workLifecycleService.reopen(user, workItemId, dto);
  }

  @Post(':workItemId/cancel')
  @Roles(...WORK_ASSIGNER_ROLES)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: CancelWorkItemDto,
  ) {
    return this.workLifecycleService.cancel(user, workItemId, dto);
  }

  @Post(':workItemId/reassign')
  @Roles(...WORK_ASSIGNER_ROLES)
  reassign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: ReassignWorkDto,
  ) {
    return this.workLifecycleService.reassignPrimary(user, workItemId, dto);
  }

  @Post(':workItemId/support/add')
  @Roles(...WORK_ASSIGNER_ROLES)
  addSupport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: ManageWorkSupportDto,
  ) {
    return this.workLifecycleService.addSupport(user, workItemId, dto);
  }

  @Post(':workItemId/support/remove')
  @Roles(...WORK_ASSIGNER_ROLES)
  removeSupport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: ManageWorkSupportDto,
  ) {
    return this.workLifecycleService.removeSupport(user, workItemId, dto);
  }

  @Get(':workItemId')
  @Roles(...ALL_ACCOUNT_ROLES)
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
  ) {
    return this.workItemsService.getById(user, workItemId);
  }
}
