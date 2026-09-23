import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useAvatarRegistry } from "../context/AvatarContext";
import { logoutAllAuth } from "../services/auth.service";
import {
  acceptMessageRequest,
  addGroupMembers,
  blockMessageRequest,
  blockMessagingAccount,
  clearMessagingConversation,
  createChatFolder,
  createGroupConversation,
  createGroupInvitationLink,
  createOfficialGroupConversation,
  createPrivateConversation,
  createPrivateGroupFromPrivateConversation,
  createMessagingProfilePhotoObjectUrl,
  createGroupPhotoObjectUrl,
  deleteChatFolder,
  deleteGroupConversation,
  deleteGroupPhoto,
  deleteMyMessagingProfilePhoto,
  declineMessageRequest,
  deleteMessagingNotification,
  getConversationMessageInformation,
  getConversationMessageById,
  getConversationSharedContent,
  getConversationStorageUsage,
  getGroupInvitationLink,
  getMessagingPrivacySettings,
  getUserStorageUsage,
  getMessagingProfile,
  getMyMessagingProfile,
  deleteReadMessagingNotifications,
  deleteConversationMessage,
  deleteMessagingConversation,
  createConversationAttachmentObjectUrl,
  createConversationAttachmentStreamUrl,
  deleteConversationMessageForMe,
  downloadConversationAttachment,
  editConversationTextMessage,
  forwardConversationMessage,
  joinGroupInvitation,
  leaveGroupConversation,
  listChatFolders,
  listConversationMessages,
  listConversationPinnedMessages,
  listStarredMessages,
  listMessageRequests,
  listBlockedMessagingAccounts,
  listMessagingConversations,
  listGroupMembers,
  listMessagingNotifications,
  markAllMessagingNotificationsRead,
  markMessagingNotificationRead,
  listOfficialGroupAudit,
  listOfficialGroupScopes,
  markConversationRead,
  pinConversationMessage,
  reconcileOfficialGroups,
  removeGroupMember,
  revokeGroupInvitationLink,
  reactToMessage,
  searchMessagingContacts,
  starConversationMessage,
  updateChatFolder,
  updateConversationPreference,
  updateMyMessagingProfile,
  updateMessagingPrivacySettings,
  updateMyMessagingProfilePhoto,
  sendConversationAttachmentMessage,
  sendConversationLocationMessage,
  searchConversationMessages,
  sendConversationTextMessage,
  stopConversationLiveLocationMessage,
  unpinConversationMessage,
  unstarConversationMessage,
  updateConversationLiveLocationMessage,
  updateGroupConversation,
  unblockMessagingAccount,
  updateGroupMemberRole,
  updateGroupPhoto,
} from "../services/messaging.service";
import type { AttachmentUploadProgress } from "../services/messaging.service";
import {
  disableMessagingPushSubscription,
  messagingPushSupported,
  syncMessagingPushSubscription,
} from "../services/messaging-push.service";
import {
  connectMessagingSocketAfterEffectCommit,
  createMessagingSocket,
} from "../services/messaging-socket.service";
import {
  acknowledgeAnnouncement,
  createAnnouncementAttachmentObjectUrl,
  createAnnouncementDraft,
  deleteAnnouncement,
  downloadAnnouncementAttachment,
  getAnnouncement,
  listAnnouncementAudiences,
  listAnnouncements,
  markAnnouncementRead,
  publishAnnouncement,
  removeAnnouncementAttachment,
  updateAnnouncement,
  uploadAnnouncementAttachment,
} from "../services/announcement.service";
import type {
  MessagingConversationUpdatedPayload,
  MessagingMessageCreatedPayload,
  MessagingMessageHiddenPayload,
  MessagingMessageRequestUpdatedPayload,
  MessagingNotificationCreatedPayload,
  MessagingMessageUpdatedPayload,
  MessagingPresenceSnapshotPayload,
  MessagingPresenceState,
  MessagingReceiptUpdatedPayload,
  MessagingSocket,
  MessagingSocketErrorPayload,
  MessagingTypingUpdatedPayload,
} from "../services/messaging-socket.service";
import type {
  AnnouncementAttachment,
  AnnouncementAttachmentCategory,
  AnnouncementAudienceOptions,
  AnnouncementDetail,
  AnnouncementListItem,
  AnnouncementMutationInput,
  AnnouncementRealtimePayload,
  AnnouncementStatus,
  CreateAnnouncementInput,
} from "../types/announcements";
import {
  formatMessagingConversationTime as formatConversationTime,
  formatMessagingLastSeen as formatLastSeen,
  formatMessagingLongDateTime as formatAnnouncementDate,
} from "../utils/messaging-date-time";
import {
  BROWSER_NOTIFICATION_STORAGE_KEY,
  DEFAULT_MESSAGING_CUSTOMIZATION,
  NOTIFICATION_SOUND_STORAGE_KEY,
  readMessagingBooleanPreference,
  readMessagingCustomization,
  readMessagingDeviceSettings,
  writeMessagingBooleanPreference,
  writeMessagingCustomization,
  writeMessagingDeviceSettings,
} from "../utils/messaging-preferences";
import { playNotificationTone } from "../utils/notification-sound";
import { resolveMessagingSendAttempt } from "../utils/messaging-send-attempt";
import type { MessagingSendAttempt } from "../utils/messaging-send-attempt";
import {
  isMessageThreadNearBottom,
  mergeLatestMessagingPage,
  restoreAnchoredMessageScrollTop,
  restorePrependedMessageScrollTop,
} from "../utils/messaging-thread-state";
import type {
  ActiveUtilityPanel,
  MessagingCustomization,
} from "../utils/messaging-preferences";
import type {
  GroupInvitationLink,
  GroupKind,
  MessageRequestListResponse,
  MessagingAccount,
  MessagingBlockedAccount,
  MessagingContact,
  MessagingGroupMember,
  MessagingAttachment,
  MessagingConversation,
  ConversationListView,
  ConversationSharedContent,
  ConversationMuteSetting,
  MessageInformation,
  MessagingMessage,
  MessagingMessageRequest,
  MessagingNotification,
  MessagingSearchMessageResult,
  MessagingStorageLargestFile,
  MessagingUserProfile,
  OfficialGroupAuditEntry,
  OfficialGroupScopeOption,
  PrivateGroupHistoryWindow,
  StarredMessageItem,
  ChatFolder,
} from "../types/messaging";
import { AttachmentGlyph, MessageNavigationIcon } from "./MessageAppFoundation";
import {
  destructiveConfirmationCopy,
  SELECTED_CONVERSATION_STORAGE_KEY,
  MESSAGE_NAVIGATION_STORAGE_KEY,
  QUICK_REACTIONS,
  DEFAULT_MESSAGING_SETTINGS,
  SETTINGS_TABS,
  buildGroupInviteUrl,
  copyTextToClipboard,
  MAX_AUDIO_ATTACHMENT_BYTES,
  MAX_MESSAGE_ATTACHMENT_FILES,
  MAX_MESSAGE_ATTACHMENT_TOTAL_BYTES,
  getViewerReaction,
  EMPTY_ATTACHMENT_UPLOAD_STATE,
  attachmentVisualKind,
  readStoredConversationId,
  readStoredHighlightedMessageId,
  readStoredNavigationExpanded,
  initials,
  createAnnouncementComposerValues,
  announcementDetailToComposerValues,
  isAnnouncementEditable,
  isAnnouncementDeletable,
  createAnnouncementAttachmentClientId,
  announcementEnumLabel,
  isAnnouncementPdfAttachment,
  isAnnouncementTextAttachment,
  canPreviewAnnouncementAttachment,
  formatFileSize,
  selectedAttachmentValidationError,
  createSelectedComposerAttachment,
  isImageAttachment,
  isVideoAttachment,
  isAudioAttachment,
  getMessagePayloadValue,
  escapeRegExp,
  mentionSearchText,
  getComposerMentionQuery,
  getMentionedAccountIds,
  getMessageLocationPayload,
  browserPositionToLocationInput,
  preferredVoiceNoteMimeType,
  voiceNoteExtension,
  isPdfAttachment,
  isTextPreviewAttachment,
  canPreviewAttachment,
  emptySharedContent,
  collectSharedContentFromMessages,
  mergeSharedContent,
  firstAvailableSharedContentTab,
  canForwardMessage,
  roleLabel,
  workspacePathForAccountClass,
  officialScopeLabel,
  employeeOrgContextLabel,
  requestReasonLabel,
  starredMessagePreview,
  requestStatusLabel,
  applyMessageUpdate,
  canEditMessage,
  canDeleteMessageForEveryone,
  messagePreview,
  notificationMetadataRecord,
  MESSAGE_KEYBOARD_FOCUSABLE_SELECTOR,
  keyboardFocusableElements,
  useMessageModalKeyboardBoundary,
  handleLinearKeyboardNavigation,
} from "./message-app-foundation";
import type {
  RealtimeConnectionStatus,
  SharedContentTab,
  SharedContentReturnView,
  StorageUsageScope,
  StorageUsageData,
  ConversationCategory,
  PersonalConversationHistoryAction,
  DestructiveConfirmation,
  AnnouncementComposerMode,
  AnnouncementComposerAction,
  AnnouncementComposerValues,
  AnnouncementPendingAttachment,
  MessagingSettingsTab,
  GroupInformationTab,
  MessagingSettings,
  AttachmentViewerState,
  AnnouncementAttachmentViewerState,
  AttachmentUploadState,
  SelectedComposerAttachment,
} from "./message-app-foundation";

export function useMessageAppController() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation("messaging");
  const { account, accessToken, logout } = useAuth();
  const { refreshAvatar } = useAvatarRegistry();
  const mainWorkspacePath = workspacePathForAccountClass(account?.accountClass);
  const announcementMode = location.pathname.startsWith(
    "/messages/announcements",
  );
  const starredMode = location.pathname.startsWith("/messages/starred");
  const archivedMode = location.pathname.startsWith("/messages/archived");
  const requestMode = location.pathname.startsWith("/messages/requests");
  const notificationMode = location.pathname.startsWith(
    "/messages/notifications",
  );
  const settingsMode = location.pathname.startsWith("/messages/settings");
  const ownProfileMode = location.pathname.startsWith("/messages/profile");
  const newConversationMode = location.pathname.startsWith("/messages/new");
  const createGroupMode = location.pathname.startsWith("/messages/groups/new");
  const listCreateMode = location.pathname === "/messages/lists/new";
  const listEditRouteMatch = listCreateMode
    ? null
    : location.pathname.match(/^\/messages\/lists\/([^/]+)\/edit$/);
  const listViewRouteMatch =
    listCreateMode || listEditRouteMatch
      ? null
      : location.pathname.match(/^\/messages\/lists\/([^/]+)$/);
  const selectedListId =
    listEditRouteMatch?.[1] ?? listViewRouteMatch?.[1] ?? null;
  const listMode = selectedListId !== null;
  const listEditMode = listEditRouteMatch !== null;
  const listWorkspaceMode = listCreateMode || listMode;
  const listManagementMode = listCreateMode || listEditMode;

  const [loggingOut, setLoggingOut] = useState(false);
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeConnectionStatus>("CONNECTING");
  const [presenceByAccountId, setPresenceByAccountId] = useState<
    Record<string, MessagingPresenceState>
  >({});
  const [typingByConversation, setTypingByConversation] = useState<
    Record<string, string[]>
  >({});
  const [conversations, setConversations] = useState<MessagingConversation[]>(
    [],
  );
  const [conversationNextCursor, setConversationNextCursor] = useState<
    string | null
  >(null);
  const [conversationHasMore, setConversationHasMore] = useState(false);
  const [conversationLoadingMore, setConversationLoadingMore] = useState(false);
  const [chatFolders, setChatFolders] = useState<ChatFolder[]>([]);
  const [chatFoldersLoading, setChatFoldersLoading] = useState(false);
  const [chatFoldersError, setChatFoldersError] = useState<string | null>(null);
  const [listCandidateConversations, setListCandidateConversations] = useState<
    MessagingConversation[]
  >([]);
  const [listCandidatesLoading, setListCandidatesLoading] = useState(false);
  const [listNameDraft, setListNameDraft] = useState("");
  const [listSelectedConversationIds, setListSelectedConversationIds] =
    useState<string[]>([]);
  const [listCandidateSearch, setListCandidateSearch] = useState("");
  const [listSaving, setListSaving] = useState(false);
  const [listDeleting, setListDeleting] = useState(false);
  const [listDeleteConfirmOpen, setListDeleteConfirmOpen] = useState(false);
  const [listWorkspaceError, setListWorkspaceError] = useState<string | null>(
    null,
  );

  const [announcementItems, setAnnouncementItems] = useState<
    AnnouncementListItem[]
  >([]);
  const [announcementLoading, setAnnouncementLoading] = useState(false);
  const [announcementError, setAnnouncementError] = useState<string | null>(
    null,
  );
  const [announcementComposerOpen, setAnnouncementComposerOpen] =
    useState(false);
  const [announcementComposerMode, setAnnouncementComposerMode] =
    useState<AnnouncementComposerMode>("CREATE");
  const [announcementComposerGroupId, setAnnouncementComposerGroupId] =
    useState<string | null>(null);
  const [
    announcementComposerAnnouncementId,
    setAnnouncementComposerAnnouncementId,
  ] = useState<string | null>(null);
  const [announcementComposerStatus, setAnnouncementComposerStatus] =
    useState<AnnouncementStatus | null>(null);
  const [announcementComposerValues, setAnnouncementComposerValues] =
    useState<AnnouncementComposerValues>(createAnnouncementComposerValues);
  const [announcementAudienceOptions, setAnnouncementAudienceOptions] =
    useState<AnnouncementAudienceOptions | null>(null);
  const [announcementAudienceLoading, setAnnouncementAudienceLoading] =
    useState(false);
  const [
    announcementComposerExistingAttachments,
    setAnnouncementComposerExistingAttachments,
  ] = useState<AnnouncementAttachment[]>([]);
  const [
    announcementComposerRemovedAttachmentIds,
    setAnnouncementComposerRemovedAttachmentIds,
  ] = useState<string[]>([]);
  const [
    announcementComposerPendingAttachments,
    setAnnouncementComposerPendingAttachments,
  ] = useState<AnnouncementPendingAttachment[]>([]);
  const [announcementComposerSubmitting, setAnnouncementComposerSubmitting] =
    useState<AnnouncementComposerAction | null>(null);
  const [announcementComposerError, setAnnouncementComposerError] = useState<
    string | null
  >(null);
  const [announcementComposerNotice, setAnnouncementComposerNotice] = useState<
    string | null
  >(null);
  const [announcementDetailOpen, setAnnouncementDetailOpen] = useState(false);
  const [announcementDetail, setAnnouncementDetail] =
    useState<AnnouncementDetail | null>(null);
  const [announcementDetailLoading, setAnnouncementDetailLoading] =
    useState(false);
  const [announcementDetailError, setAnnouncementDetailError] = useState<
    string | null
  >(null);
  const [
    announcementDeleteConfirmationOpen,
    setAnnouncementDeleteConfirmationOpen,
  ] = useState(false);
  const [announcementDetailAction, setAnnouncementDetailAction] = useState<
    "ACKNOWLEDGE" | "DELETE" | null
  >(null);
  const [announcementAttachmentActionId, setAnnouncementAttachmentActionId] =
    useState<string | null>(null);
  const [conversationListView, setConversationListView] =
    useState<ConversationListView>(archivedMode ? "ARCHIVED" : "ACTIVE");
  const [conversationCategory, setConversationCategory] =
    useState<ConversationCategory>("ALL");
  const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);
  const [navigationExpanded, setNavigationExpanded] = useState(() => {
    // Mobile navigation always starts closed so the drawer never covers the
    // initial conversation view after a previous desktop session.
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 900px)").matches
    ) {
      return false;
    }

    return readStoredNavigationExpanded();
  });
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [attachmentMenuView, setAttachmentMenuView] = useState<
    "ROOT" | "LIVE_LOCATION"
  >("ROOT");
  const [conversationActionMenuOpen, setConversationActionMenuOpen] =
    useState(false);
  const [conversationActionMenuView, setConversationActionMenuView] = useState<
    "ROOT" | "MUTE"
  >("ROOT");
  const [conversationRowMenuId, setConversationRowMenuId] = useState<
    string | null
  >(null);
  const [conversationRowMenuView, setConversationRowMenuView] = useState<
    "ROOT" | "MUTE"
  >("ROOT");
  const [conversationRowMenuPosition, setConversationRowMenuPosition] =
    useState<{
      top: number;
      left: number;
      width: number;
      maxHeight: number;
    } | null>(null);
  const [conversationHistoryAction, setConversationHistoryAction] =
    useState<PersonalConversationHistoryAction | null>(null);
  const [conversationHistoryTargetId, setConversationHistoryTargetId] =
    useState<string | null>(null);
  const [conversationHistorySubmitting, setConversationHistorySubmitting] =
    useState(false);
  const [conversationHistoryError, setConversationHistoryError] = useState<
    string | null
  >(null);
  const [conversationHistoryToast, setConversationHistoryToast] = useState<
    string | null
  >(null);
  const [destructiveConfirmation, setDestructiveConfirmation] =
    useState<DestructiveConfirmation | null>(null);
  const [destructiveConfirmationError, setDestructiveConfirmationError] =
    useState<string | null>(null);
  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false);
  const [openMessageMenuId, setOpenMessageMenuId] = useState<string | null>(
    null,
  );
  const [messageActionMenuPosition, setMessageActionMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [messageActionMenuAnchor, setMessageActionMenuAnchor] = useState<{
    top: number;
    right: number;
    bottom: number;
    left: number;
    ownMessage: boolean;
    boundaryTop: number;
    boundaryRight: number;
    boundaryBottom: number;
    boundaryLeft: number;
  } | null>(null);
  const messageActionMenuRef = useRef<HTMLDivElement | null>(null);
  const reactionMenuRef = useRef<HTMLDivElement | null>(null);
  const messageMenuOpenedByKeyboardRef = useRef(false);
  const reactionMenuOpenedByKeyboardRef = useRef(false);
  const mobileLongPressTimerRef = useRef<number | null>(null);
  const mobileLongPressOriginRef = useRef<{
    pointerId: number;
    messageId: string;
    x: number;
    y: number;
  } | null>(null);
  const [openReactionMenuId, setOpenReactionMenuId] = useState<string | null>(
    null,
  );
  const [activeMobileMessageId, setActiveMobileMessageId] = useState<
    string | null
  >(null);
  const [mobileMessageActionView, setMobileMessageActionView] = useState<
    "PRIMARY" | "MORE"
  >("PRIMARY");
  const [reactionMenuPosition, setReactionMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(readStoredConversationId);
  const [messages, setMessages] = useState<MessagingMessage[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<MessagingMessage[]>([]);
  const [pinnedMessageBrowserOpen, setPinnedMessageBrowserOpen] =
    useState(false);
  const [activePinnedMessageIndex, setActivePinnedMessageIndex] = useState(0);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [conversationSearch, setConversationSearch] = useState("");
  const [mentionSuggestionsDismissed, setMentionSuggestionsDismissed] =
    useState(false);
  const [activeMentionSuggestionIndex, setActiveMentionSuggestionIndex] =
    useState(0);
  const [messageText, setMessageText] = useState("");
  const [composerCaretIndex, setComposerCaretIndex] = useState(0);
  const [replyingTo, setReplyingTo] = useState<MessagingMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<MessagingMessage | null>(
    null,
  );
  const [messageActionId, setMessageActionId] = useState<string | null>(null);
  const [reactionActionId, setReactionActionId] = useState<string | null>(null);
  const [pinActionId, setPinActionId] = useState<string | null>(null);
  const [messageInformation, setMessageInformation] =
    useState<MessageInformation | null>(null);
  const [messageInformationLoadingId, setMessageInformationLoadingId] =
    useState<string | null>(null);
  const [messageInformationError, setMessageInformationError] = useState<
    string | null
  >(null);
  const [
    messageInformationVisibleReadCount,
    setMessageInformationVisibleReadCount,
  ] = useState(40);
  const [
    messageInformationVisibleDeliveredCount,
    setMessageInformationVisibleDeliveredCount,
  ] = useState(40);
  const [conversationPreferenceLoading, setConversationPreferenceLoading] =
    useState<string | null>(null);
  const [conversationLoading, setConversationLoading] = useState(true);
  const [messageLoading, setMessageLoading] = useState(false);
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [sendAttemptFailed, setSendAttemptFailed] = useState(false);
  const composerSendAttemptRef = useRef<MessagingSendAttempt | null>(null);
  const locationSendAttemptRef = useRef<MessagingSendAttempt | null>(null);
  const [selectedAttachments, setSelectedAttachments] = useState<
    SelectedComposerAttachment[]
  >([]);
  const selectedAttachmentsRef = useRef<SelectedComposerAttachment[]>([]);
  const [selectedAttachmentKind, setSelectedAttachmentKind] = useState<
    "FILE" | "VOICE_NOTE"
  >("FILE");
  const [attachmentUpload, setAttachmentUpload] =
    useState<AttachmentUploadState>(EMPTY_ATTACHMENT_UPLOAD_STATE);
  const [voiceRecordingState, setVoiceRecordingState] = useState<
    "IDLE" | "RECORDING" | "STOPPING"
  >("IDLE");
  const [voiceRecordingSeconds, setVoiceRecordingSeconds] = useState(0);
  const [locationDurationMinutes, setLocationDurationMinutes] = useState<
    15 | 60 | 480
  >(15);
  const [locationActionLoading, setLocationActionLoading] = useState<
    "CURRENT" | "LIVE" | "STOP" | null
  >(null);
  const [activeLiveLocation, setActiveLiveLocation] = useState<{
    conversationId: string;
    messageId: string;
    expiresAt: string;
  } | null>(null);
  const [attachmentViewer, setAttachmentViewer] =
    useState<AttachmentViewerState | null>(null);
  const [announcementAttachmentViewer, setAnnouncementAttachmentViewer] =
    useState<AnnouncementAttachmentViewerState | null>(null);
  const [sharedContentOpen, setSharedContentOpen] = useState(false);
  const [sharedContentReturnView, setSharedContentReturnView] =
    useState<SharedContentReturnView>("GROUP_INFORMATION");
  const [sharedContentTab, setSharedContentTab] =
    useState<SharedContentTab>("MEDIA");
  const [sharedContent, setSharedContent] =
    useState<ConversationSharedContent | null>(null);
  const [sharedContentLoading, setSharedContentLoading] = useState(false);
  const [sharedContentError, setSharedContentError] = useState<string | null>(
    null,
  );
  const [storageUsageScope, setStorageUsageScope] =
    useState<StorageUsageScope | null>(null);
  const [storageUsage, setStorageUsage] = useState<StorageUsageData | null>(
    null,
  );
  const [storageUsageLoading, setStorageUsageLoading] = useState(false);
  const [storageUsageError, setStorageUsageError] = useState<string | null>(
    null,
  );
  const [storageUsageActionId, setStorageUsageActionId] = useState<
    string | null
  >(null);
  const [storageDeleteConfirmation, setStorageDeleteConfirmation] = useState<{
    attachmentId: string;
    mode: "ME" | "EVERYONE";
  } | null>(null);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [messageNotice, setMessageNotice] = useState<string | null>(null);
  const [forwardingMessage, setForwardingMessage] =
    useState<MessagingMessage | null>(null);
  const [forwardDestinationIds, setForwardDestinationIds] = useState<string[]>(
    [],
  );
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardClientId, setForwardClientId] = useState<string | null>(null);
  const [forwardDestinationError, setForwardDestinationError] = useState<
    string | null
  >(null);
  const [forwardSubmitting, setForwardSubmitting] = useState(false);
  const newConversationOpen = newConversationMode;
  const [groupDialogMode, setGroupDialogMode] = useState<
    "CREATE" | "MANAGE" | null
  >(null);
  const [groupPanelTab, setGroupPanelTab] =
    useState<GroupInformationTab>("OVERVIEW");
  const [groupManagementWorkspaceOpen, setGroupManagementWorkspaceOpen] =
    useState(false);
  const [groupMemberSearch, setGroupMemberSearch] = useState("");
  const [groupMembersExpanded, setGroupMembersExpanded] = useState(false);
  const [officialGroupMembers, setOfficialGroupMembers] = useState<
    MessagingGroupMember[]
  >([]);
  const [officialGroupMemberCursor, setOfficialGroupMemberCursor] = useState<
    string | null
  >(null);
  const [officialGroupMembersHasMore, setOfficialGroupMembersHasMore] =
    useState(false);
  const [officialGroupMembersLoading, setOfficialGroupMembersLoading] =
    useState(false);
  const [officialGroupMembersLoadingMore, setOfficialGroupMembersLoadingMore] =
    useState(false);
  const [officialGroupMembersError, setOfficialGroupMembersError] = useState<
    string | null
  >(null);
  const [
    officialGroupMemberSearchResults,
    setOfficialGroupMemberSearchResults,
  ] = useState<MessagingGroupMember[]>([]);
  const [officialGroupMemberSearchCursor, setOfficialGroupMemberSearchCursor] =
    useState<string | null>(null);
  const [
    officialGroupMemberSearchHasMore,
    setOfficialGroupMemberSearchHasMore,
  ] = useState(false);
  const [
    officialGroupMemberSearchLoading,
    setOfficialGroupMemberSearchLoading,
  ] = useState(false);
  const [
    officialGroupMemberSearchLoadingMore,
    setOfficialGroupMemberSearchLoadingMore,
  ] = useState(false);
  const [officialGroupMemberSearchError, setOfficialGroupMemberSearchError] =
    useState<string | null>(null);
  const [officialMentionSuggestions, setOfficialMentionSuggestions] = useState<
    MessagingGroupMember[]
  >([]);
  const [officialMentionCursor, setOfficialMentionCursor] = useState<
    string | null
  >(null);
  const [officialMentionHasMore, setOfficialMentionHasMore] = useState(false);
  const [officialMentionLoading, setOfficialMentionLoading] = useState(false);
  const [officialMentionLoadingMore, setOfficialMentionLoadingMore] =
    useState(false);
  const [officialMentionError, setOfficialMentionError] = useState<
    string | null
  >(null);
  const [selectedComposerMentions, setSelectedComposerMentions] = useState<
    MessagingAccount[]
  >([]);
  const [
    officialGroupMembersRefreshVersion,
    setOfficialGroupMembersRefreshVersion,
  ] = useState(0);
  const [profileReturnToGroupInformation, setProfileReturnToGroupInformation] =
    useState(false);
  const [profileSharedGroupsExpanded, setProfileSharedGroupsExpanded] =
    useState(false);
  const [groupKind, setGroupKind] = useState<GroupKind>("PERSONAL");
  const [officialGroupScopes, setOfficialGroupScopes] = useState<
    OfficialGroupScopeOption[]
  >([]);
  const [officialGroupCanCreate, setOfficialGroupCanCreate] = useState(false);
  const [officialGroupCanReconcileAll, setOfficialGroupCanReconcileAll] =
    useState(false);
  const [officialGroupScopeKey, setOfficialGroupScopeKey] = useState("");
  const [officialGroupScopesLoading, setOfficialGroupScopesLoading] =
    useState(false);
  const [officialGroupAudit, setOfficialGroupAudit] = useState<
    OfficialGroupAuditEntry[]
  >([]);
  const [officialGroupAuditLoading, setOfficialGroupAuditLoading] =
    useState(false);
  const [officialGroupReconciling, setOfficialGroupReconciling] =
    useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [groupContacts, setGroupContacts] = useState<MessagingContact[]>([]);
  const [groupSelectedAccountIds, setGroupSelectedAccountIds] = useState<
    string[]
  >([]);
  const [groupSelectedContacts, setGroupSelectedContacts] = useState<
    MessagingContact[]
  >([]);
  const [groupContactsLoading, setGroupContactsLoading] =
    useState(createGroupMode);
  const [groupSubmitting, setGroupSubmitting] = useState(false);
  const [groupActionAccountId, setGroupActionAccountId] = useState<
    string | null
  >(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [groupInviteLink, setGroupInviteLink] =
    useState<GroupInvitationLink | null>(null);
  const [groupInviteLoading, setGroupInviteLoading] = useState(false);
  const [groupInviteNotice, setGroupInviteNotice] = useState<string | null>(
    null,
  );
  const [groupInviteError, setGroupInviteError] = useState<string | null>(null);
  const [inviteJoinLoading, setInviteJoinLoading] = useState(false);
  const groupInviteJoinTokenRef = useRef<string | null>(null);
  const pushNavigationTargetRef = useRef<string | null>(null);
  const [groupPhotoUploading, setGroupPhotoUploading] = useState(false);
  const groupPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [privateGroupDialogOpen, setPrivateGroupDialogOpen] = useState(false);
  const [privateGroupSearch, setPrivateGroupSearch] = useState("");
  const [privateGroupContacts, setPrivateGroupContacts] = useState<
    MessagingContact[]
  >([]);
  const [privateGroupSelectedAccountIds, setPrivateGroupSelectedAccountIds] =
    useState<string[]>([]);
  const [privateGroupSelectedContacts, setPrivateGroupSelectedContacts] =
    useState<MessagingContact[]>([]);
  const [privateGroupHistoryWindow, setPrivateGroupHistoryWindow] =
    useState<PrivateGroupHistoryWindow>("NONE");
  const [privateGroupContactsLoading, setPrivateGroupContactsLoading] =
    useState(false);
  const [privateGroupSubmitting, setPrivateGroupSubmitting] = useState(false);
  const [privateGroupError, setPrivateGroupError] = useState<string | null>(
    null,
  );
  const [contactSearch, setContactSearch] = useState("");
  const [contacts, setContacts] = useState<MessagingContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [creatingConversationId, setCreatingConversationId] = useState<
    string | null
  >(null);
  const [starredItems, setStarredItems] = useState<StarredMessageItem[]>([]);
  const [starredLoading, setStarredLoading] = useState(false);
  const [starredLoadingMore, setStarredLoadingMore] = useState(false);
  const [starredHasMore, setStarredHasMore] = useState(false);
  const [starredNextCursor, setStarredNextCursor] = useState<string | null>(
    null,
  );
  const [starredError, setStarredError] = useState<string | null>(null);
  const [starredActionId, setStarredActionId] = useState<string | null>(null);
  const [messageRequests, setMessageRequests] =
    useState<MessageRequestListResponse>({
      received: [],
      sent: [],
      counts: {
        receivedPending: 0,
        sentPending: 0,
      },
    });
  const [requestListView, setRequestListView] = useState<"RECEIVED" | "SENT">(
    "RECEIVED",
  );
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  );
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestNotice, setRequestNotice] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<MessagingNotification[]>(
    [],
  );
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [notificationListView, setNotificationListView] = useState<
    "ALL" | "UNREAD"
  >("ALL");
  const [activeUtilityPanel, setActiveUtilityPanel] =
    useState<ActiveUtilityPanel>(null);
  const profileAccountId = ownProfileMode
    ? (account?.id ?? null)
    : activeUtilityPanel?.kind === "PROFILE"
      ? activeUtilityPanel.accountId
      : null;
  const [notificationToast, setNotificationToast] =
    useState<MessagingNotification | null>(null);
  const notificationToastTimerRef = useRef<number | null>(null);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(
    null,
  );
  const [notificationActionNotice, setNotificationActionNotice] = useState<
    string | null
  >(null);
  const [notificationBulkAction, setNotificationBulkAction] = useState<
    "MARK_ALL_READ" | "DELETE_READ" | null
  >(null);
  const [notificationDeletingId, setNotificationDeletingId] = useState<
    string | null
  >(null);
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(() =>
    readMessagingBooleanPreference(
      window.localStorage,
      NOTIFICATION_SOUND_STORAGE_KEY,
      account?.id,
      true,
    ),
  );
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] =
    useState(() =>
      readMessagingBooleanPreference(
        window.localStorage,
        BROWSER_NOTIFICATION_STORAGE_KEY,
        account?.id,
        false,
      ),
    );
  const [backgroundPushReady, setBackgroundPushReady] = useState(false);
  const [settingsTab, setSettingsTab] =
    useState<MessagingSettingsTab>("PRIVACY");
  const [messagingSettingsLoading, setMessagingSettingsLoading] =
    useState(false);
  const [messagingSettingsSaving, setMessagingSettingsSaving] = useState(false);
  const [messagingSettingsError, setMessagingSettingsError] = useState<
    string | null
  >(null);
  const [messagingSettingsNotice, setMessagingSettingsNotice] = useState<
    string | null
  >(null);
  const settingsMutationSequenceRef = useRef(0);
  const confirmedAccountSettingsRef = useRef({
    showOnlineStatus: DEFAULT_MESSAGING_SETTINGS.showOnlineStatus,
    showReadReceipts: DEFAULT_MESSAGING_SETTINGS.showReadReceipts,
    requireMessageRequests: DEFAULT_MESSAGING_SETTINGS.requireMessageRequests,
  });
  const [securityAction, setSecurityAction] = useState<"SIGN_OUT_ALL" | null>(
    null,
  );
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [messagingCustomization, setMessagingCustomization] =
    useState<MessagingCustomization>(() =>
      readMessagingCustomization(window.localStorage, account?.id),
    );
  const [messagingSettings, setMessagingSettings] = useState<MessagingSettings>(
    () => ({
      ...DEFAULT_MESSAGING_SETTINGS,
      ...readMessagingDeviceSettings(window.localStorage, account?.id),
    }),
  );
  const [preferenceStorageAccountId, setPreferenceStorageAccountId] = useState<
    string | null
  >(account?.id ?? null);
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [blockedAccounts, setBlockedAccounts] = useState<
    MessagingBlockedAccount[]
  >([]);
  const [blockedAccountsLoading, setBlockedAccountsLoading] = useState(false);
  const [blockActionAccountId, setBlockActionAccountId] = useState<
    string | null
  >(null);
  const [blockSettingsError, setBlockSettingsError] = useState<string | null>(
    null,
  );
  const [blockSettingsNotice, setBlockSettingsNotice] = useState<string | null>(
    null,
  );
  useEffect(() => {
    const accountId = account?.id ?? null;

    if (!accountId) {
      setPreferenceStorageAccountId(null);
      return;
    }

    // Hydrate account-scoped device preferences before allowing write effects.
    // Global legacy keys are intentionally ignored so a shared browser cannot
    // expose one employee's appearance or notification choices to another.
    setMessagingCustomization(
      readMessagingCustomization(window.localStorage, accountId),
    );
    setMessagingSettings((current) => ({
      ...current,
      ...readMessagingDeviceSettings(window.localStorage, accountId),
    }));
    setNotificationSoundEnabled(
      readMessagingBooleanPreference(
        window.localStorage,
        NOTIFICATION_SOUND_STORAGE_KEY,
        accountId,
        true,
      ),
    );
    setBrowserNotificationsEnabled(
      readMessagingBooleanPreference(
        window.localStorage,
        BROWSER_NOTIFICATION_STORAGE_KEY,
        accountId,
        false,
      ),
    );
    setPreferenceStorageAccountId(accountId);
  }, [account?.id]);

  useEffect(() => {
    if (!account?.id || preferenceStorageAccountId !== account.id) {
      return;
    }

    writeMessagingCustomization(
      window.localStorage,
      account.id,
      messagingCustomization,
    );
  }, [account?.id, messagingCustomization, preferenceStorageAccountId]);

  useEffect(() => {
    if (!account?.id || preferenceStorageAccountId !== account.id) {
      return;
    }

    writeMessagingDeviceSettings(window.localStorage, account.id, {
      notificationPreview: messagingSettings.notificationPreview,
      muteAllNotifications: messagingSettings.muteAllNotifications,
    });
  }, [
    account?.id,
    messagingSettings.muteAllNotifications,
    messagingSettings.notificationPreview,
    preferenceStorageAccountId,
  ]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = (): void =>
      setSystemPrefersDark(mediaQuery.matches);

    updateSystemTheme();
    mediaQuery.addEventListener("change", updateSystemTheme);

    return () => mediaQuery.removeEventListener("change", updateSystemTheme);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        MESSAGE_NAVIGATION_STORAGE_KEY,
        String(navigationExpanded),
      );
    } catch {
      // The navigation still works when browser storage is unavailable.
    }
  }, [navigationExpanded]);

  useEffect(() => {
    if (!openMessageMenuId && !openReactionMenuId && !activeMobileMessageId) {
      return;
    }

    const closeMenus = () => {
      setOpenMessageMenuId(null);
      setMessageActionMenuPosition(null);
      setMessageActionMenuAnchor(null);
      setOpenReactionMenuId(null);
      setReactionMenuPosition(null);
      setActiveMobileMessageId(null);
      setMobileMessageActionView("PRIMARY");
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        closeMenus();
        return;
      }

      const actionTrigger = target.closest<HTMLElement>(
        "[data-message-action-trigger]",
      );
      const reactionTrigger = target.closest<HTMLElement>(
        "[data-message-reaction-trigger]",
      );
      const actionMenu = target.closest<HTMLElement>(
        "[data-message-action-menu]",
      );
      const reactionMenu = target.closest<HTMLElement>(
        "[data-message-reaction-menu]",
      );
      const messageRow = target.closest<HTMLElement>("[data-message-id]");
      const clickedCurrentTrigger =
        actionTrigger?.dataset.messageActionTrigger === openMessageMenuId ||
        reactionTrigger?.dataset.messageReactionTrigger === openReactionMenuId;
      const clickedSelectedMobileMessage =
        messageRow?.dataset.messageId === activeMobileMessageId;

      if (
        !clickedCurrentTrigger &&
        !clickedSelectedMobileMessage &&
        !actionMenu &&
        !reactionMenu
      ) {
        closeMenus();
      }
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      const actionTrigger = openMessageMenuId
        ? Array.from(
            document.querySelectorAll<HTMLButtonElement>(
              "[data-message-action-trigger]",
            ),
          ).find(
            (button) =>
              button.dataset.messageActionTrigger === openMessageMenuId,
          )
        : undefined;
      const reactionTrigger = openReactionMenuId
        ? Array.from(
            document.querySelectorAll<HTMLButtonElement>(
              "[data-message-reaction-trigger]",
            ),
          ).find(
            (button) =>
              button.dataset.messageReactionTrigger === openReactionMenuId,
          )
        : undefined;

      event.preventDefault();
      event.stopImmediatePropagation();
      closeMenus();
      window.requestAnimationFrame(() => {
        (actionTrigger ?? reactionTrigger)?.focus();
      });
    };

    const handleScroll = (event: Event) => {
      const target = event.target;

      // The action sheet/menu may need to scroll on a small screen. Scrolling
      // inside the active popup must not dismiss it; scrolling the conversation
      // still closes temporary message UI so anchors cannot drift.
      if (
        target instanceof Element &&
        target.closest(
          "[data-message-action-menu], [data-message-reaction-menu]",
        )
      ) {
        return;
      }

      closeMenus();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeMenus);
    document.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeMenus);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [activeMobileMessageId, openMessageMenuId, openReactionMenuId]);

  useEffect(() => {
    clearMobileLongPress();
    setActiveMobileMessageId(null);
  }, [selectedConversationId]);

  useEffect(() => {
    if (!activeMobileMessageId) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(
          "[data-message-mobile-actions] [data-message-action-menu] button",
        )
        ?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeMobileMessageId]);

  useEffect(() => () => clearMobileLongPress(), []);

  useLayoutEffect(() => {
    if (
      !openMessageMenuId ||
      !messageActionMenuAnchor ||
      !messageActionMenuRef.current
    ) {
      return;
    }

    const menuRect = messageActionMenuRef.current.getBoundingClientRect();
    const viewportPadding = 10;
    const threadPadding = 8;
    const horizontalGap = 8;
    const minLeft = Math.max(
      viewportPadding,
      messageActionMenuAnchor.boundaryLeft + threadPadding,
    );
    const maxLeft = Math.max(
      minLeft,
      Math.min(
        window.innerWidth - menuRect.width - viewportPadding,
        messageActionMenuAnchor.boundaryRight - menuRect.width - threadPadding,
      ),
    );

    // The anchor represents the whole React / Reply / More cluster. Keep the
    // popup beside that cluster so it never covers the More trigger or another
    // quick-action button. Incoming messages prefer the right side and outgoing
    // messages prefer the left; flip sides when the preferred side has no room.
    const preferredLeft = messageActionMenuAnchor.ownMessage
      ? messageActionMenuAnchor.left - menuRect.width - horizontalGap
      : messageActionMenuAnchor.right + horizontalGap;
    const alternateLeft = messageActionMenuAnchor.ownMessage
      ? messageActionMenuAnchor.right + horizontalGap
      : messageActionMenuAnchor.left - menuRect.width - horizontalGap;
    const fitsHorizontally = (candidate: number) =>
      candidate >= minLeft && candidate <= maxLeft;
    const left = fitsHorizontally(preferredLeft)
      ? preferredLeft
      : fitsHorizontally(alternateLeft)
        ? alternateLeft
        : Math.min(maxLeft, Math.max(minLeft, preferredLeft));

    const minTop = Math.max(
      viewportPadding,
      messageActionMenuAnchor.boundaryTop + threadPadding,
    );
    const maxTop = Math.max(
      minTop,
      Math.min(
        window.innerHeight - menuRect.height - viewportPadding,
        messageActionMenuAnchor.boundaryBottom -
          menuRect.height -
          threadPadding,
      ),
    );

    // Align the popup with the trigger instead of opening a long dropdown
    // underneath the message. Only shift it vertically when needed to keep the
    // complete menu inside the conversation viewport above the composer.
    const preferredTop = messageActionMenuAnchor.top - 4;
    const top = Math.min(maxTop, Math.max(minTop, preferredTop));

    setMessageActionMenuPosition({
      top: Math.round(top),
      left: Math.round(left),
    });
  }, [openMessageMenuId, messageActionMenuAnchor]);

  useEffect(() => {
    if (
      !openMessageMenuId ||
      !messageActionMenuPosition ||
      !messageMenuOpenedByKeyboardRef.current
    ) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      messageActionMenuRef.current
        ?.querySelector<HTMLElement>(MESSAGE_KEYBOARD_FOCUSABLE_SELECTOR)
        ?.focus();
      messageMenuOpenedByKeyboardRef.current = false;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [messageActionMenuPosition, openMessageMenuId]);

  useEffect(() => {
    if (
      !openReactionMenuId ||
      !reactionMenuPosition ||
      !reactionMenuOpenedByKeyboardRef.current
    ) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      reactionMenuRef.current
        ?.querySelector<HTMLElement>(MESSAGE_KEYBOARD_FOCUSABLE_SELECTOR)
        ?.focus();
      reactionMenuOpenedByKeyboardRef.current = false;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [openReactionMenuId, reactionMenuPosition]);

  useEffect(() => {
    if (
      !settingsMode &&
      !notificationMode &&
      !ownProfileMode &&
      !newConversationMode &&
      !createGroupMode
    ) {
      return undefined;
    }

    const handleWorkspaceEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }

      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        return;
      }

      event.preventDefault();
      navigate("/messages");
    };

    window.addEventListener("keydown", handleWorkspaceEscape);

    return () => window.removeEventListener("keydown", handleWorkspaceEscape);
  }, [
    createGroupMode,
    navigate,
    newConversationMode,
    notificationMode,
    ownProfileMode,
    settingsMode,
  ]);

  useEffect(() => {
    if (!attachmentMenuOpen && !composerEmojiOpen) {
      return;
    }

    const closeComposerPopovers = () => {
      setAttachmentMenuOpen(false);
      setAttachmentMenuView("ROOT");
      setComposerEmojiOpen(false);
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        closeComposerPopovers();
        return;
      }

      if (
        attachmentMenuRef.current?.contains(target) ||
        composerEmojiMenuRef.current?.contains(target)
      ) {
        return;
      }

      closeComposerPopovers();
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      const focusTarget = attachmentMenuOpen
        ? attachmentMenuButtonRef.current
        : composerEmojiButtonRef.current;

      event.preventDefault();
      event.stopImmediatePropagation();
      closeComposerPopovers();
      window.requestAnimationFrame(() => focusTarget?.focus());
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeComposerPopovers);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeComposerPopovers);
    };
  }, [attachmentMenuOpen, composerEmojiOpen]);

  useEffect(
    () => () => {
      clearLiveLocationWatch();
    },
    [],
  );

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;

    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    return () => {
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = previousScrollRestoration;
      }
    };
  }, []);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;
    setMessagingSettingsLoading(true);
    setMessagingSettingsError(null);

    void getMessagingPrivacySettings(accessToken)
      .then((response) => {
        if (cancelled) {
          return;
        }

        const confirmed = {
          showOnlineStatus: response.data.showOnlineStatus,
          showReadReceipts: response.data.showReadReceipts,
          requireMessageRequests: response.data.requireMessageRequests,
        };
        confirmedAccountSettingsRef.current = confirmed;
        setMessagingSettings((current) => ({
          ...current,
          ...confirmed,
        }));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setMessagingSettingsError(
          error instanceof Error
            ? error.message
            : t("feedback.privacyLoadError"),
        );
      })
      .finally(() => {
        if (!cancelled) {
          setMessagingSettingsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, t]);

  const loadBlockedAccounts = useCallback(async () => {
    if (!accessToken) {
      setBlockedAccounts([]);
      return;
    }

    setBlockedAccountsLoading(true);
    setBlockSettingsError(null);

    try {
      const response = await listBlockedMessagingAccounts(accessToken);
      setBlockedAccounts(response.data);
    } catch (error) {
      setBlockSettingsError(
        error instanceof Error ? error.message : t("feedback.blockedLoadError"),
      );
    } finally {
      setBlockedAccountsLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => {
    void loadBlockedAccounts();
  }, [loadBlockedAccounts]);

  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<
    MessagingSearchMessageResult[]
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(readStoredHighlightedMessageId);
  const [profileData, setProfileData] = useState<MessagingUserProfile | null>(
    null,
  );
  const [profileBioDraft, setProfileBioDraft] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [profilePhotoUrls, setProfilePhotoUrls] = useState<
    Record<string, string>
  >({});
  const [profilePhotoCacheKeys, setProfilePhotoCacheKeys] = useState<
    Record<string, string>
  >({});
  const [ownProfileAccount, setOwnProfileAccount] =
    useState<MessagingUserProfile | null>(null);
  const profilePhotoUrlsRef = useRef<Record<string, string>>({});
  const [groupPhotoUrls, setGroupPhotoUrls] = useState<Record<string, string>>(
    {},
  );
  const [groupPhotoCacheKeys, setGroupPhotoCacheKeys] = useState<
    Record<string, string>
  >({});
  const groupPhotoUrlsRef = useRef<Record<string, string>>({});
  const [profilePhotoRefreshKey, setProfilePhotoRefreshKey] = useState(0);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profilePhotoUploading, setProfilePhotoUploading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageThreadContentRef = useRef<HTMLDivElement | null>(null);
  const messageResizeFrameRef = useRef<number | null>(null);
  const initialBottomReanchorFrameRef = useRef<number | null>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const messageListNearBottomRef = useRef(true);
  const pendingOlderScrollRestoreRef = useRef<{
    conversationId: string;
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  const pendingThreadMutationAnchorRef = useRef<{
    conversationId: string;
    scrollTop: number;
    anchors: Array<{ messageId: string; offsetTop: number }>;
  } | null>(null);
  const pendingFocusedMessageScrollRef = useRef<string | null>(null);
  const conversationActionButtonRef = useRef<HTMLButtonElement | null>(null);
  const conversationActionMenuRef = useRef<HTMLDivElement | null>(null);
  const conversationRowMenuRef = useRef<HTMLDivElement | null>(null);
  const conversationRowMenuButtonRefs = useRef<
    Record<string, HTMLButtonElement | null>
  >({});
  const conversationHistoryDialogRef = useRef<HTMLElement | null>(null);
  const conversationHistoryCancelRef = useRef<HTMLButtonElement | null>(null);
  const conversationHistoryToastTimerRef = useRef<number | null>(null);
  const conversationsRef = useRef<MessagingConversation[]>([]);
  const pendingSearchResultRef = useRef<MessagingSearchMessageResult | null>(
    null,
  );
  const messageSearchInputRef = useRef<HTMLInputElement | null>(null);
  const messageSearchTriggerRef = useRef<HTMLButtonElement | null>(null);
  const messageSearchReturnFocusRef = useRef<HTMLElement | null>(null);
  const messageSearchRequestIdRef = useRef(0);
  const messageInformationRequestIdRef = useRef(0);
  const closeMessageSearchPanel = useCallback((): void => {
    messageSearchRequestIdRef.current += 1;

    // Restore keyboard focus before the search panel is removed. This avoids
    // leaving focus inside hidden search results and keeps screen-reader and
    // keyboard navigation aligned with the visible conversation controls.
    const preferredTarget = messageSearchReturnFocusRef.current;
    const fallbackTarget = messageSearchTriggerRef.current;
    const focusTarget =
      preferredTarget?.isConnected &&
      preferredTarget.getClientRects().length > 0
        ? preferredTarget
        : fallbackTarget?.isConnected &&
            fallbackTarget.getClientRects().length > 0
          ? fallbackTarget
          : null;

    focusTarget?.focus();
    messageSearchReturnFocusRef.current = null;
    setSearchPanelOpen(false);
    setSearchLoading(false);
    setSearchError(null);
  }, []);
  const previousScrollConversationIdRef = useRef<string | null>(null);
  const previousMessageCountRef = useRef(0);
  const pendingBottomScrollConversationIdRef = useRef<string | null>(
    selectedConversationId,
  );
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingComposerRefocusConversationIdRef = useRef<string | null>(null);
  const conversationSearchInputRef = useRef<HTMLInputElement | null>(null);
  const conversationListRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentMenuRef = useRef<HTMLDivElement | null>(null);
  const attachmentMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const attachmentViewerDialogRef = useRef<HTMLElement | null>(null);
  const attachmentViewerReturnFocusRef = useRef<HTMLElement | null>(null);
  const composerEmojiMenuRef = useRef<HTMLDivElement | null>(null);
  const composerEmojiButtonRef = useRef<HTMLButtonElement | null>(null);
  const attachmentViewerRequestRef = useRef(0);
  const sharedContentRequestRef = useRef(0);
  const sharedContentTabByConversationRef = useRef<
    Record<string, SharedContentTab>
  >({});
  const announcementAttachmentViewerRequestRef = useRef(0);
  const storageUsageRequestRef = useRef(0);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceRecorderStreamRef = useRef<MediaStream | null>(null);
  const voiceRecorderChunksRef = useRef<Blob[]>([]);
  const voiceRecordingTimerRef = useRef<number | null>(null);
  const voiceRecordingStartedAtRef = useRef(0);
  const voiceRecordingCancelledRef = useRef(false);
  const liveLocationWatchIdRef = useRef<number | null>(null);
  const liveLocationExpiryTimerRef = useRef<number | null>(null);
  const liveLocationLastUpdateAtRef = useRef(0);
  const draftConversationIdRef = useRef<string | null>(null);
  const draftHydrationRef = useRef(false);
  const draftCacheRef = useRef<Record<string, string>>({});
  const selectedConversationIdRef = useRef<string | null>(
    selectedConversationId,
  );
  const messageLoadRequestRef = useRef(0);
  const officialGroupMembersRequestRef = useRef(0);
  const officialGroupMemberSearchRequestRef = useRef(0);
  const officialMentionRequestRef = useRef(0);
  const messagePageCacheRef = useRef<
    Record<
      string,
      {
        messages: MessagingMessage[];
        cursor: string | null;
        hasOlder: boolean;
      }
    >
  >({});
  const announcementLoadRequestRef = useRef(0);
  const announcementDetailRequestRef = useRef(0);
  const announcementDetailIdRef = useRef<string | null>(null);
  const announcementModeRef = useRef(announcementMode);
  const messagingSocketRef = useRef<MessagingSocket | null>(null);
  const activeTypingConversationIdRef = useRef<string | null>(null);
  const typingStopTimerRef = useRef<number | null>(null);
  const lastTypingEmitAtRef = useRef(0);

  const selectedConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.id === selectedConversationId,
      ) ?? null,
    [conversations, selectedConversationId],
  );
  const selectedOfficialConversationId =
    selectedConversation?.groupKind === "OFFICIAL"
      ? selectedConversation.id
      : null;

  const loadOfficialGroupMemberPage = useCallback(
    async (options: {
      search: string;
      cursor: string | null;
      append: boolean;
    }): Promise<void> => {
      if (!accessToken || !selectedOfficialConversationId) {
        return;
      }

      const search = options.search.trim();
      const searchMode = search.length > 0;
      const requestRef = searchMode
        ? officialGroupMemberSearchRequestRef
        : officialGroupMembersRequestRef;
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;

      if (searchMode) {
        if (options.append) {
          setOfficialGroupMemberSearchLoadingMore(true);
        } else {
          setOfficialGroupMemberSearchLoading(true);
          setOfficialGroupMemberSearchResults([]);
          setOfficialGroupMemberSearchCursor(null);
          setOfficialGroupMemberSearchHasMore(false);
        }
        setOfficialGroupMemberSearchError(null);
      } else {
        if (options.append) {
          setOfficialGroupMembersLoadingMore(true);
        } else {
          setOfficialGroupMembersLoading(true);
          setOfficialGroupMemberCursor(null);
          setOfficialGroupMembersHasMore(false);
        }
        setOfficialGroupMembersError(null);
      }

      try {
        const response = await listGroupMembers(
          accessToken,
          selectedOfficialConversationId,
          {
            search: search || undefined,
            cursor: options.cursor,
            limit: 25,
          },
        );

        if (requestRef.current !== requestId) {
          return;
        }

        const mergeMembers = (
          current: MessagingGroupMember[],
          incoming: MessagingGroupMember[],
        ): MessagingGroupMember[] => {
          const byAccountId = new Map(
            current.map((member) => [member.accountId, member]),
          );
          incoming.forEach((member) =>
            byAccountId.set(member.accountId, member),
          );
          return Array.from(byAccountId.values());
        };

        if (searchMode) {
          setOfficialGroupMemberSearchResults((current) =>
            options.append
              ? mergeMembers(current, response.data)
              : response.data,
          );
          setOfficialGroupMemberSearchCursor(response.pagination.nextCursor);
          setOfficialGroupMemberSearchHasMore(response.pagination.hasMore);
        } else {
          setOfficialGroupMembers((current) =>
            options.append
              ? mergeMembers(current, response.data)
              : response.data,
          );
          setOfficialGroupMemberCursor(response.pagination.nextCursor);
          setOfficialGroupMembersHasMore(response.pagination.hasMore);
        }
      } catch (error) {
        if (requestRef.current !== requestId) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : t("feedback.groupMembersLoadError");

        if (searchMode) {
          setOfficialGroupMemberSearchError(message);
        } else {
          setOfficialGroupMembersError(message);
        }
      } finally {
        if (requestRef.current === requestId) {
          if (searchMode) {
            setOfficialGroupMemberSearchLoading(false);
            setOfficialGroupMemberSearchLoadingMore(false);
          } else {
            setOfficialGroupMembersLoading(false);
            setOfficialGroupMembersLoadingMore(false);
          }
        }
      }
    },
    [accessToken, selectedOfficialConversationId, t],
  );

  useEffect(() => {
    if (!selectedOfficialConversationId) {
      officialGroupMembersRequestRef.current += 1;
      officialGroupMemberSearchRequestRef.current += 1;
      setOfficialGroupMembers([]);
      setOfficialGroupMemberCursor(null);
      setOfficialGroupMembersHasMore(false);
      setOfficialGroupMembersLoading(false);
      setOfficialGroupMembersLoadingMore(false);
      setOfficialGroupMembersError(null);
      setOfficialGroupMemberSearchResults([]);
      setOfficialGroupMemberSearchCursor(null);
      setOfficialGroupMemberSearchHasMore(false);
      setOfficialGroupMemberSearchLoading(false);
      setOfficialGroupMemberSearchLoadingMore(false);
      setOfficialGroupMemberSearchError(null);
      return;
    }

    void loadOfficialGroupMemberPage({
      search: "",
      cursor: null,
      append: false,
    });
  }, [
    loadOfficialGroupMemberPage,
    officialGroupMembersRefreshVersion,
    selectedOfficialConversationId,
  ]);

  const normalizedGroupMemberSearch = groupMemberSearch.trim();

  useEffect(() => {
    if (!selectedOfficialConversationId || !normalizedGroupMemberSearch) {
      officialGroupMemberSearchRequestRef.current += 1;
      setOfficialGroupMemberSearchResults([]);
      setOfficialGroupMemberSearchCursor(null);
      setOfficialGroupMemberSearchHasMore(false);
      setOfficialGroupMemberSearchLoading(false);
      setOfficialGroupMemberSearchLoadingMore(false);
      setOfficialGroupMemberSearchError(null);
      return;
    }

    const timer = window.setTimeout(() => {
      void loadOfficialGroupMemberPage({
        search: normalizedGroupMemberSearch,
        cursor: null,
        append: false,
      });
    }, 220);

    return () => window.clearTimeout(timer);
  }, [
    loadOfficialGroupMemberPage,
    normalizedGroupMemberSearch,
    officialGroupMembersRefreshVersion,
    selectedOfficialConversationId,
  ]);

  function loadMoreOfficialGroupMembers(): void {
    if (!selectedOfficialConversationId) {
      return;
    }

    if (normalizedGroupMemberSearch) {
      if (
        !officialGroupMemberSearchHasMore ||
        !officialGroupMemberSearchCursor ||
        officialGroupMemberSearchLoadingMore
      ) {
        return;
      }

      void loadOfficialGroupMemberPage({
        search: normalizedGroupMemberSearch,
        cursor: officialGroupMemberSearchCursor,
        append: true,
      });
      return;
    }

    if (
      !officialGroupMembersHasMore ||
      !officialGroupMemberCursor ||
      officialGroupMembersLoadingMore
    ) {
      return;
    }

    void loadOfficialGroupMemberPage({
      search: "",
      cursor: officialGroupMemberCursor,
      append: true,
    });
  }

  const selectedChatFolder = useMemo(
    () =>
      selectedListId
        ? (chatFolders.find((folder) => folder.id === selectedListId) ?? null)
        : null,
    [chatFolders, selectedListId],
  );
  const conversationHistoryTarget = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.id === conversationHistoryTargetId,
      ) ?? selectedConversation,
    [conversationHistoryTargetId, conversations, selectedConversation],
  );

  const announcementComposerGroup = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.id === announcementComposerGroupId,
      ) ?? null,
    [announcementComposerGroupId, conversations],
  );

  const canManageSelectedAnnouncementGroup = Boolean(
    selectedConversation?.groupKind === "OFFICIAL" &&
    selectedConversation.canManageGroup,
  );
  const destructiveConfirmationSubmitting = Boolean(
    destructiveConfirmation?.kind === "DELETE_MESSAGE_FOR_ME" ||
      destructiveConfirmation?.kind === "DELETE_MESSAGE_FOR_EVERYONE"
      ? messageActionId === destructiveConfirmation.message.id
      : destructiveConfirmation?.kind === "LEAVE_GROUP" ||
          destructiveConfirmation?.kind === "DELETE_GROUP"
        ? groupSubmitting
        : destructiveConfirmation?.kind === "BLOCK_PRIVATE_CONTACT"
          ? blockActionAccountId === destructiveConfirmation.target.accountId
          : false,
  );
  const destructiveConfirmationContent = destructiveConfirmation
    ? destructiveConfirmationCopy(destructiveConfirmation, t)
    : null;

  useMessageModalKeyboardBoundary(
    announcementDetailOpen,
    "announcement-detail",
    closeAnnouncementDetail,
    announcementDetailAction !== null ||
      announcementAttachmentActionId !== null,
  );
  useMessageModalKeyboardBoundary(
    announcementAttachmentViewer !== null,
    "announcement-attachment-viewer",
    closeAnnouncementAttachmentViewer,
  );
  useMessageModalKeyboardBoundary(
    announcementDeleteConfirmationOpen,
    "announcement-delete-confirmation",
    () => setAnnouncementDeleteConfirmationOpen(false),
    announcementDetailAction === "DELETE",
  );
  useMessageModalKeyboardBoundary(
    announcementComposerOpen && announcementComposerGroup !== null,
    "announcement-composer",
    () => void handleAnnouncementComposerCancel(),
    announcementComposerSubmitting !== null,
  );
  useMessageModalKeyboardBoundary(
    pinnedMessageBrowserOpen,
    "pinned-messages",
    closePinnedMessageBrowser,
  );
  useMessageModalKeyboardBoundary(
    forwardingMessage !== null,
    "forward",
    closeForwardDialog,
    forwardSubmitting,
  );
  useMessageModalKeyboardBoundary(
    destructiveConfirmation !== null,
    "destructive-confirmation",
    closeDestructiveConfirmation,
    destructiveConfirmationSubmitting,
  );

  useEffect(() => {
    setGroupDialogMode((current) => {
      if (createGroupMode) {
        return "CREATE";
      }

      return current === "CREATE" ? null : current;
    });
  }, [createGroupMode]);

  // Announcement compose and detail are focused workspace views, not blocking
  // application dialogs.  A rail navigation changes the route, so clear the
  // focused view with it instead of leaving an invisible layer above the next
  // destination.  This keeps every primary navigation item usable at once.
  useEffect(() => {
    if (announcementDetailOpen) {
      closeAnnouncementDetail();
    }

    if (announcementComposerOpen) {
      resetAnnouncementComposer();
    }
    // The pathname is intentional: navigating within a route must dismiss the
    // focused announcement page, while changing a field in the composer must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useLayoutEffect(() => {
    const composer = composerRef.current;

    if (!composer) {
      return;
    }

    // Keep the composer compact for one line and grow only until its scroll limit.
    composer.style.height = "0px";
    const maximumHeight = 128;
    const nextHeight = Math.min(
      maximumHeight,
      Math.max(44, composer.scrollHeight),
    );
    composer.style.height = `${nextHeight}px`;
    composer.style.overflowY =
      composer.scrollHeight > maximumHeight ? "auto" : "hidden";
  }, [editingMessage, messageText, replyingTo, selectedConversationId]);

  const groupInviteUrl = useMemo(
    () => (groupInviteLink ? buildGroupInviteUrl(groupInviteLink.token) : ""),
    [groupInviteLink],
  );

  const activeMentionQuery = useMemo(
    () => getComposerMentionQuery(messageText, composerCaretIndex),
    [composerCaretIndex, messageText],
  );

  useEffect(() => {
    if (
      !accessToken ||
      !selectedOfficialConversationId ||
      !activeMentionQuery ||
      editingMessage
    ) {
      officialMentionRequestRef.current += 1;
      setOfficialMentionSuggestions([]);
      setOfficialMentionCursor(null);
      setOfficialMentionHasMore(false);
      setOfficialMentionLoading(false);
      setOfficialMentionLoadingMore(false);
      setOfficialMentionError(null);
      return;
    }

    const requestId = officialMentionRequestRef.current + 1;
    officialMentionRequestRef.current = requestId;
    setOfficialMentionSuggestions([]);
    setOfficialMentionCursor(null);
    setOfficialMentionHasMore(false);
    setOfficialMentionLoading(true);
    setOfficialMentionLoadingMore(false);
    setOfficialMentionError(null);
    const query = activeMentionQuery.query.trim();
    const timer = window.setTimeout(
      () => {
        void listGroupMembers(accessToken, selectedOfficialConversationId, {
          search: query || undefined,
          limit: 25,
        })
          .then((response) => {
            if (officialMentionRequestRef.current !== requestId) {
              return;
            }

            setOfficialMentionSuggestions(
              response.data.filter(
                (participant) => participant.accountId !== account?.id,
              ),
            );
            setOfficialMentionCursor(response.pagination.nextCursor);
            setOfficialMentionHasMore(response.pagination.hasMore);
            setOfficialMentionError(null);
          })
          .catch(() => {
            if (officialMentionRequestRef.current === requestId) {
              setOfficialMentionSuggestions([]);
              setOfficialMentionCursor(null);
              setOfficialMentionHasMore(false);
              setOfficialMentionError(t("feedback.groupMembersLoadError"));
            }
          })
          .finally(() => {
            if (officialMentionRequestRef.current === requestId) {
              setOfficialMentionLoading(false);
            }
          });
      },
      query ? 160 : 0,
    );

    return () => window.clearTimeout(timer);
  }, [
    accessToken,
    account?.id,
    activeMentionQuery,
    editingMessage,
    selectedOfficialConversationId,
    t,
  ]);

  async function loadMoreOfficialMentionSuggestions(): Promise<void> {
    if (
      !accessToken ||
      !selectedOfficialConversationId ||
      !activeMentionQuery ||
      !officialMentionHasMore ||
      !officialMentionCursor ||
      officialMentionLoadingMore
    ) {
      return;
    }

    const requestId = officialMentionRequestRef.current;
    const query = activeMentionQuery.query.trim();
    setOfficialMentionLoadingMore(true);
    setOfficialMentionError(null);

    try {
      const response = await listGroupMembers(
        accessToken,
        selectedOfficialConversationId,
        {
          search: query || undefined,
          cursor: officialMentionCursor,
          limit: 25,
        },
      );

      if (officialMentionRequestRef.current !== requestId) {
        return;
      }

      setOfficialMentionSuggestions((current) => {
        const byAccountId = new Map(
          current.map((participant) => [participant.accountId, participant]),
        );
        response.data
          .filter((participant) => participant.accountId !== account?.id)
          .forEach((participant) =>
            byAccountId.set(participant.accountId, participant),
          );
        return Array.from(byAccountId.values());
      });
      setOfficialMentionCursor(response.pagination.nextCursor);
      setOfficialMentionHasMore(response.pagination.hasMore);
    } catch {
      if (officialMentionRequestRef.current === requestId) {
        setOfficialMentionError(t("feedback.moreGroupMembersLoadError"));
      }
    } finally {
      if (officialMentionRequestRef.current === requestId) {
        setOfficialMentionLoadingMore(false);
      }
    }
  }

  const mentionSuggestions = useMemo(() => {
    if (
      !activeMentionQuery ||
      !selectedConversation ||
      selectedConversation.type !== "GROUP" ||
      editingMessage
    ) {
      return [];
    }

    if (selectedConversation.groupKind === "OFFICIAL") {
      return officialMentionSuggestions;
    }

    const query = activeMentionQuery.query;

    return selectedConversation.participants
      .filter((participant) => participant.accountId !== account?.id)
      .filter((participant) =>
        query ? mentionSearchText(participant).includes(query) : true,
      );
  }, [
    account?.id,
    activeMentionQuery,
    editingMessage,
    officialMentionSuggestions,
    selectedConversation,
  ]);

  const activeMentionQueryKey = activeMentionQuery
    ? `${activeMentionQuery.startIndex}:${activeMentionQuery.endIndex}:${activeMentionQuery.query}`
    : "";
  const mentionPanelVisible = Boolean(
    !mentionSuggestionsDismissed &&
    activeMentionQuery &&
    selectedConversation?.type === "GROUP" &&
    !editingMessage &&
    (selectedConversation.groupKind === "OFFICIAL" ||
      mentionSuggestions.length > 0),
  );
  const mentionSuggestionsVisible = Boolean(
    mentionPanelVisible && mentionSuggestions.length > 0,
  );
  const activeMentionSuggestion = mentionSuggestionsVisible
    ? (mentionSuggestions[activeMentionSuggestionIndex] ??
      mentionSuggestions[0])
    : null;
  const activeMentionOptionId = activeMentionSuggestion
    ? `message-mention-option-${activeMentionSuggestion.accountId}`
    : undefined;

  useEffect(() => {
    setMentionSuggestionsDismissed(false);
    setActiveMentionSuggestionIndex(0);
  }, [activeMentionQueryKey, selectedConversationId]);

  useEffect(() => {
    setActiveMentionSuggestionIndex((current) =>
      mentionSuggestions.length === 0
        ? 0
        : Math.min(current, mentionSuggestions.length - 1),
    );
  }, [mentionSuggestions.length]);

  useEffect(() => {
    setSelectedComposerMentions([]);
  }, [selectedConversationId]);

  useEffect(() => {
    setSelectedComposerMentions((current) =>
      current.filter((participant) => {
        const pattern = new RegExp(
          `(^|\\s)@${escapeRegExp(participant.displayName)}(?=\\s|$|[.,!?;:])`,
          "i",
        );
        return pattern.test(messageText);
      }),
    );
  }, [messageText]);

  useEffect(() => {
    const handleMessagingSearchShortcut = (
      event: globalThis.KeyboardEvent,
    ): void => {
      if (
        event.altKey ||
        (!event.ctrlKey && !event.metaKey) ||
        event.key.toLowerCase() !== "k"
      ) {
        return;
      }

      const target = event.target;

      // Do not pull focus out of a modal workflow. The shortcut is scoped to
      // the normal messaging workspace where conversation search is visible.
      if (
        target instanceof Element &&
        target.closest('[role="dialog"], .message-attachment-viewer')
      ) {
        return;
      }

      const searchInput = conversationSearchInputRef.current;

      if (!searchInput || searchInput.getClientRects().length === 0) {
        return;
      }

      event.preventDefault();
      searchInput.focus();
      searchInput.select();
    };

    document.addEventListener("keydown", handleMessagingSearchShortcut, true);

    return () => {
      document.removeEventListener(
        "keydown",
        handleMessagingSearchShortcut,
        true,
      );
    };
  }, []);

  useEffect(() => {
    if (!searchPanelOpen) {
      return undefined;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      messageSearchInputRef.current?.focus();
      messageSearchInputRef.current?.select();
    });

    const handleSearchPanelKeyDown = (
      event: globalThis.KeyboardEvent,
    ): void => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      closeMessageSearchPanel();
    };

    document.addEventListener("keydown", handleSearchPanelKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleSearchPanelKeyDown);
    };
  }, [closeMessageSearchPanel, searchPanelOpen]);

  useEffect(() => {
    const requestId = messageSearchRequestIdRef.current + 1;
    messageSearchRequestIdRef.current = requestId;
    const normalizedSearch = searchText.trim();

    if (
      !searchPanelOpen ||
      !accessToken ||
      !selectedConversationId ||
      normalizedSearch.length === 0
    ) {
      setSearchLoading(false);
      setSearchError(null);
      setSearchResults([]);
      return undefined;
    }

    setSearchLoading(true);
    setSearchError(null);

    const timer = window.setTimeout(() => {
      // Conversation search remains backend-authorized. The debounce only keeps
      // the integrated panel responsive while a user is still typing.
      searchConversationMessages(accessToken, selectedConversationId, {
        search: normalizedSearch,
        limit: 25,
      })
        .then((response) => {
          if (messageSearchRequestIdRef.current !== requestId) {
            return;
          }

          setSearchResults(response.data);
        })
        .catch((error) => {
          if (messageSearchRequestIdRef.current !== requestId) {
            return;
          }

          setSearchResults([]);
          setSearchError(
            error instanceof Error ? error.message : t("feedback.searchError"),
          );
        })
        .finally(() => {
          if (messageSearchRequestIdRef.current === requestId) {
            setSearchLoading(false);
          }
        });
    }, 280);

    return () => window.clearTimeout(timer);
  }, [accessToken, searchPanelOpen, searchText, selectedConversationId, t]);

  useEffect(() => {
    // Search is conversation-specific. Never carry results or a query into a
    // different private chat or group where visibility rules may differ.
    messageSearchRequestIdRef.current += 1;
    setSearchPanelOpen(false);
    setSearchText("");
    setSearchResults([]);
    setSearchLoading(false);
    setSearchError(null);
  }, [selectedConversationId]);

  useEffect(() => {
    if (
      !searchPanelOpen ||
      (!announcementMode &&
        !requestMode &&
        !starredMode &&
        !notificationMode &&
        !settingsMode &&
        !ownProfileMode &&
        !newConversationMode &&
        !createGroupMode)
    ) {
      return;
    }

    closeMessageSearchPanel();
  }, [
    announcementMode,
    closeMessageSearchPanel,
    createGroupMode,
    newConversationMode,
    notificationMode,
    ownProfileMode,
    requestMode,
    searchPanelOpen,
    settingsMode,
    starredMode,
  ]);

  useEffect(() => {
    selectedAttachmentsRef.current = selectedAttachments;
  }, [selectedAttachments]);

  useEffect(() => {
    return () => {
      selectedAttachmentsRef.current.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
    };
  }, []);

  useEffect(() => {
    return () => {
      clearVoiceRecordingTimer();

      if (voiceRecorderRef.current?.state === "recording") {
        // Avoid saving a half-recorded voice note when the page is closed.
        voiceRecordingCancelledRef.current = true;
        voiceRecorderRef.current.stop();
        return;
      }

      stopVoiceRecorderStream();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (attachmentViewer?.objectUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(attachmentViewer.objectUrl);
      }
    };
  }, [attachmentViewer]);

  useEffect(() => {
    return () => {
      if (announcementAttachmentViewer?.objectUrl) {
        URL.revokeObjectURL(announcementAttachmentViewer.objectUrl);
      }
    };
  }, [announcementAttachmentViewer]);

  useEffect(() => {
    if (!announcementAttachmentViewer) {
      return undefined;
    }

    document.body.classList.add("message-attachment-viewer-open");

    return () => {
      document.body.classList.remove("message-attachment-viewer-open");
    };
  }, [announcementAttachmentViewer]);

  useEffect(() => {
    if (!attachmentViewer) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      const dialog = attachmentViewerDialogRef.current;
      const preferredFocus = dialog?.querySelector<HTMLElement>(
        '[data-message-media-viewer-close="true"]',
      );

      (preferredFocus ?? dialog)?.focus();
    });

    function handleViewerKeyboard(event: globalThis.KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeAttachmentViewer();
        return;
      }

      if (event.key !== "Tab" || !attachmentViewerDialogRef.current) {
        return;
      }

      const focusable = keyboardFocusableElements(
        attachmentViewerDialogRef.current,
      );

      if (focusable.length === 0) {
        event.preventDefault();
        attachmentViewerDialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.body.classList.add("message-attachment-viewer-open");
    window.addEventListener("keydown", handleViewerKeyboard);

    return () => {
      window.cancelAnimationFrame(frameId);
      document.body.classList.remove("message-attachment-viewer-open");
      window.removeEventListener("keydown", handleViewerKeyboard);
    };
  }, [attachmentViewer]);

  useEffect(() => {
    if (!settingsMode && storageUsageScope) {
      closeStorageUsage();
    }
  }, [settingsMode, storageUsageScope]);

  useEffect(() => {
    if (!accessToken || !account?.id) {
      setOwnProfileAccount(null);
      return;
    }

    let cancelled = false;

    // Load the signed-in user's protected profile once so the navigation avatar
    // is available even before their own profile dialog is opened.
    void getMyMessagingProfile(accessToken)
      .then((response) => {
        if (!cancelled) {
          setOwnProfileAccount(response.data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOwnProfileAccount(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, account?.id]);

  useEffect(() => {
    if (!accessToken || !profileAccountId) {
      setProfileData(null);
      setProfileBioDraft("");
      return;
    }

    let cancelled = false;
    setProfileLoading(true);
    setProfileError(null);

    const request =
      profileAccountId === account?.id
        ? getMyMessagingProfile(accessToken)
        : getMessagingProfile(accessToken, profileAccountId);

    void request
      .then((response) => {
        if (cancelled) {
          return;
        }

        setProfileData(response.data);
        setProfileBioDraft(response.data.profileBio ?? "");

        if (response.data.isOwnProfile) {
          setOwnProfileAccount(response.data);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setProfileError(
          error instanceof Error
            ? error.message
            : t("feedback.profileLoadError"),
        );
      })
      .finally(() => {
        if (!cancelled) {
          setProfileLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, account?.id, profileAccountId, t]);

  useEffect(() => {
    if (!accessToken || !profileData?.profilePhotoKey) {
      setProfilePhotoUrl(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    // Profile photos stay protected behind the API instead of using public image URLs.
    void createMessagingProfilePhotoObjectUrl(
      accessToken,
      profileData.accountId,
    )
      .then((url) => {
        objectUrl = url;

        if (!cancelled) {
          setProfilePhotoUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfilePhotoUrl(null);
        }
      });

    return () => {
      cancelled = true;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [
    accessToken,
    profileData?.accountId,
    profileData?.profilePhotoKey,
    profilePhotoRefreshKey,
  ]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const visibleAccounts = new Map<string, MessagingAccount>();
    const collectAccount = (candidate?: MessagingAccount | null) => {
      if (candidate) {
        visibleAccounts.set(candidate.accountId, candidate);
      }
    };

    // Keep one protected avatar cache for every account rendered anywhere in
    // the messaging workspace. A changed photo key refreshes all occurrences.
    conversations.forEach((conversation) => {
      conversation.participants.forEach(collectAccount);
    });
    messages.forEach((message) => {
      collectAccount(message.sender);
      collectAccount(message.replyTo?.sender ?? null);
      message.reactions.forEach((reaction) =>
        collectAccount(reaction.account ?? null),
      );
    });
    contacts.forEach(collectAccount);
    blockedAccounts.forEach((block) => collectAccount(block.account));
    searchResults.forEach((result) => collectAccount(result.message.sender));
    messageRequests.received.forEach((request) => collectAccount(request.peer));
    messageRequests.sent.forEach((request) => collectAccount(request.peer));
    if (messageInformation) {
      const visibleReadRecipients = messageInformation.recipients
        .filter((recipient) => Boolean(recipient.readAt))
        .slice(0, messageInformationVisibleReadCount);
      const visibleDeliveredRecipients = messageInformation.recipients
        .filter(
          (recipient) => !recipient.readAt && Boolean(recipient.deliveredAt),
        )
        .slice(0, messageInformationVisibleDeliveredCount);

      [...visibleReadRecipients, ...visibleDeliveredRecipients].forEach(
        (recipient) => collectAccount(recipient.account),
      );
    }
    collectAccount(profileData);
    collectAccount(ownProfileAccount);

    const changedAccounts = [...visibleAccounts.values()].filter(
      (candidate) => {
        const nextKey = candidate.profilePhotoKey ?? "";
        const cachedKey = profilePhotoCacheKeys[candidate.accountId] ?? "";
        const cachedUrl = profilePhotoUrls[candidate.accountId];

        return cachedKey !== nextKey || Boolean(!nextKey && cachedUrl);
      },
    );

    if (changedAccounts.length === 0) {
      return;
    }

    const removedPhotoAccountIds = changedAccounts
      .filter((candidate) => !candidate.profilePhotoKey)
      .map((candidate) => candidate.accountId);

    if (removedPhotoAccountIds.length > 0) {
      setProfilePhotoUrls((current) => {
        const next = { ...current };

        for (const accountId of removedPhotoAccountIds) {
          if (next[accountId]) {
            URL.revokeObjectURL(next[accountId]);
          }
          delete next[accountId];
        }

        return next;
      });

      setProfilePhotoCacheKeys((current) => {
        const next = { ...current };
        removedPhotoAccountIds.forEach((accountId) => delete next[accountId]);
        return next;
      });
    }

    const accountsToLoad = changedAccounts.filter(
      (
        candidate,
      ): candidate is MessagingAccount & { profilePhotoKey: string } =>
        Boolean(candidate.profilePhotoKey),
    );

    if (accountsToLoad.length === 0) {
      return;
    }

    let cancelled = false;
    const loadedUrls: string[] = [];

    void Promise.all(
      accountsToLoad.map(async (candidate) => {
        try {
          const url = await createMessagingProfilePhotoObjectUrl(
            accessToken,
            candidate.accountId,
          );

          if (!url) {
            // Valid accounts without custom photos keep the initials fallback.
            return [
              candidate.accountId,
              candidate.profilePhotoKey,
              null,
            ] as const;
          }

          loadedUrls.push(url);
          return [candidate.accountId, candidate.profilePhotoKey, url] as const;
        } catch {
          // Cache the attempted key so an unavailable protected photo does not
          // trigger a request on every unrelated render.
          return [
            candidate.accountId,
            candidate.profilePhotoKey,
            null,
          ] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) {
        loadedUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      setProfilePhotoCacheKeys((current) => ({
        ...current,
        ...Object.fromEntries(
          entries.map(([accountId, photoKey]) => [accountId, photoKey]),
        ),
      }));

      const successfulEntries = entries.filter(
        (entry): entry is readonly [string, string, string] =>
          Boolean(entry[2]),
      );

      if (successfulEntries.length === 0) {
        return;
      }

      setProfilePhotoUrls((current) => {
        const next = { ...current };

        for (const [accountId, , url] of successfulEntries) {
          if (next[accountId] && next[accountId] !== url) {
            URL.revokeObjectURL(next[accountId]);
          }
          next[accountId] = url;
        }

        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    blockedAccounts,
    contacts,
    conversations,
    messageInformation,
    messageInformationVisibleDeliveredCount,
    messageInformationVisibleReadCount,
    messageRequests,
    messages,
    ownProfileAccount,
    profileData,
    profilePhotoCacheKeys,
    profilePhotoRefreshKey,
    profilePhotoUrls,
    searchResults,
  ]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const groupsToLoad = conversations.filter(
      (conversation) =>
        conversation.type === "GROUP" &&
        conversation.groupPhotoKey &&
        groupPhotoCacheKeys[conversation.id] !== conversation.groupPhotoKey,
    );

    if (groupsToLoad.length === 0) {
      return;
    }

    let cancelled = false;
    const loadedUrls: string[] = [];

    void Promise.all(
      groupsToLoad.map(async (conversation) => {
        try {
          const url = await createGroupPhotoObjectUrl(
            accessToken,
            conversation.id,
          );
          loadedUrls.push(url);
          return [
            conversation.id,
            conversation.groupPhotoKey as string,
            url,
          ] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) {
        loadedUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      const nextEntries = entries.filter(
        (entry): entry is readonly [string, string, string] => Boolean(entry),
      );

      if (nextEntries.length === 0) {
        return;
      }

      setGroupPhotoUrls((current) => {
        const next = { ...current };

        for (const [conversationId, , url] of nextEntries) {
          if (next[conversationId]) {
            URL.revokeObjectURL(next[conversationId]);
          }

          next[conversationId] = url;
        }

        return next;
      });

      setGroupPhotoCacheKeys((current) => ({
        ...current,
        ...Object.fromEntries(
          nextEntries.map(([conversationId, photoKey]) => [
            conversationId,
            photoKey,
          ]),
        ),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, conversations, groupPhotoCacheKeys]);

  useEffect(() => {
    profilePhotoUrlsRef.current = profilePhotoUrls;
  }, [profilePhotoUrls]);

  useEffect(() => {
    groupPhotoUrlsRef.current = groupPhotoUrls;
  }, [groupPhotoUrls]);

  useEffect(
    () => () => {
      Object.values(profilePhotoUrlsRef.current).forEach((url) =>
        URL.revokeObjectURL(url),
      );
      Object.values(groupPhotoUrlsRef.current).forEach((url) =>
        URL.revokeObjectURL(url),
      );
    },
    [],
  );

  const canCreateOfficialGroup = officialGroupCanCreate;

  const selectedOfficialGroupScope = useMemo(
    () =>
      officialGroupScopes.find(
        (scope) => scope.key === officialGroupScopeKey,
      ) ?? null,
    [officialGroupScopeKey, officialGroupScopes],
  );

  const officialGroupConversations = useMemo(
    () =>
      conversations.filter(
        (conversation) =>
          conversation.type === "GROUP" &&
          conversation.groupKind === "OFFICIAL",
      ),
    [conversations],
  );

  const filteredConversations = useMemo(() => {
    if (announcementMode) {
      return officialGroupConversations;
    }

    if (listMode) {
      return conversations;
    }

    return conversations.filter(
      (conversation) =>
        conversationCategory === "ALL" ||
        (conversationCategory === "UNREAD" && conversation.unreadCount > 0) ||
        (conversationCategory === "GROUPS" &&
          conversation.type === "GROUP" &&
          conversation.groupKind !== "OFFICIAL") ||
        (conversationCategory === "OFFICIAL" &&
          conversation.groupKind === "OFFICIAL"),
    );
  }, [
    announcementMode,
    conversationCategory,
    conversations,
    listMode,
    officialGroupConversations,
  ]);

  const conversationSearchResults = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();

    if (!query) {
      return {
        directChats: [] as MessagingConversation[],
        groupsInCommon: [] as Array<{
          conversation: MessagingConversation;
          matchedDisplayName: string | null;
        }>,
      };
    }

    const accountMatches = (participant: MessagingAccount): boolean =>
      [
        participant.displayName,
        participant.username,
        participant.employee?.empId,
        participant.employee?.designation,
        employeeOrgContextLabel(participant.employee, null),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);

    const directChats = conversations.filter((conversation) => {
      if (conversation.type !== "PRIVATE") {
        return false;
      }

      const peer = conversation.participants.find(
        (participant) => participant.accountId !== account?.id,
      );

      return Boolean(peer && accountMatches(peer));
    });

    const groupsInCommon = conversations.flatMap((conversation) => {
      if (conversation.type !== "GROUP") {
        return [];
      }

      const matchingParticipant = conversation.participants.find(
        (participant) =>
          participant.accountId !== account?.id && accountMatches(participant),
      );
      const groupMatches = [conversation.title, conversation.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);

      if (!matchingParticipant && !groupMatches) {
        return [];
      }

      return [
        {
          conversation,
          matchedDisplayName: matchingParticipant?.displayName ?? null,
        },
      ];
    });

    return { directChats, groupsInCommon };
  }, [account?.id, conversationSearch, conversations]);

  const filteredListCandidateConversations = useMemo(() => {
    const query = listCandidateSearch.trim().toLowerCase();

    if (!query) {
      return listCandidateConversations;
    }

    return listCandidateConversations.filter((conversation) => {
      const participantText = conversation.participants
        .map((participant) =>
          [
            participant.displayName,
            participant.username,
            participant.employee?.empId,
            participant.employee?.designation,
            employeeOrgContextLabel(participant.employee, null),
          ]
            .filter(Boolean)
            .join(" "),
        )
        .join(" ");

      return [
        conversation.title,
        conversation.description,
        participantText,
        conversation.groupKind === "OFFICIAL" ? "official group" : null,
        conversation.type === "PRIVATE" ? "private chat" : "group",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [listCandidateConversations, listCandidateSearch]);

  const announcementGroupSearchResults = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();

    if (!query) {
      return officialGroupConversations;
    }

    return officialGroupConversations.filter((conversation) =>
      [
        conversation.title,
        conversation.description,
        officialScopeLabel(conversation, t),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [conversationSearch, officialGroupConversations, t]);

  const filteredStarredItems = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();

    if (!query) {
      return starredItems;
    }

    return starredItems.filter((item) =>
      [
        item.conversation.title,
        item.message.sender.displayName,
        starredMessagePreview(item, t),
        ...(item.message.attachments ?? []).map(
          (attachment) => attachment.originalFileName,
        ),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [conversationSearch, starredItems, t]);

  const requestItems = useMemo(
    () =>
      requestListView === "RECEIVED"
        ? messageRequests.received
        : messageRequests.sent,
    [messageRequests.received, messageRequests.sent, requestListView],
  );

  const filteredRequestItems = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();

    if (!query) {
      return requestItems;
    }

    return requestItems.filter((request) =>
      [
        request.peer.displayName,
        request.peer.username,
        request.peer.employee?.empId,
        request.peer.employee?.designation,
        employeeOrgContextLabel(request.peer.employee, null),
        requestReasonLabel(request.reason, t),
        requestStatusLabel(request, t),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [conversationSearch, requestItems, t]);

  const filteredNotifications = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();

    return notifications.filter((notification) => {
      if (notificationListView === "UNREAD" && notification.isRead) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [notification.title, notification.body, notification.type]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [conversationSearch, notificationListView, notifications]);

  const selectedMessageRequest = useMemo(
    () =>
      [...messageRequests.received, ...messageRequests.sent].find(
        (request) => request.id === selectedRequestId,
      ) ?? null,
    [messageRequests.received, messageRequests.sent, selectedRequestId],
  );

  const conversationSearchResultCount = announcementMode
    ? announcementGroupSearchResults.length
    : starredMode
      ? filteredStarredItems.length
      : requestMode
        ? filteredRequestItems.length
        : notificationMode
          ? filteredNotifications.length
          : settingsMode
            ? SETTINGS_TABS.length
            : conversationSearchResults.directChats.length +
              conversationSearchResults.groupsInCommon.length;

  const displayMessages = useMemo(() => messages, [messages]);
  const visiblePinnedMessages = useMemo(
    () =>
      pinnedMessages.filter(
        (message) =>
          !message.isDeleted &&
          message.conversationId === selectedConversationId,
      ),
    [pinnedMessages, selectedConversationId],
  );
  const normalizedPinnedMessageIndex =
    visiblePinnedMessages.length === 0
      ? 0
      : Math.min(activePinnedMessageIndex, visiblePinnedMessages.length - 1);
  const activePinnedMessage =
    visiblePinnedMessages[normalizedPinnedMessageIndex] ?? null;

  useEffect(() => {
    messageIdsRef.current = new Set(messages.map((message) => message.id));
  }, [messages]);

  useEffect(() => {
    setActivePinnedMessageIndex((current) =>
      visiblePinnedMessages.length === 0
        ? 0
        : Math.min(current, visiblePinnedMessages.length - 1),
    );

    if (visiblePinnedMessages.length === 0) {
      setPinnedMessageBrowserOpen(false);
    }
  }, [selectedConversationId, visiblePinnedMessages.length]);

  const filteredForwardConversations = useMemo(() => {
    const search = forwardSearch.trim().toLowerCase();
    const source = listMode ? listCandidateConversations : conversations;

    if (!search) {
      return source;
    }

    return source.filter((conversation) => {
      const participantText = conversation.participants
        .map((participant) =>
          [
            participant.displayName,
            participant.username,
            participant.employee?.empId,
            participant.employee?.designation,
          ]
            .filter(Boolean)
            .join(" "),
        )
        .join(" ");

      return [conversation.title, participantText]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [conversations, forwardSearch, listCandidateConversations, listMode]);

  const totalUnread = useMemo(
    () =>
      conversations.reduce(
        (total, conversation) => total + conversation.unreadCount,
        0,
      ),
    [conversations],
  );

  const loadConversations = useCallback(
    async (silent = false, preferredConversationId?: string): Promise<void> => {
      if (!accessToken) {
        return;
      }

      if (!silent) {
        setConversationLoading(true);
      }

      try {
        const response = await listMessagingConversations(
          accessToken,
          undefined,
          100,
          listMode ? "ALL" : conversationListView,
          listMode ? (selectedListId ?? undefined) : undefined,
        );
        const preservePreferredConversation =
          silent && preferredConversationId !== undefined;

        setConversations((current) => {
          if (!preservePreferredConversation || !preferredConversationId) {
            return response.data;
          }

          if (
            response.data.some(
              (conversation) => conversation.id === preferredConversationId,
            )
          ) {
            return response.data;
          }

          const currentPreferredConversation = current.find(
            (conversation) => conversation.id === preferredConversationId,
          );

          return currentPreferredConversation
            ? [...response.data, currentPreferredConversation]
            : response.data;
        });
        setConversationNextCursor(response.pagination.nextCursor);
        setConversationHasMore(response.pagination.hasMore);
        setPageError(null);

        setSelectedConversationId((current) => {
          const candidate = preferredConversationId ?? current;

          if (
            candidate &&
            response.data.some((conversation) => conversation.id === candidate)
          ) {
            return candidate;
          }

          if (
            preservePreferredConversation &&
            candidate === preferredConversationId
          ) {
            return candidate;
          }

          return null;
        });
      } catch (error) {
        if (!silent) {
          setPageError(
            error instanceof Error
              ? error.message
              : t("feedback.conversationsLoadError"),
          );
        }
      } finally {
        if (!silent) {
          setConversationLoading(false);
        }
      }
    },
    [accessToken, conversationListView, listMode, selectedListId, t],
  );

  const loadMoreConversations = useCallback(async (): Promise<void> => {
    if (
      !accessToken ||
      !conversationHasMore ||
      !conversationNextCursor ||
      conversationLoadingMore
    ) {
      return;
    }

    setConversationLoadingMore(true);

    try {
      const response = await listMessagingConversations(
        accessToken,
        conversationNextCursor,
        100,
        listMode ? "ALL" : conversationListView,
        listMode ? (selectedListId ?? undefined) : undefined,
      );

      setConversations((current) => {
        const next = [...current];
        const indexByConversationId = new Map(
          current.map((conversation, index) => [conversation.id, index]),
        );

        for (const conversation of response.data) {
          const existingIndex = indexByConversationId.get(conversation.id);

          if (existingIndex === undefined) {
            indexByConversationId.set(conversation.id, next.length);
            next.push(conversation);
          } else {
            next[existingIndex] = conversation;
          }
        }

        return next.sort((first, second) => {
          if (first.isPinned !== second.isPinned) {
            return first.isPinned ? -1 : 1;
          }

          const updatedAtDifference =
            new Date(second.updatedAt).getTime() -
            new Date(first.updatedAt).getTime();

          if (updatedAtDifference !== 0) {
            return updatedAtDifference;
          }

          return second.id.localeCompare(first.id);
        });
      });
      setConversationNextCursor(response.pagination.nextCursor);
      setConversationHasMore(response.pagination.hasMore);
      setPageError(null);
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : t("feedback.moreConversationsLoadError"),
      );
    } finally {
      setConversationLoadingMore(false);
    }
  }, [
    accessToken,
    conversationHasMore,
    conversationListView,
    conversationLoadingMore,
    conversationNextCursor,
    listMode,
    selectedListId,
    t,
  ]);

  const loadChatFolders = useCallback(
    async (silent = false): Promise<void> => {
      if (!accessToken) {
        setChatFolders([]);
        return;
      }

      if (!silent) {
        setChatFoldersLoading(true);
      }

      try {
        const response = await listChatFolders(accessToken);
        setChatFolders(response.data);
        setChatFoldersError(null);
      } catch (error) {
        if (!silent) {
          setChatFoldersError(
            error instanceof Error
              ? error.message
              : t("feedback.listsLoadError"),
          );
        }
      } finally {
        if (!silent) {
          setChatFoldersLoading(false);
        }
      }
    },
    [accessToken, t],
  );

  const loadListCandidateConversations = useCallback(
    async (
      errorTarget: "workspace" | "forward" = "workspace",
    ): Promise<void> => {
      if (!accessToken) {
        setListCandidateConversations([]);
        return;
      }

      setListCandidatesLoading(true);

      try {
        const collected: MessagingConversation[] = [];
        const seenConversationIds = new Set<string>();
        const seenCursors = new Set<string>();
        let cursor: string | undefined;

        do {
          const response = await listMessagingConversations(
            accessToken,
            cursor,
            100,
            "ALL",
          );

          response.data.forEach((conversation) => {
            if (!seenConversationIds.has(conversation.id)) {
              seenConversationIds.add(conversation.id);
              collected.push(conversation);
            }
          });

          const nextCursor = response.pagination.nextCursor ?? undefined;

          if (
            !response.pagination.hasMore ||
            !nextCursor ||
            seenCursors.has(nextCursor)
          ) {
            cursor = undefined;
          } else {
            seenCursors.add(nextCursor);
            cursor = nextCursor;
          }
        } while (cursor);

        setListCandidateConversations(collected);

        if (errorTarget === "forward") {
          setForwardDestinationError(null);
        } else {
          setListWorkspaceError(null);
        }
      } catch (error) {
        setListCandidateConversations([]);

        const errorMessage =
          error instanceof Error
            ? error.message
            : t("feedback.listConversationsLoadError");

        if (errorTarget === "forward") {
          setForwardDestinationError(errorMessage);
        } else {
          setListWorkspaceError(errorMessage);
        }
      } finally {
        setListCandidatesLoading(false);
      }
    },
    [accessToken, t],
  );

  const loadSelectedGroupAnnouncements = useCallback(
    async (officialConversationId: string, silent = false): Promise<void> => {
      if (!accessToken) {
        setAnnouncementItems([]);
        return;
      }

      const requestId = announcementLoadRequestRef.current + 1;
      announcementLoadRequestRef.current = requestId;

      if (!silent) {
        setAnnouncementLoading(true);
      }

      try {
        const response = await listAnnouncements(accessToken, {
          filter: "ALL",
          officialConversationId,
          limit: 100,
        });

        if (requestId !== announcementLoadRequestRef.current) {
          return;
        }

        setAnnouncementItems(response.data);
        setAnnouncementError(null);
      } catch (error) {
        if (requestId !== announcementLoadRequestRef.current) {
          return;
        }

        setAnnouncementItems([]);
        setAnnouncementError(
          error instanceof Error
            ? error.message
            : t("feedback.announcementLoadError"),
        );
      } finally {
        if (!silent && requestId === announcementLoadRequestRef.current) {
          setAnnouncementLoading(false);
        }
      }
    },
    [accessToken, t],
  );

  function resetAnnouncementComposer(): void {
    setAnnouncementComposerOpen(false);
    setAnnouncementComposerMode("CREATE");
    setAnnouncementComposerGroupId(null);
    setAnnouncementComposerAnnouncementId(null);
    setAnnouncementComposerStatus(null);
    setAnnouncementComposerValues(createAnnouncementComposerValues());
    setAnnouncementAudienceOptions(null);
    setAnnouncementComposerExistingAttachments([]);
    setAnnouncementComposerRemovedAttachmentIds([]);
    setAnnouncementComposerPendingAttachments([]);
    setAnnouncementComposerError(null);
    setAnnouncementComposerSubmitting(null);
  }

  function openAnnouncementComposer(): void {
    if (!selectedConversation || !canManageSelectedAnnouncementGroup) {
      return;
    }

    setAnnouncementComposerMode("CREATE");
    setAnnouncementComposerGroupId(selectedConversation.id);
    setAnnouncementComposerAnnouncementId(null);
    setAnnouncementComposerStatus(null);
    setAnnouncementComposerValues({
      ...createAnnouncementComposerValues(),
      audienceType: "OFFICIAL_GROUP",
      officialConversationId: selectedConversation.id,
    });
    setAnnouncementAudienceOptions(null);
    setAnnouncementComposerExistingAttachments([]);
    setAnnouncementComposerRemovedAttachmentIds([]);
    setAnnouncementComposerPendingAttachments([]);
    setAnnouncementComposerError(null);
    setAnnouncementComposerOpen(true);
  }

  async function openAnnouncementDetail(
    announcementId: string,
    requestDelete = false,
  ): Promise<void> {
    if (!accessToken) {
      return;
    }

    const requestId = announcementDetailRequestRef.current + 1;
    announcementDetailRequestRef.current = requestId;
    setAnnouncementDetailOpen(true);
    setAnnouncementDetailLoading(true);
    setAnnouncementDetailError(null);
    setAnnouncementDeleteConfirmationOpen(false);

    try {
      const response = await getAnnouncement(accessToken, announcementId);
      if (requestId !== announcementDetailRequestRef.current) {
        return;
      }

      setAnnouncementDetail(response.data);
      setAnnouncementDeleteConfirmationOpen(
        requestDelete &&
          response.data.canDelete &&
          isAnnouncementDeletable(response.data.status),
      );

      if (
        response.data.status === "PUBLISHED" &&
        response.data.viewerState &&
        !response.data.viewerState.isRead
      ) {
        try {
          const readResponse = await markAnnouncementRead(
            accessToken,
            announcementId,
          );
          if (requestId !== announcementDetailRequestRef.current) {
            return;
          }

          setAnnouncementDetail((current) =>
            current?.id === announcementId && current.viewerState
              ? {
                  ...current,
                  viewerState: {
                    ...current.viewerState,
                    isRead: true,
                    readRevision: readResponse.data.readRevision,
                    firstReadAt:
                      current.viewerState.firstReadAt ??
                      readResponse.data.readAt,
                  },
                }
              : current,
          );
          setAnnouncementItems((current) =>
            current.map((item) =>
              item.id === announcementId && item.viewerState
                ? {
                    ...item,
                    viewerState: {
                      ...item.viewerState,
                      isRead: true,
                      readRevision: readResponse.data.readRevision,
                      firstReadAt:
                        item.viewerState.firstReadAt ??
                        readResponse.data.readAt,
                    },
                  }
                : item,
            ),
          );
        } catch {
          // Reading remains useful even if the non-destructive receipt update must be retried.
        }
      }
    } catch (error) {
      if (requestId === announcementDetailRequestRef.current) {
        setAnnouncementDetail(null);
        setAnnouncementDetailError(
          error instanceof Error
            ? error.message
            : t("feedback.announcementDetailLoadError"),
        );
      }
    } finally {
      if (requestId === announcementDetailRequestRef.current) {
        setAnnouncementDetailLoading(false);
      }
    }
  }

  function closeAnnouncementDetail(): void {
    announcementDetailRequestRef.current += 1;
    setAnnouncementDetailOpen(false);
    setAnnouncementDetail(null);
    setAnnouncementDetailLoading(false);
    setAnnouncementDetailError(null);
    setAnnouncementDeleteConfirmationOpen(false);
    setAnnouncementDetailAction(null);
    setAnnouncementAttachmentActionId(null);
  }

  async function openAnnouncementEditor(announcementId: string): Promise<void> {
    if (
      !accessToken ||
      !selectedConversation ||
      !canManageSelectedAnnouncementGroup
    ) {
      return;
    }

    try {
      const detail =
        announcementDetail?.id === announcementId
          ? announcementDetail
          : (await getAnnouncement(accessToken, announcementId)).data;

      if (!detail.canEdit || !isAnnouncementEditable(detail.status)) {
        throw new Error(t("feedback.announcementEditStateError"));
      }

      if (detail.audience.officialGroup?.id !== selectedConversation.id) {
        throw new Error(t("feedback.announcementWrongGroupError"));
      }

      setAnnouncementComposerMode("EDIT");
      setAnnouncementComposerGroupId(selectedConversation.id);
      setAnnouncementComposerAnnouncementId(detail.id);
      setAnnouncementComposerStatus(detail.status);
      setAnnouncementComposerValues(announcementDetailToComposerValues(detail));
      setAnnouncementComposerExistingAttachments(detail.attachments);
      setAnnouncementComposerRemovedAttachmentIds([]);
      setAnnouncementComposerPendingAttachments([]);
      setAnnouncementComposerError(null);
      setAnnouncementDetailOpen(false);
      setAnnouncementDeleteConfirmationOpen(false);
      setAnnouncementComposerOpen(true);
    } catch (error) {
      setAnnouncementDetailOpen(true);
      setAnnouncementDetailError(
        error instanceof Error
          ? error.message
          : t("feedback.announcementPrepareEditError"),
      );
    }
  }

  function handleAnnouncementAttachmentSelection(
    event: ChangeEvent<HTMLInputElement>,
    category: AnnouncementAttachmentCategory,
  ): void {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) {
      return;
    }

    const maximumBytes =
      category === "IMAGE"
        ? 20 * 1024 * 1024
        : category === "VIDEO"
          ? 200 * 1024 * 1024
          : 50 * 1024 * 1024;
    const invalidFile = files.find(
      (file) => file.size <= 0 || file.size > maximumBytes,
    );
    if (invalidFile) {
      setAnnouncementComposerError(
        `${invalidFile.name} is empty or exceeds the ${formatFileSize(maximumBytes)} ${category.toLowerCase()} limit.`,
      );
      return;
    }

    setAnnouncementComposerError(null);
    setAnnouncementComposerPendingAttachments((current) => [
      ...current,
      ...files.map((file) => ({
        clientId: createAnnouncementAttachmentClientId(file),
        file,
        category,
        progressPercent: 0,
        status: "READY" as const,
        serverAttachmentId: null,
        error: null,
      })),
    ]);
  }

  async function removePendingAnnouncementAttachment(
    clientId: string,
  ): Promise<void> {
    const pending = announcementComposerPendingAttachments.find(
      (attachment) => attachment.clientId === clientId,
    );
    if (!pending) {
      return;
    }

    if (
      pending.serverAttachmentId &&
      announcementComposerAnnouncementId &&
      accessToken
    ) {
      setAnnouncementComposerPendingAttachments((current) =>
        current.map((attachment) =>
          attachment.clientId === clientId
            ? { ...attachment, status: "REMOVING", error: null }
            : attachment,
        ),
      );
      try {
        await removeAnnouncementAttachment(
          accessToken,
          announcementComposerAnnouncementId,
          pending.serverAttachmentId,
        );
      } catch (error) {
        setAnnouncementComposerPendingAttachments((current) =>
          current.map((attachment) =>
            attachment.clientId === clientId
              ? {
                  ...attachment,
                  status: "ERROR",
                  error:
                    error instanceof Error
                      ? error.message
                      : t("feedback.attachmentRemoveError"),
                }
              : attachment,
          ),
        );
        return;
      }
    }

    setAnnouncementComposerPendingAttachments((current) =>
      current.filter((attachment) => attachment.clientId !== clientId),
    );
  }

  async function uploadQueuedAnnouncementAttachments(
    announcementId: string,
  ): Promise<void> {
    if (!accessToken) {
      throw new Error(t("feedback.announcementUploadSessionError"));
    }

    for (const pending of announcementComposerPendingAttachments) {
      if (pending.status === "UPLOADED") {
        continue;
      }

      setAnnouncementComposerPendingAttachments((current) =>
        current.map((attachment) =>
          attachment.clientId === pending.clientId
            ? {
                ...attachment,
                status: "UPLOADING",
                progressPercent: 0,
                error: null,
              }
            : attachment,
        ),
      );

      try {
        const response = await uploadAnnouncementAttachment(
          accessToken,
          announcementId,
          pending.file,
          (progress) =>
            setAnnouncementComposerPendingAttachments((current) =>
              current.map((attachment) =>
                attachment.clientId === pending.clientId
                  ? { ...attachment, progressPercent: progress.progressPercent }
                  : attachment,
              ),
            ),
        );
        if (!response.data) {
          throw new Error(t("feedback.announcementUploadRecordError"));
        }
        setAnnouncementComposerPendingAttachments((current) =>
          current.map((attachment) =>
            attachment.clientId === pending.clientId
              ? {
                  ...attachment,
                  status: "UPLOADED",
                  progressPercent: 100,
                  serverAttachmentId: response.data?.id ?? null,
                  error: null,
                }
              : attachment,
          ),
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("feedback.announcementAttachmentUploadError");
        setAnnouncementComposerPendingAttachments((current) =>
          current.map((attachment) =>
            attachment.clientId === pending.clientId
              ? { ...attachment, status: "ERROR", error: message }
              : attachment,
          ),
        );
        throw new Error(`${pending.file.name}: ${message}`, { cause: error });
      }
    }
  }

  function buildAnnouncementComposerInput(): CreateAnnouncementInput {
    const title = announcementComposerValues.title.trim();
    const body = announcementComposerValues.body.trim();

    if (title.length < 5) {
      throw new Error(t("feedback.announcementTitleMin"));
    }

    if (!body) {
      throw new Error(t("feedback.announcementMessageRequired"));
    }

    const now = Date.now();
    let scheduledAt: string | null = null;

    if (announcementComposerValues.publishTiming === "SCHEDULE") {
      if (!announcementComposerValues.scheduledAt) {
        throw new Error(t("feedback.announcementFutureSchedule"));
      }

      const scheduledDate = new Date(announcementComposerValues.scheduledAt);
      if (
        Number.isNaN(scheduledDate.getTime()) ||
        scheduledDate.getTime() <= now
      ) {
        throw new Error(t("feedback.announcementScheduleFuture"));
      }
      scheduledAt = scheduledDate.toISOString();
    }

    let expiresAt: string | null = null;
    if (announcementComposerValues.expiresAt) {
      const expiryDate = new Date(announcementComposerValues.expiresAt);
      const publicationTime = scheduledAt
        ? new Date(scheduledAt).getTime()
        : now;

      if (
        Number.isNaN(expiryDate.getTime()) ||
        expiryDate.getTime() <= publicationTime
      ) {
        throw new Error(
          scheduledAt
            ? t("feedback.announcementExpiryAfterSchedule")
            : t("feedback.announcementExpiryFuture"),
        );
      }
      expiresAt = expiryDate.toISOString();
    }

    const audienceType = announcementComposerValues.audienceType;
    const audienceInput: Pick<
      CreateAnnouncementInput,
      | "audienceType"
      | "officeId"
      | "orgUnitId"
      | "includeDescendants"
      | "officialConversationId"
    > = { audienceType };

    if (audienceType === "OFFICE") {
      if (!announcementComposerValues.officeId) {
        throw new Error(t("feedback.announcementAudienceRequired"));
      }
      audienceInput.officeId = announcementComposerValues.officeId;
    } else if (audienceType === "ORG_UNIT") {
      if (
        !announcementComposerValues.officeId ||
        !announcementComposerValues.orgUnitId
      ) {
        throw new Error(t("feedback.announcementAudienceRequired"));
      }
      audienceInput.officeId = announcementComposerValues.officeId;
      audienceInput.orgUnitId = announcementComposerValues.orgUnitId;
      audienceInput.includeDescendants =
        announcementComposerValues.includeDescendants;
    } else {
      if (!announcementComposerValues.officialConversationId) {
        throw new Error(t("feedback.announcementAudienceRequired"));
      }
      audienceInput.officialConversationId =
        announcementComposerValues.officialConversationId;
    }

    return {
      ...audienceInput,
      title,
      body,
      priority: announcementComposerValues.priority,
      requiresAcknowledgement:
        announcementComposerValues.requiresAcknowledgement,
      allowAttachmentDownload:
        announcementComposerValues.allowAttachmentDownload,
      isPinned:
        announcementComposerValues.requiresAcknowledgement ||
        announcementComposerValues.isPinned,
      scheduledAt,
      expiresAt,
    };
  }

  async function handleAnnouncementComposerSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (
      !accessToken ||
      !announcementComposerGroup ||
      announcementComposerGroup.groupKind !== "OFFICIAL" ||
      !canManageSelectedAnnouncementGroup ||
      announcementComposerGroup.id !== selectedConversation?.id
    ) {
      setAnnouncementComposerError(t("feedback.announcementAccessLost"));
      return;
    }

    setAnnouncementComposerSubmitting(
      announcementComposerMode === "EDIT" ? "SAVE" : "PUBLISH",
    );
    setAnnouncementComposerError(null);

    let workingAnnouncementId = announcementComposerAnnouncementId;

    try {
      const input = buildAnnouncementComposerInput();
      const updateInput: AnnouncementMutationInput = {
        title: input.title,
        body: input.body,
        priority: input.priority,
        requiresAcknowledgement: input.requiresAcknowledgement,
        allowAttachmentDownload: input.allowAttachmentDownload,
        isPinned: input.isPinned,
        expiresAt: input.expiresAt,
      };
      if (announcementComposerStatus !== "PUBLISHED") {
        updateInput.scheduledAt = input.scheduledAt;
      }

      if (announcementComposerMode === "EDIT") {
        if (!workingAnnouncementId || !announcementComposerStatus) {
          throw new Error(t("feedback.announcementEditMissing"));
        }

        await updateAnnouncement(
          accessToken,
          workingAnnouncementId,
          updateInput,
        );
        for (const attachmentId of announcementComposerRemovedAttachmentIds) {
          await removeAnnouncementAttachment(
            accessToken,
            workingAnnouncementId,
            attachmentId,
          );
        }
        await uploadQueuedAnnouncementAttachments(workingAnnouncementId);

        const groupId = announcementComposerGroup.id;
        resetAnnouncementComposer();
        setAnnouncementComposerNotice(t("feedback.announcementUpdated"));
        await loadSelectedGroupAnnouncements(groupId);
        return;
      }

      if (workingAnnouncementId) {
        await updateAnnouncement(
          accessToken,
          workingAnnouncementId,
          updateInput,
        );
      } else {
        const draftResponse = await createAnnouncementDraft(accessToken, input);
        workingAnnouncementId = draftResponse.data.id;
        setAnnouncementComposerAnnouncementId(workingAnnouncementId);
        setAnnouncementComposerStatus("DRAFT");
      }

      await uploadQueuedAnnouncementAttachments(workingAnnouncementId);
      const publishResponse = await publishAnnouncement(
        accessToken,
        workingAnnouncementId,
      );
      const groupId = announcementComposerGroup.id;
      resetAnnouncementComposer();
      setAnnouncementComposerNotice(publishResponse.message);
      await loadSelectedGroupAnnouncements(groupId);
    } catch (error) {
      setAnnouncementComposerError(
        error instanceof Error
          ? error.message
          : t("feedback.announcementPublishError"),
      );
    } finally {
      setAnnouncementComposerSubmitting(null);
    }
  }

  async function handleAnnouncementComposerCancel(): Promise<void> {
    if (announcementComposerSubmitting) {
      return;
    }

    if (
      announcementComposerMode === "EDIT" ||
      !announcementComposerAnnouncementId ||
      !accessToken
    ) {
      resetAnnouncementComposer();
      return;
    }

    setAnnouncementComposerSubmitting("CANCEL");
    setAnnouncementComposerError(null);

    try {
      // A failed publication may leave a temporary draft. Remove it when the
      // publisher cancels so incomplete official records are not abandoned.
      await deleteAnnouncement(accessToken, announcementComposerAnnouncementId);
      resetAnnouncementComposer();
    } catch (error) {
      setAnnouncementComposerError(
        error instanceof Error
          ? error.message
          : t("feedback.announcementDraftRemoveError"),
      );
      setAnnouncementComposerSubmitting(null);
    }
  }

  async function handleAnnouncementAcknowledgement(): Promise<void> {
    if (!accessToken || !announcementDetail) {
      return;
    }

    setAnnouncementDetailAction("ACKNOWLEDGE");
    setAnnouncementDetailError(null);
    try {
      const response = await acknowledgeAnnouncement(
        accessToken,
        announcementDetail.id,
      );
      setAnnouncementDetail((current) =>
        current?.id === announcementDetail.id && current.viewerState
          ? {
              ...current,
              viewerState: {
                ...current.viewerState,
                isRead: true,
                isAcknowledged: true,
                readRevision: response.data.revisionNumber,
                acknowledgedRevision: response.data.revisionNumber,
              },
            }
          : current,
      );
      setAnnouncementItems((current) =>
        current.map((item) =>
          item.id === announcementDetail.id && item.viewerState
            ? {
                ...item,
                viewerState: {
                  ...item.viewerState,
                  isRead: true,
                  isAcknowledged: true,
                  readRevision: response.data.revisionNumber,
                  acknowledgedRevision: response.data.revisionNumber,
                },
              }
            : item,
        ),
      );
    } catch (error) {
      setAnnouncementDetailError(
        error instanceof Error
          ? error.message
          : t("feedback.announcementAcknowledgeError"),
      );
    } finally {
      setAnnouncementDetailAction(null);
    }
  }

  async function handleAnnouncementDelete(): Promise<void> {
    if (!accessToken || !announcementDetail?.canDelete) {
      return;
    }

    setAnnouncementDetailAction("DELETE");
    setAnnouncementDetailError(null);
    try {
      const removedAnnouncementId = announcementDetail.id;
      const response = await deleteAnnouncement(
        accessToken,
        removedAnnouncementId,
      );

      setAnnouncementItems((current) =>
        current.filter((item) => item.id !== removedAnnouncementId),
      );
      setAnnouncementDetailOpen(false);
      setAnnouncementDeleteConfirmationOpen(false);
      setAnnouncementDetail(null);
      setAnnouncementComposerNotice(response.message);
    } catch (error) {
      setAnnouncementDetailError(
        error instanceof Error
          ? error.message
          : t("feedback.announcementDeleteError"),
      );
    } finally {
      setAnnouncementDetailAction(null);
    }
  }

  function closeAnnouncementAttachmentViewer(): void {
    announcementAttachmentViewerRequestRef.current += 1;
    setAnnouncementAttachmentViewer((current) => {
      if (current?.objectUrl) {
        URL.revokeObjectURL(current.objectUrl);
      }

      return null;
    });
  }

  async function handleAnnouncementAttachmentOpen(
    attachment: AnnouncementAttachment,
  ): Promise<void> {
    if (
      !accessToken ||
      !announcementDetail ||
      !canPreviewAnnouncementAttachment(attachment)
    ) {
      return;
    }

    const requestId = announcementAttachmentViewerRequestRef.current + 1;
    announcementAttachmentViewerRequestRef.current = requestId;

    setAnnouncementAttachmentActionId(`${attachment.id}:open`);
    setAnnouncementDetailError(null);
    setAnnouncementAttachmentViewer((current) => {
      if (current?.objectUrl) {
        URL.revokeObjectURL(current.objectUrl);
      }

      return {
        announcement: announcementDetail,
        attachment,
        objectUrl: null,
        loading: true,
        error: null,
      };
    });

    try {
      const objectUrl = await createAnnouncementAttachmentObjectUrl(
        accessToken,
        announcementDetail.id,
        attachment.id,
      );

      if (announcementAttachmentViewerRequestRef.current !== requestId) {
        URL.revokeObjectURL(objectUrl);
        return;
      }

      setAnnouncementAttachmentViewer({
        announcement: announcementDetail,
        attachment,
        objectUrl,
        loading: false,
        error: null,
      });
    } catch (error) {
      if (announcementAttachmentViewerRequestRef.current !== requestId) {
        return;
      }

      setAnnouncementAttachmentViewer({
        announcement: announcementDetail,
        attachment,
        objectUrl: null,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : t("feedback.attachmentPreviewOpenError"),
      });
    } finally {
      setAnnouncementAttachmentActionId(null);
    }
  }

  async function handleAnnouncementAttachmentDownload(
    attachment: AnnouncementAttachment,
  ): Promise<void> {
    if (!accessToken || !announcementDetail) {
      return;
    }

    setAnnouncementAttachmentActionId(`${attachment.id}:download`);
    setAnnouncementDetailError(null);
    try {
      await downloadAnnouncementAttachment(
        accessToken,
        announcementDetail.id,
        attachment.id,
        attachment.originalFileName,
      );
    } catch (error) {
      setAnnouncementDetailError(
        error instanceof Error
          ? error.message
          : t("feedback.attachmentDownloadError"),
      );
    } finally {
      setAnnouncementAttachmentActionId(null);
    }
  }

  const loadStarredMessages = useCallback(
    async (options?: {
      cursor?: string | null;
      append?: boolean;
      silent?: boolean;
    }): Promise<void> => {
      const cursor = options?.cursor ?? null;
      const append = options?.append ?? false;
      const silent = options?.silent ?? false;

      if (!accessToken) {
        setStarredItems([]);
        setStarredHasMore(false);
        setStarredNextCursor(null);
        return;
      }

      if (append) {
        setStarredLoadingMore(true);
      } else if (!silent) {
        setStarredLoading(true);
        setStarredError(null);
      }

      try {
        const response = await listStarredMessages(accessToken, cursor, 50);
        setStarredItems((current) => {
          if (!append) {
            return response.data;
          }

          const byMessageId = new Map(
            current.map((item) => [item.message.id, item] as const),
          );
          for (const item of response.data) {
            byMessageId.set(item.message.id, item);
          }

          return [...byMessageId.values()];
        });
        setStarredHasMore(response.pagination.hasMore);
        setStarredNextCursor(response.pagination.nextCursor);
        setStarredError(null);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : append
              ? t("feedback.olderStarredLoadError")
              : t("feedback.starredLoadError");

        if (append) {
          setMessageNotice(message);
        } else {
          setStarredError(message);
        }
      } finally {
        if (append) {
          setStarredLoadingMore(false);
        } else if (!silent) {
          setStarredLoading(false);
        }
      }
    },
    [accessToken, t],
  );

  const loadMoreStarredMessages = useCallback(async (): Promise<void> => {
    if (
      !starredHasMore ||
      !starredNextCursor ||
      starredLoading ||
      starredLoadingMore
    ) {
      return;
    }

    await loadStarredMessages({
      cursor: starredNextCursor,
      append: true,
    });
  }, [
    loadStarredMessages,
    starredHasMore,
    starredLoading,
    starredLoadingMore,
    starredNextCursor,
  ]);

  const loadMessageRequests = useCallback(
    async (silent = false): Promise<void> => {
      if (!accessToken) {
        return;
      }

      if (!silent) {
        setRequestsLoading(true);
      }

      try {
        const response = await listMessageRequests(accessToken);
        setMessageRequests(response);
        setRequestError(null);
      } catch (error) {
        if (!silent) {
          setRequestError(
            error instanceof Error
              ? error.message
              : t("feedback.requestsLoadError"),
          );
        }
      } finally {
        if (!silent) {
          setRequestsLoading(false);
        }
      }
    },
    [accessToken, t],
  );

  const loadMessages = useCallback(
    async (conversationId: string, silent = false): Promise<void> => {
      if (!accessToken) {
        return;
      }

      const requestId = messageLoadRequestRef.current + 1;
      messageLoadRequestRef.current = requestId;
      const cachedPage = messagePageCacheRef.current[conversationId];
      const canUseCachedPage = !silent && Boolean(cachedPage);

      if (!silent) {
        if (cachedPage) {
          // Re-opening a conversation should be instant. Show the latest in-memory
          // page immediately, then revalidate it from the server in the background.
          setMessages(cachedPage.messages);
          setMessageCursor(cachedPage.cursor);
          setHasOlderMessages(cachedPage.hasOlder);
          setMessageLoading(false);
        } else {
          setMessageLoading(true);
          setMessages([]);
        }
      }

      try {
        const response = await listConversationMessages(
          accessToken,
          conversationId,
          undefined,
          50,
        );

        if (messageLoadRequestRef.current !== requestId) {
          return;
        }

        const pendingSearchResult = pendingSearchResultRef.current;
        const pendingMessage =
          pendingSearchResult?.conversation.id === conversationId
            ? pendingSearchResult.message
            : null;
        const nextMessages =
          pendingMessage &&
          !response.data.some((message) => message.id === pendingMessage.id)
            ? [...response.data, pendingMessage].sort(
                (first, second) =>
                  new Date(first.sentAt).getTime() -
                  new Date(second.sentAt).getTime(),
              )
            : response.data;

        const shouldMergeSilentRefresh =
          silent &&
          selectedConversationIdRef.current === conversationId &&
          Boolean(cachedPage);
        const preserveLoadedHistoryBoundary =
          shouldMergeSilentRefresh &&
          Boolean(cachedPage) &&
          (cachedPage?.messages.length ?? 0) > response.data.length;
        const resolvedMessages =
          shouldMergeSilentRefresh && cachedPage
            ? mergeLatestMessagingPage(cachedPage.messages, nextMessages)
            : nextMessages;
        const nextPage = {
          messages: resolvedMessages,
          cursor:
            preserveLoadedHistoryBoundary && cachedPage
              ? cachedPage.cursor
              : response.pagination.nextCursor,
          hasOlder:
            preserveLoadedHistoryBoundary && cachedPage
              ? cachedPage.hasOlder
              : response.pagination.hasMore,
        };

        messagePageCacheRef.current[conversationId] = nextPage;
        setMessages(resolvedMessages);
        setMessageCursor(nextPage.cursor);
        setHasOlderMessages(nextPage.hasOlder);
        setMessageError(null);

        // Message content is ready now. Do not keep the mobile UI blocked while
        // the separate read-receipt request completes.
        if (!silent) {
          setMessageLoading(false);
        }

        const hasUnreadIncomingMessage = response.data.some(
          (message) =>
            message.senderAccountId !== account?.id && message.readAt === null,
        );

        if (!silent || hasUnreadIncomingMessage) {
          void markConversationRead(accessToken, conversationId)
            .then(() => {
              setConversations((current) =>
                current.map((conversation) =>
                  conversation.id === conversationId
                    ? {
                        ...conversation,
                        unreadCount: 0,
                      }
                    : conversation,
                ),
              );
            })
            .catch((error) => {
              if (
                !silent &&
                selectedConversationIdRef.current === conversationId
              ) {
                setMessageError(
                  error instanceof Error
                    ? t("feedback.messagesReadStatusErrorWithDetail", {
                        detail: error.message,
                      })
                    : t("feedback.messagesReadStatusError"),
                );
              }
            });
        }
      } catch (error) {
        if (messageLoadRequestRef.current !== requestId) {
          return;
        }

        // If cached messages are already visible, a failed revalidation should
        // not replace the conversation with a blocking error state.
        if (!canUseCachedPage && !silent) {
          setMessageError(
            error instanceof Error
              ? error.message
              : t("feedback.messagesLoadError"),
          );
        }
      } finally {
        if (!silent && messageLoadRequestRef.current === requestId) {
          setMessageLoading(false);
        }
      }
    },
    [accessToken, account?.id, t],
  );

  useEffect(() => {
    if (!selectedConversationId || messageLoading) {
      return;
    }

    if (
      messages.length > 0 &&
      !messages.every(
        (message) => message.conversationId === selectedConversationId,
      )
    ) {
      return;
    }

    messagePageCacheRef.current[selectedConversationId] = {
      messages,
      cursor: messageCursor,
      hasOlder: hasOlderMessages,
    };
  }, [
    hasOlderMessages,
    messageCursor,
    messageLoading,
    messages,
    selectedConversationId,
  ]);

  const loadPinnedMessages = useCallback(
    async (conversationId: string): Promise<void> => {
      if (!accessToken) {
        setPinnedMessages([]);
        return;
      }

      try {
        const response = await listConversationPinnedMessages(
          accessToken,
          conversationId,
        );
        setPinnedMessages(
          response.data.filter(
            (message) =>
              !message.isDeleted && message.conversationId === conversationId,
          ),
        );
      } catch {
        // Pinning is non-blocking; the message thread can still load without the banner.
        setPinnedMessages([]);
      }
    },
    [accessToken],
  );

  const applyConversationPreference = useCallback(
    (
      preference: Awaited<
        ReturnType<typeof updateConversationPreference>
      >["data"],
    ): void => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === preference.conversationId
            ? {
                ...conversation,
                isPinned: preference.isPinned,
                pinnedAt: preference.pinnedAt,
                isFavorite: preference.isFavorite,
                favoritedAt: preference.favoritedAt,
                isArchived: preference.isArchived,
                archivedAt: preference.archivedAt,
                isMuted: preference.isMuted,
                mutedUntil: preference.mutedUntil,
                isMarkedUnread: preference.isMarkedUnread,
                markedUnreadAt: preference.markedUnreadAt,
                unreadCount:
                  preference.isMarkedUnread && conversation.unreadCount === 0
                    ? 1
                    : preference.isMarkedUnread
                      ? conversation.unreadCount
                      : conversation.unreadCount,
                draftText: preference.draftText,
                draftUpdatedAt: preference.draftUpdatedAt,
              }
            : conversation,
        ),
      );
    },
    [],
  );

  async function saveConversationPreference(
    conversationId: string,
    input: Parameters<typeof updateConversationPreference>[2],
    successMessage?: string,
  ): Promise<void> {
    if (!accessToken || conversationPreferenceLoading) {
      return;
    }

    setConversationPreferenceLoading(conversationId);
    setMessageError(null);

    try {
      const response = await updateConversationPreference(
        accessToken,
        conversationId,
        input,
      );

      applyConversationPreference(response.data);

      if (successMessage) {
        setMessageNotice(successMessage);
      }
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : t("feedback.conversationControlsError"),
      );
    } finally {
      setConversationPreferenceLoading(null);
    }
  }

  useEffect(() => {
    if (
      !selectedConversation ||
      draftConversationIdRef.current === selectedConversation.id
    ) {
      return;
    }

    draftHydrationRef.current = true;
    draftConversationIdRef.current = selectedConversation.id;
    const cachedDraft = draftCacheRef.current[selectedConversation.id];
    const nextDraftText = cachedDraft ?? selectedConversation.draftText ?? "";

    setMessageText(nextDraftText);
    setComposerCaretIndex(nextDraftText.length);

    window.setTimeout(() => {
      draftHydrationRef.current = false;
    }, 0);
  }, [selectedConversation]);

  useEffect(() => {
    if (
      !accessToken ||
      !selectedConversationId ||
      draftHydrationRef.current ||
      editingMessage ||
      selectedAttachments.length > 0 ||
      voiceRecordingState !== "IDLE"
    ) {
      return;
    }

    const draftText = messageText;
    const conversationId = selectedConversationId;

    if (draftText.trim()) {
      draftCacheRef.current[conversationId] = draftText;
    } else {
      delete draftCacheRef.current[conversationId];
    }

    const timeout = window.setTimeout(() => {
      updateConversationPreference(accessToken, conversationId, {
        draftText,
      })
        .then((response) => applyConversationPreference(response.data))
        .catch(() => {
          // Draft sync is quiet so typing never feels blocked by a failed request.
        });
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [
    accessToken,
    applyConversationPreference,
    editingMessage,
    messageText,
    selectedAttachments.length,
    selectedConversationId,
    voiceRecordingState,
  ]);

  const stopLocalTyping = useCallback(
    (requestedConversationId?: string | null): void => {
      const conversationId =
        requestedConversationId ?? activeTypingConversationIdRef.current;

      if (typingStopTimerRef.current !== null) {
        window.clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }

      if (conversationId && messagingSocketRef.current?.connected) {
        messagingSocketRef.current.emit("messaging:typing", {
          conversationId,
          isTyping: false,
        });
      }

      if (activeTypingConversationIdRef.current === conversationId) {
        activeTypingConversationIdRef.current = null;
      }

      lastTypingEmitAtRef.current = 0;
    },
    [],
  );

  const updateLocalTyping = useCallback(
    (conversationId: string, value: string): void => {
      const socket = messagingSocketRef.current;

      if (!socket?.connected || !value.trim()) {
        stopLocalTyping(conversationId);
        return;
      }

      const previousConversationId = activeTypingConversationIdRef.current;

      if (previousConversationId && previousConversationId !== conversationId) {
        stopLocalTyping(previousConversationId);
      }

      const now = Date.now();
      const shouldEmit =
        activeTypingConversationIdRef.current !== conversationId ||
        now - lastTypingEmitAtRef.current >= 600;

      if (shouldEmit) {
        socket.emit("messaging:typing", {
          conversationId,
          isTyping: true,
        });
        lastTypingEmitAtRef.current = now;
      }

      activeTypingConversationIdRef.current = conversationId;

      if (typingStopTimerRef.current !== null) {
        window.clearTimeout(typingStopTimerRef.current);
      }

      typingStopTimerRef.current = window.setTimeout(() => {
        stopLocalTyping(conversationId);
      }, 1800);
    },
    [stopLocalTyping],
  );

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    announcementModeRef.current = announcementMode;
  }, [announcementMode]);

  useEffect(() => {
    announcementDetailIdRef.current = announcementDetail?.id ?? null;
  }, [announcementDetail?.id]);

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;

    const activeTypingConversationId = activeTypingConversationIdRef.current;

    if (
      activeTypingConversationId &&
      activeTypingConversationId !== selectedConversationId
    ) {
      stopLocalTyping(activeTypingConversationId);
    }
  }, [selectedConversationId, stopLocalTyping]);

  useEffect(() => {
    if (!account?.id || preferenceStorageAccountId !== account.id) {
      return;
    }

    writeMessagingBooleanPreference(
      window.localStorage,
      NOTIFICATION_SOUND_STORAGE_KEY,
      account.id,
      notificationSoundEnabled,
    );
  }, [account?.id, notificationSoundEnabled, preferenceStorageAccountId]);

  useEffect(() => {
    if (!account?.id || preferenceStorageAccountId !== account.id) {
      return;
    }

    writeMessagingBooleanPreference(
      window.localStorage,
      BROWSER_NOTIFICATION_STORAGE_KEY,
      account.id,
      browserNotificationsEnabled,
    );
  }, [account?.id, browserNotificationsEnabled, preferenceStorageAccountId]);

  useEffect(() => {
    if (!account?.id || preferenceStorageAccountId !== account.id) {
      return;
    }

    if (
      browserNotificationsEnabled &&
      (!messagingPushSupported() ||
        window.Notification.permission !== "granted")
    ) {
      setBrowserNotificationsEnabled(false);
      setBackgroundPushReady(false);
    }
  }, [account?.id, browserNotificationsEnabled, preferenceStorageAccountId]);

  useEffect(() => {
    if (
      !accessToken ||
      !account?.id ||
      preferenceStorageAccountId !== account.id ||
      !browserNotificationsEnabled ||
      !messagingPushSupported() ||
      window.Notification.permission !== "granted"
    ) {
      setBackgroundPushReady(false);
      return;
    }

    let active = true;

    void syncMessagingPushSubscription(accessToken, {
      showPreview: messagingSettings.notificationPreview,
      isMuted: messagingSettings.muteAllNotifications,
    })
      .then((ready) => {
        if (active) {
          setBackgroundPushReady(ready);
        }
      })
      .catch(() => {
        if (active) {
          setBackgroundPushReady(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    accessToken,
    account?.id,
    browserNotificationsEnabled,
    messagingSettings.muteAllNotifications,
    messagingSettings.notificationPreview,
    preferenceStorageAccountId,
  ]);

  useEffect(() => {
    if (
      !accessToken ||
      !account?.id ||
      preferenceStorageAccountId !== account.id ||
      browserNotificationsEnabled ||
      !messagingPushSupported()
    ) {
      return;
    }

    void disableMessagingPushSubscription(accessToken).catch(() => undefined);
  }, [
    accessToken,
    account?.id,
    browserNotificationsEnabled,
    preferenceStorageAccountId,
  ]);

  useEffect(() => {
    if (!notificationActionNotice) {
      return;
    }

    const timer = window.setTimeout(() => {
      setNotificationActionNotice(null);
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [notificationActionNotice]);

  useEffect(() => {
    if (!messageNotice) {
      return;
    }

    // Informational message actions should behave like lightweight toasts rather
    // than permanent banners that push the conversation thread downward.
    const timer = window.setTimeout(() => {
      setMessageNotice(null);
    }, 4500);

    return () => window.clearTimeout(timer);
  }, [messageNotice]);

  useEffect(
    () => () => {
      if (notificationToastTimerRef.current !== null) {
        window.clearTimeout(notificationToastTimerRef.current);
      }

      if (conversationHistoryToastTimerRef.current !== null) {
        window.clearTimeout(conversationHistoryToastTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    setConversationActionMenuOpen(false);
    setConversationActionMenuView("ROOT");
    setConversationRowMenuId(null);
    setConversationRowMenuView("ROOT");
    setConversationHistoryAction(null);
    setConversationHistoryTargetId(null);
    setConversationHistoryError(null);
    sharedContentRequestRef.current += 1;
    setSharedContentOpen(false);
    setSharedContentLoading(false);
    setSharedContent(null);
    setSharedContentError(null);
    setPrivateGroupDialogOpen(false);
    setGroupManagementWorkspaceOpen(false);
    setActiveUtilityPanel(null);
    setProfileReturnToGroupInformation(false);
    setProfileSharedGroupsExpanded(false);
    setGroupMemberSearch("");
    setGroupMembersExpanded(false);
    setGroupDialogMode(createGroupMode ? "CREATE" : null);
    setGroupPanelTab("OVERVIEW");
    setGroupSelectedAccountIds([]);
    setGroupSelectedContacts([]);
    setGroupSearch("");
    setGroupError(null);
    resetGroupInviteState();
  }, [createGroupMode, selectedConversationId]);

  useEffect(() => {
    if (!conversationActionMenuOpen) {
      setConversationActionMenuView("ROOT");
      return undefined;
    }

    const firstMenuItem =
      conversationActionMenuRef.current?.querySelector<HTMLElement>(
        '[role="menuitem"]',
      );

    window.requestAnimationFrame(() => firstMenuItem?.focus());

    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (
        conversationActionMenuRef.current?.contains(target) ||
        conversationActionButtonRef.current?.contains(target)
      ) {
        return;
      }

      setConversationActionMenuOpen(false);
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setConversationActionMenuOpen(false);
      conversationActionButtonRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [conversationActionMenuOpen, conversationActionMenuView]);

  useEffect(() => {
    if (!conversationRowMenuId) {
      return undefined;
    }

    const firstMenuItem =
      conversationRowMenuRef.current?.querySelector<HTMLElement>(
        '[role="menuitem"]',
      );

    window.requestAnimationFrame(() => firstMenuItem?.focus());

    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (
        conversationRowMenuRef.current?.contains(target) ||
        conversationRowMenuButtonRefs.current[conversationRowMenuId]?.contains(
          target,
        )
      ) {
        return;
      }

      setConversationRowMenuId(null);
      setConversationRowMenuView("ROOT");
      setConversationRowMenuPosition(null);
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setConversationRowMenuId(null);
      setConversationRowMenuView("ROOT");
      setConversationRowMenuPosition(null);
      conversationRowMenuButtonRefs.current[conversationRowMenuId]?.focus();
    };

    const closeForViewportChange = (): void => {
      setConversationRowMenuId(null);
      setConversationRowMenuView("ROOT");
      setConversationRowMenuPosition(null);
    };
    const conversationList = conversationListRef.current;

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeForViewportChange);
    conversationList?.addEventListener("scroll", closeForViewportChange, {
      passive: true,
    });

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeForViewportChange);
      conversationList?.removeEventListener("scroll", closeForViewportChange);
    };
  }, [conversationRowMenuId]);

  useEffect(() => {
    if (!conversationHistoryAction) {
      return undefined;
    }

    window.requestAnimationFrame(() => {
      conversationHistoryCancelRef.current?.focus();
    });

    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape" && !conversationHistorySubmitting) {
        event.preventDefault();
        setConversationHistoryAction(null);
        const targetId = conversationHistoryTargetId;
        setConversationHistoryTargetId(null);
        setConversationHistoryError(null);
        const rowActionButton =
          conversationRowMenuButtonRefs.current[targetId ?? ""];

        if (rowActionButton) {
          rowActionButton.focus();
        } else {
          conversationActionButtonRef.current?.focus();
        }
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const dialog = conversationHistoryDialogRef.current;

      if (!dialog) {
        return;
      }

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    conversationHistoryAction,
    conversationHistorySubmitting,
    conversationHistoryTargetId,
  ]);

  const loadNotifications = useCallback(async () => {
    if (!accessToken) {
      setNotifications([]);
      setNotificationUnreadCount(0);
      return;
    }

    setNotificationsLoading(true);
    setNotificationError(null);

    try {
      const response = await listMessagingNotifications(accessToken);
      setNotifications(response.data);
      setNotificationUnreadCount(response.unreadCount);
    } catch (error) {
      setNotificationError(
        error instanceof Error
          ? error.message
          : t("feedback.notificationsLoadError"),
      );
    } finally {
      setNotificationsLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const resetAttachmentUpload = useCallback((): void => {
    setAttachmentUpload(EMPTY_ATTACHMENT_UPLOAD_STATE);
  }, []);

  const clearSelectedAttachment = useCallback((): void => {
    selectedAttachmentsRef.current.forEach((attachment) => {
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    });
    selectedAttachmentsRef.current = [];
    setSelectedAttachments([]);
    setSelectedAttachmentKind("FILE");
    resetAttachmentUpload();

    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  }, [resetAttachmentUpload]);

  const applyPersonalConversationHistoryLocally = useCallback(
    (
      conversationId: string,
      action: PersonalConversationHistoryAction,
      occurredAt: string,
    ): void => {
      const currentConversations = conversationsRef.current;

      if (action === "DELETE") {
        const selectedIndex = currentConversations.findIndex(
          (conversation) => conversation.id === conversationId,
        );
        const remaining = currentConversations.filter(
          (conversation) => conversation.id !== conversationId,
        );

        conversationsRef.current = remaining;
        setConversations(remaining);

        if (selectedConversationIdRef.current === conversationId) {
          const nextConversation =
            remaining[selectedIndex] ??
            remaining[Math.max(0, selectedIndex - 1)] ??
            null;

          setSelectedConversationId(nextConversation?.id ?? null);
          setDetailsPanelOpen(false);
        }
      } else {
        const updated = currentConversations.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                historyClearedAt: occurredAt,
                deletedFromListAt: null,
                lastMessage: null,
                lastMessageAt: null,
                unreadCount: 0,
                isMarkedUnread: false,
                markedUnreadAt: null,
              }
            : conversation,
        );

        conversationsRef.current = updated;
        setConversations(updated);
      }

      if (selectedConversationIdRef.current !== conversationId) {
        return;
      }

      /*
       * Clear every local surface that may still hold authorized content from
       * before the personal history boundary. The server remains authoritative.
       */
      stopLocalTyping(conversationId);
      setMessages([]);
      setPinnedMessages([]);
      setMessageCursor(null);
      setHasOlderMessages(false);
      setMessageError(null);
      setReplyingTo(null);
      setEditingMessage(null);
      setForwardingMessage(null);
      setMessageInformation(null);
      setMessageInformationError(null);
      setOpenMessageMenuId(null);
      setOpenReactionMenuId(null);
      setSharedContent(null);
      setSharedContentError(null);
      setSharedContentOpen(false);
      setHighlightedMessageId(null);
      pendingSearchResultRef.current = null;
      closeAttachmentViewer();

      if (action === "DELETE") {
        delete draftCacheRef.current[conversationId];
        setMessageText("");
        clearSelectedAttachment();
      }
    },
    [clearSelectedAttachment, stopLocalTyping],
  );

  const handleRealtimeNotificationClick = useEffectEvent(
    (notification: MessagingNotification) => {
      void handleNotificationClick(notification);
    },
  );
  const resetRealtimeGroupDialogState = useEffectEvent(() => {
    resetGroupDialogState();
  });
  const getBrowserNotificationOpenText = useEffectEvent(() =>
    t("feedback.browserNotificationOpen"),
  );

  useEffect(() => {
    if (!accessToken) {
      setRealtimeStatus("DISCONNECTED");
      setPresenceByAccountId({});
      setTypingByConversation({});
      return undefined;
    }

    const socket = createMessagingSocket(accessToken);
    messagingSocketRef.current = socket;

    let conversationRefreshTimer: number | null = null;
    let selectedMessageRefreshTimer: number | null = null;
    let markReadTimer: number | null = null;

    const scheduleConversationRefresh = (): void => {
      if (conversationRefreshTimer !== null) {
        return;
      }

      conversationRefreshTimer = window.setTimeout(() => {
        conversationRefreshTimer = null;
        void loadConversations(
          true,
          selectedConversationIdRef.current ?? undefined,
        );
      }, 120);
    };

    const scheduleSelectedMessageRefresh = (conversationId: string): void => {
      if (selectedConversationIdRef.current !== conversationId) {
        return;
      }

      if (selectedMessageRefreshTimer !== null) {
        window.clearTimeout(selectedMessageRefreshTimer);
      }

      selectedMessageRefreshTimer = window.setTimeout(() => {
        selectedMessageRefreshTimer = null;

        if (selectedConversationIdRef.current === conversationId) {
          void loadMessages(conversationId, true);
        }
      }, 180);
    };

    const scheduleConversationRead = (conversationId: string): void => {
      if (markReadTimer !== null) {
        window.clearTimeout(markReadTimer);
      }

      markReadTimer = window.setTimeout(() => {
        markReadTimer = null;

        if (selectedConversationIdRef.current !== conversationId) {
          return;
        }

        void markConversationRead(accessToken, conversationId)
          .then(() => {
            setConversations((current) =>
              current.map((conversation) =>
                conversation.id === conversationId
                  ? {
                      ...conversation,
                      unreadCount: 0,
                      isMarkedUnread: false,
                      markedUnreadAt: null,
                    }
                  : conversation,
              ),
            );
          })
          .catch(() => {
            // Realtime message delivery remains usable if this non-blocking
            // read-status update temporarily fails; reconnect revalidates it.
          });
      }, 120);
    };

    const setAccountTyping = (
      conversationId: string,
      accountId: string,
      isTyping: boolean,
    ): void => {
      setTypingByConversation((current) => {
        const existing = current[conversationId] ?? [];
        const nextAccountIds = isTyping
          ? [...new Set([...existing, accountId])]
          : existing.filter((value) => value !== accountId);

        if (
          existing.length === nextAccountIds.length &&
          existing.every((value, index) => value === nextAccountIds[index])
        ) {
          return current;
        }

        const next = {
          ...current,
        };

        if (nextAccountIds.length === 0) {
          delete next[conversationId];
        } else {
          next[conversationId] = nextAccountIds;
        }

        return next;
      });
    };

    const refreshSelectedConversation = (): void => {
      const conversationId = selectedConversationIdRef.current;

      if (conversationId) {
        void loadMessages(conversationId, true);
      }
    };

    const handleConnect = (): void => {
      setRealtimeStatus("CONNECTING");
      socket.emit("messaging:ping");
    };

    const handleReady = (): void => {
      setRealtimeStatus("CONNECTED");
      void loadConversations(
        true,
        selectedConversationIdRef.current ?? undefined,
      );
      // Reconnects also refresh private list membership/counts that may have
      // changed in another session while this tab was offline.
      void loadChatFolders(true);
      refreshSelectedConversation();
      void loadMessageRequests(true);
    };

    const handlePong = (): void => {
      setRealtimeStatus("CONNECTED");
    };

    const handlePresenceSnapshot = (
      payload: MessagingPresenceSnapshotPayload,
    ): void => {
      const next: Record<string, MessagingPresenceState> = {};

      for (const presence of payload.presences) {
        next[presence.accountId] = presence;
      }

      setPresenceByAccountId(next);
    };

    const handlePresenceUpdated = (payload: MessagingPresenceState): void => {
      setPresenceByAccountId((current) => ({
        ...current,
        [payload.accountId]: payload,
      }));
    };

    const handleTypingUpdated = (
      payload: MessagingTypingUpdatedPayload,
    ): void => {
      setAccountTyping(
        payload.conversationId,
        payload.accountId,
        payload.isTyping,
      );
    };

    const handleNotificationCreated = (
      payload: MessagingNotificationCreatedPayload,
    ): void => {
      // Realtime notifications update the bell immediately without waiting for list polling.
      setNotifications((current) =>
        [
          payload.notification,
          ...current.filter(
            (notification) => notification.id !== payload.notification.id,
          ),
        ].slice(0, 40),
      );
      setNotificationUnreadCount(payload.unreadCount);

      if (messagingSettings.muteAllNotifications) {
        return;
      }

      setNotificationToast(payload.notification);

      if (notificationToastTimerRef.current !== null) {
        window.clearTimeout(notificationToastTimerRef.current);
      }

      notificationToastTimerRef.current = window.setTimeout(() => {
        setNotificationToast(null);
      }, 6000);

      if (
        notificationSoundEnabled &&
        payload.notification.type !== "WORK_ITEM"
      ) {
        // Work sounds are owned by the app-level WorkRealtimeBridge so opening
        // Messages cannot play the same Work alert twice.
        playNotificationTone();
      }

      if (
        browserNotificationsEnabled &&
        !backgroundPushReady &&
        "Notification" in window &&
        window.Notification.permission === "granted"
      ) {
        const browserNotification = new window.Notification(
          payload.notification.title,
          {
            body: messagingSettings.notificationPreview
              ? payload.notification.body
              : getBrowserNotificationOpenText(),
            tag: payload.notification.id,
          },
        );

        browserNotification.onclick = () => {
          window.focus();
          browserNotification.close();
          handleRealtimeNotificationClick(payload.notification);
        };
      }
    };

    const handleAnnouncementRealtime = (
      payload: AnnouncementRealtimePayload,
    ): void => {
      const selectedOfficialGroupId = selectedConversationIdRef.current;

      if (payload.action === "DELETED") {
        setAnnouncementItems((current) =>
          current.filter((item) => item.id !== payload.announcementId),
        );

        if (announcementDetailIdRef.current === payload.announcementId) {
          announcementDetailRequestRef.current += 1;
          setAnnouncementDetailOpen(false);
          setAnnouncementDeleteConfirmationOpen(false);
          setAnnouncementDetail(null);
          setAnnouncementDetailError(null);
          setAnnouncementDetailAction(null);
        }

        return;
      }

      if (
        announcementModeRef.current &&
        payload.officialConversationId &&
        payload.officialConversationId === selectedOfficialGroupId
      ) {
        /*
         * Announcement records are separate from chat messages. Reload only
         * the selected official group's announcement feed when its event arrives.
         */
        void loadSelectedGroupAnnouncements(
          payload.officialConversationId,
          true,
        );
      }

      if (payload.action !== "PUBLISHED") {
        return;
      }

      // Publication creates recipient notification rows in the same transaction.
      void loadNotifications();

      if (
        payload.actorAccountId !== account?.id &&
        !messagingSettings.muteAllNotifications &&
        notificationSoundEnabled
      ) {
        playNotificationTone();
      }
    };

    const handleMessageCreated = (
      payload: MessagingMessageCreatedPayload,
    ): void => {
      setAccountTyping(
        payload.conversationId,
        payload.message.senderAccountId,
        false,
      );

      // Bursts of realtime events should not trigger one full conversation-list
      // request per message. Coalesce them into a single lightweight refresh.
      scheduleConversationRefresh();

      if (payload.conversationId !== selectedConversationIdRef.current) {
        return;
      }

      if (messageIdsRef.current.has(payload.message.id)) {
        return;
      }

      messageIdsRef.current.add(payload.message.id);
      setMessages((current) => [...current, payload.message]);

      if (!messageListNearBottomRef.current) {
        setShowJumpToLatest(true);
        setNewMessageCount((current) => current + 1);
      }

      if (payload.message.senderAccountId !== account?.id) {
        scheduleConversationRead(payload.conversationId);
      }
    };

    const handleMessageUpdated = (
      payload: MessagingMessageUpdatedPayload,
    ): void => {
      scheduleConversationRefresh();

      if (payload.conversationId !== selectedConversationIdRef.current) {
        return;
      }

      if (
        pendingBottomScrollConversationIdRef.current !== payload.conversationId
      ) {
        // Realtime echoes for react/pin/star/edit/delete can arrive before the
        // matching HTTP response. Capture the visible message before applying
        // that update so the socket event cannot pull an older reader to bottom.
        captureMessageThreadMutationAnchor();
      }

      setMessages((current) =>
        applyMessageUpdate(current, payload.message, {
          preservePersonalState: true,
        }),
      );
      if (payload.action === "DELETED") {
        setStarredItems((current) =>
          current.filter((item) => item.message.id !== payload.message.id),
        );
      }

      setPinnedMessages((current) => {
        if (
          payload.action === "PINNED" ||
          payload.action === "UNPINNED" ||
          payload.action === "DELETED"
        ) {
          /*
           * A shared pin event cannot determine this viewer's personal clear
           * boundary. Reload the server-authorized pinned-message list.
           */
          void loadPinnedMessages(payload.conversationId);

          return payload.action === "DELETED"
            ? current.filter((item) => item.id !== payload.message.id)
            : current;
        }

        return applyMessageUpdate(current, payload.message, {
          preservePersonalState: true,
        });
      });

      setReplyingTo((current) =>
        current?.id === payload.message.id
          ? payload.action === "DELETED"
            ? null
            : payload.message
          : current,
      );

      setEditingMessage((current) =>
        current?.id === payload.message.id && payload.action === "DELETED"
          ? null
          : current,
      );
    };

    const handleMessageHidden = (
      payload: MessagingMessageHiddenPayload,
    ): void => {
      scheduleConversationRefresh();

      if (payload.conversationId !== selectedConversationIdRef.current) {
        return;
      }

      if (
        pendingBottomScrollConversationIdRef.current !== payload.conversationId
      ) {
        captureMessageThreadMutationAnchor();
      }

      setMessages((current) =>
        current.filter((message) => message.id !== payload.messageId),
      );
      setPinnedMessages((current) =>
        current.filter((message) => message.id !== payload.messageId),
      );
      setStarredItems((current) =>
        current.filter((item) => item.message.id !== payload.messageId),
      );
      setReplyingTo((current) =>
        current?.id === payload.messageId ? null : current,
      );
      setEditingMessage((current) =>
        current?.id === payload.messageId ? null : current,
      );
    };

    const handleReceiptUpdated = (
      payload: MessagingReceiptUpdatedPayload,
    ): void => {
      scheduleConversationRefresh();

      if (
        payload.conversationId === selectedConversationIdRef.current &&
        payload.messageIds.some((messageId) =>
          messageIdsRef.current.has(messageId),
        )
      ) {
        // Receipt bursts can be very noisy in groups. Refresh the visible
        // message state once after the burst rather than once per receipt event.
        scheduleSelectedMessageRefresh(payload.conversationId);
      }
    };

    const handleConversationUpdated = (
      payload: MessagingConversationUpdatedPayload,
    ): void => {
      if (
        payload.reason === "CLEARED_FOR_ACCOUNT" ||
        payload.reason === "DELETED_FOR_ACCOUNT"
      ) {
        /*
         * M19 events are delivered only to this account's sessions. Applying
         * them immediately prevents another tab from retaining stale text,
         * pins, shared content or attachment previews.
         */
        applyPersonalConversationHistoryLocally(
          payload.conversationId,
          payload.reason === "DELETED_FOR_ACCOUNT" ? "DELETE" : "CLEAR",
          payload.occurredAt,
        );

        void loadNotifications();
      }

      if (payload.reason === "GROUP_DELETED") {
        if (payload.conversationId === selectedConversationIdRef.current) {
          setSelectedConversationId(null);
          setDetailsPanelOpen(false);
          setGroupManagementWorkspaceOpen(false);
          resetRealtimeGroupDialogState();
        }
      }

      if (
        payload.reason === "MEMBERS_CHANGED" &&
        payload.conversationId === selectedConversationIdRef.current
      ) {
        setOfficialGroupMembersRefreshVersion((current) => current + 1);
      }

      void loadConversations(
        true,
        payload.reason === "DELETED_FOR_ACCOUNT" ||
          payload.reason === "GROUP_DELETED"
          ? undefined
          : (selectedConversationIdRef.current ?? undefined),
      );

      /*
       * Conversation visibility changes can make an existing list item appear
       * or disappear without changing the list itself. Refresh account-private
       * list metadata so sidebar counts never remain stale across tabs.
       */
      void loadChatFolders(true);
    };

    const handleMessageRequestUpdated = (
      payload: MessagingMessageRequestUpdatedPayload,
    ): void => {
      void loadMessageRequests(true);

      if (payload.status === "ACCEPTED") {
        void loadConversations(
          true,
          selectedConversationIdRef.current ?? undefined,
        );
      }
    };

    const handleDisconnect = (): void => {
      setTypingByConversation({});
      setPresenceByAccountId({});
      setRealtimeStatus(socket.active ? "RECONNECTING" : "DISCONNECTED");
    };

    const handleConnectError = (): void => {
      setTypingByConversation({});
      setPresenceByAccountId({});
      setRealtimeStatus(socket.active ? "RECONNECTING" : "DISCONNECTED");
    };

    const handleSocketError = (payload: MessagingSocketErrorPayload): void => {
      if (payload.code !== "SESSION_INVALIDATED") {
        return;
      }

      /*
       * Realtime authorization must end with the HTTP session. Clear local
       * credentials immediately instead of leaving a revoked account looking
       * connected until the next REST request or token refresh.
       */
      void logout().finally(() => {
        navigate("/login", { replace: true });
      });
    };

    socket.on("connect", handleConnect);
    socket.on("messaging:ready", handleReady);
    socket.on("messaging:error", handleSocketError);
    socket.on("messaging:pong", handlePong);
    socket.on("messaging:presence-snapshot", handlePresenceSnapshot);
    socket.on("messaging:presence-updated", handlePresenceUpdated);
    socket.on("messaging:typing-updated", handleTypingUpdated);
    socket.on("messaging:message-created", handleMessageCreated);
    socket.on("messaging:message-updated", handleMessageUpdated);
    socket.on("messaging:message-hidden", handleMessageHidden);
    socket.on("messaging:notification-created", handleNotificationCreated);
    socket.on("announcement:published", handleAnnouncementRealtime);
    socket.on("announcement:updated", handleAnnouncementRealtime);
    socket.on("announcement:deleted", handleAnnouncementRealtime);
    socket.on("announcement:read", handleAnnouncementRealtime);
    socket.on("announcement:acknowledged", handleAnnouncementRealtime);
    socket.on("messaging:receipt-updated", handleReceiptUpdated);
    socket.on("messaging:conversation-updated", handleConversationUpdated);
    socket.on("messaging:request-updated", handleMessageRequestUpdated);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    const disconnectSocket = connectMessagingSocketAfterEffectCommit(socket);

    return () => {
      stopLocalTyping();

      if (conversationRefreshTimer !== null) {
        window.clearTimeout(conversationRefreshTimer);
      }
      if (selectedMessageRefreshTimer !== null) {
        window.clearTimeout(selectedMessageRefreshTimer);
      }
      if (markReadTimer !== null) {
        window.clearTimeout(markReadTimer);
      }

      socket.off("connect", handleConnect);
      socket.off("messaging:ready", handleReady);
      socket.off("messaging:error", handleSocketError);
      socket.off("messaging:pong", handlePong);
      socket.off("messaging:presence-snapshot", handlePresenceSnapshot);
      socket.off("messaging:presence-updated", handlePresenceUpdated);
      socket.off("messaging:typing-updated", handleTypingUpdated);
      socket.off("messaging:message-created", handleMessageCreated);
      socket.off("messaging:message-updated", handleMessageUpdated);
      socket.off("messaging:message-hidden", handleMessageHidden);
      socket.off("messaging:notification-created", handleNotificationCreated);
      socket.off("announcement:published", handleAnnouncementRealtime);
      socket.off("announcement:updated", handleAnnouncementRealtime);
      socket.off("announcement:deleted", handleAnnouncementRealtime);
      socket.off("announcement:read", handleAnnouncementRealtime);
      socket.off("announcement:acknowledged", handleAnnouncementRealtime);
      socket.off("messaging:receipt-updated", handleReceiptUpdated);
      socket.off("messaging:conversation-updated", handleConversationUpdated);
      socket.off("messaging:request-updated", handleMessageRequestUpdated);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      disconnectSocket();

      if (messagingSocketRef.current === socket) {
        messagingSocketRef.current = null;
      }
    };
  }, [
    accessToken,
    account?.id,
    applyPersonalConversationHistoryLocally,
    loadChatFolders,
    loadConversations,
    loadMessageRequests,
    loadMessages,
    loadNotifications,
    loadPinnedMessages,
    loadSelectedGroupAnnouncements,
    logout,
    navigate,
    browserNotificationsEnabled,
    backgroundPushReady,
    messagingSettings.muteAllNotifications,
    messagingSettings.notificationPreview,
    notificationSoundEnabled,
    stopLocalTyping,
  ]);

  useEffect(() => {
    try {
      if (selectedConversationId) {
        window.sessionStorage.setItem(
          SELECTED_CONVERSATION_STORAGE_KEY,
          selectedConversationId,
        );
      } else {
        window.sessionStorage.removeItem(SELECTED_CONVERSATION_STORAGE_KEY);
      }
    } catch {
      // Session storage is optional; messaging still works without it.
    }
  }, [selectedConversationId]);

  useEffect(() => {
    // Message information belongs to one concrete conversation/message. Never
    // carry it into another chat when the selected conversation changes.
    messageInformationRequestIdRef.current += 1;
    setMessageInformation(null);
    setMessageInformationError(null);
    setMessageInformationLoadingId(null);
    setMessageInformationVisibleReadCount(40);
    setMessageInformationVisibleDeliveredCount(40);
  }, [selectedConversationId]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    void loadChatFolders();
  }, [loadChatFolders]);

  useEffect(() => {
    if (!listManagementMode) {
      return;
    }

    // The editor reuses the canonical conversation API. Fetch every page only
    // while creating/editing a list instead of adding a second contact/group
    // discovery path to the Message workspace.
    void loadListCandidateConversations("workspace");
  }, [listManagementMode, loadListCandidateConversations]);

  useEffect(() => {
    if (!listWorkspaceMode) {
      setListDeleteConfirmOpen(false);
      return;
    }

    // A custom list is a route-level workspace. Do not carry a previously
    // selected chat or transient detail panel across list/create/edit routes.
    setSelectedConversationId(null);
    setDetailsPanelOpen(false);
    setConversationActionMenuOpen(false);
    setConversationRowMenuId(null);
    setListDeleteConfirmOpen(false);
    setListWorkspaceError(null);
    setListCandidateSearch("");

    if (listCreateMode) {
      setListNameDraft("");
      setListSelectedConversationIds([]);
    }
  }, [listCreateMode, listWorkspaceMode, selectedListId]);

  useEffect(() => {
    if (!listMode || !selectedChatFolder) {
      return;
    }

    setListNameDraft(selectedChatFolder.name);
    setListSelectedConversationIds(
      selectedChatFolder.items.flatMap((item) =>
        item.conversationId ? [item.conversationId] : [],
      ),
    );
  }, [listMode, selectedChatFolder]);

  useEffect(() => {
    if (
      !listMode ||
      chatFoldersLoading ||
      chatFoldersError ||
      selectedChatFolder
    ) {
      return;
    }

    setListWorkspaceError(t("feedback.listNotFound"));
  }, [chatFoldersError, chatFoldersLoading, listMode, selectedChatFolder, t]);

  useEffect(() => {
    if (!archivedMode) {
      return;
    }

    setConversationCategory("ALL");
    setConversationListView("ARCHIVED");
    setDetailsPanelOpen(false);
  }, [archivedMode]);

  useEffect(() => {
    if (!announcementMode) {
      return;
    }

    setConversationListView("ACTIVE");
    setConversationCategory("OFFICIAL");
    setDetailsPanelOpen(false);

    if (conversationLoading) {
      /*
       * The selected group is restored from sessionStorage. Do not reject it
       * while the authorized group list is still empty during page refresh;
       * doing so clears the stored ID and incorrectly selects the first group.
       */
      return;
    }

    setSelectedConversationId((current) => {
      const currentIsAuthorizedOfficialGroup = officialGroupConversations.some(
        (conversation) => conversation.id === current,
      );

      return currentIsAuthorizedOfficialGroup
        ? current
        : (officialGroupConversations[0]?.id ?? null);
    });
  }, [announcementMode, conversationLoading, officialGroupConversations]);

  useEffect(() => {
    void loadMessageRequests();
  }, [loadMessageRequests]);

  useEffect(() => {
    if (!starredMode) {
      return;
    }

    setSelectedConversationId(null);
    setSelectedRequestId(null);
    setDetailsPanelOpen(false);
    setConversationSearch("");
  }, [starredMode]);

  useEffect(() => {
    if (starredMode) {
      void loadStarredMessages();
    }
  }, [loadStarredMessages, starredMode]);

  useEffect(() => {
    if (!requestMode) {
      return;
    }

    setSelectedConversationId(null);
    setSelectedRequestId(null);
    setDetailsPanelOpen(false);
    setConversationSearch("");
    setRequestError(null);
  }, [requestMode]);

  useEffect(() => {
    if (
      selectedRequestId &&
      ![...messageRequests.received, ...messageRequests.sent].some(
        (request) => request.id === selectedRequestId,
      )
    ) {
      setSelectedRequestId(null);
    }
  }, [messageRequests.received, messageRequests.sent, selectedRequestId]);

  useEffect(() => {
    if (
      !announcementMode ||
      !selectedConversationId ||
      selectedConversation?.groupKind !== "OFFICIAL"
    ) {
      // Invalidate a slower request from the previously selected group.
      announcementLoadRequestRef.current += 1;
      setAnnouncementItems([]);
      setAnnouncementError(null);
      setAnnouncementLoading(false);
      return;
    }

    void loadSelectedGroupAnnouncements(selectedConversationId);
  }, [
    announcementMode,
    loadSelectedGroupAnnouncements,
    selectedConversation?.groupKind,
    selectedConversationId,
  ]);

  useEffect(() => {
    if (!announcementComposerNotice) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => setAnnouncementComposerNotice(null),
      5000,
    );
    return () => window.clearTimeout(timeoutId);
  }, [announcementComposerNotice]);

  useEffect(() => {
    setReplyingTo(null);
    setEditingMessage(null);

    setNewMessageCount(0);
    setShowJumpToLatest(false);
    setPinnedMessageBrowserOpen(false);
    setActivePinnedMessageIndex(0);
    messageListNearBottomRef.current = true;
    pendingOlderScrollRestoreRef.current = null;

    const conversationThreadUnavailable =
      announcementMode ||
      settingsMode ||
      ownProfileMode ||
      newConversationMode ||
      createGroupMode ||
      listManagementMode;

    if (!selectedConversationId || conversationThreadUnavailable) {
      setMessageText("");
      setMessages([]);
      setPinnedMessages([]);
      draftConversationIdRef.current = null;
      pendingBottomScrollConversationIdRef.current = null;
      previousScrollConversationIdRef.current = null;
      previousMessageCountRef.current = 0;
      return;
    }

    // A normal fresh/opened conversation owns its initial bottom position. Search
    // and other explicit message-focus navigation are allowed to target an older
    // message instead of being pulled back to the latest content. Once the user
    // has moved to another conversation, an unconsumed old focus target is stale
    // and must not suppress the next normal fresh-open bottom anchor.
    if (
      pendingSearchResultRef.current &&
      pendingSearchResultRef.current.conversation.id !== selectedConversationId
    ) {
      pendingSearchResultRef.current = null;
    }

    pendingBottomScrollConversationIdRef.current =
      pendingSearchResultRef.current?.conversation.id === selectedConversationId
        ? null
        : selectedConversationId;
    previousScrollConversationIdRef.current = null;
    previousMessageCountRef.current = 0;

    void loadMessages(selectedConversationId);
    void loadPinnedMessages(selectedConversationId);
  }, [
    announcementMode,
    createGroupMode,
    listManagementMode,
    loadMessages,
    loadPinnedMessages,
    newConversationMode,
    ownProfileMode,
    selectedConversationId,
    settingsMode,
  ]);

  useLayoutEffect(() => {
    if (sendingMessage) {
      return;
    }

    const pendingConversationId =
      pendingComposerRefocusConversationIdRef.current;

    if (!pendingConversationId) {
      return;
    }

    pendingComposerRefocusConversationIdRef.current = null;

    if (pendingConversationId !== selectedConversationId) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const composer = composerRef.current;

      if (composer && !composer.disabled) {
        composer.focus({ preventScroll: true });
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [sendingMessage, selectedConversationId]);

  function scrollMessageThreadToBottom(
    behavior: ScrollBehavior = "auto",
  ): void {
    const element = messageListRef.current;

    if (!element) {
      return;
    }

    if (behavior === "smooth") {
      element.scrollTo({
        top: element.scrollHeight,
        behavior,
      });
    } else {
      element.scrollTop = element.scrollHeight;
    }

    messageListNearBottomRef.current = true;
    setShowJumpToLatest(false);
    setNewMessageCount(0);
  }

  function releaseInitialMessageBottomAnchor(): void {
    if (
      selectedConversationIdRef.current &&
      pendingBottomScrollConversationIdRef.current ===
        selectedConversationIdRef.current
    ) {
      pendingBottomScrollConversationIdRef.current = null;
    }

    if (initialBottomReanchorFrameRef.current !== null) {
      window.cancelAnimationFrame(initialBottomReanchorFrameRef.current);
      initialBottomReanchorFrameRef.current = null;
    }
  }

  function captureMessageThreadMutationAnchor(): void {
    const element = messageListRef.current;
    const conversationId = selectedConversationIdRef.current;

    if (!element || !conversationId) {
      return;
    }

    if (pendingBottomScrollConversationIdRef.current === conversationId) {
      /*
       * Fresh-open/refresh owns the bottom until the user really interacts with
       * the thread. Read/status/socket updates can arrive immediately after a
       * conversation opens; they must not replace that bottom lock with an old
       * visible-message anchor before late media finishes sizing.
       */
      pendingThreadMutationAnchorRef.current = null;
      return;
    }

    const containerRect = element.getBoundingClientRect();
    const anchors = Array.from(
      element.querySelectorAll<HTMLElement>("[data-message-id]"),
    )
      .filter((messageElement) => {
        const rect = messageElement.getBoundingClientRect();
        return (
          rect.bottom > containerRect.top && rect.top < containerRect.bottom
        );
      })
      .slice(0, 4)
      .map((messageElement) => ({
        messageId: messageElement.dataset.messageId ?? "",
        offsetTop:
          messageElement.getBoundingClientRect().top - containerRect.top,
      }))
      .filter((anchor) => anchor.messageId.length > 0);

    pendingThreadMutationAnchorRef.current = {
      conversationId,
      scrollTop: element.scrollTop,
      anchors,
    };
  }

  function restorePendingMessageThreadMutationAnchor(): boolean {
    const element = messageListRef.current;
    const pendingAnchor = pendingThreadMutationAnchorRef.current;
    const conversationId = selectedConversationIdRef.current;

    if (
      !element ||
      !pendingAnchor ||
      !conversationId ||
      pendingAnchor.conversationId !== conversationId
    ) {
      return false;
    }

    const containerTop = element.getBoundingClientRect().top;
    let restored = false;

    for (const anchor of pendingAnchor.anchors) {
      const messageElement = element.querySelector<HTMLElement>(
        `[data-message-id="${anchor.messageId}"]`,
      );

      if (!messageElement) {
        continue;
      }

      const nextOffsetTop =
        messageElement.getBoundingClientRect().top - containerTop;
      element.scrollTop = restoreAnchoredMessageScrollTop(
        pendingAnchor.scrollTop,
        anchor.offsetTop,
        nextOffsetTop,
      );
      restored = true;
      break;
    }

    if (!restored) {
      element.scrollTop = Math.min(
        pendingAnchor.scrollTop,
        Math.max(0, element.scrollHeight - element.clientHeight),
      );
    }

    pendingThreadMutationAnchorRef.current = null;
    const nearBottom = isMessageThreadNearBottom(
      element.scrollHeight,
      element.scrollTop,
      element.clientHeight,
    );
    messageListNearBottomRef.current = nearBottom;
    setShowJumpToLatest(!nearBottom);

    return true;
  }

  function handleMessageThreadScroll(): void {
    const element = messageListRef.current;

    if (!element) {
      return;
    }

    const pendingInitialBottomAnchor =
      Boolean(selectedConversationIdRef.current) &&
      pendingBottomScrollConversationIdRef.current ===
        selectedConversationIdRef.current;
    const nearBottom = isMessageThreadNearBottom(
      element.scrollHeight,
      element.scrollTop,
      element.clientHeight,
    );
    const pendingOlderScrollRestore = pendingOlderScrollRestoreRef.current;

    if (pendingOlderScrollRestore) {
      pendingOlderScrollRestore.scrollHeight = element.scrollHeight;
      pendingOlderScrollRestore.scrollTop = element.scrollTop;
    }

    // A browser refresh can restore the scrollTop of a nested scroll container
    // after React's layout work. While a fresh conversation is still waiting
    // for its final post-paint anchor, ignore that browser-restored position so
    // it cannot turn an old message/attachment into the new scroll baseline.
    if (pendingInitialBottomAnchor) {
      /*
       * Browsers can restore a nested scroll container after React's initial
       * layout and even after a couple of animation frames. Ignoring that
       * scroll event leaves the thread at the restored old attachment. While a
       * fresh-open bottom lock is active, actively correct any late restored
       * position back to the real bottom. The first genuine user interaction
       * releases this lock through releaseInitialMessageBottomAnchor().
       */
      if (!nearBottom && initialBottomReanchorFrameRef.current === null) {
        initialBottomReanchorFrameRef.current = window.requestAnimationFrame(
          () => {
            initialBottomReanchorFrameRef.current = null;

            const activeThread = messageListRef.current;
            const activeConversationId = selectedConversationIdRef.current;

            if (
              !activeThread ||
              !activeConversationId ||
              pendingBottomScrollConversationIdRef.current !==
                activeConversationId
            ) {
              return;
            }

            activeThread.scrollTop = activeThread.scrollHeight;
            messageListNearBottomRef.current = true;
            setShowJumpToLatest(false);
            setNewMessageCount(0);
          },
        );
      }

      messageListNearBottomRef.current = true;
      setShowJumpToLatest(false);
      setNewMessageCount(0);
      return;
    }

    messageListNearBottomRef.current = nearBottom;
    setShowJumpToLatest(!nearBottom);

    if (nearBottom) {
      setNewMessageCount(0);
    }
  }

  function jumpToLatestMessages(): void {
    const prefersReducedMotion =
      messagingCustomization.reduceMotion ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (selectedConversationIdRef.current) {
      // Keep the true bottom anchored while any not-yet-loaded attachment in the
      // latest message finishes sizing. The next real user interaction releases
      // this lock immediately.
      pendingBottomScrollConversationIdRef.current =
        selectedConversationIdRef.current;
    }

    scrollMessageThreadToBottom(prefersReducedMotion ? "auto" : "smooth");
  }

  function handleMessageMediaLayoutReady(): void {
    const conversationId = selectedConversationIdRef.current;

    if (
      !conversationId ||
      pendingBottomScrollConversationIdRef.current !== conversationId
    ) {
      return;
    }

    /*
     * Protected attachment previews are loaded lazily. Image/video intrinsic
     * dimensions are therefore unknown when the initial message page is first
     * anchored. ResizeObserver remains a general safety net, but the media
     * element itself is the authoritative signal that its final layout is now
     * available. Re-anchor only while fresh-open/jump-to-latest follow mode is
     * active; a real user scroll releases that mode, so reading older history
     * is never pulled back to the newest message.
     */
    if (initialBottomReanchorFrameRef.current !== null) {
      return;
    }

    initialBottomReanchorFrameRef.current = window.requestAnimationFrame(() => {
      initialBottomReanchorFrameRef.current = null;

      if (
        selectedConversationIdRef.current !== conversationId ||
        pendingBottomScrollConversationIdRef.current !== conversationId
      ) {
        return;
      }

      scrollMessageThreadToBottom();
    });
  }

  useLayoutEffect(() => {
    if (messageLoading || olderMessagesLoading) {
      return;
    }

    const element = messageListRef.current;

    if (!element) {
      return;
    }

    const messagesBelongToSelectedConversation =
      !selectedConversationId ||
      messages.length === 0 ||
      messages.every(
        (message) => message.conversationId === selectedConversationId,
      );

    if (!messagesBelongToSelectedConversation) {
      return;
    }

    const pendingOlderScrollRestore = pendingOlderScrollRestoreRef.current;

    if (
      !pendingOlderScrollRestore &&
      pendingBottomScrollConversationIdRef.current !== selectedConversationId &&
      restorePendingMessageThreadMutationAnchor()
    ) {
      previousScrollConversationIdRef.current = selectedConversationId;
      previousMessageCountRef.current = messages.length;
      return;
    }

    if (
      pendingOlderScrollRestore &&
      pendingOlderScrollRestore.conversationId === selectedConversationId
    ) {
      element.scrollTop = restorePrependedMessageScrollTop(
        pendingOlderScrollRestore.scrollTop,
        pendingOlderScrollRestore.scrollHeight,
        element.scrollHeight,
      );
      pendingOlderScrollRestoreRef.current = null;
      messageListNearBottomRef.current = false;
      previousScrollConversationIdRef.current = selectedConversationId;
      previousMessageCountRef.current = messages.length;
      return;
    }

    const conversationChanged =
      previousScrollConversationIdRef.current !== selectedConversationId;
    const messageCountIncreased =
      messages.length > previousMessageCountRef.current;
    const viewerWasNearBottom = messageListNearBottomRef.current;
    const pendingInitialBottomScroll =
      Boolean(selectedConversationId) &&
      pendingBottomScrollConversationIdRef.current === selectedConversationId &&
      messages.length > 0;
    const preserveScrollForFocusedMessage =
      pendingFocusedMessageScrollRef.current !== null;
    const shouldScrollToBottom =
      pendingInitialBottomScroll ||
      conversationChanged ||
      (messageCountIncreased &&
        viewerWasNearBottom &&
        !preserveScrollForFocusedMessage);

    if (shouldScrollToBottom) {
      // Anchor before paint so a freshly opened conversation never flashes an
      // arbitrary position. The initial anchor remains pending until the
      // post-paint pass below, because browsers may restore nested scrollTop
      // after this layout effect during a hard refresh.
      scrollMessageThreadToBottom();
    }

    previousScrollConversationIdRef.current = selectedConversationId;
    previousMessageCountRef.current = messages.length;

    if (preserveScrollForFocusedMessage) {
      pendingFocusedMessageScrollRef.current = null;
    }
  }, [messageLoading, messages, olderMessagesLoading, selectedConversationId]);

  useEffect(() => {
    if (
      messageLoading ||
      olderMessagesLoading ||
      !selectedConversationId ||
      messages.length === 0 ||
      pendingBottomScrollConversationIdRef.current !== selectedConversationId
    ) {
      return undefined;
    }

    // Run after two paint opportunities. This deliberately comes after the
    // layout-time anchor so browser scroll restoration on refresh cannot win
    // the race and leave the thread at an older text/attachment. Two animation
    // frames are short and deterministic, unlike the old multi-second retries.
    let finalFrameId: number | null = null;
    const frameId = window.requestAnimationFrame(() => {
      finalFrameId = window.requestAnimationFrame(() => {
        if (
          selectedConversationIdRef.current !== selectedConversationId ||
          pendingBottomScrollConversationIdRef.current !==
            selectedConversationId
        ) {
          return;
        }

        // Keep the fresh-open bottom lock active after this paint. It is
        // released by the user's first wheel/touch/pointer/keyboard interaction,
        // which lets late image/video/audio sizing stay anchored to the true end.
        scrollMessageThreadToBottom();
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (finalFrameId !== null) {
        window.cancelAnimationFrame(finalFrameId);
      }
    };
  }, [
    messageLoading,
    messages.length,
    olderMessagesLoading,
    selectedConversationId,
  ]);

  useLayoutEffect(() => {
    if (
      pendingBottomScrollConversationIdRef.current !== selectedConversationId
    ) {
      restorePendingMessageThreadMutationAnchor();
    }
  }, [editingMessage, replyingTo, selectedConversationId]);

  useEffect(() => {
    const element = messageListRef.current;
    const content = messageThreadContentRef.current;

    if (!element || !content || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const keepBottomAnchored = (): void => {
      const initialBottomAnchorPending =
        pendingBottomScrollConversationIdRef.current === selectedConversationId;

      if (
        (!initialBottomAnchorPending && !messageListNearBottomRef.current) ||
        pendingOlderScrollRestoreRef.current ||
        pendingFocusedMessageScrollRef.current
      ) {
        return;
      }

      if (messageResizeFrameRef.current !== null) {
        return;
      }

      messageResizeFrameRef.current = window.requestAnimationFrame(() => {
        messageResizeFrameRef.current = null;

        const initialBottomAnchorStillPending =
          pendingBottomScrollConversationIdRef.current ===
          selectedConversationId;

        if (
          selectedConversationIdRef.current !== selectedConversationId ||
          (!initialBottomAnchorStillPending &&
            !messageListNearBottomRef.current)
        ) {
          return;
        }

        element.scrollTop = element.scrollHeight;
        messageListNearBottomRef.current = true;
      });
    };

    const observer = new ResizeObserver(keepBottomAnchored);
    observer.observe(element);
    observer.observe(content);

    return () => {
      observer.disconnect();
      if (messageResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(messageResizeFrameRef.current);
        messageResizeFrameRef.current = null;
      }
    };
  }, [selectedConversationId]);

  useEffect(() => {
    if (!highlightedMessageId) {
      return undefined;
    }

    if (
      selectedConversationId &&
      pendingBottomScrollConversationIdRef.current === selectedConversationId
    ) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const messageElement = messageListRef.current?.querySelector(
        `[data-message-id="${highlightedMessageId}"]`,
      );

      // Search/starred/storage/notification navigation focuses the exact
      // authorized result once. Consume that target after it is found so a
      // later normal chat switch is not mistaken for another old-message jump.
      if (messageElement) {
        messageElement.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });

        if (
          pendingSearchResultRef.current?.message.id === highlightedMessageId
        ) {
          pendingSearchResultRef.current = null;
        }
      }
    }, 120);

    const clearTimer = window.setTimeout(() => {
      if (pendingSearchResultRef.current?.message.id === highlightedMessageId) {
        pendingSearchResultRef.current = null;
      }
      setHighlightedMessageId(null);
    }, 3200);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(clearTimer);
    };
  }, [highlightedMessageId, messages, selectedConversationId]);

  useEffect(() => {
    if (!newConversationOpen || !accessToken) {
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      setContactsLoading(true);

      searchMessagingContacts(accessToken, contactSearch, 30)
        .then((response) => {
          if (active) {
            setContacts(response.data);
            setContactError(null);
          }
        })
        .catch((error) => {
          if (active) {
            setContactError(
              error instanceof Error
                ? error.message
                : t("feedback.contactsLoadError"),
            );
          }
        })
        .finally(() => {
          if (active) {
            setContactsLoading(false);
          }
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [accessToken, contactSearch, newConversationOpen, t]);

  useEffect(() => {
    const createPersonalGroupOpen =
      createGroupMode && groupKind !== "OFFICIAL";
    const managePersonalGroupOpen =
      groupDialogMode === "MANAGE" &&
      selectedConversation?.groupKind !== "OFFICIAL";

    if (
      !accessToken ||
      (!createPersonalGroupOpen && !managePersonalGroupOpen)
    ) {
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      setGroupContactsLoading(true);

      searchMessagingContacts(
        accessToken,
        groupSearch,
        groupSearch.trim() ? 20 : 8,
      )
        .then((response) => {
          if (active) {
            setGroupContacts(response.data);
            setGroupError(null);
          }
        })
        .catch((error) => {
          if (active) {
            setGroupError(
              error instanceof Error
                ? error.message
                : t("feedback.groupContactsLoadError"),
            );
          }
        })
        .finally(() => {
          if (active) {
            setGroupContactsLoading(false);
          }
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    accessToken,
    createGroupMode,
    groupDialogMode,
    groupKind,
    groupSearch,
    selectedConversation?.groupKind,
    t,
  ]);

  useEffect(() => {
    if (!privateGroupDialogOpen || !accessToken) {
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      setPrivateGroupContactsLoading(true);

      searchMessagingContacts(accessToken, privateGroupSearch, 50)
        .then((response) => {
          if (active) {
            setPrivateGroupContacts(response.data);
            setPrivateGroupError(null);
          }
        })
        .catch((error) => {
          if (active) {
            setPrivateGroupError(
              error instanceof Error
                ? error.message
                : t("feedback.privateGroupContactsLoadError"),
            );
          }
        })
        .finally(() => {
          if (active) {
            setPrivateGroupContactsLoading(false);
          }
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [accessToken, privateGroupDialogOpen, privateGroupSearch, t]);

  useEffect(() => {
    if (
      !announcementComposerOpen ||
      announcementComposerMode !== "CREATE" ||
      !accessToken
    ) {
      return undefined;
    }

    let active = true;
    setAnnouncementAudienceLoading(true);
    listAnnouncementAudiences(accessToken)
      .then((response) => {
        if (!active) return;
        setAnnouncementAudienceOptions(response.data);
        setAnnouncementComposerValues((current) => ({
          ...current,
          officeId: response.data.office.id,
          officialConversationId:
            current.officialConversationId || announcementComposerGroupId || "",
        }));
      })
      .catch((error) => {
        if (active) {
          setAnnouncementComposerError(
            error instanceof Error
              ? error.message
              : t("feedback.announcementAudienceLoadError"),
          );
        }
      })
      .finally(() => {
        if (active) setAnnouncementAudienceLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    accessToken,
    announcementComposerGroupId,
    announcementComposerMode,
    announcementComposerOpen,
    t,
  ]);

  useEffect(() => {
    if (!accessToken) {
      setOfficialGroupScopes([]);
      setOfficialGroupCanCreate(false);
      setOfficialGroupCanReconcileAll(false);
      return undefined;
    }

    let active = true;
    setOfficialGroupScopesLoading(true);

    listOfficialGroupScopes(accessToken)
      .then((response) => {
        if (!active) {
          return;
        }

        const v3Scopes = response.scopes.filter(
          (scope) =>
            scope.scopeType === "OFFICE" || scope.scopeType === "ORG_UNIT",
        );

        setOfficialGroupCanCreate(response.canCreate && v3Scopes.length > 0);
        setOfficialGroupCanReconcileAll(response.canReconcileAll);
        setOfficialGroupScopes(v3Scopes);
        setOfficialGroupScopeKey((current) =>
          v3Scopes.some((scope) => scope.key === current)
            ? current
            : (v3Scopes[0]?.key ?? ""),
        );
      })
      .catch((error) => {
        if (active) {
          setOfficialGroupCanCreate(false);
          setOfficialGroupCanReconcileAll(false);
          setOfficialGroupScopes([]);
          if (groupDialogMode === "CREATE") {
            setGroupError(
              error instanceof Error
                ? error.message
                : t("feedback.officialScopesLoadError"),
            );
          }
        }
      })
      .finally(() => {
        if (active) {
          setOfficialGroupScopesLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, groupDialogMode, t]);

  useEffect(() => {
    if (
      groupDialogMode !== "MANAGE" ||
      !accessToken ||
      selectedConversation?.groupKind !== "OFFICIAL" ||
      !selectedConversation.canManageGroup
    ) {
      setOfficialGroupAudit([]);
      return undefined;
    }

    let active = true;
    setOfficialGroupAuditLoading(true);

    listOfficialGroupAudit(accessToken, selectedConversation.id, 30)
      .then((response) => {
        if (active) {
          setOfficialGroupAudit(response.data);
        }
      })
      .catch((error) => {
        if (active) {
          setGroupError(
            error instanceof Error
              ? error.message
              : t("feedback.officialAuditLoadError"),
          );
        }
      })
      .finally(() => {
        if (active) {
          setOfficialGroupAuditLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    accessToken,
    groupDialogMode,
    selectedConversation?.canManageGroup,
    selectedConversation?.groupKind,
    selectedConversation?.id,
    t,
  ]);

  useEffect(() => {
    if (
      groupDialogMode !== "MANAGE" ||
      !accessToken ||
      selectedConversation?.type !== "GROUP" ||
      selectedConversation.groupKind !== "PERSONAL" ||
      !selectedConversation.canManageGroup
    ) {
      setGroupInviteLink(null);
      setGroupInviteError(null);
      setGroupInviteNotice(null);
      return undefined;
    }

    let active = true;
    setGroupInviteLoading(true);

    // Loads the current active invitation link when an admin opens group info.
    getGroupInvitationLink(accessToken, selectedConversation.id)
      .then((response) => {
        if (active) {
          setGroupInviteLink(response.data);
          setGroupInviteError(null);
        }
      })
      .catch((error) => {
        if (active) {
          setGroupInviteError(
            error instanceof Error
              ? error.message
              : t("feedback.inviteLoadError"),
          );
        }
      })
      .finally(() => {
        if (active) {
          setGroupInviteLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    accessToken,
    groupDialogMode,
    selectedConversation?.canManageGroup,
    selectedConversation?.groupKind,
    selectedConversation?.id,
    selectedConversation?.type,
    t,
  ]);

  useEffect(() => {
    if (!accessToken || location.pathname !== "/messages") {
      return;
    }

    const params = new URLSearchParams(location.search);
    const conversationId = params.get("conversation")?.trim();
    const messageId = params.get("message")?.trim() ?? null;

    if (!conversationId) {
      return;
    }

    const targetKey = `${conversationId}:${messageId ?? "latest"}`;
    if (pushNavigationTargetRef.current === targetKey) {
      return;
    }

    pushNavigationTargetRef.current = targetKey;
    setPageError(null);

    void (async () => {
      try {
        if (messageId) {
          const target = await getConversationMessageById(
            accessToken,
            conversationId,
            messageId,
          );

          pendingSearchResultRef.current = {
            message: target.data,
            conversation: target.conversation,
            snippet:
              target.data.textContent ??
              t("feedback.notificationMessageFallback"),
            matchedAttachmentFileName: null,
          };
          setConversations((current) =>
            current.some(
              (conversation) => conversation.id === target.conversation.id,
            )
              ? current
              : [target.conversation, ...current],
          );
          setHighlightedMessageId(target.data.id);
        }

        setSelectedConversationId(conversationId);
        navigate("/messages", { replace: true });
      } catch (error) {
        pushNavigationTargetRef.current = null;
        setPageError(
          error instanceof Error
            ? error.message
            : t("feedback.notificationMessageOpenError"),
        );
        navigate("/messages", { replace: true });
      }
    })();
  }, [accessToken, location.pathname, location.search, navigate, t]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const token = new URLSearchParams(location.search).get("invite")?.trim();

    if (!token || groupInviteJoinTokenRef.current === token) {
      return;
    }

    groupInviteJoinTokenRef.current = token;
    setInviteJoinLoading(true);
    setPageError(null);

    // Accepts invitation links opened from copied group invite URLs.
    joinGroupInvitation(accessToken, token)
      .then(async (response) => {
        replaceConversation(response.data);
        setSelectedConversationId(response.data.id);
        setMessageNotice(response.message);
        await loadConversations(true, response.data.id);
        navigate("/messages", { replace: true });
      })
      .catch((error) => {
        groupInviteJoinTokenRef.current = null;
        setPageError(
          error instanceof Error
            ? error.message
            : t("feedback.groupInviteAcceptError"),
        );
        navigate("/messages", { replace: true });
      })
      .finally(() => {
        setInviteJoinLoading(false);
      });
  }, [accessToken, loadConversations, location.search, navigate, t]);

  function resetGroupInviteState(): void {
    setGroupInviteLink(null);
    setGroupInviteLoading(false);
    setGroupInviteNotice(null);
    setGroupInviteError(null);
  }

  async function handleLogout(): Promise<void> {
    setLoggingOut(true);

    try {
      await logout();
      navigate("/login", {
        replace: true,
      });
    } finally {
      setLoggingOut(false);
    }
  }

  function openCreateGroup(): void {
    setActiveUtilityPanel(null);
    setGroupDialogMode("CREATE");
    setGroupKind("PERSONAL");
    setOfficialGroupScopeKey("");
    setOfficialGroupAudit([]);
    setGroupTitle("");
    setGroupDescription("");
    setGroupSearch("");
    setGroupContacts([]);
    setGroupSelectedAccountIds([]);
    setGroupSelectedContacts([]);
    setGroupError(null);
    resetGroupInviteState();
    navigate("/messages/groups/new");
  }

  function openGroupInformation(): void {
    if (!selectedConversation || selectedConversation.type !== "GROUP") {
      return;
    }

    closeMessageSearchPanel();
    clearMessageInformationState();
    sharedContentRequestRef.current += 1;
    setSharedContentOpen(false);
    setConversationActionMenuOpen(false);
    setGroupManagementWorkspaceOpen(false);
    setActiveUtilityPanel(null);
    setProfileReturnToGroupInformation(false);
    setGroupMemberSearch("");
    setGroupMembersExpanded(false);
    setDetailsPanelOpen(true);
  }

  function openManageGroup(): void {
    if (!selectedConversation || selectedConversation.type !== "GROUP") {
      return;
    }

    closeMessageSearchPanel();
    clearMessageInformationState();
    setConversationActionMenuOpen(false);
    setActiveUtilityPanel(null);
    setProfileReturnToGroupInformation(false);
    setDetailsPanelOpen(false);
    setGroupManagementWorkspaceOpen(true);
    setGroupPanelTab("OVERVIEW");
    setGroupDialogMode("MANAGE");
    setGroupKind(selectedConversation.groupKind ?? "PERSONAL");
    setOfficialGroupAudit([]);
    setGroupTitle(selectedConversation.title ?? "");
    setGroupDescription(selectedConversation.description ?? "");
    setGroupSearch("");
    setGroupContacts([]);
    setGroupSelectedAccountIds([]);
    setGroupSelectedContacts([]);
    setGroupError(null);
    resetGroupInviteState();
  }

  function resetGroupDialogState(): void {
    setGroupDialogMode(null);
    setGroupPanelTab("OVERVIEW");
    setOfficialGroupAudit([]);
    setGroupSelectedAccountIds([]);
    setGroupSelectedContacts([]);
    setGroupSearch("");
    setGroupError(null);
    resetGroupInviteState();
  }

  function returnToConversationInformation(): void {
    if (groupSubmitting || groupActionAccountId) {
      return;
    }

    resetGroupDialogState();
    setGroupManagementWorkspaceOpen(false);
    setGroupMemberSearch("");
    setGroupMembersExpanded(false);
    setDetailsPanelOpen(true);
  }

  function closeGroupDialog(): void {
    if (groupSubmitting || groupActionAccountId) {
      return;
    }

    const closingCreateWorkspace =
      createGroupMode || groupDialogMode === "CREATE";
    const closingInformationPanel = groupDialogMode === "MANAGE";

    resetGroupDialogState();

    if (closingCreateWorkspace) {
      navigate("/messages");
    } else if (closingInformationPanel) {
      setGroupManagementWorkspaceOpen(false);
      setDetailsPanelOpen(true);
    }
  }

  function openPrivateGroupDialog(): void {
    if (!selectedConversation || selectedConversation.type !== "PRIVATE") {
      return;
    }

    setConversationActionMenuOpen(false);
    closeMessageSearchPanel();
    setDetailsPanelOpen(false);
    setPrivateGroupDialogOpen(true);
    setPrivateGroupSearch("");
    setPrivateGroupContacts([]);
    setPrivateGroupSelectedAccountIds([]);
    setPrivateGroupSelectedContacts([]);
    setPrivateGroupHistoryWindow("NONE");
    setPrivateGroupError(null);
  }

  function closePrivateGroupDialog(): void {
    if (privateGroupSubmitting) {
      return;
    }

    setPrivateGroupDialogOpen(false);
    setPrivateGroupSearch("");
    setPrivateGroupContacts([]);
    setPrivateGroupSelectedAccountIds([]);
    setPrivateGroupSelectedContacts([]);
    setPrivateGroupHistoryWindow("NONE");
    setPrivateGroupError(null);
    window.requestAnimationFrame(() => {
      conversationActionButtonRef.current?.focus();
    });
  }

  function togglePrivateGroupMember(
    accountId: string,
    contact?: MessagingContact,
  ): void {
    const isSelected = privateGroupSelectedAccountIds.includes(accountId);

    setPrivateGroupSelectedAccountIds((current) =>
      isSelected
        ? current.filter((value) => value !== accountId)
        : [...current, accountId],
    );

    setPrivateGroupSelectedContacts((current) => {
      if (isSelected) {
        return current.filter((value) => value.accountId !== accountId);
      }

      if (!contact || current.some((value) => value.accountId === accountId)) {
        return current;
      }

      return [...current, contact];
    });
  }

  function toggleGroupMember(
    accountId: string,
    contact?: MessagingContact,
  ): void {
    const isSelected = groupSelectedAccountIds.includes(accountId);

    setGroupSelectedAccountIds((current) =>
      isSelected
        ? current.filter((value) => value !== accountId)
        : [...current, accountId],
    );

    // Keep a stable display snapshot so selected people remain visible when
    // the user changes the search query. Membership authorization still uses
    // account IDs and remains enforced by the backend.
    setGroupSelectedContacts((current) => {
      if (isSelected) {
        return current.filter((value) => value.accountId !== accountId);
      }

      if (!contact || current.some((value) => value.accountId === accountId)) {
        return current;
      }

      return [...current, contact];
    });
  }

  function replaceConversation(conversation: MessagingConversation): void {
    setConversations((current) => {
      const remaining = current.filter((item) => item.id !== conversation.id);

      return [conversation, ...remaining];
    });
  }

  async function handleCreateGroup(): Promise<void> {
    if (
      !accessToken ||
      !groupTitle.trim() ||
      groupSubmitting ||
      (groupKind === "PERSONAL" && groupSelectedAccountIds.length === 0) ||
      (groupKind === "OFFICIAL" && !selectedOfficialGroupScope)
    ) {
      return;
    }

    setGroupSubmitting(true);
    setGroupError(null);

    try {
      const response =
        groupKind === "OFFICIAL" && selectedOfficialGroupScope
          ? await createOfficialGroupConversation(accessToken, {
              title: groupTitle.trim(),
              description: groupDescription.trim(),
              scopeType: selectedOfficialGroupScope.scopeType,
              ...(selectedOfficialGroupScope.officeId
                ? {
                    officeId: selectedOfficialGroupScope.officeId,
                  }
                : {}),
              ...(selectedOfficialGroupScope.orgUnitId
                ? {
                    orgUnitId: selectedOfficialGroupScope.orgUnitId,
                  }
                : {}),
              ...(selectedOfficialGroupScope.membershipMode
                ? {
                    membershipMode: selectedOfficialGroupScope.membershipMode,
                  }
                : {}),
            })
          : await createGroupConversation(
              accessToken,
              groupTitle.trim(),
              groupDescription.trim(),
              groupSelectedAccountIds,
            );

      replaceConversation(response.data);
      setSelectedConversationId(response.data.id);
      setMessageNotice(response.message);
      setGroupDialogMode(null);
      await loadConversations(true, response.data.id);
      navigate("/messages");
    } catch (error) {
      setGroupError(
        error instanceof Error ? error.message : t("feedback.groupCreateError"),
      );
    } finally {
      setGroupSubmitting(false);
    }
  }

  async function handleCreatePrivateGroup(): Promise<void> {
    if (
      !accessToken ||
      !selectedConversation ||
      selectedConversation.type !== "PRIVATE" ||
      privateGroupSelectedAccountIds.length === 0 ||
      privateGroupSubmitting
    ) {
      return;
    }

    setPrivateGroupSubmitting(true);
    setPrivateGroupError(null);

    try {
      // M16 creates a new group instead of converting the existing one-to-one chat.
      const response = await createPrivateGroupFromPrivateConversation(
        accessToken,
        selectedConversation.id,
        privateGroupSelectedAccountIds,
        privateGroupHistoryWindow,
      );

      replaceConversation(response.data);
      setSelectedConversationId(response.data.id);
      setMessageNotice(response.message);
      setPrivateGroupDialogOpen(false);
      setPrivateGroupSelectedAccountIds([]);
      setPrivateGroupSelectedContacts([]);
      setPrivateGroupSearch("");
      await loadConversations(true, response.data.id);
      await loadMessages(response.data.id, true);
    } catch (error) {
      setPrivateGroupError(
        error instanceof Error
          ? error.message
          : t("feedback.privateGroupCreateError"),
      );
    } finally {
      setPrivateGroupSubmitting(false);
    }
  }

  async function handleReconcileOfficialGroups(): Promise<void> {
    if (
      !accessToken ||
      !officialGroupCanReconcileAll ||
      officialGroupReconciling
    ) {
      return;
    }

    setOfficialGroupReconciling(true);
    setGroupError(null);

    try {
      const response = await reconcileOfficialGroups(accessToken);
      setMessageNotice(response.message);
      await loadConversations(
        true,
        selectedConversationIdRef.current ?? undefined,
      );

      if (
        selectedConversation?.groupKind === "OFFICIAL" &&
        selectedConversation.canManageGroup
      ) {
        const auditResponse = await listOfficialGroupAudit(
          accessToken,
          selectedConversation.id,
          30,
        );
        setOfficialGroupAudit(auditResponse.data);
      }
    } catch (error) {
      setGroupError(
        error instanceof Error
          ? error.message
          : t("feedback.officialReconcileError"),
      );
    } finally {
      setOfficialGroupReconciling(false);
    }
  }

  async function handleSaveGroupDetails(): Promise<void> {
    if (
      !accessToken ||
      !selectedConversation ||
      selectedConversation.type !== "GROUP" ||
      !groupTitle.trim() ||
      groupSubmitting
    ) {
      return;
    }

    setGroupSubmitting(true);
    setGroupError(null);

    try {
      const response = await updateGroupConversation(
        accessToken,
        selectedConversation.id,
        {
          title: groupTitle.trim(),
          description: groupDescription.trim(),
        },
      );

      replaceConversation(response.data);
      setMessageNotice(response.message);
    } catch (error) {
      setGroupError(
        error instanceof Error
          ? error.message
          : t("feedback.groupDetailsUpdateError"),
      );
    } finally {
      setGroupSubmitting(false);
    }
  }

  async function handleCreateGroupInviteLink(): Promise<void> {
    if (
      !accessToken ||
      !selectedConversation ||
      selectedConversation.type !== "GROUP" ||
      groupInviteLoading
    ) {
      return;
    }

    setGroupInviteLoading(true);
    setGroupInviteNotice(null);
    setGroupInviteError(null);

    try {
      // Generate also resets any older active invite link for this group.
      const response = await createGroupInvitationLink(
        accessToken,
        selectedConversation.id,
      );
      setGroupInviteLink(response.data);
      setGroupInviteNotice(response.message);
    } catch (error) {
      setGroupInviteError(
        error instanceof Error
          ? error.message
          : t("feedback.inviteGenerateError"),
      );
    } finally {
      setGroupInviteLoading(false);
    }
  }

  async function handleCopyGroupInviteLink(): Promise<void> {
    if (!groupInviteUrl) {
      return;
    }

    try {
      await copyTextToClipboard(groupInviteUrl);
      setGroupInviteNotice(t("feedback.inviteCopied"));
      setGroupInviteError(null);
    } catch {
      setGroupInviteError(t("feedback.inviteCopyError"));
    }
  }

  async function handleRevokeGroupInviteLink(): Promise<void> {
    if (
      !accessToken ||
      !selectedConversation ||
      selectedConversation.type !== "GROUP" ||
      groupInviteLoading
    ) {
      return;
    }

    if (!window.confirm(t("feedback.inviteRevokeConfirm"))) {
      return;
    }

    setGroupInviteLoading(true);
    setGroupInviteNotice(null);
    setGroupInviteError(null);

    try {
      const response = await revokeGroupInvitationLink(
        accessToken,
        selectedConversation.id,
      );
      setGroupInviteLink(null);
      setGroupInviteNotice(response.message);
    } catch (error) {
      setGroupInviteError(
        error instanceof Error
          ? error.message
          : t("feedback.inviteRevokeError"),
      );
    } finally {
      setGroupInviteLoading(false);
    }
  }

  async function handleGroupPhotoChange(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (
      !file ||
      !accessToken ||
      !selectedConversation ||
      selectedConversation.type !== "GROUP" ||
      groupPhotoUploading
    ) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setGroupError(t("feedback.groupPhotoType"));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setGroupError(t("feedback.groupPhotoSize"));
      return;
    }

    setGroupPhotoUploading(true);
    setGroupError(null);

    try {
      const response = await updateGroupPhoto(
        accessToken,
        selectedConversation.id,
        file,
      );

      setGroupPhotoUrls((current) => {
        const next = { ...current };
        const existingUrl = next[selectedConversation.id];

        if (existingUrl) {
          URL.revokeObjectURL(existingUrl);
          delete next[selectedConversation.id];
        }

        return next;
      });
      setGroupPhotoCacheKeys((current) => {
        const next = { ...current };
        delete next[selectedConversation.id];
        return next;
      });
      replaceConversation(response.data);
      setMessageNotice(response.message);
    } catch (error) {
      setGroupError(
        error instanceof Error
          ? error.message
          : t("feedback.groupPhotoUpdateError"),
      );
    } finally {
      setGroupPhotoUploading(false);
    }
  }

  async function handleRemoveGroupPhoto(): Promise<void> {
    if (
      !accessToken ||
      !selectedConversation ||
      selectedConversation.type !== "GROUP" ||
      groupPhotoUploading
    ) {
      return;
    }

    if (!window.confirm(t("feedback.groupPhotoRemoveConfirm"))) {
      return;
    }

    setGroupPhotoUploading(true);
    setGroupError(null);

    try {
      const response = await deleteGroupPhoto(
        accessToken,
        selectedConversation.id,
      );

      setGroupPhotoUrls((current) => {
        const next = { ...current };
        const existingUrl = next[selectedConversation.id];

        if (existingUrl) {
          URL.revokeObjectURL(existingUrl);
          delete next[selectedConversation.id];
        }

        return next;
      });
      setGroupPhotoCacheKeys((current) => {
        const next = { ...current };
        delete next[selectedConversation.id];
        return next;
      });
      replaceConversation(response.data);
      setMessageNotice(response.message);
    } catch (error) {
      setGroupError(
        error instanceof Error
          ? error.message
          : t("feedback.groupPhotoRemoveError"),
      );
    } finally {
      setGroupPhotoUploading(false);
    }
  }

  async function handleAddGroupMembers(): Promise<void> {
    if (
      !accessToken ||
      !selectedConversation ||
      selectedConversation.type !== "GROUP" ||
      groupSelectedAccountIds.length === 0 ||
      groupSubmitting
    ) {
      return;
    }

    setGroupSubmitting(true);
    setGroupError(null);

    try {
      const response = await addGroupMembers(
        accessToken,
        selectedConversation.id,
        groupSelectedAccountIds,
      );

      replaceConversation(response.data);
      setGroupSelectedAccountIds([]);
      setGroupSelectedContacts([]);
      setGroupSearch("");
      setMessageNotice(response.message);
    } catch (error) {
      setGroupError(
        error instanceof Error ? error.message : t("feedback.membersAddError"),
      );
    } finally {
      setGroupSubmitting(false);
    }
  }

  async function handleGroupRoleChange(
    accountId: string,
    role: "ADMIN" | "MEMBER",
  ): Promise<void> {
    if (
      !accessToken ||
      !selectedConversation ||
      selectedConversation.type !== "GROUP" ||
      groupActionAccountId
    ) {
      return;
    }

    setGroupActionAccountId(accountId);
    setGroupError(null);

    try {
      const response = await updateGroupMemberRole(
        accessToken,
        selectedConversation.id,
        accountId,
        role,
      );

      replaceConversation(response.data);
      setMessageNotice(response.message);
    } catch (error) {
      setGroupError(
        error instanceof Error ? error.message : t("feedback.memberRoleError"),
      );
    } finally {
      setGroupActionAccountId(null);
    }
  }

  async function handleRemoveGroupMember(accountId: string): Promise<void> {
    if (
      !accessToken ||
      !selectedConversation ||
      selectedConversation.type !== "GROUP" ||
      groupActionAccountId
    ) {
      return;
    }

    if (!window.confirm(t("feedback.memberRemoveConfirm"))) {
      return;
    }

    setGroupActionAccountId(accountId);
    setGroupError(null);

    try {
      const response = await removeGroupMember(
        accessToken,
        selectedConversation.id,
        accountId,
      );

      setMessageNotice(response.message);
      await loadConversations(true, selectedConversation.id);
    } catch (error) {
      setGroupError(
        error instanceof Error
          ? error.message
          : t("feedback.memberRemoveError"),
      );
    } finally {
      setGroupActionAccountId(null);
    }
  }

  async function handleLeaveGroup(conversationId: string): Promise<void> {
    if (!accessToken || groupSubmitting) {
      return;
    }

    setGroupSubmitting(true);
    setGroupError(null);

    try {
      const response = await leaveGroupConversation(
        accessToken,
        conversationId,
      );

      setMessageNotice(response.message);
      setDestructiveConfirmation(null);
      setDestructiveConfirmationError(null);
      setGroupDialogMode(null);
      setSelectedConversationId(null);
      await Promise.all([loadConversations(true), loadChatFolders(true)]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : t("feedback.groupLeaveError");
      setGroupError(errorMessage);
      setDestructiveConfirmationError(errorMessage);
    } finally {
      setGroupSubmitting(false);
    }
  }

  async function handleDeleteGroup(conversationId: string): Promise<void> {
    if (!accessToken || groupSubmitting) {
      return;
    }

    setGroupSubmitting(true);
    setGroupError(null);

    try {
      const response = await deleteGroupConversation(
        accessToken,
        conversationId,
      );

      setMessageNotice(response.message);
      setDestructiveConfirmation(null);
      setDestructiveConfirmationError(null);
      setDetailsPanelOpen(false);
      setGroupManagementWorkspaceOpen(false);
      resetGroupDialogState();
      setSelectedConversationId(null);
      await Promise.all([loadConversations(true), loadChatFolders(true)]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : t("feedback.groupDeleteError");
      setGroupError(errorMessage);
      setDestructiveConfirmationError(errorMessage);
    } finally {
      setGroupSubmitting(false);
    }
  }

  function openNewConversation(): void {
    setActiveUtilityPanel(null);
    setRequestNotice(null);
    setContactSearch("");
    setContacts([]);
    setContactError(null);
    navigate("/messages/new");
  }

  function openCreateList(): void {
    setSelectedConversationId(null);
    setListWorkspaceError(null);
    setListDeleteConfirmOpen(false);
    navigate("/messages/lists/new");
  }

  function openChatFolder(folderId: string): void {
    setSelectedConversationId(null);
    setConversationSearch("");
    setListWorkspaceError(null);
    setListDeleteConfirmOpen(false);
    navigate(`/messages/lists/${folderId}`);
  }

  function openSelectedListManager(): void {
    if (!selectedListId) {
      return;
    }

    setSelectedConversationId(null);
    setDetailsPanelOpen(false);
    setListDeleteConfirmOpen(false);
    setListWorkspaceError(null);
    navigate(`/messages/lists/${selectedListId}/edit`);
  }

  function toggleListConversation(conversationId: string): void {
    setListSelectedConversationIds((current) =>
      current.includes(conversationId)
        ? current.filter((id) => id !== conversationId)
        : [...current, conversationId],
    );
    setListWorkspaceError(null);
  }

  async function handleSaveMessageList(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!accessToken || listSaving) {
      return;
    }

    const name = listNameDraft.trim().replace(/\s+/g, " ");

    if (!name) {
      setListWorkspaceError(t("feedback.listNameRequired"));
      return;
    }

    const duplicate = chatFolders.some(
      (folder) =>
        folder.id !== selectedListId &&
        folder.name.trim().toLocaleLowerCase("en-US") ===
          name.toLocaleLowerCase("en-US"),
    );

    if (duplicate) {
      setListWorkspaceError(t("feedback.listNameDuplicate"));
      return;
    }

    setListSaving(true);
    setListWorkspaceError(null);

    try {
      const input = {
        name,
        conversationIds: listSelectedConversationIds,
      };

      if (listCreateMode) {
        const response = await createChatFolder(accessToken, input);
        await loadChatFolders(true);
        navigate(`/messages/lists/${response.data.id}`);
      } else if (selectedListId) {
        await updateChatFolder(accessToken, selectedListId, input);

        setListNameDraft(name);
        await Promise.all([loadChatFolders(true), loadConversations(true)]);
        navigate(`/messages/lists/${selectedListId}`);
      }
    } catch (error) {
      setListWorkspaceError(
        error instanceof Error ? error.message : t("feedback.listSaveError"),
      );
    } finally {
      setListSaving(false);
    }
  }

  async function handleDeleteMessageList(): Promise<void> {
    if (!accessToken || !selectedListId || listDeleting) {
      return;
    }

    setListDeleting(true);
    setListWorkspaceError(null);

    try {
      await deleteChatFolder(accessToken, selectedListId);
      setChatFolders((current) =>
        current.filter((folder) => folder.id !== selectedListId),
      );
      setSelectedConversationId(null);
      setListDeleteConfirmOpen(false);
      navigate("/messages");
    } catch (error) {
      setListWorkspaceError(
        error instanceof Error ? error.message : t("feedback.listDeleteError"),
      );
    } finally {
      setListDeleting(false);
    }
  }

  function openProfile(
    accountId?: string | null,
    returnToGroupInformation = false,
  ): void {
    if (!accountId) {
      return;
    }

    setProfileError(null);
    setProfileSharedGroupsExpanded(false);

    // Profiles opened from group information replace that panel and keep a
    // real Back destination. Direct-contact profiles are top-level details.
    if (accountId === account?.id && !returnToGroupInformation) {
      setActiveUtilityPanel(null);
      setProfileReturnToGroupInformation(false);
      navigate("/messages/profile");
      return;
    }

    closeMessageSearchPanel();
    clearMessageInformationState();
    sharedContentRequestRef.current += 1;
    setSharedContentOpen(false);
    setProfileData((current) =>
      current?.accountId === accountId ? current : null,
    );
    setProfilePhotoUrl(null);
    setProfileReturnToGroupInformation(returnToGroupInformation);
    setDetailsPanelOpen(true);
    setActiveUtilityPanel({ kind: "PROFILE", accountId });
  }

  function closeUtilityPanel(
    kind: Exclude<ActiveUtilityPanel, null>["kind"],
  ): void {
    setActiveUtilityPanel((current) =>
      current?.kind === kind ? null : current,
    );
  }

  function closeProfile(): void {
    if (ownProfileMode) {
      navigate("/messages");
    } else {
      closeUtilityPanel("PROFILE");
    }

    setProfileData(null);
    setProfileBioDraft("");
    setProfileError(null);
    setProfileReturnToGroupInformation(false);
    setProfileSharedGroupsExpanded(false);
  }

  function closeConversationDetailsPanel(): void {
    if (groupSubmitting || groupActionAccountId) {
      return;
    }

    clearMessageInformationState();
    sharedContentRequestRef.current += 1;
    setSharedContentOpen(false);
    setSharedContentLoading(false);
    setSharedContentError(null);
    setDetailsPanelOpen(false);
    setActiveUtilityPanel(null);
    setProfileReturnToGroupInformation(false);
    setProfileSharedGroupsExpanded(false);
    setGroupMemberSearch("");
    setGroupMembersExpanded(false);
    setProfileData(null);
    setProfileBioDraft("");
    setProfileError(null);

    if (groupDialogMode === "MANAGE") {
      resetGroupDialogState();
    }
  }

  async function handleSaveProfileBio(): Promise<void> {
    if (!accessToken || !profileData?.isOwnProfile) {
      return;
    }

    setProfileSaving(true);
    setProfileError(null);

    try {
      // Users can update display bio only; official identity fields remain read-only.
      const response = await updateMyMessagingProfile(
        accessToken,
        profileBioDraft,
      );
      setProfileData(response.data);
      setOwnProfileAccount(response.data);
      setProfileBioDraft(response.data.profileBio ?? "");
      await loadConversations(true, selectedConversationId ?? undefined);
    } catch (error) {
      setProfileError(
        error instanceof Error
          ? error.message
          : t("feedback.profileUpdateError"),
      );
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleProfilePhotoChange(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!accessToken || !file || !profileData?.isOwnProfile) {
      return;
    }

    setProfilePhotoUploading(true);
    setProfileError(null);

    try {
      // Profile-photo upload uses the same protected API approach as message media.
      const response = await updateMyMessagingProfilePhoto(accessToken, file);
      refreshAvatar({
        accountId: response.data.accountId,
        employeeId: response.data.employee?.id,
      });
      setProfileData(response.data);
      setOwnProfileAccount(response.data);
      setProfilePhotoUrls((current) => {
        const previousUrl = current[response.data.accountId];
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl);
        }

        const { [response.data.accountId]: _removed, ...rest } = current;
        void _removed;
        return rest;
      });
      setProfilePhotoCacheKeys((current) => {
        const { [response.data.accountId]: _removed, ...rest } = current;
        void _removed;
        return rest;
      });
      setProfilePhotoRefreshKey((current) => current + 1);
      await loadConversations(true, selectedConversationId ?? undefined);
      if (selectedConversationId) {
        await loadMessages(selectedConversationId, true);
      }
    } catch (error) {
      setProfileError(
        error instanceof Error
          ? error.message
          : t("feedback.profilePhotoUploadError"),
      );
    } finally {
      setProfilePhotoUploading(false);
    }
  }

  async function handleRemoveProfilePhoto(): Promise<void> {
    if (!accessToken || !profileData?.isOwnProfile) {
      return;
    }

    setProfilePhotoUploading(true);
    setProfileError(null);

    try {
      // Removing the display photo must update every avatar source without touching official identity.
      const response = await deleteMyMessagingProfilePhoto(accessToken);
      refreshAvatar({
        accountId: response.data.accountId,
        employeeId: response.data.employee?.id,
      });
      setProfileData(response.data);
      setOwnProfileAccount(response.data);
      setProfilePhotoUrl(null);
      setProfilePhotoUrls((current) => {
        const previousUrl = current[response.data.accountId];
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl);
        }

        const { [response.data.accountId]: _removed, ...rest } = current;
        void _removed;
        return rest;
      });
      setProfilePhotoCacheKeys((current) => {
        const { [response.data.accountId]: _removed, ...rest } = current;
        void _removed;
        return rest;
      });
      setProfilePhotoRefreshKey((current) => current + 1);
      await loadConversations(true, selectedConversationId ?? undefined);
      if (selectedConversationId) {
        await loadMessages(selectedConversationId, true);
      }
    } catch (error) {
      setProfileError(
        error instanceof Error
          ? error.message
          : t("feedback.profilePhotoRemoveError"),
      );
    } finally {
      setProfilePhotoUploading(false);
    }
  }

  async function handleStartProfileConversation(): Promise<void> {
    if (!accessToken || !profileData || profileData.isOwnProfile) {
      return;
    }

    const selectedPrivatePeer = selectedConversation
      ? conversationPeerFor(selectedConversation)
      : undefined;

    // If this profile already belongs to the open private conversation, the
    // Message action closes the full details rail and returns focus to the
    // existing composer. Closing only the profile utility would leave
    // detailsPanelOpen=true and preserve an empty third grid column.
    if (
      selectedConversation?.type === "PRIVATE" &&
      selectedPrivatePeer?.accountId === profileData.accountId
    ) {
      closeConversationDetailsPanel();
      window.requestAnimationFrame(() => composerRef.current?.focus());
      return;
    }

    if (profileData.contactMode === "REQUEST_RECEIVED") {
      closeProfile();
      openMessageRequests("RECEIVED");
      return;
    }

    if (
      profileData.contactMode === "REQUEST_SENT" ||
      profileData.contactMode === "BLOCKED"
    ) {
      return;
    }

    setProfileSaving(true);
    setProfileError(null);

    try {
      const response = await createPrivateConversation(
        accessToken,
        profileData.accountId,
      );

      if (response.outcome === "CONVERSATION") {
        setConversations((current) => {
          const withoutConversation = current.filter(
            (conversation) => conversation.id !== response.data.id,
          );

          return [response.data, ...withoutConversation];
        });

        setSelectedConversationId(response.data.id);
        await loadConversations(true, response.data.id);
        closeConversationDetailsPanel();
        window.requestAnimationFrame(() => composerRef.current?.focus());
      } else {
        setProfileError(response.message);
        await loadMessageRequests(true);
      }
    } catch (error) {
      setProfileError(
        error instanceof Error
          ? error.message
          : t("feedback.conversationStartError"),
      );
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleCreateConversation(
    contact: MessagingContact,
  ): Promise<void> {
    if (!accessToken) {
      return;
    }

    if (contact.contactMode === "REQUEST_RECEIVED") {
      openMessageRequests("RECEIVED");
      return;
    }

    if (
      contact.contactMode === "REQUEST_SENT" ||
      contact.contactMode === "BLOCKED"
    ) {
      return;
    }

    setCreatingConversationId(contact.accountId);
    setContactError(null);

    try {
      const response = await createPrivateConversation(
        accessToken,
        contact.accountId,
      );

      if (response.outcome === "CONVERSATION") {
        setConversations((current) => {
          const withoutConversation = current.filter(
            (conversation) => conversation.id !== response.data.id,
          );

          return [response.data, ...withoutConversation];
        });

        setSelectedConversationId(response.data.id);
        setRequestNotice(null);
        await loadConversations(true, response.data.id);
      } else {
        setRequestNotice(response.message);
        await loadMessageRequests(true);
      }

      navigate("/messages");
      setContactSearch("");
    } catch (error) {
      setContactError(
        error instanceof Error
          ? error.message
          : t("feedback.conversationStartError"),
      );
    } finally {
      setCreatingConversationId(null);
    }
  }

  function openMessageRequests(view: "RECEIVED" | "SENT" = "RECEIVED"): void {
    setRequestError(null);
    setRequestListView(view);
    setSelectedRequestId(null);
    setConversationSearch("");
    navigate("/messages/requests");
    void loadMessageRequests();
  }

  function openNotificationsWorkspace(): void {
    setActiveUtilityPanel(null);
    setConversationSearch("");
    setNotificationListView("ALL");
    navigate("/messages/notifications");
  }

  function openSettingsWorkspace(
    tab: MessagingSettingsTab = settingsTab,
  ): void {
    setActiveUtilityPanel(null);
    setConversationSearch("");
    setSettingsTab(tab);
    navigate("/messages/settings");
  }

  async function handleNotificationClick(
    notification: MessagingNotification,
  ): Promise<void> {
    if (!accessToken) {
      return;
    }

    try {
      const response = await markMessagingNotificationRead(
        accessToken,
        notification.id,
      );
      setNotifications(response.data);
      setNotificationUnreadCount(response.unreadCount);
    } catch {
      // Opening the related conversation is still useful even if read-state sync fails.
    }

    if (notification.announcementId) {
      navigate(
        `/messages/announcements?announcement=${notification.announcementId}`,
      );
      return;
    }

    const metadata = notificationMetadataRecord(notification.metadata);

    if (notification.type === "WORK_ITEM") {
      const ticketNumber =
        typeof metadata?.ticketNumber === "string"
          ? metadata.ticketNumber
          : null;
      const employeeTarget = ticketNumber
        ? `/employee/work?ticket=${encodeURIComponent(ticketNumber)}`
        : "/employee/work";

      navigate(
        account?.role === "EMPLOYEE" ? employeeTarget : "/work-management",
      );
      return;
    }

    if (notification.type === "DUTY") {
      navigate(
        account?.accountClass === "SUPER_ADMIN"
          ? "/super-admin"
          : account?.role === "EMPLOYEE"
            ? "/employee/duty"
            : "/my-duty",
      );
      return;
    }

    if (notification.conversationId) {
      if (notification.messageId) {
        try {
          const target = await getConversationMessageById(
            accessToken,
            notification.conversationId,
            notification.messageId,
          );

          pendingSearchResultRef.current = {
            message: target.data,
            conversation: target.conversation,
            snippet: notification.body,
            matchedAttachmentFileName: null,
          };
          setConversations((current) =>
            current.some(
              (conversation) => conversation.id === target.conversation.id,
            )
              ? current
              : [target.conversation, ...current],
          );
          setHighlightedMessageId(target.data.id);
        } catch {
          // The conversation can still open when an old/deleted target is unavailable.
          setHighlightedMessageId(notification.messageId);
        }
      }

      setSelectedConversationId(notification.conversationId);
      navigate("/messages");
    }
  }

  async function handleMarkAllNotificationsRead(): Promise<void> {
    if (!accessToken || notificationBulkAction || notificationDeletingId) {
      return;
    }

    setNotificationBulkAction("MARK_ALL_READ");
    setNotificationError(null);
    setNotificationActionNotice(null);

    try {
      const response = await markAllMessagingNotificationsRead(accessToken);
      setNotifications(response.data);
      setNotificationUnreadCount(response.unreadCount);
      setNotificationActionNotice(t("feedback.notificationsMarkedRead"));
    } catch (error) {
      setNotificationError(
        error instanceof Error
          ? error.message
          : t("feedback.notificationsMarkReadError"),
      );
    } finally {
      setNotificationBulkAction(null);
    }
  }

  async function handleDeleteNotification(
    notification: MessagingNotification,
  ): Promise<void> {
    if (!accessToken || notificationBulkAction || notificationDeletingId) {
      return;
    }

    setNotificationDeletingId(notification.id);
    setNotificationError(null);
    setNotificationActionNotice(null);

    try {
      // Delete only the current user's notification row and refresh the unread
      // badge from the server. The existing list is preserved on failure.
      const response = await deleteMessagingNotification(
        accessToken,
        notification.id,
      );
      setNotifications(response.data);
      setNotificationUnreadCount(response.unreadCount);
      setNotificationActionNotice(t("feedback.notificationRemoved"));

      if (notificationToast?.id === notification.id) {
        setNotificationToast(null);
      }
    } catch (error) {
      setNotificationError(
        error instanceof Error
          ? error.message
          : t("feedback.notificationRemoveError"),
      );
    } finally {
      setNotificationDeletingId(null);
    }
  }

  async function handleDeleteReadNotifications(): Promise<void> {
    if (
      !accessToken ||
      notificationBulkAction ||
      notificationDeletingId ||
      !notifications.some((notification) => notification.isRead)
    ) {
      return;
    }

    setNotificationBulkAction("DELETE_READ");
    setNotificationError(null);
    setNotificationActionNotice(null);

    try {
      // Remove seen notifications while leaving unread alerts visible for action.
      const response = await deleteReadMessagingNotifications(accessToken);
      setNotifications(response.data);
      setNotificationUnreadCount(response.unreadCount);
      setNotificationActionNotice(t("feedback.seenNotificationsRemoved"));
    } catch (error) {
      setNotificationError(
        error instanceof Error
          ? error.message
          : t("feedback.seenNotificationsRemoveError"),
      );
    } finally {
      setNotificationBulkAction(null);
    }
  }

  function updateMessagingCustomization(
    changes: Partial<MessagingCustomization>,
  ): void {
    setMessagingCustomization((current) => ({
      ...current,
      ...changes,
    }));
  }

  function resetMessagingCustomization(): void {
    setMessagingCustomization(DEFAULT_MESSAGING_CUSTOMIZATION);
  }

  function updateMessagingSettings(changes: Partial<MessagingSettings>): void {
    setMessagingSettings((current) => ({
      ...current,
      ...changes,
    }));

    const accountChanges: {
      showOnlineStatus?: boolean;
      showReadReceipts?: boolean;
      requireMessageRequests?: boolean;
    } = {};

    if (typeof changes.showOnlineStatus === "boolean") {
      accountChanges.showOnlineStatus = changes.showOnlineStatus;
    }

    if (typeof changes.showReadReceipts === "boolean") {
      accountChanges.showReadReceipts = changes.showReadReceipts;
    }

    if (typeof changes.requireMessageRequests === "boolean") {
      accountChanges.requireMessageRequests = changes.requireMessageRequests;
    }

    if (!accessToken || Object.keys(accountChanges).length === 0) {
      return;
    }

    const mutationSequence = settingsMutationSequenceRef.current + 1;
    settingsMutationSequenceRef.current = mutationSequence;
    setMessagingSettingsSaving(true);
    setMessagingSettingsError(null);
    setMessagingSettingsNotice(null);

    void updateMessagingPrivacySettings(accessToken, accountChanges)
      .then((response) => {
        if (settingsMutationSequenceRef.current !== mutationSequence) {
          return;
        }

        const confirmed = {
          showOnlineStatus: response.data.showOnlineStatus,
          showReadReceipts: response.data.showReadReceipts,
          requireMessageRequests: response.data.requireMessageRequests,
        };
        confirmedAccountSettingsRef.current = confirmed;
        setMessagingSettings((current) => ({
          ...current,
          ...confirmed,
        }));
        setMessagingSettingsNotice(t("feedback.privacySaved"));
      })
      .catch((error) => {
        if (settingsMutationSequenceRef.current !== mutationSequence) {
          return;
        }

        // The server is authoritative. Restore the last confirmed account state
        // when a privacy mutation fails instead of leaving a misleading toggle.
        setMessagingSettings((current) => ({
          ...current,
          ...confirmedAccountSettingsRef.current,
        }));
        setMessagingSettingsError(
          error instanceof Error
            ? error.message
            : t("feedback.privacySaveError"),
        );
      })
      .finally(() => {
        if (settingsMutationSequenceRef.current === mutationSequence) {
          setMessagingSettingsSaving(false);
        }
      });
  }

  function resetPrivacySettings(): void {
    updateMessagingSettings({
      showOnlineStatus: DEFAULT_MESSAGING_SETTINGS.showOnlineStatus,
      showReadReceipts: DEFAULT_MESSAGING_SETTINGS.showReadReceipts,
      requireMessageRequests: DEFAULT_MESSAGING_SETTINGS.requireMessageRequests,
    });
  }

  function resetNotificationSettings(): void {
    setMessagingSettings((current) => ({
      ...current,
      notificationPreview: DEFAULT_MESSAGING_SETTINGS.notificationPreview,
      muteAllNotifications: DEFAULT_MESSAGING_SETTINGS.muteAllNotifications,
    }));
    setNotificationSoundEnabled(true);
    setBrowserNotificationsEnabled(false);
    setMessagingSettingsError(null);
    setMessagingSettingsNotice(t("feedback.notificationDefaultsRestored"));
  }

  async function handleBrowserNotificationToggle(): Promise<void> {
    setMessagingSettingsError(null);
    setMessagingSettingsNotice(null);

    if (!messagingPushSupported()) {
      setBrowserNotificationsEnabled(false);
      setBackgroundPushReady(false);
      setMessagingSettingsError(t("feedback.browserNotificationsUnsupported"));
      return;
    }

    if (!browserNotificationsEnabled) {
      // Browser permission must be requested from a direct user action.
      const permission = await window.Notification.requestPermission();
      if (permission !== "granted") {
        setBrowserNotificationsEnabled(false);
        setBackgroundPushReady(false);
        setMessagingSettingsNotice(
          t("feedback.browserNotificationsPermissionBlocked"),
        );
        return;
      }

      if (!accessToken) {
        setMessagingSettingsError(t("feedback.sessionNotReady"));
        return;
      }

      try {
        const ready = await syncMessagingPushSubscription(accessToken, {
          showPreview: messagingSettings.notificationPreview,
          isMuted: messagingSettings.muteAllNotifications,
        });
        setBrowserNotificationsEnabled(ready);
        setBackgroundPushReady(ready);
        setMessagingSettingsNotice(
          ready
            ? t("feedback.browserNotificationsEnabled")
            : t("feedback.browserNotificationsServerMissing"),
        );
      } catch (error) {
        setBrowserNotificationsEnabled(false);
        setBackgroundPushReady(false);
        setMessagingSettingsError(
          error instanceof Error
            ? error.message
            : t("feedback.browserNotificationsEnableError"),
        );
      }
      return;
    }

    if (accessToken) {
      await disableMessagingPushSubscription(accessToken).catch(
        () => undefined,
      );
    }
    setBrowserNotificationsEnabled(false);
    setBackgroundPushReady(false);
    setMessagingSettingsNotice(t("feedback.browserNotificationsDisabled"));
  }

  async function handleLogoutAllDevices(): Promise<void> {
    if (!accessToken || securityAction) {
      return;
    }

    if (!window.confirm(t("messageSettings.security.signOutAllConfirm"))) {
      return;
    }

    setSecurityAction("SIGN_OUT_ALL");
    setSecurityError(null);
    setSecurityNotice(null);

    try {
      const response = await logoutAllAuth(accessToken);
      setSecurityNotice(
        t("messageSettings.security.signedOutSessions", {
          count: response.revokedSessions,
        }),
      );
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      setSecurityError(
        error instanceof Error ? error.message : t("feedback.signOutAllError"),
      );
    } finally {
      setSecurityAction(null);
    }
  }

  function openMessageSearchPanel(): void {
    if (!selectedConversationId) {
      return;
    }

    if (searchPanelOpen) {
      messageSearchInputRef.current?.focus();
      messageSearchInputRef.current?.select();
      return;
    }

    const activeElement = document.activeElement;
    messageSearchReturnFocusRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : messageSearchTriggerRef.current;

    setConversationActionMenuOpen(false);
    clearMessageInformationState();
    setDetailsPanelOpen(false);
    setSearchError(null);
    setSearchPanelOpen(true);
  }

  function openSearchMessageResult(result: MessagingSearchMessageResult): void {
    pendingSearchResultRef.current = result;
    pendingBottomScrollConversationIdRef.current = null;

    if (
      result.conversation.id === selectedConversationId &&
      !messageIdsRef.current.has(result.message.id)
    ) {
      // Search may return an older authorized message outside the currently
      // loaded page. Add that exact result to the thread before focusing it.
      pendingFocusedMessageScrollRef.current = result.message.id;
      messageIdsRef.current.add(result.message.id);
      setMessages((current) =>
        [...current, result.message].sort(
          (first, second) =>
            new Date(first.sentAt).getTime() -
            new Date(second.sentAt).getTime(),
        ),
      );
    }

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 900px)").matches
    ) {
      closeMessageSearchPanel();
    }

    setHighlightedMessageId(result.message.id);
    setSelectedConversationId(result.conversation.id);
    setConversations((current) => {
      if (
        current.some(
          (conversation) => conversation.id === result.conversation.id,
        )
      ) {
        return current;
      }

      return [result.conversation, ...current];
    });
  }

  async function handleAcceptRequest(
    request: MessagingMessageRequest,
  ): Promise<void> {
    if (!accessToken || requestActionId) {
      return;
    }

    setRequestActionId(request.id);
    setRequestError(null);

    try {
      const response = await acceptMessageRequest(accessToken, request.id);

      setRequestNotice(response.message);
      navigate("/messages");
      setSelectedConversationId(response.data.id);
      await Promise.all([
        loadMessageRequests(true),
        loadConversations(true, response.data.id),
      ]);
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : t("feedback.requestAcceptError"),
      );
    } finally {
      setRequestActionId(null);
    }
  }

  async function handleDeclineRequest(
    request: MessagingMessageRequest,
  ): Promise<void> {
    if (!accessToken || requestActionId) {
      return;
    }

    setRequestActionId(request.id);
    setRequestError(null);

    try {
      const response = await declineMessageRequest(accessToken, request.id);

      setRequestNotice(response.message);
      setSelectedRequestId((current) =>
        current === request.id ? null : current,
      );
      await Promise.all([loadMessageRequests(true), loadBlockedAccounts()]);
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : t("feedback.requestDeclineError"),
      );
    } finally {
      setRequestActionId(null);
    }
  }

  async function handleBlockRequest(
    request: MessagingMessageRequest,
  ): Promise<void> {
    if (!accessToken || requestActionId) {
      return;
    }

    setRequestActionId(request.id);
    setRequestError(null);

    try {
      const response = await blockMessageRequest(accessToken, request.id);

      setRequestNotice(response.message);
      setSelectedRequestId((current) =>
        current === request.id ? null : current,
      );
      await Promise.all([loadMessageRequests(true), loadBlockedAccounts()]);
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : t("feedback.requestBlockError"),
      );
    } finally {
      setRequestActionId(null);
    }
  }

  async function handleBlockAccount(target: MessagingAccount): Promise<void> {
    if (!accessToken || blockActionAccountId) {
      return;
    }

    setBlockActionAccountId(target.accountId);
    setBlockSettingsError(null);
    setBlockSettingsNotice(null);
    setProfileError(null);

    try {
      const response = await blockMessagingAccount(
        accessToken,
        target.accountId,
      );
      setBlockSettingsNotice(response.message);
      setDestructiveConfirmation(null);
      setDestructiveConfirmationError(null);
      await loadBlockedAccounts();

      if (profileData?.accountId === target.accountId) {
        setProfileData((current) =>
          current
            ? {
                ...current,
                contactMode: "BLOCKED",
                blockDirection: "BLOCKED_BY_ME",
              }
            : current,
        );
      }

      setContacts((current) =>
        current.map((contact) =>
          contact.accountId === target.accountId
            ? {
                ...contact,
                contactMode: "BLOCKED",
                blockDirection: "BLOCKED_BY_ME",
              }
            : contact,
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("feedback.accountBlockError");
      setBlockSettingsError(message);
      setProfileError(message);
      setDestructiveConfirmationError(message);
    } finally {
      setBlockActionAccountId(null);
    }
  }

  async function handleUnblockAccount(targetAccountId: string): Promise<void> {
    if (!accessToken || blockActionAccountId) {
      return;
    }

    setBlockActionAccountId(targetAccountId);
    setBlockSettingsError(null);
    setBlockSettingsNotice(null);
    setProfileError(null);

    try {
      const response = await unblockMessagingAccount(
        accessToken,
        targetAccountId,
      );
      setBlockSettingsNotice(response.message);
      await loadBlockedAccounts();

      if (profileData?.accountId === targetAccountId) {
        const refreshed = await getMessagingProfile(
          accessToken,
          targetAccountId,
        );
        setProfileData(refreshed.data);
      }

      setContacts((current) =>
        current.map((contact) =>
          contact.accountId === targetAccountId
            ? {
                ...contact,
                contactMode: "DIRECT",
                blockDirection: null,
              }
            : contact,
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("feedback.accountUnblockError");
      setBlockSettingsError(message);
      setProfileError(message);
    } finally {
      setBlockActionAccountId(null);
    }
  }

  function focusComposer(): void {
    window.setTimeout(() => {
      composerRef.current?.focus();
    }, 0);
  }

  function clearVoiceRecordingTimer(): void {
    if (voiceRecordingTimerRef.current !== null) {
      window.clearInterval(voiceRecordingTimerRef.current);
      voiceRecordingTimerRef.current = null;
    }
  }

  function stopVoiceRecorderStream(): void {
    voiceRecorderStreamRef.current
      ?.getTracks()
      .forEach((track) => track.stop());
    voiceRecorderStreamRef.current = null;
  }

  function resetVoiceRecordingState(): void {
    clearVoiceRecordingTimer();
    stopVoiceRecorderStream();
    voiceRecorderRef.current = null;
    voiceRecorderChunksRef.current = [];
    voiceRecordingStartedAtRef.current = 0;
    setVoiceRecordingState("IDLE");
    setVoiceRecordingSeconds(0);
  }

  async function beginVoiceRecording(): Promise<void> {
    if (sendingMessage || editingMessage || voiceRecordingState !== "IDLE") {
      return;
    }

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setMessageError(t("feedback.voiceUnsupported"));
      return;
    }

    try {
      clearSelectedAttachment();
      setMessageError(null);
      // Microphone access must be explicit before the browser can record a voice note.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredVoiceNoteMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );

      voiceRecordingCancelledRef.current = false;
      voiceRecorderStreamRef.current = stream;
      voiceRecorderRef.current = recorder;
      voiceRecorderChunksRef.current = [];

      // MediaRecorder provides small chunks that are merged after the user stops recording.
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          voiceRecorderChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const chunks = voiceRecorderChunksRef.current;
        const recordedMimeType = recorder.mimeType || mimeType || "audio/webm";

        if (voiceRecordingCancelledRef.current) {
          resetVoiceRecordingState();
          return;
        }

        resetVoiceRecordingState();

        if (chunks.length === 0) {
          setMessageError(t("feedback.voiceEmpty"));
          return;
        }

        const blob = new Blob(chunks, { type: recordedMimeType });

        if (blob.size > MAX_AUDIO_ATTACHMENT_BYTES) {
          setMessageError(t("feedback.voiceTooLarge"));
          return;
        }

        const file = new File(
          [blob],
          `voice-note-${new Date().toISOString().replace(/[:.]/g, "-")}.${voiceNoteExtension(recordedMimeType)}`,
          { type: recordedMimeType },
        );

        // Store the recorded audio as one attachment with a voice-note marker.
        setSelectedAttachments([createSelectedComposerAttachment(file)]);
        setSelectedAttachmentKind("VOICE_NOTE");
        resetAttachmentUpload();
        window.requestAnimationFrame(() => composerRef.current?.focus());
      };

      // A one-second timeslice keeps longer recordings responsive without manual polling.
      recorder.start(1000);
      voiceRecordingStartedAtRef.current = Date.now();
      setVoiceRecordingSeconds(0);
      setVoiceRecordingState("RECORDING");
      voiceRecordingTimerRef.current = window.setInterval(() => {
        setVoiceRecordingSeconds(
          Math.floor((Date.now() - voiceRecordingStartedAtRef.current) / 1000),
        );
      }, 500);
    } catch (error) {
      resetVoiceRecordingState();
      setMessageError(
        error instanceof Error
          ? error.message
          : t("feedback.microphonePermission"),
      );
    }
  }

  function finishVoiceRecording(): void {
    // Stop triggers MediaRecorder.onstop, which converts chunks into an uploadable File.
    if (voiceRecorderRef.current?.state === "recording") {
      setVoiceRecordingState("STOPPING");
      clearVoiceRecordingTimer();
      voiceRecorderRef.current.stop();
    }
  }

  function cancelVoiceRecording(): void {
    // Cancel stops the microphone without creating a draft attachment.
    if (voiceRecorderRef.current?.state === "recording") {
      voiceRecordingCancelledRef.current = true;
      voiceRecorderRef.current.stop();
      return;
    }

    resetVoiceRecordingState();
  }

  function clearLiveLocationWatch(): void {
    if (
      liveLocationWatchIdRef.current !== null &&
      navigator.geolocation?.clearWatch
    ) {
      navigator.geolocation.clearWatch(liveLocationWatchIdRef.current);
      liveLocationWatchIdRef.current = null;
    }

    if (liveLocationExpiryTimerRef.current !== null) {
      window.clearTimeout(liveLocationExpiryTimerRef.current);
      liveLocationExpiryTimerRef.current = null;
    }

    liveLocationLastUpdateAtRef.current = 0;
  }

  function getCurrentBrowserPosition(): Promise<GeolocationPosition> {
    if (!navigator.geolocation) {
      return Promise.reject(new Error(t("feedback.locationUnsupported")));
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        () => reject(new Error(t("feedback.locationPermission"))),
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 15000,
        },
      );
    });
  }

  function applySentLocationMessage(message: MessagingMessage): void {
    setMessages((current) => {
      if (current.some((item) => item.id === message.id)) {
        return current;
      }

      return [...current, message];
    });

    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === message.conversationId
          ? {
              ...conversation,
              lastMessage: message,
              lastMessageAt: message.sentAt,
              updatedAt: message.updatedAt,
            }
          : conversation,
      ),
    );
  }

  function startLiveLocationWatch(
    conversationId: string,
    messageId: string,
    expiresAt: string,
  ): void {
    if (!accessToken || !navigator.geolocation) {
      return;
    }

    clearLiveLocationWatch();
    const expiresAtMs = new Date(expiresAt).getTime();

    liveLocationExpiryTimerRef.current = window.setTimeout(
      () => {
        clearLiveLocationWatch();
        setActiveLiveLocation(null);
        setMessageNotice(t("feedback.liveLocationExpired"));
      },
      Math.max(0, expiresAtMs - Date.now()),
    );

    liveLocationWatchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        if (!accessToken) {
          return;
        }

        if (Date.now() >= expiresAtMs) {
          clearLiveLocationWatch();
          setActiveLiveLocation(null);
          return;
        }

        if (Date.now() - liveLocationLastUpdateAtRef.current < 10000) {
          return;
        }

        liveLocationLastUpdateAtRef.current = Date.now();

        void updateConversationLiveLocationMessage(
          accessToken,
          conversationId,
          messageId,
          browserPositionToLocationInput(position),
        )
          .then((response) => {
            setMessages((current) =>
              applyMessageUpdate(current, response.data),
            );
            setConversations((current) =>
              current.map((conversation) =>
                conversation.id === response.data.conversationId &&
                conversation.lastMessage?.id === response.data.id
                  ? {
                      ...conversation,
                      lastMessage: response.data,
                      updatedAt: response.data.updatedAt,
                    }
                  : conversation,
              ),
            );
          })
          .catch(() => {
            setMessageNotice(t("feedback.liveLocationUpdateFailed"));
          });
      },
      () => {
        setMessageNotice(t("feedback.liveLocationInterrupted"));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      },
    );
  }

  async function handleShareCurrentLocation(): Promise<void> {
    if (
      !accessToken ||
      !selectedConversationId ||
      sendingMessage ||
      editingMessage ||
      voiceRecordingState !== "IDLE"
    ) {
      return;
    }

    setLocationActionLoading("CURRENT");
    setMessageError(null);

    try {
      const position = await getCurrentBrowserPosition();
      const attemptKey = `${selectedConversationId}:CURRENT`;
      const sendAttempt = resolveMessagingSendAttempt(
        locationSendAttemptRef.current,
        attemptKey,
      );
      locationSendAttemptRef.current = sendAttempt;
      const response = await sendConversationLocationMessage(
        accessToken,
        selectedConversationId,
        sendAttempt.clientMessageId,
        {
          ...browserPositionToLocationInput(position),
          live: false,
        },
      );

      applySentLocationMessage(response.data);
      await loadConversations(true);
      if (locationSendAttemptRef.current?.key === attemptKey) {
        locationSendAttemptRef.current = null;
      }
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : t("feedback.currentLocationError"),
      );
    } finally {
      setLocationActionLoading(null);
    }
  }

  async function handleStartLiveLocation(): Promise<void> {
    if (
      !accessToken ||
      !selectedConversationId ||
      sendingMessage ||
      editingMessage ||
      voiceRecordingState !== "IDLE"
    ) {
      return;
    }

    setLocationActionLoading("LIVE");
    setMessageError(null);

    try {
      const position = await getCurrentBrowserPosition();
      const attemptKey = `${selectedConversationId}:LIVE:${locationDurationMinutes}`;
      const sendAttempt = resolveMessagingSendAttempt(
        locationSendAttemptRef.current,
        attemptKey,
      );
      locationSendAttemptRef.current = sendAttempt;
      const response = await sendConversationLocationMessage(
        accessToken,
        selectedConversationId,
        sendAttempt.clientMessageId,
        {
          ...browserPositionToLocationInput(position),
          live: true,
          liveDurationMinutes: locationDurationMinutes,
        },
      );
      const location = getMessageLocationPayload(response.data);

      applySentLocationMessage(response.data);

      if (location?.liveExpiresAt) {
        setActiveLiveLocation({
          conversationId: selectedConversationId,
          messageId: response.data.id,
          expiresAt: location.liveExpiresAt,
        });
        startLiveLocationWatch(
          selectedConversationId,
          response.data.id,
          location.liveExpiresAt,
        );
      }

      await loadConversations(true);
      if (locationSendAttemptRef.current?.key === attemptKey) {
        locationSendAttemptRef.current = null;
      }
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : t("feedback.liveLocationStartError"),
      );
    } finally {
      setLocationActionLoading(null);
    }
  }

  async function handleStopLiveLocation(
    message?: MessagingMessage,
  ): Promise<void> {
    if (!accessToken) {
      return;
    }

    const conversationId =
      message?.conversationId ?? activeLiveLocation?.conversationId;
    const messageId = message?.id ?? activeLiveLocation?.messageId;

    if (!conversationId || !messageId) {
      return;
    }

    setLocationActionLoading("STOP");
    setMessageError(null);

    try {
      const response = await stopConversationLiveLocationMessage(
        accessToken,
        conversationId,
        messageId,
      );

      captureMessageThreadMutationAnchor();
      setMessages((current) => applyMessageUpdate(current, response.data));
      clearLiveLocationWatch();
      setActiveLiveLocation(null);
      setMessageNotice(t("feedback.liveLocationStopped"));
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : t("feedback.liveLocationStopError"),
      );
    } finally {
      setLocationActionLoading(null);
    }
  }

  function updateAttachmentUploadProgress(
    progress: AttachmentUploadProgress,
  ): void {
    setAttachmentUpload({
      status: "UPLOADING",
      progressPercent: progress.progressPercent,
      loadedBytes: progress.loadedBytes,
      totalBytes: progress.totalBytes,
      error: null,
    });
  }

  function removeSelectedAttachment(attachmentId: string): void {
    const removed = selectedAttachments.find(
      (attachment) => attachment.id === attachmentId,
    );

    if (removed?.previewUrl) {
      URL.revokeObjectURL(removed.previewUrl);
    }

    const next = selectedAttachments.filter(
      (attachment) => attachment.id !== attachmentId,
    );
    setSelectedAttachments(next);

    if (next.length === 0) {
      setSelectedAttachmentKind("FILE");
    }

    resetAttachmentUpload();
    setSendAttemptFailed(false);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  function openAttachmentPicker(acceptedTypes: readonly string[]): void {
    const input = attachmentInputRef.current;

    if (!input) {
      return;
    }

    input.accept = acceptedTypes.join(",");
    input.value = "";
    input.click();
    setAttachmentMenuOpen(false);
    setAttachmentMenuView("ROOT");
  }

  function insertComposerEmoji(emoji: string): void {
    const composer = composerRef.current;
    const startIndex = composer?.selectionStart ?? composerCaretIndex;
    const endIndex = composer?.selectionEnd ?? startIndex;
    const nextText = `${messageText.slice(0, startIndex)}${emoji}${messageText.slice(endIndex)}`;
    const nextCaretIndex = startIndex + emoji.length;

    setMessageText(nextText);
    setComposerCaretIndex(nextCaretIndex);
    setSendAttemptFailed(false);
    setComposerEmojiOpen(false);

    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(nextCaretIndex, nextCaretIndex);
    });

    if (selectedConversationId) {
      updateLocalTyping(selectedConversationId, nextText);
    }
  }

  function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";

    if (files.length === 0) {
      window.requestAnimationFrame(() => composerRef.current?.focus());
      return;
    }

    if (
      selectedAttachmentKind === "VOICE_NOTE" &&
      selectedAttachments.length > 0
    ) {
      setMessageError(t("feedback.voiceAttachmentConflict"));
      window.requestAnimationFrame(() => composerRef.current?.focus());
      return;
    }

    const validationError = files
      .map(selectedAttachmentValidationError)
      .find((error): error is string => Boolean(error));

    if (validationError) {
      setMessageError(validationError);
      window.requestAnimationFrame(() => composerRef.current?.focus());
      return;
    }

    if (
      selectedAttachments.length + files.length >
      MAX_MESSAGE_ATTACHMENT_FILES
    ) {
      setMessageError(
        t("feedback.maxAttachments", { count: MAX_MESSAGE_ATTACHMENT_FILES }),
      );
      window.requestAnimationFrame(() => composerRef.current?.focus());
      return;
    }

    const currentTotalBytes = selectedAttachments.reduce(
      (total, attachment) => total + attachment.file.size,
      0,
    );
    const addedBytes = files.reduce((total, file) => total + file.size, 0);

    if (currentTotalBytes + addedBytes > MAX_MESSAGE_ATTACHMENT_TOTAL_BYTES) {
      setMessageError(t("feedback.attachmentTotalTooLarge"));
      window.requestAnimationFrame(() => composerRef.current?.focus());
      return;
    }

    const addedAttachments = files.map(createSelectedComposerAttachment);
    setSelectedAttachments([...selectedAttachments, ...addedAttachments]);
    setSelectedAttachmentKind("FILE");
    resetAttachmentUpload();
    setMessageError(null);
    setSendAttemptFailed(false);

    // The system file picker temporarily takes focus. Returning it to the
    // textarea makes Enter-to-send work immediately after file selection.
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  async function handleDownloadAttachment(
    message: MessagingMessage,
    attachment: MessagingAttachment,
  ): Promise<void> {
    if (!accessToken) {
      return;
    }

    setMessageError(null);

    try {
      await downloadConversationAttachment(
        accessToken,
        message.conversationId,
        message.id,
        attachment.id,
        attachment.originalFileName,
      );
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : t("feedback.attachmentDownloadMessageError"),
      );
    }
  }

  async function handleDownloadMessageAttachments(
    message: MessagingMessage,
  ): Promise<void> {
    const attachments = message.attachments ?? [];

    // Keep bulk downloads behind the same authenticated download service used
    // by individual files; no protected media URL is exposed to the browser UI.
    for (const attachment of attachments) {
      await handleDownloadAttachment(message, attachment);
    }
  }

  function closeAttachmentViewer(): void {
    const returnFocus = attachmentViewerReturnFocusRef.current;
    attachmentViewerRequestRef.current += 1;

    setAttachmentViewer((current) => {
      if (current?.objectUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(current.objectUrl);
      }

      return null;
    });

    attachmentViewerReturnFocusRef.current = null;
    window.requestAnimationFrame(() => {
      if (returnFocus?.isConnected) {
        returnFocus.focus();
      }
    });
  }

  async function handlePreviewAttachment(
    message: MessagingMessage,
    attachment: MessagingAttachment,
  ): Promise<void> {
    if (!accessToken || !canPreviewAttachment(attachment)) {
      return;
    }

    if (!attachmentViewer) {
      const activeElement = document.activeElement;
      attachmentViewerReturnFocusRef.current =
        activeElement instanceof HTMLElement ? activeElement : null;
    }

    const requestId = attachmentViewerRequestRef.current + 1;
    attachmentViewerRequestRef.current = requestId;

    setMessageError(null);
    setAttachmentViewer((current) => {
      if (current?.objectUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(current.objectUrl);
      }

      return {
        message,
        attachment,
        objectUrl: null,
        loading: true,
        error: null,
      };
    });

    try {
      const objectUrl =
        isVideoAttachment(attachment) || isAudioAttachment(attachment)
          ? await createConversationAttachmentStreamUrl(
              accessToken,
              message.conversationId,
              message.id,
              attachment.id,
            )
          : await createConversationAttachmentObjectUrl(
              accessToken,
              message.conversationId,
              message.id,
              attachment.id,
            );

      if (attachmentViewerRequestRef.current !== requestId) {
        if (objectUrl.startsWith("blob:")) {
          URL.revokeObjectURL(objectUrl);
        }
        return;
      }

      setAttachmentViewer({
        message,
        attachment,
        objectUrl,
        loading: false,
        error: null,
      });
    } catch (error) {
      if (attachmentViewerRequestRef.current !== requestId) {
        return;
      }

      setAttachmentViewer({
        message,
        attachment,
        objectUrl: null,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : t("feedback.attachmentPreviewLoadError"),
      });
    }
  }

  async function handleReaction(
    message: MessagingMessage,
    reactionValue: string,
  ): Promise<void> {
    if (!accessToken || message.isDeleted || reactionActionId) {
      return;
    }

    setReactionActionId(`${message.id}:${reactionValue}`);
    setMessageError(null);

    try {
      const response = await reactToMessage(
        accessToken,
        message.conversationId,
        message.id,
        reactionValue,
      );

      captureMessageThreadMutationAnchor();
      setMessages((current) => applyMessageUpdate(current, response.data));
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === response.data.conversationId &&
          conversation.lastMessage?.id === response.data.id
            ? {
                ...conversation,
                lastMessage: response.data,
              }
            : conversation,
        ),
      );
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : t("feedback.reactionUpdateError"),
      );
    } finally {
      setReactionActionId(null);
    }
  }

  async function handleStarMessage(message: MessagingMessage): Promise<void> {
    if (!accessToken || message.isDeleted || messageActionId !== null) {
      return;
    }

    setMessageActionId(message.id);
    setMessageError(null);
    setMessageNotice(null);

    try {
      const response = message.isStarred
        ? await unstarConversationMessage(
            accessToken,
            message.conversationId,
            message.id,
          )
        : await starConversationMessage(
            accessToken,
            message.conversationId,
            message.id,
          );

      captureMessageThreadMutationAnchor();
      setMessages((current) => applyMessageUpdate(current, response.data));
      setPinnedMessages((current) =>
        applyMessageUpdate(current, response.data),
      );
      setStarredItems((current) => {
        if (!response.data.isStarred) {
          return current.filter((item) => item.message.id !== response.data.id);
        }

        if (!selectedConversation || !response.data.starredAt) {
          return current;
        }

        const nextItem: StarredMessageItem = {
          starredAt: response.data.starredAt,
          message: response.data,
          conversation: selectedConversation,
        };
        const withoutMessage = current.filter(
          (item) => item.message.id !== response.data.id,
        );

        return [nextItem, ...withoutMessage];
      });
      setMessageNotice(response.message);
    } catch (error) {
      setMessageError(
        error instanceof Error ? error.message : t("feedback.starUpdateError"),
      );
    } finally {
      setMessageActionId(null);
    }
  }

  async function handlePinMessage(message: MessagingMessage): Promise<void> {
    if (!accessToken || message.isDeleted || pinActionId !== null) {
      return;
    }

    setPinActionId(message.id);
    setMessageError(null);
    setMessageNotice(null);

    try {
      const response = message.isPinned
        ? await unpinConversationMessage(
            accessToken,
            message.conversationId,
            message.id,
          )
        : await pinConversationMessage(
            accessToken,
            message.conversationId,
            message.id,
          );

      captureMessageThreadMutationAnchor();
      setMessages((current) => applyMessageUpdate(current, response.data));
      setPinnedMessages((current) => {
        if (response.data.isPinned) {
          const withoutCurrent = current.filter(
            (item) => item.id !== response.data.id,
          );
          return [response.data, ...withoutCurrent];
        }

        return current.filter((item) => item.id !== response.data.id);
      });
      setMessageNotice(response.message);
    } catch (error) {
      setMessageError(
        error instanceof Error ? error.message : t("feedback.pinUpdateError"),
      );
    } finally {
      setPinActionId(null);
    }
  }

  async function focusReplySource(message: MessagingMessage): Promise<void> {
    if (
      !accessToken ||
      !message.replyTo ||
      message.replyTo.isDeleted ||
      messageActionId
    ) {
      return;
    }

    setMessageError(null);

    try {
      const response = await getConversationMessageById(
        accessToken,
        message.conversationId,
        message.replyTo.id,
      );

      // Replies may reference an older page; temporarily merge the authorized
      // source message so the thread can scroll to and highlight it.
      setMessages((current) =>
        current.some((item) => item.id === response.data.id)
          ? current
          : [...current, response.data].sort(
              (first, second) =>
                new Date(first.sentAt).getTime() -
                new Date(second.sentAt).getTime(),
            ),
      );
      setHighlightedMessageId(response.data.id);
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : t("feedback.replyMissingError"),
      );
    }
  }

  function closePinnedMessageBrowser(): void {
    setPinnedMessageBrowserOpen(false);
  }

  function movePinnedMessageSelection(offset: number): void {
    if (visiblePinnedMessages.length < 2) {
      return;
    }

    setActivePinnedMessageIndex((current) => {
      const normalizedCurrent = Math.min(
        current,
        visiblePinnedMessages.length - 1,
      );

      return (
        (normalizedCurrent + offset + visiblePinnedMessages.length) %
        visiblePinnedMessages.length
      );
    });
  }

  function focusPinnedMessage(message: MessagingMessage): void {
    if (message.isDeleted) {
      return;
    }

    closePinnedMessageBrowser();

    if (message.conversationId !== selectedConversationId) {
      setSelectedConversationId(message.conversationId);
      return;
    }

    // A pinned message can be outside the current page. Merge the authorized
    // server result before scrolling so the pin browser never reveals hidden data.
    pendingBottomScrollConversationIdRef.current = null;
    pendingFocusedMessageScrollRef.current = message.id;
    setMessages((current) =>
      current.some((item) => item.id === message.id)
        ? current
        : [...current, message].sort(
            (first, second) =>
              new Date(first.sentAt).getTime() -
              new Date(second.sentAt).getTime(),
          ),
    );
    setHighlightedMessageId(message.id);
  }

  // Returns to the chat and highlights the authorized source message.
  function focusSharedContentMessage(message: MessagingMessage): void {
    sharedContentRequestRef.current += 1;
    setSharedContentOpen(false);
    setSharedContentLoading(false);
    setDetailsPanelOpen(false);
    setActiveUtilityPanel(null);
    setProfileReturnToGroupInformation(false);

    if (message.conversationId !== selectedConversationId) {
      setSelectedConversationId(message.conversationId);
    }

    // Older shared items may not be present in the current paginated message window.
    pendingBottomScrollConversationIdRef.current = null;
    pendingFocusedMessageScrollRef.current = message.id;
    setMessages((current) => {
      if (current.some((item) => item.id === message.id)) {
        return current;
      }

      return [...current, message].sort(
        (first, second) =>
          new Date(first.sentAt).getTime() - new Date(second.sentAt).getTime(),
      );
    });

    setHighlightedMessageId(message.id);
  }

  // Shared content is an integrated conversation detail view. It keeps the
  // current authorized content visible while a background refresh completes.
  async function openSharedContentPanel(
    tab?: SharedContentTab,
    returnView?: SharedContentReturnView,
  ): Promise<void> {
    if (!accessToken || !selectedConversationId) {
      return;
    }

    const conversationId = selectedConversationId;
    const localSharedContent = collectSharedContentFromMessages(
      messages.filter((message) => message.conversationId === conversationId),
    );
    const savedTab = sharedContentTabByConversationRef.current[conversationId];
    const initialTab =
      tab ?? savedTab ?? firstAvailableSharedContentTab(localSharedContent);
    const requestId = sharedContentRequestRef.current + 1;

    sharedContentRequestRef.current = requestId;
    closeMessageSearchPanel();
    clearMessageInformationState();
    setConversationActionMenuOpen(false);
    setSharedContentReturnView(
      returnView ??
        (activeUtilityPanel?.kind === "PROFILE"
          ? "PROFILE"
          : selectedConversation?.type === "GROUP"
            ? "GROUP_INFORMATION"
            : "PROFILE"),
    );
    setSharedContentOpen(true);
    setSharedContentTab(initialTab);
    sharedContentTabByConversationRef.current[conversationId] = initialTab;
    setSharedContent(localSharedContent);
    setSharedContentLoading(true);
    setSharedContentError(null);
    setDetailsPanelOpen(true);

    if (returnView === "GROUP_MANAGEMENT") {
      setGroupManagementWorkspaceOpen(false);
    }

    try {
      const response = await getConversationSharedContent(
        accessToken,
        conversationId,
      );

      if (sharedContentRequestRef.current !== requestId) {
        return;
      }

      const mergedContent = mergeSharedContent(
        response.data,
        localSharedContent,
      );
      setSharedContent(mergedContent);

      if (!tab && !savedTab) {
        const availableTab = firstAvailableSharedContentTab(mergedContent);
        setSharedContentTab(availableTab);
        sharedContentTabByConversationRef.current[conversationId] =
          availableTab;
      }
    } catch (error) {
      if (sharedContentRequestRef.current !== requestId) {
        return;
      }

      const hasLocalSharedContent =
        localSharedContent.media.length > 0 ||
        localSharedContent.documents.length > 0 ||
        localSharedContent.links.length > 0;

      // The local fallback keeps recently loaded shared content usable if the
      // API request fails; only an empty panel becomes an error state.
      if (!hasLocalSharedContent) {
        setSharedContentError(
          error instanceof Error
            ? error.message
            : t("feedback.sharedContentLoadError"),
        );
      }
    } finally {
      if (sharedContentRequestRef.current === requestId) {
        setSharedContentLoading(false);
      }
    }
  }

  function selectSharedContentTab(tab: SharedContentTab): void {
    setSharedContentTab(tab);

    if (selectedConversationId) {
      sharedContentTabByConversationRef.current[selectedConversationId] = tab;
    }
  }

  function returnFromSharedContent(): void {
    sharedContentRequestRef.current += 1;
    setSharedContentOpen(false);
    setSharedContentLoading(false);
    setSharedContentError(null);

    if (sharedContentReturnView === "GROUP_MANAGEMENT") {
      setDetailsPanelOpen(false);
      setGroupManagementWorkspaceOpen(true);
      setGroupDialogMode("MANAGE");
      return;
    }

    setDetailsPanelOpen(true);
  }

  function closeSharedContentPanel(): void {
    closeConversationDetailsPanel();
  }

  async function loadStorageUsage(
    scope: StorageUsageScope,
    replaceCurrent = true,
  ): Promise<void> {
    if (!accessToken) {
      return;
    }

    const requestId = storageUsageRequestRef.current + 1;
    storageUsageRequestRef.current = requestId;

    if (replaceCurrent) {
      setStorageUsage(null);
    }

    setStorageUsageLoading(true);
    setStorageUsageError(null);

    try {
      const response =
        scope.kind === "USER"
          ? await getUserStorageUsage(accessToken, 40)
          : await getConversationStorageUsage(
              accessToken,
              scope.conversationId,
              40,
            );

      // A slower previous scope must never replace the newly selected storage view.
      if (storageUsageRequestRef.current === requestId) {
        setStorageUsage(response);
      }
    } catch (error) {
      if (storageUsageRequestRef.current === requestId) {
        setStorageUsageError(
          error instanceof Error
            ? error.message
            : t("feedback.storageLoadError"),
        );
      }
    } finally {
      if (storageUsageRequestRef.current === requestId) {
        setStorageUsageLoading(false);
      }
    }
  }

  function openStorageUsage(scope: StorageUsageScope): void {
    setStorageDeleteConfirmation(null);
    setStorageUsageScope(scope);
    void loadStorageUsage(scope);
  }

  function closeStorageUsage(): void {
    storageUsageRequestRef.current += 1;
    setStorageUsageScope(null);
    setStorageUsage(null);
    setStorageUsageError(null);
    setStorageUsageActionId(null);
    setStorageDeleteConfirmation(null);
  }

  function handleStorageWorkspaceBack(): void {
    if (storageUsageScope?.kind === "CONVERSATION") {
      openStorageUsage({ kind: "USER" });
      return;
    }

    closeStorageUsage();
  }

  async function openStorageOriginalMessage(
    file: MessagingStorageLargestFile,
  ): Promise<void> {
    if (!accessToken || storageUsageActionId) {
      return;
    }

    setStorageUsageActionId(`OPEN:${file.attachmentId}`);
    setStorageUsageError(null);

    try {
      const response = await getConversationMessageById(
        accessToken,
        file.conversationId,
        file.messageId,
      );

      pendingSearchResultRef.current = {
        message: response.data,
        conversation: response.conversation,
        snippet: file.originalFileName,
        matchedAttachmentFileName: file.originalFileName,
      };

      setConversations((current) => {
        if (
          current.some(
            (conversation) => conversation.id === response.conversation.id,
          )
        ) {
          return current;
        }

        return [response.conversation, ...current];
      });

      // Keep an old original message visible even when it is outside the first message page.
      setMessages((current) =>
        current.some((message) => message.id === response.data.id)
          ? current
          : [...current, response.data].sort(
              (first, second) =>
                new Date(first.sentAt).getTime() -
                new Date(second.sentAt).getTime(),
            ),
      );
      setHighlightedMessageId(response.data.id);
      setSelectedConversationId(file.conversationId);
      navigate("/messages");
      closeStorageUsage();
    } catch (error) {
      setStorageUsageError(
        error instanceof Error
          ? error.message
          : t("feedback.originalMessageOpenError"),
      );
    } finally {
      setStorageUsageActionId(null);
    }
  }

  async function handleStorageFileDelete(
    file: MessagingStorageLargestFile,
    mode: "ME" | "EVERYONE",
  ): Promise<void> {
    if (!accessToken || !storageUsageScope || storageUsageActionId) {
      return;
    }

    setStorageDeleteConfirmation(null);
    setStorageUsageActionId(`${mode}:${file.attachmentId}`);
    setStorageUsageError(null);

    try {
      if (mode === "EVERYONE") {
        const response = await deleteConversationMessage(
          accessToken,
          file.conversationId,
          file.messageId,
        );

        setMessages((current) => applyMessageUpdate(current, response.data));
      } else {
        await deleteConversationMessageForMe(
          accessToken,
          file.conversationId,
          file.messageId,
        );
        setMessages((current) =>
          current.filter((message) => message.id !== file.messageId),
        );
      }

      // Re-read authoritative totals after every visibility or reference change.
      await loadStorageUsage(storageUsageScope, false);
      await loadConversations(true, selectedConversationId ?? undefined);
    } catch (error) {
      setStorageUsageError(
        error instanceof Error
          ? error.message
          : t("feedback.storageDeleteError"),
      );
    } finally {
      setStorageUsageActionId(null);
    }
  }

  function clearMessageInformationState(): void {
    messageInformationRequestIdRef.current += 1;
    setMessageInformation(null);
    setMessageInformationError(null);
    setMessageInformationLoadingId(null);
    setMessageInformationVisibleReadCount(40);
    setMessageInformationVisibleDeliveredCount(40);
  }

  function closeMessageInformationPanel(): void {
    clearMessageInformationState();
    setDetailsPanelOpen(false);
  }

  async function handleViewMessageInformation(
    message: MessagingMessage,
  ): Promise<void> {
    if (!accessToken || messageInformationLoadingId !== null) {
      return;
    }

    const requestId = messageInformationRequestIdRef.current + 1;
    messageInformationRequestIdRef.current = requestId;

    closeMessageSearchPanel();
    sharedContentRequestRef.current += 1;
    setSharedContentOpen(false);
    setConversationActionMenuOpen(false);
    setActiveUtilityPanel(null);
    setMessageInformation(null);
    setMessageInformationError(null);
    setMessageInformationVisibleReadCount(40);
    setMessageInformationVisibleDeliveredCount(40);
    setMessageInformationLoadingId(message.id);
    setDetailsPanelOpen(true);

    try {
      const response = await getConversationMessageInformation(
        accessToken,
        message.conversationId,
        message.id,
      );

      if (messageInformationRequestIdRef.current !== requestId) {
        return;
      }

      setMessageInformation(response.data);
    } catch (error) {
      if (messageInformationRequestIdRef.current !== requestId) {
        return;
      }

      setMessageInformationError(
        error instanceof Error
          ? error.message
          : t("feedback.messageInfoLoadError"),
      );
    } finally {
      if (messageInformationRequestIdRef.current === requestId) {
        setMessageInformationLoadingId(null);
      }
    }
  }

  function showConversationHistoryToast(message: string): void {
    setConversationHistoryToast(message);

    if (conversationHistoryToastTimerRef.current !== null) {
      window.clearTimeout(conversationHistoryToastTimerRef.current);
    }

    conversationHistoryToastTimerRef.current = window.setTimeout(() => {
      setConversationHistoryToast(null);
    }, 5000);
  }

  function openConversationHistoryConfirmation(
    action: PersonalConversationHistoryAction,
    conversationId = selectedConversation?.id ?? null,
  ): void {
    if (!conversationId) {
      return;
    }

    setConversationActionMenuOpen(false);
    setConversationRowMenuId(null);
    setConversationRowMenuView("ROOT");
    setConversationRowMenuPosition(null);
    setConversationHistoryTargetId(conversationId);
    setConversationHistoryError(null);
    setConversationHistoryAction(action);
  }

  function closeConversationHistoryConfirmation(): void {
    if (conversationHistorySubmitting) {
      return;
    }

    const targetId = conversationHistoryTargetId;
    setConversationHistoryAction(null);
    setConversationHistoryTargetId(null);
    setConversationHistoryError(null);
    const rowActionButton =
      conversationRowMenuButtonRefs.current[targetId ?? ""];

    if (rowActionButton) {
      rowActionButton.focus();
    } else {
      conversationActionButtonRef.current?.focus();
    }
  }

  function openDestructiveConfirmation(action: DestructiveConfirmation): void {
    setDestructiveConfirmationError(null);
    setDestructiveConfirmation(action);
  }

  function closeDestructiveConfirmation(): void {
    if (destructiveConfirmationSubmitting) {
      return;
    }

    setDestructiveConfirmation(null);
    setDestructiveConfirmationError(null);
  }

  function submitDestructiveConfirmation(): void {
    if (!destructiveConfirmation || destructiveConfirmationSubmitting) {
      return;
    }

    switch (destructiveConfirmation.kind) {
      case "DELETE_MESSAGE_FOR_ME":
        void handleDeleteMessageForMe(destructiveConfirmation.message);
        return;
      case "DELETE_MESSAGE_FOR_EVERYONE":
        void handleDeleteMessageForEveryone(destructiveConfirmation.message);
        return;
      case "LEAVE_GROUP":
        void handleLeaveGroup(destructiveConfirmation.conversationId);
        return;
      case "DELETE_GROUP":
        void handleDeleteGroup(destructiveConfirmation.conversationId);
        return;
      case "BLOCK_PRIVATE_CONTACT":
        void handleBlockAccount(destructiveConfirmation.target);
    }
  }

  async function handlePersonalConversationHistoryAction(): Promise<void> {
    if (
      !accessToken ||
      !conversationHistoryTarget ||
      !conversationHistoryAction ||
      conversationHistorySubmitting
    ) {
      return;
    }

    const conversationId = conversationHistoryTarget.id;
    const action = conversationHistoryAction;

    setConversationHistorySubmitting(true);
    setConversationHistoryError(null);

    try {
      const response =
        action === "DELETE"
          ? await deleteMessagingConversation(accessToken, conversationId)
          : await clearMessagingConversation(accessToken, conversationId);

      applyPersonalConversationHistoryLocally(
        conversationId,
        action,
        response.data.historyClearedAt ?? new Date().toISOString(),
      );

      setConversationHistoryAction(null);
      setConversationHistoryTargetId(null);
      showConversationHistoryToast(response.message);

      await Promise.all([
        loadConversations(
          true,
          action === "CLEAR" ? conversationId : undefined,
        ),
        loadNotifications(),
        ...(action === "DELETE" ? [loadChatFolders(true)] : []),
      ]);
    } catch (error) {
      setConversationHistoryError(
        error instanceof Error
          ? error.message
          : action === "DELETE"
            ? t("feedback.historyDeleteError")
            : t("feedback.historyClearError"),
      );
    } finally {
      setConversationHistorySubmitting(false);
    }
  }

  async function toggleConversationPinned(
    conversation: MessagingConversation,
  ): Promise<void> {
    await saveConversationPreference(
      conversation.id,
      {
        isPinned: !conversation.isPinned,
      },
      conversation.isPinned
        ? t("conversationList.unpinnedNotice")
        : t("conversationList.pinnedNotice"),
    );
  }

  async function toggleConversationFavorite(
    conversation: MessagingConversation,
  ): Promise<void> {
    await saveConversationPreference(
      conversation.id,
      {
        isFavorite: !conversation.isFavorite,
      },
      conversation.isFavorite
        ? t("conversationList.removedFavoriteNotice")
        : t("conversationList.addedFavoriteNotice"),
    );
  }

  async function toggleConversationArchive(
    conversation: MessagingConversation,
  ): Promise<void> {
    await saveConversationPreference(
      conversation.id,
      {
        isArchived: !conversation.isArchived,
      },
      conversation.isArchived
        ? t("conversationList.restoredNotice")
        : t("conversationList.archivedNotice"),
    );
    await loadConversations(
      true,
      conversation.isArchived ? conversation.id : undefined,
    );
  }

  async function changeConversationMute(
    conversation: MessagingConversation,
    mute: ConversationMuteSetting,
  ): Promise<void> {
    await saveConversationPreference(
      conversation.id,
      {
        mute,
      },
      mute === "OFF"
        ? t("conversationList.unmutedNotice")
        : t("conversationList.mutedNotice"),
    );
  }

  async function toggleConversationUnread(
    conversation: MessagingConversation,
  ): Promise<void> {
    if (!accessToken) {
      return;
    }

    if (conversation.isMarkedUnread || conversation.unreadCount > 0) {
      await markConversationRead(accessToken, conversation.id);
      await saveConversationPreference(
        conversation.id,
        {
          markUnread: false,
        },
        t("conversationList.markedReadNotice"),
      );
      await loadConversations(true, conversation.id);
      return;
    }

    await saveConversationPreference(
      conversation.id,
      {
        markUnread: true,
      },
      t("conversationList.markedUnreadNotice"),
    );
  }

  function closeActiveConversation(): void {
    setConversationActionMenuOpen(false);
    setPrivateGroupDialogOpen(false);
    closeMessageSearchPanel();
    setDetailsPanelOpen(false);
    setSelectedConversationId(null);
  }

  function beginReply(message: MessagingMessage): void {
    if (message.isDeleted) {
      return;
    }

    captureMessageThreadMutationAnchor();

    // Reply is a persistent composer action, so temporary reaction/action
    // popovers must close before the composer context changes.
    closeTransientMessagePopups();
    setEditingMessage(null);
    setReplyingTo(message);
    focusComposer();
  }

  function beginEdit(message: MessagingMessage): void {
    if (!canEditMessage(message, account?.id)) {
      return;
    }

    captureMessageThreadMutationAnchor();
    closeTransientMessagePopups();
    setReplyingTo(null);
    setEditingMessage(message);
    setMessageText(message.textContent ?? "");
    focusComposer();
  }

  function cancelMessageAction(): void {
    captureMessageThreadMutationAnchor();
    setReplyingTo(null);
    setEditingMessage(null);
    setMessageText("");
    stopLocalTyping(selectedConversationId);
  }

  async function handleCopyMessage(message: MessagingMessage): Promise<void> {
    if (message.isDeleted || !message.textContent) {
      return;
    }

    setMessageError(null);
    setMessageNotice(null);

    try {
      await copyTextToClipboard(message.textContent);
      setMessageNotice(t("feedback.messageCopied"));
    } catch (error) {
      setMessageError(
        error instanceof Error ? error.message : t("feedback.messageCopyError"),
      );
    }
  }

  function beginForward(message: MessagingMessage): void {
    if (!canForwardMessage(message)) {
      return;
    }

    setMessageError(null);
    setMessageNotice(null);
    setForwardingMessage(message);
    setForwardDestinationIds([]);
    setForwardSearch("");
    setForwardDestinationError(null);
    setForwardClientId(crypto.randomUUID());

    if (listMode) {
      /*
       * A custom list filters the main conversation collection. Forwarding is a
       * normal conversation action, so destination discovery must still use the
       * user's complete authorized conversation set rather than only the
       * conversations currently visible in this list.
       */
      void loadListCandidateConversations("forward");
    }
  }

  function closeForwardDialog(): void {
    if (forwardSubmitting) {
      return;
    }

    setForwardingMessage(null);
    setForwardDestinationIds([]);
    setForwardSearch("");
    setForwardDestinationError(null);
    setForwardClientId(null);
  }

  function toggleForwardDestination(conversationId: string): void {
    setForwardDestinationIds((current) => {
      if (current.includes(conversationId)) {
        return current.filter((id) => id !== conversationId);
      }

      if (current.length >= 20) {
        return current;
      }

      return [...current, conversationId];
    });
  }

  async function handleForwardMessage(): Promise<void> {
    if (
      !accessToken ||
      !forwardingMessage ||
      !forwardClientId ||
      forwardDestinationIds.length === 0 ||
      forwardSubmitting
    ) {
      return;
    }

    setForwardSubmitting(true);
    setMessageError(null);
    setMessageNotice(null);

    try {
      // The backend decides whether this is a text or attachment forward.
      const response = await forwardConversationMessage(
        accessToken,
        forwardingMessage.conversationId,
        forwardingMessage.id,
        forwardDestinationIds,
        forwardClientId,
      );

      if (selectedConversationId) {
        const messagesForSelectedConversation = response.data.filter(
          (message) => message.conversationId === selectedConversationId,
        );

        if (messagesForSelectedConversation.length > 0) {
          setMessages((current) => {
            const knownIds = new Set(current.map((message) => message.id));
            const additions = messagesForSelectedConversation.filter(
              (message) => !knownIds.has(message.id),
            );

            return [...current, ...additions];
          });
        }
      }

      setMessageNotice(response.message);
      setForwardingMessage(null);
      setForwardDestinationIds([]);
      setForwardSearch("");
      setForwardDestinationError(null);
      setForwardClientId(null);
      await loadConversations(true, selectedConversationId ?? undefined);
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : t("feedback.messageForwardError"),
      );
    } finally {
      setForwardSubmitting(false);
    }
  }

  async function handleDeleteMessageForMe(
    message: MessagingMessage,
  ): Promise<void> {
    if (!accessToken || !selectedConversationId || messageActionId) {
      return;
    }

    setMessageActionId(message.id);
    setMessageError(null);

    try {
      await deleteConversationMessageForMe(
        accessToken,
        selectedConversationId,
        message.id,
      );

      captureMessageThreadMutationAnchor();
      setMessages((current) =>
        current.filter((currentMessage) => currentMessage.id !== message.id),
      );

      if (replyingTo?.id === message.id || editingMessage?.id === message.id) {
        cancelMessageAction();
      }

      setDestructiveConfirmation(null);
      setDestructiveConfirmationError(null);
      await loadConversations(true, selectedConversationId);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : t("feedback.deleteForMeError");
      setMessageError(errorMessage);
      setDestructiveConfirmationError(errorMessage);
    } finally {
      setMessageActionId(null);
    }
  }

  async function handleDeleteMessageForEveryone(
    message: MessagingMessage,
  ): Promise<void> {
    if (
      !accessToken ||
      !selectedConversationId ||
      message.isDeleted ||
      messageActionId
    ) {
      return;
    }

    /*
     * Delete-for-everyone authorization is enforced by the API. Group owners
     * and admins may legitimately delete another participant's message, so the
     * client must not apply the old sender-only guard here. The action-menu
     * helper controls normal visibility; the backend remains authoritative.
     */

    setMessageActionId(message.id);
    setMessageError(null);

    try {
      const response = await deleteConversationMessage(
        accessToken,
        selectedConversationId,
        message.id,
      );

      captureMessageThreadMutationAnchor();
      setMessages((current) => applyMessageUpdate(current, response.data));

      if (replyingTo?.id === message.id || editingMessage?.id === message.id) {
        cancelMessageAction();
      }

      setDestructiveConfirmation(null);
      setDestructiveConfirmationError(null);
      await loadConversations(true, selectedConversationId);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : t("feedback.deleteForEveryoneError");
      setMessageError(errorMessage);
      setDestructiveConfirmationError(errorMessage);
    } finally {
      setMessageActionId(null);
    }
  }

  function handleMentionSelect(participant: MessagingAccount): void {
    const query = getComposerMentionQuery(
      messageText,
      composerRef.current?.selectionStart ?? composerCaretIndex,
    );

    if (!query) {
      return;
    }

    const beforeMention = messageText.slice(0, query.startIndex);
    const afterMention = messageText.slice(query.endIndex);
    const insertedText = `@${participant.displayName} `;
    const nextText = `${beforeMention}${insertedText}${afterMention}`;
    const nextCaretIndex = beforeMention.length + insertedText.length;

    setSelectedComposerMentions((current) => {
      const byAccountId = new Map(
        current.map((mention) => [mention.accountId, mention]),
      );
      byAccountId.set(participant.accountId, participant);
      return Array.from(byAccountId.values());
    });
    setMessageText(nextText);
    setComposerCaretIndex(nextCaretIndex);
    setMentionSuggestionsDismissed(true);

    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(nextCaretIndex, nextCaretIndex);
    });

    if (selectedConversationId) {
      updateLocalTyping(selectedConversationId, nextText);
    }
  }

  async function handleSendMessage(
    event?: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event?.preventDefault();

    const text = messageText.trim();
    const attachmentFiles = selectedAttachments.map(
      (attachment) => attachment.file,
    );

    if (
      !accessToken ||
      !selectedConversationId ||
      (!text && attachmentFiles.length === 0) ||
      sendingMessage ||
      voiceRecordingState !== "IDLE"
    ) {
      return;
    }

    const isAttachmentSend = attachmentFiles.length > 0 && !editingMessage;
    const sendingConversationId = selectedConversationId;

    pendingComposerRefocusConversationIdRef.current = sendingConversationId;
    setSendingMessage(true);
    setSendAttemptFailed(false);
    setMessageError(null);
    stopLocalTyping(selectedConversationId);

    try {
      if (editingMessage) {
        if (attachmentFiles.length > 0) {
          setMessageError(t("feedback.editAttachmentRemoveFirst"));
          return;
        }

        const response = await editConversationTextMessage(
          accessToken,
          selectedConversationId,
          editingMessage.id,
          text,
        );

        captureMessageThreadMutationAnchor();
        setMessages((current) => applyMessageUpdate(current, response.data));
        setEditingMessage(null);
        setMessageText("");
        await loadConversations(true, selectedConversationId);
        return;
      }

      const mentionedAccountIds =
        attachmentFiles.length === 0
          ? getMentionedAccountIds(
              text,
              selectedConversation,
              account?.id,
              selectedComposerMentions,
            )
          : [];
      const attemptKey = JSON.stringify({
        conversationId: sendingConversationId,
        kind: isAttachmentSend ? "ATTACHMENT" : "TEXT",
        text,
        replyToMessageId: replyingTo?.id ?? null,
        mentionedAccountIds,
        attachmentKind: isAttachmentSend ? selectedAttachmentKind : null,
        attachmentIds: isAttachmentSend
          ? selectedAttachments.map((attachment) => attachment.id)
          : [],
      });
      const sendAttempt = resolveMessagingSendAttempt(
        composerSendAttemptRef.current,
        attemptKey,
      );
      composerSendAttemptRef.current = sendAttempt;

      if (isAttachmentSend) {
        // Show aggregate progress immediately; XHR events refine the percentage.
        setAttachmentUpload({
          status: "UPLOADING",
          progressPercent: 0,
          loadedBytes: 0,
          totalBytes: attachmentFiles.reduce(
            (total, file) => total + file.size,
            0,
          ),
          error: null,
        });
      }

      const response =
        attachmentFiles.length > 0
          ? await sendConversationAttachmentMessage(
              accessToken,
              selectedConversationId,
              sendAttempt.clientMessageId,
              attachmentFiles,
              text,
              replyingTo?.id,
              selectedAttachmentKind === "VOICE_NOTE"
                ? "VOICE_NOTE"
                : undefined,
              {
                onUploadProgress: updateAttachmentUploadProgress,
              },
            )
          : await sendConversationTextMessage(
              accessToken,
              selectedConversationId,
              sendAttempt.clientMessageId,
              text,
              replyingTo?.id,
              mentionedAccountIds,
              false,
            );

      delete draftCacheRef.current[selectedConversationId];

      setMessageText("");
      setSelectedComposerMentions([]);
      setReplyingTo(null);
      clearSelectedAttachment();
      updateConversationPreference(accessToken, selectedConversationId, {
        draftText: null,
      })
        .then((draftResponse) =>
          applyConversationPreference(draftResponse.data),
        )
        .catch(() => {
          // Sending succeeded, so a failed draft cleanup should not block the chat.
        });
      setMessages((current) => {
        if (current.some((message) => message.id === response.data.id)) {
          return current;
        }

        return [...current, response.data];
      });

      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === selectedConversationId
            ? {
                ...conversation,
                lastMessage: response.data,
                lastMessageAt: response.data.sentAt,
                updatedAt: response.data.updatedAt,
              }
            : conversation,
        ),
      );

      await loadConversations(true);
      if (composerSendAttemptRef.current?.key === attemptKey) {
        composerSendAttemptRef.current = null;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : t("feedback.messageSendError");

      if (isAttachmentSend) {
        setAttachmentUpload((current) => ({
          status: "FAILED",
          progressPercent: current.progressPercent,
          loadedBytes: current.loadedBytes,
          totalBytes: current.totalBytes,
          error: errorMessage,
        }));
      }

      setSendAttemptFailed(true);
      setMessageError(errorMessage);
    } finally {
      // The post-render effect restores focus only after React has actually
      // re-enabled the textarea. This keeps continuous keyboard sending stable.
      setSendingMessage(false);
    }
  }

  function handleComposerKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void {
    // Do not submit or navigate suggestions while an input method editor is
    // still composing text. This prevents accidental sends for Nepali/IME use.
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return;
    }

    if (mentionPanelVisible) {
      if (
        (event.key === "ArrowDown" || event.key === "ArrowUp") &&
        mentionSuggestions.length > 0
      ) {
        event.preventDefault();
        setActiveMentionSuggestionIndex((current) => {
          const direction = event.key === "ArrowDown" ? 1 : -1;
          return (
            (current + direction + mentionSuggestions.length) %
            mentionSuggestions.length
          );
        });
        return;
      }

      if (
        (event.key === "Home" || event.key === "End") &&
        mentionSuggestions.length > 0
      ) {
        event.preventDefault();
        setActiveMentionSuggestionIndex(
          event.key === "Home" ? 0 : mentionSuggestions.length - 1,
        );
        return;
      }

      if (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) {
        event.preventDefault();
        const participant =
          mentionSuggestions[activeMentionSuggestionIndex] ??
          mentionSuggestions[0];

        if (participant) {
          handleMentionSelect(participant);
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setMentionSuggestionsDismissed(true);
        return;
      }
    }

    if (event.key === "Escape" && (replyingTo || editingMessage)) {
      event.preventDefault();
      cancelMessageAction();
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSendMessage();
    }
  }

  async function handleLoadOlderMessages(): Promise<void> {
    if (
      !accessToken ||
      !selectedConversationId ||
      !messageCursor ||
      olderMessagesLoading
    ) {
      return;
    }

    const thread = messageListRef.current;
    pendingOlderScrollRestoreRef.current = thread
      ? {
          conversationId: selectedConversationId,
          scrollHeight: thread.scrollHeight,
          scrollTop: thread.scrollTop,
        }
      : null;
    setOlderMessagesLoading(true);

    try {
      const response = await listConversationMessages(
        accessToken,
        selectedConversationId,
        messageCursor,
        50,
      );

      setMessages((current) => {
        const currentIds = new Set(current.map((message) => message.id));
        const older = response.data.filter(
          (message) => !currentIds.has(message.id),
        );

        return [...older, ...current];
      });

      setMessageCursor(response.pagination.nextCursor);
      setHasOlderMessages(response.pagination.hasMore);
    } catch (error) {
      pendingOlderScrollRestoreRef.current = null;
      setMessageError(
        error instanceof Error
          ? error.message
          : t("feedback.olderMessagesLoadError"),
      );
    } finally {
      setOlderMessagesLoading(false);
    }
  }

  const realtimeLabel =
    realtimeStatus === "CONNECTED"
      ? t("realtime.connected")
      : realtimeStatus === "RECONNECTING"
        ? t("realtime.reconnecting")
        : realtimeStatus === "CONNECTING"
          ? t("realtime.connecting")
          : t("realtime.offline");

  const peer =
    selectedConversation?.type === "PRIVATE"
      ? (selectedConversation.participants.find(
          (participant) => participant.accountId !== account?.id,
        ) ?? null)
      : null;
  const peerPresence = peer ? presenceByAccountId[peer.accountId] : undefined;
  const typingAccountIds = selectedConversationId
    ? (typingByConversation[selectedConversationId] ?? [])
    : [];
  const otherTypingAccountIds = typingAccountIds.filter(
    (accountId) => accountId !== account?.id,
  );
  const selectedConversationParticipantDirectory =
    selectedConversation?.groupKind === "OFFICIAL"
      ? officialGroupMembers
      : (selectedConversation?.participants ?? []);
  const typingParticipants = selectedConversationParticipantDirectory.filter(
    (participant) =>
      participant.accountId !== account?.id &&
      participant.showOnlineStatus !== false &&
      typingAccountIds.includes(participant.accountId),
  );
  const peerActivityLabel =
    selectedConversation?.type === "GROUP"
      ? typingParticipants.length > 0
        ? t("thread.activity.groupTyping", {
            names: typingParticipants
              .slice(0, 2)
              .map((participant) => participant.displayName)
              .join(", "),
            others:
              otherTypingAccountIds.length > typingParticipants.length ||
              typingParticipants.length > 2
                ? t("thread.activity.andOthers")
                : "",
          })
        : otherTypingAccountIds.length > 0
          ? t("thread.activity.someoneTyping")
          : t("thread.activity.members", {
              count: selectedConversation.memberCount,
            })
      : peer?.showOnlineStatus === false
        ? t("thread.activity.hidden")
        : typingParticipants.length > 0
          ? t("thread.activity.typing")
          : peerPresence?.isOnline
            ? t("thread.activity.online")
            : peerPresence?.lastSeenAt
              ? formatLastSeen(peerPresence.lastSeenAt)
              : t("thread.activity.offline");

  const selectedGroupMemberIds = new Set(
    groupDialogMode === "MANAGE" && selectedConversation?.type === "GROUP"
      ? selectedConversation.participants.map(
          (participant) => participant.accountId,
        )
      : [],
  );

  const privateGroupOriginalMemberIds = new Set(
    selectedConversation?.type === "PRIVATE"
      ? selectedConversation.participants.map(
          (participant) => participant.accountId,
        )
      : [],
  );

  const blockedMessageRequests = [
    ...messageRequests.received,
    ...messageRequests.sent,
  ].filter((request) => request.status === "BLOCKED");
  const blockedAccountIds = new Set(
    blockedAccounts.map((block) => block.blockedAccountId),
  );

  const selectedConversationForParticipantChecks = useMemo(() => {
    if (
      !selectedConversation ||
      selectedConversation.groupKind !== "OFFICIAL"
    ) {
      return selectedConversation;
    }

    return {
      ...selectedConversation,
      participants: officialGroupMembers,
      participantsComplete: !officialGroupMembersHasMore,
    };
  }, [officialGroupMembers, officialGroupMembersHasMore, selectedConversation]);

  const groupInfoConversation =
    selectedConversation?.type === "GROUP" ? selectedConversation : null;
  const groupInfoParticipants =
    groupInfoConversation?.groupKind === "OFFICIAL"
      ? officialGroupMembers
      : (groupInfoConversation?.participants ?? []);
  const groupInfoOwner =
    groupInfoParticipants.find(
      (participant) => participant.participantRole === "OWNER",
    ) ?? null;
  const groupInfoAdmins = groupInfoParticipants.filter(
    (participant) => participant.participantRole === "ADMIN",
  );
  const selectedConversationSharedContent = useMemo(() => {
    if (!selectedConversation) {
      return emptySharedContent();
    }

    // Loaded messages provide an immediate count while the authorized shared-
    // content endpoint refreshes the complete history in the detail panel.
    return collectSharedContentFromMessages(
      messages.filter(
        (message) => message.conversationId === selectedConversation.id,
      ),
    );
  }, [selectedConversation, messages]);
  function closeMessageActionMenu(): void {
    setOpenMessageMenuId(null);
    setMessageActionMenuPosition(null);
    setMessageActionMenuAnchor(null);
    setActiveMobileMessageId(null);
    setMobileMessageActionView("PRIMARY");
  }

  function closeReactionMenu(): void {
    setOpenReactionMenuId(null);
    setReactionMenuPosition(null);
    setActiveMobileMessageId(null);
  }

  function closeTransientMessagePopups(): void {
    closeMessageActionMenu();
    closeReactionMenu();
  }

  function usesTouchMessageActions(): boolean {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(hover: none), (pointer: coarse)").matches
    );
  }

  function usesCompactMessageActionSheet(): boolean {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 900px)").matches
    );
  }

  function clearMobileLongPress(): void {
    if (mobileLongPressTimerRef.current !== null) {
      window.clearTimeout(mobileLongPressTimerRef.current);
      mobileLongPressTimerRef.current = null;
    }

    mobileLongPressOriginRef.current = null;
  }

  function handleMessagePointerEnter(
    messageId: string,
    event: ReactPointerEvent<HTMLElement>,
  ): void {
    if (event.pointerType === "touch") {
      return;
    }

    const activePopupMessageId = openMessageMenuId ?? openReactionMenuId;

    // A desktop popover belongs to one message. Entering another message closes
    // it immediately; moving into the current popover does not enter a message
    // row, so the popover remains usable without timing heuristics.
    if (activePopupMessageId && activePopupMessageId !== messageId) {
      closeTransientMessagePopups();
    }
  }

  function handleMobileMessagePointerDown(
    message: MessagingMessage,
    event: ReactPointerEvent<HTMLElement>,
  ): void {
    if (event.pointerType === "mouse" || !usesTouchMessageActions()) {
      return;
    }

    const target = event.target;

    if (
      target instanceof Element &&
      target.closest(
        "button, a, input, textarea, select, audio, video, [role='button']",
      )
    ) {
      return;
    }

    clearMobileLongPress();
    mobileLongPressOriginRef.current = {
      pointerId: event.pointerId,
      messageId: message.id,
      x: event.clientX,
      y: event.clientY,
    };

    mobileLongPressTimerRef.current = window.setTimeout(() => {
      mobileLongPressTimerRef.current = null;
      closeTransientMessagePopups();
      setActiveMobileMessageId(message.id);
      mobileLongPressOriginRef.current = null;

      // A short vibration is optional and ignored by browsers that do not
      // support it. It confirms the long-press without exposing message data.
      window.navigator.vibrate?.(12);
    }, 450);
  }

  function handleMobileMessagePointerMove(
    event: ReactPointerEvent<HTMLElement>,
  ): void {
    const origin = mobileLongPressOriginRef.current;

    if (!origin || origin.pointerId !== event.pointerId) {
      return;
    }

    if (
      Math.abs(event.clientX - origin.x) > 10 ||
      Math.abs(event.clientY - origin.y) > 10
    ) {
      clearMobileLongPress();
    }
  }

  function handleMobileMessagePointerEnd(
    event: ReactPointerEvent<HTMLElement>,
  ): void {
    if (mobileLongPressOriginRef.current?.pointerId === event.pointerId) {
      clearMobileLongPress();
    }
  }

  function handleMobileMessageContextMenu(
    messageId: string,
    event: MouseEvent<HTMLElement>,
  ): void {
    if (!usesTouchMessageActions()) {
      return;
    }

    event.preventDefault();
    clearMobileLongPress();
    closeTransientMessagePopups();
    setActiveMobileMessageId(messageId);
  }

  function toggleMessageActionMenu(
    messageId: string,
    ownMessage: boolean,
    event: MouseEvent<HTMLButtonElement>,
  ): void {
    event.stopPropagation();

    // Narrow workspaces use the same bottom action sheet as touch long-press.
    // This avoids trying to fit a desktop popover beside a 430 px conversation
    // and keeps Chrome responsive-mode testing consistent with real phones.
    if (usesCompactMessageActionSheet()) {
      messageMenuOpenedByKeyboardRef.current = false;
      setOpenMessageMenuId(null);
      setMessageActionMenuPosition(null);
      setMessageActionMenuAnchor(null);
      closeReactionMenu();
      setMobileMessageActionView("PRIMARY");
      setActiveMobileMessageId((current) =>
        current === messageId ? null : messageId,
      );
      return;
    }

    messageMenuOpenedByKeyboardRef.current = event.detail === 0;
    closeReactionMenu();

    if (openMessageMenuId === messageId) {
      closeMessageActionMenu();
      return;
    }

    const triggerRect = event.currentTarget.getBoundingClientRect();
    const actionClusterRect = event.currentTarget
      .closest<HTMLElement>(".message-bubble-actions")
      ?.getBoundingClientRect();
    const anchorRect = actionClusterRect ?? triggerRect;
    const threadRect = event.currentTarget
      .closest<HTMLElement>(".message-thread")
      ?.getBoundingClientRect();

    // The full action menu has different heights for own, incoming, attachment,
    // and deleted messages. Anchor to the complete quick-action cluster rather
    // than only the More button, then let the layout effect position the popup
    // beside those controls without covering them.
    setMessageActionMenuPosition(null);
    setMessageActionMenuAnchor({
      top: anchorRect.top,
      right: anchorRect.right,
      bottom: anchorRect.bottom,
      left: anchorRect.left,
      ownMessage,
      boundaryTop: threadRect?.top ?? 0,
      boundaryRight: threadRect?.right ?? window.innerWidth,
      boundaryBottom: threadRect?.bottom ?? window.innerHeight,
      boundaryLeft: threadRect?.left ?? 0,
    });
    setOpenMessageMenuId(messageId);
  }

  function toggleReactionMenu(
    messageId: string,
    ownMessage: boolean,
    event: MouseEvent<HTMLButtonElement>,
  ): void {
    event.stopPropagation();
    reactionMenuOpenedByKeyboardRef.current = event.detail === 0;
    closeMessageActionMenu();

    if (openReactionMenuId === messageId) {
      closeReactionMenu();
      return;
    }

    const triggerRect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 286;
    const menuHeight = 54;
    const viewportPadding = 10;
    const gap = 8;
    const preferredTop = triggerRect.top - menuHeight - gap;
    const top =
      preferredTop >= viewportPadding ? preferredTop : triggerRect.bottom + gap;
    const preferredLeft = ownMessage
      ? triggerRect.right - menuWidth
      : triggerRect.left;
    const left = Math.min(
      window.innerWidth - menuWidth - viewportPadding,
      Math.max(viewportPadding, preferredLeft),
    );

    setReactionMenuPosition({ top, left });
    setOpenReactionMenuId(messageId);
  }

  function handleNavigationClickCapture(event: MouseEvent<HTMLElement>): void {
    const target = event.target;

    // A focused announcement must never trap the app behind its page layer.
    // The rail stays usable, and any rail action returns control to the normal
    // routed workspace before its own handler runs.
    if (
      (announcementComposerOpen || announcementDetailOpen) &&
      target instanceof Element &&
      target.closest("button:not(.message-rail-toggle)")
    ) {
      if (announcementDetailOpen) {
        closeAnnouncementDetail();
      }

      if (announcementComposerOpen) {
        resetAnnouncementComposer();
      }
    }

    if (
      typeof window === "undefined" ||
      !window.matchMedia("(max-width: 900px)").matches
    ) {
      return;
    }

    if (
      target instanceof Element &&
      target.closest("button:not(.message-rail-toggle)")
    ) {
      setNavigationExpanded(false);
    }
  }

  function localizedAttachmentLabel(
    message: Pick<
      MessagingMessage,
      "contentType" | "attachments" | "textContent" | "payload"
    >,
  ): string {
    if (message.textContent) {
      return message.textContent;
    }

    const firstAttachment = message.attachments?.[0];

    if (!firstAttachment) {
      return t("thread.message.fallback");
    }

    if (isImageAttachment(firstAttachment)) {
      return t("attachment.photo");
    }

    if (isVideoAttachment(firstAttachment)) {
      return t("attachment.types.video");
    }

    if (isAudioAttachment(firstAttachment)) {
      return getMessagePayloadValue(message, "attachmentKind") === "VOICE_NOTE"
        ? t("attachment.voiceNote")
        : t("attachment.audio");
    }

    return t("attachment.fileNamed", {
      name: firstAttachment.originalFileName,
    });
  }

  function renderIdentityAvatar(
    accountId: string,
    displayName: string,
    className = "message-avatar",
  ) {
    const photoUrl = profilePhotoUrls[accountId];

    return (
      <span className={className} aria-hidden="true">
        {photoUrl ? (
          <img src={photoUrl} alt="" draggable={false} />
        ) : (
          initials(displayName)
        )}
      </span>
    );
  }

  function renderAccountAvatar(
    targetAccount: MessagingAccount,
    className = "message-avatar",
  ) {
    return renderIdentityAvatar(
      targetAccount.accountId,
      targetAccount.displayName,
      className,
    );
  }

  function renderGroupAvatar(
    conversation: MessagingConversation,
    className = "message-avatar",
  ) {
    const photoUrl = groupPhotoUrls[conversation.id];
    const title = conversation.title ?? t("profileDetail.groupFallback");

    return (
      <span className={className} aria-hidden="true">
        {photoUrl ? (
          <img src={photoUrl} alt="" draggable={false} />
        ) : (
          initials(title)
        )}
      </span>
    );
  }

  function renderConversationAvatar(
    conversation: MessagingConversation,
    className = "message-avatar",
  ) {
    const conversationPeer =
      conversation.type === "PRIVATE"
        ? conversation.participants.find(
            (participant) => participant.accountId !== account?.id,
          )
        : null;

    return conversationPeer
      ? renderAccountAvatar(conversationPeer, className)
      : renderGroupAvatar(conversation, className);
  }

  const announcementAttachmentViewerItems = announcementAttachmentViewer
    ? announcementAttachmentViewer.announcement.attachments.filter(
        canPreviewAnnouncementAttachment,
      )
    : [];
  const announcementAttachmentViewerIndex = announcementAttachmentViewer
    ? announcementAttachmentViewerItems.findIndex(
        (attachment) =>
          attachment.id === announcementAttachmentViewer.attachment.id,
      )
    : -1;
  const announcementAttachmentViewerShowsFooter = announcementAttachmentViewer
    ? isAnnouncementPdfAttachment(announcementAttachmentViewer.attachment) ||
      isAnnouncementTextAttachment(announcementAttachmentViewer.attachment)
    : false;

  const attachmentViewerItems = attachmentViewer
    ? (attachmentViewer.message.attachments ?? []).filter(canPreviewAttachment)
    : [];
  const attachmentViewerIndex = attachmentViewer
    ? attachmentViewerItems.findIndex(
        (attachment) => attachment.id === attachmentViewer.attachment.id,
      )
    : -1;
  // Image and video viewers use the header only so native playback controls
  // never compete with an overlapping metadata footer. Documents keep it.
  const attachmentViewerShowsFooter = attachmentViewer
    ? isPdfAttachment(attachmentViewer.attachment) ||
      isTextPreviewAttachment(attachmentViewer.attachment)
    : false;

  const composerHasContent = Boolean(
    messageText.trim() || selectedAttachments.length > 0,
  );
  const showVoiceRecordAction =
    voiceRecordingState === "IDLE" &&
    editingMessage === null &&
    messageText.trim().length === 0 &&
    selectedAttachments.length === 0;
  const remainingMessageCharacters = 5000 - messageText.length;
  const composerSendState = sendingMessage
    ? "sending"
    : sendAttemptFailed
      ? "failed"
      : composerHasContent
        ? "ready"
        : "disabled";

  const messageActionMenuMessage = openMessageMenuId
    ? (messages.find((message) => message.id === openMessageMenuId) ?? null)
    : null;

  const reactionMenuMessage = openReactionMenuId
    ? (messages.find((message) => message.id === openReactionMenuId) ?? null)
    : null;

  const mobileMessageActionMessage = activeMobileMessageId
    ? (messages.find((message) => message.id === activeMobileMessageId) ?? null)
    : null;

  function renderFloatingReactionMenu(message: MessagingMessage) {
    const viewerReaction = getViewerReaction(message, account?.id);

    return (
      <div
        ref={reactionMenuRef}
        className="message-reaction-picker-floating"
        data-message-reaction-menu
        role="toolbar"
        aria-label={t("actionsMenu.reactToMessage")}
        onKeyDown={(event) =>
          handleLinearKeyboardNavigation(event, "HORIZONTAL")
        }
        style={reactionMenuPosition ?? undefined}
      >
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={viewerReaction === emoji ? "is-selected" : ""}
            onClick={() => {
              closeReactionMenu();
              void handleReaction(message, emoji);
            }}
            disabled={reactionActionId !== null}
            aria-pressed={viewerReaction === emoji}
            aria-label={t("actionsMenu.reactWith", { emoji })}
          >
            {emoji}
          </button>
        ))}
      </div>
    );
  }

  function renderFloatingMessageActionMenu(
    message: MessagingMessage,
    mode: "FLOATING" | "MOBILE_SHEET" = "FLOATING",
  ) {
    const ownMessage = message.senderAccountId === account?.id;
    const attachments = message.attachments ?? [];
    const previewableAttachment = attachments.find(
      (attachment) =>
        !isAudioAttachment(attachment) && canPreviewAttachment(attachment),
    );
    const attachmentLabel =
      attachments.length === 1
        ? t("actionsMenu.attachment")
        : t("actionsMenu.attachments");
    const mobileSheet = mode === "MOBILE_SHEET";
    const viewerReaction = getViewerReaction(message, account?.id);
    const mobileMessagePreview = message.isDeleted
      ? t("thread.message.deletedSentence")
      : message.textContent?.trim() ||
        (message.contentType === "LOCATION"
          ? t("composer.location")
          : attachments.length > 0
            ? `${attachments.length} ${attachmentLabel}`
            : t("thread.message.fallback"));

    if (mobileSheet) {
      const canCopyMessage = Boolean(!message.isDeleted && message.textContent);
      const canDeleteForEveryone = canDeleteMessageForEveryone(
        message,
        account?.id,
        selectedConversationForParticipantChecks,
      );
      const hasMoreActions =
        ownMessage ||
        Boolean(previewableAttachment) ||
        attachments.length > 0 ||
        canForwardMessage(message) ||
        !message.isDeleted ||
        canDeleteForEveryone;

      return (
        <div
          className={`message-action-menu message-mobile-actions-sheet ${
            mobileMessageActionView === "MORE"
              ? "is-more-view"
              : "is-primary-view"
          }`}
          data-message-action-menu
          role="menu"
          aria-label={t("actionsMenu.messageActions")}
          onKeyDown={(event) => handleLinearKeyboardNavigation(event, "BOTH")}
        >
          <div className="message-mobile-actions-handle" aria-hidden="true" />

          {mobileMessageActionView === "PRIMARY" ? (
            <>
              {!message.isDeleted && (
                <div
                  className="message-mobile-quick-reactions"
                  role="toolbar"
                  aria-label={t("actionsMenu.quickReactions")}
                >
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={viewerReaction === emoji ? "is-selected" : ""}
                      onClick={() => {
                        closeTransientMessagePopups();
                        void handleReaction(message, emoji);
                      }}
                      disabled={reactionActionId !== null}
                      aria-pressed={viewerReaction === emoji}
                      aria-label={t("actionsMenu.reactWith", { emoji })}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              <div
                className="message-mobile-primary-actions"
                role="group"
                aria-label={t("actionsMenu.primaryActions")}
              >
                {!message.isDeleted && (
                  <button
                    type="button"
                    onClick={() => {
                      closeTransientMessagePopups();
                      beginReply(message);
                    }}
                  >
                    <MessageNavigationIcon name="reply" />
                    <span>{t("actionsMenu.reply")}</span>
                  </button>
                )}

                {canCopyMessage && (
                  <button
                    type="button"
                    onClick={() => {
                      closeTransientMessagePopups();
                      void handleCopyMessage(message);
                    }}
                  >
                    <AttachmentGlyph name="copy" />
                    <span>{t("actionsMenu.copy")}</span>
                  </button>
                )}

                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    closeTransientMessagePopups();
                    openDestructiveConfirmation({
                      kind: "DELETE_MESSAGE_FOR_ME",
                      message,
                    });
                  }}
                  disabled={messageActionId !== null}
                >
                  <AttachmentGlyph name="trash" />
                  <span>{t("actionsMenu.delete")}</span>
                </button>

                {hasMoreActions && (
                  <button
                    type="button"
                    onClick={() => setMobileMessageActionView("MORE")}
                    aria-label={t("actionsMenu.moreActions")}
                  >
                    <MessageNavigationIcon name="more" />
                    <span>{t("actionsMenu.more")}</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="message-mobile-actions-header">
                <button
                  type="button"
                  className="message-mobile-actions-back"
                  onClick={() => setMobileMessageActionView("PRIMARY")}
                  aria-label={t("actionsMenu.backPrimary")}
                >
                  ←
                </button>
                <div>
                  <strong>{t("actionsMenu.moreActions")}</strong>
                  <span>{mobileMessagePreview}</span>
                </div>
                <button
                  type="button"
                  className="message-mobile-actions-close"
                  onClick={closeTransientMessagePopups}
                  aria-label={t("actionsMenu.close")}
                >
                  ×
                </button>
              </div>

              {ownMessage && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeTransientMessagePopups();
                    void handleViewMessageInformation(message);
                  }}
                  disabled={messageInformationLoadingId !== null}
                >
                  <AttachmentGlyph name="info" />
                  <span>{t("actionsMenu.messageInfo")}</span>
                </button>
              )}

              {previewableAttachment && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeTransientMessagePopups();
                    void handlePreviewAttachment(
                      message,
                      previewableAttachment,
                    );
                  }}
                >
                  <AttachmentGlyph
                    name={attachmentVisualKind(previewableAttachment)}
                  />
                  <span>
                    {t("actionsMenu.viewAttachment", {
                      label: attachmentLabel,
                    })}
                  </span>
                </button>
              )}

              {attachments.length > 0 && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeTransientMessagePopups();
                    void handleDownloadMessageAttachments(message);
                  }}
                >
                  <AttachmentGlyph name="download" />
                  <span>
                    {t("actionsMenu.downloadAttachment", {
                      label: attachmentLabel,
                    })}
                  </span>
                </button>
              )}

              {canForwardMessage(message) && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeTransientMessagePopups();
                    beginForward(message);
                  }}
                >
                  <AttachmentGlyph name="forward" />
                  <span>{t("actionsMenu.forward")}</span>
                </button>
              )}

              {!message.isDeleted && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeTransientMessagePopups();
                    void handlePinMessage(message);
                  }}
                  disabled={pinActionId !== null}
                >
                  <AttachmentGlyph name="pin" />
                  <span>
                    {message.isPinned
                      ? t("actionsMenu.unpin")
                      : t("actionsMenu.pin")}
                  </span>
                </button>
              )}

              {!message.isDeleted && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeTransientMessagePopups();
                    void handleStarMessage(message);
                  }}
                  disabled={messageActionId !== null}
                >
                  <AttachmentGlyph name="star" />
                  <span>
                    {message.isStarred
                      ? t("actionsMenu.unstar")
                      : t("actionsMenu.star")}
                  </span>
                </button>
              )}

              {ownMessage && canEditMessage(message, account?.id) && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeTransientMessagePopups();
                    beginEdit(message);
                  }}
                >
                  <AttachmentGlyph name="edit" />
                  <span>{t("actionsMenu.edit")}</span>
                </button>
              )}

              {canDeleteForEveryone && (
                <button
                  type="button"
                  role="menuitem"
                  className="danger message-action-menu-destructive-start"
                  onClick={() => {
                    closeTransientMessagePopups();
                    openDestructiveConfirmation({
                      kind: "DELETE_MESSAGE_FOR_EVERYONE",
                      message,
                    });
                  }}
                  disabled={messageActionId !== null}
                >
                  <AttachmentGlyph name="trash" />
                  <span>{t("actionsMenu.deleteForEveryone")}</span>
                </button>
              )}
            </>
          )}
        </div>
      );
    }

    return (
      <div
        ref={mobileSheet ? undefined : messageActionMenuRef}
        className={`message-action-menu ${
          mobileSheet
            ? "message-mobile-actions-sheet"
            : "message-action-menu-floating"
        }`}
        data-message-action-menu
        role="menu"
        aria-label={t("actionsMenu.messageActions")}
        onKeyDown={(event) =>
          handleLinearKeyboardNavigation(
            event,
            mobileSheet ? "BOTH" : "VERTICAL",
          )
        }
        style={
          mobileSheet
            ? undefined
            : (messageActionMenuPosition ??
              (messageActionMenuAnchor
                ? {
                    top: messageActionMenuAnchor.top,
                    left: messageActionMenuAnchor.left,
                    visibility: "hidden",
                    pointerEvents: "none",
                  }
                : undefined))
        }
      >
        {mobileSheet && (
          <>
            <div className="message-mobile-actions-handle" aria-hidden="true" />
            <div className="message-mobile-actions-header">
              <div>
                <strong>
                  {ownMessage
                    ? t("thread.message.you")
                    : message.sender.displayName}
                </strong>
                <span>{mobileMessagePreview}</span>
              </div>
              <button
                type="button"
                className="message-mobile-actions-close"
                onClick={closeTransientMessagePopups}
                aria-label={t("actionsMenu.close")}
              >
                ×
              </button>
            </div>

            {!message.isDeleted && (
              <div
                className="message-mobile-quick-reactions"
                role="toolbar"
                aria-label={t("actionsMenu.quickReactions")}
              >
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={viewerReaction === emoji ? "is-selected" : ""}
                    onClick={() => {
                      closeTransientMessagePopups();
                      void handleReaction(message, emoji);
                    }}
                    disabled={reactionActionId !== null}
                    aria-pressed={viewerReaction === emoji}
                    aria-label={t("actionsMenu.reactWith", { emoji })}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            {!message.isDeleted && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeTransientMessagePopups();
                  beginReply(message);
                }}
              >
                <MessageNavigationIcon name="reply" />
                <span>{t("actionsMenu.reply")}</span>
              </button>
            )}
          </>
        )}
        {ownMessage && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMessageActionMenu();
              void handleViewMessageInformation(message);
            }}
            disabled={messageInformationLoadingId !== null}
          >
            <AttachmentGlyph name="info" />
            <span>{t("actionsMenu.messageInfo")}</span>
          </button>
        )}

        {previewableAttachment && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMessageActionMenu();
              void handlePreviewAttachment(message, previewableAttachment);
            }}
          >
            <AttachmentGlyph
              name={attachmentVisualKind(previewableAttachment)}
            />
            <span>
              {t("actionsMenu.viewAttachment", { label: attachmentLabel })}
            </span>
          </button>
        )}

        {attachments.length > 0 && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMessageActionMenu();
              void handleDownloadMessageAttachments(message);
            }}
          >
            <AttachmentGlyph name="download" />
            <span>
              {t("actionsMenu.downloadAttachment", { label: attachmentLabel })}
            </span>
          </button>
        )}

        {!message.isDeleted && message.textContent && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMessageActionMenu();
              void handleCopyMessage(message);
            }}
          >
            <AttachmentGlyph name="copy" />
            <span>{t("actionsMenu.copy")}</span>
          </button>
        )}

        {canForwardMessage(message) && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMessageActionMenu();
              beginForward(message);
            }}
          >
            <AttachmentGlyph name="forward" />
            <span>{t("actionsMenu.forward")}</span>
          </button>
        )}

        {!message.isDeleted && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMessageActionMenu();
              void handlePinMessage(message);
            }}
            disabled={pinActionId !== null}
          >
            <AttachmentGlyph name="pin" />
            <span>
              {message.isPinned ? t("actionsMenu.unpin") : t("actionsMenu.pin")}
            </span>
          </button>
        )}

        {!message.isDeleted && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMessageActionMenu();
              void handleStarMessage(message);
            }}
            disabled={messageActionId !== null}
          >
            <AttachmentGlyph name="star" />
            <span>
              {message.isStarred
                ? t("actionsMenu.unstar")
                : t("actionsMenu.star")}
            </span>
          </button>
        )}

        {ownMessage && canEditMessage(message, account?.id) && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMessageActionMenu();
              beginEdit(message);
            }}
          >
            <AttachmentGlyph name="edit" />
            <span>{t("actionsMenu.edit")}</span>
          </button>
        )}

        <button
          type="button"
          role="menuitem"
          className="message-action-menu-destructive-start"
          onClick={() => {
            closeMessageActionMenu();
            openDestructiveConfirmation({
              kind: "DELETE_MESSAGE_FOR_ME",
              message,
            });
          }}
          disabled={messageActionId !== null}
        >
          <AttachmentGlyph name="trash" />
          <span>{t("actionsMenu.deleteForMe")}</span>
        </button>

        {canDeleteMessageForEveryone(
          message,
          account?.id,
          selectedConversationForParticipantChecks,
        ) && (
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              closeMessageActionMenu();
              openDestructiveConfirmation({
                kind: "DELETE_MESSAGE_FOR_EVERYONE",
                message,
              });
            }}
            disabled={messageActionId !== null}
          >
            <AttachmentGlyph name="trash" />
            <span>{t("actionsMenu.deleteForEveryone")}</span>
          </button>
        )}
      </div>
    );
  }

  function openStarredMessage(item: StarredMessageItem): void {
    if (item.message.isDeleted) {
      return;
    }

    pendingSearchResultRef.current = {
      message: item.message,
      conversation: item.conversation,
      snippet: starredMessagePreview(item, t),
      matchedAttachmentFileName:
        item.message.attachments?.[0]?.originalFileName ?? null,
    };
    setHighlightedMessageId(item.message.id);
    setConversations((current) => {
      if (
        current.some((conversation) => conversation.id === item.conversation.id)
      ) {
        return current;
      }

      return [item.conversation, ...current];
    });
    setSelectedConversationId(item.conversation.id);
    setDetailsPanelOpen(false);
    setNavigationExpanded(false);

    if (selectedConversationId === item.conversation.id) {
      void loadMessages(item.conversation.id);
    }
  }

  async function handleUnstarFromCollection(
    item: StarredMessageItem,
  ): Promise<void> {
    if (!accessToken || starredActionId !== null) {
      return;
    }

    setStarredActionId(item.message.id);
    setStarredError(null);

    try {
      const response = await unstarConversationMessage(
        accessToken,
        item.conversation.id,
        item.message.id,
      );
      setStarredItems((current) =>
        current.filter((entry) => entry.message.id !== item.message.id),
      );
      setMessages((current) => applyMessageUpdate(current, response.data));
      setPinnedMessages((current) =>
        applyMessageUpdate(current, response.data),
      );
      setMessageNotice(response.message);
    } catch (error) {
      setStarredError(
        error instanceof Error
          ? error.message
          : t("feedback.removeStarredError"),
      );
    } finally {
      setStarredActionId(null);
    }
  }

  function visibleConversationRows(): HTMLButtonElement[] {
    const list = conversationListRef.current;

    if (!list) {
      return [];
    }

    return Array.from(
      list.querySelectorAll<HTMLButtonElement>(
        ".message-conversation-row:not(:disabled), .message-notification-open:not(:disabled)",
      ),
    ).filter((row) => row.getClientRects().length > 0);
  }

  function focusConversationRow(row: HTMLButtonElement | undefined): void {
    row?.focus();
    row?.scrollIntoView({ block: "nearest" });
  }

  function handleConversationSearchKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
  ): void {
    if (event.key === "ArrowDown") {
      const firstRow = visibleConversationRows()[0];

      if (firstRow) {
        event.preventDefault();
        focusConversationRow(firstRow);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();

      if (conversationSearch) {
        setConversationSearch("");
      } else {
        event.currentTarget.blur();
      }
    }
  }

  function handleConversationListKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
  ): void {
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }

    const target = event.target;

    if (
      !(target instanceof HTMLElement) ||
      !target.closest(".message-conversation-row, .message-notification-open")
    ) {
      return;
    }

    const rows = visibleConversationRows();

    if (rows.length === 0) {
      return;
    }

    event.preventDefault();
    const currentIndex = rows.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    let nextIndex: number;

    if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = rows.length - 1;
    } else if (event.key === "ArrowUp") {
      nextIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
    } else {
      nextIndex =
        currentIndex < 0 ? 0 : Math.min(currentIndex + 1, rows.length - 1);
    }

    focusConversationRow(rows[nextIndex]);
  }

  function conversationPeerFor(
    conversation: MessagingConversation,
  ): MessagingAccount | undefined {
    if (conversation.type !== "PRIVATE") {
      return undefined;
    }

    return conversation.participants.find(
      (participant) => participant.accountId !== account?.id,
    );
  }

  function closeConversationRowMenu(): void {
    setConversationRowMenuId(null);
    setConversationRowMenuView("ROOT");
    setConversationRowMenuPosition(null);
  }

  function renderConversationRow(
    conversation: MessagingConversation,
  ): ReactNode {
    const conversationPeer = conversationPeerFor(conversation);
    const title = conversation.title ?? t("listWorkspace.privateConversation");
    const rowMenuOpen = conversationRowMenuId === conversation.id;
    const peerBlocked = Boolean(
      conversationPeer && blockedAccountIds.has(conversationPeer.accountId),
    );
    const preferenceBusy = conversationPreferenceLoading === conversation.id;

    return (
      <article
        key={conversation.id}
        className={`message-conversation-row-shell${rowMenuOpen ? " menu-open" : ""}`}
      >
        <button
          type="button"
          className={`message-conversation-row${
            conversation.id === selectedConversationId ? " active" : ""
          }${conversation.unreadCount > 0 ? " unread" : ""}${
            conversation.groupKind === "OFFICIAL" ? " official" : ""
          }`}
          onClick={() => {
            closeConversationRowMenu();
            setSelectedConversationId(conversation.id);
            setNavigationExpanded(false);
            setDetailsPanelOpen(
              typeof window !== "undefined" &&
                window.matchMedia("(min-width: 1560px)").matches,
            );
          }}
        >
          <span className="message-avatar-presence">
            {conversationPeer
              ? renderAccountAvatar(conversationPeer)
              : renderGroupAvatar(conversation)}

            {conversationPeer &&
              conversationPeer.showOnlineStatus !== false &&
              presenceByAccountId[conversationPeer.accountId]?.isOnline && (
                <span
                  className="message-presence-dot"
                  aria-label={t("thread.header.onlineAria", { name: title })}
                />
              )}
          </span>

          <span className="message-conversation-copy">
            <span className="message-conversation-title-line">
              <strong>{title}</strong>
              <time>
                {formatConversationTime(
                  conversation.lastMessageAt ?? conversation.updatedAt,
                )}
              </time>
            </span>

            <span className="message-conversation-preview-line">
              <small>
                {messagePreview(conversation, account?.id ?? "", t)}
              </small>

              <span className="message-conversation-row-status">
                {conversation.groupKind === "OFFICIAL" && (
                  <span className="message-conversation-kind">
                    {t("profileDetail.official")}
                  </span>
                )}
                {conversation.draftText && (
                  <span className="message-conversation-draft">
                    {t("conversationList.draft")}
                  </span>
                )}
                <span
                  className="message-conversation-indicators"
                  aria-label={t("conversationList.statusAria")}
                >
                  {conversation.isFavorite && (
                    <span aria-label={t("conversationList.favorite")}>
                      <MessageNavigationIcon name="starred" />
                    </span>
                  )}
                  {conversation.isPinned && (
                    <span aria-label={t("conversationList.pinned")}>
                      <MessageNavigationIcon name="pin" />
                    </span>
                  )}
                  {conversation.isMuted && (
                    <span aria-label={t("conversationList.muted")}>
                      <MessageNavigationIcon name="bellOff" />
                    </span>
                  )}
                  {conversation.isArchived && (
                    <span aria-label={t("conversationList.archived")}>
                      <MessageNavigationIcon name="archive" />
                    </span>
                  )}
                </span>
                {conversation.unreadCount > 0 && (
                  <b
                    aria-label={t("conversationList.unreadMessages", {
                      count: conversation.unreadCount,
                    })}
                  >
                    {conversation.unreadCount > 99
                      ? "99+"
                      : conversation.unreadCount}
                  </b>
                )}
              </span>
            </span>
          </span>
        </button>

        <button
          ref={(element) => {
            conversationRowMenuButtonRefs.current[conversation.id] = element;
          }}
          type="button"
          className="message-conversation-row-more"
          onClick={(event) => {
            if (rowMenuOpen) {
              closeConversationRowMenu();
              return;
            }

            const triggerRect = event.currentTarget.getBoundingClientRect();
            const viewportPadding = 8;
            const menuWidth = Math.min(
              268,
              window.innerWidth - viewportPadding * 2,
            );
            const menuMaxHeight = Math.max(
              220,
              Math.min(520, window.innerHeight - viewportPadding * 2),
            );
            const menuLeft = Math.min(
              window.innerWidth - menuWidth - viewportPadding,
              Math.max(viewportPadding, triggerRect.right - menuWidth),
            );
            const menuTop = Math.min(
              window.innerHeight - menuMaxHeight - viewportPadding,
              Math.max(viewportPadding, triggerRect.top - 6),
            );

            setConversationActionMenuOpen(false);
            setConversationRowMenuView("ROOT");
            setConversationRowMenuPosition({
              top: menuTop,
              left: menuLeft,
              width: menuWidth,
              maxHeight: menuMaxHeight,
            });
            setConversationRowMenuId(conversation.id);
          }}
          aria-label={t("conversationList.moreActionsFor", { name: title })}
          aria-haspopup="menu"
          aria-expanded={rowMenuOpen}
          title={t("conversationList.conversationActions")}
        >
          <MessageNavigationIcon name="more" />
        </button>

        {rowMenuOpen && (
          <div
            ref={conversationRowMenuRef}
            className="message-conversation-row-menu"
            style={conversationRowMenuPosition ?? undefined}
            role="menu"
            aria-label={t("conversationList.actionsFor", { name: title })}
            onKeyDown={(event) =>
              handleLinearKeyboardNavigation(event, "VERTICAL")
            }
          >
            {conversationRowMenuView === "MUTE" ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setConversationRowMenuView("ROOT")}
                >
                  <span aria-hidden="true">←</span>
                  <span>{t("thread.header.muteNotifications")}</span>
                </button>
                {(
                  [
                    ["1_HOUR", t("thread.header.mute1Hour")],
                    ["8_HOURS", t("thread.header.mute8Hours")],
                    ["1_WEEK", t("thread.header.mute1Week")],
                    ["ALWAYS", t("thread.header.muteAlways")],
                  ] as Array<[ConversationMuteSetting, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="menuitem"
                    disabled={preferenceBusy}
                    onClick={() => {
                      closeConversationRowMenu();
                      void changeConversationMute(conversation, value);
                    }}
                  >
                    <MessageNavigationIcon name="bell" />
                    <span>{label}</span>
                  </button>
                ))}
              </>
            ) : (
              <>
                <button
                  type="button"
                  role="menuitem"
                  disabled={preferenceBusy}
                  onClick={() => {
                    closeConversationRowMenu();
                    void toggleConversationUnread(conversation);
                  }}
                >
                  <MessageNavigationIcon name="unread" />
                  <span>
                    {conversation.isMarkedUnread || conversation.unreadCount > 0
                      ? t("conversationList.markAsRead")
                      : t("conversationList.markAsUnread")}
                  </span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  disabled={preferenceBusy}
                  onClick={() => {
                    closeConversationRowMenu();
                    void toggleConversationFavorite(conversation);
                  }}
                >
                  <MessageNavigationIcon name="starred" />
                  <span>
                    {conversation.isFavorite
                      ? t("conversationList.removeFavorites")
                      : t("conversationList.addFavorites")}
                  </span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  disabled={preferenceBusy}
                  onClick={() => {
                    closeConversationRowMenu();
                    void toggleConversationPinned(conversation);
                  }}
                >
                  <MessageNavigationIcon name="pin" />
                  <span>
                    {conversation.isPinned
                      ? t("conversationList.unpinConversation")
                      : t("conversationList.pinConversation")}
                  </span>
                </button>

                {conversation.isMuted ? (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={preferenceBusy}
                    onClick={() => {
                      closeConversationRowMenu();
                      void changeConversationMute(conversation, "OFF");
                    }}
                  >
                    <MessageNavigationIcon name="bell" />
                    <span>{t("thread.header.unmuteNotifications")}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setConversationRowMenuView("MUTE")}
                  >
                    <MessageNavigationIcon name="bell" />
                    <span>{t("thread.header.muteNotificationsMore")}</span>
                  </button>
                )}

                <button
                  type="button"
                  role="menuitem"
                  disabled={preferenceBusy}
                  onClick={() => {
                    closeConversationRowMenu();
                    void toggleConversationArchive(conversation);
                  }}
                >
                  <MessageNavigationIcon name="archive" />
                  <span>
                    {conversation.isArchived
                      ? t("conversationList.unarchiveConversation")
                      : t("conversationList.archiveConversation")}
                  </span>
                </button>

                {conversationPeer && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={blockActionAccountId !== null}
                    onClick={() => {
                      closeConversationRowMenu();

                      if (peerBlocked) {
                        void handleUnblockAccount(conversationPeer.accountId);
                      } else {
                        openDestructiveConfirmation({
                          kind: "BLOCK_PRIVATE_CONTACT",
                          target: conversationPeer,
                        });
                      }
                    }}
                  >
                    <MessageNavigationIcon name="block" />
                    <span>
                      {peerBlocked
                        ? t("conversationList.unblockContact")
                        : t("conversationList.blockContact")}
                    </span>
                  </button>
                )}

                <div
                  className="message-conversation-action-menu-divider"
                  role="separator"
                />

                <button
                  type="button"
                  role="menuitem"
                  className="message-conversation-history-action"
                  onClick={() =>
                    openConversationHistoryConfirmation(
                      "CLEAR",
                      conversation.id,
                    )
                  }
                >
                  <MessageNavigationIcon name="close" />
                  <span>{t("thread.header.clearChat")}</span>
                </button>

                {conversation.type === "PRIVATE" && (
                  <button
                    type="button"
                    role="menuitem"
                    className="message-conversation-history-action destructive"
                    onClick={() =>
                      openConversationHistoryConfirmation(
                        "DELETE",
                        conversation.id,
                      )
                    }
                  >
                    <MessageNavigationIcon name="trash" />
                    <span>{t("thread.header.deleteChat")}</span>
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </article>
    );
  }

  function renderConversationLoadMoreControl(): ReactNode {
    if (!conversationHasMore) {
      return null;
    }

    return (
      <button
        type="button"
        className="message-conversation-load-more"
        onClick={() => void loadMoreConversations()}
        disabled={conversationLoadingMore}
        aria-busy={conversationLoadingMore}
      >
        {conversationLoadingMore ? (
          <>
            <span className="message-small-spinner" aria-hidden="true" />
            {t("conversationList.loadingMore")}
          </>
        ) : (
          t("conversationList.loadMore")
        )}
      </button>
    );
  }

  function renderStarredMessageRow(item: StarredMessageItem): ReactNode {
    const conversationPeer =
      item.conversation.type === "PRIVATE"
        ? item.conversation.participants.find(
            (participant) => participant.accountId !== account?.id,
          )
        : undefined;
    const selected =
      selectedConversationId === item.conversation.id &&
      highlightedMessageId === item.message.id;
    const senderLabel =
      item.message.senderAccountId === account?.id
        ? t("thread.message.you")
        : item.message.sender.displayName;

    return (
      <article
        key={`${item.message.id}:${item.starredAt}`}
        className={`message-starred-workspace-item${selected ? " active" : ""}`}
      >
        <button
          type="button"
          className="message-conversation-row message-starred-workspace-row"
          onClick={() => openStarredMessage(item)}
          disabled={item.message.isDeleted}
          aria-label={t("starred.openInConversation", {
            name: item.conversation.title ?? t("starred.conversationFallback"),
          })}
        >
          <span className="message-avatar-presence">
            {conversationPeer
              ? renderAccountAvatar(conversationPeer)
              : renderGroupAvatar(item.conversation)}
          </span>

          <span className="message-conversation-copy">
            <span className="message-conversation-title-line">
              <strong>
                {item.conversation.title ?? t("starred.conversationFallback")}
              </strong>
              <time dateTime={item.starredAt}>
                {formatConversationTime(item.starredAt)}
              </time>
            </span>
            <span className="message-starred-message-sender">
              {senderLabel}
            </span>
            <span className="message-conversation-preview-line">
              <small>{starredMessagePreview(item, t)}</small>
              <span className="message-starred-message-type" aria-hidden="true">
                <MessageNavigationIcon name="starred" />
              </span>
            </span>
          </span>
        </button>

        <button
          type="button"
          className="message-starred-remove-action"
          onClick={() => void handleUnstarFromCollection(item)}
          disabled={starredActionId !== null}
          aria-label={`Remove starred message from ${item.conversation.title ?? "conversation"}`}
          title={t("starred.removeFromStarred")}
        >
          {starredActionId === item.message.id ? "…" : "×"}
        </button>
      </article>
    );
  }

  function renderMessageRequestRow(
    request: MessagingMessageRequest,
  ): ReactNode {
    return (
      <button
        type="button"
        key={request.id}
        className={`message-conversation-row message-request-workspace-row${
          selectedRequestId === request.id ? " active" : ""
        }`}
        onClick={() => {
          setSelectedRequestId(request.id);
          setNavigationExpanded(false);
        }}
      >
        <span className="message-avatar-presence">
          {renderAccountAvatar(request.peer)}
        </span>

        <span className="message-conversation-copy">
          <span className="message-conversation-title-line">
            <strong>{request.peer.displayName}</strong>
            <time dateTime={request.requestedAt}>
              {formatConversationTime(request.requestedAt)}
            </time>
          </span>
          <span className="message-request-workspace-status">
            {requestStatusLabel(request, t)}
          </span>
          <span className="message-conversation-preview-line">
            <small>{requestReasonLabel(request.reason, t)}</small>
            {request.status === "PENDING" && (
              <b aria-label={t("requestWorkspace.pendingAria")}>
                {t("requestWorkspace.pending")}
              </b>
            )}
          </span>
        </span>
      </button>
    );
  }

  function renderAnnouncementGroupRow(
    conversation: MessagingConversation,
  ): ReactNode {
    return (
      <button
        type="button"
        key={conversation.id}
        className={`message-conversation-row message-announcement-group-row${
          conversation.id === selectedConversationId ? " active" : ""
        }`}
        onClick={() => {
          setSelectedConversationId(conversation.id);
          setNavigationExpanded(false);
          setDetailsPanelOpen(false);
        }}
      >
        <span className="message-avatar-presence">
          {renderGroupAvatar(conversation)}
        </span>

        <span className="message-conversation-copy">
          <span className="message-conversation-title-line">
            <strong>
              {conversation.title ?? t("groupInfo.officialGroup")}
            </strong>
            <span className="message-announcement-group-open">
              {t("announcementCard.open")}
            </span>
          </span>
          <span className="message-announcement-group-purpose">
            {t("announcementCard.officialOnly")}
          </span>
          <span className="message-conversation-meta">
            <span className="message-conversation-kind">
              {t("profileDetail.official")}
            </span>
            <small>{officialScopeLabel(conversation, t)}</small>
          </span>
        </span>
      </button>
    );
  }

  function renderAnnouncementCard(
    announcement: AnnouncementListItem,
  ): ReactNode {
    const publishedAt =
      announcement.publishedAt ??
      announcement.scheduledAt ??
      announcement.updatedAt;
    const unread = Boolean(
      announcement.status === "PUBLISHED" &&
      announcement.viewerState &&
      !announcement.viewerState.isRead,
    );
    const acknowledgementPending = Boolean(
      announcement.requiresAcknowledgement &&
      announcement.viewerState &&
      !announcement.viewerState.isAcknowledged &&
      announcement.status === "PUBLISHED",
    );

    return (
      <article
        key={announcement.id}
        className={`message-announcement-card priority-${announcement.priority.toLowerCase()}${
          unread ? " unread" : ""
        }`}
      >
        <header>
          <div className="message-announcement-card-badges">
            <span className="message-announcement-priority">
              {announcementEnumLabel(announcement.priority, t)}
            </span>
            {announcement.status !== "PUBLISHED" && (
              <span className="message-announcement-status">
                {announcementEnumLabel(announcement.status, t)}
              </span>
            )}
            {announcement.isPinned && (
              <span>{t("announcementDetail.pinned")}</span>
            )}
            {unread && <strong>{t("announcementCard.new")}</strong>}
            {acknowledgementPending && (
              <strong className="action-required">
                {t("announcementCard.actionRequired")}
              </strong>
            )}
          </div>
          <time dateTime={publishedAt}>
            {formatAnnouncementDate(publishedAt)}
          </time>
        </header>

        <div className="message-announcement-card-body">
          <h3>{announcement.title}</h3>
          <p>{announcement.bodyPreview}</p>
        </div>

        <footer>
          <div className="message-announcement-publisher">
            <span aria-hidden="true">
              {initials(announcement.publisher.displayName)}
            </span>
            <div>
              <small>{t("announcementDetail.publishedBy")}</small>
              <strong>{announcement.publisher.displayName}</strong>
            </div>
          </div>

          <div className="message-announcement-card-meta">
            {announcement.attachmentCount > 0 && (
              <span>
                {t("announcementCard.attachments", {
                  count: announcement.attachmentCount,
                })}
              </span>
            )}
            {announcement.viewerState?.isAcknowledged && (
              <span>{t("announcementCard.acknowledged")}</span>
            )}
          </div>

          <button
            type="button"
            className="message-announcement-view-button"
            onClick={() => void openAnnouncementDetail(announcement.id)}
          >
            {t("announcementCard.view")}
            <span aria-hidden="true">→</span>
          </button>
        </footer>
      </article>
    );
  }

  function renderGroupSearchResult({
    conversation,
    matchedDisplayName,
  }: {
    conversation: MessagingConversation;
    matchedDisplayName: string | null;
  }): ReactNode {
    const scopeLabel =
      conversation.groupKind === "OFFICIAL"
        ? officialScopeLabel(conversation, t)
        : `${t("profileDetail.membersCount", { count: conversation.memberCount })} · ${t("groupInfo.personalGroup")}`;

    return (
      <button
        type="button"
        key={conversation.id}
        className={`message-conversation-row message-group-search-result${
          conversation.id === selectedConversationId ? " active" : ""
        }${conversation.groupKind === "OFFICIAL" ? " official" : ""}`}
        onClick={() => {
          setSelectedConversationId(conversation.id);
          setNavigationExpanded(false);
          setDetailsPanelOpen(false);
        }}
      >
        <span className="message-avatar-presence">
          {renderGroupAvatar(conversation)}
        </span>

        <span className="message-conversation-copy">
          <span className="message-conversation-title-line">
            <strong>
              {conversation.title ?? t("conversationList.groupConversation")}
            </strong>
            <time>
              {formatConversationTime(
                conversation.lastMessageAt ?? conversation.updatedAt,
              )}
            </time>
          </span>

          <span className="message-group-common-copy">
            {matchedDisplayName ? (
              <>
                {t("conversationList.alsoInGroup", {
                  name: matchedDisplayName,
                })}
              </>
            ) : (
              t("profileDetail.membersCount", {
                count: conversation.memberCount,
              })
            )}
          </span>
          <span className="message-group-search-scope">{scopeLabel}</span>
        </span>
      </button>
    );
  }

  function renderProfileContent(): ReactNode {
    if (profileLoading) {
      return (
        <div className="message-list-state compact" role="status">
          <span className="message-small-spinner" aria-hidden="true" />
          <p>{t("profileDetail.loading")}</p>
        </div>
      );
    }

    if (profileError && !profileData) {
      return (
        <div className="message-inline-error compact" role="alert">
          <p>{profileError}</p>
        </div>
      );
    }

    if (!profileData) {
      return null;
    }

    return (
      <div className="message-profile-content">
        <div className="message-profile-hero">
          <span className="message-profile-photo">
            {profilePhotoUrl ? (
              <img
                src={profilePhotoUrl}
                alt={t("profileDetail.profileImageAlt", {
                  name: profileData.displayName,
                })}
              />
            ) : (
              initials(profileData.displayName)
            )}
          </span>

          <div>
            <strong>{profileData.displayName}</strong>
            <span>{roleLabel(profileData.role, t)}</span>
            <small>
              {profileData.official?.primaryOrgUnit?.name ??
                profileData.official?.office?.name ??
                t("profileDetail.nepalTelecom")}
            </small>
          </div>
        </div>

        {profileError && (
          <div className="message-inline-error compact" role="alert">
            <p>{profileError}</p>
          </div>
        )}

        <section className="message-profile-section">
          <div className="message-profile-section-heading">
            <div>
              <h3>{t("profileDetail.about")}</h3>
              {profileData.isOwnProfile && (
                <p>{t("profileWorkspace.aboutHint")}</p>
              )}
            </div>
            {profileData.isOwnProfile && (
              <small>{profileBioDraft.length}/160</small>
            )}
          </div>

          {profileData.isOwnProfile ? (
            <>
              <textarea
                value={profileBioDraft}
                onChange={(event) =>
                  setProfileBioDraft(event.target.value.slice(0, 160))
                }
                maxLength={160}
                placeholder={t("profileWorkspace.aboutPlaceholder")}
              />
              <div className="message-profile-actions">
                <button
                  type="button"
                  onClick={() => void handleSaveProfileBio()}
                  disabled={profileSaving}
                >
                  {profileSaving
                    ? t("profileWorkspace.saving")
                    : t("profileWorkspace.saveAbout")}
                </button>
              </div>
            </>
          ) : (
            <p>{profileData.profileBio || t("profileWorkspace.noAbout")}</p>
          )}
        </section>

        {profileData.isOwnProfile && (
          <section className="message-profile-section">
            <div className="message-profile-section-heading">
              <div>
                <h3>{t("profileWorkspace.profilePhoto")}</h3>
                <p>{t("profileWorkspace.photoHint")}</p>
              </div>
            </div>
            <div className="message-profile-photo-controls">
              <label className="message-profile-photo-upload">
                <span>
                  {profilePhotoUploading
                    ? t("profileWorkspace.uploading")
                    : profileData.profilePhotoKey
                      ? t("profileWorkspace.changePhoto")
                      : t("profileWorkspace.uploadPhoto")}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => void handleProfilePhotoChange(event)}
                  disabled={profilePhotoUploading}
                />
              </label>

              {profileData.profilePhotoKey && (
                <button
                  type="button"
                  className="message-profile-photo-remove"
                  onClick={() => void handleRemoveProfilePhoto()}
                  disabled={profilePhotoUploading}
                >
                  {t("profileWorkspace.removePhoto")}
                </button>
              )}
            </div>
          </section>
        )}

        <section className="message-profile-section">
          <div className="message-profile-section-heading">
            <div>
              <h3>{t("profileWorkspace.officialInformation")}</h3>
              <p>{t("profileWorkspace.officialInformationHint")}</p>
            </div>
            <span className="message-profile-verified-badge">
              {t("profileDetail.verified")}
            </span>
          </div>
          <dl className="message-profile-details">
            <div>
              <dt>{t("profileDetail.employeeId")}</dt>
              <dd>
                {profileData.official?.employeeId ??
                  t("profileDetail.systemAccount")}
              </dd>
            </div>
            <div>
              <dt>{t("profileDetail.officialEmail")}</dt>
              <dd>
                {profileData.official?.officialEmail ??
                  profileData.username ??
                  "—"}
              </dd>
            </div>
            <div>
              <dt>{t("profileDetail.contactNumber")}</dt>
              <dd>{profileData.official?.contactNumber ?? "—"}</dd>
            </div>
            <div>
              <dt>{t("profileWorkspace.role")}</dt>
              <dd>{roleLabel(profileData.role, t)}</dd>
            </div>
            <div>
              <dt>{t("profileDetail.designation")}</dt>
              <dd>{profileData.official?.designation ?? "—"}</dd>
            </div>
            <div>
              <dt>{t("profileDetail.office", { ns: "messaging" })}</dt>
              <dd>{profileData.official?.office?.name ?? "—"}</dd>
            </div>
            <div>
              <dt>{t("profileDetail.orgUnit", { ns: "messaging" })}</dt>
              <dd>{profileData.official?.primaryOrgUnit?.name ?? "—"}</dd>
            </div>
            <div>
              <dt>{t("profileDetail.orgPath")}</dt>
              <dd>
                {profileData.official?.orgUnitBreadcrumb
                  .map((unit) => unit.name)
                  .join(" › ") || "—"}
              </dd>
            </div>
          </dl>
          <p className="message-profile-locked-note">
            {t("profileWorkspace.identityLocked")}
          </p>
        </section>

        {!profileData.isOwnProfile && (
          <section className="message-profile-section">
            <h3>{t("profileDetail.sharedGroups")}</h3>
            {profileData.sharedGroups.length === 0 ? (
              <p>{t("profileWorkspace.noSharedGroups")}</p>
            ) : (
              <ul className="message-profile-shared-groups">
                {profileData.sharedGroups.map((group) => (
                  <li key={group.id}>
                    <strong>
                      {group.title ?? t("profileDetail.groupFallback")}
                    </strong>
                    <span>
                      {group.groupKind === "OFFICIAL"
                        ? t("profileDetail.official")
                        : t("profileDetail.personal")}{" "}
                      ·{" "}
                      {t("profileDetail.membersCount", {
                        count: group.memberCount,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <div className="message-profile-footer">
          {!profileData.isOwnProfile && (
            <>
              <button
                type="button"
                onClick={() => void handleStartProfileConversation()}
                disabled={
                  profileSaving ||
                  profileData.contactMode === "REQUEST_SENT" ||
                  profileData.contactMode === "BLOCKED"
                }
              >
                {profileData.contactMode === "REQUEST_SENT"
                  ? t("profileDetail.requestSent")
                  : profileData.contactMode === "BLOCKED"
                    ? t("profileDetail.blocked")
                    : profileData.contactMode === "REQUEST_REQUIRED"
                      ? t("profileDetail.sendRequest")
                      : t("profileDetail.message")}
              </button>

              {profileData.blockDirection === "BLOCKED_BY_ME" ||
              profileData.blockDirection === "MUTUAL" ||
              blockedAccountIds.has(profileData.accountId) ? (
                <button
                  type="button"
                  className="message-profile-unblock"
                  onClick={() =>
                    void handleUnblockAccount(profileData.accountId)
                  }
                  disabled={blockActionAccountId !== null}
                >
                  {blockActionAccountId === profileData.accountId
                    ? t("profileDetail.working")
                    : t("profileDetail.unblock")}
                </button>
              ) : (
                <button
                  type="button"
                  className="message-profile-block"
                  onClick={() =>
                    openDestructiveConfirmation({
                      kind: "BLOCK_PRIVATE_CONTACT",
                      target: profileData,
                    })
                  }
                  disabled={blockActionAccountId !== null}
                >
                  {blockActionAccountId === profileData.accountId
                    ? t("profileDetail.working")
                    : t("profileDetail.blockPrivateContact")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return {
    navigate,
    t,
    account,
    accessToken,
    mainWorkspacePath,
    announcementMode,
    starredMode,
    archivedMode,
    requestMode,
    notificationMode,
    settingsMode,
    ownProfileMode,
    newConversationMode,
    createGroupMode,
    listCreateMode,
    selectedListId,
    listMode,
    listEditMode,
    listWorkspaceMode,
    listManagementMode,
    loggingOut,
    realtimeStatus,
    presenceByAccountId,
    conversations,
    conversationHasMore,
    chatFolders,
    chatFoldersLoading,
    chatFoldersError,
    listCandidatesLoading,
    listNameDraft,
    setListNameDraft,
    listSelectedConversationIds,
    listCandidateSearch,
    setListCandidateSearch,
    listSaving,
    listDeleting,
    listDeleteConfirmOpen,
    setListDeleteConfirmOpen,
    listWorkspaceError,
    setListWorkspaceError,
    announcementItems,
    announcementLoading,
    announcementError,
    announcementComposerOpen,
    announcementComposerMode,
    announcementComposerStatus,
    announcementComposerValues,
    setAnnouncementComposerValues,
    announcementAudienceOptions,
    announcementAudienceLoading,
    announcementComposerExistingAttachments,
    announcementComposerRemovedAttachmentIds,
    setAnnouncementComposerRemovedAttachmentIds,
    announcementComposerPendingAttachments,
    announcementComposerSubmitting,
    announcementComposerError,
    announcementComposerNotice,
    setAnnouncementComposerNotice,
    announcementDetailOpen,
    announcementDetail,
    announcementDetailLoading,
    announcementDetailError,
    announcementDeleteConfirmationOpen,
    setAnnouncementDeleteConfirmationOpen,
    announcementDetailAction,
    announcementAttachmentActionId,
    conversationListView,
    setConversationListView,
    conversationCategory,
    setConversationCategory,
    detailsPanelOpen,
    navigationExpanded,
    setNavigationExpanded,
    attachmentMenuOpen,
    setAttachmentMenuOpen,
    attachmentMenuView,
    setAttachmentMenuView,
    conversationActionMenuOpen,
    setConversationActionMenuOpen,
    conversationActionMenuView,
    setConversationActionMenuView,
    conversationHistoryAction,
    conversationHistorySubmitting,
    conversationHistoryError,
    conversationHistoryToast,
    setConversationHistoryToast,
    destructiveConfirmation,
    destructiveConfirmationError,
    composerEmojiOpen,
    setComposerEmojiOpen,
    openMessageMenuId,
    messageActionMenuAnchor,
    openReactionMenuId,
    activeMobileMessageId,
    reactionMenuPosition,
    selectedConversationId,
    setSelectedConversationId,
    messages,
    pinnedMessageBrowserOpen,
    setPinnedMessageBrowserOpen,
    setActivePinnedMessageIndex,
    newMessageCount,
    showJumpToLatest,
    conversationSearch,
    setConversationSearch,
    setMentionSuggestionsDismissed,
    activeMentionSuggestionIndex,
    setActiveMentionSuggestionIndex,
    messageText,
    setMessageText,
    setComposerCaretIndex,
    replyingTo,
    editingMessage,
    messageActionId,
    reactionActionId,
    messageInformation,
    messageInformationLoadingId,
    messageInformationError,
    messageInformationVisibleReadCount,
    setMessageInformationVisibleReadCount,
    messageInformationVisibleDeliveredCount,
    setMessageInformationVisibleDeliveredCount,
    conversationPreferenceLoading,
    conversationLoading,
    messageLoading,
    olderMessagesLoading,
    sendingMessage,
    sendAttemptFailed,
    setSendAttemptFailed,
    selectedAttachments,
    selectedAttachmentKind,
    attachmentUpload,
    voiceRecordingState,
    voiceRecordingSeconds,
    locationDurationMinutes,
    setLocationDurationMinutes,
    locationActionLoading,
    activeLiveLocation,
    attachmentViewer,
    announcementAttachmentViewer,
    sharedContentOpen,
    sharedContentReturnView,
    sharedContentTab,
    sharedContent,
    sharedContentLoading,
    sharedContentError,
    storageUsageScope,
    storageUsage,
    storageUsageLoading,
    storageUsageError,
    storageUsageActionId,
    storageDeleteConfirmation,
    setStorageDeleteConfirmation,
    hasOlderMessages,
    pageError,
    messageError,
    setMessageError,
    messageNotice,
    forwardingMessage,
    forwardDestinationIds,
    forwardSearch,
    setForwardSearch,
    forwardDestinationError,
    forwardSubmitting,
    groupPanelTab,
    setGroupPanelTab,
    groupManagementWorkspaceOpen,
    groupMemberSearch,
    setGroupMemberSearch,
    groupMembersExpanded,
    setGroupMembersExpanded,
    officialGroupMembers,
    officialGroupMembersHasMore,
    officialGroupMembersLoading,
    officialGroupMembersLoadingMore,
    officialGroupMembersError,
    officialGroupMemberSearchResults,
    officialGroupMemberSearchHasMore,
    officialGroupMemberSearchLoading,
    officialGroupMemberSearchLoadingMore,
    officialGroupMemberSearchError,
    officialMentionHasMore,
    officialMentionLoading,
    officialMentionLoadingMore,
    officialMentionError,
    profileReturnToGroupInformation,
    profileSharedGroupsExpanded,
    setProfileSharedGroupsExpanded,
    groupKind,
    setGroupKind,
    officialGroupScopes,
    officialGroupCanReconcileAll,
    officialGroupScopeKey,
    setOfficialGroupScopeKey,
    officialGroupScopesLoading,
    officialGroupAudit,
    officialGroupAuditLoading,
    officialGroupReconciling,
    groupTitle,
    setGroupTitle,
    groupDescription,
    setGroupDescription,
    groupSearch,
    setGroupSearch,
    groupContacts,
    groupSelectedAccountIds,
    setGroupSelectedAccountIds,
    groupSelectedContacts,
    setGroupSelectedContacts,
    groupContactsLoading,
    groupSubmitting,
    groupActionAccountId,
    groupError,
    setGroupError,
    groupInviteLink,
    groupInviteLoading,
    groupInviteNotice,
    groupInviteError,
    inviteJoinLoading,
    groupPhotoUploading,
    groupPhotoInputRef,
    privateGroupDialogOpen,
    privateGroupSearch,
    setPrivateGroupSearch,
    privateGroupContacts,
    privateGroupSelectedAccountIds,
    privateGroupSelectedContacts,
    privateGroupHistoryWindow,
    setPrivateGroupHistoryWindow,
    privateGroupContactsLoading,
    privateGroupSubmitting,
    privateGroupError,
    contactSearch,
    setContactSearch,
    contacts,
    contactsLoading,
    contactError,
    creatingConversationId,
    starredLoading,
    starredLoadingMore,
    starredHasMore,
    starredError,
    messageRequests,
    requestListView,
    setRequestListView,
    setSelectedRequestId,
    requestsLoading,
    requestActionId,
    requestError,
    requestNotice,
    setRequestNotice,
    notifications,
    notificationUnreadCount,
    notificationListView,
    setNotificationListView,
    activeUtilityPanel,
    profileAccountId,
    notificationToast,
    notificationsLoading,
    notificationError,
    notificationActionNotice,
    notificationBulkAction,
    notificationDeletingId,
    notificationSoundEnabled,
    setNotificationSoundEnabled,
    browserNotificationsEnabled,
    backgroundPushReady,
    settingsTab,
    setSettingsTab,
    messagingSettingsLoading,
    messagingSettingsSaving,
    messagingSettingsError,
    messagingSettingsNotice,
    securityAction,
    securityNotice,
    securityError,
    messagingCustomization,
    messagingSettings,
    systemPrefersDark,
    blockedAccounts,
    blockedAccountsLoading,
    blockActionAccountId,
    blockSettingsError,
    blockSettingsNotice,
    searchPanelOpen,
    searchText,
    setSearchText,
    searchResults,
    searchLoading,
    searchError,
    highlightedMessageId,
    profileData,
    profilePhotoUrl,
    profilePhotoUrls,
    profileLoading,
    profileSaving,
    profileError,
    messageListRef,
    messageThreadContentRef,
    conversationActionButtonRef,
    conversationActionMenuRef,
    conversationHistoryDialogRef,
    conversationHistoryCancelRef,
    messageSearchInputRef,
    messageSearchTriggerRef,
    closeMessageSearchPanel,
    composerRef,
    conversationSearchInputRef,
    conversationListRef,
    attachmentInputRef,
    attachmentMenuRef,
    attachmentMenuButtonRef,
    attachmentViewerDialogRef,
    composerEmojiMenuRef,
    composerEmojiButtonRef,
    selectedConversation,
    loadOfficialGroupMemberPage,
    loadMoreOfficialGroupMembers,
    selectedChatFolder,
    conversationHistoryTarget,
    announcementComposerGroup,
    canManageSelectedAnnouncementGroup,
    destructiveConfirmationSubmitting,
    destructiveConfirmationContent,
    groupInviteUrl,
    activeMentionQuery,
    loadMoreOfficialMentionSuggestions,
    mentionSuggestions,
    mentionPanelVisible,
    activeMentionOptionId,
    canCreateOfficialGroup,
    selectedOfficialGroupScope,
    filteredConversations,
    conversationSearchResults,
    filteredListCandidateConversations,
    announcementGroupSearchResults,
    filteredStarredItems,
    filteredRequestItems,
    filteredNotifications,
    selectedMessageRequest,
    conversationSearchResultCount,
    displayMessages,
    visiblePinnedMessages,
    normalizedPinnedMessageIndex,
    activePinnedMessage,
    filteredForwardConversations,
    totalUnread,
    loadConversations,
    loadChatFolders,
    loadListCandidateConversations,
    loadSelectedGroupAnnouncements,
    openAnnouncementComposer,
    closeAnnouncementDetail,
    openAnnouncementEditor,
    handleAnnouncementAttachmentSelection,
    removePendingAnnouncementAttachment,
    handleAnnouncementComposerSubmit,
    handleAnnouncementComposerCancel,
    handleAnnouncementAcknowledgement,
    handleAnnouncementDelete,
    closeAnnouncementAttachmentViewer,
    handleAnnouncementAttachmentOpen,
    handleAnnouncementAttachmentDownload,
    loadStarredMessages,
    loadMoreStarredMessages,
    loadMessageRequests,
    stopLocalTyping,
    updateLocalTyping,
    clearSelectedAttachment,
    releaseInitialMessageBottomAnchor,
    handleMessageThreadScroll,
    jumpToLatestMessages,
    handleMessageMediaLayoutReady,
    handleLogout,
    openCreateGroup,
    openGroupInformation,
    openManageGroup,
    returnToConversationInformation,
    closeGroupDialog,
    openPrivateGroupDialog,
    closePrivateGroupDialog,
    togglePrivateGroupMember,
    toggleGroupMember,
    handleCreateGroup,
    handleCreatePrivateGroup,
    handleReconcileOfficialGroups,
    handleSaveGroupDetails,
    handleCreateGroupInviteLink,
    handleCopyGroupInviteLink,
    handleRevokeGroupInviteLink,
    handleGroupPhotoChange,
    handleRemoveGroupPhoto,
    handleAddGroupMembers,
    handleGroupRoleChange,
    handleRemoveGroupMember,
    openNewConversation,
    openCreateList,
    openChatFolder,
    openSelectedListManager,
    toggleListConversation,
    handleSaveMessageList,
    handleDeleteMessageList,
    openProfile,
    closeProfile,
    closeConversationDetailsPanel,
    handleStartProfileConversation,
    handleCreateConversation,
    openMessageRequests,
    openNotificationsWorkspace,
    openSettingsWorkspace,
    handleNotificationClick,
    handleMarkAllNotificationsRead,
    handleDeleteNotification,
    handleDeleteReadNotifications,
    updateMessagingCustomization,
    resetMessagingCustomization,
    updateMessagingSettings,
    resetPrivacySettings,
    resetNotificationSettings,
    handleBrowserNotificationToggle,
    handleLogoutAllDevices,
    openMessageSearchPanel,
    openSearchMessageResult,
    handleAcceptRequest,
    handleDeclineRequest,
    handleBlockRequest,
    handleUnblockAccount,
    beginVoiceRecording,
    finishVoiceRecording,
    cancelVoiceRecording,
    handleShareCurrentLocation,
    handleStartLiveLocation,
    handleStopLiveLocation,
    removeSelectedAttachment,
    openAttachmentPicker,
    insertComposerEmoji,
    handleAttachmentChange,
    handleDownloadAttachment,
    closeAttachmentViewer,
    handlePreviewAttachment,
    handleReaction,
    focusReplySource,
    closePinnedMessageBrowser,
    movePinnedMessageSelection,
    focusPinnedMessage,
    focusSharedContentMessage,
    openSharedContentPanel,
    selectSharedContentTab,
    returnFromSharedContent,
    closeSharedContentPanel,
    loadStorageUsage,
    openStorageUsage,
    handleStorageWorkspaceBack,
    openStorageOriginalMessage,
    handleStorageFileDelete,
    closeMessageInformationPanel,
    openConversationHistoryConfirmation,
    closeConversationHistoryConfirmation,
    openDestructiveConfirmation,
    closeDestructiveConfirmation,
    submitDestructiveConfirmation,
    handlePersonalConversationHistoryAction,
    toggleConversationFavorite,
    changeConversationMute,
    closeActiveConversation,
    beginReply,
    cancelMessageAction,
    closeForwardDialog,
    toggleForwardDestination,
    handleForwardMessage,
    handleMentionSelect,
    handleSendMessage,
    handleComposerKeyDown,
    handleLoadOlderMessages,
    realtimeLabel,
    peer,
    peerPresence,
    typingParticipants,
    peerActivityLabel,
    selectedGroupMemberIds,
    privateGroupOriginalMemberIds,
    blockedMessageRequests,
    blockedAccountIds,
    groupInfoConversation,
    groupInfoParticipants,
    groupInfoOwner,
    groupInfoAdmins,
    selectedConversationSharedContent,
    closeTransientMessagePopups,
    handleMessagePointerEnter,
    handleMobileMessagePointerDown,
    handleMobileMessagePointerMove,
    handleMobileMessagePointerEnd,
    handleMobileMessageContextMenu,
    toggleMessageActionMenu,
    toggleReactionMenu,
    handleNavigationClickCapture,
    localizedAttachmentLabel,
    renderIdentityAvatar,
    renderAccountAvatar,
    renderGroupAvatar,
    renderConversationAvatar,
    announcementAttachmentViewerItems,
    announcementAttachmentViewerIndex,
    announcementAttachmentViewerShowsFooter,
    attachmentViewerItems,
    attachmentViewerIndex,
    attachmentViewerShowsFooter,
    composerHasContent,
    showVoiceRecordAction,
    remainingMessageCharacters,
    composerSendState,
    messageActionMenuMessage,
    reactionMenuMessage,
    mobileMessageActionMessage,
    renderFloatingReactionMenu,
    renderFloatingMessageActionMenu,
    handleConversationSearchKeyDown,
    handleConversationListKeyDown,
    conversationPeerFor,
    renderConversationRow,
    renderConversationLoadMoreControl,
    renderStarredMessageRow,
    renderMessageRequestRow,
    renderAnnouncementGroupRow,
    renderAnnouncementCard,
    renderGroupSearchResult,
    renderProfileContent,
  };
}
