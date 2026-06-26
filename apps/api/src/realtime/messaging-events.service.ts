import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';

import type { AuthenticatedUser } from '../auth/types/auth.types';

export type MessagingReceiptStatus = 'DELIVERED' | 'READ';

export type MessagingConversationUpdateReason =
  | 'CREATED'
  | 'REOPENED';

export interface MessagingReadyPayload {
  accountId: string;
  sessionId: string;
  connectedAt: string;
}

export interface MessagingErrorPayload {
  message: string;
}

export interface MessagingPongPayload {
  serverTime: string;
}

export interface MessagingMessageCreatedPayload {
  conversationId: string;
  message: unknown;
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

export interface MessagingServerToClientEvents {
  'messaging:ready': (payload: MessagingReadyPayload) => void;
  'messaging:error': (payload: MessagingErrorPayload) => void;
  'messaging:pong': (payload: MessagingPongPayload) => void;
  'messaging:message-created': (
    payload: MessagingMessageCreatedPayload,
  ) => void;
  'messaging:receipt-updated': (
    payload: MessagingReceiptUpdatedPayload,
  ) => void;
  'messaging:conversation-updated': (
    payload: MessagingConversationUpdatedPayload,
  ) => void;
}

export interface MessagingClientToServerEvents {
  'messaging:ping': () => void;
}

export interface MessagingSocketData {
  user?: AuthenticatedUser;
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

  private accountRoom(accountId: string): string {
    return `account:${accountId}`;
  }
}
