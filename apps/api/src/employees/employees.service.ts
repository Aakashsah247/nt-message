import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { ConversationsService } from '../conversations/conversations.service';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRequestActionType,
  AccountRequestStatus,
  AccountRole,
  EmployeeLifecycleActionType,
  EmployeeStatus,
  EmploymentStatus,
  ManagementPositionType,
} from '../generated/prisma/client';

import type { Prisma } from '../generated/prisma/client';

import { resolveOrCreateVacantManagementPosition } from '../management-assignments/management-position-resolver';

import { ArchiveEmployeeDto } from './dto/archive-employee.dto';
import { ChangeEmployeeRoleDto } from './dto/change-employee-role.dto';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
  ) {}

  private async synchronizeOfficialGroups(
    accountId: string | null | undefined,
    actorAccountId: string | null,
    reason: string,
  ): Promise<void> {
    await this.conversationsService.synchronizeOfficialGroupsForAccountSafely(
      accountId,
      actorAccountId,
      reason,
    );
  }

  private async validateDivisionAssignment(divisionId: string) {
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

    return division;
  }

  private async validateOrganizationAssignment(
    divisionId: string,
    departmentId: string,
  ) {
    const division = await this.validateDivisionAssignment(divisionId);

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

  private async validateRoleOrganizationAssignment(
    role: AccountRole,
    divisionId: string,
    departmentId?: string,
  ) {
    if (role === AccountRole.SENIOR_MANAGEMENT) {
      if (departmentId) {
        throw new BadRequestException(
          'Senior Management must be assigned to a division without a department.',
        );
      }

      return {
        division: await this.validateDivisionAssignment(divisionId),
        department: null,
      };
    }

    if (!departmentId) {
      throw new BadRequestException(
        'Department ID is required for Team Manager and Employee accounts.',
      );
    }

    return this.validateOrganizationAssignment(divisionId, departmentId);
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

    const { division, department } =
      await this.validateRoleOrganizationAssignment(
        requestedRole,
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
      let managementPositionId: string | null = null;

      if (requestedRole !== AccountRole.EMPLOYEE) {
        const position = await resolveOrCreateVacantManagementPosition(
          transaction,
          {
            requestedRole,

            divisionId: division.id,

            departmentId: department?.id ?? null,

            suppliedManagementPositionId: dto.managementPositionId ?? null,
          },
        );

        managementPositionId = position.id;
      } else if (dto.managementPositionId) {
        throw new BadRequestException(
          'A normal employee account must not reference a management position.',
        );
      }

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

          ...(department
            ? {
                departmentUnit: {
                  connect: {
                    id: department.id,
                  },
                },
              }
            : {}),

          /*
           * Temporary compatibility field.
           * This will be removed after all
           * organization data is migrated.
           */
          department: department?.name ?? null,

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

          departmentId: department?.id ?? null,

          managementPositionId,

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
          managementPositionId: true,
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

      if (managementPositionId) {
        /*
         * The employee, approved request and reservation are
         * committed together or completely rolled back.
         */
        const reservationClaim =
          await transaction.managementPosition.updateMany({
            where: {
              id: managementPositionId,
              isActive: true,
              reservedByAccountRequestId: null,

              assignments: {
                none: {
                  endedAt: null,
                },
              },
            },

            data: {
              reservedByAccountRequestId: accountRequest.id,
            },
          });

        if (reservationClaim.count !== 1) {
          throw new ConflictException(
            'The selected management position is no longer vacant.',
          );
        }
      }

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

              managementPositionId,
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

              managementPositionId,

              divisionId: division.id,

              departmentId: department?.id ?? null,
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

    await this.synchronizeOfficialGroups(
      employee.account?.id,
      null,
      'EMPLOYEE_PROFILE_UPDATED',
    );

    return {
      message: 'Employee updated successfully.',
      employee: updatedEmployee,
    };
  }

  async changeEmployeeRole(
    user: AuthenticatedUser,
    id: string,
    dto: ChangeEmployeeRoleDto,
    metadata: EmployeeLifecycleMetadata,
  ) {
    if (user.role !== AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only the Super Admin can change an employee role.',
      );
    }

    if (dto.targetRole === AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'The Super Admin role cannot be assigned through this process.',
      );
    }

    const reason = dto.reason.trim().replace(/\s+/g, ' ');

    if (reason.length < 3) {
      throw new BadRequestException(
        'Role-change reason must contain at least 3 characters.',
      );
    }

    const designation =
      dto.designation !== undefined
        ? dto.designation.trim().replace(/\s+/g, ' ')
        : undefined;

    if (designation !== undefined && designation.length < 2) {
      throw new BadRequestException(
        'Designation must contain at least 2 characters.',
      );
    }

    const { division, department } =
      await this.validateRoleOrganizationAssignment(
        dto.targetRole,
        dto.divisionId,
        dto.departmentId,
      );

    const roleRank: Partial<Record<AccountRole, number>> = {
      [AccountRole.EMPLOYEE]: 1,
      [AccountRole.TEAM_MANAGER]: 2,
      [AccountRole.SENIOR_MANAGEMENT]: 3,
    };

    const targetRank = roleRank[dto.targetRole];

    if (targetRank === undefined) {
      throw new BadRequestException(
        'The selected target role is not supported.',
      );
    }

    const now = new Date();

    const ipAddress = metadata.ipAddress?.slice(0, 45) || null;

    const userAgent = metadata.userAgent?.slice(0, 500) || null;

    try {
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
            designation: true,
            divisionId: true,
            departmentId: true,
            status: true,
            employmentStatus: true,
            archivedAt: true,
            isActivated: true,

            account: {
              select: {
                id: true,
                role: true,
                isEnabled: true,
              },
            },

            managementAssignments: {
              where: {
                endedAt: null,
              },

              take: 1,

              orderBy: {
                startedAt: 'desc',
              },

              select: {
                id: true,
                positionId: true,
                startedAt: true,

                position: {
                  select: {
                    positionType: true,
                    divisionId: true,
                    departmentId: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        });

        if (!employee) {
          throw new NotFoundException('Employee was not found.');
        }

        if (employee.status !== EmployeeStatus.ACTIVE) {
          throw new ConflictException(
            'Only an active employee can have their role changed.',
          );
        }

        if (employee.employmentStatus !== EmploymentStatus.ACTIVE) {
          throw new ConflictException(
            'A former employee cannot have their role changed.',
          );
        }

        if (employee.archivedAt) {
          throw new ConflictException(
            'An archived employee cannot have their role changed.',
          );
        }

        if (!employee.isActivated || !employee.account) {
          throw new ConflictException(
            'The employee must activate their account before a role change.',
          );
        }

        if (employee.account.role === AccountRole.SUPER_ADMIN) {
          throw new ForbiddenException(
            'The Super Admin role cannot be changed through this process.',
          );
        }

        const currentAssignment = employee.managementAssignments[0] ?? null;

        /*
         * Authority is derived from the active
         * management assignment.
         */
        let previousEffectiveRole: AccountRole = AccountRole.EMPLOYEE;

        if (
          currentAssignment?.position.isActive &&
          currentAssignment.position.positionType ===
            ManagementPositionType.SENIOR_MANAGEMENT &&
          currentAssignment.position.divisionId === employee.divisionId &&
          currentAssignment.position.departmentId === null
        ) {
          previousEffectiveRole = AccountRole.SENIOR_MANAGEMENT;
        } else if (
          currentAssignment?.position.isActive &&
          currentAssignment.position.positionType ===
            ManagementPositionType.TEAM_MANAGER &&
          currentAssignment.position.divisionId === employee.divisionId &&
          currentAssignment.position.departmentId === employee.departmentId
        ) {
          previousEffectiveRole = AccountRole.TEAM_MANAGER;
        }

        const previousRank = roleRank[previousEffectiveRole];

        if (previousRank === undefined) {
          throw new BadRequestException(
            'The employee current role is not supported.',
          );
        }

        let targetManagementPosition: {
          id: string;
          positionType: ManagementPositionType;
          divisionId: string;
          departmentId: string | null;
        } | null = null;

        if (dto.targetRole === AccountRole.EMPLOYEE) {
          if (dto.managementPositionId) {
            throw new BadRequestException(
              'A normal employee role must not reference a management position.',
            );
          }
        } else {
          const position = await resolveOrCreateVacantManagementPosition(
            transaction,
            {
              requestedRole: dto.targetRole,

              divisionId: division.id,

              departmentId: department?.id ?? null,

              suppliedManagementPositionId: dto.managementPositionId ?? null,

              allowEmployeeId: employee.id,
            },
          );

          targetManagementPosition = {
            id: position.id,

            positionType: position.positionType,

            divisionId: position.divisionId,

            departmentId: position.departmentId,
          };
        }

        const sameOrganization =
          employee.divisionId === division.id &&
          employee.departmentId === (department?.id ?? null);

        const samePosition =
          currentAssignment?.positionId === targetManagementPosition?.id;

        if (
          employee.account.role === dto.targetRole &&
          previousEffectiveRole === dto.targetRole &&
          sameOrganization &&
          (dto.targetRole === AccountRole.EMPLOYEE || samePosition)
        ) {
          throw new ConflictException(
            'The employee already has the selected role and organization assignment.',
          );
        }

        /*
         * Claim the exact target vacancy before
         * ending the employee's current assignment.
         *
         * A competing reservation or appointment
         * will cause this claim to affect zero rows.
         */
        if (targetManagementPosition && !samePosition) {
          const targetClaim = await transaction.managementPosition.updateMany({
            where: {
              id: targetManagementPosition.id,

              isActive: true,

              reservedByAccountRequestId: null,

              assignments: {
                none: {
                  endedAt: null,
                },
              },
            },

            data: {
              updatedAt: now,
            },
          });

          if (targetClaim.count !== 1) {
            throw new ConflictException(
              'The selected management position is no longer vacant.',
            );
          }
        }

        const lifecycleAction =
          targetRank > previousRank
            ? EmployeeLifecycleActionType.PROMOTED
            : targetRank < previousRank
              ? EmployeeLifecycleActionType.DEMOTED
              : EmployeeLifecycleActionType.TRANSFERRED;

        const previousAccountRole = employee.account.role;

        const previousDivisionId = employee.divisionId;

        const previousDepartmentId = employee.departmentId;

        const previousDesignation = employee.designation;

        const previousManagementPositionId =
          currentAssignment?.positionId ?? null;

        /*
         * Release the old position inside the
         * same transaction as the new appointment.
         */
        const endedManagementAssignments =
          await transaction.managementAssignment.updateMany({
            where: {
              employeeId: employee.id,

              endedAt: null,
            },

            data: {
              endedAt: now,

              endedByAccountId: user.accountId,

              endReason: reason,
            },
          });

        await transaction.account.update({
          where: {
            id: employee.account.id,
          },

          data: {
            role: dto.targetRole,
          },
        });

        const updatedEmployee = await transaction.employee.update({
          where: {
            id: employee.id,
          },

          data: {
            division: {
              connect: {
                id: division.id,
              },
            },

            departmentUnit: department
              ? {
                  connect: {
                    id: department.id,
                  },
                }
              : {
                  disconnect: true,
                },

            department: department?.name ?? null,

            ...(designation !== undefined
              ? {
                  designation,
                }
              : {}),
          },

          select: {
            id: true,
            empId: true,
            empName: true,
            officialEmail: true,
            designation: true,
            divisionId: true,
            departmentId: true,
            status: true,
            employmentStatus: true,
            isActivated: true,
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
                role: true,
                isEnabled: true,
              },
            },
          },
        });

        let newManagementAssignmentId: string | null = null;

        if (targetManagementPosition) {
          const newManagementAssignment =
            await transaction.managementAssignment.create({
              data: {
                positionId: targetManagementPosition.id,

                employeeId: employee.id,

                assignedByAccountId: user.accountId,

                startedAt: now,

                assignmentReason: reason,
              },

              select: {
                id: true,
              },
            });

          newManagementAssignmentId = newManagementAssignment.id;
        }

        /*
         * Old sessions may contain the previous
         * role or organization scope.
         */
        const revokedSessions = await transaction.authSession.updateMany({
          where: {
            accountId: employee.account.id,

            revokedAt: null,
          },

          data: {
            revokedAt: now,
          },
        });

        await transaction.employeeLifecycleAction.create({
          data: {
            employeeId: employee.id,

            actorAccountId: user.accountId,

            action: lifecycleAction,

            previousEmployeeStatus: employee.status,

            newEmployeeStatus: employee.status,

            previousEmploymentStatus: employee.employmentStatus,

            newEmploymentStatus: employee.employmentStatus,

            reason,
            effectiveAt: now,
            ipAddress,
            userAgent,

            metadata: {
              previousAccountRole,

              previousEffectiveRole,

              newRole: dto.targetRole,

              previousDivisionId,

              newDivisionId: division.id,

              previousDepartmentId,

              newDepartmentId: department?.id ?? null,

              previousDesignation,

              newDesignation: designation ?? previousDesignation,

              previousManagementPositionId,

              newManagementPositionId: targetManagementPosition?.id ?? null,

              accountId: employee.account.id,

              revokedSessions: revokedSessions.count,

              endedManagementAssignments: endedManagementAssignments.count,

              newManagementAssignmentId,
            },
          },
        });

        return {
          employee: updatedEmployee,

          lifecycleAction,

          revokedSessions: revokedSessions.count,

          previousManagementPositionId,

          newManagementPositionId: targetManagementPosition?.id ?? null,

          newManagementAssignmentId,
        };
      });

      await this.synchronizeOfficialGroups(
        result.employee.account?.id,
        user.accountId,
        'EMPLOYEE_ROLE_OR_SCOPE_CHANGED',
      );

      return {
        message:
          result.lifecycleAction === EmployeeLifecycleActionType.PROMOTED
            ? 'Employee promoted successfully.'
            : result.lifecycleAction === EmployeeLifecycleActionType.DEMOTED
              ? 'Employee demoted successfully.'
              : 'Employee transferred successfully.',

        employee: result.employee,

        action: result.lifecycleAction,

        revokedSessions: result.revokedSessions,

        previousManagementPositionId: result.previousManagementPositionId,

        newManagementPositionId: result.newManagementPositionId,

        newManagementAssignmentId: result.newManagementAssignmentId,
      };
    } catch (error: unknown) {
      /*
       * The database's active-assignment unique
       * indexes are the final concurrency guard.
       */
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'The selected management position is no longer vacant.',
        );
      }

      throw error;
    }
  }

  async getEmployeeLifecycleHistory(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        id,
      },

      select: {
        id: true,
        empId: true,
        empName: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee was not found.');
    }

    const actions = await this.prisma.employeeLifecycleAction.findMany({
      where: {
        employeeId: id,
      },

      orderBy: {
        createdAt: 'desc',
      },

      select: {
        id: true,
        action: true,

        previousEmployeeStatus: true,

        newEmployeeStatus: true,

        previousEmploymentStatus: true,

        newEmploymentStatus: true,

        reason: true,
        effectiveAt: true,
        ipAddress: true,
        userAgent: true,
        metadata: true,
        createdAt: true,

        actor: {
          select: {
            id: true,
            username: true,
            role: true,

            employee: {
              select: {
                empId: true,
                empName: true,
              },
            },
          },
        },
      },
    });

    return {
      employee,
      data: actions,
    };
  }

  async archiveEmployee(
    user: AuthenticatedUser,
    id: string,
    dto: ArchiveEmployeeDto,
    metadata: EmployeeLifecycleMetadata,
  ) {
    if (user.role !== AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only the Super Admin can archive an employee record.',
      );
    }

    const reason = dto.reason.trim().replace(/\s+/g, ' ');

    if (reason.length < 3) {
      throw new BadRequestException(
        'Archive reason must contain at least 3 characters.',
      );
    }

    const now = new Date();

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
          'The Super Admin record cannot be archived.',
        );
      }

      if (employee.employmentStatus === EmploymentStatus.ACTIVE) {
        throw new ConflictException(
          'Active employees cannot be archived. End employment first.',
        );
      }

      if (employee.archivedAt) {
        throw new ConflictException(
          'This employee record is already archived.',
        );
      }

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

      /*
       * Archived records remain stored for
       * audit, messages and historical reporting.
       */
      const updatedEmployee = await transaction.employee.update({
        where: {
          id: employee.id,
        },

        data: {
          status: EmployeeStatus.INACTIVE,

          archivedAt: now,
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

      await transaction.employeeLifecycleAction.create({
        data: {
          employeeId: employee.id,

          actorAccountId: user.accountId,

          action: EmployeeLifecycleActionType.ARCHIVED,

          previousEmployeeStatus: employee.status,

          newEmployeeStatus: EmployeeStatus.INACTIVE,

          previousEmploymentStatus: employee.employmentStatus,

          newEmploymentStatus: employee.employmentStatus,

          reason,

          effectiveAt: now,

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

    await this.synchronizeOfficialGroups(
      result.employee.account?.id,
      user.accountId,
      'EMPLOYEE_ARCHIVED',
    );

    return {
      message: 'Former employee record archived successfully.',

      employee: result.employee,

      revokedSessions: result.revokedSessions,
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

      const activeManagementAssignments =
        await transaction.managementAssignment.findMany({
          where: {
            employeeId: employee.id,
            endedAt: null,
          },

          select: {
            startedAt: true,
          },
        });

      const assignmentStartingAfterEffectiveDate =
        activeManagementAssignments.find(
          (assignment) =>
            assignment.startedAt.getTime() > effectiveAt.getTime(),
        );

      if (assignmentStartingAfterEffectiveDate) {
        throw new BadRequestException(
          'Employment end date cannot be earlier than the active management assignment start time.',
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

      const endedManagementAssignments =
        await transaction.managementAssignment.updateMany({
          where: {
            employeeId: employee.id,

            endedAt: null,
          },

          data: {
            endedAt: effectiveAt,

            endedByAccountId: user.accountId,

            endReason: reason,
          },
        });

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

            endedManagementAssignments: endedManagementAssignments.count,
          },
        },
      });

      return {
        employee: updatedEmployee,

        revokedSessions,
      };
    });

    await this.synchronizeOfficialGroups(
      result.employee.account?.id,
      user.accountId,
      'EMPLOYMENT_ENDED',
    );

    return {
      message: `Employee employment marked as ${dto.employmentStatus.toLowerCase()} successfully.`,

      employee: result.employee,

      revokedSessions: result.revokedSessions,
    };
  }

  async updateEmployeeStatus(
    user: AuthenticatedUser,
    id: string,
    status: EmployeeStatus,
    metadata: EmployeeLifecycleMetadata,
  ) {
    if (user.role !== AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only the Super Admin can change employee access status.',
      );
    }

    const now = new Date();

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
          'Super Admin status cannot be changed through this process.',
        );
      }

      /*
       * Temporary suspension is allowed only
       * while employment remains active.
       */
      if (employee.employmentStatus !== EmploymentStatus.ACTIVE) {
        throw new ConflictException(
          'Employment has ended. Access status cannot be changed.',
        );
      }

      if (employee.archivedAt) {
        throw new ConflictException('An archived account cannot be changed.');
      }

      if (employee.status === status) {
        throw new ConflictException(
          status === EmployeeStatus.ACTIVE
            ? 'The employee account is already active.'
            : 'The employee account is already suspended.',
        );
      }

      const updatedEmployee = await transaction.employee.update({
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
          employmentStatus: true,
          isActivated: true,
          updatedAt: true,
        },
      });

      let revokedSessions = 0;

      if (employee.account) {
        await transaction.account.update({
          where: {
            id: employee.account.id,
          },

          data: {
            isEnabled: status === EmployeeStatus.ACTIVE,
          },
        });

        if (status === EmployeeStatus.INACTIVE) {
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
      }

      const lifecycleAction =
        status === EmployeeStatus.ACTIVE
          ? EmployeeLifecycleActionType.REACTIVATED
          : EmployeeLifecycleActionType.SUSPENDED;

      await transaction.employeeLifecycleAction.create({
        data: {
          employeeId: employee.id,

          actorAccountId: user.accountId,

          action: lifecycleAction,

          previousEmployeeStatus: employee.status,

          newEmployeeStatus: status,

          previousEmploymentStatus: employee.employmentStatus,

          newEmploymentStatus: employee.employmentStatus,

          effectiveAt: now,

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

        accountId: employee.account?.id ?? null,

        revokedSessions,
      };
    });

    await this.synchronizeOfficialGroups(
      result.accountId,
      user.accountId,
      status === EmployeeStatus.ACTIVE
        ? 'EMPLOYEE_REACTIVATED'
        : 'EMPLOYEE_SUSPENDED',
    );

    return {
      message:
        status === EmployeeStatus.ACTIVE
          ? 'Employee reactivated successfully.'
          : 'Employee suspended successfully.',

      employee: result.employee,

      revokedSessions: result.revokedSessions,
    };
  }
}
