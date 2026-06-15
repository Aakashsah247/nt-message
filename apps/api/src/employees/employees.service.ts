import {
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import {
  EmployeeStatus,
} from "../generated/prisma/client";
import type {
  Prisma,
} from "../generated/prisma/client";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { ListEmployeesQueryDto } from "./dto/list-employees-query.dto";

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async createEmployee(
    dto: CreateEmployeeDto,
  ) {
    /*
     * Normalize values before checking or saving them.
     * This prevents values such as ADMIN@NTC.NET.NP and
     * admin@ntc.net.np from being treated differently.
     */
    const empId = dto.empId
      .trim()
      .toUpperCase();

    const officialEmail = dto.officialEmail
      .trim()
      .toLowerCase();

    const empName = dto.empName.trim();

    const department =
      dto.department?.trim() || null;

    const designation =
      dto.designation?.trim() || null;

    /*
     * Check whether the employee ID or official email
     * is already registered.
     */
    const existingEmployee =
      await this.prisma.employee.findFirst({
        where: {
          OR: [
            {
              empId,
            },
            {
              officialEmail,
            },
          ],
        },

        select: {
          empId: true,
          officialEmail: true,
        },
      });

    if (existingEmployee) {
      if (existingEmployee.empId === empId) {
        throw new ConflictException(
          "An employee with this employee ID already exists.",
        );
      }

      throw new ConflictException(
        "An employee with this official email already exists.",
      );
    }

    /*
     * New employees are active in the employee directory,
     * but their messaging account is not yet activated.
     */
    const employee =
      await this.prisma.employee.create({
        data: {
          empId,
          empName,
          phoneNumber:
            dto.phoneNumber.trim(),
          officialEmail,
          department,
          designation,
          status:
            EmployeeStatus.ACTIVE,
          isActivated: false,
        },

        /*
         * Return only fields needed by the API response.
         */
        select: {
          id: true,
          empId: true,
          empName: true,
          phoneNumber: true,
          officialEmail: true,
          department: true,
          designation: true,
          status: true,
          isActivated: true,
          createdAt: true,
          updatedAt: true,
        },
      });

    return {
      message:
        "Employee registered successfully.",
      employee,
    };
  }

  async listEmployees(
    query: ListEmployeesQueryDto,
  ) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const search =
      query.search?.trim();

    /*
     * Prisma where conditions are created only when
     * the corresponding filters are provided.
     */
    const where: Prisma.EmployeeWhereInput = {
      ...(query.status
        ? {
            status: query.status,
          }
        : {}),

      ...(search
        ? {
            OR: [
              {
                empId: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                empName: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                officialEmail: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                department: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                designation: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    };

    /*
     * Retrieve the current page and total count together.
     * Both queries use the same filtering conditions.
     */
    const [employees, total] =
      await this.prisma.$transaction([
        this.prisma.employee.findMany({
          where,
          skip,
          take: limit,

          orderBy: {
            createdAt: "desc",
          },

          select: {
            id: true,
            empId: true,
            empName: true,
            phoneNumber: true,
            officialEmail: true,
            department: true,
            designation: true,
            status: true,
            isActivated: true,
            createdAt: true,
            updatedAt: true,
          },
        }),

        this.prisma.employee.count({
          where,
        }),
      ]);

    return {
      data: employees,

      pagination: {
        page,
        limit,
        total,

        /*
         * Math.ceil calculates how many pages are needed.
         * A minimum of zero is returned when no records exist.
         */
        totalPages:
          total === 0
            ? 0
            : Math.ceil(total / limit),
      },
    };
  }
}