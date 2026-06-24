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

import { AssignManagementPositionDto } from './dto/assign-management-position.dto';
import { CreateManagementPositionDto } from './dto/create-management-position.dto';
import { EndManagementAssignmentDto } from './dto/end-management-assignment.dto';
import { ListManagementPositionsQueryDto } from './dto/list-management-positions-query.dto';
import { ReplaceManagementPositionDto } from './dto/replace-management-position.dto';
import { ManagementAssignmentsService } from './management-assignments.service';

@Controller('admin/management-positions')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(AccountRole.SUPER_ADMIN)
export class ManagementAssignmentsController {
  constructor(
    private readonly managementAssignmentsService: ManagementAssignmentsService,
  ) {}

  @Post()
  createPosition(
    @CurrentUser()
    user: AuthenticatedUser,

    @Body()
    dto: CreateManagementPositionDto,
  ) {
    return this.managementAssignmentsService.createPosition(user, dto);
  }

  @Get()
  listPositions(
    @CurrentUser()
    user: AuthenticatedUser,

    @Query()
    query: ListManagementPositionsQueryDto,
  ) {
    return this.managementAssignmentsService.listPositions(user, query);
  }

  @Get(':id')
  getPosition(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ) {
    return this.managementAssignmentsService.getPosition(user, id);
  }

  @Post(':id/assign')
  assignPosition(
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
    dto: AssignManagementPositionDto,

    @Req()
    request: Request,
  ) {
    return this.managementAssignmentsService.assignPosition(user, id, dto, {
      ipAddress: request.ip ?? request.socket.remoteAddress ?? null,

      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Patch(':id/end-assignment')
  endAssignment(
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
    dto: EndManagementAssignmentDto,

    @Req()
    request: Request,
  ) {
    return this.managementAssignmentsService.endCurrentAssignment(
      user,
      id,
      dto,
      {
        ipAddress: request.ip ?? request.socket.remoteAddress ?? null,

        userAgent: request.get('user-agent') ?? null,
      },
    );
  }

  @Patch(':id/replace')
  replacePositionHolder(
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
    dto: ReplaceManagementPositionDto,

    @Req()
    request: Request,
  ) {
    return this.managementAssignmentsService.replacePositionHolder(
      user,
      id,
      dto,
      {
        ipAddress: request.ip ?? request.socket.remoteAddress ?? null,

        userAgent: request.get('user-agent') ?? null,
      },
    );
  }
}
