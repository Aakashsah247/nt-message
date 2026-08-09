import {
  io,
  type Socket,
} from "socket.io-client";

import type { AnnouncementRealtimePayload } from "../types/announcements";
import type {
  MessagingMessage,
  MessagingNotification,
} from "../types/messaging";
import type { DutyScheduleRealtimePayload, WorkItemRealtimePayload } from "../types/work-management";

export interface MessagingReadyPayload {
  accountId: string;
  sessionId: string;
  connectedAt: string;
}

export interface MessagingSocketErrorPayload {
  message: string;
}

export interface MessagingPongPayload {
  serverTime: string;
}

export interface MessagingMessageCreatedPayload {
  conversationId: string;
  message: MessagingMessage;
  occurredAt: string;
}

export interface MessagingMessageUpdatedPayload {
  conversationId: string;
  message: MessagingMessage;
  action: "EDITED" | "DELETED" | "REACTION_UPDATED" | "LIVE_LOCATION_UPDATED" | "LIVE_LOCATION_STOPPED" | "PINNED" | "UNPINNED";
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
  status: "DELIVERED" | "READ";
  occurredAt: string;
}

export interface MessagingConversationUpdatedPayload {
  conversationId: string;
  reason:
    | "CREATED"
    | "REOPENED"
    | "GROUP_CREATED"
    | "GROUP_UPDATED"
    | "MEMBERS_CHANGED"
    | "OFFICIAL_GROUP_CREATED"
    | "OFFICIAL_GROUP_SYNCED"
    | "LEFT"
    | "CLEARED_FOR_ACCOUNT"
    | "DELETED_FOR_ACCOUNT";
  occurredAt: string;
}

export interface MessagingMessageRequestUpdatedPayload {
  requestId: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "BLOCKED";
  conversationId: string | null;
  occurredAt: string;
}

export interface MessagingNotificationCreatedPayload {
  notification: MessagingNotification;
  unreadCount: number;
  occurredAt: string;
}

export interface MessagingPresenceState {
  accountId: string;
  isOnline: boolean;
  lastSeenAt: string | null;
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

interface ServerToClientEvents {
  "messaging:ready": (payload: MessagingReadyPayload) => void;
  "messaging:error": (payload: MessagingSocketErrorPayload) => void;
  "messaging:pong": (payload: MessagingPongPayload) => void;
  "messaging:message-created": (
    payload: MessagingMessageCreatedPayload,
  ) => void;
  "messaging:message-updated": (
    payload: MessagingMessageUpdatedPayload,
  ) => void;
  "messaging:message-hidden": (
    payload: MessagingMessageHiddenPayload,
  ) => void;
  "messaging:receipt-updated": (
    payload: MessagingReceiptUpdatedPayload,
  ) => void;
  "messaging:conversation-updated": (
    payload: MessagingConversationUpdatedPayload,
  ) => void;
  "messaging:request-updated": (
    payload: MessagingMessageRequestUpdatedPayload,
  ) => void;
  "messaging:notification-created": (
    payload: MessagingNotificationCreatedPayload,
  ) => void;
  "work:item-updated": (payload: WorkItemRealtimePayload) => void;
  "duty:schedule-updated": (payload: DutyScheduleRealtimePayload) => void;
  "announcement:published": (payload: AnnouncementRealtimePayload) => void;
  "announcement:updated": (payload: AnnouncementRealtimePayload) => void;
  "announcement:deleted": (payload: AnnouncementRealtimePayload) => void;
  "announcement:read": (payload: AnnouncementRealtimePayload) => void;
  "announcement:acknowledged": (payload: AnnouncementRealtimePayload) => void;
  "messaging:presence-snapshot": (
    payload: MessagingPresenceSnapshotPayload,
  ) => void;
  "messaging:presence-updated": (
    payload: MessagingPresenceState,
  ) => void;
  "messaging:typing-updated": (
    payload: MessagingTypingUpdatedPayload,
  ) => void;
}

interface ClientToServerEvents {
  "messaging:ping": () => void;
  "messaging:typing": (payload: MessagingTypingPayload) => void;
}

export type MessagingSocket = Socket<
  ServerToClientEvents,
  ClientToServerEvents
>;

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ??
  "http://localhost:4000";

export function createMessagingSocket(
  accessToken: string,
): MessagingSocket {
  return io(`${SOCKET_URL}/messaging`, {
    autoConnect: false,
    auth: {
      accessToken,
    },
    transports: ["websocket", "polling"],
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });
}


export function connectMessagingSocketAfterEffectCommit(
  socket: MessagingSocket,
): () => void {
  // React Strict Mode immediately cleans up the first development effect; deferring avoids aborting that handshake.
  let connectionStarted = false;
  const timerId = window.setTimeout(() => {
    connectionStarted = true;
    socket.connect();
  }, 0);

  return () => {
    window.clearTimeout(timerId);
    if (connectionStarted) {
      socket.disconnect();
    }
  };
}
