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

import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EndEmployeeEmploymentDto } from './dto/end-employee-employment.dto';
import { TransferEmployeeDto } from './dto/transfer-employee.dto';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesService } from './employees.service';

@Controller('admin/employees')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(AccountRole.SUPER_ADMIN)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  createEmployee(
    @CurrentUser()
    user: AuthenticatedUser,

    @Body()
    dto: CreateEmployeeDto,

    @Req()
    request: Request,
  ) {
    return this.employeesService.createEmployee(user, dto, {
      ipAddress: request.ip ?? request.socket.remoteAddress ?? null,

      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Get()
  listEmployees(
    @Query()
    query: ListEmployeesQueryDto,
  ) {
    return this.employeesService.listEmployees(query);
  }

  @Get(':id')
  getEmployee(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ) {
    return this.employeesService.getEmployeeById(id);
  }

  @Patch(':id/transfer')
  transferEmployee(
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
    dto: TransferEmployeeDto,

    @Req()
    request: Request,
  ) {
    return this.employeesService.transferEmployee(user, id, dto, {
      ipAddress: request.ip ?? request.socket.remoteAddress ?? null,

      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Patch(':id/employment-end')
  endEmployeeEmployment(
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
    dto: EndEmployeeEmploymentDto,

    @Req()
    request: Request,
  ) {
    return this.employeesService.endEmployeeEmployment(user, id, dto, {
      ipAddress: request.ip ?? request.socket.remoteAddress ?? null,

      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Patch(':id/status')
  updateEmployeeStatus(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,

    @Body()
    dto: UpdateEmployeeStatusDto,
  ) {
    return this.employeesService.updateEmployeeStatus(id, dto.status);
  }

  @Patch(':id')
  updateEmployee(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,

    @Body()
    dto: UpdateEmployeeDto,
  ) {
    return this.employeesService.updateEmployee(id, dto);
  }
}
