import type { AccountRole } from "./auth";

export type ConversationType =
  | "PRIVATE"
  | "GROUP"
  | "ANNOUNCEMENT";

export type GroupKind =
  | "PERSONAL"
  | "OFFICIAL";

export type ConversationParticipantRole =
  | "OWNER"
  | "ADMIN"
  | "MEMBER";

export type OfficialGroupScopeType =
  | "ORGANIZATION"
  | "DIVISION"
  | "DEPARTMENT";

export type OfficialGroupAuditAction =
  | "CREATED"
  | "DETAILS_UPDATED"
  | "MEMBERSHIP_SYNCED"
  | "RECONCILED";

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

export type MessageRequestStatus =
  | "PENDING"
  | "ACCEPTED"
  | "DECLINED"
  | "BLOCKED";

export type MessageRequestReason =
  | "PROTECTED_RECIPIENT"
  | "CROSS_DEPARTMENT"
  | "CROSS_DIVISION";

export type MessagingContactMode =
  | "DIRECT"
  | "REQUEST_REQUIRED"
  | "REQUEST_SENT"
  | "REQUEST_RECEIVED"
  | "BLOCKED";

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

export interface MessagingContact extends MessagingAccount {
  contactMode: MessagingContactMode;
  requestReason: MessageRequestReason | null;
}

export interface MessagingMessageRequest {
  id: string;
  participantKey: string;
  requesterAccountId: string;
  recipientAccountId: string;
  blockedByAccountId: string | null;
  conversationId: string | null;
  status: MessageRequestStatus;
  reason: MessageRequestReason;
  direction: "SENT" | "RECEIVED";
  requestCount: number;
  requestedAt: string;
  respondedAt: string | null;
  requester: MessagingAccount;
  recipient: MessagingAccount;
  peer: MessagingAccount;
  createdAt: string;
  updatedAt: string;
}

export interface MessagingForwardMetadata {
  sourceMessageId: string;
  sourceConversationId: string;
  originalSenderAccountId: string;
  originalSenderDisplayName: string;
  originalSentAt: string;
  originalTextContent: string;
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

export interface MessagingAttachment {
  id: string;
  messageId: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  contentType: MessageContentType;
  scanStatus: string;
  createdAt: string;
  updatedAt: string;
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
  forwardedFrom: MessagingForwardMetadata | null;
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

  attachments: MessagingAttachment[];

  reactions: {
    accountId: string;
    reactionValue: string;
    account?: MessagingAccount;
    createdAt?: string;
    updatedAt?: string;
  }[];

  createdAt: string;
  updatedAt: string;
}

export interface MessagingOfficialGroupScope {
  scopeType: OfficialGroupScopeType;
  divisionId: string | null;
  departmentId: string | null;
  division: MessagingOrganizationUnit | null;
  department: MessagingOrganizationUnit | null;
}

export interface MessagingConversation {
  id: string;
  type: ConversationType;
  title: string | null;
  description: string | null;
  groupKind: GroupKind | null;
  officialScope: MessagingOfficialGroupScope | null;
  createdByAccountId: string;
  lastMessageAt: string | null;
  unreadCount: number;
  isMuted: boolean;
  isArchived: boolean;
  viewerParticipantRole: ConversationParticipantRole | null;
  canManageGroup: boolean;
  memberCount: number;
  participants: Array<
    MessagingAccount & {
      joinedAt: string;
      participantRole: ConversationParticipantRole;
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
  data: MessagingContact[];
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

export type CreatePrivateConversationResponse =
  | {
      outcome: "CONVERSATION";
      message: string;
      created: boolean;
      data: MessagingConversation;
      request: null;
    }
  | {
      outcome: "REQUEST";
      message: string;
      created: boolean;
      data: null;
      request: MessagingMessageRequest;
    };


export interface OfficialGroupScopeOption {
  key: string;
  scopeType: OfficialGroupScopeType;
  label: string;
  defaultTitle: string;
  divisionId: string | null;
  departmentId: string | null;
  division: MessagingOrganizationUnit | null;
  department: MessagingOrganizationUnit | null;
}

export interface OfficialGroupScopesResponse {
  canCreate: boolean;
  scopes: OfficialGroupScopeOption[];
}

export interface OfficialGroupAuditEntry {
  id: string;
  conversationId: string;
  actorAccountId: string | null;
  action: OfficialGroupAuditAction;
  metadata: unknown;
  createdAt: string;
  actor: MessagingAccount | null;
}

export interface OfficialGroupAuditResponse {
  data: OfficialGroupAuditEntry[];
}

export interface ReconcileOfficialGroupsResponse {
  message: string;
  reconciledCount: number;
  addedCount: number;
  removedCount: number;
  roleChangedCount: number;
}

export interface GroupConversationResponse {
  message: string;
  data: MessagingConversation;
}

export interface AddGroupMembersResponse
  extends GroupConversationResponse {
  addedCount: number;
}

export interface RemoveGroupMemberResponse {
  message: string;
  conversationId: string;
  accountId: string;
  removedAt: string;
}

export interface LeaveGroupResponse {
  message: string;
  conversationId: string;
  leftAt: string;
  newOwnerAccountId: string | null;
}

export interface MessageRequestListResponse {
  received: MessagingMessageRequest[];
  sent: MessagingMessageRequest[];
  counts: {
    receivedPending: number;
    sentPending: number;
  };
}

export interface MessageRequestActionResponse {
  message: string;
  request: MessagingMessageRequest;
}

export interface AcceptMessageRequestResponse
  extends MessageRequestActionResponse {
  data: MessagingConversation;
}

export interface SendTextMessageResponse {
  message: string;
  duplicate: boolean;
  data: MessagingMessage;
}

export interface SendAttachmentMessageResponse {
  message: string;
  duplicate: boolean;
  data: MessagingMessage;
}

export interface ForwardMessagesResponse {
  message: string;
  createdCount: number;
  duplicateCount: number;
  data: MessagingMessage[];
}

export interface UpdateTextMessageResponse {
  message: string;
  data: MessagingMessage;
}

export interface DeleteMessageResponse {
  message: string;
  data: MessagingMessage;
}

export interface DeleteMessageForMeResponse {
  message: string;
  conversationId: string;
  messageId: string;
  hiddenAt: string;
}

export interface MarkConversationReadResponse {
  message: string;
  conversationId: string;
  readMessages: number;
  readAt: string;
}

export interface MessageReactionResponse {
  message: string;
  action: "ADDED" | "UPDATED" | "REMOVED";
  data: MessagingMessage;
}
