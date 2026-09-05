import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AccountRole } from '../generated/prisma/client';

import { OrganizationService } from './organization.service';

@Controller('organization')
@UseGuards(AccessTokenGuard)
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  private rejectLegacyHierarchyWrite(): never {
    throw new ForbiddenException(
      'The legacy Division and Department hierarchy is read-only. Manage the Office hierarchy through Organization & People.',
    );
  }

  @Post('divisions')
  @UseGuards(RolesGuard)
  @Roles(AccountRole.SUPER_ADMIN)
  createDivision() {
    return this.rejectLegacyHierarchyWrite();
  }

  @Get('divisions')
  listDivisions() {
    return this.organizationService.listDivisions();
  }

  @Get('divisions/:id')
  getDivision(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ) {
    return this.organizationService.getDivisionById(id);
  }

  @Patch('divisions/:id')
  @UseGuards(RolesGuard)
  @Roles(AccountRole.SUPER_ADMIN)
  updateDivision() {
    return this.rejectLegacyHierarchyWrite();
  }

  @Delete('divisions/:id')
  @UseGuards(RolesGuard)
  @Roles(AccountRole.SUPER_ADMIN)
  deleteDivision() {
    return this.rejectLegacyHierarchyWrite();
  }

  @Post('departments')
  @UseGuards(RolesGuard)
  @Roles(AccountRole.SUPER_ADMIN)
  createDepartment() {
    return this.rejectLegacyHierarchyWrite();
  }

  @Get('departments')
  listDepartments() {
    return this.organizationService.listDepartments();
  }

  @Get('departments/:id')
  getDepartment(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ) {
    return this.organizationService.getDepartmentById(id);
  }

  @Patch('departments/:id')
  @UseGuards(RolesGuard)
  @Roles(AccountRole.SUPER_ADMIN)
  updateDepartment() {
    return this.rejectLegacyHierarchyWrite();
  }

  @Delete('departments/:id')
  @UseGuards(RolesGuard)
  @Roles(AccountRole.SUPER_ADMIN)
  deleteDepartment() {
    return this.rejectLegacyHierarchyWrite();
  }
}
