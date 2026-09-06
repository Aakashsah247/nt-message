import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateWorkRuntimeV3Dto } from './dto/create-work-runtime-v3.dto';
import { WorkRuntimeV3Service } from './work-runtime-v3.service';

@Controller('work-v3/offices/:officeId')
@UseGuards(AccessTokenGuard)
export class WorkRuntimeV3Controller {
  constructor(private readonly workRuntime: WorkRuntimeV3Service) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Body() dto: CreateWorkRuntimeV3Dto,
  ) {
    return this.workRuntime.create(user, officeId, dto);
  }
}
