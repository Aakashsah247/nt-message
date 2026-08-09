import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  DutyActivityAction,
  DutyAssignmentAuthority,
  DutyRecurrenceType,
} from '../generated/prisma/enums';
import { DutyAssignmentListView } from './dto/list-duty-assignments-query.dto';
import { DutyScheduleService } from './duty-schedule.service';
import type { DutyNotificationsService } from './duty-notifications.service';
import type { WorkScopeService } from './work-scope.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

const managerUser = {
  accountId: 'manager',
  sessionId: 'session',
  username: 'manager@ntc.test',
  role: AccountRole.TEAM_MANAGER,
};

function actor(role: AccountRole = AccountRole.TEAM_MANAGER) {
  return {
    accountId: 'manager',
    role,
    divisionId: 'division-a',
    departmentId: role === AccountRole.TEAM_MANAGER ? 'department-a' : null,
  };
}

describe('DutyScheduleService M20 Phase 5', () => {
  const transaction = {
    dutyShiftTemplate: { delete: jest.fn() },
    dutyScheduleSeries: { create: jest.fn(), updateMany: jest.fn() },
    dutyAssignment: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    dutyActivity: { create: jest.fn(), createMany: jest.fn() },
    dutyException: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(),
    dutyShiftTemplate: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    dutyAssignment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    dutyScheduleSeries: { count: jest.fn() },
    dutyCoverageRequirement: { count: jest.fn() },
    dutyException: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    department: { findFirst: jest.fn(), findMany: jest.fn() },
    account: { findMany: jest.fn() },
    managementAssignment: { findMany: jest.fn() },
  } as unknown as PrismaService;
  const scope = {
    resolveActorContext: jest.fn(),
    assertCanManageWork: jest.fn(),
    resolveAssignableAccounts: jest.fn(),
    resolveResponsibleManager: jest.fn(),
  } as unknown as WorkScopeService;
  const notifications = {
    publishDutyUpdate: jest.fn(),
  } as unknown as DutyNotificationsService;
  const service = new DutyScheduleService(prisma, scope, notifications);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor());
    jest.mocked(prisma.dutyAssignment.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.dutyException.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.dutyAssignment.count).mockResolvedValue(0);
    jest.mocked(prisma.dutyScheduleSeries.count).mockResolvedValue(0);
    jest.mocked(prisma.dutyCoverageRequirement.count).mockResolvedValue(0);
    jest
      .mocked(prisma.managementAssignment.findMany)
      .mockResolvedValue([] as never);
    jest
      .mocked(prisma.$transaction)
      .mockImplementation(async (callback: unknown) =>
        (callback as (client: typeof transaction) => Promise<unknown>)(
          transaction,
        ) as never,
      );
  });

  it('creates an overnight shift template inside the manager scope', async () => {
    jest.mocked(prisma.dutyShiftTemplate.findFirst).mockResolvedValue(null);
    jest.mocked(prisma.dutyShiftTemplate.create).mockResolvedValue({
      id: 'shift-1',
      name: 'Night Shift',
      startMinute: 22 * 60,
      endMinute: 6 * 60,
      spansNextDay: true,
      isActive: true,
      divisionId: 'division-a',
      departmentId: 'department-a',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await service.createShiftTemplate(managerUser, {
      name: 'Night Shift',
      startTime: '22:00',
      endTime: '06:00',
    });

    expect(prisma.dutyShiftTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          spansNextDay: true,
          departmentId: 'department-a',
        }),
      }),
    );
    expect(result.template.startTime).toBe('22:00');
  });

  it('deletes a shift that has never been used', async () => {
    jest.mocked(prisma.dutyShiftTemplate.findFirst).mockResolvedValue({
      id: 'shift-unused',
      name: 'Temporary Shift',
      startMinute: 9 * 60,
      endMinute: 17 * 60,
      spansNextDay: false,
      isActive: true,
      divisionId: 'division-a',
      departmentId: 'department-a',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await service.deleteShiftTemplate(
      managerUser,
      'shift-unused',
    );

    expect(transaction.dutyShiftTemplate.delete).toHaveBeenCalledWith({
      where: { id: 'shift-unused' },
    });
    expect(result.message).toContain('deleted successfully');
  });

  it('blocks deleting a shift used by a current or upcoming duty', async () => {
    jest.mocked(prisma.dutyShiftTemplate.findFirst).mockResolvedValue({
      id: 'shift-used',
      name: 'Outside',
      startMinute: 9 * 60,
      endMinute: 17 * 60,
      spansNextDay: false,
      isActive: true,
      divisionId: 'division-a',
      departmentId: 'department-a',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    jest.mocked(prisma.dutyAssignment.count).mockResolvedValueOnce(1);

    await expect(
      service.deleteShiftTemplate(managerUser, 'shift-used'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.dutyShiftTemplate.delete).not.toHaveBeenCalled();
  });

  it('deletes a shift that is used only by past duty records', async () => {
    jest.mocked(prisma.dutyShiftTemplate.findFirst).mockResolvedValue({
      id: 'shift-past',
      name: 'Old Morning Shift',
      startMinute: 8 * 60,
      endMinute: 16 * 60,
      spansNextDay: false,
      isActive: true,
      divisionId: 'division-a',
      departmentId: 'department-a',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    jest.mocked(prisma.dutyAssignment.count).mockResolvedValue(0);
    jest.mocked(prisma.dutyCoverageRequirement.count).mockResolvedValue(0);

    await service.deleteShiftTemplate(managerUser, 'shift-past');

    expect(prisma.dutyAssignment.count).toHaveBeenCalledWith({
      where: {
        shiftTemplateId: 'shift-past',
        cancelledAt: null,
        endsAt: { gte: expect.any(Date) },
      },
    });
    expect(transaction.dutyScheduleSeries.updateMany).toHaveBeenCalledWith({
      where: { shiftTemplateId: 'shift-past' },
      data: {
        shiftName: 'Old Morning Shift',
        shiftStartMinute: 8 * 60,
        shiftEndMinute: 16 * 60,
        shiftSpansNextDay: false,
      },
    });
    expect(transaction.dutyAssignment.updateMany).toHaveBeenCalledWith({
      where: { shiftTemplateId: 'shift-past' },
      data: expect.objectContaining({ shiftName: 'Old Morning Shift' }),
    });
    expect(transaction.dutyShiftTemplate.delete).toHaveBeenCalledWith({
      where: { id: 'shift-past' },
    });
  });

  it('rejects a schedule that overlaps an existing duty assignment', async () => {
    jest.mocked(scope.resolveAssignableAccounts).mockResolvedValue([
      {
        id: 'employee',
        role: AccountRole.EMPLOYEE,
        employee: {
          divisionId: 'division-a',
          departmentId: 'department-a',
        },
      },
    ] as never);
    jest.mocked(scope.resolveResponsibleManager).mockResolvedValue({
      id: 'manager',
    } as never);
    jest.mocked(prisma.dutyShiftTemplate.findFirst).mockResolvedValue({
      id: 'shift-1',
      name: 'Office Shift',
      startMinute: 9 * 60,
      endMinute: 18 * 60,
      spansNextDay: false,
      isActive: true,
      divisionId: 'division-a',
      departmentId: 'department-a',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    jest.mocked(prisma.dutyAssignment.findMany).mockResolvedValue([
      {
        id: 'existing-duty',
        startsAt: new Date('2026-07-20T03:15:00.000Z'),
        endsAt: new Date('2026-07-20T12:15:00.000Z'),
      },
    ] as never);

    await expect(
      service.createSchedule(managerUser, {
        employeeAccountId: 'employee',
        shiftTemplateId: 'shift-1',
        supervisorAccountId: 'manager',
        recurrenceType: DutyRecurrenceType.ONE_TIME,
        startDate: '2026-07-20',
        reportingLocation: 'Patan Branch',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('prevents senior management from filtering another division department', async () => {
    jest.mocked(scope.resolveActorContext).mockResolvedValue(
      actor(AccountRole.SENIOR_MANAGEMENT),
    );
    jest.mocked(prisma.department.findFirst).mockResolvedValue(null);

    await expect(
      service.listAssignments(
        { ...managerUser, role: AccountRole.SENIOR_MANAGEMENT },
        {
          departmentId: 'department-outside',
          page: 1,
          limit: 25,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('previews a bulk weekly schedule without writing conflicting rows', async () => {
    jest.mocked(scope.resolveAssignableAccounts).mockResolvedValue([
      {
        id: 'employee-a',
        role: AccountRole.EMPLOYEE,
        username: 'employee-a',
        employee: {
          id: 'record-a',
          empId: 'NTC-A',
          empName: 'Employee A',
          designation: 'Technician',
          divisionId: 'division-a',
          departmentId: 'department-a',
        },
      },
      {
        id: 'employee-b',
        role: AccountRole.EMPLOYEE,
        username: 'employee-b',
        employee: {
          id: 'record-b',
          empId: 'NTC-B',
          empName: 'Employee B',
          designation: 'Technician',
          divisionId: 'division-a',
          departmentId: 'department-a',
        },
      },
    ] as never);
    jest.mocked(scope.resolveResponsibleManager).mockResolvedValue({
      id: 'manager',
    } as never);
    jest.mocked(prisma.dutyShiftTemplate.findFirst).mockResolvedValue({
      id: 'shift-1',
      name: 'Office Shift',
      startMinute: 9 * 60,
      endMinute: 18 * 60,
      spansNextDay: false,
      isActive: true,
      divisionId: 'division-a',
      departmentId: 'department-a',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    jest.mocked(prisma.dutyAssignment.findMany).mockResolvedValue([
      {
        id: 'existing',
        employeeAccountId: 'employee-a',
        startsAt: new Date('2026-07-20T03:15:00.000Z'),
        endsAt: new Date('2026-07-20T12:15:00.000Z'),
      },
    ] as never);
    jest.mocked(prisma.dutyException.findMany).mockResolvedValue([] as never);

    const result = await service.previewBulkSchedule(managerUser, {
      employeeAccountIds: ['employee-a', 'employee-b'],
      shiftTemplateId: 'shift-1',
      supervisorAccountId: 'manager',
      recurrenceType: DutyRecurrenceType.ONE_TIME,
      startDate: '2026-07-20',
      reportingLocation: 'Patan Branch',
    });

    expect(result.requestedAssignments).toBe(2);
    expect(result.validAssignments).toBe(1);
    expect(result.conflictAssignments).toBe(1);
    expect(result.reportingLocation).toBe('Patan Branch');
    expect(result.dates).toEqual(['2026-07-20']);
    expect(result.people).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          account: expect.objectContaining({ id: 'employee-a' }),
          result: 'BLOCKED',
          supervisor: expect.objectContaining({ id: 'manager' }),
        }),
        expect.objectContaining({
          account: expect.objectContaining({ id: 'employee-b' }),
          result: 'READY',
          supervisor: expect.objectContaining({ id: 'manager' }),
        }),
      ]),
    );
    expect(transaction.dutyAssignment.create).not.toHaveBeenCalled();
  });

  it('allows Super Admin to plan division-level duty for Senior Management', async () => {
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'super-admin',
      role: AccountRole.SUPER_ADMIN,
      divisionId: null,
      departmentId: null,
    });
    jest.mocked(scope.resolveAssignableAccounts).mockResolvedValue([
      {
        id: 'senior',
        role: AccountRole.SENIOR_MANAGEMENT,
        username: 'senior',
        employee: {
          id: 'employee-senior',
          empId: 'NTC-SM',
          empName: 'Senior Manager',
          designation: 'Division Head',
          divisionId: 'division-a',
          departmentId: null,
        },
      },
    ] as never);
    jest.mocked(scope.resolveResponsibleManager).mockResolvedValue({
      id: 'super-admin',
    } as never);
    jest.mocked(prisma.dutyShiftTemplate.findFirst).mockResolvedValue({
      id: 'shift-branch',
      name: 'Division On-call',
      startMinute: 9 * 60,
      endMinute: 18 * 60,
      spansNextDay: false,
      isActive: true,
      divisionId: null,
      departmentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    jest.mocked(prisma.dutyAssignment.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.dutyException.findMany).mockResolvedValue([] as never);

    const result = await service.previewBulkSchedule(
      {
        ...managerUser,
        accountId: 'super-admin',
        role: AccountRole.SUPER_ADMIN,
      },
      {
        employeeAccountIds: ['senior'],
        shiftTemplateId: 'shift-branch',
        recurrenceType: DutyRecurrenceType.ONE_TIME,
        startDate: '2026-07-20',
        reportingLocation: 'Patan Branch',
      },
    );

    expect(result.validAssignments).toBe(1);
    expect(result.people[0]?.account.role).toBe(AccountRole.SENIOR_MANAGEMENT);
  });

  it('requires a reason when Super Admin assigns below the normal duty hierarchy', async () => {
    const superUser = {
      ...managerUser,
      accountId: 'super-admin',
      role: AccountRole.SUPER_ADMIN,
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'super-admin',
      role: AccountRole.SUPER_ADMIN,
      divisionId: null,
      departmentId: null,
    });
    jest.mocked(scope.resolveAssignableAccounts).mockResolvedValue([
      {
        id: 'employee',
        role: AccountRole.EMPLOYEE,
        employee: {
          divisionId: 'division-a',
          departmentId: 'department-a',
        },
      },
    ] as never);
    jest.mocked(scope.resolveResponsibleManager).mockResolvedValue({
      id: 'team-manager',
    } as never);
    jest.mocked(prisma.dutyShiftTemplate.findFirst).mockResolvedValue({
      id: 'shift-1',
      name: 'Emergency Shift',
      startMinute: 9 * 60,
      endMinute: 18 * 60,
      spansNextDay: false,
      isActive: true,
      divisionId: null,
      departmentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    await expect(
      service.createSchedule(superUser, {
        employeeAccountId: 'employee',
        shiftTemplateId: 'shift-1',
        supervisorAccountId: 'team-manager',
        recurrenceType: DutyRecurrenceType.ONE_TIME,
        startDate: '2026-07-20',
        reportingLocation: 'Patan Branch',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('audits and notifies the management chain for a Super Admin conflict override', async () => {
    const superUser = {
      ...managerUser,
      accountId: 'super-admin',
      role: AccountRole.SUPER_ADMIN,
    };
    const employee = {
      id: 'employee',
      role: AccountRole.EMPLOYEE,
      username: 'employee@ntc.test',
      employee: {
        id: 'employee-record',
        empId: 'NTC-1001',
        empName: 'Ram Employee',
        designation: 'Technician',
        divisionId: 'division-a',
        departmentId: 'department-a',
      },
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'super-admin',
      role: AccountRole.SUPER_ADMIN,
      divisionId: null,
      departmentId: null,
    });
    jest.mocked(scope.resolveAssignableAccounts).mockResolvedValue([
      employee,
    ] as never);
    jest.mocked(scope.resolveResponsibleManager).mockResolvedValue({
      id: 'team-manager',
    } as never);
    jest.mocked(prisma.dutyShiftTemplate.findFirst).mockResolvedValue({
      id: 'shift-1',
      name: 'Emergency Night Shift',
      startMinute: 22 * 60,
      endMinute: 6 * 60,
      spansNextDay: true,
      isActive: true,
      divisionId: null,
      departmentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    jest.mocked(prisma.dutyAssignment.findMany).mockResolvedValue([
      {
        id: 'existing-duty',
        startsAt: new Date('2026-07-20T15:00:00.000Z'),
        endsAt: new Date('2026-07-21T02:00:00.000Z'),
      },
    ] as never);
    jest.mocked(prisma.managementAssignment.findMany).mockResolvedValue([
      { employee: { account: { id: 'team-manager' } } },
      { employee: { account: { id: 'senior-manager' } } },
    ] as never);
    jest.mocked(transaction.dutyScheduleSeries.create).mockResolvedValue({
      id: 'series-1',
    } as never);
    jest
      .mocked(transaction.dutyAssignment.create)
      .mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        id: 'assignment-1',
        createdAt: new Date('2026-07-19T00:00:00.000Z'),
        updatedAt: new Date('2026-07-19T00:00:00.000Z'),
        cancelledAt: null,
        cancellationReason: null,
        employee,
        supervisor: {
          id: 'team-manager',
          role: AccountRole.TEAM_MANAGER,
          username: 'manager@ntc.test',
          employee: null,
        },
        createdBy: {
          id: 'super-admin',
          role: AccountRole.SUPER_ADMIN,
          username: 'admin@ntc.test',
          employee: null,
        },
        shift: {
          id: 'shift-1',
          name: 'Emergency Night Shift',
          startMinute: 22 * 60,
          endMinute: 6 * 60,
          spansNextDay: true,
          isActive: true,
          divisionId: null,
          departmentId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        division: { id: 'division-a', code: 'DIV-A', name: 'Division A' },
        department: {
          id: 'department-a',
          code: 'DEP-A',
          name: 'Department A',
        },
      }) as never);

    const result = await service.createSchedule(superUser, {
      employeeAccountId: 'employee',
      shiftTemplateId: 'shift-1',
      supervisorAccountId: 'team-manager',
      recurrenceType: DutyRecurrenceType.ONE_TIME,
      startDate: '2026-07-20',
      reportingLocation: 'Patan Branch',
      overrideConflicts: true,
      overrideReason: 'Branch-wide service outage coverage',
    });

    expect(transaction.dutyScheduleSeries.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authority: DutyAssignmentAuthority.SUPER_ADMIN_OVERRIDE,
          hierarchyOverride: true,
          conflictOverride: true,
          overrideReason: 'Branch-wide service outage coverage',
          shiftName: 'Emergency Night Shift',
          shiftStartMinute: 22 * 60,
          shiftEndMinute: 6 * 60,
          shiftSpansNextDay: true,
        }),
      }),
    );
    expect(transaction.dutyAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shiftName: 'Emergency Night Shift',
          shiftStartMinute: 22 * 60,
          shiftEndMinute: 6 * 60,
          shiftSpansNextDay: true,
        }),
      }),
    );
    expect(transaction.dutyActivity.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            action: DutyActivityAction.OVERRIDE_ASSIGNED,
            details: expect.objectContaining({
              existingAssignmentId: 'existing-duty',
              conflictOverride: true,
              overrideReason: 'Branch-wide service outage coverage',
            }),
          }),
        ],
      }),
    );
    expect(transaction.dutyAssignment.update).not.toHaveBeenCalled();
    expect(notifications.publishDutyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientAccountIds: expect.arrayContaining([
          'employee',
          'team-manager',
          'senior-manager',
        ]),
        title: 'Duty assigned by Super Admin',
        metadata: expect.objectContaining({
          authority: DutyAssignmentAuthority.SUPER_ADMIN_OVERRIDE,
          hierarchyOverride: true,
          conflictOverride: true,
        }),
      }),
    );
    expect(result.governance.conflictOverride).toBe(true);
  });

  it('prevents a Team Manager from requesting conflict override mode', async () => {
    await expect(
      service.previewBulkSchedule(managerUser, {
        employeeAccountIds: ['employee'],
        shiftTemplateId: 'shift-1',
        recurrenceType: DutyRecurrenceType.ONE_TIME,
        startDate: '2026-07-20',
        reportingLocation: 'Patan Branch',
        overrideConflicts: true,
        overrideReason: 'Emergency staffing requirement',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('filters Senior Management oversight to Team Manager duty', async () => {
    jest.mocked(scope.resolveActorContext).mockResolvedValue(
      actor(AccountRole.SENIOR_MANAGEMENT),
    );
    jest.mocked(prisma.dutyAssignment.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.dutyAssignment.count).mockResolvedValue(0);

    await service.listAssignments(
      { ...managerUser, role: AccountRole.SENIOR_MANAGEMENT },
      {
        view: DutyAssignmentListView.MANAGEMENT_DUTIES,
        page: 1,
        limit: 25,
      },
    );

    expect(prisma.dutyAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employee: { is: { role: AccountRole.TEAM_MANAGER } },
        }),
      }),
    );
  });

  it('filters Assigned by Me by the authenticated creator account', async () => {
    jest.mocked(prisma.dutyAssignment.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.dutyAssignment.count).mockResolvedValue(0);

    await service.listAssignments(managerUser, {
      view: DutyAssignmentListView.ASSIGNED_BY_ME,
      page: 1,
      limit: 25,
    });

    expect(prisma.dutyAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdByAccountId: 'manager',
        }),
      }),
    );
  });

  it('prevents lower management from cancelling a Super Admin override', async () => {
    jest.mocked(prisma.dutyAssignment.findFirst).mockResolvedValue({
      id: 'override-assignment',
      cancelledAt: null,
      authority: DutyAssignmentAuthority.SUPER_ADMIN_OVERRIDE,
    } as never);

    await expect(
      service.cancelAssignment(managerUser, 'override-assignment', {
        reason: 'Routine team roster adjustment',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
