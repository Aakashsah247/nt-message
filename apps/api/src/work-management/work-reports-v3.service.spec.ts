import { ForbiddenException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import {
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
  WorkItemStatus,
  WorkRuntimeStatus,
  WorkStageAssignmentTargetType,
} from '../generated/prisma/enums';
import { CAPABILITIES } from '../organization/organization-capabilities';
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
  const workOrgUnitParticipantCount = jest.fn().mockResolvedValue(0);
  const workStageCount = jest.fn().mockResolvedValue(0);
  const workStageAssignmentCount = jest.fn().mockResolvedValue(0);

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
    workItem: { count: workItemCount },
    workOrgUnitParticipant: { count: workOrgUnitParticipantCount },
    workStage: { count: workStageCount },
    workStageAssignment: { count: workStageAssignmentCount },
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
    workOrgUnitParticipantCount,
    workStageCount,
    workStageAssignmentCount,
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
});
