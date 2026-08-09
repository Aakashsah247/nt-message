import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  DepartmentWorkFunction,
  EmployeeStatus,
  EmploymentStatus,
  WorkActivityAction,
  WorkAssignmentRole,
  WorkContactType,
  WorkHelpRequestStatus,
  WorkItemStatus,
  WorkItemType,
  WorkPriority,
  WorkServiceType,
} from '../generated/prisma/enums';
import { WorkQueueFocus, WorkQueueView } from './dto/list-work-items-query.dto';
import { WorkItemsService } from './work-items.service';
import type { WorkNotificationsService } from './work-notifications.service';
import type { WorkScopeService } from './work-scope.service';
import type { WorkStatusTransitionService } from './work-status-transition.service';

// Replace the database runtime token while preserving transaction behavior in mocks.
jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

// Focused service tests use generated enums without loading Prisma 7's query runtime.
jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

function createEmployeeAccount(id: string) {
  return {
    id,
    role: AccountRole.EMPLOYEE,
    isEnabled: true,
    username: `${id}@ntc.test`,
    employee: {
      id: `employee-${id}`,
      empId: `NTC-${id}`,
      empName: id,
      designation: 'Technician',
      status: EmployeeStatus.ACTIVE,
      employmentStatus: EmploymentStatus.ACTIVE,
      archivedAt: null,
      isActivated: true,
      divisionId: 'division-a',
      departmentId: 'department-a',
      division: {
        id: 'division-a',
        code: 'DIV-A',
        name: 'Division A',
        isActive: true,
      },
      departmentUnit: {
        id: 'department-a',
        divisionId: 'division-a',
        code: 'NET',
        name: 'Network',
        workFunction: DepartmentWorkFunction.GENERAL,
        isActive: true,
      },
      managementAssignments: [],
    },
  };
}

function createWorkTeam(admin: ReturnType<typeof createEmployeeAccount>) {
  return {
    id: 'team-a',
    name: 'Network Team A',
    departmentId: 'department-a',
    teamAdminEmployeeId: admin.employee.id,
    isActive: true,
    archivedAt: null,
    department: {
      id: 'department-a',
      divisionId: 'division-a',
      code: 'NET',
      name: 'Network',
      workFunction: DepartmentWorkFunction.GENERAL,
      isActive: true,
      division: {
        id: 'division-a',
        code: 'DIV-A',
        name: 'Division A',
        isActive: true,
      },
    },
    teamAdmin: {
      id: admin.employee.id,
      account: admin,
    },
    members: [
      {
        employee: {
          id: admin.employee.id,
          account: admin,
        },
      },
    ],
  };
}

function createSchedule() {
  const now = Date.now();
  return {
    registeredAt: new Date(now - 30 * 60 * 1000).toISOString(),
    plannedStartAt: new Date(now + 10 * 60 * 1000).toISOString(),
    dueAt: new Date(now + 60 * 60 * 1000).toISOString(),
  };
}

describe('WorkItemsService M20 Phase 2', () => {
  const transaction = {
    $queryRawUnsafe: jest.fn(),
    workItem: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    workAssignment: {
      updateMany: jest.fn(),
    },
    workActivity: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(),
    workItem: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    workHelpRequest: {
      count: jest.fn(),
    },
    workActivity: {
      findMany: jest.fn(),
    },
  } as unknown as PrismaService;
  const scope = {
    resolveActorContext: jest.fn(),
    assertCanCreateWork: jest.fn(),
    resolveAssignableAccounts: jest.fn(),
    resolveAssignableTeam: jest.fn(),
    resolveSalesMember: jest.fn(),
    resolveSupportMembers: jest.fn(),
    resolveResponsibleManager: jest.fn(),
    buildVisibleWorkWhere: jest.fn(),
  } as unknown as WorkScopeService;
  const transitions = {
    getStatusAfterAcknowledgement: jest.fn(),
    getStatusAfterStart: jest.fn(),
  } as unknown as WorkStatusTransitionService;
  const notifications = {
    publishWorkUpdate: jest.fn(),
  } as unknown as WorkNotificationsService;
  const service = new WorkItemsService(
    prisma,
    scope,
    transitions,
    notifications,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(prisma.workItem.findFirst).mockReset();
    jest.mocked(prisma.workItem.findFirst).mockResolvedValue(null as never);
    jest.mocked(prisma.workItem.findMany).mockReset();
    jest.mocked(prisma.workItem.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.workItem.groupBy).mockReset();
    jest.mocked(prisma.workItem.groupBy).mockResolvedValue([] as never);
    jest.mocked(scope.resolveSupportMembers).mockResolvedValue([] as never);
    jest
      .mocked(prisma.$transaction)
      .mockImplementation(async (callback: unknown) => {
        return (callback as (client: typeof transaction) => Promise<unknown>)(
          transaction,
        ) as never;
      });
  });

  it('creates a collision-safe ticket and immutable assignment activities', async () => {
    const primary = createEmployeeAccount('ram');
    const team = createWorkTeam(primary);
    const actor = {
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.resolveAssignableTeam).mockResolvedValue(team as never);
    jest.mocked(scope.resolveResponsibleManager).mockResolvedValue({
      id: 'manager',
    } as never);
    const year = new Date().getUTCFullYear();
    const ticketNumber = `NT-PAT-NET-${year}-000042`;
    transaction.$queryRawUnsafe.mockResolvedValue([{ nextValue: 42n }]);
    transaction.workItem.create.mockResolvedValue({
      id: 'work-1',
      ticketNumber,
      title: 'Repair damaged wire',
      status: WorkItemStatus.ASSIGNED,
      priority: WorkPriority.NORMAL,
      createdBy: { id: actor.accountId },
      responsibleManager: { id: actor.accountId },
      assignments: [
        {
          assignee: { id: primary.id },
        },
      ],
    });
    transaction.workActivity.createMany.mockResolvedValue({ count: 2 });

    const result = await service.create(
      {
        accountId: actor.accountId,
        sessionId: 'session',
        username: 'manager@ntc.test',
        role: actor.role,
      },
      {
        type: WorkItemType.TROUBLE_TICKET,
        customerName: 'Hari Prasad',
        customerContactType: WorkContactType.MOBILE,
        customerContactNumber: '9841000000',
        serviceNumber: 'NT-FTTH-10001',
        olt: 'OLT-PAT-01',
        fdcName: 'FDC-LAG-02',
        fapName: 'FAP-LAG-07',
        serviceTypes: [WorkServiceType.DATA],
        locationText: 'Lagankhel, Kathmandu',
        ...createSchedule(),
        assignedTeamId: team.id,
      },
    );

    expect(scope.assertCanCreateWork).toHaveBeenCalledWith(actor);
    expect(transaction.workItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketNumber,
          departmentId: 'department-a',
          divisionId: 'division-a',
          status: WorkItemStatus.ASSIGNED,
          assignedTeamId: team.id,
          customerName: 'Hari Prasad',
          serviceNumber: 'NT-FTTH-10001',
          serviceTypes: [WorkServiceType.DATA],
          priority: WorkPriority.NORMAL,
          title: 'Trouble ticket · NT-FTTH-10001 · Hari Prasad',
        }),
      }),
    );
    expect(transaction.workActivity.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ action: 'CREATED' }),
        expect.objectContaining({ action: 'TEAM_ASSIGNED' }),
        expect.objectContaining({ action: 'ASSIGNED' }),
      ]),
    });
    expect(result.workItem).toEqual(expect.objectContaining({ ticketNumber }));
    expect(notifications.publishWorkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATED',
        actorAccountId: actor.accountId,
      }),
    );
  });

  it('stores customer registration time and optional Support-department staff', async () => {
    const primary = createEmployeeAccount('field-admin');
    const supportMember = createEmployeeAccount('support-member');
    supportMember.employee.departmentId = 'support-department';
    supportMember.employee.departmentUnit.id = 'support-department';
    supportMember.employee.departmentUnit.name = 'Support';
    supportMember.employee.departmentUnit.workFunction =
      DepartmentWorkFunction.SUPPORT;
    const team = createWorkTeam(primary);
    const actor = {
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    const schedule = createSchedule();

    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.resolveAssignableTeam).mockResolvedValue(team as never);
    jest
      .mocked(scope.resolveSupportMembers)
      .mockResolvedValue([supportMember] as never);
    jest.mocked(scope.resolveResponsibleManager).mockResolvedValue({
      id: actor.accountId,
    } as never);
    transaction.$queryRawUnsafe.mockResolvedValue([{ nextValue: 49n }]);
    transaction.workItem.create.mockResolvedValue({
      id: 'work-with-support',
      ticketNumber: 'NT-PAT-NET-2026-000049',
      title: 'Trouble ticket · FTTH-49 · Customer',
      status: WorkItemStatus.ASSIGNED,
      priority: WorkPriority.NORMAL,
      createdBy: { id: actor.accountId },
      responsibleManager: { id: actor.accountId },
      assignments: [],
    });
    transaction.workActivity.createMany.mockResolvedValue({ count: 4 });

    await service.create(
      {
        accountId: actor.accountId,
        sessionId: 'session',
        username: 'manager@ntc.test',
        role: actor.role,
      },
      {
        type: WorkItemType.TROUBLE_TICKET,
        customerName: 'Customer',
        customerContactType: WorkContactType.MOBILE,
        customerContactNumber: '9841000000',
        serviceNumber: 'FTTH-49',
        olt: 'OLT-1',
        fdcName: 'FDC-1',
        fapName: 'FAP-1',
        serviceTypes: [WorkServiceType.DATA],
        locationText: 'Patan',
        ...schedule,
        assignedTeamId: team.id,
        supportingAssigneeAccountIds: [supportMember.id],
      },
    );

    expect(scope.resolveSupportMembers).toHaveBeenCalledWith(
      actor,
      [supportMember.id],
      'division-a',
    );
    expect(transaction.workItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          registeredAt: new Date(schedule.registeredAt),
          plannedStartAt: new Date(schedule.plannedStartAt),
          assignments: {
            create: expect.arrayContaining([
              expect.objectContaining({
                assigneeAccountId: supportMember.id,
                assignmentRole: WorkAssignmentRole.SUPPORTING,
              }),
            ]),
          },
        }),
      }),
    );
  });

  it('rejects a future customer registration time', async () => {
    const primary = createEmployeeAccount('field-admin-future');
    const team = createWorkTeam(primary);
    const actor = {
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.resolveAssignableTeam).mockResolvedValue(team as never);
    jest.mocked(scope.resolveResponsibleManager).mockResolvedValue({
      id: actor.accountId,
    } as never);

    await expect(
      service.create(
        {
          accountId: actor.accountId,
          sessionId: 'session',
          username: 'manager@ntc.test',
          role: actor.role,
        },
        {
          type: WorkItemType.ROUTINE_TASK,
          customerName: 'Customer',
          customerContactType: WorkContactType.MOBILE,
          customerContactNumber: '9841000000',
          serviceNumber: 'FTTH-FUTURE',
          olt: 'OLT-1',
          fdcName: 'FDC-1',
          fapName: 'FAP-1',
          locationText: 'Patan',
          registeredAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          plannedStartAt: new Date(Date.now() + 40 * 60 * 1000).toISOString(),
          dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          assignedTeamId: team.id,
        },
      ),
    ).rejects.toThrow('Registered date and time cannot be in the future.');
  });

  it('creates team work only from a task assigned to the current manager', async () => {
    const primary = createEmployeeAccount('field-worker');
    const actor = {
      accountId: 'team-manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    const parentDueAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const parent = {
      id: 'parent-work',
      ticketNumber: 'NT-PAT-NET-2026-000040',
      type: WorkItemType.MAINTENANCE,
      title: 'Network maintenance · FTTH-100 · Customer',
      description: 'Main network maintenance work.',
      status: WorkItemStatus.IN_PROGRESS,
      priority: WorkPriority.HIGH,
      archiveEligibleAt: null,
      divisionId: 'division-a',
      departmentId: 'department-a',
      customerName: 'Customer',
      customerContactType: WorkContactType.MOBILE,
      customerContactNumber: '9841000000',
      serviceTypes: [],
      otherServiceText: null,
      serviceNumber: 'FTTH-100',
      olt: 'OLT-1',
      fdcName: 'FDC-1',
      fapName: 'FAP-1',
      locationText: 'Patan',
      registeredAt: new Date(Date.now() - 60 * 60 * 1000),
      plannedStartAt: new Date(Date.now() - 30 * 60 * 1000),
      dueAt: parentDueAt,
      assignments: [
        {
          assignmentRole: WorkAssignmentRole.PRIMARY,
          startedAt: new Date(),
          assignee: { id: actor.accountId },
        },
      ],
    };

    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.buildVisibleWorkWhere).mockReturnValue({
      departmentId: 'department-a',
    });
    jest
      .mocked(prisma.workItem.findFirst)
      .mockResolvedValueOnce(parent as never)
      .mockResolvedValueOnce(null);
    jest
      .mocked(scope.resolveAssignableAccounts)
      .mockResolvedValue([primary] as never);
    jest.mocked(scope.resolveResponsibleManager).mockResolvedValue({
      id: actor.accountId,
    } as never);
    transaction.$queryRawUnsafe.mockResolvedValue([{ nextValue: 46n }]);
    transaction.workItem.create.mockResolvedValue({
      id: 'team-work',
      ticketNumber: 'NT-PAT-NET-2026-000046',
      title: parent.title,
      status: WorkItemStatus.ASSIGNED,
      priority: WorkPriority.HIGH,
      createdBy: { id: actor.accountId },
      responsibleManager: { id: actor.accountId },
      assignments: [{ assignee: { id: primary.id } }],
    });
    transaction.workActivity.createMany.mockResolvedValue({ count: 3 });

    await service.create(
      {
        accountId: actor.accountId,
        sessionId: 'session',
        username: 'team-manager@ntc.test',
        role: actor.role,
      },
      {
        // The client type is intentionally different; the server must inherit the main task.
        type: WorkItemType.ROUTINE_TASK,
        ...createSchedule(),
        primaryAssigneeAccountId: primary.id,
        parentWorkItemId: parent.id,
        teamInstructions: 'Inspect the FAP and confirm the optical reading.',
      },
    );

    expect(scope.resolveResponsibleManager).toHaveBeenCalledWith(
      actor,
      actor.accountId,
      'division-a',
      'department-a',
    );
    expect(transaction.workItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentWorkItemId: parent.id,
          type: WorkItemType.MAINTENANCE,
          priority: WorkPriority.HIGH,
          createdByAccountId: actor.accountId,
          responsibleManagerAccountId: actor.accountId,
          description: expect.stringContaining(
            'Inspect the FAP and confirm the optical reading.',
          ),
        }),
      }),
    );
    expect(transaction.workActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workItemId: parent.id,
        action: WorkActivityAction.DELEGATED,
        details: expect.objectContaining({
          teamWorkItemId: 'team-work',
          teamMemberAccountId: primary.id,
        }),
      }),
    });
  });

  it('creates network maintenance without a service number', async () => {
    const primary = createEmployeeAccount('maintenance-worker');
    const team = createWorkTeam(primary);
    const actor = {
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.resolveAssignableTeam).mockResolvedValue(team as never);
    jest.mocked(scope.resolveResponsibleManager).mockResolvedValue({
      id: actor.accountId,
    } as never);
    transaction.$queryRawUnsafe.mockResolvedValue([{ nextValue: 47n }]);
    transaction.workItem.create.mockResolvedValue({
      id: 'maintenance-work',
      ticketNumber: 'NT-PAT-NET-2026-000047',
      title: 'Network maintenance · Customer',
      status: WorkItemStatus.ASSIGNED,
      priority: WorkPriority.NORMAL,
      createdBy: { id: actor.accountId },
      responsibleManager: { id: actor.accountId },
      assignments: [{ assignee: { id: primary.id } }],
    });
    transaction.workActivity.createMany.mockResolvedValue({ count: 2 });

    await service.create(
      {
        accountId: actor.accountId,
        sessionId: 'session',
        username: 'manager@ntc.test',
        role: actor.role,
      },
      {
        type: WorkItemType.MAINTENANCE,
        customerName: 'Customer',
        customerContactType: WorkContactType.MOBILE,
        customerContactNumber: '9841000000',
        locationText: 'Patan, Lalitpur',
        olt: 'OLT-PAT-01',
        fdcName: 'FDC-PAT-01',
        fapName: 'FAP-PAT-01',
        ...createSchedule(),
        assignedTeamId: team.id,
      },
    );

    expect(transaction.workItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          serviceNumber: null,
          priority: WorkPriority.NORMAL,
          title: 'Network maintenance · Customer',
          description: expect.not.stringContaining('Service number:'),
        }),
      }),
    );
  });

  it('creates administrative work without customer or network details', async () => {
    const primary = createEmployeeAccount('admin-task');
    const actor = {
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest
      .mocked(scope.resolveAssignableAccounts)
      .mockResolvedValue([primary] as never);
    jest.mocked(scope.resolveResponsibleManager).mockResolvedValue({
      id: 'manager',
    } as never);
    transaction.$queryRawUnsafe.mockResolvedValue([{ nextValue: 45n }]);
    transaction.workItem.create.mockResolvedValue({
      id: 'work-administrative',
      ticketNumber: 'NT-PAT-NET-2026-000045',
      title: 'Prepare the monthly service report',
      status: WorkItemStatus.ASSIGNED,
      priority: WorkPriority.NORMAL,
      createdBy: { id: actor.accountId },
      responsibleManager: { id: actor.accountId },
      assignments: [{ assignee: { id: primary.id } }],
    });
    transaction.workActivity.createMany.mockResolvedValue({ count: 2 });

    await service.create(
      {
        accountId: actor.accountId,
        sessionId: 'session',
        username: 'manager@ntc.test',
        role: actor.role,
      },
      {
        type: WorkItemType.ADMINISTRATIVE_TASK,
        title: 'Prepare the monthly service report',
        description:
          'Prepare and submit the monthly service report for review.',
        ...createSchedule(),
        primaryAssigneeAccountId: primary.id,
      },
    );

    expect(transaction.workItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Prepare the monthly service report',
          description:
            'Prepare and submit the monthly service report for review.',
          customerName: null,
          customerContactType: null,
          customerContactNumber: null,
          locationText: null,
          serviceNumber: null,
          olt: null,
          fdcName: null,
          fapName: null,
          serviceTypes: [],
        }),
      }),
    );
  });

  it('requires service activities for New Installation work', async () => {
    const primary = createEmployeeAccount('sita');
    const team = createWorkTeam(primary);
    const salesMember = createEmployeeAccount('sales-sita');
    salesMember.employee.designation = 'Sales Officer';
    salesMember.employee.departmentUnit.code = 'SALES';
    salesMember.employee.departmentUnit.name = 'Sales';
    salesMember.employee.departmentUnit.workFunction =
      DepartmentWorkFunction.SALES;
    const actor = {
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.resolveAssignableTeam).mockResolvedValue(team as never);
    jest.mocked(scope.resolveSalesMember).mockResolvedValue(salesMember as never);
    jest.mocked(scope.resolveResponsibleManager).mockResolvedValue({
      id: 'manager',
    } as never);

    await expect(
      service.create(
        {
          accountId: actor.accountId,
          sessionId: 'session',
          username: 'manager@ntc.test',
          role: actor.role,
        },
        {
          type: WorkItemType.NEW_CONNECTION,
          customerName: 'Sita Rai',
          customerContactType: WorkContactType.MOBILE,
          customerContactNumber: '9812345678',
          locationText: 'Patan, Lalitpur',
          serviceNumber: 'NEW-FTTH-20001',
          olt: 'OLT-PAT-02',
          fdcName: 'FDC-PAT-01',
          fapName: 'FAP-PAT-03',
          serviceTypes: [],
          ...createSchedule(),
          assignedTeamId: team.id,
          salesMemberAccountId: salesMember.id,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stores selected services and required Other service details', async () => {
    const primary = createEmployeeAccount('gita');
    const team = createWorkTeam(primary);
    const salesMember = createEmployeeAccount('sales-gita');
    salesMember.employee.designation = 'Sales Officer';
    salesMember.employee.departmentUnit.code = 'SALES';
    salesMember.employee.departmentUnit.name = 'Sales';
    salesMember.employee.departmentUnit.workFunction =
      DepartmentWorkFunction.SALES;
    const actor = {
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.resolveAssignableTeam).mockResolvedValue(team as never);
    jest.mocked(scope.resolveSalesMember).mockResolvedValue(salesMember as never);
    jest.mocked(scope.resolveResponsibleManager).mockResolvedValue({
      id: 'manager',
    } as never);
    transaction.$queryRawUnsafe.mockResolvedValue([{ nextValue: 43n }]);
    transaction.workItem.create.mockResolvedValue({
      id: 'work-2',
      ticketNumber: 'NT-PAT-NET-2026-000043',
      title: 'New Installation · NEW-FTTH-20002 · Gita Rai',
      status: WorkItemStatus.ASSIGNED,
      priority: WorkPriority.NORMAL,
      createdBy: { id: actor.accountId },
      responsibleManager: { id: actor.accountId },
      assignments: [{ assignee: { id: primary.id } }],
    });
    transaction.workActivity.createMany.mockResolvedValue({ count: 2 });

    await service.create(
      {
        accountId: actor.accountId,
        sessionId: 'session',
        username: 'manager@ntc.test',
        role: actor.role,
      },
      {
        type: WorkItemType.NEW_CONNECTION,
        customerName: 'Gita Rai',
        customerContactType: WorkContactType.MOBILE,
        customerContactNumber: '9812345679',
        locationText: 'Patan, Lalitpur',
        serviceNumber: 'NEW-FTTH-20002',
        olt: 'OLT-PAT-02',
        fdcName: 'FDC-PAT-01',
        fapName: 'FAP-PAT-04',
        serviceTypes: [WorkServiceType.DATA, WorkServiceType.OTHER],
        otherServiceText: 'Enterprise VPN',
        ...createSchedule(),
        assignedTeamId: team.id,
        salesMemberAccountId: salesMember.id,
      },
    );

    expect(transaction.workItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          serviceTypes: [WorkServiceType.DATA, WorkServiceType.OTHER],
          otherServiceText: 'Enterprise VPN',
          assignedTeamId: team.id,
          salesMemberAccountId: salesMember.id,
          description: expect.stringContaining('Token number: NEW-FTTH-20002.'),
          category: null,
        }),
      }),
    );
  });

  it('rejects an invalid mobile number before creating the ticket', async () => {
    const primary = createEmployeeAccount('mobile-check');
    const team = createWorkTeam(primary);
    const actor = {
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.resolveAssignableTeam).mockResolvedValue(team as never);
    jest.mocked(scope.resolveResponsibleManager).mockResolvedValue({
      id: 'manager',
    } as never);

    await expect(
      service.create(
        {
          accountId: actor.accountId,
          sessionId: 'session',
          username: 'manager@ntc.test',
          role: actor.role,
        },
        {
          type: WorkItemType.TROUBLE_TICKET,
          customerName: 'Mobile Check',
          customerContactType: WorkContactType.MOBILE,
          customerContactNumber: '9812345',
          locationText: 'Patan, Lalitpur',
          serviceNumber: 'FTTH-30001',
          olt: 'OLT-PAT-03',
          fdcName: 'FDC-PAT-03',
          fapName: 'FAP-PAT-03',
          serviceTypes: [WorkServiceType.DATA],
          ...createSchedule(),
          assignedTeamId: team.id,
        },
      ),
    ).rejects.toThrow('Mobile number must contain exactly 10 digits.');
    expect(transaction.workItem.create).not.toHaveBeenCalled();
  });

  it('accepts and stores a formatted telephone number', async () => {
    const primary = createEmployeeAccount('telephone-check');
    const team = createWorkTeam(primary);
    const actor = {
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.resolveAssignableTeam).mockResolvedValue(team as never);
    jest.mocked(scope.resolveResponsibleManager).mockResolvedValue({
      id: 'manager',
    } as never);
    transaction.$queryRawUnsafe.mockResolvedValue([{ nextValue: 44n }]);
    transaction.workItem.create.mockResolvedValue({
      id: 'work-telephone',
      ticketNumber: 'NT-PAT-NET-2026-000044',
      title: 'Trouble ticket · FTTH-30002 · Telephone Check',
      status: WorkItemStatus.ASSIGNED,
      priority: WorkPriority.NORMAL,
      createdBy: { id: actor.accountId },
      responsibleManager: { id: actor.accountId },
      assignments: [{ assignee: { id: primary.id } }],
    });
    transaction.workActivity.createMany.mockResolvedValue({ count: 2 });

    await service.create(
      {
        accountId: actor.accountId,
        sessionId: 'session',
        username: 'manager@ntc.test',
        role: actor.role,
      },
      {
        type: WorkItemType.TROUBLE_TICKET,
        customerName: 'Telephone Check',
        customerContactType: WorkContactType.TELEPHONE,
        customerContactNumber: '01 - 555 1234',
        locationText: 'Patan, Lalitpur',
        serviceNumber: 'FTTH-30002',
        olt: 'OLT-PAT-03',
        fdcName: 'FDC-PAT-03',
        fapName: 'FAP-PAT-03',
        serviceTypes: [WorkServiceType.VOICE],
        ...createSchedule(),
        assignedTeamId: team.id,
      },
    );

    expect(transaction.workItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerContactType: WorkContactType.TELEPHONE,
          customerContactNumber: '01-555 1234',
        }),
      }),
    );
  });


  it('rejects direct staff assignment for standalone operational work', async () => {
    const primary = createEmployeeAccount('legacy-owner');
    const actor = {
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);

    await expect(
      service.create(
        {
          accountId: actor.accountId,
          sessionId: 'session',
          username: 'manager@ntc.test',
          role: actor.role,
        },
        {
          type: WorkItemType.ROUTINE_TASK,
          customerName: 'Legacy Customer',
          customerContactType: WorkContactType.MOBILE,
          customerContactNumber: '9841000000',
          locationText: 'Patan',
          serviceNumber: 'FTTH-LEGACY',
          olt: 'OLT-1',
          fdcName: 'FDC-1',
          fapName: 'FAP-1',
          ...createSchedule(),
          primaryAssigneeAccountId: primary.id,
        },
      ),
    ).rejects.toThrow(
      'Operational work must be assigned to a team, not directly to one staff member.',
    );
  });

  it.each([
    WorkItemType.NEW_CONNECTION,
    WorkItemType.UPDATE_SERVICES,
  ])('requires a Sales Member for %s work', async (type) => {
    const primary = createEmployeeAccount('sales-required-admin');
    const team = createWorkTeam(primary);
    const actor = {
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.resolveAssignableTeam).mockResolvedValue(team as never);
    jest.mocked(scope.resolveResponsibleManager).mockResolvedValue({
      id: actor.accountId,
    } as never);

    await expect(
      service.create(
        {
          accountId: actor.accountId,
          sessionId: 'session',
          username: 'manager@ntc.test',
          role: actor.role,
        },
        {
          type,
          customerName: 'Sales Required Customer',
          customerContactType: WorkContactType.MOBILE,
          customerContactNumber: '9841000000',
          locationText: 'Patan',
          serviceNumber: 'SERVICE-100',
          olt: 'OLT-1',
          fdcName: 'FDC-1',
          fapName: 'FAP-1',
          serviceTypes: [WorkServiceType.DATA],
          ...createSchedule(),
          assignedTeamId: team.id,
        },
      ),
    ).rejects.toThrow(
      'Choose a Sales Member for New Installation and Update Services work.',
    );

    expect(scope.resolveSalesMember).not.toHaveBeenCalled();
    expect(transaction.workItem.create).not.toHaveBeenCalled();
  });

  it('rejects a Sales Member who already belongs to the assigned main team', async () => {
    const primary = createEmployeeAccount('team-admin');
    const salesMember = createEmployeeAccount('team-sales');
    const team = createWorkTeam(primary);
    team.members.push({
      employee: {
        id: salesMember.employee.id,
        account: salesMember,
      },
    });
    const actor = {
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.resolveAssignableTeam).mockResolvedValue(team as never);
    jest.mocked(scope.resolveResponsibleManager).mockResolvedValue({
      id: actor.accountId,
    } as never);
    jest.mocked(scope.resolveSalesMember).mockResolvedValue(salesMember as never);

    await expect(
      service.create(
        {
          accountId: actor.accountId,
          sessionId: 'session',
          username: 'manager@ntc.test',
          role: actor.role,
        },
        {
          type: WorkItemType.NEW_CONNECTION,
          customerName: 'Installation Customer',
          customerContactType: WorkContactType.MOBILE,
          customerContactNumber: '9841000000',
          locationText: 'Patan',
          serviceNumber: 'NEW-101',
          olt: 'OLT-1',
          fdcName: 'FDC-1',
          fapName: 'FAP-1',
          serviceTypes: [WorkServiceType.DATA],
          ...createSchedule(),
          assignedTeamId: team.id,
          salesMemberAccountId: salesMember.id,
        },
      ),
    ).rejects.toThrow(
      'The Sales Member must not already belong to the assigned main team.',
    );
  });

  it('rejects Supporting Staff who already belongs to the assigned main team', async () => {
    const primary = createEmployeeAccount('team-admin');
    const supportMember = createEmployeeAccount('team-support');
    const team = createWorkTeam(primary);
    team.members.push({
      employee: {
        id: supportMember.employee.id,
        account: supportMember,
      },
    });
    const actor = {
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.resolveAssignableTeam).mockResolvedValue(team as never);
    jest.mocked(scope.resolveResponsibleManager).mockResolvedValue({
      id: actor.accountId,
    } as never);
    jest
      .mocked(scope.resolveSupportMembers)
      .mockResolvedValue([supportMember] as never);

    await expect(
      service.create(
        {
          accountId: actor.accountId,
          sessionId: 'session',
          username: 'manager@ntc.test',
          role: actor.role,
        },
        {
          type: WorkItemType.ROUTINE_TASK,
          customerName: 'Routine Customer',
          customerContactType: WorkContactType.MOBILE,
          customerContactNumber: '9841000000',
          locationText: 'Patan',
          serviceNumber: 'FTTH-101',
          olt: 'OLT-1',
          fdcName: 'FDC-1',
          fapName: 'FAP-1',
          ...createSchedule(),
          assignedTeamId: team.id,
          supportingAssigneeAccountIds: [supportMember.id],
        },
      ),
    ).rejects.toThrow(
      'Supporting Staff must not already belong to the assigned main team.',
    );
  });

  it('rejects a stale acknowledgement instead of overwriting a newer state', async () => {
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'ram',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    jest
      .mocked(transitions.getStatusAfterAcknowledgement)
      .mockReturnValue(WorkItemStatus.ACKNOWLEDGED);
    transaction.workItem.findUnique.mockResolvedValue({
      id: 'work-1',
      status: WorkItemStatus.ASSIGNED,
      version: 3,
      assignments: [
        {
          id: 'assignment-1',
          assignmentRole: WorkAssignmentRole.PRIMARY,
          acknowledgedAt: null,
        },
      ],
    });
    transaction.workAssignment.updateMany.mockResolvedValue({ count: 1 });
    transaction.workItem.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.acknowledge(
        {
          accountId: 'ram',
          sessionId: 'session',
          username: 'ram@ntc.test',
          role: AccountRole.EMPLOYEE,
        },
        'work-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns an account-scoped employee work dashboard summary', async () => {
    const actor = {
      accountId: 'ram',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.buildVisibleWorkWhere).mockReturnValue({
      assignments: {
        some: {
          assigneeAccountId: actor.accountId,
        },
      },
    });
    jest
      .mocked(prisma.workItem.count)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    jest.mocked(prisma.workHelpRequest.count).mockResolvedValue(1);
    jest.mocked(prisma.workItem.findMany).mockResolvedValue([
      {
        id: 'work-1',
        ticketNumber: 'NT-PAT-NET-2026-000001',
        title: 'Repair damaged wire',
        status: WorkItemStatus.IN_PROGRESS,
        priority: WorkPriority.HIGH,
      },
    ] as never);

    const result = await service.getEmployeeDashboardSummary({
      accountId: actor.accountId,
      sessionId: 'session',
      username: 'ram@ntc.test',
      role: actor.role,
    });

    expect(result.timezone).toBe('Asia/Kathmandu');
    expect(result.totals).toEqual(
      expect.objectContaining({
        active: 6,
        newWork: 2,
        waitingForManager: 1,
        overdue: 1,
        pendingHelpRequests: 1,
      }),
    );
    expect(result.nextWork).toHaveLength(1);
    expect(scope.buildVisibleWorkWhere).toHaveBeenCalledWith(actor);
  });

  it('allows only the active primary assignee to start global ticket work', async () => {
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'helper',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    transaction.workItem.findUnique.mockResolvedValue({
      id: 'work-1',
      status: WorkItemStatus.ACKNOWLEDGED,
      version: 1,
      assignments: [],
    });

    await expect(
      service.start(
        {
          accountId: 'helper',
          sessionId: 'session',
          username: 'helper@ntc.test',
          role: AccountRole.EMPLOYEE,
        },
        'work-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    ['Senior Management', AccountRole.SENIOR_MANAGEMENT, 'senior', null],
    ['Team Manager', AccountRole.TEAM_MANAGER, 'team-manager', 'department-a'],
  ] as const)(
    'allows a %s primary assignee to start assigned work',
    async (_label, role, accountId, departmentId) => {
      jest.mocked(scope.resolveActorContext).mockResolvedValue({
        accountId,
        role,
        divisionId: 'division-a',
        departmentId,
      });
      jest
        .mocked(transitions.getStatusAfterStart)
        .mockReturnValue(WorkItemStatus.IN_PROGRESS);
      transaction.workItem.findUnique.mockResolvedValue({
        id: 'work-1',
        status: WorkItemStatus.ACKNOWLEDGED,
        version: 1,
        archiveEligibleAt: null,
        assignments: [
          {
            id: 'assignment-1',
            acknowledgedAt: new Date(),
            startedAt: null,
          },
        ],
      });
      transaction.workAssignment.updateMany.mockResolvedValue({ count: 1 });
      transaction.workItem.updateMany.mockResolvedValue({ count: 1 });
      transaction.workItem.findUniqueOrThrow.mockResolvedValue({
        id: 'work-1',
        ticketNumber: 'NT-PAT-MGT-2026-000001',
        title: 'Management follow-up task',
        status: WorkItemStatus.IN_PROGRESS,
        createdBy: { id: 'assigner' },
        responsibleManager: { id: 'reviewer' },
        assignments: [{ assignee: { id: accountId } }],
      });

      const result = await service.start(
        {
          accountId,
          sessionId: 'session',
          username: `${accountId}@ntc.test`,
          role,
        },
        'work-1',
      );

      expect(transaction.workActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorAccountId: accountId,
            action: 'STARTED',
            toStatus: WorkItemStatus.IN_PROGRESS,
          }),
        }),
      );
      expect(result.workItem.status).toBe(WorkItemStatus.IN_PROGRESS);
    },
  );

  it('opens active assigned work by default for Employee accounts', async () => {
    const actor = {
      accountId: 'employee-account',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.buildVisibleWorkWhere).mockReturnValue({
      departmentId: 'department-a',
    });
    jest.mocked(prisma.workItem.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.workItem.count).mockResolvedValue(0);

    const result = await service.list(
      {
        accountId: actor.accountId,
        sessionId: 'session',
        username: 'employee@ntc.test',
        role: actor.role,
      },
      { page: 1, limit: 20 },
    );

    expect(result.queue.focus).toBe(WorkQueueFocus.ASSIGNED_TO_ME);
    expect(prisma.workItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            {
              OR: [
                {
                  assignments: {
                    some: {
                      assigneeAccountId: actor.accountId,
                      endedAt: null,
                    },
                  },
                },
                {
                  assignedTeam: {
                    is: {
                      members: {
                        some: {
                          employee: {
                            is: {
                              account: { is: { id: actor.accountId } },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                { salesMemberAccountId: actor.accountId },
              ],
            },
          ]),
        },
      }),
    );
  });

  it('keeps completed and cancelled Employee assignments in Work history', async () => {
    const actor = {
      accountId: 'employee-account',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.buildVisibleWorkWhere).mockReturnValue({
      departmentId: 'department-a',
    });
    jest.mocked(prisma.workItem.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.workItem.count).mockResolvedValue(0);

    const result = await service.list(
      {
        accountId: actor.accountId,
        sessionId: 'session',
        username: 'employee@ntc.test',
        role: actor.role,
      },
      {
        view: WorkQueueView.HISTORY,
        page: 1,
        limit: 20,
      },
    );

    expect(result.queue.focus).toBe(WorkQueueFocus.ASSIGNED_TO_ME);
    expect(prisma.workItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            {
              OR: [
                {
                  assignments: {
                    some: {
                      assigneeAccountId: actor.accountId,
                    },
                  },
                },
                {
                  assignedTeam: {
                    is: {
                      members: {
                        some: {
                          employee: {
                            is: {
                              account: { is: { id: actor.accountId } },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                { salesMemberAccountId: actor.accountId },
              ],
            },
          ]),
        },
      }),
    );
  });

  it('keeps Employee accounts on My Work even if another focus is requested', async () => {
    const actor = {
      accountId: 'employee-account',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.buildVisibleWorkWhere).mockReturnValue({
      departmentId: 'department-a',
    });
    jest.mocked(prisma.workItem.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.workItem.count).mockResolvedValue(0);

    const result = await service.list(
      {
        accountId: actor.accountId,
        sessionId: 'session',
        username: 'employee@ntc.test',
        role: actor.role,
      },
      {
        focus: WorkQueueFocus.CREATED_BY_ME,
        page: 1,
        limit: 20,
      },
    );

    expect(result.queue.focus).toBe(WorkQueueFocus.ASSIGNED_TO_ME);
    expect(prisma.workItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            {
              OR: [
                {
                  assignments: {
                    some: {
                      assigneeAccountId: actor.accountId,
                      endedAt: null,
                    },
                  },
                },
                {
                  assignedTeam: {
                    is: {
                      members: {
                        some: {
                          employee: {
                            is: {
                              account: { is: { id: actor.accountId } },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                { salesMemberAccountId: actor.accountId },
              ],
            },
          ]),
        },
      }),
    );
  });

  it('opens Created by Me as the default management queue', async () => {
    const actor = {
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.buildVisibleWorkWhere).mockReturnValue({
      departmentId: 'department-a',
    });
    jest.mocked(prisma.workItem.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.workItem.count).mockResolvedValue(0);

    const result = await service.list(
      {
        accountId: actor.accountId,
        sessionId: 'session',
        username: 'manager@ntc.test',
        role: actor.role,
      },
      { page: 1, limit: 20 },
    );

    expect(prisma.workItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            expect.objectContaining({
              status: {
                in: expect.arrayContaining([
                  WorkItemStatus.ASSIGNED,
                  WorkItemStatus.IN_PROGRESS,
                  WorkItemStatus.COMPLETED_PENDING_REVIEW,
                ]),
              },
            }),
          ]),
        },
      }),
    );
    expect(result.queue.view).toBe(WorkQueueView.ACTIVE);
    expect(result.queue.focus).toBe(WorkQueueFocus.CREATED_BY_ME);
    expect(prisma.workItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            { createdByAccountId: actor.accountId },
          ]),
        },
      }),
    );
  });

  it('uses the last 30 days as the default recent-history range', async () => {
    const actor = {
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.buildVisibleWorkWhere).mockReturnValue({
      departmentId: 'department-a',
    });
    jest.mocked(prisma.workItem.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.workItem.count).mockResolvedValue(0);

    const result = await service.list(
      {
        accountId: actor.accountId,
        sessionId: 'session',
        username: 'manager@ntc.test',
        role: actor.role,
      },
      {
        view: WorkQueueView.HISTORY,
        page: 1,
        limit: 20,
      },
    );

    expect(result.filters.historyFrom).toEqual(expect.any(String));
    expect(result.filters.historyTo).toEqual(expect.any(String));
    expect(result.queue.defaultHistoryDays).toBe(30);
    expect(prisma.workItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            expect.objectContaining({
              archiveEligibleAt: { gt: expect.any(Date) },
              status: {
                in: [WorkItemStatus.CLOSED, WorkItemStatus.CANCELLED],
              },
            }),
          ]),
        },
      }),
    );
  });

  it('applies management queue filters inside the existing organization scope', async () => {
    const actor = {
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.buildVisibleWorkWhere).mockReturnValue({
      departmentId: 'department-a',
    });
    jest.mocked(prisma.workItem.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.workItem.count).mockResolvedValue(0);

    await service.list(
      {
        accountId: actor.accountId,
        sessionId: 'session',
        username: 'manager@ntc.test',
        role: actor.role,
      },
      {
        page: 1,
        limit: 20,
        category: 'Cable',
        departmentId: 'department-a',
        assigneeAccountId: 'employee-1',
        dueFrom: '2026-07-20T00:00:00.000Z',
        dueTo: '2026-07-21T00:00:00.000Z',
        plannedFrom: '2026-07-20T00:00:00.000Z',
        plannedTo: '2026-07-20T23:59:59.999Z',
      },
    );

    expect(prisma.workItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            { departmentId: 'department-a' },
            {
              category: {
                contains: 'Cable',
                mode: 'insensitive',
              },
            },
            {
              assignments: {
                some: {
                  assigneeAccountId: 'employee-1',
                  endedAt: null,
                },
              },
            },
            {
              plannedStartAt: {
                gte: new Date('2026-07-20T00:00:00.000Z'),
                lte: new Date('2026-07-20T23:59:59.999Z'),
              },
            },
          ]),
        },
      }),
    );
  });

  it('keeps personal assignments out of the Senior Management division queue', async () => {
    const actor = {
      accountId: 'senior',
      role: AccountRole.SENIOR_MANAGEMENT,
      divisionId: 'division-a',
      departmentId: null,
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.buildVisibleWorkWhere).mockReturnValue({
      divisionId: 'division-a',
    });
    jest.mocked(prisma.workItem.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.workItem.count).mockResolvedValue(0);

    const result = await service.list(
      {
        accountId: actor.accountId,
        sessionId: 'session',
        username: 'senior@ntc.test',
        role: actor.role,
      },
      {
        page: 1,
        limit: 20,
        focus: WorkQueueFocus.ACTION_CENTER,
      },
    );

    expect(result.queue.focus).toBe(WorkQueueFocus.ACTION_CENTER);
    expect(prisma.workItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            expect.objectContaining({
              AND: expect.arrayContaining([
                expect.objectContaining({
                  NOT: {
                    assignments: {
                      some: {
                        assigneeAccountId: actor.accountId,
                      },
                    },
                  },
                }),
                expect.objectContaining({
                  OR: expect.arrayContaining([
                    { createdByAccountId: actor.accountId },
                    expect.objectContaining({
                      responsibleManagerAccountId: actor.accountId,
                    }),
                  ]),
                }),
              ]),
            }),
          ]),
        },
      }),
    );
  });

  it('rejects My Work for the Super Admin account', async () => {
    const actor = {
      accountId: 'super-admin',
      role: AccountRole.SUPER_ADMIN,
      divisionId: null,
      departmentId: null,
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.buildVisibleWorkWhere).mockReturnValue({});

    await expect(
      service.list(
        {
          accountId: actor.accountId,
          sessionId: 'session',
          username: 'super-admin@ntc.test',
          role: actor.role,
        },
        {
          focus: WorkQueueFocus.ASSIGNED_TO_ME,
          page: 1,
          limit: 20,
        },
      ),
    ).rejects.toThrow('My Work is not available to the Super Admin account.');

    expect(prisma.workItem.findMany).not.toHaveBeenCalled();
  });

  it('does not load the authorized explorer until a narrowing filter is supplied', async () => {
    const actor = {
      accountId: 'senior',
      role: AccountRole.SENIOR_MANAGEMENT,
      divisionId: 'division-a',
      departmentId: null,
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.buildVisibleWorkWhere).mockReturnValue({
      divisionId: 'division-a',
    });
    jest.mocked(prisma.workItem.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.workItem.count).mockResolvedValue(0);

    const result = await service.list(
      {
        accountId: actor.accountId,
        sessionId: 'session',
        username: 'senior@ntc.test',
        role: actor.role,
      },
      {
        focus: WorkQueueFocus.EXPLORER,
        page: 1,
        limit: 20,
      },
    );

    expect(result.queue.explorerRequiresFilter).toBe(true);
    expect(prisma.workItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            { id: '00000000-0000-0000-0000-000000000000' },
          ]),
        },
      }),
    );
  });

  it('summarizes linked child progress without loading child rows into the queue', async () => {
    const actor = {
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.buildVisibleWorkWhere).mockReturnValue({
      departmentId: 'department-a',
    });
    jest
      .mocked(prisma.workItem.findMany)
      .mockResolvedValue([{ id: 'parent-work' }] as never);
    jest.mocked(prisma.workItem.count).mockResolvedValue(0);
    jest.mocked(prisma.workItem.groupBy).mockResolvedValue([
      {
        parentWorkItemId: 'parent-work',
        status: WorkItemStatus.CLOSED,
        _count: { _all: 2 },
      },
      {
        parentWorkItemId: 'parent-work',
        status: WorkItemStatus.IN_PROGRESS,
        _count: { _all: 1 },
      },
    ] as never);

    const result = await service.list(
      {
        accountId: actor.accountId,
        sessionId: 'session',
        username: 'manager@ntc.test',
        role: actor.role,
      },
      { page: 1, limit: 20 },
    );

    expect(prisma.workItem.groupBy).toHaveBeenCalledWith({
      by: ['parentWorkItemId', 'status'],
      where: { parentWorkItemId: { in: ['parent-work'] } },
      _count: { _all: true },
    });
    expect(result.data[0]?.delegationProgress).toEqual({
      total: 3,
      completed: 2,
      inProgress: 1,
      awaitingReview: 0,
      notStarted: 0,
      cancelled: 0,
      completionPercentage: 67,
    });
  });

  it('returns the full team assignment chain for professional tracking', async () => {
    const actor = {
      accountId: 'super-admin',
      role: AccountRole.SUPER_ADMIN,
      divisionId: null,
      departmentId: null,
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.buildVisibleWorkWhere).mockReturnValue({});
    jest.mocked(prisma.workItem.findFirst).mockResolvedValue({
      id: 'root-work',
      childWorkItems: [],
    } as never);
    jest
      .mocked(prisma.workItem.findMany)
      .mockResolvedValueOnce([
        {
          id: 'senior-work',
          parentWorkItemId: 'root-work',
          ticketNumber: 'TEAM-1',
          title: 'Team part one',
          description:
            'Main task.\n\nTeam instructions:\nCheck cabinet readings.',
          status: WorkItemStatus.IN_PROGRESS,
          priority: WorkPriority.HIGH,
          dueAt: new Date(Date.now() - 60_000),
          createdAt: new Date(),
          completedAt: null,
          closedAt: null,
          cancelledAt: null,
          assignments: [
            {
              assignee: { id: 'senior' },
              assignedBy: { id: 'super-admin' },
            },
          ],
          completionReports: [],
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: 'employee-work',
          parentWorkItemId: 'senior-work',
          ticketNumber: 'TEAM-2',
          title: 'Team part two',
          description:
            'Main task.\n\nTeam instructions:\nReplace the damaged drop wire.',
          status: WorkItemStatus.CLOSED,
          priority: WorkPriority.NORMAL,
          dueAt: new Date(Date.now() + 60_000),
          createdAt: new Date(),
          completedAt: new Date(),
          closedAt: new Date(),
          cancelledAt: null,
          assignments: [
            {
              assignee: { id: 'employee' },
              assignedBy: { id: 'senior' },
            },
          ],
          completionReports: [{ summary: 'Completed and checked.' }],
        },
      ] as never)
      .mockResolvedValueOnce([] as never);

    const result = await service.getById(
      {
        accountId: actor.accountId,
        sessionId: 'session',
        username: 'super-admin@ntc.test',
        role: actor.role,
      },
      'root-work',
    );

    expect(result.workItem.teamWork).toEqual(
      expect.objectContaining({
        total: 2,
        completed: 1,
        inProgress: 1,
        overdue: 1,
        members: expect.arrayContaining([
          expect.objectContaining({
            id: 'senior-work',
            depth: 1,
            isOverdue: true,
            instructions: 'Check cabinet readings.',
          }),
          expect.objectContaining({ id: 'employee-work', depth: 2 }),
        ]),
      }),
    );
  });

  it('returns accurate delegation progress on a selected parent responsibility', async () => {
    const actor = {
      accountId: 'senior',
      role: AccountRole.SENIOR_MANAGEMENT,
      divisionId: 'division-a',
      departmentId: null,
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.buildVisibleWorkWhere).mockReturnValue({
      divisionId: 'division-a',
    });
    jest.mocked(prisma.workItem.findFirst).mockResolvedValue({
      id: 'parent-work',
      childWorkItems: [],
    } as never);
    jest.mocked(prisma.workItem.groupBy).mockResolvedValue([
      {
        parentWorkItemId: 'parent-work',
        status: WorkItemStatus.COMPLETED_PENDING_REVIEW,
        _count: { _all: 1 },
      },
      {
        parentWorkItemId: 'parent-work',
        status: WorkItemStatus.ASSIGNED,
        _count: { _all: 1 },
      },
    ] as never);

    const result = await service.getById(
      {
        accountId: actor.accountId,
        sessionId: 'session',
        username: 'senior@ntc.test',
        role: actor.role,
      },
      'parent-work',
    );

    expect(result.workItem.delegationProgress).toEqual(
      expect.objectContaining({
        total: 2,
        awaitingReview: 1,
        notStarted: 1,
        completionPercentage: 0,
      }),
    );
  });
});
