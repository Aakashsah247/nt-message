import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

import type { AuthenticatedUser } from '../auth/types/auth.types';

import { AccountRole } from '../generated/prisma/client';

import { DirectoryService } from './directory.service';
import { ListDirectoryQueryDto } from './dto/list-directory-query.dto';

@Controller('directory')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(
  AccountRole.SUPER_ADMIN,
  AccountRole.SENIOR_MANAGEMENT,
  AccountRole.TEAM_MANAGER,
)
export class DirectoryController {
  constructor(private readonly directoryService: DirectoryService) {}

  @Get('employees')
  listDirectory(
    @CurrentUser()
    user: AuthenticatedUser,

    @Query()
    query: ListDirectoryQueryDto,
  ) {
    return this.directoryService.listDirectory(user, query);
  }

  @Get('employees/:id')
  getDirectoryEmployee(
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
    return this.directoryService.getDirectoryEmployee(user, id);
  }
}
