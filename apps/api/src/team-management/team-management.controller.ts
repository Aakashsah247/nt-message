import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { AccountRole } from '../generated/prisma/client';
import { CreateDepartmentTeamDto } from './dto/create-department-team.dto';
import { ListDepartmentTeamMembersQueryDto } from './dto/list-department-team-members-query.dto';
import { ListDepartmentTeamsQueryDto } from './dto/list-department-teams-query.dto';
import { UpdateDepartmentTeamDto } from './dto/update-department-team.dto';
import { TeamManagementService } from './team-management.service';

const TEAM_MANAGEMENT_ROLES = [
  AccountRole.SUPER_ADMIN,
  AccountRole.SENIOR_MANAGEMENT,
  AccountRole.TEAM_MANAGER,
] as const;

@Controller('team-management')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(...TEAM_MANAGEMENT_ROLES)
export class TeamManagementController {
  constructor(private readonly teamManagementService: TeamManagementService) {}

  @Get('context')
  getContext(@CurrentUser() user: AuthenticatedUser) {
    return this.teamManagementService.getContext(user);
  }

  @Get('members')
  listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDepartmentTeamMembersQueryDto,
  ) {
    return this.teamManagementService.listMembers(user, query);
  }

  @Get('teams')
  listTeams(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDepartmentTeamsQueryDto,
  ) {
    return this.teamManagementService.listTeams(user, query);
  }

  @Get('teams/:teamId')
  getTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
  ) {
    return this.teamManagementService.getTeam(user, teamId);
  }

  @Post('teams')
  createTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDepartmentTeamDto,
  ) {
    return this.teamManagementService.createTeam(user, dto);
  }

  @Patch('teams/:teamId')
  updateTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Body() dto: UpdateDepartmentTeamDto,
  ) {
    return this.teamManagementService.updateTeam(user, teamId, dto);
  }

  @Delete('teams/:teamId')
  deleteTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
  ) {
    return this.teamManagementService.deleteTeam(user, teamId);
  }
}
