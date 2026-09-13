import type { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  WorkAssignmentRole,
  WorkHelpReason,
  WorkHelpRequestStatus,
  WorkItemStatus,
} from '../generated/prisma/enums';
import type { DutyAvailabilityService } from './duty-availability.service';
import { WorkLifecycleService } from './work-lifecycle.service';
import type { WorkNotificationsService } from './work-notifications.service';
import type { WorkScopeService } from './work-scope.service';
import type { WorkStatusTransitionService } from './work-status-transition.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

const employeeUser = {
  accountId: 'employee',
  sessionId: 'session',
  username: 'employee@ntc.test',
  role: AccountRole.EMPLOYEE,
};

function currentWork(
  status: WorkItemStatus = WorkItemStatus.IN_PROGRESS,
  assigneeAccountId = 'employee',
) {
  return {
    id: 'work-1',
    ticketNumber: 'NT-PAT-NET-2026-000001',
    title: 'Repair damaged wire',
    status,
    requestNumber: null,
    cpcSerial: null,
    serviceNumber: '015500001',
    olt: 'OLT-01',
    fdcName: 'FDC-01',
    fapName: 'FAP-01',
    version: 2,
    officeId: 'office-a',
    primaryOwnerOrgUnitId: 'org-unit-a',
    salesMemberAccountId: null,
    salesCoordinationStatus: null,
    salesDocumentsSentAt: null,
    salesCompletedAt: null,
    salesCompletionNote: null,
    registeredAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    plannedStartAt: new Date(Date.now() - 60 * 60 * 1000),
    dueAt: new Date(Date.now() + 60 * 60 * 1000),
    locationText: 'Lagankhel',
    completedAt: null,
    closedAt: null,
    cancelledAt: null,
    archiveEligibleAt: null,
    deletionEligibleAt: null,
    createdByAccountId: 'manager',
    assignments: [
      {
        id: 'primary-assignment',
        assigneeAccountId,
        assignmentRole: WorkAssignmentRole.PRIMARY,
        acknowledgedAt: new Date(),
        startedAt: new Date(),
      },
    ],
    completionReports: [],
    childWorkItems: [] as Array<{ id: string; dueAt: Date }>,
  };
}

function detailWork(status: WorkItemStatus, assigneeAccountId = 'employee') {
  return {
    id: 'work-1',
    ticketNumber: 'NT-PAT-NET-2026-000001',
    title: 'Repair damaged wire',
    status,
    officeId: 'office-a',
    primaryOwnerOrgUnitId: 'org-unit-a',
    registeredAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    createdBy: { id: 'manager' },
    assignments: [{ assignee: { id: assigneeAccountId } }],
    completionReports: [],
    helpRequests: [],
  };
}

describe('WorkLifecycleService M20 Phase 2', () => {
  const transaction = {
    workItem: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    workHelpRequest: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    workCompletionReport: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    workAssignment: {
      create: jest.fn(),
      update: jest.fn(),
    },
    workActivity: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(),
    workItem: {
      findFirst: jest.fn(),
    },
    workHelpRequest: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    workCompletionReport: {
      findMany: jest.fn(),
    },
    department: {
      findFirst: jest.fn(),
    },
    account: {
      findFirst: jest.fn(),
    },
  } as unknown as PrismaService;
  const scope = {
    resolveActorContext: jest.fn(),
    buildVisibleWorkWhere: jest.fn().mockReturnValue({}),
    assertCanManageWork: jest.fn(),
    assertCanReviewWork: jest.fn(),
    resolveHelpCandidate: jest.fn(),
    resolveSupportAccount: jest.fn(),
    resolvePrimaryReassignmentAccount: jest.fn(),
    assertAdministrativeIndividualAssignee: jest.fn(),
  } as unknown as WorkScopeService;
  const transitions = {
    getStatusAfterHelpRequest: jest
      .fn()
      .mockReturnValue(WorkItemStatus.HELP_REQUESTED),
    getStatusAfterHelpAccepted: jest
      .fn()
      .mockReturnValue(WorkItemStatus.IN_PROGRESS),
    assertCanRespondToHelpRequest: jest.fn(),
    assertCanSubmitCompletion: jest.fn(),
    assertCanReviewCompletion: jest.fn(),
    assertCanReopen: jest.fn(),
    assertCanCancel: jest.fn(),
    assertCanChangeAssignment: jest.fn(),
    assertCanUpdateDetails: jest.fn(),
  } as unknown as WorkStatusTransitionService;
  const notifications = {
    publishWorkUpdate: jest.fn(),
  } as unknown as WorkNotificationsService;
  const dutyAvailability = {
    assertCanReceiveDirectHelp: jest.fn(),
    getCoordinationRecipients: jest.fn().mockResolvedValue(['manager']),
  } as unknown as DutyAvailabilityService;
  const service = new WorkLifecycleService(
    prisma,
    scope,
    transitions,
    notifications,
    dutyAvailability,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(scope.buildVisibleWorkWhere).mockReturnValue({});
    jest
      .mocked(prisma.$transaction)
      .mockImplementation(async (callback: unknown) => {
        return (callback as (client: typeof transaction) => Promise<unknown>)(
          transaction,
        ) as never;
      });
  });

  it('creates a help request and moves active work into help requested', async () => {
    const current = currentWork();
    const final = detailWork(WorkItemStatus.HELP_REQUESTED);
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'employee',
      role: AccountRole.EMPLOYEE,
      officeId: 'office-a',
      primaryOrgUnitId: 'org-unit-a',
      visibleOrgUnitIds: ['org-unit-a'],
      assignableOrgUnitIds: ['org-unit-a'],
      operationalTeamLeadIds: [],
    });
    jest.mocked(scope.resolveHelpCandidate).mockResolvedValue({
      id: 'helper',
    } as never);
    jest.mocked(prisma.workItem.findFirst).mockResolvedValue(current as never);
    transaction.workItem.findFirst.mockResolvedValue(current);
    transaction.workItem.updateMany.mockResolvedValue({ count: 1 });
    transaction.workItem.findUniqueOrThrow.mockResolvedValue(final);
    transaction.workHelpRequest.create.mockResolvedValue({
      id: 'help-1',
      status: WorkHelpRequestStatus.PENDING,
    });

    const result = await service.requestHelp(employeeUser, 'work-1', {
      reason: WorkHelpReason.NEED_ANOTHER_EMPLOYEE,
      requestedHelperAccountId: 'helper',
      note: 'Need another technician.',
    });

    expect(dutyAvailability.assertCanReceiveDirectHelp).toHaveBeenCalledWith(
      'helper',
      'org-unit-a',
    );
    expect(transaction.workHelpRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestedByAccountId: 'employee',
          requestedHelperAccountId: 'helper',
        }),
      }),
    );
    expect(transaction.workItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WorkItemStatus.HELP_REQUESTED,
        }),
      }),
    );
    expect(notifications.publishWorkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'HELP_REQUESTED' }),
    );
    expect(result.helpRequest).toEqual(
      expect.objectContaining({ id: 'help-1' }),
    );
  });

  it('accepts a direct help request and adds the helper as supporting staff', async () => {
    const current = currentWork(WorkItemStatus.HELP_REQUESTED);
    const final = detailWork(WorkItemStatus.IN_PROGRESS);
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'helper',
      role: AccountRole.EMPLOYEE,
      officeId: 'office-a',
      primaryOrgUnitId: 'org-unit-a',
      visibleOrgUnitIds: ['org-unit-a'],
      assignableOrgUnitIds: ['org-unit-a'],
      operationalTeamLeadIds: [],
    });
    jest.mocked(prisma.workHelpRequest.findUnique).mockResolvedValue({
      status: WorkHelpRequestStatus.PENDING,
      requestedHelperAccountId: 'helper',
      workItem: { primaryOwnerOrgUnitId: 'org-unit-a' },
    } as never);
    transaction.workHelpRequest.findUnique.mockResolvedValue({
      id: 'help-1',
      status: WorkHelpRequestStatus.PENDING,
      workItemId: 'work-1',
      requestedByAccountId: 'employee',
      requestedHelperAccountId: 'helper',
      workItem: current,
    });
    transaction.workItem.updateMany.mockResolvedValue({ count: 1 });
    transaction.workItem.findUniqueOrThrow.mockResolvedValue(final);

    const result = await service.respondToHelpRequest(
      { ...employeeUser, accountId: 'helper' },
      'help-1',
      { accept: true, note: 'I can assist.' },
    );

    expect(transitions.assertCanRespondToHelpRequest).toHaveBeenCalledWith(
      WorkItemStatus.HELP_REQUESTED,
    );
    expect(transaction.workAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assigneeAccountId: 'helper',
          assignmentRole: WorkAssignmentRole.SUPPORTING,
        }),
      }),
    );
    expect(transaction.workHelpRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WorkHelpRequestStatus.ACCEPTED,
        }),
      }),
    );
    expect(result.workItem.status).toBe(WorkItemStatus.IN_PROGRESS);
  });

  it('records a declined help request without adding an assignment', async () => {
    const current = currentWork(WorkItemStatus.HELP_REQUESTED);
    const final = detailWork(WorkItemStatus.HELP_REQUESTED);
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'helper',
      role: AccountRole.EMPLOYEE,
      officeId: 'office-a',
      primaryOrgUnitId: 'org-unit-a',
      visibleOrgUnitIds: ['org-unit-a'],
      assignableOrgUnitIds: ['org-unit-a'],
      operationalTeamLeadIds: [],
    });
    transaction.workHelpRequest.findUnique.mockResolvedValue({
      id: 'help-1',
      status: WorkHelpRequestStatus.PENDING,
      workItemId: 'work-1',
      requestedByAccountId: 'employee',
      requestedHelperAccountId: 'helper',
      workItem: current,
    });
    transaction.workItem.updateMany.mockResolvedValue({ count: 1 });
    transaction.workItem.findUniqueOrThrow.mockResolvedValue(final);

    await service.respondToHelpRequest(
      { ...employeeUser, accountId: 'helper' },
      'help-1',
      { accept: false, note: 'Already handling urgent work.' },
    );

    expect(transaction.workAssignment.create).not.toHaveBeenCalled();
    expect(transaction.workHelpRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WorkHelpRequestStatus.DECLINED,
        }),
      }),
    );
    expect(transaction.workActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'HELP_DECLINED',
        }),
      }),
    );
  });
});
