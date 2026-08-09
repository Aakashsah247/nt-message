import { ForbiddenException, Injectable } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
  ManagementPositionType,
  WorkCompletionReviewStatus,
  WorkItemStatus,
  WorkPriority,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { ListWorkAssigneesQueryDto } from './dto/list-work-assignees-query.dto';
import { workItemListSelect } from './work-items.service';
import { WorkScopeService } from './work-scope.service';
import type { WorkActorContext } from './work-scope.service';

const ACTIVE_WORK_STATUSES = [
  WorkItemStatus.ASSIGNED,
  WorkItemStatus.ACKNOWLEDGED,
  WorkItemStatus.IN_PROGRESS,
  WorkItemStatus.HELP_REQUESTED,
  WorkItemStatus.COMPLETED_PENDING_REVIEW,
  WorkItemStatus.REOPENED,
  WorkItemStatus.BLOCKED,
] as const;

const assignmentCandidateSelect = {
  id: true,
  role: true,
  username: true,
  employee: {
    select: {
      id: true,
      empId: true,
      empName: true,
      designation: true,
      divisionId: true,
      departmentId: true,
      division: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      departmentUnit: {
        select: {
          id: true,
          divisionId: true,
          code: true,
          name: true,
          workFunction: true,
        },
      },
      managementAssignments: {
        where: {
          endedAt: null,
        },
        orderBy: {
          startedAt: 'desc',
        },
        take: 1,
        select: {
          position: {
            select: {
              positionType: true,
              divisionId: true,
              departmentId: true,
              isActive: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.AccountSelect;

type AssignmentCandidateRecord = Prisma.AccountGetPayload<{
  select: typeof assignmentCandidateSelect;
}>;

const assignmentTeamSelect = {
  id: true,
  name: true,
  departmentId: true,
  isActive: true,
  archivedAt: true,
  department: {
    select: {
      id: true,
      divisionId: true,
      code: true,
      name: true,
      workFunction: true,
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
      account: {
        select: assignmentCandidateSelect,
      },
    },
  },
  members: {
    select: {
      employee: {
        select: {
          account: {
            select: { id: true },
          },
        },
      },
    },
  },
  _count: {
    select: {
      members: true,
    },
  },
} satisfies Prisma.DepartmentTeamSelect;

type AssignmentTeamRecord = Prisma.DepartmentTeamGetPayload<{
  select: typeof assignmentTeamSelect;
}>;

export type WorkloadLevel = 'AVAILABLE' | 'MODERATE' | 'BUSY' | 'OVERLOADED';

export interface WorkloadSummary {
  active: number;
  highPriority: number;
  overdue: number;
  waitingForReview: number;
  level: WorkloadLevel;
}

@Injectable()
export class WorkManagementQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workScopeService: WorkScopeService,
  ) {}

  async getDashboardSummary(user: AuthenticatedUser) {
    const actor = await this.resolveManager(user);
    // Every dashboard metric reuses the same server-derived organization scope.
    const scopeWhere = this.workScopeService.buildVisibleWorkWhere(actor);
    const now = new Date();
    const today = this.getKathmanduCalendarDay(now);
    const scoped = (where: Prisma.WorkItemWhereInput) => ({
      AND: [scopeWhere, where],
    });

    const [
      open,
      assignedToday,
      inProgress,
      helpRequested,
      waitingForReview,
      overdue,
      closedToday,
      critical,
      nextReview,
      urgentWork,
    ] = await Promise.all([
      this.prisma.workItem.count({
        where: scoped({ status: { in: [...ACTIVE_WORK_STATUSES] } }),
      }),
      this.prisma.workItem.count({
        where: scoped({
          createdAt: { gte: today.start, lt: today.end },
        }),
      }),
      this.prisma.workItem.count({
        where: scoped({
          status: {
            in: [
              WorkItemStatus.ACKNOWLEDGED,
              WorkItemStatus.IN_PROGRESS,
              WorkItemStatus.REOPENED,
              WorkItemStatus.BLOCKED,
            ],
          },
        }),
      }),
      this.prisma.workItem.count({
        where: scoped({ status: WorkItemStatus.HELP_REQUESTED }),
      }),
      this.prisma.workItem.count({
        where: scoped({ status: WorkItemStatus.COMPLETED_PENDING_REVIEW }),
      }),
      this.prisma.workItem.count({
        where: scoped({
          status: { in: [...ACTIVE_WORK_STATUSES] },
          dueAt: { lt: now },
        }),
      }),
      this.prisma.workItem.count({
        where: scoped({
          status: WorkItemStatus.CLOSED,
          closedAt: { gte: today.start, lt: today.end },
        }),
      }),
      this.prisma.workItem.count({
        where: scoped({
          status: { in: [...ACTIVE_WORK_STATUSES] },
          priority: WorkPriority.CRITICAL,
        }),
      }),
      this.prisma.workItem.findMany({
        where: scoped({ status: WorkItemStatus.COMPLETED_PENDING_REVIEW }),
        take: 5,
        orderBy: [{ updatedAt: 'asc' }, { dueAt: 'asc' }],
        select: workItemListSelect,
      }),
      this.prisma.workItem.findMany({
        where: scoped({
          status: { in: [...ACTIVE_WORK_STATUSES] },
          OR: [
            { priority: { in: [WorkPriority.HIGH, WorkPriority.CRITICAL] } },
            { dueAt: { lt: now } },
          ],
        }),
        take: 5,
        orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
        select: workItemListSelect,
      }),
    ]);

    return {
      timezone: 'Asia/Kathmandu' as const,
      generatedAt: now.toISOString(),
      scope: this.getScopeSummary(actor),
      totals: {
        open,
        assignedToday,
        inProgress,
        helpRequested,
        waitingForReview,
        overdue,
        closedToday,
        critical,
      },
      nextReview,
      urgentWork,
    };
  }

  async listAssignmentOptions(
    user: AuthenticatedUser,
    query: ListWorkAssigneesQueryDto,
  ) {
    const actor = await this.resolveManager(user);
    // Candidate visibility is derived from management authority, never frontend role claims.
    const search = query.search?.trim();
    const allowedRoles = this.getAssignableRoles(actor.role);
    const employeeWhere: Prisma.EmployeeWhereInput = {
      status: EmployeeStatus.ACTIVE,
      employmentStatus: EmploymentStatus.ACTIVE,
      archivedAt: null,
      isActivated: true,
      division: {
        is: {
          isActive: true,
        },
      },
      // Senior Management candidates may be division-scoped while other roles require an active department.
      OR: [
        {
          departmentUnit: {
            is: {
              isActive: true,
            },
          },
        },
        {
          departmentId: null,
          managementAssignments: {
            some: {
              endedAt: null,
              position: {
                is: {
                  isActive: true,
                  positionType: ManagementPositionType.SENIOR_MANAGEMENT,
                },
              },
            },
          },
        },
      ],
    };

    if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      employeeWhere.divisionId = actor.divisionId ?? '__missing_division__';
    }

    if (actor.role === AccountRole.TEAM_MANAGER) {
      // Create Work may coordinate sibling departments, but never another division.
      employeeWhere.divisionId = actor.divisionId ?? '__missing_division__';
    }

    if (query.departmentId) {
      await this.assertDepartmentFilterInsideScope(actor, query.departmentId);
      employeeWhere.departmentId = query.departmentId;
    }

    if (search) {
      employeeWhere.OR = [
        { empName: { contains: search, mode: 'insensitive' } },
        { empId: { contains: search, mode: 'insensitive' } },
        { designation: { contains: search, mode: 'insensitive' } },
      ];
    }

    const where: Prisma.AccountWhereInput = {
      isEnabled: true,
      role: {
        in: allowedRoles,
      },
      employee: {
        is: employeeWhere,
      },
    };
    const skip = (query.page - 1) * query.limit;
    const [
      records,
      total,
      departments,
      managers,
      teams,
      salesMembers,
      supportMembers,
    ] = await Promise.all([
      this.prisma.account.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: {
          employee: {
            empName: 'asc',
          },
        },
        select: assignmentCandidateSelect,
      }),
      this.prisma.account.count({ where }),
      this.listDepartments(actor),
      this.listResponsibleManagers(actor),
      this.listAssignableTeams(actor, query.departmentId, search),
      this.listSalesMembers(actor, query.departmentId, search),
      this.listSupportMembers(actor, query.departmentId, search),
    ]);
    const now = new Date();
    const candidateIds = [
      ...records.map((record) => record.id),
      ...salesMembers.map((record) => record.id),
      ...supportMembers.map((record) => record.id),
    ];
    const [workloads, teamWorkloads, salesWorkloads] = await Promise.all([
      this.loadWorkloads([...new Set(candidateIds)], now),
      this.loadTeamWorkloads(teams.map((team) => team.id), now),
      this.loadSalesWorkloads(salesMembers.map((record) => record.id), now),
    ]);

    return {
      scope: this.getScopeSummary(actor),
      departments,
      responsibleManagers: managers.map((manager) => ({
        account: this.toAccountSummary(manager),
        divisionId: manager.employee?.divisionId ?? null,
        departmentId: manager.employee?.departmentId ?? null,
      })),
      teams: teams.map((team) => ({
        id: team.id,
        name: team.name,
        department: team.department,
        admin: {
          employeeId: team.teamAdmin.id,
          empId: team.teamAdmin.empId,
          name: team.teamAdmin.empName,
          designation: team.teamAdmin.designation,
          account: team.teamAdmin.account
            ? this.toAccountSummary(team.teamAdmin.account)
            : null,
        },
        memberCount: team._count.members,
        memberAccountIds: team.members.flatMap((membership) => {
          const accountId = membership.employee.account?.id;
          return accountId ? [accountId] : [];
        }),
        workload: teamWorkloads.get(team.id) ?? this.emptyWorkload(),
      })),
      salesMembers: salesMembers.map((record) => ({
        account: this.toAccountSummary(record),
        division: record.employee?.division ?? null,
        department: record.employee?.departmentUnit ?? null,
        workload: salesWorkloads.get(record.id) ?? this.emptyWorkload(),
      })),
      supportMembers: supportMembers.map((record) => ({
        account: this.toAccountSummary(record),
        division: record.employee?.division ?? null,
        department: record.employee?.departmentUnit ?? null,
        workload: workloads.get(record.id) ?? this.emptyWorkload(),
      })),
      data: records.map((record) => ({
        account: this.toAccountSummary(record),
        division: record.employee?.division ?? null,
        department: record.employee?.departmentUnit ?? null,
        workload: workloads.get(record.id) ?? this.emptyWorkload(),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
      filters: {
        search: search || null,
        departmentId: query.departmentId ?? null,
      },
    };
  }

  private async resolveManager(user: AuthenticatedUser) {
    const actor = await this.workScopeService.resolveActorContext(user);
    this.workScopeService.assertCanManageWork(actor);
    return actor;
  }

  private getAssignableRoles(role: AccountRole): AccountRole[] {
    if (role === AccountRole.SUPER_ADMIN) {
      return [
        AccountRole.SENIOR_MANAGEMENT,
        AccountRole.TEAM_MANAGER,
        AccountRole.EMPLOYEE,
      ];
    }

    if (role === AccountRole.SENIOR_MANAGEMENT) {
      return [AccountRole.TEAM_MANAGER, AccountRole.EMPLOYEE];
    }

    if (role === AccountRole.TEAM_MANAGER) {
      return [AccountRole.EMPLOYEE];
    }

    return [];
  }

  private async listDepartments(actor: WorkActorContext) {
    const where: Prisma.DepartmentWhereInput = {
      isActive: true,
    };

    if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      where.divisionId = actor.divisionId ?? '__missing_division__';
    }

    if (actor.role === AccountRole.TEAM_MANAGER) {
      where.divisionId = actor.divisionId ?? '__missing_division__';
    }

    return this.prisma.department.findMany({
      where,
      orderBy: [{ division: { name: 'asc' } }, { name: 'asc' }],
      select: {
        id: true,
        divisionId: true,
        code: true,
        name: true,
        workFunction: true,
        division: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });
  }

  private async listAssignableTeams(
    actor: WorkActorContext,
    departmentId?: string,
    search?: string,
  ): Promise<AssignmentTeamRecord[]> {
    const where: Prisma.DepartmentTeamWhereInput = {
      isActive: true,
      archivedAt: null,
      department: {
        is: {
          isActive: true,
          division: { is: { isActive: true } },
        },
      },
      ...(departmentId ? { departmentId } : {}),
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
            ],
          }
        : {}),
    };

    if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      where.department = {
        is: {
          isActive: true,
          divisionId: actor.divisionId ?? '__missing_division__',
          division: { is: { isActive: true } },
        },
      };
    }

    if (actor.role === AccountRole.TEAM_MANAGER) {
      where.department = {
        is: {
          isActive: true,
          divisionId: actor.divisionId ?? '__missing_division__',
          division: { is: { isActive: true } },
        },
      };
    }

    return this.prisma.departmentTeam.findMany({
      where,
      orderBy: [{ department: { name: 'asc' } }, { name: 'asc' }],
      take: 200,
      select: assignmentTeamSelect,
    });
  }

  private async listSalesMembers(
    actor: WorkActorContext,
    departmentId?: string,
    search?: string,
  ): Promise<AssignmentCandidateRecord[]> {
    return this.listCrossDepartmentMembers(actor, departmentId, search);
  }

  private async listSupportMembers(
    actor: WorkActorContext,
    departmentId?: string,
    search?: string,
  ): Promise<AssignmentCandidateRecord[]> {
    return this.listCrossDepartmentMembers(actor, departmentId, search);
  }

  private async listCrossDepartmentMembers(
    actor: WorkActorContext,
    departmentId?: string,
    search?: string,
  ): Promise<AssignmentCandidateRecord[]> {
    const employeeWhere: Prisma.EmployeeWhereInput = {
      status: EmployeeStatus.ACTIVE,
      employmentStatus: EmploymentStatus.ACTIVE,
      archivedAt: null,
      isActivated: true,
      division: { is: { isActive: true } },
      departmentUnit: {
        is: {
          isActive: true,
        },
      },
      ...(departmentId ? { departmentId } : {}),
      ...(search
        ? {
            OR: [
              { empName: { contains: search, mode: 'insensitive' } },
              { empId: { contains: search, mode: 'insensitive' } },
              { designation: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    // Cross-department collaborators are selectable only inside the manager's
    // division. Super Admin receives branch-wide options and the frontend then
    // narrows them to the selected team's division.
    if (
      actor.role === AccountRole.SENIOR_MANAGEMENT ||
      actor.role === AccountRole.TEAM_MANAGER
    ) {
      employeeWhere.divisionId = actor.divisionId ?? '__missing_division__';
    }

    return this.prisma.account.findMany({
      where: {
        isEnabled: true,
        role: AccountRole.EMPLOYEE,
        employee: { is: employeeWhere },
      },
      orderBy: { employee: { empName: 'asc' } },
      take: 200,
      select: assignmentCandidateSelect,
    });
  }

  private async loadSalesWorkloads(accountIds: string[], now: Date) {
    const summaries = new Map<string, WorkloadSummary>();

    if (accountIds.length === 0) {
      return summaries;
    }

    // Sales responsibility is intentionally separate from technical WorkAssignment rows.
    // Counting the direct relation keeps the selector honest without granting lifecycle authority.
    const workItems = await this.prisma.workItem.findMany({
      where: {
        salesMemberAccountId: { in: accountIds },
        status: { in: [...ACTIVE_WORK_STATUSES] },
      },
      select: {
        salesMemberAccountId: true,
        priority: true,
        dueAt: true,
        status: true,
      },
    });

    for (const workItem of workItems) {
      if (!workItem.salesMemberAccountId) continue;
      const current = summaries.get(workItem.salesMemberAccountId) ?? {
        active: 0,
        highPriority: 0,
        overdue: 0,
        waitingForReview: 0,
        level: 'AVAILABLE' as const,
      };
      current.active += 1;
      if (
        workItem.priority === WorkPriority.HIGH ||
        workItem.priority === WorkPriority.CRITICAL
      ) {
        current.highPriority += 1;
      }
      if (workItem.dueAt.getTime() < now.getTime()) {
        current.overdue += 1;
      }
      if (workItem.status === WorkItemStatus.COMPLETED_PENDING_REVIEW) {
        current.waitingForReview += 1;
      }
      summaries.set(workItem.salesMemberAccountId, current);
    }

    for (const [accountId, workload] of summaries) {
      workload.level = this.getWorkloadLevel(workload);
      summaries.set(accountId, workload);
    }

    return summaries;
  }

  private async loadTeamWorkloads(teamIds: string[], now: Date) {
    const summaries = new Map<string, WorkloadSummary>();

    if (teamIds.length === 0) {
      return summaries;
    }

    const workItems = await this.prisma.workItem.findMany({
      where: {
        assignedTeamId: { in: teamIds },
        status: { in: [...ACTIVE_WORK_STATUSES] },
      },
      select: {
        assignedTeamId: true,
        priority: true,
        dueAt: true,
        status: true,
      },
    });

    for (const workItem of workItems) {
      if (!workItem.assignedTeamId) continue;
      const current = summaries.get(workItem.assignedTeamId) ?? {
        active: 0,
        highPriority: 0,
        overdue: 0,
        waitingForReview: 0,
        level: 'AVAILABLE' as const,
      };
      current.active += 1;
      if (
        workItem.priority === WorkPriority.HIGH ||
        workItem.priority === WorkPriority.CRITICAL
      ) {
        current.highPriority += 1;
      }
      if (workItem.dueAt.getTime() < now.getTime()) {
        current.overdue += 1;
      }
      if (workItem.status === WorkItemStatus.COMPLETED_PENDING_REVIEW) {
        current.waitingForReview += 1;
      }
      summaries.set(workItem.assignedTeamId, current);
    }

    for (const [teamId, workload] of summaries) {
      workload.level = this.getWorkloadLevel(workload);
      summaries.set(teamId, workload);
    }

    return summaries;
  }

  private async listResponsibleManagers(
    actor: WorkActorContext,
  ): Promise<AssignmentCandidateRecord[]> {
    const actorAccount = await this.prisma.account.findUnique({
      where: { id: actor.accountId },
      select: assignmentCandidateSelect,
    });

    if (!actorAccount) {
      throw new ForbiddenException(
        'Your management account is no longer available.',
      );
    }

    if (actor.role === AccountRole.TEAM_MANAGER) {
      return [actorAccount];
    }

    const employeeWhere: Prisma.EmployeeWhereInput = {
      status: EmployeeStatus.ACTIVE,
      employmentStatus: EmploymentStatus.ACTIVE,
      archivedAt: null,
      isActivated: true,
      managementAssignments: {
        some: {
          endedAt: null,
          position: {
            is: {
              isActive: true,
            },
          },
        },
      },
    };

    if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      employeeWhere.divisionId = actor.divisionId ?? '__missing_division__';
    }

    const managerRoles =
      actor.role === AccountRole.SENIOR_MANAGEMENT
        ? [AccountRole.TEAM_MANAGER]
        : [AccountRole.SENIOR_MANAGEMENT, AccountRole.TEAM_MANAGER];
    const managers = await this.prisma.account.findMany({
      where: {
        id: { not: actor.accountId },
        isEnabled: true,
        role: {
          in: managerRoles,
        },
        employee: { is: employeeWhere },
      },
      orderBy: {
        employee: {
          empName: 'asc',
        },
      },
      take: 200,
      select: assignmentCandidateSelect,
    });

    return [
      actorAccount,
      ...managers.filter((manager) => this.isValidManager(manager)),
    ];
  }

  private isValidManager(account: AssignmentCandidateRecord): boolean {
    if (account.role === AccountRole.SUPER_ADMIN) {
      return true;
    }

    const employee = account.employee;
    const position = employee?.managementAssignments[0]?.position;

    if (!employee || !position?.isActive) {
      return false;
    }

    if (account.role === AccountRole.SENIOR_MANAGEMENT) {
      return (
        position.positionType === ManagementPositionType.SENIOR_MANAGEMENT &&
        position.divisionId === employee.divisionId &&
        position.departmentId === null
      );
    }

    if (account.role === AccountRole.TEAM_MANAGER) {
      return (
        position.positionType === ManagementPositionType.TEAM_MANAGER &&
        position.divisionId === employee.divisionId &&
        position.departmentId === employee.departmentId
      );
    }

    return false;
  }

  private async loadWorkloads(accountIds: string[], now: Date) {
    const summaries = new Map<string, WorkloadSummary>();

    if (accountIds.length === 0) {
      return summaries;
    }

    // Workload is an assignment warning only; duty and live availability are added in Phase 5.
    const assignments = await this.prisma.workAssignment.findMany({
      where: {
        assigneeAccountId: { in: accountIds },
        endedAt: null,
        workItem: {
          is: {
            status: { in: [...ACTIVE_WORK_STATUSES] },
          },
        },
      },
      select: {
        assigneeAccountId: true,
        workItem: {
          select: {
            status: true,
            priority: true,
            dueAt: true,
            completionReports: {
              where: {
                reviewStatus: {
                  in: [
                    WorkCompletionReviewStatus.PENDING_REVIEW,
                    WorkCompletionReviewStatus.INFORMATION_REQUESTED,
                  ],
                },
              },
              take: 1,
              select: { id: true },
            },
          },
        },
      },
    });

    for (const assignment of assignments) {
      const current = summaries.get(assignment.assigneeAccountId) ?? {
        active: 0,
        highPriority: 0,
        overdue: 0,
        waitingForReview: 0,
        level: 'AVAILABLE' as const,
      };
      current.active += 1;

      if (
        assignment.workItem.priority === WorkPriority.HIGH ||
        assignment.workItem.priority === WorkPriority.CRITICAL
      ) {
        current.highPriority += 1;
      }

      if (assignment.workItem.dueAt.getTime() < now.getTime()) {
        current.overdue += 1;
      }

      if (assignment.workItem.completionReports.length > 0) {
        current.waitingForReview += 1;
      }

      summaries.set(assignment.assigneeAccountId, current);
    }

    for (const [accountId, workload] of summaries) {
      workload.level = this.getWorkloadLevel(workload);
      summaries.set(accountId, workload);
    }

    return summaries;
  }

  private getWorkloadLevel(
    workload: Omit<WorkloadSummary, 'level'>,
  ): WorkloadLevel {
    if (
      workload.overdue > 0 ||
      workload.highPriority >= 2 ||
      workload.active >= 6
    ) {
      return 'OVERLOADED';
    }

    if (workload.highPriority >= 1 || workload.active >= 4) {
      return 'BUSY';
    }

    if (workload.active >= 2) {
      return 'MODERATE';
    }

    return 'AVAILABLE';
  }

  private emptyWorkload(): WorkloadSummary {
    return {
      active: 0,
      highPriority: 0,
      overdue: 0,
      waitingForReview: 0,
      level: 'AVAILABLE',
    };
  }

  private toAccountSummary(account: AssignmentCandidateRecord) {
    return {
      id: account.id,
      role: account.role,
      username: account.username,
      employee: account.employee
        ? {
            id: account.employee.id,
            empId: account.employee.empId,
            empName: account.employee.empName,
            designation: account.employee.designation,
            divisionId: account.employee.divisionId,
            departmentId: account.employee.departmentId,
          }
        : null,
    };
  }

  private getScopeSummary(actor: WorkActorContext) {
    return {
      role: actor.role,
      type:
        actor.role === AccountRole.SUPER_ADMIN
          ? ('ORGANIZATION' as const)
          : actor.role === AccountRole.SENIOR_MANAGEMENT
            ? ('DIVISION' as const)
            : ('DEPARTMENT' as const),
      divisionId: actor.divisionId,
      departmentId: actor.departmentId,
    };
  }

  private async assertDepartmentFilterInsideScope(
    actor: WorkActorContext,
    departmentId: string,
  ): Promise<void> {
    // Department-first selectors are usability controls; the API independently
    // verifies that a manipulated department ID remains inside management scope.
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, isActive: true },
      select: { divisionId: true },
    });

    if (!department) {
      throw new ForbiddenException('The selected department is not available.');
    }

    if (
      actor.role !== AccountRole.SUPER_ADMIN &&
      department.divisionId !== actor.divisionId
    ) {
      throw new ForbiddenException(
        'The selected department is outside your authorized division.',
      );
    }
  }

  private getKathmanduCalendarDay(value: Date): { start: Date; end: Date } {
    // Nepal is UTC+05:45; converting the calendar boundary avoids server-timezone drift.
    const offsetMs = 5.75 * 60 * 60 * 1000;
    const kathmandu = new Date(value.getTime() + offsetMs);
    const startInKathmandu = Date.UTC(
      kathmandu.getUTCFullYear(),
      kathmandu.getUTCMonth(),
      kathmandu.getUTCDate(),
    );

    return {
      start: new Date(startInKathmandu - offsetMs),
      end: new Date(startInKathmandu - offsetMs + 24 * 60 * 60 * 1000),
    };
  }
}
