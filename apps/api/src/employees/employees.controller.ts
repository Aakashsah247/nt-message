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
import { AccountClasses } from '../auth/decorators/account-classes.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { AccountClassesGuard } from '../auth/guards/account-classes.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { AccountClass } from '../generated/prisma/client';

import { ArchiveEmployeeDto } from './dto/archive-employee.dto';
import { CorrectEmployeeIdentityDto } from './dto/correct-employee-identity.dto';
import { EndEmployeeEmploymentDto } from './dto/end-employee-employment.dto';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { TransferEmployeeOfficeDto } from './dto/transfer-employee-office.dto';
import { TransferOfficeHeadDto } from './dto/transfer-office-head.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeeIdentityCorrectionService } from './employee-identity-correction.service';
import { EmployeesService } from './employees.service';

@Controller('admin/employees')
@UseGuards(AccessTokenGuard, AccountClassesGuard)
@AccountClasses(AccountClass.SUPER_ADMIN)
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly identityCorrectionService: EmployeeIdentityCorrectionService,
  ) {}

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

  @Get(':id/lifecycle')
  getEmployeeLifecycleHistory(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ) {
    return this.employeesService.getEmployeeLifecycleHistory(id);
  }

  @Patch(':id/archive')
  archiveEmployee(
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
    dto: ArchiveEmployeeDto,

    @Req()
    request: Request,
  ) {
    return this.employeesService.archiveEmployee(user, id, dto, {
      ipAddress: request.ip ?? request.socket.remoteAddress ?? null,

      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Patch(':id/office-transfer')
  transferEmployeeOffice(
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
    dto: TransferEmployeeOfficeDto,

    @Req()
    request: Request,
  ) {
    return this.employeesService.transferEmployeeOffice(user, id, dto, {
      ipAddress: request.ip ?? request.socket.remoteAddress ?? null,
      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Patch(':id/office-head-transfer')
  transferOfficeHead(
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
    dto: TransferOfficeHeadDto,

    @Req()
    request: Request,
  ) {
    return this.employeesService.transferOfficeHead(user, id, dto, {
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
    dto: UpdateEmployeeStatusDto,

    @Req()
    request: Request,
  ) {
    return this.employeesService.updateEmployeeStatus(user, id, dto.status, {
      ipAddress: request.ip ?? request.socket.remoteAddress ?? null,

      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Get(':id/identity-corrections')
  getIdentityCorrectionHistory(
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
    return this.identityCorrectionService.getCorrectionHistory(user, id);
  }

  @Patch(':id/identity')
  correctEmployeeIdentity(
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
    dto: CorrectEmployeeIdentityDto,

    @Req()
    request: Request,
  ) {
    return this.identityCorrectionService.correctIdentity(user, id, dto, {
      ipAddress: request.ip ?? request.socket.remoteAddress ?? null,
      userAgent: request.get('user-agent') ?? null,
    });
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
