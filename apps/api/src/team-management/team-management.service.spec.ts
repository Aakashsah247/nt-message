import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import type { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  DepartmentTeamActivityAction,
  EmployeeStatus,
  EmploymentStatus,
  ManagementPositionType,
} from '../generated/prisma/enums';
import { TeamManagementService } from './team-management.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

function user(
  role: AccountRole,
  accountId = 'account-manager',
): AuthenticatedUser {
  return {
    accountId,
    sessionId: 'session-a',
    username: `${accountId}@ntc.test`,
    role,
  };
}

function managerAccount(role: AccountRole) {
  const isTeamManager = role === AccountRole.TEAM_MANAGER;
  return {
    id: 'account-manager',
    role,
    isEnabled: true,
    employee:
      role === AccountRole.SUPER_ADMIN
        ? null
        : {
            status: EmployeeStatus.ACTIVE,
            employmentStatus: EmploymentStatus.ACTIVE,
            archivedAt: null,
            isActivated: true,
            divisionId: 'division-a',
            departmentId: isTeamManager ? 'department-a' : null,
            division: {
              id: 'division-a',
              code: 'DIV-A',
              name: 'Division A',
              isActive: true,
            },
            departmentUnit: isTeamManager
              ? {
                  id: 'department-a',
                  divisionId: 'division-a',
                  code: 'DEP-A',
                  name: 'Department A',
                  isActive: true,
                }
              : null,
            managementAssignments: [
              {
                position: {
                  positionType: isTeamManager
                    ? ManagementPositionType.TEAM_MANAGER
                    : ManagementPositionType.SENIOR_MANAGEMENT,
                  divisionId: 'division-a',
                  departmentId: isTeamManager ? 'department-a' : null,
                },
              },
            ],
          },
  };
}

function teamRecord() {
  const now = new Date('2026-07-29T12:00:00.000Z');
  return {
    id: 'team-a',
    name: 'Team A',
    departmentId: 'department-a',
    teamAdminEmployeeId: 'employee-a',
    isActive: true,
    archivedAt: null,
    archivedByAccountId: null,
    createdAt: now,
    updatedAt: now,
    department: {
      id: 'department-a',
      divisionId: 'division-a',
      code: 'DEP-A',
      name: 'Department A',
      division: { id: 'division-a', code: 'DIV-A', name: 'Division A' },
    },
    teamAdmin: {
      id: 'employee-a',
      empId: 'NTC-1001',
      empName: 'Ram Shah',
      designation: 'Technician',
    },
    members: [
      {
        id: 'membership-a',
        createdAt: now,
        employee: {
          id: 'employee-a',
          empId: 'NTC-1001',
          empName: 'Ram Shah',
          designation: 'Technician',
          _count: { teamMemberships: 1 },
        },
      },
    ],
  };
}

describe('TeamManagementService', () => {
  const prisma = {
    account: { findUnique: jest.fn() },
    division: { findMany: jest.fn() },
    department: { findMany: jest.fn(), findUnique: jest.fn() },
    employee: { findMany: jest.fn() },
    departmentTeam: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    departmentTeamMember: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    departmentTeamActivity: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
    workItem: { count: jest.fn() },
    $transaction: jest.fn(),
  } as unknown as PrismaService;
  const service = new TeamManagementService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(prisma.workItem.count).mockResolvedValue(0);
    jest
      .mocked(prisma.$transaction)
      .mockImplementation(
        async (callback: unknown) =>
          (callback as (tx: PrismaService) => Promise<unknown>)(
            prisma,
          ) as never,
      );
  });

  it('creates a team inside the Team Manager department', async () => {
    jest
      .mocked(prisma.account.findUnique)
      .mockResolvedValue(managerAccount(AccountRole.TEAM_MANAGER) as never);
    jest.mocked(prisma.department.findUnique).mockResolvedValue({
      id: 'department-a',
      divisionId: 'division-a',
      code: 'DEP-A',
      name: 'Department A',
      isActive: true,
      division: { id: 'division-a', isActive: true },
    } as never);
    jest.mocked(prisma.departmentTeam.findFirst).mockResolvedValue(null);
    jest
      .mocked(prisma.employee.findMany)
      .mockResolvedValue([{ id: 'employee-a' }] as never);
    jest
      .mocked(prisma.departmentTeam.create)
      .mockResolvedValue(teamRecord() as never);

    const result = await service.createTeam(user(AccountRole.TEAM_MANAGER), {
      teamName: ' Team A ',
      memberEmployeeIds: ['employee-a'],
      adminEmployeeId: 'employee-a',
    });

    expect(prisma.departmentTeam.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          departmentId: 'department-a',
          name: 'Team A',
          teamAdminEmployeeId: 'employee-a',
        }),
      }),
    );
    expect(prisma.departmentTeamActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: DepartmentTeamActivityAction.TEAM_CREATED,
      }),
    });
    expect(result.team.memberCount).toBe(1);
  });

  it('requires the team admin to be one of the selected members', async () => {
    jest
      .mocked(prisma.account.findUnique)
      .mockResolvedValue(managerAccount(AccountRole.TEAM_MANAGER) as never);
    jest.mocked(prisma.department.findUnique).mockResolvedValue({
      id: 'department-a',
      divisionId: 'division-a',
      code: 'DEP-A',
      name: 'Department A',
      isActive: true,
      division: { id: 'division-a', isActive: true },
    } as never);

    await expect(
      service.createTeam(user(AccountRole.TEAM_MANAGER), {
        teamName: 'Team A',
        memberEmployeeIds: ['employee-a'],
        adminEmployeeId: 'employee-b',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks Senior Management from another division department', async () => {
    jest
      .mocked(prisma.account.findUnique)
      .mockResolvedValue(
        managerAccount(AccountRole.SENIOR_MANAGEMENT) as never,
      );
    jest.mocked(prisma.department.findUnique).mockResolvedValue({
      id: 'department-b',
      divisionId: 'division-b',
      code: 'DEP-B',
      name: 'Department B',
      isActive: true,
      division: { id: 'division-b', isActive: true },
    } as never);

    await expect(
      service.listMembers(user(AccountRole.SENIOR_MANAGEMENT), {
        departmentId: 'department-b',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks a Team Admin change while the team has unfinished work', async () => {
    const current = teamRecord();
    jest
      .mocked(prisma.account.findUnique)
      .mockResolvedValue(managerAccount(AccountRole.TEAM_MANAGER) as never);
    jest
      .mocked(prisma.departmentTeam.findUnique)
      .mockResolvedValue(current as never);
    jest.mocked(prisma.departmentTeam.findFirst).mockResolvedValue(null);
    jest.mocked(prisma.employee.findMany).mockResolvedValue([
      { id: 'employee-a' },
      { id: 'employee-b' },
    ] as never);
    jest.mocked(prisma.workItem.count).mockResolvedValue(1);

    await expect(
      service.updateTeam(user(AccountRole.TEAM_MANAGER), current.id, {
        teamName: current.name,
        memberEmployeeIds: ['employee-a', 'employee-b'],
        adminEmployeeId: 'employee-b',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('permanently deletes an unused team and keeps a simple deletion record', async () => {
    jest
      .mocked(prisma.account.findUnique)
      .mockResolvedValue(managerAccount(AccountRole.TEAM_MANAGER) as never);
    jest
      .mocked(prisma.departmentTeam.findUnique)
      .mockResolvedValue(teamRecord() as never);
    jest
      .mocked(prisma.workItem.count)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    await expect(
      service.deleteTeam(user(AccountRole.TEAM_MANAGER), 'team-a'),
    ).resolves.toEqual({
      message: 'Team deleted successfully.',
      archived: false,
    });

    expect(prisma.departmentTeamActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teamId: null,
        action: DepartmentTeamActivityAction.TEAM_DELETED,
        teamName: 'Team A',
      }),
    });
    expect(prisma.departmentTeam.delete).toHaveBeenCalledWith({
      where: { id: 'team-a' },
    });
  });

  it('blocks removal while a team has unfinished work', async () => {
    jest.mocked(prisma.account.findUnique).mockResolvedValue(
      managerAccount(AccountRole.TEAM_MANAGER) as never,
    );
    jest.mocked(prisma.departmentTeam.findUnique).mockResolvedValue(
      teamRecord() as never,
    );
    jest
      .mocked(prisma.workItem.count)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);

    await expect(
      service.deleteTeam(user(AccountRole.TEAM_MANAGER), 'team-a'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.departmentTeam.delete).not.toHaveBeenCalled();
    expect(prisma.departmentTeam.update).not.toHaveBeenCalled();
  });

  it('archives a used team after all work is finished', async () => {
    jest.mocked(prisma.account.findUnique).mockResolvedValue(
      managerAccount(AccountRole.TEAM_MANAGER) as never,
    );
    jest.mocked(prisma.departmentTeam.findUnique).mockResolvedValue(
      teamRecord() as never,
    );
    jest
      .mocked(prisma.workItem.count)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(3);

    await expect(
      service.deleteTeam(user(AccountRole.TEAM_MANAGER), 'team-a'),
    ).resolves.toEqual({
      message:
        'Team archived successfully. Its completed work history remains available.',
      archived: true,
    });

    expect(prisma.departmentTeam.update).toHaveBeenCalledWith({
      where: { id: 'team-a' },
      data: expect.objectContaining({
        isActive: false,
        archivedByAccountId: 'account-manager',
      }),
    });
    expect(prisma.departmentTeamActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: DepartmentTeamActivityAction.TEAM_ARCHIVED,
        details: expect.objectContaining({ historicalWorkCount: 3 }),
      }),
    });
  });
});
