import {
  Fragment,
  useCallback,
  useEffect,
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
import type { TFunction } from "i18next";

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
  AnnouncementDetail,
  AnnouncementListItem,
  AnnouncementMutationInput,
  AnnouncementPriority,
  AnnouncementRealtimePayload,
  AnnouncementStatus,
  CreateAnnouncementInput,
} from "../types/announcements";
import {
  formatMessagingConversationTime as formatConversationTime,
  formatMessagingDay as formatMessageDay,
  formatMessagingLastSeen as formatLastSeen,
  formatMessagingLongDateTime as formatAnnouncementDate,
  formatMessagingTime as formatMessageTime,
  formatMessagingTimestampLabel as notificationTimestampLabel,
  isSameMessagingCalendarDay as isSameCalendarDay,
} from "../utils/messaging-date-time";
import {
  BROWSER_NOTIFICATION_STORAGE_KEY,
  DEFAULT_MESSAGING_CUSTOMIZATION,
  DENSITY_OPTIONS,
  NOTIFICATION_SOUND_STORAGE_KEY,
  THEME_OPTIONS,
  WALLPAPER_OPTIONS,
  readMessagingBooleanPreference,
  readMessagingCustomization,
  readMessagingDeviceSettings,
  resolveMessagingTheme,
  writeMessagingBooleanPreference,
  writeMessagingCustomization,
  writeMessagingDeviceSettings,
} from "../utils/messaging-preferences";
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
  MessagingDensity,
  MessagingTheme,
  MessagingWallpaper,
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
  SharedContentAttachmentItem,
  SharedContentLinkItem,
  ConversationMuteSetting,
  MessageInformation,
  MessagingMessage,
  MessagingMention,
  MessagingAnnouncementPayload,
  MessagingLocationPayload,
  MessagingMessageRequest,
  MessagingNotification,
  MessagingSearchMessageResult,
  MessagingStorageLargestFile,
  MessagingUserProfile,
  OfficialGroupAuditEntry,
  OfficialGroupScopeOption,
  PrivateGroupHistoryWindow,
  StarredMessageItem,
  ConversationStorageUsageResponse,
  UserStorageUsageResponse,
  ChatFolder,
} from "../types/messaging";

type RealtimeConnectionStatus =
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "DISCONNECTED";

type SharedContentTab = "MEDIA" | "DOCUMENTS" | "LINKS";
type SharedContentReturnView =
  | "GROUP_INFORMATION"
  | "PROFILE"
  | "GROUP_MANAGEMENT";
type StorageUsageScope =
  | { kind: "USER" }
  | { kind: "CONVERSATION"; conversationId: string };
type StorageUsageData =
  | UserStorageUsageResponse
  | ConversationStorageUsageResponse;
type ConversationCategory =
  | "ALL"
  | "UNREAD"
  | "GROUPS"
  | "OFFICIAL";
type PersonalConversationHistoryAction = "CLEAR" | "DELETE";
type DestructiveConfirmation =
  | { kind: "DELETE_MESSAGE_FOR_ME"; message: MessagingMessage }
  | { kind: "DELETE_MESSAGE_FOR_EVERYONE"; message: MessagingMessage }
  | { kind: "LEAVE_GROUP"; conversationId: string; conversationTitle: string }
  | {
      kind: "DELETE_GROUP";
      conversationId: string;
      conversationTitle: string;
      groupKind: GroupKind;
    }
  | { kind: "BLOCK_PRIVATE_CONTACT"; target: MessagingAccount };

interface DestructiveConfirmationCopy {
  eyebrow: string;
  title: string;
  description: string;
  consequences: string[];
  confirmLabel: string;
}

type AnnouncementPublishTiming = "NOW" | "SCHEDULE";
type AnnouncementComposerMode = "CREATE" | "EDIT";
type AnnouncementComposerAction = "PUBLISH" | "SAVE" | "CANCEL";

interface AnnouncementComposerValues {
  title: string;
  body: string;
  priority: AnnouncementPriority;
  publishTiming: AnnouncementPublishTiming;
  scheduledAt: string;
  expiresAt: string;
  requiresAcknowledgement: boolean;
  allowAttachmentDownload: boolean;
  isPinned: boolean;
}

type AnnouncementPendingAttachmentStatus =
  | "READY"
  | "UPLOADING"
  | "UPLOADED"
  | "REMOVING"
  | "ERROR";

interface AnnouncementPendingAttachment {
  clientId: string;
  file: File;
  category: AnnouncementAttachmentCategory;
  progressPercent: number;
  status: AnnouncementPendingAttachmentStatus;
  serverAttachmentId: string | null;
  error: string | null;
}

function destructiveConfirmationCopy(
  action: DestructiveConfirmation,
  t: TFunction,
): DestructiveConfirmationCopy {
  switch (action.kind) {
    case "DELETE_MESSAGE_FOR_ME":
      return {
        eyebrow: t("confirmation.deleteForMe.eyebrow", { ns: "messaging" }),
        title: t("confirmation.deleteForMe.title", { ns: "messaging" }),
        description: t("confirmation.deleteForMe.description", { ns: "messaging" }),
        consequences: [
          t("confirmation.deleteForMe.consequence1", { ns: "messaging" }),
          t("confirmation.deleteForMe.consequence2", { ns: "messaging" }),
          t("confirmation.deleteForMe.consequence3", { ns: "messaging" }),
        ],
        confirmLabel: t("confirmation.deleteForMe.confirm", { ns: "messaging" }),
      };
    case "DELETE_MESSAGE_FOR_EVERYONE":
      return {
        eyebrow: t("confirmation.deleteForEveryone.eyebrow", { ns: "messaging" }),
        title: t("confirmation.deleteForEveryone.title", { ns: "messaging" }),
        description: t("confirmation.deleteForEveryone.description", { ns: "messaging" }),
        consequences: [
          t("confirmation.deleteForEveryone.consequence1", { ns: "messaging" }),
          t("confirmation.deleteForEveryone.consequence2", { ns: "messaging" }),
          t("confirmation.deleteForEveryone.consequence3", { ns: "messaging" }),
        ],
        confirmLabel: t("confirmation.deleteForEveryone.confirm", { ns: "messaging" }),
      };
    case "LEAVE_GROUP":
      return {
        eyebrow: t("confirmation.leaveGroup.eyebrow", { ns: "messaging" }),
        title: t("confirmation.leaveGroup.title", {
          name: action.conversationTitle,
          ns: "messaging",
        }),
        description: t("confirmation.leaveGroup.description", { ns: "messaging" }),
        consequences: [
          t("confirmation.leaveGroup.consequence1", { ns: "messaging" }),
          t("confirmation.leaveGroup.consequence2", { ns: "messaging" }),
          t("confirmation.leaveGroup.consequence3", { ns: "messaging" }),
        ],
        confirmLabel: t("confirmation.leaveGroup.confirm", { ns: "messaging" }),
      };
    case "DELETE_GROUP":
      return action.groupKind === "OFFICIAL"
        ? {
            eyebrow: t("confirmation.deleteOfficialGroup.eyebrow", { ns: "messaging" }),
            title: t("confirmation.deleteOfficialGroup.title", { name: action.conversationTitle, ns: "messaging" }),
            description: t("confirmation.deleteOfficialGroup.description", { ns: "messaging" }),
            consequences: [
              t("confirmation.deleteOfficialGroup.consequence1", { ns: "messaging" }),
              t("confirmation.deleteOfficialGroup.consequence2", { ns: "messaging" }),
              t("confirmation.deleteOfficialGroup.consequence3", { ns: "messaging" }),
            ],
            confirmLabel: t("confirmation.deleteOfficialGroup.confirm", { ns: "messaging" }),
          }
        : {
            eyebrow: t("confirmation.deleteGroup.eyebrow", { ns: "messaging" }),
            title: t("confirmation.deleteGroup.title", { name: action.conversationTitle, ns: "messaging" }),
            description: t("confirmation.deleteGroup.description", { ns: "messaging" }),
            consequences: [
              t("confirmation.deleteGroup.consequence1", { ns: "messaging" }),
              t("confirmation.deleteGroup.consequence2", { ns: "messaging" }),
              t("confirmation.deleteGroup.consequence3", { ns: "messaging" }),
            ],
            confirmLabel: t("confirmation.deleteGroup.confirm", { ns: "messaging" }),
          };
    case "BLOCK_PRIVATE_CONTACT":
      return {
        eyebrow: t("confirmation.blockContact.eyebrow", { ns: "messaging" }),
        title: t("confirmation.blockContact.title", {
          name: action.target.displayName,
          ns: "messaging",
        }),
        description: t("confirmation.blockContact.description", { ns: "messaging" }),
        consequences: [
          t("confirmation.blockContact.consequence1", { ns: "messaging" }),
          t("confirmation.blockContact.consequence2", { ns: "messaging" }),
          t("confirmation.blockContact.consequence3", { ns: "messaging" }),
        ],
        confirmLabel: t("confirmation.blockContact.confirm", { ns: "messaging" }),
      };
  }
}


const PRIVATE_GROUP_HISTORY_OPTIONS: Array<{
  value: PrivateGroupHistoryWindow;
  labelKey: string;
  descriptionKey: string;
}> = [
  {
    value: "NONE",
    labelKey: "privateGroup.history.none.label",
    descriptionKey: "privateGroup.history.none.description",
  },
  {
    value: "LAST_15_MINUTES",
    labelKey: "privateGroup.history.last_15_minutes.label",
    descriptionKey: "privateGroup.history.last_15_minutes.description",
  },
  {
    value: "LAST_1_HOUR",
    labelKey: "privateGroup.history.last_1_hour.label",
    descriptionKey: "privateGroup.history.last_1_hour.description",
  },
  {
    value: "LAST_24_HOURS",
    labelKey: "privateGroup.history.last_24_hours.label",
    descriptionKey: "privateGroup.history.last_24_hours.description",
  },
];
const SELECTED_CONVERSATION_STORAGE_KEY = "nt-message:selected-conversation";
const HIGHLIGHT_MESSAGE_STORAGE_KEY = "nt-message:highlight-message";
const MESSAGE_NAVIGATION_STORAGE_KEY = "nt-message:navigation-expanded";
const NOTIFICATION_SOUND_URL = "/sounds/web-whatsapp.mp3";
const MESSAGE_EDIT_WINDOW_MS = 20 * 60 * 1000;
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;
type QuickReaction = (typeof QUICK_REACTIONS)[number];
const QUICK_REACTION_SET = new Set<string>(QUICK_REACTIONS);

type MessagingSettingsTab =
  | "PRIVACY"
  | "NOTIFICATIONS"
  | "APPEARANCE"
  | "STORAGE"
  | "BLOCKED"
  | "SECURITY";

type GroupInformationTab = "OVERVIEW" | "MEMBERS" | "SETTINGS";

interface MessagingSettings {
  showOnlineStatus: boolean;
  showReadReceipts: boolean;
  requireMessageRequests: boolean;
  notificationPreview: boolean;
  muteAllNotifications: boolean;
}

const DEFAULT_MESSAGING_SETTINGS: MessagingSettings = {
  showOnlineStatus: true,
  showReadReceipts: true,
  requireMessageRequests: true,
  notificationPreview: true,
  muteAllNotifications: false,
};

const SETTINGS_TABS: Array<{
  value: MessagingSettingsTab;
  labelKey: string;
}> = [
  { value: "PRIVACY", labelKey: "messageSettings.tabs.privacy" },
  { value: "NOTIFICATIONS", labelKey: "messageSettings.tabs.notifications" },
  { value: "APPEARANCE", labelKey: "messageSettings.tabs.appearance" },
  { value: "STORAGE", labelKey: "messageSettings.tabs.storage" },
  { value: "BLOCKED", labelKey: "messageSettings.tabs.blocked" },
  { value: "SECURITY", labelKey: "messageSettings.tabs.security" },
];

function buildGroupInviteUrl(token: string): string {
  const encodedToken = encodeURIComponent(token);

  if (typeof window === "undefined") {
    return `/messages?invite=${encodedToken}`;
  }

  return `${window.location.origin}/messages?invite=${encodedToken}`;
}

// Copies text to the clipboard with a browser-safe fallback.
async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  // Fallback keeps copy working in older browsers or non-secure localhost contexts.
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

const MEDIA_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
] as const;
const AUDIO_ATTACHMENT_TYPES = [
  "audio/aac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
] as const;
const DOCUMENT_ATTACHMENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
] as const;
const ACCEPTED_ATTACHMENT_TYPES = [
  ...MEDIA_ATTACHMENT_TYPES,
  ...AUDIO_ATTACHMENT_TYPES,
  ...DOCUMENT_ATTACHMENT_TYPES,
].join(",");
const COMPOSER_EMOJI_SECTIONS = [
  {
    labelKey: "composer.emojiSections.smileys",
    emojis: [
      "😀",
      "😃",
      "😄",
      "😁",
      "😆",
      "😅",
      "😂",
      "🤣",
      "😊",
      "🙂",
      "😉",
      "😍",
      "🥰",
      "😘",
      "😎",
      "🤩",
      "🤔",
      "😮",
      "😢",
      "😭",
      "😡",
      "🥳",
      "😴",
      "🤗",
    ],
  },
  {
    labelKey: "composer.emojiSections.gestures",
    emojis: [
      "👍",
      "👎",
      "👌",
      "✌️",
      "🤞",
      "🤟",
      "🤘",
      "👏",
      "🙌",
      "🙏",
      "💪",
      "👋",
      "🤝",
      "☝️",
      "👇",
      "👉",
    ],
  },
  {
    labelKey: "composer.emojiSections.heartsSymbols",
    emojis: [
      "❤️",
      "🩷",
      "🧡",
      "💛",
      "💚",
      "💙",
      "💜",
      "🤍",
      "🤎",
      "🖤",
      "💔",
      "❣️",
      "💕",
      "💯",
      "✅",
      "❌",
    ],
  },
  {
    labelKey: "composer.emojiSections.celebration",
    emojis: [
      "🎉",
      "🎊",
      "🎂",
      "🎁",
      "🏆",
      "🥇",
      "⭐",
      "🌟",
      "✨",
      "🔥",
      "🚀",
      "💡",
      "📌",
      "📣",
      "🔔",
      "💬",
    ],
  },
  {
    labelKey: "composer.emojiSections.foodNature",
    emojis: [
      "☕",
      "🍵",
      "🍕",
      "🍔",
      "🍰",
      "🍎",
      "🌹",
      "🌻",
      "🌈",
      "☀️",
      "🌙",
      "⚡",
      "🌧️",
      "❄️",
      "🐶",
      "🐱",
    ],
  },
] as const;
const MAX_IMAGE_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENT_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const MAX_AUDIO_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_ATTACHMENT_BYTES = 200 * 1024 * 1024;
const MAX_MESSAGE_ATTACHMENT_FILES = 10;
const MAX_MESSAGE_ATTACHMENT_TOTAL_BYTES = 250 * 1024 * 1024;
const ACCEPTED_ATTACHMENT_MIME_TYPES = new Set<string>([
  ...MEDIA_ATTACHMENT_TYPES,
  ...AUDIO_ATTACHMENT_TYPES,
  ...DOCUMENT_ATTACHMENT_TYPES,
]);
const VOICE_NOTE_MIME_TYPE_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const;

function customizationToken(value: string): string {
  return value.toLowerCase().replace(/_/g, "-");
}

function isSupportedQuickReaction(value: string): value is QuickReaction {
  return QUICK_REACTION_SET.has(value);
}

interface MessageReactionGroup {
  emoji: string;
  count: number;
  reactedByViewer: boolean;
  label: string;
}

function groupMessageReactions(
  message: MessagingMessage,
  viewerAccountId: string | null | undefined,
  t: TFunction,
): MessageReactionGroup[] {
  const grouped = new Map<string, MessageReactionGroup>();

  for (const reaction of message.reactions ?? []) {
    if (!isSupportedQuickReaction(reaction.reactionValue)) {
      continue;
    }

    const existing = grouped.get(reaction.reactionValue);
    const displayName =
      reaction.account?.displayName ??
      (reaction.accountId === viewerAccountId
        ? t("thread.message.you", { ns: "messaging" })
        : t("thread.message.unknownUser", { ns: "messaging" }));

    if (existing) {
      existing.count += 1;
      existing.reactedByViewer ||= reaction.accountId === viewerAccountId;
      existing.label = `${existing.label}, ${displayName}`;
      continue;
    }

    grouped.set(reaction.reactionValue, {
      emoji: reaction.reactionValue,
      count: 1,
      reactedByViewer: reaction.accountId === viewerAccountId,
      label: displayName,
    });
  }

  return [...grouped.values()].sort((first, second) =>
    first.emoji.localeCompare(second.emoji),
  );
}

function getViewerReaction(
  message: MessagingMessage,
  viewerAccountId?: string | null,
): string | null {
  return (
    message.reactions?.find(
      (reaction) => reaction.accountId === viewerAccountId,
    )?.reactionValue ?? null
  );
}

interface MessageAttachmentCardProps {
  accessToken: string | null;
  conversationId: string;
  messageId: string;
  attachment: MessagingAttachment;
  isVoiceNote: boolean;
  senderDisplayName: string;
  senderPhotoUrl: string | null;
  onPreview: (attachment: MessagingAttachment) => void;
  onMediaLayoutReady: () => void;
}

interface AttachmentViewerState {
  message: MessagingMessage;
  attachment: MessagingAttachment;
  objectUrl: string | null;
  loading: boolean;
  error: string | null;
}

interface AnnouncementAttachmentViewerState {
  announcement: AnnouncementDetail;
  attachment: AnnouncementAttachment;
  objectUrl: string | null;
  loading: boolean;
  error: string | null;
}

type AttachmentUploadStatus = "IDLE" | "UPLOADING" | "FAILED";

interface AttachmentUploadState {
  status: AttachmentUploadStatus;
  progressPercent: number;
  loadedBytes: number;
  totalBytes: number | null;
  error: string | null;
}

interface SelectedComposerAttachment {
  id: string;
  file: File;
  previewUrl: string | null;
}

const EMPTY_ATTACHMENT_UPLOAD_STATE: AttachmentUploadState = {
  status: "IDLE",
  progressPercent: 0,
  loadedBytes: 0,
  totalBytes: null,
  error: null,
};

type AttachmentGlyphName =
  | "audio"
  | "copy"
  | "document"
  | "download"
  | "edit"
  | "forward"
  | "image"
  | "info"
  | "location"
  | "microphone"
  | "pause"
  | "pdf"
  | "pin"
  | "play"
  | "retry"
  | "star"
  | "trash"
  | "video";

function AttachmentGlyph({ name }: { name: AttachmentGlyphName }) {
  const commonProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "image":
      return (
        <svg {...commonProps}>
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <circle cx="8.5" cy="9" r="1.6" />
          <path d="m5 17 4.5-4.5 3.2 3.2 2-2L19 18" />
        </svg>
      );
    case "video":
      return (
        <svg {...commonProps}>
          <rect x="3" y="5" width="14" height="14" rx="3" />
          <path d="m10 9 4 3-4 3Z" />
          <path d="m17 10 4-2v8l-4-2" />
        </svg>
      );
    case "audio":
      return (
        <svg {...commonProps}>
          <path d="M9 18V6l8-2v12" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="14" cy="16" r="3" />
        </svg>
      );
    case "location":
      return (
        <svg {...commonProps}>
          <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      );
    case "microphone":
      return (
        <svg {...commonProps}>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
        </svg>
      );
    case "pdf":
      return (
        <svg {...commonProps}>
          <path d="M6 3h8l4 4v14H6Z" />
          <path d="M14 3v5h5" />
          <path d="M8.5 15h7M8.5 18h5" />
        </svg>
      );
    case "document":
      return (
        <svg {...commonProps}>
          <path d="M6 3h8l4 4v14H6Z" />
          <path d="M14 3v5h5M9 12h6M9 16h6" />
        </svg>
      );
    case "copy":
      return (
        <svg {...commonProps}>
          <rect x="8" y="8" width="11" height="11" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
      );
    case "download":
      return (
        <svg {...commonProps}>
          <path d="M12 3v12" />
          <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
          <path d="M5 21h14" />
        </svg>
      );
    case "edit":
      return (
        <svg {...commonProps}>
          <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
          <path d="m13.5 8.5 3 3" />
        </svg>
      );
    case "forward":
      return (
        <svg {...commonProps}>
          <path d="m14 5 6 7-6 7v-4H9c-3.3 0-5.7 1.1-7 3 1-5.4 4-8 9-8h3V5Z" />
        </svg>
      );
    case "info":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7h.01" />
        </svg>
      );
    case "pause":
      return (
        <svg {...commonProps}>
          <path d="M9 7v10M15 7v10" />
        </svg>
      );
    case "pin":
      return (
        <svg {...commonProps}>
          <path d="m9 3 6 0-.8 5 3 3H6.8l3-3L9 3Z" />
          <path d="M12 11v10" />
        </svg>
      );
    case "retry":
      return (
        <svg {...commonProps}>
          <path d="M20 7v5h-5" />
          <path d="M18.2 16a8 8 0 1 1 .7-8.5L20 12" />
        </svg>
      );
    case "star":
      return (
        <svg {...commonProps}>
          <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
        </svg>
      );
    case "trash":
      return (
        <svg {...commonProps}>
          <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
        </svg>
      );
    case "play":
    default:
      return (
        <svg {...commonProps}>
          <path d="m9 7 8 5-8 5Z" />
        </svg>
      );
  }
}

function CompactAttachmentAudio({
  src,
  voiceNote,
  senderDisplayName,
  senderPhotoUrl,
  onMediaLayoutReady,
}: {
  src: string;
  voiceNote: boolean;
  senderDisplayName?: string;
  senderPhotoUrl?: string | null;
  onMediaLayoutReady?: () => void;
}) {
  const { t } = useTranslation("messaging");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const waveformBars = voiceNote ? 34 : 24;
  const progressRatio = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [src]);

  function togglePlayback() {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (audio.paused) {
      void audio.play().catch(() => setPlaying(false));
      return;
    }

    audio.pause();
  }

  function handleSeek(nextTime: number) {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  return (
    <div
      className={`message-audio-player-v3${voiceNote ? " voice-note" : " audio-file"}`}
    >
      <span className="message-audio-avatar-v3" aria-hidden="true">
        <span className="message-audio-avatar-visual-v3">
          {voiceNote && senderPhotoUrl ? (
            <img src={senderPhotoUrl} alt="" />
          ) : voiceNote ? (
            <span>{initials(senderDisplayName ?? t("attachment.voiceMessage"))}</span>
          ) : (
            <AttachmentGlyph name="audio" />
          )}
        </span>
        {voiceNote && (
          <span className="message-audio-microphone-v3">
            <AttachmentGlyph name="microphone" />
          </span>
        )}
      </span>

      <button
        type="button"
        className="message-audio-play-v3"
        onClick={togglePlayback}
        aria-label={playing ? t("attachment.pauseAudio") : t("attachment.playAudio")}
      >
        <AttachmentGlyph name={playing ? "pause" : "play"} />
      </button>

      <div className="message-audio-content-v3">
        <div className="message-audio-waveform-v3" aria-hidden="true">
          {Array.from({ length: waveformBars }, (_, index) => (
            <i
              key={index}
              className={
                (index + 1) / waveformBars <= progressRatio ? "is-played" : ""
              }
            />
          ))}
        </div>

        <input
          className="message-audio-seek-v3"
          type="range"
          min={0}
          max={Math.max(duration, 1)}
          step={0.1}
          value={Math.min(currentTime, Math.max(duration, 1))}
          onChange={(event) => handleSeek(Number(event.target.value))}
          aria-label={t("attachment.audioPlaybackPosition")}
        />

        <div className="message-audio-meta-v3">
          <span>
            {formatRecordingDuration(currentTime > 0 ? currentTime : duration)}
          </span>
          <span>{voiceNote ? t("attachment.voiceMessage") : t("attachment.audio")}</span>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          setDuration(
            Number.isFinite(event.currentTarget.duration)
              ? event.currentTarget.duration
              : 0,
          );
          onMediaLayoutReady?.();
        }}
        onTimeUpdate={(event) =>
          setCurrentTime(event.currentTarget.currentTime)
        }
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
      />
    </div>
  );
}

function attachmentVisualKind(
  attachment: MessagingAttachment,
): AttachmentGlyphName {
  if (isImageAttachment(attachment)) {
    return "image";
  }

  if (isVideoAttachment(attachment)) {
    return "video";
  }

  if (isAudioAttachment(attachment)) {
    return "audio";
  }

  if (isPdfAttachment(attachment)) {
    return "pdf";
  }

  return "document";
}

function MessageAttachmentCard({
  accessToken,
  conversationId,
  messageId,
  attachment,
  isVoiceNote,
  senderDisplayName,
  senderPhotoUrl,
  onPreview,
  onMediaLayoutReady,
}: MessageAttachmentCardProps) {
  const { t } = useTranslation("messaging");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewRequestVersion, setPreviewRequestVersion] = useState(0);
  const [previewEligible, setPreviewEligible] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);
  const visualKind = attachmentVisualKind(attachment);
  const canPreview = canPreviewAttachment(attachment);
  const mediaPreview =
    isImageAttachment(attachment) || isVideoAttachment(attachment);
  const audioPreview = isAudioAttachment(attachment);
  const needsProtectedPreview =
    !attachment.isExpired && (mediaPreview || audioPreview);

  useEffect(() => {
    if (!needsProtectedPreview) {
      setPreviewEligible(false);
      return undefined;
    }

    const element = cardRef.current;

    if (!element || typeof IntersectionObserver === "undefined") {
      setPreviewEligible(true);
      return undefined;
    }

    setPreviewEligible(false);
    const scrollRoot = element.closest<HTMLElement>(".message-thread");
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        // Attachment binaries are private API resources. Delay fetching them
        // until the card is close to the viewport so opening a conversation
        // does not start dozens of image/video/audio requests at once.
        setPreviewEligible(true);
        observer.disconnect();
      },
      {
        root: scrollRoot,
        rootMargin: "480px 0px",
      },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [attachment.id, needsProtectedPreview]);

  useEffect(() => {
    if (!accessToken || !needsProtectedPreview || !previewEligible) {
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    setPreviewUrl(null);
    setPreviewError(null);

    // Images keep the authenticated Blob preview. Video/audio use a short-lived
    // protected URL so the browser can request only the byte ranges it needs.
    const previewRequest =
      isVideoAttachment(attachment) || isAudioAttachment(attachment)
        ? createConversationAttachmentStreamUrl(
            accessToken,
            conversationId,
            messageId,
            attachment.id,
          )
        : createConversationAttachmentObjectUrl(
            accessToken,
            conversationId,
            messageId,
            attachment.id,
          );

    void previewRequest
      .then((url) => {
        if (cancelled) {
          if (url.startsWith("blob:")) {
            URL.revokeObjectURL(url);
          }
          return;
        }

        objectUrl = url;
        setPreviewUrl(url);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setPreviewError(
          error instanceof Error
            ? error.message
            : t("attachment.previewLoadError"),
        );
      });

    return () => {
      cancelled = true;

      if (objectUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [
    accessToken,
    attachment.id,
    conversationId,
    messageId,
    needsProtectedPreview,
    previewEligible,
    previewRequestVersion,
  ]);

  const displayName = isVoiceNote ? t("attachment.voiceNote") : attachment.originalFileName;
  const attachmentMeta = `${t(attachmentTypeTranslationKey(attachment))} · ${formatFileSize(
    attachment.fileSizeBytes,
  )}`;

  return (
    <article
      ref={cardRef}
      className={`message-attachment-card-v2 message-attachment-${visualKind}-v2${attachment.isExpired ? " is-expired" : ""}${previewError ? " has-preview-error" : ""
        }`}
      aria-label={`${displayName}, ${attachmentMeta}`}
    >
      {attachment.isExpired && (
        <div className="message-attachment-expired-v2" role="status">
          <span
            className="message-attachment-expired-icon-v2"
            aria-hidden="true"
          >
            <AttachmentGlyph name={visualKind} />
          </span>
          <span>
            <strong>{displayName}</strong>
            <small>
              {t("attachment.expired")}
            </small>
          </span>
        </div>
      )}

      {!attachment.isExpired && mediaPreview && (
        <div className="message-attachment-media-v2">
          {previewUrl ? (
            <button
              type="button"
              className="message-attachment-media-open-v2"
              onClick={() => onPreview(attachment)}
              aria-label={t("attachment.previewNamed", { name: attachment.originalFileName })}
            >
              {isImageAttachment(attachment) ? (
                <img
                  src={previewUrl}
                  alt={attachment.originalFileName}
                  onLoad={onMediaLayoutReady}
                  onError={onMediaLayoutReady}
                />
              ) : (
                <video
                  src={previewUrl}
                  muted
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={onMediaLayoutReady}
                  onError={onMediaLayoutReady}
                />
              )}
              {isVideoAttachment(attachment) && (
                <span className="message-attachment-media-overlay-v2">
                  <AttachmentGlyph name="play" />
                </span>
              )}
            </button>
          ) : previewError ? (
            <div className="message-attachment-preview-state-v2 error">
              <AttachmentGlyph name="retry" />
              <strong>{t("attachment.previewUnavailable")}</strong>
              <button
                type="button"
                onClick={() => setPreviewRequestVersion((value) => value + 1)}
              >
                {t("actions.tryAgain")}
              </button>
            </div>
          ) : (
            <div
              className={`message-attachment-preview-state-v2 loading ${visualKind}`}
              role="status"
              aria-live="polite"
            >
              <span className="message-attachment-loading-icon-v2">
                <AttachmentGlyph name={visualKind} />
              </span>
              <span className="message-small-spinner" />
              <strong>
                {t("attachment.loadingMedia", {
                  type: isVideoAttachment(attachment)
                    ? t("attachment.types.video").toLowerCase()
                    : t("attachment.types.image").toLowerCase(),
                })}
              </strong>
            </div>
          )}
        </div>
      )}

      {!attachment.isExpired &&
        audioPreview &&
        (previewUrl ? (
          <CompactAttachmentAudio
            src={previewUrl}
            voiceNote={isVoiceNote}
            senderDisplayName={senderDisplayName}
            senderPhotoUrl={senderPhotoUrl}
            onMediaLayoutReady={onMediaLayoutReady}
          />
        ) : previewError ? (
          <div className="message-attachment-preview-state-v2 error audio">
            <AttachmentGlyph name="audio" />
            <span>{t("attachment.audioUnavailable")}</span>
            <button
              type="button"
              onClick={() => setPreviewRequestVersion((value) => value + 1)}
            >
              {t("actions.retry")}
            </button>
          </div>
        ) : (
          <div
            className="message-audio-loading-v3"
            role="status"
            aria-live="polite"
          >
            <span className="message-audio-loading-icon-v3">
              <AttachmentGlyph name={isVoiceNote ? "microphone" : "audio"} />
            </span>
            <span className="message-small-spinner" />
            <span>
              {isVoiceNote ? t("attachment.loadingVoiceMessage") : t("attachment.loadingAudio")}
            </span>
          </div>
        ))}

      {!attachment.isExpired && !needsProtectedPreview && (
        <button
          type="button"
          className="message-attachment-document-v2"
          onClick={() => {
            if (canPreview) {
              onPreview(attachment);
            }
          }}
          disabled={!canPreview}
          aria-label={
            canPreview ? `Preview ${attachment.originalFileName}` : undefined
          }
        >
          <span className="message-attachment-document-icon-v2">
            <AttachmentGlyph
              name={isPdfAttachment(attachment) ? "pdf" : "document"}
            />
          </span>
          <span>
            <strong>{displayName}</strong>
            <small>{attachmentMeta}</small>
          </span>
        </button>
      )}
    </article>
  );
}

function readStoredConversationId(): string | null {
  try {
    return window.sessionStorage.getItem(SELECTED_CONVERSATION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readStoredHighlightedMessageId(): string | null {
  try {
    const messageId = window.sessionStorage.getItem(
      HIGHLIGHT_MESSAGE_STORAGE_KEY,
    );

    if (messageId) {
      window.sessionStorage.removeItem(HIGHLIGHT_MESSAGE_STORAGE_KEY);
    }

    return messageId;
  } catch {
    return null;
  }
}

function readStoredNavigationExpanded(): boolean {
  try {
    const storedValue = window.localStorage.getItem(
      MESSAGE_NAVIGATION_STORAGE_KEY,
    );

    // Keep the labelled navigation open for first-time users. Their choice is
    // persisted after the first interaction so the workspace stays familiar.
    return storedValue === null ? true : storedValue === "true";
  } catch {
    return true;
  }
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 0) {
    return "NT";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function toLocalDateTimeInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function createAnnouncementComposerValues(): AnnouncementComposerValues {
  return {
    title: "",
    body: "",
    priority: "NORMAL",
    publishTiming: "NOW",
    scheduledAt: toLocalDateTimeInputValue(
      new Date(Date.now() + 60 * 60 * 1000),
    ),
    expiresAt: "",
    requiresAcknowledgement: false,
    allowAttachmentDownload: true,
    isPinned: false,
  };
}

function announcementDetailToComposerValues(
  announcement: AnnouncementDetail,
): AnnouncementComposerValues {
  return {
    title: announcement.title,
    body: announcement.body,
    priority: announcement.priority,
    publishTiming: announcement.status === "SCHEDULED" ? "SCHEDULE" : "NOW",
    scheduledAt: announcement.scheduledAt
      ? toLocalDateTimeInputValue(new Date(announcement.scheduledAt))
      : toLocalDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000)),
    expiresAt: announcement.expiresAt
      ? toLocalDateTimeInputValue(new Date(announcement.expiresAt))
      : "",
    requiresAcknowledgement: announcement.requiresAcknowledgement,
    allowAttachmentDownload: announcement.allowAttachmentDownload,
    isPinned: announcement.isPinned,
  };
}

function isAnnouncementEditable(status: AnnouncementStatus): boolean {
  return status === "DRAFT" || status === "SCHEDULED" || status === "PUBLISHED";
}

function isAnnouncementDeletable(status: AnnouncementStatus): boolean {
  return (
    status === "DRAFT" ||
    status === "SCHEDULED" ||
    status === "PUBLISHED" ||
    status === "EXPIRED"
  );
}

function createAnnouncementAttachmentClientId(file: File): string {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${file.name}-${file.size}-${file.lastModified}-${randomPart}`;
}

function announcementEnumLabel(value: string, t: TFunction): string {
  switch (value) {
    case "NORMAL":
      return t("announcement.enums.normal");
    case "IMPORTANT":
      return t("announcement.enums.important");
    case "URGENT":
      return t("announcement.enums.urgent");
    case "EMERGENCY":
      return t("announcement.enums.emergency");
    case "DRAFT":
      return t("announcement.enums.draft");
    case "SCHEDULED":
      return t("announcement.enums.scheduled");
    case "PUBLISHING":
      return t("announcement.enums.publishing");
    case "PUBLISHED":
      return t("announcement.enums.published");
    case "EXPIRED":
      return t("announcement.enums.expired");
    case "IMAGE":
      return t("announcement.enums.image");
    case "VIDEO":
      return t("announcement.enums.video");
    case "DOCUMENT":
      return t("announcement.enums.document");
    default:
      return value
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
  }
}


function announcementAttachmentShortLabel(
  category: AnnouncementAttachmentCategory,
): string {
  switch (category) {
    case "IMAGE":
      return "IMG";
    case "VIDEO":
      return "VID";
    case "DOCUMENT":
      return "DOC";
  }
}

function isAnnouncementImageAttachment(
  attachment: AnnouncementAttachment,
): boolean {
  return (
    attachment.category === "IMAGE" && attachment.mimeType.startsWith("image/")
  );
}

function isAnnouncementVideoAttachment(
  attachment: AnnouncementAttachment,
): boolean {
  return (
    attachment.category === "VIDEO" || attachment.mimeType.startsWith("video/")
  );
}

function isAnnouncementPdfAttachment(
  attachment: AnnouncementAttachment,
): boolean {
  return (
    attachment.mimeType === "application/pdf" ||
    attachment.originalFileName.toLowerCase().endsWith(".pdf")
  );
}

function isAnnouncementTextAttachment(
  attachment: AnnouncementAttachment,
): boolean {
  const fileName = attachment.originalFileName.toLowerCase();

  return (
    attachment.mimeType.startsWith("text/") ||
    attachment.mimeType === "text/csv" ||
    fileName.endsWith(".txt") ||
    fileName.endsWith(".csv")
  );
}

function canPreviewAnnouncementAttachment(
  attachment: AnnouncementAttachment,
): boolean {
  if (attachment.isExpired) {
    return false;
  }

  return (
    isAnnouncementImageAttachment(attachment) ||
    isAnnouncementVideoAttachment(attachment) ||
    isAnnouncementPdfAttachment(attachment) ||
    isAnnouncementTextAttachment(attachment)
  );
}

function messagesBelongToSameVisualGroup(
  first: MessagingMessage | undefined,
  second: MessagingMessage | undefined,
): boolean {
  if (!first || !second) {
    return false;
  }

  // Five minutes keeps rapid exchanges visually connected without merging
  // messages that were sent as separate parts of the conversation.
  return (
    first.senderAccountId === second.senderAccountId &&
    isSameCalendarDay(first.sentAt, second.sentAt) &&
    new Date(second.sentAt).getTime() - new Date(first.sentAt).getTime() <
    5 * 60 * 1000
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes = bytes / 1024;

  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(kilobytes >= 10 ? 0 : 1)} KB`;
  }

  const megabytes = kilobytes / 1024;

  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}

function selectedAttachmentValidationError(file: File): string | null {
  if (!ACCEPTED_ATTACHMENT_MIME_TYPES.has(file.type)) {
    return `${file.name}: this file type is not supported.`;
  }

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const isAudio = file.type.startsWith("audio/");
  const maxSize = isImage
    ? MAX_IMAGE_ATTACHMENT_BYTES
    : isVideo
      ? MAX_VIDEO_ATTACHMENT_BYTES
      : isAudio
        ? MAX_AUDIO_ATTACHMENT_BYTES
        : MAX_DOCUMENT_ATTACHMENT_BYTES;

  if (file.size <= maxSize) {
    return null;
  }

  return isImage
    ? `${file.name}: images must be 20 MB or smaller.`
    : isVideo
      ? `${file.name}: videos must be 200 MB or smaller.`
      : isAudio
        ? `${file.name}: audio files must be 25 MB or smaller.`
        : `${file.name}: documents must be 50 MB or smaller.`;
}

function createSelectedComposerAttachment(
  file: File,
): SelectedComposerAttachment {
  const canPreview =
    file.type.startsWith("image/") ||
    file.type.startsWith("video/") ||
    file.type.startsWith("audio/");

  return {
    id: crypto.randomUUID(),
    file,
    previewUrl: canPreview ? URL.createObjectURL(file) : null,
  };
}

function isImageAttachment(attachment: MessagingAttachment): boolean {
  return (
    attachment.contentType === "IMAGE" &&
    attachment.mimeType.startsWith("image/")
  );
}

function isVideoAttachment(attachment: MessagingAttachment): boolean {
  return (
    attachment.contentType === "VIDEO" ||
    attachment.mimeType.startsWith("video/")
  );
}

function isAudioAttachment(attachment: MessagingAttachment): boolean {
  return (
    attachment.contentType === "AUDIO" ||
    attachment.mimeType.startsWith("audio/")
  );
}

function getMessagePayloadValue(
  message: Pick<MessagingMessage, "payload">,
  key: string,
): unknown {
  if (
    !message.payload ||
    typeof message.payload !== "object" ||
    Array.isArray(message.payload)
  ) {
    return null;
  }

  return (message.payload as Record<string, unknown>)[key];
}

// Reads the trusted official-announcement marker from a message payload.
function getOfficialAnnouncementPayload(
  message: Pick<MessagingMessage, "payload">,
  t?: TFunction,
): MessagingAnnouncementPayload | null {
  const announcement = getMessagePayloadValue(message, "announcement");

  if (
    !announcement ||
    typeof announcement !== "object" ||
    Array.isArray(announcement)
  ) {
    return null;
  }

  const value = announcement as Record<string, unknown>;

  if (value.kind !== "OFFICIAL") {
    return null;
  }

  return {
    kind: "OFFICIAL",
    label:
      typeof value.label === "string"
        ? value.label
        : t?.("announcement.messageLabel") ?? "Official announcement",
  };
}

function isOfficialAnnouncementMessage(
  message: Pick<MessagingMessage, "payload">,
): boolean {
  return getOfficialAnnouncementPayload(message) !== null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionSearchText(account: MessagingAccount): string {
  return [
    account.displayName,
    account.username ?? "",
    account.employee?.empName ?? "",
    account.employee?.empId ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function getComposerMentionQuery(
  text: string,
  caretIndex: number,
): { query: string; startIndex: number; endIndex: number } | null {
  const beforeCaret = text.slice(0, caretIndex);
  const match = /(^|\s)@([^@\n]*)$/.exec(beforeCaret);

  if (!match) {
    return null;
  }

  const query = match[2] ?? "";

  if (query.length > 80 || /[.,!?;:]$/.test(query)) {
    return null;
  }

  return {
    query: query.trimStart().toLowerCase(),
    startIndex: beforeCaret.length - query.length - 1,
    endIndex: caretIndex,
  };
}

function getMentionedAccountIds(
  text: string,
  conversation: MessagingConversation | null,
  viewerAccountId?: string | null,
  selectedMentions: MessagingAccount[] = [],
): string[] {
  if (!conversation || conversation.type !== "GROUP") {
    return [];
  }

  // Official groups intentionally keep only a bounded participant page in the
  // conversation payload. Merge explicitly selected server-side mention
  // candidates so their account IDs are still sent with the message.
  const candidates = new Map<string, MessagingAccount>();
  conversation.participants.forEach((participant) => {
    candidates.set(participant.accountId, participant);
  });
  selectedMentions.forEach((participant) => {
    candidates.set(participant.accountId, participant);
  });

  return Array.from(candidates.values())
    .filter((participant) => participant.accountId !== viewerAccountId)
    .filter((participant) => {
      const pattern = new RegExp(
        `(^|\\s)@${escapeRegExp(participant.displayName)}(?=\\s|$|[.,!?;:])`,
        "i",
      );

      return pattern.test(text);
    })
    .map((participant) => participant.accountId);
}

function getMessageMentions(message: MessagingMessage): MessagingMention[] {
  const mentions = getMessagePayloadValue(message, "mentions");

  if (!Array.isArray(mentions)) {
    return [];
  }

  return mentions
    .map((mention) => {
      if (!mention || typeof mention !== "object" || Array.isArray(mention)) {
        return null;
      }

      const value = mention as Record<string, unknown>;
      const accountId = value.accountId;
      const displayName = value.displayName;

      if (typeof accountId !== "string" || typeof displayName !== "string") {
        return null;
      }

      return {
        accountId,
        displayName,
      };
    })
    .filter((mention): mention is MessagingMention => Boolean(mention));
}

const MESSAGE_TEXT_LINK_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>()"']+/gi;

function normalizeMessageLink(value: string): string {
  const cleanUrl = value.replace(/[.,;:!?]+$/g, "");

  return cleanUrl.toLowerCase().startsWith("www.")
    ? `https://${cleanUrl}`
    : cleanUrl;
}

function extractMessageLinks(text: string | null): string[] {
  if (!text) {
    return [];
  }

  const links = new Set<string>();
  const matches = text.match(MESSAGE_TEXT_LINK_PATTERN) ?? [];

  matches.forEach((match) => {
    const url = normalizeMessageLink(match);

    if (url) {
      links.add(url);
    }
  });

  return [...links];
}

function renderMessageTextWithMentions(message: MessagingMessage): ReactNode[] {
  const text = message.textContent ?? "";

  if (!text) {
    return [text];
  }

  const mentions = getMessageMentions(message);
  const tokens: Array<{
    start: number;
    end: number;
    node: ReactNode;
  }> = [];

  if (mentions.length > 0) {
    const mentionPattern = new RegExp(
      `@(${mentions
        .map((mention) => escapeRegExp(mention.displayName))
        .sort((first, second) => second.length - first.length)
        .join("|")})(?=\\s|$|[.,!?;:])`,
      "gi",
    );

    let mentionMatch: RegExpExecArray | null;

    while ((mentionMatch = mentionPattern.exec(text)) !== null) {
      const matchedText = mentionMatch[0];
      const displayName = matchedText.slice(1);
      const mention = mentions.find(
        (item) => item.displayName.toLowerCase() === displayName.toLowerCase(),
      );

      tokens.push({
        start: mentionMatch.index,
        end: mentionMatch.index + matchedText.length,
        node: (
          <span
            key={`${mention?.accountId ?? displayName}-${mentionMatch.index}`}
            className="message-mention-highlight"
          >
            {matchedText}
          </span>
        ),
      });
    }
  }

  let linkMatch: RegExpExecArray | null;
  MESSAGE_TEXT_LINK_PATTERN.lastIndex = 0;

  while ((linkMatch = MESSAGE_TEXT_LINK_PATTERN.exec(text)) !== null) {
    const displayUrl = linkMatch[0].replace(/[.,;:!?]+$/g, "");
    const normalizedUrl = normalizeMessageLink(displayUrl);

    if (!normalizedUrl) {
      continue;
    }

    const start = linkMatch.index;
    const end = start + displayUrl.length;

    tokens.push({
      start,
      end,
      node: (
        <a
          key={`link-${start}-${normalizedUrl}`}
          className="message-text-link"
          href={normalizedUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          {displayUrl}
        </a>
      ),
    });
  }

  if (tokens.length === 0) {
    return [text];
  }

  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  tokens
    .sort(
      (first, second) => first.start - second.start || second.end - first.end,
    )
    .forEach((token) => {
      // Avoid overlapping tokens when a mention and link are adjacent.
      if (token.start < lastIndex) {
        return;
      }

      if (token.start > lastIndex) {
        nodes.push(text.slice(lastIndex, token.start));
      }

      nodes.push(token.node);
      lastIndex = token.end;
    });

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function getMessageLocationPayload(
  message: MessagingMessage,
): MessagingLocationPayload | null {
  const location = getMessagePayloadValue(message, "location");

  if (!location || typeof location !== "object" || Array.isArray(location)) {
    return null;
  }

  const value = location as Record<string, unknown>;

  if (
    (value.kind !== "CURRENT" && value.kind !== "LIVE") ||
    typeof value.latitude !== "number" ||
    typeof value.longitude !== "number" ||
    typeof value.mapUrl !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    kind: value.kind,
    latitude: value.latitude,
    longitude: value.longitude,
    accuracyMeters:
      typeof value.accuracyMeters === "number" ? value.accuracyMeters : null,
    headingDegrees:
      typeof value.headingDegrees === "number" ? value.headingDegrees : null,
    speedMetersPerSecond:
      typeof value.speedMetersPerSecond === "number"
        ? value.speedMetersPerSecond
        : null,
    label: typeof value.label === "string" ? value.label : null,
    mapUrl: value.mapUrl,
    liveExpiresAt:
      typeof value.liveExpiresAt === "string" ? value.liveExpiresAt : null,
    liveStoppedAt:
      typeof value.liveStoppedAt === "string" ? value.liveStoppedAt : null,
    updatedAt: value.updatedAt,
  };
}

function isLiveLocationActive(
  location: MessagingLocationPayload | null,
): boolean {
  if (
    !location ||
    location.kind !== "LIVE" ||
    location.liveStoppedAt ||
    !location.liveExpiresAt
  ) {
    return false;
  }

  return new Date(location.liveExpiresAt).getTime() > Date.now();
}

function formatLocationCoordinate(value: number): string {
  return value.toFixed(5);
}

function formatLocationUpdatedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "just now";
  }

  return formatMessageTime(value);
}

function browserNotificationPermissionLabel(t: TFunction): string {
  if (!("Notification" in window)) {
    return t("messageSettings.notifications.permission.unsupported");
  }

  switch (window.Notification.permission) {
    case "granted":
      return t("messageSettings.notifications.permission.allowed");
    case "denied":
      return t("messageSettings.notifications.permission.blocked");
    default:
      return t("messageSettings.notifications.permission.notRequested");
  }
}

function browserPositionToLocationInput(position: GeolocationPosition): {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  headingDegrees?: number;
  speedMetersPerSecond?: number;
} {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters: Number.isFinite(position.coords.accuracy)
      ? position.coords.accuracy
      : undefined,
    headingDegrees:
      typeof position.coords.heading === "number" &&
        Number.isFinite(position.coords.heading)
        ? position.coords.heading
        : undefined,
    speedMetersPerSecond:
      typeof position.coords.speed === "number" &&
        Number.isFinite(position.coords.speed)
        ? position.coords.speed
        : undefined,
  };
}

interface LocationMessageCardProps {
  message: MessagingMessage;
  viewerAccountId?: string;
  stopping: boolean;
  onStop: (message: MessagingMessage) => void;
}

function LocationMessageCard({
  message,
  viewerAccountId,
  stopping,
  onStop,
}: LocationMessageCardProps) {
  const { t } = useTranslation("messaging");
  const location = getMessageLocationPayload(message);

  if (!location) {
    return null;
  }

  const active = isLiveLocationActive(location);
  const ownMessage = message.senderAccountId === viewerAccountId;
  const statusLabel = location.label ?? (location.kind === "CURRENT"
    ? t("location.current")
    : location.liveStoppedAt
      ? t("location.stopped")
      : location.liveExpiresAt && new Date(location.liveExpiresAt).getTime() <= Date.now()
        ? t("location.expired")
        : t("location.active"));

  return (
    <article className={`message-location-card-v2${active ? " live" : ""}`}>
      <a
        className="message-location-map-v2"
        href={location.mapUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={t("location.openInMaps", { label: statusLabel })}
      >
        <span className="message-location-pin-v2">
          <AttachmentGlyph name="location" />
        </span>
        <span className="message-location-grid-v2" aria-hidden="true" />
      </a>

      <div className="message-location-body-v2">
        <div className="message-location-heading-v2">
          <span
            className={`message-location-status-v2${active ? " active" : ""}`}
          />
          <strong>{statusLabel}</strong>
        </div>
        <span className="message-location-coordinates-v2">
          {formatLocationCoordinate(location.latitude)},{" "}
          {formatLocationCoordinate(location.longitude)}
        </span>
        <small>
          {t("location.updated", {
            time: formatLocationUpdatedAt(location.updatedAt) === "just now"
              ? t("location.justNow")
              : formatLocationUpdatedAt(location.updatedAt),
          })}
          {location.accuracyMeters !== null
            ? ` · ±${Math.round(location.accuracyMeters)}m`
            : ""}
        </small>

        <div className="message-location-actions-v2">
          <a href={location.mapUrl} target="_blank" rel="noreferrer">
            {t("location.openMap")}
          </a>

          {ownMessage && active && (
            <button
              type="button"
              onClick={() => onStop(message)}
              disabled={stopping}
            >
              {stopping ? t("location.stopping") : t("location.stopSharing")}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function preferredVoiceNoteMimeType(): string {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  return (
    VOICE_NOTE_MIME_TYPE_CANDIDATES.find((value) =>
      MediaRecorder.isTypeSupported(value),
    ) ?? ""
  );
}

function voiceNoteExtension(mimeType: string): string {
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) {
    return "m4a";
  }

  return "webm";
}

function formatRecordingDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function isPdfAttachment(attachment: MessagingAttachment): boolean {
  return (
    attachment.mimeType === "application/pdf" ||
    attachment.originalFileName.toLowerCase().endsWith(".pdf")
  );
}

function isTextPreviewAttachment(attachment: MessagingAttachment): boolean {
  const fileName = attachment.originalFileName.toLowerCase();

  return (
    attachment.mimeType.startsWith("text/") ||
    attachment.mimeType === "text/csv" ||
    fileName.endsWith(".txt") ||
    fileName.endsWith(".csv")
  );
}

function isZipAttachment(attachment: MessagingAttachment): boolean {
  const fileName = attachment.originalFileName.toLowerCase();

  return (
    attachment.mimeType === "application/zip" ||
    attachment.mimeType === "application/x-zip-compressed" ||
    fileName.endsWith(".zip")
  );
}

function canPreviewAttachment(attachment: MessagingAttachment): boolean {
  if (attachment.isExpired || isZipAttachment(attachment)) {
    return false;
  }

  return (
    isImageAttachment(attachment) ||
    isVideoAttachment(attachment) ||
    isAudioAttachment(attachment) ||
    isPdfAttachment(attachment) ||
    isTextPreviewAttachment(attachment)
  );
}

function attachmentTypeTranslationKey(
  attachment: MessagingAttachment,
):
  | "attachment.types.image"
  | "attachment.types.video"
  | "attachment.types.audio"
  | "attachment.types.pdf"
  | "attachment.types.text"
  | "attachment.types.document" {
  if (isImageAttachment(attachment)) {
    return "attachment.types.image";
  }

  if (isVideoAttachment(attachment)) {
    return "attachment.types.video";
  }

  if (isAudioAttachment(attachment)) {
    return "attachment.types.audio";
  }

  if (isPdfAttachment(attachment)) {
    return "attachment.types.pdf";
  }

  if (isTextPreviewAttachment(attachment)) {
    return "attachment.types.text";
  }

  return "attachment.types.document";
}

function attachmentLabel(
  message: Pick<
    MessagingMessage,
    "contentType" | "attachments" | "textContent" | "payload"
  >,
  t: TFunction,
): string {
  if (message.textContent) {
    return message.textContent;
  }

  const firstAttachment = message.attachments?.[0];

  if (!firstAttachment) {
    return t("preview.message");
  }

  if (isImageAttachment(firstAttachment)) {
    return t("preview.photo");
  }

  if (isVideoAttachment(firstAttachment)) {
    return t("preview.video");
  }

  if (isAudioAttachment(firstAttachment)) {
    return getMessagePayloadValue(message, "attachmentKind") === "VOICE_NOTE"
      ? t("preview.voiceNote")
      : t("preview.audio");
  }

  return t("preview.fileNamed", { name: firstAttachment.originalFileName });
}

// Creates an empty shared-content result for media, documents and links.
function emptySharedContent(): ConversationSharedContent {
  return {
    media: [],
    documents: [],
    links: [],
  };
}

function sortSharedContent<T extends { sharedAt: string }>(items: T[]): T[] {
  return [...items].sort(
    (first, second) =>
      new Date(second.sharedAt).getTime() - new Date(first.sharedAt).getTime(),
  );
}

// Collects shared media, documents and links from loaded chat messages.
function collectSharedContentFromMessages(
  messages: MessagingMessage[],
): ConversationSharedContent {
  const shared = emptySharedContent();

  messages.forEach((message) => {
    if (message.isDeleted) {
      return;
    }

    message.attachments
      .filter((attachment) => attachment.scanStatus !== "FAILED")
      .forEach((attachment) => {
        const item = {
          id: attachment.id,
          messageId: message.id,
          conversationId: message.conversationId,
          attachment,
          message,
          sender: message.sender,
          sharedAt: message.sentAt,
        };

        if (isImageAttachment(attachment) || isVideoAttachment(attachment)) {
          shared.media.push(item);
          return;
        }

        shared.documents.push(item);
      });

    extractMessageLinks(message.textContent).forEach((url) => {
      shared.links.push({
        url,
        label: url,
        message,
        sender: message.sender,
        sharedAt: message.sentAt,
      });
    });
  });

  return {
    media: sortSharedContent(shared.media),
    documents: sortSharedContent(shared.documents),
    links: sortSharedContent(shared.links),
  };
}

// Merges backend shared-content results with currently loaded local messages.
function mergeSharedContent(
  primary: ConversationSharedContent,
  fallback: ConversationSharedContent,
): ConversationSharedContent {
  const mediaIds = new Set(primary.media.map((item) => item.id));
  const documentIds = new Set(primary.documents.map((item) => item.id));
  const linkIds = new Set(
    primary.links.map((item) => `${item.message.id}:${item.url}`),
  );

  return {
    media: sortSharedContent([
      ...primary.media,
      ...fallback.media.filter((item) => !mediaIds.has(item.id)),
    ]),
    documents: sortSharedContent([
      ...primary.documents,
      ...fallback.documents.filter((item) => !documentIds.has(item.id)),
    ]),
    links: sortSharedContent([
      ...primary.links,
      ...fallback.links.filter(
        (item) => !linkIds.has(`${item.message.id}:${item.url}`),
      ),
    ]),
  };
}


function firstAvailableSharedContentTab(
  content: ConversationSharedContent,
): SharedContentTab {
  if (content.media.length > 0) {
    return "MEDIA";
  }

  if (content.documents.length > 0) {
    return "DOCUMENTS";
  }

  if (content.links.length > 0) {
    return "LINKS";
  }

  return "MEDIA";
}

function sharedContentMonthKey(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "UNKNOWN";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function sharedContentMonthLabel(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Earlier";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
}

function groupSharedContentByMonth<T extends { sharedAt: string }>(
  items: T[],
): Array<{ key: string; label: string; items: T[] }> {
  const groups = new Map<string, { label: string; items: T[] }>();

  items.forEach((item) => {
    const key = sharedContentMonthKey(item.sharedAt);
    const existing = groups.get(key);

    if (existing) {
      existing.items.push(item);
      return;
    }

    groups.set(key, {
      label: sharedContentMonthLabel(item.sharedAt),
      items: [item],
    });
  });

  return [...groups.entries()].map(([key, group]) => ({
    key,
    label: group.label,
    items: group.items,
  }));
}

function sharedLinkDomain(url: string, t: TFunction): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return t("sharedContent.externalLink");
  }
}

function sharedLinkDescription(item: SharedContentLinkItem): string | null {
  const messageText = item.message.textContent?.trim();

  if (!messageText) {
    return null;
  }

  const withoutUrl = messageText.replace(item.url, "").trim();
  return withoutUrl || null;
}

interface SharedMediaThumbnailProps {
  accessToken: string | null;
  item: SharedContentAttachmentItem;
  onOpen: () => void;
}

function SharedMediaThumbnail({
  accessToken,
  item,
  onOpen,
}: SharedMediaThumbnailProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    const trigger = triggerRef.current;

    if (!trigger || shouldLoad) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px" },
    );

    observer.observe(trigger);
    return () => observer.disconnect();
  }, [shouldLoad]);

  useEffect(() => {
    if (!accessToken || !shouldLoad) {
      return;
    }

    let cancelled = false;
    let createdObjectUrl: string | null = null;

    setPreviewError(false);

    const previewRequest = isVideoAttachment(item.attachment)
      ? createConversationAttachmentStreamUrl(
          accessToken,
          item.conversationId,
          item.messageId,
          item.attachment.id,
        )
      : createConversationAttachmentObjectUrl(
          accessToken,
          item.conversationId,
          item.messageId,
          item.attachment.id,
        );

    void previewRequest
      .then((url) => {
        if (cancelled) {
          if (url.startsWith("blob:")) {
            URL.revokeObjectURL(url);
          }
          return;
        }

        createdObjectUrl = url;
        setObjectUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewError(true);
        }
      });

    return () => {
      cancelled = true;

      if (createdObjectUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [
    accessToken,
    item.attachment.id,
    item.conversationId,
    item.messageId,
    shouldLoad,
  ]);

  const video = isVideoAttachment(item.attachment);

  return (
    <button
      ref={triggerRef}
      type="button"
      className="message-shared-media-tile"
      onClick={onOpen}
      aria-label={`Open ${item.attachment.originalFileName}`}
      title={item.attachment.originalFileName}
    >
      <span className="message-shared-media-preview">
        {objectUrl ? (
          isImageAttachment(item.attachment) ? (
            <img
              src={objectUrl}
              alt=""
              loading="lazy"
              decoding="async"
            />
          ) : (
            <video src={objectUrl} muted playsInline preload="metadata" />
          )
        ) : (
          <span
            className={`message-shared-media-placeholder${previewError ? " error" : ""
              }`}
          >
            <AttachmentGlyph
              name={previewError ? "retry" : video ? "video" : "image"}
            />
          </span>
        )}
        {video && (
          <span className="message-shared-media-type" aria-hidden="true">
            <AttachmentGlyph name="play" />
          </span>
        )}
      </span>
      <span className="message-shared-media-caption">
        <strong>{item.attachment.originalFileName}</strong>
        <small>{formatConversationTime(item.sharedAt)}</small>
      </span>
    </button>
  );
}

function canForwardMessage(message: MessagingMessage): boolean {
  if (message.isDeleted) {
    return false;
  }

  if (message.contentType === "LOCATION") {
    return false;
  }

  // Forwarding must not offer a path that the API will reject because a
  // referenced physical attachment has already reached its retention limit.
  if (message.attachments?.some((attachment) => attachment.isExpired)) {
    return false;
  }

  // Text and attachment messages share the same forward dialog.
  return Boolean(message.textContent || (message.attachments?.length ?? 0) > 0);
}

function roleLabel(value: string, t: TFunction): string {
  switch (value) {
    case "SUPER_ADMIN":
      return t("roles.superAdmin");
    case "SENIOR_MANAGEMENT":
      return t("roles.seniorManagement");
    case "TEAM_MANAGER":
      return t("roles.teamManager");
    case "OWNER":
      return t("roles.owner");
    case "ADMIN":
      return t("roles.admin");
    case "MEMBER":
      return t("roles.member");
    case "EMPLOYEE":
      return t("roles.employee");
    default:
      return value
        .toLowerCase()
        .split("_")
        .map((part) => part[0]?.toUpperCase() + part.slice(1))
        .join(" ");
  }
}

type MessageNavigationIconName =
  | "search"
  | "chats"
  | "list"
  | "edit"
  | "requests"
  | "groups"
  | "official"
  | "announcement"
  | "appearance"
  | "settings"
  | "starred"
  | "bell"
  | "bellOff"
  | "profile"
  | "workspace"
  | "logout"
  | "archive"
  | "newChat"
  | "newGroup"
  | "emoji"
  | "microphone"
  | "send"
  | "shared"
  | "storage"
  | "addUser"
  | "info"
  | "close"
  | "block"
  | "pin"
  | "unread"
  | "react"
  | "reply"
  | "more"
  | "trash";

function MessageNavigationIcon({ name }: { name: MessageNavigationIconName }) {
  const commonProps = {
    className: "message-nav-svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "search":
      return (
        <svg {...commonProps}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case "chats":
      return (
        <svg {...commonProps}>
          <path d="M5 17.5 3.5 21l4-1.7c1.2.5 2.6.7 4 .7 4.7 0 8.5-3.2 8.5-7.2S16.2 5.5 11.5 5.5 3 8.7 3 12.8c0 1.8.8 3.4 2 4.7Z" />
          <path d="M8 11h7M8 14h4.5" />
        </svg>
      );
    case "list":
      return (
        <svg {...commonProps}>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M8 9h8M8 13h8M8 17h5" />
        </svg>
      );
    case "edit":
      return (
        <svg {...commonProps}>
          <path d="M5 19h4l9.5-9.5a2.1 2.1 0 0 0-3-3L6 16v3Z" />
          <path d="m13.8 8.2 3 3" />
        </svg>
      );
    case "requests":
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
          <path d="m5 7 7 5 7-5" />
        </svg>
      );
    case "groups":
      return (
        <svg {...commonProps}>
          <circle cx="9" cy="9" r="3" />
          <circle cx="17" cy="10" r="2.5" />
          <path d="M3.8 19c.5-3.2 2.3-5 5.2-5s4.7 1.8 5.2 5M14.5 15.2c2.7-.5 4.7.8 5.5 3.8" />
        </svg>
      );
    case "official":
      return (
        <svg {...commonProps}>
          <path d="M12 3 5 6v5c0 4.5 2.7 8 7 10 4.3-2 7-5.5 7-10V6l-7-3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "announcement":
      return (
        <svg {...commonProps}>
          <path d="M4 14V9l13-5v15L4 14Z" />
          <path d="M17 8h2a2 2 0 0 1 0 4h-2M6 14l1.5 6h4L10 15" />
        </svg>
      );
    case "appearance":
      return (
        <svg {...commonProps}>
          <path d="m12 3 1.2 3.3L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3-3.3-1.2 3.3-1.2L12 3Z" />
          <path d="m18.5 13 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
          <path d="m6 14 .7 1.8 1.8.7-1.8.7L6 19l-.7-1.8-1.8-.7 1.8-.7L6 14Z" />
        </svg>
      );
    case "settings":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19 13.5v-3l-2-.7a7.5 7.5 0 0 0-.8-1.8l.9-1.9-2.2-2.2-1.9.9a7.5 7.5 0 0 0-1.8-.8L10.5 2h-3L6.8 4a7.5 7.5 0 0 0-1.8.8l-1.9-.9L.9 6.1 1.8 8a7.5 7.5 0 0 0-.8 1.8l-2 .7v3l2 .7a7.5 7.5 0 0 0 .8 1.8l-.9 1.9 2.2 2.2 1.9-.9a7.5 7.5 0 0 0 1.8.8l.7 2h3l.7-2a7.5 7.5 0 0 0 1.8-.8l1.9.9 2.2-2.2-.9-1.9a7.5 7.5 0 0 0 .8-1.8l2-.7Z"
            transform="translate(2 0) scale(.83)"
          />
        </svg>
      );
    case "starred":
      return (
        <svg {...commonProps}>
          <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
        </svg>
      );
    case "bell":
      return (
        <svg {...commonProps}>
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9Z" />
          <path d="M10 21h4" />
        </svg>
      );
    case "bellOff":
      return (
        <svg {...commonProps}>
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9Z" />
          <path d="M10 21h4" />
          <path d="M3 3l18 18" />
        </svg>
      );
    case "profile":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c.7-4 3-6 7-6s6.3 2 7 6" />
        </svg>
      );
    case "workspace":
      return (
        <svg {...commonProps}>
          <path d="M10 5 3 12l7 7" />
          <path d="M4 12h16" />
        </svg>
      );
    case "logout":
      return (
        <svg {...commonProps}>
          <path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" />
          <path d="m15 8 4 4-4 4M19 12H9" />
        </svg>
      );
    case "archive":
      return (
        <svg {...commonProps}>
          <rect x="4" y="5" width="16" height="4.5" rx="1.5" />
          <path d="M6.5 9.5V17a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V9.5" />
          <path d="M10 13h4" />
        </svg>
      );
    case "newChat":
      return (
        <svg {...commonProps}>
          <path d="M5 19h12a2 2 0 0 0 2-2V9" />
          <path d="M15.5 4.5 19.5 8.5" />
          <path d="m8 16 1-4 8-8a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2l-8 8-4 1Z" />
        </svg>
      );
    case "newGroup":
      return (
        <svg {...commonProps}>
          <circle cx="9" cy="9" r="3" />
          <circle cx="16.5" cy="10" r="2.5" />
          <path d="M3.5 19c.5-3.2 2.4-5 5.5-5s5 1.8 5.5 5" />
          <path d="M18.5 4.5v5M16 7h5" />
        </svg>
      );
    case "emoji":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 10h.01M15.5 10h.01M8 14.5c1.1 1.4 2.4 2.1 4 2.1s2.9-.7 4-2.1" />
        </svg>
      );
    case "microphone":
      return (
        <svg {...commonProps}>
          <rect x="8" y="3" width="8" height="12" rx="4" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
        </svg>
      );
    case "send":
      return (
        <svg {...commonProps}>
          <path d="m21 3-7.5 18-3.8-7.7L2 9.5 21 3Z" />
          <path d="m9.7 13.3 4.8-4.8" />
        </svg>
      );
    case "shared":
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="m5.5 16 4-4 3 3 2.2-2.2L18.5 16" />
        </svg>
      );
    case "storage":
      return (
        <svg {...commonProps}>
          <ellipse cx="12" cy="6" rx="7.5" ry="3" />
          <path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
          <path d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
        </svg>
      );
    case "addUser":
      return (
        <svg {...commonProps}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19c.6-3.6 2.4-5.5 5.5-5.5s4.9 1.9 5.5 5.5" />
          <path d="M17 7v6M14 10h6" />
        </svg>
      );
    case "info":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </svg>
      );
    case "close":
      return (
        <svg {...commonProps}>
          <path d="m7 7 10 10M17 7 7 17" />
        </svg>
      );
    case "block":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m6 6 12 12" />
        </svg>
      );
    case "pin":
      return (
        <svg {...commonProps}>
          <path d="m8 4 8 8" />
          <path d="m14 3 7 7-4 1-5 5-1 4-7-7 4-1 5-5 1-4Z" />
          <path d="m9 15-5 5" />
        </svg>
      );
    case "unread":
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
          <path d="m5 7 7 5 7-5" />
          <circle
            cx="18"
            cy="6"
            r="2.5"
            fill="currentColor"
            stroke="white"
            strokeWidth="1.2"
          />
        </svg>
      );
    case "react":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 10h.01M15.5 10h.01M8.5 14.5c1 1.2 2.1 1.8 3.5 1.8s2.5-.6 3.5-1.8" />
        </svg>
      );
    case "reply":
      return (
        <svg {...commonProps}>
          <path d="m10 8-5 4 5 4" />
          <path d="M5 12h8c3.3 0 6 2.7 6 6" />
        </svg>
      );
    case "more":
      return (
        <svg {...commonProps}>
          <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "trash":
      return (
        <svg {...commonProps}>
          <path d="M4.5 7h15" />
          <path d="M9 7V4.5h6V7" />
          <path d="m7 7 .7 12h8.6L17 7" />
          <path d="M10 10.5v5M14 10.5v5" />
        </svg>
      );
  }
}

type MessageStatusGlyphName = "pin" | "star";

function MessageStatusGlyph({ name }: { name: MessageStatusGlyphName }) {
  if (name === "star") {
    return (
      <svg
        className="message-status-svg"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5-4.7-4.6 6.5-.9L12 2.8Z" />
      </svg>
    );
  }

  return (
    <svg
      className="message-status-svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M8.2 3.5h7.6l-1 5 3.2 3.2v2.1H6v-2.1l3.2-3.2-1-5Z" />
      <path d="M12 13.8v7" fill="none" />
    </svg>
  );
}

function workspacePathForRole(role: string | undefined): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "/super-admin";
    case "SENIOR_MANAGEMENT":
      return "/senior-management";
    case "TEAM_MANAGER":
      return "/team-manager";
    case "EMPLOYEE":
      return "/employee";
    default:
      return "/";
  }
}

function officialScopeLabel(
  conversation: MessagingConversation,
  t: TFunction,
): string {
  const scope = conversation.officialScope;

  if (!scope) {
    return t("groupInfo.scope.organizational");
  }

  if (scope.scopeType === "ORGANIZATION") {
    return t("groupInfo.scope.organizationWide");
  }

  if (scope.scopeType === "DIVISION") {
    return t("groupInfo.scope.division", {
      name: scope.division?.name ?? t("profileDetail.division"),
    });
  }

  return t("groupInfo.scope.department", {
    name: scope.department?.name ?? t("profileDetail.department"),
  });
}

function officialAuditLabel(entry: OfficialGroupAuditEntry, t: TFunction): string {
  if (entry.action === "CREATED") {
    return t("groupManagement.audit.created");
  }

  if (entry.action === "DETAILS_UPDATED") {
    return t("groupManagement.audit.detailsUpdated");
  }

  if (entry.action === "RECONCILED") {
    return t("groupManagement.audit.reconciled");
  }

  return t("groupManagement.audit.synchronized");
}

function requestReasonLabel(
  reason: MessagingMessageRequest["reason"],
  t: TFunction,
): string {
  if (reason === "PROTECTED_RECIPIENT") {
    return t("requestWorkspace.reasons.protectedRecipient");
  }

  if (reason === "CROSS_DIVISION") {
    return t("requestWorkspace.reasons.crossDivision");
  }

  return t("requestWorkspace.reasons.crossDepartment");
}


function starredMessagePreview(item: StarredMessageItem, t: TFunction): string {
  const { message } = item;

  if (message.isDeleted) {
    return t("starred.unavailableMessage");
  }

  if (message.textContent?.trim()) {
    return message.textContent.trim();
  }

  if (message.contentType === "LOCATION") {
    return t("starred.sharedLocation");
  }

  const firstAttachment = message.attachments?.[0];

  if (firstAttachment) {
    const attachmentCount = message.attachments?.length ?? 1;
    return attachmentCount > 1
      ? t("starred.andMore", {
          name: firstAttachment.originalFileName,
          count: attachmentCount - 1,
        })
      : firstAttachment.originalFileName;
  }

  return t("starred.messageFallback");
}

function requestStatusLabel(
  request: MessagingMessageRequest,
  t: TFunction,
): string {
  if (request.status === "PENDING") {
    return request.direction === "RECEIVED"
      ? t("requestWorkspace.awaitingYourResponse")
      : t("requestWorkspace.awaitingResponse");
  }

  if (request.status === "ACCEPTED") {
    return t("requestWorkspace.accepted");
  }

  if (request.status === "DECLINED") {
    return t("requestWorkspace.declined");
  }

  if (request.status === "BLOCKED") {
    return t("requestWorkspace.blocked");
  }

  return roleLabel(request.status, t);
}

function contactActionLabel(contact: MessagingContact, t: TFunction): string {
  if (contact.contactMode === "REQUEST_REQUIRED") {
    return t("contactActions.request");
  }

  if (contact.contactMode === "REQUEST_SENT") {
    return t("contactActions.pending");
  }

  if (contact.contactMode === "REQUEST_RECEIVED") {
    return t("contactActions.review");
  }

  if (contact.contactMode === "BLOCKED") {
    return t("contactActions.blocked");
  }

  return t("contactActions.message");
}

function applyMessageUpdate(
  messages: MessagingMessage[],
  updatedMessage: MessagingMessage,
  options: { preservePersonalState?: boolean } = {},
): MessagingMessage[] {
  return messages.map((message) => {
    if (message.id === updatedMessage.id) {
      return {
        ...message,
        ...updatedMessage,
        reactions: updatedMessage.reactions ?? [],
        isStarred: options.preservePersonalState
          ? message.isStarred
          : updatedMessage.isStarred,
        starredAt: options.preservePersonalState
          ? message.starredAt
          : updatedMessage.starredAt,
      };
    }

    if (message.replyTo?.id === updatedMessage.id) {
      return {
        ...message,
        replyTo: {
          id: updatedMessage.id,
          senderAccountId: updatedMessage.senderAccountId,
          sender: updatedMessage.sender,
          contentType: updatedMessage.contentType,
          textContent: updatedMessage.textContent,
          sentAt: updatedMessage.sentAt,
          isDeleted: updatedMessage.isDeleted,
        },
      };
    }

    return message;
  });
}

function canEditMessage(
  message: MessagingMessage,
  accountId: string | undefined,
): boolean {
  const sentAt = new Date(message.sentAt).getTime();

  return (
    message.senderAccountId === accountId &&
    message.contentType === "TEXT" &&
    !message.isDeleted &&
    !message.forwardedFrom &&
    Number.isFinite(sentAt) &&
    Date.now() - sentAt <= MESSAGE_EDIT_WINDOW_MS
  );
}

function canDeleteMessageForEveryone(
  message: MessagingMessage,
  accountId: string | undefined,
  conversation: MessagingConversation | null,
): boolean {
  if (!accountId || message.isDeleted) {
    return false;
  }

  if (message.senderAccountId === accountId) {
    return true;
  }

  if (conversation?.type !== "GROUP") {
    return false;
  }

  if (conversation.viewerParticipantRole === "OWNER") {
    return true;
  }

  if (conversation.viewerParticipantRole !== "ADMIN") {
    return false;
  }

  const sender = conversation.participants.find(
    (participant) => participant.accountId === message.senderAccountId,
  );

  if (!sender && !conversation.participantsComplete) {
    // Large official groups are loaded in bounded member pages. Do not expose
    // an admin moderation action when the sender's hierarchy is not known yet;
    // the backend remains authoritative for all delete permissions.
    return false;
  }

  return sender?.participantRole !== "OWNER";
}

function messagePreview(
  conversation: MessagingConversation,
  accountId: string,
  t: TFunction,
): string {
  const message = conversation.lastMessage;

  if (!message) {
    return t("preview.startConversation");
  }

  if (message.isDeleted) {
    return t("preview.messageDeleted");
  }

  const prefix = message.senderAccountId === accountId ? t("preview.youPrefix") : "";

  const announcementPrefix = isOfficialAnnouncementMessage(message)
    ? t("preview.announcementPrefix")
    : "";

  return `${prefix}${announcementPrefix}${message.forwardedFrom ? t("preview.forwardedPrefix") : ""}${attachmentLabel(message, t)}`;
}

function playGeneratedNotificationFallback(): void {
  const audioWindow = window as Window &
    typeof globalThis & {
      webkitAudioContext?: typeof AudioContext;
    };
  const AudioContextClass =
    audioWindow.AudioContext ?? audioWindow.webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 740;
  gain.gain.value = 0.06;

  // Fallback keeps alerts usable if the custom mp3 asset is missing during development.
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.12);
  oscillator.addEventListener("ended", () => void context.close());
}

function playNotificationTone(): void {
  const audio = new Audio(NOTIFICATION_SOUND_URL);
  audio.volume = 0.55;

  // Use the approved WhatsApp-style mp3 sound and fall back only if the asset cannot play.
  void audio.play().catch(() => playGeneratedNotificationFallback());
}

function messageDeliveryPresentation(
  status: MessagingMessage["deliveryStatus"],
): { glyph: string; label: string } {
  if (status === "READ") {
    return { glyph: "✓✓", label: "Read" };
  }

  if (status === "DELIVERED") {
    return { glyph: "✓✓", label: "Delivered" };
  }

  return { glyph: "✓", label: "Sent" };
}

function notificationMetadataRecord(
  metadata: unknown,
): Record<string, unknown> | null {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : null;
}

type KeyboardNavigationAxis = "VERTICAL" | "HORIZONTAL" | "BOTH";

const MESSAGE_KEYBOARD_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function keyboardFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      MESSAGE_KEYBOARD_FOCUSABLE_SELECTOR,
    ),
  ).filter(
    (element) =>
      element.getClientRects().length > 0 &&
      element.getAttribute("aria-hidden") !== "true",
  );
}

/**
 * Gives the large messaging dialogs one consistent keyboard boundary without
 * changing their business actions. Each dialog keeps its own return-focus
 * target, so nested confirmations restore focus to the control that opened
 * them before the parent dialog eventually restores focus to the workspace.
 */
function useMessageModalKeyboardBoundary(
  open: boolean,
  modalName: string,
  onRequestClose: () => void,
  closeDisabled = false,
): void {
  const closeRef = useRef(onRequestClose);
  const closeDisabledRef = useRef(closeDisabled);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  closeRef.current = onRequestClose;
  closeDisabledRef.current = closeDisabled;

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const modalSelector = `[data-message-modal="${modalName}"]`;
    const getModal = (): HTMLElement | null =>
      document.querySelector<HTMLElement>(modalSelector);
    const isTopmostModal = (modal: HTMLElement): boolean => {
      const openModals = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]',
        ),
      ).filter((candidate) => candidate.getClientRects().length > 0);

      return openModals[openModals.length - 1] === modal;
    };

    const frameId = window.requestAnimationFrame(() => {
      const modal = getModal();

      if (!modal || !isTopmostModal(modal)) {
        return;
      }

      const preferredFocus = modal.querySelector<HTMLElement>(
        '[autofocus], [data-message-modal-initial-focus="true"]',
      );
      const firstFocusable = keyboardFocusableElements(modal)[0];

      (preferredFocus ?? firstFocusable ?? modal).focus();
    });

    const handleModalKeyDown = (
      event: globalThis.KeyboardEvent,
    ): void => {
      const modal = getModal();

      if (!modal || !isTopmostModal(modal)) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();

        if (!closeDisabledRef.current) {
          closeRef.current();
        }
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = keyboardFocusableElements(modal);

      if (focusable.length === 0) {
        event.preventDefault();
        modal.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (!modal.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleModalKeyDown, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener("keydown", handleModalKeyDown, true);

      const returnTarget = returnFocusRef.current;
      window.requestAnimationFrame(() => {
        if (returnTarget?.isConnected) {
          returnTarget.focus();
        }
      });
    };
  }, [modalName, open]);
}

function handleLinearKeyboardNavigation(
  event: KeyboardEvent<HTMLElement>,
  axis: KeyboardNavigationAxis,
): void {
  const vertical = axis === "VERTICAL" || axis === "BOTH";
  const horizontal = axis === "HORIZONTAL" || axis === "BOTH";
  const previous =
    (vertical && event.key === "ArrowUp") ||
    (horizontal && event.key === "ArrowLeft");
  const next =
    (vertical && event.key === "ArrowDown") ||
    (horizontal && event.key === "ArrowRight");

  if (!previous && !next && event.key !== "Home" && event.key !== "End") {
    return;
  }

  const focusable = keyboardFocusableElements(event.currentTarget);

  if (focusable.length === 0) {
    return;
  }

  event.preventDefault();
  const currentIndex = focusable.indexOf(
    document.activeElement as HTMLElement,
  );
  let nextIndex: number;

  if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = focusable.length - 1;
  } else if (previous) {
    nextIndex =
      currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1;
  } else {
    nextIndex =
      currentIndex < 0 || currentIndex >= focusable.length - 1
        ? 0
        : currentIndex + 1;
  }

  focusable[nextIndex]?.focus();
}

export function MessageAppPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation("messaging");
  const { account, accessToken, logout } = useAuth();
  const { refreshAvatar } = useAvatarRegistry();
  const mainWorkspacePath = workspacePathForRole(account?.role);
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
  const [officialGroupMemberSearchResults, setOfficialGroupMemberSearchResults] =
    useState<MessagingGroupMember[]>([]);
  const [officialGroupMemberSearchCursor, setOfficialGroupMemberSearchCursor] =
    useState<string | null>(null);
  const [officialGroupMemberSearchHasMore, setOfficialGroupMemberSearchHasMore] =
    useState(false);
  const [officialGroupMemberSearchLoading, setOfficialGroupMemberSearchLoading] =
    useState(false);
  const [officialGroupMemberSearchLoadingMore, setOfficialGroupMemberSearchLoadingMore] =
    useState(false);
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
  const [officialGroupMembersRefreshVersion, setOfficialGroupMembersRefreshVersion] =
    useState(0);
  const [profileReturnToGroupInformation, setProfileReturnToGroupInformation] =
    useState(false);
  const [profileSharedGroupsExpanded, setProfileSharedGroupsExpanded] =
    useState(false);
  const [groupKind, setGroupKind] = useState<GroupKind>("PERSONAL");
  const [officialGroupScopes, setOfficialGroupScopes] = useState<
    OfficialGroupScopeOption[]
  >([]);
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
  const [groupContactsLoading, setGroupContactsLoading] = useState(false);
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
  const [starredNextCursor, setStarredNextCursor] = useState<string | null>(null);
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
    ? account?.id ?? null
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
  const [messagingSettingsSaving, setMessagingSettingsSaving] =
    useState(false);
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
  const [securityAction, setSecurityAction] = useState<
    "SIGN_OUT_ALL" | null
  >(null);
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
        messageActionMenuAnchor.boundaryBottom - menuRect.height - threadPadding,
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
  }, [accessToken]);

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
        error instanceof Error
          ? error.message
          : t("feedback.blockedLoadError"),
      );
    } finally {
      setBlockedAccountsLoading(false);
    }
  }, [accessToken]);

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
      if (
        !accessToken ||
        !selectedOfficialConversationId
      ) {
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
          incoming.forEach((member) => byAccountId.set(member.accountId, member));
          return Array.from(byAccountId.values());
        };

        if (searchMode) {
          setOfficialGroupMemberSearchResults((current) =>
            options.append ? mergeMembers(current, response.data) : response.data,
          );
          setOfficialGroupMemberSearchCursor(response.pagination.nextCursor);
          setOfficialGroupMemberSearchHasMore(response.pagination.hasMore);
        } else {
          setOfficialGroupMembers((current) =>
            options.append ? mergeMembers(current, response.data) : response.data,
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
    [accessToken, selectedOfficialConversationId],
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
    if (
      !selectedOfficialConversationId ||
      !normalizedGroupMemberSearch
    ) {
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
        ? chatFolders.find((folder) => folder.id === selectedListId) ?? null
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
    (selectedConversation.viewerParticipantRole === "OWNER" ||
      selectedConversation.viewerParticipantRole === "ADMIN") &&
    account?.role !== "EMPLOYEE",
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
    const timer = window.setTimeout(() => {
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
    }, query ? 160 : 0);

    return () => window.clearTimeout(timer);
  }, [
    accessToken,
    account?.id,
    activeMentionQuery,
    editingMessage,
    selectedOfficialConversationId,
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
    ? mentionSuggestions[activeMentionSuggestionIndex] ?? mentionSuggestions[0]
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

    const handleSearchPanelKeyDown = (event: globalThis.KeyboardEvent): void => {
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
            error instanceof Error
              ? error.message
              : t("feedback.searchError"),
          );
        })
        .finally(() => {
          if (messageSearchRequestIdRef.current === requestId) {
            setSearchLoading(false);
          }
        });
    }, 280);

    return () => window.clearTimeout(timer);
  }, [accessToken, searchPanelOpen, searchText, selectedConversationId]);

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
  }, [attachmentViewer?.attachment.id]);

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
  }, [accessToken, account?.id, profileAccountId]);

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

  const canCreateOfficialGroup =
    account?.role === "SUPER_ADMIN" ||
    account?.role === "SENIOR_MANAGEMENT" ||
    account?.role === "TEAM_MANAGER";

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
        participant.employee?.department?.name,
        participant.employee?.division?.name,
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
            participant.employee?.department?.name,
            participant.employee?.division?.name,
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
  }, [conversationSearch, officialGroupConversations]);

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
  }, [conversationSearch, starredItems]);

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
        request.peer.employee?.department?.name,
        requestReasonLabel(request.reason, t),
        requestStatusLabel(request, t),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [conversationSearch, requestItems]);

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
  }, [
    conversationSearch,
    notificationListView,
    notifications,
  ]);

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
          listMode ? selectedListId ?? undefined : undefined,
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
    [accessToken, conversationListView, listMode, selectedListId],
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
        listMode ? selectedListId ?? undefined : undefined,
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
    [accessToken],
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
    [accessToken],
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
    [accessToken],
  );

  function resetAnnouncementComposer(): void {
    setAnnouncementComposerOpen(false);
    setAnnouncementComposerMode("CREATE");
    setAnnouncementComposerGroupId(null);
    setAnnouncementComposerAnnouncementId(null);
    setAnnouncementComposerStatus(null);
    setAnnouncementComposerValues(createAnnouncementComposerValues());
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
    setAnnouncementComposerValues(createAnnouncementComposerValues());
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
        throw new Error(
          t("feedback.announcementEditStateError"),
        );
      }

      if (detail.audience.officialGroup?.id !== selectedConversation.id) {
        throw new Error(
          t("feedback.announcementWrongGroupError"),
        );
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
        throw new Error(`${pending.file.name}: ${message}`);
      }
    }
  }

  function buildAnnouncementComposerInput(
    officialConversationId: string,
  ): CreateAnnouncementInput {
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

    return {
      audienceType: "OFFICIAL_GROUP",
      officialConversationId,
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
      setAnnouncementComposerError(
        t("feedback.announcementAccessLost"),
      );
      return;
    }

    setAnnouncementComposerSubmitting(
      announcementComposerMode === "EDIT" ? "SAVE" : "PUBLISH",
    );
    setAnnouncementComposerError(null);

    let workingAnnouncementId = announcementComposerAnnouncementId;

    try {
      const input = buildAnnouncementComposerInput(
        announcementComposerGroup.id,
      );
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
          throw new Error(
            t("feedback.announcementEditMissing"),
          );
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
        setAnnouncementComposerNotice(
          t("feedback.announcementUpdated"),
        );
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
      await deleteAnnouncement(
        accessToken,
        announcementComposerAnnouncementId,
      );
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
    [accessToken],
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
    [accessToken],
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
        const resolvedMessages = shouldMergeSilentRefresh && cachedPage
          ? mergeLatestMessagingPage(cachedPage.messages, nextMessages)
          : nextMessages;
        const nextPage = {
          messages: resolvedMessages,
          cursor: preserveLoadedHistoryBoundary && cachedPage
            ? cachedPage.cursor
            : response.pagination.nextCursor,
          hasOlder: preserveLoadedHistoryBoundary && cachedPage
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
                    ? t("feedback.messagesReadStatusErrorWithDetail", { detail: error.message })
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
    [accessToken, account?.id],
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
      (!messagingPushSupported() || window.Notification.permission !== "granted")
    ) {
      setBrowserNotificationsEnabled(false);
      setBackgroundPushReady(false);
    }
  }, [
    account?.id,
    browserNotificationsEnabled,
    preferenceStorageAccountId,
  ]);

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
    setGroupDialogMode(null);
    setGroupPanelTab("OVERVIEW");
    setGroupSelectedAccountIds([]);
    setGroupSelectedContacts([]);
    setGroupSearch("");
    setGroupError(null);
    resetGroupInviteState();
  }, [selectedConversationId]);

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
        conversationRowMenuButtonRefs.current[
          conversationRowMenuId
        ]?.contains(target)
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
  }, [accessToken]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

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
    [stopLocalTyping],
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

    const scheduleSelectedMessageRefresh = (
      conversationId: string,
    ): void => {
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

      if (notificationSoundEnabled) {
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
              : t("feedback.browserNotificationOpen"),
            tag: payload.notification.id,
          },
        );

        browserNotification.onclick = () => {
          window.focus();
          browserNotification.close();
          void handleNotificationClick(payload.notification);
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
          resetGroupDialogState();
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
  }, [
    listMode,
    selectedChatFolder?.id,
    selectedChatFolder?.name,
    selectedChatFolder?.updatedAt,
  ]);

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
  }, [
    chatFoldersError,
    chatFoldersLoading,
    listMode,
    selectedChatFolder,
  ]);

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
  }, [accessToken, contactSearch, newConversationOpen]);

  useEffect(() => {
    if (
      !groupDialogMode ||
      !accessToken ||
      (groupDialogMode === "CREATE" && groupKind === "OFFICIAL") ||
      (groupDialogMode === "MANAGE" &&
        selectedConversation?.groupKind === "OFFICIAL")
    ) {
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      setGroupContactsLoading(true);

      searchMessagingContacts(accessToken, groupSearch, 50)
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
    groupDialogMode,
    groupKind,
    groupSearch,
    selectedConversation?.groupKind,
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
  }, [accessToken, privateGroupDialogOpen, privateGroupSearch]);

  useEffect(() => {
    if (
      groupDialogMode !== "CREATE" ||
      !accessToken ||
      !canCreateOfficialGroup
    ) {
      return undefined;
    }

    let active = true;
    setOfficialGroupScopesLoading(true);

    listOfficialGroupScopes(accessToken)
      .then((response) => {
        if (!active) {
          return;
        }

        setOfficialGroupScopes(response.scopes);
        setOfficialGroupScopeKey((current) =>
          response.scopes.some((scope) => scope.key === current)
            ? current
            : (response.scopes[0]?.key ?? ""),
        );
      })
      .catch((error) => {
        if (active) {
          setGroupError(
            error instanceof Error
              ? error.message
              : t("feedback.officialScopesLoadError"),
          );
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
  }, [accessToken, canCreateOfficialGroup, groupDialogMode]);

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
            snippet: target.data.textContent ?? t("feedback.notificationMessageFallback"),
            matchedAttachmentFileName: null,
          };
          setConversations((current) =>
            current.some((conversation) => conversation.id === target.conversation.id)
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
  }, [accessToken, location.pathname, location.search, navigate]);

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
  }, [accessToken, location.search, loadConversations, navigate]);

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
            ...(selectedOfficialGroupScope.divisionId
              ? {
                divisionId: selectedOfficialGroupScope.divisionId,
              }
              : {}),
            ...(selectedOfficialGroupScope.departmentId
              ? {
                departmentId: selectedOfficialGroupScope.departmentId,
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
        error instanceof Error
          ? error.message
          : t("feedback.groupCreateError"),
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
      account?.role !== "SUPER_ADMIN" ||
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
        error instanceof Error
          ? error.message
          : t("feedback.membersAddError"),
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
        error instanceof Error
          ? error.message
          : t("feedback.memberRoleError"),
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
        error instanceof Error
          ? error.message
          : t("feedback.listSaveError"),
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
        error instanceof Error
          ? error.message
          : t("feedback.listDeleteError"),
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
        closeProfile();
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

  function openMessageRequests(
    view: "RECEIVED" | "SENT" = "RECEIVED",
  ): void {
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

      navigate(account?.role === "EMPLOYEE" ? employeeTarget : "/work-management");
      return;
    }

    if (notification.type === "DUTY") {
      navigate(
        account?.role === "EMPLOYEE"
          ? "/employee/duty"
          : account?.role === "SUPER_ADMIN"
            ? "/duty-management"
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
      requireMessageRequests:
        DEFAULT_MESSAGING_SETTINGS.requireMessageRequests,
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
      setMessagingSettingsError(
        t("feedback.browserNotificationsUnsupported"),
      );
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
      await disableMessagingPushSubscription(accessToken).catch(() => undefined);
    }
    setBrowserNotificationsEnabled(false);
    setBackgroundPushReady(false);
    setMessagingSettingsNotice(
      t("feedback.browserNotificationsDisabled"),
    );
  }

  async function handleLogoutAllDevices(): Promise<void> {
    if (!accessToken || securityAction) {
      return;
    }

    if (
      !window.confirm(
        t("messageSettings.security.signOutAllConfirm"),
      )
    ) {
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
        error instanceof Error
          ? error.message
          : t("feedback.signOutAllError"),
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
      return Promise.reject(
        new Error(t("feedback.locationUnsupported")),
      );
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        () =>
          reject(new Error(t("feedback.locationPermission"))),
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
            setMessageNotice(
              t("feedback.liveLocationUpdateFailed"),
            );
          });
      },
      () => {
        setMessageNotice(
          t("feedback.liveLocationInterrupted"),
        );
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

  function resetAttachmentUpload(): void {
    setAttachmentUpload(EMPTY_ATTACHMENT_UPLOAD_STATE);
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

  function clearSelectedAttachment(): void {
    selectedAttachments.forEach((attachment) => {
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    });
    setSelectedAttachments([]);
    setSelectedAttachmentKind("FILE");
    resetAttachmentUpload();

    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
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
      setMessageError(
        t("feedback.voiceAttachmentConflict"),
      );
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

    if (
      currentTotalBytes + addedBytes >
      MAX_MESSAGE_ATTACHMENT_TOTAL_BYTES
    ) {
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
          return current.filter(
            (item) => item.message.id !== response.data.id,
          );
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
        error instanceof Error
          ? error.message
          : t("feedback.starUpdateError"),
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
        error instanceof Error
          ? error.message
          : t("feedback.pinUpdateError"),
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
        normalizedCurrent + offset + visiblePinnedMessages.length
      ) % visiblePinnedMessages.length;
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

  function openDestructiveConfirmation(
    action: DestructiveConfirmation,
  ): void {
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
        error instanceof Error
          ? error.message
          : t("feedback.messageCopyError"),
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
        error instanceof Error
          ? error.message
          : t("feedback.deleteForMeError");
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
          setMessageError(
            t("feedback.editAttachmentRemoveFirst"),
          );
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

      const mentionedAccountIds = attachmentFiles.length === 0
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

      const response = attachmentFiles.length > 0
        ? await sendConversationAttachmentMessage(
          accessToken,
          selectedConversationId,
          sendAttempt.clientMessageId,
          attachmentFiles,
          text,
          replyingTo?.id,
          selectedAttachmentKind === "VOICE_NOTE" ? "VOICE_NOTE" : undefined,
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
        error instanceof Error
          ? error.message
          : t("feedback.messageSendError");

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

      if (
        event.key === "Enter" ||
        (event.key === "Tab" && !event.shiftKey)
      ) {
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
          : t("thread.activity.members", { count: selectedConversation.memberCount })
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
    if (!selectedConversation || selectedConversation.groupKind !== "OFFICIAL") {
      return selectedConversation;
    }

    return {
      ...selectedConversation,
      participants: officialGroupMembers,
      participantsComplete: !officialGroupMembersHasMore,
    };
  }, [
    officialGroupMembers,
    officialGroupMembersHasMore,
    selectedConversation,
  ]);

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
    if (
      event.pointerType === "mouse" ||
      !usesTouchMessageActions()
    ) {
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
    if (
      mobileLongPressOriginRef.current?.pointerId === event.pointerId
    ) {
      clearMobileLongPress();
    }
  }

  function handleMobileMessageContextMenu(
    messageId: string,
    event: MouseEvent<HTMLElement>,
  ): void {
    if (
      !usesTouchMessageActions()
    ) {
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

    return t("attachment.fileNamed", { name: firstAttachment.originalFileName });
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
  const announcementAttachmentViewerShowsFooter =
    announcementAttachmentViewer
      ? isAnnouncementPdfAttachment(
        announcementAttachmentViewer.attachment,
      ) ||
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
    const attachmentLabel = attachments.length === 1
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
          onKeyDown={(event) =>
            handleLinearKeyboardNavigation(event, "BOTH")
          }
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
                    void handlePreviewAttachment(message, previewableAttachment);
                  }}
                >
                  <AttachmentGlyph
                    name={attachmentVisualKind(previewableAttachment)}
                  />
                  <span>{t("actionsMenu.viewAttachment", { label: attachmentLabel })}</span>
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
                  <span>{t("actionsMenu.downloadAttachment", { label: attachmentLabel })}</span>
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
                  <span>{message.isPinned ? t("actionsMenu.unpin") : t("actionsMenu.pin")}</span>
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
                  <span>{message.isStarred ? t("actionsMenu.unstar") : t("actionsMenu.star")}</span>
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
        className={`message-action-menu ${mobileSheet
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
            : messageActionMenuPosition ??
            (messageActionMenuAnchor
              ? {
                top: messageActionMenuAnchor.top,
                left: messageActionMenuAnchor.left,
                visibility: "hidden",
                pointerEvents: "none",
              }
              : undefined)
        }
      >
        {mobileSheet && (
          <>
            <div className="message-mobile-actions-handle" aria-hidden="true" />
            <div className="message-mobile-actions-header">
              <div>
                <strong>
                  {ownMessage ? t("thread.message.you") : message.sender.displayName}
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
            <span>{t("actionsMenu.viewAttachment", { label: attachmentLabel })}</span>
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
            <span>{t("actionsMenu.downloadAttachment", { label: attachmentLabel })}</span>
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
            <span>{message.isPinned ? t("actionsMenu.unpin") : t("actionsMenu.pin")}</span>
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
            <span>{message.isStarred ? t("actionsMenu.unstar") : t("actionsMenu.star")}</span>
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
        current.some(
          (conversation) => conversation.id === item.conversation.id,
        )
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
      !target.closest(
        ".message-conversation-row, .message-notification-open",
      )
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
        currentIndex < 0
          ? 0
          : Math.min(currentIndex + 1, rows.length - 1);
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
          className={`message-conversation-row${conversation.id === selectedConversationId ? " active" : ""
            }${conversation.unreadCount > 0 ? " unread" : ""}${conversation.groupKind === "OFFICIAL" ? " official" : ""
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
              <small>{messagePreview(conversation, account?.id ?? "", t)}</small>

              <span className="message-conversation-row-status">
                {conversation.groupKind === "OFFICIAL" && (
                  <span className="message-conversation-kind">{t("profileDetail.official")}</span>
                )}
                {conversation.draftText && (
                  <span className="message-conversation-draft">{t("conversationList.draft")}</span>
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
                  <b aria-label={t("conversationList.unreadMessages", { count: conversation.unreadCount })}>
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
            const menuWidth = Math.min(268, window.innerWidth - viewportPadding * 2);
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
                      {peerBlocked ? t("conversationList.unblockContact") : t("conversationList.blockContact")}
                    </span>
                  </button>
                )}

                <div className="message-conversation-action-menu-divider" role="separator" />

                <button
                  type="button"
                  role="menuitem"
                  className="message-conversation-history-action"
                  onClick={() =>
                    openConversationHistoryConfirmation("CLEAR", conversation.id)
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
              <strong>{item.conversation.title ?? t("starred.conversationFallback")}</strong>
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
        className={`message-conversation-row message-request-workspace-row${selectedRequestId === request.id ? " active" : ""
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
              <b aria-label={t("requestWorkspace.pendingAria")}>{t("requestWorkspace.pending")}</b>
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
        className={`message-conversation-row message-announcement-group-row${conversation.id === selectedConversationId ? " active" : ""
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
            <strong>{conversation.title ?? t("groupInfo.officialGroup")}</strong>
            <span className="message-announcement-group-open">{t("announcementCard.open")}</span>
          </span>
          <span className="message-announcement-group-purpose">
            {t("announcementCard.officialOnly")}
          </span>
          <span className="message-conversation-meta">
            <span className="message-conversation-kind">{t("profileDetail.official")}</span>
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
        className={`message-announcement-card priority-${announcement.priority.toLowerCase()}${unread ? " unread" : ""
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
            {announcement.isPinned && <span>{t("announcementDetail.pinned")}</span>}
            {unread && <strong>{t("announcementCard.new")}</strong>}
            {acknowledgementPending && (
              <strong className="action-required">{t("announcementCard.actionRequired")}</strong>
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
                {t("announcementCard.attachments", { count: announcement.attachmentCount })}
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
        className={`message-conversation-row message-group-search-result${conversation.id === selectedConversationId ? " active" : ""
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
            <strong>{conversation.title ?? t("conversationList.groupConversation")}</strong>
            <time>
              {formatConversationTime(
                conversation.lastMessageAt ?? conversation.updatedAt,
              )}
            </time>
          </span>

          <span className="message-group-common-copy">
            {matchedDisplayName ? (
              <>
                {t("conversationList.alsoInGroup", { name: matchedDisplayName })}
              </>
            ) : (
              t("profileDetail.membersCount", { count: conversation.memberCount })
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
                alt={t("profileDetail.profileImageAlt", { name: profileData.displayName })}
              />
            ) : (
              initials(profileData.displayName)
            )}
          </span>

          <div>
            <strong>{profileData.displayName}</strong>
            <span>{roleLabel(profileData.role, t)}</span>
            <small>
              {profileData.official?.department?.name ??
                profileData.official?.division?.name ??
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
                  {profileSaving ? t("profileWorkspace.saving") : t("profileWorkspace.saveAbout")}
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
            <span className="message-profile-verified-badge">{t("profileDetail.verified")}</span>
          </div>
          <dl className="message-profile-details">
            <div>
              <dt>{t("profileDetail.employeeId")}</dt>
              <dd>{profileData.official?.employeeId ?? t("profileDetail.systemAccount")}</dd>
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
              <dt>{t("profileDetail.division")}</dt>
              <dd>{profileData.official?.division?.name ?? "—"}</dd>
            </div>
            <div>
              <dt>{t("profileDetail.department")}</dt>
              <dd>{profileData.official?.department?.name ?? "—"}</dd>
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
                    <strong>{group.title ?? t("profileDetail.groupFallback")}</strong>
                    <span>
                      {group.groupKind === "OFFICIAL" ? t("profileDetail.official") : t("profileDetail.personal")} · {t("profileDetail.membersCount", { count: group.memberCount })}
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
                  onClick={() => void handleUnblockAccount(profileData.accountId)}
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

  function renderMessageInformationPanel(): ReactNode {
    const information = messageInformation;
    const recipients = information?.recipients ?? [];
    const readRecipients = recipients
      .filter((recipient) => Boolean(recipient.readAt))
      .sort(
        (first, second) =>
          new Date(second.readAt ?? 0).getTime() -
          new Date(first.readAt ?? 0).getTime(),
      );
    const deliveredRecipients = recipients
      .filter(
        (recipient) => !recipient.readAt && Boolean(recipient.deliveredAt),
      )
      .sort(
        (first, second) =>
          new Date(second.deliveredAt ?? 0).getTime() -
          new Date(first.deliveredAt ?? 0).getTime(),
      );
    const pendingCount = recipients.filter(
      (recipient) => !recipient.deliveredAt,
    ).length;
    const visibleReadRecipients = readRecipients.slice(
      0,
      messageInformationVisibleReadCount,
    );
    const visibleDeliveredRecipients = deliveredRecipients.slice(
      0,
      messageInformationVisibleDeliveredCount,
    );
    const directRecipient = recipients[0] ?? null;
    const directMessage =
      selectedConversation?.type === "PRIVATE" ||
      information?.summary.totalRecipients === 1;
    const previewLabel = information
      ? information.message.isDeleted
        ? t("messageInfo.deleted")
        : localizedAttachmentLabel(information.message)
      : "";
    const attachmentCount = information?.message.attachments.length ?? 0;

    const renderRecipientRow = (
      recipient: (typeof recipients)[number],
      timestamp: string | null,
    ) => (
      <article key={recipient.accountId} className="message-info-modern-person">
        {renderAccountAvatar(recipient.account, "message-avatar small")}
        <div className="message-info-modern-person-copy">
          <strong>{recipient.account.displayName}</strong>
          <small>
            {recipient.account.employee?.designation ??
              roleLabel(recipient.account.role, t)}
          </small>
        </div>
        {timestamp && (
          <time dateTime={timestamp}>
            {notificationTimestampLabel(timestamp)}
          </time>
        )}
      </article>
    );

    return (
      <div className="message-modern-detail-view message-modern-message-info-view">
        <header className="message-modern-detail-header">
          <span className="message-modern-detail-spacer" aria-hidden="true" />
          <button
            type="button"
            className="message-modern-detail-back message-modern-detail-mobile-back"
            onClick={closeMessageInformationPanel}
            aria-label={t("messageInfo.back")}
          >
            <span aria-hidden="true">←</span>
          </button>
          <div>
            <span>{t("messageInfo.eyebrow")}</span>
            <strong>{t("messageInfo.title")}</strong>
          </div>
          <button
            type="button"
            className="message-modern-detail-close"
            onClick={closeMessageInformationPanel}
            aria-label={t("messageInfo.close")}
          >
            <MessageNavigationIcon name="close" />
          </button>
        </header>

        <div className="message-modern-detail-scroll message-info-modern-scroll">
          {messageInformationLoadingId ? (
            <div className="message-list-state compact" role="status">
              <span className="message-small-spinner" aria-hidden="true" />
              <p>{t("messageInfo.loading")}</p>
            </div>
          ) : messageInformationError && !information ? (
            <div className="message-inline-error compact" role="alert">
              <p>{messageInformationError}</p>
            </div>
          ) : information ? (
            <>
              <section
                className={`message-info-modern-preview${
                  information.message.isDeleted ? " is-deleted" : ""
                }`}
                aria-label={t("messageInfo.previewAria")}
              >
                <div className="message-info-modern-bubble">
                  {information.message.forwardedFrom && (
                    <span className="message-info-modern-forwarded">
                      {t("thread.message.forwarded")}
                    </span>
                  )}
                  <p>{previewLabel}</p>
                  {attachmentCount > 0 && information.message.textContent && (
                    <small>
                      {t("messageInfo.attachments", { count: attachmentCount })}
                    </small>
                  )}
                  <footer>
                    <time dateTime={information.sentAt}>
                      {notificationTimestampLabel(information.sentAt)}
                    </time>
                    {information.editedAt && <span>{t("thread.message.edited")}</span>}
                  </footer>
                </div>
              </section>

              {directMessage ? (
                <section
                  className="message-info-modern-direct"
                  aria-label={t("messageInfo.deliveryStatus")}
                >
                  <div className="message-info-modern-direct-row delivered">
                    <span
                      className="message-info-modern-status-icon"
                      aria-hidden="true"
                    >
                      ✓✓
                    </span>
                    <div>
                      <strong>{t("messageInfo.delivered")}</strong>
                      <span>
                        {directRecipient?.deliveredAt
                          ? notificationTimestampLabel(
                              directRecipient.deliveredAt,
                            )
                          : t("messageInfo.pending")}
                      </span>
                    </div>
                  </div>
                  <div className="message-info-modern-direct-row read">
                    <span
                      className="message-info-modern-status-icon"
                      aria-hidden="true"
                    >
                      ✓✓
                    </span>
                    <div>
                      <strong>{t("messageInfo.read")}</strong>
                      <span>
                        {directRecipient?.readAt
                          ? notificationTimestampLabel(directRecipient.readAt)
                          : directRecipient?.readHidden
                            ? t("messageInfo.hiddenByPrivacy")
                            : t("messageInfo.notRead")}
                      </span>
                    </div>
                  </div>
                </section>
              ) : (
                <div className="message-info-modern-status-sections">
                  <section className="message-info-modern-section">
                    <header>
                      <span
                        className="message-info-modern-status-icon read"
                        aria-hidden="true"
                      >
                        ✓✓
                      </span>
                      <strong>{t("messageInfo.readBy")}</strong>
                      <small>{readRecipients.length}</small>
                    </header>

                    {visibleReadRecipients.length > 0 ? (
                      <div className="message-info-modern-people">
                        {visibleReadRecipients.map((recipient) =>
                          renderRecipientRow(recipient, recipient.readAt),
                        )}
                      </div>
                    ) : (
                      <p className="message-info-modern-empty">
                        {t("messageInfo.noReadReceipts")}
                      </p>
                    )}

                    {visibleReadRecipients.length < readRecipients.length && (
                      <button
                        type="button"
                        className="message-info-modern-more"
                        onClick={() =>
                          setMessageInformationVisibleReadCount((current) =>
                            current + 40,
                          )
                        }
                      >
                        {t("messageInfo.showMoreReadReceipts")}
                        <span>
                          {readRecipients.length - visibleReadRecipients.length}
                        </span>
                      </button>
                    )}
                  </section>

                  {deliveredRecipients.length > 0 && (
                    <section className="message-info-modern-section">
                      <header>
                        <span
                          className="message-info-modern-status-icon delivered"
                          aria-hidden="true"
                        >
                          ✓✓
                        </span>
                        <strong>{t("messageInfo.deliveredTo")}</strong>
                        <small>{deliveredRecipients.length}</small>
                      </header>

                      <div className="message-info-modern-people">
                        {visibleDeliveredRecipients.map((recipient) =>
                          renderRecipientRow(
                            recipient,
                            recipient.deliveredAt,
                          ),
                        )}
                      </div>

                      {visibleDeliveredRecipients.length <
                        deliveredRecipients.length && (
                        <button
                          type="button"
                          className="message-info-modern-more"
                          onClick={() =>
                            setMessageInformationVisibleDeliveredCount(
                              (current) => current + 40,
                            )
                          }
                        >
                          {t("messageInfo.showMoreDeliveryReceipts")}
                          <span>
                            {deliveredRecipients.length -
                              visibleDeliveredRecipients.length}
                          </span>
                        </button>
                      )}
                    </section>
                  )}

                  {(pendingCount > 0 || information.summary.readHidden > 0) && (
                    <div className="message-info-modern-notes">
                      {pendingCount > 0 && (
                        <p>
                          {t("messageInfo.pendingDelivery", { count: pendingCount })}
                        </p>
                      )}
                      {information.summary.readHidden > 0 && (
                        <p>
                          {t("messageInfo.someReadHidden")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    );
  }

  function renderSharedContentPanel(): ReactNode {
    const content = sharedContent ?? emptySharedContent();
    const hasAnyContent =
      content.media.length > 0 ||
      content.documents.length > 0 ||
      content.links.length > 0;
    const mediaGroups = groupSharedContentByMonth(content.media);
    const documentGroups = groupSharedContentByMonth(content.documents);
    const linkGroups = groupSharedContentByMonth(content.links);

    return (
      <div className="message-modern-detail-view message-shared-panel-view">
        <header className="message-modern-detail-header">
          <button
            type="button"
            className="message-modern-detail-back"
            onClick={returnFromSharedContent}
            aria-label={t("sharedContent.back")}
          >
            <span aria-hidden="true">←</span>
          </button>
          <div>
            <span>{t("sharedContent.eyebrow")}</span>
            <strong>{t("sharedContent.title")}</strong>
          </div>
          <button
            type="button"
            className="message-modern-detail-close"
            onClick={closeSharedContentPanel}
            aria-label={t("sharedContent.close")}
          >
            <MessageNavigationIcon name="close" />
          </button>
        </header>

        <nav
          className="message-shared-panel-tabs"
          role="tablist"
          aria-label={t("sharedContent.categoriesAria")}
        >
          {(
            [
              ["MEDIA", t("sharedContent.media"), content.media.length],
              ["DOCUMENTS", t("sharedContent.documents"), content.documents.length],
              ["LINKS", t("sharedContent.links"), content.links.length],
            ] as Array<[SharedContentTab, string, number]>
          ).map(([tab, label, count]) => (
            <button
              key={tab}
              type="button"
              role="tab"
              className={sharedContentTab === tab ? "active" : undefined}
              aria-selected={sharedContentTab === tab}
              onClick={() => selectSharedContentTab(tab)}
            >
              <span>{label}</span>
              <b>{count}</b>
            </button>
          ))}
        </nav>

        <div className="message-modern-detail-scroll message-shared-panel-scroll">
          {sharedContentLoading && !hasAnyContent ? (
            <div className="message-shared-panel-state" role="status">
              <span className="message-small-spinner" aria-hidden="true" />
              <strong>{t("sharedContent.loading")}</strong>
              <p>{t("sharedContent.loadingDescription")}</p>
            </div>
          ) : sharedContentError && !hasAnyContent ? (
            <div className="message-shared-panel-state" role="alert">
              <MessageNavigationIcon name="shared" />
              <strong>{t("sharedContent.unavailable")}</strong>
              <p>{sharedContentError}</p>
              <button
                type="button"
                onClick={() =>
                  void openSharedContentPanel(
                    sharedContentTab,
                    sharedContentReturnView,
                  )
                }
              >
                {t("actions.retry")}
              </button>
            </div>
          ) : (
            <>
              {sharedContentLoading && (
                <div className="message-shared-refresh-state" role="status">
                  <span className="message-small-spinner" aria-hidden="true" />
                  <span>{t("sharedContent.refreshing")}</span>
                </div>
              )}

              {sharedContentTab === "MEDIA" ? (
                content.media.length === 0 ? (
                  <div className="message-shared-panel-state">
                    <AttachmentGlyph name="image" />
                    <strong>{t("sharedContent.noMedia")}</strong>
                    <p>{t("sharedContent.noMediaDescription")}</p>
                  </div>
                ) : (
                  <div className="message-shared-month-list">
                    {mediaGroups.map((group) => (
                      <section
                        key={group.key}
                        className="message-shared-month-group"
                      >
                        <h3>{group.label}</h3>
                        <div className="message-shared-media-grid">
                          {group.items.map((item) => (
                            <SharedMediaThumbnail
                              key={item.id}
                              accessToken={accessToken}
                              item={item}
                              onOpen={() =>
                                void handlePreviewAttachment(
                                  item.message,
                                  item.attachment,
                                )
                              }
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )
              ) : sharedContentTab === "DOCUMENTS" ? (
                content.documents.length === 0 ? (
                  <div className="message-shared-panel-state">
                    <AttachmentGlyph name="document" />
                    <strong>{t("sharedContent.noDocuments")}</strong>
                    <p>{t("sharedContent.noDocumentsDescription")}</p>
                  </div>
                ) : (
                  <div className="message-shared-month-list">
                    {documentGroups.map((group) => (
                      <section
                        key={group.key}
                        className="message-shared-month-group"
                      >
                        <h3>{group.label}</h3>
                        <div className="message-shared-document-list">
                          {group.items.map((item) => (
                            <article
                              key={item.id}
                              className="message-shared-document-item"
                            >
                              <button
                                type="button"
                                className="message-shared-document-main"
                                onClick={() => {
                                  if (canPreviewAttachment(item.attachment)) {
                                    void handlePreviewAttachment(
                                      item.message,
                                      item.attachment,
                                    );
                                  } else {
                                    focusSharedContentMessage(item.message);
                                  }
                                }}
                              >
                                <span className="message-shared-document-icon">
                                  <AttachmentGlyph
                                    name={
                                      isPdfAttachment(item.attachment)
                                        ? "pdf"
                                        : "document"
                                    }
                                  />
                                </span>
                                <span>
                                  <strong>
                                    {item.attachment.originalFileName}
                                  </strong>
                                  <small>
                                    {t(attachmentTypeTranslationKey(item.attachment))} ·{" "}
                                    {formatFileSize(
                                      item.attachment.fileSizeBytes,
                                    )}
                                  </small>
                                  <small>
                                    {item.sender.displayName} ·{" "}
                                    {notificationTimestampLabel(item.sharedAt)}
                                  </small>
                                </span>
                              </button>
                              <button
                                type="button"
                                className="message-shared-download-action"
                                onClick={() =>
                                  void handleDownloadAttachment(
                                    item.message,
                                    item.attachment,
                                  )
                                }
                                aria-label={t("attachment.downloadNamed", {
                                  name: item.attachment.originalFileName,
                                })}
                                title={t("sharedContent.download")}
                              >
                                <AttachmentGlyph name="download" />
                              </button>
                            </article>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )
              ) : content.links.length === 0 ? (
                <div className="message-shared-panel-state">
                  <span
                    className="message-shared-link-state-icon"
                    aria-hidden="true"
                  >
                    ↗
                  </span>
                  <strong>{t("sharedContent.noLinks")}</strong>
                  <p>{t("sharedContent.noLinksDescription")}</p>
                </div>
              ) : (
                <div className="message-shared-month-list">
                  {linkGroups.map((group) => (
                    <section key={group.key} className="message-shared-month-group">
                      <h3>{group.label}</h3>
                      <div className="message-shared-link-list">
                        {group.items.map((item) => {
                          const description = sharedLinkDescription(item);

                          return (
                            <article
                              key={`${item.message.id}:${item.url}`}
                              className="message-shared-link-item"
                            >
                              <div className="message-shared-link-meta">
                                <strong>{item.sender.displayName}</strong>
                                <time>
                                  {notificationTimestampLabel(item.sharedAt)}
                                </time>
                              </div>
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="message-shared-link-preview"
                              >
                                <span className="message-shared-link-domain">
                                  {sharedLinkDomain(item.url, t)}
                                </span>
                                {description && <p>{description}</p>}
                                <span className="message-shared-link-url">
                                  {item.url}
                                </span>
                              </a>
                              <button
                                type="button"
                                className="message-shared-locate-action"
                                onClick={() =>
                                  focusSharedContentMessage(item.message)
                                }
                              >
                                {t("sharedContent.viewInChat")}
                              </button>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  function renderConversationProfilePanel(): ReactNode {
    const returnToGroupInformation =
      profileReturnToGroupInformation &&
      selectedConversation?.type === "GROUP";
    const profilePresence = profileData
      ? presenceByAccountId[profileData.accountId]
      : null;
    const visibleSharedGroups = profileData
      ? profileSharedGroupsExpanded
        ? profileData.sharedGroups
        : profileData.sharedGroups.slice(0, 3)
      : [];
    const sharedContentSummary =
      sharedContent ?? selectedConversationSharedContent;
    const sharedContentCount =
      sharedContentSummary.media.length +
      sharedContentSummary.documents.length +
      sharedContentSummary.links.length;

    return (
      <div className="message-modern-detail-view">
        <header className="message-modern-detail-header">
          {returnToGroupInformation ? (
            <button
              type="button"
              className="message-modern-detail-back"
              onClick={closeProfile}
              aria-label={t("groupManagement.back")}
            >
              <span aria-hidden="true">←</span>
            </button>
          ) : (
            <>
              <span className="message-modern-detail-spacer" aria-hidden="true" />
              <button
                type="button"
                className="message-modern-detail-back message-modern-detail-mobile-back"
                onClick={closeConversationDetailsPanel}
                aria-label={t("profileDetail.backToConversation")}
              >
                <span aria-hidden="true">←</span>
              </button>
            </>
          )}
          <div>
            <span>{returnToGroupInformation ? t("profileDetail.groupInformation") : t("profileDetail.conversation")}</span>
            <strong>{t("profileDetail.title")}</strong>
          </div>
          <button
            type="button"
            className="message-modern-detail-close"
            onClick={closeConversationDetailsPanel}
            aria-label={t("profileDetail.close")}
          >
            <MessageNavigationIcon name="close" />
          </button>
        </header>

        <div className="message-modern-detail-scroll">
          {profileLoading && !profileData ? (
            <div className="message-list-state compact" role="status">
              <span className="message-small-spinner" aria-hidden="true" />
              <p>{t("profileDetail.loading")}</p>
            </div>
          ) : profileError && !profileData ? (
            <div className="message-inline-error compact" role="alert">
              <p>{profileError}</p>
            </div>
          ) : profileData ? (
            <>
              <section className="message-modern-profile-hero">
                <span className="message-profile-photo">
                  {profilePhotoUrl ? (
                    <img
                      src={profilePhotoUrl}
                      alt={t("profileDetail.profileImageAlt", { name: profileData.displayName })}
                    />
                  ) : (
                    initials(profileData.displayName)
                  )}
                  {profileData.showOnlineStatus !== false &&
                    profilePresence?.isOnline && (
                      <span
                        className="message-modern-profile-presence"
                        aria-label={t("profileDetail.online")}
                      />
                    )}
                </span>
                <div>
                  <strong>{profileData.displayName}</strong>
                  <span>
                    {[
                      profileData.official?.designation ??
                      roleLabel(profileData.role, t),
                      profileData.official?.department?.name ??
                      profileData.official?.division?.name,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <small>
                    {profileData.showOnlineStatus !== false &&
                      profilePresence?.isOnline
                      ? t("profileDetail.online")
                      : t("profileDetail.nepalTelecom")}
                  </small>
                </div>
              </section>

              {profileError && (
                <div className="message-inline-error compact" role="alert">
                  <p>{profileError}</p>
                </div>
              )}

              {profileData.profileBio && (
                <section className="message-simple-detail-section">
                  <h3>{t("profileDetail.about")}</h3>
                  <p>{profileData.profileBio}</p>
                </section>
              )}

              <section className="message-simple-detail-section message-simple-action-list">
                <button
                  type="button"
                  className="message-simple-action-row"
                  onClick={() =>
                    void openSharedContentPanel(undefined, "PROFILE")
                  }
                >
                  <MessageNavigationIcon name="shared" />
                  <span>{t("profileDetail.sharedContent")}</span>
                  <b>{sharedContentCount}</b>
                  <span aria-hidden="true">›</span>
                </button>
              </section>

              <section className="message-simple-detail-section">
                <div className="message-modern-section-heading">
                  <h3>{t("profileDetail.contactInformation")}</h3>
                  <span>{t("profileDetail.verified")}</span>
                </div>
                <dl className="message-modern-info-list">
                  <div>
                    <dt>{t("profileDetail.employeeId")}</dt>
                    <dd>
                      {profileData.official?.employeeId ?? t("profileDetail.systemAccount")}
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
                    <dt>{t("profileDetail.designation")}</dt>
                    <dd>{profileData.official?.designation ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("profileDetail.division")}</dt>
                    <dd>{profileData.official?.division?.name ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("profileDetail.department")}</dt>
                    <dd>{profileData.official?.department?.name ?? "—"}</dd>
                  </div>
                </dl>
              </section>

              {!profileData.isOwnProfile &&
                profileData.sharedGroups.length > 0 && (
                  <section className="message-simple-detail-section">
                    <div className="message-modern-section-heading">
                      <h3>{t("profileDetail.sharedGroups")}</h3>
                      <span>{profileData.sharedGroups.length}</span>
                    </div>
                    <div className="message-modern-shared-groups">
                      {visibleSharedGroups.map((group) => (
                        <div key={group.id}>
                          <strong>{group.title ?? t("profileDetail.groupFallback")}</strong>
                          <span>
                            {group.groupKind === "OFFICIAL"
                              ? t("profileDetail.official")
                              : t("profileDetail.personal")}{" "}
                            · {t("profileDetail.membersCount", { count: group.memberCount })}
                          </span>
                        </div>
                      ))}
                    </div>
                    {profileData.sharedGroups.length > 3 && (
                      <button
                        type="button"
                        className="message-simple-expand-button"
                        onClick={() =>
                          setProfileSharedGroupsExpanded((current) => !current)
                        }
                      >
                        {profileSharedGroupsExpanded
                          ? t("profileDetail.showFewerGroups")
                          : t("profileDetail.viewAllSharedGroups", { count: profileData.sharedGroups.length })}
                      </button>
                    )}
                  </section>
                )}

              <div className="message-modern-profile-actions">
                {profileData.isOwnProfile ? (
                  <button
                    type="button"
                    onClick={() => {
                      closeConversationDetailsPanel();
                      navigate("/messages/profile");
                    }}
                  >
                    {t("profileDetail.openMyProfile")}
                  </button>
                ) : (
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
                        className="secondary"
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
                        className="danger"
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
                          : t("profileDetail.block")}
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  function renderGroupInformationPanel(): ReactNode {
    if (!groupInfoConversation) {
      return null;
    }

    const query = groupMemberSearch.trim().toLocaleLowerCase();
    const officialGroup = groupInfoConversation.groupKind === "OFFICIAL";
    const roleRank: Record<string, number> = {
      OWNER: 0,
      ADMIN: 1,
      MEMBER: 2,
    };
    const participantSource = officialGroup
      ? query
        ? officialGroupMemberSearchResults
        : officialGroupMembers
      : groupInfoConversation.participants;
    const sortedParticipants = [...participantSource].sort(
      (first, second) =>
        (roleRank[first.participantRole] ?? 3) -
        (roleRank[second.participantRole] ?? 3) ||
        first.displayName.localeCompare(second.displayName, undefined, {
          sensitivity: "base",
        }) ||
        first.accountId.localeCompare(second.accountId),
    );
    const matchingParticipants =
      officialGroup || !query
        ? sortedParticipants
        : sortedParticipants.filter((participant) =>
            [
              participant.displayName,
              participant.username,
              participant.employee?.empId,
              participant.employee?.designation,
              participant.employee?.department?.name,
              participant.employee?.division?.name,
            ]
              .filter((value): value is string => Boolean(value))
              .some((value) => value.toLocaleLowerCase().includes(query)),
          );
    const visibleParticipants =
      query || groupMembersExpanded
        ? matchingParticipants
        : matchingParticipants.slice(0, 5);
    const officialMemberListLoading = officialGroup
      ? query
        ? officialGroupMemberSearchLoading
        : officialGroupMembersLoading
      : false;
    const officialMemberListLoadingMore = officialGroup
      ? query
        ? officialGroupMemberSearchLoadingMore
        : officialGroupMembersLoadingMore
      : false;
    const officialMemberListHasMore = officialGroup
      ? query
        ? officialGroupMemberSearchHasMore
        : officialGroupMembersHasMore
      : false;
    const officialMemberListError = officialGroup
      ? query
        ? officialGroupMemberSearchError
        : officialGroupMembersError
      : null;
    const sharedContentSummary =
      sharedContent ?? selectedConversationSharedContent;
    const sharedContentCount =
      sharedContentSummary.media.length +
      sharedContentSummary.documents.length +
      sharedContentSummary.links.length;

    return (
      <div className="message-modern-detail-view message-modern-group-view">
        <header className="message-modern-detail-header">
          <span className="message-modern-detail-spacer" aria-hidden="true" />
          <button
            type="button"
            className="message-modern-detail-back message-modern-detail-mobile-back"
            onClick={closeConversationDetailsPanel}
            aria-label={t("profileDetail.backToConversation")}
          >
            <span aria-hidden="true">←</span>
          </button>
          <div>
            <span>{t("groupInfo.conversation")}</span>
            <strong>{t("groupInfo.title")}</strong>
          </div>
          <button
            type="button"
            className="message-modern-detail-close"
            onClick={closeConversationDetailsPanel}
            aria-label={t("groupInfo.close")}
          >
            <MessageNavigationIcon name="close" />
          </button>
        </header>

        <div className="message-modern-detail-scroll">
          <section className="message-modern-group-hero">
            {renderGroupAvatar(
              groupInfoConversation,
              "message-group-photo-preview",
            )}
            <div>
              <strong>{groupInfoConversation.title ?? t("profileDetail.groupFallback")}</strong>
              <span>
                {groupInfoConversation.groupKind === "OFFICIAL"
                  ? t("groupInfo.officialGroup")
                  : t("groupInfo.personalGroup")}{" "}
                · {t("profileDetail.membersCount", { count: groupInfoConversation.memberCount })}
              </span>
              {groupInfoConversation.description && (
                <p>{groupInfoConversation.description}</p>
              )}
            </div>
          </section>

          <section className="message-simple-detail-section message-simple-action-list">
            <button
              type="button"
              className="message-simple-action-row"
              onClick={() =>
                void openSharedContentPanel(undefined, "GROUP_INFORMATION")
              }
            >
              <MessageNavigationIcon name="shared" />
              <span>{t("profileDetail.sharedContent")}</span>
              <b>{sharedContentCount}</b>
              <span aria-hidden="true">›</span>
            </button>
          </section>

          <section className="message-simple-detail-section message-simple-members-section">
            <div className="message-modern-section-heading">
              <h3>{t("groupInfo.members")}</h3>
              <span>{groupInfoConversation.memberCount}</span>
            </div>

            <label className="message-modern-search-field">
              <MessageNavigationIcon name="search" />
              <input
                type="search"
                value={groupMemberSearch}
                onChange={(event) => setGroupMemberSearch(event.target.value)}
                placeholder={t("groupInfo.searchMembers")}
                aria-label={t("groupInfo.searchMembers")}
              />
            </label>

            {officialMemberListLoading && matchingParticipants.length === 0 ? (
              <p className="message-simple-empty-state">{t("groupInfo.loadingMembers")}</p>
            ) : officialMemberListError && matchingParticipants.length === 0 ? (
              <div className="message-simple-empty-state">
                <p>{officialMemberListError}</p>
                <button
                  type="button"
                  className="message-simple-expand-button"
                  onClick={() =>
                    void loadOfficialGroupMemberPage({
                      search: query,
                      cursor: null,
                      append: false,
                    })
                  }
                >
                  {t("groupInfo.retry")}
                </button>
              </div>
            ) : matchingParticipants.length === 0 ? (
              <p className="message-simple-empty-state">
                {t("groupInfo.noMembersMatch", { query: groupMemberSearch.trim() })}
              </p>
            ) : (
              <div className="message-simple-member-list">
                {visibleParticipants.map((participant) => {
                  const isViewer = participant.accountId === account?.id;

                  return (
                    <button
                      type="button"
                      key={participant.accountId}
                      className="message-simple-member-row"
                      onClick={() => openProfile(participant.accountId, true)}
                    >
                      {renderAccountAvatar(participant, "message-avatar small")}
                      <span className="message-simple-member-copy">
                        <strong>
                          {participant.displayName}
                          {isViewer ? ` ${t("groupInfo.youSuffix")}` : ""}
                        </strong>
                        <small>
                          {participant.employee?.designation ??
                            roleLabel(participant.role, t)}
                        </small>
                      </span>
                      <b className="message-simple-member-role">
                        {roleLabel(participant.participantRole, t)}
                      </b>
                    </button>
                  );
                })}
              </div>
            )}

            {!officialGroup && !query && matchingParticipants.length > 5 && (
              <button
                type="button"
                className="message-simple-expand-button"
                onClick={() => setGroupMembersExpanded((current) => !current)}
              >
                {groupMembersExpanded
                  ? t("groupInfo.showFewerMembers")
                  : t("groupInfo.viewAllMembers", { count: matchingParticipants.length })}
              </button>
            )}

            {officialGroup &&
              !query &&
              !groupMembersExpanded &&
              groupInfoConversation.memberCount > 5 && (
                <button
                  type="button"
                  className="message-simple-expand-button"
                  onClick={() => setGroupMembersExpanded(true)}
                >
                  {t("groupInfo.viewAllMembers", { count: groupInfoConversation.memberCount })}
                </button>
              )}

            {officialGroup &&
              (query || groupMembersExpanded) &&
              officialMemberListHasMore && (
                <button
                  type="button"
                  className="message-simple-expand-button"
                  onClick={loadMoreOfficialGroupMembers}
                  disabled={officialMemberListLoadingMore}
                  aria-busy={officialMemberListLoadingMore}
                >
                  {officialMemberListLoadingMore
                    ? t("groupInfo.loadingMoreMembers")
                    : t("groupInfo.loadMoreMembers")}
                </button>
              )}

            {officialGroup &&
              officialMemberListError &&
              matchingParticipants.length > 0 && (
                <p className="message-simple-empty-state">
                  {officialMemberListError}
                </p>
              )}
          </section>

          {groupInfoConversation.groupKind === "PERSONAL" ? (
            <section className="message-simple-detail-section message-simple-group-actions">
              {groupInfoConversation.canManageGroup && (
                <button
                  type="button"
                  className="message-simple-navigation-action"
                  onClick={openManageGroup}
                >
                  <MessageNavigationIcon name="profile" />
                  <span>{t("groupInfo.manageGroup")}</span>
                  <span aria-hidden="true">›</span>
                </button>
              )}
              {groupInfoConversation.viewerParticipantRole === "OWNER" && (
                <button
                  type="button"
                  className="message-simple-navigation-action danger"
                  onClick={() =>
                    openDestructiveConfirmation({
                      kind: "DELETE_GROUP",
                      conversationId: groupInfoConversation.id,
                      conversationTitle:
                        groupInfoConversation.title ?? t("groupInfo.thisGroup"),
                      groupKind: "PERSONAL",
                    })
                  }
                  disabled={groupSubmitting}
                >
                  <MessageNavigationIcon name="trash" />
                  <span>{t("groupInfo.deleteGroup")}</span>
                </button>
              )}
              <button
                type="button"
                className="message-simple-navigation-action danger"
                onClick={() =>
                  openDestructiveConfirmation({
                    kind: "LEAVE_GROUP",
                    conversationId: groupInfoConversation.id,
                    conversationTitle:
                      groupInfoConversation.title ?? t("groupInfo.thisGroup"),
                  })
                }
                disabled={groupSubmitting}
              >
                <MessageNavigationIcon name="close" />
                <span>{groupSubmitting ? t("groupInfo.leaving") : t("groupInfo.leaveGroup")}</span>
              </button>
            </section>
          ) : (
            <>
              <p className="message-simple-group-note">
                {t("privateGroup.officialMembershipSync")}
              </p>
              {account?.role === "SUPER_ADMIN" &&
                groupInfoConversation.viewerParticipantRole === "OWNER" && (
                  <section className="message-simple-detail-section message-simple-group-actions">
                    <button
                      type="button"
                      className="message-simple-navigation-action danger"
                      onClick={() =>
                        openDestructiveConfirmation({
                          kind: "DELETE_GROUP",
                          conversationId: groupInfoConversation.id,
                          conversationTitle:
                            groupInfoConversation.title ?? t("groupInfo.thisGroup"),
                          groupKind: "OFFICIAL",
                        })
                      }
                      disabled={groupSubmitting}
                    >
                      <MessageNavigationIcon name="trash" />
                      <span>{t("groupInfo.deleteOfficialGroup")}</span>
                    </button>
                  </section>
                )}
            </>
          )}
        </div>
      </div>
    );
  }

  function renderGroupManagementWorkspaceContent(): ReactNode {
    if (!groupInfoConversation) {
      return null;
    }

    const canOpenSettings = groupInfoConversation.canManageGroup;

    return (
      <div className="message-group-management-workspace">
        <header className="message-group-management-header">
          <button
            type="button"
            className="message-modern-detail-back"
            onClick={returnToConversationInformation}
            disabled={groupSubmitting || groupActionAccountId !== null}
            aria-label={t("groupManagement.back")}
          >
            <span aria-hidden="true">←</span>
          </button>
          <div>
            <span>{t("groupManagement.eyebrow")}</span>
            <strong>{t("groupManagement.title")}</strong>
          </div>
          <button
            type="button"
            className="message-modern-detail-close"
            onClick={closeGroupDialog}
            disabled={groupSubmitting || groupActionAccountId !== null}
            aria-label={t("groupManagement.close")}
          >
            <MessageNavigationIcon name="close" />
          </button>
        </header>

        <div className="message-modern-detail-scroll">
          {groupError && (
            <div className="message-inline-error compact" role="alert">
              <p>{groupError}</p>
            </div>
          )}

          <section className="message-modern-group-hero">
            {renderGroupAvatar(
              groupInfoConversation,
              "message-group-photo-preview",
            )}
            <div>
              <strong>{groupInfoConversation.title ?? t("profileDetail.groupFallback")}</strong>
              <span>
                {groupInfoConversation.groupKind === "OFFICIAL"
                  ? officialScopeLabel(groupInfoConversation, t)
                  : `${t("profileDetail.membersCount", { count: groupInfoConversation.memberCount })}`}
              </span>
              {groupInfoConversation.description && (
                <p>{groupInfoConversation.description}</p>
              )}
              <div className="message-modern-group-badges">
                <span>
                  {groupInfoConversation.groupKind === "OFFICIAL"
                    ? t("groupManagement.officialGroup")
                    : t("groupManagement.personalGroup")}
                </span>
                <span>{t("profileDetail.membersCount", { count: groupInfoConversation.memberCount })}</span>
              </div>
            </div>
          </section>

          <nav
            className="message-modern-detail-tabs"
            aria-label={t("groupManagement.sectionsAria")}
          >
            <button
              type="button"
              className={groupPanelTab === "OVERVIEW" ? "active" : ""}
              onClick={() => setGroupPanelTab("OVERVIEW")}
            >
              {t("groupManagement.overviewTab")}
            </button>
            <button
              type="button"
              className={groupPanelTab === "MEMBERS" ? "active" : ""}
              onClick={() => setGroupPanelTab("MEMBERS")}
            >
              {t("groupManagement.membersTab")}
            </button>
            {canOpenSettings && (
              <button
                type="button"
                className={groupPanelTab === "SETTINGS" ? "active" : ""}
                onClick={() => setGroupPanelTab("SETTINGS")}
              >
                {t("groupManagement.settingsTab")}
              </button>
            )}
          </nav>

          {groupPanelTab === "OVERVIEW" && (
            <div className="message-modern-group-tab">
              <section className="message-modern-detail-section">
                <div className="message-modern-section-heading">
                  <h3>{t("groupManagement.sharedContent")}</h3>
                  <span>
                    {selectedConversationSharedContent.media.length +
                      selectedConversationSharedContent.documents.length +
                      selectedConversationSharedContent.links.length}
                  </span>
                </div>
                <div className="message-modern-shared-actions">
                  <button
                    type="button"
                    onClick={() =>
                      void openSharedContentPanel("MEDIA", "GROUP_MANAGEMENT")
                    }
                  >
                    <MessageNavigationIcon name="shared" />
                    <span>{t("groupManagement.media")}</span>
                    <b>{selectedConversationSharedContent.media.length}</b>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void openSharedContentPanel(
                        "DOCUMENTS",
                        "GROUP_MANAGEMENT",
                      )
                    }
                  >
                    <MessageNavigationIcon name="shared" />
                    <span>{t("groupManagement.documents")}</span>
                    <b>{selectedConversationSharedContent.documents.length}</b>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void openSharedContentPanel("LINKS", "GROUP_MANAGEMENT")
                    }
                  >
                    <MessageNavigationIcon name="shared" />
                    <span>{t("groupManagement.links")}</span>
                    <b>{selectedConversationSharedContent.links.length}</b>
                  </button>
                </div>
              </section>

              <section className="message-modern-detail-section">
                <div className="message-modern-section-heading">
                  <h3>{t("groupManagement.leadership")}</h3>
                  <span>
                    {groupInfoAdmins.length + (groupInfoOwner ? 1 : 0)}
                  </span>
                </div>
                <div className="message-modern-leadership-list">
                  {groupInfoOwner && (
                    <button
                      type="button"
                      onClick={() =>
                        openProfile(groupInfoOwner.accountId, true)
                      }
                    >
                      {renderAccountAvatar(
                        groupInfoOwner,
                        "message-avatar small",
                      )}
                      <span>
                        <strong>{groupInfoOwner.displayName}</strong>
                        <small>{t("groupManagement.owner")}</small>
                      </span>
                    </button>
                  )}
                  {groupInfoAdmins.map((admin) => (
                    <button
                      key={admin.accountId}
                      type="button"
                      onClick={() => openProfile(admin.accountId, true)}
                    >
                      {renderAccountAvatar(admin, "message-avatar small")}
                      <span>
                        <strong>{admin.displayName}</strong>
                        <small>{t("groupManagement.admin")}</small>
                      </span>
                    </button>
                  ))}
                  {!groupInfoOwner && groupInfoAdmins.length === 0 && (
                    <p>{t("groupManagement.noLeadership")}</p>
                  )}
                </div>
              </section>

              <p className="message-modern-security-note">
                {groupInfoConversation.groupKind === "OFFICIAL"
                  ? t("groupManagement.membershipNote1")
                  : t("groupManagement.membershipNote2")}
              </p>
            </div>
          )}

          {groupPanelTab === "MEMBERS" && (
            <div className="message-modern-group-tab">
              <section className="message-modern-detail-section message-modern-members-section">
                <div className="message-modern-section-heading">
                  <h3>{t("groupInfo.members")}</h3>
                  <span>{groupInfoConversation.memberCount}</span>
                </div>

                {groupInfoConversation.groupKind === "OFFICIAL" && (
                  <p className="message-modern-security-note compact">
                    {t("groupManagement.officialMembershipReadOnly")}
                  </p>
                )}

                <div className="message-modern-member-list">
                  {groupInfoParticipants.map((participant) => {
                    const isViewer = participant.accountId === account?.id;
                    const viewerRole =
                      groupInfoConversation.viewerParticipantRole;
                    const canChangeRole =
                      groupInfoConversation.groupKind === "PERSONAL" &&
                      viewerRole === "OWNER" &&
                      participant.participantRole !== "OWNER" &&
                      participant.role !== "SUPER_ADMIN" &&
                      !isViewer;
                    const canRemove =
                      groupInfoConversation.groupKind === "PERSONAL" &&
                      groupInfoConversation.canManageGroup &&
                      participant.participantRole !== "OWNER" &&
                      !isViewer &&
                      (viewerRole === "OWNER" ||
                        participant.participantRole === "MEMBER");

                    return (
                      <article
                        key={participant.accountId}
                        className="message-modern-member-row"
                      >
                        <button
                          type="button"
                          className="message-modern-member-main"
                          onClick={() =>
                            openProfile(participant.accountId, true)
                          }
                        >
                          {renderAccountAvatar(
                            participant,
                            "message-avatar small",
                          )}
                          <span>
                            <strong>
                              {participant.displayName}
                              {isViewer ? ` ${t("groupInfo.youSuffix")}` : ""}
                            </strong>
                            <small>
                              {participant.employee?.designation ??
                                roleLabel(participant.role, t)}
                            </small>
                          </span>
                          <b>{roleLabel(participant.participantRole, t)}</b>
                        </button>

                        {(canChangeRole || canRemove) && (
                          <div className="message-modern-member-actions">
                            {canChangeRole && (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleGroupRoleChange(
                                    participant.accountId,
                                    participant.participantRole === "ADMIN"
                                      ? "MEMBER"
                                      : "ADMIN",
                                  )
                                }
                                disabled={groupActionAccountId !== null}
                              >
                                {groupActionAccountId === participant.accountId
                                  ? t("groupManagement.working")
                                  : participant.participantRole === "ADMIN"
                                    ? t("groupManagement.removeAdmin")
                                    : t("groupManagement.makeAdmin")}
                              </button>
                            )}
                            {canRemove && (
                              <button
                                type="button"
                                className="danger"
                                onClick={() =>
                                  void handleRemoveGroupMember(
                                    participant.accountId,
                                  )
                                }
                                disabled={groupActionAccountId !== null}
                              >
                                {t("groupManagement.remove")}
                              </button>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>

              {groupInfoConversation.groupKind === "PERSONAL" &&
                groupInfoConversation.canManageGroup && (
                  <section className="message-modern-detail-section">
                    <div className="message-modern-section-heading">
                      <h3>{t("groupManagement.addMembers")}</h3>
                      <span>{t("summary.selected", { total: groupSelectedAccountIds.length })}</span>
                    </div>
                    <label className="message-modern-search-field">
                      <MessageNavigationIcon name="search" />
                      <input
                        type="search"
                        value={groupSearch}
                        onChange={(event) => setGroupSearch(event.target.value)}
                        placeholder={t("privateGroup.searchEmployees")}
                      />
                    </label>
                    <div className="message-modern-add-member-list">
                      {groupContactsLoading ? (
                        <div className="message-list-state compact">
                          <span className="message-small-spinner" />
                          <p>{t("groupManagement.searchingAccounts")}</p>
                        </div>
                      ) : groupContacts.length === 0 ? (
                        <div className="message-list-state compact">
                          <p>{t("groupManagement.noMatchingAccounts")}</p>
                        </div>
                      ) : (
                        groupContacts.map((contact) => {
                          const alreadyMember = selectedGroupMemberIds.has(
                            contact.accountId,
                          );
                          const selected = groupSelectedAccountIds.includes(
                            contact.accountId,
                          );
                          const eligible = contact.contactMode === "DIRECT";

                          return (
                            <label
                              key={contact.accountId}
                              className={`message-modern-add-member-row${selected ? " selected" : ""
                                }${!eligible || alreadyMember ? " disabled" : ""
                                }`}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() =>
                                  toggleGroupMember(contact.accountId)
                                }
                                disabled={
                                  !eligible ||
                                  alreadyMember ||
                                  groupSubmitting
                                }
                              />
                              {renderAccountAvatar(
                                contact,
                                "message-avatar small",
                              )}
                              <span>
                                <strong>{contact.displayName}</strong>
                                <small>
                                  {alreadyMember
                                    ? t("groupManagement.alreadyMember")
                                    : eligible
                                      ? contact.employee?.designation ??
                                      roleLabel(contact.role, t)
                                      : contact.contactMode === "BLOCKED"
                                        ? t("groupManagement.blockedPrivateContact")
                                        : t("privateGroup.firstContactApproval")}
                                </small>
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                    <button
                      type="button"
                      className="message-modern-primary-action"
                      onClick={() => void handleAddGroupMembers()}
                      disabled={
                        groupSelectedAccountIds.length === 0 || groupSubmitting
                      }
                    >
                      {groupSubmitting ? t("groupManagement.adding") : t("groupManagement.addSelectedMembers")}
                    </button>
                  </section>
                )}
            </div>
          )}

          {groupPanelTab === "SETTINGS" && canOpenSettings && (
            <div className="message-modern-group-tab">
              <section className="message-modern-detail-section">
                <div className="message-modern-section-heading">
                  <h3>{t("groupManagement.groupDetails")}</h3>
                  <span>{t("groupManagement.editable")}</span>
                </div>

                <div className="message-modern-group-photo-setting">
                  {renderGroupAvatar(
                    groupInfoConversation,
                    "message-group-photo-preview",
                  )}
                  <div>
                    <strong>{t("groupManagement.groupPhoto")}</strong>
                    <small>{t("groupManagement.groupPhotoHint")}</small>
                    <div>
                      <input
                        ref={groupPhotoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        hidden
                        onChange={(event) =>
                          void handleGroupPhotoChange(event)
                        }
                      />
                      <button
                        type="button"
                        onClick={() => groupPhotoInputRef.current?.click()}
                        disabled={groupPhotoUploading || groupSubmitting}
                      >
                        {groupPhotoUploading
                          ? t("groupManagement.uploading")
                          : groupInfoConversation.groupPhotoKey
                            ? t("groupManagement.changePhoto")
                            : t("groupManagement.uploadPhoto")}
                      </button>
                      {groupInfoConversation.groupPhotoKey && (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void handleRemoveGroupPhoto()}
                          disabled={groupPhotoUploading || groupSubmitting}
                        >
                          {t("groupManagement.remove")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <label className="message-modern-field">
                  <span>{t("groupCreateWorkspace.groupName")}</span>
                  <input
                    type="text"
                    value={groupTitle}
                    onChange={(event) => setGroupTitle(event.target.value)}
                    maxLength={150}
                  />
                </label>
                <label className="message-modern-field">
                  <span>{t("groupManagement.description")}</span>
                  <textarea
                    value={groupDescription}
                    onChange={(event) =>
                      setGroupDescription(event.target.value)
                    }
                    maxLength={500}
                    rows={3}
                    placeholder={t("groupManagement.descriptionPlaceholder")}
                  />
                </label>
                <button
                  type="button"
                  className="message-modern-primary-action"
                  onClick={() => void handleSaveGroupDetails()}
                  disabled={!groupTitle.trim() || groupSubmitting}
                >
                  {groupSubmitting ? t("groupManagement.saving") : t("groupManagement.saveDetails")}
                </button>
              </section>

              {groupInfoConversation.groupKind === "PERSONAL" && (
                <section className="message-modern-detail-section">
                  <div className="message-modern-section-heading">
                    <h3>{t("groupManagement.invitationLink")}</h3>
                    <span>{t("groupManagement.personalGroup")}</span>
                  </div>

                  {groupInviteLoading ? (
                    <p>{t("groupManagement.loadingInvite")}</p>
                  ) : groupInviteLink ? (
                    <>
                      <label className="message-modern-field">
                        <span>{t("groupManagement.activeLink")}</span>
                        <input value={groupInviteUrl} readOnly />
                      </label>
                      <div className="message-modern-inline-actions">
                        <button
                          type="button"
                          onClick={() => void handleCopyGroupInviteLink()}
                        >
                          {t("groupManagement.copy")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCreateGroupInviteLink()}
                        >
                          {t("groupManagement.reset")}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void handleRevokeGroupInviteLink()}
                        >
                          {t("groupManagement.revoke")}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>{t("groupManagement.noActiveInvite")}</p>
                      <button
                        type="button"
                        onClick={() => void handleCreateGroupInviteLink()}
                      >
                        {t("groupManagement.generateInvite")}
                      </button>
                    </>
                  )}

                  {groupInviteNotice && (
                    <small className="message-group-info-success">
                      {groupInviteNotice}
                    </small>
                  )}
                  {groupInviteError && (
                    <small className="message-group-info-danger">
                      {groupInviteError}
                    </small>
                  )}
                </section>
              )}

              {groupInfoConversation.groupKind === "OFFICIAL" && (
                <section className="message-modern-detail-section">
                  <div className="message-modern-section-heading">
                    <h3>{t("groupManagement.auditTitle")}</h3>
                    {account?.role === "SUPER_ADMIN" && (
                      <button
                        type="button"
                        onClick={() => void handleReconcileOfficialGroups()}
                        disabled={officialGroupReconciling}
                      >
                        {officialGroupReconciling
                          ? t("groupManagement.reconciling")
                          : t("groupManagement.reconcile")}
                      </button>
                    )}
                  </div>
                  {officialGroupAuditLoading ? (
                    <div className="message-list-state compact">
                      <span className="message-small-spinner" />
                      <p>{t("groupManagement.loadingAudit")}</p>
                    </div>
                  ) : officialGroupAudit.length === 0 ? (
                    <p>{t("groupManagement.noAudit")}</p>
                  ) : (
                    <div className="message-modern-audit-list">
                      {officialGroupAudit.map((entry) => (
                        <article key={entry.id}>
                          <strong>{officialAuditLabel(entry, t)}</strong>
                          <small>
                            {entry.actor?.displayName ?? t("groupManagement.system")} ·{" "}
                            {notificationTimestampLabel(entry.createdAt)}
                          </small>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {groupInfoConversation.groupKind === "PERSONAL" && (
            <section className="message-modern-danger-zone">
              <button
                type="button"
                className="danger"
                onClick={() =>
                  openDestructiveConfirmation({
                    kind: "LEAVE_GROUP",
                    conversationId: groupInfoConversation.id,
                    conversationTitle:
                      groupInfoConversation.title ?? t("groupInfo.thisGroup"),
                  })
                }
                disabled={groupSubmitting}
              >
                {groupSubmitting ? t("groupInfo.leaving") : t("groupInfo.leaveGroup")}
              </button>
            </section>
          )}
        </div>
      </div>
    );
  }

  function renderPrivateGroupWorkspaceContent(): ReactNode {
    if (!selectedConversation || selectedConversation.type !== "PRIVATE") {
      return null;
    }

    const canCreatePrivateGroup =
      privateGroupSelectedAccountIds.length > 0 && !privateGroupSubmitting;

    return (
      <div className="message-add-members-workspace">
        <header className="message-create-flow-header">
          <button
            type="button"
            className="message-create-flow-back"
            onClick={closePrivateGroupDialog}
            disabled={privateGroupSubmitting}
            aria-label={t("privateGroup.back")}
            title={t("privateGroup.back")}
          >
            ←
          </button>
          <div>
            <span>{t("privateGroup.addMember")}</span>
            <h2>{t("privateGroup.title")}</h2>
            <p>
              {t("privateGroup.description")}
            </p>
          </div>
        </header>

        <div className="message-add-members-canvas">
          {privateGroupError && (
            <div className="message-inline-error compact" role="alert">
              <p>{privateGroupError}</p>
            </div>
          )}

          <div className="message-add-members-layout">
            <section className="message-add-members-people-panel">
              <header className="message-create-group-panel-header">
                <div>
                  <span>{t("privateGroup.people")}</span>
                  <h3>{t("privateGroup.chooseMembers")}</h3>
                  <p>{t("privateGroup.eligibleEmployees")}</p>
                </div>
                <strong>{t("summary.selected", { total: privateGroupSelectedAccountIds.length })}</strong>
              </header>

              <label className="message-create-group-search">
                <MessageNavigationIcon name="search" />
                <input
                  type="search"
                  value={privateGroupSearch}
                  onChange={(event) => setPrivateGroupSearch(event.target.value)}
                  placeholder={t("privateGroup.searchEmployees")}
                  autoFocus
                />
              </label>

              {privateGroupSelectedContacts.length > 0 && (
                <div
                  className="message-create-group-selected-strip"
                  aria-label={t("privateGroup.selectedMembersAria")}
                >
                  {privateGroupSelectedContacts.map((contact) => (
                    <button
                      key={contact.accountId}
                      type="button"
                      onClick={() =>
                        togglePrivateGroupMember(contact.accountId, contact)
                      }
                      disabled={privateGroupSubmitting}
                      title={`Remove ${contact.displayName}`}
                    >
                      {renderAccountAvatar(
                        contact,
                        "message-avatar selected-member-avatar",
                      )}
                      <span>{contact.displayName}</span>
                      <em aria-hidden="true">×</em>
                    </button>
                  ))}
                </div>
              )}

              <div className="message-group-contact-list message-add-members-list">
                {privateGroupContactsLoading ? (
                  <div className="message-list-state compact" role="status">
                    <span className="message-small-spinner" aria-hidden="true" />
                    <p>{t("groupManagement.searchingAccounts")}</p>
                  </div>
                ) : privateGroupContacts.length === 0 ? (
                  <div className="message-list-state compact" role="status">
                    <p>{t("groupManagement.noMatchingAccounts")}</p>
                  </div>
                ) : (
                  privateGroupContacts.map((contact) => {
                    const alreadyOriginalMember =
                      privateGroupOriginalMemberIds.has(contact.accountId);
                    const selected = privateGroupSelectedAccountIds.includes(
                      contact.accountId,
                    );
                    const eligible =
                      contact.contactMode === "DIRECT" && !alreadyOriginalMember;

                    return (
                      <label
                        key={contact.accountId}
                        className={`message-group-contact-row${selected ? " selected" : ""
                          }${!eligible ? " disabled" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() =>
                            togglePrivateGroupMember(contact.accountId, contact)
                          }
                          disabled={!eligible || privateGroupSubmitting}
                        />

                        {renderAccountAvatar(contact, "message-avatar small")}

                        <span>
                          <strong>{contact.displayName}</strong>
                          <small>
                            {alreadyOriginalMember
                              ? t("privateGroup.alreadyInConversation")
                              : eligible
                                ? (contact.employee?.designation ??
                                  roleLabel(contact.role, t))
                                : contact.contactMode === "BLOCKED"
                                  ? t("groupManagement.blockedPrivateContact")
                                  : t("groupManagement.firstContactApproval")}
                          </small>
                        </span>

                        <span
                          className="message-create-group-member-state"
                          aria-hidden="true"
                        >
                          {selected ? "✓" : "+"}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </section>

            <aside className="message-add-members-setup-panel">
              <div className="message-create-group-panel-header compact">
                <div>
                  <span>{t("privateGroup.groupSetup")}</span>
                  <h3>{t("privateGroup.previousContext")}</h3>
                  <p>{t("privateGroup.historyDescription")}</p>
                </div>
              </div>

              <div className="message-add-members-history-options">
                {PRIVATE_GROUP_HISTORY_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={
                      privateGroupHistoryWindow === option.value ? "active" : ""
                    }
                  >
                    <input
                      type="radio"
                      name="private-group-history"
                      value={option.value}
                      checked={privateGroupHistoryWindow === option.value}
                      onChange={() =>
                        setPrivateGroupHistoryWindow(option.value)
                      }
                      disabled={privateGroupSubmitting}
                    />
                    <span>
                      <strong>{t(option.labelKey)}</strong>
                      <small>{t(option.descriptionKey)}</small>
                    </span>
                  </label>
                ))}
              </div>

              <div className="message-add-members-summary">
                <span>{t("privateGroup.selectedMembers")}</span>
                <strong>{privateGroupSelectedAccountIds.length}</strong>
              </div>

              <div className="message-create-group-setup-actions">
                <button
                  type="button"
                  onClick={closePrivateGroupDialog}
                  disabled={privateGroupSubmitting}
                >
                  {t("actions.cancel")}
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void handleCreatePrivateGroup()}
                  disabled={!canCreatePrivateGroup}
                >
                  {privateGroupSubmitting ? t("privateGroup.creating") : t("privateGroup.createGroup")}
                </button>
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  function renderCreateGroupWorkspaceContent(): ReactNode {
    const isOfficialGroup = groupKind === "OFFICIAL";
    const canSubmitGroup =
      Boolean(groupTitle.trim()) &&
      !groupSubmitting &&
      (isOfficialGroup
        ? Boolean(selectedOfficialGroupScope)
        : groupSelectedAccountIds.length > 0);

    return (
      <div className="message-create-group-workspace">
        <header className="message-create-flow-header">
          <button
            type="button"
            className="message-create-flow-back"
            onClick={closeGroupDialog}
            aria-label={t("groupCreateWorkspace.backToGroups")}
            title={t("groupCreateWorkspace.backToGroups")}
          >
            ←
          </button>
          <div>
            <span>{t("groupCreateWorkspace.newGroup")}</span>
            <h2>
              {isOfficialGroup
                ? t("groupCreateWorkspace.officialTitle")
                : t("groupCreateWorkspace.personalTitle")}
            </h2>
            <p>
              {isOfficialGroup
                ? t("groupCreateWorkspace.officialDescription")
                : t("groupCreateWorkspace.personalDescription")}
            </p>
          </div>
        </header>

        <div
          className={`message-create-group-canvas${isOfficialGroup ? " official-group" : ""
            }`}
        >
          {groupError && (
            <div className="message-inline-error compact" role="alert">
              <p>{groupError}</p>
            </div>
          )}

          <div className="message-create-group-layout">
            <section className="message-create-group-people-panel">
              <header className="message-create-group-panel-header">
                <div>
                  <span>{isOfficialGroup ? t("groupCreateWorkspace.membership") : t("groupCreateWorkspace.people")}</span>
                  <h3>
                    {isOfficialGroup
                      ? t("groupCreateWorkspace.chooseScope")
                      : t("groupCreateWorkspace.chooseMembers")}
                  </h3>
                  <p>
                    {isOfficialGroup
                      ? t("groupCreateWorkspace.officialMembersHint")
                      : t("privateGroup.eligibleEmployees")}
                  </p>
                </div>
                {!isOfficialGroup && (
                  <strong>{t("summary.selected", { total: groupSelectedAccountIds.length })}</strong>
                )}
              </header>

              {isOfficialGroup ? (
                <div className="message-create-group-official-scope">
                  <div className="message-create-group-scope-visual" aria-hidden="true">
                    <MessageNavigationIcon name="newGroup" />
                  </div>
                  <label className="message-group-scope-field">
                    <span>{t("groupCreateWorkspace.organizationalScope")}</span>
                    <select
                      value={officialGroupScopeKey}
                      onChange={(event) => {
                        const nextKey = event.target.value;
                        const nextScope = officialGroupScopes.find(
                          (scope) => scope.key === nextKey,
                        );

                        setOfficialGroupScopeKey(nextKey);

                        if (nextScope && !groupTitle.trim()) {
                          setGroupTitle(nextScope.defaultTitle);
                        }
                      }}
                      disabled={officialGroupScopesLoading || groupSubmitting}
                    >
                      <option value="">
                        {officialGroupScopesLoading
                          ? t("groupCreateWorkspace.loadingScopes")
                          : t("groupCreateWorkspace.selectScope")}
                      </option>
                      {officialGroupScopes.map((scope) => (
                        <option key={scope.key} value={scope.key}>
                          {scope.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="message-create-group-scope-summary">
                    <span>{t("groupCreateWorkspace.membershipSource")}</span>
                    <strong>
                      {selectedOfficialGroupScope?.label ??
                        t("groupCreateWorkspace.noScopeSelected")}
                    </strong>
                    <small>
                      {t("groupCreateWorkspace.membershipControlled")}
                    </small>
                  </div>
                </div>
              ) : (
                <>
                  <label className="message-create-group-search">
                    <span className="sr-only">{t("groupCreateWorkspace.searchEligibleEmployees")}</span>
                    <input
                      type="search"
                      value={groupSearch}
                      onChange={(event) => setGroupSearch(event.target.value)}
                      placeholder={t("groupCreateWorkspace.searchPlaceholder")}
                    />
                  </label>

                  {groupSelectedContacts.length > 0 && (
                    <div
                      className="message-create-group-selected-strip"
                      aria-label={t("groupCreateWorkspace.selectedMembersAria")}
                    >
                      {groupSelectedContacts.map((contact) => (
                        <button
                          key={contact.accountId}
                          type="button"
                          onClick={() =>
                            toggleGroupMember(contact.accountId, contact)
                          }
                          disabled={groupSubmitting}
                          title={`Remove ${contact.displayName}`}
                        >
                          {renderAccountAvatar(
                            contact,
                            "message-avatar selected-member-avatar",
                          )}
                          <span>{contact.displayName}</span>
                          <em aria-hidden="true">×</em>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="message-group-contact-list message-create-group-member-list">
                    {groupContactsLoading ? (
                      <div className="message-list-state compact" role="status">
                        <span className="message-small-spinner" aria-hidden="true" />
                        <p>{t("groupManagement.searchingAccounts")}</p>
                      </div>
                    ) : groupContacts.length === 0 ? (
                      <div className="message-list-state compact" role="status">
                        <p>{t("groupManagement.noMatchingAccounts")}</p>
                      </div>
                    ) : (
                      groupContacts.map((contact) => {
                        const selected = groupSelectedAccountIds.includes(
                          contact.accountId,
                        );
                        const eligible = contact.contactMode === "DIRECT";

                        return (
                          <label
                            key={contact.accountId}
                            className={`message-group-contact-row${selected ? " selected" : ""
                              }${!eligible ? " disabled" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() =>
                                toggleGroupMember(contact.accountId, contact)
                              }
                              disabled={!eligible || groupSubmitting}
                            />

                            {renderAccountAvatar(
                              contact,
                              "message-avatar small",
                            )}

                            <span>
                              <strong>{contact.displayName}</strong>
                              <small>
                                {eligible
                                  ? (contact.employee?.designation ??
                                    roleLabel(contact.role, t))
                                  : contact.contactMode === "BLOCKED"
                                    ? "Blocked private contact"
                                    : t("privateGroup.firstContactApproval")}
                              </small>
                            </span>

                            <span
                              className="message-create-group-member-state"
                              aria-hidden="true"
                            >
                              {selected ? "✓" : "+"}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </section>

            <aside className="message-create-group-setup-panel">
              <div className="message-create-group-panel-header compact">
                <div>
                  <span>{t("privateGroup.groupSetup")}</span>
                  <h3>{t("groupCreateWorkspace.identityAndType")}</h3>
                  <p>{t("groupCreateWorkspace.identityHint")}</p>
                </div>
              </div>

              {canCreateOfficialGroup && (
                <fieldset className="message-create-group-type-field">
                  <legend>{t("groupCreateWorkspace.groupType")}</legend>
                  <div className="message-group-kind-options">
                    <button
                      type="button"
                      className={groupKind === "PERSONAL" ? "active" : ""}
                      onClick={() => {
                        setGroupKind("PERSONAL");
                        setGroupError(null);
                      }}
                      disabled={groupSubmitting}
                    >
                      <strong>{t("groupCreateWorkspace.personal")}</strong>
                      <small>{t("groupCreateWorkspace.chooseMembersShort")}</small>
                    </button>

                    <button
                      type="button"
                      className={groupKind === "OFFICIAL" ? "active" : ""}
                      onClick={() => {
                        const defaultScope =
                          selectedOfficialGroupScope ??
                          officialGroupScopes[0] ??
                          null;

                        setGroupKind("OFFICIAL");
                        setGroupSelectedAccountIds([]);
                        setGroupSelectedContacts([]);

                        if (defaultScope) {
                          setOfficialGroupScopeKey(defaultScope.key);
                          setGroupTitle((current) =>
                            current.trim()
                              ? current
                              : defaultScope.defaultTitle,
                          );
                        }

                        setGroupError(null);
                      }}
                      disabled={groupSubmitting || officialGroupScopesLoading}
                    >
                      <strong>{t("groupCreateWorkspace.official")}</strong>
                      <small>{t("groupCreateWorkspace.useScope")}</small>
                    </button>
                  </div>
                </fieldset>
              )}

              <div className="message-create-group-fields">
                <label>
                  <span>{t("groupCreateWorkspace.groupName")}</span>
                  <input
                    type="text"
                    value={groupTitle}
                    onChange={(event) => setGroupTitle(event.target.value)}
                    maxLength={150}
                    placeholder={t("groupCreateWorkspace.groupNamePlaceholder")}
                    autoFocus={isOfficialGroup}
                  />
                </label>

                <label>
                  <span>
                    {t("groupCreateWorkspace.description")} <em>{t("groupCreateWorkspace.optional")}</em>
                  </span>
                  <textarea
                    value={groupDescription}
                    onChange={(event) =>
                      setGroupDescription(event.target.value)
                    }
                    maxLength={500}
                    rows={4}
                    placeholder={t("groupCreateWorkspace.descriptionPlaceholder")}
                  />
                </label>
              </div>

              <div className="message-create-group-status-card">
                <div>
                  <span>{t("groupCreateWorkspace.groupType")}</span>
                  <strong>{isOfficialGroup ? "Official" : "Personal"}</strong>
                </div>
                <div>
                  <span>{isOfficialGroup ? t("groupCreateWorkspace.scope") : t("groupCreateWorkspace.members")}</span>
                  <strong>
                    {isOfficialGroup
                      ? (selectedOfficialGroupScope?.label ?? t("groupCreateWorkspace.notSelected"))
                      : groupSelectedAccountIds.length}
                  </strong>
                </div>
              </div>

              <div className="message-create-group-setup-actions">
                <button
                  type="button"
                  onClick={closeGroupDialog}
                  disabled={groupSubmitting}
                >
                  {t("actions.cancel")}
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void handleCreateGroup()}
                  disabled={!canSubmitGroup}
                >
                  {groupSubmitting
                    ? t("groupCreateWorkspace.creating")
                    : isOfficialGroup
                      ? t("groupCreateWorkspace.createOfficialGroup")
                      : t("groupCreateWorkspace.createGroup")}
                </button>
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  function renderMessageListWorkspaceContent(): ReactNode {
    if (
      listMode &&
      !selectedChatFolder &&
      (chatFoldersLoading || (!chatFoldersError && !listWorkspaceError))
    ) {
      return (
        <div className="message-list-workspace">
          <div className="message-list-workspace-state" role="status">
            <span className="message-small-spinner" aria-hidden="true" />
            <strong>{t("listWorkspace.loadingList")}</strong>
          </div>
        </div>
      );
    }

    if (listMode && !selectedChatFolder) {
      return (
        <div className="message-list-workspace">
          <header className="message-list-workspace-header">
            <button
              type="button"
              className="message-mobile-back"
              onClick={() => navigate("/messages")}
              aria-label={t("navigation.backToChats")}
            >
              ←
            </button>
            <div>
              <span>{t("listWorkspace.myLists")}</span>
              <h2>{t("listWorkspace.unavailable")}</h2>
              <p>
                {t("listWorkspace.unavailableDescription")}
              </p>
            </div>
            <button
              type="button"
              className="message-workspace-close-action"
              onClick={() => navigate("/messages")}
            >
              {t("navigation.backToChats")}
            </button>
          </header>
          <div className="message-list-workspace-body">
            <div className="message-list-workspace-state danger" role="alert">
              <strong>
                {chatFoldersError ??
                  listWorkspaceError ??
                  t("listWorkspace.notFound")}
              </strong>
              <button
                type="button"
                onClick={() => {
                  setListWorkspaceError(null);
                  void loadChatFolders();
                }}
              >
                {t("actions.retry")}
              </button>
            </div>
          </div>
        </div>
      );
    }

    const editingExistingList = listEditMode && Boolean(selectedChatFolder);
    const selectedCount = listSelectedConversationIds.length;

    return (
      <div className="message-list-workspace">
        <header className="message-list-workspace-header">
          <button
            type="button"
            className="message-mobile-back"
            onClick={() =>
              listEditMode && selectedListId
                ? navigate(`/messages/lists/${selectedListId}`)
                : navigate("/messages")
            }
            aria-label={
              listEditMode ? t("listWorkspace.backToListConversations") : t("navigation.backToChats")
            }
          >
            ←
          </button>
          <div>
            <span>{t("listWorkspace.messages")}</span>
            <h2>{listCreateMode ? t("listWorkspace.createList") : t("listWorkspace.manageList")}</h2>
          </div>
          <button
            type="button"
            className="message-workspace-close-action"
            onClick={() =>
              listEditMode && selectedListId
                ? navigate(`/messages/lists/${selectedListId}`)
                : navigate("/messages")
            }
          >
            {listEditMode ? t("listWorkspace.backToList") : t("navigation.backToChats")}
          </button>
        </header>

        <form
          className="message-list-workspace-body"
          onSubmit={(event) => void handleSaveMessageList(event)}
        >
          <section className="message-list-editor-card">
            <div className="message-list-editor-heading">
              <div>
                <h3>{t("listWorkspace.listName")}</h3>
              </div>
              <small>{listNameDraft.length}/100</small>
            </div>

            <label className="message-list-name-field">
              <span>{t("listWorkspace.listName")}</span>
              <input
                type="text"
                value={listNameDraft}
                maxLength={100}
                autoComplete="off"
                placeholder={t("listWorkspace.namePlaceholder")}
                onChange={(event) => {
                  setListNameDraft(event.target.value);
                  setListWorkspaceError(null);
                              }}
                disabled={listSaving || listDeleting}
                autoFocus={listCreateMode}
              />

            </label>
          </section>

          <section className="message-list-editor-card message-list-members-card">
            <div className="message-list-editor-heading">
              <div>
                <h3>{t("listWorkspace.peopleAndGroups")}</h3>
              </div>
              <strong>{t("summary.selected", { total: selectedCount })}</strong>
            </div>

            <label className="message-list-picker-search">
              <span className="sr-only">{t("listWorkspace.searchAria")}</span>
              <MessageNavigationIcon name="search" />
              <input
                type="search"
                value={listCandidateSearch}
                placeholder={t("listWorkspace.searchPlaceholder")}
                onChange={(event) => setListCandidateSearch(event.target.value)}
                disabled={listCandidatesLoading || listSaving || listDeleting}
              />
              {listCandidateSearch && (
                <button
                  type="button"
                  onClick={() => setListCandidateSearch("")}
                  aria-label={t("listWorkspace.clearSearch")}
                >
                  ×
                </button>
              )}
            </label>

            <div
              className="message-list-picker"
              aria-busy={listCandidatesLoading}
            >
              {listCandidatesLoading ? (
                <div className="message-list-workspace-state" role="status">
                  <span className="message-small-spinner" aria-hidden="true" />
                  <strong>{t("listWorkspace.loadingConversations")}</strong>
                </div>
              ) : filteredListCandidateConversations.length === 0 ? (
                <div className="message-list-workspace-state">
                  <MessageNavigationIcon name="chats" />
                  <strong>
                    {listCandidateSearch.trim()
                      ? t("listWorkspace.noMatchingConversations")
                      : t("listWorkspace.noConversations")}
                  </strong>
                  <small>
                    {t("listWorkspace.emptyHint")}
                  </small>
                </div>
              ) : (
                filteredListCandidateConversations.map((conversation) => {
                  const peer = conversationPeerFor(conversation);
                  const checked = listSelectedConversationIds.includes(
                    conversation.id,
                  );
                  const category =
                    conversation.type === "PRIVATE"
                      ? t("listWorkspace.privateChat")
                      : conversation.groupKind === "OFFICIAL"
                        ? t("listWorkspace.officialGroup")
                        : t("listWorkspace.personalGroup");
                  const secondary =
                    conversation.type === "PRIVATE"
                      ? peer?.employee?.designation ??
                        roleLabel(peer?.role ?? "EMPLOYEE", t)
                      : t("profileDetail.membersCount", { count: conversation.memberCount });

                  return (
                    <label
                      key={conversation.id}
                      className={`message-list-picker-row${checked ? " selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleListConversation(conversation.id)}
                        disabled={listSaving || listDeleting}
                      />
                      <span className="message-avatar-presence">
                        {peer
                          ? renderAccountAvatar(peer)
                          : renderGroupAvatar(conversation)}
                      </span>
                      <span className="message-list-picker-copy">
                        <strong>
                          {conversation.title ?? t("listWorkspace.privateConversation")}
                        </strong>
                        <small>
                          {category} · {secondary}
                        </small>
                      </span>
                      <span
                        className="message-list-picker-check"
                        aria-hidden="true"
                      >
                        {checked ? "✓" : ""}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </section>

          {listWorkspaceError && (
            <div className="message-list-workspace-feedback danger" role="alert">
              {listWorkspaceError}
            </div>
          )}

          <div className="message-list-workspace-actions">
            {editingExistingList && listDeleteConfirmOpen ? (
              <div
                className="message-list-delete-confirm"
                role="group"
                aria-label={t("listWorkspace.confirmDeleteAria")}
              >
                <span>
                  {t("listWorkspace.deleteConfirmation", { name: selectedChatFolder?.name ?? "" })}
                </span>
                <button
                  type="button"
                  onClick={() => setListDeleteConfirmOpen(false)}
                  disabled={listDeleting}
                >
                  {t("actions.cancel")}
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => void handleDeleteMessageList()}
                  disabled={listDeleting}
                >
                  {listDeleting ? t("listWorkspace.deleting") : t("listWorkspace.deleteList")}
                </button>
              </div>
            ) : (
              <>
                {editingExistingList && (
                  <button
                    type="button"
                    className="message-list-delete-trigger"
                    onClick={() => setListDeleteConfirmOpen(true)}
                    disabled={listSaving || listDeleting}
                  >
                    {t("listWorkspace.deleteList")}
                  </button>
                )}
                <div className="message-list-selection-summary">
                  <strong>{t("summary.selected", { total: selectedCount })}</strong>
                </div>
                <button
                  type="submit"
                  className="primary"
                  disabled={
                    listSaving ||
                    listDeleting ||
                    listCandidatesLoading ||
                    !listNameDraft.trim()
                  }
                >
                  {listSaving
                    ? t("listWorkspace.saving")
                    : listCreateMode
                      ? t("listWorkspace.createList")
                      : t("listWorkspace.saveChanges")}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    );
  }

  function renderMessageListOverviewContent(): ReactNode {
    if (!selectedChatFolder) {
      return null;
    }

    const conversationCount = selectedChatFolder.items.filter(
      (item) => item.conversationId,
    ).length;

    return (
      <div className="message-collection-welcome-state message-list-welcome-state">
        <span className="message-collection-welcome-icon message-list-welcome-brand" aria-hidden="true">
          <MessageNavigationIcon name="chats" />
        </span>
        <h2>{t("listOverview.selectConversation")}</h2>
        <p>
          {conversationCount === 0
            ? t("listOverview.empty", { name: selectedChatFolder.name })
            : t("listOverview.choose", { name: selectedChatFolder.name })}
        </p>
      </div>
    );
  }

  const resolvedMessagingTheme = resolveMessagingTheme(
    messagingCustomization.theme,
    systemPrefersDark,
  );
  const workspaceDetailOpen = listCreateMode
    ? true
    : listMode
      ? Boolean(selectedConversation || listEditMode)
      : newConversationMode
        ? false
        : Boolean(
            selectedConversation ||
            (requestMode && selectedMessageRequest) ||
            settingsMode ||
            ownProfileMode ||
            createGroupMode,
          );

  const sidebarTitle = announcementMode
    ? t("sidebar.titles.announcements")
    : requestMode
      ? t("sidebar.titles.requests")
      : starredMode
        ? t("sidebar.titles.starred")
        : archivedMode
          ? t("sidebar.titles.archived")
          : notificationMode
            ? t("sidebar.titles.notifications")
            : settingsMode
              ? t("sidebar.titles.settings")
              : ownProfileMode
                ? t("sidebar.titles.profile")
                : newConversationMode
                  ? t("sidebar.titles.newConversation")
                  : createGroupMode
                    ? t("sidebar.titles.createGroup")
                    : listCreateMode
                      ? t("sidebar.titles.createList")
                      : conversationCategory === "GROUPS" ||
                      conversationCategory === "OFFICIAL"
                        ? t("sidebar.titles.groups")
                        : t("sidebar.titles.conversations");

  function renderStorageUsageWorkspaceContent(): ReactNode {
    if (!storageUsageScope) {
      return null;
    }

    const conversationScoped = storageUsageScope.kind === "CONVERSATION";
    const conversationTitle =
      storageUsage?.scope === "CONVERSATION"
        ? (storageUsage.conversation.title ??
          conversations.find(
            (conversation) => conversation.id === storageUsage.conversation.id,
          )?.title ??
          (storageUsage.conversation.type === "GROUP"
            ? t("storageWorkspace.groupStorage")
            : t("storageWorkspace.privateChatStorage")))
        : null;

    return (
      <div className="message-storage-workspace">
        <header className="message-storage-workspace-header">
          <button
            type="button"
            className="message-mobile-back"
            onClick={handleStorageWorkspaceBack}
            aria-label={conversationScoped ? t("storageWorkspace.backToAll") : t("storageWorkspace.backToSettings")}
          >
            ←
          </button>
          <div>
            <span>{t("storageWorkspace.eyebrow")}</span>
            <h2>{conversationScoped ? conversationTitle : t("storageWorkspace.title")}</h2>
            <p>
              {conversationScoped
                ? t("storageWorkspace.conversationDescription")
                : t("storageWorkspace.accountDescription")}
            </p>
          </div>
          <button
            type="button"
            className="message-workspace-close-action"
            onClick={handleStorageWorkspaceBack}
          >
            {conversationScoped ? t("storageWorkspace.allStorage") : t("storageWorkspace.backToSettingsShort")}
          </button>
        </header>

        <div className="message-storage-workspace-scroll">
          {storageUsageLoading && !storageUsage ? (
            <div className="message-storage-state" role="status">
              <span className="message-small-spinner" aria-hidden="true" />
              <strong>{t("storageWorkspace.loading")}</strong>
            </div>
          ) : storageUsageError && !storageUsage ? (
            <div className="message-storage-state error" role="alert">
              <MessageNavigationIcon name="storage" />
              <strong>{t("storageWorkspace.loadError")}</strong>
              <small>{storageUsageError}</small>
              <button
                type="button"
                onClick={() => void loadStorageUsage(storageUsageScope)}
              >
                {t("actions.retry")}
              </button>
            </div>
          ) : storageUsage ? (
            <div className="message-storage-content">
              {storageUsageLoading && (
                <div className="message-storage-refreshing" role="status">
                  <span className="message-small-spinner" aria-hidden="true" />
                  {t("storageWorkspace.updating")}
                </div>
              )}

              {storageUsageError && (
                <div className="message-storage-inline-error" role="alert">
                  <span>{storageUsageError}</span>
                </div>
              )}

              <section className="message-storage-overview" aria-label={t("storageWorkspace.overviewAria")}>
                <div className="message-storage-total">
                  <span>{t("storageWorkspace.totalStorage")}</span>
                  <strong>{formatFileSize(storageUsage.totals.logicalVisibleBytes)}</strong>
                  <small>
                    {t("storageWorkspace.filesCount", { count: storageUsage.totals.logicalItemCount })}
                  </small>
                </div>

                <div className="message-storage-category-grid">
                  {storageUsage.categories.map((category) => (
                    <article key={category.key}>
                      <span
                        className={`message-storage-category-icon ${category.key.toLowerCase()}`}
                        aria-hidden="true"
                      >
                        {category.label.slice(0, 1)}
                      </span>
                      <div>
                        <strong>
                          {t(`storageWorkspace.categories.${category.key.toLowerCase()}`)}
                        </strong>
                        <small>
                          {t("storageWorkspace.itemsCount", { count: category.itemCount })}
                        </small>
                      </div>
                      <b>{formatFileSize(category.logicalBytes)}</b>
                    </article>
                  ))}
                </div>
              </section>

              {storageUsage.scope === "USER" && (
                <section className="message-storage-section">
                  <header>
                    <h3>{t("storageWorkspace.chats")}</h3>
                    <small>{t("storageWorkspace.chatsWithFiles", { count: storageUsage.storageByConversation.length })}</small>
                  </header>
                  {storageUsage.storageByConversation.length === 0 ? (
                    <p className="message-storage-empty">{t("storageWorkspace.noChatFiles")}</p>
                  ) : (
                    <div className="message-storage-conversation-list">
                      {storageUsage.storageByConversation.map((item) => (
                        <button
                          key={item.conversationId}
                          type="button"
                          onClick={() =>
                            openStorageUsage({
                              kind: "CONVERSATION",
                              conversationId: item.conversationId,
                            })
                          }
                        >
                          <span className="message-storage-conversation-avatar">
                            {(item.conversationTitle ?? t("storageWorkspace.conversationFallback"))
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                          <span>
                            <strong>
                              {item.conversationTitle ??
                                (item.conversationType === "GROUP"
                                  ? t("storageWorkspace.groupChat")
                                  : t("storageWorkspace.privateChat"))}
                            </strong>
                            <small>
                              {t("storageWorkspace.filesCount", { count: item.itemCount })}
                            </small>
                          </span>
                          <b>{formatFileSize(item.logicalBytes)}</b>
                          <span className="message-storage-row-chevron" aria-hidden="true">›</span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}

              <section className="message-storage-section message-storage-largest-section">
                <header>
                  <h3>{t("storageWorkspace.largeFiles")}</h3>
                  <small>{t("storageWorkspace.largestFirst")}</small>
                </header>

                {storageUsage.largestFiles.length === 0 ? (
                  <p className="message-storage-empty">{t("storageWorkspace.noFiles")}</p>
                ) : (
                  <div className="message-storage-file-list">
                    {storageUsage.largestFiles.map((file) => {
                      const actionPending =
                        storageUsageActionId?.endsWith(file.attachmentId) ?? false;
                      const deleteConfirmation =
                        storageDeleteConfirmation?.attachmentId === file.attachmentId
                          ? storageDeleteConfirmation
                          : null;

                      return (
                        <article key={file.attachmentId}>
                          <span
                            className={`message-storage-file-type ${file.contentType.toLowerCase()}`}
                            aria-hidden="true"
                          >
                            {file.contentType === "FILE" ? "DOC" : file.contentType.slice(0, 3)}
                          </span>
                          <div className="message-storage-file-copy">
                            <div>
                              <strong title={file.originalFileName}>{file.originalFileName}</strong>
                              <b>{formatFileSize(file.fileSizeBytes)}</b>
                            </div>
                            <small>
                              {storageUsage.scope === "USER" &&
                                `${file.conversationTitle ?? t("storageWorkspace.conversationFallback")} · `}
                              {file.sender.displayName} · {formatConversationTime(file.sentAt)}
                            </small>
                          </div>
                          <div className="message-storage-file-actions">
                            <button
                              type="button"
                              onClick={() => void openStorageOriginalMessage(file)}
                              disabled={actionPending}
                            >
                              {t("storageWorkspace.open")}
                            </button>

                            {deleteConfirmation ? (
                              <div className="message-storage-inline-confirmation" role="status">
                                <span>
                                  {deleteConfirmation.mode === "EVERYONE"
                                    ? t("storageWorkspace.deleteForEveryone")
                                    : t("storageWorkspace.deleteForYou")}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setStorageDeleteConfirmation(null)}
                                  disabled={actionPending}
                                >
                                  {t("storageWorkspace.cancel")}
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() =>
                                    void handleStorageFileDelete(file, deleteConfirmation.mode)
                                  }
                                  disabled={actionPending}
                                >
                                  {t("storageWorkspace.delete")}
                                </button>
                              </div>
                            ) : (
                              <>
                                {file.canDeleteForMe && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setStorageDeleteConfirmation({
                                        attachmentId: file.attachmentId,
                                        mode: "ME",
                                      })
                                    }
                                    disabled={actionPending}
                                  >
                                    {t("storageWorkspace.deleteForMeAction")}
                                  </button>
                                )}
                                {file.canDeleteForEveryone && (
                                  <button
                                    type="button"
                                    className="danger"
                                    onClick={() =>
                                      setStorageDeleteConfirmation({
                                        attachmentId: file.attachmentId,
                                        mode: "EVERYONE",
                                      })
                                    }
                                    disabled={actionPending}
                                  >
                                    {t("storageWorkspace.deleteForEveryoneAction")}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <footer className="message-storage-privacy-note">
                <MessageNavigationIcon name="official" />
                <span>{t("storageWorkspace.accessNote")}</span>
              </footer>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <main
      className={`message-app-shell${navigationExpanded ? " navigation-expanded" : ""}${announcementComposerOpen || announcementDetailOpen ? " announcement-workspace-active" : ""} theme-${customizationToken(resolvedMessagingTheme)} accent-blue wallpaper-${customizationToken(messagingCustomization.wallpaper)} density-${customizationToken(messagingCustomization.density)}${messagingCustomization.reduceMotion ? " motion-reduced" : ""}`}
    >
      <header
        className="message-app-topbar"
        onClickCapture={handleNavigationClickCapture}
      >
        <div className="message-rail-brand-row">
          <div className="message-brand-lockup">
            <button
              type="button"
              className="message-app-brand"
              onClick={() => navigate("/messages")}
              aria-label={t("brand.open")}
            >
              <span className="message-app-logo">
                <img src="/nt-logo.png" alt={t("brand.organization")} />
              </span>
            </button>

            <span
              className="message-brand-text"
              aria-hidden={!navigationExpanded}
            >
              <strong>NT Message</strong>
              <small>{t("brand.organization").toUpperCase()}</small>
            </span>
          </div>

          <button
            type="button"
            className="message-rail-toggle"
            onClick={() => setNavigationExpanded((current) => !current)}
            aria-expanded={navigationExpanded}
            aria-label={
              navigationExpanded ? t("navigation.collapse") : t("navigation.expand")
            }
            title={
              navigationExpanded ? t("navigation.collapse") : t("navigation.expand")
            }
          >
            <span aria-hidden="true">{navigationExpanded ? "‹" : "›"}</span>
          </button>
        </div>

        <nav
          className="message-rail-navigation"
          aria-label={t("navigation.sectionsAria")}
        >
          <button
            type="button"
            className={
              !announcementMode &&
                !starredMode &&
                !archivedMode &&
                !requestMode &&
                !notificationMode &&
                !settingsMode &&
                !ownProfileMode &&
                !createGroupMode &&
                (newConversationMode ||
                  listWorkspaceMode ||
                  (conversationCategory === "ALL" &&
                    (conversationListView === "ACTIVE" ||
                      conversationListView === "FAVORITES")))
                ? "active"
                : ""
            }
            onClick={() => {
              navigate("/messages");
              setConversationCategory("ALL");
              setConversationListView("ACTIVE");
            }}
            aria-label={t("navigation.chats")}
            title={navigationExpanded ? undefined : t("navigation.chats")}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="chats" />
            </span>
            <span className="message-rail-label">{t("navigation.chats")}</span>
          </button>

          <button
            type="button"
            className={announcementMode ? "active" : ""}
            onClick={() => navigate("/messages/announcements")}
            aria-label={t("navigation.officialAnnouncements")}
            title={navigationExpanded ? undefined : t("navigation.officialAnnouncements")}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="announcement" />
            </span>
            <span className="message-rail-label">{t("navigation.announcements")}</span>
          </button>

          <button
            type="button"
            className={requestMode ? "active" : ""}
            onClick={() => openMessageRequests("RECEIVED")}
            aria-label={t("navigation.messageRequests")}
            title={navigationExpanded ? undefined : t("navigation.messageRequests")}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="requests" />
            </span>
            <span className="message-rail-label">{t("navigation.messageRequests")}</span>
            {messageRequests.counts.receivedPending > 0 && (
              <b>{messageRequests.counts.receivedPending}</b>
            )}
          </button>

          <button
            type="button"
            className={
              !announcementMode &&
                !starredMode &&
                !archivedMode &&
                !requestMode &&
                !notificationMode &&
                !settingsMode &&
                !ownProfileMode &&
                !listWorkspaceMode &&
                (createGroupMode ||
                  ((conversationCategory === "GROUPS" ||
                    conversationCategory === "OFFICIAL") &&
                    conversationListView === "ACTIVE"))
                ? "active"
                : ""
            }
            onClick={() => {
              navigate("/messages");
              setConversationCategory("GROUPS");
              setConversationListView("ACTIVE");
            }}
            aria-label={t("navigation.groups")}
            title={navigationExpanded ? undefined : t("navigation.groups")}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="groups" />
            </span>
            <span className="message-rail-label">{t("navigation.groups")}</span>
          </button>

          <button
            type="button"
            className={starredMode ? "active" : ""}
            onClick={() => navigate("/messages/starred")}
            aria-label={t("navigation.starredMessages")}
            title={navigationExpanded ? undefined : t("navigation.starredMessages")}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="starred" />
            </span>
            <span className="message-rail-label">{t("navigation.starredMessages")}</span>
          </button>

          <button
            type="button"
            className={archivedMode ? "active" : ""}
            onClick={() => {
              navigate("/messages/archived");
              setConversationCategory("ALL");
              setConversationListView("ARCHIVED");
            }}
            aria-label={t("navigation.archivedConversations")}
            title={navigationExpanded ? undefined : t("navigation.archived")}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="archive" />
            </span>
            <span className="message-rail-label">{t("navigation.archived")}</span>
          </button>

        </nav>

        <div className="message-app-account">
          <button
            type="button"
            className={`message-profile-topbar-button${ownProfileMode || profileAccountId === account?.id ? " active" : ""}`}
            onClick={() => openProfile(account?.id)}
            title={navigationExpanded ? undefined : t("navigation.myProfile")}
          >
            {account ? (
              renderIdentityAvatar(
                account.id,
                account.displayName,
                "message-profile-rail-avatar",
              )
            ) : (
              <span className="message-profile-rail-avatar" aria-hidden="true">
                NT
              </span>
            )}
            <span className="message-profile-rail-copy">
              <strong>{account?.displayName ?? t("profile.userFallback")}</strong>
              <small>{account ? roleLabel(account.role, t) : t("profile.employee")}</small>
            </span>
          </button>

          <button
            type="button"
            className={`message-settings-button${settingsMode ? " active" : ""}`}
            onClick={() => openSettingsWorkspace()}
            aria-current={settingsMode ? "page" : undefined}
            title={navigationExpanded ? undefined : t("navigation.settings")}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="settings" />
            </span>
            <span className="message-rail-label">{t("navigation.settings")}</span>
          </button>

          <button
            type="button"
            className={`message-notification-button${notificationMode ? " active" : ""}`}
            onClick={openNotificationsWorkspace}
            aria-current={notificationMode ? "page" : undefined}
            aria-label={t("navigation.openNotifications")}
            title={navigationExpanded ? undefined : t("navigation.notifications")}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="bell" />
            </span>
            <span className="message-rail-label">{t("navigation.notifications")}</span>
            {notificationUnreadCount > 0 && (
              <b>
                {notificationUnreadCount > 99
                  ? "99+"
                  : notificationUnreadCount}
              </b>
            )}
          </button>

          <button
            type="button"
            className="message-workspace-return"
            onClick={() => navigate(mainWorkspacePath)}
            title={navigationExpanded ? undefined : t("navigation.backToMainWorkspace")}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="workspace" />
            </span>
            <span className="message-rail-label">{t("navigation.backToWorkspace")}</span>
          </button>

          <button
            type="button"
            className="message-app-logout"
            onClick={handleLogout}
            disabled={loggingOut}
            title={navigationExpanded ? undefined : t("navigation.signOut")}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="logout" />
            </span>
            <span className="message-rail-label">
              {loggingOut ? t("navigation.signingOut") : t("navigation.signOut")}
            </span>
          </button>
        </div>
      </header>

      {navigationExpanded && (
        <button
          type="button"
          className="message-rail-scrim"
          onClick={() => setNavigationExpanded(false)}
          aria-label={t("navigation.closeMessagingNavigation")}
        />
      )}

      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {realtimeLabel}
      </div>

      {conversationHistoryToast && (
        <div
          className="message-conversation-history-toast"
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true">✓</span>
          <strong>{conversationHistoryToast}</strong>
          <button
            type="button"
            onClick={() => setConversationHistoryToast(null)}
            aria-label={t("actions.dismissConversationAction")}
          >
            ×
          </button>
        </div>
      )}

      {notificationToast && (
        <>
          <span
            className="sr-only"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {notificationToast.title}. {messagingSettings.notificationPreview
              ? notificationToast.body
              : t("notification.openToView")}
          </span>
          <button
            type="button"
            className="message-notification-toast"
            onClick={() => void handleNotificationClick(notificationToast)}
          >
            <strong>{notificationToast.title}</strong>
            <span>
              {messagingSettings.notificationPreview
                ? notificationToast.body
                : t("notification.openToView")}
            </span>
          </button>
        </>
      )}

      {mobileMessageActionMessage && (
        <div
          className="message-mobile-actions-backdrop"
          data-message-mobile-actions
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              closeTransientMessagePopups();
            }
          }}
        >
          {renderFloatingMessageActionMenu(
            mobileMessageActionMessage,
            "MOBILE_SHEET",
          )}
        </div>
      )}

      {reactionMenuMessage &&
        reactionMenuPosition &&
        renderFloatingReactionMenu(reactionMenuMessage)}

      {messageActionMenuMessage &&
        messageActionMenuAnchor &&
        renderFloatingMessageActionMenu(messageActionMenuMessage)}

      <section
        className={`message-workspace${workspaceDetailOpen ? " conversation-open" : ""
          }${(detailsPanelOpen || searchPanelOpen) &&
            selectedConversation &&
            !ownProfileMode &&
            !newConversationMode &&
            !createGroupMode &&
            !privateGroupDialogOpen
            ? " details-open"
            : ""
          }${createGroupMode ? " create-group-open" : ""}${listWorkspaceMode ? " list-workspace-open" : ""}${listManagementMode ? " list-management-open" : ""}${ownProfileMode ? " profile-workspace-open" : ""}${settingsMode ? " settings-workspace-open" : ""}${notificationMode ? " notification-workspace-open" : ""}`}
      >
        {/* Create Group owns the full workspace so form instructions and status
            are not duplicated in the conversation sidebar. */}
        {!createGroupMode &&
          !ownProfileMode &&
          !settingsMode &&
          !notificationMode &&
          !listManagementMode && (
          <aside className="message-sidebar">
            <div className="message-sidebar-heading">
              <button
                type="button"
                className="message-mobile-menu-button"
                onClick={() => setNavigationExpanded(true)}
                aria-label={t("navigation.openMessagingNavigation")}
                title={t("navigation.openNavigation")}
              >
                <span aria-hidden="true">☰</span>
              </button>

              <div>
                <span>{t("sidebar.eyebrow")}</span>
                <h1>{sidebarTitle}</h1>
              </div>

              {notificationMode ||
                ownProfileMode ||
                newConversationMode ||
                createGroupMode ||
                listCreateMode ||
                listEditMode ? (
                <button
                  type="button"
                  className="message-sidebar-back-action"
                  onClick={() => navigate("/messages")}
                  aria-label={t("navigation.backToChats")}
                  title={t("navigation.backToChats")}
                >
                  ←
                </button>
              ) : listMode ? (
                <div className="message-sidebar-actions">
                  <button
                    type="button"
                    onClick={openSelectedListManager}
                    aria-label={t("sidebar.manageNamedList", { name: selectedChatFolder?.name ?? t("sidebar.thisList") })}
                    title={t("sidebar.manageList")}
                  >
                    <MessageNavigationIcon name="edit" />
                  </button>
                </div>
              ) : !announcementMode &&
                !starredMode &&
                !archivedMode &&
                !requestMode &&
                !settingsMode &&
                !listWorkspaceMode ? (
                <div className="message-sidebar-actions">
                  <button
                    type="button"
                    className="message-group-new-button"
                    onClick={openCreateGroup}
                    aria-label={t("sidebar.newGroupAria")}
                    title={t("sidebar.newGroup")}
                  >
                    <MessageNavigationIcon name="newGroup" />
                  </button>

                  <button
                    type="button"
                    className="message-new-button"
                    onClick={openNewConversation}
                    aria-label={t("sidebar.newConversationAria")}
                    title={t("sidebar.newConversation")}
                  >
                    <MessageNavigationIcon name="newChat" />
                  </button>
                </div>
              ) : null}
            </div>

            {!settingsMode &&
              !ownProfileMode &&
              !createGroupMode &&
              !listManagementMode && (
              <label className="message-conversation-search">
                <span className="sr-only">
                  {newConversationMode
                    ? t("search.eligibleAccountsAria")
                    : announcementMode
                      ? t("search.officialGroups")
                      : requestMode
                        ? t("search.messageRequests")
                        : starredMode
                          ? t("search.starredMessages")
                          : archivedMode
                            ? t("search.archivedConversations")
                            : notificationMode
                              ? t("search.notifications")
                              : listMode
                                ? t("search.inList", { name: selectedChatFolder?.name ?? t("sidebar.thisList") })
                                : t("search.chats")}
                </span>
                <span
                  className="message-conversation-search-icon"
                  aria-hidden="true"
                >
                  <MessageNavigationIcon name="search" />
                </span>
                <input
                  ref={newConversationMode ? undefined : conversationSearchInputRef}
                  type="text"
                  inputMode="search"
                  autoComplete="off"
                  value={newConversationMode ? contactSearch : conversationSearch}
                  onChange={(event) =>
                    newConversationMode
                      ? setContactSearch(event.target.value)
                      : setConversationSearch(event.target.value)
                  }
                  onKeyDown={
                    newConversationMode ? undefined : handleConversationSearchKeyDown
                  }
                  aria-keyshortcuts={
                    newConversationMode ? undefined : "Control+K Meta+K"
                  }
                  placeholder={
                    newConversationMode
                      ? t("search.people")
                      : announcementMode
                        ? t("search.officialGroups")
                        : requestMode
                          ? t("search.messageRequests")
                          : starredMode
                            ? t("search.starredMessages")
                            : archivedMode
                              ? t("search.archivedConversations")
                              : notificationMode
                                ? t("search.notifications")
                                : listMode
                                  ? t("search.inList", { name: selectedChatFolder?.name ?? t("sidebar.thisList") })
                                  : t("search.chats")
                  }
                  autoFocus={newConversationMode}
                />
                {(newConversationMode ? contactSearch : conversationSearch) && (
                  <button
                    type="button"
                    className="message-conversation-search-clear"
                    onClick={() =>
                      newConversationMode
                        ? setContactSearch("")
                        : setConversationSearch("")
                    }
                    aria-label={t("search.clear")}
                    title={t("search.clear")}
                  >
                    ×
                  </button>
                )}
              </label>
            )}

            {settingsMode ? (
              <nav
                className="message-settings-workspace-navigation"
                aria-label={t("messageSettings.sectionsAria")}
              >
                {SETTINGS_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    id={`message-settings-nav-${tab.value.toLowerCase()}`}
                    type="button"
                    className={settingsTab === tab.value ? "active" : ""}
                    aria-current={settingsTab === tab.value ? "page" : undefined}
                    onClick={() => setSettingsTab(tab.value)}
                  >
                    <span>{t(tab.labelKey)}</span>
                    <span aria-hidden="true">›</span>
                  </button>
                ))}
              </nav>
            ) : ownProfileMode ? (
              <div className="message-profile-sidebar-summary">
                <div className="message-profile-sidebar-avatar">
                  {profilePhotoUrl ? (
                    <img src={profilePhotoUrl} alt="" />
                  ) : (
                    initials(profileData?.displayName ?? account?.displayName ?? "NT")
                  )}
                </div>
                <div>
                  <strong>
                    {profileData?.displayName ?? account?.displayName ?? t("profile.myProfile")}
                  </strong>
                  <span>
                    {profileData
                      ? roleLabel(profileData.role, t)
                      : account
                        ? roleLabel(account.role, t)
                        : t("profile.account")}
                  </span>
                </div>
                <p>{t("profileSidebar.description")}</p>
              </div>
            ) : createGroupMode ? (
              <div className="message-create-flow-sidebar">
                <span className="message-create-flow-sidebar-icon" aria-hidden="true">
                  <MessageNavigationIcon name="newGroup" />
                </span>
                <strong>{t("groupCreate.sidebarTitle")}</strong>
                <p>
                  {t("groupCreate.sidebarDescription")}
                </p>
                <dl>
                  <div>
                    <dt>{t("groupCreateWorkspace.groupType")}</dt>
                    <dd>{groupKind === "OFFICIAL" ? t("groupCreateWorkspace.official") : t("groupCreateWorkspace.personal")}</dd>
                  </div>
                  <div>
                    <dt>{t("groupCreateWorkspace.members")}</dt>
                    <dd>
                      {groupKind === "OFFICIAL"
                        ? t("groupCreate.automatic")
                        : groupSelectedAccountIds.length}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : newConversationMode ? null : notificationMode ? (
              <div
                className="message-conversation-category-tabs"
                aria-label={t("filters.notificationFiltersAria")}
              >
                <button
                  type="button"
                  className={notificationListView === "ALL" ? "active" : ""}
                  onClick={() => setNotificationListView("ALL")}
                >
                  {t("filters.all")}
                </button>
                <button
                  type="button"
                  className={notificationListView === "UNREAD" ? "active" : ""}
                  onClick={() => setNotificationListView("UNREAD")}
                >
                  {t("filters.unread")}{notificationUnreadCount > 0 ? ` ${notificationUnreadCount}` : ""}
                </button>
              </div>
            ) : requestMode ? (
              <div
                className="message-conversation-category-tabs"
                aria-label={t("filters.requestFiltersAria")}
              >
                <button
                  type="button"
                  className={requestListView === "RECEIVED" ? "active" : ""}
                  onClick={() => {
                    setRequestListView("RECEIVED");
                    setSelectedRequestId(null);
                  }}
                >
                  {t("filters.received")}
                  {messageRequests.counts.receivedPending > 0
                    ? ` ${messageRequests.counts.receivedPending}`
                    : ""}
                </button>
                <button
                  type="button"
                  className={requestListView === "SENT" ? "active" : ""}
                  onClick={() => {
                    setRequestListView("SENT");
                    setSelectedRequestId(null);
                  }}
                >
                  {t("filters.sent")}
                  {messageRequests.counts.sentPending > 0
                    ? ` ${messageRequests.counts.sentPending}`
                    : ""}
                </button>
              </div>
            ) : !announcementMode &&
              !starredMode &&
              !archivedMode &&
              !listManagementMode ? (
              <div
                className="message-conversation-filter-strip"
                aria-label={
                  conversationCategory === "GROUPS" ||
                  conversationCategory === "OFFICIAL"
                    ? t("filters.groupFiltersAria")
                    : t("filters.conversationFiltersAria")
                }
              >
                {conversationCategory === "GROUPS" ||
                conversationCategory === "OFFICIAL" ? (
                  <>
                    <button
                      type="button"
                      className={conversationCategory === "GROUPS" ? "active" : ""}
                      onClick={() => {
                        navigate("/messages");
                        setConversationCategory("GROUPS");
                        setConversationListView("ACTIVE");
                      }}
                    >
                      {t("filters.personal")}
                    </button>
                    <button
                      type="button"
                      className={conversationCategory === "OFFICIAL" ? "active" : ""}
                      onClick={() => {
                        navigate("/messages");
                        setConversationCategory("OFFICIAL");
                        setConversationListView("ACTIVE");
                      }}
                    >
                      {t("filters.official")}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={
                        !listMode &&
                        conversationCategory === "ALL" &&
                        conversationListView === "ACTIVE"
                          ? "active"
                          : ""
                      }
                      onClick={() => {
                        navigate("/messages");
                        setConversationCategory("ALL");
                        setConversationListView("ACTIVE");
                      }}
                    >
                      {t("filters.all")}
                    </button>
                    <button
                      type="button"
                      className={
                        !listMode &&
                        conversationCategory === "UNREAD" &&
                        conversationListView === "ACTIVE"
                          ? "active"
                          : ""
                      }
                      onClick={() => {
                        navigate("/messages");
                        setConversationCategory("UNREAD");
                        setConversationListView("ACTIVE");
                      }}
                    >
                      {t("filters.unread")}{totalUnread > 0 ? ` ${totalUnread}` : ""}
                    </button>
                    <button
                      type="button"
                      className={
                        !listMode && conversationListView === "FAVORITES"
                          ? "active"
                          : ""
                      }
                      onClick={() => {
                        navigate("/messages");
                        setConversationCategory("ALL");
                        setConversationListView("FAVORITES");
                      }}
                    >
                      {t("filters.favorites")}
                    </button>

                    <span className="message-filter-divider" aria-hidden="true" />
                    <span className="message-list-filter-label">{t("filters.myLists")}</span>

                    {chatFoldersLoading ? (
                      <span className="message-filter-loading" role="status">
                        <span className="message-small-spinner" aria-hidden="true" />
                        <span className="sr-only">{t("loading.lists")}</span>
                      </span>
                    ) : chatFoldersError ? (
                      <button
                        type="button"
                        className="message-filter-retry"
                        onClick={() => void loadChatFolders()}
                        title={chatFoldersError}
                      >
                        {t("filters.retryLists")}
                      </button>
                    ) : (
                      chatFolders.map((folder) => {
                        const conversationCount = folder.items.filter(
                          (item) => item.conversationId,
                        ).length;

                        return (
                          <button
                            key={folder.id}
                            type="button"
                            className={selectedListId === folder.id ? "active" : ""}
                            onClick={() => openChatFolder(folder.id)}
                            aria-current={selectedListId === folder.id ? "page" : undefined}
                            title={t("filters.listCountTitle", { name: folder.name, total: conversationCount })}
                          >
                            {folder.name}
                          </button>
                        );
                      })
                    )}

                    <button
                      type="button"
                      className="message-filter-create-list"
                      onClick={openCreateList}
                      aria-label={t("filters.createListAria")}
                      title={t("filters.createList")}
                    >
                      <span aria-hidden="true">＋</span>
                    </button>
                  </>
                )}
              </div>
            ) : null}

            <div className="message-sidebar-summary">
              {settingsMode ? (
                <>
                  <span>{t("summary.sections", { total: SETTINGS_TABS.length })}</span>
                  <span>{t("summary.accountPreferences")}</span>
                </>
              ) : notificationMode ? (
                <>
                  <span>{t("summary.notifications", { total: filteredNotifications.length })}</span>
                  <span>{t("summary.unread", { total: notificationUnreadCount })}</span>
                </>
              ) : announcementMode ? (
                <>
                  <span>{t("summary.officialGroups", { total: announcementGroupSearchResults.length })}</span>
                  <span>{t("summary.announcements")}</span>
                </>
              ) : starredMode ? (
                <>
                  <span>
                    {starredHasMore
                      ? t("summary.loaded", { total: filteredStarredItems.length })
                      : t("summary.starred", { total: filteredStarredItems.length })}
                  </span>
                  <span>
                    {conversationSearch.trim()
                      ? t("summary.search")
                      : starredHasMore
                        ? t("summary.moreAvailable")
                        : t("summary.personal")}
                  </span>
                </>
              ) : archivedMode ? (
                <>
                  <span>
                    {conversationHasMore
                      ? t("summary.loaded", { total: filteredConversations.length })
                      : t("summary.archived", { total: filteredConversations.length })}
                  </span>
                  <span>
                    {conversationSearch.trim()
                      ? t("summary.search")
                      : conversationHasMore
                        ? t("summary.moreAvailable")
                        : t("summary.conversationsLabel")}
                  </span>
                </>
              ) : requestMode ? (
                <>
                  <span>{t("summary.requests", { total: filteredRequestItems.length })}</span>
                  <span>
                    {requestListView === "RECEIVED"
                      ? t("filters.received")
                      : t("filters.sent")}
                  </span>
                </>
              ) : listCreateMode ? (
                <>
                  <span>{t("summary.selected", { total: listSelectedConversationIds.length })}</span>
                  <span>{t("summary.createList")}</span>
                </>
              ) : listMode ? (
                <>
                  <span>
                    {conversationHasMore
                      ? t("summary.loaded", { total: filteredConversations.length })
                      : t("summary.conversations", { total: filteredConversations.length })}
                  </span>
                  <span>
                    {conversationHasMore
                      ? t("summary.moreAvailable")
                      : t("summary.unread", { total: totalUnread })}
                  </span>
                </>
              ) : conversationSearch.trim() ? (
                <>
                  <span>{t("summary.results", { total: conversationSearchResultCount })}</span>
                  <span>{t("summary.search")}</span>
                </>
              ) : (
                <>
                  <span>
                    {conversationHasMore
                      ? t("summary.loaded", { total: filteredConversations.length })
                      : t("summary.conversations", { total: filteredConversations.length })}
                  </span>
                  <span>
                    {conversationHasMore
                      ? t("summary.moreAvailable")
                      : t("summary.unread", { total: totalUnread })}
                  </span>
                </>
              )}
            </div>

            {notificationMode && (
              <div className="message-notification-sidebar-actions">
                <button
                  type="button"
                  onClick={() => void handleMarkAllNotificationsRead()}
                  disabled={
                    notificationUnreadCount === 0 ||
                    notificationBulkAction !== null ||
                    notificationDeletingId !== null
                  }
                >
                  {notificationBulkAction === "MARK_ALL_READ"
                    ? t("actions.marking")
                    : t("actions.markAllRead")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteReadNotifications()}
                  disabled={
                    notificationBulkAction !== null ||
                    notificationDeletingId !== null ||
                    !notifications.some((notification) => notification.isRead)
                  }
                >
                  {notificationBulkAction === "DELETE_READ"
                    ? t("actions.removing")
                    : t("actions.removeSeen")}
                </button>
                <button
                  type="button"
                  onClick={() => openSettingsWorkspace("NOTIFICATIONS")}
                >
                  {t("actions.settings")}
                </button>
              </div>
            )}

            {requestNotice && (
              <div
                className="message-inline-notice"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <span>{requestNotice}</span>
                <button
                  type="button"
                  onClick={() => setRequestNotice(null)}
                  aria-label={t("actions.dismissRequestNotice")}
                >
                  ×
                </button>
              </div>
            )}

            {!starredMode &&
              !requestMode &&
              !notificationMode &&
              !settingsMode &&
              !ownProfileMode &&
              !newConversationMode &&
              !createGroupMode &&
              pageError && (
                <div className="message-inline-error" role="alert">
                  <p>{pageError}</p>
                  <button type="button" onClick={() => void loadConversations()}>
                    {t("actions.retry")}
                  </button>
                </div>
              )}

            <div
              ref={conversationListRef}
              className={`message-conversation-list${(newConversationMode ? contactSearch : conversationSearch).trim()
                ? " search-results"
                : ""
                }${newConversationMode ? " contact-workspace-list" : ""}`}
              aria-busy={
                settingsMode || ownProfileMode || createGroupMode
                  ? false
                  : newConversationMode
                    ? contactsLoading
                    : notificationMode
                      ? notificationsLoading
                      : announcementMode
                        ? conversationLoading
                        : starredMode
                          ? starredLoading
                          : requestMode
                            ? requestsLoading
                            : conversationLoading
              }
              onKeyDown={
                newConversationMode ? undefined : handleConversationListKeyDown
              }
            >
              {(settingsMode || ownProfileMode || createGroupMode
                ? false
                : newConversationMode
                  ? contactsLoading
                  : notificationMode
                    ? notificationsLoading
                    : announcementMode
                      ? conversationLoading
                      : starredMode
                        ? starredLoading
                        : requestMode
                          ? requestsLoading
                          : conversationLoading) ? (
                <div
                  className="message-list-state"
                  role="status"
                  aria-live="polite"
                >
                  <span className="message-small-spinner" aria-hidden="true" />
                  <p>
                    {newConversationMode
                      ? t("loading.eligibleAccounts")
                      : notificationMode
                        ? t("loading.notifications")
                        : announcementMode
                          ? t("loading.officialGroups")
                          : starredMode
                            ? t("loading.starredMessages")
                            : requestMode
                              ? t("loading.messageRequests")
                              : t("loading.conversations")}
                  </p>
                </div>
              ) : settingsMode ? (
                <div className="message-settings-sidebar-note">
                  <span aria-hidden="true">⚙</span>
                  <strong>{t(
                    SETTINGS_TABS.find((tab) => tab.value === settingsTab)?.labelKey ??
                      "messageSettings.tabs.privacy",
                  )}</strong>
                  <p>{t("settingsSidebar.description")}</p>
                </div>
              ) : ownProfileMode ? (
                <div className="message-profile-sidebar-note">
                  <strong>{t("profileSidebar.title")}</strong>
                  <p>{t("profileSidebar.description")}</p>
                </div>
              ) : createGroupMode ? (
                <div className="message-create-flow-sidebar-note">
                  <strong>
                    {groupKind === "OFFICIAL"
                      ? t("groupCreate.officialMembership")
                      : t("groupCreate.personalMembership")}
                  </strong>
                  <p>
                    {groupKind === "OFFICIAL"
                      ? t("groupCreate.officialMembershipDescription")
                      : groupSelectedAccountIds.length === 0
                        ? t("groupCreate.chooseMemberDescription")
                        : t("groupCreate.selectedMembers", { total: groupSelectedAccountIds.length })}
                  </p>
                </div>
              ) : newConversationMode ? (
                contactError ? (
                  <div className="message-list-state compact danger" role="alert">
                    <div className="message-empty-icon" aria-hidden="true">!</div>
                    <h2>{t("newConversation.peopleUnavailable")}</h2>
                    <p>{contactError}</p>
                  </div>
                ) : contacts.length === 0 ? (
                  <div className="message-list-state compact" role="status">
                    <div className="message-empty-icon" aria-hidden="true">+</div>
                    <h2>{t("newConversation.none")}</h2>
                    <p>{t("newConversation.emptyHint")}</p>
                  </div>
                ) : (
                  contacts.map((contact) => (
                    <article key={contact.accountId} className="message-contact-workspace-row">
                      <div className="message-contact-workspace-open">
                        {renderAccountAvatar(contact)}
                        <span>
                          <strong>{contact.displayName}</strong>
                          <small>
                            {contact.employee?.designation ?? roleLabel(contact.role, t)}
                          </small>
                          <em>
                            {contact.employee?.department?.name ??
                              contact.employee?.division?.name ??
                              contact.username ??
                              roleLabel(contact.role, t)}
                          </em>
                        </span>
                      </div>
                      <button
                        type="button"
                        className="message-contact-workspace-action"
                        onClick={() => void handleCreateConversation(contact)}
                        disabled={
                          creatingConversationId !== null ||
                          contact.contactMode === "REQUEST_SENT" ||
                          contact.contactMode === "BLOCKED"
                        }
                      >
                        {creatingConversationId === contact.accountId
                          ? t("actions.opening")
                          : contactActionLabel(contact, t)}
                      </button>
                    </article>
                  ))
                )
              ) : notificationMode ? (
                notificationError ? (
                  <div className="message-list-state compact danger" role="alert">
                    <div className="message-empty-icon" aria-hidden="true">!</div>
                    <h2>{t("notification.unavailable")}</h2>
                    <p>{notificationError}</p>
                  </div>
                ) : filteredNotifications.length === 0 ? (
                  <div className="message-list-state compact" role="status">
                    <div className="message-empty-icon" aria-hidden="true">N</div>
                    <h2>
                      {conversationSearch.trim()
                        ? t("notification.noMatching")
                        : notificationListView === "UNREAD"
                          ? t("notification.noUnread")
                          : t("notification.noneYet")}
                    </h2>
                    <p>
                      {conversationSearch.trim()
                        ? t("notification.searchHint")
                        : t("notification.emptyHint")}
                    </p>
                  </div>
                ) : (
                  <div className="message-notification-workspace-list">
                    {filteredNotifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`message-notification-row${notification.isRead ? "" : " unread"}`}
                      >
                        <button
                          type="button"
                          className="message-notification-open"
                          onClick={() => void handleNotificationClick(notification)}
                        >
                          <span>
                            <strong>{notification.title}</strong>
                            <small>
                              {messagingSettings.notificationPreview
                                ? notification.body
                                : t("notification.previewHidden")}
                            </small>
                          </span>
                          <em>{notificationTimestampLabel(notification.createdAt)}</em>
                        </button>
                        <button
                          type="button"
                          className="message-notification-delete"
                          aria-label={t("actions.removeNotificationAria", { title: notification.title })}
                          onClick={() => void handleDeleteNotification(notification)}
                          disabled={
                            notificationBulkAction !== null ||
                            notificationDeletingId !== null
                          }
                          aria-busy={notificationDeletingId === notification.id}
                        >
                          {notificationDeletingId === notification.id ? "…" : "×"}
                        </button>
                      </div>
                    ))}
                  </div>
                )
              ) : announcementMode ? (
                announcementGroupSearchResults.length === 0 ? (
                  <div className="message-list-state compact" role="status">
                    <div className="message-empty-icon" aria-hidden="true">
                      A
                    </div>
                    <h2>{t("announcements.noGroups")}</h2>
                    <p>{t("announcements.noGroupsHint")}</p>
                  </div>
                ) : (
                  announcementGroupSearchResults.map(renderAnnouncementGroupRow)
                )
              ) : starredMode ? (
                starredError ? (
                  <div className="message-list-state compact danger" role="alert">
                    <div className="message-empty-icon" aria-hidden="true">
                      !
                    </div>
                    <h2>{t("starred.unavailable")}</h2>
                    <p>{starredError}</p>
                    <button type="button" onClick={() => void loadStarredMessages()}>
                      {t("actions.tryAgain")}
                    </button>
                  </div>
                ) : filteredStarredItems.length === 0 ? (
                  <>
                    <div className="message-list-state compact" role="status">
                      <div className="message-empty-icon" aria-hidden="true">
                        ★
                      </div>
                      <h2>
                        {conversationSearch.trim()
                          ? t("starred.noMatchingLoaded")
                          : t("starred.noneYet")}
                      </h2>
                      <p>
                        {conversationSearch.trim()
                          ? starredHasMore
                            ? t("starred.loadMoreOrSearch")
                            : t("starred.searchHint")
                          : t("starred.emptyHint")}
                      </p>
                    </div>
                    {starredHasMore ? (
                      <button
                        type="button"
                        className="message-conversation-load-more"
                        onClick={() => void loadMoreStarredMessages()}
                        disabled={starredLoadingMore}
                      >
                        {starredLoadingMore
                          ? t("starred.loadingOlder")
                          : t("starred.loadMore")}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="message-starred-workspace-list">
                      {filteredStarredItems.map(renderStarredMessageRow)}
                    </div>
                    {starredHasMore ? (
                      <button
                        type="button"
                        className="message-conversation-load-more"
                        onClick={() => void loadMoreStarredMessages()}
                        disabled={starredLoadingMore}
                      >
                        {starredLoadingMore
                          ? t("starred.loadingOlder")
                          : t("starred.loadMore")}
                      </button>
                    ) : null}
                  </>
                )
              ) : requestMode ? (
                requestError ? (
                  <div className="message-list-state compact danger" role="alert">
                    <div className="message-empty-icon" aria-hidden="true">
                      !
                    </div>
                    <h2>{t("requests.unavailable")}</h2>
                    <p>{requestError}</p>
                    <button type="button" onClick={() => void loadMessageRequests()}>
                      {t("actions.tryAgain")}
                    </button>
                  </div>
                ) : filteredRequestItems.length === 0 ? (
                  <div className="message-list-state compact" role="status">
                    <div className="message-empty-icon" aria-hidden="true">
                      {requestListView === "RECEIVED" ? "↓" : "↑"}
                    </div>
                    <h2>
                      {conversationSearch.trim()
                        ? t("requests.noMatching")
                        : requestListView === "RECEIVED"
                          ? t("requests.noReceived")
                          : t("requests.noSent")}
                    </h2>
                    <p>
                      {conversationSearch.trim()
                        ? t("requests.searchHint")
                        : requestListView === "RECEIVED"
                          ? t("requests.receivedHint")
                          : t("requests.sentHint")}
                    </p>
                  </div>
                ) : (
                  filteredRequestItems.map(renderMessageRequestRow)
                )
              ) : conversationSearch.trim() ? (
                conversationSearchResultCount === 0 ? (
                  <div className="message-list-state compact" role="status">
                    <div className="message-empty-icon" aria-hidden="true">
                      ⌕
                    </div>
                    <h2>{t("conversationSearch.none")}</h2>
                    <p>{t("conversationSearch.hint")}</p>
                  </div>
                ) : (
                  <div className="message-conversation-search-results">
                    {conversationSearchResults.directChats.length > 0 && (
                      <section className="message-search-result-section">
                        <h2>{t("conversationSearch.chats")}</h2>
                        <div className="message-search-result-list">
                          {conversationSearchResults.directChats.map(
                            renderConversationRow,
                          )}
                        </div>
                      </section>
                    )}

                    {conversationSearchResults.groupsInCommon.length > 0 && (
                      <section className="message-search-result-section">
                        <h2>{t("conversationSearch.groupsInCommon")}</h2>
                        <div className="message-search-result-list">
                          {conversationSearchResults.groupsInCommon.map(
                            renderGroupSearchResult,
                          )}
                        </div>
                      </section>
                    )}
                  </div>
                )
              ) : filteredConversations.length === 0 ? (
                <div className="message-list-state" role="status">
                  <div className="message-empty-icon" aria-hidden="true">
                    {listMode ? "L" : "M"}
                  </div>
                  <h2>
                    {listMode
                      ? t("conversationList.noneInList")
                      : archivedMode
                        ? t("conversationList.noneArchived")
                        : t("conversationList.noneFound")}
                  </h2>
                  <p>
                    {listMode
                      ? t("conversationList.listHint")
                      : archivedMode
                        ? t("conversationList.archivedHint")
                        : t("conversationList.emptyHint")}
                  </p>
                  {conversationHasMore
                    ? renderConversationLoadMoreControl()
                    : !archivedMode && (
                        <button
                          type="button"
                          onClick={
                            listMode ? openSelectedListManager : openNewConversation
                          }
                        >
                          {listMode ? t("conversationList.manageList") : t("conversationList.newConversation")}
                        </button>
                      )}
                </div>
              ) : (
                <>
                  {filteredConversations.map(renderConversationRow)}
                  {renderConversationLoadMoreControl()}
                </>
              )}
            </div>
          </aside>
        )}

        <section className="message-chat-panel">
          {realtimeStatus !== "CONNECTED" && (
            <div
              className={`message-realtime-state ${realtimeStatus.toLowerCase()}`}
            >
              <span
                className="message-realtime-state-indicator"
                aria-hidden="true"
              />
              <div>
                <strong>
                  {realtimeStatus === "RECONNECTING"
                    ? t("realtime.reconnecting")
                    : realtimeStatus === "CONNECTING"
                      ? t("realtime.connecting")
                      : t("realtime.offline")}
                </strong>
                <small>
                  {realtimeStatus === "DISCONNECTED"
                    ? t("realtime.disconnectedHint")
                    : t("realtime.restoringHint")}
                </small>
              </div>
            </div>
          )}

          {storageUsageScope ? (
            renderStorageUsageWorkspaceContent()
          ) : ownProfileMode ? (
            <div className="message-profile-workspace">
              <header className="message-profile-workspace-header">
                <button
                  type="button"
                  className="message-mobile-back"
                  onClick={() => navigate("/messages")}
                  aria-label={t("thread.header.backToConversations")}
                >
                  ←
                </button>
                <div>
                  <span>{t("profile.myProfile")}</span>
                  <h2>{t("profileWorkspace.title")}</h2>
                  <p>
                    {t("profileWorkspace.description")}
                  </p>
                </div>
                <button
                  type="button"
                  className="message-workspace-close-action"
                  onClick={() => navigate("/messages")}
                >
                  {t("navigation.backToChats")}
                </button>
              </header>
              <div className="message-profile-workspace-scroll">
                {renderProfileContent()}
              </div>
            </div>
          ) : createGroupMode ? (
            renderCreateGroupWorkspaceContent()
          ) : (
              listCreateMode ||
              (listMode && (!selectedChatFolder || listEditMode))
            ) && !selectedConversation ? (
            renderMessageListWorkspaceContent()
          ) : groupManagementWorkspaceOpen &&
            selectedConversation?.type === "GROUP" ? (
            renderGroupManagementWorkspaceContent()
          ) : privateGroupDialogOpen &&
            selectedConversation?.type === "PRIVATE" ? (
            renderPrivateGroupWorkspaceContent()
          ) : newConversationMode ? (
            <div className="message-new-conversation-workspace">
              <div className="message-collection-welcome-state">
                <span className="message-collection-welcome-icon" aria-hidden="true">
                  <MessageNavigationIcon name="newChat" />
                </span>
                <h2>{t("newConversationWorkspace.title")}</h2>
                <p>
                  {t("newConversationWorkspace.description")}
                </p>
                <small>
                  {t("newConversationWorkspace.rulesNote")}
                </small>
              </div>
            </div>
          ) : settingsMode ? (
            <div className="message-settings-workspace">
              <header className="message-settings-workspace-header">
                <button
                  type="button"
                  className="message-mobile-back"
                  onClick={() => navigate("/messages")}
                  aria-label={t("messageSettings.backToMessages")}
                >
                  ←
                </button>
                <div>
                  <span>{t("messageSettings.eyebrow")}</span>
                  <h2 className="message-settings-desktop-title">
                    {t("messageSettings.title")}
                  </h2>
                  <h2 className="message-settings-mobile-title">{t("messageSettings.mobileTitle")}</h2>
                  <p>{t("messageSettings.description")}</p>
                </div>
                <button
                  type="button"
                  className="message-workspace-close-action"
                  onClick={() => navigate("/messages")}
                >
                  {t("navigation.backToChats")}
                </button>
              </header>

              <div className="message-settings-workspace-layout">
              <div
                className="message-settings-workspace-mobile-tabs"
                role="tablist"
                aria-label={t("messageSettings.sectionsAria")}
              >
                {SETTINGS_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    id={`message-settings-mobile-tab-${tab.value.toLowerCase()}`}
                    type="button"
                    role="tab"
                    className={settingsTab === tab.value ? "active" : ""}
                    aria-selected={settingsTab === tab.value}
                    aria-controls="message-settings-tabpanel"
                    onClick={(event) => {
                      setSettingsTab(tab.value);
                      // Keep the selected chip in view on narrow screens without moving the page vertically.
                      event.currentTarget.scrollIntoView({
                        behavior: "smooth",
                        block: "nearest",
                        inline: "center",
                      });
                    }}
                  >
                    {t(tab.labelKey)}
                  </button>
                ))}
              </div>

              <div
                id="message-settings-tabpanel"
                className="message-settings-body"
                role="tabpanel"
                aria-labelledby={`message-settings-mobile-tab-${settingsTab.toLowerCase()}`}
                tabIndex={0}
              >
                {settingsTab === "PRIVACY" && (
                  <section className="message-settings-section">
                    {messagingSettingsLoading && (
                      <p className="message-settings-note">
                        {t("messageSettings.privacy.loading")}
                      </p>
                    )}

                    <label className="message-settings-toggle">
                      <span>
                        <strong>{t("messageSettings.privacy.onlineStatus")}</strong>
                        <small>
                          {t("messageSettings.privacy.onlineStatusDescription")}
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        checked={messagingSettings.showOnlineStatus}
                        onChange={(event) =>
                          updateMessagingSettings({
                            showOnlineStatus: event.target.checked,
                          })
                        }
                        disabled={
                          messagingSettingsLoading || messagingSettingsSaving
                        }
                      />
                    </label>

                    <label className="message-settings-toggle">
                      <span>
                        <strong>{t("messageSettings.privacy.readReceipts")}</strong>
                        <small>
                          {t("messageSettings.privacy.readReceiptsDescription")}
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        checked={messagingSettings.showReadReceipts}
                        onChange={(event) =>
                          updateMessagingSettings({
                            showReadReceipts: event.target.checked,
                          })
                        }
                        disabled={
                          messagingSettingsLoading || messagingSettingsSaving
                        }
                      />
                    </label>

                    <label className="message-settings-toggle">
                      <span>
                        <strong>{t("messageSettings.privacy.messageRequests")}</strong>
                        <small>
                          {t("messageSettings.privacy.messageRequestsDescription")}
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        checked={messagingSettings.requireMessageRequests}
                        onChange={(event) =>
                          updateMessagingSettings({
                            requireMessageRequests: event.target.checked,
                          })
                        }
                        disabled={
                          messagingSettingsLoading || messagingSettingsSaving
                        }
                      />
                    </label>

                    {messagingSettingsSaving && (
                      <p className="message-settings-note" role="status">
                        {t("messageSettings.privacy.saving")}
                      </p>
                    )}

                    {messagingSettingsNotice && (
                      <p className="message-settings-success" role="status">
                        {messagingSettingsNotice}
                      </p>
                    )}

                    {messagingSettingsError && (
                      <p className="message-settings-danger-note" role="alert">
                        {messagingSettingsError}
                      </p>
                    )}

                    <div className="message-settings-actions">
                      <button
                        type="button"
                        onClick={resetPrivacySettings}
                        disabled={
                          messagingSettingsLoading || messagingSettingsSaving
                        }
                      >
                        {t("messageSettings.privacy.restoreDefaults")}
                      </button>
                    </div>

                    <p className="message-settings-note">
                      {t("messageSettings.privacy.accountScope")}
                    </p>
                  </section>
                )}

                {settingsTab === "NOTIFICATIONS" && (
                  <section className="message-settings-section">
                    <label className="message-settings-toggle">
                      <span>
                        <strong>{t("messageSettings.notifications.sound")}</strong>
                        <small>
                          {t("messageSettings.notifications.soundDescription")}
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        checked={notificationSoundEnabled}
                        onChange={(event) =>
                          setNotificationSoundEnabled(event.target.checked)
                        }
                        disabled={messagingSettings.muteAllNotifications}
                      />
                    </label>

                    <label className="message-settings-toggle">
                      <span>
                        <strong>{t("messageSettings.notifications.browser")}</strong>
                        <small>
                          {t("messageSettings.notifications.browserDescription")}
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        checked={browserNotificationsEnabled}
                        onChange={() =>
                          void handleBrowserNotificationToggle()
                        }
                        disabled={messagingSettings.muteAllNotifications}
                      />
                    </label>

                    <p className="message-settings-note">
                      {t("messageSettings.notifications.browserPermission")}{" "}
                      <strong>{browserNotificationPermissionLabel(t)}</strong>.
                      {browserNotificationsEnabled && (
                        <>
                          {" "}{t("messageSettings.notifications.backgroundDelivery")}{" "}
                          <strong>
                            {backgroundPushReady
                              ? t("messageSettings.notifications.ready")
                              : t("messageSettings.notifications.connecting")}
                          </strong>.
                        </>
                      )}
                      {t("messageSettings.notifications.browserPermissionNote")}
                    </p>

                    <label className="message-settings-toggle">
                      <span>
                        <strong>{t("messageSettings.notifications.preview")}</strong>
                        <small>
                          {t("messageSettings.notifications.previewDescription")}
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        checked={messagingSettings.notificationPreview}
                        onChange={(event) =>
                          updateMessagingSettings({
                            notificationPreview: event.target.checked,
                          })
                        }
                      />
                    </label>

                    <label className="message-settings-toggle">
                      <span>
                        <strong>{t("messageSettings.notifications.mutePopups")}</strong>
                        <small>
                          {t("messageSettings.notifications.mutePopupsDescription")}
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        checked={messagingSettings.muteAllNotifications}
                        onChange={(event) =>
                          updateMessagingSettings({
                            muteAllNotifications: event.target.checked,
                          })
                        }
                      />
                    </label>

                    {messagingSettingsNotice && (
                      <p className="message-settings-success" role="status">
                        {messagingSettingsNotice}
                      </p>
                    )}

                    {messagingSettingsError && (
                      <p className="message-settings-danger-note" role="alert">
                        {messagingSettingsError}
                      </p>
                    )}

                    <div className="message-settings-actions">
                      <button
                        type="button"
                        onClick={resetNotificationSettings}
                      >
                        {t("messageSettings.notifications.restoreDefaults")}
                      </button>
                    </div>

                    <p className="message-settings-note">
                      {t("messageSettings.notifications.deviceScopeNote")}
                    </p>
                  </section>
                )}

                {settingsTab === "APPEARANCE" && (
                  <section className="message-settings-section">
                    <label className="message-customization-field">
                      <span>{t("messageSettings.appearance.theme")}</span>
                      <select
                        value={messagingCustomization.theme}
                        onChange={(event) =>
                          updateMessagingCustomization({
                            theme: event.target.value as MessagingTheme,
                          })
                        }
                      >
                        {THEME_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {t(`messageSettings.appearance.themeOptions.${option.value.toLowerCase()}`)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="message-customization-field">
                      <span>{t("messageSettings.appearance.wallpaper")}</span>
                      <select
                        value={messagingCustomization.wallpaper}
                        onChange={(event) =>
                          updateMessagingCustomization({
                            wallpaper: event.target.value as MessagingWallpaper,
                          })
                        }
                      >
                        {WALLPAPER_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {t(`messageSettings.appearance.wallpaperOptions.${option.value.toLowerCase()}`)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="message-customization-field">
                      <span>{t("messageSettings.appearance.density")}</span>
                      <select
                        value={messagingCustomization.density}
                        onChange={(event) =>
                          updateMessagingCustomization({
                            density: event.target.value as MessagingDensity,
                          })
                        }
                      >
                        {DENSITY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {t(`messageSettings.appearance.densityOptions.${option.value.toLowerCase()}`)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="message-settings-toggle">
                      <span>
                        <strong>{t("messageSettings.appearance.reduceMotion")}</strong>
                        <small>
                          {t("messageSettings.appearance.reduceMotionDescription")}
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        checked={messagingCustomization.reduceMotion}
                        onChange={(event) =>
                          updateMessagingCustomization({
                            reduceMotion: event.target.checked,
                          })
                        }
                      />
                    </label>

                    <div className="message-settings-actions">
                      <button
                        type="button"
                        onClick={resetMessagingCustomization}
                      >
                        {t("messageSettings.appearance.restoreDefaults")}
                      </button>
                    </div>

                    <p className="message-settings-note">
                      {t("messageSettings.appearance.scopeNote")}
                    </p>
                  </section>
                )}

                {settingsTab === "STORAGE" && (
                  <section className="message-settings-section message-settings-storage-section">
                    <button
                      type="button"
                      className="message-settings-storage-open"
                      onClick={() => openStorageUsage({ kind: "USER" })}
                    >
                      <MessageNavigationIcon name="storage" />
                      <span>
                        <strong>{t("messageSettings.storage.manage")}</strong>
                        <small>{t("messageSettings.storage.description")}</small>
                      </span>
                    </button>

                    <p className="message-settings-note">
                      {t("messageSettings.storage.accessNote")}
                    </p>
                  </section>
                )}

                {settingsTab === "BLOCKED" && (
                  <section className="message-settings-section">
                    <div className="message-settings-summary">
                      <strong>{blockedAccounts.length}</strong>
                      <span>
                        {t("messageSettings.blocked.count", { count: blockedAccounts.length })}
                      </span>
                    </div>

                    {blockSettingsNotice && (
                      <p className="message-settings-success">
                        {blockSettingsNotice}
                      </p>
                    )}

                    {blockSettingsError && (
                      <p className="message-settings-danger-note">
                        {blockSettingsError}
                      </p>
                    )}

                    {blockedAccountsLoading ? (
                      <p className="message-settings-empty">
                        {t("messageSettings.blocked.loading")}
                      </p>
                    ) : blockedAccounts.length === 0 ? (
                      <p className="message-settings-empty">
                        {t("messageSettings.blocked.none")}
                      </p>
                    ) : (
                      <div className="message-settings-blocked-list">
                        {blockedAccounts.map((block) => (
                          <article key={block.blockedAccountId}>
                            {renderAccountAvatar(
                              block.account,
                              "message-avatar small",
                            )}
                            <div>
                              <strong>{block.account.displayName}</strong>
                              <small>
                                {t("messageSettings.blocked.description")}
                              </small>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                void handleUnblockAccount(
                                  block.blockedAccountId,
                                )
                              }
                              disabled={blockActionAccountId !== null}
                            >
                              {blockActionAccountId === block.blockedAccountId
                                ? t("messageSettings.blocked.working")
                                : t("messageSettings.blocked.unblock")}
                            </button>
                          </article>
                        ))}
                      </div>
                    )}

                    {blockedMessageRequests.length > 0 && (
                      <p className="message-settings-note">
                        {t("messageSettings.blocked.oldRequests", { count: blockedMessageRequests.length })}
                      </p>
                    )}

                    <p className="message-settings-note">
                      {t("messageSettings.blocked.scopeNote")}
                    </p>
                  </section>
                )}

                {settingsTab === "SECURITY" && (
                  <section className="message-settings-section">
                    <div className="message-settings-security-card">
                      <span>{t("messageSettings.security.signedInAccount")}</span>
                      <strong>
                        {account?.displayName ?? t("profile.userFallback")}
                      </strong>
                      <small>
                        {account?.positionLabel ??
                          (account
                            ? roleLabel(account.role, t)
                            : t("profile.employee"))}
                        {" "}
                        · {realtimeLabel}
                      </small>
                    </div>

                    {securityNotice && (
                      <p className="message-settings-success" role="status">
                        {securityNotice}
                      </p>
                    )}

                    {securityError && (
                      <p className="message-settings-danger-note" role="alert">
                        {securityError}
                      </p>
                    )}

                    <div className="message-settings-actions">
                      <button
                        type="button"
                        onClick={() => {
                          navigate("/settings/security");
                        }}
                      >
                        {t("messageSettings.security.changePassword")}
                      </button>
                      <button
                        type="button"
                        onClick={handleLogout}
                        disabled={loggingOut || securityAction !== null}
                      >
                        {loggingOut
                          ? t("messageSettings.security.signingOut")
                          : t("messageSettings.security.signOutDevice")}
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => void handleLogoutAllDevices()}
                        disabled={loggingOut || securityAction !== null}
                      >
                        {securityAction === "SIGN_OUT_ALL"
                          ? t("messageSettings.security.signingOutAll")
                          : t("messageSettings.security.signOutAll")}
                      </button>
                    </div>

                    <p className="message-settings-note">
                      {t("messageSettings.security.scopeNote")}
                    </p>
                  </section>
                )}
              </div>
              </div>

            </div>
          ) : notificationMode ? (
            <div className="message-notification-workspace">
              <header className="message-notification-workspace-header">
                <button
                  type="button"
                  className="message-mobile-back"
                  onClick={() => navigate("/messages")}
                  aria-label={t("messageSettings.backToMessages")}
                >
                  ←
                </button>
                <div>
                  <span>{t("notificationWorkspace.eyebrow")}</span>
                  <h2>{t("notificationWorkspace.title")}</h2>
                  <p>{t("notificationWorkspace.description")}</p>
                </div>
                <button
                  type="button"
                  className="message-workspace-close-action"
                  onClick={() => navigate("/messages")}
                >
                  {t("navigation.backToChats")}
                </button>
              </header>

              <div className="message-notification-workspace-body">
              <aside className="message-notification-workspace-list-panel">
                <div className="message-notification-workspace-list-header">
                  <div className="message-notification-workspace-metrics">
                  <article>
                    <span>{t("notificationWorkspace.all")}</span>
                    <strong>{notifications.length}</strong>
                  </article>
                  <article>
                    <span>{t("notificationWorkspace.unread")}</span>
                    <strong>{notificationUnreadCount}</strong>
                  </article>
                </div>

                  <div className="message-notification-workspace-filters" aria-label={t("filters.notificationFiltersAria")}>
                    <button
                      type="button"
                      className={notificationListView === "ALL" ? "active" : ""}
                      onClick={() => setNotificationListView("ALL")}
                    >
                      {t("thread.pinned.all")}
                    </button>
                    <button
                      type="button"
                      className={notificationListView === "UNREAD" ? "active" : ""}
                      onClick={() => setNotificationListView("UNREAD")}
                    >
                      {t("notificationWorkspace.unread")} {notificationUnreadCount > 0 ? notificationUnreadCount : ""}
                    </button>
                  </div>

                  <label className="message-notification-workspace-search">
                    <MessageNavigationIcon name="search" />
                    <input
                      type="search"
                      value={conversationSearch}
                      onChange={(event) => setConversationSearch(event.target.value)}
                      placeholder={t("notificationWorkspace.search")}
                    />
                  </label>

                  <div
                    className="message-notification-mobile-actions"
                    aria-label={t("notificationWorkspace.actionsAria")}
                  >
                    <button
                      type="button"
                      onClick={() => void handleMarkAllNotificationsRead()}
                      disabled={
                        notificationUnreadCount === 0 ||
                        notificationBulkAction !== null ||
                        notificationDeletingId !== null
                      }
                      aria-busy={notificationBulkAction === "MARK_ALL_READ"}
                    >
                      {notificationBulkAction === "MARK_ALL_READ"
                        ? t("actions.marking")
                        : t("actions.markAllRead")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteReadNotifications()}
                      disabled={
                        notificationBulkAction !== null ||
                        notificationDeletingId !== null ||
                        !notifications.some((notification) => notification.isRead)
                      }
                      aria-busy={notificationBulkAction === "DELETE_READ"}
                    >
                      {notificationBulkAction === "DELETE_READ"
                        ? t("actions.removing")
                        : t("actions.removeSeen")}
                    </button>
                    <button
                      type="button"
                      onClick={() => openSettingsWorkspace("NOTIFICATIONS")}
                    >
                      {t("notificationWorkspace.settings")}
                    </button>
                  </div>
                </div>

                {notificationActionNotice && !notificationError && (
                  <div className="message-notification-mobile-feedback">
                    <p className="message-inline-notice" role="status" aria-live="polite">
                      {notificationActionNotice}
                    </p>
                  </div>
                )}

                <div className="message-notification-workspace-list">
                  {notificationsLoading ? (
                    <div className="message-notification-workspace-empty">{t("notificationWorkspace.loading")}</div>
                  ) : notificationError ? (
                    <div className="message-notification-workspace-empty danger">{notificationError}</div>
                  ) : filteredNotifications.length === 0 ? (
                    <div className="message-notification-workspace-empty">
                      {conversationSearch.trim()
                        ? t("notificationWorkspace.noMatching")
                        : notificationListView === "UNREAD"
                          ? t("notificationWorkspace.allCaughtUp")
                          : t("notificationWorkspace.noneYet")}
                    </div>
                  ) : (
                    filteredNotifications.map((notification) => (
                      <article
                        key={notification.id}
                        className={`message-notification-row${notification.isRead ? "" : " unread"}`}
                      >
                        <button
                          type="button"
                          className="message-notification-open"
                          onClick={() => void handleNotificationClick(notification)}
                        >
                          <span>
                            <strong>{notification.title}</strong>
                            <small>
                              {messagingSettings.notificationPreview
                                ? notification.body
                                : t("notification.previewHidden")}
                            </small>
                          </span>
                          <em>{notificationTimestampLabel(notification.createdAt)}</em>
                        </button>
                        <button
                          type="button"
                          className="message-notification-delete"
                          aria-label={t("actions.removeNotificationAria", { title: notification.title })}
                          onClick={() => void handleDeleteNotification(notification)}
                          disabled={notificationBulkAction !== null || notificationDeletingId !== null}
                        >
                          {notificationDeletingId === notification.id ? "…" : "×"}
                        </button>
                      </article>
                    ))
                  )}
                </div>
              </aside>

              <section className="message-notification-workspace-overview">
                <div className="message-notification-workspace-actions">
                  <button
                    type="button"
                    onClick={() => void handleMarkAllNotificationsRead()}
                    disabled={
                      notificationUnreadCount === 0 ||
                      notificationBulkAction !== null ||
                      notificationDeletingId !== null
                    }
                    aria-busy={notificationBulkAction === "MARK_ALL_READ"}
                  >
                    {notificationBulkAction === "MARK_ALL_READ"
                      ? t("actions.marking")
                      : t("actions.markAllRead")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteReadNotifications()}
                    disabled={
                      notificationBulkAction !== null ||
                      notificationDeletingId !== null ||
                      !notifications.some((notification) => notification.isRead)
                    }
                    aria-busy={notificationBulkAction === "DELETE_READ"}
                  >
                    {notificationBulkAction === "DELETE_READ"
                      ? t("actions.removing")
                      : t("actions.removeSeen")}
                  </button>
                  <button
                    type="button"
                    onClick={() => openSettingsWorkspace("NOTIFICATIONS")}
                  >
                    {t("notificationWorkspace.notificationSettings")}
                  </button>
                </div>

                {notificationActionNotice && !notificationError && (
                  <p className="message-inline-notice" role="status" aria-live="polite">
                    {notificationActionNotice}
                  </p>
                )}
                {notificationError && (
                  <p className="message-inline-error" role="alert">
                    {notificationError}
                  </p>
                )}

                <div className="message-notification-workspace-guide">
                  <span aria-hidden="true">N</span>
                  <h3>{t("notificationWorkspace.keepUp")}</h3>
                  <p>{t("notificationWorkspace.keepUpDescription")}</p>
                </div>
              </section>
              </div>
            </div>
          ) : announcementMode ? (
            !selectedConversation ||
              selectedConversation.groupKind !== "OFFICIAL" ? (
              <div className="message-announcement-welcome-state">
                <span className="message-announcement-welcome-icon">
                  <MessageNavigationIcon name="announcement" />
                </span>
                <span>{t("announcementWorkspace.eyebrow")}</span>
                <h2>{t("announcementWorkspace.selectGroup")}</h2>
                <p>{t("announcementWorkspace.audienceNote")}</p>
              </div>
            ) : (
              <div className="message-announcement-group-workspace">
                <header className="message-announcement-workspace-header">
                  <span className="message-avatar-presence large">
                    {renderGroupAvatar(
                      selectedConversation,
                      "message-avatar large",
                    )}
                  </span>
                  <div className="message-announcement-group-heading">
                    <span>{t("announcementWorkspace.eyebrow")}</span>
                    <h2>{selectedConversation.title ?? t("groupInfo.officialGroup")}</h2>
                    <p>{officialScopeLabel(selectedConversation, t)}</p>
                  </div>
                  {canManageSelectedAnnouncementGroup && (
                    <button
                      type="button"
                      className="message-announcement-create-button"
                      onClick={openAnnouncementComposer}
                    >
                      <span aria-hidden="true">+</span>
                      {t("announcementWorkspace.newAnnouncement")}
                    </button>
                  )}
                </header>

                <section
                  className="message-announcement-feed"
                  aria-live="polite"
                  aria-busy={announcementLoading}
                >
                  {announcementComposerNotice && (
                    <div className="message-announcement-notice" role="status">
                      <strong>{t("announcementWorkspace.updated")}</strong>
                      <span>{announcementComposerNotice}</span>
                      <button
                        type="button"
                        onClick={() => setAnnouncementComposerNotice(null)}
                        aria-label={t("announcementWorkspace.dismissStatus")}
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {announcementLoading ? (
                    <div
                      className="message-announcement-feed-state"
                      role="status"
                    >
                      <span
                        className="message-announcement-feed-mark"
                        aria-hidden="true"
                      >
                        <MessageNavigationIcon name="announcement" />
                      </span>
                      <h3>{t("announcementWorkspace.loading")}</h3>
                      <p>
                        {t("announcementWorkspace.loadingDescription")}
                      </p>
                    </div>
                  ) : announcementError ? (
                    <div
                      className="message-announcement-feed-state danger"
                      role="alert"
                    >
                      <span
                        className="message-announcement-feed-mark"
                        aria-hidden="true"
                      >
                        <MessageNavigationIcon name="announcement" />
                      </span>
                      <h3>{t("announcementWorkspace.loadError")}</h3>
                      <p>{announcementError}</p>
                      <button
                        type="button"
                        onClick={() =>
                          void loadSelectedGroupAnnouncements(
                            selectedConversation.id,
                          )
                        }
                      >
                        {t("announcementWorkspace.tryAgain")}
                      </button>
                    </div>
                  ) : announcementItems.length === 0 ? (
                    <div
                      className="message-announcement-feed-state"
                      role="status"
                    >
                      <span
                        className="message-announcement-feed-mark"
                        aria-hidden="true"
                      >
                        <MessageNavigationIcon name="announcement" />
                      </span>
                      <h3>{t("announcementWorkspace.noneYet")}</h3>
                      <p>{t("announcementWorkspace.emptyDescription")}</p>
                      {canManageSelectedAnnouncementGroup && (
                        <button
                          type="button"
                          onClick={openAnnouncementComposer}
                        >
                          {t("announcementWorkspace.createFirst")}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="message-announcement-card-list">
                      {announcementItems.map(renderAnnouncementCard)}
                    </div>
                  )}
                </section>
              </div>
            )
          ) : requestMode ? (
            !selectedMessageRequest ? (
              <div className="message-collection-welcome-state request">
                <span className="message-collection-welcome-icon" aria-hidden="true">
                  <MessageNavigationIcon name="requests" />
                </span>
                <span>{t("requestWorkspace.eyebrow")}</span>
                <h2>{t("requestWorkspace.selectRequest")}</h2>
                <p>{t("requestWorkspace.description")}</p>
                <div className="message-collection-welcome-metrics">
                  <span>
                    <strong>{messageRequests.counts.receivedPending}</strong>
                    {t("requestWorkspace.received")}
                  </span>
                  <span>
                    <strong>{messageRequests.counts.sentPending}</strong>
                    {t("requestWorkspace.sent")}
                  </span>
                </div>
              </div>
            ) : (
              <div className="message-request-detail-workspace">
                <header className="message-request-detail-header">
                  <button
                    type="button"
                    className="message-mobile-back"
                    onClick={() => setSelectedRequestId(null)}
                    aria-label={t("requestWorkspace.back")}
                  >
                    ←
                  </button>
                  <span className="message-avatar-presence large">
                    {renderAccountAvatar(
                      selectedMessageRequest.peer,
                      "message-avatar large",
                    )}
                  </span>
                  <div>
                    <span>
                      {selectedMessageRequest.direction === "RECEIVED"
                        ? t("requestWorkspace.receivedRequest")
                        : t("requestWorkspace.sentRequest")}
                    </span>
                    <h2>{selectedMessageRequest.peer.displayName}</h2>
                    <p>
                      {selectedMessageRequest.peer.employee?.designation ??
                        roleLabel(selectedMessageRequest.peer.role, t)}
                    </p>
                  </div>
                  <strong className="message-request-detail-status">
                    {requestStatusLabel(selectedMessageRequest, t)}
                  </strong>
                </header>

                <section className="message-request-detail-body">
                  {requestError && (
                    <div className="message-inline-error" role="alert">
                      <p>{requestError}</p>
                    </div>
                  )}

                  <div className="message-request-detail-card">
                    <span>{t("requestWorkspace.why")}</span>
                    <h3>{requestReasonLabel(selectedMessageRequest.reason, t)}</h3>
                    <p>{t("requestWorkspace.approvalNote")}</p>
                  </div>

                  <dl className="message-request-detail-facts">
                    <div>
                      <dt>{t("requestWorkspace.requested")}</dt>
                      <dd>
                        {formatAnnouncementDate(
                          selectedMessageRequest.requestedAt,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("requestWorkspace.direction")}</dt>
                      <dd>
                        {selectedMessageRequest.direction === "RECEIVED"
                          ? t("requestWorkspace.receivedByYou")
                          : t("requestWorkspace.sentByYou")}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("requestWorkspace.status")}</dt>
                      <dd>{requestStatusLabel(selectedMessageRequest, t)}</dd>
                    </div>
                  </dl>

                  {selectedMessageRequest.direction === "RECEIVED" &&
                    selectedMessageRequest.status === "PENDING" && (
                      <div className="message-request-detail-actions">
                        <button
                          type="button"
                          className="accept"
                          onClick={() =>
                            void handleAcceptRequest(selectedMessageRequest)
                          }
                          disabled={requestActionId !== null}
                        >
                          {requestActionId === selectedMessageRequest.id
                            ? t("profileDetail.working")
                            : t("requestWorkspace.acceptAndOpen")}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleDeclineRequest(selectedMessageRequest)
                          }
                          disabled={requestActionId !== null}
                        >
                          {t("requestWorkspace.decline")}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() =>
                            void handleBlockRequest(selectedMessageRequest)
                          }
                          disabled={requestActionId !== null}
                        >
                          {t("requestWorkspace.block")}
                        </button>
                      </div>
                    )}
                </section>
              </div>
            )
          ) : listMode && !selectedConversation ? (
            renderMessageListOverviewContent()
          ) : archivedMode && !selectedConversation ? (
            <div className="message-collection-welcome-state">
              <span className="message-collection-welcome-icon" aria-hidden="true">
                <MessageNavigationIcon name="archive" />
              </span>
              <h2>{t("secondaryEmpty.archivedTitle")}</h2>
              <p>{t("secondaryEmpty.archivedDescription")}</p>
            </div>
          ) : starredMode && !selectedConversation ? (
            <div className="message-collection-welcome-state starred">
              <span className="message-collection-welcome-icon" aria-hidden="true">
                <MessageNavigationIcon name="starred" />
              </span>
              <span>{t("secondaryEmpty.starredEyebrow")}</span>
              <h2>{t("secondaryEmpty.starredTitle")}</h2>
              <p>{t("starred.openOriginalDescription")}</p>
              <small>{t("starred.personalNote")}</small>
            </div>
          ) : !selectedConversation ? (
            <div className="message-welcome-state">
              <div className="message-welcome-brand" aria-hidden="true">
                <img src="/nt-logo.png" alt="" />
              </div>
              <span>NT Message</span>
              <h2>{t("secondaryEmpty.secureTitle")}</h2>
              <p>{t("newConversationWorkspace.welcomeDescription")}</p>
              <div className="message-welcome-actions">
                <button type="button" onClick={openNewConversation}>
                  <MessageNavigationIcon name="newChat" />
                  {t("newConversationWorkspace.newConversation")}
                </button>
                <button type="button" onClick={openCreateGroup}>
                  <MessageNavigationIcon name="newGroup" />
                  {t("newConversationWorkspace.newGroup")}
                </button>
              </div>
              <small>
                {t("newConversationWorkspace.privacyNote")}
              </small>
            </div>
          ) : (
            <>
              <header className="message-chat-header">
                <button
                  type="button"
                  className="message-mobile-menu-button message-mobile-menu-button--chat"
                  onClick={() => setNavigationExpanded(true)}
                  aria-label={t("navigation.openMessagingNavigation")}
                >
                  <span aria-hidden="true">☰</span>
                </button>

                <button
                  type="button"
                  className="message-mobile-back"
                  onClick={() => setSelectedConversationId(null)}
                  aria-label={t("thread.header.backToConversations")}
                >
                  ←
                </button>

                <span className="message-avatar-presence large">
                  {selectedConversation.type === "PRIVATE" && peer ? (
                    renderAccountAvatar(peer, "message-avatar large")
                  ) : selectedConversation.type === "GROUP" ? (
                    renderGroupAvatar(
                      selectedConversation,
                      "message-avatar large",
                    )
                  ) : (
                    <span className="message-avatar large">
                      {initials(selectedConversation.title ?? "NT")}
                    </span>
                  )}

                  {peer?.showOnlineStatus !== false &&
                    selectedConversation.type === "PRIVATE" &&
                    peerPresence?.isOnline && (
                      <span
                        className="message-presence-dot"
                        aria-label={t("thread.header.onlineAria", {
                          name: selectedConversation.title ?? t("thread.header.contactFallback"),
                        })}
                      />
                    )}
                </span>

                <div className="message-chat-identity">
                  <h2>
                    {selectedConversation.title ?? t("thread.header.privateConversation")}
                  </h2>
                  <p>
                    {selectedConversation.type === "GROUP"
                      ? selectedConversation.groupKind === "OFFICIAL"
                        ? officialScopeLabel(selectedConversation, t)
                        : t("thread.header.personalGroupMembers", {
                            count: selectedConversation.memberCount,
                          })
                      : [
                        peer?.employee?.designation ??
                        roleLabel(peer?.role ?? "EMPLOYEE", t),
                        peer?.employee?.department?.name ??
                        peer?.employee?.division?.name,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                  </p>
                  <small
                    className={`message-peer-activity${typingParticipants.length > 0
                      ? " typing"
                      : peer?.showOnlineStatus !== false &&
                        peerPresence?.isOnline
                        ? " online"
                        : ""
                      }`}
                    aria-live="polite"
                  >
                    {peerActivityLabel}
                  </small>
                </div>

                <div
                  className="message-chat-header-actions"
                  aria-label={t("thread.header.conversationActions")}
                >
                  <button
                    ref={messageSearchTriggerRef}
                    type="button"
                    className={searchPanelOpen ? "active" : ""}
                    onClick={() => openMessageSearchPanel()}
                    aria-expanded={searchPanelOpen}
                    aria-label={t("thread.header.searchConversation")}
                  >
                    <MessageNavigationIcon name="search" />
                  </button>

                  <button
                    type="button"
                    className={`message-chat-info-action${detailsPanelOpen ? " active" : ""
                      }`}
                    onClick={() => {
                      closeMessageSearchPanel();

                      if (detailsPanelOpen) {
                        closeConversationDetailsPanel();
                      } else if (selectedConversation.type === "GROUP") {
                        openGroupInformation();
                      } else if (peer) {
                        openProfile(peer.accountId);
                      }
                    }}
                    aria-expanded={detailsPanelOpen}
                    aria-label={t("thread.header.openInformation")}
                  >
                    <MessageNavigationIcon name="info" />
                  </button>

                  <div className="message-conversation-menu-anchor">
                    <button
                      ref={conversationActionButtonRef}
                      type="button"
                      className={conversationActionMenuOpen ? "active" : ""}
                      onClick={() =>
                        setConversationActionMenuOpen((current) => !current)
                      }
                      aria-haspopup="menu"
                      aria-expanded={conversationActionMenuOpen}
                      aria-label={t("thread.header.moreActions")}
                    >
                      <MessageNavigationIcon name="more" />
                    </button>

                    {conversationActionMenuOpen && (
                      <div
                        ref={conversationActionMenuRef}
                        className="message-conversation-action-menu compact"
                        role="menu"
                        aria-label={t("thread.header.conversationActions")}
                        onKeyDown={(event) =>
                          handleLinearKeyboardNavigation(event, "VERTICAL")
                        }
                      >
                        {conversationActionMenuView === "MUTE" ? (
                          <>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() =>
                                setConversationActionMenuView("ROOT")
                              }
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
                                disabled={
                                  conversationPreferenceLoading ===
                                  selectedConversation.id
                                }
                                onClick={() => {
                                  setConversationActionMenuOpen(false);
                                  void changeConversationMute(
                                    selectedConversation,
                                    value,
                                  );
                                }}
                              >
                                <MessageNavigationIcon name="bell" />
                                <span>{label}</span>
                              </button>
                            ))}
                          </>
                        ) : (
                          <>
                            {(selectedConversation.type === "PRIVATE" ||
                              selectedConversation.canManageGroup) && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setConversationActionMenuOpen(false);
                                    if (selectedConversation.type === "PRIVATE") {
                                      openPrivateGroupDialog();
                                    } else {
                                      openManageGroup();
                                    }
                                  }}
                                >
                                  <MessageNavigationIcon name="addUser" />
                                  <span>
                                    {selectedConversation.type === "PRIVATE"
                                      ? t("thread.header.addMember")
                                      : t("thread.header.manageGroupMembers")}
                                  </span>
                                </button>
                              )}

                            <button
                              type="button"
                              role="menuitem"
                              disabled={
                                conversationPreferenceLoading ===
                                selectedConversation.id
                              }
                              onClick={() => {
                                setConversationActionMenuOpen(false);
                                void toggleConversationFavorite(
                                  selectedConversation,
                                );
                              }}
                            >
                              <MessageNavigationIcon name="starred" />
                              <span>
                                {selectedConversation.isFavorite
                                  ? t("thread.header.removeFavorite")
                                  : t("thread.header.addFavorite")}
                              </span>
                            </button>

                            {selectedConversation.isMuted ? (
                              <button
                                type="button"
                                role="menuitem"
                                disabled={
                                  conversationPreferenceLoading ===
                                  selectedConversation.id
                                }
                                onClick={() => {
                                  setConversationActionMenuOpen(false);
                                  void changeConversationMute(
                                    selectedConversation,
                                    "OFF",
                                  );
                                }}
                              >
                                <MessageNavigationIcon name="bell" />
                                <span>{t("thread.header.unmuteNotifications")}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() =>
                                  setConversationActionMenuView("MUTE")
                                }
                              >
                                <MessageNavigationIcon name="bell" />
                                <span>{t("thread.header.muteNotificationsMore")}</span>
                              </button>
                            )}

                            {peer && (
                              <button
                                type="button"
                                role="menuitem"
                                disabled={blockActionAccountId !== null}
                                onClick={() => {
                                  setConversationActionMenuOpen(false);

                                  if (blockedAccountIds.has(peer.accountId)) {
                                    void handleUnblockAccount(peer.accountId);
                                  } else {
                                    openDestructiveConfirmation({
                                      kind: "BLOCK_PRIVATE_CONTACT",
                                      target: peer,
                                    });
                                  }
                                }}
                              >
                                <MessageNavigationIcon name="block" />
                                <span>
                                  {blockedAccountIds.has(peer.accountId)
                                    ? t("conversationList.unblockContact")
                                    : t("conversationList.blockContact")}
                                </span>
                              </button>
                            )}

                            <button
                              type="button"
                              role="menuitem"
                              onClick={closeActiveConversation}
                            >
                              <MessageNavigationIcon name="close" />
                              <span>{t("thread.header.closeConversation")}</span>
                            </button>

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
                                  selectedConversation.id,
                                )
                              }
                            >
                              <MessageNavigationIcon name="close" />
                              <span>{t("thread.header.clearChat")}</span>
                            </button>

                            {selectedConversation.type === "PRIVATE" && (
                              <button
                                type="button"
                                role="menuitem"
                                className="message-conversation-history-action destructive"
                                onClick={() =>
                                  openConversationHistoryConfirmation(
                                    "DELETE",
                                    selectedConversation.id,
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
                  </div>
                </div>
              </header>

              {messageError && (
                <div className="message-chat-error" role="alert">
                  <span>{messageError}</span>
                  <button
                    type="button"
                    onClick={() => setMessageError(null)}
                    aria-label={t("thread.dismissError")}
                  >
                    ×
                  </button>
                </div>
              )}

              {messageNotice && (
                <div
                  className="message-action-toast"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <span className="message-action-toast-icon" aria-hidden="true">
                    i
                  </span>
                  <span>{messageNotice}</span>
                </div>
              )}

              {inviteJoinLoading && (
                <div
                  className="message-chat-notice"
                  role="status"
                  aria-live="polite"
                >
                  <span>{t("privateGroup.joiningInvite")}</span>
                </div>
              )}

              {activePinnedMessage && (
                <section
                  className="message-pinned-strip"
                  aria-label={t("thread.pinned.aria")}
                >
                  <button
                    type="button"
                    className="message-pinned-strip-main"
                    onClick={() => focusPinnedMessage(activePinnedMessage)}
                  >
                    <span
                      className="message-pinned-strip-icon"
                      aria-hidden="true"
                    >
                      📌
                    </span>
                    <span className="message-pinned-strip-copy">
                      <strong>
                        {activePinnedMessage.sender.displayName}: {" "}
                        {localizedAttachmentLabel(activePinnedMessage)}
                      </strong>
                      <small>
                        {t("pinnedBrowser.position", {
                          current: normalizedPinnedMessageIndex + 1,
                          total: visiblePinnedMessages.length,
                        })}
                      </small>
                    </span>
                  </button>

                  <div className="message-pinned-strip-actions">
                    <button
                      type="button"
                      onClick={() => movePinnedMessageSelection(-1)}
                      disabled={visiblePinnedMessages.length < 2}
                      aria-label={t("thread.pinned.previous")}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={() => movePinnedMessageSelection(1)}
                      disabled={visiblePinnedMessages.length < 2}
                      aria-label={t("thread.pinned.next")}
                    >
                      ›
                    </button>
                    <button
                      type="button"
                      className="message-pinned-strip-browse"
                      onClick={() => setPinnedMessageBrowserOpen(true)}
                    >
                      {t("thread.pinned.all")}
                    </button>
                  </div>
                </section>
              )}

              <div className="message-thread-shell">
                <div
                  className="message-thread"
                  ref={messageListRef}
                  onScroll={handleMessageThreadScroll}
                  onWheelCapture={releaseInitialMessageBottomAnchor}
                  onTouchStartCapture={releaseInitialMessageBottomAnchor}
                  onPointerDownCapture={releaseInitialMessageBottomAnchor}
                  onKeyDownCapture={releaseInitialMessageBottomAnchor}
                  aria-busy={messageLoading || olderMessagesLoading}
                >
                  <div
                    ref={messageThreadContentRef}
                    className="message-thread-content"
                  >
                    {!messageLoading && displayMessages.length > 0 && (
                      <div
                        className="message-thread-spacer"
                        aria-hidden="true"
                      />
                    )}

                    {hasOlderMessages && (
                      <button
                        type="button"
                        className="message-load-older"
                        onClick={() => void handleLoadOlderMessages()}
                        disabled={olderMessagesLoading}
                      >
                        {olderMessagesLoading
                          ? t("thread.loadingOlder")
                          : t("thread.loadOlder")}
                      </button>
                    )}

                    {messageLoading ? (
                      <div
                        className="message-thread-state"
                        role="status"
                        aria-live="polite"
                      >
                        <span
                          className="message-small-spinner"
                          aria-hidden="true"
                        />
                        <p>{t("thread.loadingMessages")}</p>
                      </div>
                    ) : messages.length === 0 ? (
                      <div
                        className={`message-thread-state${selectedConversation.historyClearedAt
                          ? " cleared-history"
                          : ""
                          }`}
                        role="status"
                      >
                        <div className="message-empty-icon">
                          {selectedConversation.historyClearedAt ? "✓" : "Hi"}
                        </div>
                        <h3>
                          {selectedConversation.historyClearedAt
                            ? t("thread.clearedTitle")
                            : t("thread.startTitle")}
                        </h3>
                        <p>
                          {selectedConversation.historyClearedAt
                            ? t("thread.clearedDescription")
                            : t("thread.startDescription", { name: selectedConversation.title })}
                        </p>
                      </div>
                    ) : (
                      displayMessages.map((message, index) => {
                        const ownMessage =
                          message.senderAccountId === account?.id;
                        const officialAnnouncement =
                          getOfficialAnnouncementPayload(message, t);
                        const previousMessage = displayMessages[index - 1];
                        const nextMessage = displayMessages[index + 1];
                        const showDaySeparator =
                          !previousMessage ||
                          !isSameCalendarDay(
                            previousMessage.sentAt,
                            message.sentAt,
                          );
                        const groupedWithPrevious =
                          messagesBelongToSameVisualGroup(
                            previousMessage,
                            message,
                          );
                        const groupedWithNext = messagesBelongToSameVisualGroup(
                          message,
                          nextMessage,
                        );
                        const showSenderName =
                          selectedConversation.type === "GROUP" &&
                          !ownMessage &&
                          !groupedWithPrevious;
                        const deliveryPresentation = ownMessage
                          ? messageDeliveryPresentation(message.deliveryStatus)
                          : null;
                        const hasAttachments =
                          (message.attachments?.length ?? 0) > 0;
                        const isLocationMessage =
                          message.contentType === "LOCATION";
                        const attachmentOnlyMessage =
                          !message.isDeleted &&
                          !message.replyTo &&
                          !message.forwardedFrom &&
                          !officialAnnouncement &&
                          (isLocationMessage ||
                            (!message.textContent && hasAttachments));
                        const simpleTextMessage =
                          !message.isDeleted &&
                          !message.replyTo &&
                          !message.forwardedFrom &&
                          !officialAnnouncement &&
                          !isLocationMessage &&
                          !hasAttachments &&
                          Boolean(message.textContent?.trim());
                        const messageMeta = (
                          <span
                            className={`message-bubble-meta${
                              attachmentOnlyMessage ? "" : " inside-bubble"
                            }`}
                          >
                            {!message.isDeleted &&
                              (message.isPinned || message.isStarred) && (
                                <span
                                  className="message-state-icons"
                                  aria-label={[
                                    message.isPinned ? t("thread.message.pinned") : null,
                                    message.isStarred ? t("thread.message.starred") : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" and ")}
                                >
                                  {message.isPinned && (
                                    <span
                                      className="message-state-icon is-pinned"
                                      title={t("thread.message.pinned")}
                                    >
                                      <MessageStatusGlyph name="pin" />
                                    </span>
                                  )}
                                  {message.isStarred && (
                                    <span
                                      className="message-state-icon is-starred"
                                      title={t("thread.message.starred")}
                                    >
                                      <MessageStatusGlyph name="star" />
                                    </span>
                                  )}
                                </span>
                              )}

                            <time>{formatMessageTime(message.sentAt)}</time>

                            {message.editedAt && !message.isDeleted && (
                              <span>{t("thread.message.edited")}</span>
                            )}

                            {deliveryPresentation && (
                              <span
                                className={`message-delivery ${message.deliveryStatus.toLowerCase()}`}
                                aria-label={deliveryPresentation.label}
                                title={deliveryPresentation.label}
                              >
                                <span aria-hidden="true">
                                  {deliveryPresentation.glyph}
                                </span>
                              </span>
                            )}
                          </span>
                        );

                        return (
                          <Fragment key={message.id}>
                            {showDaySeparator && (
                              <div
                                className="message-day-separator"
                                role="separator"
                              >
                                <span>{formatMessageDay(message.sentAt)}</span>
                              </div>
                            )}

                            <article
                              data-message-id={message.id}
                              className={`message-bubble-row${ownMessage ? " own" : ""
                                }${groupedWithPrevious
                                  ? " grouped grouped-with-previous"
                                  : " group-start"
                                }${groupedWithNext ? " grouped-with-next" : " group-end"}${officialAnnouncement ? " official-announcement" : ""}${highlightedMessageId === message.id ? " search-highlight" : ""}${openMessageMenuId === message.id ||
                                  openReactionMenuId === message.id
                                  ? " actions-open"
                                  : ""
                                }${activeMobileMessageId === message.id
                                  ? " mobile-action-selected"
                                  : ""
                                }${hasAttachments ? " has-attachments" : ""}${isLocationMessage ? " has-location" : ""
                                }${attachmentOnlyMessage ? " attachment-only" : ""}${simpleTextMessage ? " simple-text-message" : ""}${message.isDeleted ? " is-deleted" : ""}`}
                              onPointerEnter={(event) =>
                                handleMessagePointerEnter(message.id, event)
                              }
                              onPointerDown={(event) =>
                                handleMobileMessagePointerDown(message, event)
                              }
                              onPointerMove={handleMobileMessagePointerMove}
                              onPointerUp={handleMobileMessagePointerEnd}
                              onPointerCancel={handleMobileMessagePointerEnd}
                              onContextMenu={(event) =>
                                handleMobileMessageContextMenu(message.id, event)
                              }
                            >
                              {!ownMessage && !groupedWithPrevious ? (
                                renderAccountAvatar(
                                  message.sender,
                                  "message-avatar small",
                                )
                              ) : !ownMessage ? (
                                <span
                                  className="message-avatar-spacer"
                                  aria-hidden="true"
                                />
                              ) : null}

                              <div className="message-bubble-wrap">
                                {showSenderName && (
                                  <strong className="message-sender-name">
                                    {message.sender.displayName}
                                  </strong>
                                )}

                                <div className="message-bubble-line">
                                  <div className="message-bubble">
                                    {officialAnnouncement && !message.isDeleted && (
                                      <div className="message-announcement-label">
                                        <strong>
                                          {officialAnnouncement.label}
                                        </strong>
                                        <span>{t("thread.message.officialBroadcast")}</span>
                                      </div>
                                    )}

                                    {message.forwardedFrom &&
                                      !message.isDeleted && (
                                        <div className="message-forwarded-label">
                                          <svg viewBox="0 0 24 24" aria-hidden="true">
                                            <path d="m14 5 6 7-6 7v-4H9c-3.3 0-5.7 1.1-7 3 1-5.4 4-8 9-8h3V5Z" />
                                          </svg>
                                          <span>{t("thread.message.forwarded")}</span>
                                        </div>
                                      )}

                                    {message.replyTo && !message.isDeleted && (
                                      <button
                                        type="button"
                                        className="message-reply-preview"
                                        onClick={() =>
                                          void focusReplySource(message)
                                        }
                                        disabled={message.replyTo.isDeleted}
                                        aria-label={
                                          message.replyTo.isDeleted
                                            ? t("thread.message.originalReplyUnavailable")
                                            : t("thread.message.openOriginalReply")
                                        }
                                      >
                                        <strong>
                                          {message.replyTo.senderAccountId ===
                                            account?.id
                                            ? t("thread.message.you")
                                            : message.replyTo.sender.displayName}
                                        </strong>
                                        <span>
                                          {message.replyTo.isDeleted
                                            ? t("thread.message.deleted")
                                            : (message.replyTo.textContent ??
                                              t("thread.message.fallback"))}
                                        </span>
                                      </button>
                                    )}

                                    {message.isDeleted ? (
                                      <em>{t("thread.message.deletedSentence")}</em>
                                    ) : (
                                      <>
                                        {message.textContent &&
                                          message.contentType !== "LOCATION" &&
                                          (simpleTextMessage ? (
                                            <span className="message-simple-text">
                                              <span className="message-simple-text-content">
                                                {renderMessageTextWithMentions(
                                                  message,
                                                )}
                                              </span>
                                              {messageMeta}
                                            </span>
                                          ) : (
                                            <p>
                                              {renderMessageTextWithMentions(
                                                message,
                                              )}
                                            </p>
                                          ))}

                                        {message.contentType === "LOCATION" && (
                                          <LocationMessageCard
                                            message={message}
                                            viewerAccountId={account?.id}
                                            stopping={
                                              locationActionLoading === "STOP" &&
                                              (activeLiveLocation?.messageId ===
                                                message.id ||
                                                message.senderAccountId ===
                                                account?.id)
                                            }
                                            onStop={(selected) =>
                                              void handleStopLiveLocation(selected)
                                            }
                                          />
                                        )}

                                        {(message.attachments?.length ?? 0) > 0 && (
                                          <div className="message-attachments-v2">
                                            {(message.attachments ?? []).map(
                                              (attachment) => (
                                                <MessageAttachmentCard
                                                  key={attachment.id}
                                                  accessToken={accessToken}
                                                  conversationId={
                                                    message.conversationId
                                                  }
                                                  messageId={message.id}
                                                  attachment={attachment}
                                                  isVoiceNote={
                                                    getMessagePayloadValue(
                                                      message,
                                                      "attachmentKind",
                                                    ) === "VOICE_NOTE"
                                                  }
                                                  senderDisplayName={
                                                    message.sender.displayName
                                                  }
                                                  senderPhotoUrl={
                                                    profilePhotoUrls[
                                                    message.sender.accountId
                                                    ] ?? null
                                                  }
                                                  onPreview={(selected) =>
                                                    void handlePreviewAttachment(
                                                      message,
                                                      selected,
                                                    )
                                                  }
                                                  onMediaLayoutReady={
                                                    handleMessageMediaLayoutReady
                                                  }
                                                />
                                              ),
                                            )}
                                          </div>
                                        )}

                                      </>
                                    )}

                                    {!attachmentOnlyMessage &&
                                      !simpleTextMessage &&
                                      messageMeta}
                                  </div>

                                  <div
                                    className="message-bubble-actions"
                                    data-message-action-root={message.id}
                                    role="toolbar"
                                    aria-label={t("thread.message.quickActions")}
                                    onKeyDown={(event) =>
                                      handleLinearKeyboardNavigation(
                                        event,
                                        "HORIZONTAL",
                                      )
                                    }
                                  >
                                    {!message.isDeleted && (
                                      <button
                                        type="button"
                                        className="message-action-react"
                                        data-message-reaction-trigger={message.id}
                                        onClick={(event) =>
                                          toggleReactionMenu(
                                            message.id,
                                            ownMessage,
                                            event,
                                          )
                                        }
                                        disabled={reactionActionId !== null}
                                        aria-expanded={
                                          openReactionMenuId === message.id
                                        }
                                        aria-haspopup="true"
                                        aria-label={t("actionsMenu.reactToMessage")}
                                        title={t("actionsMenu.react")}
                                      >
                                        <MessageNavigationIcon name="react" />
                                      </button>
                                    )}

                                    {!message.isDeleted && (
                                      <button
                                        type="button"
                                        className="message-action-reply"
                                        onClick={() => beginReply(message)}
                                        disabled={messageActionId !== null}
                                        aria-label={t("actionsMenu.replyToMessage")}
                                        title={t("actionsMenu.reply")}
                                      >
                                        <MessageNavigationIcon name="reply" />
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      className="message-action-more"
                                      data-message-action-trigger={message.id}
                                      onClick={(event) =>
                                        toggleMessageActionMenu(
                                          message.id,
                                          ownMessage,
                                          event,
                                        )
                                      }
                                      aria-expanded={
                                        openMessageMenuId === message.id
                                      }
                                      aria-haspopup="menu"
                                      aria-label={t("actionsMenu.openMore")}
                                      title={t("actionsMenu.moreActions")}
                                    >
                                      <MessageNavigationIcon name="more" />
                                    </button>
                                  </div>
                                </div>

                                {attachmentOnlyMessage && messageMeta}

                                {(message.reactions?.length ?? 0) > 0 && (
                                  <div
                                    className={`message-reactions${
                                      ownMessage ? " own" : ""
                                    }`}
                                  >
                                    {groupMessageReactions(
                                      message,
                                      account?.id,
                                      t,
                                    ).map((reactionGroup) => (
                                      <button
                                        key={reactionGroup.emoji}
                                        type="button"
                                        className={
                                          reactionGroup.reactedByViewer
                                            ? "message-reaction-chip message-reaction-chip-own"
                                            : "message-reaction-chip"
                                        }
                                        title={reactionGroup.label}
                                        aria-label={`${reactionGroup.emoji} reaction from ${reactionGroup.count} participant${
                                          reactionGroup.count === 1 ? "" : "s"
                                        }`}
                                        onClick={() =>
                                          void handleReaction(
                                            message,
                                            reactionGroup.emoji,
                                          )
                                        }
                                        disabled={reactionActionId !== null}
                                      >
                                        <span>{reactionGroup.emoji}</span>
                                        {reactionGroup.count > 1 && (
                                          <span>{reactionGroup.count}</span>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </article>
                          </Fragment>
                        );
                      })
                    )}

                    {typingParticipants.length > 0 && (
                      <div
                        className="message-typing-indicator"
                        aria-live="polite"
                      >
                        {renderAccountAvatar(
                          typingParticipants[0],
                          "message-avatar small",
                        )}
                        <span className="message-typing-bubble">
                          <span aria-hidden="true">
                            <i />
                            <i />
                            <i />
                          </span>
                          <small>{peerActivityLabel}</small>
                        </span>
                      </div>
                    )}
                    <div
                      className="message-thread-bottom"
                      aria-hidden="true"
                    />
                  </div>
                </div>

                {(showJumpToLatest || newMessageCount > 0) && (
                  <button
                    type="button"
                    className="message-new-messages-button"
                    onClick={jumpToLatestMessages}
                    aria-label={
                      newMessageCount > 0
                        ? t("thread.jumpWithNew", { count: newMessageCount })
                        : t("thread.jumpToLatestMessage")
                    }
                    title={t("thread.jumpToLatest")}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="m6.5 9 5.5 5.5L17.5 9" />
                    </svg>
                    {newMessageCount > 0 && (
                      <span className="message-new-messages-count">
                        {newMessageCount > 99 ? "99+" : newMessageCount}
                      </span>
                    )}
                  </button>
                )}
              </div>

              <form
                className="message-composer"
                onSubmit={(event) => void handleSendMessage(event)}
              >
                {(replyingTo || editingMessage) && (
                  <div className="message-composer-context">
                    <span>
                      <strong>
                        {editingMessage
                          ? t("composer.editingMessage")
                          : t("composer.replyingTo", {
                              name:
                                replyingTo?.senderAccountId === account?.id
                                  ? t("composer.yourself")
                                  : (replyingTo?.sender.displayName ??
                                    t("thread.message.fallback").toLowerCase()),
                            })}
                      </strong>
                      <small>
                        {(editingMessage ?? replyingTo)?.textContent ??
                          t("thread.message.fallback")}
                      </small>
                    </span>

                    <button
                      type="button"
                      onClick={cancelMessageAction}
                      aria-label={t("composer.cancelAction")}
                    >
                      ×
                    </button>
                  </div>
                )}

                {selectedAttachments.length > 0 && (
                  <div className="message-selected-attachments">
                    <header className="message-selected-attachments-header">
                      <span>
                        <strong>
                          {selectedAttachmentKind === "VOICE_NOTE"
                            ? t("attachment.voiceNote")
                            : t("composer.selectedAttachments", { count: selectedAttachments.length })}
                        </strong>
                        <small>
                          {formatFileSize(
                            selectedAttachments.reduce(
                              (total, attachment) =>
                                total + attachment.file.size,
                              0,
                            ),
                          )}
                          {selectedAttachmentKind === "FILE"
                            ? ` · ${t("composer.attachmentsRemaining", {
                                count: MAX_MESSAGE_ATTACHMENT_FILES - selectedAttachments.length,
                              })}`
                            : ""}
                        </small>
                      </span>

                      <button
                        type="button"
                        onClick={clearSelectedAttachment}
                        disabled={sendingMessage}
                        aria-label={t("composer.removeAllAttachments")}
                      >
                        {t("composer.clearAttachments")}
                      </button>
                    </header>

                    <div className="message-selected-attachment-list">
                      {selectedAttachments.map((attachment) => {
                        const { file, previewUrl } = attachment;

                        return (
                          <div
                            key={attachment.id}
                            className="message-selected-attachment"
                          >
                            {previewUrl && file.type.startsWith("image/") && (
                              <img src={previewUrl} alt={file.name} />
                            )}

                            {previewUrl && file.type.startsWith("video/") && (
                              <video
                                src={previewUrl}
                                muted
                                playsInline
                                preload="metadata"
                              />
                            )}

                            {previewUrl && file.type.startsWith("audio/") && (
                              <div className="message-selected-audio">
                                <span aria-hidden="true">♪</span>
                                <audio
                                  src={previewUrl}
                                  controls
                                  preload="metadata"
                                >
                                  {t("attachment.audioUnsupported")}
                                </audio>
                              </div>
                            )}

                            {!previewUrl && (
                              <div
                                className="message-selected-document"
                                aria-hidden="true"
                              >
                                <AttachmentGlyph name="document" />
                              </div>
                            )}

                            <span>
                              <strong>
                                {selectedAttachmentKind === "VOICE_NOTE"
                                  ? t("attachment.voiceNote")
                                  : file.name}
                              </strong>
                              <small>{formatFileSize(file.size)}</small>
                            </span>

                            <button
                              type="button"
                              onClick={() =>
                                removeSelectedAttachment(attachment.id)
                              }
                              disabled={sendingMessage}
                              aria-label={t("composer.removeAttachment", { name: file.name })}
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {attachmentUpload.status !== "IDLE" && (
                      <div className="message-attachment-upload-state">
                        <div className="message-attachment-upload-meta">
                          <small>
                            {attachmentUpload.status === "FAILED"
                              ? t("composer.uploadFailed")
                              : attachmentUpload.progressPercent > 0
                                ? attachmentUpload.totalBytes
                                  ? t("composer.uploadingDetailed", {
                                      percent: attachmentUpload.progressPercent,
                                      loaded: formatFileSize(attachmentUpload.loadedBytes),
                                      total: formatFileSize(attachmentUpload.totalBytes),
                                    })
                                  : t("composer.uploading", {
                                      percent: attachmentUpload.progressPercent,
                                    })
                                : t("composer.startingUpload")}
                          </small>
                          {attachmentUpload.status === "FAILED" && (
                            <button
                              type="button"
                              onClick={() => void handleSendMessage()}
                              disabled={sendingMessage}
                            >
                              {t("actions.retry")}
                            </button>
                          )}
                        </div>
                        <div
                          className={`message-attachment-upload-track${attachmentUpload.status === "FAILED" ? " failed" : ""}`}
                          aria-label={t("composer.uploadProgress")}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={attachmentUpload.progressPercent}
                          role="progressbar"
                        >
                          <span
                            style={{
                              width: `${attachmentUpload.progressPercent}%`,
                            }}
                          />
                        </div>
                        {attachmentUpload.error && (
                          <small className="message-attachment-upload-error">
                            {attachmentUpload.error}
                          </small>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept={ACCEPTED_ATTACHMENT_TYPES}
                  multiple
                  className="message-attachment-input"
                  onChange={handleAttachmentChange}
                  disabled={
                    sendingMessage ||
                    editingMessage !== null ||
                    voiceRecordingState !== "IDLE"
                  }
                  aria-label={t("composer.chooseAttachment")}
                />

                {mentionPanelVisible && activeMentionQuery && (
                  <div className="message-mention-suggestions">
                    <div className="message-mention-suggestions-header">
                      <strong>{t("composer.mentionMember")}</strong>
                      <small>
                        {activeMentionQuery.query
                          ? t("composer.matchingMembers")
                          : t("composer.mentionHint")}
                      </small>
                    </div>

                    <div
                      id="message-mention-suggestions"
                      className="message-mention-options"
                      role="listbox"
                      aria-label={t("composer.mentionGroupMember")}
                      onScroll={(event) => {
                        if (
                          selectedConversation?.groupKind !== "OFFICIAL" ||
                          !officialMentionHasMore ||
                          officialMentionLoadingMore
                        ) {
                          return;
                        }

                        const target = event.currentTarget;
                        if (
                          target.scrollHeight -
                          target.scrollTop -
                          target.clientHeight <
                          56
                        ) {
                          void loadMoreOfficialMentionSuggestions();
                        }
                      }}
                    >
                      {mentionSuggestions.map((participant, index) => (
                        <button
                          id={`message-mention-option-${participant.accountId}`}
                          key={participant.accountId}
                          type="button"
                          role="option"
                          className={
                            index === activeMentionSuggestionIndex
                              ? "is-keyboard-active"
                              : undefined
                          }
                          aria-selected={index === activeMentionSuggestionIndex}
                          tabIndex={-1}
                          onMouseEnter={() =>
                            setActiveMentionSuggestionIndex(index)
                          }
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleMentionSelect(participant)}
                        >
                          {renderAccountAvatar(
                            participant,
                            "message-avatar small",
                          )}
                          <span>
                            <strong>{participant.displayName}</strong>
                            <small>
                              {participant.employee?.designation ??
                                participant.username ??
                                t("groupManagement.groupMember")}
                            </small>
                          </span>
                        </button>
                      ))}

                      {selectedConversation?.groupKind === "OFFICIAL" &&
                        officialMentionLoading && (
                          <div className="message-mention-status" role="status">
                            {t("groupInfo.loadingMembers")}
                          </div>
                        )}

                      {selectedConversation?.groupKind === "OFFICIAL" &&
                        !officialMentionLoading &&
                        mentionSuggestions.length === 0 && (
                          <div className="message-mention-status">
                            {officialMentionError ?? t("composer.noMatchingMembers")}
                          </div>
                        )}
                    </div>

                    {selectedConversation?.groupKind === "OFFICIAL" &&
                      officialMentionHasMore && (
                        <button
                          type="button"
                          className="message-mention-more"
                          disabled={officialMentionLoadingMore}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() =>
                            void loadMoreOfficialMentionSuggestions()
                          }
                        >
                          {officialMentionLoadingMore
                            ? t("composer.loadingMore")
                            : t("composer.loadMoreMembers")}
                        </button>
                      )}

                    {selectedConversation?.groupKind === "OFFICIAL" &&
                      officialMentionError &&
                      mentionSuggestions.length > 0 && (
                        <small className="message-mention-error">
                          {officialMentionError}
                        </small>
                      )}
                  </div>
                )}

                {voiceRecordingState !== "IDLE" ? (
                  <div
                    className="message-voice-recorder-bar"
                    role="status"
                    aria-live="polite"
                  >
                    <span
                      className="message-recording-indicator"
                      aria-hidden="true"
                    >
                      <span className="message-recording-dot" />
                    </span>
                    <span className="message-recording-copy">
                      <strong>
                        {voiceRecordingState === "STOPPING"
                          ? t("composer.preparingVoiceNote")
                          : t("composer.recordingVoiceNote")}
                      </strong>
                      <small>
                        {formatRecordingDuration(voiceRecordingSeconds)}
                      </small>
                    </span>
                    <span
                      className="message-recording-waveform"
                      aria-hidden="true"
                    >
                      {Array.from({ length: 18 }, (_, index) => (
                        <i key={index} />
                      ))}
                    </span>
                    <button
                      type="button"
                      className="message-recording-cancel"
                      onClick={cancelVoiceRecording}
                    >
                      {t("actions.cancel")}
                    </button>
                    <button
                      type="button"
                      className="message-recording-stop"
                      onClick={finishVoiceRecording}
                      disabled={voiceRecordingState !== "RECORDING"}
                    >
                      {voiceRecordingState === "STOPPING"
                        ? t("composer.preparing")
                        : t("composer.stopAndAttach")}
                    </button>
                  </div>
                ) : (
                  <div
                    className={`message-composer-main${showVoiceRecordAction ? "" : " no-voice-action"
                      }`}
                  >
                    <div
                      ref={attachmentMenuRef}
                      className="message-attachment-menu-wrapper"
                    >
                      <button
                        ref={attachmentMenuButtonRef}
                        type="button"
                        className="message-composer-control message-composer-plus"
                        onClick={() => {
                          setComposerEmojiOpen(false);
                          setAttachmentMenuView("ROOT");
                          setAttachmentMenuOpen((value) => !value);
                        }}
                        aria-expanded={attachmentMenuOpen}
                        aria-label={t("composer.openAttachmentOptions")}
                        disabled={sendingMessage || editingMessage !== null}
                      >
                        <span aria-hidden="true">+</span>
                      </button>

                      {attachmentMenuOpen && (
                        <div
                          className={`message-attachment-menu${attachmentMenuView === "LIVE_LOCATION" ? " live-step" : ""}`}
                          role="dialog"
                          aria-label={t("composer.attachmentOptions")}
                          onKeyDown={(event) =>
                            handleLinearKeyboardNavigation(event, "BOTH")
                          }
                        >
                          <header className="message-composer-popover-header">
                            {attachmentMenuView === "LIVE_LOCATION" ? (
                              <button
                                type="button"
                                className="message-popover-back"
                                onClick={() => setAttachmentMenuView("ROOT")}
                                aria-label={t("composer.backAttachmentOptions")}
                              >
                                ←
                              </button>
                            ) : (
                              <span
                                className="message-popover-header-spacer"
                                aria-hidden="true"
                              />
                            )}
                            <strong>
                              {attachmentMenuView === "LIVE_LOCATION"
                                ? t("composer.liveLocation")
                                : t("composer.attach")}
                            </strong>
                            <button
                              type="button"
                              className="message-popover-close"
                              onClick={() => {
                                setAttachmentMenuOpen(false);
                                setAttachmentMenuView("ROOT");
                                window.requestAnimationFrame(() =>
                                  attachmentMenuButtonRef.current?.focus(),
                                );
                              }}
                              aria-label={t("composer.closeAttachmentOptions")}
                            >
                              ×
                            </button>
                          </header>

                          {attachmentMenuView === "ROOT" ? (
                            <>
                              <div className="message-attachment-menu-grid">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openAttachmentPicker(MEDIA_ATTACHMENT_TYPES)
                                  }
                                  disabled={sendingMessage}
                                >
                                  <span className="media">
                                    <AttachmentGlyph name="image" />
                                  </span>
                                  <strong>{t("composer.photoVideo")}</strong>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openAttachmentPicker(
                                      DOCUMENT_ATTACHMENT_TYPES,
                                    )
                                  }
                                  disabled={sendingMessage}
                                >
                                  <span className="document">
                                    <AttachmentGlyph name="document" />
                                  </span>
                                  <strong>{t("composer.document")}</strong>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openAttachmentPicker(AUDIO_ATTACHMENT_TYPES)
                                  }
                                  disabled={sendingMessage}
                                >
                                  <span className="audio">
                                    <AttachmentGlyph name="audio" />
                                  </span>
                                  <strong>{t("composer.audio")}</strong>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleShareCurrentLocation();
                                    setAttachmentMenuOpen(false);
                                  }}
                                  disabled={locationActionLoading !== null}
                                >
                                  <span className="location">
                                    <AttachmentGlyph name="location" />
                                  </span>
                                  <strong>{t("composer.location")}</strong>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setAttachmentMenuView("LIVE_LOCATION")
                                  }
                                  disabled={
                                    locationActionLoading !== null ||
                                    activeLiveLocation !== null
                                  }
                                >
                                  <span className="live-location">
                                    <AttachmentGlyph name="location" />
                                  </span>
                                  <strong>{t("composer.liveLocation")}</strong>
                                </button>
                              </div>

                              {activeLiveLocation && (
                                <button
                                  type="button"
                                  className="message-live-location-stop"
                                  onClick={() => {
                                    void handleStopLiveLocation();
                                    setAttachmentMenuOpen(false);
                                  }}
                                  disabled={locationActionLoading === "STOP"}
                                >
                                  <span aria-hidden="true">■</span>
                                  {locationActionLoading === "STOP"
                                    ? t("composer.stoppingLiveLocation")
                                    : t("composer.stopLiveLocation")}
                                </button>
                              )}
                            </>
                          ) : (
                            <div className="message-live-location-step">
                              <span
                                className="message-live-location-illustration"
                                aria-hidden="true"
                              >
                                <AttachmentGlyph name="location" />
                              </span>
                              <div>
                                <strong>{t("composer.shareLivePosition")}</strong>
                                <small>
                                  {t("composer.liveLocationPrivacy")}
                                </small>
                              </div>
                              <div
                                className="message-live-duration-options"
                                role="group"
                                aria-label={t("composer.liveLocationDuration")}
                              >
                                {([15, 60, 480] as const).map((duration) => (
                                  <button
                                    key={duration}
                                    type="button"
                                    className={
                                      locationDurationMinutes === duration
                                        ? "active"
                                        : ""
                                    }
                                    onClick={() =>
                                      setLocationDurationMinutes(duration)
                                    }
                                    aria-pressed={
                                      locationDurationMinutes === duration
                                    }
                                  >
                                    {duration === 15
                                      ? t("composer.duration15Min")
                                      : duration === 60
                                        ? t("composer.duration1Hour")
                                        : t("composer.duration8Hours")}
                                  </button>
                                ))}
                              </div>
                              <button
                                type="button"
                                className="message-live-location-start"
                                onClick={() => {
                                  void handleStartLiveLocation();
                                  setAttachmentMenuOpen(false);
                                  setAttachmentMenuView("ROOT");
                                }}
                                disabled={
                                  locationActionLoading !== null ||
                                  activeLiveLocation !== null
                                }
                              >
                                {locationActionLoading === "LIVE"
                                  ? t("composer.starting")
                                  : t("composer.startSharing")}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div
                      ref={composerEmojiMenuRef}
                      className="message-composer-emoji-wrapper"
                    >
                      <button
                        ref={composerEmojiButtonRef}
                        type="button"
                        className="message-composer-control message-composer-emoji"
                        onClick={() => {
                          setAttachmentMenuOpen(false);
                          setAttachmentMenuView("ROOT");
                          setComposerEmojiOpen((value) => !value);
                        }}
                        aria-expanded={composerEmojiOpen}
                        aria-label={t("composer.openEmojiPicker")}
                        disabled={sendingMessage}
                      >
                        <MessageNavigationIcon name="emoji" />
                      </button>

                      {composerEmojiOpen && (
                        <div
                          className="message-composer-emoji-menu"
                          role="dialog"
                          aria-label={t("composer.quickEmojis")}
                          onKeyDown={(event) =>
                            handleLinearKeyboardNavigation(event, "BOTH")
                          }
                        >
                          <header className="message-composer-popover-header">
                            <span
                              className="message-popover-header-spacer"
                              aria-hidden="true"
                            />
                            <strong>{t("composer.emoji")}</strong>
                            <button
                              type="button"
                              className="message-popover-close"
                              onClick={() => {
                                setComposerEmojiOpen(false);
                                window.requestAnimationFrame(() =>
                                  composerEmojiButtonRef.current?.focus(),
                                );
                              }}
                              aria-label={t("composer.closeEmojiPicker")}
                            >
                              ×
                            </button>
                          </header>
                          <div className="message-composer-emoji-body">
                            {COMPOSER_EMOJI_SECTIONS.map((section) => (
                              <section
                                key={section.labelKey}
                                className="message-composer-emoji-section"
                                aria-label={t(section.labelKey)}
                              >
                                <h4>{t(section.labelKey)}</h4>
                                <div className="message-composer-emoji-grid">
                                  {section.emojis.map((emoji) => (
                                    <button
                                      key={`${section.labelKey}-${emoji}`}
                                      type="button"
                                      onClick={() => insertComposerEmoji(emoji)}
                                      aria-label={t("composer.insertEmoji", { emoji })}
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              </section>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <textarea
                      ref={composerRef}
                      value={messageText}
                      onChange={(event) => {
                        const value = event.target.value;
                        setMessageText(value);
                        setComposerCaretIndex(
                          event.target.selectionStart ?? value.length,
                        );
                        setMentionSuggestionsDismissed(false);
                        setActiveMentionSuggestionIndex(0);
                        setSendAttemptFailed(false);

                        if (selectedConversationId) {
                          updateLocalTyping(selectedConversationId, value);
                        }
                      }}
                      onSelect={(event) => {
                        setComposerCaretIndex(
                          event.currentTarget.selectionStart ??
                          messageText.length,
                        );
                        setMentionSuggestionsDismissed(false);
                      }}
                      onBlur={() => stopLocalTyping(selectedConversationId)}
                      onKeyDown={handleComposerKeyDown}
                      placeholder={
                        editingMessage
                          ? t("composer.editPlaceholder")
                          : replyingTo
                            ? t("composer.replyPlaceholder")
                            : t("composer.messagePlaceholder")
                      }
                      maxLength={5000}
                      rows={1}
                      disabled={sendingMessage}
                      aria-label={t("composer.messageText")}
                      aria-autocomplete="list"
                      aria-controls={
                        mentionPanelVisible
                          ? "message-mention-suggestions"
                          : undefined
                      }
                      aria-expanded={mentionPanelVisible}
                      aria-activedescendant={activeMentionOptionId}
                      aria-keyshortcuts="Enter Shift+Enter Escape"
                    />

                    {showVoiceRecordAction && (
                      <button
                        type="button"
                        className="message-composer-control message-voice-record-button"
                        onClick={() => void beginVoiceRecording()}
                        disabled={sendingMessage}
                        aria-label={t("composer.recordVoiceNote")}
                      >
                        <MessageNavigationIcon name="microphone" />
                      </button>
                    )}

                    <button
                      type="submit"
                      className={`message-composer-control message-send-button is-${composerSendState}`}
                      disabled={!composerHasContent || sendingMessage}
                      aria-label={
                        sendingMessage
                          ? t("composer.sendingMessage")
                          : sendAttemptFailed
                            ? t("composer.retrySendingMessage")
                            : editingMessage
                              ? t("composer.saveMessage")
                              : t("composer.sendMessage")
                      }
                      title={sendAttemptFailed ? t("composer.retrySending") : undefined}
                    >
                      {sendingMessage ? (
                        <span
                          className="message-send-spinner"
                          aria-hidden="true"
                        />
                      ) : sendAttemptFailed ? (
                        <span className="message-send-retry" aria-hidden="true">
                          ↻
                        </span>
                      ) : editingMessage ? (
                        <span aria-hidden="true">✓</span>
                      ) : (
                        <MessageNavigationIcon name="send" />
                      )}
                    </button>
                  </div>
                )}

                {messageText.length >= 4500 && (
                  <small
                    className={`message-composer-character-count${remainingMessageCharacters <= 100 ? " limit" : ""
                      }`}
                    role="status"
                    aria-live="polite"
                  >
                    {t("composer.charactersRemaining", {
                      count: remainingMessageCharacters,
                    })}
                  </small>
                )}
              </form>
            </>
          )}
        </section>

        {selectedConversation &&
          !announcementMode &&
          !ownProfileMode &&
          !newConversationMode &&
          !createGroupMode &&
          !privateGroupDialogOpen &&
          !groupManagementWorkspaceOpen &&
          detailsPanelOpen &&
          !searchPanelOpen && (
            <aside
              className="message-conversation-details is-open"
              aria-label={
                messageInformation ||
                messageInformationError ||
                messageInformationLoadingId
                  ? t("messageInfo.title")
                  : sharedContentOpen
                    ? t("sharedContent.title")
                    : activeUtilityPanel?.kind === "PROFILE"
                      ? t("profileDetail.title")
                      : t("groupInfo.title")
              }
            >
              {messageInformation ||
              messageInformationError ||
              messageInformationLoadingId
                ? renderMessageInformationPanel()
                : sharedContentOpen
                  ? renderSharedContentPanel()
                  : activeUtilityPanel?.kind === "PROFILE"
                    ? renderConversationProfilePanel()
                    : selectedConversation.type === "GROUP"
                      ? renderGroupInformationPanel()
                      : null}
            </aside>
          )}

        {selectedConversation &&
          !announcementMode &&
          !ownProfileMode &&
          !newConversationMode &&
          !createGroupMode &&
          !privateGroupDialogOpen &&
          !groupManagementWorkspaceOpen &&
          searchPanelOpen && (
            <aside
              className="message-conversation-search-panel is-open"
              aria-label={t("messageSearch.aria")}
            >
              <div className="message-search-panel-header">
                <div>
                  <strong>{t("messageSearch.title")}</strong>
                </div>
                <button
                  type="button"
                  className="message-search-panel-close"
                  onClick={(event) => {
                    event.currentTarget.blur();
                    closeMessageSearchPanel();
                  }}
                  aria-label={t("messageSearch.close")}
                >
                  <span className="message-search-panel-mobile-back-icon" aria-hidden="true">←</span>
                  <span className="message-search-panel-close-icon" aria-hidden="true">
                    <MessageNavigationIcon name="close" />
                  </span>
                </button>
              </div>

              <div className="message-search-panel-controls" role="search">
                <label className="message-search-input-shell">
                  <span className="sr-only">{t("messageSearch.searchConversation")}</span>
                  <MessageNavigationIcon name="search" />
                  <input
                    ref={messageSearchInputRef}
                    type="search"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder={t("messageSearch.placeholder")}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {searchText.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchText("");
                        messageSearchInputRef.current?.focus();
                      }}
                      aria-label={t("messageSearch.clear")}
                    >
                      <MessageNavigationIcon name="close" />
                    </button>
                  )}
                </label>

                {searchResults.length > 0 && !searchLoading && !searchError && (
                  <p className="message-search-result-count" role="status">
                    {t("search.result", { count: searchResults.length })}
                  </p>
                )}
              </div>

              <div className="message-search-panel-results" aria-live="polite">
                {searchLoading ? (
                  <div className="message-search-panel-status">
                    <span className="message-small-spinner" aria-hidden="true" />
                    <span>{t("messageSearch.searching")}</span>
                  </div>
                ) : searchError ? (
                  <div className="message-inline-error compact">
                    <p>{searchError}</p>
                  </div>
                ) : searchText.trim().length === 0 ? null : searchResults.length ===
                  0 ? (
                  <p className="message-search-panel-empty">{t("messageSearch.none")}</p>
                ) : (
                  <div className="message-search-panel-list">
                    {searchResults.map((result) => (
                      <button
                        key={result.message.id}
                        type="button"
                        className="message-search-panel-result"
                        onClick={() => openSearchMessageResult(result)}
                      >
                        {renderAccountAvatar(
                          result.message.sender,
                          "message-avatar small",
                        )}
                        <span className="message-search-panel-result-copy">
                          <span className="message-search-panel-result-heading">
                            <strong>{result.message.sender.displayName}</strong>
                            <time dateTime={result.message.sentAt}>
                              {formatConversationTime(result.message.sentAt)}
                            </time>
                          </span>
                          <span className="message-search-panel-result-snippet">
                            {result.snippet}
                          </span>
                          {result.matchedAttachmentFileName && (
                            <small>{result.matchedAttachmentFileName}</small>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          )}

      </section>

      {announcementDetailOpen && (
        <div
          className="message-announcement-workspace-layer message-announcement-detail-backdrop"
        >
          <section
            className="message-announcement-detail-dialog message-announcement-workspace-detail"
            role="region"
            aria-labelledby="message-announcement-detail-title"
          >
            <header>
              <div>
                <span>{t("announcementDetail.eyebrow")}</span>
                <h2 id="message-announcement-detail-title">
                  {announcementDetail?.title ?? t("announcementDetail.detailsTitle")}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeAnnouncementDetail}
                aria-label={t("announcementDetail.close")}
                disabled={announcementDetailAction !== null}
              >
                ×
              </button>
            </header>

            <div className="message-announcement-detail-body">
              {announcementDetailLoading ? (
                <div className="message-announcement-detail-state">
                  <strong>{t("announcementDetail.loading")}</strong>
                  <span>
                    {t("announcementDetail.loadingDescription")}
                  </span>
                </div>
              ) : announcementDetailError && !announcementDetail ? (
                <div
                  className="message-announcement-detail-state danger"
                  role="alert"
                >
                  <strong>{t("announcementDetail.loadError")}</strong>
                  <span>{announcementDetailError}</span>
                </div>
              ) : announcementDetail ? (
                <>
                  <section className="message-announcement-detail-overview">
                    <div className="message-announcement-detail-summary">
                      <div className="message-announcement-card-badges">
                        <span className="message-announcement-priority">
                          {announcementEnumLabel(announcementDetail.priority, t)}
                        </span>
                        {announcementDetail.status !== "PUBLISHED" && (
                          <span>
                            {announcementEnumLabel(announcementDetail.status, t)}
                          </span>
                        )}
                        {announcementDetail.isPinned && <span>{t("announcementDetail.pinned")}</span>}
                        {announcementDetail.currentRevision > 1 && (
                          <strong>{t("announcementDetail.edited")}</strong>
                        )}
                      </div>
                      <time
                        dateTime={
                          announcementDetail.publishedAt ??
                          announcementDetail.updatedAt
                        }
                      >
                        {formatAnnouncementDate(
                          announcementDetail.publishedAt ??
                          announcementDetail.updatedAt,
                        )}
                      </time>
                    </div>

                    <div className="message-announcement-detail-publisher">
                      <span aria-hidden="true">
                        {initials(announcementDetail.publisher.displayName)}
                      </span>
                      <div>
                        <small>{t("announcementDetail.publishedBy")}</small>
                        <strong>
                          {announcementDetail.publisher.displayName}
                        </strong>
                        <p>
                          {announcementDetail.publisher.designation ??
                            roleLabel(announcementDetail.publisher.role, t)}
                        </p>
                      </div>
                    </div>
                  </section>

                  <div className="message-announcement-detail-content">
                    <p>
                      {announcementDetail.body ||
                        t("announcementDetail.withdrawn")}
                    </p>
                  </div>

                  <section className="message-announcement-detail-attachments">
                    <header>
                      <div>
                        <strong>{t("announcementDetail.attachments")}</strong>
                        <small>
                          {announcementDetail.attachments.length === 0
                            ? t("announcementDetail.noFiles")
                            : t("announcementDetail.filesHint")}
                        </small>
                      </div>
                      <span>{announcementDetail.attachments.length}</span>
                    </header>

                    {announcementDetail.attachments.length === 0 ? (
                      <p className="message-announcement-detail-empty">
                        {t("announcementDetail.noAttachmentsDescription")}
                      </p>
                    ) : (
                      <ul className="message-announcement-attachment-grid">
                        {announcementDetail.attachments.map((attachment) => {
                          const opening =
                            announcementAttachmentActionId ===
                            `${attachment.id}:open`;
                          const downloading =
                            announcementAttachmentActionId ===
                            `${attachment.id}:download`;
                          const canPreview =
                            canPreviewAnnouncementAttachment(attachment);
                          const canDownload =
                            !attachment.isExpired &&
                            (announcementDetail.allowAttachmentDownload ||
                              announcementDetail.canManage);

                          return (
                            <li
                              key={attachment.id}
                              className={`message-announcement-attachment-card ${attachment.category.toLowerCase()}${
                                attachment.isExpired ? " is-expired" : ""
                              }`}
                            >
                              <span
                                className={`message-announcement-file-kind ${attachment.category.toLowerCase()}`}
                                aria-hidden="true"
                              >
                                {announcementAttachmentShortLabel(
                                  attachment.category,
                                )}
                              </span>
                              <div className="message-announcement-file-copy">
                                <strong>{attachment.originalFileName}</strong>
                                <small>
                                  {announcementEnumLabel(attachment.category, t)} ·{" "}
                                  {formatFileSize(attachment.fileSizeBytes)}
                                </small>
                                {attachment.isExpired && (
                                  <small className="message-announcement-file-expired">
                                    {t("announcementDetail.attachmentExpired")}
                                  </small>
                                )}
                              </div>
                              <div className="message-announcement-file-actions">
                                {canPreview && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleAnnouncementAttachmentOpen(
                                        attachment,
                                      )
                                    }
                                    disabled={
                                      announcementAttachmentActionId !== null
                                    }
                                  >
                                    {opening ? t("announcementDetail.opening") : t("announcementDetail.preview")}
                                  </button>
                                )}
                                {canDownload && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleAnnouncementAttachmentDownload(
                                        attachment,
                                      )
                                    }
                                    disabled={
                                      announcementAttachmentActionId !== null
                                    }
                                  >
                                    {downloading
                                      ? t("announcementDetail.downloading")
                                      : t("announcementDetail.download")}
                                  </button>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>

                  {announcementDetailError && (
                    <div
                      className="message-announcement-detail-state danger"
                      role="alert"
                    >
                      <strong>{t("announcementDetail.actionFailed")}</strong>
                      <span>{announcementDetailError}</span>
                    </div>
                  )}

                  {announcementDeleteConfirmationOpen && (
                    <section
                      className="message-announcement-delete-confirmation"
                      role="alertdialog"
                      aria-modal="true"
                      aria-labelledby="message-announcement-delete-title"
                      aria-describedby="message-announcement-delete-description"
                      data-message-modal="announcement-delete-confirmation"
                      tabIndex={-1}
                    >
                      <div>
                        <strong id="message-announcement-delete-title">
                          {t("announcementDetail.deleteConfirmTitle")}
                        </strong>
                        <p id="message-announcement-delete-description">
                          {t("announcementDetail.deleteConfirmDescription")}
                        </p>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setAnnouncementDeleteConfirmationOpen(false)
                          }
                          disabled={announcementDetailAction === "DELETE"}
                        >
                          {t("actions.cancel")}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void handleAnnouncementDelete()}
                          disabled={announcementDetailAction === "DELETE"}
                        >
                          {announcementDetailAction === "DELETE"
                            ? t("announcementDetail.deleting")
                            : t("announcementDetail.deletePermanently")}
                        </button>
                      </div>
                    </section>
                  )}
                </>
              ) : null}
            </div>

            {announcementDetail && !announcementDetailLoading && (
              <footer>
                <div>
                  {announcementDetail.requiresAcknowledgement &&
                    announcementDetail.status === "PUBLISHED" &&
                    announcementDetail.viewerState &&
                    !announcementDetail.viewerState.isAcknowledged && (
                      <button
                        type="button"
                        className="acknowledge"
                        onClick={() => void handleAnnouncementAcknowledgement()}
                        disabled={announcementDetailAction !== null}
                      >
                        {announcementDetailAction === "ACKNOWLEDGE"
                          ? t("announcementDetail.acknowledging")
                          : t("announcementDetail.acknowledge")}
                      </button>
                    )}
                </div>
                <div>
                  {announcementDetail.canEdit &&
                    isAnnouncementEditable(announcementDetail.status) && (
                      <button
                        type="button"
                        onClick={() =>
                          void openAnnouncementEditor(announcementDetail.id)
                        }
                        disabled={announcementDetailAction !== null}
                      >
                        {t("announcementDetail.edit")}
                      </button>
                    )}
                  {announcementDetail.canDelete &&
                    isAnnouncementDeletable(announcementDetail.status) && (
                      <button
                        type="button"
                        className="danger"
                        onClick={() =>
                          setAnnouncementDeleteConfirmationOpen(true)
                        }
                        disabled={announcementDetailAction !== null}
                      >
                        {t("announcementDetail.delete")}
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={closeAnnouncementDetail}
                    disabled={announcementDetailAction !== null}
                  >
                    {t("announcementDetail.closeAction")}
                  </button>
                </div>
              </footer>
            )}
          </section>
        </div>
      )}

      {announcementComposerOpen && announcementComposerGroup && (
        <div
          className="message-announcement-workspace-layer message-announcement-composer-backdrop"
        >
          <section
            className="message-announcement-composer-dialog message-announcement-workspace-composer"
            role="region"
            aria-labelledby="message-announcement-composer-title"
          >
            <header>
              <div>
                <span>{t("announcementComposer.eyebrow")}</span>
                <h2 id="message-announcement-composer-title">
                  {announcementComposerMode === "EDIT"
                    ? t("announcementComposer.editTitle")
                    : t("announcementComposer.createTitle")}
                </h2>
                <p>{t("announcementComposer.description")}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleAnnouncementComposerCancel()}
                aria-label={t("announcementComposer.close")}
                disabled={announcementComposerSubmitting !== null}
              >
                ×
              </button>
            </header>

            <form
              onSubmit={(event) => void handleAnnouncementComposerSubmit(event)}
            >
              <div className="message-announcement-composer-body">
                <section
                  className="message-announcement-audience-lock"
                  aria-label={t("announcementComposer.audienceAria")}
                >
                  <span>
                    {renderGroupAvatar(
                      announcementComposerGroup,
                      "message-avatar",
                    )}
                  </span>
                  <div>
                    <small>{t("announcementComposer.audience")}</small>
                    <strong>
                      {announcementComposerGroup.title ?? t("groupInfo.officialGroup")}
                    </strong>
                    <p>{officialScopeLabel(announcementComposerGroup, t)}</p>
                  </div>
                  <em>{t("announcementComposer.locked")}</em>
                </section>

                <div className="message-announcement-composer-layout">
                  <div className="message-announcement-composer-main">
                    <section className="message-announcement-composer-section">
                      <header>
                        <div>
                          <strong>{t("announcementComposer.content")}</strong>
                          <small>{t("announcementComposer.contentHint")}</small>
                        </div>
                      </header>

                      <div className="message-announcement-composer-grid content-grid">
                        <label className="full-width">
                          <span>{t("announcementComposer.titleLabel")}</span>
                          <input
                            type="text"
                            value={announcementComposerValues.title}
                            onChange={(event) =>
                              setAnnouncementComposerValues((current) => ({
                                ...current,
                                title: event.target.value,
                              }))
                            }
                            maxLength={160}
                            placeholder={t("announcementComposer.titlePlaceholder")}
                            autoFocus
                            required
                          />
                          <small>
                            {announcementComposerValues.title.length}/160
                          </small>
                        </label>

                        <label className="full-width">
                          <span>{t("announcementComposer.messageLabel")}</span>
                          <textarea
                            value={announcementComposerValues.body}
                            onChange={(event) =>
                              setAnnouncementComposerValues((current) => ({
                                ...current,
                                body: event.target.value,
                              }))
                            }
                            maxLength={5000}
                            rows={8}
                            placeholder={t("announcementComposer.messagePlaceholder")}
                            required
                          />
                          <small>
                            {announcementComposerValues.body.length}/5000
                          </small>
                        </label>
                      </div>
                    </section>

                    <section className="message-announcement-composer-attachments message-announcement-composer-section">
                      <header>
                        <div>
                          <strong>{t("announcementDetail.attachments")}</strong>
                          <small>
                            {t("announcementComposer.attachmentsHint")}
                          </small>
                        </div>
                        <span>
                          {announcementComposerExistingAttachments.length +
                            announcementComposerPendingAttachments.length -
                            announcementComposerRemovedAttachmentIds.length}
                        </span>
                      </header>

                      <div className="message-announcement-attachment-pickers">
                        <label>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            disabled={announcementComposerSubmitting !== null}
                            onChange={(event) =>
                              handleAnnouncementAttachmentSelection(
                                event,
                                "IMAGE",
                              )
                            }
                          />
                          <span aria-hidden="true">IMG</span>
                          <strong>{t("announcementComposer.addImages")}</strong>
                          <small>JPG, PNG, WEBP · 20 MB</small>
                        </label>
                        <label>
                          <input
                            type="file"
                            accept="video/mp4,video/webm"
                            multiple
                            disabled={announcementComposerSubmitting !== null}
                            onChange={(event) =>
                              handleAnnouncementAttachmentSelection(
                                event,
                                "VIDEO",
                              )
                            }
                          />
                          <span aria-hidden="true">VID</span>
                          <strong>{t("announcementComposer.addVideos")}</strong>
                          <small>MP4, WEBM · 200 MB</small>
                        </label>
                        <label>
                          <input
                            type="file"
                            accept=".pdf,.docx,.xlsx,.pptx,.txt,.csv,.zip,application/pdf,text/plain,text/csv,application/zip"
                            multiple
                            disabled={announcementComposerSubmitting !== null}
                            onChange={(event) =>
                              handleAnnouncementAttachmentSelection(
                                event,
                                "DOCUMENT",
                              )
                            }
                          />
                          <span aria-hidden="true">DOC</span>
                          <strong>{t("announcementComposer.addFiles")}</strong>
                          <small>PDF, Office, text, CSV, ZIP · 50 MB</small>
                        </label>
                      </div>

                      {announcementComposerExistingAttachments.length === 0 &&
                        announcementComposerPendingAttachments.length === 0 ? (
                        <p className="message-announcement-attachment-empty">
                          {t("announcementComposer.noAttachmentsSelected")}
                        </p>
                      ) : (
                        <ul className="message-announcement-composer-file-list">
                          {announcementComposerExistingAttachments.map(
                            (attachment) => {
                              const removed =
                                announcementComposerRemovedAttachmentIds.includes(
                                  attachment.id,
                                );
                              return (
                                <li
                                  key={attachment.id}
                                  className={removed ? "removed" : ""}
                                >
                                  <span
                                    className={`message-announcement-file-kind ${attachment.category.toLowerCase()}`}
                                    aria-hidden="true"
                                  >
                                    {announcementAttachmentShortLabel(
                                      attachment.category,
                                    )}
                                  </span>
                                  <div className="message-announcement-file-copy">
                                    <strong>{attachment.originalFileName}</strong>
                                    <small>
                                      {t("announcementComposer.existing")} {announcementEnumLabel(attachment.category, t)} ·{" "}
                                      {formatFileSize(
                                        attachment.fileSizeBytes,
                                      )}
                                    </small>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={
                                      announcementComposerSubmitting !== null
                                    }
                                    onClick={() =>
                                      setAnnouncementComposerRemovedAttachmentIds(
                                        (current) =>
                                          current.includes(attachment.id)
                                            ? current.filter(
                                              (id) => id !== attachment.id,
                                            )
                                            : [...current, attachment.id],
                                      )
                                    }
                                  >
                                    {removed
                                      ? t("announcementComposer.undo")
                                      : t("announcementComposer.remove")}
                                  </button>
                                </li>
                              );
                            },
                          )}

                          {announcementComposerPendingAttachments.map(
                            (attachment) => (
                              <li
                                key={attachment.clientId}
                                className={
                                  attachment.status === "ERROR" ? "failed" : ""
                                }
                              >
                                <span
                                  className={`message-announcement-file-kind ${attachment.category.toLowerCase()}`}
                                  aria-hidden="true"
                                >
                                  {announcementAttachmentShortLabel(
                                    attachment.category,
                                  )}
                                </span>
                                <div className="message-announcement-file-copy">
                                  <strong>{attachment.file.name}</strong>
                                  <small>
                                    {attachment.status === "UPLOADING"
                                      ? t("announcementComposer.uploadingProgress", {
                                          percent: attachment.progressPercent,
                                        })
                                      : attachment.status === "UPLOADED"
                                        ? t("announcementComposer.uploaded")
                                        : attachment.status === "REMOVING"
                                          ? t("announcementComposer.removing")
                                          : (attachment.error ??
                                            `${announcementEnumLabel(attachment.category, t)} · ${formatFileSize(attachment.file.size)}`)}
                                  </small>
                                  {attachment.status === "UPLOADING" && (
                                    <span
                                      className="message-announcement-upload-progress"
                                      aria-hidden="true"
                                    >
                                      <i
                                        style={{
                                          width: `${attachment.progressPercent}%`,
                                        }}
                                      />
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  disabled={
                                    announcementComposerSubmitting !== null ||
                                    attachment.status === "UPLOADING" ||
                                    attachment.status === "REMOVING"
                                  }
                                  onClick={() =>
                                    void removePendingAnnouncementAttachment(
                                      attachment.clientId,
                                    )
                                  }
                                >
                                  {t("announcementComposer.remove")}
                                </button>
                              </li>
                            ),
                          )}
                        </ul>
                      )}
                    </section>
                  </div>

                  <aside className="message-announcement-composer-side">
                    <section className="message-announcement-composer-section">
                      <header>
                        <div>
                          <strong>{t("announcementComposer.publishing")}</strong>
                          <small>{t("announcementComposer.publishingHint")}</small>
                        </div>
                      </header>

                      <div className="message-announcement-composer-grid publishing-grid">
                        <label>
                          <span>{t("announcementComposer.priority")}</span>
                          <select
                            value={announcementComposerValues.priority}
                            onChange={(event) =>
                              setAnnouncementComposerValues((current) => ({
                                ...current,
                                priority: event.target
                                  .value as AnnouncementPriority,
                              }))
                            }
                          >
                            <option value="NORMAL">{t("announcement.enums.normal")}</option>
                            <option value="IMPORTANT">{t("announcement.enums.important")}</option>
                            <option value="URGENT">{t("announcement.enums.urgent")}</option>
                            <option value="EMERGENCY">{t("announcement.enums.emergency")}</option>
                          </select>
                        </label>

                        <label>
                          <span>{t("announcementComposer.publish")}</span>
                          <select
                            value={announcementComposerValues.publishTiming}
                            disabled={
                              announcementComposerStatus === "PUBLISHED"
                            }
                            onChange={(event) =>
                              setAnnouncementComposerValues((current) => ({
                                ...current,
                                publishTiming: event.target
                                  .value as AnnouncementPublishTiming,
                              }))
                            }
                          >
                            <option value="NOW">{t("announcementComposer.now")}</option>
                            <option value="SCHEDULE">{t("announcementComposer.schedule")}</option>
                          </select>
                        </label>

                        {announcementComposerStatus !== "PUBLISHED" &&
                          announcementComposerValues.publishTiming ===
                          "SCHEDULE" && (
                            <label>
                              <span>{t("announcementComposer.scheduledAt")}</span>
                              <input
                                type="datetime-local"
                                value={announcementComposerValues.scheduledAt}
                                min={toLocalDateTimeInputValue(
                                  new Date(Date.now() + 60_000),
                                )}
                                onChange={(event) =>
                                  setAnnouncementComposerValues((current) => ({
                                    ...current,
                                    scheduledAt: event.target.value,
                                  }))
                                }
                                required
                              />
                            </label>
                          )}

                        <label>
                          <span>{t("announcementComposer.expiry")}</span>
                          <input
                            type="datetime-local"
                            value={announcementComposerValues.expiresAt}
                            min={
                              announcementComposerValues.publishTiming ===
                                "SCHEDULE" &&
                                announcementComposerValues.scheduledAt
                                ? announcementComposerValues.scheduledAt
                                : toLocalDateTimeInputValue(
                                  new Date(Date.now() + 60_000),
                                )
                            }
                            onChange={(event) =>
                              setAnnouncementComposerValues((current) => ({
                                ...current,
                                expiresAt: event.target.value,
                              }))
                            }
                          />
                          <small>{t("announcementComposer.optional")}</small>
                        </label>
                      </div>
                    </section>

                    <section className="message-announcement-composer-section">
                      <header>
                        <div>
                          <strong>{t("announcementComposer.deliveryOptions")}</strong>
                          <small>{t("announcementComposer.deliveryHint")}</small>
                        </div>
                      </header>

                      <div className="message-announcement-composer-options">
                        <label>
                          <input
                            type="checkbox"
                            checked={
                              announcementComposerValues.requiresAcknowledgement
                            }
                            onChange={(event) =>
                              setAnnouncementComposerValues((current) => ({
                                ...current,
                                requiresAcknowledgement: event.target.checked,
                                isPinned: event.target.checked
                                  ? true
                                  : current.isPinned,
                              }))
                            }
                          />
                          <span>
                            <strong>{t("announcementComposer.requireAcknowledgement")}</strong>
                            <small>{t("announcementComposer.requireAcknowledgementHint")}</small>
                          </span>
                        </label>

                        <label>
                          <input
                            type="checkbox"
                            checked={announcementComposerValues.isPinned}
                            disabled={
                              announcementComposerValues.requiresAcknowledgement
                            }
                            onChange={(event) =>
                              setAnnouncementComposerValues((current) => ({
                                ...current,
                                isPinned: event.target.checked,
                              }))
                            }
                          />
                          <span>
                            <strong>{t("announcementComposer.pin")}</strong>
                            <small>{t("announcementComposer.pinHint")}</small>
                          </span>
                        </label>

                        <label>
                          <input
                            type="checkbox"
                            checked={
                              announcementComposerValues.allowAttachmentDownload
                            }
                            onChange={(event) =>
                              setAnnouncementComposerValues((current) => ({
                                ...current,
                                allowAttachmentDownload: event.target.checked,
                              }))
                            }
                          />
                          <span>
                            <strong>{t("announcementComposer.allowDownloads")}</strong>
                            <small>{t("announcementComposer.allowDownloadsHint")}</small>
                          </span>
                        </label>
                      </div>
                    </section>
                  </aside>
                </div>

                {announcementComposerError && (
                  <div
                    className="message-announcement-composer-error"
                    role="alert"
                  >
                    <strong>
                      {announcementComposerMode === "EDIT"
                        ? t("announcementComposer.updateError")
                        : t("announcementComposer.sendError")}
                    </strong>
                    <span>{announcementComposerError}</span>
                  </div>
                )}
              </div>

              <footer>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void handleAnnouncementComposerCancel()}
                  disabled={announcementComposerSubmitting !== null}
                >
                  {announcementComposerSubmitting === "CANCEL"
                    ? t("announcementComposer.cancelling")
                    : t("announcementComposer.cancel")}
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={announcementComposerSubmitting !== null}
                >
                  {announcementComposerSubmitting === "PUBLISH" ||
                    announcementComposerSubmitting === "SAVE"
                    ? t("announcementComposer.processing")
                    : announcementComposerMode === "EDIT"
                      ? t("announcementComposer.saveChanges")
                      : announcementComposerValues.publishTiming === "SCHEDULE"
                        ? t("announcementComposer.scheduleAnnouncement")
                        : t("announcementComposer.publishAnnouncement")}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {destructiveConfirmation && destructiveConfirmationContent && (
        <div
          className="message-dialog-backdrop message-conversation-history-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closeDestructiveConfirmation();
            }
          }}
        >
          <section
            className="message-conversation-history-dialog destructive"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="message-destructive-confirmation-title"
            aria-describedby="message-destructive-confirmation-description"
            data-message-modal="destructive-confirmation"
            tabIndex={-1}
          >
            <div
              className="message-conversation-history-icon"
              aria-hidden="true"
            >
              <MessageNavigationIcon
                name={
                  destructiveConfirmation.kind === "DELETE_MESSAGE_FOR_ME" ||
                    destructiveConfirmation.kind ===
                    "DELETE_MESSAGE_FOR_EVERYONE"
                    ? "trash"
                    : "close"
                }
              />
            </div>

            <div className="message-conversation-history-copy">
              <span>{destructiveConfirmationContent.eyebrow}</span>
              <h2 id="message-destructive-confirmation-title">
                {destructiveConfirmationContent.title}
              </h2>
              <p id="message-destructive-confirmation-description">
                {destructiveConfirmationContent.description}
              </p>
            </div>

            <section className="message-conversation-history-scope">
              <strong>{t("confirmation.common.beforeContinue")}</strong>
              <ul>
                {destructiveConfirmationContent.consequences.map(
                  (consequence) => (
                    <li key={consequence}>{consequence}</li>
                  ),
                )}
              </ul>
            </section>

            {destructiveConfirmationError && (
              <div className="message-conversation-history-error" role="alert">
                <strong>{t("confirmation.common.actionFailed")}</strong>
                <span>{destructiveConfirmationError}</span>
              </div>
            )}

            <footer>
              <button
                type="button"
                className="secondary"
                onClick={closeDestructiveConfirmation}
                disabled={destructiveConfirmationSubmitting}
                data-message-modal-initial-focus="true"
              >
                {t("confirmation.common.cancel")}
              </button>
              <button
                type="button"
                className="danger"
                onClick={submitDestructiveConfirmation}
                disabled={destructiveConfirmationSubmitting}
              >
                {destructiveConfirmationSubmitting
                  ? t("confirmation.common.applying")
                  : destructiveConfirmationContent.confirmLabel}
              </button>
            </footer>
          </section>
        </div>
      )}

      {conversationHistoryAction && conversationHistoryTarget && (
        <div
          className="message-dialog-backdrop message-conversation-history-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closeConversationHistoryConfirmation();
            }
          }}
        >
          <section
            ref={conversationHistoryDialogRef}
            className={`message-conversation-history-dialog${conversationHistoryAction === "DELETE" ? " destructive" : ""
              }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-conversation-history-title"
            aria-describedby="message-conversation-history-description"
          >
            <div
              className="message-conversation-history-icon"
              aria-hidden="true"
            >
              <MessageNavigationIcon
                name={
                  conversationHistoryAction === "DELETE" ? "trash" : "close"
                }
              />
            </div>

            <div className="message-conversation-history-copy">
              <span>{t("historyConfirmation.eyebrow")}</span>
              <h2 id="message-conversation-history-title">
                {conversationHistoryAction === "DELETE"
                  ? t("historyConfirmation.deleteTitle")
                  : t("historyConfirmation.clearTitle")}
              </h2>
              <p id="message-conversation-history-description">
                {conversationHistoryAction === "DELETE"
                  ? t("historyConfirmation.deleteDescription")
                  : t("historyConfirmation.clearDescription")}
              </p>
            </div>

            <section className="message-conversation-history-scope">
              <strong>{t("historyConfirmation.unchangedTitle")}</strong>
              <ul>
                <li>{t("historyConfirmation.unchanged1")}</li>
                <li>{t("historyConfirmation.unchanged2")}</li>
                <li>{t("historyConfirmation.unchanged3")}</li>
              </ul>
            </section>

            {conversationHistoryError && (
              <div className="message-conversation-history-error" role="alert">
                <strong>{t("confirmation.common.actionFailed")}</strong>
                <span>{conversationHistoryError}</span>
              </div>
            )}

            <footer>
              <button
                ref={conversationHistoryCancelRef}
                type="button"
                className="secondary"
                onClick={closeConversationHistoryConfirmation}
                disabled={conversationHistorySubmitting}
              >
                {t("confirmation.common.cancel")}
              </button>
              <button
                type="button"
                className={
                  conversationHistoryAction === "DELETE" ? "danger" : "primary"
                }
                onClick={() => void handlePersonalConversationHistoryAction()}
                disabled={conversationHistorySubmitting}
              >
                {conversationHistorySubmitting
                  ? t("confirmation.common.applying")
                  : conversationHistoryAction === "DELETE"
                    ? t("thread.header.deleteChat")
                    : t("thread.header.clearChat")}
              </button>
            </footer>
          </section>
        </div>
      )}

      {pinnedMessageBrowserOpen && selectedConversation && (
        <div className="message-dialog-backdrop" role="presentation">
          <section
            className="message-pinned-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-pinned-dialog-title"
            data-message-modal="pinned-messages"
            tabIndex={-1}
          >
            <header>
              <div>
                <span>{t("pinnedBrowser.title")}</span>
                <h2 id="message-pinned-dialog-title">
                  {selectedConversation.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={closePinnedMessageBrowser}
                aria-label={t("pinnedBrowser.close")}
              >
                ×
              </button>
            </header>

            <div className="message-pinned-dialog-list">
              {visiblePinnedMessages.map((message, index) => (
                <button
                  key={message.id}
                  type="button"
                  className={
                    index === normalizedPinnedMessageIndex ? "active" : undefined
                  }
                  onClick={() => {
                    setActivePinnedMessageIndex(index);
                    focusPinnedMessage(message);
                  }}
                >
                  <span
                    className="message-pinned-dialog-icon"
                    aria-hidden="true"
                  >
                    📌
                  </span>
                  <span className="message-pinned-dialog-copy">
                    <strong>{message.sender.displayName}</strong>
                    <span>{localizedAttachmentLabel(message)}</span>
                    <small>{formatConversationTime(message.sentAt)}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {forwardingMessage && (
        <div
          className="message-contact-backdrop message-forward-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closeForwardDialog();
            }
          }}
        >
          <section
            className="message-contact-dialog message-forward-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="forward-message-title"
            data-message-modal="forward"
            tabIndex={-1}
          >
            <header className="message-forward-header">
              <div>
                <h2 id="forward-message-title">{t("forward.title")}</h2>
                <p>{t("forward.chooseChats")}</p>
              </div>

              <button
                type="button"
                onClick={closeForwardDialog}
                disabled={forwardSubmitting}
                aria-label={t("forward.close")}
              >
                ×
              </button>
            </header>

            <div className="message-forward-source">
              <span>{t("forward.forwardingLabel")}</span>
              <strong>{localizedAttachmentLabel(forwardingMessage)}</strong>
            </div>

            <div className="message-forward-search">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                type="search"
                value={forwardSearch}
                onChange={(event) => setForwardSearch(event.target.value)}
                placeholder={t("search.chats")}
                aria-label={t("forward.searchAria")}
                autoFocus
              />
            </div>

            <div className="message-forward-list">
              {listMode && listCandidatesLoading ? (
                <div className="message-list-state compact" role="status">
                  <span className="message-small-spinner" aria-hidden="true" />
                  <h3>{t("forward.loadingConversations")}</h3>
                  <p>{t("forward.loadingDescription")}</p>
                </div>
              ) : listMode && forwardDestinationError ? (
                <div className="message-list-state compact" role="alert">
                  <div className="message-empty-icon" aria-hidden="true">!</div>
                  <h3>{t("forward.loadError")}</h3>
                  <p>{forwardDestinationError}</p>
                  <button
                    type="button"
                    onClick={() =>
                      void loadListCandidateConversations("forward")
                    }
                  >
                    {t("actions.retry")}
                  </button>
                </div>
              ) : filteredForwardConversations.length === 0 ? (
                <div className="message-list-state compact">
                  <div className="message-empty-icon">?</div>
                  <h3>{t("forward.none")}</h3>
                  <p>{t("forward.noneDescription")}</p>
                </div>
              ) : (
                filteredForwardConversations.map((conversation) => {
                  const selected = forwardDestinationIds.includes(
                    conversation.id,
                  );

                  return (
                    <label
                      key={conversation.id}
                      className={`message-forward-row${selected ? " selected" : ""
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          toggleForwardDestination(conversation.id)
                        }
                        disabled={
                          forwardSubmitting ||
                          (!selected && forwardDestinationIds.length >= 20)
                        }
                      />

                      {renderConversationAvatar(
                        conversation,
                        "message-avatar small",
                      )}

                      <span>
                        <strong>
                          {conversation.title ?? t("forward.privateConversation")}
                        </strong>
                        <small>
                          {conversation.type === "PRIVATE"
                            ? t("forward.privateChat")
                            : conversation.groupKind === "OFFICIAL"
                              ? t("forward.officialGroup")
                              : t("forward.group")}
                        </small>
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <footer className="message-forward-footer">
              <span>{t("forward.selected", { count: forwardDestinationIds.length })}</span>
              <div>
                <button
                  type="button"
                  onClick={closeForwardDialog}
                  disabled={forwardSubmitting}
                >
                  {t("forward.cancel")}
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void handleForwardMessage()}
                  disabled={
                    forwardSubmitting || forwardDestinationIds.length === 0
                  }
                >
                  {forwardSubmitting ? t("forward.forwarding") : t("forward.title")}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      {attachmentViewer && (
        <div
          className="message-media-viewer-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closeAttachmentViewer();
            }
          }}
        >
          <section
            ref={attachmentViewerDialogRef}
            className={`message-media-viewer${isPdfAttachment(attachmentViewer.attachment) ||
              isTextPreviewAttachment(attachmentViewer.attachment)
              ? " document-viewer"
              : ""
              }${attachmentViewerShowsFooter ? " with-footer" : " without-footer"}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-media-viewer-title"
            aria-busy={attachmentViewer.loading}
            tabIndex={-1}
          >
            <header className="message-media-viewer-header">
              <div className="message-media-viewer-identity">
                {renderAccountAvatar(
                  attachmentViewer.message.sender,
                  "message-avatar small",
                )}
                <div>
                  <strong>{attachmentViewer.message.sender.displayName}</strong>
                  <span id="message-media-viewer-title">
                    {notificationTimestampLabel(
                      attachmentViewer.message.sentAt,
                    )}{" "}
                    · {attachmentViewer.attachment.originalFileName}
                  </span>
                </div>
              </div>

              <div className="message-media-viewer-actions">
                <button
                  type="button"
                  onClick={() =>
                    void handleDownloadAttachment(
                      attachmentViewer.message,
                      attachmentViewer.attachment,
                    )
                  }
                  aria-label={t("attachment.downloadNamed", { name: attachmentViewer.attachment.originalFileName })}
                >
                  <AttachmentGlyph name="download" />
                  <span>{t("attachment.download")}</span>
                </button>
                <button
                  type="button"
                  className="close"
                  data-message-media-viewer-close="true"
                  onClick={closeAttachmentViewer}
                  aria-label={t("attachment.closePreview")}
                >
                  ×
                </button>
              </div>
            </header>

            <div
              className={`message-media-viewer-body ${isImageAttachment(attachmentViewer.attachment)
                ? "is-image"
                : isVideoAttachment(attachmentViewer.attachment)
                  ? "is-video"
                  : isAudioAttachment(attachmentViewer.attachment)
                    ? "is-audio"
                    : isPdfAttachment(attachmentViewer.attachment)
                      ? "is-pdf"
                      : isTextPreviewAttachment(attachmentViewer.attachment)
                        ? "is-text"
                        : ""
                }`}
            >
              {attachmentViewerIndex > 0 && (
                <button
                  type="button"
                  className="message-media-viewer-navigation previous"
                  onClick={() =>
                    void handlePreviewAttachment(
                      attachmentViewer.message,
                      attachmentViewerItems[attachmentViewerIndex - 1],
                    )
                  }
                  aria-label={t("attachment.previous")}
                >
                  ‹
                </button>
              )}

              {attachmentViewer.loading && (
                <div
                  className="message-media-viewer-state"
                  role="status"
                  aria-live="polite"
                >
                  <span className="message-small-spinner" aria-hidden="true" />
                  <p>{t("attachment.loadingPreview")}</p>
                </div>
              )}

              {!attachmentViewer.loading && attachmentViewer.error && (
                <div className="message-media-viewer-state error" role="alert">
                  <AttachmentGlyph name="retry" />
                  <strong>{t("attachment.previewUnavailable")}</strong>
                  <p>{attachmentViewer.error}</p>
                </div>
              )}

              {!attachmentViewer.loading &&
                !attachmentViewer.error &&
                attachmentViewer.objectUrl &&
                isImageAttachment(attachmentViewer.attachment) && (
                  <img
                    src={attachmentViewer.objectUrl}
                    alt={attachmentViewer.attachment.originalFileName}
                  />
                )}

              {!attachmentViewer.loading &&
                !attachmentViewer.error &&
                attachmentViewer.objectUrl &&
                isVideoAttachment(attachmentViewer.attachment) && (
                  <video
                    src={attachmentViewer.objectUrl}
                    controls
                    playsInline
                  >
                    {t("announcementAttachment.browserVideoUnsupported")}
                  </video>
                )}

              {!attachmentViewer.loading &&
                !attachmentViewer.error &&
                attachmentViewer.objectUrl &&
                isAudioAttachment(attachmentViewer.attachment) && (
                  <div className="message-media-viewer-audio">
                    <CompactAttachmentAudio
                      src={attachmentViewer.objectUrl}
                      voiceNote={
                        getMessagePayloadValue(
                          attachmentViewer.message,
                          "attachmentKind",
                        ) === "VOICE_NOTE"
                      }
                      senderDisplayName={
                        attachmentViewer.message.sender.displayName
                      }
                      senderPhotoUrl={
                        profilePhotoUrls[
                        attachmentViewer.message.sender.accountId
                        ] ?? null
                      }
                    />
                  </div>
                )}

              {!attachmentViewer.loading &&
                !attachmentViewer.error &&
                attachmentViewer.objectUrl &&
                (isPdfAttachment(attachmentViewer.attachment) ||
                  isTextPreviewAttachment(attachmentViewer.attachment)) && (
                  <iframe
                    title={attachmentViewer.attachment.originalFileName}
                    src={attachmentViewer.objectUrl}
                  />
                )}

              {attachmentViewerIndex >= 0 &&
                attachmentViewerIndex < attachmentViewerItems.length - 1 && (
                  <button
                    type="button"
                    className="message-media-viewer-navigation next"
                    onClick={() =>
                      void handlePreviewAttachment(
                        attachmentViewer.message,
                        attachmentViewerItems[attachmentViewerIndex + 1],
                      )
                    }
                    aria-label={t("attachment.next")}
                  >
                    ›
                  </button>
                )}
            </div>

            {attachmentViewerShowsFooter && (
              <footer className="message-media-viewer-footer">
                <div>
                  <strong>
                    {attachmentViewer.attachment.originalFileName}
                  </strong>
                  <span>
                    {t(attachmentTypeTranslationKey(attachmentViewer.attachment))} ·{" "}
                    {formatFileSize(attachmentViewer.attachment.fileSizeBytes)}
                  </span>
                </div>
                {attachmentViewerItems.length > 1 &&
                  attachmentViewerIndex >= 0 && (
                    <span>
                      {attachmentViewerIndex + 1} /{" "}
                      {attachmentViewerItems.length}
                    </span>
                  )}
              </footer>
            )}
          </section>
        </div>
      )}

      {announcementAttachmentViewer && (
        <div
          className="message-media-viewer-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closeAnnouncementAttachmentViewer();
            }
          }}
        >
          <section
            className={`message-media-viewer${isAnnouncementPdfAttachment(
              announcementAttachmentViewer.attachment,
            ) ||
              isAnnouncementTextAttachment(
                announcementAttachmentViewer.attachment,
              )
              ? " document-viewer"
              : ""
              }${announcementAttachmentViewerShowsFooter
                ? " with-footer"
                : " without-footer"
              }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="announcement-attachment-viewer-title"
            aria-busy={announcementAttachmentViewer.loading}
            data-message-modal="announcement-attachment-viewer"
            tabIndex={-1}
          >
            <header className="message-media-viewer-header">
              <div className="message-media-viewer-identity">
                <span className="message-avatar small" aria-hidden="true">
                  {initials(
                    announcementAttachmentViewer.announcement.publisher
                      .displayName,
                  )}
                </span>
                <div>
                  <strong>
                    {
                      announcementAttachmentViewer.announcement.publisher
                        .displayName
                    }
                  </strong>
                  <span id="announcement-attachment-viewer-title">
                    {t("announcementAttachment.viewerTitle", {
                      name: announcementAttachmentViewer.attachment.originalFileName,
                    })}
                  </span>
                </div>
              </div>

              <div className="message-media-viewer-actions">
                {(announcementAttachmentViewer.announcement
                  .allowAttachmentDownload ||
                  announcementAttachmentViewer.announcement.canManage) && (
                    <button
                      type="button"
                      onClick={() =>
                        void handleAnnouncementAttachmentDownload(
                          announcementAttachmentViewer.attachment,
                        )
                      }
                      aria-label={`Download ${announcementAttachmentViewer.attachment.originalFileName}`}
                    >
                      <AttachmentGlyph name="download" />
                      <span>{t("attachment.download")}</span>
                    </button>
                  )}
                <button
                  type="button"
                  className="close"
                  data-message-modal-initial-focus="true"
                  onClick={closeAnnouncementAttachmentViewer}
                  aria-label={t("announcementAttachment.close")}
                >
                  ×
                </button>
              </div>
            </header>

            <div
              className={`message-media-viewer-body ${isAnnouncementImageAttachment(
                announcementAttachmentViewer.attachment,
              )
                ? "is-image"
                : isAnnouncementVideoAttachment(
                  announcementAttachmentViewer.attachment,
                )
                  ? "is-video"
                  : isAnnouncementPdfAttachment(
                    announcementAttachmentViewer.attachment,
                  )
                    ? "is-pdf"
                    : isAnnouncementTextAttachment(
                      announcementAttachmentViewer.attachment,
                    )
                      ? "is-text"
                      : ""
                }`}
            >
              {announcementAttachmentViewerIndex > 0 && (
                <button
                  type="button"
                  className="message-media-viewer-navigation previous"
                  onClick={() =>
                    void handleAnnouncementAttachmentOpen(
                      announcementAttachmentViewerItems[
                      announcementAttachmentViewerIndex - 1
                      ],
                    )
                  }
                  aria-label={t("announcementAttachment.previous")}
                >
                  ‹
                </button>
              )}

              {announcementAttachmentViewer.loading && (
                <div
                  className="message-media-viewer-state"
                  role="status"
                  aria-live="polite"
                >
                  <span className="message-small-spinner" aria-hidden="true" />
                  <p>{t("announcementAttachment.loading")}</p>
                </div>
              )}

              {!announcementAttachmentViewer.loading &&
                announcementAttachmentViewer.error && (
                  <div className="message-media-viewer-state error" role="alert">
                    <AttachmentGlyph name="retry" />
                    <strong>{t("announcementAttachment.unavailable")}</strong>
                    <p>{announcementAttachmentViewer.error}</p>
                  </div>
                )}

              {!announcementAttachmentViewer.loading &&
                !announcementAttachmentViewer.error &&
                announcementAttachmentViewer.objectUrl &&
                isAnnouncementImageAttachment(
                  announcementAttachmentViewer.attachment,
                ) && (
                  <img
                    src={announcementAttachmentViewer.objectUrl}
                    alt={
                      announcementAttachmentViewer.attachment.originalFileName
                    }
                  />
                )}

              {!announcementAttachmentViewer.loading &&
                !announcementAttachmentViewer.error &&
                announcementAttachmentViewer.objectUrl &&
                isAnnouncementVideoAttachment(
                  announcementAttachmentViewer.attachment,
                ) && (
                  <video
                    src={announcementAttachmentViewer.objectUrl}
                    controls
                    playsInline
                  >
                    {t("announcementAttachment.browserVideoUnsupported")}
                  </video>
                )}

              {!announcementAttachmentViewer.loading &&
                !announcementAttachmentViewer.error &&
                announcementAttachmentViewer.objectUrl &&
                (isAnnouncementPdfAttachment(
                  announcementAttachmentViewer.attachment,
                ) ||
                  isAnnouncementTextAttachment(
                    announcementAttachmentViewer.attachment,
                  )) && (
                  <iframe
                    title={
                      announcementAttachmentViewer.attachment.originalFileName
                    }
                    src={announcementAttachmentViewer.objectUrl}
                  />
                )}

              {announcementAttachmentViewerIndex >= 0 &&
                announcementAttachmentViewerIndex <
                announcementAttachmentViewerItems.length - 1 && (
                  <button
                    type="button"
                    className="message-media-viewer-navigation next"
                    onClick={() =>
                      void handleAnnouncementAttachmentOpen(
                        announcementAttachmentViewerItems[
                        announcementAttachmentViewerIndex + 1
                        ],
                      )
                    }
                    aria-label={t("announcementAttachment.next")}
                  >
                    ›
                  </button>
                )}
            </div>

            {announcementAttachmentViewerShowsFooter && (
              <footer className="message-media-viewer-footer">
                <div>
                  <strong>
                    {announcementAttachmentViewer.attachment.originalFileName}
                  </strong>
                  <span>
                    {announcementEnumLabel(
                      announcementAttachmentViewer.attachment.category,
                      t,
                    )}{" "}
                    ·{" "}
                    {formatFileSize(
                      announcementAttachmentViewer.attachment.fileSizeBytes,
                    )}
                  </span>
                </div>
                {announcementAttachmentViewerItems.length > 1 &&
                  announcementAttachmentViewerIndex >= 0 && (
                    <span>
                      {announcementAttachmentViewerIndex + 1} /{" "}
                      {announcementAttachmentViewerItems.length}
                    </span>
                  )}
              </footer>
            )}
          </section>
        </div>
      )}

    </main>
  );
}
