import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';

import { CreateDelegatedPermissionDto } from './dto/create-delegated-permission.dto';
import { RevokeDelegatedPermissionDto } from './dto/revoke-delegated-permission.dto';
import { OrganizationDelegationService } from './organization-delegation.service';

@Controller('organization/offices/:officeId/delegations')
@UseGuards(AccessTokenGuard)
export class OrganizationDelegationController {
  constructor(
    private readonly delegationService: OrganizationDelegationService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
  ) {
    return this.delegationService.list(user, officeId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Body() dto: CreateDelegatedPermissionDto,
  ) {
    return this.delegationService.create(
      user,
      officeId,
      dto,
    );
  }

  @Patch(':permissionId/revoke')
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Param('permissionId', new ParseUUIDPipe({ version: '4' }))
    permissionId: string,
    @Body() dto: RevokeDelegatedPermissionDto,
  ) {
    return this.delegationService.revoke(
      user,
      officeId,
      permissionId,
      dto,
    );
  }
}
