import {
  Body,
  Controller,
  Get,
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
import { EmployeesService } from "./employees.service";

@Controller("admin/employees")
@UseGuards(
  AccessTokenGuard,
  RolesGuard,
)
@Roles(AccountRole.ADMIN)
export class EmployeesController {
  constructor(
    private readonly employeesService:
      EmployeesService,
  ) {}

  /*
   * Registers an employee in the official employee directory.
   *
   * The employee does not receive a messaging account yet.
   * Account activation will be implemented in a later task.
   */
  @Post()
  createEmployee(
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employeesService
      .createEmployee(dto);
  }

  /*
   * Returns a paginated list for the future
   * admin employee-management screen.
   */
  @Get()
  listEmployees(
    @Query()
    query: ListEmployeesQueryDto,
  ) {
    return this.employeesService
      .listEmployees(query);
  }
}