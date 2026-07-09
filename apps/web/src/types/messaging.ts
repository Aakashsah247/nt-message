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
  profileBio: string | null;
  division: MessagingOrganizationUnit | null;
  department: MessagingOrganizationUnit | null;
}

export interface MessagingAccount {
  accountId: string;
  username: string | null;
  role: AccountRole;
  profilePhotoKey: string | null;
  profileBio: string | null;
  showOnlineStatus: boolean;
  showReadReceipts: boolean;
  displayName: string;
  employee: MessagingEmployeeIdentity | null;
}


export type MessagingProfileContactMode =
  | "SELF"
  | "DIRECT"
  | "REQUEST_REQUIRED"
  | "REQUEST_SENT"
  | "REQUEST_RECEIVED"
  | "BLOCKED";

export type MessagingBlockDirection =
  | "BLOCKED_BY_ME"
  | "BLOCKED_ME"
  | "MUTUAL"
  | null;

export interface MessagingProfileSharedGroup {
  id: string;
  title: string | null;
  groupKind: GroupKind | null;
  memberCount: number;
}

export interface MessagingUserProfile extends MessagingAccount {
  isOwnProfile: boolean;
  contactMode: MessagingProfileContactMode;
  blockDirection?: MessagingBlockDirection;
  profileBio: string | null;
  official: {
    employeeId: string;
    officialEmail: string;
    designation: string | null;
    division: MessagingOrganizationUnit | null;
    department: MessagingOrganizationUnit | null;
  } | null;
  sharedGroups: MessagingProfileSharedGroup[];
}

export interface MessagingUserProfileResponse {
  data: MessagingUserProfile;
}

export interface MessagingContact extends MessagingAccount {
  contactMode: MessagingContactMode;
  requestReason: MessageRequestReason | null;
  blockDirection?: MessagingBlockDirection;
}

export interface MessagingBlockedAccount {
  blockerAccountId: string;
  blockedAccountId: string;
  reason: string | null;
  account: MessagingAccount;
  createdAt: string;
  updatedAt: string;
}

export interface MessagingBlockedAccountsResponse {
  data: MessagingBlockedAccount[];
  counts: {
    blockedByMe: number;
  };
}

export interface MessagingBlockAccountResponse {
  message: string;
  data: MessagingBlockedAccount;
}

export interface MessagingUnblockAccountResponse {
  message: string;
  blockedAccountId: string;
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


export interface MessagingMention {
  accountId: string;
  displayName: string;
}


export interface MessagingLocationPayload {
  kind: "CURRENT" | "LIVE";
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  headingDegrees: number | null;
  speedMetersPerSecond: number | null;
  label: string | null;
  mapUrl: string;
  liveExpiresAt: string | null;
  liveStoppedAt: string | null;
  updatedAt: string;
}

export interface MessagingAnnouncementPayload {
  kind: "OFFICIAL";
  label: string;
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
  isStarred: boolean;
  starredAt: string | null;
  isPinned: boolean;
  pinnedAt: string | null;
  pinnedByAccountId: string | null;
  pinnedBy: MessagingAccount | null;
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
  groupPhotoKey: string | null;
  groupKind: GroupKind | null;
  officialScope: MessagingOfficialGroupScope | null;
  createdByAccountId: string;
  lastMessageAt: string | null;
  unreadCount: number;
  isMuted: boolean;
  mutedUntil: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  isPinned: boolean;
  pinnedAt: string | null;
  isMarkedUnread: boolean;
  markedUnreadAt: string | null;
  draftText: string | null;
  draftUpdatedAt: string | null;
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

export type ConversationListView = "ACTIVE" | "ARCHIVED" | "ALL";

export type ConversationMuteSetting = "OFF" | "8_HOURS" | "1_WEEK" | "ALWAYS";

export interface ConversationPreferenceState {
  conversationId: string;
  accountId: string;
  isPinned: boolean;
  pinnedAt: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  isMuted: boolean;
  mutedUntil: string | null;
  isMarkedUnread: boolean;
  markedUnreadAt: string | null;
  draftText: string | null;
  draftUpdatedAt: string | null;
}

export interface ConversationPreferenceResponse {
  message: string;
  data: ConversationPreferenceState;
}

export interface CursorPagination {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}


export interface MessagingPrivacySettings {
  accountId: string;
  showOnlineStatus: boolean;
  showReadReceipts: boolean;
  updatedAt: string | null;
}

export interface MessagingPrivacySettingsResponse {
  data: MessagingPrivacySettings;
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

export type PrivateGroupHistoryWindow =
  | "NONE"
  | "LAST_15_MINUTES"
  | "LAST_1_HOUR"
  | "LAST_24_HOURS";

export interface PrivateGroupFromPrivateConversationResponse {
  message: string;
  copiedContextCount: number;
  historyWindow: PrivateGroupHistoryWindow;
  data: MessagingConversation;
}

export interface RemoveGroupMemberResponse {
  message: string;
  conversationId: string;
  accountId: string;
  removedAt: string;
}

export interface GroupInvitationLink {
  id: string;
  conversationId: string;
  token: string;
  createdByAccountId: string;
  revokedByAccountId: string | null;
  createdBy: MessagingAccount;
  revokedBy: MessagingAccount | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupInvitationLinkResponse {
  data: GroupInvitationLink | null;
}

export interface GroupInvitationMutationResponse {
  message: string;
  data: GroupInvitationLink;
}

export interface GroupInvitationRevokeResponse {
  message: string;
  revokedCount: number;
  revokedAt: string | null;
}

export interface GroupInvitationPreview {
  token: string;
  conversationId: string;
  title: string | null;
  description: string | null;
  groupPhotoKey: string | null;
  memberCount: number;
  alreadyMember: boolean;
  createdBy: MessagingAccount;
  createdAt: string;
}

export interface GroupInvitationPreviewResponse {
  data: GroupInvitationPreview;
}

export interface GroupInvitationJoinResponse {
  message: string;
  joined: boolean;
  alreadyMember: boolean;
  data: MessagingConversation;
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

export interface SendLocationMessageResponse {
  message: string;
  duplicate: boolean;
  data: MessagingMessage;
}

export interface UpdateLiveLocationMessageResponse {
  message: string;
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

export type MessagingNotificationType =
  | "MESSAGE"
  | "REPLY"
  | "REACTION"
  | "FILE"
  | "IMAGE"
  | "VIDEO"
  | "AUDIO"
  | "VOICE_NOTE"
  | "GROUP_EVENT"
  | "MENTION";

export interface MessagingNotification {
  id: string;
  recipientAccountId: string;
  actorAccountId: string | null;
  actor: MessagingAccount | null;
  conversationId: string | null;
  messageId: string | null;
  type: MessagingNotificationType;
  title: string;
  body: string;
  isRead: boolean;
  readAt: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface MessagingNotificationListResponse {
  data: MessagingNotification[];
  unreadCount: number;
}


export interface MessagingSearchFilters {
  search?: string;
  senderAccountId?: string;
  contentType?: MessageContentType;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export interface MessagingSearchMessageResult {
  message: MessagingMessage;
  conversation: MessagingConversation;
  snippet: string;
  matchedAttachmentFileName: string | null;
}

export interface ConversationMessageSearchResponse {
  data: MessagingSearchMessageResult[];
  filters: {
    search: string | null;
    senderAccountId: string | null;
    contentType: MessageContentType | null;
    dateFrom: string | null;
    dateTo: string | null;
    limit: number;
  };
}

export interface SharedContentAttachmentItem {
  id: string;
  messageId: string;
  conversationId: string;
  attachment: MessagingAttachment;
  message: MessagingMessage;
  sender: MessagingAccount;
  sharedAt: string;
}

export interface SharedContentLinkItem {
  url: string;
  label: string;
  message: MessagingMessage;
  sender: MessagingAccount;
  sharedAt: string;
}

export interface ConversationSharedContent {
  media: SharedContentAttachmentItem[];
  documents: SharedContentAttachmentItem[];
  links: SharedContentLinkItem[];
}

export interface ConversationSharedContentResponse {
  data: ConversationSharedContent;
  counts: {
    media: number;
    documents: number;
    links: number;
  };
}

export interface GlobalMessagingSearchResponse {
  messages: MessagingSearchMessageResult[];
  conversations: MessagingConversation[];
  contacts: MessagingContact[];
  filters: ConversationMessageSearchResponse["filters"];
}

export interface MessageReactionResponse {
  message: string;
  action: "ADDED" | "UPDATED" | "REMOVED";
  data: MessagingMessage;
}

export interface MessagePersonalStateResponse {
  message: string;
  data: MessagingMessage;
}

export interface MessageInformationRecipient {
  accountId: string;
  account: MessagingAccount;
  deliveredAt: string | null;
  readAt: string | null;
  readHidden: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MessageInformation {
  message: MessagingMessage;
  sender: MessagingAccount;
  sentAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  recipients: MessageInformationRecipient[];
  summary: {
    totalRecipients: number;
    delivered: number;
    read: number;
    readHidden: number;
  };
}

export interface MessageInformationResponse {
  data: MessageInformation;
}

export interface StarredMessageItem {
  starredAt: string;
  message: MessagingMessage;
  conversation: MessagingConversation;
}

export interface StarredMessagesResponse {
  data: StarredMessageItem[];
}

export interface PinnedMessagesResponse {
  data: MessagingMessage[];
}

export interface MessagingAnalyticsCountItem {
  key: string;
  label: string;
  count: number;
}

export interface MessagingAnalyticsAttachmentItem extends MessagingAnalyticsCountItem {
  totalBytes: number;
}

export interface MessagingAnalyticsScope {
  role: AccountRole;
  label: string;
  division: MessagingOrganizationUnit | null;
  department: MessagingOrganizationUnit | null;
}

export interface MessagingAnalyticsResponse {
  generatedAt: string;
  scope: MessagingAnalyticsScope;
  totals: {
    users: number;
    enabledUsers: number;
    disabledUsers: number;
    activeEmployeeUsers: number;
    conversations: number;
    messages: number;
    attachments: number;
    notifications: number;
    unreadNotifications: number;
  };
  usersByRole: MessagingAnalyticsCountItem[];
  usersByDivision: MessagingAnalyticsCountItem[];
  usersByDepartment: MessagingAnalyticsCountItem[];
  conversationsByType: MessagingAnalyticsCountItem[];
  messagesByType: MessagingAnalyticsCountItem[];
  attachmentsByType: MessagingAnalyticsAttachmentItem[];
  activeUsers: {
    today: number;
    thisWeek: number;
  };
  recentActivity: {
    messagesToday: number;
    messagesThisWeek: number;
    attachmentsToday: number;
    notificationsToday: number;
    latestMessageAt: string | null;
  };
  privacyNotice: string;
}
