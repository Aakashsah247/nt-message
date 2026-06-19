import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { EmployeeStatus } from '../generated/prisma/client';

import type { Prisma } from '../generated/prisma/client';

import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  private async validateOrganizationAssignment(
    divisionId: string,
    departmentId: string,
  ) {
    const division = await this.prisma.division.findUnique({
      where: {
        id: divisionId,
      },

      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
      },
    });

    if (!division) {
      throw new NotFoundException('Division was not found.');
    }

    if (!division.isActive) {
      throw new ConflictException('The selected division is inactive.');
    }

    const department = await this.prisma.department.findUnique({
      where: {
        id: departmentId,
      },

      select: {
        id: true,
        divisionId: true,
        code: true,
        name: true,
        isActive: true,
      },
    });

    if (!department) {
      throw new NotFoundException('Department was not found.');
    }

    if (!department.isActive) {
      throw new ConflictException('The selected department is inactive.');
    }

    if (department.divisionId !== division.id) {
      throw new BadRequestException(
        'The selected department does not belong to the selected division.',
      );
    }

    return {
      division,
      department,
    };
  }

  async createEmployee(dto: CreateEmployeeDto) {
    const empId = dto.empId.trim().toUpperCase();

    const officialEmail = dto.officialEmail.trim().toLowerCase();

    const empName = dto.empName.trim().replace(/\s+/g, ' ');

    const phoneNumber = dto.phoneNumber.trim();

    const designation = dto.designation?.trim() || null;

    const { division, department } = await this.validateOrganizationAssignment(
      dto.divisionId,
      dto.departmentId,
    );

    const existingEmployee = await this.prisma.employee.findFirst({
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
          'An employee with this employee ID already exists.',
        );
      }

      throw new ConflictException(
        'An employee with this official email already exists.',
      );
    }

    const employee = await this.prisma.employee.create({
      data: {
        empId,
        empName,
        phoneNumber,
        officialEmail,
        designation,

        division: {
          connect: {
            id: division.id,
          },
        },

        departmentUnit: {
          connect: {
            id: department.id,
          },
        },

        /*
         * Temporary compatibility field.
         * It will be removed after activation and
         * all old employee records are migrated.
         */
        department: department.name,

        status: EmployeeStatus.ACTIVE,

        isActivated: false,
      },

      select: {
        id: true,
        empId: true,
        empName: true,
        phoneNumber: true,
        officialEmail: true,
        designation: true,
        status: true,
        isActivated: true,
        createdAt: true,
        updatedAt: true,

        division: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
          },
        },

        departmentUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
          },
        },
      },
    });

    return {
      message: 'Employee registered successfully.',
      employee,
    };
  }
  async listEmployees(query: ListEmployeesQueryDto) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const search = query.search?.trim();

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
                  mode: 'insensitive',
                },
              },
              {
                empName: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                officialEmail: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                department: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                designation: {
                  contains: search,
                  mode: 'insensitive',
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
    const [employees, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        skip,
        take: limit,

        orderBy: {
          createdAt: 'desc',
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
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }
  async getEmployeeById(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        id,
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
        profilePhotoKey: true,
        createdAt: true,
        updatedAt: true,

        account: {
          select: {
            id: true,
            username: true,
            role: true,
            isEnabled: true,
            lastLoginAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee was not found.');
    }

    return {
      employee,
    };
  }

  async updateEmployee(id: string, dto: UpdateEmployeeDto) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        id,
      },

      select: {
        id: true,
        empId: true,
        empName: true,
        phoneNumber: true,
        officialEmail: true,
        isActivated: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee was not found.');
    }

    const empId =
      dto.empId !== undefined ? dto.empId.trim().toUpperCase() : undefined;

    const empName = dto.empName !== undefined ? dto.empName.trim() : undefined;

    const phoneNumber =
      dto.phoneNumber !== undefined ? dto.phoneNumber.trim() : undefined;

    const officialEmail =
      dto.officialEmail !== undefined
        ? dto.officialEmail.trim().toLowerCase()
        : undefined;

    if (empName !== undefined && empName.length < 2) {
      throw new BadRequestException(
        'Employee name must contain at least 2 characters.',
      );
    }

    const identityChanged =
      employee.isActivated &&
      ((empId !== undefined && empId !== employee.empId) ||
        (phoneNumber !== undefined && phoneNumber !== employee.phoneNumber) ||
        (officialEmail !== undefined &&
          officialEmail !== employee.officialEmail));

    // Activated identity fields require re-verification.
    if (identityChanged) {
      throw new ConflictException(
        'Employee ID, phone number and official email cannot be changed after account activation.',
      );
    }

    const duplicateConditions: Prisma.EmployeeWhereInput[] = [];

    if (empId !== undefined) {
      duplicateConditions.push({
        empId,
      });
    }

    if (officialEmail !== undefined) {
      duplicateConditions.push({
        officialEmail,
      });
    }

    if (duplicateConditions.length > 0) {
      const duplicate = await this.prisma.employee.findFirst({
        where: {
          id: {
            not: id,
          },

          OR: duplicateConditions,
        },

        select: {
          empId: true,
          officialEmail: true,
        },
      });

      if (duplicate?.empId === empId) {
        throw new ConflictException(
          'An employee with this employee ID already exists.',
        );
      }

      if (duplicate?.officialEmail === officialEmail) {
        throw new ConflictException(
          'An employee with this official email already exists.',
        );
      }
    }

    const data: Prisma.EmployeeUpdateInput = {};

    if (empId !== undefined) {
      data.empId = empId;
    }

    if (empName !== undefined) {
      data.empName = empName;
    }

    if (phoneNumber !== undefined) {
      data.phoneNumber = phoneNumber;
    }

    if (officialEmail !== undefined) {
      data.officialEmail = officialEmail;
    }

    if (dto.department !== undefined) {
      data.department = dto.department.trim() || null;
    }

    if (dto.designation !== undefined) {
      data.designation = dto.designation.trim() || null;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'Provide at least one employee field to update.',
      );
    }

    const updatedEmployee = await this.prisma.employee.update({
      where: {
        id,
      },

      data,

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
      message: 'Employee updated successfully.',
      employee: updatedEmployee,
    };
  }

  async updateEmployeeStatus(id: string, status: EmployeeStatus) {
    const updatedEmployee = await this.prisma.$transaction(
      async (transaction) => {
        const employee = await transaction.employee.findUnique({
          where: {
            id,
          },

          select: {
            id: true,

            account: {
              select: {
                id: true,
              },
            },
          },
        });

        if (!employee) {
          throw new NotFoundException('Employee was not found.');
        }

        const updated = await transaction.employee.update({
          where: {
            id,
          },

          data: {
            status,
          },

          select: {
            id: true,
            empId: true,
            empName: true,
            officialEmail: true,
            status: true,
            isActivated: true,
            updatedAt: true,
          },
        });

        if (employee.account) {
          await transaction.account.update({
            where: {
              id: employee.account.id,
            },

            data: {
              isEnabled: status === EmployeeStatus.ACTIVE,
            },
          });

          // Inactive employees must lose active sessions.
          if (status === EmployeeStatus.INACTIVE) {
            await transaction.authSession.updateMany({
              where: {
                accountId: employee.account.id,
                revokedAt: null,
              },

              data: {
                revokedAt: new Date(),
              },
            });
          }
        }

        return updated;
      },
    );

    return {
      message:
        status === EmployeeStatus.ACTIVE
          ? 'Employee activated successfully.'
          : 'Employee deactivated successfully.',

      employee: updatedEmployee,
    };
  }
}
