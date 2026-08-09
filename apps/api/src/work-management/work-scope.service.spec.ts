import { ForbiddenException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import type { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  DepartmentWorkFunction,
  EmployeeStatus,
  EmploymentStatus,
  ManagementPositionType,
  WorkItemStatus,
} from '../generated/prisma/enums';
import { WorkScopeService } from './work-scope.service';

// Replace the database runtime token with a lightweight unit-test double.
jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

// Focused scope tests need generated enums but do not execute Prisma queries.
jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

function createAccount(input: {
  id: string;
  role: AccountRole;
  divisionId?: string;
  departmentId?: string | null;
  workFunction?: DepartmentWorkFunction;
}) {
  const isManager =
    input.role === AccountRole.SENIOR_MANAGEMENT ||
    input.role === AccountRole.TEAM_MANAGER;
  const positionType =
    input.role === AccountRole.SENIOR_MANAGEMENT
      ? ManagementPositionType.SENIOR_MANAGEMENT
      : ManagementPositionType.TEAM_MANAGER;

  const departmentId =
    input.departmentId === undefined ? 'department-a' : input.departmentId;

  return {
    id: input.id,
    role: input.role,
    isEnabled: true,
    username: `${input.id}@ntc.test`,
    employee:
      input.role === AccountRole.SUPER_ADMIN
        ? null
        : {
            id: `employee-${input.id}`,
            empId: `NTC-${input.id}`,
            empName: input.id,
            designation: null,
            status: EmployeeStatus.ACTIVE,
            employmentStatus: EmploymentStatus.ACTIVE,
            archivedAt: null,
            isActivated: true,
            divisionId: input.divisionId ?? 'division-a',
            departmentId,
            division: {
              id: input.divisionId ?? 'division-a',
              code: 'DIV-A',
              name: 'Division A',
              isActive: true,
            },
            departmentUnit: departmentId
              ? {
                  id: departmentId,
                  divisionId: input.divisionId ?? 'division-a',
                  code: 'NET',
                  name: 'Network',
                  workFunction:
                    input.workFunction ?? DepartmentWorkFunction.GENERAL,
                  isActive: true,
                }
              : null,
            managementAssignments: isManager
              ? [
                  {
                    id: `assignment-${input.id}`,
                    position: {
                      id: `position-${input.id}`,
                      positionType,
                      divisionId: input.divisionId ?? 'division-a',
                      departmentId:
                        input.role === AccountRole.TEAM_MANAGER
                          ? departmentId
                          : null,
                      isActive: true,
                    },
                  },
                ]
              : [],
          },
  };
}

describe('WorkScopeService', () => {
  const prisma = {
    account: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    departmentTeam: {
      findUnique: jest.fn(),
    },
  } as unknown as PrismaService;
  const service = new WorkScopeService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows division-scoped Senior Management without a department assignment', async () => {
    const senior = createAccount({
      id: 'senior',
      role: AccountRole.SENIOR_MANAGEMENT,
      divisionId: 'division-a',
      departmentId: null,
    });
    jest.mocked(prisma.account.findUnique).mockResolvedValue(senior as never);

    await expect(
      service.resolveActorContext({
        accountId: senior.id,
        sessionId: 'session',
        username: senior.username,
        role: senior.role,
      }),
    ).resolves.toEqual({
      accountId: senior.id,
      role: AccountRole.SENIOR_MANAGEMENT,
      divisionId: 'division-a',
      departmentId: null,
    });
  });

  it('allows a division-scoped Senior Manager to remain the responsible reviewer', async () => {
    const senior = createAccount({
      id: 'senior-reviewer',
      role: AccountRole.SENIOR_MANAGEMENT,
      divisionId: 'division-a',
      departmentId: null,
    });
    jest.mocked(prisma.account.findUnique).mockResolvedValue(senior as never);

    await expect(
      service.resolveResponsibleManager(
        {
          accountId: senior.id,
          role: AccountRole.SENIOR_MANAGEMENT,
          divisionId: 'division-a',
          departmentId: null,
        },
        undefined,
        'division-a',
        'department-a',
      ),
    ).resolves.toEqual(senior);
  });

  it('still rejects a Team Manager without an active department assignment', async () => {
    const manager = createAccount({
      id: 'manager-without-department',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: null,
    });
    jest.mocked(prisma.account.findUnique).mockResolvedValue(manager as never);

    await expect(
      service.resolveActorContext({
        accountId: manager.id,
        sessionId: 'session',
        username: manager.username,
        role: manager.role,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a Team Manager assign active employees in the same division', async () => {
    const manager = createAccount({
      id: 'manager',
      role: AccountRole.TEAM_MANAGER,
      departmentId: 'department-a',
    });
    const employee = createAccount({
      id: 'employee',
      role: AccountRole.EMPLOYEE,
      departmentId: 'department-a',
    });
    jest.mocked(prisma.account.findUnique).mockResolvedValue(manager as never);
    jest.mocked(prisma.account.findMany).mockResolvedValue([employee] as never);

    const actor = await service.resolveActorContext({
      accountId: manager.id,
      sessionId: 'session',
      username: manager.username,
      role: manager.role,
    });
    const resolved = await service.resolveAssignableAccounts(actor, [
      employee.id,
    ]);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.id).toBe(employee.id);
  });

  it('lets a Team Manager assign an employee from a sibling department in the same division', async () => {
    const employee = createAccount({
      id: 'employee',
      role: AccountRole.EMPLOYEE,
      departmentId: 'department-b',
    });
    jest.mocked(prisma.account.findMany).mockResolvedValue([employee] as never);

    const resolved = await service.resolveAssignableAccounts(
      {
        accountId: 'manager',
        role: AccountRole.TEAM_MANAGER,
        divisionId: 'division-a',
        departmentId: 'department-a',
      },
      [employee.id],
    );

    expect(resolved[0]?.id).toBe(employee.id);
  });

  it('rejects a Team Manager assigning an employee from another division', async () => {
    const employee = createAccount({
      id: 'employee',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-b',
      departmentId: 'department-b',
    });
    jest.mocked(prisma.account.findMany).mockResolvedValue([employee] as never);

    await expect(
      service.resolveAssignableAccounts(
        {
          accountId: 'manager',
          role: AccountRole.TEAM_MANAGER,
          divisionId: 'division-a',
          departmentId: 'department-a',
        },
        [employee.id],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets Super Admin assign division-level work directly to Senior Management', async () => {
    const senior = createAccount({
      id: 'senior-assignee',
      role: AccountRole.SENIOR_MANAGEMENT,
      divisionId: 'division-a',
      departmentId: null,
    });
    jest.mocked(prisma.account.findMany).mockResolvedValue([senior] as never);

    await expect(
      service.resolveAssignableAccounts(
        {
          accountId: 'super-admin',
          role: AccountRole.SUPER_ADMIN,
          divisionId: null,
          departmentId: null,
        },
        [senior.id],
      ),
    ).resolves.toEqual([senior]);
  });

  it('keeps division-level primary reassignment with Senior Management in the same division', async () => {
    const senior = createAccount({
      id: 'replacement-senior',
      role: AccountRole.SENIOR_MANAGEMENT,
      divisionId: 'division-a',
      departmentId: null,
    });
    jest.mocked(prisma.account.findMany).mockResolvedValue([senior] as never);

    await expect(
      service.resolvePrimaryReassignmentAccount(
        {
          accountId: 'super-admin',
          role: AccountRole.SUPER_ADMIN,
          divisionId: null,
          departmentId: null,
        },
        senior.id,
        'division-a',
        null,
      ),
    ).resolves.toEqual(senior);
  });

  it('lets Senior Management see only its division', () => {
    expect(
      service.buildVisibleWorkWhere({
        accountId: 'senior',
        role: AccountRole.SENIOR_MANAGEMENT,
        divisionId: 'division-a',
        departmentId: 'department-a',
      }),
    ).toEqual({ divisionId: 'division-a' });
  });

  it('keeps Employee visibility assignment-scoped', () => {
    expect(
      service.buildVisibleWorkWhere({
        accountId: 'employee',
        role: AccountRole.EMPLOYEE,
        divisionId: 'division-a',
        departmentId: 'department-a',
      }),
    ).toEqual({
      OR: [
        {
          assignments: {
            some: {
              assigneeAccountId: 'employee',
              endedAt: null,
            },
          },
        },
        {
          status: {
            in: [WorkItemStatus.CLOSED, WorkItemStatus.CANCELLED],
          },
          assignments: {
            some: {
              assigneeAccountId: 'employee',
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
                      account: { is: { id: 'employee' } },
                    },
                  },
                },
              },
            },
          },
        },
        {
          salesMemberAccountId: 'employee',
        },
      ],
    });
  });


  it('resolves an active team only inside the manager organization scope', async () => {
    const admin = createAccount({
      id: 'team-admin',
      role: AccountRole.EMPLOYEE,
      departmentId: 'department-a',
    });
    const team = {
      id: 'team-a',
      name: 'Network Team A',
      departmentId: 'field-department',
      teamAdminEmployeeId: admin.employee.id,
      isActive: true,
      archivedAt: null,
      department: {
        id: 'field-department',
        divisionId: 'division-a',
        code: 'NET',
        name: 'Network',
        workFunction: DepartmentWorkFunction.FIELD_OPERATIONS,
        isActive: true,
        division: {
          id: 'division-a',
          code: 'DIV-A',
          name: 'Division A',
          isActive: true,
        },
      },
      teamAdmin: { id: admin.employee.id, account: admin },
      members: [
        { employee: { id: admin.employee.id, account: admin } },
      ],
    };
    jest.mocked(prisma.departmentTeam.findUnique).mockResolvedValue(team as never);

    await expect(
      service.resolveAssignableTeam(
        {
          accountId: 'manager',
          role: AccountRole.TEAM_MANAGER,
          divisionId: 'division-a',
          departmentId: 'department-a',
        },
        team.id,
      ),
    ).resolves.toEqual(team);
  });

  it('allows a Team Manager to select an active Sales collaborator from any department in the same division', async () => {
    const sales = createAccount({
      id: 'sales-member',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-a',
      departmentId: 'sales-department',
      workFunction: DepartmentWorkFunction.SALES,
    });
    jest.mocked(prisma.account.findUnique).mockResolvedValue(sales as never);

    await expect(
      service.resolveSalesMember(
        {
          accountId: 'manager',
          role: AccountRole.TEAM_MANAGER,
          divisionId: 'division-a',
          departmentId: 'network-department',
        },
        sales.id,
        'division-a',
      ),
    ).resolves.toEqual(sales);
  });

  it('rejects a Sales collaborator outside the assigned work division', async () => {
    const outsideEmployee = createAccount({
      id: 'outside-collaborator',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-b',
      departmentId: 'department-b',
    });
    jest.mocked(prisma.account.findUnique).mockResolvedValueOnce(
      outsideEmployee as never,
    );

    await expect(
      service.resolveSalesMember(
        {
          accountId: 'manager',
          role: AccountRole.TEAM_MANAGER,
          divisionId: 'division-a',
          departmentId: 'department-a',
        },
        outsideEmployee.id,
        'division-a',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows Supporting Staff from any active department inside the selected work division', async () => {
    const support = createAccount({
      id: 'support-member',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-a',
      departmentId: 'any-department',
    });
    jest.mocked(prisma.account.findMany).mockResolvedValue([support] as never);

    await expect(
      service.resolveSupportMembers(
        {
          accountId: 'manager',
          role: AccountRole.TEAM_MANAGER,
          divisionId: 'division-a',
          departmentId: 'creator-department',
        },
        [support.id],
        'division-a',
      ),
    ).resolves.toEqual([support]);
  });

  it('does not allow an Employee to create work', () => {
    expect(() =>
      service.assertCanCreateWork({
        accountId: 'employee',
        role: AccountRole.EMPLOYEE,
        divisionId: 'division-a',
        departmentId: 'department-a',
      }),
    ).toThrow(ForbiddenException);
  });

  it('keeps completion review with the responsible manager or Super Admin', () => {
    expect(() =>
      service.assertCanReviewWork(
        {
          accountId: 'manager',
          role: AccountRole.TEAM_MANAGER,
          divisionId: 'division-a',
          departmentId: 'department-a',
        },
        'manager',
      ),
    ).not.toThrow();

    expect(() =>
      service.assertCanReviewWork(
        {
          accountId: 'other-manager',
          role: AccountRole.TEAM_MANAGER,
          divisionId: 'division-a',
          departmentId: 'department-a',
        },
        'manager',
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows direct help only from the same department', async () => {
    const helper = createAccount({
      id: 'helper',
      role: AccountRole.EMPLOYEE,
      departmentId: 'department-a',
    });
    jest.mocked(prisma.account.findUnique).mockResolvedValue(helper as never);

    await expect(
      service.resolveHelpCandidate(
        {
          accountId: 'employee',
          role: AccountRole.EMPLOYEE,
          divisionId: 'division-a',
          departmentId: 'department-a',
        },
        helper.id,
        'department-a',
      ),
    ).resolves.toEqual(helper);

    await expect(
      service.resolveHelpCandidate(
        {
          accountId: 'employee',
          role: AccountRole.EMPLOYEE,
          divisionId: 'division-a',
          departmentId: 'department-a',
        },
        helper.id,
        'department-b',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps primary reassignment inside the original department', async () => {
    const target = createAccount({
      id: 'target',
      role: AccountRole.EMPLOYEE,
      departmentId: 'department-b',
    });
    jest.mocked(prisma.account.findMany).mockResolvedValue([target] as never);

    await expect(
      service.resolvePrimaryReassignmentAccount(
        {
          accountId: 'senior',
          role: AccountRole.SENIOR_MANAGEMENT,
          divisionId: 'division-a',
          departmentId: 'department-a',
        },
        target.id,
        'division-a',
        'department-a',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
