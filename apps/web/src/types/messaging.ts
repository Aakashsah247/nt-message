import type { AccountRole } from "./auth";

export type ConversationType =
  | "PRIVATE"
  | "GROUP"
  | "ANNOUNCEMENT";

export type MessageContentType =
  | "TEXT"
  | "IMAGE"
  | "VIDEO"
  | "AUDIO"
  | "FILE"
  | "LOCATION"
  | "SYSTEM";

export type MessageDeliveryStatus =
  | "SENT"
  | "DELIVERED"
  | "READ";

export interface MessagingOrganizationUnit {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface MessagingEmployeeIdentity {
  id: string;
  empId: string;
  empName: string;
  designation: string | null;
  profilePhotoKey: string | null;
  division: MessagingOrganizationUnit | null;
  department: MessagingOrganizationUnit | null;
}

export interface MessagingAccount {
  accountId: string;
  username: string | null;
  role: AccountRole;
  displayName: string;
  employee: MessagingEmployeeIdentity | null;
}

export interface MessagingReply {
  id: string;
  senderAccountId: string;
  sender: MessagingAccount;
  contentType: MessageContentType;
  textContent: string | null;
  sentAt: string;
  isDeleted: boolean;
}

export interface MessagingMessage {
  id: string;
  conversationId: string;
  senderAccountId: string;
  clientMessageId: string;
  sender: MessagingAccount;
  contentType: MessageContentType;
  textContent: string | null;
  payload: unknown;
  replyToMessageId: string | null;
  replyTo: MessagingReply | null;
  sentAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  isDeleted: boolean;
  deliveryStatus: MessageDeliveryStatus;
  deliveredAt: string | null;
  readAt: string | null;
  receiptSummary: {
    total: number;
    delivered: number;
    read: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface MessagingConversation {
  id: string;
  type: ConversationType;
  title: string | null;
  createdByAccountId: string;
  lastMessageAt: string | null;
  unreadCount: number;
  isMuted: boolean;
  isArchived: boolean;
  participants: Array<
    MessagingAccount & {
      joinedAt: string;
    }
  >;
  lastMessage: MessagingMessage | null;
  createdAt: string;
  updatedAt: string;
}

export interface CursorPagination {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface MessagingContactsResponse {
  data: MessagingAccount[];
  filters: {
    search: string | null;
    limit: number;
  };
}

export interface ConversationListResponse {
  data: MessagingConversation[];
  pagination: CursorPagination;
}

export interface MessageListResponse {
  data: MessagingMessage[];
  pagination: CursorPagination;
}

export interface CreatePrivateConversationResponse {
  message: string;
  created: boolean;
  data: MessagingConversation;
}

export interface SendTextMessageResponse {
  message: string;
  duplicate: boolean;
  data: MessagingMessage;
}

export interface MarkConversationReadResponse {
  message: string;
  conversationId: string;
  readMessages: number;
  readAt: string;
}
