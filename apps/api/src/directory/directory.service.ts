import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';

import {
  AccountClass,
  EmployeeStatus,
  EmploymentStatus,
  OrgLeadershipType,
  OrgMembershipType,
} from '../generated/prisma/client';

import type { Prisma } from '../generated/prisma/client';
import {
  ORGANIZATION_ACCESS_CAPABILITIES,
  delegationGrantKeysForCapability,
} from '../organization/organization-capabilities';

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
  accountClass: AccountClass;
  scopeType: DirectoryScopeType;
  officeId: string | null;
  rootOrgUnitIds: string[];
  officeWide: boolean;
  office: DirectoryOrganizationUnit | null;
  orgUnit: DirectoryOrganizationUnit | null;
  canViewContactDetails: boolean;
  canViewAdministrativeMetadata: boolean;
}

const directoryEmployeeSelect = {
  id: true,
  empId: true,
  empName: true,
  phoneNumber: true,
  officialEmail: true,
  designation: true,
  profilePhotoKey: true,
  status: true,
  employmentStatus: true,
  employmentEndedAt: true,
  employmentEndReason: true,
  archivedAt: true,
  isActivated: true,
  createdAt: true,
  updatedAt: true,

  orgMemberships: {
    where: {
      membershipType: OrgMembershipType.PRIMARY,
    },
    orderBy: {
      startsAt: 'desc',
    },
    take: 10,
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
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
          orgUnitType: {
            select: { code: true, name: true },
          },
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
    orderBy: {
      effectiveFrom: 'desc',
    },
    take: 50,
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
          orgUnitType: {
            select: { code: true, name: true },
          },
        },
      },
    },
  },

  account: {
    select: {
      id: true,
      username: true,
      accountClass: true,
      isEnabled: true,
      lastLoginAt: true,
      createdAt: true,
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
        accountClass: true,
        isEnabled: true,
        employee: {
          select: {
            id: true,
            status: true,
            employmentStatus: true,
            archivedAt: true,
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
            orgLeadershipAssignments: {
              where: {
                leadershipType: {
                  in: [
                    OrgLeadershipType.OFFICE_HEAD,
                    OrgLeadershipType.ORG_UNIT_HEAD,
                  ],
                },
                effectiveFrom: { lte: now },
                OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
              },
              select: {
                officeId: true,
                orgUnitId: true,
                leadershipType: true,
              },
            },
          },
        },
      },
    });

    if (
      !account ||
      !account.isEnabled ||
      account.accountClass !== user.accountClass
    ) {
      throw new ForbiddenException(
        'Your authenticated account cannot access the employee directory.',
      );
    }

    if (account.accountClass === AccountClass.SUPER_ADMIN) {
      return {
        accountClass: account.accountClass,
        scopeType: 'OFFICE',
        officeId: null,
        rootOrgUnitIds: [],
        officeWide: true,
        office: null,
        orgUnit: null,
        canViewContactDetails: true,
        canViewAdministrativeMetadata: true,
      };
    }

    const employee = account.employee;
    const primaryMembership = employee?.orgMemberships[0] ?? null;
    if (
      !employee ||
      employee.status !== EmployeeStatus.ACTIVE ||
      employee.employmentStatus !== EmploymentStatus.ACTIVE ||
      employee.archivedAt !== null ||
      !employee.isActivated ||
      !primaryMembership ||
      !primaryMembership.office.isActive ||
      (primaryMembership.orgUnit && !primaryMembership.orgUnit.isActive)
    ) {
      throw new ForbiddenException(
        'Your account does not have an active Office membership.',
      );
    }

    const officeHead = employee.orgLeadershipAssignments.some(
      (assignment) =>
        assignment.officeId === primaryMembership.officeId &&
        assignment.leadershipType === OrgLeadershipType.OFFICE_HEAD,
    );

    const headedOrgUnitIds = [
      ...new Set(
        employee.orgLeadershipAssignments
          .filter(
            (assignment) =>
              assignment.officeId === primaryMembership.officeId &&
              assignment.leadershipType === OrgLeadershipType.ORG_UNIT_HEAD &&
              assignment.orgUnitId !== null,
          )
          .map((assignment) => assignment.orgUnitId as string),
      ),
    ];

    if (officeHead) {
      return {
        accountClass: account.accountClass,
        scopeType: 'OFFICE',
        officeId: primaryMembership.officeId,
        rootOrgUnitIds: [],
        officeWide: true,
        office: primaryMembership.office,
        orgUnit: null,
        canViewContactDetails: true,
        canViewAdministrativeMetadata: false,
      };
    }

    if (headedOrgUnitIds.length > 0) {
      const headedUnit =
        headedOrgUnitIds.length === 1
          ? await this.prisma.orgUnit.findFirst({
              where: {
                id: headedOrgUnitIds[0],
                officeId: primaryMembership.officeId,
                isActive: true,
              },
              select: { id: true, code: true, name: true, isActive: true },
            })
          : null;

      return {
        accountClass: account.accountClass,
        scopeType: 'ORG_UNIT',
        officeId: primaryMembership.officeId,
        rootOrgUnitIds: headedOrgUnitIds,
        officeWide: false,
        office: primaryMembership.office,
        orgUnit: headedUnit,
        canViewContactDetails: true,
        canViewAdministrativeMetadata: false,
      };
    }

    const delegatedPermissions = await this.prisma.delegatedPermission.findMany(
      {
        where: {
          granteeAccountId: account.id,
          officeId: primaryMembership.officeId,
          capability: {
            in: [
              ...new Set(
                ORGANIZATION_ACCESS_CAPABILITIES.flatMap(
                  delegationGrantKeysForCapability,
                ),
              ),
            ],
          },
          revokedAt: null,
          effectiveFrom: { lte: now },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
        },
        select: {
          orgUnitId: true,
          includeDescendants: true,
        },
      },
    );

    if (delegatedPermissions.length === 0) {
      throw new ForbiddenException(
        'Only an Office Head, organizational Head or explicitly delegated user can access the employee directory.',
      );
    }

    if (
      delegatedPermissions.some((permission) => permission.orgUnitId === null)
    ) {
      return {
        accountClass: account.accountClass,
        scopeType: 'OFFICE',
        officeId: primaryMembership.officeId,
        rootOrgUnitIds: [],
        officeWide: true,
        office: primaryMembership.office,
        orgUnit: null,
        canViewContactDetails: false,
        canViewAdministrativeMetadata: false,
      };
    }

    const delegatedRootIds = [
      ...new Set(
        delegatedPermissions.flatMap((permission) =>
          permission.orgUnitId ? [permission.orgUnitId] : [],
        ),
      ),
    ];

    if (delegatedRootIds.length === 0) {
      throw new ForbiddenException('Your delegated Directory scope is empty.');
    }

    const delegatedUnit =
      delegatedRootIds.length === 1
        ? await this.prisma.orgUnit.findFirst({
            where: {
              id: delegatedRootIds[0],
              officeId: primaryMembership.officeId,
              isActive: true,
            },
            select: { id: true, code: true, name: true, isActive: true },
          })
        : null;

    return {
      accountClass: account.accountClass,
      scopeType: 'ORG_UNIT',
      officeId: primaryMembership.officeId,
      rootOrgUnitIds: delegatedRootIds,
      officeWide: false,
      office: primaryMembership.office,
      orgUnit: delegatedUnit,
      canViewContactDetails: false,
      canViewAdministrativeMetadata: false,
    };
  }

  private async descendantOrgUnitIds(
    officeId: string,
    rootOrgUnitIds: string[],
  ): Promise<string[]> {
    if (rootOrgUnitIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.orgUnitClosure.findMany({
      where: {
        ancestorOrgUnitId: { in: rootOrgUnitIds },
        descendantOrgUnit: {
          is: {
            officeId,
            isActive: true,
            orgUnitType: { is: { isActive: true, isTeam: false } },
          },
        },
      },
      select: { descendantOrgUnitId: true },
    });

    return [...new Set(rows.map((row) => row.descendantOrgUnitId))];
  }

  private async validateRequestedScope(
    viewer: DirectoryViewer,
    query: ListDirectoryQueryDto,
  ): Promise<void> {
    if (viewer.accountClass === AccountClass.SUPER_ADMIN) {
      if (!query.officeId && query.orgUnitId) {
        throw new ForbiddenException(
          'Select an Office before filtering the Directory by organization unit.',
        );
      }

      if (query.officeId) {
        const office = await this.prisma.office.findFirst({
          where: { id: query.officeId, isActive: true },
          select: { id: true },
        });
        if (!office) {
          throw new NotFoundException('Directory Office was not found.');
        }
      }

      if (query.orgUnitId) {
        const unit = await this.prisma.orgUnit.findFirst({
          where: {
            id: query.orgUnitId,
            officeId: query.officeId,
            isActive: true,
            orgUnitType: { is: { isActive: true, isTeam: false } },
          },
          select: { id: true },
        });
        if (!unit) {
          throw new NotFoundException(
            'Directory organization unit was not found in the selected Office.',
          );
        }
      }

      return;
    }

    if (!viewer.officeId) {
      throw new ForbiddenException(
        'Your directory scope has no active Office.',
      );
    }

    if (query.officeId && query.officeId !== viewer.officeId) {
      throw new ForbiddenException(
        'The selected Office is outside your Directory scope.',
      );
    }

    if (!query.orgUnitId) {
      return;
    }

    const unit = await this.prisma.orgUnit.findFirst({
      where: {
        id: query.orgUnitId,
        officeId: viewer.officeId,
        isActive: true,
        orgUnitType: { is: { isActive: true, isTeam: false } },
      },
      select: { id: true },
    });
    if (!unit) {
      throw new NotFoundException('Directory organization unit was not found.');
    }

    if (viewer.officeWide) {
      return;
    }

    const visibleIds = await this.descendantOrgUnitIds(
      viewer.officeId,
      viewer.rootOrgUnitIds,
    );
    if (!visibleIds.includes(query.orgUnitId)) {
      throw new ForbiddenException(
        'The selected organization unit is outside your Directory scope.',
      );
    }
  }

  private async buildScopeConditions(
    viewer: DirectoryViewer,
    query: Pick<ListDirectoryQueryDto, 'officeId' | 'orgUnitId'> = {},
  ): Promise<Prisma.EmployeeWhereInput[]> {
    const conditions: Prisma.EmployeeWhereInput[] = [];
    const now = new Date();

    const officeId =
      viewer.accountClass === AccountClass.SUPER_ADMIN
        ? (query.officeId ?? null)
        : viewer.officeId;

    if (!officeId) {
      return conditions;
    }

    let orgUnitIds: string[] | null = null;

    if (query.orgUnitId) {
      orgUnitIds = await this.descendantOrgUnitIds(officeId, [query.orgUnitId]);
    } else if (
      viewer.accountClass !== AccountClass.SUPER_ADMIN &&
      !viewer.officeWide
    ) {
      orgUnitIds = await this.descendantOrgUnitIds(
        officeId,
        viewer.rootOrgUnitIds,
      );
    }

    conditions.push({
      orgMemberships: {
        some: {
          officeId,
          membershipType: OrgMembershipType.PRIMARY,
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          ...(orgUnitIds
            ? {
                orgUnitId: { in: orgUnitIds },
              }
            : {}),
        },
      },
    });

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

    const now = new Date();
    const primaryMembership =
      employee.orgMemberships.find(
        (membership) =>
          membership.startsAt <= now &&
          (!membership.endsAt || membership.endsAt > now) &&
          membership.office.isActive &&
          (!membership.orgUnit || membership.orgUnit.isActive),
      ) ?? null;

    const breadcrumb = primaryMembership?.orgUnit
      ? primaryMembership.orgUnit.ancestorLinks
          .map((link) => link.ancestorOrgUnit)
          .filter(
            (unit, index, units) =>
              units.findIndex((candidate) => candidate.id === unit.id) ===
              index,
          )
      : [];

    /*
     * Directory leadership is formal hierarchy leadership only. Operational
     * Team Lead remains a Work Management assignment and is intentionally not
     * serialized as Office/Division/Department/Section/Unit leadership.
     * Acting/Deputy history stays in the database but does not clutter the
     * current permanent-head Directory surface.
     */
    const leadership = employee.orgLeadershipAssignments
      .filter(
        (assignment) =>
          !assignment.isActing &&
          (assignment.leadershipType === OrgLeadershipType.OFFICE_HEAD ||
            assignment.leadershipType === OrgLeadershipType.ORG_UNIT_HEAD) &&
          assignment.effectiveFrom <= now &&
          (!assignment.effectiveUntil || assignment.effectiveUntil > now),
      )
      .map((assignment) => ({
        id: assignment.id,
        type: assignment.leadershipType,
        isActing: false,
        effectiveFrom: assignment.effectiveFrom,
        effectiveUntil: assignment.effectiveUntil,
        office: assignment.office,
        orgUnit: assignment.orgUnit
          ? {
              id: assignment.orgUnit.id,
              code: assignment.orgUnit.code,
              name: assignment.orgUnit.name,
              isActive: assignment.orgUnit.isActive,
              typeCode: assignment.orgUnit.orgUnitType.code,
              typeName: assignment.orgUnit.orgUnitType.name,
            }
          : null,
      }));

    return {
      id: employee.id,
      empId: employee.empId,
      empName: employee.empName,
      phoneNumber: viewer.canViewContactDetails ? employee.phoneNumber : null,
      officialEmail: viewer.canViewContactDetails
        ? employee.officialEmail
        : null,
      designation: employee.designation,
      profilePhotoKey: employee.profilePhotoKey,
      office: primaryMembership?.office ?? null,
      primaryOrgUnit: primaryMembership?.orgUnit
        ? {
            id: primaryMembership.orgUnit.id,
            code: primaryMembership.orgUnit.code,
            name: primaryMembership.orgUnit.name,
            isActive: primaryMembership.orgUnit.isActive,
            typeCode: primaryMembership.orgUnit.orgUnitType.code,
            typeName: primaryMembership.orgUnit.orgUnitType.name,
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
      accountClass: employee.account?.accountClass ?? null,
      lastLoginAt: viewer.canViewAdministrativeMetadata
        ? (employee.account?.lastLoginAt ?? null)
        : null,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
    };
  }

  private serializeScope(viewer: DirectoryViewer) {
    return {
      accountClass: viewer.accountClass,
      type: viewer.scopeType,
      office: viewer.office,
      orgUnit: viewer.orgUnit,
      contactVisibility: viewer.canViewContactDetails ? 'FULL' : 'LIMITED',
    };
  }

  async listDirectory(user: AuthenticatedUser, query: ListDirectoryQueryDto) {
    const viewer = await this.getViewer(user);

    await this.validateRequestedScope(viewer, query);

    if (
      query.recordStatus === DirectoryRecordStatus.ARCHIVED &&
      viewer.accountClass !== AccountClass.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Archived employee profiles are available only to the Super Admin.',
      );
    }

    const conditions = await this.buildScopeConditions(viewer, query);

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
    const searchAt = new Date();

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
          orgMemberships: {
            some: {
              membershipType: OrgMembershipType.PRIMARY,
              startsAt: { lte: searchAt },
              AND: [
                {
                  OR: [{ endsAt: null }, { endsAt: { gt: searchAt } }],
                },
                {
                  OR: [
                    {
                      office: {
                        is: {
                          name: { contains: search, mode: 'insensitive' },
                        },
                      },
                    },
                    {
                      office: {
                        is: {
                          code: { contains: search, mode: 'insensitive' },
                        },
                      },
                    },
                    {
                      orgUnit: {
                        is: {
                          name: { contains: search, mode: 'insensitive' },
                        },
                      },
                    },
                    {
                      orgUnit: {
                        is: {
                          code: { contains: search, mode: 'insensitive' },
                        },
                      },
                    },
                  ],
                },
              ],
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

        accountStatus: query.accountStatus ?? null,

        activationStatus: query.activationStatus ?? null,
        officeId: query.officeId ?? null,
        orgUnitId: query.orgUnitId ?? null,
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

    const conditions = await this.buildScopeConditions(viewer);

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

    if (
      employee.archivedAt &&
      viewer.accountClass !== AccountClass.SUPER_ADMIN
    ) {
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
