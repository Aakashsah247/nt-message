import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Roles } from "../auth/decorators/roles.decorator";
import { AccessTokenGuard } from "../auth/guards/access-token.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AccountRole } from "../generated/prisma/client";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { ListEmployeesQueryDto } from "./dto/list-employees-query.dto";
import { UpdateEmployeeStatusDto } from "./dto/update-employee-status.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";
import { EmployeesService } from "./employees.service";

@Controller("admin/employees")
@UseGuards(
  AccessTokenGuard,
  RolesGuard,
)

@Roles(AccountRole.SUPER_ADMIN)

export class EmployeesController {
  constructor(
    private readonly employeesService:
      EmployeesService,
  ) {}

  @Post()
  createEmployee(
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employeesService
      .createEmployee(dto);
  }

  @Get()
  listEmployees(
    @Query()
    query: ListEmployeesQueryDto,
  ) {
    return this.employeesService
      .listEmployees(query);
  }

  @Get(":id")
  getEmployee(
    @Param(
      "id",
      new ParseUUIDPipe({
        version: "4",
      }),
    )
    id: string,
  ) {
    return this.employeesService
      .getEmployeeById(id);
  }

  @Patch(":id/status")
  updateEmployeeStatus(
    @Param(
      "id",
      new ParseUUIDPipe({
        version: "4",
      }),
    )
    id: string,

    @Body()
    dto: UpdateEmployeeStatusDto,
  ) {
    return this.employeesService
      .updateEmployeeStatus(
        id,
        dto.status,
      );
  }

  @Patch(":id")
  updateEmployee(
    @Param(
      "id",
      new ParseUUIDPipe({
        version: "4",
      }),
    )
    id: string,

    @Body()
    dto: UpdateEmployeeDto,
  ) {
    return this.employeesService
      .updateEmployee(
        id,
        dto,
      );
  }
}