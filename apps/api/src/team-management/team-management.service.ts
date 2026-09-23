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
  AccountClass,
  EmployeeStatus,
  EmploymentStatus,
  OrgAssignmentSource,
  OrgLeadershipType,
  OrgMembershipType,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import { CAPABILITIES } from '../organization/organization-capabilities';
import { CreateOperationalTeamDto } from './dto/create-operational-team.dto';
import { ListOperationalTeamMembersQueryDto } from './dto/list-operational-team-members-query.dto';
import { ListOperationalTeamsQueryDto } from './dto/list-operational-teams-query.dto';
import { UpdateOperationalTeamDto } from './dto/update-operational-team.dto';

const teamSelect = {
  id: true,
  orgUnitId: true,
  code: true,
  name: true,
  isActive: true,
  sortOrder: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  orgUnit: {
    select: {
      id: true,
      code: true,
      name: true,
      officeId: true,
      office: { select: { id: true, code: true, name: true } },
    },
  },
  members: {
    where: { endsAt: null },
    orderBy: [{ employee: { empName: 'asc' } }, { startsAt: 'asc' }],
    select: {
      id: true,
      startsAt: true,
      employee: {
        select: {
          id: true,
          empId: true,
          empName: true,
          designation: true,
        },
      },
    },
  },
  leadAssignments: {
    where: { effectiveUntil: null },
    orderBy: [{ isActing: 'desc' }, { effectiveFrom: 'desc' }],
    select: {
      id: true,
      isActing: true,
      effectiveFrom: true,
      employee: {
        select: {
          id: true,
          empId: true,
          empName: true,
          designation: true,
        },
      },
    },
  },
} satisfies Prisma.OperationalTeamSelect;

type TeamRecord = Prisma.OperationalTeamGetPayload<{
  select: typeof teamSelect;
}>;

@Injectable()
export class TeamManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: OrganizationAuthorizationService,
  ) {}

  async getContext(user: AuthenticatedUser) {
    const manager = await this.resolveFormalManager(user);
    const orgUnits = await this.listManageableOrgUnits(manager);

    return {
      scope: {
        officeIds: manager.officeIds,
        officeHeadOfficeIds: manager.officeHeadOfficeIds,
        headedOrgUnitIds: manager.headedOrgUnitIds,
      },
      orgUnits,
    };
  }

  async listTeams(
    user: AuthenticatedUser,
    query: ListOperationalTeamsQueryDto,
  ) {
    const manager = await this.resolveFormalManager(user);
    if (query.orgUnitId) {
      await this.assertCanManageUnit(user, query.orgUnitId);
    }
    const manageableUnitIds = await this.manageableOrgUnitIds(manager);
    const filteredUnitIds = query.orgUnitId
      ? (await this.branchOrgUnitIds(query.orgUnitId)).filter((id) =>
          manageableUnitIds.includes(id),
        )
      : manageableUnitIds;
    const search = query.search?.trim();

    const teams = await this.prisma.operationalTeam.findMany({
      where: {
        orgUnitId: { in: filteredUnitIds },
        ...(query.status === 'removed'
          ? { isActive: false, archivedAt: { not: null } }
          : { isActive: true, archivedAt: null }),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
                {
                  leadAssignments: {
                    some: {
                      effectiveUntil: null,
                      employee: {
                        is: {
                          OR: [
                            {
                              empName: {
                                contains: search,
                                mode: 'insensitive',
                              },
                            },
                            {
                              empId: { contains: search, mode: 'insensitive' },
                            },
                          ],
                        },
                      },
                    },
                  },
                },
                {
                  members: {
                    some: {
                      endsAt: null,
                      employee: {
                        is: {
                          OR: [
                            {
                              empName: {
                                contains: search,
                                mode: 'insensitive',
                              },
                            },
                            {
                              empId: { contains: search, mode: 'insensitive' },
                            },
                          ],
                        },
                      },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [
        { orgUnit: { name: 'asc' } },
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
      select: teamSelect,
    });

    return {
      data: teams.map((team) => this.presentTeam(team)),
      total: teams.length,
    };
  }

  async getTeam(user: AuthenticatedUser, teamId: string) {
    const team = await this.findTeam(teamId, true);
    await this.authorization.assertCan(
      user,
      CAPABILITIES.TEAM_MANAGE,
      team.orgUnit.officeId,
      team.orgUnitId,
    );
    return this.presentTeam(team);
  }

  async listMembers(
    user: AuthenticatedUser,
    query: ListOperationalTeamMembersQueryDto,
  ) {
    const orgUnit = await this.resolveOrgUnit(query.orgUnitId);
    await this.authorization.assertCan(
      user,
      CAPABILITIES.TEAM_MANAGE,
      orgUnit.officeId,
      orgUnit.id,
    );
    const now = new Date();
    const search = query.search?.trim();
    const branchOrgUnitIds = await this.branchOrgUnitIds(orgUnit.id);

    const employees = await this.prisma.employee.findMany({
      where: {
        status: EmployeeStatus.ACTIVE,
        employmentStatus: EmploymentStatus.ACTIVE,
        archivedAt: null,
        isActivated: true,
        account: {
          is: { isEnabled: true, accountClass: AccountClass.OFFICE_USER },
        },
        orgMemberships: {
          some: {
            officeId: orgUnit.officeId,
            orgUnitId: { in: branchOrgUnitIds },
            membershipType: OrgMembershipType.PRIMARY,
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          },
        },
        ...(search
          ? {
              OR: [
                { empName: { contains: search, mode: 'insensitive' } },
                { empId: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ empName: 'asc' }, { empId: 'asc' }],
      take: 250,
      select: {
        id: true,
        empId: true,
        empName: true,
        designation: true,
        _count: {
          select: {
            operationalTeamMemberships: {
              where: {
                endsAt: null,
                team: { is: { isActive: true, archivedAt: null } },
              },
            },
          },
        },
      },
    });

    return {
      orgUnit: { id: orgUnit.id, code: orgUnit.code, name: orgUnit.name },
      data: employees.map((employee) => ({
        id: employee.id,
        empId: employee.empId,
        name: employee.empName,
        designation: employee.designation,
        teamCount: employee._count.operationalTeamMemberships,
      })),
      total: employees.length,
    };
  }

  async createTeam(user: AuthenticatedUser, dto: CreateOperationalTeamDto) {
    const orgUnit = await this.resolveOrgUnit(dto.orgUnitId);
    await this.authorization.assertCan(
      user,
      CAPABILITIES.TEAM_MANAGE,
      orgUnit.officeId,
      orgUnit.id,
    );
    const memberIds = this.cleanMemberIds(dto.memberEmployeeIds);
    this.assertLeadIsMember(memberIds, dto.leadEmployeeId);
    await this.resolveEligibleMembers(orgUnit.id, orgUnit.officeId, memberIds);
    const code = await this.generateTeamCode(orgUnit.id, dto.name);
    await this.assertTeamIdentityAvailable(orgUnit.id, code, dto.name);
    const now = new Date();

    const team = await this.prisma.$transaction(async (tx) => {
      const created = await tx.operationalTeam.create({
        data: {
          orgUnitId: orgUnit.id,
          code,
          name: dto.name.trim(),
          nameKey: this.nameKey(dto.name),
          createdByAccountId: user.accountId,
          updatedByAccountId: user.accountId,
        },
        select: { id: true },
      });

      await tx.operationalTeamMember.createMany({
        data: memberIds.map((employeeId) => ({
          teamId: created.id,
          employeeId,
          assignmentSource: OrgAssignmentSource.MANUAL,
          startsAt: now,
          assignedByAccountId: user.accountId,
          assignmentReason: 'Team created',
        })),
      });

      await tx.operationalTeamLeadAssignment.create({
        data: {
          teamId: created.id,
          employeeId: dto.leadEmployeeId,
          assignmentSource: OrgAssignmentSource.MANUAL,
          effectiveFrom: now,
          assignedByAccountId: user.accountId,
          assignmentReason: 'Team created',
        },
      });

      return tx.operationalTeam.findUniqueOrThrow({
        where: { id: created.id },
        select: teamSelect,
      });
    });

    return {
      message: 'Team created successfully.',
      team: this.presentTeam(team),
    };
  }

  async updateTeam(
    user: AuthenticatedUser,
    teamId: string,
    dto: UpdateOperationalTeamDto,
  ) {
    const current = await this.findTeam(teamId);
    await this.authorization.assertCan(
      user,
      CAPABILITIES.TEAM_MANAGE,
      current.orgUnit.officeId,
      current.orgUnitId,
    );
    const memberIds = this.cleanMemberIds(dto.memberEmployeeIds);
    this.assertLeadIsMember(memberIds, dto.leadEmployeeId);
    await this.resolveEligibleMembers(
      current.orgUnitId,
      current.orgUnit.officeId,
      memberIds,
    );
    await this.assertTeamIdentityAvailable(
      current.orgUnitId,
      current.code,
      dto.name,
      teamId,
    );

    const currentMemberIds = new Set(
      current.members.map((row) => row.employee.id),
    );
    const nextMemberIds = new Set(memberIds);
    const added = memberIds.filter((id) => !currentMemberIds.has(id));
    const removed = [...currentMemberIds].filter(
      (id) => !nextMemberIds.has(id),
    );
    const currentLead = current.leadAssignments[0]?.employee.id ?? null;
    const leadChanged = currentLead !== dto.leadEmployeeId;
    const now = new Date();

    const activeAssignmentCount = await this.prisma.workStageAssignment.count({
      where: { targetOperationalTeamId: teamId, endsAt: null },
    });
    if (leadChanged && activeAssignmentCount > 0) {
      throw new ConflictException(
        'Complete or reassign active Work stages before changing this Team Lead.',
      );
    }

    const team = await this.prisma.$transaction(async (tx) => {
      if (removed.length > 0) {
        await tx.operationalTeamMember.updateMany({
          where: { teamId, employeeId: { in: removed }, endsAt: null },
          data: {
            endsAt: now,
            endedByAccountId: user.accountId,
            endReason: 'Team membership updated',
          },
        });
      }
      if (added.length > 0) {
        await tx.operationalTeamMember.createMany({
          data: added.map((employeeId) => ({
            teamId,
            employeeId,
            assignmentSource: OrgAssignmentSource.MANUAL,
            startsAt: now,
            assignedByAccountId: user.accountId,
            assignmentReason: 'Team membership updated',
          })),
        });
      }
      if (leadChanged) {
        await tx.operationalTeamLeadAssignment.updateMany({
          where: { teamId, effectiveUntil: null },
          data: {
            effectiveUntil: now,
            endedByAccountId: user.accountId,
            endReason: 'Team membership updated',
          },
        });
        await tx.operationalTeamLeadAssignment.create({
          data: {
            teamId,
            employeeId: dto.leadEmployeeId,
            assignmentSource: OrgAssignmentSource.MANUAL,
            effectiveFrom: now,
            assignedByAccountId: user.accountId,
            assignmentReason: 'Team membership updated',
          },
        });
      }

      await tx.operationalTeam.update({
        where: { id: teamId },
        data: {
          name: dto.name.trim(),
          nameKey: this.nameKey(dto.name),
          updatedByAccountId: user.accountId,
        },
      });

      return tx.operationalTeam.findUniqueOrThrow({
        where: { id: teamId },
        select: teamSelect,
      });
    });

    return {
      message: 'Team updated successfully.',
      team: this.presentTeam(team),
    };
  }

  async archiveTeam(user: AuthenticatedUser, teamId: string) {
    const current = await this.findTeam(teamId);
    await this.authorization.assertCan(
      user,
      CAPABILITIES.TEAM_MANAGE,
      current.orgUnit.officeId,
      current.orgUnitId,
    );
    const now = new Date();
    const [activeAssignmentCount, scheduledDutyCount] = await Promise.all([
      this.prisma.workStageAssignment.count({
        where: { targetOperationalTeamId: teamId, endsAt: null },
      }),
      this.prisma.dutyAssignment.count({
        where: {
          operationalTeamId: teamId,
          cancelledAt: null,
          endsAt: { gt: now },
        },
      }),
    ]);
    if (activeAssignmentCount > 0) {
      throw new ConflictException(
        'This team still has active Work. Complete or reassign it before deleting the team.',
      );
    }
    if (scheduledDutyCount > 0) {
      throw new ConflictException(
        'This team still has current or future Duty. Reassign or cancel it before deleting the team.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.operationalTeamMember.updateMany({
        where: { teamId, endsAt: null },
        data: {
          endsAt: now,
          endedByAccountId: user.accountId,
          endReason: 'Team deleted',
        },
      });
      await tx.operationalTeamLeadAssignment.updateMany({
        where: { teamId, effectiveUntil: null },
        data: {
          effectiveUntil: now,
          endedByAccountId: user.accountId,
          endReason: 'Team deleted',
        },
      });
      await tx.operationalTeam.update({
        where: { id: teamId },
        data: {
          isActive: false,
          archivedAt: now,
          archivedByAccountId: user.accountId,
          updatedByAccountId: user.accountId,
        },
      });
    });

    return {
      message: 'Team deleted. Existing Work and history remain unchanged.',
    };
  }

  private async resolveFormalManager(user: AuthenticatedUser) {
    if (user.accountClass === AccountClass.SUPER_ADMIN) {
      throw new ForbiddenException(
        'The system administrator does not manage Work teams.',
      );
    }
    const now = new Date();
    const account = await this.prisma.account.findUnique({
      where: { id: user.accountId },
      select: {
        isEnabled: true,
        accountClass: true,
        employee: {
          select: {
            id: true,
            status: true,
            employmentStatus: true,
            archivedAt: true,
            orgMemberships: {
              where: {
                membershipType: OrgMembershipType.PRIMARY,
                startsAt: { lte: now },
                OR: [{ endsAt: null }, { endsAt: { gt: now } }],
              },
              select: { officeId: true },
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
              select: { officeId: true, orgUnitId: true, leadershipType: true },
            },
          },
        },
      },
    });
    if (
      !account?.isEnabled ||
      account.accountClass !== AccountClass.OFFICE_USER ||
      !account.employee ||
      account.employee.status !== EmployeeStatus.ACTIVE ||
      account.employee.employmentStatus !== EmploymentStatus.ACTIVE ||
      account.employee.archivedAt !== null
    ) {
      throw new ForbiddenException('Your employee account is not active.');
    }
    const officeHeadOfficeIds = account.employee.orgLeadershipAssignments
      .filter((row) => row.leadershipType === OrgLeadershipType.OFFICE_HEAD)
      .map((row) => row.officeId);
    const headedOrgUnitIds = account.employee.orgLeadershipAssignments
      .filter(
        (row) =>
          row.leadershipType === OrgLeadershipType.ORG_UNIT_HEAD &&
          row.orgUnitId !== null,
      )
      .map((row) => row.orgUnitId as string);

    const employeeOfficeIds = [
      ...new Set(account.employee.orgMemberships.map((row) => row.officeId)),
    ];
    const delegatedOrgUnitIds = new Set<string>();
    for (const officeId of employeeOfficeIds) {
      const ids = await this.authorization.visibleOrgUnitIds(
        user,
        CAPABILITIES.TEAM_MANAGE,
        officeId,
      );
      ids.forEach((id) => delegatedOrgUnitIds.add(id));
    }

    if (
      officeHeadOfficeIds.length === 0 &&
      headedOrgUnitIds.length === 0 &&
      delegatedOrgUnitIds.size === 0
    ) {
      throw new ForbiddenException(
        'You do not have Team Management authority in this organizational area.',
      );
    }
    return {
      officeIds: [
        ...new Set([
          ...account.employee.orgLeadershipAssignments.map(
            (row) => row.officeId,
          ),
          ...employeeOfficeIds,
        ]),
      ],
      officeHeadOfficeIds: [...new Set(officeHeadOfficeIds)],
      headedOrgUnitIds: [...new Set(headedOrgUnitIds)],
      delegatedOrgUnitIds: [...delegatedOrgUnitIds],
    };
  }

  private async listManageableOrgUnits(manager: {
    officeHeadOfficeIds: string[];
    headedOrgUnitIds: string[];
    delegatedOrgUnitIds: string[];
  }) {
    const ids = await this.manageableOrgUnitIds(manager);
    return this.prisma.orgUnit.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        orgUnitType: {
          code: { in: ['DIVISION', 'DEPARTMENT', 'SECTION', 'UNIT'] },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        officeId: true,
        code: true,
        name: true,
        parentOrgUnitId: true,
        orgUnitType: { select: { code: true, name: true } },
        office: { select: { id: true, code: true, name: true } },
      },
    });
  }

  private async manageableOrgUnitIds(manager: {
    officeHeadOfficeIds: string[];
    headedOrgUnitIds: string[];
    delegatedOrgUnitIds: string[];
  }): Promise<string[]> {
    const [officeUnits, descendantLinks] = await Promise.all([
      manager.officeHeadOfficeIds.length
        ? this.prisma.orgUnit.findMany({
            where: {
              officeId: { in: manager.officeHeadOfficeIds },
              isActive: true,
            },
            select: { id: true },
          })
        : Promise.resolve([]),
      manager.headedOrgUnitIds.length
        ? this.prisma.orgUnitClosure.findMany({
            where: {
              ancestorOrgUnitId: { in: manager.headedOrgUnitIds },
              descendantOrgUnit: { isActive: true },
            },
            select: { descendantOrgUnitId: true },
          })
        : Promise.resolve([]),
    ]);
    return [
      ...new Set([
        ...officeUnits.map((row) => row.id),
        ...descendantLinks.map((row) => row.descendantOrgUnitId),
        ...manager.delegatedOrgUnitIds,
      ]),
    ];
  }

  private async branchOrgUnitIds(orgUnitId: string): Promise<string[]> {
    const descendants = await this.prisma.orgUnitClosure.findMany({
      where: { ancestorOrgUnitId: orgUnitId },
      select: { descendantOrgUnitId: true },
    });
    return [
      ...new Set([
        orgUnitId,
        ...descendants.map((row) => row.descendantOrgUnitId),
      ]),
    ];
  }

  private async assertCanManageUnit(
    user: AuthenticatedUser,
    orgUnitId: string,
  ) {
    const orgUnit = await this.resolveOrgUnit(orgUnitId);
    await this.authorization.assertCan(
      user,
      CAPABILITIES.TEAM_MANAGE,
      orgUnit.officeId,
      orgUnit.id,
    );
  }

  private async resolveOrgUnit(orgUnitId: string) {
    const orgUnit = await this.prisma.orgUnit.findUnique({
      where: { id: orgUnitId },
      select: {
        id: true,
        officeId: true,
        code: true,
        name: true,
        isActive: true,
      },
    });
    if (!orgUnit || !orgUnit.isActive) {
      throw new NotFoundException('The selected OrgUnit was not found.');
    }
    return orgUnit;
  }

  private async findTeam(
    teamId: string,
    includeRemoved = false,
  ): Promise<TeamRecord> {
    const team = await this.prisma.operationalTeam.findFirst({
      where: {
        id: teamId,
        ...(includeRemoved ? {} : { isActive: true, archivedAt: null }),
      },
      select: teamSelect,
    });
    if (!team) throw new NotFoundException('Team was not found.');
    return team;
  }

  private async resolveEligibleMembers(
    orgUnitId: string,
    officeId: string,
    memberIds: string[],
  ) {
    const now = new Date();
    const branchOrgUnitIds = await this.branchOrgUnitIds(orgUnitId);
    const employees = await this.prisma.employee.findMany({
      where: {
        id: { in: memberIds },
        status: EmployeeStatus.ACTIVE,
        employmentStatus: EmploymentStatus.ACTIVE,
        archivedAt: null,
        isActivated: true,
        account: {
          is: { isEnabled: true, accountClass: AccountClass.OFFICE_USER },
        },
        orgMemberships: {
          some: {
            officeId,
            orgUnitId: { in: branchOrgUnitIds },
            membershipType: OrgMembershipType.PRIMARY,
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          },
        },
      },
      select: { id: true },
    });
    if (employees.length !== memberIds.length) {
      throw new BadRequestException(
        'Choose only active employees from this organization branch.',
      );
    }
    return employees;
  }

  private async assertTeamIdentityAvailable(
    orgUnitId: string,
    code: string,
    name: string,
    excludeTeamId?: string,
  ) {
    const duplicate = await this.prisma.operationalTeam.findFirst({
      where: {
        orgUnitId,
        id: excludeTeamId ? { not: excludeTeamId } : undefined,
        OR: [{ code: code.trim() }, { nameKey: this.nameKey(name) }],
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        'Another Operational Team in this OrgUnit already uses that code or name.',
      );
    }
  }

  private async generateTeamCode(orgUnitId: string, name: string) {
    const base =
      name
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 36) || 'TEAM';
    for (let index = 0; index < 1000; index += 1) {
      const code = index === 0 ? base : `${base}-${index + 1}`;
      const existing = await this.prisma.operationalTeam.findFirst({
        where: { orgUnitId, code },
        select: { id: true },
      });
      if (!existing) return code;
    }
    throw new ConflictException('A unique team code could not be generated.');
  }

  async restoreTeam(user: AuthenticatedUser, teamId: string) {
    const team = await this.findTeam(teamId, true);
    await this.authorization.assertCan(
      user,
      CAPABILITIES.TEAM_MANAGE,
      team.orgUnit.officeId,
      team.orgUnitId,
    );
    if (team.isActive && !team.archivedAt) {
      return {
        message: 'Team is already active.',
        team: this.presentTeam(team),
      };
    }
    const now = new Date();
    const [lastMembers, lastLead] = await Promise.all([
      this.prisma.operationalTeamMember.findMany({
        where: { teamId, endReason: 'Team deleted' },
        orderBy: { endsAt: 'desc' },
        select: { employeeId: true },
      }),
      this.prisma.operationalTeamLeadAssignment.findFirst({
        where: { teamId, endReason: 'Team deleted' },
        orderBy: { effectiveUntil: 'desc' },
        select: { employeeId: true },
      }),
    ]);
    const memberIds = [...new Set(lastMembers.map((row) => row.employeeId))];
    const leadEmployeeId = lastLead?.employeeId ?? null;
    await this.prisma.$transaction(async (tx) => {
      await tx.operationalTeam.update({
        where: { id: teamId },
        data: {
          isActive: true,
          archivedAt: null,
          archivedByAccountId: null,
          updatedByAccountId: user.accountId,
        },
      });
      if (memberIds.length > 0) {
        await tx.operationalTeamMember.createMany({
          data: memberIds.map((employeeId) => ({
            teamId,
            employeeId,
            assignmentSource: OrgAssignmentSource.MANUAL,
            startsAt: now,
            assignedByAccountId: user.accountId,
            assignmentReason: 'Team restored',
          })),
          skipDuplicates: true,
        });
      }
      if (leadEmployeeId) {
        await tx.operationalTeamLeadAssignment.create({
          data: {
            teamId,
            employeeId: leadEmployeeId,
            assignmentSource: OrgAssignmentSource.MANUAL,
            effectiveFrom: now,
            assignedByAccountId: user.accountId,
            assignmentReason: 'Team restored',
          },
        });
      }
    });
    const restored = await this.findTeam(teamId);
    return {
      message: 'Team restored successfully.',
      team: this.presentTeam(restored),
    };
  }

  private cleanMemberIds(memberIds: string[]) {
    return [...new Set(memberIds.map((id) => id.trim()).filter(Boolean))];
  }

  private assertLeadIsMember(memberIds: string[], leadEmployeeId: string) {
    if (!memberIds.includes(leadEmployeeId)) {
      throw new BadRequestException(
        'The Team Lead must also be a Team member.',
      );
    }
  }

  private nameKey(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private presentTeam(team: TeamRecord) {
    const lead = team.leadAssignments[0] ?? null;
    return {
      id: team.id,
      orgUnitId: team.orgUnitId,
      code: team.code,
      name: team.name,
      isActive: team.isActive,
      sortOrder: team.sortOrder,
      archivedAt: team.archivedAt?.toISOString() ?? null,
      createdAt: team.createdAt.toISOString(),
      updatedAt: team.updatedAt.toISOString(),
      office: team.orgUnit.office,
      orgUnit: {
        id: team.orgUnit.id,
        code: team.orgUnit.code,
        name: team.orgUnit.name,
      },
      lead: lead
        ? {
            assignmentId: lead.id,
            isActing: lead.isActing,
            effectiveFrom: lead.effectiveFrom.toISOString(),
            employee: lead.employee,
          }
        : null,
      members: team.members.map((row) => ({
        membershipId: row.id,
        startsAt: row.startsAt.toISOString(),
        employee: row.employee,
      })),
    };
  }
}
