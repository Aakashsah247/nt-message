import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRequestActionType,
  AccountRequestStatus,
  AccountRole,
  EmployeeLifecycleActionType,
  EmployeeStatus,
  EmploymentStatus,
} from '../generated/prisma/client';

import type { Prisma } from '../generated/prisma/client';

import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EndEmployeeEmploymentDto } from './dto/end-employee-employment.dto';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

interface EmployeeCreationMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

interface EmployeeLifecycleMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

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

  async createEmployee(
    user: AuthenticatedUser,
    dto: CreateEmployeeDto,
    metadata: EmployeeCreationMetadata,
  ) {
    if (user.role !== AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only the Super Admin can create employee identities directly.',
      );
    }

    const empId = dto.empId.trim().toUpperCase();

    const officialEmail = dto.officialEmail.trim().toLowerCase();

    const empName = dto.empName.trim().replace(/\s+/g, ' ');

    const phoneNumber = dto.phoneNumber.trim();

    const designation = dto.designation?.trim() || null;

    // Uses the role selected by the Super Admin.
    const requestedRole = dto.requestedRole;

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

    const existingRequest = await this.prisma.accountRequest.findFirst({
      where: {
        status: {
          not: AccountRequestStatus.REJECTED,
        },

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
        id: true,
        status: true,
      },
    });

    if (existingRequest) {
      throw new ConflictException(
        'An active account request already exists for this employee ID or official email.',
      );
    }

    const now = new Date();

    const ipAddress = metadata.ipAddress?.slice(0, 45) || null;

    const userAgent = metadata.userAgent?.slice(0, 500) || null;

    const result = await this.prisma.$transaction(async (transaction) => {
      const employee = await transaction.employee.create({
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
           * This will be removed after all
           * organization data is migrated.
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

      /*
       * Direct Super Admin creation is treated
       * as an approved account request.
       */
      const accountRequest = await transaction.accountRequest.create({
        data: {
          empId,
          empName,
          phoneNumber,
          officialEmail,
          designation,

          requestedRole,

          divisionId: division.id,

          departmentId: department.id,

          employeeId: employee.id,

          requestedByAccountId: user.accountId,

          reviewedByAccountId: user.accountId,

          status: AccountRequestStatus.APPROVED,

          reviewedAt: now,
        },

        select: {
          id: true,
          empId: true,
          empName: true,
          officialEmail: true,
          requestedRole: true,
          divisionId: true,
          departmentId: true,
          employeeId: true,
          requestedByAccountId: true,
          reviewedByAccountId: true,
          revisionNumber: true,
          status: true,
          submittedAt: true,
          reviewedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await transaction.accountRequestAction.createMany({
        data: [
          {
            accountRequestId: accountRequest.id,

            actorAccountId: user.accountId,

            action: AccountRequestActionType.CREATED,

            ipAddress,
            userAgent,

            metadata: {
              source: 'SUPER_ADMIN_DIRECT_CREATION',

              employeeId: employee.id,

              requestedRole,
            },
          },
          {
            accountRequestId: accountRequest.id,

            actorAccountId: user.accountId,

            action: AccountRequestActionType.APPROVED,

            ipAddress,
            userAgent,

            metadata: {
              source: 'SUPER_ADMIN_DIRECT_CREATION',

              employeeId: employee.id,

              requestedRole,

              divisionId: division.id,

              departmentId: department.id,
            },
          },
        ],
      });

      return {
        employee,
        accountRequest,
      };
    });

    return {
      message: 'Account identity created successfully.',

      employee: result.employee,

      accountRequest: result.accountRequest,
    };
  }

  async listEmployees(query: ListEmployeesQueryDto) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const search = query.search?.trim();

    const where: Prisma.EmployeeWhereInput = {
      ...(query.status
        ? {
            status: query.status,
          }
        : {}),

      ...(query.divisionId
        ? {
            divisionId: query.divisionId,
          }
        : {}),

      ...(query.departmentId
        ? {
            departmentId: query.departmentId,
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
                designation: {
                  contains: search,
                  mode: 'insensitive',
                },
              },

              /*
               * Temporary legacy text search.
               * This remains until old employee
               * organization data is migrated.
               */
              {
                department: {
                  contains: search,
                  mode: 'insensitive',
                },
              },

              {
                division: {
                  is: {
                    name: {
                      contains: search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
              {
                division: {
                  is: {
                    code: {
                      contains: search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
              {
                departmentUnit: {
                  is: {
                    name: {
                      contains: search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
              {
                departmentUnit: {
                  is: {
                    code: {
                      contains: search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

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
          divisionId: true,
          departmentId: true,

          /*
           * Temporary compatibility field.
           */
          department: true,

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
        divisionId: true,
        departmentId: true,

        /*
         * Temporary compatibility field.
         */
        department: true,

        designation: true,
        status: true,
        isActivated: true,
        profilePhotoKey: true,
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
        divisionId: true,
        departmentId: true,
        isActivated: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee was not found.');
    }

    const empId =
      dto.empId !== undefined ? dto.empId.trim().toUpperCase() : undefined;

    const empName =
      dto.empName !== undefined
        ? dto.empName.trim().replace(/\s+/g, ' ')
        : undefined;

    const phoneNumber =
      dto.phoneNumber !== undefined ? dto.phoneNumber.trim() : undefined;

    const officialEmail =
      dto.officialEmail !== undefined
        ? dto.officialEmail.trim().toLowerCase()
        : undefined;

    const designation =
      dto.designation !== undefined
        ? dto.designation.trim() || null
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

    const organizationChangeRequested =
      dto.divisionId !== undefined || dto.departmentId !== undefined;

    let assignedDivisionId: string | undefined;

    let assignedDepartmentId: string | undefined;

    let assignedDepartmentName: string | undefined;

    if (organizationChangeRequested) {
      const targetDivisionId = dto.divisionId ?? employee.divisionId;

      const targetDepartmentId = dto.departmentId ?? employee.departmentId;

      if (!targetDivisionId || !targetDepartmentId) {
        throw new BadRequestException(
          'Both division ID and department ID are required when assigning organization details.',
        );
      }

      const { division, department } =
        await this.validateOrganizationAssignment(
          targetDivisionId,
          targetDepartmentId,
        );

      assignedDivisionId = division.id;

      assignedDepartmentId = department.id;

      assignedDepartmentName = department.name;
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

    if (designation !== undefined) {
      data.designation = designation;
    }

    if (assignedDivisionId && assignedDepartmentId && assignedDepartmentName) {
      data.division = {
        connect: {
          id: assignedDivisionId,
        },
      };

      data.departmentUnit = {
        connect: {
          id: assignedDepartmentId,
        },
      };

      /*
       * Keep the legacy text field synchronized
       * until it is removed in a later migration.
       */
      data.department = assignedDepartmentName;
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
        divisionId: true,
        departmentId: true,
        department: true,
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
      message: 'Employee updated successfully.',
      employee: updatedEmployee,
    };
  }

  async endEmployeeEmployment(
    user: AuthenticatedUser,
    id: string,
    dto: EndEmployeeEmploymentDto,
    metadata: EmployeeLifecycleMetadata,
  ) {
    if (user.role !== AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only the Super Admin can end an employee employment record.',
      );
    }

    const reason = dto.reason.trim().replace(/\s+/g, ' ');

    if (reason.length < 3) {
      throw new BadRequestException(
        'Employment end reason must contain at least 3 characters.',
      );
    }

    const now = new Date();

    const effectiveAt = dto.effectiveAt ? new Date(dto.effectiveAt) : now;

    if (Number.isNaN(effectiveAt.getTime())) {
      throw new BadRequestException('Employment effective date is invalid.');
    }

    if (effectiveAt.getTime() > now.getTime()) {
      throw new BadRequestException(
        'Employment end date cannot be in the future.',
      );
    }

    let lifecycleAction: EmployeeLifecycleActionType;

    switch (dto.employmentStatus) {
      case EmploymentStatus.RESIGNED:
        lifecycleAction = EmployeeLifecycleActionType.RESIGNED;
        break;

      case EmploymentStatus.RETIRED:
        lifecycleAction = EmployeeLifecycleActionType.RETIRED;
        break;

      case EmploymentStatus.TERMINATED:
        lifecycleAction = EmployeeLifecycleActionType.TERMINATED;
        break;

      case EmploymentStatus.TRANSFERRED:
        // A transfer means the employee has left Patan Branch.
        lifecycleAction = EmployeeLifecycleActionType.TRANSFERRED;
        break;

      default:
        throw new BadRequestException(
          'Employment status must be resigned, retired, terminated or transferred.',
        );
    }

    const ipAddress = metadata.ipAddress?.slice(0, 45) || null;

    const userAgent = metadata.userAgent?.slice(0, 500) || null;

    const result = await this.prisma.$transaction(async (transaction) => {
      const employee = await transaction.employee.findUnique({
        where: {
          id,
        },

        select: {
          id: true,
          empId: true,
          empName: true,
          officialEmail: true,
          status: true,
          employmentStatus: true,
          archivedAt: true,

          account: {
            select: {
              id: true,
              role: true,
              isEnabled: true,
            },
          },
        },
      });

      if (!employee) {
        throw new NotFoundException('Employee was not found.');
      }

      if (employee.account?.role === AccountRole.SUPER_ADMIN) {
        throw new ForbiddenException(
          'Super Admin employment cannot be ended through this process.',
        );
      }

      if (employee.employmentStatus !== EmploymentStatus.ACTIVE) {
        throw new ConflictException(
          'This employee employment record has already ended.',
        );
      }

      if (employee.archivedAt) {
        throw new ConflictException(
          'An archived employee cannot be processed again.',
        );
      }

      const updatedEmployee = await transaction.employee.update({
        where: {
          id: employee.id,
        },

        data: {
          status: EmployeeStatus.INACTIVE,

          employmentStatus: dto.employmentStatus,

          employmentEndedAt: effectiveAt,

          employmentEndReason: reason,
        },

        select: {
          id: true,
          empId: true,
          empName: true,
          officialEmail: true,
          status: true,
          employmentStatus: true,
          employmentEndedAt: true,
          employmentEndReason: true,
          archivedAt: true,
          isActivated: true,
          updatedAt: true,

          account: {
            select: {
              id: true,
              role: true,
              isEnabled: true,
            },
          },
        },
      });

      let revokedSessions = 0;

      if (employee.account) {
        await transaction.account.update({
          where: {
            id: employee.account.id,
          },

          data: {
            isEnabled: false,
          },
        });

        const sessionResult = await transaction.authSession.updateMany({
          where: {
            accountId: employee.account.id,

            revokedAt: null,
          },

          data: {
            revokedAt: now,
          },
        });

        revokedSessions = sessionResult.count;
      }

      await transaction.employeeLifecycleAction.create({
        data: {
          employeeId: employee.id,

          actorAccountId: user.accountId,

          action: lifecycleAction,

          previousEmployeeStatus: employee.status,

          newEmployeeStatus: EmployeeStatus.INACTIVE,

          previousEmploymentStatus: employee.employmentStatus,

          newEmploymentStatus: dto.employmentStatus,

          reason,

          effectiveAt,

          ipAddress,

          userAgent,

          metadata: {
            accountId: employee.account?.id ?? null,

            accountRole: employee.account?.role ?? null,

            revokedSessions,
          },
        },
      });

      return {
        employee: updatedEmployee,

        revokedSessions,
      };
    });

    return {
      message: `Employee employment marked as ${dto.employmentStatus.toLowerCase()} successfully.`,

      employee: result.employee,

      revokedSessions: result.revokedSessions,
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
            employmentStatus: true,
            archivedAt: true,

            account: {
              select: {
                id: true,
                role: true,
              },
            },
          },
        });

        if (!employee) {
          throw new NotFoundException('Employee was not found.');
        }

        if (employee.account?.role === AccountRole.SUPER_ADMIN) {
          throw new ForbiddenException(
            'Super Admin status cannot be changed through this process.',
          );
        }

        /*
         * Resigned, retired, terminated and transferred
         * employees cannot be reactivated as normal accounts.
         */
        if (
          status === EmployeeStatus.ACTIVE &&
          employee.employmentStatus !== EmploymentStatus.ACTIVE
        ) {
          throw new ConflictException(
            'Employment has ended. This account cannot be reactivated.',
          );
        }

        if (status === EmployeeStatus.ACTIVE && employee.archivedAt) {
          throw new ConflictException(
            'An archived account cannot be reactivated.',
          );
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
