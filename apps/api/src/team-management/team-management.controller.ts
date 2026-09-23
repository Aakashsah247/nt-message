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
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateOperationalTeamDto } from './dto/create-operational-team.dto';
import { ListOperationalTeamMembersQueryDto } from './dto/list-operational-team-members-query.dto';
import { ListOperationalTeamsQueryDto } from './dto/list-operational-teams-query.dto';
import { UpdateOperationalTeamDto } from './dto/update-operational-team.dto';
import { TeamManagementService } from './team-management.service';

@Controller('team-management')
@UseGuards(AccessTokenGuard)
export class TeamManagementController {
  constructor(private readonly teamManagementService: TeamManagementService) {}

  @Get('context')
  getContext(@CurrentUser() user: AuthenticatedUser) {
    return this.teamManagementService.getContext(user);
  }

  @Get('teams')
  listTeams(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListOperationalTeamsQueryDto,
  ) {
    return this.teamManagementService.listTeams(user, query);
  }

  @Get('members')
  listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListOperationalTeamMembersQueryDto,
  ) {
    return this.teamManagementService.listMembers(user, query);
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
    @Body() dto: CreateOperationalTeamDto,
  ) {
    return this.teamManagementService.createTeam(user, dto);
  }

  @Patch('teams/:teamId')
  updateTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Body() dto: UpdateOperationalTeamDto,
  ) {
    return this.teamManagementService.updateTeam(user, teamId, dto);
  }

  @Delete('teams/:teamId')
  deleteTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
  ) {
    return this.teamManagementService.archiveTeam(user, teamId);
  }

  @Post('teams/:teamId/restore')
  restoreTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
  ) {
    return this.teamManagementService.restoreTeam(user, teamId);
  }
}
