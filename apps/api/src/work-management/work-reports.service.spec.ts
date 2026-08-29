import { ForbiddenException } from '@nestjs/common';

import {
  AccountRole,
  WorkAssignmentRole,
  WorkCompletionReviewStatus,
  WorkItemStatus,
  WorkItemType,
  WorkSalesCoordinationStatus,
} from '../generated/prisma/enums';
import { WorkReportDataset } from './dto/export-work-report-query.dto';
import { WorkReportDrilldownDataset } from './dto/work-report-drilldown-query.dto';
import { WorkReportWorkflowStageFilter } from './dto/work-report-query.dto';
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
    dutyAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    dutyException: {
      count: jest.fn().mockResolvedValue(0),
    },
    departmentTeam: {
      findFirst: jest.fn().mockResolvedValue({ id: 'team-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    department: {
      findFirst: jest.fn().mockResolvedValue({ id: 'department-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ name: 'Network Department' }),
    },
    division: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'division-1',
        name: 'Technical Division',
        isActive: true,
      }),
    },
    account: {
      findUnique: jest.fn().mockResolvedValue({
        username: 'employee',
        employee: { empName: 'Employee One' },
      }),
    },
  };
}

function createScopeService(actor: {
  accountId: string;
  role: AccountRole;
  divisionId: string | null;
  departmentId: string | null;
}) {
  return {
    resolveActorContext: jest.fn().mockResolvedValue(actor),
    buildVisibleWorkWhere: jest.fn().mockReturnValue({}),
  };
}

const superAdminUser = {
  accountId: 'super-admin',
  sessionId: 'session-super',
  username: 'super-admin',
  role: AccountRole.SUPER_ADMIN,
};


const seniorManagementUser = {
  accountId: 'senior-account',
  sessionId: 'session-senior',
  username: 'senior',
  role: AccountRole.SENIOR_MANAGEMENT,
};

const teamManagerUser = {
  accountId: 'manager-account',
  sessionId: 'session-manager',
  username: 'manager',
  role: AccountRole.TEAM_MANAGER,
};

const employeeUser = {
  accountId: 'employee-account',
  sessionId: 'session-employee',
  username: 'employee',
  role: AccountRole.EMPLOYEE,
};

const superAdminActor = {
  accountId: superAdminUser.accountId,
  role: AccountRole.SUPER_ADMIN,
  divisionId: null,
  departmentId: null,
};


const seniorManagementActor = {
  accountId: seniorManagementUser.accountId,
  role: AccountRole.SENIOR_MANAGEMENT,
  divisionId: 'division-1',
  departmentId: null,
};

const teamManagerActor = {
  accountId: teamManagerUser.accountId,
  role: AccountRole.TEAM_MANAGER,
  divisionId: 'division-1',
  departmentId: 'department-1',
};

const employeeActor = {
  accountId: employeeUser.accountId,
  role: AccountRole.EMPLOYEE,
  divisionId: 'division-1',
  departmentId: 'department-1',
};

function reportTeam() {
  return {
    id: 'team-1',
    name: 'Fiber Team A',
    isActive: true,
    departmentId: 'department-1',
    department: {
      id: 'department-1',
      code: 'NET',
      name: 'Network Department',
      division: {
        id: 'division-1',
        code: 'TECH',
        name: 'Technical Division',
      },
    },
  };
}

function reportWorkRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'work-1',
    ticketNumber: 'NTW-0001',
    title: 'Install customer fiber',
    type: WorkItemType.NEW_CONNECTION,
    status: WorkItemStatus.IN_PROGRESS,
    customerName: 'Customer One',
    locationText: 'Patan',
    requestNumber: 'TOKEN-1001',
    cpcSerial: 'CPC-1001',
    serviceNumber: 'HISTORIC-SERVICE-1',
    olt: 'OLT-1',
    fdcName: 'FDC-1',
    fapName: 'FAP-1',
    createdAt: new Date('2026-08-10T04:00:00.000Z'),
    dueAt: new Date('2026-08-24T04:00:00.000Z'),
    closedAt: null,
    salesCoordinationStatus: WorkSalesCoordinationStatus.READY_FOR_SALES,
    division: { id: 'division-1', code: 'TECH', name: 'Technical Division' },
    department: { id: 'department-1', code: 'NET', name: 'Network Department' },
    assignedTeam: { id: 'team-1', name: 'Fiber Team A' },
    salesMember: {
      username: 'sales-one',
      employee: { empName: 'Sales One', empId: 'NTC-S01' },
    },
    responsibleManager: {
      username: 'manager-one',
      employee: { empName: 'Manager One', empId: 'NTC-M01' },
    },
    completionReports: [],
    assignments: [
      {
        assignmentRole: WorkAssignmentRole.PRIMARY,
        startedAt: new Date('2026-08-10T05:00:00.000Z'),
        assignee: {
          username: 'worker-one',
          employee: { empName: 'Worker One', empId: 'NTC-W01' },
        },
      },
      {
        assignmentRole: WorkAssignmentRole.SUPPORTING,
        startedAt: null,
        assignee: {
          username: 'support-one',
          employee: { empName: 'Support One', empId: 'NTC-P01' },
        },
      },
    ],
    childWorkItems: [],
    ...overrides,
  };
}

describe('WorkReportsService — final REPORT-V2 contract', () => {
  it('rejects a division filter outside Senior Management scope', async () => {
    const prisma = createPrismaMock();
    const scopeService = createScopeService(seniorManagementActor);
    const service = new WorkReportsService(prisma as never, scopeService as never);

    await expect(
      service.getSummary(seniorManagementUser, {
        from: '2026-08-01',
        to: '2026-08-23',
        divisionId: 'division-2',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.workItem.findMany).not.toHaveBeenCalled();
  });

  it('rejects a department filter outside Team Manager scope', async () => {
    const prisma = createPrismaMock();
    const scopeService = createScopeService(teamManagerActor);
    const service = new WorkReportsService(prisma as never, scopeService as never);

    await expect(
      service.getSummary(teamManagerUser, {
        from: '2026-08-01',
        to: '2026-08-23',
        departmentId: 'department-2',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.workItem.findMany).not.toHaveBeenCalled();
  });

  it('rejects a team filter outside Team Manager scope', async () => {
    const prisma = createPrismaMock();
    prisma.departmentTeam.findFirst.mockResolvedValueOnce(null);
    const scopeService = createScopeService(teamManagerActor);
    const service = new WorkReportsService(prisma as never, scopeService as never);

    await expect(
      service.getSummary(teamManagerUser, {
        from: '2026-08-01',
        to: '2026-08-23',
        teamId: 'team-2',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps employee reporting personal and does not expose organization filters', async () => {
    const prisma = createPrismaMock();
    const scopeService = createScopeService(employeeActor);
    const service = new WorkReportsService(prisma as never, scopeService as never);

    const summary = await service.getSummary(employeeUser, {
      from: '2026-08-01',
      to: '2026-08-23',
    });

    expect(summary.scope.type).toBe('PERSONAL');
    expect(summary.scope.label).toBe('Employee One');
    expect(summary.departmentOptions).toEqual([]);
    expect(summary.teamOptions).toEqual([]);
    expect(scopeService.buildVisibleWorkWhere).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: employeeUser.accountId }),
    );
  });

  it('builds the final Overview from Team ownership and counts only manager-approved CLOSED work as completed', async () => {
    const prisma = createPrismaMock();
    const scopeService = createScopeService(superAdminActor);
    const service = new WorkReportsService(prisma as never, scopeService as never);

    prisma.workItem.findMany
      .mockResolvedValueOnce([
        { createdAt: new Date('2026-08-02T04:00:00.000Z'), closedAt: new Date('2026-08-03T04:00:00.000Z') },
        { createdAt: new Date('2026-08-04T04:00:00.000Z'), closedAt: new Date('2026-08-05T04:00:00.000Z') },
        { createdAt: new Date('2026-08-06T04:00:00.000Z'), closedAt: null },
        { createdAt: new Date('2026-08-07T04:00:00.000Z'), closedAt: null },
      ])
      .mockResolvedValueOnce([
        { assignedTeamId: 'team-1', closedAt: new Date('2026-08-03T04:00:00.000Z') },
        { assignedTeamId: 'team-1', closedAt: new Date('2026-08-05T04:00:00.000Z') },
      ]);
    prisma.workItem.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2);
    prisma.departmentTeam.findMany.mockResolvedValueOnce([reportTeam()]);
    prisma.workAssignment.findMany.mockResolvedValueOnce([
      {
        workItem: {
          assignedTeamId: 'team-1',
          status: WorkItemStatus.ASSIGNED,
          dueAt: new Date('2099-01-01T00:00:00.000Z'),
          salesCoordinationStatus: null,
          completionReports: [],
        },
      },
      {
        workItem: {
          assignedTeamId: 'team-1',
          status: WorkItemStatus.IN_PROGRESS,
          dueAt: new Date('2099-01-01T00:00:00.000Z'),
          salesCoordinationStatus: null,
          completionReports: [],
        },
      },
      {
        workItem: {
          assignedTeamId: 'team-1',
          status: WorkItemStatus.IN_PROGRESS,
          dueAt: new Date('2099-01-01T00:00:00.000Z'),
          salesCoordinationStatus: WorkSalesCoordinationStatus.READY_FOR_SALES,
          completionReports: [],
        },
      },
      {
        workItem: {
          assignedTeamId: 'team-1',
          status: WorkItemStatus.COMPLETED_PENDING_REVIEW,
          dueAt: new Date('2099-01-01T00:00:00.000Z'),
          salesCoordinationStatus: null,
          completionReports: [{ reviewStatus: WorkCompletionReviewStatus.PENDING_REVIEW }],
        },
      },
      {
        workItem: {
          assignedTeamId: 'team-1',
          status: WorkItemStatus.COMPLETED_PENDING_REVIEW,
          dueAt: new Date('2020-01-01T00:00:00.000Z'),
          salesCoordinationStatus: null,
          completionReports: [{ reviewStatus: WorkCompletionReviewStatus.INFORMATION_REQUESTED }],
        },
      },
    ]);

    const summary = await service.getSummary(superAdminUser, {
      from: '2026-08-01',
      to: '2026-08-23',
    });

    expect(summary.work.totals).toEqual({ activeAtEnd: 5, completionRate: 50 });
    expect(summary.workflow).toEqual({
      newWork: 1,
      inProgress: 1,
      waitingForSales: 1,
      waitingForApproval: 1,
      returnedForCorrection: 1,
      overdue: 2,
      completedDuring: 2,
    });
    expect(summary.teams[0]).toEqual(
      expect.objectContaining({
        teamId: 'team-1',
        activeWork: 5,
        waitingForSales: 1,
        waitingForApproval: 1,
        returnedForCorrection: 1,
        completedDuring: 2,
      }),
    );
    expect(summary).not.toHaveProperty('help');
    expect(summary).not.toHaveProperty('retention');
    expect(summary).not.toHaveProperty('departments');
    expect(summary).not.toHaveProperty('assignmentFlow');
  });

  it('exports only the final Overview KPIs, workflow, attention, trend and Team performance', async () => {
    const prisma = createPrismaMock();
    const scopeService = createScopeService(superAdminActor);
    const service = new WorkReportsService(prisma as never, scopeService as never);

    prisma.workItem.findMany
      .mockResolvedValueOnce([{ createdAt: new Date('2026-08-02T04:00:00.000Z'), closedAt: null }])
      .mockResolvedValueOnce([]);
    prisma.workItem.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    prisma.workAssignment.findMany.mockResolvedValueOnce([
      {
        workItem: {
          assignedTeamId: null,
          status: WorkItemStatus.COMPLETED_PENDING_REVIEW,
          dueAt: new Date('2020-01-01T00:00:00.000Z'),
          salesCoordinationStatus: null,
          completionReports: [{ reviewStatus: WorkCompletionReviewStatus.PENDING_REVIEW }],
        },
      },
    ]);

    const exported = await service.exportCsv(superAdminUser, {
      dataset: WorkReportDataset.SUMMARY,
      from: '2026-08-01',
      to: '2026-08-23',
    });

    expect(exported.filename).toBe('report-overview-2026-08-01-to-2026-08-23.csv');
    expect(exported.content).toContain('"KPI","Need Review","1"');
    expect(exported.content).toContain('"KPI","Overdue","1"');
    expect(exported.content).toContain('"Needs Attention","Waiting for Approval","1"');
    expect(exported.content).not.toContain('Pending Help');
    expect(exported.content).not.toContain('Retention');
    expect(exported.content).not.toContain('Coverage');
  });

  it('returns canonical Work Records with Team-first ownership and Token-first/New Installation reference rules', async () => {
    const prisma = createPrismaMock();
    const scopeService = createScopeService(superAdminActor);
    const service = new WorkReportsService(prisma as never, scopeService as never);

    prisma.workItem.findMany.mockResolvedValueOnce([
      reportWorkRecord(),
      reportWorkRecord({
        id: 'work-2',
        ticketNumber: 'NTW-0002',
        title: 'Repair service',
        type: WorkItemType.TROUBLE_TICKET,
        requestNumber: null,
        cpcSerial: null,
        serviceNumber: 'SERVICE-2002',
        assignedTeam: null,
        salesMember: null,
        salesCoordinationStatus: null,
      }),
    ]);
    prisma.workItem.count.mockResolvedValueOnce(2);

    const report = await service.getDrilldown(superAdminUser, {
      dataset: WorkReportDrilldownDataset.WORK_RECORDS,
      from: '2026-08-01',
      to: '2026-08-23',
      page: 1,
      limit: 25,
    });

    const rows = report.sections.work?.rows ?? [];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        assignedTeam: { id: 'team-1', name: 'Fiber Team A' },
        primaryAssignee: 'Worker One (NTC-W01)',
        startedBy: 'Worker One (NTC-W01)',
        reference: { type: 'TOKEN_NUMBER', value: 'TOKEN-1001' },
        cpcSerial: 'CPC-1001',
        workflowStage: 'WAITING_FOR_SALES',
      }),
    );
    expect(rows[0].reference?.value).not.toBe('HISTORIC-SERVICE-1');
    expect(rows[1].reference).toEqual({
      type: 'SERVICE_NUMBER',
      value: 'SERVICE-2002',
    });
  });

  it('applies the actionable Overdue and Waiting for Sales filters to canonical Work Records', async () => {
    const prisma = createPrismaMock();
    const scopeService = createScopeService(superAdminActor);
    const service = new WorkReportsService(prisma as never, scopeService as never);

    await service.getDrilldown(superAdminUser, {
      dataset: WorkReportDrilldownDataset.WORK_RECORDS,
      from: '2026-08-01',
      to: '2026-08-23',
      workflowStage: WorkReportWorkflowStageFilter.OVERDUE,
      page: 1,
      limit: 25,
    });

    const overdueCall = prisma.workItem.findMany.mock.calls[0][0];
    expect(overdueCall.orderBy).toEqual([
      { dueAt: 'asc' },
      { ticketNumber: 'asc' },
    ]);
    expect(JSON.stringify(overdueCall.where)).toContain('dueAt');

    prisma.workItem.findMany.mockClear();
    prisma.workItem.count.mockClear();

    await service.getDrilldown(superAdminUser, {
      dataset: WorkReportDrilldownDataset.WORK_RECORDS,
      from: '2026-08-01',
      to: '2026-08-23',
      workflowStage: WorkReportWorkflowStageFilter.WAITING_FOR_SALES,
      page: 1,
      limit: 25,
    });

    const salesCall = prisma.workItem.findMany.mock.calls[0][0];
    expect(JSON.stringify(salesCall.where)).toContain(
      WorkSalesCoordinationStatus.READY_FOR_SALES,
    );
  });

  it.each<Array<{ workflowStage: WorkReportWorkflowStageFilter; expectedId: string }>>([
    {
      workflowStage: WorkReportWorkflowStageFilter.WAITING_FOR_APPROVAL,
      expectedId: 'pending-work',
    },
    {
      workflowStage: WorkReportWorkflowStageFilter.RETURNED_FOR_CORRECTION,
      expectedId: 'returned-work',
    },
  ])('filters $workflowStage using the latest manager review state', async ({ workflowStage, expectedId }) => {
    const prisma = createPrismaMock();
    const scopeService = createScopeService(superAdminActor);
    const service = new WorkReportsService(prisma as never, scopeService as never);

    prisma.workItem.findMany
      .mockResolvedValueOnce([
        {
          id: 'pending-work',
          completionReports: [{ reviewStatus: WorkCompletionReviewStatus.PENDING_REVIEW }],
        },
        {
          id: 'returned-work',
          completionReports: [{ reviewStatus: WorkCompletionReviewStatus.INFORMATION_REQUESTED }],
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.workItem.count.mockResolvedValueOnce(0);

    await service.getDrilldown(superAdminUser, {
      dataset: WorkReportDrilldownDataset.WORK_RECORDS,
      from: '2026-08-01',
      to: '2026-08-23',
      workflowStage,
      page: 1,
      limit: 25,
    });

    const recordsCall = prisma.workItem.findMany.mock.calls[1][0];
    expect(JSON.stringify(recordsCall.where)).toContain(expectedId);
  });

  it('builds the work Performance Report by date and Team across operational work types only', async () => {
    const prisma = createPrismaMock();
    const scopeService = createScopeService(superAdminActor);
    const service = new WorkReportsService(prisma as never, scopeService as never);
    const team = reportTeam();
    const assignedTeam = {
      id: team.id,
      name: team.name,
      departmentId: team.departmentId,
      department: {
        id: team.department.id,
        name: team.department.name,
        division: {
          id: team.department.division.id,
          name: team.department.division.name,
        },
      },
    };

    prisma.workItem.findMany.mockResolvedValueOnce([
      {
        id: 'routine',
        type: WorkItemType.ROUTINE_TASK,
        createdAt: new Date('2026-08-18T04:00:00.000Z'),
        closedAt: null,
        cancelledAt: null,
        requestNumber: null,
        serviceNumber: 'SERVICE-100',
        salesMemberAccountId: null,
        assignments: [{ assigneeAccountId: 'support-1' }],
        assignedTeam,
      },
      {
        id: 'trouble',
        type: WorkItemType.TROUBLE_TICKET,
        createdAt: new Date('2026-08-18T05:00:00.000Z'),
        closedAt: new Date('2026-08-19T04:00:00.000Z'),
        cancelledAt: null,
        requestNumber: null,
        serviceNumber: 'SERVICE-200',
        salesMemberAccountId: null,
        assignments: [{ assigneeAccountId: 'support-2' }],
        assignedTeam,
      },
      {
        id: 'new-installation',
        type: WorkItemType.NEW_CONNECTION,
        createdAt: new Date('2026-08-18T06:00:00.000Z'),
        closedAt: new Date('2026-08-20T04:00:00.000Z'),
        cancelledAt: null,
        requestNumber: 'TOKEN-300',
        serviceNumber: 'LEGACY-SERVICE-SHOULD-NOT-BE-USED',
        salesMemberAccountId: 'sales-1',
        assignments: [{ assigneeAccountId: 'support-1' }],
        assignedTeam,
      },
      {
        id: 'update',
        type: WorkItemType.UPDATE_SERVICES,
        createdAt: new Date('2026-08-19T04:00:00.000Z'),
        closedAt: null,
        cancelledAt: null,
        requestNumber: null,
        serviceNumber: 'SERVICE-400',
        salesMemberAccountId: 'sales-1',
        assignments: [],
        assignedTeam,
      },
      {
        id: 'administrative',
        type: WorkItemType.ADMINISTRATIVE_TASK,
        createdAt: new Date('2026-08-19T05:00:00.000Z'),
        closedAt: null,
        cancelledAt: null,
        requestNumber: null,
        serviceNumber: null,
        salesMemberAccountId: null,
        assignments: [],
        assignedTeam,
      },
    ]);

    const report = await service.getDrilldown(superAdminUser, {
      dataset: WorkReportDrilldownDataset.PERFORMANCE_REPORT,
      from: '2026-08-18',
      to: '2026-08-23',
      page: 1,
      limit: 100,
    });

    const section = report.sections.performance;
    expect(section?.rows).toHaveLength(2);
    expect(section?.rows[0]).toEqual(
      expect.objectContaining({
        date: '2026-08-18',
        team: expect.objectContaining({ id: 'team-1', name: 'Fiber Team A' }),
        supportStaffCount: 2,
        otherStaffCount: 1,
        references: ['SERVICE-100', 'SERVICE-200', 'TOKEN-300'],
        workTypes: expect.objectContaining({
          routineWork: { tickets: 1, completed: 0, pending: 1 },
          troubleTicket: { tickets: 1, completed: 1, pending: 0 },
          newInstallation: { tickets: 1, completed: 1, pending: 0 },
        }),
        total: { tickets: 3, completed: 2, pending: 1 },
      }),
    );
    expect(section?.rows[1]).toEqual(
      expect.objectContaining({
        date: '2026-08-19',
        supportStaffCount: 0,
        otherStaffCount: 1,
        references: ['SERVICE-400'],
        workTypes: expect.objectContaining({
          updateServices: { tickets: 1, completed: 0, pending: 1 },
        }),
        total: { tickets: 1, completed: 0, pending: 1 },
      }),
    );
    expect(section?.totals.total).toEqual({ tickets: 4, completed: 2, pending: 2 });
    expect(report.notice).toContain('Administrative Work is excluded');

    const where = JSON.stringify(prisma.workItem.findMany.mock.calls[0][0].where);
    expect(where).toContain('assignedTeamId');
    expect(where).toContain('parentWorkItemId');
    expect(where).toContain('ADMINISTRATIVE_TASK');
    const select = JSON.stringify(prisma.workItem.findMany.mock.calls[0][0].select);
    expect(select).toContain('requestNumber');
    expect(select).toContain('serviceNumber');
    expect(select).toContain('salesMemberAccountId');
    expect(select).toContain('SUPPORTING');
  });

  it('applies the selected operational work type to the Performance Report query', async () => {
    const prisma = createPrismaMock();
    const scopeService = createScopeService(superAdminActor);
    const service = new WorkReportsService(prisma as never, scopeService as never);

    prisma.workItem.findMany.mockResolvedValueOnce([]);

    await service.getDrilldown(superAdminUser, {
      dataset: WorkReportDrilldownDataset.PERFORMANCE_REPORT,
      from: '2026-08-18',
      to: '2026-08-23',
      type: WorkItemType.NEW_CONNECTION,
      page: 1,
      limit: 100,
    });

    const where = JSON.stringify(prisma.workItem.findMany.mock.calls[0][0].where);
    expect(where).toContain('NEW_CONNECTION');
  });

  it('returns one canonical paginated Duty dataset with the four Duty KPIs and searchable fields', async () => {
    const prisma = createPrismaMock();
    const scopeService = createScopeService(superAdminActor);
    const service = new WorkReportsService(prisma as never, scopeService as never);

    prisma.dutyAssignment.findMany
      .mockResolvedValueOnce([
        {
          id: 'duty-1',
          dutyDate: new Date('2026-08-23T00:00:00.000Z'),
          startsAt: new Date('2026-08-23T02:15:00.000Z'),
          endsAt: new Date('2026-08-23T10:15:00.000Z'),
          reportingLocation: 'Patan Exchange',
          cancelledAt: null,
          cancellationReason: null,
          shiftName: 'Day Shift',
          shift: { name: 'Day Shift' },
          division: { id: 'division-1', code: 'TECH', name: 'Technical Division' },
          department: { id: 'department-1', code: 'NET', name: 'Network Department' },
          employee: {
            role: AccountRole.EMPLOYEE,
            username: 'employee-one',
            employee: { empName: 'Employee One', empId: 'NTC-E01' },
          },
        },
      ])
      .mockResolvedValueOnce([
        { employeeAccountId: 'employee-1' },
        { employeeAccountId: 'employee-1' },
        { employeeAccountId: 'employee-2' },
      ]);
    prisma.dutyAssignment.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    prisma.dutyException.count.mockResolvedValueOnce(3);

    const report = await service.getDrilldown(superAdminUser, {
      dataset: WorkReportDrilldownDataset.DUTY_ASSIGNMENTS,
      from: '2026-08-23',
      to: '2026-08-23',
      search: 'Patan',
      page: 1,
      limit: 25,
    });

    expect(report.dutySummary).toEqual({
      scheduled: 3,
      cancelled: 2,
      uniqueEmployees: 2,
      leaveDays: 3,
    });
    expect(report.sections.duty?.rows[0]).toEqual(
      expect.objectContaining({
        employee: 'Employee One (NTC-E01)',
        shift: 'Day Shift',
        reportingLocation: 'Patan Exchange',
      }),
    );
    expect(JSON.stringify(prisma.dutyAssignment.findMany.mock.calls[0][0].where)).toContain('Patan');
  });

  it('protects CSV cells from spreadsheet formula execution on Work Records export', async () => {
    const prisma = createPrismaMock();
    const scopeService = createScopeService(superAdminActor);
    const service = new WorkReportsService(prisma as never, scopeService as never);

    prisma.workItem.count.mockResolvedValueOnce(1);
    prisma.workItem.findMany.mockResolvedValueOnce([
      {
        ticketNumber: 'NTW-0001',
        title: 'Trouble ticket',
        type: WorkItemType.TROUBLE_TICKET,
        status: WorkItemStatus.CLOSED,
        customerName: '=HYPERLINK("unsafe")',
        locationText: 'Patan',
        requestNumber: null,
        cpcSerial: null,
        serviceNumber: 'SERVICE-1',
        olt: null,
        fdcName: null,
        fapName: null,
        createdAt: new Date('2026-08-01T04:00:00.000Z'),
        dueAt: new Date('2026-08-02T04:00:00.000Z'),
        closedAt: new Date('2026-08-01T09:00:00.000Z'),
        salesCoordinationStatus: null,
        division: { code: 'TECH', name: 'Technical Division' },
        department: { code: 'NET', name: 'Network Department' },
        assignedTeam: { name: 'Fiber Team A' },
        salesMember: null,
        responsibleManager: {
          username: 'manager-one',
          employee: { empName: 'Manager One', empId: 'NTC-M01' },
        },
        completionReports: [{ reviewStatus: WorkCompletionReviewStatus.ACCEPTED }],
        assignments: [
          {
            startedAt: new Date('2026-08-01T05:00:00.000Z'),
            assignee: {
              username: 'worker-one',
              employee: { empName: 'Worker One', empId: 'NTC-W01' },
            },
          },
        ],
      },
    ]);

    const exported = await service.exportCsv(superAdminUser, {
      dataset: WorkReportDataset.WORK_RECORDS,
      from: '2026-08-01',
      to: '2026-08-23',
    });

    expect(exported.filename).toBe('work-records-2026-08-01-to-2026-08-23.csv');
    expect(exported.content).toContain("'=HYPERLINK");
    expect(exported.content).toContain('SERVICE_NUMBER');
    expect(exported.content).toContain('Manager One (NTC-M01)');
    expect(exported.content.split('\r\n')[0]).not.toContain('"Work",');
    expect(prisma.workItem.findMany.mock.calls[0][0].take).toBeUndefined();
    expect(exported.truncated).toBe(false);
  });
});
