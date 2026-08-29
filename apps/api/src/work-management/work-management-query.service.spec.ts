import type { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  DepartmentWorkFunction,
  ManagementPositionType,
  WorkItemStatus,
  WorkSalesCoordinationStatus,
} from '../generated/prisma/enums';
import { WorkManagementQueryService } from './work-management-query.service';
import type { WorkScopeService } from './work-scope.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

function createCandidate(id: string, role: AccountRole = AccountRole.EMPLOYEE) {
  return {
    id,
    role,
    username: `${id}@ntc.test`,
    employee: {
      id: `employee-${id}`,
      empId: `NTC-${id.toUpperCase()}`,
      empName: id,
      designation: role === AccountRole.EMPLOYEE ? 'Technician' : 'Manager',
      divisionId: 'division-a',
      departmentId: 'department-a',
      division: {
        id: 'division-a',
        code: 'DIV-A',
        name: 'Division A',
      },
      departmentUnit: {
        id: 'department-a',
        divisionId: 'division-a',
        code: 'NET',
        name: 'Network',
        workFunction: DepartmentWorkFunction.GENERAL as DepartmentWorkFunction,
      },
      managementAssignments:
        role === AccountRole.EMPLOYEE
          ? []
          : [
              {
                position: {
                  positionType:
                    role === AccountRole.SENIOR_MANAGEMENT
                      ? ManagementPositionType.SENIOR_MANAGEMENT
                      : ManagementPositionType.TEAM_MANAGER,
                  divisionId: 'division-a',
                  departmentId:
                    role === AccountRole.SENIOR_MANAGEMENT
                      ? null
                      : 'department-a',
                  isActive: true,
                },
              },
            ],
    },
  };
}

describe('WorkManagementQueryService M20 Phase 4', () => {
  const prisma = {
    workItem: {
      count: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    account: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    division: {
      findMany: jest.fn(),
    },
    department: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    departmentTeam: {
      findMany: jest.fn(),
    },
    workAssignment: {
      findMany: jest.fn(),
    },
  } as unknown as PrismaService;
  const scope = {
    resolveActorContext: jest.fn(),
    assertCanManageWork: jest.fn(),
    buildVisibleWorkWhere: jest.fn(),
    buildOrganizationHierarchyWorkWhere: jest.fn(),
  } as unknown as WorkScopeService;
  const service = new WorkManagementQueryService(prisma, scope);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(prisma.department.findFirst).mockResolvedValue({
      divisionId: 'division-a',
    } as never);
  });

  it('returns a scope-safe management summary', async () => {
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
      .mocked(prisma.workItem.count)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    jest
      .mocked(prisma.workItem.findMany)
      .mockResolvedValueOnce([
        {
          id: 'review-1',
          ticketNumber: 'NT-PAT-NET-2026-000101',
          status: WorkItemStatus.COMPLETED_PENDING_REVIEW,
        },
      ] as never)
      .mockResolvedValueOnce([] as never);

    const result = await service.getDashboardSummary({
      accountId: actor.accountId,
      sessionId: 'session',
      username: 'manager@ntc.test',
      role: actor.role,
    });

    expect(scope.assertCanManageWork).toHaveBeenCalledWith(actor);
    expect(result.scope).toEqual(
      expect.objectContaining({
        type: 'DEPARTMENT',
        departmentId: 'department-a',
      }),
    );
    expect(result.totals).toEqual(
      expect.objectContaining({
        open: 8,
        waitingForReview: 2,
        overdue: 1,
      }),
    );
    expect(result.nextReview).toHaveLength(1);
  });

  it('returns a branch-wide organization summary for Super Admin using grouped work counts', async () => {
    const actor = {
      accountId: 'super-admin',
      role: AccountRole.SUPER_ADMIN,
      divisionId: null,
      departmentId: null,
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.buildOrganizationHierarchyWorkWhere).mockReturnValue({});
    jest.mocked(prisma.division.findMany).mockResolvedValue([
      { id: 'division-a', code: 'DIV-A', name: 'Division A' },
      { id: 'division-b', code: 'DIV-B', name: 'Division B' },
    ] as never);
    jest.mocked(prisma.department.findMany).mockResolvedValue([
      {
        id: 'department-a',
        divisionId: 'division-a',
        code: 'NET',
        name: 'Network',
        workFunction: DepartmentWorkFunction.FIELD_OPERATIONS,
      },
      {
        id: 'department-b',
        divisionId: 'division-b',
        code: 'SALES',
        name: 'Sales',
        workFunction: DepartmentWorkFunction.GENERAL,
      },
    ] as never);
    jest.mocked(prisma.departmentTeam.findMany).mockResolvedValue([
      {
        id: 'team-a',
        departmentId: 'department-a',
        name: 'Team A',
        _count: { members: 4 },
      },
      {
        id: 'team-b',
        departmentId: 'department-b',
        name: 'Team B',
        _count: { members: 3 },
      },
    ] as never);
    jest
      .mocked(prisma.workItem.groupBy)
      .mockResolvedValueOnce([
        {
          divisionId: 'division-a',
          departmentId: 'department-a',
          assignedTeamId: 'team-a',
          status: WorkItemStatus.ASSIGNED,
          salesCoordinationStatus:
            WorkSalesCoordinationStatus.WAITING_FOR_DOCUMENTS,
          _count: { _all: 2 },
        },
        {
          divisionId: 'division-a',
          departmentId: 'department-a',
          assignedTeamId: 'team-a',
          status: WorkItemStatus.IN_PROGRESS,
          salesCoordinationStatus: WorkSalesCoordinationStatus.COMPLETED,
          _count: { _all: 3 },
        },
        {
          divisionId: 'division-b',
          departmentId: 'department-b',
          assignedTeamId: 'team-b',
          status: WorkItemStatus.COMPLETED_PENDING_REVIEW,
          salesCoordinationStatus: null,
          _count: { _all: 1 },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          divisionId: 'division-a',
          departmentId: 'department-a',
          assignedTeamId: 'team-a',
          _count: { _all: 1 },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          divisionId: 'division-b',
          departmentId: 'department-b',
          assignedTeamId: 'team-b',
          _count: { _all: 4 },
        },
      ] as never);

    const result = await service.getOrganizationSummary({
      accountId: actor.accountId,
      sessionId: 'session',
      username: 'superadmin@ntc.test',
      role: actor.role,
    });

    expect(scope.buildOrganizationHierarchyWorkWhere).toHaveBeenCalledWith(actor);
    expect(result.scope.type).toBe('ORGANIZATION');
    expect(result.organization).toEqual({
      divisionCount: 2,
      departmentCount: 2,
      teamCount: 2,
    });
    expect(result.totals).toEqual({
      active: 6,
      newWork: 2,
      inProgress: 3,
      waitingForSales: 2,
      waitingForApproval: 1,
      overdue: 1,
      completedToday: 4,
    });
    expect(result.divisions[0].departments[0].teams[0]).toEqual(
      expect.objectContaining({
        id: 'team-a',
        memberCount: 4,
        totals: expect.objectContaining({ active: 5, waitingForSales: 2 }),
      }),
    );
  });

  it('restricts the organization hierarchy to the Senior Management division', async () => {
    const actor = {
      accountId: 'senior',
      role: AccountRole.SENIOR_MANAGEMENT,
      divisionId: 'division-a',
      departmentId: null,
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest
      .mocked(scope.buildOrganizationHierarchyWorkWhere)
      .mockReturnValue({ divisionId: 'division-a' });
    jest.mocked(prisma.division.findMany).mockResolvedValue([
      { id: 'division-a', code: 'DIV-A', name: 'Division A' },
    ] as never);
    jest.mocked(prisma.department.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.departmentTeam.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.workItem.groupBy).mockResolvedValue([] as never);

    const result = await service.getOrganizationSummary({
      accountId: actor.accountId,
      sessionId: 'session',
      username: 'senior@ntc.test',
      role: actor.role,
    });

    expect(result.scope.type).toBe('DIVISION');
    expect(prisma.division.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true, id: 'division-a' } }),
    );
    expect(prisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, divisionId: 'division-a' },
      }),
    );
  });

  it('restricts the organization hierarchy to the Team Manager department', async () => {
    const actor = {
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest
      .mocked(scope.buildOrganizationHierarchyWorkWhere)
      .mockReturnValue({ departmentId: 'department-a' });
    jest.mocked(prisma.division.findMany).mockResolvedValue([
      { id: 'division-a', code: 'DIV-A', name: 'Division A' },
    ] as never);
    jest.mocked(prisma.department.findMany).mockResolvedValue([
      {
        id: 'department-a',
        divisionId: 'division-a',
        code: 'NET',
        name: 'Network',
        workFunction: DepartmentWorkFunction.FIELD_OPERATIONS,
      },
    ] as never);
    jest.mocked(prisma.departmentTeam.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.workItem.groupBy).mockResolvedValue([] as never);

    const result = await service.getOrganizationSummary({
      accountId: actor.accountId,
      sessionId: 'session',
      username: 'manager@ntc.test',
      role: actor.role,
    });

    expect(result.scope.type).toBe('DEPARTMENT');
    expect(prisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, id: 'department-a' },
      }),
    );
    expect(prisma.departmentTeam.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ departmentId: 'department-a' }),
      }),
    );
  });

  it('rejects organization summaries for Employee accounts', async () => {
    const actor = {
      accountId: 'employee',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(scope.assertCanManageWork).mockImplementationOnce(() => {
      throw new Error('Employees cannot manage another employee work assignment.');
    });

    await expect(
      service.getOrganizationSummary({
        accountId: actor.accountId,
        sessionId: 'session',
        username: 'employee@ntc.test',
        role: actor.role,
      }),
    ).rejects.toThrow('Employees cannot manage');
  });

  it('returns assignable employees with workload warnings', async () => {
    const actor = {
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    const employee = createCandidate('ram');
    const manager = createCandidate('manager', AccountRole.TEAM_MANAGER);
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest
      .mocked(prisma.account.findMany)
      .mockResolvedValueOnce([employee] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    jest.mocked(prisma.account.count).mockResolvedValue(1);
    jest.mocked(prisma.account.findUnique).mockResolvedValue(manager as never);
    jest.mocked(prisma.departmentTeam.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.department.findMany).mockResolvedValue([
      {
        id: 'department-a',
        divisionId: 'division-a',
        code: 'NET',
        name: 'Network',
        workFunction: DepartmentWorkFunction.FIELD_OPERATIONS,
        division: {
          id: 'division-a',
          code: 'DIV-A',
          name: 'Division A',
        },
      },
    ] as never);
    jest.mocked(prisma.workAssignment.findMany).mockResolvedValue([
      {
        assigneeAccountId: 'ram',
        workItem: {
          status: WorkItemStatus.IN_PROGRESS,
          dueAt: new Date(Date.now() - 60_000),
          completionReports: [],
        },
      },
    ] as never);

    const result = await service.listAssignmentOptions(
      {
        accountId: actor.accountId,
        sessionId: 'session',
        username: 'manager@ntc.test',
        role: actor.role,
      },
      {
        page: 1,
        limit: 25,
        departmentId: 'department-a',
      },
    );

    expect(result.data[0]).toEqual(
      expect.objectContaining({
        account: expect.objectContaining({ id: 'ram' }),
        workload: expect.objectContaining({
          active: 1,
          overdue: 1,
          level: 'OVERLOADED',
        }),
      }),
    );
    expect(result.responsibleManagers[0].account.id).toBe('manager');
    expect(result.teams).toEqual([]);
    expect(result.salesMembers).toEqual([]);
    expect(result.supportMembers).toEqual([]);
    expect(prisma.department.findFirst).toHaveBeenCalledWith({
      where: { id: 'department-a', isActive: true },
      select: { divisionId: true },
    });
    expect(prisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, divisionId: 'division-a' },
      }),
    );
    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: { in: [AccountRole.EMPLOYEE] },
        }),
      }),
    );
  });

  it('rejects a department-first filter outside a Team Manager division', async () => {
    const actor = {
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest.mocked(prisma.department.findFirst).mockResolvedValue({
      divisionId: 'division-b',
    } as never);

    await expect(
      service.listAssignmentOptions(
        {
          accountId: actor.accountId,
          sessionId: 'session',
          username: 'manager@ntc.test',
          role: actor.role,
        },
        { page: 1, limit: 25, departmentId: 'department-b' },
      ),
    ).rejects.toThrow(
      'The selected department is outside your authorized division.',
    );
  });

  it('returns active teams and cross-department collaborators without name or function assumptions', async () => {
    const actor = {
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    };
    const employee = createCandidate('field-worker');
    const sales = createCandidate('sales-member');
    sales.employee.designation = 'Sales Officer';
    sales.employee.departmentId = 'sales-department';
    sales.employee.departmentUnit.id = 'sales-department';
    sales.employee.departmentUnit.code = 'SALES';
    sales.employee.departmentUnit.name = 'Sales';
    const support = createCandidate('support-member');
    support.employee.departmentId = 'support-department';
    support.employee.departmentUnit.id = 'support-department';
    support.employee.departmentUnit.code = 'SUPPORT';
    support.employee.departmentUnit.name = 'Support';
    const manager = createCandidate('manager', AccountRole.TEAM_MANAGER);
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest
      .mocked(prisma.account.findMany)
      .mockResolvedValueOnce([employee] as never)
      .mockResolvedValueOnce([sales] as never)
      .mockResolvedValueOnce([support] as never);
    jest.mocked(prisma.account.count).mockResolvedValue(1);
    jest.mocked(prisma.account.findUnique).mockResolvedValue(manager as never);
    jest.mocked(prisma.department.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.departmentTeam.findMany).mockResolvedValue([
      {
        id: 'team-a',
        name: 'Installation Team A',
        departmentId: 'department-a',
        isActive: true,
        archivedAt: null,
        department: {
          id: 'department-a',
          divisionId: 'division-a',
          code: 'NET',
          name: 'Network',
          workFunction: DepartmentWorkFunction.FIELD_OPERATIONS,
          division: { id: 'division-a', code: 'DIV-A', name: 'Division A' },
        },
        teamAdmin: {
          id: 'employee-field-worker',
          empId: 'NTC-FIELD-WORKER',
          empName: 'field-worker',
          designation: 'Technician',
          account: employee,
        },
        members: [
          { employee: { account: { id: 'field-worker' } } },
          { employee: { account: { id: 'team-member-2' } } },
          { employee: { account: null } },
        ],
        _count: { members: 3 },
      },
    ] as never);
    jest.mocked(prisma.workAssignment.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.workItem.findMany)
      .mockResolvedValueOnce([
        {
          assignedTeamId: 'team-a',
          dueAt: new Date(Date.now() + 60_000),
          status: WorkItemStatus.IN_PROGRESS,
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          salesMemberAccountId: 'sales-member',
          dueAt: new Date(Date.now() - 60_000),
          status: WorkItemStatus.IN_PROGRESS,
        },
      ] as never);

    const result = await service.listAssignmentOptions(
      {
        accountId: actor.accountId,
        sessionId: 'session',
        username: 'manager@ntc.test',
        role: actor.role,
      },
      { page: 1, limit: 25 },
    );

    expect(result.teams[0]).toEqual(
      expect.objectContaining({
        id: 'team-a',
        memberCount: 3,
        memberAccountIds: ['field-worker', 'team-member-2'],
        workload: expect.objectContaining({ active: 1, overdue: 0 }),
      }),
    );
    expect(result.salesMembers[0]).toEqual(
      expect.objectContaining({
        account: expect.objectContaining({ id: 'sales-member' }),
        department: expect.objectContaining({ id: 'sales-department' }),
        workload: expect.objectContaining({ active: 1, overdue: 1 }),
      }),
    );
    expect(result.supportMembers[0]).toEqual(
      expect.objectContaining({
        account: expect.objectContaining({ id: 'support-member' }),
        department: expect.objectContaining({ id: 'support-department' }),
      }),
    );
    expect(prisma.account.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          role: AccountRole.EMPLOYEE,
          employee: {
            is: expect.objectContaining({
              divisionId: 'division-a',
              departmentUnit: {
                is: expect.objectContaining({
                  isActive: true,
                }),
              },
            }),
          },
        }),
      }),
    );
    expect(prisma.account.findMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: expect.objectContaining({
          role: AccountRole.EMPLOYEE,
          employee: {
            is: expect.objectContaining({
              divisionId: 'division-a',
              departmentUnit: {
                is: expect.objectContaining({
                  isActive: true,
                }),
              },
            }),
          },
        }),
      }),
    );
  });


  it('applies the Senior Management division scope to every organization work-count query', async () => {
    const actor = {
      accountId: 'senior',
      role: AccountRole.SENIOR_MANAGEMENT,
      divisionId: 'division-a',
      departmentId: null,
    };
    jest.mocked(scope.resolveActorContext).mockResolvedValue(actor);
    jest
      .mocked(scope.buildOrganizationHierarchyWorkWhere)
      .mockReturnValue({ divisionId: 'division-a' });
    jest.mocked(prisma.division.findMany).mockResolvedValue([
      { id: 'division-a', code: 'DIV-A', name: 'Division A' },
    ] as never);
    jest.mocked(prisma.department.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.departmentTeam.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.workItem.groupBy).mockResolvedValue([] as never);

    await service.getOrganizationSummary({
      accountId: actor.accountId,
      sessionId: 'session',
      username: 'senior@ntc.test',
      role: actor.role,
    });

    expect(prisma.workItem.groupBy).toHaveBeenCalledTimes(3);
    for (const [call] of jest.mocked(prisma.workItem.groupBy).mock.calls) {
      expect(call).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([{ divisionId: 'division-a' }]),
          }),
        }),
      );
    }
  });

});
