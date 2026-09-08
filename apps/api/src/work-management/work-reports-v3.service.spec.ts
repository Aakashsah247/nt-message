import { ForbiddenException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import {
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
  WorkItemStatus,
  WorkRuntimeStatus,
  WorkStageAssignmentRole,
  WorkStageAssignmentTargetType,
  WorkStageStatus,
} from '../generated/prisma/enums';
import { CAPABILITIES } from '../organization/organization-capabilities';
import { WorkReportV3ExportDataset } from './dto/work-report-v3-export-query.dto';
import { WorkReportV3SlaState } from './dto/work-report-v3-query.dto';
import { WorkReportsV3Service } from './work-reports-v3.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

const officeId = '11111111-1111-4111-8111-111111111111';
const orgUnitId = '22222222-2222-4222-8222-222222222222';
const childOrgUnitId = '33333333-3333-4333-8333-333333333333';
const teamId = '44444444-4444-4444-8444-444444444444';

function activeOfficeUser(role: AccountRole = AccountRole.EMPLOYEE) {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    role,
    isEnabled: true,
    employee: {
      id: '66666666-6666-4666-8666-666666666666',
      status: EmployeeStatus.ACTIVE,
      employmentStatus: EmploymentStatus.ACTIVE,
      archivedAt: null,
      orgMemberships: [{ orgUnitId }],
    },
  };
}

function createHarness() {
  const accountFindUnique = jest.fn().mockResolvedValue(activeOfficeUser());
  const officeFindUnique = jest.fn().mockResolvedValue({
    id: officeId,
    code: 'PATAN',
    name: 'Patan Telecom Office',
    isActive: true,
  });
  const orgUnitFindMany = jest.fn().mockImplementation(async (args) => {
    const ids = args?.where?.id?.in;
    if (Array.isArray(ids)) return ids.map((id: string) => ({ id }));
    return [];
  });
  const orgUnitCount = jest.fn().mockResolvedValue(4);
  const operationalTeamFindMany = jest.fn().mockImplementation(async (args) => {
    if (args?.where?.leadAssignments) return [];
    if (args?.where?.members) return [];
    return [];
  });
  const operationalTeamFindFirst = jest.fn().mockResolvedValue({ id: teamId });
  const operationalTeamCount = jest.fn().mockResolvedValue(3);
  const workTypeDefinitionFindMany = jest.fn().mockResolvedValue([]);
  const workTypeDefinitionFindFirst = jest.fn().mockResolvedValue({ id: 'type-1' });
  const workTypeDefinitionCount = jest.fn().mockResolvedValue(8);
  const workItemCount = jest.fn().mockResolvedValue(0);
  const workItemGroupBy = jest.fn().mockResolvedValue([]);
  const workItemFindMany = jest.fn().mockResolvedValue([]);
  const workOrgUnitParticipantCount = jest.fn().mockResolvedValue(0);
  const workOrgUnitParticipantFindMany = jest.fn().mockResolvedValue([]);
  const workStageCount = jest.fn().mockResolvedValue(0);
  const workStageGroupBy = jest.fn().mockResolvedValue([]);
  const workStageFindMany = jest.fn().mockResolvedValue([]);
  const workStageAssignmentCount = jest.fn().mockResolvedValue(0);
  const workStageAssignmentFindMany = jest.fn().mockResolvedValue([]);

  const prisma = {
    account: { findUnique: accountFindUnique },
    office: { findUnique: officeFindUnique },
    orgUnit: { findMany: orgUnitFindMany, count: orgUnitCount },
    operationalTeam: {
      findMany: operationalTeamFindMany,
      findFirst: operationalTeamFindFirst,
      count: operationalTeamCount,
    },
    workTypeDefinition: {
      findMany: workTypeDefinitionFindMany,
      findFirst: workTypeDefinitionFindFirst,
      count: workTypeDefinitionCount,
    },
    workItem: {
      count: workItemCount,
      groupBy: workItemGroupBy,
      findMany: workItemFindMany,
    },
    workOrgUnitParticipant: {
      count: workOrgUnitParticipantCount,
      findMany: workOrgUnitParticipantFindMany,
    },
    workStage: {
      count: workStageCount,
      groupBy: workStageGroupBy,
      findMany: workStageFindMany,
    },
    workStageAssignment: {
      count: workStageAssignmentCount,
      findMany: workStageAssignmentFindMany,
    },
  };

  const can = jest.fn().mockResolvedValue(false);
  const visibleOrgUnitIds = jest.fn().mockResolvedValue([]);
  const authorization = { can, visibleOrgUnitIds };

  const service = new WorkReportsV3Service(
    prisma as never,
    authorization as never,
  );

  return {
    service,
    accountFindUnique,
    orgUnitFindMany,
    operationalTeamFindMany,
    workItemCount,
    workItemGroupBy,
    workItemFindMany,
    workOrgUnitParticipantCount,
    workOrgUnitParticipantFindMany,
    workStageCount,
    workStageGroupBy,
    workStageFindMany,
    workStageAssignmentCount,
    workStageAssignmentFindMany,
    can,
    visibleOrgUnitIds,
  };
}

function user(role: AccountRole = AccountRole.EMPLOYEE): AuthenticatedUser {
  return {
    accountId:
      role === AccountRole.SUPER_ADMIN
        ? '77777777-7777-4777-8777-777777777777'
        : '55555555-5555-4555-8555-555555555555',
    sessionId: 'session-1',
    username: 'tester',
    role,
  };
}

function workRecordFixture(index: number) {
  return {
    id: `work-export-${index}`,
    ticketNumber: `NT-PATAN-OUT-2026-${String(index).padStart(6, '0')}`,
    createdAt: new Date('2026-09-08T10:00:00.000Z'),
    runtimeStatus: WorkRuntimeStatus.IN_PROGRESS,
    workTypeVersion: {
      name: 'New Installation',
      workTypeDefinition: {
        id: '88888888-8888-4888-8888-888888888888',
        code: 'NEW_INSTALLATION',
      },
    },
    primaryOwnerOrgUnit: {
      id: orgUnitId,
      code: 'OUT',
      name: 'Outside Service',
    },
    references: [
      { referenceType: 'SERVICE_NUMBER', value: `01-${index}` },
      { referenceType: 'TOKEN_NUMBER', value: `TOKEN-${index}` },
      { referenceType: 'CPC_SERIAL', value: `CPC-${index}` },
    ],
    runtimeStages: [
      {
        assignments: [
          {
            targetOperationalTeam: {
              id: teamId,
              code: 'KTM',
              name: 'KTM Team',
            },
          },
        ],
      },
    ],
  };
}

describe('WorkReportsV3Service — P10-1 report scope and counting foundation', () => {
  it('gives Super Admin Office-wide read/export oversight without operational mutation authority', async () => {
    const harness = createHarness();
    harness.accountFindUnique.mockResolvedValue({
      id: user(AccountRole.SUPER_ADMIN).accountId,
      role: AccountRole.SUPER_ADMIN,
      isEnabled: true,
      employee: null,
    });
    harness.can.mockImplementation(async (_user, capability) =>
      [CAPABILITIES.REPORTS_VIEW, CAPABILITIES.REPORTS_EXPORT].includes(
        capability,
      ),
    );

    const context = await harness.service.getContext(
      user(AccountRole.SUPER_ADMIN),
      officeId,
    );

    expect(context.scope.type).toBe('OFFICE');
    expect(context.scope.availableActions).toEqual({ view: true, export: true });
    expect(harness.can).toHaveBeenCalledWith(
      expect.anything(),
      CAPABILITIES.REPORTS_VIEW,
      officeId,
      null,
    );
  });

  it('uses OrgUnit report capability scope instead of legacy management roles', async () => {
    const harness = createHarness();
    harness.visibleOrgUnitIds
      .mockResolvedValueOnce([orgUnitId, childOrgUnitId])
      .mockResolvedValueOnce([orgUnitId, childOrgUnitId]);

    const context = await harness.service.getContext(user(), officeId);

    expect(context.scope.type).toBe('ORG_UNIT_SUBTREE');
    expect(context.scope.orgUnitIds).toEqual([orgUnitId, childOrgUnitId]);
    expect(context.scope.availableActions.export).toBe(true);
    expect(harness.visibleOrgUnitIds).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      CAPABILITIES.REPORTS_VIEW,
      officeId,
    );
  });

  it('derives Team Lead report scope from OperationalTeamLeadAssignment only', async () => {
    const harness = createHarness();
    harness.operationalTeamFindMany.mockImplementation(async (args) => {
      if (args?.where?.leadAssignments) {
        return [{ id: teamId, orgUnitId }];
      }
      if (args?.where?.members) return [{ id: teamId }];
      return [
        {
          id: teamId,
          code: 'KTM',
          name: 'KTM Team',
          orgUnitId,
          isActive: true,
          archivedAt: null,
        },
      ];
    });

    const context = await harness.service.getContext(user(), officeId);

    expect(context.scope.type).toBe('TEAM');
    expect(context.scope.operationalTeamIds).toEqual([teamId]);
    expect(context.scope.orgUnitIds).toEqual([orgUnitId]);
    expect(context.filters.operationalTeams).toEqual([
      {
        id: teamId,
        code: 'KTM',
        name: 'KTM Team',
        orgUnitId,
        isActive: true,
        archivedAt: null,
      },
    ]);
  });

  it('keeps a normal employee on personal Work scope and rejects organization browsing filters', async () => {
    const harness = createHarness();

    const context = await harness.service.getContext(user(), officeId);
    expect(context.scope.type).toBe('PERSONAL');
    expect(context.filters.canFilterByOrgUnit).toBe(false);
    expect(context.filters.canFilterByOperationalTeam).toBe(false);

    await expect(
      harness.service.buildScopedWorkWhere(user(), officeId, { orgUnitId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('counts filtered report Work through WorkItem IDs so stage and participant joins cannot multiply totals', async () => {
    const harness = createHarness();
    harness.workItemCount.mockResolvedValueOnce(7);

    const result = await harness.service.getDistinctWorkCount(
      user(),
      officeId,
      { runtimeStatus: WorkRuntimeStatus.IN_PROGRESS },
    );

    expect(result.distinctWork).toBe(7);
    const where = harness.workItemCount.mock.calls[0]?.[0]?.where as {
      AND: unknown[];
    };
    expect(Array.isArray(where.AND)).toBe(true);
    expect(JSON.stringify(where)).toContain('V3_RUNTIME');
    expect(JSON.stringify(where)).toContain('IN_PROGRESS');
  });

  it('reconciles V3 Work with distinct WorkItem counting instead of participant/stage row totals', async () => {
    const harness = createHarness();
    harness.can.mockResolvedValue(true);
    harness.workItemCount
      .mockResolvedValueOnce(45)
      .mockResolvedValueOnce(45)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    harness.workOrgUnitParticipantCount
      .mockResolvedValueOnce(72)
      .mockResolvedValueOnce(0);
    harness.workStageCount
      .mockResolvedValueOnce(54)
      .mockResolvedValueOnce(0);
    harness.workStageAssignmentCount
      .mockResolvedValueOnce(21)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(12);

    const result = await harness.service.getReconciliation(user(), officeId);

    expect(result.counts.nativeV3Work).toBe(45);
    expect(result.counts.reportableV3Work).toBe(45);
    expect(result.counts.participantRows).toBe(72);
    expect(result.counts.runtimeStages).toBe(54);
    expect(result.counts.operationalTeamAssignments).toBe(21);
    expect(result.counts.activeTeamAssignmentsMissingOperationalTeamTarget).toBe(0);
    expect(result.counts.legacyTeamCompatibilityPointers).toBe(12);
    expect(result.counts.workWithLegacyTeamPrimaryOwner).toBe(0);
    expect(result.counts.participantsOnLegacyTeamOrgUnits).toBe(0);
    expect(result.counts.stagesWithLegacyTeamResponsibleOrgUnit).toBe(0);
    expect(result.invariants.distinctWorkCounting).toBe(true);
    expect(harness.workItemCount).toHaveBeenCalledWith({
      where: {
        officeId,
        status: WorkItemStatus.V3_RUNTIME,
        workTypeVersionId: { not: null },
        primaryOwnerOrgUnitId: { not: null },
        runtimeStatus: { not: null },
      },
    });
    expect(harness.workStageAssignmentCount).toHaveBeenNthCalledWith(1, {
      where: {
        workStage: {
          is: {
            workItem: {
              is: expect.objectContaining({ officeId }),
            },
          },
        },
        targetType: WorkStageAssignmentTargetType.TEAM,
        targetOperationalTeamId: { not: null },
      },
    });
  });


  it('builds overview totals without multiplying Work through participants, stages, or Team assignments', async () => {
    const harness = createHarness();
    harness.can.mockResolvedValue(true);
    harness.workItemCount
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    harness.workItemGroupBy
      .mockResolvedValueOnce([
        { runtimeStatus: WorkRuntimeStatus.OPEN, _count: { _all: 2 } },
        { runtimeStatus: WorkRuntimeStatus.IN_PROGRESS, _count: { _all: 2 } },
        { runtimeStatus: WorkRuntimeStatus.COMPLETED, _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { primaryOwnerOrgUnitId: orgUnitId, _count: { _all: 5 } },
      ])
      .mockResolvedValueOnce([
        { primaryOwnerOrgUnitId: orgUnitId, _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { primaryOwnerOrgUnitId: orgUnitId, _count: { _all: 1 } },
      ]);
    harness.workOrgUnitParticipantFindMany.mockResolvedValue([
      { orgUnitId: childOrgUnitId, workItemId: 'work-1' },
      { orgUnitId: childOrgUnitId, workItemId: 'work-1' },
      { orgUnitId: childOrgUnitId, workItemId: 'work-2' },
    ]);
    harness.workStageGroupBy.mockResolvedValue([
      { responsibleOrgUnitId: childOrgUnitId, _count: { _all: 4 } },
    ]);
    harness.workStageAssignmentFindMany.mockResolvedValue([
      { targetOperationalTeamId: teamId, workStage: { workItemId: 'work-1' } },
      { targetOperationalTeamId: teamId, workStage: { workItemId: 'work-1' } },
      { targetOperationalTeamId: teamId, workStage: { workItemId: 'work-2' } },
    ]);
    harness.orgUnitFindMany.mockResolvedValueOnce([
      { id: orgUnitId, code: 'OUT', name: 'Outside Service' },
      { id: childOrgUnitId, code: 'ACC', name: 'Accounts' },
    ]);
    harness.operationalTeamFindMany.mockResolvedValueOnce([
      { id: teamId, code: 'KTM', name: 'KTM Team', orgUnitId },
    ]);

    const result = await harness.service.getOverview(
      user(),
      officeId,
      {},
    );

    expect(result.totalWork).toBe(5);
    expect(result.statuses.OPEN).toBe(2);
    expect(result.statuses.IN_PROGRESS).toBe(2);
    expect(result.statuses.COMPLETED).toBe(1);
    expect(result.sla).toEqual({ overdue: 1, dueSoon: 1 });
    expect(result.organizationPerformance).toEqual([
      {
        orgUnit: { id: orgUnitId, code: 'OUT', name: 'Outside Service' },
        primaryOwnerWork: 5,
        participantWork: 0,
        responsibleStages: 0,
        completedWork: 1,
        overdueWork: 1,
      },
      {
        orgUnit: { id: childOrgUnitId, code: 'ACC', name: 'Accounts' },
        primaryOwnerWork: 0,
        participantWork: 2,
        responsibleStages: 4,
        completedWork: 0,
        overdueWork: 0,
      },
    ]);
    expect(result.teamExecution).toEqual([
      {
        operationalTeam: {
          id: teamId,
          code: 'KTM',
          name: 'KTM Team',
          orgUnitId,
        },
        workCount: 2,
      },
    ]);
  });

  it('returns compact V3 Work Records and never exposes Service Number for New Installation', async () => {
    const harness = createHarness();
    harness.can.mockResolvedValue(true);
    harness.workItemCount.mockResolvedValueOnce(1);
    harness.workItemFindMany.mockResolvedValueOnce([
      {
        id: 'work-1',
        ticketNumber: 'NT-PATAN-OUT-2026-000001',
        createdAt: new Date('2026-09-08T10:00:00.000Z'),
        runtimeStatus: WorkRuntimeStatus.IN_PROGRESS,
        workTypeVersion: {
          name: 'New Installation',
          workTypeDefinition: {
            id: '88888888-8888-4888-8888-888888888888',
            code: 'NEW_INSTALLATION',
          },
        },
        primaryOwnerOrgUnit: {
          id: orgUnitId,
          code: 'OUT',
          name: 'Outside Service',
        },
        references: [
          { referenceType: 'SERVICE_NUMBER', value: '01-5555555' },
          { referenceType: 'TOKEN_NUMBER', value: 'TOKEN-1001' },
          { referenceType: 'CPC_SERIAL', value: 'CPC-42' },
        ],
        runtimeStages: [
          {
            assignments: [
              {
                targetOperationalTeam: {
                  id: teamId,
                  code: 'KTM',
                  name: 'KTM Team',
                },
              },
              {
                targetOperationalTeam: {
                  id: teamId,
                  code: 'KTM',
                  name: 'KTM Team',
                },
              },
            ],
          },
        ],
      },
    ]);

    const result = await harness.service.getWorkRecords(user(), officeId, {
      page: 2,
      limit: 25,
    });

    expect(result.total).toBe(1);
    expect(result.page).toBe(2);
    expect(result.items[0]).toEqual({
      id: 'work-1',
      ticketNumber: 'NT-PATAN-OUT-2026-000001',
      workType: {
        id: '88888888-8888-4888-8888-888888888888',
        code: 'NEW_INSTALLATION',
        name: 'New Installation',
      },
      primaryOwner: {
        id: orgUnitId,
        code: 'OUT',
        name: 'Outside Service',
      },
      executionTeams: [{ id: teamId, code: 'KTM', name: 'KTM Team' }],
      reference: {
        display: 'Token TOKEN-1001 · CPC CPC-42',
        items: [
          { type: 'TOKEN_NUMBER', value: 'TOKEN-1001' },
          { type: 'CPC_SERIAL', value: 'CPC-42' },
        ],
      },
      date: '2026-09-08',
      status: WorkRuntimeStatus.IN_PROGRESS,
      availableActions: { view: true },
    });
    expect(result.items[0]).not.toHaveProperty('title');
    expect(JSON.stringify(result.items[0])).not.toContain('01-5555555');
    expect(harness.workItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 25, take: 25 }),
    );
  });

  it('keeps historical participant and Operational Team execution visible in report filters', async () => {
    const harness = createHarness();
    harness.can.mockResolvedValue(true);

    const where = await harness.service.buildScopedWorkWhere(user(), officeId, {
      participantOrgUnitId: childOrgUnitId,
      operationalTeamId: teamId,
    });

    const serialized = JSON.stringify(where);
    expect(serialized).toContain(childOrgUnitId);
    expect(serialized).toContain(teamId);
    expect(serialized).not.toContain('endedAt');
    expect(serialized).not.toContain('endsAt');
  });

  it('builds the NTC Technical Performance report from V3 Work without Administrative Work or duplicate Team counting', async () => {
    const harness = createHarness();
    harness.can.mockResolvedValue(true);
    const supportAccount = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      username: 'support.one',
      employee: { empId: 'NTC-S01', empName: 'Support One' },
    };
    const salesAccount = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      username: 'sales.one',
      employee: { empId: 'NTC-SALES-01', empName: 'Sales One' },
    };
    const executionTeam = { id: teamId, code: 'KTM', name: 'KTM Team' };

    harness.workItemFindMany.mockResolvedValueOnce([
      {
        id: 'work-new-installation',
        ticketNumber: 'NT-PATAN-OUT-2026-000101',
        createdAt: new Date('2026-09-08T03:00:00.000Z'),
        completedAt: new Date('2026-09-08T08:00:00.000Z'),
        cancelledAt: null,
        runtimeStatus: WorkRuntimeStatus.COMPLETED,
        workTypeVersion: {
          name: 'New Installation',
          workTypeDefinition: { id: 'type-new', code: 'NEW_INSTALLATION' },
        },
        primaryOwnerOrgUnit: {
          id: orgUnitId,
          code: 'OUT',
          name: 'Outside Service',
        },
        references: [
          { referenceType: 'SERVICE_NUMBER', value: '01-LEGACY' },
          { referenceType: 'TOKEN_NUMBER', value: 'TOKEN-101' },
          { referenceType: 'CPC_SERIAL', value: 'CPC-101' },
        ],
        runtimeStages: [
          {
            responsibleOrgUnitId: orgUnitId,
            assignments: [
              {
                assignmentRole: WorkStageAssignmentRole.PRIMARY,
                targetAccountId: null,
                targetAccount: null,
                targetOperationalTeam: executionTeam,
              },
              {
                assignmentRole: WorkStageAssignmentRole.SUPPORTING,
                targetAccountId: supportAccount.id,
                targetAccount: supportAccount,
                targetOperationalTeam: null,
              },
            ],
            submissions: [],
          },
          {
            responsibleOrgUnitId: childOrgUnitId,
            assignments: [
              {
                assignmentRole: WorkStageAssignmentRole.PRIMARY,
                targetAccountId: salesAccount.id,
                targetAccount: salesAccount,
                targetOperationalTeam: null,
              },
            ],
            submissions: [
              {
                submittedByAccountId: salesAccount.id,
                submittedBy: salesAccount,
              },
            ],
          },
        ],
      },
      {
        id: 'work-routine',
        ticketNumber: 'NT-PATAN-OUT-2026-000102',
        createdAt: new Date('2026-09-08T04:00:00.000Z'),
        completedAt: null,
        cancelledAt: null,
        runtimeStatus: WorkRuntimeStatus.IN_PROGRESS,
        workTypeVersion: {
          name: 'Routine Work',
          workTypeDefinition: { id: 'type-routine', code: 'ROUTINE_WORK' },
        },
        primaryOwnerOrgUnit: {
          id: orgUnitId,
          code: 'OUT',
          name: 'Outside Service',
        },
        references: [
          { referenceType: 'SERVICE_NUMBER', value: 'SERVICE-102' },
        ],
        runtimeStages: [
          {
            responsibleOrgUnitId: orgUnitId,
            assignments: [
              {
                assignmentRole: WorkStageAssignmentRole.PRIMARY,
                targetAccountId: null,
                targetAccount: null,
                targetOperationalTeam: executionTeam,
              },
              {
                assignmentRole: WorkStageAssignmentRole.SUPPORTING,
                targetAccountId: supportAccount.id,
                targetAccount: supportAccount,
                targetOperationalTeam: null,
              },
            ],
            submissions: [],
          },
        ],
      },
      {
        id: 'work-administrative',
        ticketNumber: 'NT-PATAN-ADM-2026-000103',
        createdAt: new Date('2026-09-08T05:00:00.000Z'),
        completedAt: null,
        cancelledAt: null,
        runtimeStatus: WorkRuntimeStatus.OPEN,
        workTypeVersion: {
          name: 'Administrative Work',
          workTypeDefinition: {
            id: 'type-admin',
            code: 'ADMINISTRATIVE_WORK',
          },
        },
        primaryOwnerOrgUnit: {
          id: orgUnitId,
          code: 'OUT',
          name: 'Outside Service',
        },
        references: [],
        runtimeStages: [],
      },
    ]);

    const result = await harness.service.getTechnicalPerformance(
      user(),
      officeId,
      { from: '2026-09-08', to: '2026-09-08' },
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        date: '2026-09-08',
        orgUnit: { id: orgUnitId, code: 'OUT', name: 'Outside Service' },
        operationalTeam: executionTeam,
        supportStaff: [
          {
            accountId: supportAccount.id,
            name: 'Support One',
            employeeId: 'NTC-S01',
          },
        ],
        otherStaff: [
          {
            accountId: salesAccount.id,
            name: 'Sales One',
            employeeId: 'NTC-SALES-01',
          },
        ],
        references: ['SERVICE-102', 'Token TOKEN-101 · CPC CPC-101'],
        total: { tickets: 2, completed: 1, pending: 1 },
      }),
    );
    expect(result.rows[0]?.workTypes.NEW_INSTALLATION).toEqual({
      tickets: 1,
      completed: 1,
      pending: 0,
    });
    expect(result.rows[0]?.workTypes.ROUTINE_WORK).toEqual({
      tickets: 1,
      completed: 0,
      pending: 1,
    });
    expect(result.totals.total).toEqual({ tickets: 2, completed: 1, pending: 1 });
    expect(JSON.stringify(result)).not.toContain('01-LEGACY');

    const where = JSON.stringify(harness.workItemFindMany.mock.calls[0]?.[0]?.where);
    for (const code of [
      'ROUTINE_WORK',
      'TROUBLE_TICKET',
      'NETWORK_MAINTENANCE',
      'NEW_INSTALLATION',
      'UPDATE_SERVICES',
      'INSPECTION',
      'EMERGENCY_WORK',
    ]) {
      expect(where).toContain(code);
    }
    expect(where).not.toContain('ADMINISTRATIVE_WORK');
  });

  it('attributes Stage and SLA delay to the responsible OrgUnit with Operational Team execution and lifecycle durations', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-09T00:00:00.000Z'));
    try {
      const harness = createHarness();
      harness.can.mockResolvedValue(true);
      harness.workStageCount.mockResolvedValueOnce(2);
      harness.workStageGroupBy
        .mockResolvedValueOnce([
          {
            responsibleOrgUnitId: childOrgUnitId,
            status: WorkStageStatus.SUBMITTED,
            _count: { _all: 1 },
          },
          {
            responsibleOrgUnitId: childOrgUnitId,
            status: WorkStageStatus.COMPLETED,
            _count: { _all: 1 },
          },
        ])
        .mockResolvedValueOnce([
          { responsibleOrgUnitId: childOrgUnitId, _count: { _all: 1 } },
        ]);
      harness.orgUnitFindMany.mockResolvedValueOnce([
        { id: childOrgUnitId, code: 'ACC', name: 'Accounts' },
      ]);
      harness.workStageFindMany.mockResolvedValueOnce([
        {
          id: 'stage-current',
          code: 'PAYMENT_VERIFY',
          name: 'Payment Verification',
          status: WorkStageStatus.SUBMITTED,
          slaMinutes: 180,
          dueAt: new Date('2026-09-08T23:00:00.000Z'),
          blockerReason: null,
          readyAt: new Date('2026-09-08T20:30:00.000Z'),
          startedAt: new Date('2026-09-08T21:00:00.000Z'),
          submittedAt: new Date('2026-09-08T23:30:00.000Z'),
          completedAt: null,
          cancelledAt: null,
          createdAt: new Date('2026-09-08T20:00:00.000Z'),
          responsibleOrgUnit: {
            id: childOrgUnitId,
            code: 'ACC',
            name: 'Accounts',
          },
          workItem: {
            id: 'work-201',
            ticketNumber: 'NT-PATAN-OUT-2026-000201',
            runtimeStatus: WorkRuntimeStatus.IN_PROGRESS,
            dueAt: new Date('2026-09-08T23:30:00.000Z'),
            completedAt: null,
            cancelledAt: null,
          },
          assignments: [
            { targetOperationalTeam: { id: teamId, code: 'KTM', name: 'KTM Team' } },
          ],
          events: [
            {
              fromStageStatus: WorkStageStatus.PENDING,
              toStageStatus: WorkStageStatus.READY,
              createdAt: new Date('2026-09-08T20:30:00.000Z'),
            },
            {
              fromStageStatus: WorkStageStatus.READY,
              toStageStatus: WorkStageStatus.IN_PROGRESS,
              createdAt: new Date('2026-09-08T21:00:00.000Z'),
            },
            {
              fromStageStatus: WorkStageStatus.IN_PROGRESS,
              toStageStatus: WorkStageStatus.BLOCKED,
              createdAt: new Date('2026-09-08T22:00:00.000Z'),
            },
            {
              fromStageStatus: WorkStageStatus.BLOCKED,
              toStageStatus: WorkStageStatus.IN_PROGRESS,
              createdAt: new Date('2026-09-08T22:30:00.000Z'),
            },
            {
              fromStageStatus: WorkStageStatus.IN_PROGRESS,
              toStageStatus: WorkStageStatus.SUBMITTED,
              createdAt: new Date('2026-09-08T23:30:00.000Z'),
            },
          ],
        },
        {
          id: 'stage-completed-late',
          code: 'TECH_EXECUTE',
          name: 'Technical Execution',
          status: WorkStageStatus.COMPLETED,
          slaMinutes: 60,
          dueAt: new Date('2026-09-08T21:00:00.000Z'),
          blockerReason: null,
          readyAt: new Date('2026-09-08T20:00:00.000Z'),
          startedAt: new Date('2026-09-08T20:00:00.000Z'),
          submittedAt: null,
          completedAt: new Date('2026-09-08T22:00:00.000Z'),
          cancelledAt: null,
          createdAt: new Date('2026-09-08T20:00:00.000Z'),
          responsibleOrgUnit: {
            id: childOrgUnitId,
            code: 'ACC',
            name: 'Accounts',
          },
          workItem: {
            id: 'work-202',
            ticketNumber: 'NT-PATAN-OUT-2026-000202',
            runtimeStatus: WorkRuntimeStatus.COMPLETED,
            dueAt: new Date('2026-09-08T21:00:00.000Z'),
            completedAt: new Date('2026-09-08T22:00:00.000Z'),
            cancelledAt: null,
          },
          assignments: [],
          events: [
            {
              fromStageStatus: WorkStageStatus.PENDING,
              toStageStatus: WorkStageStatus.READY,
              createdAt: new Date('2026-09-08T20:00:00.000Z'),
            },
            {
              fromStageStatus: WorkStageStatus.READY,
              toStageStatus: WorkStageStatus.IN_PROGRESS,
              createdAt: new Date('2026-09-08T20:00:00.000Z'),
            },
            {
              fromStageStatus: WorkStageStatus.IN_PROGRESS,
              toStageStatus: WorkStageStatus.COMPLETED,
              createdAt: new Date('2026-09-08T22:00:00.000Z'),
            },
          ],
        },
      ]);

      const result = await harness.service.getStageAnalysis(user(), officeId, {
        responsibleOrgUnitId: childOrgUnitId,
        operationalTeamId: teamId,
        page: 1,
        limit: 25,
      });

      expect(result.summary).toEqual([
        {
          orgUnit: { id: childOrgUnitId, code: 'ACC', name: 'Accounts' },
          stageCount: 2,
          completedStages: 1,
          waitingStages: 1,
          blockedStages: 0,
          overdueStages: 1,
        },
      ]);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          stage: expect.objectContaining({
            responsibleOrgUnit: {
              id: childOrgUnitId,
              code: 'ACC',
              name: 'Accounts',
            },
            operationalTeams: [{ id: teamId, code: 'KTM', name: 'KTM Team' }],
            slaState: WorkReportV3SlaState.OVERDUE,
          }),
          durations: {
            elapsedMinutes: 240,
            activeMinutes: 120,
            waitingMinutes: 90,
            blockedMinutes: 30,
          },
        }),
      );
      expect(result.items[0]?.workItem.workSlaState).toBe(
        WorkReportV3SlaState.OVERDUE,
      );
      expect(result.items[1]?.stage.slaState).toBe(
        WorkReportV3SlaState.OVERDUE,
      );
      expect(result.items[1]?.workItem.workSlaState).toBe(
        WorkReportV3SlaState.OVERDUE,
      );

      const stageQuery = JSON.stringify(
        harness.workStageFindMany.mock.calls[0]?.[0]?.where,
      );
      expect(stageQuery).toContain(childOrgUnitId);
      expect(stageQuery).toContain(teamId);
      expect(harness.workStageFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 25 }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('WorkReportsV3Service — P10-4 Duty compatibility and complete export payloads', () => {
  it('keeps Duty on explicit legacy compatibility until the Phase 11 OrgUnit migration', async () => {
    const harness = createHarness();

    const result = await harness.service.getDutyCompatibility(user(), officeId);

    expect(result).toEqual(
      expect.objectContaining({
        mode: 'LEGACY_COMPATIBILITY',
        migrationPhase: 11,
        dataRoute: '/work-reports/drilldown',
        csvRoute: '/work-reports/export',
        dataset: 'DUTY_ASSIGNMENTS',
      }),
    );
    expect(result.message).toContain('Phase 11');
  });

  it('exports the complete filtered Work Records dataset instead of only one browser page', async () => {
    const harness = createHarness();
    harness.workItemCount.mockResolvedValue(101);
    harness.workItemFindMany
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, index) => workRecordFixture(index + 1)),
      )
      .mockResolvedValueOnce([workRecordFixture(101)]);

    const result = await harness.service.exportCsv(user(), officeId, {
      dataset: WorkReportV3ExportDataset.WORK_RECORDS,
      from: '2026-09-08',
      to: '2026-09-08',
    });

    expect(result.rowCount).toBe(101);
    expect(result.filename).toBe('work-records-2026-09-08-to-2026-09-08.csv');
    expect(result.content.split('\r\n')[0]).toBe(
      '\uFEFF"Ticket","Work Type","Primary Owner","Execution Team","Reference","Date","Status"',
    );
    expect(result.content).toContain('Token TOKEN-101 · CPC CPC-101');
    expect(result.content).not.toContain('01-101');
    expect(result.content.split('\r\n')[0]).not.toContain('Work Title');
    expect(harness.workItemFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ skip: 0, take: 100 }),
    );
    expect(harness.workItemFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ skip: 100, take: 100 }),
    );
  });

  it('returns complete print data independently from browser pagination', async () => {
    const harness = createHarness();
    harness.workItemCount.mockResolvedValue(101);
    harness.workItemFindMany
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, index) => workRecordFixture(index + 1)),
      )
      .mockResolvedValueOnce([workRecordFixture(101)]);

    const result = await harness.service.getPrintPayload(user(), officeId, {
      dataset: WorkReportV3ExportDataset.WORK_RECORDS,
      from: '2026-09-08',
      to: '2026-09-08',
    });

    expect(result).toEqual(
      expect.objectContaining({
        dataset: WorkReportV3ExportDataset.WORK_RECORDS,
        office: { id: officeId, code: 'PATAN', name: 'Patan Telecom Office' },
        period: { from: '2026-09-08', to: '2026-09-08' },
        rowCount: 101,
      }),
    );
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content).toHaveLength(101);
  });

  it('denies V3 export when report view is allowed but export capability is denied', async () => {
    const harness = createHarness();
    harness.accountFindUnique.mockResolvedValue({
      id: user(AccountRole.SUPER_ADMIN).accountId,
      role: AccountRole.SUPER_ADMIN,
      isEnabled: true,
      employee: null,
    });
    harness.can.mockImplementation(async (_user, capability) =>
      capability === CAPABILITIES.REPORTS_VIEW,
    );

    await expect(
      harness.service.exportCsv(user(AccountRole.SUPER_ADMIN), officeId, {
        dataset: WorkReportV3ExportDataset.OVERVIEW,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
