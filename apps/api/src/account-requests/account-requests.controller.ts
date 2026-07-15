import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { CreateAccountRequestDto } from './dto/create-account-request.dto';
import { ListAccountRequestsQueryDto } from './dto/list-account-requests-query.dto';
import { ResubmitAccountRequestDto } from './dto/resubmit-account-request.dto';

const ALL_ACCOUNT_ROLES = [
  AccountRole.SUPER_ADMIN,
  AccountRole.SENIOR_MANAGEMENT,
  AccountRole.TEAM_MANAGER,
  AccountRole.EMPLOYEE,
] as const;

const REQUEST_CREATOR_ROLES = [
  AccountRole.SENIOR_MANAGEMENT,
  AccountRole.TEAM_MANAGER,
] as const;

@Controller('account-requests')
@UseGuards(AccessTokenGuard, RolesGuard)
export class AccountRequestsController {
  constructor(
    private readonly accountRequestsService: AccountRequestsService,
  ) {}

  @Get('own-status')
  @Roles(...ALL_ACCOUNT_ROLES)
  getOwnAccountStatus(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.accountRequestsService.getOwnAccountStatus(user);
  }

  @Get('context')
  @Roles(...REQUEST_CREATOR_ROLES)
  getRequestContext(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.accountRequestsService.getRequestContext(user);
  }

  @Post()
  @Roles(...REQUEST_CREATOR_ROLES)
  createRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAccountRequestDto,
    @Req() request: Request,
  ) {
    return this.accountRequestsService.createRequest(user, dto, {
      ipAddress: request.ip ?? request.socket.remoteAddress ?? null,

      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Get('division-employees')
  @Roles(AccountRole.SENIOR_MANAGEMENT)
  listDivisionEmployeeRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAccountRequestsQueryDto,
  ) {
    return this.accountRequestsService.listDivisionEmployeeRequests(
      user,
      query,
    );
  }

  @Get('division-employees/:id')
  @Roles(AccountRole.SENIOR_MANAGEMENT)
  getDivisionEmployeeRequest(
    @CurrentUser() user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ) {
    return this.accountRequestsService.getDivisionEmployeeRequest(user, id);
  }

  @Get('mine')
  @Roles(...REQUEST_CREATOR_ROLES)
  listMyRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAccountRequestsQueryDto,
  ) {
    return this.accountRequestsService.listMyRequests(user, query);
  }

  @Post('mine/:id/resubmit')
  @Roles(...REQUEST_CREATOR_ROLES)
  resubmitRequest(
    @CurrentUser() user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,

    @Body()
    dto: ResubmitAccountRequestDto,

    @Req()
    request: Request,
  ) {
    return this.accountRequestsService.resubmitRequest(user, id, dto, {
      ipAddress: request.ip ?? request.socket.remoteAddress ?? null,

      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Patch('mine/:id/cancel')
  @Roles(...REQUEST_CREATOR_ROLES)
  cancelRequest(
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
    return this.accountRequestsService.cancelRequest(user, id, dto.reason, {
      ipAddress: request.ip ?? request.socket.remoteAddress ?? null,

      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Get('mine/:id')
  @Roles(...REQUEST_CREATOR_ROLES)
  getMyRequest(
    @CurrentUser() user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ) {
    return this.accountRequestsService.getMyRequest(user, id);
  }
}
