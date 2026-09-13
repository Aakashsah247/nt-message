import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
  OrgLeadershipType,
  OrgMembershipType,
  WorkItemStatus,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { CAPABILITIES } from '../organization/organization-capabilities';

const workAccountSelect = {
  id: true,
  accountClass: true,
  isEnabled: true,
  username: true,
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
      orgMemberships: {
        where: {
          membershipType: OrgMembershipType.PRIMARY,
        },
        orderBy: { startsAt: 'desc' },
        take: 10,
        select: {
          officeId: true,
          orgUnitId: true,
          startsAt: true,
          endsAt: true,
          office: { select: { isActive: true } },
          orgUnit: { select: { isActive: true } },
        },
      },
      orgLeadershipAssignments: {
        orderBy: { effectiveFrom: 'desc' },
        take: 20,
        select: {
          officeId: true,
          orgUnitId: true,
          leadershipType: true,
          effectiveFrom: true,
          effectiveUntil: true,
        },
      },
      operationalTeamMemberships: {
        orderBy: { startsAt: 'desc' },
        take: 50,
        select: {
          teamId: true,
          startsAt: true,
          endsAt: true,
          team: {
            select: {
              id: true,
              orgUnitId: true,
              isActive: true,
              archivedAt: true,
              orgUnit: { select: { officeId: true, isActive: true } },
            },
          },
        },
      },
      operationalTeamLeadAssignments: {
        orderBy: { effectiveFrom: 'desc' },
        take: 20,
        select: {
          teamId: true,
          effectiveFrom: true,
          effectiveUntil: true,
          team: {
            select: {
              id: true,
              orgUnitId: true,
              isActive: true,
              archivedAt: true,
              orgUnit: { select: { officeId: true, isActive: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.AccountSelect;

export type WorkAccountRecord = Prisma.AccountGetPayload<{
  select: typeof workAccountSelect;
}>;

export interface WorkActorContext {
  accountId: string;
  role: AccountRole;
  accountClass?: AccountClass;
  officeId?: string | null;
  primaryOrgUnitId?: string | null;
  visibleOrgUnitIds?: string[];
  assignableOrgUnitIds?: string[];
  operationalTeamLeadIds?: string[];
  operationalTeamMemberIds?: string[];
}

@Injectable()
export class WorkScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveActorContext(
    user: AuthenticatedUser,
  ): Promise<WorkActorContext> {
    const account: WorkAccountRecord | null =
      await this.prisma.account.findUnique({
        where: {
          id: user.accountId,
        },
        select: workAccountSelect,
      });

    if (!account) {
      throw new NotFoundException('Authenticated account was not found.');
    }

    if (
      !account.isEnabled ||
      !user.accountClass ||
      account.accountClass !== user.accountClass
    ) {
      throw new ForbiddenException(
        'Your account is not authorized to manage work items.',
      );
    }

    // `role` remains only as a legacy serializer field until the schema cleanup.
    // Operational authority is derived from AccountClass + V3 scope, never by
    // projecting current leadership back into the old fixed role hierarchy.
    const role =
      account.accountClass === AccountClass.SUPER_ADMIN
        ? AccountRole.SUPER_ADMIN
        : AccountRole.EMPLOYEE;
    if (account.accountClass === AccountClass.SUPER_ADMIN) {
      return {
        accountId: account.id,
        role,
        accountClass: account.accountClass,
        officeId: null,
        primaryOrgUnitId: null,
        visibleOrgUnitIds: [],
        assignableOrgUnitIds: [],
        operationalTeamLeadIds: [],
        operationalTeamMemberIds: [],
      };
    }

    this.assertOperationalActor(account);

    const employee = account.employee;
    const primaryMembership = this.currentPrimaryMembership(account);
    if (!employee || !primaryMembership) {
      throw new ForbiddenException(
        'Your active Office and OrgUnit assignment is required for work access.',
      );
    }

    const scope = await this.resolveV3WorkScope(
      account,
      primaryMembership.officeId,
    );

    return {
      accountId: account.id,
      role,
      accountClass: account.accountClass,
      officeId: primaryMembership.officeId,
      primaryOrgUnitId: primaryMembership.orgUnitId,
      visibleOrgUnitIds: scope.visibleOrgUnitIds,
      assignableOrgUnitIds: scope.assignableOrgUnitIds,
      operationalTeamLeadIds: scope.operationalTeamLeadIds,
      operationalTeamMemberIds: scope.operationalTeamMemberIds,
    };
  }

  assertCanCreateWork(actor: WorkActorContext): void {
    this.assertOfficeOperationalManager(
      actor,
      'You do not have V3 Work assignment authority.',
    );
  }

  async resolveAssignableAccounts(
    actor: WorkActorContext,
    accountIds: string[],
  ): Promise<WorkAccountRecord[]> {
    // Resolve every selected account server-side so hidden or tampered IDs fail closed.
    const uniqueIds = [...new Set(accountIds)];
    const accounts: WorkAccountRecord[] = await this.prisma.account.findMany({
      where: {
        id: {
          in: uniqueIds,
        },
      },
      select: workAccountSelect,
    });

    const accountsById = new Map(
      accounts.map((account) => [account.id, account]),
    );

    return uniqueIds.map((accountId) => {
      const account = accountsById.get(accountId);

      if (!account) {
        throw new NotFoundException(
          'One or more selected employees were not found.',
        );
      }

      this.assertOperationalAssignableAccount(account);
      this.assertAssignableRole(actor, account);
      this.assertAccountInsideActorScope(actor, account);

      return account;
    });
  }

  assertAdministrativeIndividualAssignee(
    actor: WorkActorContext,
    target: WorkAccountRecord,
  ): void {
    this.assertOfficeOperationalManager(
      actor,
      'You do not have V3 authority to assign Administrative Work.',
    );
    if (target.accountClass === AccountClass.SUPER_ADMIN) {
      throw new ForbiddenException(
        'The Super Admin cannot receive operational Work assignments.',
      );
    }
    this.assertAccountInsideActorScope(actor, target);
  }

  buildVisibleWorkWhere(actor: WorkActorContext): Prisma.WorkItemWhereInput {
    const legacyOnly: Prisma.WorkItemWhereInput = {
      status: { not: WorkItemStatus.V3_RUNTIME },
    };

    if (actor.accountClass === AccountClass.SUPER_ADMIN) {
      return legacyOnly;
    }

    const visibility: Prisma.WorkItemWhereInput[] = [
      { createdByAccountId: actor.accountId },
      {
        assignments: {
          some: {
            assigneeAccountId: actor.accountId,
            endedAt: null,
          },
        },
      },
      {
        status: { in: [WorkItemStatus.CLOSED, WorkItemStatus.CANCELLED] },
        assignments: { some: { assigneeAccountId: actor.accountId } },
      },
      { salesMemberAccountId: actor.accountId },
    ];

    const visibleOrgUnitIds = actor.visibleOrgUnitIds ?? [];
    if (visibleOrgUnitIds.length > 0) {
      visibility.push(
        { primaryOwnerOrgUnitId: { in: visibleOrgUnitIds } },
        {
          orgUnitParticipants: {
            some: { orgUnitId: { in: visibleOrgUnitIds } },
          },
        },
      );
    }

    const operationalTeamIds = [
      ...new Set([
        ...(actor.operationalTeamLeadIds ?? []),
        ...(actor.operationalTeamMemberIds ?? []),
      ]),
    ];
    if (operationalTeamIds.length > 0) {
      visibility.push({
        runtimeStages: {
          some: {
            assignments: {
              some: {
                targetOperationalTeamId: { in: operationalTeamIds },
                endsAt: null,
              },
            },
          },
        },
      });
    }

    return { AND: [legacyOnly, { OR: visibility }] };
  }

  buildOrganizationHierarchyWorkWhere(
    actor: WorkActorContext,
  ): Prisma.WorkItemWhereInput {
    const legacyOnly: Prisma.WorkItemWhereInput = {
      status: { not: WorkItemStatus.V3_RUNTIME },
    };

    if (actor.accountClass === AccountClass.SUPER_ADMIN) {
      return legacyOnly;
    }

    const hierarchyScope: Prisma.WorkItemWhereInput[] = [];
    const visibleOrgUnitIds = actor.visibleOrgUnitIds ?? [];
    if (visibleOrgUnitIds.length > 0) {
      hierarchyScope.push(
        { primaryOwnerOrgUnitId: { in: visibleOrgUnitIds } },
        {
          orgUnitParticipants: {
            some: { orgUnitId: { in: visibleOrgUnitIds } },
          },
        },
      );
    }

    const ledTeamIds = actor.operationalTeamLeadIds ?? [];
    if (ledTeamIds.length > 0) {
      hierarchyScope.push({
        runtimeStages: {
          some: {
            assignments: {
              some: {
                targetOperationalTeamId: { in: ledTeamIds },
                endsAt: null,
              },
            },
          },
        },
      });
    }

    if (hierarchyScope.length === 0) {
      return {
        AND: [legacyOnly, { id: '__management_scope_unavailable__' }],
      };
    }

    return { AND: [legacyOnly, { OR: hierarchyScope }] };
  }

  assertCanManageWork(actor: WorkActorContext): void {
    this.assertOfficeOperationalManager(
      actor,
      "You do not have V3 authority to manage another employee's Work assignment.",
    );
  }

  async resolveHelpCandidate(
    requester: WorkActorContext,
    requestedHelperAccountId: string,
    _workOrgUnitId: string | null,
  ): Promise<WorkAccountRecord> {
    void _workOrgUnitId;
    if (requestedHelperAccountId === requester.accountId) {
      throw new ForbiddenException(
        'You cannot send a help request to yourself.',
      );
    }

    const helper = await this.resolveOperationalAccount(
      requestedHelperAccountId,
      'Requested helper was not found.',
    );

    if (helper.accountClass === AccountClass.SUPER_ADMIN) {
      throw new ForbiddenException(
        'The Super Admin cannot be selected as a direct supporting employee.',
      );
    }

    // V3 Work can collaborate across OrgUnits; direct helper selection remains Office-scoped.
    this.assertAccountInsideOffice(requester, helper, 'Requested helper');
    return helper;
  }

  async resolveOperationalAccount(
    accountId: string,
    notFoundMessage = 'Employee account was not found.',
  ): Promise<WorkAccountRecord> {
    const account: WorkAccountRecord | null =
      await this.prisma.account.findUnique({
        where: {
          id: accountId,
        },
        select: workAccountSelect,
      });

    if (!account) {
      throw new NotFoundException(notFoundMessage);
    }

    this.assertOperationalEmployee(account);
    return account;
  }

  private assertOperationalTeamInsideActorScope(
    actor: WorkActorContext,
    team: {
      id: string;
      orgUnitId: string;
      orgUnit: { officeId: string; isActive: boolean };
    },
  ): void {
    if (actor.accountClass === AccountClass.SUPER_ADMIN) return;

    if (!actor.officeId || team.orgUnit.officeId !== actor.officeId) {
      throw new ForbiddenException(
        'The selected team is outside your authorized Office scope.',
      );
    }

    if (
      (actor.operationalTeamLeadIds ?? []).includes(team.id) ||
      (actor.assignableOrgUnitIds ?? []).includes(team.orgUnitId)
    ) {
      return;
    }

    throw new ForbiddenException(
      'The selected team is outside your authorized V3 OrgUnit or Operational Team scope.',
    );
  }

  private assertAccountInsideOffice(
    actor: WorkActorContext,
    target: WorkAccountRecord,
    label: string,
  ): void {
    if (actor.accountClass === AccountClass.SUPER_ADMIN) return;

    const membership = this.currentPrimaryMembership(target);
    if (
      !actor.officeId ||
      !membership ||
      membership.officeId !== actor.officeId
    ) {
      throw new ForbiddenException(
        `${label} must have an active PRIMARY membership in your Office.`,
      );
    }
  }

  private assertOperationalActor(account: WorkAccountRecord): void {
    this.assertOperationalAccount(
      account,
      'Your account is not available for operational work management.',
    );
  }

  private assertOperationalManager(account: WorkAccountRecord): void {
    this.assertOperationalAccount(
      account,
      'The selected responsible manager is not operationally available.',
    );
  }

  private assertOperationalAssignableAccount(account: WorkAccountRecord): void {
    this.assertOperationalAccount(
      account,
      'The selected staff member is not available for work assignment.',
    );
  }

  private assertOperationalEmployee(account: WorkAccountRecord): void {
    this.assertOperationalAccount(
      account,
      'The selected employee is not available for work assignment.',
    );
  }

  private assertOperationalAccount(
    account: WorkAccountRecord,
    errorMessage: string,
  ): void {
    const employee = account.employee;

    if (
      !account.isEnabled ||
      account.accountClass !== AccountClass.OFFICE_USER ||
      !employee ||
      employee.status !== EmployeeStatus.ACTIVE ||
      employee.employmentStatus !== EmploymentStatus.ACTIVE ||
      employee.archivedAt !== null ||
      !employee.isActivated ||
      !this.currentPrimaryMembership(account)
    ) {
      throw new ForbiddenException(errorMessage);
    }
  }

  private assertAssignableRole(
    actor: WorkActorContext,
    target: WorkAccountRecord,
  ): void {
    this.assertOfficeOperationalManager(
      actor,
      'You do not have V3 Work assignment authority.',
    );
    if (target.accountClass === AccountClass.SUPER_ADMIN) {
      throw new ForbiddenException(
        'The Super Admin cannot receive operational Work assignments.',
      );
    }
  }

  private assertAccountInsideActorScope(
    actor: WorkActorContext,
    target: WorkAccountRecord,
  ): void {
    if (actor.accountClass === AccountClass.SUPER_ADMIN) return;

    const membership = this.currentPrimaryMembership(target);
    if (
      !actor.officeId ||
      !membership ||
      membership.officeId !== actor.officeId
    ) {
      throw new ForbiddenException(
        'The selected employee is outside your authorized Office scope.',
      );
    }

    if (
      membership.orgUnitId &&
      (actor.assignableOrgUnitIds ?? []).includes(membership.orgUnitId)
    ) {
      return;
    }

    const ledTeamIds = new Set(actor.operationalTeamLeadIds ?? []);
    if (
      ledTeamIds.size > 0 &&
      this.activeOperationalTeamMembershipIds(target).some((teamId) =>
        ledTeamIds.has(teamId),
      )
    ) {
      return;
    }

    throw new ForbiddenException(
      'The selected employee is outside your authorized V3 OrgUnit or Operational Team scope.',
    );
  }

  private assertOfficeOperationalManager(
    actor: WorkActorContext,
    errorMessage: string,
  ): void {
    if (actor.accountClass === AccountClass.SUPER_ADMIN) {
      throw new ForbiddenException(
        'The Super Admin has read-only operational Work access.',
      );
    }

    if (
      !actor.officeId ||
      ((actor.assignableOrgUnitIds?.length ?? 0) === 0 &&
        (actor.operationalTeamLeadIds?.length ?? 0) === 0)
    ) {
      throw new ForbiddenException(errorMessage);
    }
  }

  private accountHasOperationalManagementAuthority(
    account: WorkAccountRecord,
    at = new Date(),
  ): boolean {
    if (
      account.accountClass !== AccountClass.OFFICE_USER ||
      !account.employee
    ) {
      return false;
    }

    const hasLeadership = account.employee.orgLeadershipAssignments.some(
      (assignment) =>
        assignment.effectiveFrom <= at &&
        (!assignment.effectiveUntil || assignment.effectiveUntil > at) &&
        (assignment.leadershipType === OrgLeadershipType.OFFICE_HEAD ||
          assignment.leadershipType === OrgLeadershipType.ORG_UNIT_HEAD ||
          assignment.leadershipType === OrgLeadershipType.TEAM_LEAD),
    );

    const leadsOperationalTeam =
      account.employee.operationalTeamLeadAssignments.some(
        (assignment) =>
          assignment.effectiveFrom <= at &&
          (!assignment.effectiveUntil || assignment.effectiveUntil > at) &&
          assignment.team.isActive &&
          assignment.team.archivedAt === null &&
          assignment.team.orgUnit.isActive,
      );

    return hasLeadership || leadsOperationalTeam;
  }

  private async resolveV3WorkScope(
    account: WorkAccountRecord,
    officeId: string,
    at = new Date(),
  ): Promise<{
    visibleOrgUnitIds: string[];
    assignableOrgUnitIds: string[];
    operationalTeamLeadIds: string[];
    operationalTeamMemberIds: string[];
  }> {
    const visibleOrgUnitIds = new Set<string>();
    const assignableOrgUnitIds = new Set<string>();
    const employee = account.employee;

    if (!employee) {
      return {
        visibleOrgUnitIds: [],
        assignableOrgUnitIds: [],
        operationalTeamLeadIds: [],
        operationalTeamMemberIds: [],
      };
    }

    let officeOrgUnitIds: string[] | null = null;
    const loadOfficeOrgUnitIds = async () => {
      if (officeOrgUnitIds) return officeOrgUnitIds;
      const units = await this.prisma.orgUnit.findMany({
        where: { officeId, isActive: true },
        select: { id: true },
      });
      officeOrgUnitIds = units.map((unit) => unit.id);
      return officeOrgUnitIds;
    };

    const addOrgUnitWithDescendants = async (
      orgUnitId: string,
      target: Set<string>,
    ) => {
      target.add(orgUnitId);
      const descendants = await this.prisma.orgUnitClosure.findMany({
        where: {
          ancestorOrgUnitId: orgUnitId,
          descendantOrgUnit: { is: { officeId, isActive: true } },
        },
        select: { descendantOrgUnitId: true },
      });
      descendants.forEach((item) => target.add(item.descendantOrgUnitId));
    };

    const leadership = employee.orgLeadershipAssignments.filter(
      (assignment) =>
        assignment.officeId === officeId &&
        assignment.effectiveFrom <= at &&
        (!assignment.effectiveUntil || assignment.effectiveUntil > at),
    );

    if (
      leadership.some(
        (assignment) =>
          assignment.leadershipType === OrgLeadershipType.OFFICE_HEAD,
      )
    ) {
      const ids = await loadOfficeOrgUnitIds();
      ids.forEach((id) => {
        visibleOrgUnitIds.add(id);
        assignableOrgUnitIds.add(id);
      });
    } else {
      const headedOrgUnitIds = new Set(
        leadership
          .filter(
            (assignment) =>
              assignment.leadershipType === OrgLeadershipType.ORG_UNIT_HEAD &&
              assignment.orgUnitId,
          )
          .map((assignment) => assignment.orgUnitId as string),
      );

      for (const orgUnitId of headedOrgUnitIds) {
        await addOrgUnitWithDescendants(orgUnitId, visibleOrgUnitIds);
        await addOrgUnitWithDescendants(orgUnitId, assignableOrgUnitIds);
      }
    }

    const operationalTeamLeadIds = employee.operationalTeamLeadAssignments
      .filter(
        (assignment) =>
          assignment.effectiveFrom <= at &&
          (!assignment.effectiveUntil || assignment.effectiveUntil > at) &&
          assignment.team.isActive &&
          assignment.team.archivedAt === null &&
          assignment.team.orgUnit.isActive &&
          assignment.team.orgUnit.officeId === officeId,
      )
      .map((assignment) => assignment.teamId);

    const operationalTeamMemberIds = this.activeOperationalTeamMembershipIds(
      account,
      at,
    );

    const delegations = await this.prisma.delegatedPermission.findMany({
      where: {
        granteeAccountId: account.id,
        officeId,
        capability: {
          in: [CAPABILITIES.WORK_VIEW, CAPABILITIES.WORK_ASSIGN],
        },
        revokedAt: null,
        effectiveFrom: { lte: at },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
      },
      select: {
        capability: true,
        orgUnitId: true,
        includeDescendants: true,
      },
    });

    for (const grant of delegations) {
      const targets =
        grant.capability === CAPABILITIES.WORK_ASSIGN
          ? [visibleOrgUnitIds, assignableOrgUnitIds]
          : [visibleOrgUnitIds];

      if (!grant.orgUnitId) {
        const ids = await loadOfficeOrgUnitIds();
        for (const target of targets) ids.forEach((id) => target.add(id));
        continue;
      }

      for (const target of targets) {
        target.add(grant.orgUnitId);
        if (grant.includeDescendants) {
          await addOrgUnitWithDescendants(grant.orgUnitId, target);
        }
      }
    }

    return {
      visibleOrgUnitIds: [...visibleOrgUnitIds],
      assignableOrgUnitIds: [...assignableOrgUnitIds],
      operationalTeamLeadIds,
      operationalTeamMemberIds,
    };
  }

  private activeOperationalTeamMembershipIds(
    account: WorkAccountRecord,
    at = new Date(),
  ): string[] {
    return (
      account.employee?.operationalTeamMemberships
        .filter(
          (membership) =>
            membership.startsAt <= at &&
            (!membership.endsAt || membership.endsAt > at) &&
            membership.team.isActive &&
            membership.team.archivedAt === null &&
            membership.team.orgUnit.isActive,
        )
        .map((membership) => membership.teamId) ?? []
    );
  }

  private currentPrimaryMembership(
    account: WorkAccountRecord,
    at = new Date(),
  ) {
    return (
      account.employee?.orgMemberships.find(
        (membership) =>
          membership.startsAt <= at &&
          (!membership.endsAt || membership.endsAt > at) &&
          membership.office.isActive &&
          (!membership.orgUnit || membership.orgUnit.isActive),
      ) ?? null
    );
  }
}
