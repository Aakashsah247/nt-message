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

@Controller('account-requests')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(AccountRole.SENIOR_MANAGEMENT, AccountRole.TEAM_MANAGER)
export class AccountRequestsController {
  constructor(
    private readonly accountRequestsService: AccountRequestsService,
  ) {}

  @Get('context')
  getRequestContext(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.accountRequestsService.getRequestContext(user);
  }

  @Post()
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

  @Get('mine')
  listMyRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAccountRequestsQueryDto,
  ) {
    return this.accountRequestsService.listMyRequests(user, query);
  }

  @Post('mine/:id/resubmit')
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
    return this.accountRequestsService.cancelRequest(
      user,
      id,
      dto.reason,
      {
        ipAddress:
          request.ip ??
          request.socket.remoteAddress ??
          null,

        userAgent:
          request.get('user-agent') ??
          null,
      },
    );
  }

  @Get('mine/:id')
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
