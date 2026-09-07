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
  BlockWorkRuntimeV3StageDto,
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

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Body() dto: CreateWorkRuntimeV3Dto,
  ) {
    return this.workRuntime.create(user, officeId, dto);
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
