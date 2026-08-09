import { ForbiddenException } from '@nestjs/common';

import {
  AccountRole,
  DutyAssignmentAuthority,
  WorkPriority,
} from '../generated/prisma/enums';
import { WorkReportDataset } from './dto/export-work-report-query.dto';
import { WorkReportDrilldownDataset } from './dto/work-report-drilldown-query.dto';
import { WorkReportDutyStatus } from './dto/work-report-query.dto';
import { WorkReportsService } from './work-reports.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

function createPrismaMock() {
  return {
    workItem: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    workAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    workActivity: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    workCompletionReport: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    workHelpRequest: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    dutyAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    dutyCoverageRequirement: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    dutyException: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    department: {
      findFirst: jest.fn().mockResolvedValue({ id: 'department-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ name: 'Network Department' }),
    },
    division: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ name: 'Technical Division' }),
    },
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'employee-account' }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({
        username: 'employee',
        employee: { empName: 'Employee One' },
      }),
    },
  };
}

const employeeUser = {
  accountId: 'employee-account',
  sessionId: 'session-1',
  username: 'employee',
  role: AccountRole.EMPLOYEE,
};

const superAdminUser = {
  accountId: 'super-admin',
  sessionId: 'session-super',
  username: 'super-admin',
  role: AccountRole.SUPER_ADMIN,
};

const teamManagerUser = {
  accountId: 'manager-account',
  sessionId: 'session-2',
  username: 'manager',
  role: AccountRole.TEAM_MANAGER,
};

describe('WorkReportsService', () => {
  it('keeps an employee report personal across work and duty queries', async () => {
    const prisma = createPrismaMock();
    const scopeService = {
      resolveActorContext: jest.fn().mockResolvedValue({
        accountId: employeeUser.accountId,
        role: AccountRole.EMPLOYEE,
        divisionId: 'division-1',
        departmentId: 'department-1',
      }),
      buildVisibleWorkWhere: jest.fn().mockReturnValue({
        assignments: {
          some: {
            assigneeAccountId: employeeUser.accountId,
          },
        },
      }),
    };
    const service = new WorkReportsService(prisma as never, scopeService as never);

    const summary = await service.getSummary(employeeUser, {
      from: '2026-07-01',
      to: '2026-07-20',
    });

    expect(summary.scope.type).toBe('PERSONAL');
    expect(summary.scope.label).toBe('Employee One');
    expect(summary.departmentOptions).toEqual([]);
    expect(scopeService.buildVisibleWorkWhere).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: employeeUser.accountId }),
    );
    expect(prisma.dutyAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              employeeAccountId: employeeUser.accountId,
            }),
          ]),
        }),
      }),
    );
  });

  it('rejects a department filter outside a Team Manager scope', async () => {
    const prisma = createPrismaMock();
    const scopeService = {
      resolveActorContext: jest.fn().mockResolvedValue({
        accountId: teamManagerUser.accountId,
        role: AccountRole.TEAM_MANAGER,
        divisionId: 'division-1',
        departmentId: 'department-1',
      }),
      buildVisibleWorkWhere: jest.fn(),
    };
    const service = new WorkReportsService(prisma as never, scopeService as never);

    await expect(
      service.getSummary(teamManagerUser, {
        from: '2026-07-01',
        to: '2026-07-20',
        departmentId: 'department-2',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.workItem.findMany).not.toHaveBeenCalled();
  });

  it('escapes spreadsheet formula markers in protected CSV exports', async () => {
    const prisma = createPrismaMock();
    const scopeService = {
      resolveActorContext: jest.fn().mockResolvedValue({
        accountId: employeeUser.accountId,
        role: AccountRole.EMPLOYEE,
        divisionId: 'division-1',
        departmentId: 'department-1',
      }),
      buildVisibleWorkWhere: jest.fn().mockReturnValue({
        assignments: { some: { assigneeAccountId: employeeUser.accountId } },
      }),
    };
    prisma.workItem.count.mockResolvedValueOnce(1);
    prisma.workItem.findMany.mockResolvedValueOnce([
      {
        ticketNumber: 'NTW-0001',
        title: '=HYPERLINK("unsafe")',
        category: null,
        type: 'TROUBLE_TICKET',
        priority: 'HIGH',
        status: 'CLOSED',
        locationText: 'Patan',
        createdAt: new Date('2026-07-01T04:00:00.000Z'),
        dueAt: new Date('2026-07-02T04:00:00.000Z'),
        completedAt: new Date('2026-07-01T08:00:00.000Z'),
        closedAt: new Date('2026-07-01T09:00:00.000Z'),
        division: { code: 'TECH', name: 'Technical Division' },
        department: { code: 'NET', name: 'Network Department' },
        responsibleManager: {
          username: 'manager',
          employee: { empName: 'Manager One', empId: 'NTC-1001' },
        },
        assignments: [
          {
            assignee: {
              username: 'employee',
              employee: { empName: 'Employee One', empId: 'NTC-1002' },
            },
          },
        ],
      },
    ]);
    const service = new WorkReportsService(prisma as never, scopeService as never);

    const report = await service.exportCsv(employeeUser, {
      dataset: WorkReportDataset.WORK_ITEMS,
      from: '2026-07-01',
      to: '2026-07-20',
    });

    expect(report.rowCount).toBe(1);
    expect(report.truncated).toBe(false);
    expect(report.content).toContain("'=HYPERLINK");
  });

  it('builds executive exceptions, assignment flow and retention metrics for Super Admin', async () => {
    const prisma = createPrismaMock();
    const scopeService = {
      resolveActorContext: jest.fn().mockResolvedValue({
        accountId: superAdminUser.accountId,
        role: AccountRole.SUPER_ADMIN,
        divisionId: null,
        departmentId: null,
      }),
      buildVisibleWorkWhere: jest.fn().mockReturnValue({}),
    };
    prisma.workItem.findMany
      .mockResolvedValueOnce([
        {
          id: 'work-1',
          divisionId: 'division-1',
          departmentId: 'department-1',
          status: 'ASSIGNED',
          priority: 'HIGH',
          type: 'MAINTENANCE',
          createdAt: new Date('2026-07-10T00:00:00.000Z'),
          dueAt: new Date('2026-07-20T00:00:00.000Z'),
          createdBy: { role: AccountRole.SENIOR_MANAGEMENT },
          assignments: [
            {
              assigneeAccountId: 'employee-1',
              assignee: { role: AccountRole.EMPLOYEE },
            },
          ],
        },
      ] as never)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    [0, 0, 0, 2, 3, 4, 5, 6, 7, 8].forEach((value) =>
      prisma.workItem.count.mockResolvedValueOnce(value),
    );
    prisma.department.findMany.mockResolvedValue([
      {
        id: 'department-1',
        divisionId: 'division-1',
        code: 'NET',
        name: 'Network',
        division: { id: 'division-1', code: 'TECH', name: 'Technical' },
      },
    ] as never);
    prisma.division.findMany.mockResolvedValue([
      { id: 'division-1', code: 'TECH', name: 'Technical' },
    ] as never);
    const service = new WorkReportsService(prisma as never, scopeService as never);

    const summary = await service.getSummary(superAdminUser, {
      from: '2026-07-01',
      to: '2026-07-20',
    });

    expect(summary.exceptions).toEqual({
      criticalActive: 2,
      seriouslyOverdue: 3,
      awaitingReview: 4,
      pendingHelp: 0,
    });
    expect(summary.assignmentFlow.assignedByRole).toContainEqual({
      key: AccountRole.SENIOR_MANAGEMENT,
      count: 1,
    });
    expect(summary.assignmentFlow.assignedToRole).toContainEqual({
      key: AccountRole.EMPLOYEE,
      count: 1,
    });
    expect(summary.filterOptions.assignedToRoles).toEqual([
      AccountRole.SENIOR_MANAGEMENT,
      AccountRole.TEAM_MANAGER,
      AccountRole.EMPLOYEE,
    ]);
    expect(summary.retention).toEqual({
      archived: 5,
      eligibleForReview: 6,
      held: 7,
      deletionRequested: 8,
    });
    expect(summary.divisions[0]).toEqual(
      expect.objectContaining({ divisionId: 'division-1', workCreated: 1 }),
    );
  });

  it('exports a privacy-safe retention-review register only for Super Admin', async () => {
    const prisma = createPrismaMock();
    const scopeService = {
      resolveActorContext: jest.fn().mockResolvedValue({
        accountId: superAdminUser.accountId,
        role: AccountRole.SUPER_ADMIN,
        divisionId: null,
        departmentId: null,
      }),
      buildVisibleWorkWhere: jest.fn().mockReturnValue({}),
    };
    prisma.workItem.count.mockResolvedValueOnce(1);
    prisma.workItem.findMany.mockResolvedValueOnce([
      {
        ticketNumber: 'NTW-ARCHIVE-1',
        title: 'Archived maintenance record',
        status: 'CLOSED',
        closedAt: new Date('2023-07-01T00:00:00.000Z'),
        cancelledAt: null,
        archiveEligibleAt: new Date('2024-07-01T00:00:00.000Z'),
        deletionEligibleAt: new Date('2026-07-01T00:00:00.000Z'),
        retentionHoldAt: null,
        retentionHoldReason: null,
        deletionRequestedAt: new Date('2026-07-20T00:00:00.000Z'),
        deletionRequestReason: 'Annual retention review',
        division: { code: 'TECH', name: 'Technical' },
        department: { code: 'NET', name: 'Network' },
      },
    ] as never);
    const service = new WorkReportsService(prisma as never, scopeService as never);

    const report = await service.exportCsv(superAdminUser, {
      dataset: WorkReportDataset.RETENTION_REVIEW,
      from: '2026-07-01',
      to: '2026-07-20',
    });

    expect(report.rowCount).toBe(1);
    expect(report.filename).toContain('retention-review');
    expect(report.content).toContain('DELETION_REVIEW_REQUESTED');
    expect(report.content).not.toContain('@');
  });

  it('rejects retention-review exports outside Super Admin governance', async () => {
    const prisma = createPrismaMock();
    const scopeService = {
      resolveActorContext: jest.fn().mockResolvedValue({
        accountId: teamManagerUser.accountId,
        role: AccountRole.TEAM_MANAGER,
        divisionId: 'division-1',
        departmentId: 'department-1',
      }),
      buildVisibleWorkWhere: jest.fn().mockReturnValue({}),
    };
    const service = new WorkReportsService(prisma as never, scopeService as never);

    await expect(
      service.exportCsv(teamManagerUser, {
        dataset: WorkReportDataset.RETENTION_REVIEW,
        from: '2026-07-01',
        to: '2026-07-20',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.workItem.findMany).not.toHaveBeenCalled();
  });

  it('keeps division-level Senior Management responsibility in workload totals', () => {
    const prisma = createPrismaMock();
    const service = new WorkReportsService(prisma as never, {} as never);
    const seniorAccount = {
      role: AccountRole.SENIOR_MANAGEMENT,
      username: 'senior-manager',
      employee: {
        empName: 'Senior Manager',
        empId: 'NTC-2001',
        divisionId: 'division-1',
        departmentId: null,
        division: { id: 'division-1', code: 'TECH', name: 'Technical' },
        departmentUnit: null,
      },
    };

    const workload = (service as unknown as {
      buildRoleWorkload: (
        actor: unknown,
        assignments: unknown[],
        dutyAssignments: unknown[],
        now: Date,
      ) => {
        level: string;
        rows: Array<{
          code: string;
          activeWork: number;
          scheduledHours: number;
        }>;
      };
    }).buildRoleWorkload(
      {
        accountId: 'senior-account',
        role: AccountRole.SENIOR_MANAGEMENT,
        divisionId: 'division-1',
        departmentId: null,
      },
      [
        {
          assigneeAccountId: 'senior-account',
          assignee: seniorAccount,
          workItem: {
            priority: WorkPriority.HIGH,
            dueAt: new Date('2026-07-25T00:00:00.000Z'),
          },
        },
      ],
      [
        {
          employeeAccountId: 'senior-account',
          startsAt: new Date('2026-07-20T02:00:00.000Z'),
          endsAt: new Date('2026-07-20T10:00:00.000Z'),
          employee: seniorAccount,
        },
      ],
      new Date('2026-07-21T00:00:00.000Z'),
    );

    expect(workload.level).toBe('DEPARTMENT');
    expect(workload.rows).toContainEqual(
      expect.objectContaining({
        code: 'TECH-MGMT',
        activeWork: 1,
        scheduledHours: 8,
      }),
    );
  });

  it('combines advanced work and duty filters inside the authorized scope', () => {
    const prisma = createPrismaMock();
    const scopeService = {
      buildVisibleWorkWhere: jest.fn().mockReturnValue({
        departmentId: 'department-1',
      }),
    };
    const service = new WorkReportsService(prisma as never, scopeService as never);
    const actor = {
      accountId: teamManagerUser.accountId,
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-1',
      departmentId: 'department-1',
    };
    const query = {
      divisionId: 'division-1',
      departmentId: 'department-1',
      employeeAccountId: 'employee-account',
      assignedByAccountId: 'manager-account',
      assignedToRole: AccountRole.EMPLOYEE,
      shiftTemplateId: 'shift-template-1',
      dutyStatus: WorkReportDutyStatus.CANCELLED,
      location: '  Patan Office  ',
    };

    const internal = service as unknown as {
      buildWorkWhere: (actor: unknown, query: unknown) => Record<string, unknown>;
      buildDutyWhere: (actor: unknown, query: unknown) => Record<string, unknown>;
    };
    const workWhere = internal.buildWorkWhere(actor, query);
    const dutyWhere = internal.buildDutyWhere(actor, query);

    expect(workWhere).toEqual({
      AND: [
        { departmentId: 'department-1' },
        expect.objectContaining({
          divisionId: 'division-1',
          departmentId: 'department-1',
          locationText: { contains: 'Patan Office', mode: 'insensitive' },
          assignments: {
            some: {
              assignmentRole: 'PRIMARY',
              assigneeAccountId: 'employee-account',
              assignedByAccountId: 'manager-account',
              assignee: { is: { role: AccountRole.EMPLOYEE } },
            },
          },
        }),
      ],
    });
    expect(dutyWhere).toEqual(
      expect.objectContaining({
        divisionId: 'division-1',
        departmentId: 'department-1',
        employeeAccountId: 'employee-account',
        createdByAccountId: 'manager-account',
        employee: { is: { role: AccountRole.EMPLOYEE } },
        shiftTemplateId: 'shift-template-1',
        cancelledAt: { not: null },
        reportingLocation: {
          contains: 'Patan Office',
          mode: 'insensitive',
        },
      }),
    );
  });

  it('calculates night, weekend, shift and override duty analytics without treating them as attendance', () => {
    const prisma = createPrismaMock();
    const service = new WorkReportsService(prisma as never, {} as never);
    const internal = service as unknown as {
      buildDutyMetrics: (
        assignments: unknown[],
        cancelled: number,
        exceptions: unknown[],
        requirements: unknown[],
        range: unknown,
        query: unknown,
        actor: unknown,
      ) => {
        scheduled: number;
        cancelled: number;
        nightAssignments: number;
        weekendAssignments: number;
        conflictOverrides: number;
        hierarchyOverrides: number;
        superAdminOverrides: number;
        byShift: Array<{ name: string; count: number }>;
        coverage: { configured: boolean; requiredCoverage: number | null };
      };
    };

    const metrics = internal.buildDutyMetrics(
      [
        {
          employeeAccountId: 'employee-1',
          startsAt: new Date('2026-07-17T18:15:00.000Z'),
          endsAt: new Date('2026-07-18T02:15:00.000Z'),
          authority: DutyAssignmentAuthority.SUPER_ADMIN_OVERRIDE,
          hierarchyOverride: true,
          conflictOverride: true,
          shift: {
            id: 'night-shift',
            name: 'Emergency Night',
            startMinute: 20 * 60,
            endMinute: 4 * 60,
            spansNextDay: true,
          },
        },
      ],
      2,
      [],
      [],
      {
        from: '2026-07-18',
        to: '2026-07-18',
        start: new Date('2026-07-17T18:15:00.000Z'),
        endExclusive: new Date('2026-07-18T18:15:00.000Z'),
        days: 1,
      },
      {},
      {
        accountId: 'manager-account',
        role: AccountRole.TEAM_MANAGER,
        divisionId: 'division-1',
        departmentId: 'department-1',
      },
    );

    expect(metrics).toEqual(
      expect.objectContaining({
        scheduled: 1,
        cancelled: 2,
        nightAssignments: 1,
        weekendAssignments: 1,
        conflictOverrides: 1,
        hierarchyOverrides: 1,
        superAdminOverrides: 1,
      }),
    );
    expect(metrics.byShift).toEqual([
      expect.objectContaining({ name: 'Emergency Night', count: 1 }),
    ]);
    expect(metrics.coverage).toEqual(
      expect.objectContaining({ configured: false, requiredCoverage: null }),
    );
  });

  it('calculates effective-dated planned coverage without treating overstaffing as more than 100 percent', () => {
    const prisma = createPrismaMock();
    const service = new WorkReportsService(prisma as never, {} as never);
    const internal = service as unknown as {
      buildDutyMetrics: (
        assignments: unknown[],
        cancelled: number,
        exceptions: unknown[],
        requirements: unknown[],
        range: unknown,
        query: unknown,
        actor: unknown,
      ) => {
        coverage: {
          configured: boolean;
          requiredCoverage: number | null;
          coveredPositions: number | null;
          coveragePercentage: number | null;
          unfilledShifts: number | null;
        };
      };
    };

    const coverage = internal.buildDutyMetrics(
      [
        {
          employeeAccountId: 'employee-1',
          departmentId: 'department-1',
          dutyDate: new Date('2026-07-20T00:00:00.000Z'),
          startsAt: new Date('2026-07-20T03:00:00.000Z'),
          endsAt: new Date('2026-07-20T11:00:00.000Z'),
          reportingLocation: 'Patan Office',
          authority: DutyAssignmentAuthority.STANDARD_HIERARCHY,
          hierarchyOverride: false,
          conflictOverride: false,
          shift: {
            id: 'shift-1',
            name: 'Morning',
            startMinute: 8 * 60,
            endMinute: 16 * 60,
            spansNextDay: false,
          },
        },
        {
          employeeAccountId: 'employee-2',
          departmentId: 'department-1',
          dutyDate: new Date('2026-07-20T00:00:00.000Z'),
          startsAt: new Date('2026-07-20T03:00:00.000Z'),
          endsAt: new Date('2026-07-20T11:00:00.000Z'),
          reportingLocation: 'Patan Office',
          authority: DutyAssignmentAuthority.STANDARD_HIERARCHY,
          hierarchyOverride: false,
          conflictOverride: false,
          shift: {
            id: 'shift-1',
            name: 'Morning',
            startMinute: 8 * 60,
            endMinute: 16 * 60,
            spansNextDay: false,
          },
        },
      ],
      0,
      [],
      [
        {
          departmentId: 'department-1',
          shiftTemplateId: 'shift-1',
          dayOfWeek: 1,
          requiredStaff: 1,
          reportingLocation: 'Patan Office',
          reportingLocationKey: 'patan office',
          effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
          effectiveUntil: null,
        },
      ],
      {
        from: '2026-07-20',
        to: '2026-07-20',
        start: new Date('2026-07-19T18:15:00.000Z'),
        endExclusive: new Date('2026-07-20T18:15:00.000Z'),
        days: 1,
      },
      {},
      {
        accountId: 'manager-account',
        role: AccountRole.TEAM_MANAGER,
        divisionId: 'division-1',
        departmentId: 'department-1',
      },
    ).coverage;

    expect(coverage).toEqual({
      configured: true,
      requiredCoverage: 1,
      coveredPositions: 1,
      coveragePercentage: 100,
      unfilledShifts: 0,
      reason: expect.stringContaining('planned duty'),
    });
  });

  it('builds decision-focused department comparison metrics from the authorized scope', () => {
    const prisma = createPrismaMock();
    const service = new WorkReportsService(prisma as never, {} as never);
    const internal = service as unknown as {
      buildDepartmentBreakdown: (...args: unknown[]) => Array<{
        departmentId: string;
        activeWork: number;
        overdueWork: number;
        completionRate: number | null;
        leaveDays: number;
        conflicts: number;
      }>;
    };

    const rows = internal.buildDepartmentBreakdown(
      {
        accountId: 'manager-account',
        role: AccountRole.TEAM_MANAGER,
        divisionId: 'division-1',
        departmentId: 'department-1',
      },
      [
        {
          id: 'department-1',
          divisionId: 'division-1',
          code: 'NET',
          name: 'Network',
        },
      ],
      [{ departmentId: 'department-1' }, { departmentId: 'department-1' }],
      [{ departmentId: 'department-1' }],
      [],
      [
        {
          employeeAccountId: 'employee-1',
          divisionId: 'division-1',
          departmentId: 'department-1',
          dutyDate: new Date('2026-07-20T00:00:00.000Z'),
          startsAt: new Date('2026-07-20T03:00:00.000Z'),
          reportingLocation: 'Patan',
          conflictOverride: true,
          shift: { id: 'shift-1' },
        },
      ],
      [
        {
          workItem: {
            id: 'work-1',
            divisionId: 'division-1',
            departmentId: 'department-1',
            dueAt: new Date('2026-07-19T00:00:00.000Z'),
          },
        },
      ],
      [
        {
          type: 'LEAVE',
          divisionId: 'division-1',
          departmentId: 'department-1',
        },
      ],
      [],
      {
        from: '2026-07-20',
        to: '2026-07-20',
        start: new Date('2026-07-19T18:15:00.000Z'),
        endExclusive: new Date('2026-07-20T18:15:00.000Z'),
        days: 1,
      },
      {},
      new Date('2026-07-20T00:00:00.000Z'),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        departmentId: 'department-1',
        activeWork: 1,
        overdueWork: 1,
        completionRate: 50,
        leaveDays: 1,
        conflicts: 1,
      }),
    ]);
  });

  it('exports a separate privacy-safe management summary CSV', async () => {
    const prisma = createPrismaMock();
    const scopeService = {
      resolveActorContext: jest.fn().mockResolvedValue({
        accountId: superAdminUser.accountId,
        role: AccountRole.SUPER_ADMIN,
        divisionId: null,
        departmentId: null,
      }),
      buildVisibleWorkWhere: jest.fn().mockReturnValue({}),
    };
    const service = new WorkReportsService(prisma as never, scopeService as never);

    const report = await service.exportCsv(superAdminUser, {
      dataset: WorkReportDataset.SUMMARY,
      from: '2026-07-01',
      to: '2026-07-20',
    });

    expect(report.filename).toBe('work-summary-2026-07-01-to-2026-07-20.csv');
    expect(report.content).toContain('Completion rate (%)');
    expect(report.content).toContain('Coverage note');
    expect(report.content).not.toContain('@');
  });

  it('returns overdue work in severity and due-date order with safe pagination', async () => {
    const prisma = createPrismaMock();
    const scopeService = {
      resolveActorContext: jest.fn().mockResolvedValue({
        accountId: superAdminUser.accountId,
        role: AccountRole.SUPER_ADMIN,
        divisionId: null,
        departmentId: null,
      }),
      buildVisibleWorkWhere: jest.fn().mockReturnValue({}),
    };
    const service = new WorkReportsService(prisma as never, scopeService as never);
    jest.spyOn(service, 'getSummary').mockResolvedValue({
      scope: {
        role: AccountRole.SUPER_ADMIN,
        type: 'ORGANIZATION',
        label: 'Patan Branch',
        divisionId: null,
        departmentId: null,
      },
      period: { from: '2026-07-01', to: '2026-07-20', days: 20 },
      work: {
        totals: {
          created: 1,
          activeAtEnd: 1,
          dueDuring: 1,
          overdueAtEnd: 1,
          closedDuring: 0,
          completedDuring: 0,
          reopenedTickets: 0,
          cancelledTickets: 0,
          uniqueAssignees: 1,
          completionRate: null,
          averageClosureHours: null,
        },
      },
      duty: {
        scheduled: 0,
        cancelled: 0,
        uniqueEmployees: 0,
        scheduledHours: 0,
        conflictOverrides: 0,
        hierarchyOverrides: 0,
        superAdminOverrides: 0,
      },
    } as never);
    prisma.workItem.count.mockResolvedValueOnce(1);
    prisma.workItem.findMany.mockResolvedValueOnce([
      {
        id: 'work-1',
        ticketNumber: 'NTW-0001',
        title: 'Restore branch link',
        type: 'TROUBLE_TICKET',
        priority: 'CRITICAL',
        status: 'IN_PROGRESS',
        locationText: 'Patan Office',
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        dueAt: new Date('2026-07-10T00:00:00.000Z'),
        completedAt: null,
        closedAt: null,
        division: { id: 'division-1', code: 'TECH', name: 'Technical' },
        department: { id: 'department-1', code: 'NET', name: 'Network' },
        responsibleManager: {
          username: 'manager',
          employee: { empName: 'Manager One', empId: 'NTC-1001' },
        },
        assignments: [
          {
            assignee: {
              username: 'employee',
              employee: { empName: 'Employee One', empId: 'NTC-1002' },
            },
            assignedBy: {
              username: 'manager',
              employee: { empName: 'Manager One', empId: 'NTC-1001' },
            },
          },
        ],
        childWorkItems: [
          { status: 'CLOSED' },
          { status: 'IN_PROGRESS' },
        ],
      },
    ] as never);

    const result = await service.getDrilldown(superAdminUser, {
      dataset: WorkReportDrilldownDataset.OVERDUE_WORK,
      from: '2026-07-01',
      to: '2026-07-20',
      page: 1,
      limit: 25,
    });

    expect(prisma.workItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { priority: 'desc' },
          { dueAt: 'asc' },
          { ticketNumber: 'asc' },
        ],
        skip: 0,
        take: 25,
      }),
    );
    expect(result.sections.work?.pagination).toEqual(
      expect.objectContaining({ total: 1, totalPages: 1, hasNext: false }),
    );
    expect(result.sections.work?.rows[0]).toEqual(
      expect.objectContaining({
        ticketNumber: 'NTW-0001',
        primaryAssignee: 'Employee One (NTC-1002)',
        childProgress: {
          total: 2,
          completed: 1,
          inProgress: 1,
          percentage: 50,
        },
      }),
    );
    expect(result.sections.duty).toBeNull();
  });

  it('returns employee work and planned duty sections without private contact fields', async () => {
    const prisma = createPrismaMock();
    const scopeService = {
      resolveActorContext: jest.fn().mockResolvedValue({
        accountId: teamManagerUser.accountId,
        role: AccountRole.TEAM_MANAGER,
        divisionId: 'division-1',
        departmentId: 'department-1',
      }),
      buildVisibleWorkWhere: jest.fn().mockReturnValue({
        departmentId: 'department-1',
      }),
    };
    prisma.account.findFirst.mockResolvedValue({
      id: 'employee-account',
      role: AccountRole.EMPLOYEE,
      isEnabled: true,
      username: 'employee',
      employee: { empId: 'NTC-1002', empName: 'Employee One' },
    } as never);
    const service = new WorkReportsService(prisma as never, scopeService as never);
    jest.spyOn(service, 'getSummary').mockResolvedValue({
      scope: {
        role: AccountRole.TEAM_MANAGER,
        type: 'DEPARTMENT',
        label: 'Network',
        divisionId: 'division-1',
        departmentId: 'department-1',
      },
      period: { from: '2026-07-01', to: '2026-07-20', days: 20 },
      work: {
        totals: {
          created: 0,
          activeAtEnd: 0,
          dueDuring: 0,
          overdueAtEnd: 0,
          closedDuring: 0,
          completedDuring: 0,
          reopenedTickets: 0,
          cancelledTickets: 0,
          uniqueAssignees: 0,
          completionRate: null,
          averageClosureHours: null,
        },
      },
      duty: {
        scheduled: 1,
        cancelled: 0,
        uniqueEmployees: 1,
        scheduledHours: 8,
        conflictOverrides: 1,
        hierarchyOverrides: 0,
        superAdminOverrides: 1,
      },
    } as never);
    prisma.workItem.count.mockResolvedValueOnce(0);
    prisma.workItem.findMany.mockResolvedValueOnce([]);
    prisma.dutyAssignment.count.mockResolvedValueOnce(1);
    prisma.dutyAssignment.findMany.mockResolvedValueOnce([
      {
        id: 'duty-1',
        dutyDate: new Date('2026-07-20T00:00:00.000Z'),
        startsAt: new Date('2026-07-20T02:15:00.000Z'),
        endsAt: new Date('2026-07-20T10:15:00.000Z'),
        reportingLocation: 'Patan Office',
        authority: DutyAssignmentAuthority.SUPER_ADMIN_OVERRIDE,
        overrideReason: 'Branch emergency coverage',
        hierarchyOverride: false,
        conflictOverride: true,
        cancelledAt: null,
        cancellationReason: null,
        shiftName: 'Emergency Day',
        division: { id: 'division-1', code: 'TECH', name: 'Technical' },
        department: { id: 'department-1', code: 'NET', name: 'Network' },
        shift: null,
        employee: {
          role: AccountRole.EMPLOYEE,
          username: 'employee',
          employee: { empName: 'Employee One', empId: 'NTC-1002' },
        },
        supervisor: {
          username: 'manager',
          employee: { empName: 'Manager One', empId: 'NTC-1001' },
        },
        createdBy: {
          username: 'super-admin',
          employee: { empName: 'Branch Head', empId: 'NTC-0001' },
        },
      },
    ] as never);

    const result = await service.getDrilldown(teamManagerUser, {
      dataset: WorkReportDrilldownDataset.EMPLOYEE_PERFORMANCE,
      employeeAccountId: 'employee-account',
      from: '2026-07-01',
      to: '2026-07-20',
      page: 1,
      limit: 10,
    });

    expect(result.target).toEqual({
      type: 'EMPLOYEE',
      id: 'employee-account',
      code: 'NTC-1002',
      name: 'Employee One',
    });
    expect(result.sections.duty?.rows[0]).toEqual(
      expect.objectContaining({
        employee: 'Employee One (NTC-1002)',
        assignedBy: 'Branch Head (NTC-0001)',
        shift: 'Emergency Day',
        conflictOverride: true,
      }),
    );
    expect(JSON.stringify(result)).not.toContain('officialEmail');
    expect(JSON.stringify(result)).not.toContain('phoneNumber');
  });

  it('prevents Team Managers from opening division-level drill-downs', async () => {
    const prisma = createPrismaMock();
    prisma.division.findUnique.mockResolvedValue({
      id: 'division-1',
      name: 'Technical',
      isActive: true,
    } as never);
    const scopeService = {
      resolveActorContext: jest.fn().mockResolvedValue({
        accountId: teamManagerUser.accountId,
        role: AccountRole.TEAM_MANAGER,
        divisionId: 'division-1',
        departmentId: 'department-1',
      }),
      buildVisibleWorkWhere: jest.fn().mockReturnValue({}),
    };
    const service = new WorkReportsService(prisma as never, scopeService as never);
    const summarySpy = jest.spyOn(service, 'getSummary');

    await expect(
      service.getDrilldown(teamManagerUser, {
        dataset: WorkReportDrilldownDataset.DIVISION_SUMMARY,
        divisionId: 'division-1',
        from: '2026-07-01',
        to: '2026-07-20',
        page: 1,
        limit: 25,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(summarySpy).not.toHaveBeenCalled();
    expect(prisma.workItem.findMany).not.toHaveBeenCalled();
  });

  it('queries only audited duty conflict overrides for the conflict drill-down', async () => {
    const prisma = createPrismaMock();
    const scopeService = {
      resolveActorContext: jest.fn().mockResolvedValue({
        accountId: superAdminUser.accountId,
        role: AccountRole.SUPER_ADMIN,
        divisionId: null,
        departmentId: null,
      }),
      buildVisibleWorkWhere: jest.fn().mockReturnValue({}),
    };
    const service = new WorkReportsService(prisma as never, scopeService as never);
    jest.spyOn(service, 'getSummary').mockResolvedValue({
      scope: {
        role: AccountRole.SUPER_ADMIN,
        type: 'ORGANIZATION',
        label: 'Patan Branch',
        divisionId: null,
        departmentId: null,
      },
      period: { from: '2026-07-01', to: '2026-07-20', days: 20 },
      work: { totals: {} },
      duty: {
        scheduled: 0,
        cancelled: 0,
        uniqueEmployees: 0,
        scheduledHours: 0,
        conflictOverrides: 0,
        hierarchyOverrides: 0,
        superAdminOverrides: 0,
      },
    } as never);

    await service.getDrilldown(superAdminUser, {
      dataset: WorkReportDrilldownDataset.DUTY_CONFLICT_OVERRIDES,
      from: '2026-07-01',
      to: '2026-07-20',
      page: 1,
      limit: 25,
    });

    expect(prisma.dutyAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {},
            expect.objectContaining({ conflictOverride: true }),
          ],
        },
      }),
    );
  });

  it('builds the daily employee table from planned starts and verified closes', async () => {
    const prisma = createPrismaMock();
    const scopeService = {
      resolveActorContext: jest.fn().mockResolvedValue({
        accountId: teamManagerUser.accountId,
        role: AccountRole.TEAM_MANAGER,
        divisionId: 'division-1',
        departmentId: 'department-1',
      }),
      buildVisibleWorkWhere: jest.fn().mockReturnValue({
        departmentId: 'department-1',
      }),
    };
    const assignee = {
      assigneeAccountId: 'employee-account',
      assignee: {
        role: AccountRole.EMPLOYEE,
        username: 'employee',
        employee: {
          empId: 'NTC-008',
          empName: 'Employee One',
          designation: 'Technician',
          division: { id: 'division-1', code: 'TECH', name: 'Technical' },
          departmentUnit: {
            id: 'department-1',
            code: 'NET',
            name: 'Network',
          },
        },
      },
    };
    prisma.workItem.findMany.mockResolvedValueOnce([
      {
        id: 'work-1',
        ticketNumber: 'NTW-0001',
        title: 'Network maintenance · 1001',
        type: 'MAINTENANCE',
        priority: 'HIGH',
        status: 'CLOSED',
        customerName: 'Customer One',
        serviceNumber: '1001',
        locationText: 'Patan',
        plannedStartAt: new Date('2026-07-26T01:00:00.000Z'),
        createdAt: new Date('2026-07-26T00:30:00.000Z'),
        dueAt: new Date('2026-07-26T05:00:00.000Z'),
        closedAt: new Date('2026-07-26T04:00:00.000Z'),
        cancelledAt: null,
        assignments: [assignee],
      },
      {
        id: 'work-2',
        ticketNumber: 'NTW-0002',
        title: 'New Installation · 1002',
        type: 'NEW_CONNECTION',
        priority: 'NORMAL',
        status: 'IN_PROGRESS',
        customerName: 'Customer Two',
        serviceNumber: '1002',
        locationText: 'Patan',
        plannedStartAt: new Date('2026-07-26T02:00:00.000Z'),
        createdAt: new Date('2026-07-26T01:30:00.000Z'),
        dueAt: new Date('2026-07-26T06:00:00.000Z'),
        closedAt: null,
        cancelledAt: null,
        assignments: [assignee],
      },
    ] as never);
    const service = new WorkReportsService(prisma as never, scopeService as never);

    const report = await service.getDailyPerformance(teamManagerUser, {
      date: '2026-07-26',
    });

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toEqual(
      expect.objectContaining({
        employeeId: 'NTC-008',
        networkMaintenance: { assigned: 1, completed: 1, pending: 0 },
        newInstallation: { assigned: 1, completed: 0, pending: 1 },
        total: { assigned: 2, completed: 1, pending: 1 },
        pendingReasons: ['1 in progress'],
      }),
    );
    expect(report.totals.total).toEqual({
      assigned: 2,
      completed: 1,
      pending: 1,
    });
  });

  it('exports the daily table without private contact details and protects spreadsheet cells', async () => {
    const service = new WorkReportsService({} as never, {} as never);
    jest.spyOn(service, 'getDailyPerformance').mockResolvedValue({
      timezone: 'Asia/Kathmandu',
      generatedAt: '2026-07-26T10:00:00.000Z',
      date: '2026-07-26',
      scope: {
        role: AccountRole.TEAM_MANAGER,
        type: 'DEPARTMENT',
        label: 'Network',
        divisionId: 'division-1',
        departmentId: 'department-1',
      },
      filters: {
        divisionId: null,
        departmentId: null,
        employeeAccountId: null,
        search: null,
      },
      divisionOptions: [],
      departmentOptions: [],
      rows: [
        {
          accountId: 'employee-account',
          employeeId: 'NTC-008',
          employeeName: '=Unsafe Employee',
          designation: 'Technician',
          role: AccountRole.EMPLOYEE,
          division: { id: 'division-1', code: 'TECH', name: 'Technical' },
          department: { id: 'department-1', code: 'NET', name: 'Network' },
          networkMaintenance: { assigned: 1, completed: 1, pending: 0 },
          newInstallation: { assigned: 0, completed: 0, pending: 0 },
          updateServices: { assigned: 0, completed: 0, pending: 0 },
          otherWork: { assigned: 0, completed: 0, pending: 0 },
          total: { assigned: 1, completed: 1, pending: 0 },
          pendingReasons: [],
          workItems: [],
        },
      ],
      totals: {
        employees: 1,
        networkMaintenance: { assigned: 1, completed: 1, pending: 0 },
        newInstallation: { assigned: 0, completed: 0, pending: 0 },
        updateServices: { assigned: 0, completed: 0, pending: 0 },
        otherWork: { assigned: 0, completed: 0, pending: 0 },
        total: { assigned: 1, completed: 1, pending: 0 },
      },
      note: 'Daily report note',
    });

    const exportReport = await service.exportDailyPerformanceCsv(
      teamManagerUser,
      { date: '2026-07-26' },
    );

    expect(exportReport.filename).toBe('daily-performance-2026-07-26.csv');
    expect(exportReport.content).toContain("'=Unsafe Employee");
    expect(exportReport.content).not.toContain('9812345678');
  });

});
