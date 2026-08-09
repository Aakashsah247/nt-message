import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  WorkActivityAction,
  WorkAssignmentRole,
  WorkCompletionResult,
  WorkCompletionReviewStatus,
  WorkHelpReason,
  WorkHelpRequestStatus,
  WorkItemStatus,
  WorkPriority,
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

const managerUser = {
  accountId: 'manager',
  sessionId: 'session',
  username: 'manager@ntc.test',
  role: AccountRole.TEAM_MANAGER,
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
    priority: WorkPriority.HIGH,
    version: 2,
    divisionId: 'division-a',
    departmentId: 'department-a',
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
    responsibleManagerAccountId: 'manager',
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
    priority: WorkPriority.HIGH,
    createdBy: { id: 'manager' },
    responsibleManager: { id: 'manager' },
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
      divisionId: 'division-a',
      departmentId: 'department-a',
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
      'department-a',
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

  it('prevents a supporting employee from submitting the primary completion report', async () => {
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'helper',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    transaction.workItem.findFirst.mockResolvedValue(currentWork());

    await expect(
      service.submitCompletion(
        { ...employeeUser, accountId: 'helper' },
        'work-1',
        {
          result: WorkCompletionResult.FULLY_RESOLVED,
          summary: 'Repair completed.',
          moreWorkRequired: false,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('submits completion for manager review with an immutable activity', async () => {
    const current = currentWork();
    const final = detailWork(WorkItemStatus.COMPLETED_PENDING_REVIEW);
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'employee',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    transaction.workItem.findFirst.mockResolvedValue(current);
    transaction.workItem.updateMany.mockResolvedValue({ count: 1 });
    transaction.workItem.findUniqueOrThrow.mockResolvedValue(final);
    transaction.workCompletionReport.create.mockResolvedValue({
      id: 'report-1',
      reviewStatus: WorkCompletionReviewStatus.PENDING_REVIEW,
    });

    await service.submitCompletion(employeeUser, 'work-1', {
      result: WorkCompletionResult.FULLY_RESOLVED,
      summary: 'Damaged wire replaced and tested.',
      moreWorkRequired: false,
    });

    expect(transaction.workCompletionReport.create).toHaveBeenCalled();
    expect(transaction.workHelpRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WorkHelpRequestStatus.CANCELLED,
        }),
      }),
    );
    expect(transaction.workActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'COMPLETION_SUBMITTED' }),
      }),
    );
    expect(notifications.publishWorkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'COMPLETION_SUBMITTED' }),
    );
  });

  it('blocks final submission while team work is still unfinished', async () => {
    const current = {
      ...currentWork(WorkItemStatus.IN_PROGRESS, 'team-manager'),
      childWorkItems: [
        { id: 'team-work-1', dueAt: new Date(Date.now() + 30 * 60 * 1000) },
      ],
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'team-manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    transaction.workItem.findFirst.mockResolvedValue(current);

    await expect(
      service.submitCompletion(
        {
          accountId: 'team-manager',
          sessionId: 'session',
          username: 'team-manager@ntc.test',
          role: AccountRole.TEAM_MANAGER,
        },
        'work-1',
        {
          result: WorkCompletionResult.FULLY_RESOLVED,
          summary: 'Main work is ready.',
          moreWorkRequired: false,
        },
      ),
    ).rejects.toThrow(
      'Team work is still unfinished. Complete or cancel it before submitting this task.',
    );

    expect(transaction.workCompletionReport.create).not.toHaveBeenCalled();
  });

  it('blocks cancellation while team work is unfinished', async () => {
    const current = {
      ...currentWork(WorkItemStatus.IN_PROGRESS, 'employee'),
      childWorkItems: [
        { id: 'team-work-1', dueAt: new Date(Date.now() + 30 * 60 * 1000) },
      ],
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    transaction.workItem.findFirst.mockResolvedValue(current);

    await expect(
      service.cancel(managerUser, 'work-1', {
        reason: 'Main task no longer needed.',
      }),
    ).rejects.toThrow(
      'Cancel or complete the unfinished team work before cancelling this task.',
    );

    expect(transaction.workItem.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['Senior Management', AccountRole.SENIOR_MANAGEMENT, 'senior', null],
    ['Team Manager', AccountRole.TEAM_MANAGER, 'team-manager', 'department-a'],
  ] as const)(
    'allows a %s primary assignee to submit completed work',
    async (_label, role, accountId, departmentId) => {
      const current = currentWork(WorkItemStatus.IN_PROGRESS, accountId);
      const final = detailWork(
        WorkItemStatus.COMPLETED_PENDING_REVIEW,
        accountId,
      );
      jest.mocked(scope.resolveActorContext).mockResolvedValue({
        accountId,
        role,
        divisionId: 'division-a',
        departmentId,
      });
      transaction.workItem.findFirst.mockResolvedValue(current);
      transaction.workItem.updateMany.mockResolvedValue({ count: 1 });
      transaction.workItem.findUniqueOrThrow.mockResolvedValue(final);
      transaction.workCompletionReport.create.mockResolvedValue({
        id: `report-${accountId}`,
        reviewStatus: WorkCompletionReviewStatus.PENDING_REVIEW,
      });

      await service.submitCompletion(
        {
          accountId,
          sessionId: 'session',
          username: `${accountId}@ntc.test`,
          role,
        },
        'work-1',
        {
          result: WorkCompletionResult.FULLY_RESOLVED,
          summary: 'Assigned management task completed and checked.',
          moreWorkRequired: false,
        },
      );

      expect(transaction.workCompletionReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            submittedByAccountId: accountId,
          }),
        }),
      );
      expect(transaction.workActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorAccountId: accountId,
            action: 'COMPLETION_SUBMITTED',
          }),
        }),
      );
    },
  );

  it('allows the responsible manager to verify and close pending work', async () => {
    const current = {
      ...currentWork(WorkItemStatus.COMPLETED_PENDING_REVIEW),
      completionReports: [
        {
          id: 'report-1',
          reviewStatus: WorkCompletionReviewStatus.PENDING_REVIEW,
        },
      ],
    };
    const final = detailWork(WorkItemStatus.CLOSED);
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    transaction.workItem.findFirst.mockResolvedValue(current);
    transaction.workItem.updateMany.mockResolvedValue({ count: 1 });
    transaction.workItem.findUniqueOrThrow.mockResolvedValue(final);

    const result = await service.close(managerUser, 'work-1', {
      note: 'Connection tested and confirmed operational.',
    });

    expect(scope.assertCanReviewWork).toHaveBeenCalledWith(
      expect.any(Object),
      'manager',
    );
    expect(transaction.workCompletionReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewStatus: WorkCompletionReviewStatus.ACCEPTED,
        }),
      }),
    );
    expect(transaction.workItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WorkItemStatus.CLOSED,
          archiveEligibleAt: expect.any(Date),
          deletionEligibleAt: expect.any(Date),
        }),
      }),
    );
    expect(result.workItem.status).toBe(WorkItemStatus.CLOSED);
  });

  it('accepts a direct help request and adds the helper as supporting staff', async () => {
    const current = currentWork(WorkItemStatus.HELP_REQUESTED);
    const final = detailWork(WorkItemStatus.IN_PROGRESS);
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'helper',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    jest.mocked(prisma.workHelpRequest.findUnique).mockResolvedValue({
      status: WorkHelpRequestStatus.PENDING,
      requestedHelperAccountId: 'helper',
      workItem: { departmentId: 'department-a' },
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
      divisionId: 'division-a',
      departmentId: 'department-a',
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

  it('requests more completion information without closing the ticket', async () => {
    const current = {
      ...currentWork(WorkItemStatus.COMPLETED_PENDING_REVIEW),
      completionReports: [
        {
          id: 'report-1',
          reviewStatus: WorkCompletionReviewStatus.PENDING_REVIEW,
        },
      ],
    };
    const final = detailWork(WorkItemStatus.COMPLETED_PENDING_REVIEW);
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    transaction.workItem.findFirst.mockResolvedValue(current);
    transaction.workItem.updateMany.mockResolvedValue({ count: 1 });
    transaction.workItem.findUniqueOrThrow.mockResolvedValue(final);

    await service.requestMoreInformation(managerUser, 'work-1', {
      note: 'Upload a clear after-repair photo.',
    });

    expect(transaction.workCompletionReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewStatus: WorkCompletionReviewStatus.INFORMATION_REQUESTED,
        }),
      }),
    );
    expect(transaction.workItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WorkItemStatus.COMPLETED_PENDING_REVIEW,
        }),
      }),
    );
  });

  it('keeps tickets read-only after their one-year archive date', async () => {
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    transaction.workItem.findFirst.mockResolvedValue({
      ...currentWork(WorkItemStatus.CLOSED),
      archiveEligibleAt: new Date(Date.now() - 60_000),
    });

    await expect(
      service.reopen(managerUser, 'work-1', {
        note: 'Attempt to reopen archived work.',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.workItem.updateMany).not.toHaveBeenCalled();
  });

  it('reopens a closed ticket without rewriting its accepted completion review', async () => {
    const current = {
      ...currentWork(WorkItemStatus.CLOSED),
      completionReports: [
        {
          id: 'report-1',
          reviewStatus: WorkCompletionReviewStatus.ACCEPTED,
        },
      ],
    };
    const final = detailWork(WorkItemStatus.REOPENED);
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    transaction.workItem.findFirst.mockResolvedValue(current);
    transaction.workItem.updateMany.mockResolvedValue({ count: 1 });
    transaction.workItem.findUniqueOrThrow.mockResolvedValue(final);

    await service.reopen(managerUser, 'work-1', {
      note: 'The connection became unstable after verification.',
    });

    expect(transaction.workCompletionReport.update).not.toHaveBeenCalled();
    expect(transaction.workActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'REOPENED' }),
      }),
    );
  });

  it('blocks a management assignee from changing or cancelling work received from above', async () => {
    const current = {
      ...currentWork(WorkItemStatus.IN_PROGRESS, 'manager'),
      createdByAccountId: 'super-admin',
      responsibleManagerAccountId: 'super-admin',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    transaction.workItem.findFirst.mockResolvedValue(current);

    await expect(
      service.cancel(managerUser, 'work-1', {
        reason: 'Trying to cancel work received from higher management.',
      }),
    ).rejects.toThrow(
      'You cannot change or cancel a task assigned to you. Use My Work to complete it.',
    );

    expect(transaction.workItem.updateMany).not.toHaveBeenCalled();
  });

  it('cancels pending help requests when management cancels work', async () => {
    const current = currentWork(WorkItemStatus.HELP_REQUESTED);
    const final = detailWork(WorkItemStatus.CANCELLED);
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    transaction.workItem.findFirst.mockResolvedValue(current);
    transaction.workItem.updateMany.mockResolvedValue({ count: 1 });
    transaction.workItem.findUniqueOrThrow.mockResolvedValue(final);

    await service.cancel(managerUser, 'work-1', {
      reason: 'Duplicate field incident.',
    });

    expect(transaction.workHelpRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WorkHelpRequestStatus.CANCELLED,
        }),
      }),
    );
    expect(transaction.workActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CANCELLED' }),
      }),
    );
  });

  it('reassigns primary ownership while preserving the previous assignment', async () => {
    const current = currentWork(WorkItemStatus.IN_PROGRESS);
    const final = detailWork(WorkItemStatus.ASSIGNED);
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    jest.mocked(scope.resolvePrimaryReassignmentAccount).mockResolvedValue({
      id: 'employee-2',
    } as never);
    jest.mocked(prisma.workItem.findFirst).mockResolvedValue(current as never);
    transaction.workItem.findFirst.mockResolvedValue(current);
    transaction.workItem.updateMany.mockResolvedValue({ count: 1 });
    transaction.workItem.findUniqueOrThrow.mockResolvedValue(final);

    await service.reassignPrimary(managerUser, 'work-1', {
      primaryAssigneeAccountId: 'employee-2',
      reason: 'Requires fiber-splicing experience.',
    });

    expect(transaction.workAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'primary-assignment' },
        data: expect.objectContaining({
          endedAt: expect.any(Date),
          endReason: 'Requires fiber-splicing experience.',
        }),
      }),
    );
    expect(transaction.workAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assigneeAccountId: 'employee-2',
          assignmentRole: WorkAssignmentRole.PRIMARY,
        }),
      }),
    );
  });

  it('adds support and resolves a manager-routed help request', async () => {
    const current = currentWork(WorkItemStatus.HELP_REQUESTED);
    const final = detailWork(WorkItemStatus.IN_PROGRESS);
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    jest.mocked(scope.resolveSupportAccount).mockResolvedValue({
      id: 'helper',
    } as never);
    jest.mocked(prisma.workItem.findFirst).mockResolvedValue(current as never);
    transaction.workItem.findFirst.mockResolvedValue(current);
    transaction.workHelpRequest.findFirst.mockResolvedValue({ id: 'help-1' });
    transaction.workItem.updateMany.mockResolvedValue({ count: 1 });
    transaction.workItem.findUniqueOrThrow.mockResolvedValue(final);

    await service.addSupport(managerUser, 'work-1', {
      accountId: 'helper',
      reason: 'Manager selected an available technician.',
    });

    expect(scope.resolveSupportAccount).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'manager' }),
      'helper',
      'division-a',
    );
    expect(transaction.workHelpRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { requestedHelperAccountId: 'helper' },
            { requestedHelperAccountId: null },
          ],
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
  });

  it('removes supporting staff by ending the assignment instead of deleting it', async () => {
    const current = {
      ...currentWork(),
      assignments: [
        ...currentWork().assignments,
        {
          id: 'support-assignment',
          assigneeAccountId: 'helper',
          assignmentRole: WorkAssignmentRole.SUPPORTING,
          acknowledgedAt: null,
          startedAt: null,
        },
      ],
    };
    const final = detailWork(WorkItemStatus.IN_PROGRESS);
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    transaction.workItem.findFirst.mockResolvedValue(current);
    transaction.workItem.updateMany.mockResolvedValue({ count: 1 });
    transaction.workItem.findUniqueOrThrow.mockResolvedValue(final);

    await service.removeSupport(managerUser, 'work-1', {
      accountId: 'helper',
      reason: 'Support is no longer required.',
    });

    expect(transaction.workAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'support-assignment' },
        data: expect.objectContaining({
          endedAt: expect.any(Date),
          endReason: 'Support is no longer required.',
        }),
      }),
    );
  });

  it('updates the customer registration timestamp without changing system creation time', async () => {
    const current = currentWork();
    const final = detailWork(WorkItemStatus.IN_PROGRESS);
    const registeredAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    transaction.workItem.findFirst.mockResolvedValue(current);
    transaction.workItem.updateMany.mockResolvedValue({ count: 1 });
    transaction.workItem.findUniqueOrThrow.mockResolvedValue(final);

    await service.update(managerUser, 'work-1', {
      registeredAt: registeredAt.toISOString(),
    });

    expect(transaction.workItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ registeredAt }),
      }),
    );
  });

  it('rejects a registered timestamp later than the planned start', async () => {
    const current = currentWork();
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    transaction.workItem.findFirst.mockResolvedValue(current);

    await expect(
      service.update(managerUser, 'work-1', {
        registeredAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not emit an update notification when manager values are unchanged', async () => {
    const current = currentWork();
    const final = detailWork(WorkItemStatus.IN_PROGRESS);
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    transaction.workItem.findFirst.mockResolvedValue(current);
    transaction.workItem.findUniqueOrThrow.mockResolvedValue(final);

    const result = await service.update(managerUser, 'work-1', {
      priority: WorkPriority.HIGH,
    });

    expect(result.message).toBe('No work item changes were required.');
    expect(transaction.workItem.updateMany).not.toHaveBeenCalled();
    expect(notifications.publishWorkUpdate).not.toHaveBeenCalled();
  });

  it('rejects stale manager changes instead of overwriting a newer version', async () => {
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    transaction.workItem.findFirst.mockResolvedValue(currentWork());
    transaction.workItem.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update(managerUser, 'work-1', {
        priority: WorkPriority.CRITICAL,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
