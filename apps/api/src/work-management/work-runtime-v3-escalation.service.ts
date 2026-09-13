import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  EmployeeStatus,
  EmploymentStatus,
  OrgLeadershipType,
  WorkStageAssignmentRole,
  WorkStageAssignmentTargetType,
  WorkStageStatus,
} from '../generated/prisma/client';
import { CAPABILITIES } from '../organization/organization-capabilities';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';

type EscalationStepKind =
  | 'ASSIGNEE'
  | 'TEAM_LEAD'
  | 'ORG_UNIT_HEAD'
  | 'OFFICE_HEAD';

type EscalationOrgUnit = {
  id: string;
  code: string;
  name: string;
};

type EscalationStep = {
  level: number;
  kind: EscalationStepKind;
  accountId: string;
  employeeId: string | null;
  employeeCode: string | null;
  employeeName: string | null;
  orgUnit: EscalationOrgUnit | null;
  hierarchyDepth: number | null;
  leadershipAssignmentId: string | null;
  leadershipType: OrgLeadershipType | null;
  isActing: boolean;
};

type ActiveLeadershipAssignment = {
  id: string;
  orgUnitId: string | null;
  leadershipType: OrgLeadershipType;
  isActing: boolean;
  effectiveFrom: Date;
  employee: {
    id: string;
    empId: string;
    empName: string;
    status: EmployeeStatus;
    employmentStatus: EmploymentStatus;
    archivedAt: Date | null;
    account: {
      id: string;
      isEnabled: boolean;
    } | null;
  };
};

@Injectable()
export class WorkRuntimeV3EscalationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: OrganizationAuthorizationService,
  ) {}

  async getStageEscalation(
    user: AuthenticatedUser,
    officeId: string,
    stageId: string,
  ) {
    const escalation = await this.resolveStageEscalation(officeId, stageId);
    if (
      !(await this.canViewEscalation(
        user,
        officeId,
        stageId,
        escalation.createdByAccountId,
        escalation.responsibleOrgUnit.id,
      ))
    ) {
      throw new ForbiddenException(
        'You do not have access to this Work stage escalation path.',
      );
    }
    return escalation;
  }

  async resolveStageEscalation(
    officeId: string,
    stageId: string,
    at = new Date(),
  ) {
    const stage = await this.prisma.workStage.findFirst({
      where: {
        id: stageId,
        workItem: { officeId },
      },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        dueAt: true,
        responsibleOrgUnitId: true,
        workItem: {
          select: {
            id: true,
            ticketNumber: true,
            createdByAccountId: true,
            runtimeStatus: true,
          },
        },
        responsibleOrgUnit: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        assignments: {
          where: {
            endsAt: null,
            assignmentRole: WorkStageAssignmentRole.PRIMARY,
          },
          orderBy: { startsAt: 'desc' },
          take: 1,
          select: {
            targetType: true,
            targetOperationalTeamId: true,
            targetAccountId: true,
            targetOperationalTeam: {
              select: {
                id: true,
                code: true,
                name: true,
                orgUnitId: true,
              },
            },
            targetAccount: {
              select: {
                id: true,
                isEnabled: true,
                employee: {
                  select: {
                    id: true,
                    empId: true,
                    empName: true,
                    status: true,
                    employmentStatus: true,
                    archivedAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!stage) {
      throw new NotFoundException('Work stage was not found.');
    }

    const assignment = stage.assignments[0] ?? null;
    let operationalTeamId: string | null = null;
    const steps: EscalationStep[] = [];

    if (
      assignment?.targetType === WorkStageAssignmentTargetType.ACCOUNT &&
      assignment.targetAccount?.isEnabled &&
      assignment.targetAccount.employee &&
      assignment.targetAccount.employee.status === EmployeeStatus.ACTIVE &&
      assignment.targetAccount.employee.employmentStatus ===
        EmploymentStatus.ACTIVE &&
      assignment.targetAccount.employee.archivedAt === null
    ) {
      steps.push({
        level: 0,
        kind: 'ASSIGNEE',
        accountId: assignment.targetAccount.id,
        employeeId: assignment.targetAccount.employee.id,
        employeeCode: assignment.targetAccount.employee.empId,
        employeeName: assignment.targetAccount.employee.empName,
        orgUnit: null,
        hierarchyDepth: null,
        leadershipAssignmentId: null,
        leadershipType: null,
        isActing: false,
      });

      const operationalMembership =
        await this.prisma.operationalTeamMember.findFirst({
          where: {
            employeeId: assignment.targetAccount.employee.id,
            startsAt: { lte: at },
            OR: [{ endsAt: null }, { endsAt: { gt: at } }],
            team: {
              orgUnitId: stage.responsibleOrgUnitId,
              isActive: true,
              archivedAt: null,
              orgUnit: {
                officeId,
                isActive: true,
              },
            },
          },
          select: {
            teamId: true,
          },
        });
      operationalTeamId = operationalMembership?.teamId ?? null;
    } else if (
      assignment?.targetType === WorkStageAssignmentTargetType.TEAM &&
      assignment.targetOperationalTeamId
    ) {
      operationalTeamId = assignment.targetOperationalTeamId;
    }

    const ancestry = await this.prisma.orgUnitClosure.findMany({
      where: {
        descendantOrgUnitId: stage.responsibleOrgUnitId,
        ancestorOrgUnit: { officeId },
      },
      orderBy: { depth: 'asc' },
      select: {
        depth: true,
        ancestorOrgUnit: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    const orgUnitIds = new Set(ancestry.map((item) => item.ancestorOrgUnit.id));

    const leadership = await this.prisma.orgLeadershipAssignment.findMany({
      where: {
        officeId,
        effectiveFrom: { lte: at },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
        AND: [
          {
            OR: [
              {
                leadershipType: OrgLeadershipType.OFFICE_HEAD,
                orgUnitId: null,
              },
              {
                leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
                orgUnitId: { in: [...orgUnitIds] },
              },
            ],
          },
        ],
      },
      orderBy: [{ isActing: 'desc' }, { effectiveFrom: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        orgUnitId: true,
        leadershipType: true,
        isActing: true,
        effectiveFrom: true,
        employee: {
          select: {
            id: true,
            empId: true,
            empName: true,
            status: true,
            employmentStatus: true,
            archivedAt: true,
            account: {
              select: {
                id: true,
                isEnabled: true,
              },
            },
          },
        },
      },
    });

    if (operationalTeamId) {
      const teamLead =
        await this.prisma.operationalTeamLeadAssignment.findFirst({
          where: {
            teamId: operationalTeamId,
            effectiveFrom: { lte: at },
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
            team: {
              orgUnitId: stage.responsibleOrgUnitId,
              isActive: true,
              archivedAt: null,
              orgUnit: { officeId, isActive: true },
            },
            employee: {
              status: EmployeeStatus.ACTIVE,
              employmentStatus: EmploymentStatus.ACTIVE,
              archivedAt: null,
              account: {
                isEnabled: true,
                accountClass: { not: AccountClass.SUPER_ADMIN },
              },
            },
          },
          orderBy: [
            { isActing: 'desc' },
            { effectiveFrom: 'desc' },
            { id: 'asc' },
          ],
          select: {
            id: true,
            isActing: true,
            team: { select: { id: true, code: true, name: true } },
            employee: {
              select: {
                id: true,
                empId: true,
                empName: true,
                account: { select: { id: true } },
              },
            },
          },
        });

      if (teamLead?.employee.account) {
        steps.push({
          level: steps.length,
          kind: 'TEAM_LEAD',
          accountId: teamLead.employee.account.id,
          employeeId: teamLead.employee.id,
          employeeCode: teamLead.employee.empId,
          employeeName: teamLead.employee.empName,
          orgUnit: {
            id: teamLead.team.id,
            code: teamLead.team.code,
            name: teamLead.team.name,
          },
          hierarchyDepth: null,
          leadershipAssignmentId: teamLead.id,
          leadershipType: OrgLeadershipType.TEAM_LEAD,
          isActing: teamLead.isActing,
        });
      }
    }

    for (const item of ancestry) {
      this.appendLeadershipStep(
        steps,
        leadership,
        OrgLeadershipType.ORG_UNIT_HEAD,
        item.ancestorOrgUnit.id,
        'ORG_UNIT_HEAD',
        item.ancestorOrgUnit,
        item.depth,
      );
    }

    this.appendLeadershipStep(
      steps,
      leadership,
      OrgLeadershipType.OFFICE_HEAD,
      null,
      'OFFICE_HEAD',
      null,
      null,
    );

    const normalizedSteps = steps.map((step, index) => ({
      ...step,
      level: index,
    }));
    const recipientAccountIds = [
      ...new Set(
        normalizedSteps
          .map((step) => step.accountId)
          .filter((accountId) => accountId.length > 0),
      ),
    ];

    return {
      workItemId: stage.workItem.id,
      ticketNumber: stage.workItem.ticketNumber,
      createdByAccountId: stage.workItem.createdByAccountId,
      workStatus: stage.workItem.runtimeStatus,
      stageId: stage.id,
      stageCode: stage.code,
      stageName: stage.name,
      stageStatus: stage.status,
      dueAt: stage.dueAt,
      isOverdue:
        stage.dueAt !== null &&
        !this.isTerminalStage(stage.status) &&
        stage.dueAt.getTime() < at.getTime(),
      overdueByMinutes:
        stage.dueAt !== null &&
        !this.isTerminalStage(stage.status) &&
        stage.dueAt.getTime() < at.getTime()
          ? Math.max(
              0,
              Math.floor((at.getTime() - stage.dueAt.getTime()) / 60_000),
            )
          : 0,
      responsibleOrgUnit: {
        id: stage.responsibleOrgUnit.id,
        code: stage.responsibleOrgUnit.code,
        name: stage.responsibleOrgUnit.name,
      },
      resolvedAt: at,
      steps: normalizedSteps,
      recipientAccountIds,
      officeHeadResolved: normalizedSteps.some(
        (step) => step.kind === 'OFFICE_HEAD',
      ),
    };
  }

  private async canViewEscalation(
    user: AuthenticatedUser,
    officeId: string,
    stageId: string,
    createdByAccountId: string,
    responsibleOrgUnitId: string,
  ): Promise<boolean> {
    if (
      user.accountClass === AccountClass.SUPER_ADMIN ||
      createdByAccountId === user.accountId ||
      (await this.authorization.can(
        user,
        CAPABILITIES.WORK_VIEW,
        officeId,
        responsibleOrgUnitId,
      ))
    ) {
      return true;
    }

    const stage = await this.prisma.workStage.findFirst({
      where: {
        id: stageId,
        workItem: { officeId },
      },
      select: {
        assignments: {
          where: {
            endsAt: null,
            assignmentRole: WorkStageAssignmentRole.PRIMARY,
          },
          orderBy: { startsAt: 'desc' },
          take: 1,
          select: {
            targetType: true,
            targetOperationalTeamId: true,
            targetAccountId: true,
          },
        },
      },
    });
    if (!stage) return false;

    const assignment = stage.assignments[0] ?? null;
    if (assignment?.targetAccountId === user.accountId) {
      return true;
    }
    if (
      assignment?.targetType === WorkStageAssignmentTargetType.TEAM &&
      assignment.targetOperationalTeamId &&
      (await this.accountBelongsToOperationalTeam(
        user.accountId,
        officeId,
        assignment.targetOperationalTeamId,
      ))
    ) {
      return true;
    }
    if (
      (!assignment ||
        assignment.targetType ===
          WorkStageAssignmentTargetType.ORG_UNIT_QUEUE) &&
      (await this.authorization.can(
        user,
        CAPABILITIES.WORK_ASSIGN,
        officeId,
        responsibleOrgUnitId,
      ))
    ) {
      return true;
    }
    return false;
  }

  private async accountBelongsToOperationalTeam(
    accountId: string,
    officeId: string,
    teamId: string,
  ): Promise<boolean> {
    const now = new Date();
    return Boolean(
      await this.prisma.operationalTeam.findFirst({
        where: {
          id: teamId,
          isActive: true,
          archivedAt: null,
          orgUnit: { officeId, isActive: true },
          OR: [
            {
              members: {
                some: {
                  startsAt: { lte: now },
                  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
                  employee: {
                    status: EmployeeStatus.ACTIVE,
                    employmentStatus: EmploymentStatus.ACTIVE,
                    archivedAt: null,
                    account: {
                      id: accountId,
                      isEnabled: true,
                      accountClass: { not: AccountClass.SUPER_ADMIN },
                    },
                  },
                },
              },
            },
            {
              leadAssignments: {
                some: {
                  effectiveFrom: { lte: now },
                  OR: [
                    { effectiveUntil: null },
                    { effectiveUntil: { gt: now } },
                  ],
                  employee: {
                    status: EmployeeStatus.ACTIVE,
                    employmentStatus: EmploymentStatus.ACTIVE,
                    archivedAt: null,
                    account: {
                      id: accountId,
                      isEnabled: true,
                      accountClass: { not: AccountClass.SUPER_ADMIN },
                    },
                  },
                },
              },
            },
          ],
        },
        select: { id: true },
      }),
    );
  }

  private appendLeadershipStep(
    steps: EscalationStep[],
    assignments: ActiveLeadershipAssignment[],
    leadershipType: OrgLeadershipType,
    orgUnitId: string | null,
    kind: Exclude<EscalationStepKind, 'ASSIGNEE'>,
    orgUnit: EscalationOrgUnit | null,
    hierarchyDepth: number | null,
  ): void {
    const leader = this.resolveEffectiveLeader(
      assignments,
      leadershipType,
      orgUnitId,
    );
    if (!leader?.employee.account?.isEnabled) {
      return;
    }

    steps.push({
      level: steps.length,
      kind,
      accountId: leader.employee.account.id,
      employeeId: leader.employee.id,
      employeeCode: leader.employee.empId,
      employeeName: leader.employee.empName,
      orgUnit,
      hierarchyDepth,
      leadershipAssignmentId: leader.id,
      leadershipType: leader.leadershipType,
      isActing: leader.isActing,
    });
  }

  private resolveEffectiveLeader(
    assignments: ActiveLeadershipAssignment[],
    leadershipType: OrgLeadershipType,
    orgUnitId: string | null,
  ): ActiveLeadershipAssignment | null {
    const matching = assignments.filter(
      (assignment) =>
        assignment.leadershipType === leadershipType &&
        assignment.orgUnitId === orgUnitId &&
        assignment.employee.account?.isEnabled &&
        assignment.employee.status === EmployeeStatus.ACTIVE &&
        assignment.employee.employmentStatus === EmploymentStatus.ACTIVE &&
        assignment.employee.archivedAt === null,
    );
    if (matching.length === 0) {
      return null;
    }

    return matching.find((assignment) => assignment.isActing) ?? matching[0];
  }

  private isTerminalStage(status: WorkStageStatus): boolean {
    return (
      status === WorkStageStatus.COMPLETED ||
      status === WorkStageStatus.SKIPPED ||
      status === WorkStageStatus.CANCELLED
    );
  }
}
