import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateWorkRuntimeV3Dto } from './dto/create-work-runtime-v3.dto';
import {
  CancelWorkRuntimeV3CollaborationDto,
  CreateWorkRuntimeV3CollaborationRequestDto,
  DeclineWorkRuntimeV3CollaborationDto,
  WorkRuntimeV3CollaborationMutationDto,
  WorkRuntimeV3CollaborationQueueQueryDto,
} from './dto/work-runtime-v3-collaboration.dto';
import {
  AssignWorkRuntimeV3StageDto,
  ApproveWorkRuntimeV3StageDto,
  BlockWorkRuntimeV3StageDto,
  CancelWorkRuntimeV3Dto,
  CompleteWorkRuntimeV3Dto,
  ReopenWorkRuntimeV3Dto,
  ReturnWorkRuntimeV3StageDto,
  SubmitWorkRuntimeV3StageDto,
  WorkRuntimeV3QueueQueryDto,
  WorkRuntimeV3StageMutationDto,
} from './dto/work-runtime-v3-stage.dto';
import { WorkRuntimeV3CollaborationService } from './work-runtime-v3-collaboration.service';
import { WorkRuntimeV3EscalationService } from './work-runtime-v3-escalation.service';
import { ReplaceOfficeWorkingCalendarDto } from './dto/work-runtime-v3-sla.dto';
import { WorkRuntimeV3StageService } from './work-runtime-v3-stage.service';
import { WorkRuntimeV3SlaService } from './work-runtime-v3-sla.service';
import { WorkRuntimeV3Service } from './work-runtime-v3.service';

@Controller('work-v3/offices/:officeId')
@UseGuards(AccessTokenGuard)
export class WorkRuntimeV3Controller {
  constructor(
    private readonly workRuntime: WorkRuntimeV3Service,
    private readonly stageRuntime: WorkRuntimeV3StageService,
    private readonly collaborationRuntime: WorkRuntimeV3CollaborationService,
    private readonly escalationRuntime: WorkRuntimeV3EscalationService,
    private readonly slaRuntime: WorkRuntimeV3SlaService,
  ) {}

  @Get('working-calendar')
  getWorkingCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
  ) {
    return this.slaRuntime.getOfficeWorkingCalendar(user, officeId);
  }

  @Put('working-calendar')
  replaceWorkingCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Body() dto: ReplaceOfficeWorkingCalendarDto,
  ) {
    return this.slaRuntime.replaceOfficeWorkingCalendar(user, officeId, dto);
  }

  @Get('create-context')
  getCreateContext(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
  ) {
    return this.workRuntime.getCreateContext(user, officeId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Body() dto: CreateWorkRuntimeV3Dto,
  ) {
    return this.workRuntime.create(user, officeId, dto);
  }

  @Get('work-items')
  async listWork(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Query() query: WorkRuntimeV3QueueQueryDto,
  ) {
    const result = await this.workRuntime.listWork(user, officeId, query.take);
    return {
      ...result,
      data: await Promise.all(
        result.data.map(async (work) => ({
          ...work,
          availableActions: await this.stageRuntime.getWorkAvailableActions(
            user,
            officeId,
            work.id,
          ),
        })),
      ),
    };
  }

  @Get('work-items/:workItemId')
  getWork(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' })) workItemId: string,
  ) {
    return this.workRuntime.getWork(user, officeId, workItemId);
  }

  @Get('work-items/:workItemId/sla')
  getWorkSlaSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' })) workItemId: string,
  ) {
    return this.workRuntime.getWorkSlaSummary(user, officeId, workItemId);
  }

  @Get('work-items/:workItemId/actions')
  async getWorkActions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' })) workItemId: string,
  ) {
    await this.workRuntime.getWork(user, officeId, workItemId);
    return this.stageRuntime.getWorkAvailableActions(user, officeId, workItemId);
  }

  @Post('work-items/:workItemId/collaboration-requests')
  requestCollaboration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' })) workItemId: string,
    @Body() dto: CreateWorkRuntimeV3CollaborationRequestDto,
  ) {
    return this.collaborationRuntime.request(user, officeId, workItemId, dto);
  }

  @Get('work-items/:workItemId/collaboration-requests')
  listWorkCollaborations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' })) workItemId: string,
  ) {
    return this.collaborationRuntime.listForWork(user, officeId, workItemId);
  }

  @Get('collaboration-requests/incoming')
  listIncomingCollaborations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Query() query: WorkRuntimeV3CollaborationQueueQueryDto,
  ) {
    return this.collaborationRuntime.listIncoming(user, officeId, query.take);
  }

  @Post('collaboration-requests/:requestId/accept')
  acceptCollaboration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
    @Body() dto: WorkRuntimeV3CollaborationMutationDto,
  ) {
    return this.collaborationRuntime.accept(user, officeId, requestId, dto);
  }

  @Post('collaboration-requests/:requestId/decline')
  declineCollaboration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
    @Body() dto: DeclineWorkRuntimeV3CollaborationDto,
  ) {
    return this.collaborationRuntime.decline(user, officeId, requestId, dto);
  }

  @Post('collaboration-requests/:requestId/cancel')
  cancelCollaboration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
    @Body() dto: CancelWorkRuntimeV3CollaborationDto,
  ) {
    return this.collaborationRuntime.cancel(user, officeId, requestId, dto);
  }

  @Get('stages/:stageId/escalation')
  getStageEscalation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('stageId', new ParseUUIDPipe({ version: '4' })) stageId: string,
  ) {
    return this.escalationRuntime.getStageEscalation(user, officeId, stageId);
  }

  @Get('stages/:stageId')
  getStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('stageId', new ParseUUIDPipe({ version: '4' })) stageId: string,
  ) {
    return this.stageRuntime.getStage(user, officeId, stageId);
  }

  @Post('stages/:stageId/assign')
  assignStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('stageId', new ParseUUIDPipe({ version: '4' })) stageId: string,
    @Body() dto: AssignWorkRuntimeV3StageDto,
  ) {
    return this.stageRuntime.assign(user, officeId, stageId, dto);
  }

  @Post('stages/:stageId/start')
  startStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('stageId', new ParseUUIDPipe({ version: '4' })) stageId: string,
    @Body() dto: WorkRuntimeV3StageMutationDto,
  ) {
    return this.stageRuntime.start(user, officeId, stageId, dto);
  }

  @Post('stages/:stageId/block')
  blockStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('stageId', new ParseUUIDPipe({ version: '4' })) stageId: string,
    @Body() dto: BlockWorkRuntimeV3StageDto,
  ) {
    return this.stageRuntime.block(user, officeId, stageId, dto);
  }

  @Post('stages/:stageId/resume')
  resumeStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('stageId', new ParseUUIDPipe({ version: '4' })) stageId: string,
    @Body() dto: WorkRuntimeV3StageMutationDto,
  ) {
    return this.stageRuntime.resume(user, officeId, stageId, dto);
  }

  @Post('stages/:stageId/submit')
  submitStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('stageId', new ParseUUIDPipe({ version: '4' })) stageId: string,
    @Body() dto: SubmitWorkRuntimeV3StageDto,
  ) {
    return this.stageRuntime.submit(user, officeId, stageId, dto);
  }

  @Post('stages/:stageId/approve')
  approveStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('stageId', new ParseUUIDPipe({ version: '4' })) stageId: string,
    @Body() dto: ApproveWorkRuntimeV3StageDto,
  ) {
    return this.stageRuntime.approve(user, officeId, stageId, dto);
  }

  @Post('stages/:stageId/return')
  returnStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('stageId', new ParseUUIDPipe({ version: '4' })) stageId: string,
    @Body() dto: ReturnWorkRuntimeV3StageDto,
  ) {
    return this.stageRuntime.returnStage(user, officeId, stageId, dto);
  }

  @Post('work-items/:workItemId/complete')
  completeWork(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' })) workItemId: string,
    @Body() dto: CompleteWorkRuntimeV3Dto,
  ) {
    return this.stageRuntime.completeWork(user, officeId, workItemId, dto);
  }

  @Post('work-items/:workItemId/cancel')
  cancelWork(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' })) workItemId: string,
    @Body() dto: CancelWorkRuntimeV3Dto,
  ) {
    return this.stageRuntime.cancelWork(user, officeId, workItemId, dto);
  }

  @Post('work-items/:workItemId/reopen')
  reopenWork(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' })) workItemId: string,
    @Body() dto: ReopenWorkRuntimeV3Dto,
  ) {
    return this.stageRuntime.reopenWork(user, officeId, workItemId, dto);
  }

  @Get('queues/mine')
  myStages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Query() query: WorkRuntimeV3QueueQueryDto,
  ) {
    return this.stageRuntime.listMyStages(user, officeId, query.take);
  }

  @Get('queues/team')
  teamQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Query() query: WorkRuntimeV3QueueQueryDto,
  ) {
    return this.stageRuntime.listTeamQueue(user, officeId, query.take);
  }

  @Get('queues/org-unit')
  orgUnitQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Query() query: WorkRuntimeV3QueueQueryDto,
  ) {
    return this.stageRuntime.listOrgUnitQueue(user, officeId, query.take);
  }
}
