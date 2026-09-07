import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateWorkRuntimeV3Dto } from './dto/create-work-runtime-v3.dto';
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
import { WorkRuntimeV3StageService } from './work-runtime-v3-stage.service';
import { WorkRuntimeV3Service } from './work-runtime-v3.service';

@Controller('work-v3/offices/:officeId')
@UseGuards(AccessTokenGuard)
export class WorkRuntimeV3Controller {
  constructor(
    private readonly workRuntime: WorkRuntimeV3Service,
    private readonly stageRuntime: WorkRuntimeV3StageService,
  ) {}

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

  @Get('work-items/:workItemId')
  getWork(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' })) workItemId: string,
  ) {
    return this.workRuntime.getWork(user, officeId, workItemId);
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
