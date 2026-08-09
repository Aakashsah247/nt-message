import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
  MessagingNotificationType,
  WorkItemStatus,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import {
  MessagingEventsService,
  type WorkItemRealtimeAction,
} from '../realtime/messaging-events.service';

const workNotificationSelect = {
  id: true,
  recipientAccountId: true,
  actorAccountId: true,
  conversationId: true,
  messageId: true,
  announcementId: true,
  type: true,
  title: true,
  body: true,
  isRead: true,
  readAt: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  actor: {
    select: {
      id: true,
      username: true,
      role: true,
      profilePhotoKey: true,
      profileBio: true,
      showOnlineStatus: true,
      showReadReceipts: true,
      employee: {
        select: {
          id: true,
          empId: true,
          empName: true,
          designation: true,
          profilePhotoKey: true,
          profileBio: true,
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
              code: true,
              name: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.MessagingNotificationSelect;

type WorkNotificationRecord = Prisma.MessagingNotificationGetPayload<{
  select: typeof workNotificationSelect;
}>;

export interface PublishWorkUpdateInput {
  workItem: {
    id: string;
    ticketNumber: string;
    title: string;
    status: string;
    priority: string;
    assignedTeamId?: string | null;
    salesMemberAccountId?: string | null;
  };
  action: WorkItemRealtimeAction;
  actorAccountId: string | null;
  recipientAccountIds: string[];
  title: string;
  body: string;
  metadata?: Prisma.InputJsonObject;
}

const TERMINAL_WORK_STATUSES = [
  WorkItemStatus.CLOSED,
  WorkItemStatus.CANCELLED,
] as const;

@Injectable()
export class WorkNotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkNotificationsService.name);
  private deadlineTimer: ReturnType<typeof setInterval> | null = null;
  private deadlineSweepRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingEventsService: MessagingEventsService,
  ) {}

  onModuleInit(): void {
    // Deadline reminders are best-effort operational notices and never block API startup.
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

  async publishWorkUpdate(input: PublishWorkUpdateInput): Promise<void> {
    const relationshipRecipients = await this.resolveRelationshipRecipients(
      input.workItem,
    );
    const realtimeRecipients = [
      ...new Set([...input.recipientAccountIds, ...relationshipRecipients]),
    ];
    const notificationRecipients = realtimeRecipients.filter(
      (accountId) => accountId !== input.actorAccountId,
    );
    const occurredAt = new Date();

    for (const recipientAccountId of notificationRecipients) {
      try {
        const notification = await this.prisma.messagingNotification.create({
          data: {
            recipientAccountId,
            actorAccountId: input.actorAccountId,
            type: MessagingNotificationType.WORK_ITEM,
            title: input.title,
            body: input.body,
            metadata: {
              kind: 'WORK_ITEM',
              workItemId: input.workItem.id,
              ticketNumber: input.workItem.ticketNumber,
              action: input.action,
              status: input.workItem.status,
              priority: input.workItem.priority,
              ...input.metadata,
            },
          },
          select: workNotificationSelect,
        });
        const unreadCount = await this.prisma.messagingNotification.count({
          where: {
            recipientAccountId,
            isRead: false,
          },
        });

        this.messagingEventsService.emitNotificationCreated(
          recipientAccountId,
          {
            notification: this.serializeNotification(notification),
            unreadCount,
            occurredAt: occurredAt.toISOString(),
          },
        );
      } catch (error) {
        // The work action remains authoritative even when a notification cannot be persisted.
        this.logger.warn(
          `Unable to create work notification for account ${recipientAccountId}: ${this.safeErrorMessage(error)}`,
        );
      }
    }

    this.messagingEventsService.emitWorkItemUpdated(realtimeRecipients, {
      workItemId: input.workItem.id,
      ticketNumber: input.workItem.ticketNumber,
      status: input.workItem.status,
      priority: input.workItem.priority,
      action: input.action,
      actorAccountId: input.actorAccountId,
      occurredAt: occurredAt.toISOString(),
    });
  }

  async processDeadlineNotifications(): Promise<void> {
    if (this.deadlineSweepRunning) {
      return;
    }

    this.deadlineSweepRunning = true;

    try {
      const now = new Date();
      const dueSoonBoundary = new Date(now.getTime() + 60 * 60 * 1000);
      const candidates = await this.prisma.workItem.findMany({
        where: {
          status: {
            notIn: [...TERMINAL_WORK_STATUSES],
          },
          OR: [
            {
              dueSoonNotifiedAt: null,
              dueAt: {
                gt: now,
                lte: dueSoonBoundary,
              },
            },
            {
              overdueNotifiedAt: null,
              dueAt: {
                lte: now,
              },
            },
          ],
        },
        take: 100,
        orderBy: {
          dueAt: 'asc',
        },
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          status: true,
          priority: true,
          dueAt: true,
          dueSoonNotifiedAt: true,
          overdueNotifiedAt: true,
          responsibleManagerAccountId: true,
          assignedTeamId: true,
          salesMemberAccountId: true,
          assignments: {
            where: {
              endedAt: null,
            },
            select: {
              assigneeAccountId: true,
            },
          },
        },
      });

      for (const workItem of candidates) {
        const isOverdue = workItem.dueAt.getTime() <= now.getTime();
        const markerValue = isOverdue
          ? workItem.overdueNotifiedAt
          : workItem.dueSoonNotifiedAt;

        if (markerValue) {
          continue;
        }

        const recipients = [
          workItem.responsibleManagerAccountId,
          ...workItem.assignments.map(
            (assignment) => assignment.assigneeAccountId,
          ),
        ];

        await this.publishWorkUpdate({
          workItem,
          action: isOverdue ? 'OVERDUE' : 'DUE_SOON',
          actorAccountId: null,
          recipientAccountIds: recipients,
          title: isOverdue ? 'Work is overdue' : 'Work is due soon',
          body: `${workItem.ticketNumber}: ${workItem.title}`,
          metadata: {
            dueAt: workItem.dueAt.toISOString(),
          },
        });

        if (isOverdue) {
          // Keep each Prisma update shape explicit so the generated input type remains narrow.
          await this.prisma.workItem.updateMany({
            where: {
              id: workItem.id,
              overdueNotifiedAt: null,
            },
            data: {
              overdueNotifiedAt: now,
            },
          });
        } else {
          // Due-soon and overdue markers are independent and may be delivered at different times.
          await this.prisma.workItem.updateMany({
            where: {
              id: workItem.id,
              dueSoonNotifiedAt: null,
            },
            data: {
              dueSoonNotifiedAt: now,
            },
          });
        }
      }
    } catch (error) {
      this.logger.warn(
        `Work deadline notification sweep failed: ${this.safeErrorMessage(error)}`,
      );
    } finally {
      this.deadlineSweepRunning = false;
    }
  }

  private async resolveRelationshipRecipients(workItem: {
    assignedTeamId?: string | null;
    salesMemberAccountId?: string | null;
  }): Promise<string[]> {
    const recipients = workItem.salesMemberAccountId
      ? [workItem.salesMemberAccountId]
      : [];

    if (!workItem.assignedTeamId) {
      return recipients;
    }

    try {
      const memberships = await this.prisma.departmentTeamMember.findMany({
        where: {
          teamId: workItem.assignedTeamId,
          team: { is: { isActive: true, archivedAt: null } },
          employee: {
            is: {
              status: EmployeeStatus.ACTIVE,
              employmentStatus: EmploymentStatus.ACTIVE,
              archivedAt: null,
              isActivated: true,
              account: {
                is: { isEnabled: true, role: AccountRole.EMPLOYEE },
              },
            },
          },
        },
        select: {
          employee: {
            select: {
              account: { select: { id: true } },
            },
          },
        },
      });
      recipients.push(
        ...memberships
          .map((membership) => membership.employee.account?.id)
          .filter((accountId): accountId is string => Boolean(accountId)),
      );
    } catch (error) {
      // Notification expansion must never roll back the authoritative work action.
      this.logger.warn(
        `Unable to resolve work-team notification recipients: ${this.safeErrorMessage(error)}`,
      );
    }

    return recipients;
  }

  private serializeNotification(notification: WorkNotificationRecord) {
    const actor = notification.actor;
    const employee = actor?.employee;
    const profilePhotoKey =
      actor?.profilePhotoKey ?? employee?.profilePhotoKey ?? null;
    const profileBio = actor?.profileBio ?? employee?.profileBio ?? null;

    return {
      id: notification.id,
      recipientAccountId: notification.recipientAccountId,
      actorAccountId: notification.actorAccountId,
      actor: actor
        ? {
            accountId: actor.id,
            username: actor.username,
            role: actor.role,
            profilePhotoKey,
            profileBio,
            showOnlineStatus: actor.showOnlineStatus,
            showReadReceipts: actor.showReadReceipts,
            displayName:
              employee?.empName ??
              actor.username ??
              (actor.role === AccountRole.SUPER_ADMIN
                ? 'Super Admin'
                : 'NT Message User'),
            employee: employee
              ? {
                  id: employee.id,
                  empId: employee.empId,
                  empName: employee.empName,
                  designation: employee.designation,
                  profilePhotoKey,
                  profileBio,
                  division: employee.division,
                  department: employee.departmentUnit,
                }
              : null,
          }
        : null,
      conversationId: notification.conversationId,
      messageId: notification.messageId,
      announcementId: notification.announcementId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      isRead: notification.isRead,
      readAt: notification.readAt,
      metadata: notification.metadata,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    };
  }

  private safeErrorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Unknown notification error';
  }
}
