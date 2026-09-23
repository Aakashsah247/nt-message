import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateWorkTypeDefinitionDto } from './dto/create-work-type-definition.dto';
import { CreateWorkTypeDraftDto } from './dto/create-work-type-draft.dto';
import { ReplaceWorkTypeDraftConfigurationDto } from './dto/replace-work-type-draft-configuration.dto';
import { UpdateWorkTypeDraftDto } from './dto/update-work-type-draft.dto';
import { ReplaceOfficeWorkingCalendarDto } from './dto/work-sla.dto';
import { WorkTypeV3Service } from './work-type-v3.service';
import { WorkSlaService } from './work-sla.service';

@Controller('work-types/offices/:officeId')
@UseGuards(AccessTokenGuard)
export class WorkTypeV3Controller {
  constructor(
    private readonly workTypeService: WorkTypeV3Service,
    private readonly workSlaService: WorkSlaService,
  ) {}

  @Get('working-calendar')
  getWorkingCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
  ) {
    return this.workSlaService.getOfficeWorkingCalendar(user, officeId);
  }

  @Put('working-calendar')
  replaceWorkingCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Body() dto: ReplaceOfficeWorkingCalendarDto,
  ) {
    return this.workSlaService.replaceOfficeWorkingCalendar(
      user,
      officeId,
      dto,
    );
  }

  @Get('actions')
  getActions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
  ) {
    return this.workTypeService.getActionContext(user, officeId);
  }

  @Get('configuration-context')
  getConfigurationContext(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
  ) {
    return this.workTypeService.getConfigurationContext(user, officeId);
  }

  @Post()
  createDefinition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Body() dto: CreateWorkTypeDefinitionDto,
  ) {
    return this.workTypeService.createDefinition(user, officeId, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
  ) {
    return this.workTypeService.list(user, officeId);
  }

  @Post(':workTypeDefinitionId/drafts')
  createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Param('workTypeDefinitionId', new ParseUUIDPipe({ version: '4' }))
    workTypeDefinitionId: string,
    @Body() dto: CreateWorkTypeDraftDto,
  ) {
    return this.workTypeService.createDraft(
      user,
      officeId,
      workTypeDefinitionId,
      dto,
    );
  }

  @Patch(':workTypeDefinitionId/drafts/:versionId')
  updateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Param('workTypeDefinitionId', new ParseUUIDPipe({ version: '4' }))
    workTypeDefinitionId: string,
    @Param('versionId', new ParseUUIDPipe({ version: '4' }))
    versionId: string,
    @Body() dto: UpdateWorkTypeDraftDto,
  ) {
    return this.workTypeService.updateDraft(
      user,
      officeId,
      workTypeDefinitionId,
      versionId,
      dto,
    );
  }

  @Put(':workTypeDefinitionId/drafts/:versionId/configuration')
  replaceDraftConfiguration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Param('workTypeDefinitionId', new ParseUUIDPipe({ version: '4' }))
    workTypeDefinitionId: string,
    @Param('versionId', new ParseUUIDPipe({ version: '4' }))
    versionId: string,
    @Body() dto: ReplaceWorkTypeDraftConfigurationDto,
  ) {
    return this.workTypeService.replaceDraftConfiguration(
      user,
      officeId,
      workTypeDefinitionId,
      versionId,
      dto,
    );
  }
  @Delete(':workTypeDefinitionId/drafts/:versionId')
  discardDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Param('workTypeDefinitionId', new ParseUUIDPipe({ version: '4' }))
    workTypeDefinitionId: string,
    @Param('versionId', new ParseUUIDPipe({ version: '4' }))
    versionId: string,
  ) {
    return this.workTypeService.discardDraft(
      user,
      officeId,
      workTypeDefinitionId,
      versionId,
    );
  }

  @Post(':workTypeDefinitionId/drafts/:versionId/publish')
  publishDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Param('workTypeDefinitionId', new ParseUUIDPipe({ version: '4' }))
    workTypeDefinitionId: string,
    @Param('versionId', new ParseUUIDPipe({ version: '4' }))
    versionId: string,
  ) {
    return this.workTypeService.publishDraft(
      user,
      officeId,
      workTypeDefinitionId,
      versionId,
    );
  }

  @Delete(':workTypeDefinitionId/permanent')
  permanentlyDeleteDefinition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('workTypeDefinitionId', new ParseUUIDPipe({ version: '4' }))
    workTypeDefinitionId: string,
  ) {
    return this.workTypeService.permanentlyDeleteDefinition(
      user,
      officeId,
      workTypeDefinitionId,
    );
  }

  @Delete(':workTypeDefinitionId')
  removeDefinition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('workTypeDefinitionId', new ParseUUIDPipe({ version: '4' }))
    workTypeDefinitionId: string,
  ) {
    return this.workTypeService.removeDefinition(
      user,
      officeId,
      workTypeDefinitionId,
    );
  }

  @Post(':workTypeDefinitionId/restore')
  restoreDefinition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('workTypeDefinitionId', new ParseUUIDPipe({ version: '4' }))
    workTypeDefinitionId: string,
  ) {
    return this.workTypeService.restoreDefinition(
      user,
      officeId,
      workTypeDefinitionId,
    );
  }

  @Get(':workTypeDefinitionId')
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Param('workTypeDefinitionId', new ParseUUIDPipe({ version: '4' }))
    workTypeDefinitionId: string,
  ) {
    return this.workTypeService.getById(user, officeId, workTypeDefinitionId);
  }
}
