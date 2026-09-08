import {
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
  OrgLeadershipType,
  WorkRuntimeStatus,
  WorkStageStatus,
} from '../generated/prisma/enums';
import { WorkRuntimeV3NotificationsService } from './work-runtime-v3-notifications.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

const officeId = '11111111-1111-4111-8111-111111111111';
const workItemId = '22222222-2222-4222-8222-222222222222';
const stageId = '33333333-3333-4333-8333-333333333333';
const actorAccountId = '44444444-4444-4444-8444-444444444444';
const assigneeAccountId = '55555555-5555-4555-8555-555555555555';
const unitHeadAccountId = '66666666-6666-4666-8666-666666666666';
const superAdminAccountId = '77777777-7777-4777-8777-777777777777';
const orgUnitId = '88888888-8888-4888-8888-888888888888';
const requesterAccountId = '99999999-9999-4999-8999-999999999999';
const operationalTeamId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const teamLeadAccountId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const teamMemberAccountId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function createHarness() {
  const prisma = {
    workEvent: { findMany: jest.fn().mockResolvedValue([]) },
    workStage: {
      findFirst: jest.fn().mockResolvedValue({
        id: stageId,
        name: 'Accounts verification',
        status: WorkStageStatus.READY,
        assignments: [],
        workItem: {
          id: workItemId,
          ticketNumber: 'WRK-1001',
          title: 'New installation',
          runtimeStatus: WorkRuntimeStatus.OPEN,
        },
      }),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    workItem: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    workCollaborationRequest: { findFirst: jest.fn() },
    orgUnitClosure: { findMany: jest.fn().mockResolvedValue([]) },
    orgLeadershipAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    operationalTeam: { findFirst: jest.fn() },
    account: {
      findMany: jest.fn().mockImplementation(({ where }: any) =>
        (where.id.in as string[])
          .filter((id) => id !== superAdminAccountId)
          .map((id) => ({ id })),
      ),
    },
  } as any;
  const workNotifications = {
    publishWorkUpdate: jest.fn().mockResolvedValue(undefined),
  } as any;
  const escalation = {
    resolveStageEscalation: jest.fn().mockResolvedValue({
      workItemId,
      ticketNumber: 'WRK-1001',
      createdByAccountId: actorAccountId,
      workStatus: WorkRuntimeStatus.OPEN,
      responsibleOrgUnit: { id: orgUnitId, code: 'ACC', name: 'Accounts' },
      recipientAccountIds: [
        assigneeAccountId,
        unitHeadAccountId,
        superAdminAccountId,
      ],
      steps: [
        {
          kind: 'ASSIGNEE',
          accountId: assigneeAccountId,
          hierarchyDepth: null,
        },
        {
          kind: 'ORG_UNIT_HEAD',
          accountId: unitHeadAccountId,
          hierarchyDepth: 0,
        },
        {
          kind: 'OFFICE_HEAD',
          accountId: superAdminAccountId,
          hierarchyDepth: null,
        },
      ],
    }),
  } as any;
  const service = new WorkRuntimeV3NotificationsService(
    prisma,
    workNotifications,
    escalation,
  );
  return { prisma, workNotifications, escalation, service };
}

describe('WorkRuntimeV3NotificationsService', () => {
  it('publishes stage assignment only to active operational recipients', async () => {
    const harness = createHarness();

    await harness.service.publishStageAssigned(
      officeId,
      stageId,
      actorAccountId,
    );

    expect(harness.workNotifications.publishWorkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'V3_STAGE_ASSIGNED',
        recipientAccountIds: [assigneeAccountId],
        metadata: expect.objectContaining({
          runtime: 'V3',
          workStageId: stageId,
          notificationReason: 'STAGE_ASSIGNED',
        }),
      }),
    );
    expect(harness.prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: { not: AccountRole.SUPER_ADMIN },
        }),
      }),
    );
  });

  it('publishes TEAM assignment to Operational Team members and the current Team Lead', async () => {
    const harness = createHarness();
    harness.prisma.workStage.findFirst.mockResolvedValue({
      id: stageId,
      name: 'Field execution',
      status: WorkStageStatus.READY,
      assignments: [
        {
          targetType: 'TEAM',
          targetOperationalTeamId: operationalTeamId,
        },
      ],
      workItem: {
        id: workItemId,
        ticketNumber: 'WRK-1001',
        title: 'New installation',
        runtimeStatus: WorkRuntimeStatus.OPEN,
      },
    });
    harness.prisma.operationalTeam.findFirst.mockResolvedValue({
      members: [
        {
          employee: {
            status: EmployeeStatus.ACTIVE,
            employmentStatus: EmploymentStatus.ACTIVE,
            archivedAt: null,
            account: {
              id: teamMemberAccountId,
              role: AccountRole.EMPLOYEE,
              isEnabled: true,
            },
          },
        },
      ],
      leadAssignments: [
        {
          employee: {
            status: EmployeeStatus.ACTIVE,
            employmentStatus: EmploymentStatus.ACTIVE,
            archivedAt: null,
            account: {
              id: teamLeadAccountId,
              role: AccountRole.EMPLOYEE,
              isEnabled: true,
            },
          },
        },
      ],
    });
    harness.escalation.resolveStageEscalation.mockResolvedValue({
      workItemId,
      ticketNumber: 'WRK-1001',
      createdByAccountId: actorAccountId,
      workStatus: WorkRuntimeStatus.OPEN,
      responsibleOrgUnit: { id: orgUnitId, code: 'TECH', name: 'Technical' },
      recipientAccountIds: [teamLeadAccountId, unitHeadAccountId],
      steps: [
        {
          kind: 'TEAM_LEAD',
          accountId: teamLeadAccountId,
          hierarchyDepth: null,
        },
        {
          kind: 'ORG_UNIT_HEAD',
          accountId: unitHeadAccountId,
          hierarchyDepth: 0,
        },
      ],
    });

    await harness.service.publishStageAssigned(
      officeId,
      stageId,
      actorAccountId,
    );

    expect(harness.prisma.operationalTeam.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: operationalTeamId,
          isActive: true,
          archivedAt: null,
          orgUnit: { officeId, isActive: true },
        }),
      }),
    );
    expect(harness.workNotifications.publishWorkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'V3_STAGE_ASSIGNED',
        recipientAccountIds: [teamLeadAccountId, teamMemberAccountId],
      }),
    );
  });

  it('publishes a normal stage-ready notification to immediate operational recipients', async () => {
    const harness = createHarness();
    harness.prisma.workEvent.findMany.mockResolvedValue([
      {
        workStageId: stageId,
        details: { reason: 'INITIAL_DEPENDENCIES_SATISFIED' },
      },
    ]);

    await harness.service.publishReadyStageEvents(
      officeId,
      workItemId,
      actorAccountId,
      new Date('2026-09-08T00:00:00.000Z'),
    );

    expect(harness.workNotifications.publishWorkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'V3_STAGE_READY',
        recipientAccountIds: [assigneeAccountId, unitHeadAccountId],
        metadata: expect.objectContaining({
          notificationReason: 'STAGE_READY',
        }),
      }),
    );
  });

  it('classifies newly-ready dependency stages as dependency-unblocked notifications', async () => {
    const harness = createHarness();
    harness.prisma.workEvent.findMany.mockResolvedValue([
      {
        workStageId: stageId,
        details: { releasedByStageDefinitionId: 'definition-1' },
      },
    ]);

    await harness.service.publishReadyStageEvents(
      officeId,
      workItemId,
      actorAccountId,
      new Date('2026-09-08T00:00:00.000Z'),
    );

    expect(harness.workNotifications.publishWorkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'V3_DEPENDENCY_UNBLOCKED',
        title: 'Work stage is unblocked',
      }),
    );
  });

  it('publishes a returned-stage notification to the executor path and responsible leadership', async () => {
    const harness = createHarness();

    await harness.service.publishStageReturned(
      officeId,
      stageId,
      actorAccountId,
    );

    expect(harness.workNotifications.publishWorkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'V3_STAGE_RETURNED',
        recipientAccountIds: [assigneeAccountId, unitHeadAccountId],
        metadata: expect.objectContaining({
          notificationReason: 'STAGE_RETURNED',
        }),
      }),
    );
  });

  it('routes a collaboration request to the receiving OrgUnit authority', async () => {
    const harness = createHarness();
    harness.prisma.workCollaborationRequest.findFirst.mockResolvedValue({
      id: 'request-1',
      purpose: 'Verify payment',
      requestedOrgUnitId: orgUnitId,
      requestedOrgUnit: { name: 'Accounts' },
      workItem: {
        id: workItemId,
        ticketNumber: 'WRK-1001',
        title: 'New installation',
        runtimeStatus: WorkRuntimeStatus.IN_PROGRESS,
      },
    });
    harness.prisma.orgUnitClosure.findMany.mockResolvedValue([
      {
        depth: 0,
        ancestorOrgUnit: {
          id: orgUnitId,
          orgUnitType: { isTeam: false },
        },
      },
    ]);
    harness.prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      {
        id: 'leader-1',
        orgUnitId,
        leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
        isActing: false,
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
        employee: {
          status: EmployeeStatus.ACTIVE,
          employmentStatus: EmploymentStatus.ACTIVE,
          archivedAt: null,
          account: {
            id: unitHeadAccountId,
            role: AccountRole.EMPLOYEE,
            isEnabled: true,
          },
        },
      },
    ]);

    await harness.service.publishCollaborationRequested(
      officeId,
      'request-1',
      actorAccountId,
    );

    expect(harness.workNotifications.publishWorkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'V3_COLLABORATION_REQUESTED',
        recipientAccountIds: [unitHeadAccountId],
      }),
    );
    expect(harness.prisma.orgLeadershipAssignment.findMany).toHaveBeenCalledWith(
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
                  orgUnitId: { in: [orgUnitId] },
                },
              ],
            },
          ],
        }),
      }),
    );
  });

  it('publishes a due-soon stage notification and persists its independent marker', async () => {
    const harness = createHarness();
    const dueAt = new Date('2026-09-08T00:30:00.000Z');
    harness.prisma.workStage.findMany.mockResolvedValue([
      {
        id: stageId,
        workItemId,
        dueAt,
        dueSoonNotifiedAt: null,
        overdueNotifiedAt: null,
        workItem: { officeId },
      },
    ]);

    jest.useFakeTimers().setSystemTime(new Date('2026-09-08T00:00:00.000Z'));
    try {
      await harness.service.processDeadlineNotifications();
    } finally {
      jest.useRealTimers();
    }

    expect(harness.workNotifications.publishWorkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DUE_SOON',
        recipientAccountIds: [assigneeAccountId, unitHeadAccountId],
        metadata: expect.objectContaining({
          notificationReason: 'STAGE_DUE_SOON',
        }),
      }),
    );
    expect(harness.prisma.workStage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: stageId, dueSoonNotifiedAt: null },
        data: { dueSoonNotifiedAt: expect.any(Date) },
      }),
    );
  });

  it('uses the full escalation path for an overdue stage and persists the marker', async () => {
    const harness = createHarness();
    const dueAt = new Date('2026-09-07T23:00:00.000Z');
    harness.prisma.workStage.findMany.mockResolvedValue([
      {
        id: stageId,
        workItemId,
        dueAt,
        dueSoonNotifiedAt: null,
        overdueNotifiedAt: null,
        workItem: { officeId },
      },
    ]);

    jest.useFakeTimers().setSystemTime(new Date('2026-09-08T00:30:00.000Z'));
    try {
      await harness.service.processDeadlineNotifications();
    } finally {
      jest.useRealTimers();
    }

    expect(harness.workNotifications.publishWorkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OVERDUE',
        recipientAccountIds: [assigneeAccountId, unitHeadAccountId],
        metadata: expect.objectContaining({
          notificationReason: 'STAGE_OVERDUE',
        }),
      }),
    );
    expect(harness.prisma.workStage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: stageId, overdueNotifiedAt: null },
        data: { overdueNotifiedAt: expect.any(Date) },
      }),
    );
  });

  it.each([
    [
      'V3_WORK_CANCELLED',
      WorkRuntimeStatus.CANCELLED,
      'WORK_CANCELLED',
    ],
    [
      'V3_WORK_REOPENED',
      WorkRuntimeStatus.IN_PROGRESS,
      'WORK_REOPENED',
    ],
  ] as const)(
    'publishes %s to the primary/participant operational authorities',
    async (action, runtimeStatus, notificationReason) => {
      const harness = createHarness();
      harness.prisma.workItem.findFirst.mockResolvedValue({
        id: workItemId,
        ticketNumber: 'WRK-1001',
        title: 'New installation',
        runtimeStatus,
        createdByAccountId: actorAccountId,
        primaryOwnerOrgUnitId: orgUnitId,
        orgUnitParticipants: [{ orgUnitId }],
        collaborationRequests: [],
      });
      harness.prisma.orgUnitClosure.findMany.mockResolvedValue([
        {
          depth: 0,
          ancestorOrgUnit: {
            id: orgUnitId,
            orgUnitType: { isTeam: false },
          },
        },
      ]);
      harness.prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
        {
          id: 'leader-1',
          orgUnitId,
          leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
          isActing: false,
          effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
          employee: {
            status: EmployeeStatus.ACTIVE,
            employmentStatus: EmploymentStatus.ACTIVE,
            archivedAt: null,
            account: {
              id: unitHeadAccountId,
              role: AccountRole.EMPLOYEE,
              isEnabled: true,
            },
          },
        },
      ]);

      await harness.service.publishWorkLifecycle(
        officeId,
        workItemId,
        actorAccountId,
        action,
      );

      expect(harness.workNotifications.publishWorkUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          action,
          recipientAccountIds: [actorAccountId, unitHeadAccountId],
          metadata: expect.objectContaining({ notificationReason }),
        }),
      );
    },
  );

  it('does not emit a completion notification before Work is completed', async () => {
    const harness = createHarness();
    harness.prisma.workItem.findFirst.mockResolvedValue({
      id: workItemId,
      ticketNumber: 'WRK-1001',
      title: 'New installation',
      runtimeStatus: WorkRuntimeStatus.IN_PROGRESS,
      createdByAccountId: actorAccountId,
      primaryOwnerOrgUnitId: orgUnitId,
      orgUnitParticipants: [{ orgUnitId }],
    });

    await harness.service.publishWorkLifecycle(
      officeId,
      workItemId,
      actorAccountId,
      'V3_WORK_COMPLETED',
    );

    expect(harness.workNotifications.publishWorkUpdate).not.toHaveBeenCalled();
  });

  it('includes relevant collaboration requesters in Work lifecycle notifications', async () => {
    const harness = createHarness();
    harness.prisma.workItem.findFirst.mockResolvedValue({
      id: workItemId,
      ticketNumber: 'WRK-1001',
      title: 'New installation',
      runtimeStatus: WorkRuntimeStatus.COMPLETED,
      createdByAccountId: actorAccountId,
      primaryOwnerOrgUnitId: orgUnitId,
      orgUnitParticipants: [{ orgUnitId }],
      collaborationRequests: [{ requestedByAccountId: requesterAccountId }],
    });
    harness.prisma.orgUnitClosure.findMany.mockResolvedValue([
      {
        depth: 0,
        ancestorOrgUnit: {
          id: orgUnitId,
          orgUnitType: { isTeam: false },
        },
      },
    ]);
    harness.prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      {
        id: 'leader-1',
        orgUnitId,
        leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
        isActing: false,
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
        employee: {
          status: EmployeeStatus.ACTIVE,
          employmentStatus: EmploymentStatus.ACTIVE,
          archivedAt: null,
          account: {
            id: unitHeadAccountId,
            role: AccountRole.EMPLOYEE,
            isEnabled: true,
          },
        },
      },
    ]);

    await harness.service.publishWorkLifecycle(
      officeId,
      workItemId,
      actorAccountId,
      'V3_WORK_COMPLETED',
    );

    expect(harness.workNotifications.publishWorkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'V3_WORK_COMPLETED',
        recipientAccountIds: [
          actorAccountId,
          requesterAccountId,
          unitHeadAccountId,
        ],
      }),
    );
  });
});
