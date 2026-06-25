import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';

import {
  AccountRole,
  EmployeeStatus,
  ManagementPositionType,
} from '../generated/prisma/client';

import type { Prisma } from '../generated/prisma/client';

import {
  DirectoryAccountStatus,
  DirectoryActivationStatus,
  DirectoryRecordStatus,
  ListDirectoryQueryDto,
} from './dto/list-directory-query.dto';

export type DirectoryScopeType = 'ORGANIZATION' | 'DIVISION' | 'DEPARTMENT';

export interface DirectoryOrganizationUnit {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

interface DirectoryViewer {
  role: AccountRole;
  scopeType: DirectoryScopeType;
  divisionId: string | null;
  departmentId: string | null;
  division: DirectoryOrganizationUnit | null;
  department: DirectoryOrganizationUnit | null;
  canViewContactDetails: boolean;
}

const directoryEmployeeSelect = {
  id: true,
  empId: true,
  empName: true,
  phoneNumber: true,
  officialEmail: true,
  divisionId: true,
  departmentId: true,
  designation: true,
  status: true,
  employmentStatus: true,
  employmentEndedAt: true,
  employmentEndReason: true,
  archivedAt: true,
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
      divisionId: true,
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

  /*
   * A current assignment is one that has not ended.
   * The position itself may still be active or inactive,
   * so its state is returned separately.
   */
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
      startedAt: true,

      position: {
        select: {
          id: true,
          positionType: true,
          divisionId: true,
          departmentId: true,
          isActive: true,

          division: {
            select: {
              id: true,
              code: true,
              name: true,
              isActive: true,
            },
          },

          department: {
            select: {
              id: true,
              code: true,
              name: true,
              isActive: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.EmployeeSelect;

type DirectoryEmployeeRecord = Prisma.EmployeeGetPayload<{
  select: typeof directoryEmployeeSelect;
}>;

@Injectable()
export class DirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  private async getViewer(user: AuthenticatedUser): Promise<DirectoryViewer> {
    const account = await this.prisma.account.findUnique({
      where: {
        id: user.accountId,
      },

      select: {
        id: true,
        role: true,
        isEnabled: true,

        employee: {
          select: {
            id: true,
            status: true,
            isActivated: true,
            divisionId: true,
            departmentId: true,

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
                divisionId: true,
                code: true,
                name: true,
                isActive: true,
              },
            },

            managementAssignments: {
              where: {
                endedAt: null,

                position: {
                  is: {
                    isActive: true,
                  },
                },
              },

              take: 1,

              orderBy: {
                startedAt: 'desc',
              },

              select: {
                id: true,

                position: {
                  select: {
                    id: true,
                    positionType: true,
                    divisionId: true,
                    departmentId: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!account || !account.isEnabled || account.role !== user.role) {
      throw new ForbiddenException(
        'Your authenticated account cannot access the employee directory.',
      );
    }

    if (account.role === AccountRole.SUPER_ADMIN) {
      return {
        role: account.role,
        scopeType: 'ORGANIZATION',
        divisionId: null,
        departmentId: null,
        division: null,
        department: null,
        canViewContactDetails: true,
      };
    }

    const employee = account.employee;

    if (
      !employee ||
      employee.status !== EmployeeStatus.ACTIVE ||
      !employee.isActivated
    ) {
      throw new ForbiddenException(
        'Your account does not have an active employee identity.',
      );
    }

    if (
      !employee.divisionId ||
      !employee.division ||
      !employee.division.isActive
    ) {
      throw new ForbiddenException(
        'Your account does not have an active division assignment.',
      );
    }

    const activeManagementAssignment =
      employee.managementAssignments[0] ?? null;

    if (account.role === AccountRole.SENIOR_MANAGEMENT) {
      if (
        !activeManagementAssignment ||
        activeManagementAssignment.position.positionType !==
          ManagementPositionType.SENIOR_MANAGEMENT ||
        activeManagementAssignment.position.divisionId !==
          employee.divisionId ||
        activeManagementAssignment.position.departmentId !== null
      ) {
        throw new ForbiddenException(
          'Your Senior Management role does not have a valid active position assignment.',
        );
      }
      return {
        role: account.role,
        scopeType: 'DIVISION',
        divisionId: employee.divisionId,
        departmentId: null,
        division: employee.division,
        department: null,
        canViewContactDetails: true,
      };
    }

    if (
      !employee.departmentId ||
      !employee.departmentUnit ||
      !employee.departmentUnit.isActive ||
      employee.departmentUnit.divisionId !== employee.divisionId
    ) {
      throw new ForbiddenException(
        'Your account does not have a valid active department assignment.',
      );
    }

    if (account.role === AccountRole.TEAM_MANAGER) {
      if (
        !activeManagementAssignment ||
        activeManagementAssignment.position.positionType !==
          ManagementPositionType.TEAM_MANAGER ||
        activeManagementAssignment.position.divisionId !==
          employee.divisionId ||
        activeManagementAssignment.position.departmentId !==
          employee.departmentId
      ) {
        throw new ForbiddenException(
          'Your Team Manager role does not have a valid active position assignment.',
        );
      }

      return {
        role: account.role,
        scopeType: 'DEPARTMENT',
        divisionId: employee.divisionId,
        departmentId: employee.departmentId,
        division: employee.division,
        department: employee.departmentUnit,
        canViewContactDetails: true,
      };
    }

    if (account.role === AccountRole.EMPLOYEE) {
      return {
        role: account.role,
        scopeType: 'ORGANIZATION',
        divisionId: employee.divisionId,
        departmentId: employee.departmentId,
        division: employee.division,
        department: employee.departmentUnit,
        canViewContactDetails: false,
      };
    }

    throw new ForbiddenException(
      'Your role cannot access the employee directory.',
    );
  }

  private async validateRequestedScope(
    viewer: DirectoryViewer,
    query: ListDirectoryQueryDto,
  ): Promise<void> {
    if (
      viewer.scopeType === 'DIVISION' &&
      query.divisionId &&
      query.divisionId !== viewer.divisionId
    ) {
      throw new ForbiddenException(
        'You can view employees only inside your assigned division.',
      );
    }

    if (
      viewer.scopeType === 'DEPARTMENT' &&
      query.divisionId &&
      query.divisionId !== viewer.divisionId
    ) {
      throw new ForbiddenException(
        'You can view employees only inside your assigned division.',
      );
    }

    if (
      viewer.scopeType === 'DEPARTMENT' &&
      query.departmentId &&
      query.departmentId !== viewer.departmentId
    ) {
      throw new ForbiddenException(
        'You can view employees only inside your assigned department.',
      );
    }

    if (viewer.scopeType === 'DIVISION' && query.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: {
          id: query.departmentId,
        },

        select: {
          id: true,
          divisionId: true,
          isActive: true,
        },
      });

      if (!department) {
        throw new NotFoundException('Department was not found.');
      }

      if (department.divisionId !== viewer.divisionId) {
        throw new ForbiddenException(
          'You can view departments only inside your assigned division.',
        );
      }
    }
  }

  private buildScopeConditions(
    viewer: DirectoryViewer,
  ): Prisma.EmployeeWhereInput[] {
    const conditions: Prisma.EmployeeWhereInput[] = [];

    if (viewer.scopeType === 'DIVISION') {
      conditions.push({
        divisionId: viewer.divisionId,
      });
    }

    if (viewer.scopeType === 'DEPARTMENT') {
      conditions.push({
        divisionId: viewer.divisionId,

        departmentId: viewer.departmentId,
      });
    }

    /*
     * Regular employees can view only active,
     * activated and enabled directory members.
     * Contact information is removed later.
     */
    if (viewer.role === AccountRole.EMPLOYEE) {
      conditions.push({
        status: EmployeeStatus.ACTIVE,

        isActivated: true,

        account: {
          is: {
            isEnabled: true,
          },
        },
      });
    }

    return conditions;
  }

  private serializeEmployee(
    employee: DirectoryEmployeeRecord,
    viewer: DirectoryViewer,
  ) {
    const accountStatus = !employee.account
      ? 'NO_ACCOUNT'
      : employee.account.isEnabled
        ? 'ENABLED'
        : 'DISABLED';

    const currentAssignment =
      employee.managementAssignments[0] ??
      null;

    const currentPosition =
      currentAssignment
        ? {
            assignmentId:
              currentAssignment.id,

            startedAt:
              currentAssignment.startedAt,

            id:
              currentAssignment.position.id,

            positionType:
              currentAssignment.position
                .positionType,

            divisionId:
              currentAssignment.position
                .divisionId,

            departmentId:
              currentAssignment.position
                .departmentId,

            isActive:
              currentAssignment.position
                .isActive,

            status:
              currentAssignment.position
                .isActive
                ? 'ACTIVE'
                : 'INACTIVE',

            division:
              currentAssignment.position
                .division,

            department:
              currentAssignment.position
                .department,
          }
        : null;

    /*
     * Management authority comes from a valid active
     * assignment, not merely from the stored account role.
     */
    let effectiveRole:
      AccountRole | null =
        employee.account?.role ?? null;

    if (
      effectiveRole !==
      AccountRole.SUPER_ADMIN
    ) {
      if (
        currentPosition?.isActive &&
        currentPosition.positionType ===
          ManagementPositionType.SENIOR_MANAGEMENT &&
        currentPosition.divisionId ===
          employee.divisionId &&
        currentPosition.departmentId ===
          null
      ) {
        effectiveRole =
          AccountRole.SENIOR_MANAGEMENT;
      } else if (
        currentPosition?.isActive &&
        currentPosition.positionType ===
          ManagementPositionType.TEAM_MANAGER &&
        currentPosition.divisionId ===
          employee.divisionId &&
        currentPosition.departmentId ===
          employee.departmentId
      ) {
        effectiveRole =
          AccountRole.TEAM_MANAGER;
      } else if (employee.account) {
        effectiveRole =
          AccountRole.EMPLOYEE;
      }
    }

    return {
      id: employee.id,
      empId: employee.empId,
      empName: employee.empName,

      phoneNumber: viewer.canViewContactDetails ? employee.phoneNumber : null,

      officialEmail: viewer.canViewContactDetails
        ? employee.officialEmail
        : null,

      designation: employee.designation,

      status: employee.status,

      employmentStatus: employee.employmentStatus,

      employmentEndedAt: employee.employmentEndedAt,

      employmentEndReason: employee.employmentEndReason,

      archivedAt: employee.archivedAt,

      activationStatus: employee.isActivated
        ? 'ACTIVATED'
        : 'AWAITING_ACTIVATION',

      accountStatus,

      /*
       * role remains as a compatibility alias for
       * the stored account role.
       */
      role:
        employee.account?.role ?? null,

      accountRole:
        employee.account?.role ?? null,

      effectiveRole,

      currentPosition,

      division: employee.division,

      department: employee.departmentUnit
        ? {
            id: employee.departmentUnit.id,

            code: employee.departmentUnit.code,

            name: employee.departmentUnit.name,

            isActive: employee.departmentUnit.isActive,
          }
        : null,

      lastLoginAt: viewer.canViewContactDetails
        ? (employee.account?.lastLoginAt ?? null)
        : null,

      createdAt: employee.createdAt,

      updatedAt: employee.updatedAt,
    };
  }

  private serializeScope(viewer: DirectoryViewer) {
    return {
      role: viewer.role,
      type: viewer.scopeType,
      division: viewer.division,
      department: viewer.department,

      contactVisibility: viewer.canViewContactDetails ? 'FULL' : 'LIMITED',
    };
  }

  async listDirectory(user: AuthenticatedUser, query: ListDirectoryQueryDto) {
    const viewer = await this.getViewer(user);

    await this.validateRequestedScope(viewer, query);

    const conditions = this.buildScopeConditions(viewer);

    if (query.status) {
      conditions.push({
        status: query.status,
      });
    }

    if (query.employmentStatus) {
      conditions.push({
        employmentStatus: query.employmentStatus,
      });
    }

    // Archived records are separated from current records.
    if (query.recordStatus === DirectoryRecordStatus.ARCHIVED) {
      conditions.push({
        archivedAt: {
          not: null,
        },
      });
    } else {
      conditions.push({
        archivedAt: null,
      });
    }

    if (viewer.scopeType === 'ORGANIZATION' && query.divisionId) {
      conditions.push({
        divisionId: query.divisionId,
      });
    }

    if (viewer.scopeType !== 'DEPARTMENT' && query.departmentId) {
      conditions.push({
        departmentId: query.departmentId,
      });
    }

    if (viewer.scopeType === 'DIVISION' && query.departmentId) {
      conditions.push({
        departmentId: query.departmentId,
      });
    }

    if (query.role) {
      conditions.push({
        account: {
          is: {
            role: query.role,
          },
        },
      });
    }

    if (query.accountStatus === DirectoryAccountStatus.ENABLED) {
      conditions.push({
        account: {
          is: {
            isEnabled: true,
          },
        },
      });
    }

    if (query.accountStatus === DirectoryAccountStatus.DISABLED) {
      conditions.push({
        account: {
          is: {
            isEnabled: false,
          },
        },
      });
    }

    if (query.accountStatus === DirectoryAccountStatus.NO_ACCOUNT) {
      conditions.push({
        account: {
          is: null,
        },
      });
    }

    if (query.activationStatus === DirectoryActivationStatus.ACTIVATED) {
      conditions.push({
        isActivated: true,
      });
    }

    if (
      query.activationStatus === DirectoryActivationStatus.AWAITING_ACTIVATION
    ) {
      conditions.push({
        isActivated: false,
      });
    }

    const search = query.search?.trim();

    if (search) {
      const searchConditions: Prisma.EmployeeWhereInput[] = [
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
          designation: {
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
      ];

      if (viewer.canViewContactDetails) {
        searchConditions.push(
          {
            officialEmail: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            phoneNumber: {
              contains: search,
              mode: 'insensitive',
            },
          },
        );
      }

      conditions.push({
        OR: searchConditions,
      });
    }

    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where: Prisma.EmployeeWhereInput =
      conditions.length > 0
        ? {
            AND: conditions,
          }
        : {};

    const [employees, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        skip,
        take: limit,

        orderBy: [
          {
            empName: 'asc',
          },
          {
            empId: 'asc',
          },
        ],

        select: directoryEmployeeSelect,
      }),

      this.prisma.employee.count({
        where,
      }),
    ]);

    return {
      data: employees.map((employee) =>
        this.serializeEmployee(employee, viewer),
      ),

      scope: this.serializeScope(viewer),

      filters: {
        search: search ?? null,

        status: query.status ?? null,

        employmentStatus: query.employmentStatus ?? null,

        recordStatus: query.recordStatus,

        role: query.role ?? null,

        accountStatus: query.accountStatus ?? null,

        activationStatus: query.activationStatus ?? null,

        divisionId: query.divisionId ?? null,

        departmentId: query.departmentId ?? null,
      },

      pagination: {
        page,
        limit,
        total,

        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async getDirectoryEmployee(user: AuthenticatedUser, id: string) {
    const viewer = await this.getViewer(user);

    const conditions = this.buildScopeConditions(viewer);

    conditions.push({
      id,
    });

    const employee = await this.prisma.employee.findFirst({
      where: {
        AND: conditions,
      },

      select: directoryEmployeeSelect,
    });

    if (!employee) {
      throw new NotFoundException(
        'Directory employee was not found inside your authorized scope.',
      );
    }

    if (employee.archivedAt && viewer.role !== AccountRole.SUPER_ADMIN) {
      throw new NotFoundException(
        'Archived employee profiles are available only to the Super Admin.',
      );
    }

    return {
      employee: this.serializeEmployee(employee, viewer),

      scope: this.serializeScope(viewer),
    };
  }
}
