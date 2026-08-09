import {
  AccountRole,
  WorkAssignmentRole,
  WorkItemStatus,
  WorkItemType,
} from '../generated/prisma/enums';
import { PerformanceReportsService } from './performance-reports.service';

function createPrismaMock() {
  return {
    division: {
      findUnique: jest.fn().mockResolvedValue({ id: 'division-a', isActive: true }),
      findMany: jest.fn().mockResolvedValue([
        { id: 'division-a', code: 'DIV-A', name: 'Division A' },
      ]),
    },
    department: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'department-a',
        divisionId: 'division-a',
        name: 'Department A',
        isActive: true,
      }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'department-a',
          divisionId: 'division-a',
          code: 'DEP-A',
          name: 'Department A',
          division: { id: 'division-a', code: 'DIV-A', name: 'Division A' },
        },
      ]),
    },
    account: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    workItem: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    dutyAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    dutyException: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

describe('PerformanceReportsService', () => {
  it('returns a department-scoped report with clean empty tables', async () => {
    const prisma = createPrismaMock();
    const workScopeService = {
      resolveActorContext: jest.fn().mockResolvedValue({
        accountId: 'manager-a',
        role: AccountRole.TEAM_MANAGER,
        divisionId: 'division-a',
        departmentId: 'department-a',
      }),
    };
    const service = new PerformanceReportsService(
      prisma as never,
      workScopeService as never,
    );

    const result = await service.getReport(
      { accountId: 'manager-a', role: AccountRole.TEAM_MANAGER } as never,
      { from: '2026-07-28', to: '2026-07-28' },
    );

    expect(result.scope).toEqual(
      expect.objectContaining({
        role: AccountRole.TEAM_MANAGER,
        divisionId: 'division-a',
        departmentId: 'department-a',
      }),
    );
    expect(result.summaryRows).toEqual([]);
    expect(result.workDetails).toEqual([]);
    expect(result.dutySummary).toEqual([]);
    expect(result.dutyDetails).toEqual([]);
    expect(prisma.workItem.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.dutyAssignment.findMany).toHaveBeenCalledTimes(1);
  });

  it('keeps team work in one main detail row and keeps support separate', async () => {
    const prisma = createPrismaMock();
    const division = { id: 'division-a', code: 'DIV-A', name: 'Division A' };
    const department = {
      id: 'department-a',
      code: 'DEP-A',
      name: 'Department A',
      divisionId: 'division-a',
    };
    const person = (
      id: string,
      name: string,
      role: AccountRole,
      employeeId: string,
    ) => ({
      id,
      role,
      username: `${id}@example.com`,
      employee: {
        empId: employeeId,
        empName: name,
        designation: role,
        divisionId: division.id,
        departmentId: department.id,
        division,
        departmentUnit: department,
      },
    });
    const superAdmin = person('super', 'Super Admin', AccountRole.SUPER_ADMIN, 'SA-1');
    const senior = person('senior', 'Bikash Sah', AccountRole.SENIOR_MANAGEMENT, 'SM-1');
    const manager = person('manager', 'Test2', AccountRole.TEAM_MANAGER, 'TM-1');
    const employee = person('employee', 'Test5', AccountRole.EMPLOYEE, 'E-2');
    const support = person('support', 'Support Staff', AccountRole.EMPLOYEE, 'E-1');
    const createdAt = new Date('2026-07-28T04:00:00.000Z');
    const dueAt = new Date('2026-07-29T04:00:00.000Z');
    const base = {
      type: WorkItemType.NEW_CONNECTION,
      status: WorkItemStatus.IN_PROGRESS,
      plannedStartAt: createdAt,
      dueAt,
      completedAt: null,
      closedAt: null,
      cancelledAt: null,
      createdAt,
      division,
      department,
    };
    prisma.account.findMany.mockResolvedValue([senior, manager, employee, support]);
    prisma.workItem.findMany.mockResolvedValue([
      {
        ...base,
        id: 'root-work',
        ticketNumber: 'NT-PAT-001',
        title: 'New installation',
        parentWorkItemId: null,
        serviceNumber: 'FTTH-1001',
        createdBy: superAdmin,
        assignments: [
          {
            id: 'root-primary',
            assignmentRole: WorkAssignmentRole.PRIMARY,
            createdAt,
            endedAt: null,
            assignee: senior,
            assignedBy: superAdmin,
          },
          {
            id: 'root-support',
            assignmentRole: WorkAssignmentRole.SUPPORTING,
            createdAt,
            endedAt: null,
            assignee: support,
            assignedBy: superAdmin,
          },
        ],
      },
      {
        ...base,
        id: 'child-work',
        ticketNumber: 'NT-PAT-002',
        title: 'Install at customer site',
        parentWorkItemId: 'root-work',
        serviceNumber: 'FTTH-1002',
        createdBy: senior,
        assignments: [
          {
            id: 'child-primary',
            assignmentRole: WorkAssignmentRole.PRIMARY,
            createdAt,
            endedAt: null,
            assignee: manager,
            assignedBy: senior,
          },
        ],
      },
      {
        ...base,
        id: 'grandchild-work',
        ticketNumber: 'NT-PAT-003',
        title: 'Complete customer installation',
        parentWorkItemId: 'child-work',
        serviceNumber: 'FTTH-1003',
        createdBy: manager,
        assignments: [
          {
            id: 'grandchild-primary',
            assignmentRole: WorkAssignmentRole.PRIMARY,
            createdAt,
            endedAt: null,
            assignee: employee,
            assignedBy: manager,
          },
        ],
      },
    ]);
    const workScopeService = {
      resolveActorContext: jest.fn().mockResolvedValue({
        accountId: 'manager-a',
        role: AccountRole.TEAM_MANAGER,
        divisionId: 'division-a',
        departmentId: 'department-a',
      }),
    };
    const service = new PerformanceReportsService(
      prisma as never,
      workScopeService as never,
    );

    const result = await service.getReport(
      { accountId: 'manager-a', role: AccountRole.TEAM_MANAGER } as never,
      { from: '2026-07-28', to: '2026-07-28' },
    );

    expect(result.summaryRows).toHaveLength(3);
    expect(result.workDetails).toHaveLength(1);
    expect(result.workDetails[0]?.supportingStaff).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Test2' }),
        expect.objectContaining({ name: 'Test5' }),
      ]),
    );
    expect(result.workDetails[0]).toEqual(
      expect.objectContaining({
        ticketNumber: 'NT-PAT-001',
        serviceNumbers: ['FTTH-1001', 'FTTH-1002', 'FTTH-1003'],
        supportingStaff: [expect.objectContaining({ name: 'Support Staff' })],
        workAssignmentPaths: [
          [
            expect.objectContaining({ name: 'Super Admin' }),
            expect.objectContaining({ name: 'Bikash Sah' }),
            expect.objectContaining({ name: 'Test2' }),
            expect.objectContaining({ name: 'Test5' }),
          ],
        ],
      }),
    );
  });

});
