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
  OrgLeadershipType,
  OrgMembershipType,
} from '../generated/prisma/client';

import type { Prisma } from '../generated/prisma/client';

import {
  DirectoryAccountStatus,
  DirectoryActivationStatus,
  DirectoryRecordStatus,
  ListDirectoryQueryDto,
} from './dto/list-directory-query.dto';

export type DirectoryScopeType = 'OFFICE' | 'ORG_UNIT';

export interface DirectoryOrganizationUnit {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

interface DirectoryViewer {
  role: AccountRole;
  scopeType: DirectoryScopeType;
  officeId: string | null;
  orgUnitId: string | null;
  office: DirectoryOrganizationUnit | null;
  orgUnit: DirectoryOrganizationUnit | null;
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

  orgMemberships: {
    where: {
      membershipType: OrgMembershipType.PRIMARY,
      endsAt: null,
    },
    orderBy: {
      startsAt: 'desc',
    },
    take: 5,
    select: {
      id: true,
      startsAt: true,
      office: {
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
        },
      },
      orgUnit: {
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
          ancestorLinks: {
            orderBy: {
              depth: 'desc',
            },
            select: {
              depth: true,
              ancestorOrgUnit: {
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
    },
  },

  orgLeadershipAssignments: {
    where: {
      effectiveUntil: null,
    },
    orderBy: {
      effectiveFrom: 'desc',
    },
    take: 20,
    select: {
      id: true,
      leadershipType: true,
      isActing: true,
      effectiveFrom: true,
      effectiveUntil: true,
      office: {
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
        },
      },
      orgUnit: {
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
        },
      },
    },
  },

  operationalTeamLeadAssignments: {
    where: { effectiveUntil: null },
    orderBy: { effectiveFrom: 'desc' },
    take: 20,
    select: {
      id: true,
      isActing: true,
      effectiveFrom: true,
      effectiveUntil: true,
      team: {
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
          orgUnit: {
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
    const now = new Date();
    const account = await this.prisma.account.findUnique({
      where: { id: user.accountId },
      select: {
        id: true,
        role: true,
        isEnabled: true,
        employee: {
          select: {
            id: true,
            status: true,
            isActivated: true,
            orgMemberships: {
              where: {
                membershipType: OrgMembershipType.PRIMARY,
                startsAt: { lte: now },
                OR: [{ endsAt: null }, { endsAt: { gt: now } }],
              },
              orderBy: { startsAt: 'desc' },
              take: 1,
              select: {
                officeId: true,
                orgUnitId: true,
                office: {
                  select: { id: true, code: true, name: true, isActive: true },
                },
                orgUnit: {
                  select: { id: true, code: true, name: true, isActive: true },
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
        scopeType: 'OFFICE',
        officeId: null,
        orgUnitId: null,
        office: null,
        orgUnit: null,
        canViewContactDetails: true,
      };
    }

    const employee = account.employee;
    const primaryMembership = employee?.orgMemberships[0] ?? null;
    if (
      !employee ||
      employee.status !== EmployeeStatus.ACTIVE ||
      !employee.isActivated ||
      !primaryMembership ||
      !primaryMembership.office.isActive
    ) {
      throw new ForbiddenException(
        'Your account does not have an active Office membership.',
      );
    }

    return {
      role: account.role,
      scopeType: 'OFFICE',
      officeId: primaryMembership.officeId,
      orgUnitId: primaryMembership.orgUnitId,
      office: primaryMembership.office,
      orgUnit: primaryMembership.orgUnit,
      canViewContactDetails: account.role !== AccountRole.EMPLOYEE,
    };
  }

  private async validateRequestedScope(
    viewer: DirectoryViewer,
    _query: ListDirectoryQueryDto,
  ): Promise<void> {
    if (viewer.role !== AccountRole.SUPER_ADMIN && !viewer.officeId) {
      throw new ForbiddenException('Your directory scope has no active Office.');
    }
  }

  private buildScopeConditions(
    viewer: DirectoryViewer,
  ): Prisma.EmployeeWhereInput[] {
    const conditions: Prisma.EmployeeWhereInput[] = [];
    const now = new Date();

    if (viewer.officeId) {
      conditions.push({
        orgMemberships: {
          some: {
            officeId: viewer.officeId,
            membershipType: OrgMembershipType.PRIMARY,
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          },
        },
      });
    }

    if (viewer.role === AccountRole.EMPLOYEE) {
      conditions.push({
        status: EmployeeStatus.ACTIVE,
        isActivated: true,
        account: { is: { isEnabled: true } },
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

    const currentAssignment = employee.managementAssignments[0] ?? null;

    const currentPosition = currentAssignment
      ? {
          assignmentId: currentAssignment.id,

          startedAt: currentAssignment.startedAt,

          id: currentAssignment.position.id,

          positionType: currentAssignment.position.positionType,

          divisionId: currentAssignment.position.divisionId,

          departmentId: currentAssignment.position.departmentId,

          isActive: currentAssignment.position.isActive,

          status: currentAssignment.position.isActive ? 'ACTIVE' : 'INACTIVE',

          division: currentAssignment.position.division,

          department: currentAssignment.position.department,
        }
      : null;

    /*
     * Management authority comes from a valid active
     * assignment, not merely from the stored account role.
     */
    let effectiveRole: AccountRole | null = employee.account?.role ?? null;

    if (effectiveRole !== AccountRole.SUPER_ADMIN) {
      if (
        currentPosition?.isActive &&
        currentPosition.positionType ===
          ManagementPositionType.SENIOR_MANAGEMENT &&
        currentPosition.divisionId === employee.divisionId &&
        currentPosition.departmentId === null
      ) {
        effectiveRole = AccountRole.SENIOR_MANAGEMENT;
      } else if (
        currentPosition?.isActive &&
        currentPosition.positionType === ManagementPositionType.TEAM_MANAGER &&
        currentPosition.divisionId === employee.divisionId &&
        currentPosition.departmentId === employee.departmentId
      ) {
        effectiveRole = AccountRole.TEAM_MANAGER;
      } else if (employee.account) {
        effectiveRole = AccountRole.EMPLOYEE;
      }
    }

    const now = new Date();
    const primaryMembership = employee.orgMemberships.find(
      (membership) => membership.startsAt <= now,
    ) ?? null;

    const breadcrumb = primaryMembership?.orgUnit
      ? primaryMembership.orgUnit.ancestorLinks
          .map((link) => link.ancestorOrgUnit)
          .filter((unit, index, units) =>
            units.findIndex((candidate) => candidate.id === unit.id) === index,
          )
      : [];

    const leadership = employee.orgLeadershipAssignments
      .filter((assignment) => assignment.effectiveFrom <= now)
      .map((assignment) => ({
        id: assignment.id,
        type: assignment.leadershipType,
        isActing: assignment.isActing,
        effectiveFrom: assignment.effectiveFrom,
        effectiveUntil: assignment.effectiveUntil,
        office: assignment.office,
        orgUnit: assignment.orgUnit,
      }));

    for (const assignment of employee.operationalTeamLeadAssignments) {
      if (assignment.effectiveFrom > now) continue;
      leadership.push({
        id: assignment.id,
        type: OrgLeadershipType.TEAM_LEAD,
        isActing: assignment.isActing,
        effectiveFrom: assignment.effectiveFrom,
        effectiveUntil: assignment.effectiveUntil,
        office: primaryMembership?.office ?? { id: '', code: '', name: '', isActive: false },
        orgUnit: assignment.team.orgUnit,
      });
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

      office: primaryMembership?.office ?? null,
      primaryOrgUnit: primaryMembership?.orgUnit
        ? {
            id: primaryMembership.orgUnit.id,
            code: primaryMembership.orgUnit.code,
            name: primaryMembership.orgUnit.name,
            isActive: primaryMembership.orgUnit.isActive,
          }
        : null,
      orgUnitBreadcrumb: breadcrumb,
      leadership,

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
      role: employee.account?.role ?? null,

      accountRole: employee.account?.role ?? null,

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
      office: viewer.office,
      orgUnit: viewer.orgUnit,
      division: null,
      department: null,
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

        divisionId: null,

        departmentId: null,
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
