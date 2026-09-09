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
  EmploymentStatus,
  OrgLeadershipType,
  OrgMembershipType,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { CAPABILITIES } from '../organization/organization-capabilities';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import { DutyAuthorizationService } from './duty-authorization.service';

const scopedAccountSelect = {
  id: true,
  role: true,
  username: true,
  isEnabled: true,
  superAdminProfile: { select: { fullName: true } },
  employee: {
    select: {
      id: true,
      empId: true,
      empName: true,
      designation: true,
      status: true,
      employmentStatus: true,
      archivedAt: true,
      isActivated: true,
      divisionId: true,
      departmentId: true,
    },
  },
} satisfies Prisma.AccountSelect;

export type DutyScopedAccount = Prisma.AccountGetPayload<{
  select: typeof scopedAccountSelect;
}> & {
  officeId: string;
  orgUnitId: string;
  operationalTeamIds: string[];
};

@Injectable()
export class DutyScopeV3Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dutyAuthorization: DutyAuthorizationService,
    private readonly organizationAuthorization: OrganizationAuthorizationService,
  ) {}

  async resolveAssignableAccounts(
    user: AuthenticatedUser,
    accountIds: string[],
    requestedOrgUnitId?: string,
    operationalTeamId?: string,
    at = new Date(),
  ): Promise<DutyScopedAccount[]> {
    const context = await this.dutyAuthorization.assertCanUseManagement(
      user,
      CAPABILITIES.DUTY_ASSIGN,
    );
    if (!context.officeId) {
      throw new ForbiddenException('Duty assignment requires an active Office scope.');
    }

    const uniqueIds = [...new Set(accountIds)];
    const placements = await this.prisma.orgMembership.findMany({
      where: {
        officeId: context.officeId,
        membershipType: OrgMembershipType.PRIMARY,
        startsAt: { lte: at },
        OR: [{ endsAt: null }, { endsAt: { gt: at } }],
        ...(requestedOrgUnitId
          ? { orgUnitId: requestedOrgUnitId }
          : { orgUnitId: { not: null } }),
        employee: {
          is: {
            status: EmployeeStatus.ACTIVE,
            employmentStatus: EmploymentStatus.ACTIVE,
            archivedAt: null,
            isActivated: true,
            account: {
              is: {
                id: { in: uniqueIds },
                isEnabled: true,
              },
            },
          },
        },
      },
      select: {
        officeId: true,
        orgUnitId: true,
        employee: {
          select: {
            account: { select: scopedAccountSelect },
          },
        },
      },
    });

    const byAccountId = new Map<string, { account: Prisma.AccountGetPayload<{ select: typeof scopedAccountSelect }>; officeId: string; orgUnitId: string }>();
    for (const placement of placements) {
      const account = placement.employee.account;
      if (account && placement.orgUnitId) {
        byAccountId.set(account.id, {
          account,
          officeId: placement.officeId,
          orgUnitId: placement.orgUnitId,
        });
      }
    }

    const memberships = await this.prisma.operationalTeamMember.findMany({
      where: {
        ...(operationalTeamId ? { teamId: operationalTeamId } : {}),
        startsAt: { lte: at },
        OR: [{ endsAt: null }, { endsAt: { gt: at } }],
        employee: {
          is: {
            account: { is: { id: { in: uniqueIds }, isEnabled: true } },
          },
        },
        team: {
          is: {
            isActive: true,
            archivedAt: null,
            orgUnit: { is: { officeId: context.officeId, isActive: true } },
          },
        },
      },
      select: {
        teamId: true,
        employee: { select: { account: { select: { id: true } } } },
      },
    });

    const teamsByAccountId = new Map<string, string[]>();
    for (const membership of memberships) {
      const accountId = membership.employee.account?.id;
      if (!accountId) continue;
      const list = teamsByAccountId.get(accountId) ?? [];
      list.push(membership.teamId);
      teamsByAccountId.set(accountId, list);
    }

    if (operationalTeamId) {
      const team = await this.prisma.operationalTeam.findFirst({
        where: {
          id: operationalTeamId,
          isActive: true,
          archivedAt: null,
          orgUnit: { is: { officeId: context.officeId, isActive: true } },
        },
        select: { id: true, orgUnitId: true },
      });
      if (!team) {
        throw new NotFoundException('The selected Operational Team is not active in this Office.');
      }
      if (
        !context.operationalTeamLeadIds.includes(team.id) &&
        !(await this.organizationAuthorization.can(
          user,
          CAPABILITIES.DUTY_ASSIGN,
          context.officeId,
          team.orgUnitId,
          at,
        ))
      ) {
        throw new ForbiddenException('The selected Operational Team is outside your Duty scope.');
      }
    }

    const resolved = uniqueIds.map((accountId) => {
      const placement = byAccountId.get(accountId);
      if (!placement) {
        throw new NotFoundException(
          'One or more selected employees do not have an active Office/OrgUnit placement.',
        );
      }

      const memberTeamIds = teamsByAccountId.get(accountId) ?? [];
      return {
        ...placement.account,
        officeId: placement.officeId,
        orgUnitId: placement.orgUnitId,
        operationalTeamIds: memberTeamIds,
      } as DutyScopedAccount;
    });
    await this.assertAssignableAccountsAuthorized(user, resolved, at);
    return resolved;
  }

  async assertAssignableAccountsAuthorized(
    user: AuthenticatedUser,
    accounts: DutyScopedAccount[],
    at = new Date(),
  ): Promise<void> {
    const context = await this.dutyAuthorization.getContext(user, at);
    for (const account of accounts) {
      const orgAccess = await this.organizationAuthorization.can(
        user,
        CAPABILITIES.DUTY_ASSIGN,
        account.officeId,
        account.orgUnitId,
        at,
      );
      const teamAccess = account.operationalTeamIds.some((teamId) =>
        context.operationalTeamLeadIds.includes(teamId),
      );
      if (!orgAccess && !teamAccess) {
        throw new ForbiddenException(
          'One or more selected employees are outside your Duty assignment scope.',
        );
      }
    }
  }

  async resolveSupervisor(
    user: AuthenticatedUser,
    requestedAccountId: string | undefined,
    target: DutyScopedAccount,
    at = new Date(),
  ): Promise<DutyScopedAccount> {
    const supervisorId = requestedAccountId ?? user.accountId;
    const [supervisor] = await this.resolveActiveAccounts([supervisorId], target.officeId, at);
    if (!supervisor) {
      throw new NotFoundException('Duty supervisor was not found in the target Office.');
    }

    if (supervisor.id === user.accountId) {
      const allowed = await this.organizationAuthorization.can(
        user,
        CAPABILITIES.DUTY_ASSIGN,
        target.officeId,
        target.orgUnitId,
        at,
      );
      const context = await this.dutyAuthorization.getContext(user, at);
      const teamAllowed = target.operationalTeamIds.some((teamId) =>
        context.operationalTeamLeadIds.includes(teamId),
      );
      if (allowed || teamAllowed) return supervisor;
    }

    const leadership = await this.prisma.orgLeadershipAssignment.findMany({
      where: {
        employeeId: supervisor.employee!.id,
        officeId: target.officeId,
        leadershipType: { in: [OrgLeadershipType.OFFICE_HEAD, OrgLeadershipType.ORG_UNIT_HEAD] },
        effectiveFrom: { lte: at },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
      },
      select: { leadershipType: true, orgUnitId: true },
    });
    for (const assignment of leadership) {
      if (assignment.leadershipType === OrgLeadershipType.OFFICE_HEAD) return supervisor;
      if (assignment.orgUnitId) {
        const covers = await this.prisma.orgUnitClosure.findUnique({
          where: {
            ancestorOrgUnitId_descendantOrgUnitId: {
              ancestorOrgUnitId: assignment.orgUnitId,
              descendantOrgUnitId: target.orgUnitId,
            },
          },
          select: { depth: true },
        });
        if (covers) return supervisor;
      }
    }

    if (target.operationalTeamIds.length) {
      const teamLead = await this.prisma.operationalTeamLeadAssignment.findFirst({
        where: {
          employeeId: supervisor.employee!.id,
          effectiveFrom: { lte: at },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
          teamId: { in: target.operationalTeamIds },
        },
        select: { id: true },
      });
      if (teamLead) return supervisor;
    }

    throw new ForbiddenException(
      'Choose an active Office Head, responsible OrgUnit Head, or Operational Team Lead as Duty supervisor.',
    );
  }

  async visibleAssignmentWhere(
    user: AuthenticatedUser,
    capability: 'duty.view' | 'duty.assign' = CAPABILITIES.DUTY_VIEW,
    at = new Date(),
  ): Promise<Prisma.DutyAssignmentWhereInput> {
    const context = await this.dutyAuthorization.getContext(user, at);
    if (context.readOnlyOversight) return {};
    if (!context.officeId) return { id: '__no_duty_scope__' };

    const orgUnitIds = await this.organizationAuthorization.visibleOrgUnitIds(
      user,
      capability,
      context.officeId,
    );
    const teamAccountIds = await this.accountIdsForTeams(
      context.operationalTeamLeadIds,
      at,
    );

    if (!context.canView && orgUnitIds.length === 0 && teamAccountIds.length === 0) {
      return { employeeAccountId: user.accountId };
    }

    const clauses: Prisma.DutyAssignmentWhereInput[] = [];
    if (orgUnitIds.length) {
      clauses.push({ officeId: context.officeId, orgUnitId: { in: orgUnitIds } });
    }
    if (context.operationalTeamLeadIds.length || teamAccountIds.length) {
      clauses.push({
        OR: [
          ...(context.operationalTeamLeadIds.length
            ? [{ operationalTeamId: { in: context.operationalTeamLeadIds } }]
            : []),
          ...(teamAccountIds.length
            ? [{ operationalTeamId: null, employeeAccountId: { in: teamAccountIds } }]
            : []),
        ],
      });
    }
    clauses.push({ employeeAccountId: user.accountId });
    return { OR: clauses };
  }

  async visibleExceptionWhere(
    user: AuthenticatedUser,
    at = new Date(),
  ): Promise<Prisma.DutyExceptionWhereInput> {
    const context = await this.dutyAuthorization.getContext(user, at);
    if (context.readOnlyOversight) return {};
    if (!context.officeId) return { employeeAccountId: user.accountId };

    const orgUnitIds = await this.organizationAuthorization.visibleOrgUnitIds(
      user,
      CAPABILITIES.DUTY_VIEW,
      context.officeId,
    );
    const teamAccountIds = await this.accountIdsForTeams(
      context.operationalTeamLeadIds,
      at,
    );
    const clauses: Prisma.DutyExceptionWhereInput[] = [];
    if (orgUnitIds.length) {
      clauses.push({ officeId: context.officeId, orgUnitId: { in: orgUnitIds } });
    }
    if (teamAccountIds.length) {
      clauses.push({ employeeAccountId: { in: teamAccountIds } });
    }
    clauses.push({ employeeAccountId: user.accountId });
    return { OR: clauses };
  }

  async rosterAccountIds(
    user: AuthenticatedUser,
    orgUnitId?: string,
    operationalTeamId?: string,
    at = new Date(),
  ): Promise<string[]> {
    const context = await this.dutyAuthorization.getContext(user, at);
    if (context.readOnlyOversight) {
      const rows = await this.prisma.orgMembership.findMany({
        where: {
          membershipType: OrgMembershipType.PRIMARY,
          startsAt: { lte: at },
          OR: [{ endsAt: null }, { endsAt: { gt: at } }],
          orgUnitId: orgUnitId ?? { not: null },
          employee: { is: { account: { is: { isEnabled: true } } } },
        },
        select: { employee: { select: { account: { select: { id: true } } } } },
      });
      return rows.map((row) => row.employee.account?.id).filter((id): id is string => Boolean(id));
    }
    if (!context.officeId) return [user.accountId];

    if (operationalTeamId) {
      if (
        !context.operationalTeamLeadIds.includes(operationalTeamId) &&
        !(await this.organizationAuthorization.can(
          user,
          CAPABILITIES.DUTY_VIEW,
          context.officeId,
          orgUnitId ?? context.primaryOrgUnitId,
          at,
        ))
      ) {
        throw new ForbiddenException('The selected Operational Team is outside your Duty scope.');
      }
      return this.accountIdsForTeams([operationalTeamId], at);
    }

    const visibleOrgUnitIds = await this.organizationAuthorization.visibleOrgUnitIds(
      user,
      CAPABILITIES.DUTY_VIEW,
      context.officeId,
    );
    const scopedOrgUnitIds = orgUnitId
      ? visibleOrgUnitIds.includes(orgUnitId)
        ? [orgUnitId]
        : []
      : visibleOrgUnitIds;
    const rows = scopedOrgUnitIds.length
      ? await this.prisma.orgMembership.findMany({
          where: {
            officeId: context.officeId,
            orgUnitId: { in: scopedOrgUnitIds },
            membershipType: OrgMembershipType.PRIMARY,
            startsAt: { lte: at },
            OR: [{ endsAt: null }, { endsAt: { gt: at } }],
            employee: { is: { account: { is: { isEnabled: true } } } },
          },
          select: { employee: { select: { account: { select: { id: true } } } } },
        })
      : [];
    const ids = new Set(rows.map((row) => row.employee.account?.id).filter((id): id is string => Boolean(id)));
    for (const id of await this.accountIdsForTeams(context.operationalTeamLeadIds, at)) ids.add(id);
    ids.add(user.accountId);
    return [...ids];
  }

  async notificationRecipientIds(
    input: {
      officeId: string;
      orgUnitId: string;
      assigneeAccountId: string;
      supervisorAccountId: string;
      operationalTeamIds?: string[];
    },
    at = new Date(),
  ): Promise<string[]> {
    const recipients = new Set<string>([
      input.assigneeAccountId,
      input.supervisorAccountId,
    ]);
    const teamIds = [...new Set(input.operationalTeamIds ?? [])];

    if (teamIds.length) {
      const teamLeads = await this.prisma.operationalTeamLeadAssignment.findMany({
        where: {
          teamId: { in: teamIds },
          effectiveFrom: { lte: at },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
          team: {
            is: {
              isActive: true,
              archivedAt: null,
              orgUnit: { is: { officeId: input.officeId, isActive: true } },
            },
          },
          employee: {
            is: {
              status: EmployeeStatus.ACTIVE,
              employmentStatus: EmploymentStatus.ACTIVE,
              archivedAt: null,
              account: {
                is: {
                  isEnabled: true,
                  role: { not: AccountRole.SUPER_ADMIN },
                },
              },
            },
          },
        },
        select: {
          employee: { select: { account: { select: { id: true } } } },
        },
      });
      for (const lead of teamLeads) {
        const accountId = lead.employee.account?.id;
        if (accountId) recipients.add(accountId);
      }
    }

    const ancestry = await this.prisma.orgUnitClosure.findMany({
      where: { descendantOrgUnitId: input.orgUnitId },
      orderBy: { depth: 'asc' },
      select: { ancestorOrgUnitId: true, depth: true },
    });
    const depthByOrgUnitId = new Map(
      ancestry.map((row) => [row.ancestorOrgUnitId, row.depth]),
    );
    const orgUnitHeads = ancestry.length
      ? await this.prisma.orgLeadershipAssignment.findMany({
          where: {
            officeId: input.officeId,
            orgUnitId: { in: ancestry.map((row) => row.ancestorOrgUnitId) },
            leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
            effectiveFrom: { lte: at },
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
            employee: {
              is: {
                status: EmployeeStatus.ACTIVE,
                employmentStatus: EmploymentStatus.ACTIVE,
                archivedAt: null,
                account: {
                  is: {
                    isEnabled: true,
                    role: { not: AccountRole.SUPER_ADMIN },
                  },
                },
              },
            },
          },
          select: {
            orgUnitId: true,
            employee: { select: { account: { select: { id: true } } } },
          },
        })
      : [];

    const nearestDepth = orgUnitHeads.reduce<number | null>((nearest, row) => {
      if (!row.orgUnitId) return nearest;
      const depth = depthByOrgUnitId.get(row.orgUnitId);
      if (depth === undefined) return nearest;
      return nearest === null || depth < nearest ? depth : nearest;
    }, null);
    if (nearestDepth !== null) {
      for (const head of orgUnitHeads) {
        if (!head.orgUnitId || depthByOrgUnitId.get(head.orgUnitId) !== nearestDepth) continue;
        const accountId = head.employee.account?.id;
        if (accountId) recipients.add(accountId);
      }
    } else {
      const officeHeads = await this.prisma.orgLeadershipAssignment.findMany({
        where: {
          officeId: input.officeId,
          orgUnitId: null,
          leadershipType: OrgLeadershipType.OFFICE_HEAD,
          effectiveFrom: { lte: at },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
          employee: {
            is: {
              status: EmployeeStatus.ACTIVE,
              employmentStatus: EmploymentStatus.ACTIVE,
              archivedAt: null,
              account: {
                is: {
                  isEnabled: true,
                  role: { not: AccountRole.SUPER_ADMIN },
                },
              },
            },
          },
        },
        select: {
          employee: { select: { account: { select: { id: true } } } },
        },
      });
      for (const head of officeHeads) {
        const accountId = head.employee.account?.id;
        if (accountId) recipients.add(accountId);
      }
    }

    return [...recipients];
  }

  async assertLegacyScopeFilter(
    user: AuthenticatedUser,
    filter: { divisionId?: string; departmentId?: string },
    at = new Date(),
  ): Promise<void> {
    const requested = [
      filter.divisionId
        ? {
            legacyEntityType: 'DIVISION' as const,
            legacyEntityId: filter.divisionId,
          }
        : null,
      filter.departmentId
        ? {
            legacyEntityType: 'DEPARTMENT' as const,
            legacyEntityId: filter.departmentId,
          }
        : null,
    ].filter(
      (value): value is {
        legacyEntityType: 'DIVISION' | 'DEPARTMENT';
        legacyEntityId: string;
      } => value !== null,
    );
    if (!requested.length) return;

    const context = await this.dutyAuthorization.getContext(user, at);
    if (context.readOnlyOversight) return;
    if (!context.officeId) {
      throw new ForbiddenException(
        'The selected legacy Duty scope is outside your Office.',
      );
    }

    for (const item of requested) {
      const mapping = await this.prisma.legacyOrgUnitMapping.findFirst({
        where: {
          officeId: context.officeId,
          legacyEntityType: item.legacyEntityType,
          legacyEntityId: item.legacyEntityId,
        },
        select: { orgUnitId: true },
      });
      if (!mapping) {
        throw new ForbiddenException(
          'The selected legacy Duty scope is outside your Office.',
        );
      }
      const allowed = await this.organizationAuthorization.can(
        user,
        CAPABILITIES.DUTY_VIEW,
        context.officeId,
        mapping.orgUnitId,
        at,
      );
      if (!allowed) {
        throw new ForbiddenException(
          'The selected legacy Duty scope is outside your Duty visibility.',
        );
      }
    }
  }

  async resolveLegacyCompatibilityScope(
    officeId: string,
    orgUnitId: string,
  ): Promise<{ divisionId: string | null; departmentId: string | null }> {
    const ancestors = await this.prisma.orgUnitClosure.findMany({
      where: { descendantOrgUnitId: orgUnitId },
      orderBy: { depth: 'asc' },
      select: { ancestorOrgUnitId: true, depth: true },
    });
    const depthById = new Map(ancestors.map((row) => [row.ancestorOrgUnitId, row.depth]));
    const mappings = await this.prisma.legacyOrgUnitMapping.findMany({
      where: {
        officeId,
        orgUnitId: { in: ancestors.map((row) => row.ancestorOrgUnitId) },
        legacyEntityType: { in: ['DIVISION', 'DEPARTMENT'] },
      },
      select: { orgUnitId: true, legacyEntityType: true, legacyEntityId: true },
    });
    const nearest = (type: 'DIVISION' | 'DEPARTMENT') =>
      mappings
        .filter((row) => row.legacyEntityType === type)
        .sort((a, b) => (depthById.get(a.orgUnitId) ?? 9999) - (depthById.get(b.orgUnitId) ?? 9999))[0]
        ?.legacyEntityId ?? null;
    return { divisionId: nearest('DIVISION'), departmentId: nearest('DEPARTMENT') };
  }

  private async resolveActiveAccounts(
    accountIds: string[],
    officeId: string,
    at: Date,
  ): Promise<DutyScopedAccount[]> {
    const memberships = await this.prisma.orgMembership.findMany({
      where: {
        officeId,
        membershipType: OrgMembershipType.PRIMARY,
        startsAt: { lte: at },
        OR: [{ endsAt: null }, { endsAt: { gt: at } }],
        orgUnitId: { not: null },
        employee: {
          is: {
            status: EmployeeStatus.ACTIVE,
            employmentStatus: EmploymentStatus.ACTIVE,
            archivedAt: null,
            isActivated: true,
            account: { is: { id: { in: accountIds }, isEnabled: true } },
          },
        },
      },
      select: {
        officeId: true,
        orgUnitId: true,
        employee: { select: { account: { select: scopedAccountSelect } } },
      },
    });
    const employeeIds = memberships.map((row) => row.employee.account?.employee?.id).filter((id): id is string => Boolean(id));
    const teamMemberships = employeeIds.length
      ? await this.prisma.operationalTeamMember.findMany({
          where: {
            employeeId: { in: employeeIds },
            startsAt: { lte: at },
            OR: [{ endsAt: null }, { endsAt: { gt: at } }],
            team: { is: { isActive: true, archivedAt: null } },
          },
          select: { employeeId: true, teamId: true },
        })
      : [];
    const teamsByEmployee = new Map<string, string[]>();
    for (const row of teamMemberships) {
      const list = teamsByEmployee.get(row.employeeId) ?? [];
      list.push(row.teamId);
      teamsByEmployee.set(row.employeeId, list);
    }
    return memberships.flatMap((row) => {
      const account = row.employee.account;
      if (!account || !row.orgUnitId || !account.employee) return [];
      return [{
        ...account,
        officeId: row.officeId,
        orgUnitId: row.orgUnitId,
        operationalTeamIds: teamsByEmployee.get(account.employee.id) ?? [],
      }];
    });
  }

  private async accountIdsForTeams(teamIds: string[], at: Date): Promise<string[]> {
    if (!teamIds.length) return [];
    const rows = await this.prisma.operationalTeamMember.findMany({
      where: {
        teamId: { in: teamIds },
        startsAt: { lte: at },
        OR: [{ endsAt: null }, { endsAt: { gt: at } }],
        team: { is: { isActive: true, archivedAt: null } },
        employee: { is: { account: { is: { isEnabled: true } } } },
      },
      select: { employee: { select: { account: { select: { id: true } } } } },
    });
    return rows.map((row) => row.employee.account?.id).filter((id): id is string => Boolean(id));
  }
}
