import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  MessagingNotificationType,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import {
  MessagingEventsService,
  type DutyScheduleRealtimeAction,
} from '../realtime/messaging-events.service';

const dutyNotificationSelect = {
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
            select: { id: true, code: true, name: true },
          },
          departmentUnit: {
            select: { id: true, code: true, name: true },
          },
        },
      },
    },
  },
} satisfies Prisma.MessagingNotificationSelect;

type DutyNotificationRecord = Prisma.MessagingNotificationGetPayload<{
  select: typeof dutyNotificationSelect;
}>;

export interface PublishDutyUpdateInput {
  assignmentId: string | null;
  employeeAccountId: string;
  action: DutyScheduleRealtimeAction;
  actorAccountId: string | null;
  recipientAccountIds: string[];
  title: string;
  body: string;
  startsAt?: Date | null;
  endsAt?: Date | null;
  metadata?: Prisma.InputJsonObject;
}

@Injectable()
export class DutyNotificationsService {
  private readonly logger = new Logger(DutyNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingEventsService: MessagingEventsService,
  ) {}

  async publishDutyUpdate(input: PublishDutyUpdateInput): Promise<void> {
    const recipients = [...new Set(input.recipientAccountIds)];
    const notificationRecipients = recipients.filter(
      (accountId) => accountId !== input.actorAccountId,
    );
    const occurredAt = new Date();

    for (const recipientAccountId of notificationRecipients) {
      try {
        const notification = await this.prisma.messagingNotification.create({
          data: {
            recipientAccountId,
            actorAccountId: input.actorAccountId,
            type: MessagingNotificationType.DUTY,
            title: input.title,
            body: input.body,
            metadata: {
              kind: 'DUTY',
              assignmentId: input.assignmentId,
              employeeAccountId: input.employeeAccountId,
              action: input.action,
              startsAt: input.startsAt?.toISOString() ?? null,
              endsAt: input.endsAt?.toISOString() ?? null,
              ...input.metadata,
            },
          },
          select: dutyNotificationSelect,
        });
        const unreadCount = await this.prisma.messagingNotification.count({
          where: { recipientAccountId, isRead: false },
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
        // Duty changes remain authoritative even if a notification record fails.
        this.logger.warn(
          `Unable to create duty notification for account ${recipientAccountId}: ${this.safeErrorMessage(error)}`,
        );
      }
    }

    this.messagingEventsService.emitDutyScheduleUpdated(recipients, {
      assignmentId: input.assignmentId,
      employeeAccountId: input.employeeAccountId,
      action: input.action,
      startsAt: input.startsAt?.toISOString() ?? null,
      endsAt: input.endsAt?.toISOString() ?? null,
      actorAccountId: input.actorAccountId,
      occurredAt: occurredAt.toISOString(),
    });
  }

  private serializeNotification(notification: DutyNotificationRecord) {
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
    return error instanceof Error ? error.message : 'Unknown notification error';
  }
}
