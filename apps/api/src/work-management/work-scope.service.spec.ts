import { ForbiddenException } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
  OrgLeadershipType,
} from '../generated/prisma/enums';
import { WorkScopeService, type WorkActorContext } from './work-scope.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

const activeSince = new Date('2026-01-01T00:00:00.000Z');

function createAccount(input: {
  id: string;
  role?: AccountRole;
  officeId?: string;
  orgUnitId?: string | null;
  leadershipType?: OrgLeadershipType | null;
  teamMembershipIds?: string[];
  teamLeadIds?: string[];
}) {
  const role = input.role ?? AccountRole.EMPLOYEE;
  const officeId = input.officeId ?? 'office-a';
  const orgUnitId =
    input.orgUnitId === undefined ? 'org-unit-a' : input.orgUnitId;
  const leadershipType = input.leadershipType ?? null;

  const team = (teamId: string) => ({
    id: teamId,
    orgUnitId: orgUnitId ?? 'org-team',
    isActive: true,
    archivedAt: null,
    orgUnit: { officeId, isActive: true },
  });

  return {
    id: input.id,
    role,
    accountClass:
      role === AccountRole.SUPER_ADMIN
        ? AccountClass.SUPER_ADMIN
        : AccountClass.OFFICE_USER,
    isEnabled: true,
    username: `${input.id}@ntc.test`,
    superAdminProfile: null,
    employee:
      role === AccountRole.SUPER_ADMIN
        ? null
        : {
            id: `employee-${input.id}`,
            empId: `NTC-${input.id}`,
            empName: input.id,
            designation: null,
            status: EmployeeStatus.ACTIVE,
            employmentStatus: EmploymentStatus.ACTIVE,
            archivedAt: null,
            isActivated: true,
            orgMemberships: [
              {
                officeId,
                orgUnitId,
                startsAt: activeSince,
                endsAt: null,
                office: { isActive: true },
                orgUnit: orgUnitId ? { isActive: true } : null,
              },
            ],
            orgLeadershipAssignments: leadershipType
              ? [
                  {
                    officeId,
                    orgUnitId:
                      leadershipType === OrgLeadershipType.OFFICE_HEAD
                        ? null
                        : orgUnitId,
                    leadershipType,
                    effectiveFrom: activeSince,
                    effectiveUntil: null,
                  },
                ]
              : [],
            operationalTeamMemberships: (input.teamMembershipIds ?? []).map(
              (teamId) => ({
                teamId,
                startsAt: activeSince,
                endsAt: null,
                team: team(teamId),
              }),
            ),
            operationalTeamLeadAssignments: (input.teamLeadIds ?? []).map(
              (teamId) => ({
                teamId,
                effectiveFrom: activeSince,
                effectiveUntil: null,
                team: team(teamId),
              }),
            ),
          },
  };
}

function actor(input: {
  id: string;
  role?: AccountRole;
  officeId?: string | null;
  primaryOrgUnitId?: string | null;
  visibleOrgUnitIds?: string[];
  assignableOrgUnitIds?: string[];
  operationalTeamLeadIds?: string[];
}): WorkActorContext {
  const role = input.role ?? AccountRole.EMPLOYEE;
  const isSuperAdmin = role === AccountRole.SUPER_ADMIN;

  return {
    accountId: input.id,
    role,
    accountClass: isSuperAdmin
      ? AccountClass.SUPER_ADMIN
      : AccountClass.OFFICE_USER,
    officeId:
      input.officeId === undefined
        ? isSuperAdmin
          ? null
          : 'office-a'
        : input.officeId,
    primaryOrgUnitId:
      input.primaryOrgUnitId === undefined
        ? isSuperAdmin
          ? null
          : 'org-unit-a'
        : input.primaryOrgUnitId,
    visibleOrgUnitIds: input.visibleOrgUnitIds ?? [],
    assignableOrgUnitIds: input.assignableOrgUnitIds ?? [],
    operationalTeamLeadIds: input.operationalTeamLeadIds ?? [],
  };
}

describe('WorkScopeService', () => {
  const prisma = {
    account: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    operationalTeam: {
      findUnique: jest.fn(),
    },
    orgUnit: {
      findMany: jest.fn(),
    },
    orgUnitClosure: {
      findMany: jest.fn(),
    },
    delegatedPermission: {
      findMany: jest.fn(),
    },
  } as unknown as PrismaService;
  const service = new WorkScopeService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(prisma.orgUnit.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.orgUnitClosure.findMany).mockResolvedValue([] as never);
    jest
      .mocked(prisma.delegatedPermission.findMany)
      .mockResolvedValue([] as never);
  });

  it('resolves Office Head Work scope from active V3 Office leadership', async () => {
    const officeHead = createAccount({
      id: 'office-head',
      role: AccountRole.EMPLOYEE,
      leadershipType: OrgLeadershipType.OFFICE_HEAD,
    });
    jest
      .mocked(prisma.account.findUnique)
      .mockResolvedValue(officeHead as never);
    jest
      .mocked(prisma.orgUnit.findMany)
      .mockResolvedValue([{ id: 'org-a' }, { id: 'org-b' }] as never);

    await expect(
      service.resolveActorContext({
        accountId: officeHead.id,
        sessionId: 'session',
        username: officeHead.username,
        accountClass: officeHead.accountClass,
        role: officeHead.role,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        accountId: officeHead.id,
        role: AccountRole.EMPLOYEE,
        accountClass: AccountClass.OFFICE_USER,
        officeId: 'office-a',
        visibleOrgUnitIds: ['org-a', 'org-b'],
        assignableOrgUnitIds: ['org-a', 'org-b'],
      }),
    );
  });

  it('resolves Org Unit Head descendants without consulting Division or Department scope', async () => {
    const head = createAccount({
      id: 'org-head',
      role: AccountRole.EMPLOYEE,
      orgUnitId: 'org-parent',
      leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
    });
    jest.mocked(prisma.account.findUnique).mockResolvedValue(head as never);
    jest
      .mocked(prisma.orgUnitClosure.findMany)
      .mockResolvedValue([{ descendantOrgUnitId: 'org-child' }] as never);

    const resolved = await service.resolveActorContext({
      accountId: head.id,
      sessionId: 'session',
      username: head.username,
      accountClass: head.accountClass,
      role: head.role,
    });

    expect(new Set(resolved.assignableOrgUnitIds)).toEqual(
      new Set(['org-parent', 'org-child']),
    );
  });

  it('adds delegated work.assign descendants to V3 assignment scope', async () => {
    const employee = createAccount({
      id: 'delegate',
      role: AccountRole.EMPLOYEE,
    });
    jest.mocked(prisma.account.findUnique).mockResolvedValue(employee as never);
    jest.mocked(prisma.delegatedPermission.findMany).mockResolvedValue([
      {
        capability: 'work.assign',
        orgUnitId: 'org-delegated',
        includeDescendants: true,
      },
    ] as never);
    jest
      .mocked(prisma.orgUnitClosure.findMany)
      .mockResolvedValue([
        { descendantOrgUnitId: 'org-delegated-child' },
      ] as never);

    const resolved = await service.resolveActorContext({
      accountId: employee.id,
      sessionId: 'session',
      username: employee.username,
      accountClass: employee.accountClass,
      role: employee.role,
    });

    expect(new Set(resolved.assignableOrgUnitIds)).toEqual(
      new Set(['org-delegated', 'org-delegated-child']),
    );
    expect(new Set(resolved.visibleOrgUnitIds)).toEqual(
      new Set(['org-delegated', 'org-delegated-child']),
    );
  });

  it('allows an Org Unit Head to assign an employee inside its V3 subtree', async () => {
    const target = createAccount({
      id: 'employee',
      role: AccountRole.EMPLOYEE,
      orgUnitId: 'org-child',
    });
    jest.mocked(prisma.account.findMany).mockResolvedValue([target] as never);

    await expect(
      service.resolveAssignableAccounts(
        actor({
          id: 'org-head',
          role: AccountRole.EMPLOYEE,
          assignableOrgUnitIds: ['org-parent', 'org-child'],
        }),
        [target.id],
      ),
    ).resolves.toEqual([target]);
  });

  it('rejects a target outside the authorized V3 OrgUnit scope', async () => {
    const target = createAccount({
      id: 'outside',
      role: AccountRole.EMPLOYEE,
      orgUnitId: 'org-outside',
    });
    jest.mocked(prisma.account.findMany).mockResolvedValue([target] as never);

    await expect(
      service.resolveAssignableAccounts(
        actor({
          id: 'org-head',
          role: AccountRole.EMPLOYEE,
          assignableOrgUnitIds: ['org-parent'],
        }),
        [target.id],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not grant Work assignment authority from Operational Team Lead status', async () => {
    const target = createAccount({
      id: 'team-member',
      role: AccountRole.EMPLOYEE,
      orgUnitId: 'org-team',
      teamMembershipIds: ['team-a'],
    });
    jest.mocked(prisma.account.findMany).mockResolvedValue([target] as never);

    await expect(
      service.resolveAssignableAccounts(
        actor({
          id: 'team-lead',
          role: AccountRole.EMPLOYEE,
          operationalTeamLeadIds: ['team-a'],
        }),
        [target.id],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('authorizes Administrative individual assignment by V3 scope instead of compatibility role', () => {
    const manager = createAccount({
      id: 'manager',
      role: AccountRole.EMPLOYEE,
      orgUnitId: 'org-a',
    });
    const outsideManager = createAccount({
      id: 'outside-manager',
      role: AccountRole.EMPLOYEE,
      orgUnitId: 'org-b',
    });
    const officeHead = actor({
      id: 'office-head',
      role: AccountRole.EMPLOYEE,
      assignableOrgUnitIds: ['org-a'],
    });

    expect(() =>
      service.assertAdministrativeIndividualAssignee(
        officeHead,
        manager as never,
      ),
    ).not.toThrow();
    expect(() =>
      service.assertAdministrativeIndividualAssignee(
        officeHead,
        outsideManager as never,
      ),
    ).toThrow(ForbiddenException);
  });

  it('builds management visibility from V3 OrgUnit and participant scope', () => {
    const where = service.buildVisibleWorkWhere(
      actor({
        id: 'head',
        role: AccountRole.EMPLOYEE,
        visibleOrgUnitIds: ['org-a', 'org-b'],
      }),
    );

    expect(where).toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([
          { primaryOwnerOrgUnitId: { in: ['org-a', 'org-b'] } },
          {
            orgUnitParticipants: {
              some: { orgUnitId: { in: ['org-a', 'org-b'] } },
            },
          },
        ]),
      }),
    );
    expect(JSON.stringify(where)).not.toContain('divisionId');
    expect(JSON.stringify(where)).not.toContain('departmentId');
  });

  it('keeps Team Lead identity out of the management hierarchy overview scope', () => {
    const where = service.buildOrganizationHierarchyWorkWhere(
      actor({
        id: 'team-lead',
        role: AccountRole.EMPLOYEE,
        visibleOrgUnitIds: ['org-a'],
        operationalTeamLeadIds: ['team-a'],
      }),
    );

    expect(JSON.stringify(where)).toContain('primaryOwnerOrgUnitId');
    expect(JSON.stringify(where)).not.toContain('targetOperationalTeamId');
    expect(JSON.stringify(where)).not.toContain('divisionId');
    expect(JSON.stringify(where)).not.toContain('departmentId');
  });

  it('keeps Team Lead team Work visible through the normal employee Work scope', () => {
    const where = service.buildVisibleWorkWhere(
      actor({
        id: 'team-lead',
        role: AccountRole.EMPLOYEE,
        operationalTeamLeadIds: ['team-a'],
      }),
    );

    const serialized = JSON.stringify(where);
    expect(serialized).toContain('assignedOperationalTeamId');
    expect(serialized).toContain('team-a');
    expect(serialized).not.toContain('divisionId');
    expect(serialized).not.toContain('departmentId');
  });

  it('keeps ordinary Employee visibility assignment/personal-work scoped', () => {
    const where = service.buildVisibleWorkWhere(
      actor({ id: 'employee', role: AccountRole.EMPLOYEE }),
    );
    const serialized = JSON.stringify(where);

    expect(serialized).toContain('assigneeAccountId');
    expect(serialized).toContain('salesMemberAccountId');
    expect(serialized).not.toContain('divisionId');
    expect(serialized).not.toContain('departmentId');
  });

  it('allows direct help across OrgUnits in the same Office', async () => {
    const helper = createAccount({
      id: 'helper',
      role: AccountRole.EMPLOYEE,
      orgUnitId: 'org-other',
    });
    jest.mocked(prisma.account.findUnique).mockResolvedValue(helper as never);

    await expect(
      service.resolveHelpCandidate(
        actor({ id: 'employee', role: AccountRole.EMPLOYEE }),
        helper.id,
        'org-source',
      ),
    ).resolves.toEqual(helper);
  });

  it('denies Work management when an Office user has no V3 assignment authority', () => {
    expect(() =>
      service.assertCanManageWork(
        actor({ id: 'office-user', role: AccountRole.EMPLOYEE }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows delegated Work management regardless of the compatibility Employee role', () => {
    expect(() =>
      service.assertCanManageWork(
        actor({
          id: 'delegate',
          role: AccountRole.EMPLOYEE,
          assignableOrgUnitIds: ['org-a'],
        }),
      ),
    ).not.toThrow();
  });

  it('denies Super Admin operational Work management even though the compatibility role is privileged', () => {
    expect(() =>
      service.assertCanManageWork(
        actor({ id: 'super-admin', role: AccountRole.SUPER_ADMIN }),
      ),
    ).toThrow(ForbiddenException);
  });
});
