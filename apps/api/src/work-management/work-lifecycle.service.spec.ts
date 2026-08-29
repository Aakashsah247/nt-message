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
  WorkItemType,
  WorkSalesCoordinationStatus,
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
    type: WorkItemType.TROUBLE_TICKET,
    status,
    requestNumber: null,
    cpcSerial: null,
    serviceNumber: '015500001',
    olt: 'OLT-01',
    fdcName: 'FDC-01',
    fapName: 'FAP-01',
    version: 2,
    divisionId: 'division-a',
    departmentId: 'department-a',
    assignedTeamId: null,
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

  it('lets the started primary worker send Sales-required work to the assigned Sales Member', async () => {
    const current = {
      ...currentWork(),
      salesMemberAccountId: 'sales-member',
      salesCoordinationStatus: WorkSalesCoordinationStatus.WAITING_FOR_DOCUMENTS,
    };
    const final = {
      ...detailWork(WorkItemStatus.IN_PROGRESS),
      salesMember: { id: 'sales-member' },
      salesCoordinationStatus: WorkSalesCoordinationStatus.READY_FOR_SALES,
      assignments: [
        {
          assignmentRole: WorkAssignmentRole.PRIMARY,
          assignee: { id: 'employee' },
        },
      ],
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'employee',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    transaction.workItem.findFirst.mockResolvedValue(current);
    transaction.workItem.updateMany.mockResolvedValue({ count: 1 });
    transaction.workItem.findUniqueOrThrow.mockResolvedValue(final);

    const result = await service.sendToSales(employeeUser, 'work-1', {
      note: 'Customer form is ready.',
    });

    expect(transaction.workItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          salesCoordinationStatus: WorkSalesCoordinationStatus.READY_FOR_SALES,
          salesDocumentsSentAt: expect.any(Date),
        }),
      }),
    );
    expect(transaction.workActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: WorkActivityAction.SALES_DOCUMENTS_SENT,
          actorAccountId: 'employee',
        }),
      }),
    );
    expect(notifications.publishWorkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SALES_DOCUMENTS_SENT',
        notificationRecipientAccountIds: ['sales-member'],
      }),
    );
    expect(result.message).toBe('Sent to Sales.');
  });

  it('lets only the assigned Sales Member finish Sales work', async () => {
    const current = {
      ...currentWork(),
      salesMemberAccountId: 'sales-member',
      salesCoordinationStatus: WorkSalesCoordinationStatus.READY_FOR_SALES,
      salesDocumentsSentAt: new Date(),
    };
    const final = {
      ...detailWork(WorkItemStatus.IN_PROGRESS),
      salesMember: { id: 'sales-member' },
      salesCoordinationStatus: WorkSalesCoordinationStatus.COMPLETED,
      responsibleManager: { id: 'manager' },
      assignments: [
        {
          assignmentRole: WorkAssignmentRole.PRIMARY,
          assignee: { id: 'employee' },
        },
      ],
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'sales-member',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-a',
      departmentId: 'sales-department',
    });
    transaction.workItem.findFirst.mockResolvedValue(current);
    transaction.workItem.updateMany.mockResolvedValue({ count: 1 });
    transaction.workItem.findUniqueOrThrow.mockResolvedValue(final);

    const result = await service.completeSalesWork(
      { ...employeeUser, accountId: 'sales-member' },
      'work-1',
      { note: 'Profile and billing completed.' },
    );

    expect(transaction.workItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          salesCoordinationStatus: WorkSalesCoordinationStatus.COMPLETED,
          salesCompletedAt: expect.any(Date),
          salesCompletionNote: 'Profile and billing completed.',
        }),
      }),
    );
    expect(transaction.workActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: WorkActivityAction.SALES_WORK_COMPLETED,
          actorAccountId: 'sales-member',
        }),
      }),
    );
    expect(notifications.publishWorkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SALES_WORK_COMPLETED',
        notificationRecipientAccountIds: expect.arrayContaining([
          'employee',
          'manager',
        ]),
      }),
    );
    expect(result.message).toBe('Sales work completed.');
  });

  it('rejects Sales completion from a different employee', async () => {
    const current = {
      ...currentWork(),
      salesMemberAccountId: 'sales-member',
      salesCoordinationStatus: WorkSalesCoordinationStatus.READY_FOR_SALES,
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'other-employee',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    transaction.workItem.findFirst.mockResolvedValue(current);

    await expect(
      service.completeSalesWork(
        { ...employeeUser, accountId: 'other-employee' },
        'work-1',
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(transaction.workItem.updateMany).not.toHaveBeenCalled();
  });

  it('blocks primary completion until required Sales work is finished', async () => {
    const current = {
      ...currentWork(),
      salesMemberAccountId: 'sales-member',
      salesCoordinationStatus: WorkSalesCoordinationStatus.READY_FOR_SALES,
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'employee',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    transaction.workItem.findFirst.mockResolvedValue(current);

    await expect(
      service.submitCompletion(employeeUser, 'work-1', {
        result: WorkCompletionResult.FULLY_RESOLVED,
        summary: 'Primary work completed.',
        moreWorkRequired: false,
      }),
    ).rejects.toThrow(
      'Sales work is not finished yet. Wait for Sales before submitting this work.',
    );

    expect(transaction.workCompletionReport.create).not.toHaveBeenCalled();
  });

  it('requires Customer ID and RX Level for New Installation completion', async () => {
    const current = {
      ...currentWork(),
      type: WorkItemType.NEW_CONNECTION,
      requestNumber: 'TOK-1001',
      cpcSerial: 'CPC-1001',
      serviceNumber: null,
      olt: 'OLT-03',
      fdcName: 'FDC-12',
      fapName: 'FAP-08',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'employee',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    transaction.workItem.findFirst.mockResolvedValue(current);

    await expect(
      service.submitCompletion(employeeUser, 'work-1', {
        result: WorkCompletionResult.FULLY_RESOLVED,
        summary: 'Installation tested successfully.',
        moreWorkRequired: false,
      }),
    ).rejects.toThrow('Customer ID is required.');

    await expect(
      service.submitCompletion(employeeUser, 'work-1', {
        result: WorkCompletionResult.FULLY_RESOLVED,
        summary: 'Installation tested successfully.',
        customerId: 'CUS-12345',
        moreWorkRequired: false,
      }),
    ).rejects.toThrow('RX Level is required.');

    expect(transaction.workCompletionReport.create).not.toHaveBeenCalled();
  });

  it('copies New Installation work facts without a Service Number and records Token as the closing reference', async () => {
    const current = {
      ...currentWork(),
      type: WorkItemType.NEW_CONNECTION,
      requestNumber: 'TOK-1001',
      cpcSerial: 'CPC-1001',
      serviceNumber: null,
      olt: 'OLT-03',
      fdcName: 'FDC-12',
      fapName: 'FAP-08',
    };
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
      id: 'report-installation',
      reviewStatus: WorkCompletionReviewStatus.PENDING_REVIEW,
    });

    await service.submitCompletion(employeeUser, 'work-1', {
      result: WorkCompletionResult.FULLY_RESOLVED,
      summary: 'Installation tested successfully.',
      customerId: 'CUS-12345',
      rxLevelDbm: -18.5,
      moreWorkRequired: false,
    });

    expect(transaction.workCompletionReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cpcSerial: 'CPC-1001',
          serviceNumber: null,
          customerId: 'CUS-12345',
          rxLevelDbm: -18.5,
          olt: 'OLT-03',
          fdcName: 'FDC-12',
          fapName: 'FAP-08',
        }),
      }),
    );
    expect(transaction.workActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.objectContaining({
            completionReferenceType: 'TOKEN_NUMBER',
            completionReference: 'TOK-1001',
          }),
        }),
      }),
    );
  });

  it.each([
    WorkItemType.UPDATE_SERVICES,
    WorkItemType.TROUBLE_TICKET,
    WorkItemType.EMERGENCY_WORK,
  ])('requires Customer ID for %s completion', async (type) => {
    const current = {
      ...currentWork(),
      type,
      requestNumber: type === WorkItemType.UPDATE_SERVICES ? 'TOK-2001' : null,
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'employee',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    transaction.workItem.findFirst.mockResolvedValue(current);

    await expect(
      service.submitCompletion(employeeUser, 'work-1', {
        result: WorkCompletionResult.FULLY_RESOLVED,
        summary: 'Work completed successfully.',
        rxLevelDbm: -20,
        moreWorkRequired: false,
      }),
    ).rejects.toThrow('Customer ID is required.');
  });

  it.each([WorkItemType.ROUTINE_TASK, WorkItemType.INSPECTION])(
    'removes Customer ID but still requires RX Level for %s completion',
    async (type) => {
      const current = { ...currentWork(), type };
      jest.mocked(scope.resolveActorContext).mockResolvedValue({
        accountId: 'employee',
        role: AccountRole.EMPLOYEE,
        divisionId: 'division-a',
        departmentId: 'department-a',
      });
      transaction.workItem.findFirst.mockResolvedValue(current);

      await expect(
        service.submitCompletion(employeeUser, 'work-1', {
          result: WorkCompletionResult.FULLY_RESOLVED,
          summary: 'Work completed successfully.',
          customerId: 'IGNORED-123',
          moreWorkRequired: false,
        }),
      ).rejects.toThrow('RX Level is required.');
    },
  );

  it.each([WorkItemType.ROUTINE_TASK, WorkItemType.INSPECTION])(
    'does not store Customer ID for %s completion',
    async (type) => {
      const current = { ...currentWork(), type };
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
        id: `report-${type.toLowerCase()}`,
        reviewStatus: WorkCompletionReviewStatus.PENDING_REVIEW,
      });

      await service.submitCompletion(employeeUser, 'work-1', {
        result: WorkCompletionResult.FULLY_RESOLVED,
        summary: 'Work completed successfully.',
        customerId: 'SHOULD-NOT-BE-STORED',
        rxLevelDbm: -22,
        moreWorkRequired: false,
      });

      expect(transaction.workCompletionReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: null,
            rxLevelDbm: -22,
          }),
        }),
      );
    },
  );

  it('allows Network Maintenance completion without Customer ID while still requiring RX Level', async () => {
    const current = {
      ...currentWork(),
      type: WorkItemType.MAINTENANCE,
      requestNumber: null,
      serviceNumber: null,
    };
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
      id: 'report-maintenance',
      reviewStatus: WorkCompletionReviewStatus.PENDING_REVIEW,
    });

    await service.submitCompletion(employeeUser, 'work-1', {
      result: WorkCompletionResult.FULLY_RESOLVED,
      summary: 'Maintenance completed.',
      rxLevelDbm: -21.25,
      moreWorkRequired: false,
    });

    expect(transaction.workCompletionReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: null,
          rxLevelDbm: -21.25,
          serviceNumber: null,
        }),
      }),
    );
  });

  it('stores optional Customer ID for Network Maintenance when the worker has it', async () => {
    const current = {
      ...currentWork(),
      type: WorkItemType.MAINTENANCE,
      requestNumber: null,
      serviceNumber: null,
    };
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
      id: 'report-maintenance-with-customer',
      reviewStatus: WorkCompletionReviewStatus.PENDING_REVIEW,
    });

    await service.submitCompletion(employeeUser, 'work-1', {
      result: WorkCompletionResult.FULLY_RESOLVED,
      summary: 'Maintenance completed.',
      customerId: 'CUS-OPTIONAL',
      rxLevelDbm: -21.25,
      moreWorkRequired: false,
    });

    expect(transaction.workCompletionReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: 'CUS-OPTIONAL',
          rxLevelDbm: -21.25,
        }),
      }),
    );
  });

  it('prefers Token Number over Service Number when both references exist', async () => {
    const current = {
      ...currentWork(),
      type: WorkItemType.UPDATE_SERVICES,
      requestNumber: 'TOK-4001',
      serviceNumber: '0155004001',
    };
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
      id: 'report-token-reference',
      reviewStatus: WorkCompletionReviewStatus.PENDING_REVIEW,
    });

    await service.submitCompletion(employeeUser, 'work-1', {
      result: WorkCompletionResult.FULLY_RESOLVED,
      summary: 'Service update completed.',
      customerId: 'CUS-4001',
      rxLevelDbm: -17.75,
      moreWorkRequired: false,
    });

    expect(transaction.workActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.objectContaining({
            completionReferenceType: 'TOKEN_NUMBER',
            completionReference: 'TOK-4001',
          }),
        }),
      }),
    );
  });

  it('uses Service Number as the closing reference when Token Number is absent', async () => {
    const current = {
      ...currentWork(),
      type: WorkItemType.TROUBLE_TICKET,
      requestNumber: null,
      serviceNumber: '015500999',
    };
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
      id: 'report-service-reference',
      reviewStatus: WorkCompletionReviewStatus.PENDING_REVIEW,
    });

    await service.submitCompletion(employeeUser, 'work-1', {
      result: WorkCompletionResult.FULLY_RESOLVED,
      summary: 'Trouble ticket resolved.',
      customerId: 'CUS-3001',
      rxLevelDbm: -19.5,
      moreWorkRequired: false,
    });

    expect(transaction.workActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.objectContaining({
            completionReferenceType: 'SERVICE_NUMBER',
            completionReference: '015500999',
          }),
        }),
      }),
    );
  });

  it('keeps Administrative Work completion free of customer and network field requirements', async () => {
    const current = {
      ...currentWork(),
      type: WorkItemType.ADMINISTRATIVE_TASK,
      requestNumber: null,
      cpcSerial: null,
      serviceNumber: null,
      olt: null,
      fdcName: null,
      fapName: null,
    };
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
      id: 'report-admin',
      reviewStatus: WorkCompletionReviewStatus.PENDING_REVIEW,
    });

    await service.submitCompletion(employeeUser, 'work-1', {
      result: WorkCompletionResult.FULLY_RESOLVED,
      summary: 'Administrative work completed.',
      moreWorkRequired: false,
    });

    expect(transaction.workCompletionReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cpcSerial: null,
          serviceNumber: null,
          customerId: null,
          rxLevelDbm: null,
          olt: null,
          fdcName: null,
          fapName: null,
        }),
      }),
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
      customerId: 'CUS-1001',
      rxLevelDbm: -18.5,
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

  it('blocks final submission while delegated work is still unfinished', async () => {
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
      'Delegated work is still unfinished. Complete or cancel it before submitting this task.',
    );

    expect(transaction.workCompletionReport.create).not.toHaveBeenCalled();
  });

  it('blocks cancellation while delegated work is unfinished', async () => {
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
      'Cancel or complete the unfinished delegated work before cancelling this task.',
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
          customerId: `CUS-${accountId}`,
          rxLevelDbm: -19,
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

  it('blocks manager approval while required Sales work is unfinished', async () => {
    const current = {
      ...currentWork(WorkItemStatus.COMPLETED_PENDING_REVIEW),
      salesMemberAccountId: 'sales-member',
      salesCoordinationStatus: WorkSalesCoordinationStatus.READY_FOR_SALES,
      completionReports: [
        {
          id: 'report-1',
          reviewStatus: WorkCompletionReviewStatus.PENDING_REVIEW,
        },
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
      service.close(managerUser, 'work-1', {
        note: 'Completion details checked.',
      }),
    ).rejects.toThrow(
      'Sales work is not finished yet. Wait for Sales before approving this work.',
    );

    expect(transaction.workCompletionReport.update).not.toHaveBeenCalled();
    expect(transaction.workItem.updateMany).not.toHaveBeenCalled();
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

  it('rejects individual transfer for operational work because operational ownership is Team-based', async () => {
    const current = currentWork(WorkItemStatus.IN_PROGRESS);
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    jest.mocked(prisma.workItem.findFirst).mockResolvedValue(current as never);

    await expect(
      service.reassignPrimary(managerUser, 'work-1', {
        primaryAssigneeAccountId: 'employee-2',
        reason: 'Move to another employee.',
      }),
    ).rejects.toThrow(
      'Operational work stays Team-owned and cannot be transferred to one individual.',
    );

    expect(scope.resolvePrimaryReassignmentAccount).not.toHaveBeenCalled();
  });

  it('reassigns individual Administrative ownership while preserving the previous assignment', async () => {
    const current = currentWork(WorkItemStatus.IN_PROGRESS);
    current.type = WorkItemType.ADMINISTRATIVE_TASK;
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

    expect(scope.assertAdministrativeIndividualAssignee).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'manager' }),
      expect.objectContaining({ id: 'employee-2' }),
    );
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

  it('keeps registration internal when editing Administrative Work', async () => {
    const current = currentWork();
    current.type = WorkItemType.ADMINISTRATIVE_TASK;
    const originalRegisteredAt = current.registeredAt;
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

    await service.update(managerUser, 'work-1', {
      registeredAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      plannedStartAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    });

    expect(transaction.workItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          registeredAt: originalRegisteredAt,
        }),
      }),
    );
    expect(transaction.workActivity.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          action: WorkActivityAction.DETAILS_UPDATED,
          details: expect.not.objectContaining({
            registeredAt: expect.anything(),
            previousRegisteredAt: expect.anything(),
          }),
        }),
      ]),
    });
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
      locationText: current.locationText,
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
        locationText: 'Pulchowk',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
