import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import type { MessagingPresenceState } from './messaging-presence.service';

export type MessagingReceiptStatus = 'DELIVERED' | 'READ';

export type MessagingConversationUpdateReason =
  | 'CREATED'
  | 'REOPENED'
  | 'GROUP_CREATED'
  // M16: distinguish a new private group copied from a one-to-one private chat.
  | 'PRIVATE_GROUP_CREATED'
  | 'GROUP_UPDATED'
  | 'GROUP_DELETED'
  | 'MEMBERS_CHANGED'
  | 'OFFICIAL_GROUP_CREATED'
  | 'OFFICIAL_GROUP_SYNCED'
  | 'LEFT'
  // M19: personal events are emitted only to the affected account room.
  | 'CLEARED_FOR_ACCOUNT'
  | 'DELETED_FOR_ACCOUNT';

export type MessagingMessageRequestStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'BLOCKED';

export interface MessagingReadyPayload {
  accountId: string;
  sessionId: string;
  connectedAt: string;
}

export interface MessagingErrorPayload {
  message: string;
  code?: 'SESSION_INVALIDATED';
}

export interface MessagingPongPayload {
  serverTime: string;
}

export interface MessagingMessageCreatedPayload {
  conversationId: string;
  message: unknown;
  occurredAt: string;
}

export type MessagingMessageUpdateAction =
  | 'EDITED'
  | 'DELETED'
  | 'REACTION_UPDATED'
  | 'LIVE_LOCATION_UPDATED'
  | 'LIVE_LOCATION_STOPPED'
  | 'PINNED'
  | 'UNPINNED';

export interface MessagingMessageUpdatedPayload {
  conversationId: string;
  message: unknown;
  action: MessagingMessageUpdateAction;
  occurredAt: string;
}

export interface MessagingMessageHiddenPayload {
  conversationId: string;
  messageId: string;
  accountId: string;
  occurredAt: string;
}

export interface MessagingReceiptUpdatedPayload {
  conversationId: string;
  messageIds: string[];
  accountId: string;
  status: MessagingReceiptStatus;
  occurredAt: string;
}

export interface MessagingConversationUpdatedPayload {
  conversationId: string;
  reason: MessagingConversationUpdateReason;
  occurredAt: string;
}

export interface MessagingMessageRequestUpdatedPayload {
  requestId: string;
  status: MessagingMessageRequestStatus;
  conversationId: string | null;
  occurredAt: string;
}

export interface MessagingNotificationCreatedPayload {
  notification: unknown;
  unreadCount: number;
  occurredAt: string;
}

export type WorkItemRealtimeAction =
  | 'CREATED'
  | 'ACKNOWLEDGED'
  | 'STARTED'
  | 'HELP_REQUESTED'
  | 'HELP_ACCEPTED'
  | 'HELP_DECLINED'
  | 'SALES_DOCUMENTS_SENT'
  | 'SALES_MESSAGE_ADDED'
  | 'SALES_WORK_COMPLETED'
  | 'COMPLETION_SUBMITTED'
  | 'INFORMATION_REQUESTED'
  | 'CLOSED'
  | 'REOPENED'
  | 'CANCELLED'
  | 'REASSIGNED'
  | 'SUPPORT_ADDED'
  | 'SUPPORT_REMOVED'
  | 'DETAILS_UPDATED'
  | 'DUE_SOON'
  | 'OVERDUE';

export interface WorkItemRealtimePayload {
  workItemId: string;
  ticketNumber: string;
  status: string;
  action: WorkItemRealtimeAction;
  actorAccountId: string | null;
  occurredAt: string;
}

export type DutyScheduleRealtimeAction =
  | 'ASSIGNED'
  | 'CHANGED'
  | 'CANCELLED'
  | 'LEAVE_RECORDED'
  | 'HOLIDAY_RECORDED'
  | 'AVAILABILITY_CHANGED';

export interface DutyScheduleRealtimePayload {
  assignmentId: string | null;
  employeeAccountId: string;
  action: DutyScheduleRealtimeAction;
  startsAt: string | null;
  endsAt: string | null;
  actorAccountId: string | null;
  occurredAt: string;
}

export type AnnouncementRealtimeAction =
  | 'PUBLISHED'
  | 'UPDATED'
  | 'DELETED'
  | 'READ'
  | 'ACKNOWLEDGED';

export type AnnouncementSocketEvent =
  | 'announcement:published'
  | 'announcement:updated'
  | 'announcement:deleted'
  | 'announcement:read'
  | 'announcement:acknowledged';

export interface AnnouncementRealtimePayload {
  announcementId: string;
  officialConversationId: string | null;
  action: AnnouncementRealtimeAction;
  status: string;
  priority: string;
  requiresAcknowledgement: boolean;
  revisionNumber: number;
  actorAccountId: string;
  occurredAt: string;
}

export interface MessagingPresenceSnapshotPayload {
  presences: MessagingPresenceState[];
  occurredAt: string;
}

export interface MessagingTypingPayload {
  conversationId: string;
  isTyping: boolean;
}

export interface MessagingTypingUpdatedPayload {
  conversationId: string;
  accountId: string;
  isTyping: boolean;
  occurredAt: string;
}

export interface MessagingServerToClientEvents {
  'messaging:ready': (payload: MessagingReadyPayload) => void;
  'messaging:error': (payload: MessagingErrorPayload) => void;
  'messaging:pong': (payload: MessagingPongPayload) => void;
  'messaging:message-created': (
    payload: MessagingMessageCreatedPayload,
  ) => void;
  'messaging:message-updated': (
    payload: MessagingMessageUpdatedPayload,
  ) => void;
  'messaging:message-hidden': (payload: MessagingMessageHiddenPayload) => void;
  'messaging:receipt-updated': (
    payload: MessagingReceiptUpdatedPayload,
  ) => void;
  'messaging:conversation-updated': (
    payload: MessagingConversationUpdatedPayload,
  ) => void;
  'messaging:request-updated': (
    payload: MessagingMessageRequestUpdatedPayload,
  ) => void;
  'messaging:notification-created': (
    payload: MessagingNotificationCreatedPayload,
  ) => void;
  'work:item-updated': (payload: WorkItemRealtimePayload) => void;
  'duty:schedule-updated': (payload: DutyScheduleRealtimePayload) => void;
  'announcement:published': (payload: AnnouncementRealtimePayload) => void;
  'announcement:updated': (payload: AnnouncementRealtimePayload) => void;
  'announcement:deleted': (payload: AnnouncementRealtimePayload) => void;
  'announcement:read': (payload: AnnouncementRealtimePayload) => void;
  'announcement:acknowledged': (payload: AnnouncementRealtimePayload) => void;
  'messaging:presence-snapshot': (
    payload: MessagingPresenceSnapshotPayload,
  ) => void;
  'messaging:presence-updated': (payload: MessagingPresenceState) => void;
  'messaging:typing-updated': (payload: MessagingTypingUpdatedPayload) => void;
}

export interface MessagingClientToServerEvents {
  'messaging:ping': () => void;
  'messaging:typing': (payload: MessagingTypingPayload) => void;
}

export interface MessagingSocketData {
  user?: AuthenticatedUser;
  accessTokenExpiresAt?: string;
}

export type MessagingNamespace = Namespace<
  MessagingClientToServerEvents,
  MessagingServerToClientEvents,
  Record<string, never>,
  MessagingSocketData
>;

@Injectable()
export class MessagingEventsService {
  private server: MessagingNamespace | null = null;

  bindServer(server: MessagingNamespace): void {
    this.server = server;
  }

  emitMessageCreated(
    accountIds: string[],
    payload: MessagingMessageCreatedPayload,
  ): void {
    if (!this.server) {
      return;
    }

    for (const accountId of new Set(accountIds)) {
      this.server
        .to(this.accountRoom(accountId))
        .emit('messaging:message-created', payload);
    }
  }

  emitMessageUpdated(
    accountIds: string[],
    payload: MessagingMessageUpdatedPayload,
  ): void {
    if (!this.server) {
      return;
    }

    for (const accountId of new Set(accountIds)) {
      this.server
        .to(this.accountRoom(accountId))
        .emit('messaging:message-updated', payload);
    }
  }

  emitMessageHidden(
    accountId: string,
    payload: MessagingMessageHiddenPayload,
  ): void {
    this.server
      ?.to(this.accountRoom(accountId))
      .emit('messaging:message-hidden', payload);
  }

  emitReceiptUpdated(
    accountIds: string[],
    payload: MessagingReceiptUpdatedPayload,
  ): void {
    if (!this.server) {
      return;
    }

    for (const accountId of new Set(accountIds)) {
      this.server
        .to(this.accountRoom(accountId))
        .emit('messaging:receipt-updated', payload);
    }
  }

  emitConversationUpdated(
    accountIds: string[],
    payload: MessagingConversationUpdatedPayload,
  ): void {
    if (!this.server) {
      return;
    }

    for (const accountId of new Set(accountIds)) {
      this.server
        .to(this.accountRoom(accountId))
        .emit('messaging:conversation-updated', payload);
    }
  }

  emitMessageRequestUpdated(
    accountIds: string[],
    payload: MessagingMessageRequestUpdatedPayload,
  ): void {
    if (!this.server) {
      return;
    }

    for (const accountId of new Set(accountIds)) {
      this.server
        .to(this.accountRoom(accountId))
        .emit('messaging:request-updated', payload);
    }
  }

  emitNotificationCreated(
    accountId: string,
    payload: MessagingNotificationCreatedPayload,
  ): void {
    // Notifications are scoped to the recipient account room, not the full conversation room.
    this.server
      ?.to(this.accountRoom(accountId))
      .emit('messaging:notification-created', payload);
  }

  emitWorkItemUpdated(
    accountIds: string[],
    payload: WorkItemRealtimePayload,
  ): void {
    if (!this.server) {
      return;
    }

    // Work updates are delivered only to accounts already authorized by the work service.
    for (const accountId of new Set(accountIds)) {
      this.server
        .to(this.accountRoom(accountId))
        .emit('work:item-updated', payload);
    }
  }

  emitDutyScheduleUpdated(
    accountIds: string[],
    payload: DutyScheduleRealtimePayload,
  ): void {
    if (!this.server) {
      return;
    }

    // Duty updates reuse authenticated account rooms and never broadcast branch-wide.
    for (const accountId of new Set(accountIds)) {
      this.server
        .to(this.accountRoom(accountId))
        .emit('duty:schedule-updated', payload);
    }
  }

  emitAnnouncementPublished(
    accountIds: string[],
    payload: AnnouncementRealtimePayload,
  ): void {
    this.emitToAccountRooms(accountIds, 'announcement:published', payload);
  }

  emitAnnouncementUpdated(
    accountIds: string[],
    payload: AnnouncementRealtimePayload,
  ): void {
    this.emitToAccountRooms(accountIds, 'announcement:updated', payload);
  }

  emitAnnouncementDeleted(
    accountIds: string[],
    payload: AnnouncementRealtimePayload,
  ): void {
    this.emitToAccountRooms(accountIds, 'announcement:deleted', payload);
  }

  emitAnnouncementRead(
    accountIds: string[],
    payload: AnnouncementRealtimePayload,
  ): void {
    this.emitToAccountRooms(accountIds, 'announcement:read', payload);
  }

  emitAnnouncementAcknowledged(
    accountIds: string[],
    payload: AnnouncementRealtimePayload,
  ): void {
    this.emitToAccountRooms(accountIds, 'announcement:acknowledged', payload);
  }

  emitPresenceUpdated(payload: MessagingPresenceState): void {
    this.server?.emit('messaging:presence-updated', payload);
  }

  emitTypingUpdated(
    accountIds: string[],
    payload: MessagingTypingUpdatedPayload,
  ): void {
    if (!this.server) {
      return;
    }

    for (const accountId of new Set(accountIds)) {
      this.server
        .to(this.accountRoom(accountId))
        .emit('messaging:typing-updated', payload);
    }
  }

  private emitToAccountRooms(
    accountIds: string[],
    event: AnnouncementSocketEvent,
    payload: AnnouncementRealtimePayload,
  ): void {
    if (!this.server) {
      return;
    }

    /*
     * Announcement state is account-scoped. No recipient list or shared room
     * broadcast is used because audience membership is private governance data.
     */
    const emitter = this.server as unknown as {
      to: (room: string) => {
        emit: (
          eventName: AnnouncementSocketEvent,
          eventPayload: AnnouncementRealtimePayload,
        ) => void;
      };
    };

    for (const accountId of new Set(accountIds)) {
      emitter.to(this.accountRoom(accountId)).emit(event, payload);
    }
  }

  private accountRoom(accountId: string): string {
    return `account:${accountId}`;
  }
}
