import { ForbiddenException, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import {
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
  OrgLeadershipType,
  WorkRuntimeStatus,
  WorkStageAssignmentTargetType,
  WorkStageStatus,
} from '../generated/prisma/client';
import { WorkRuntimeV3EscalationService } from './work-runtime-v3-escalation.service';

const officeId = '11111111-1111-4111-8111-111111111111';
const stageId = '22222222-2222-4222-8222-222222222222';
const workItemId = '33333333-3333-4333-8333-333333333333';
const responsibleOrgUnitId = '44444444-4444-4444-8444-444444444444';
const parentOrgUnitId = '55555555-5555-4555-8555-555555555555';
const operationalTeamId = '66666666-6666-4666-8666-666666666666';
const assigneeAccountId = '77777777-7777-4777-8777-777777777777';

const user: AuthenticatedUser = {
  accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  role: AccountRole.EMPLOYEE,
};

function leadership(
  id: string,
  leadershipType: OrgLeadershipType,
  orgUnitId: string | null,
  accountId: string,
  options: { isActing?: boolean; enabled?: boolean } = {},
) {
  return {
    id,
    orgUnitId,
    leadershipType,
    isActing: options.isActing ?? false,
    effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
    employee: {
      id: `employee-${id}`,
      empId: `NTC-${id}`,
      empName: `Leader ${id}`,
      status: EmployeeStatus.ACTIVE,
      employmentStatus: EmploymentStatus.ACTIVE,
      archivedAt: null,
      account: {
        id: accountId,
        isEnabled: options.enabled ?? true,
      },
    },
  };
}

describe('WorkRuntimeV3EscalationService', () => {
  const prisma = {
    workStage: { findFirst: jest.fn() },
    operationalTeamMember: { findFirst: jest.fn() },
    operationalTeamLeadAssignment: { findFirst: jest.fn() },
    orgUnitClosure: { findMany: jest.fn() },
    orgLeadershipAssignment: { findMany: jest.fn() },
    operationalTeam: { findFirst: jest.fn() },
  } as any;
  const authorization = { can: jest.fn() } as any;
  const service = new WorkRuntimeV3EscalationService(prisma, authorization);

  beforeEach(() => {
    jest.clearAllMocks();
    authorization.can.mockResolvedValue(true);
    prisma.workStage.findFirst.mockResolvedValue({
      id: stageId,
      code: 'ACCOUNTS_VERIFY',
      name: 'Accounts verification',
      status: WorkStageStatus.IN_PROGRESS,
      dueAt: new Date('2026-09-08T00:00:00.000Z'),
      responsibleOrgUnitId,
      workItem: {
        id: workItemId,
        ticketNumber: 'WRK-1001',
        createdByAccountId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        runtimeStatus: WorkRuntimeStatus.IN_PROGRESS,
      },
      responsibleOrgUnit: {
        id: responsibleOrgUnitId,
        code: 'ACCOUNTS',
        name: 'Accounts',
      },
      assignments: [
        {
          targetType: WorkStageAssignmentTargetType.ACCOUNT,
          targetOperationalTeamId: null,
          targetAccountId: assigneeAccountId,
          targetOperationalTeam: null,
          targetAccount: {
            id: assigneeAccountId,
            isEnabled: true,
            employee: {
              id: 'employee-assignee',
              empId: 'NTC-2001',
              empName: 'Assigned Employee',
              status: EmployeeStatus.ACTIVE,
              employmentStatus: EmploymentStatus.ACTIVE,
              archivedAt: null,
            },
          },
        },
      ],
    });
    prisma.operationalTeamMember.findFirst.mockResolvedValue({
      teamId: operationalTeamId,
    });
    prisma.orgUnitClosure.findMany.mockResolvedValue([
      {
        depth: 0,
        ancestorOrgUnit: {
          id: responsibleOrgUnitId,
          code: 'ACCOUNTS',
          name: 'Accounts',
        },
      },
      {
        depth: 1,
        ancestorOrgUnit: {
          id: parentOrgUnitId,
          code: 'FINANCE',
          name: 'Finance',
        },
      },
    ]);
    prisma.operationalTeamLeadAssignment.findFirst.mockResolvedValue({
      id: 'team-lead-assignment',
      isActing: false,
      team: {
        id: operationalTeamId,
        code: 'BILLING_TEAM',
        name: 'Billing Team',
      },
      employee: {
        id: 'employee-team-lead',
        empId: 'NTC-TL',
        empName: 'Team Lead',
        account: {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        },
      },
    });
    prisma.operationalTeam.findFirst.mockResolvedValue({
      id: operationalTeamId,
      code: 'BILLING_TEAM',
      name: 'Billing Team',
    });
    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      leadership(
        'unit-head',
        OrgLeadershipType.ORG_UNIT_HEAD,
        responsibleOrgUnitId,
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      ),
      leadership(
        'parent-head',
        OrgLeadershipType.ORG_UNIT_HEAD,
        parentOrgUnitId,
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      ),
      leadership(
        'office-head',
        OrgLeadershipType.OFFICE_HEAD,
        null,
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      ),
    ]);
  });

  it('resolves assignee, team lead, OrgUnit ancestry and Office Head in order', async () => {
    const result = await service.getStageEscalation(user, officeId, stageId);

    expect(authorization.can).toHaveBeenCalledWith(
      user,
      'work.view',
      officeId,
      responsibleOrgUnitId,
    );
    expect(result.steps.map((step) => step.kind)).toEqual([
      'ASSIGNEE',
      'TEAM_LEAD',
      'ORG_UNIT_HEAD',
      'ORG_UNIT_HEAD',
      'OFFICE_HEAD',
    ]);
    expect(result.recipientAccountIds).toEqual([
      assigneeAccountId,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    ]);
    expect(result.officeHeadResolved).toBe(true);
    expect(prisma.operationalTeamLeadAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          teamId: operationalTeamId,
          team: expect.objectContaining({
            orgUnitId: responsibleOrgUnitId,
            isActive: true,
            archivedAt: null,
          }),
        }),
      }),
    );
    expect(prisma.orgLeadershipAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [
                {
                  leadershipType: OrgLeadershipType.OFFICE_HEAD,
                  orgUnitId: null,
                },
                {
                  leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
                  orgUnitId: {
                    in: [responsibleOrgUnitId, parentOrgUnitId],
                  },
                },
              ],
            },
          ],
        }),
      }),
    );
  });

  it('prefers the active Acting leader over the primary leader for the same scope', async () => {
    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      leadership(
        'primary-head',
        OrgLeadershipType.ORG_UNIT_HEAD,
        responsibleOrgUnitId,
        '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ),
      leadership(
        'acting-head',
        OrgLeadershipType.ORG_UNIT_HEAD,
        responsibleOrgUnitId,
        '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        { isActing: true },
      ),
      leadership(
        'office-head',
        OrgLeadershipType.OFFICE_HEAD,
        null,
        '33333333-cccc-4ccc-8ccc-cccccccccccc',
      ),
    ]);

    const result = await service.resolveStageEscalation(
      officeId,
      stageId,
      new Date('2026-09-08T01:00:00.000Z'),
    );

    const unitHead = result.steps.find((step) => step.kind === 'ORG_UNIT_HEAD');
    expect(unitHead?.accountId).toBe('22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(unitHead?.isActing).toBe(true);
  });

  it('continues to parent leadership when the responsible OrgUnit has no active Head', async () => {
    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      leadership(
        'parent-head',
        OrgLeadershipType.ORG_UNIT_HEAD,
        parentOrgUnitId,
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      ),
      leadership(
        'office-head',
        OrgLeadershipType.OFFICE_HEAD,
        null,
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      ),
    ]);

    const result = await service.resolveStageEscalation(officeId, stageId);

    expect(
      result.steps.filter((step) => step.kind === 'ORG_UNIT_HEAD').map((step) => step.orgUnit?.id),
    ).toEqual([parentOrgUnitId]);
    expect(result.steps[result.steps.length - 1]?.kind).toBe('OFFICE_HEAD');
  });

  it('deduplicates notification recipient account IDs while preserving logical escalation steps', async () => {
    const sharedAccountId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      leadership(
        'unit-head',
        OrgLeadershipType.ORG_UNIT_HEAD,
        responsibleOrgUnitId,
        sharedAccountId,
      ),
      leadership(
        'parent-head',
        OrgLeadershipType.ORG_UNIT_HEAD,
        parentOrgUnitId,
        sharedAccountId,
      ),
      leadership(
        'office-head',
        OrgLeadershipType.OFFICE_HEAD,
        null,
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      ),
    ]);

    const result = await service.resolveStageEscalation(officeId, stageId);

    expect(result.steps.filter((step) => step.accountId === sharedAccountId)).toHaveLength(2);
    expect(result.recipientAccountIds.filter((id) => id === sharedAccountId)).toHaveLength(1);
  });

  it('reports overdue duration and excludes terminal stages from escalation overdue state', async () => {
    const at = new Date('2026-09-08T01:30:00.000Z');
    const active = await service.resolveStageEscalation(officeId, stageId, at);
    expect(active.isOverdue).toBe(true);
    expect(active.overdueByMinutes).toBe(90);

    prisma.workStage.findFirst.mockResolvedValueOnce({
      id: stageId,
      code: 'ACCOUNTS_VERIFY',
      name: 'Accounts verification',
      status: WorkStageStatus.COMPLETED,
      dueAt: new Date('2026-09-08T00:00:00.000Z'),
      responsibleOrgUnitId,
      workItem: {
        id: workItemId,
        ticketNumber: 'WRK-1001',
        runtimeStatus: WorkRuntimeStatus.COMPLETED,
      },
      responsibleOrgUnit: {
        id: responsibleOrgUnitId,
        code: 'ACCOUNTS',
        name: 'Accounts',
        orgUnitType: { isTeam: false },
      },
      assignments: [],
    });

    const completed = await service.resolveStageEscalation(officeId, stageId, at);
    expect(completed.isOverdue).toBe(false);
    expect(completed.overdueByMinutes).toBe(0);
  });

  it('throws when the stage does not exist in the requested Office', async () => {
    prisma.workStage.findFirst.mockResolvedValue(null);

    await expect(
      service.resolveStageEscalation(officeId, stageId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('denies escalation-path access when normal stage visibility rules do not allow it', async () => {
    authorization.can.mockResolvedValue(false);

    await expect(
      service.getStageEscalation(user, officeId, stageId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
