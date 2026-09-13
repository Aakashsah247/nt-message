import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  EmployeeStatus,
  EmploymentStatus,
  OrgLeadershipType,
  WorkEventType,
  WorkItemStatus,
  WorkRuntimeStatus,
  WorkStageStatus,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import type { WorkItemRealtimeAction } from '../realtime/messaging-events.service';
import { WorkNotificationsService } from './work-notifications.service';
import { WorkRuntimeV3EscalationService } from './work-runtime-v3-escalation.service';

const TERMINAL_STAGE_STATUSES = [
  WorkStageStatus.COMPLETED,
  WorkStageStatus.SKIPPED,
  WorkStageStatus.CANCELLED,
];

const TERMINAL_WORK_STATUSES = [
  WorkRuntimeStatus.COMPLETED,
  WorkRuntimeStatus.CANCELLED,
];

type WorkLifecycleAction =
  | 'V3_WORK_COMPLETED'
  | 'V3_WORK_CANCELLED'
  | 'V3_WORK_REOPENED';

type LeadershipRecord = {
  id: string;
  orgUnitId: string | null;
  leadershipType: OrgLeadershipType;
  isActing: boolean;
  effectiveFrom: Date;
  employee: {
    status: EmployeeStatus;
    employmentStatus: EmploymentStatus;
    archivedAt: Date | null;
    account: {
      id: string;
      accountClass: AccountClass;
      isEnabled: boolean;
    } | null;
  };
};

@Injectable()
export class WorkRuntimeV3NotificationsService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WorkRuntimeV3NotificationsService.name);
  private deadlineTimer: ReturnType<typeof setInterval> | null = null;
  private deadlineSweepRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workNotifications: WorkNotificationsService,
    private readonly escalation: WorkRuntimeV3EscalationService,
  ) {}

  onModuleInit(): void {
    void this.processDeadlineNotifications();
    this.deadlineTimer = setInterval(() => {
      void this.processDeadlineNotifications();
    }, 60_000);
    this.deadlineTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.deadlineTimer) {
      clearInterval(this.deadlineTimer);
      this.deadlineTimer = null;
    }
  }

  async publishReadyStageEvents(
    officeId: string,
    workItemId: string,
    actorAccountId: string,
    since: Date,
  ): Promise<void> {
    await this.bestEffort('ready-stage notifications', async () => {
      const events = await this.prisma.workEvent.findMany({
        where: {
          workItemId,
          actorAccountId,
          eventType: WorkEventType.STAGE_READY,
          workStageId: { not: null },
          createdAt: { gte: since },
          workItem: {
            officeId,
            status: WorkItemStatus.V3_RUNTIME,
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          workStageId: true,
          details: true,
        },
      });

      const seen = new Set<string>();
      for (const event of events) {
        const stageId = event.workStageId;
        if (!stageId || seen.has(stageId)) continue;
        seen.add(stageId);
        const details = this.jsonObject(event.details);
        const dependencyUnblocked =
          typeof details.releasedByStageDefinitionId === 'string';
        await this.publishStageNotice({
          officeId,
          stageId,
          actorAccountId,
          action: dependencyUnblocked
            ? 'V3_DEPENDENCY_UNBLOCKED'
            : 'V3_STAGE_READY',
          title: dependencyUnblocked
            ? 'Work stage is unblocked'
            : 'Work stage is ready',
          metadata: {
            notificationReason: dependencyUnblocked
              ? 'DEPENDENCY_UNBLOCKED'
              : 'STAGE_READY',
          },
        });
      }
    });
  }

  async publishStageAssigned(
    officeId: string,
    stageId: string,
    actorAccountId: string,
  ): Promise<void> {
    await this.bestEffort('stage assignment notification', () =>
      this.publishStageNotice({
        officeId,
        stageId,
        actorAccountId,
        action: 'V3_STAGE_ASSIGNED',
        title: 'Work stage assigned',
        recipientScope: 'ASSIGNED',
        metadata: { notificationReason: 'STAGE_ASSIGNED' },
      }),
    );
  }

  async publishStageReturned(
    officeId: string,
    stageId: string,
    actorAccountId: string,
  ): Promise<void> {
    await this.bestEffort('stage return notification', () =>
      this.publishStageNotice({
        officeId,
        stageId,
        actorAccountId,
        action: 'V3_STAGE_RETURNED',
        title: 'Work stage returned',
        metadata: { notificationReason: 'STAGE_RETURNED' },
      }),
    );
  }

  async publishCollaborationRequested(
    officeId: string,
    requestId: string,
    actorAccountId: string,
  ): Promise<void> {
    await this.bestEffort('collaboration request notification', async () => {
      const request = await this.prisma.workCollaborationRequest.findFirst({
        where: {
          id: requestId,
          workItem: {
            officeId,
            status: WorkItemStatus.V3_RUNTIME,
          },
        },
        select: {
          id: true,
          purpose: true,
          requestedOrgUnitId: true,
          requestedOrgUnit: {
            select: { name: true },
          },
          workItem: {
            select: {
              id: true,
              ticketNumber: true,
              title: true,
              runtimeStatus: true,
            },
          },
        },
      });
      if (!request?.workItem.runtimeStatus) return;

      const recipientAccountIds = await this.resolveOrgUnitRecipients(
        officeId,
        request.requestedOrgUnitId,
        false,
      );
      if (recipientAccountIds.length === 0) return;

      await this.workNotifications.publishWorkUpdate({
        workItem: {
          id: request.workItem.id,
          ticketNumber: request.workItem.ticketNumber,
          title: request.workItem.title,
          status: request.workItem.runtimeStatus,
        },
        action: 'V3_COLLABORATION_REQUESTED',
        actorAccountId,
        recipientAccountIds,
        title: 'Work support requested',
        body: `${request.workItem.ticketNumber}: ${request.requestedOrgUnit.name} support requested`,
        metadata: {
          runtime: 'V3',
          notificationReason: 'COLLABORATION_REQUESTED',
          collaborationRequestId: request.id,
          requestedOrgUnitId: request.requestedOrgUnitId,
          purpose: request.purpose,
        },
      });
    });
  }

  async publishCollaborationReadyStageEvents(
    officeId: string,
    requestId: string,
    actorAccountId: string,
    since: Date,
  ): Promise<void> {
    await this.bestEffort('collaboration stage-ready notification', async () => {
      const request = await this.prisma.workCollaborationRequest.findFirst({
        where: {
          id: requestId,
          workItem: {
            officeId,
            status: WorkItemStatus.V3_RUNTIME,
          },
        },
        select: { workItemId: true },
      });
      if (!request) return;
      await this.publishReadyStageEvents(
        officeId,
        request.workItemId,
        actorAccountId,
        since,
      );
    });
  }

  async publishWorkLifecycle(
    officeId: string,
    workItemId: string,
    actorAccountId: string,
    action: WorkLifecycleAction,
  ): Promise<void> {
    await this.bestEffort('Work lifecycle notification', async () => {
      const work = await this.prisma.workItem.findFirst({
        where: {
          id: workItemId,
          officeId,
          status: WorkItemStatus.V3_RUNTIME,
        },
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          runtimeStatus: true,
          createdByAccountId: true,
          primaryOwnerOrgUnitId: true,
          orgUnitParticipants: {
            where: { endedAt: null },
            select: { orgUnitId: true },
          },
          collaborationRequests: {
            select: { requestedByAccountId: true },
          },
        },
      });
      if (!work?.runtimeStatus || !work.primaryOwnerOrgUnitId) return;
      if (
        (action === 'V3_WORK_COMPLETED' &&
          work.runtimeStatus !== WorkRuntimeStatus.COMPLETED) ||
        (action === 'V3_WORK_CANCELLED' &&
          work.runtimeStatus !== WorkRuntimeStatus.CANCELLED) ||
        (action === 'V3_WORK_REOPENED' &&
          (work.runtimeStatus === WorkRuntimeStatus.COMPLETED ||
            work.runtimeStatus === WorkRuntimeStatus.CANCELLED))
      ) {
        return;
      }

      const recipients = new Set<string>([
        work.createdByAccountId,
        ...work.collaborationRequests.map(
          (request) => request.requestedByAccountId,
        ),
      ]);
      const participantOrgUnitIds = [
        ...new Set([
          work.primaryOwnerOrgUnitId,
          ...work.orgUnitParticipants.map((participant) => participant.orgUnitId),
        ]),
      ];
      for (const orgUnitId of participantOrgUnitIds) {
        for (const accountId of await this.resolveOrgUnitRecipients(
          officeId,
          orgUnitId,
          false,
        )) {
          recipients.add(accountId);
        }
      }
      const recipientAccountIds = await this.filterOperationalRecipients([
        ...recipients,
      ]);
      if (recipientAccountIds.length === 0) return;

      const message = this.workLifecycleMessage(action);
      await this.workNotifications.publishWorkUpdate({
        workItem: {
          id: work.id,
          ticketNumber: work.ticketNumber,
          title: work.title,
          status: work.runtimeStatus,
        },
        action,
        actorAccountId,
        recipientAccountIds,
        title: message.title,
        body: `${work.ticketNumber}: ${work.title}`,
        metadata: {
          runtime: 'V3',
          notificationReason: message.reason,
        },
      });
    });
  }

  async processDeadlineNotifications(): Promise<void> {
    if (this.deadlineSweepRunning) return;
    this.deadlineSweepRunning = true;
    try {
      const now = new Date();
      await this.processWorkDeadlines(now);
      await this.processStageDeadlines(now);
    } catch (error) {
      this.logger.warn(
        `V3 Work deadline notification sweep failed: ${this.safeErrorMessage(error)}`,
      );
    } finally {
      this.deadlineSweepRunning = false;
    }
  }

  private async processWorkDeadlines(now: Date): Promise<void> {
    const dueSoonBoundary = new Date(now.getTime() + 60 * 60 * 1000);
    const candidates = await this.prisma.workItem.findMany({
      where: {
        status: WorkItemStatus.V3_RUNTIME,
        runtimeStatus: { notIn: TERMINAL_WORK_STATUSES },
        OR: [
          {
            dueSoonNotifiedAt: null,
            dueAt: { gt: now, lte: dueSoonBoundary },
          },
          {
            overdueNotifiedAt: null,
            dueAt: { lte: now },
          },
        ],
      },
      take: 100,
      orderBy: { dueAt: 'asc' },
      select: {
        id: true,
        officeId: true,
        ticketNumber: true,
        title: true,
        runtimeStatus: true,
        dueAt: true,
        dueSoonNotifiedAt: true,
        overdueNotifiedAt: true,
        createdByAccountId: true,
        primaryOwnerOrgUnitId: true,
      },
    });

    for (const work of candidates) {
      if (!work.officeId || !work.runtimeStatus || !work.primaryOwnerOrgUnitId) {
        continue;
      }
      const overdue = work.dueAt.getTime() <= now.getTime();
      if (overdue ? work.overdueNotifiedAt : work.dueSoonNotifiedAt) continue;

      const recipientAccountIds = await this.resolveWorkDeadlineRecipients(
        work.officeId,
        work.createdByAccountId,
        work.primaryOwnerOrgUnitId,
        overdue,
      );
      if (recipientAccountIds.length > 0) {
        await this.workNotifications.publishWorkUpdate({
          workItem: {
            id: work.id,
            ticketNumber: work.ticketNumber,
            title: work.title,
            status: work.runtimeStatus,
          },
          action: overdue ? 'OVERDUE' : 'DUE_SOON',
          actorAccountId: null,
          recipientAccountIds,
          title: overdue ? 'Work is overdue' : 'Work is due soon',
          body: `${work.ticketNumber}: ${work.title}`,
          metadata: {
            runtime: 'V3',
            notificationReason: overdue ? 'WORK_OVERDUE' : 'WORK_DUE_SOON',
            dueAt: work.dueAt.toISOString(),
          },
        });
      }

      await this.prisma.workItem.updateMany({
        where: {
          id: work.id,
          ...(overdue
            ? { overdueNotifiedAt: null }
            : { dueSoonNotifiedAt: null }),
        },
        data: overdue
          ? { overdueNotifiedAt: now }
          : { dueSoonNotifiedAt: now },
      });
    }
  }

  private async processStageDeadlines(now: Date): Promise<void> {
    const dueSoonBoundary = new Date(now.getTime() + 60 * 60 * 1000);
    const candidates = await this.prisma.workStage.findMany({
      where: {
        status: { notIn: TERMINAL_STAGE_STATUSES },
        dueAt: { not: null },
        workItem: {
          status: WorkItemStatus.V3_RUNTIME,
          runtimeStatus: { notIn: TERMINAL_WORK_STATUSES },
        },
        OR: [
          {
            dueSoonNotifiedAt: null,
            dueAt: { gt: now, lte: dueSoonBoundary },
          },
          {
            overdueNotifiedAt: null,
            dueAt: { lte: now },
          },
        ],
      },
      take: 100,
      orderBy: { dueAt: 'asc' },
      select: {
        id: true,
        workItemId: true,
        dueAt: true,
        dueSoonNotifiedAt: true,
        overdueNotifiedAt: true,
        workItem: {
          select: { officeId: true },
        },
      },
    });

    for (const stage of candidates) {
      const officeId = stage.workItem.officeId;
      if (!officeId || !stage.dueAt) continue;
      const overdue = stage.dueAt.getTime() <= now.getTime();
      if (overdue ? stage.overdueNotifiedAt : stage.dueSoonNotifiedAt) continue;

      await this.publishStageNotice({
        officeId,
        stageId: stage.id,
        actorAccountId: null,
        action: overdue ? 'OVERDUE' : 'DUE_SOON',
        title: overdue ? 'Work stage is overdue' : 'Work stage is due soon',
        fullEscalation: overdue,
        metadata: {
          notificationReason: overdue ? 'STAGE_OVERDUE' : 'STAGE_DUE_SOON',
          dueAt: stage.dueAt.toISOString(),
        },
      });

      await this.prisma.workStage.updateMany({
        where: {
          id: stage.id,
          ...(overdue
            ? { overdueNotifiedAt: null }
            : { dueSoonNotifiedAt: null }),
        },
        data: overdue
          ? { overdueNotifiedAt: now }
          : { dueSoonNotifiedAt: now },
      });
    }
  }

  private async publishStageNotice(input: {
    officeId: string;
    stageId: string;
    actorAccountId: string | null;
    action: WorkItemRealtimeAction;
    title: string;
    fullEscalation?: boolean;
    recipientScope?: 'READY' | 'ASSIGNED';
    metadata?: Prisma.InputJsonObject;
  }): Promise<void> {
    const [escalation, stage] = await Promise.all([
      this.escalation.resolveStageEscalation(input.officeId, input.stageId),
      this.prisma.workStage.findFirst({
        where: {
          id: input.stageId,
          workItem: {
            officeId: input.officeId,
            status: WorkItemStatus.V3_RUNTIME,
          },
        },
        select: {
          id: true,
          name: true,
          status: true,
          assignments: {
            where: {
              endsAt: null,
              assignmentRole: 'PRIMARY',
            },
            orderBy: { startsAt: 'desc' },
            take: 1,
            select: {
              targetType: true,
              targetOperationalTeamId: true,
            },
          },
          workItem: {
            select: {
              id: true,
              ticketNumber: true,
              title: true,
              runtimeStatus: true,
            },
          },
        },
      }),
    ]);
    if (!stage?.workItem.runtimeStatus) return;

    let rawRecipients = input.fullEscalation
      ? escalation.recipientAccountIds
      : input.recipientScope === 'ASSIGNED'
        ? this.assignmentRecipients(escalation.steps)
        : this.immediateEscalationRecipients(escalation.steps);

    const assignment = stage.assignments[0] ?? null;
    if (
      input.recipientScope === 'ASSIGNED' &&
      assignment?.targetType === 'TEAM' &&
      assignment.targetOperationalTeamId
    ) {
      rawRecipients = [
        ...rawRecipients,
        ...(await this.resolveOperationalTeamRecipients(
          input.officeId,
          assignment.targetOperationalTeamId,
        )),
      ];
    }
    const recipientAccountIds = await this.filterOperationalRecipients(
      rawRecipients,
    );
    if (recipientAccountIds.length === 0) return;

    await this.workNotifications.publishWorkUpdate({
      workItem: {
        id: stage.workItem.id,
        ticketNumber: stage.workItem.ticketNumber,
        title: stage.workItem.title,
        status: stage.workItem.runtimeStatus,
      },
      action: input.action,
      actorAccountId: input.actorAccountId,
      recipientAccountIds,
      title: input.title,
      body: `${stage.workItem.ticketNumber}: ${stage.name}`,
      metadata: {
        runtime: 'V3',
        workStageId: stage.id,
        workStageStatus: stage.status,
        ...input.metadata,
      },
    });
  }

  private immediateEscalationRecipients(
    steps: Array<{
      kind: string;
      accountId: string;
      hierarchyDepth: number | null;
    }>,
  ): string[] {
    const immediate = steps
      .filter(
        (step) =>
          step.kind === 'ASSIGNEE' ||
          step.kind === 'TEAM_LEAD' ||
          (step.kind === 'ORG_UNIT_HEAD' && step.hierarchyDepth === 0),
      )
      .map((step) => step.accountId);
    if (immediate.length > 0) return [...new Set(immediate)];
    const fallback = steps.find((step) => step.accountId.length > 0);
    return fallback ? [fallback.accountId] : [];
  }

  private assignmentRecipients(
    steps: Array<{
      kind: string;
      accountId: string;
      hierarchyDepth: number | null;
    }>,
  ): string[] {
    const assigned = steps
      .filter(
        (step) => step.kind === 'ASSIGNEE' || step.kind === 'TEAM_LEAD',
      )
      .map((step) => step.accountId);
    if (assigned.length > 0) return [...new Set(assigned)];

    const responsibleLeader = steps.find(
      (step) =>
        step.kind === 'ORG_UNIT_HEAD' && step.hierarchyDepth === 0,
    );
    if (responsibleLeader) return [responsibleLeader.accountId];

    const fallback = steps.find((step) => step.accountId.length > 0);
    return fallback ? [fallback.accountId] : [];
  }

  private async resolveWorkDeadlineRecipients(
    officeId: string,
    createdByAccountId: string,
    primaryOwnerOrgUnitId: string,
    overdue: boolean,
  ): Promise<string[]> {
    return this.filterOperationalRecipients([
      createdByAccountId,
      ...(await this.resolveOrgUnitRecipients(
        officeId,
        primaryOwnerOrgUnitId,
        overdue,
      )),
    ]);
  }

  private async resolveOperationalTeamRecipients(
    officeId: string,
    teamId: string,
    at = new Date(),
  ): Promise<string[]> {
    const team = await this.prisma.operationalTeam.findFirst({
      where: {
        id: teamId,
        isActive: true,
        archivedAt: null,
        orgUnit: { officeId, isActive: true },
      },
      select: {
        members: {
          where: {
            startsAt: { lte: at },
            OR: [{ endsAt: null }, { endsAt: { gt: at } }],
          },
          select: {
            employee: {
              select: {
                status: true,
                employmentStatus: true,
                archivedAt: true,
                account: {
                  select: { id: true, accountClass: true, isEnabled: true },
                },
              },
            },
          },
        },
        leadAssignments: {
          where: {
            effectiveFrom: { lte: at },
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
          },
          orderBy: [
            { isActing: 'desc' },
            { effectiveFrom: 'desc' },
            { id: 'asc' },
          ],
          take: 1,
          select: {
            employee: {
              select: {
                status: true,
                employmentStatus: true,
                archivedAt: true,
                account: {
                  select: { id: true, accountClass: true, isEnabled: true },
                },
              },
            },
          },
        },
      },
    });
    if (!team) return [];

    const accountIds = [
      ...team.members.map((item) => item.employee.account?.id ?? ''),
      ...team.leadAssignments.map((item) => item.employee.account?.id ?? ''),
    ];
    return this.filterOperationalRecipients(accountIds);
  }

  private async resolveOrgUnitRecipients(
    officeId: string,
    orgUnitId: string,
    fullEscalation: boolean,
    at = new Date(),
  ): Promise<string[]> {
    const ancestry = await this.prisma.orgUnitClosure.findMany({
      where: {
        descendantOrgUnitId: orgUnitId,
        ancestorOrgUnit: { officeId },
      },
      orderBy: { depth: 'asc' },
      select: {
        depth: true,
        ancestorOrgUnit: {
          select: {
            id: true,
          },
        },
      },
    });
    if (ancestry.length === 0) return [];

    const orgUnitIds = ancestry.map((item) => item.ancestorOrgUnit.id);
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
                orgUnitId: { in: orgUnitIds },
              },
            ],
          },
        ],
      },
      orderBy: [
        { isActing: 'desc' },
        { effectiveFrom: 'desc' },
        { id: 'asc' },
      ],
      select: {
        id: true,
        orgUnitId: true,
        leadershipType: true,
        isActing: true,
        effectiveFrom: true,
        employee: {
          select: {
            status: true,
            employmentStatus: true,
            archivedAt: true,
            account: {
              select: { id: true, accountClass: true, isEnabled: true },
            },
          },
        },
      },
    });

    const recipients: string[] = [];
    for (const item of ancestry) {
      const unitHead = this.pickLeader(
        leadership,
        OrgLeadershipType.ORG_UNIT_HEAD,
        item.ancestorOrgUnit.id,
      );
      if (unitHead) recipients.push(unitHead);
      if (!fullEscalation && recipients.length > 0) break;
    }

    if (fullEscalation || recipients.length === 0) {
      const officeHead = this.pickLeader(
        leadership,
        OrgLeadershipType.OFFICE_HEAD,
        null,
      );
      if (officeHead) recipients.push(officeHead);
    }

    return this.filterOperationalRecipients(recipients);
  }

  private pickLeader(
    assignments: LeadershipRecord[],
    leadershipType: OrgLeadershipType,
    orgUnitId: string | null,
  ): string | null {
    const matches = assignments.filter(
      (assignment) =>
        assignment.leadershipType === leadershipType &&
        assignment.orgUnitId === orgUnitId &&
        assignment.employee.status === EmployeeStatus.ACTIVE &&
        assignment.employee.employmentStatus === EmploymentStatus.ACTIVE &&
        assignment.employee.archivedAt === null &&
        assignment.employee.account?.isEnabled &&
        assignment.employee.account.accountClass !== AccountClass.SUPER_ADMIN,
    );
    const selected = matches.find((assignment) => assignment.isActing) ?? matches[0];
    return selected?.employee.account?.id ?? null;
  }

  private async filterOperationalRecipients(
    accountIds: string[],
  ): Promise<string[]> {
    const unique = [...new Set(accountIds.filter(Boolean))];
    if (unique.length === 0) return [];
    const accounts = await this.prisma.account.findMany({
      where: {
        id: { in: unique },
        isEnabled: true,
        accountClass: { not: AccountClass.SUPER_ADMIN },
        employee: {
          is: {
            status: EmployeeStatus.ACTIVE,
            employmentStatus: EmploymentStatus.ACTIVE,
            archivedAt: null,
          },
        },
      },
      select: { id: true },
    });
    const allowed = new Set(accounts.map((account) => account.id));
    return unique.filter((accountId) => allowed.has(accountId));
  }

  private workLifecycleMessage(action: WorkLifecycleAction) {
    switch (action) {
      case 'V3_WORK_COMPLETED':
        return { title: 'Work completed', reason: 'WORK_COMPLETED' } as const;
      case 'V3_WORK_CANCELLED':
        return { title: 'Work cancelled', reason: 'WORK_CANCELLED' } as const;
      case 'V3_WORK_REOPENED':
        return { title: 'Work reopened', reason: 'WORK_REOPENED' } as const;
    }
  }

  private jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private async bestEffort(
    context: string,
    action: () => Promise<void>,
  ): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.logger.warn(
        `Unable to publish V3 ${context}: ${this.safeErrorMessage(error)}`,
      );
    }
  }

  private safeErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown notification error';
  }
}
