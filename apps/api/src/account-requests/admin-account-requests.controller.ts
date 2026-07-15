import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { AccountRole } from '../generated/prisma/client';

import { AccountRequestsService } from './account-requests.service';
import { CloseAccountRequestDto } from './dto/close-account-request.dto';
import { ListAccountRequestsQueryDto } from './dto/list-account-requests-query.dto';
import { RejectAccountRequestDto } from './dto/reject-account-request.dto';

@Controller('admin/account-requests')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(AccountRole.SUPER_ADMIN)
export class AdminAccountRequestsController {
  constructor(
    private readonly accountRequestsService: AccountRequestsService,
  ) {}

  @Get()
  listRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAccountRequestsQueryDto,
  ) {
    return this.accountRequestsService.listAdminRequests(user, query);
  }

  @Get('dashboard/summary')
  getSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.accountRequestsService.getAdminRequestSummary(user);
  }

  @Get(':id')
  getRequest(
    @CurrentUser() user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ) {
    return this.accountRequestsService.getAdminRequest(user, id);
  }

  @Patch(':id/approve')
  approveRequest(
    @CurrentUser() user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,

    @Req() request: Request,
  ) {
    return this.accountRequestsService.approveRequest(user, id, {
      ipAddress: request.ip ?? request.socket.remoteAddress ?? null,

      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Patch(':id/invalidate')
  invalidateRequest(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,

    @Body()
    dto: CloseAccountRequestDto,

    @Req()
    request: Request,
  ) {
    return this.accountRequestsService.invalidateRequest(user, id, dto.reason, {
      ipAddress: request.ip ?? request.socket.remoteAddress ?? null,

      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Patch(':id/reject')
  rejectRequest(
    @CurrentUser() user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,

    @Body() dto: RejectAccountRequestDto,

    @Req() request: Request,
  ) {
    return this.accountRequestsService.rejectRequest(user, id, dto.reason, {
      ipAddress: request.ip ?? request.socket.remoteAddress ?? null,

      userAgent: request.get('user-agent') ?? null,
    });
  }
}
