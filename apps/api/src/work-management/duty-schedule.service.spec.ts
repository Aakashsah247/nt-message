import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  AccountRole,
  DutyAssignmentAuthority,
  DutyRecurrenceType,
} from '../generated/prisma/enums';
import { DutyShiftScope } from './dto/create-duty-shift-template.dto';
import { DutyAssignmentListView } from './dto/list-duty-assignments-query.dto';
import { DutyScheduleService } from './duty-schedule.service';
import type { DutyNotificationsService } from './duty-notifications.service';
import type { DutyScopeV3Service } from './duty-scope-v3.service';
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
  accountClass: AccountClass.OFFICE_USER,
  role: AccountRole.EMPLOYEE,
};

function actor(role: AccountRole = AccountRole.EMPLOYEE) {
  return {
    accountId: 'manager',
    role,
    accountClass: role === AccountRole.SUPER_ADMIN ? AccountClass.SUPER_ADMIN : AccountClass.OFFICE_USER,
    officeId: role === AccountRole.SUPER_ADMIN ? null : 'office-1',
    primaryOrgUnitId: role === AccountRole.SUPER_ADMIN ? null : 'org-unit-a',
    visibleOrgUnitIds: role === AccountRole.SUPER_ADMIN ? [] : ['org-unit-a'],
    assignableOrgUnitIds: role === AccountRole.SUPER_ADMIN ? [] : ['org-unit-a'],
    operationalTeamLeadIds: [],
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
    dutyHoliday: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    dutyWeeklyOffSetting: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    orgUnit: { findFirst: jest.fn() },
    account: { findMany: jest.fn() },
  } as unknown as PrismaService;
  const scope = {
    resolveActorContext: jest.fn(),
    assertCanManageWork: jest.fn(),
  } as unknown as WorkScopeService;
  const notifications = {
    publishDutyUpdate: jest.fn(),
  } as unknown as DutyNotificationsService;
  const dutyScope = {
    resolveAssignableAccounts: jest.fn(),
    resolveSupervisor: jest.fn(),
    rosterAccountIds: jest.fn(),
    visibleAssignmentWhere: jest.fn(),
    visibleExceptionWhere: jest.fn(),
    managementDutyAccountIds: jest.fn(),
    notificationRecipientIds: jest.fn(),
  } as unknown as DutyScopeV3Service;
  const service = new DutyScheduleService(prisma, scope, notifications, dutyScope);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor());
    jest
      .mocked(dutyScope.resolveAssignableAccounts)
      .mockResolvedValue([] as never);
    jest.mocked(dutyScope.resolveSupervisor).mockResolvedValue({
      id: 'manager',
      role: AccountRole.EMPLOYEE,
      username: 'manager',
      superAdminProfile: null,
      employee: null,
      officeId: 'office-1',
      orgUnitId: 'org-unit-a',
      operationalTeamIds: [],
    } as never);
    jest.mocked(dutyScope.rosterAccountIds).mockResolvedValue([]);
    jest.mocked(dutyScope.visibleAssignmentWhere).mockResolvedValue({});
    jest.mocked(dutyScope.visibleExceptionWhere).mockResolvedValue({});
    jest.mocked(dutyScope.managementDutyAccountIds).mockResolvedValue([]);
    jest
      .mocked(dutyScope.notificationRecipientIds)
      .mockImplementation(async ({ assigneeAccountId, supervisorAccountId }) => [
        assigneeAccountId,
        supervisorAccountId,
      ]);
    jest.mocked(prisma.dutyAssignment.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.dutyException.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.dutyHoliday.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.dutyWeeklyOffSetting.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.dutyWeeklyOffSetting.findUnique).mockResolvedValue(null as never);
    jest.mocked(prisma.dutyAssignment.count).mockResolvedValue(0);
    jest.mocked(prisma.dutyScheduleSeries.count).mockResolvedValue(0);
    jest.mocked(prisma.dutyCoverageRequirement.count).mockResolvedValue(0);
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
    jest.mocked(prisma.orgUnit.findFirst).mockResolvedValue({ id: 'org-unit-a' } as never);
    jest.mocked(prisma.dutyShiftTemplate.create).mockResolvedValue({
      id: 'shift-1',
      name: 'Night Shift',
      startMinute: 22 * 60,
      endMinute: 6 * 60,
      spansNextDay: true,
      isActive: true,
      officeId: 'office-1',
      orgUnitId: 'org-unit-a',
      office: { id: 'office-1', code: 'PATAN', name: 'Patan' },
      orgUnit: { id: 'org-unit-a', code: 'TECH', name: 'Technical', officeId: 'office-1' },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await service.createShiftTemplate(managerUser, {
      name: 'Night Shift',
      startTime: '22:00',
      endTime: '06:00',
      scope: DutyShiftScope.ORG_UNIT,
      orgUnitId: 'org-unit-a',
    });

    expect(prisma.dutyShiftTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          spansNextDay: true,
          officeId: 'office-1',
          orgUnitId: 'org-unit-a',
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
      officeId: 'office-1',
      orgUnitId: 'org-unit-a',
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
      officeId: 'office-1',
      orgUnitId: 'org-unit-a',
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
      officeId: 'office-1',
      orgUnitId: 'org-unit-a',
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
    jest.mocked(dutyScope.resolveAssignableAccounts).mockResolvedValue([
      {
        id: 'employee',
        role: AccountRole.EMPLOYEE,
        employee: {},
        officeId: 'office-1',
        orgUnitId: 'org-unit-a',
        operationalTeamIds: [],
      },
    ] as never);
    jest.mocked(prisma.dutyShiftTemplate.findFirst).mockResolvedValue({
      id: 'shift-1',
      name: 'Office Shift',
      startMinute: 9 * 60,
      endMinute: 18 * 60,
      spansNextDay: false,
      isActive: true,
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

  it('lists assignments through V3 OrgUnit scope without legacy department filters', async () => {
    await expect(
      service.listAssignments(
        { ...managerUser, role: AccountRole.EMPLOYEE },
        {
          orgUnitId: 'org-unit-a',
          page: 1,
          limit: 25,
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        filters: expect.objectContaining({ orgUnitId: 'org-unit-a' }),
      }),
    );

  });

  it('previews a bulk weekly schedule without writing conflicting rows', async () => {
    jest.mocked(dutyScope.resolveAssignableAccounts).mockResolvedValue([
      {
        id: 'employee-a',
        role: AccountRole.EMPLOYEE,
        username: 'employee-a',
        employee: {
          id: 'record-a',
          empId: 'NTC-A',
          empName: 'Employee A',
          designation: 'Technician',
        },
        officeId: 'office-1',
        orgUnitId: 'org-unit-a',
        operationalTeamIds: [],
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
        },
        officeId: 'office-1',
        orgUnitId: 'org-unit-a',
        operationalTeamIds: [],
      },
    ] as never);
    jest.mocked(prisma.dutyShiftTemplate.findFirst).mockResolvedValue({
      id: 'shift-1',
      name: 'Office Shift',
      startMinute: 9 * 60,
      endMinute: 18 * 60,
      spansNextDay: false,
      isActive: true,
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

  it('keeps Super Admin read-only when previewing division-level duty', async () => {
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'super-admin',
      role: AccountRole.SUPER_ADMIN,
    });
    jest.mocked(dutyScope.resolveAssignableAccounts).mockResolvedValue([
      {
        id: 'senior',
        role: AccountRole.EMPLOYEE,
        username: 'senior',
        employee: {
          id: 'employee-senior',
          empId: 'NTC-SM',
          empName: 'Senior Manager',
          designation: 'Division Head',
        },
        officeId: 'office-1',
        orgUnitId: 'org-unit-a',
        operationalTeamIds: [],
      },
    ] as never);
    jest.mocked(prisma.dutyShiftTemplate.findFirst).mockResolvedValue({
      id: 'shift-branch',
      name: 'Division On-call',
      startMinute: 9 * 60,
      endMinute: 18 * 60,
      spansNextDay: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    jest.mocked(prisma.dutyAssignment.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.dutyException.findMany).mockResolvedValue([] as never);

    await expect(
      service.previewBulkSchedule(
        {
          ...managerUser,
          accountId: 'super-admin',
          accountClass: AccountClass.SUPER_ADMIN,
          role: AccountRole.SUPER_ADMIN,
        },
        {
          employeeAccountIds: ['senior'],
          shiftTemplateId: 'shift-branch',
          recurrenceType: DutyRecurrenceType.ONE_TIME,
          startDate: '2026-07-20',
          reportingLocation: 'Patan Branch',
        },
      ),
    ).rejects.toThrow(
      'Super Admin has read-only Duty oversight and cannot perform operational Duty actions.',
    );
    expect(dutyScope.resolveAssignableAccounts).not.toHaveBeenCalled();
  });

  it('denies Super Admin assignment to lower staff', async () => {
    const superUser = {
      ...managerUser,
      accountId: 'super-admin',
      accountClass: AccountClass.SUPER_ADMIN,
      role: AccountRole.SUPER_ADMIN,
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'super-admin',
      role: AccountRole.SUPER_ADMIN,
    });
    jest.mocked(dutyScope.resolveAssignableAccounts).mockResolvedValue([
      {
        id: 'employee',
        role: AccountRole.EMPLOYEE,
        username: 'employee',
        superAdminProfile: null,
        employee: {
          id: 'employee-record',
          empId: 'NTC-1001',
          empName: 'Employee One',
          designation: 'Technician',
        },
        officeId: 'office-1',
        orgUnitId: 'org-unit-a',
        operationalTeamIds: [],
      },
    ] as never);
    jest.mocked(prisma.dutyShiftTemplate.findFirst).mockResolvedValue({
      id: 'shift-1',
      name: 'Branch Shift',
      startMinute: 9 * 60,
      endMinute: 17 * 60,
      spansNextDay: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    await expect(
      service.previewBulkSchedule(superUser, {
        employeeAccountIds: ['employee'],
        shiftTemplateId: 'shift-1',
        recurrenceType: DutyRecurrenceType.ONE_TIME,
        startDate: '2026-07-20',
        reportingLocation: 'Patan Branch',
      }),
    ).rejects.toThrow(
      'Super Admin has read-only Duty oversight and cannot perform operational Duty actions.',
    );
    expect(dutyScope.resolveAssignableAccounts).not.toHaveBeenCalled();
  });

  it('shows a holiday as a warning without blocking operational duty', async () => {
    jest.mocked(dutyScope.resolveAssignableAccounts).mockResolvedValue([
      {
        id: 'employee',
        role: AccountRole.EMPLOYEE,
        username: 'employee',
        superAdminProfile: null,
        employee: {
          id: 'employee-record',
          empId: 'NTC-1001',
          empName: 'Employee One',
          designation: 'Technician',
        },
        officeId: 'office-1',
        orgUnitId: 'org-unit-a',
        operationalTeamIds: [],
      },
    ] as never);
    jest.mocked(prisma.dutyShiftTemplate.findFirst).mockResolvedValue({
      id: 'shift-1',
      name: 'Office Shift',
      startMinute: 9 * 60,
      endMinute: 17 * 60,
      spansNextDay: false,
      isActive: true,
      officeId: 'office-1',
      orgUnitId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    jest.mocked(prisma.dutyHoliday.findMany).mockResolvedValue([
      {
        id: 'holiday-1',
        name: 'Festival Holiday',
        startDate: new Date('2026-07-20T00:00:00.000Z'),
        endDate: new Date('2026-07-20T00:00:00.000Z'),
        officeId: 'office-1',
        orgUnitId: null,
      },
    ] as never);

    const result = await service.previewBulkSchedule(managerUser, {
      employeeAccountIds: ['employee'],
      shiftTemplateId: 'shift-1',
      recurrenceType: DutyRecurrenceType.ONE_TIME,
      startDate: '2026-07-20',
      reportingLocation: 'Patan Branch',
    });

    expect(result.validAssignments).toBe(1);
    expect(result.conflictAssignments).toBe(0);
    expect(result.warningAssignments).toBe(1);
    expect(result.people[0]?.warnings[0]).toEqual(
      expect.objectContaining({ type: 'HOLIDAY', holidayId: 'holiday-1' }),
    );
  });

  it('blocks a second duty when the required rest period is not available', async () => {
    jest.mocked(dutyScope.resolveAssignableAccounts).mockResolvedValue([
      {
        id: 'employee',
        role: AccountRole.EMPLOYEE,
        username: 'employee',
        superAdminProfile: null,
        employee: {
          id: 'employee-record',
          empId: 'NTC-1001',
          empName: 'Employee One',
          designation: 'Technician',
        },
        officeId: 'office-1',
        orgUnitId: 'org-unit-a',
        operationalTeamIds: [],
      },
    ] as never);
    jest.mocked(prisma.dutyShiftTemplate.findFirst).mockResolvedValue({
      id: 'shift-1',
      name: 'Evening Shift',
      startMinute: 18 * 60,
      endMinute: 22 * 60,
      spansNextDay: false,
      isActive: true,
      officeId: 'office-1',
      orgUnitId: null,
      office: { id: 'office-1', code: 'PATAN', name: 'Patan' },
      orgUnit: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    jest.mocked(prisma.dutyAssignment.findMany).mockResolvedValue([
      {
        id: 'existing-duty',
        employeeAccountId: 'employee',
        shiftName: 'Day Shift',
        startsAt: new Date('2026-07-20T03:15:00.000Z'),
        endsAt: new Date('2026-07-20T11:15:00.000Z'),
      },
    ] as never);

    const result = await service.previewBulkSchedule(managerUser, {
      employeeAccountIds: ['employee'],
      shiftTemplateId: 'shift-1',
      recurrenceType: DutyRecurrenceType.ONE_TIME,
      startDate: '2026-07-20',
      reportingLocation: 'Patan Branch',
    });

    expect(result.validAssignments).toBe(0);
    expect(result.conflictAssignments).toBe(1);
    expect(result.people[0]?.conflicts[0]?.type).toBe('REST_PERIOD');
  });

  it('filters management oversight to V3 leadership duty accounts', async () => {
    jest.mocked(scope.resolveActorContext).mockResolvedValue(
      actor(AccountRole.EMPLOYEE),
    );
    jest
      .mocked(dutyScope.managementDutyAccountIds)
      .mockResolvedValue(['org-head-account', 'team-lead-account']);
    jest.mocked(prisma.dutyAssignment.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.dutyAssignment.count).mockResolvedValue(0);

    await service.listAssignments(
      { ...managerUser, role: AccountRole.EMPLOYEE },
      {
        view: DutyAssignmentListView.MANAGEMENT_DUTIES,
        page: 1,
        limit: 25,
      },
    );

    expect(dutyScope.managementDutyAccountIds).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'manager' }),
    );
    expect(prisma.dutyAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employeeAccountId: {
            in: ['org-head-account', 'team-lead-account'],
          },
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

  it('lets current V3 Duty authority cancel a reconciled historical Super Admin override', async () => {
    const dutyDate = new Date('2026-09-09T00:00:00.000Z');
    const startsAt = new Date('2026-09-09T02:00:00.000Z');
    const endsAt = new Date('2026-09-09T10:00:00.000Z');
    const current = {
      id: 'override-assignment',
      seriesId: 'series-1',
      employeeAccountId: 'employee-account',
      shiftTemplateId: 'shift-1',
      shiftName: 'Day',
      shiftStartMinute: 120,
      shiftEndMinute: 600,
      shiftSpansNextDay: false,
      supervisorAccountId: 'supervisor-account',
      createdByAccountId: 'legacy-super-admin',
      officeId: 'office-1',
      orgUnitId: 'org-unit-a',
      operationalTeamId: 'team-1',
      dutyDate,
      startsAt,
      endsAt,
      reportingLocation: 'NTC Office',
      notes: null,
      authority: DutyAssignmentAuthority.SUPER_ADMIN_OVERRIDE,
      overrideReason: 'Legacy emergency override',
      hierarchyOverride: true,
      conflictOverride: false,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: startsAt,
      updatedAt: startsAt,
      employee: { id: 'employee-account', role: AccountRole.EMPLOYEE, employee: null },
      supervisor: { id: 'supervisor-account', role: AccountRole.EMPLOYEE, employee: null },
      createdBy: { id: 'legacy-super-admin', role: AccountRole.SUPER_ADMIN, employee: null },
      shift: null,
      division: null,
      department: null,
      operationalTeam: { id: 'team-1', code: 'TEAM1', name: 'Team 1', orgUnitId: 'org-unit-a' },
    };
    jest.mocked(prisma.dutyAssignment.findFirst).mockResolvedValue(current as never);
    jest.mocked(transaction.dutyAssignment.update).mockResolvedValue({
      ...current,
      cancelledAt: new Date('2026-09-08T23:00:00.000Z'),
      cancellationReason: 'Routine team roster adjustment',
    } as never);

    await expect(
      service.cancelAssignment(managerUser, 'override-assignment', {
        reason: 'Routine team roster adjustment',
      }),
    ).resolves.toEqual(
      expect.objectContaining({ message: 'Duty assignment cancelled successfully.' }),
    );

    expect(transaction.dutyActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.objectContaining({
            legacySuperAdminOverride: true,
            officeId: 'office-1',
            orgUnitId: 'org-unit-a',
            operationalTeamId: 'team-1',
          }),
        }),
      }),
    );
    expect(dutyScope.visibleAssignmentWhere).toHaveBeenCalledWith(
      managerUser,
      'duty.assign',
    );
    expect(dutyScope.notificationRecipientIds).toHaveBeenCalledWith(
      expect.objectContaining({
        officeId: 'office-1',
        orgUnitId: 'org-unit-a',
        operationalTeamIds: ['team-1'],
      }),
    );
  });
  it('queries roster candidates by V3 OrgUnit scope without legacy hierarchy filters', async () => {
    jest.mocked(prisma.account.findMany).mockResolvedValue([] as never);

    await service.getRoster(managerUser, {
      from: '2026-08-23',
      to: '2026-08-23',
      orgUnitId: 'org-unit-a',
    });

    expect(dutyScope.rosterAccountIds).toHaveBeenCalledWith(
      managerUser,
      'org-unit-a',
      undefined,
    );
  });

  it('filters assignment shifts to Office and selected OrgUnit scope', async () => {
    jest.mocked(prisma.dutyShiftTemplate.findMany).mockResolvedValue([] as never);

    await service.listShiftTemplates(managerUser, {
      targetScope: 'ORG_UNIT' as never,
      orgUnitId: 'org-unit-a',
    });

    expect(prisma.dutyShiftTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          officeId: 'office-1',
          OR: expect.arrayContaining([
            { orgUnitId: null },
            { orgUnitId: 'org-unit-a' },
          ]),
        }),
      }),
    );
  });

  it('treats approved leave as a hard assignment conflict', async () => {
    jest.mocked(dutyScope.resolveAssignableAccounts).mockResolvedValue([
      {
        id: 'employee',
        role: AccountRole.EMPLOYEE,
        username: 'employee',
        superAdminProfile: null,
        employee: {
          id: 'employee-record',
          empId: 'NTC-1001',
          empName: 'Employee One',
          designation: 'Technician',
        },
        officeId: 'office-1',
        orgUnitId: 'org-unit-a',
        operationalTeamIds: [],
      },
    ] as never);
    jest.mocked(prisma.dutyShiftTemplate.findFirst).mockResolvedValue({
      id: 'shift-1',
      name: 'Office Shift',
      startMinute: 9 * 60,
      endMinute: 17 * 60,
      spansNextDay: false,
      isActive: true,
      officeId: 'office-1',
      orgUnitId: null,
      office: { id: 'office-1', code: 'PATAN', name: 'Patan' },
      orgUnit: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    jest.mocked(prisma.dutyException.findMany).mockResolvedValue([
      {
        employeeAccountId: 'employee',
        exceptionDate: new Date('2026-07-20T00:00:00.000Z'),
      },
    ] as never);

    const result = await service.previewBulkSchedule(managerUser, {
      employeeAccountIds: ['employee'],
      shiftTemplateId: 'shift-1',
      recurrenceType: DutyRecurrenceType.ONE_TIME,
      startDate: '2026-07-20',
      reportingLocation: 'Patan Branch',
    });

    expect(result.validAssignments).toBe(0);
    expect(result.people[0]?.conflicts[0]?.type).toBe('LEAVE');
  });

});
