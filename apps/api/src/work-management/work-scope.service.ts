import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
  ManagementPositionType,
  WorkItemStatus,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';

const workAccountSelect = {
  id: true,
  role: true,
  isEnabled: true,
  username: true,
  employee: {
    select: {
      id: true,
      empId: true,
      empName: true,
      designation: true,
      status: true,
      employmentStatus: true,
      archivedAt: true,
      isActivated: true,
      divisionId: true,
      departmentId: true,
      division: {
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
        },
      },
      departmentUnit: {
        select: {
          id: true,
          divisionId: true,
          code: true,
          name: true,
          workFunction: true,
          isActive: true,
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
          id: true,
          position: {
            select: {
              id: true,
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

export type WorkAccountRecord = Prisma.AccountGetPayload<{
  select: typeof workAccountSelect;
}>;

const workTeamSelect = {
  id: true,
  name: true,
  departmentId: true,
  teamAdminEmployeeId: true,
  isActive: true,
  archivedAt: true,
  department: {
    select: {
      id: true,
      divisionId: true,
      code: true,
      name: true,
      workFunction: true,
      isActive: true,
      division: {
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
        },
      },
    },
  },
  teamAdmin: {
    select: {
      id: true,
      account: { select: workAccountSelect },
    },
  },
  members: {
    orderBy: { employee: { empName: 'asc' } },
    select: {
      employee: {
        select: {
          id: true,
          account: { select: workAccountSelect },
        },
      },
    },
  },
} satisfies Prisma.DepartmentTeamSelect;

export type WorkTeamRecord = Prisma.DepartmentTeamGetPayload<{
  select: typeof workTeamSelect;
}>;

export interface WorkActorContext {
  accountId: string;
  role: AccountRole;
  divisionId: string | null;
  departmentId: string | null;
}

@Injectable()
export class WorkScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveActorContext(
    user: AuthenticatedUser,
  ): Promise<WorkActorContext> {
    const account: WorkAccountRecord | null =
      await this.prisma.account.findUnique({
        where: {
          id: user.accountId,
        },
        select: workAccountSelect,
      });

    if (!account) {
      throw new NotFoundException('Authenticated account was not found.');
    }

    if (!account.isEnabled || account.role !== user.role) {
      throw new ForbiddenException(
        'Your account is not authorized to manage work items.',
      );
    }

    if (account.role === AccountRole.SUPER_ADMIN) {
      return {
        accountId: account.id,
        role: account.role,
        divisionId: null,
        departmentId: null,
      };
    }

    this.assertOperationalActor(account);

    const employee = account.employee;

    if (!employee?.divisionId) {
      throw new ForbiddenException(
        'Your organizational assignment is incomplete.',
      );
    }

    // Senior Management may own division-level work without belonging to one department.
    if (
      account.role !== AccountRole.SENIOR_MANAGEMENT &&
      !employee.departmentId
    ) {
      throw new ForbiddenException('Your department assignment is incomplete.');
    }

    // JWT role is not enough; management authority must still have an active position assignment.
    if (
      account.role === AccountRole.SENIOR_MANAGEMENT ||
      account.role === AccountRole.TEAM_MANAGER
    ) {
      this.assertCurrentManagementAssignment(account);
    }

    return {
      accountId: account.id,
      role: account.role,
      divisionId: employee.divisionId,
      departmentId: employee.departmentId,
    };
  }

  assertCanCreateWork(actor: WorkActorContext): void {
    if (actor.role === AccountRole.EMPLOYEE) {
      throw new ForbiddenException(
        'Employees cannot assign work to other employees.',
      );
    }
  }

  async resolveAssignableAccounts(
    actor: WorkActorContext,
    accountIds: string[],
  ): Promise<WorkAccountRecord[]> {
    // Resolve every selected account server-side so hidden or tampered IDs fail closed.
    const uniqueIds = [...new Set(accountIds)];
    const accounts: WorkAccountRecord[] = await this.prisma.account.findMany({
      where: {
        id: {
          in: uniqueIds,
        },
      },
      select: workAccountSelect,
    });

    const accountsById = new Map(
      accounts.map((account) => [account.id, account]),
    );

    return uniqueIds.map((accountId) => {
      const account = accountsById.get(accountId);

      if (!account) {
        throw new NotFoundException(
          'One or more selected employees were not found.',
        );
      }

      this.assertOperationalAssignableAccount(account);
      this.assertAssignableRole(actor, account);
      this.assertAccountInsideActorScope(actor, account);

      if (
        account.role === AccountRole.SENIOR_MANAGEMENT ||
        account.role === AccountRole.TEAM_MANAGER
      ) {
        this.assertCurrentManagementAssignment(account);
      }

      return account;
    });
  }

  async resolveAssignableTeam(
    actor: WorkActorContext,
    teamId: string,
  ): Promise<WorkTeamRecord> {
    const team = await this.prisma.departmentTeam.findUnique({
      where: { id: teamId },
      select: workTeamSelect,
    });

    if (
      !team ||
      !team.isActive ||
      team.archivedAt !== null ||
      !team.department.isActive ||
      !team.department.division.isActive
    ) {
      throw new NotFoundException('The selected team is not active.');
    }

    this.assertDepartmentInsideActorScope(
      actor,
      team.department.id,
      team.department.divisionId,
    );

    // Team membership is resolved again at assignment time. This prevents an old
    // browser selection from assigning disabled employees after the team changed.
    for (const membership of team.members) {
      const account = membership.employee.account;
      if (!account || account.role !== AccountRole.EMPLOYEE) {
        throw new ForbiddenException(
          'Update this team before assigning work because one of its members is not operationally available.',
        );
      }
      this.assertOperationalAssignableAccount(account);
    }

    const adminAccount = team.teamAdmin.account;
    if (
      !adminAccount ||
      adminAccount.role !== AccountRole.EMPLOYEE ||
      !team.members.some(
        (membership) => membership.employee.account?.id === adminAccount.id,
      )
    ) {
      throw new ForbiddenException(
        'Update this team before assigning work because its Team Admin is not an active member.',
      );
    }
    this.assertOperationalAssignableAccount(adminAccount);

    return team;
  }

  async resolveSalesMember(
    actor: WorkActorContext,
    accountId: string,
    workDivisionId: string,
  ): Promise<WorkAccountRecord> {
    // Sales responsibility is assigned per work item. Department names and
    // classifications are organization data, not permission rules.
    const account = await this.resolveOperationalAccount(
      accountId,
      'The selected Sales Member was not found.',
    );

    if (account.role !== AccountRole.EMPLOYEE) {
      throw new BadRequestException(
        'Choose an active employee for Sales responsibility.',
      );
    }

    this.assertCrossDepartmentWorkDivision(
      actor,
      account.employee?.divisionId,
      workDivisionId,
      'The Sales Member must belong to the same division as the assigned team.',
    );

    return account;
  }

  async resolveSupportMembers(
    actor: WorkActorContext,
    accountIds: string[],
    workDivisionId: string,
  ): Promise<WorkAccountRecord[]> {
    const uniqueIds = [...new Set(accountIds)];
    if (uniqueIds.length === 0) return [];

    const accounts = await this.prisma.account.findMany({
      where: { id: { in: uniqueIds } },
      select: workAccountSelect,
    });
    const accountsById = new Map(
      accounts.map((account) => [account.id, account]),
    );

    return uniqueIds.map((accountId) => {
      const account = accountsById.get(accountId);
      if (!account) {
        throw new NotFoundException(
          'One or more selected Support Members were not found.',
        );
      }

      this.assertOperationalEmployee(account);
      if (account.role !== AccountRole.EMPLOYEE) {
        throw new BadRequestException(
          'Choose active employees for Supporting Staff.',
        );
      }

      this.assertCrossDepartmentWorkDivision(
        actor,
        account.employee?.divisionId,
        workDivisionId,
        'Supporting Staff must belong to the same division as the assigned work.',
      );

      return account;
    });
  }

  async resolveResponsibleManager(
    actor: WorkActorContext,
    requestedManagerAccountId: string | undefined,
    workDivisionId: string,
    workDepartmentId: string | null,
  ): Promise<WorkAccountRecord> {
    // The responsible reviewer is resolved independently from the operational assignee.
    const managerAccountId = requestedManagerAccountId ?? actor.accountId;
    const manager: WorkAccountRecord | null =
      await this.prisma.account.findUnique({
        where: {
          id: managerAccountId,
        },
        select: workAccountSelect,
      });

    if (!manager) {
      throw new NotFoundException('Responsible manager was not found.');
    }

    if (!manager.isEnabled) {
      throw new ForbiddenException(
        'The selected responsible manager is not enabled.',
      );
    }

    if (manager.role === AccountRole.SUPER_ADMIN) {
      if (
        actor.role !== AccountRole.SUPER_ADMIN ||
        manager.id !== actor.accountId
      ) {
        throw new ForbiddenException(
          'Only the Super Admin can remain the responsible manager at organization scope.',
        );
      }

      return manager;
    }

    this.assertOperationalManager(manager);
    this.assertCurrentManagementAssignment(manager);

    if (actor.role === AccountRole.TEAM_MANAGER) {
      if (manager.id !== actor.accountId) {
        throw new ForbiddenException(
          'A Team Manager must remain responsible for work they assign inside their division.',
        );
      }

      return manager;
    }

    if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      const validSeniorManager = manager.id === actor.accountId;
      const validTeamManager =
        workDepartmentId !== null &&
        manager.role === AccountRole.TEAM_MANAGER &&
        manager.employee?.divisionId === actor.divisionId &&
        manager.employee?.departmentId === workDepartmentId;

      if (!validSeniorManager && !validTeamManager) {
        throw new ForbiddenException(
          'Senior Management can select only itself or the responsible Team Manager inside the assigned division.',
        );
      }

      return manager;
    }

    const managerMatchesWorkScope =
      (manager.role === AccountRole.SENIOR_MANAGEMENT &&
        manager.employee?.divisionId === workDivisionId) ||
      (workDepartmentId !== null &&
        manager.role === AccountRole.TEAM_MANAGER &&
        manager.employee?.divisionId === workDivisionId &&
        manager.employee?.departmentId === workDepartmentId);

    if (!managerMatchesWorkScope) {
      throw new ForbiddenException(
        'The responsible manager does not match the work item organization scope.',
      );
    }

    return manager;
  }

  buildVisibleWorkWhere(actor: WorkActorContext): Prisma.WorkItemWhereInput {
    // Managers see operational work only inside their current organization scope.
    if (actor.role === AccountRole.SUPER_ADMIN) {
      return {};
    }

    if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      return {
        divisionId: actor.divisionId ?? '__missing_division__',
      };
    }

    if (actor.role === AccountRole.TEAM_MANAGER) {
      return {
        OR: [
          { departmentId: actor.departmentId ?? '__missing_department__' },
          { createdByAccountId: actor.accountId },
          { responsibleManagerAccountId: actor.accountId },
        ],
      };
    }

    return {
      OR: [
        {
          assignments: {
            some: {
              assigneeAccountId: actor.accountId,
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
              assigneeAccountId: actor.accountId,
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
                      account: { is: { id: actor.accountId } },
                    },
                  },
                },
              },
            },
          },
        },
        {
          salesMemberAccountId: actor.accountId,
        },
      ],
    };
  }

  assertCanManageWork(actor: WorkActorContext): void {
    if (actor.role === AccountRole.EMPLOYEE) {
      throw new ForbiddenException(
        "Employees cannot manage another employee's work assignment.",
      );
    }
  }

  assertCanReviewWork(
    actor: WorkActorContext,
    responsibleManagerAccountId: string,
  ): void {
    this.assertCanManageWork(actor);

    // The selected reviewer owns closure; Super Admin retains branch-wide emergency authority.
    if (
      actor.role !== AccountRole.SUPER_ADMIN &&
      actor.accountId !== responsibleManagerAccountId
    ) {
      throw new ForbiddenException(
        'Only the responsible manager can review and close this work item.',
      );
    }
  }

  async resolveHelpCandidate(
    requester: WorkActorContext,
    requestedHelperAccountId: string,
    workDepartmentId: string | null,
  ): Promise<WorkAccountRecord> {
    if (requestedHelperAccountId === requester.accountId) {
      throw new ForbiddenException(
        'You cannot send a help request to yourself.',
      );
    }

    const helper = await this.resolveOperationalAccount(
      requestedHelperAccountId,
      'Requested helper was not found.',
    );

    if (helper.role === AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'The Super Admin cannot be selected as a direct supporting employee.',
      );
    }

    // Employee-to-employee help remains inside the ticket department until a manager coordinates wider support.
    if (helper.employee?.departmentId !== workDepartmentId) {
      throw new ForbiddenException(
        'Direct help requests can be sent only to employees in the same department.',
      );
    }

    return helper;
  }

  async resolveSupportAccount(
    actor: WorkActorContext,
    accountId: string,
    workDivisionId: string,
  ): Promise<WorkAccountRecord> {
    this.assertCanManageWork(actor);
    const [account] = await this.resolveSupportMembers(
      actor,
      [accountId],
      workDivisionId,
    );

    if (!account) {
      throw new NotFoundException('Supporting employee was not found.');
    }

    return account;
  }

  async resolvePrimaryReassignmentAccount(
    actor: WorkActorContext,
    accountId: string,
    workDivisionId: string,
    workDepartmentId: string | null,
  ): Promise<WorkAccountRecord> {
    const [account] = await this.resolveAssignableAccounts(actor, [accountId]);
    if (!account) {
      throw new NotFoundException('Primary assignee was not found.');
    }

    // Primary ownership stays in the original department; cross-department staff join as support.
    const sameOperationalScope =
      account.employee?.divisionId === workDivisionId &&
      (workDepartmentId === null
        ? account.role === AccountRole.SENIOR_MANAGEMENT &&
          account.employee.departmentId === null
        : account.employee.departmentId === workDepartmentId);

    if (!sameOperationalScope) {
      throw new ForbiddenException(
        workDepartmentId === null
          ? 'Division-level responsibility can be reassigned only to Senior Management in the same division.'
          : 'Primary responsibility can be reassigned only inside the work item department.',
      );
    }

    return account;
  }

  async resolveOperationalAccount(
    accountId: string,
    notFoundMessage = 'Employee account was not found.',
  ): Promise<WorkAccountRecord> {
    const account: WorkAccountRecord | null =
      await this.prisma.account.findUnique({
        where: {
          id: accountId,
        },
        select: workAccountSelect,
      });

    if (!account) {
      throw new NotFoundException(notFoundMessage);
    }

    this.assertOperationalEmployee(account);
    return account;
  }

  private assertDepartmentInsideActorScope(
    actor: WorkActorContext,
    _departmentId: string,
    divisionId: string,
  ): void {
    if (actor.role === AccountRole.SUPER_ADMIN) {
      return;
    }

    if (
      actor.role === AccountRole.SENIOR_MANAGEMENT &&
      actor.divisionId === divisionId
    ) {
      return;
    }

    if (
      actor.role === AccountRole.TEAM_MANAGER &&
      actor.divisionId === divisionId
    ) {
      return;
    }

    throw new ForbiddenException(
      'The selected team is outside your authorized work-assignment division.',
    );
  }

  private assertCrossDepartmentWorkDivision(
    actor: WorkActorContext,
    targetDivisionId: string | null | undefined,
    workDivisionId: string,
    message: string,
  ): void {
    if (targetDivisionId !== workDivisionId) {
      throw new ForbiddenException(message);
    }

    if (
      actor.role !== AccountRole.SUPER_ADMIN &&
      actor.divisionId !== workDivisionId
    ) {
      throw new ForbiddenException(message);
    }
  }

  private assertOperationalActor(account: WorkAccountRecord): void {
    this.assertOperationalAccount(
      account,
      account.role !== AccountRole.SENIOR_MANAGEMENT,
      'Your account is not available for operational work management.',
    );
  }

  private assertOperationalManager(account: WorkAccountRecord): void {
    this.assertOperationalAccount(
      account,
      account.role !== AccountRole.SENIOR_MANAGEMENT,
      'The selected responsible manager is not operationally available.',
    );
  }

  private assertOperationalAssignableAccount(account: WorkAccountRecord): void {
    this.assertOperationalAccount(
      account,
      account.role !== AccountRole.SENIOR_MANAGEMENT,
      'The selected staff member is not available for work assignment.',
    );
  }

  private assertOperationalEmployee(account: WorkAccountRecord): void {
    this.assertOperationalAccount(
      account,
      true,
      'The selected employee is not available for work assignment.',
    );
  }

  private assertOperationalAccount(
    account: WorkAccountRecord,
    requireActiveDepartment: boolean,
    errorMessage: string,
  ): void {
    const employee = account.employee;

    if (
      !account.isEnabled ||
      !employee ||
      employee.status !== EmployeeStatus.ACTIVE ||
      employee.employmentStatus !== EmploymentStatus.ACTIVE ||
      employee.archivedAt !== null ||
      !employee.isActivated ||
      !employee.division?.isActive ||
      (requireActiveDepartment && !employee.departmentUnit?.isActive)
    ) {
      throw new ForbiddenException(errorMessage);
    }
  }

  private assertAssignableRole(
    actor: WorkActorContext,
    target: WorkAccountRecord,
  ): void {
    // Role hierarchy is enforced here as well as in the controller guard.
    // Assignment authority follows the locked role hierarchy and never trusts frontend options.
    const allowedRolesByActor: Record<AccountRole, AccountRole[]> = {
      [AccountRole.SUPER_ADMIN]: [
        AccountRole.SENIOR_MANAGEMENT,
        AccountRole.TEAM_MANAGER,
        AccountRole.EMPLOYEE,
      ],
      [AccountRole.SENIOR_MANAGEMENT]: [
        AccountRole.TEAM_MANAGER,
        AccountRole.EMPLOYEE,
      ],
      [AccountRole.TEAM_MANAGER]: [AccountRole.EMPLOYEE],
      [AccountRole.EMPLOYEE]: [],
    };

    if (!allowedRolesByActor[actor.role].includes(target.role)) {
      throw new ForbiddenException(
        'You cannot assign work to the selected account role.',
      );
    }
  }

  private assertAccountInsideActorScope(
    actor: WorkActorContext,
    target: WorkAccountRecord,
  ): void {
    if (actor.role === AccountRole.SUPER_ADMIN) {
      return;
    }

    // Scope checks are repeated server-side even when the candidate list was generated by the API.
    if (
      actor.role === AccountRole.SENIOR_MANAGEMENT &&
      target.employee?.divisionId === actor.divisionId
    ) {
      return;
    }

    if (
      actor.role === AccountRole.TEAM_MANAGER &&
      target.employee?.divisionId === actor.divisionId
    ) {
      // Create Work can coordinate sibling departments inside the manager's
      // division without granting any department-management permissions.
      return;
    }

    throw new ForbiddenException(
      'The selected employee is outside your authorized organization scope.',
    );
  }

  private assertCurrentManagementAssignment(account: WorkAccountRecord): void {
    const assignment = account.employee?.managementAssignments[0];
    const position = assignment?.position;
    const requiredPositionType =
      account.role === AccountRole.SENIOR_MANAGEMENT
        ? ManagementPositionType.SENIOR_MANAGEMENT
        : account.role === AccountRole.TEAM_MANAGER
          ? ManagementPositionType.TEAM_MANAGER
          : null;

    if (
      !requiredPositionType ||
      !position?.isActive ||
      position.positionType !== requiredPositionType ||
      position.divisionId !== account.employee?.divisionId ||
      (requiredPositionType === ManagementPositionType.TEAM_MANAGER &&
        position.departmentId !== account.employee?.departmentId)
    ) {
      throw new ForbiddenException(
        'The management account does not have a current organizational assignment.',
      );
    }
  }
}
