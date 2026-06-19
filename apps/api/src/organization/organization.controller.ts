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

import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AccountRole } from '../generated/prisma/client';

import { CreateDepartmentDto } from './dto/create-department.dto';
import { CreateDivisionDto } from './dto/create-division.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { UpdateDivisionDto } from './dto/update-division.dto';
import { OrganizationService } from './organization.service';

@Controller('organization')
@UseGuards(AccessTokenGuard)
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post('divisions')
  @UseGuards(RolesGuard)
  @Roles(AccountRole.SUPER_ADMIN)
  createDivision(
    @Body()
    dto: CreateDivisionDto,
  ) {
    return this.organizationService.createDivision(dto);
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
  updateDivision(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,

    @Body()
    dto: UpdateDivisionDto,
  ) {
    return this.organizationService.updateDivision(id, dto);
  }

  @Post('departments')
  @UseGuards(RolesGuard)
  @Roles(AccountRole.SUPER_ADMIN)
  createDepartment(
    @Body()
    dto: CreateDepartmentDto,
  ) {
    return this.organizationService.createDepartment(dto);
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
  updateDepartment(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,

    @Body()
    dto: UpdateDepartmentDto,
  ) {
    return this.organizationService.updateDepartment(id, dto);
  }
}
