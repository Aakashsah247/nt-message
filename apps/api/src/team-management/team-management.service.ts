import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  DepartmentTeamActivityAction,
  EmployeeStatus,
  EmploymentStatus,
  ManagementPositionType,
  WorkItemStatus,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { CreateDepartmentTeamDto } from './dto/create-department-team.dto';
import { ListDepartmentTeamMembersQueryDto } from './dto/list-department-team-members-query.dto';
import { ListDepartmentTeamsQueryDto } from './dto/list-department-teams-query.dto';
import { UpdateDepartmentTeamDto } from './dto/update-department-team.dto';

interface TeamViewer {
  accountId: string;
  role: AccountRole;
  divisionId: string | null;
  departmentId: string | null;
  division: { id: string; code: string; name: string } | null;
  department: {
    id: string;
    divisionId: string;
    code: string;
    name: string;
  } | null;
}

const teamSelect = {
  id: true,
  name: true,
  departmentId: true,
  teamAdminEmployeeId: true,
  isActive: true,
  archivedAt: true,
  archivedByAccountId: true,
  createdAt: true,
  updatedAt: true,
  department: {
    select: {
      id: true,
      code: true,
      name: true,
      divisionId: true,
      division: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  },
  teamAdmin: {
    select: {
      id: true,
      empId: true,
      empName: true,
      designation: true,
    },
  },
  members: {
    orderBy: {
      employee: {
        empName: 'asc',
      },
    },
    select: {
      id: true,
      createdAt: true,
      employee: {
        select: {
          id: true,
          empId: true,
          empName: true,
          designation: true,
          _count: {
            select: {
              teamMemberships: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.DepartmentTeamSelect;

type TeamRecord = Prisma.DepartmentTeamGetPayload<{
  select: typeof teamSelect;
}>;

@Injectable()
export class TeamManagementService {
  constructor(private readonly prisma: PrismaService) {}

  async getContext(user: AuthenticatedUser) {
    const viewer = await this.resolveViewer(user);
    const divisionWhere: Prisma.DivisionWhereInput = {
      isActive: true,
      ...(viewer.role === AccountRole.SENIOR_MANAGEMENT
        ? { id: viewer.divisionId ?? '__missing_division__' }
        : viewer.role === AccountRole.TEAM_MANAGER
          ? { id: viewer.divisionId ?? '__missing_division__' }
          : {}),
    };
    const departmentWhere: Prisma.DepartmentWhereInput = {
      isActive: true,
      division: { is: { isActive: true } },
      ...(viewer.role === AccountRole.SENIOR_MANAGEMENT
        ? { divisionId: viewer.divisionId ?? '__missing_division__' }
        : viewer.role === AccountRole.TEAM_MANAGER
          ? { id: viewer.departmentId ?? '__missing_department__' }
          : {}),
    };

    const [divisions, departments] = await Promise.all([
      this.prisma.division.findMany({
        where: divisionWhere,
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.department.findMany({
        where: departmentWhere,
        orderBy: [{ division: { name: 'asc' } }, { name: 'asc' }],
        select: {
          id: true,
          divisionId: true,
          code: true,
          name: true,
          division: { select: { id: true, code: true, name: true } },
        },
      }),
    ]);

    return {
      scope: {
        role: viewer.role,
        type:
          viewer.role === AccountRole.SUPER_ADMIN
            ? 'BRANCH'
            : viewer.role === AccountRole.SENIOR_MANAGEMENT
              ? 'DIVISION'
              : 'DEPARTMENT',
        division: viewer.division,
        department: viewer.department,
      },
      divisions,
      departments,
    };
  }

  async listTeams(user: AuthenticatedUser, query: ListDepartmentTeamsQueryDto) {
    const viewer = await this.resolveViewer(user);
    this.assertRequestedListScope(viewer, query.divisionId, query.departmentId);
    const search = query.search?.trim();
    const where: Prisma.DepartmentTeamWhereInput = {
      ...this.buildVisibleTeamWhere(viewer),
      isActive: true,
      archivedAt: null,
      ...(query.divisionId
        ? { department: { is: { divisionId: query.divisionId } } }
        : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              {
                teamAdmin: {
                  is: {
                    OR: [
                      { empName: { contains: search, mode: 'insensitive' } },
                      { empId: { contains: search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
              {
                members: {
                  some: {
                    employee: {
                      is: {
                        OR: [
                          {
                            empName: { contains: search, mode: 'insensitive' },
                          },
                          { empId: { contains: search, mode: 'insensitive' } },
                        ],
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const teams = await this.prisma.departmentTeam.findMany({
      where,
      orderBy: [{ department: { name: 'asc' } }, { name: 'asc' }],
      select: teamSelect,
    });

    return {
      items: teams.map((team) => this.presentTeam(team)),
      total: teams.length,
    };
  }

  async getTeam(user: AuthenticatedUser, teamId: string) {
    const viewer = await this.resolveViewer(user);
    const team = await this.findTeam(teamId);
    this.assertDepartmentInsideScope(viewer, team.department);
    return this.presentTeam(team);
  }

  async listMembers(
    user: AuthenticatedUser,
    query: ListDepartmentTeamMembersQueryDto,
  ) {
    const viewer = await this.resolveViewer(user);
    const department = await this.resolveDepartment(viewer, query.departmentId);
    const search = query.search?.trim();

    const employees = await this.prisma.employee.findMany({
      where: {
        departmentId: department.id,
        status: EmployeeStatus.ACTIVE,
        employmentStatus: EmploymentStatus.ACTIVE,
        archivedAt: null,
        isActivated: true,
        account: {
          is: {
            role: AccountRole.EMPLOYEE,
            isEnabled: true,
          },
        },
        ...(search
          ? {
              OR: [
                { empName: { contains: search, mode: 'insensitive' } },
                { empId: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ empName: 'asc' }, { empId: 'asc' }],
      take: 200,
      select: {
        id: true,
        empId: true,
        empName: true,
        designation: true,
        _count: {
          select: {
            teamMemberships: true,
          },
        },
      },
    });

    return {
      department: {
        id: department.id,
        divisionId: department.divisionId,
        code: department.code,
        name: department.name,
      },
      items: employees.map((employee) => ({
        id: employee.id,
        empId: employee.empId,
        name: employee.empName,
        designation: employee.designation,
        teamCount: employee._count.teamMemberships,
      })),
      total: employees.length,
    };
  }

  async createTeam(user: AuthenticatedUser, dto: CreateDepartmentTeamDto) {
    const viewer = await this.resolveViewer(user);
    const department = await this.resolveDepartment(viewer, dto.departmentId);
    const name = this.cleanTeamName(dto.teamName);
    const nameKey = this.buildNameKey(name);
    const memberIds = this.cleanMemberIds(dto.memberEmployeeIds);

    this.assertAdminIsMember(memberIds, dto.adminEmployeeId);
    await this.assertTeamNameAvailable(department.id, nameKey);
    await this.resolveValidMembers(department.id, memberIds);

    const team = await this.prisma.$transaction(async (tx) => {
      const created = await tx.departmentTeam.create({
        data: {
          departmentId: department.id,
          name,
          nameKey,
          teamAdminEmployeeId: dto.adminEmployeeId,
          createdByAccountId: viewer.accountId,
          updatedByAccountId: viewer.accountId,
          members: {
            create: memberIds.map((employeeId) => ({
              employeeId,
              addedByAccountId: viewer.accountId,
            })),
          },
        },
        select: teamSelect,
      });

      // Team changes are kept as a quiet audit trail without adding a complex activity page.
      await tx.departmentTeamActivity.create({
        data: {
          teamId: created.id,
          departmentId: department.id,
          actorAccountId: viewer.accountId,
          action: DepartmentTeamActivityAction.TEAM_CREATED,
          teamName: name,
          details: {
            adminEmployeeId: dto.adminEmployeeId,
            memberEmployeeIds: memberIds,
          },
        },
      });

      return created;
    });

    return {
      message: 'Team created successfully.',
      team: this.presentTeam(team),
    };
  }

  async updateTeam(
    user: AuthenticatedUser,
    teamId: string,
    dto: UpdateDepartmentTeamDto,
  ) {
    const viewer = await this.resolveViewer(user);
    const current = await this.findTeam(teamId);
    this.assertDepartmentInsideScope(viewer, current.department);
    this.assertTeamIsActive(current);

    const name = this.cleanTeamName(dto.teamName);
    const nameKey = this.buildNameKey(name);
    const memberIds = this.cleanMemberIds(dto.memberEmployeeIds);
    this.assertAdminIsMember(memberIds, dto.adminEmployeeId);
    await this.assertTeamNameAvailable(current.departmentId, nameKey, teamId);
    await this.resolveValidMembers(current.departmentId, memberIds);

    const oldMemberIds = new Set<string>(
      current.members.map((member) => member.employee.id),
    );
    const nextMemberIds = new Set<string>(memberIds);
    const addedIds = memberIds.filter((id) => !oldMemberIds.has(id));
    const removedIds = [...oldMemberIds].filter((id) => !nextMemberIds.has(id));
    const nameChanged = current.name !== name;
    const adminChanged = current.teamAdminEmployeeId !== dto.adminEmployeeId;

    if (adminChanged) {
      const unfinishedWorkCount = await this.prisma.workItem.count({
        where: {
          assignedTeamId: teamId,
          status: {
            in: [
              WorkItemStatus.ASSIGNED,
              WorkItemStatus.ACKNOWLEDGED,
              WorkItemStatus.IN_PROGRESS,
              WorkItemStatus.HELP_REQUESTED,
              WorkItemStatus.COMPLETED_PENDING_REVIEW,
              WorkItemStatus.REOPENED,
              WorkItemStatus.BLOCKED,
            ],
          },
        },
      });
      if (unfinishedWorkCount > 0) {
        throw new ConflictException(
          'Complete or cancel this team’s unfinished work before changing the Team Admin.',
        );
      }
    }

    const team = await this.prisma.$transaction(async (tx) => {
      if (removedIds.length > 0) {
        await tx.departmentTeamMember.deleteMany({
          where: { teamId, employeeId: { in: removedIds } },
        });
      }

      if (addedIds.length > 0) {
        await tx.departmentTeamMember.createMany({
          data: addedIds.map((employeeId) => ({
            teamId,
            employeeId,
            addedByAccountId: viewer.accountId,
          })),
        });
      }

      const updated = await tx.departmentTeam.update({
        where: { id: teamId },
        data: {
          name,
          nameKey,
          teamAdminEmployeeId: dto.adminEmployeeId,
          updatedByAccountId: viewer.accountId,
        },
        select: teamSelect,
      });

      const activities: Prisma.DepartmentTeamActivityCreateManyInput[] = [];
      if (nameChanged) {
        activities.push({
          teamId,
          departmentId: current.departmentId,
          actorAccountId: viewer.accountId,
          action: DepartmentTeamActivityAction.TEAM_RENAMED,
          teamName: name,
          details: { previousName: current.name, newName: name },
        });
      }
      if (adminChanged) {
        activities.push({
          teamId,
          departmentId: current.departmentId,
          actorAccountId: viewer.accountId,
          action: DepartmentTeamActivityAction.ADMIN_CHANGED,
          teamName: name,
          details: {
            previousAdminEmployeeId: current.teamAdminEmployeeId,
            newAdminEmployeeId: dto.adminEmployeeId,
          },
        });
      }
      for (const employeeId of addedIds) {
        activities.push({
          teamId,
          departmentId: current.departmentId,
          actorAccountId: viewer.accountId,
          action: DepartmentTeamActivityAction.MEMBER_ADDED,
          teamName: name,
          details: { employeeId },
        });
      }
      for (const employeeId of removedIds) {
        activities.push({
          teamId,
          departmentId: current.departmentId,
          actorAccountId: viewer.accountId,
          action: DepartmentTeamActivityAction.MEMBER_REMOVED,
          teamName: name,
          details: { employeeId },
        });
      }
      if (activities.length > 0) {
        await tx.departmentTeamActivity.createMany({ data: activities });
      }

      return updated;
    });

    return {
      message: 'Team updated successfully.',
      team: this.presentTeam(team),
    };
  }

  async deleteTeam(user: AuthenticatedUser, teamId: string) {
    const viewer = await this.resolveViewer(user);
    const team = await this.findTeam(teamId);
    this.assertDepartmentInsideScope(viewer, team.department);
    this.assertTeamIsActive(team);

    const activeStatuses: WorkItemStatus[] = [
      WorkItemStatus.ASSIGNED,
      WorkItemStatus.ACKNOWLEDGED,
      WorkItemStatus.IN_PROGRESS,
      WorkItemStatus.HELP_REQUESTED,
      WorkItemStatus.COMPLETED_PENDING_REVIEW,
      WorkItemStatus.REOPENED,
      WorkItemStatus.BLOCKED,
    ];
    const [activeWorkCount, historicalWorkCount] = await Promise.all([
      this.prisma.workItem.count({
        where: {
          assignedTeamId: teamId,
          status: { in: activeStatuses },
        },
      }),
      this.prisma.workItem.count({ where: { assignedTeamId: teamId } }),
    ]);

    if (activeWorkCount > 0) {
      throw new ConflictException(
        'This team has unfinished work. Complete or cancel the active work before removing the team.',
      );
    }

    if (historicalWorkCount > 0) {
      const archivedAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        // Work history keeps a stable team identity, so used teams are archived instead of deleted.
        await tx.departmentTeam.update({
          where: { id: teamId },
          data: {
            isActive: false,
            archivedAt,
            archivedByAccountId: viewer.accountId,
            updatedByAccountId: viewer.accountId,
          },
        });
        await tx.departmentTeamActivity.create({
          data: {
            teamId,
            departmentId: team.departmentId,
            actorAccountId: viewer.accountId,
            action: DepartmentTeamActivityAction.TEAM_ARCHIVED,
            teamName: team.name,
            details: {
              historicalWorkCount,
              archivedAt: archivedAt.toISOString(),
            },
          },
        });
      });

      return {
        message:
          'Team archived successfully. Its completed work history remains available.',
        archived: true,
      };
    }

    await this.prisma.$transaction(async (tx) => {
      // An unused team has no work history to preserve and can be removed permanently.
      await tx.departmentTeamActivity.create({
        data: {
          teamId: null,
          departmentId: team.departmentId,
          actorAccountId: viewer.accountId,
          action: DepartmentTeamActivityAction.TEAM_DELETED,
          teamName: team.name,
          details: {
            adminEmployeeId: team.teamAdminEmployeeId,
            memberEmployeeIds: team.members.map(
              (member) => member.employee.id,
            ),
          },
        },
      });
      await tx.departmentTeam.delete({ where: { id: teamId } });
    });

    return { message: 'Team deleted successfully.', archived: false };
  }

  private async resolveViewer(user: AuthenticatedUser): Promise<TeamViewer> {
    const account = await this.prisma.account.findUnique({
      where: { id: user.accountId },
      select: {
        id: true,
        role: true,
        isEnabled: true,
        employee: {
          select: {
            status: true,
            employmentStatus: true,
            archivedAt: true,
            isActivated: true,
            divisionId: true,
            departmentId: true,
            division: {
              select: { id: true, code: true, name: true, isActive: true },
            },
            departmentUnit: {
              select: {
                id: true,
                divisionId: true,
                code: true,
                name: true,
                isActive: true,
              },
            },
            managementAssignments: {
              where: {
                endedAt: null,
                position: { is: { isActive: true } },
              },
              orderBy: { startedAt: 'desc' },
              take: 1,
              select: {
                position: {
                  select: {
                    positionType: true,
                    divisionId: true,
                    departmentId: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!account || !account.isEnabled || account.role !== user.role) {
      throw new ForbiddenException(
        'Your account cannot manage employee teams.',
      );
    }
    if (account.role === AccountRole.EMPLOYEE) {
      throw new ForbiddenException('Employees cannot manage employee teams.');
    }
    if (account.role === AccountRole.SUPER_ADMIN) {
      return {
        accountId: account.id,
        role: account.role,
        divisionId: null,
        departmentId: null,
        division: null,
        department: null,
      };
    }

    const employee = account.employee;
    if (
      !employee ||
      employee.status !== EmployeeStatus.ACTIVE ||
      employee.employmentStatus !== EmploymentStatus.ACTIVE ||
      employee.archivedAt !== null ||
      !employee.isActivated ||
      !employee.divisionId ||
      !employee.division?.isActive
    ) {
      throw new ForbiddenException('Your employee account is not active.');
    }

    const currentPosition = employee.managementAssignments[0]?.position;
    if (account.role === AccountRole.SENIOR_MANAGEMENT) {
      if (
        !currentPosition ||
        currentPosition.positionType !==
          ManagementPositionType.SENIOR_MANAGEMENT ||
        currentPosition.divisionId !== employee.divisionId ||
        currentPosition.departmentId !== null
      ) {
        throw new ForbiddenException('Your management position is not active.');
      }
      return {
        accountId: account.id,
        role: account.role,
        divisionId: employee.divisionId,
        departmentId: null,
        division: {
          id: employee.division.id,
          code: employee.division.code,
          name: employee.division.name,
        },
        department: null,
      };
    }

    if (
      !employee.departmentId ||
      !employee.departmentUnit?.isActive ||
      employee.departmentUnit.divisionId !== employee.divisionId ||
      !currentPosition ||
      currentPosition.positionType !== ManagementPositionType.TEAM_MANAGER ||
      currentPosition.divisionId !== employee.divisionId ||
      currentPosition.departmentId !== employee.departmentId
    ) {
      throw new ForbiddenException(
        'Your department management position is not active.',
      );
    }

    return {
      accountId: account.id,
      role: account.role,
      divisionId: employee.divisionId,
      departmentId: employee.departmentId,
      division: {
        id: employee.division.id,
        code: employee.division.code,
        name: employee.division.name,
      },
      department: {
        id: employee.departmentUnit.id,
        divisionId: employee.departmentUnit.divisionId,
        code: employee.departmentUnit.code,
        name: employee.departmentUnit.name,
      },
    };
  }

  private buildVisibleTeamWhere(
    viewer: TeamViewer,
  ): Prisma.DepartmentTeamWhereInput {
    if (viewer.role === AccountRole.SUPER_ADMIN) {
      return {};
    }
    if (viewer.role === AccountRole.SENIOR_MANAGEMENT) {
      return {
        department: {
          is: { divisionId: viewer.divisionId ?? '__missing_division__' },
        },
      };
    }
    return { departmentId: viewer.departmentId ?? '__missing_department__' };
  }

  private assertRequestedListScope(
    viewer: TeamViewer,
    divisionId?: string,
    departmentId?: string,
  ): void {
    if (
      viewer.role === AccountRole.SENIOR_MANAGEMENT &&
      divisionId &&
      divisionId !== viewer.divisionId
    ) {
      throw new ForbiddenException(
        'You can view teams only inside your division.',
      );
    }
    if (
      viewer.role === AccountRole.TEAM_MANAGER &&
      ((divisionId && divisionId !== viewer.divisionId) ||
        (departmentId && departmentId !== viewer.departmentId))
    ) {
      throw new ForbiddenException(
        'You can view teams only inside your department.',
      );
    }
  }

  private async resolveDepartment(
    viewer: TeamViewer,
    requestedDepartmentId: string | undefined,
  ) {
    const departmentId =
      viewer.role === AccountRole.TEAM_MANAGER
        ? viewer.departmentId
        : requestedDepartmentId;

    if (!departmentId) {
      throw new BadRequestException('Choose a department.');
    }
    if (
      viewer.role === AccountRole.TEAM_MANAGER &&
      requestedDepartmentId &&
      requestedDepartmentId !== viewer.departmentId
    ) {
      throw new ForbiddenException(
        'You can manage teams only in your department.',
      );
    }

    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: {
        id: true,
        divisionId: true,
        code: true,
        name: true,
        isActive: true,
        division: { select: { id: true, isActive: true } },
      },
    });
    if (!department || !department.isActive || !department.division.isActive) {
      throw new NotFoundException('The selected department was not found.');
    }
    this.assertDepartmentInsideScope(viewer, department);
    return department;
  }

  private assertDepartmentInsideScope(
    viewer: TeamViewer,
    department: { id: string; divisionId: string },
  ): void {
    if (
      viewer.role === AccountRole.SENIOR_MANAGEMENT &&
      department.divisionId !== viewer.divisionId
    ) {
      throw new ForbiddenException(
        'You can manage teams only inside your division.',
      );
    }
    if (
      viewer.role === AccountRole.TEAM_MANAGER &&
      department.id !== viewer.departmentId
    ) {
      throw new ForbiddenException(
        'You can manage teams only inside your department.',
      );
    }
  }

  private async resolveValidMembers(departmentId: string, memberIds: string[]) {
    const employees = await this.prisma.employee.findMany({
      where: {
        id: { in: memberIds },
        departmentId,
        status: EmployeeStatus.ACTIVE,
        employmentStatus: EmploymentStatus.ACTIVE,
        archivedAt: null,
        isActivated: true,
        account: {
          is: { role: AccountRole.EMPLOYEE, isEnabled: true },
        },
      },
      select: { id: true },
    });
    if (employees.length !== memberIds.length) {
      throw new BadRequestException(
        'Choose only active employees from the selected department.',
      );
    }
    return employees;
  }

  private async assertTeamNameAvailable(
    departmentId: string,
    nameKey: string,
    excludeTeamId?: string,
  ): Promise<void> {
    const existing = await this.prisma.departmentTeam.findFirst({
      where: {
        departmentId,
        nameKey,
        ...(excludeTeamId ? { id: { not: excludeTeamId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('A team with this name already exists.');
    }
  }

  private async findTeam(teamId: string): Promise<TeamRecord> {
    const team = await this.prisma.departmentTeam.findUnique({
      where: { id: teamId },
      select: teamSelect,
    });
    if (!team) {
      throw new NotFoundException('Team was not found.');
    }
    return team;
  }

  private cleanTeamName(value: string): string {
    const name = value.trim().replace(/\s+/g, ' ');
    if (name.length < 2) {
      throw new BadRequestException('Enter a team name.');
    }
    return name;
  }

  private buildNameKey(value: string): string {
    return value.toLocaleLowerCase('en');
  }

  private cleanMemberIds(values: string[]): string[] {
    const unique = [...new Set(values)];
    if (unique.length === 0) {
      throw new BadRequestException('Choose at least one member.');
    }
    return unique;
  }

  private assertAdminIsMember(
    memberIds: string[],
    adminEmployeeId: string,
  ): void {
    if (!memberIds.includes(adminEmployeeId)) {
      throw new BadRequestException(
        'Choose the team admin from the selected members.',
      );
    }
  }

  private assertTeamIsActive(team: TeamRecord): void {
    if (!team.isActive || team.archivedAt) {
      throw new ConflictException(
        'Archived teams are read-only and cannot be changed.',
      );
    }
  }

  private presentTeam(team: TeamRecord) {
    return {
      id: team.id,
      name: team.name,
      department: {
        id: team.department.id,
        code: team.department.code,
        name: team.department.name,
      },
      division: team.department.division,
      admin: {
        id: team.teamAdmin.id,
        empId: team.teamAdmin.empId,
        name: team.teamAdmin.empName,
        designation: team.teamAdmin.designation,
      },
      members: team.members.map((member) => ({
        id: member.employee.id,
        empId: member.employee.empId,
        name: member.employee.empName,
        designation: member.employee.designation,
        teamCount: member.employee._count.teamMemberships,
        isAdmin: member.employee.id === team.teamAdminEmployeeId,
        addedAt: member.createdAt.toISOString(),
      })),
      memberCount: team.members.length,
      isActive: team.isActive,
      archivedAt: team.archivedAt?.toISOString() ?? null,
      createdAt: team.createdAt.toISOString(),
      updatedAt: team.updatedAt.toISOString(),
    };
  }
}
