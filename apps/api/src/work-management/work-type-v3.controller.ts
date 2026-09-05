import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { WorkTypeV3Service } from './work-type-v3.service';

@Controller('work-types/offices/:officeId')
@UseGuards(AccessTokenGuard)
export class WorkTypeV3Controller {
  constructor(private readonly workTypeService: WorkTypeV3Service) {}

  @Get('actions')
  getActions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
  ) {
    return this.workTypeService.getActionContext(user, officeId);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
  ) {
    return this.workTypeService.list(user, officeId);
  }

  @Get(':workTypeDefinitionId')
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Param(
      'workTypeDefinitionId',
      new ParseUUIDPipe({ version: '4' }),
    )
    workTypeDefinitionId: string,
  ) {
    return this.workTypeService.getById(
      user,
      officeId,
      workTypeDefinitionId,
    );
  }
}
