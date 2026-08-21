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

import { useAuth } from "../context/AuthContext";
import { useAvatarRegistry } from "../context/AvatarContext";
import { logoutAllAuth } from "../services/auth.service";
import {
  acceptMessageRequest,
  addGroupMembers,
  blockMessageRequest,
  blockMessagingAccount,
  clearMessagingConversation,
  createGroupConversation,
  createGroupInvitationLink,
  createOfficialGroupConversation,
  createPrivateConversation,
  createPrivateGroupFromPrivateConversation,
  createMessagingProfilePhotoObjectUrl,
  createGroupPhotoObjectUrl,
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
  deleteConversationMessageForMe,
  downloadConversationAttachment,
  editConversationTextMessage,
  forwardConversationMessage,
  joinGroupInvitation,
  leaveGroupConversation,
  listConversationMessages,
  listConversationPinnedMessages,
  listStarredMessages,
  listMessageRequests,
  listBlockedMessagingAccounts,
  listMessagingConversations,
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
): DestructiveConfirmationCopy {
  switch (action.kind) {
    case "DELETE_MESSAGE_FOR_ME":
      return {
        eyebrow: "Personal message action",
        title: "Delete this message for me?",
        description:
          "This message will be removed from your account only. Other participants will continue to see it.",
        consequences: [
          "This action cannot be undone from your account.",
          "Other participants and their copies are not affected.",
          "Shared attachment files remain available to authorized participants.",
        ],
        confirmLabel: "Delete message for me",
      };
    case "DELETE_MESSAGE_FOR_EVERYONE":
      return {
        eyebrow: "Conversation-wide action",
        title: "Delete this message for everyone?",
        description:
          "The message content will be removed for conversation participants and replaced by the existing deleted-message state.",
        consequences: [
          "This action cannot be undone.",
          "Separately forwarded copies remain available where authorized.",
          "Attachment cleanup follows the existing storage-reference rules.",
        ],
        confirmLabel: "Delete message for everyone",
      };
    case "LEAVE_GROUP":
      return {
        eyebrow: "Group membership",
        title: `Leave ${action.conversationTitle}?`,
        description:
          "Your membership will end and you will stop receiving new messages from this group.",
        consequences: [
          "You may lose access to group-only actions and future content.",
          "Existing history remains subject to the group history policy.",
          "A group administrator must add you again if you need to rejoin.",
        ],
        confirmLabel: "Leave group",
      };
    case "BLOCK_PRIVATE_CONTACT":
      return {
        eyebrow: "Private messaging privacy",
        title: `Block ${action.target.displayName}?`,
        description:
          "Private messages and new private-message requests with this account will be blocked.",
        consequences: [
          "Official groups and announcements remain visible where authorized.",
          "This does not remove the employee from organizational groups.",
          "You can unblock the account later from Settings.",
        ],
        confirmLabel: "Block private contact",
      };
  }
}

const PRIVATE_GROUP_HISTORY_OPTIONS: Array<{
  value: PrivateGroupHistoryWindow;
  label: string;
  description: string;
}> = [
    {
      value: "NONE",
      label: "No previous messages",
      description: "Only future private-group messages will be visible.",
    },
    {
      value: "LAST_15_MINUTES",
      label: "Last 15 minutes",
      description: "Copy only the most recent private-chat context.",
    },
    {
      value: "LAST_1_HOUR",
      label: "Last 1 hour",
      description: "Copy private-chat context from the last hour.",
    },
    {
      value: "LAST_24_HOURS",
      label: "Last 24 hours",
      description: "Copy private-chat context from the last day only.",
    },
  ];
const SELECTED_CONVERSATION_STORAGE_KEY = "nt-message:selected-conversation";
const HIGHLIGHT_MESSAGE_STORAGE_KEY = "nt-message:highlight-message";
const MESSAGE_NAVIGATION_STORAGE_KEY = "nt-message:navigation-expanded";
const NOTIFICATION_SOUND_URL = "/sounds/web-whatsapp.mp3";
const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
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

const SETTINGS_TABS: Array<{ value: MessagingSettingsTab; label: string }> = [
  { value: "PRIVACY", label: "Privacy & requests" },
  { value: "NOTIFICATIONS", label: "Notifications" },
  { value: "APPEARANCE", label: "Appearance" },
  { value: "STORAGE", label: "Storage & data" },
  { value: "BLOCKED", label: "Blocked users" },
  { value: "SECURITY", label: "Security" },
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
    label: "Smileys",
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
    label: "Gestures",
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
    label: "Hearts & symbols",
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
    label: "Celebration",
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
    label: "Food & nature",
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
  viewerAccountId?: string | null,
): MessageReactionGroup[] {
  const grouped = new Map<string, MessageReactionGroup>();

  for (const reaction of message.reactions ?? []) {
    if (!isSupportedQuickReaction(reaction.reactionValue)) {
      continue;
    }

    const existing = grouped.get(reaction.reactionValue);
    const displayName =
      reaction.account?.displayName ??
      (reaction.accountId === viewerAccountId ? "You" : "Unknown user");

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
}: {
  src: string;
  voiceNote: boolean;
  senderDisplayName?: string;
  senderPhotoUrl?: string | null;
}) {
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
            <span>{initials(senderDisplayName ?? "Voice message")}</span>
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
        aria-label={playing ? "Pause audio" : "Play audio"}
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
          aria-label="Audio playback position"
        />

        <div className="message-audio-meta-v3">
          <span>
            {formatRecordingDuration(currentTime > 0 ? currentTime : duration)}
          </span>
          <span>{voiceNote ? "Voice message" : "Audio"}</span>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) =>
          setDuration(
            Number.isFinite(event.currentTarget.duration)
              ? event.currentTarget.duration
              : 0,
          )
        }
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
}: MessageAttachmentCardProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewRequestVersion, setPreviewRequestVersion] = useState(0);
  const visualKind = attachmentVisualKind(attachment);
  const canPreview = canPreviewAttachment(attachment);
  const mediaPreview =
    isImageAttachment(attachment) || isVideoAttachment(attachment);
  const audioPreview = isAudioAttachment(attachment);
  const needsProtectedPreview = mediaPreview || audioPreview;

  useEffect(() => {
    if (!accessToken || !needsProtectedPreview) {
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    setPreviewUrl(null);
    setPreviewError(null);

    // Media remains behind the authenticated API; a temporary object URL keeps
    // access tokens and private attachment endpoints out of the rendered DOM.
    void createConversationAttachmentObjectUrl(
      accessToken,
      conversationId,
      messageId,
      attachment.id,
    )
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
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
            : "Attachment preview could not be loaded.",
        );
      });

    return () => {
      cancelled = true;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [
    accessToken,
    attachment.id,
    conversationId,
    messageId,
    needsProtectedPreview,
    previewRequestVersion,
  ]);

  const displayName = isVoiceNote ? "Voice note" : attachment.originalFileName;
  const attachmentMeta = `${attachmentTypeLabel(attachment)} · ${formatFileSize(
    attachment.fileSizeBytes,
  )}`;

  return (
    <article
      className={`message-attachment-card-v2 message-attachment-${visualKind}-v2${previewError ? " has-preview-error" : ""
        }`}
      aria-label={`${displayName}, ${attachmentMeta}`}
    >
      {mediaPreview && (
        <div className="message-attachment-media-v2">
          {previewUrl ? (
            <button
              type="button"
              className="message-attachment-media-open-v2"
              onClick={() => onPreview(attachment)}
              aria-label={`Preview ${attachment.originalFileName}`}
            >
              {isImageAttachment(attachment) ? (
                <img src={previewUrl} alt={attachment.originalFileName} />
              ) : (
                <video src={previewUrl} muted playsInline preload="metadata" />
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
              <strong>Preview unavailable</strong>
              <button
                type="button"
                onClick={() => setPreviewRequestVersion((value) => value + 1)}
              >
                Try again
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
                Loading {isVideoAttachment(attachment) ? "video" : "image"}
              </strong>
            </div>
          )}
        </div>
      )}

      {audioPreview &&
        (previewUrl ? (
          <CompactAttachmentAudio
            src={previewUrl}
            voiceNote={isVoiceNote}
            senderDisplayName={senderDisplayName}
            senderPhotoUrl={senderPhotoUrl}
          />
        ) : previewError ? (
          <div className="message-attachment-preview-state-v2 error audio">
            <AttachmentGlyph name="audio" />
            <span>Audio unavailable</span>
            <button
              type="button"
              onClick={() => setPreviewRequestVersion((value) => value + 1)}
            >
              Retry
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
              {isVoiceNote ? "Loading voice message" : "Loading audio"}
            </span>
          </div>
        ))}

      {!needsProtectedPreview && (
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

function announcementEnumLabel(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
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
      typeof value.label === "string" ? value.label : "Official announcement",
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
): string[] {
  if (!conversation || conversation.type !== "GROUP") {
    return [];
  }

  return conversation.participants
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

function locationStatusLabel(location: MessagingLocationPayload): string {
  if (location.kind === "CURRENT") {
    return "Current location";
  }

  if (location.liveStoppedAt) {
    return "Live location stopped";
  }

  if (
    location.liveExpiresAt &&
    new Date(location.liveExpiresAt).getTime() <= Date.now()
  ) {
    return "Live location expired";
  }

  return "Live location active";
}

function formatLocationCoordinate(value: number): string {
  return value.toFixed(5);
}

function formatLocationUpdatedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Updated just now";
  }

  return `Updated ${formatMessageTime(value)}`;
}

function browserNotificationPermissionLabel(): string {
  if (!("Notification" in window)) {
    return "Unsupported";
  }

  switch (window.Notification.permission) {
    case "granted":
      return "Allowed";
    case "denied":
      return "Blocked";
    default:
      return "Not requested";
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
  const location = getMessageLocationPayload(message);

  if (!location) {
    return null;
  }

  const active = isLiveLocationActive(location);
  const ownMessage = message.senderAccountId === viewerAccountId;
  const statusLabel = location.label ?? locationStatusLabel(location);

  return (
    <article className={`message-location-card-v2${active ? " live" : ""}`}>
      <a
        className="message-location-map-v2"
        href={location.mapUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${statusLabel} in maps`}
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
          Updated {formatLocationUpdatedAt(location.updatedAt)}
          {location.accuracyMeters !== null
            ? ` · ±${Math.round(location.accuracyMeters)}m`
            : ""}
        </small>

        <div className="message-location-actions-v2">
          <a href={location.mapUrl} target="_blank" rel="noreferrer">
            Open map
          </a>

          {ownMessage && active && (
            <button
              type="button"
              onClick={() => onStop(message)}
              disabled={stopping}
            >
              {stopping ? "Stopping…" : "Stop sharing"}
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
  if (isZipAttachment(attachment)) {
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

function attachmentTypeLabel(attachment: MessagingAttachment): string {
  if (isImageAttachment(attachment)) {
    return "Image";
  }

  if (isVideoAttachment(attachment)) {
    return "Video";
  }

  if (isAudioAttachment(attachment)) {
    return "Audio";
  }

  if (isPdfAttachment(attachment)) {
    return "PDF document";
  }

  if (isTextPreviewAttachment(attachment)) {
    return "Text document";
  }

  return "Document";
}

function attachmentLabel(
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
    return "Message";
  }

  if (isImageAttachment(firstAttachment)) {
    return "Photo";
  }

  if (isVideoAttachment(firstAttachment)) {
    return "Video";
  }

  if (isAudioAttachment(firstAttachment)) {
    return getMessagePayloadValue(message, "attachmentKind") === "VOICE_NOTE"
      ? "Voice note"
      : "Audio";
  }

  return `File: ${firstAttachment.originalFileName}`;
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

function sharedLinkDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "External link";
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

    void createConversationAttachmentObjectUrl(
      accessToken,
      item.conversationId,
      item.messageId,
      item.attachment.id,
    )
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
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

      if (createdObjectUrl) {
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

  // Text and attachment messages share the same forward dialog.
  return Boolean(message.textContent || (message.attachments?.length ?? 0) > 0);
}

function roleLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

type MessageNavigationIconName =
  | "search"
  | "chats"
  | "requests"
  | "groups"
  | "official"
  | "announcement"
  | "appearance"
  | "settings"
  | "starred"
  | "bell"
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

function officialScopeLabel(conversation: MessagingConversation): string {
  const scope = conversation.officialScope;

  if (!scope) {
    return "Official organizational group";
  }

  if (scope.scopeType === "ORGANIZATION") {
    return "Organization-wide official group";
  }

  if (scope.scopeType === "DIVISION") {
    return `${scope.division?.name ?? "Division"} official group`;
  }

  return `${scope.department?.name ?? "Department"} official group`;
}

function officialAuditLabel(entry: OfficialGroupAuditEntry): string {
  if (entry.action === "CREATED") {
    return "Official group created";
  }

  if (entry.action === "DETAILS_UPDATED") {
    return "Group details updated";
  }

  if (entry.action === "RECONCILED") {
    return "Membership reconciled";
  }

  return "Membership synchronized";
}

function requestReasonLabel(reason: MessagingMessageRequest["reason"]): string {
  if (reason === "PROTECTED_RECIPIENT") {
    return "Protected first contact";
  }

  if (reason === "CROSS_DIVISION") {
    return "Different division";
  }

  return "Different department";
}

function starredMessagePreview(item: StarredMessageItem): string {
  const { message } = item;

  if (message.isDeleted) {
    return "This message is no longer available.";
  }

  if (message.textContent?.trim()) {
    return message.textContent.trim();
  }

  if (message.contentType === "LOCATION") {
    return "Shared location";
  }

  const firstAttachment = message.attachments?.[0];

  if (firstAttachment) {
    const attachmentCount = message.attachments?.length ?? 1;
    return attachmentCount > 1
      ? `${firstAttachment.originalFileName} and ${attachmentCount - 1} more`
      : firstAttachment.originalFileName;
  }

  return "Message";
}

function requestStatusLabel(request: MessagingMessageRequest): string {
  if (request.status === "PENDING") {
    return request.direction === "RECEIVED"
      ? "Awaiting your response"
      : "Awaiting response";
  }

  return roleLabel(request.status);
}

function contactActionLabel(contact: MessagingContact): string {
  if (contact.contactMode === "REQUEST_REQUIRED") {
    return "Request";
  }

  if (contact.contactMode === "REQUEST_SENT") {
    return "Pending";
  }

  if (contact.contactMode === "REQUEST_RECEIVED") {
    return "Review";
  }

  if (contact.contactMode === "BLOCKED") {
    return "Blocked";
  }

  return "Message";
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

function messagePreview(
  conversation: MessagingConversation,
  accountId: string,
): string {
  const message = conversation.lastMessage;

  if (!message) {
    return "Start the conversation";
  }

  if (message.isDeleted) {
    return "Message deleted";
  }

  const prefix = message.senderAccountId === accountId ? "You: " : "";

  const announcementPrefix = isOfficialAnnouncementMessage(message)
    ? "Announcement: "
    : "";

  return `${prefix}${announcementPrefix}${message.forwardedFrom ? "Forwarded: " : ""}${attachmentLabel(message)}`;
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
  const { account, accessToken, logout } = useAuth();
  const { refreshAvatar } = useAvatarRegistry();
  const mainWorkspacePath = workspacePathForRole(account?.role);
  const announcementMode = location.pathname.startsWith(
    "/messages/announcements",
  );
  const starredMode = location.pathname.startsWith("/messages/starred");
  const requestMode = location.pathname.startsWith("/messages/requests");
  const notificationMode = location.pathname.startsWith(
    "/messages/notifications",
  );
  const settingsMode = location.pathname.startsWith("/messages/settings");
  const ownProfileMode = location.pathname.startsWith("/messages/profile");
  const newConversationMode = location.pathname.startsWith("/messages/new");
  const createGroupMode = location.pathname.startsWith("/messages/groups/new");

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
    useState<ConversationListView>("ACTIVE");
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
  const [conversationPreferenceLoading, setConversationPreferenceLoading] =
    useState<string | null>(null);
  const [conversationLoading, setConversationLoading] = useState(true);
  const [messageLoading, setMessageLoading] = useState(false);
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [sendAttemptFailed, setSendAttemptFailed] = useState(false);
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
        ?.focus();
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
    const gap = 8;
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
    const preferredLeft = messageActionMenuAnchor.ownMessage
      ? messageActionMenuAnchor.left - menuRect.width - gap
      : messageActionMenuAnchor.right + gap;
    const alternateLeft = messageActionMenuAnchor.ownMessage
      ? messageActionMenuAnchor.right + gap
      : messageActionMenuAnchor.left - menuRect.width - gap;
    const fitsHorizontally = (left: number) =>
      left >= minLeft && left <= maxLeft;
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
    const availableBelow =
      messageActionMenuAnchor.boundaryBottom -
      threadPadding -
      messageActionMenuAnchor.bottom;
    const availableAbove =
      messageActionMenuAnchor.top -
      (messageActionMenuAnchor.boundaryTop + threadPadding);
    const belowTop = messageActionMenuAnchor.bottom + gap;
    const aboveTop = messageActionMenuAnchor.top - menuRect.height - gap;

    // A message menu behaves like an anchored popover: it opens directly
    // below the More button when space allows, otherwise directly above it.
    // Clamping is only the final fallback for unusually small thread areas.
    const preferredTop =
      availableBelow >= menuRect.height + gap
        ? belowTop
        : availableAbove >= menuRect.height + gap
          ? aboveTop
          : availableBelow >= availableAbove
            ? belowTop
            : aboveTop;
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
            : "Messaging privacy settings could not be loaded.",
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
          : "Blocked accounts could not be loaded.",
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
  const messageThreadBottomRef = useRef<HTMLDivElement | null>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const messageListNearBottomRef = useRef(true);
  const pendingOlderScrollRestoreRef = useRef<{
    conversationId: string;
    scrollHeight: number;
    scrollTop: number;
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
      : destructiveConfirmation?.kind === "LEAVE_GROUP"
        ? groupSubmitting
        : destructiveConfirmation?.kind === "BLOCK_PRIVATE_CONTACT"
          ? blockActionAccountId === destructiveConfirmation.target.accountId
          : false,
  );
  const destructiveConfirmationContent = destructiveConfirmation
    ? destructiveConfirmationCopy(destructiveConfirmation)
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
    storageUsageScope !== null,
    "storage-usage",
    closeStorageUsage,
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
    messageInformation !== null || messageInformationError !== null,
    "message-information",
    closeMessageInformationDialog,
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

  const mentionSuggestions = useMemo(() => {
    if (
      !activeMentionQuery ||
      !selectedConversation ||
      selectedConversation.type !== "GROUP" ||
      editingMessage
    ) {
      return [];
    }

    const query = activeMentionQuery.query;

    return selectedConversation.participants
      .filter((participant) => participant.accountId !== account?.id)
      .filter((participant) =>
        query ? mentionSearchText(participant).includes(query) : true,
      )
      .slice(0, 6);
  }, [account?.id, activeMentionQuery, editingMessage, selectedConversation]);

  const activeMentionQueryKey = activeMentionQuery
    ? `${activeMentionQuery.startIndex}:${activeMentionQuery.endIndex}:${activeMentionQuery.query}`
    : "";
  const mentionSuggestionsVisible = Boolean(
    !mentionSuggestionsDismissed &&
    activeMentionQuery &&
    mentionSuggestions.length > 0,
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
              : "Search could not be completed.",
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
      if (attachmentViewer?.objectUrl) {
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
    if (!storageUsageScope) {
      return;
    }

    function handleStorageDialogKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === "Escape") {
        closeStorageUsage();
      }
    }

    window.addEventListener("keydown", handleStorageDialogKeyDown);

    return () => {
      window.removeEventListener("keydown", handleStorageDialogKeyDown);
    };
  }, [storageUsageScope]);

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
            : "Profile could not be loaded.",
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
    messageInformation?.recipients.forEach((recipient) =>
      collectAccount(recipient.account),
    );
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

  const announcementGroupSearchResults = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();

    if (!query) {
      return officialGroupConversations;
    }

    return officialGroupConversations.filter((conversation) =>
      [
        conversation.title,
        conversation.description,
        officialScopeLabel(conversation),
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
        starredMessagePreview(item),
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
        requestReasonLabel(request.reason),
        requestStatusLabel(request),
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

    if (!search) {
      return conversations;
    }

    return conversations.filter((conversation) => {
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
  }, [conversations, forwardSearch]);

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
          conversationListView,
        );

        setConversations(response.data);
        setPageError(null);

        setSelectedConversationId((current) => {
          const candidate = preferredConversationId ?? current;

          if (
            candidate &&
            response.data.some((conversation) => conversation.id === candidate)
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
              : "Conversations could not be loaded.",
          );
        }
      } finally {
        if (!silent) {
          setConversationLoading(false);
        }
      }
    },
    [accessToken, conversationListView],
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
            : "Announcements could not be loaded for this official group.",
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
            : "Announcement details could not be loaded.",
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
          "This announcement cannot be edited in its current state.",
        );
      }

      if (detail.audience.officialGroup?.id !== selectedConversation.id) {
        throw new Error(
          "The announcement does not belong to the selected official group.",
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
          : "Announcement could not be prepared for editing.",
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
                    : "Attachment could not be removed.",
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
      throw new Error("Your session is required to upload announcement files.");
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
          throw new Error("The uploaded attachment record was not returned.");
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
            : "Announcement attachment could not be uploaded.";
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
      throw new Error("Announcement title must contain at least 5 characters.");
    }

    if (!body) {
      throw new Error("Announcement message is required.");
    }

    const now = Date.now();
    let scheduledAt: string | null = null;

    if (announcementComposerValues.publishTiming === "SCHEDULE") {
      if (!announcementComposerValues.scheduledAt) {
        throw new Error("Choose a future date and time for the announcement.");
      }

      const scheduledDate = new Date(announcementComposerValues.scheduledAt);
      if (
        Number.isNaN(scheduledDate.getTime()) ||
        scheduledDate.getTime() <= now
      ) {
        throw new Error("Scheduled publication time must be in the future.");
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
            ? "Expiry time must be after the scheduled publication time."
            : "Expiry time must be in the future.",
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
        "Publishing access is no longer available for this official group.",
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
            "The announcement selected for editing is no longer available.",
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
          "Announcement and attachments updated successfully.",
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
          : "Announcement could not be published.",
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
          : "The temporary announcement draft could not be removed.",
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
          : "Announcement could not be acknowledged.",
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
          : "Announcement could not be deleted.",
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
            : "Attachment preview could not be opened.",
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
          : "Attachment could not be downloaded.",
      );
    } finally {
      setAnnouncementAttachmentActionId(null);
    }
  }

  const loadStarredMessages = useCallback(
    async (silent = false): Promise<void> => {
      if (!accessToken) {
        setStarredItems([]);
        return;
      }

      if (!silent) {
        setStarredLoading(true);
      }

      try {
        const response = await listStarredMessages(accessToken);
        setStarredItems(response.data);
        setStarredError(null);
      } catch (error) {
        if (!silent) {
          setStarredError(
            error instanceof Error
              ? error.message
              : "Starred messages could not be loaded.",
          );
        }
      } finally {
        if (!silent) {
          setStarredLoading(false);
        }
      }
    },
    [accessToken],
  );

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
              : "Message requests could not be loaded.",
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

      if (!silent) {
        setMessageLoading(true);
        setMessages([]);
      }

      try {
        const response = await listConversationMessages(
          accessToken,
          conversationId,
          undefined,
          50,
        );

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

        // Keep an older search result visible even when the first page does not contain it.
        setMessages(nextMessages);
        setMessageCursor(response.pagination.nextCursor);
        setHasOlderMessages(response.pagination.hasMore);
        setMessageError(null);

        const hasUnreadIncomingMessage = response.data.some(
          (message) =>
            message.senderAccountId !== account?.id && message.readAt === null,
        );

        if (!silent || hasUnreadIncomingMessage) {
          try {
            await markConversationRead(accessToken, conversationId);

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
          } catch (error) {
            if (!silent) {
              setMessageError(
                error instanceof Error
                  ? `Messages loaded, but read status could not be updated: ${error.message}`
                  : "Messages loaded, but read status could not be updated.",
              );
            }
          }
        }
      } catch (error) {
        if (!silent) {
          setMessageError(
            error instanceof Error
              ? error.message
              : "Messages could not be loaded.",
          );
        }
      } finally {
        if (!silent) {
          setMessageLoading(false);
        }
      }
    },
    [accessToken, account?.id],
  );

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
          : "Conversation controls could not be updated.",
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
    if (!notificationActionNotice) {
      return;
    }

    const timer = window.setTimeout(() => {
      setNotificationActionNotice(null);
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [notificationActionNotice]);

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
          : "Notifications could not be loaded.",
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
        "Notification" in window &&
        window.Notification.permission === "granted"
      ) {
        const browserNotification = new window.Notification(
          payload.notification.title,
          {
            body: messagingSettings.notificationPreview
              ? payload.notification.body
              : "Open NT Message to view this notification.",
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

      void loadConversations(
        true,
        selectedConversationIdRef.current ?? undefined,
      );

      if (payload.conversationId !== selectedConversationIdRef.current) {
        return;
      }

      if (messageIdsRef.current.has(payload.message.id)) {
        return;
      }

      messageIdsRef.current.add(payload.message.id);
      setMessages((current) => [...current, payload.message]);

      if (!messageListNearBottomRef.current) {
        setNewMessageCount((current) => current + 1);
      }

      void loadMessages(payload.conversationId, true);
    };

    const handleMessageUpdated = (
      payload: MessagingMessageUpdatedPayload,
    ): void => {
      void loadConversations(
        true,
        selectedConversationIdRef.current ?? undefined,
      );

      if (payload.conversationId !== selectedConversationIdRef.current) {
        return;
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
      void loadConversations(
        true,
        selectedConversationIdRef.current ?? undefined,
      );

      if (payload.conversationId !== selectedConversationIdRef.current) {
        return;
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
      void loadConversations(
        true,
        selectedConversationIdRef.current ?? undefined,
      );

      if (payload.conversationId === selectedConversationIdRef.current) {
        void loadMessages(payload.conversationId, true);
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

      void loadConversations(
        true,
        payload.reason === "DELETED_FOR_ACCOUNT"
          ? undefined
          : (selectedConversationIdRef.current ?? undefined),
      );
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

    socket.on("connect", handleConnect);
    socket.on("messaging:ready", handleReady);
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
      socket.off("connect", handleConnect);
      socket.off("messaging:ready", handleReady);
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
    loadConversations,
    loadMessageRequests,
    loadMessages,
    loadNotifications,
    loadPinnedMessages,
    loadSelectedGroupAnnouncements,
    browserNotificationsEnabled,
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
    void loadConversations();
  }, [loadConversations]);

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
    setPinnedMessageBrowserOpen(false);
    setActivePinnedMessageIndex(0);
    messageListNearBottomRef.current = true;
    pendingOlderScrollRestoreRef.current = null;

    if (!selectedConversationId || announcementMode) {
      setMessageText("");
      setMessages([]);
      setPinnedMessages([]);
      draftConversationIdRef.current = null;
      pendingBottomScrollConversationIdRef.current = null;
      previousScrollConversationIdRef.current = null;
      previousMessageCountRef.current = 0;
      return;
    }

    // New conversations should open from the latest message after messages finish loading.
    pendingBottomScrollConversationIdRef.current = selectedConversationId;
    previousScrollConversationIdRef.current = null;
    previousMessageCountRef.current = 0;

    void loadMessages(selectedConversationId);
    void loadPinnedMessages(selectedConversationId);
  }, [
    announcementMode,
    loadMessages,
    loadPinnedMessages,
    selectedConversation?.groupKind,
    selectedConversation?.type,
    selectedConversationId,
  ]);

  function scrollMessageThreadToBottom(): void {
    const element = messageListRef.current;

    if (!element) {
      return;
    }

    const renderedMessages =
      element.querySelectorAll<HTMLElement>("[data-message-id]");
    const lastMessage = renderedMessages.item(renderedMessages.length - 1);

    element.scrollTop = element.scrollHeight;
    lastMessage?.scrollIntoView({
      block: "end",
      behavior: "auto",
    });
    messageThreadBottomRef.current?.scrollIntoView({
      block: "end",
      behavior: "auto",
    });

    element.scrollTop = element.scrollHeight;
    messageListNearBottomRef.current = true;
    setNewMessageCount(0);
  }

  function handleMessageThreadScroll(): void {
    const element = messageListRef.current;

    if (!element) {
      return;
    }

    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    const nearBottom = distanceFromBottom < 160;
    const pendingOlderScrollRestore = pendingOlderScrollRestoreRef.current;

    if (pendingOlderScrollRestore) {
      pendingOlderScrollRestore.scrollHeight = element.scrollHeight;
      pendingOlderScrollRestore.scrollTop = element.scrollTop;
    }

    messageListNearBottomRef.current = nearBottom;

    if (nearBottom) {
      setNewMessageCount(0);
    }
  }

  function jumpToLatestMessages(): void {
    const element = messageListRef.current;

    setNewMessageCount(0);
    messageListNearBottomRef.current = true;

    if (!element) {
      return;
    }

    element.scrollTo({
      top: element.scrollHeight,
      behavior: "smooth",
    });
    messageThreadBottomRef.current?.scrollIntoView({
      block: "end",
      behavior: "smooth",
    });
  }

  function scheduleBottomScrollRetries(
    clearPendingInitialScroll: boolean,
  ): () => void {
    const timers: number[] = [];
    let frameId: number | null = null;
    let nestedFrameId: number | null = null;

    const run = () => {
      scrollMessageThreadToBottom();
    };

    run();
    frameId = window.requestAnimationFrame(() => {
      run();

      nestedFrameId = window.requestAnimationFrame(run);
    });

    [60, 180, 360, 720, 1200].forEach((delay) => {
      timers.push(window.setTimeout(run, delay));
    });

    if (clearPendingInitialScroll) {
      timers.push(
        window.setTimeout(() => {
          pendingBottomScrollConversationIdRef.current = null;
        }, 1250),
      );
    }

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      if (nestedFrameId !== null) {
        window.cancelAnimationFrame(nestedFrameId);
      }

      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }

  useLayoutEffect(() => {
    if (messageLoading || olderMessagesLoading) {
      return undefined;
    }

    const element = messageListRef.current;

    if (!element) {
      return undefined;
    }

    const messagesBelongToSelectedConversation =
      !selectedConversationId ||
      messages.length === 0 ||
      messages.every(
        (message) => message.conversationId === selectedConversationId,
      );

    if (!messagesBelongToSelectedConversation) {
      return undefined;
    }

    const pendingOlderScrollRestore = pendingOlderScrollRestoreRef.current;

    if (
      pendingOlderScrollRestore &&
      pendingOlderScrollRestore.conversationId === selectedConversationId
    ) {
      const prependedHeight = Math.max(
        0,
        element.scrollHeight - pendingOlderScrollRestore.scrollHeight,
      );

      element.scrollTop =
        pendingOlderScrollRestore.scrollTop + prependedHeight;
      pendingOlderScrollRestoreRef.current = null;
      messageListNearBottomRef.current = false;
      previousScrollConversationIdRef.current = selectedConversationId;
      previousMessageCountRef.current = messages.length;
      return undefined;
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

    let cancelBottomScrollRetries: (() => void) | null = null;

    if (shouldScrollToBottom) {
      // Admin refresh can resize after render; repeat the anchor until the shell settles.
      cancelBottomScrollRetries = scheduleBottomScrollRetries(
        pendingInitialBottomScroll,
      );
    }

    previousScrollConversationIdRef.current = selectedConversationId;
    previousMessageCountRef.current = messages.length;

    if (preserveScrollForFocusedMessage) {
      pendingFocusedMessageScrollRef.current = null;
    }

    return () => {
      cancelBottomScrollRetries?.();
    };
  }, [messageLoading, messages, olderMessagesLoading, selectedConversationId]);

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

      // Search navigation focuses the exact result when it is loaded in the thread.
      messageElement?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }, 120);

    const clearTimer = window.setTimeout(() => {
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
                : "Contacts could not be loaded.",
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
                : "Group contacts could not be loaded.",
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
                : "Private group contacts could not be loaded.",
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
              : "Official group scopes could not be loaded.",
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
              : "Official group audit history could not be loaded.",
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
              : "Invitation link could not be loaded.",
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
            : "Group invitation link could not be accepted.",
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
          : "The group could not be created.",
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
          : "Private group could not be created.",
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
          : "Official groups could not be reconciled.",
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
          : "The group details could not be updated.",
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
          : "Invitation link could not be generated.",
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
      setGroupInviteNotice("Invitation link copied.");
      setGroupInviteError(null);
    } catch {
      setGroupInviteError("Invitation link could not be copied automatically.");
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

    if (!window.confirm("Revoke this group invitation link?")) {
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
          : "Invitation link could not be revoked.",
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
      setGroupError("Choose a JPG, PNG or WEBP group photo.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setGroupError("Group photo must be 5 MB or smaller.");
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
          : "The group photo could not be updated.",
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

    if (!window.confirm("Remove this group photo?")) {
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
          : "The group photo could not be removed.",
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
          : "The selected members could not be added.",
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
          : "The member role could not be changed.",
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

    if (!window.confirm("Remove this member from the group?")) {
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
          : "The member could not be removed.",
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
      await loadConversations(true);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "The group could not be left.";
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
          : "Profile could not be updated.",
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
          : "Profile photo could not be uploaded.",
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
          : "Profile photo could not be removed.",
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
          : "The conversation could not be started.",
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
          : "The conversation could not be started.",
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
      setNotificationActionNotice("All notifications marked as read.");
    } catch (error) {
      setNotificationError(
        error instanceof Error
          ? error.message
          : "Notifications could not be marked as read.",
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
      setNotificationActionNotice("Notification removed.");

      if (notificationToast?.id === notification.id) {
        setNotificationToast(null);
      }
    } catch (error) {
      setNotificationError(
        error instanceof Error
          ? error.message
          : "The notification could not be removed.",
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
      setNotificationActionNotice("Seen notifications removed.");
    } catch (error) {
      setNotificationError(
        error instanceof Error
          ? error.message
          : "Seen notifications could not be removed.",
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
        setMessagingSettingsNotice("Privacy settings saved.");
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
            : "Privacy settings could not be saved.",
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
    setMessagingSettingsNotice("Notification defaults restored on this device.");
  }

  async function handleBrowserNotificationToggle(): Promise<void> {
    setMessagingSettingsError(null);
    setMessagingSettingsNotice(null);

    if (!("Notification" in window)) {
      setBrowserNotificationsEnabled(false);
      setMessagingSettingsError(
        "Browser notifications are not supported on this device.",
      );
      return;
    }

    if (!browserNotificationsEnabled) {
      // Browser permission must be requested from a direct user action. NT
      // Message can stop using permission, but cannot revoke browser policy.
      const permission = await window.Notification.requestPermission();
      const enabled = permission === "granted";
      setBrowserNotificationsEnabled(enabled);
      setMessagingSettingsNotice(
        enabled
          ? "Browser notifications enabled for this device."
          : "Browser notifications remain disabled. Review browser permission settings if access was blocked.",
      );
      return;
    }

    setBrowserNotificationsEnabled(false);
    setMessagingSettingsNotice(
      "NT Message browser notifications disabled on this device.",
    );
  }

  async function handleLogoutAllDevices(): Promise<void> {
    if (!accessToken || securityAction) {
      return;
    }

    if (
      !window.confirm(
        "Sign out every active NT Message session, including this device?",
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
        `${response.revokedSessions} active session${response.revokedSessions === 1 ? "" : "s"
        } signed out.`,
      );
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      setSecurityError(
        error instanceof Error
          ? error.message
          : "All devices could not be signed out.",
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
    setDetailsPanelOpen(false);
    setSearchError(null);
    setSearchPanelOpen(true);
  }

  function openSearchMessageResult(result: MessagingSearchMessageResult): void {
    pendingSearchResultRef.current = result;

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
          : "The message request could not be accepted.",
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
          : "The message request could not be declined.",
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
          : "The message request could not be blocked.",
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
          : "Account could not be blocked.";
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
          : "Account could not be unblocked.";
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
      setMessageError("Voice recording is not supported in this browser.");
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
          setMessageError("No voice audio was recorded.");
          return;
        }

        const blob = new Blob(chunks, { type: recordedMimeType });

        if (blob.size > MAX_AUDIO_ATTACHMENT_BYTES) {
          setMessageError("Voice notes must be 25 MB or smaller.");
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
          : "Microphone permission was not granted.",
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
        new Error("Location sharing is not supported in this browser."),
      );
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        () =>
          reject(new Error("Location permission was denied or unavailable.")),
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
        setMessageNotice("Live location sharing expired.");
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
              "Live location update failed. Sharing will keep trying until it expires or you stop it.",
            );
          });
      },
      () => {
        setMessageNotice(
          "Live location permission was interrupted. Stop and start again if needed.",
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
      const response = await sendConversationLocationMessage(
        accessToken,
        selectedConversationId,
        {
          ...browserPositionToLocationInput(position),
          live: false,
        },
      );

      applySentLocationMessage(response.data);
      await loadConversations(true);
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : "Current location could not be shared.",
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
      const response = await sendConversationLocationMessage(
        accessToken,
        selectedConversationId,
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
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : "Live location could not be started.",
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

      setMessages((current) => applyMessageUpdate(current, response.data));
      clearLiveLocationWatch();
      setActiveLiveLocation(null);
      setMessageNotice("Live location sharing stopped.");
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : "Live location could not be stopped.",
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
        "Remove the selected voice note before adding other attachments.",
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
        `A message can contain at most ${MAX_MESSAGE_ATTACHMENT_FILES} attachments.`,
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
      setMessageError("Attachments in one message must total 250 MB or smaller.");
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
          : "The attachment could not be downloaded.",
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
      if (current?.objectUrl) {
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
      if (current?.objectUrl) {
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
      const objectUrl = await createConversationAttachmentObjectUrl(
        accessToken,
        message.conversationId,
        message.id,
        attachment.id,
      );

      if (attachmentViewerRequestRef.current !== requestId) {
        URL.revokeObjectURL(objectUrl);
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
            : "The attachment preview could not be loaded.",
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
          : "The reaction could not be updated.",
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
          : "The starred state could not be updated.",
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
          : "The pinned state could not be updated.",
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
          : "The original reply message is no longer available.",
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
            : "Shared content could not be loaded.",
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
            : "Storage usage could not be loaded.",
        );
      }
    } finally {
      if (storageUsageRequestRef.current === requestId) {
        setStorageUsageLoading(false);
      }
    }
  }

  function openStorageUsage(scope: StorageUsageScope): void {
    setStorageUsageScope(scope);
    void loadStorageUsage(scope);
  }

  function closeStorageUsage(): void {
    storageUsageRequestRef.current += 1;
    setStorageUsageScope(null);
    setStorageUsage(null);
    setStorageUsageError(null);
    setStorageUsageActionId(null);
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
      closeStorageUsage();
    } catch (error) {
      setStorageUsageError(
        error instanceof Error
          ? error.message
          : "The original message could not be opened.",
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

    const confirmed = window.confirm(
      mode === "EVERYONE"
        ? "Delete the message containing this file for everyone? Separately forwarded copies will remain available where authorized."
        : "Delete the message containing this file only for you? Other authorized participants will keep their copy.",
    );

    if (!confirmed) {
      return;
    }

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
          : "The selected storage item could not be deleted.",
      );
    } finally {
      setStorageUsageActionId(null);
    }
  }

  function closeMessageInformationDialog(): void {
    setMessageInformation(null);
    setMessageInformationError(null);
  }

  async function handleViewMessageInformation(
    message: MessagingMessage,
  ): Promise<void> {
    if (!accessToken || messageInformationLoadingId !== null) {
      return;
    }

    setMessageInformation(null);
    setMessageInformationError(null);
    setMessageInformationLoadingId(message.id);

    try {
      const response = await getConversationMessageInformation(
        accessToken,
        message.conversationId,
        message.id,
      );

      setMessageInformation(response.data);
    } catch (error) {
      setMessageInformationError(
        error instanceof Error
          ? error.message
          : "Message information could not be loaded.",
      );
    } finally {
      setMessageInformationLoadingId(null);
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
      ]);
    } catch (error) {
      setConversationHistoryError(
        error instanceof Error
          ? error.message
          : `${action === "DELETE" ? "Delete chat for me" : "Clear chat for me"
          } could not be completed.`,
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
        ? "Conversation unpinned."
        : "Conversation pinned.",
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
        ? "Conversation removed from favorites."
        : "Conversation added to favorites.",
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
        ? "Conversation restored."
        : "Conversation archived.",
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
      mute === "OFF" ? "Conversation unmuted." : "Conversation muted.",
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
        "Conversation marked as read.",
      );
      await loadConversations(true, conversation.id);
      return;
    }

    await saveConversationPreference(
      conversation.id,
      {
        markUnread: true,
      },
      "Conversation marked as unread.",
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

    closeTransientMessagePopups();
    setReplyingTo(null);
    setEditingMessage(message);
    setMessageText(message.textContent ?? "");
    focusComposer();
  }

  function cancelMessageAction(): void {
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
      setMessageNotice("Message copied to clipboard.");
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : "The message could not be copied.",
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
    setForwardClientId(crypto.randomUUID());
  }

  function closeForwardDialog(): void {
    if (forwardSubmitting) {
      return;
    }

    setForwardingMessage(null);
    setForwardDestinationIds([]);
    setForwardSearch("");
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
      setForwardClientId(null);
      await loadConversations(true, selectedConversationId ?? undefined);
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : "The message could not be forwarded.",
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
          : "The message could not be deleted for you.";
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
      message.senderAccountId !== account?.id ||
      message.isDeleted ||
      messageActionId
    ) {
      return;
    }

    setMessageActionId(message.id);
    setMessageError(null);

    try {
      const response = await deleteConversationMessage(
        accessToken,
        selectedConversationId,
        message.id,
      );

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
          : "The message could not be deleted for everyone.";
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

    setMessageText(nextText);
    setComposerCaretIndex(nextCaretIndex);

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

    setSendingMessage(true);
    setSendAttemptFailed(false);
    setMessageError(null);
    stopLocalTyping(selectedConversationId);

    try {
      if (editingMessage) {
        if (attachmentFiles.length > 0) {
          setMessageError(
            "Remove the selected attachment before saving an edited text message.",
          );
          return;
        }

        const response = await editConversationTextMessage(
          accessToken,
          selectedConversationId,
          editingMessage.id,
          text,
        );

        setMessages((current) => applyMessageUpdate(current, response.data));
        setEditingMessage(null);
        setMessageText("");
        await loadConversations(true, selectedConversationId);
        return;
      }

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
          text,
          replyingTo?.id,
          getMentionedAccountIds(text, selectedConversation, account?.id),
          false,
        );

      delete draftCacheRef.current[selectedConversationId];

      setMessageText("");
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
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "The message could not be sent.";

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

    if (mentionSuggestionsVisible) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
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

      if (event.key === "Home" || event.key === "End") {
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
        const participant =
          mentionSuggestions[activeMentionSuggestionIndex] ??
          mentionSuggestions[0];

        if (participant) {
          event.preventDefault();
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
          : "Older messages could not be loaded.",
      );
    } finally {
      setOlderMessagesLoading(false);
    }
  }

  const realtimeLabel =
    realtimeStatus === "CONNECTED"
      ? "Real-time connected"
      : realtimeStatus === "RECONNECTING"
        ? "Real-time reconnecting"
        : realtimeStatus === "CONNECTING"
          ? "Real-time connecting"
          : "Real-time offline";

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
  const typingParticipants =
    selectedConversation?.participants.filter(
      (participant) =>
        participant.accountId !== account?.id &&
        participant.showOnlineStatus !== false &&
        typingAccountIds.includes(participant.accountId),
    ) ?? [];
  const peerActivityLabel =
    selectedConversation?.type === "GROUP"
      ? typingParticipants.length > 0
        ? `${typingParticipants
          .slice(0, 2)
          .map((participant) => participant.displayName)
          .join(
            ", ",
          )}${typingParticipants.length > 2 ? " and others" : ""} typing…`
        : `${selectedConversation.memberCount} members`
      : peer?.showOnlineStatus === false
        ? "Online status hidden"
        : typingParticipants.length > 0
          ? "Typing…"
          : peerPresence?.isOnline
            ? "Online"
            : peerPresence?.lastSeenAt
              ? formatLastSeen(peerPresence.lastSeenAt)
              : "Offline";

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

  const groupInfoConversation =
    selectedConversation?.type === "GROUP" ? selectedConversation : null;
  const groupInfoOwner =
    groupInfoConversation?.participants.find(
      (participant) => participant.participantRole === "OWNER",
    ) ?? null;
  const groupInfoAdmins =
    groupInfoConversation?.participants.filter(
      (participant) => participant.participantRole === "ADMIN",
    ) ?? [];
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
    messageMenuOpenedByKeyboardRef.current = event.detail === 0;
    closeReactionMenu();

    if (openMessageMenuId === messageId) {
      closeMessageActionMenu();
      return;
    }

    const triggerRect = event.currentTarget.getBoundingClientRect();
    const threadRect = event.currentTarget
      .closest<HTMLElement>(".message-thread")
      ?.getBoundingClientRect();

    // The full action menu has different heights for own, incoming, attachment,
    // and deleted messages. Store only the real trigger/thread geometry here;
    // a layout effect measures the rendered menu before positioning it.
    setMessageActionMenuPosition(null);
    setMessageActionMenuAnchor({
      top: triggerRect.top,
      right: triggerRect.right,
      bottom: triggerRect.bottom,
      left: triggerRect.left,
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
    const title = conversation.title ?? "Group";

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
        aria-label="React to message"
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
            aria-label={`React with ${emoji}`}
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
      attachments.length === 1 ? "attachment" : "attachments";
    const mobileSheet = mode === "MOBILE_SHEET";
    const viewerReaction = getViewerReaction(message, account?.id);
    const mobileMessagePreview = message.isDeleted
      ? "This message was deleted."
      : message.textContent?.trim() ||
      (message.contentType === "LOCATION"
        ? "Location"
        : attachments.length > 0
          ? `${attachments.length} ${attachmentLabel}`
          : "Message");

    return (
      <div
        ref={mobileSheet ? undefined : messageActionMenuRef}
        className={`message-action-menu ${mobileSheet
          ? "message-mobile-actions-sheet"
          : "message-action-menu-floating"
          }`}
        data-message-action-menu
        role="menu"
        aria-label="Message actions"
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
                  {ownMessage ? "You" : message.sender.displayName}
                </strong>
                <span>{mobileMessagePreview}</span>
              </div>
              <button
                type="button"
                className="message-mobile-actions-close"
                onClick={closeTransientMessagePopups}
                aria-label="Close message actions"
              >
                ×
              </button>
            </div>

            {!message.isDeleted && (
              <div
                className="message-mobile-quick-reactions"
                role="toolbar"
                aria-label="Quick reactions"
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
                    aria-label={`React with ${emoji}`}
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
                <span>Reply</span>
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
            <span>Message info</span>
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
            <span>View {attachmentLabel}</span>
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
            <span>Download {attachmentLabel}</span>
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
            <span>Copy</span>
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
            <span>Forward</span>
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
            <span>{message.isPinned ? "Unpin" : "Pin"}</span>
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
            <span>{message.isStarred ? "Unstar" : "Star"}</span>
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
            <span>Edit</span>
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
          <span>Delete message for me</span>
        </button>

        {ownMessage && !message.isDeleted && (
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
            <span>Delete message for everyone</span>
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
      snippet: starredMessagePreview(item),
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
          : "The message could not be removed from Starred.",
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
    const title = conversation.title ?? "Private conversation";
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
                  aria-label={`${title} is online`}
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
              <small>{messagePreview(conversation, account?.id ?? "")}</small>

              <span className="message-conversation-row-status">
                {conversation.groupKind === "OFFICIAL" && (
                  <span className="message-conversation-kind">Official</span>
                )}
                {conversation.draftText && (
                  <span className="message-conversation-draft">Draft</span>
                )}
                <span
                  className="message-conversation-indicators"
                  aria-label="Conversation status"
                >
                  {conversation.isFavorite && (
                    <span aria-label="Favorite">
                      <MessageNavigationIcon name="starred" />
                    </span>
                  )}
                  {conversation.isPinned && (
                    <span aria-label="Pinned">
                      <MessageNavigationIcon name="pin" />
                    </span>
                  )}
                  {conversation.isMuted && (
                    <span aria-label="Muted">
                      <MessageNavigationIcon name="bell" />
                    </span>
                  )}
                  {conversation.isArchived && (
                    <span aria-label="Archived">
                      <MessageNavigationIcon name="archive" />
                    </span>
                  )}
                </span>
                {conversation.unreadCount > 0 && (
                  <b aria-label={`${conversation.unreadCount} unread messages`}>
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
          aria-label={`More actions for ${title}`}
          aria-haspopup="menu"
          aria-expanded={rowMenuOpen}
          title="Conversation actions"
        >
          <MessageNavigationIcon name="more" />
        </button>

        {rowMenuOpen && (
          <div
            ref={conversationRowMenuRef}
            className="message-conversation-row-menu"
            style={conversationRowMenuPosition ?? undefined}
            role="menu"
            aria-label={`Actions for ${title}`}
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
                  <span>Mute notifications</span>
                </button>
                {(
                  [
                    ["1_HOUR", "Mute for 1 hour"],
                    ["8_HOURS", "Mute for 8 hours"],
                    ["1_WEEK", "Mute for 1 week"],
                    ["ALWAYS", "Mute always"],
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
                      ? "Mark as read"
                      : "Mark as unread"}
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
                      ? "Remove from favorites"
                      : "Add to favorites"}
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
                      ? "Unpin conversation"
                      : "Pin conversation"}
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
                    <span>Unmute notifications</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setConversationRowMenuView("MUTE")}
                  >
                    <MessageNavigationIcon name="bell" />
                    <span>Mute notifications ›</span>
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
                      ? "Unarchive conversation"
                      : "Archive conversation"}
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
                      {peerBlocked ? "Unblock contact" : "Block contact"}
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
                  <span>Clear chat for me</span>
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
                    <span>Delete chat for me</span>
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </article>
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
        ? "You"
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
          aria-label={`Open starred message in ${item.conversation.title ?? "conversation"}`}
        >
          <span className="message-avatar-presence">
            {conversationPeer
              ? renderAccountAvatar(conversationPeer)
              : renderGroupAvatar(item.conversation)}
          </span>

          <span className="message-conversation-copy">
            <span className="message-conversation-title-line">
              <strong>{item.conversation.title ?? "Conversation"}</strong>
              <time dateTime={item.starredAt}>
                {formatConversationTime(item.starredAt)}
              </time>
            </span>
            <span className="message-starred-message-sender">
              {senderLabel}
            </span>
            <span className="message-conversation-preview-line">
              <small>{starredMessagePreview(item)}</small>
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
          title="Remove from Starred"
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
            {requestStatusLabel(request)}
          </span>
          <span className="message-conversation-preview-line">
            <small>{requestReasonLabel(request.reason)}</small>
            {request.status === "PENDING" && (
              <b aria-label="Pending message request">Pending</b>
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
            <strong>{conversation.title ?? "Official group"}</strong>
            <span className="message-announcement-group-open">Open</span>
          </span>
          <span className="message-announcement-group-purpose">
            Official announcements only
          </span>
          <span className="message-conversation-meta">
            <span className="message-conversation-kind">Official</span>
            <small>{officialScopeLabel(conversation)}</small>
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
              {announcementEnumLabel(announcement.priority)}
            </span>
            {announcement.status !== "PUBLISHED" && (
              <span className="message-announcement-status">
                {announcementEnumLabel(announcement.status)}
              </span>
            )}
            {announcement.isPinned && <span>Pinned</span>}
            {unread && <strong>New</strong>}
            {acknowledgementPending && (
              <strong className="action-required">Action required</strong>
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
              <small>Published by</small>
              <strong>{announcement.publisher.displayName}</strong>
            </div>
          </div>

          <div className="message-announcement-card-meta">
            {announcement.attachmentCount > 0 && (
              <span>
                {announcement.attachmentCount} attachment
                {announcement.attachmentCount === 1 ? "" : "s"}
              </span>
            )}
            {announcement.viewerState?.isAcknowledged && (
              <span>Acknowledged</span>
            )}
          </div>

          <button
            type="button"
            className="message-announcement-view-button"
            onClick={() => void openAnnouncementDetail(announcement.id)}
          >
            View announcement
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
        ? officialScopeLabel(conversation)
        : `${conversation.memberCount} members · Personal group`;

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
            <strong>{conversation.title ?? "Group conversation"}</strong>
            <time>
              {formatConversationTime(
                conversation.lastMessageAt ?? conversation.updatedAt,
              )}
            </time>
          </span>

          <span className="message-group-common-copy">
            {matchedDisplayName ? (
              <>
                <strong>{matchedDisplayName}</strong> is also in this group
              </>
            ) : (
              `${conversation.memberCount} members`
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
          <p>Loading profile...</p>
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
                alt={`${profileData.displayName} profile`}
              />
            ) : (
              initials(profileData.displayName)
            )}
          </span>

          <div>
            <strong>{profileData.displayName}</strong>
            <span>{roleLabel(profileData.role)}</span>
            <small>
              {profileData.official?.department?.name ??
                profileData.official?.division?.name ??
                "Nepal Telecom"}
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
              <h3>About</h3>
              {profileData.isOwnProfile && (
                <p>A short status visible to people who can view your profile.</p>
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
                placeholder="Add a short about message"
              />
              <div className="message-profile-actions">
                <button
                  type="button"
                  onClick={() => void handleSaveProfileBio()}
                  disabled={profileSaving}
                >
                  {profileSaving ? "Saving..." : "Save about"}
                </button>
              </div>
            </>
          ) : (
            <p>{profileData.profileBio || "No about message added."}</p>
          )}
        </section>

        {profileData.isOwnProfile && (
          <section className="message-profile-section">
            <div className="message-profile-section-heading">
              <div>
                <h3>Profile photo</h3>
                <p>JPG, PNG or WEBP. Your image remains protected by NT Message.</p>
              </div>
            </div>
            <div className="message-profile-photo-controls">
              <label className="message-profile-photo-upload">
                <span>
                  {profilePhotoUploading
                    ? "Uploading..."
                    : profileData.profilePhotoKey
                      ? "Change photo"
                      : "Upload photo"}
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
                  Remove photo
                </button>
              )}
            </div>
          </section>
        )}

        <section className="message-profile-section">
          <div className="message-profile-section-heading">
            <div>
              <h3>Official information</h3>
              <p>Verified identity information managed by your organization.</p>
            </div>
            <span className="message-profile-verified-badge">Verified</span>
          </div>
          <dl className="message-profile-details">
            <div>
              <dt>Employee ID</dt>
              <dd>{profileData.official?.employeeId ?? "System account"}</dd>
            </div>
            <div>
              <dt>Official email</dt>
              <dd>
                {profileData.official?.officialEmail ??
                  profileData.username ??
                  "—"}
              </dd>
            </div>
            <div>
              <dt>Contact number</dt>
              <dd>{profileData.official?.contactNumber ?? "—"}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{roleLabel(profileData.role)}</dd>
            </div>
            <div>
              <dt>Designation</dt>
              <dd>{profileData.official?.designation ?? "—"}</dd>
            </div>
            <div>
              <dt>Division</dt>
              <dd>{profileData.official?.division?.name ?? "—"}</dd>
            </div>
            <div>
              <dt>Department</dt>
              <dd>{profileData.official?.department?.name ?? "—"}</dd>
            </div>
          </dl>
          <p className="message-profile-locked-note">
            Official identity fields are read-only and follow the approved
            account workflow.
          </p>
        </section>

        {!profileData.isOwnProfile && (
          <section className="message-profile-section">
            <h3>Shared groups</h3>
            {profileData.sharedGroups.length === 0 ? (
              <p>No shared groups found.</p>
            ) : (
              <ul className="message-profile-shared-groups">
                {profileData.sharedGroups.map((group) => (
                  <li key={group.id}>
                    <strong>{group.title ?? "Group"}</strong>
                    <span>
                      {group.groupKind === "OFFICIAL" ? "Official" : "Personal"}{" "}
                      · {group.memberCount} members
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
                  ? "Request sent"
                  : profileData.contactMode === "BLOCKED"
                    ? "Blocked"
                    : profileData.contactMode === "REQUEST_REQUIRED"
                      ? "Send request"
                      : "Message"}
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
                    ? "Working..."
                    : "Unblock"}
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
                    ? "Working..."
                    : "Block private contact"}
                </button>
              )}
            </>
          )}
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
            aria-label="Back from shared content"
          >
            <span aria-hidden="true">←</span>
          </button>
          <div>
            <span>Conversation</span>
            <strong>Media, documents and links</strong>
          </div>
          <button
            type="button"
            className="message-modern-detail-close"
            onClick={closeSharedContentPanel}
            aria-label="Close shared content"
          >
            <MessageNavigationIcon name="close" />
          </button>
        </header>

        <nav
          className="message-shared-panel-tabs"
          role="tablist"
          aria-label="Shared content categories"
        >
          {(
            [
              ["MEDIA", "Media", content.media.length],
              ["DOCUMENTS", "Documents", content.documents.length],
              ["LINKS", "Links", content.links.length],
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
              <strong>Loading shared content</strong>
              <p>Checking authorized media, documents and links.</p>
            </div>
          ) : sharedContentError && !hasAnyContent ? (
            <div className="message-shared-panel-state" role="alert">
              <MessageNavigationIcon name="shared" />
              <strong>Shared content unavailable</strong>
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
                Retry
              </button>
            </div>
          ) : (
            <>
              {sharedContentLoading && (
                <div className="message-shared-refresh-state" role="status">
                  <span className="message-small-spinner" aria-hidden="true" />
                  <span>Refreshing shared content…</span>
                </div>
              )}

              {sharedContentTab === "MEDIA" ? (
                content.media.length === 0 ? (
                  <div className="message-shared-panel-state">
                    <AttachmentGlyph name="image" />
                    <strong>No media shared yet</strong>
                    <p>
                      Photos and videos shared in this conversation will appear
                      here.
                    </p>
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
                    <strong>No documents shared yet</strong>
                    <p>
                      Documents shared in this conversation will appear here.
                    </p>
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
                                    {attachmentTypeLabel(item.attachment)} ·{" "}
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
                                aria-label={`Download ${item.attachment.originalFileName}`}
                                title="Download"
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
                  <strong>No links shared yet</strong>
                  <p>Links shared in this conversation will appear here.</p>
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
                                  {sharedLinkDomain(item.url)}
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
                                View in chat
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
              aria-label="Back to group information"
            >
              <span aria-hidden="true">←</span>
            </button>
          ) : (
            <span className="message-modern-detail-spacer" aria-hidden="true" />
          )}
          <div>
            <span>{returnToGroupInformation ? "Group information" : "Conversation"}</span>
            <strong>Profile</strong>
          </div>
          <button
            type="button"
            className="message-modern-detail-close"
            onClick={closeConversationDetailsPanel}
            aria-label="Close profile"
          >
            <MessageNavigationIcon name="close" />
          </button>
        </header>

        <div className="message-modern-detail-scroll">
          {profileLoading && !profileData ? (
            <div className="message-list-state compact" role="status">
              <span className="message-small-spinner" aria-hidden="true" />
              <p>Loading profile...</p>
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
                      alt={`${profileData.displayName} profile`}
                    />
                  ) : (
                    initials(profileData.displayName)
                  )}
                  {profileData.showOnlineStatus !== false &&
                    profilePresence?.isOnline && (
                      <span
                        className="message-modern-profile-presence"
                        aria-label="Online"
                      />
                    )}
                </span>
                <div>
                  <strong>{profileData.displayName}</strong>
                  <span>
                    {[
                      profileData.official?.designation ??
                      roleLabel(profileData.role),
                      profileData.official?.department?.name ??
                      profileData.official?.division?.name,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <small>
                    {profileData.showOnlineStatus !== false &&
                      profilePresence?.isOnline
                      ? "Online"
                      : "Nepal Telecom"}
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
                  <h3>About</h3>
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
                  <span>Media, documents and links</span>
                  <b>{sharedContentCount}</b>
                  <span aria-hidden="true">›</span>
                </button>
              </section>

              <section className="message-simple-detail-section">
                <div className="message-modern-section-heading">
                  <h3>Contact information</h3>
                  <span>Verified</span>
                </div>
                <dl className="message-modern-info-list">
                  <div>
                    <dt>Employee ID</dt>
                    <dd>
                      {profileData.official?.employeeId ?? "System account"}
                    </dd>
                  </div>
                  <div>
                    <dt>Official email</dt>
                    <dd>
                      {profileData.official?.officialEmail ??
                        profileData.username ??
                        "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Contact number</dt>
                    <dd>{profileData.official?.contactNumber ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Designation</dt>
                    <dd>{profileData.official?.designation ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Division</dt>
                    <dd>{profileData.official?.division?.name ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Department</dt>
                    <dd>{profileData.official?.department?.name ?? "—"}</dd>
                  </div>
                </dl>
              </section>

              {!profileData.isOwnProfile &&
                profileData.sharedGroups.length > 0 && (
                  <section className="message-simple-detail-section">
                    <div className="message-modern-section-heading">
                      <h3>Shared groups</h3>
                      <span>{profileData.sharedGroups.length}</span>
                    </div>
                    <div className="message-modern-shared-groups">
                      {visibleSharedGroups.map((group) => (
                        <div key={group.id}>
                          <strong>{group.title ?? "Group"}</strong>
                          <span>
                            {group.groupKind === "OFFICIAL"
                              ? "Official"
                              : "Personal"}{" "}
                            · {group.memberCount} members
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
                          ? "Show fewer groups"
                          : `View all ${profileData.sharedGroups.length} shared groups`}
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
                    Open my profile
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
                        ? "Request sent"
                        : profileData.contactMode === "BLOCKED"
                          ? "Blocked"
                          : profileData.contactMode === "REQUEST_REQUIRED"
                            ? "Send request"
                            : "Message"}
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
                          ? "Working..."
                          : "Unblock"}
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
                          ? "Working..."
                          : "Block"}
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
    const roleRank: Record<string, number> = {
      OWNER: 0,
      ADMIN: 1,
      MEMBER: 2,
    };
    const sortedParticipants = [...groupInfoConversation.participants].sort(
      (first, second) =>
        (roleRank[first.participantRole] ?? 3) -
        (roleRank[second.participantRole] ?? 3) ||
        first.displayName.localeCompare(second.displayName, undefined, {
          sensitivity: "base",
        }) ||
        first.accountId.localeCompare(second.accountId),
    );
    const matchingParticipants = query
      ? sortedParticipants.filter((participant) =>
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
      )
      : sortedParticipants;
    const visibleParticipants =
      query || groupMembersExpanded
        ? matchingParticipants
        : matchingParticipants.slice(0, 5);
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
          <div>
            <span>Conversation</span>
            <strong>Group information</strong>
          </div>
          <button
            type="button"
            className="message-modern-detail-close"
            onClick={closeConversationDetailsPanel}
            aria-label="Close group information"
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
              <strong>{groupInfoConversation.title ?? "Group"}</strong>
              <span>
                {groupInfoConversation.groupKind === "OFFICIAL"
                  ? "Official group"
                  : "Personal group"}{" "}
                · {groupInfoConversation.memberCount} members
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
              <span>Media, documents and links</span>
              <b>{sharedContentCount}</b>
              <span aria-hidden="true">›</span>
            </button>
          </section>

          <section className="message-simple-detail-section message-simple-members-section">
            <div className="message-modern-section-heading">
              <h3>Members</h3>
              <span>{groupInfoConversation.memberCount}</span>
            </div>

            <label className="message-modern-search-field">
              <MessageNavigationIcon name="search" />
              <input
                type="search"
                value={groupMemberSearch}
                onChange={(event) => setGroupMemberSearch(event.target.value)}
                placeholder="Search members"
                aria-label="Search group members"
              />
            </label>

            {matchingParticipants.length === 0 ? (
              <p className="message-simple-empty-state">
                No members match “{groupMemberSearch.trim()}”.
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
                          {isViewer ? " (You)" : ""}
                        </strong>
                        <small>
                          {participant.employee?.designation ??
                            roleLabel(participant.role)}
                        </small>
                      </span>
                      <b className="message-simple-member-role">
                        {roleLabel(participant.participantRole)}
                      </b>
                    </button>
                  );
                })}
              </div>
            )}

            {!query && matchingParticipants.length > 5 && (
              <button
                type="button"
                className="message-simple-expand-button"
                onClick={() => setGroupMembersExpanded((current) => !current)}
              >
                {groupMembersExpanded
                  ? "Show fewer members"
                  : `View all ${matchingParticipants.length} members`}
              </button>
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
                  <span>Manage group</span>
                  <span aria-hidden="true">›</span>
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
                      groupInfoConversation.title ?? "this group",
                  })
                }
                disabled={groupSubmitting}
              >
                <MessageNavigationIcon name="close" />
                <span>{groupSubmitting ? "Leaving..." : "Leave group"}</span>
              </button>
            </section>
          ) : (
            <p className="message-simple-group-note">
              Membership is synchronized from active organizational
              assignments.
            </p>
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
            aria-label="Back to group information"
          >
            <span aria-hidden="true">←</span>
          </button>
          <div>
            <span>Group management</span>
            <strong>Manage group</strong>
          </div>
          <button
            type="button"
            className="message-modern-detail-close"
            onClick={closeGroupDialog}
            disabled={groupSubmitting || groupActionAccountId !== null}
            aria-label="Close group management"
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
              <strong>{groupInfoConversation.title ?? "Group"}</strong>
              <span>
                {groupInfoConversation.groupKind === "OFFICIAL"
                  ? officialScopeLabel(groupInfoConversation)
                  : `${groupInfoConversation.memberCount} members`}
              </span>
              {groupInfoConversation.description && (
                <p>{groupInfoConversation.description}</p>
              )}
              <div className="message-modern-group-badges">
                <span>
                  {groupInfoConversation.groupKind === "OFFICIAL"
                    ? "Official group"
                    : "Personal group"}
                </span>
                <span>{groupInfoConversation.memberCount} members</span>
              </div>
            </div>
          </section>

          <nav
            className="message-modern-detail-tabs"
            aria-label="Group information sections"
          >
            <button
              type="button"
              className={groupPanelTab === "OVERVIEW" ? "active" : ""}
              onClick={() => setGroupPanelTab("OVERVIEW")}
            >
              Overview
            </button>
            <button
              type="button"
              className={groupPanelTab === "MEMBERS" ? "active" : ""}
              onClick={() => setGroupPanelTab("MEMBERS")}
            >
              Members
            </button>
            {canOpenSettings && (
              <button
                type="button"
                className={groupPanelTab === "SETTINGS" ? "active" : ""}
                onClick={() => setGroupPanelTab("SETTINGS")}
              >
                Settings
              </button>
            )}
          </nav>

          {groupPanelTab === "OVERVIEW" && (
            <div className="message-modern-group-tab">
              <section className="message-modern-detail-section">
                <div className="message-modern-section-heading">
                  <h3>Shared content</h3>
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
                    <span>Media</span>
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
                    <span>Documents</span>
                    <b>{selectedConversationSharedContent.documents.length}</b>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void openSharedContentPanel("LINKS", "GROUP_MANAGEMENT")
                    }
                  >
                    <MessageNavigationIcon name="shared" />
                    <span>Links</span>
                    <b>{selectedConversationSharedContent.links.length}</b>
                  </button>
                </div>
              </section>

              <section className="message-modern-detail-section">
                <div className="message-modern-section-heading">
                  <h3>Group leadership</h3>
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
                        <small>Owner</small>
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
                        <small>Admin</small>
                      </span>
                    </button>
                  ))}
                  {!groupInfoOwner && groupInfoAdmins.length === 0 && (
                    <p>No group leadership is assigned.</p>
                  )}
                </div>
              </section>

              <p className="message-modern-security-note">
                {groupInfoConversation.groupKind === "OFFICIAL"
                  ? "Membership and roles follow active organizational assignments."
                  : "Only current group members can access this conversation and its shared content."}
              </p>
            </div>
          )}

          {groupPanelTab === "MEMBERS" && (
            <div className="message-modern-group-tab">
              <section className="message-modern-detail-section message-modern-members-section">
                <div className="message-modern-section-heading">
                  <h3>Members</h3>
                  <span>{groupInfoConversation.memberCount}</span>
                </div>

                {groupInfoConversation.groupKind === "OFFICIAL" && (
                  <p className="message-modern-security-note compact">
                    Official membership and roles are read-only here.
                  </p>
                )}

                <div className="message-modern-member-list">
                  {groupInfoConversation.participants.map((participant) => {
                    const isViewer = participant.accountId === account?.id;
                    const viewerRole =
                      groupInfoConversation.viewerParticipantRole;
                    const canChangeRole =
                      groupInfoConversation.groupKind === "PERSONAL" &&
                      viewerRole === "OWNER" &&
                      participant.participantRole !== "OWNER" &&
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
                              {isViewer ? " (You)" : ""}
                            </strong>
                            <small>
                              {participant.employee?.designation ??
                                roleLabel(participant.role)}
                            </small>
                          </span>
                          <b>{roleLabel(participant.participantRole)}</b>
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
                                  ? "Working..."
                                  : participant.participantRole === "ADMIN"
                                    ? "Remove admin"
                                    : "Make admin"}
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
                                Remove
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
                      <h3>Add members</h3>
                      <span>{groupSelectedAccountIds.length} selected</span>
                    </div>
                    <label className="message-modern-search-field">
                      <MessageNavigationIcon name="search" />
                      <input
                        type="search"
                        value={groupSearch}
                        onChange={(event) => setGroupSearch(event.target.value)}
                        placeholder="Search employees"
                      />
                    </label>
                    <div className="message-modern-add-member-list">
                      {groupContactsLoading ? (
                        <div className="message-list-state compact">
                          <span className="message-small-spinner" />
                          <p>Searching accounts...</p>
                        </div>
                      ) : groupContacts.length === 0 ? (
                        <div className="message-list-state compact">
                          <p>No matching active accounts.</p>
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
                                    ? "Already a member"
                                    : eligible
                                      ? contact.employee?.designation ??
                                      roleLabel(contact.role)
                                      : contact.contactMode === "BLOCKED"
                                        ? "Blocked private contact"
                                        : "First-contact approval required"}
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
                      {groupSubmitting ? "Adding..." : "Add selected members"}
                    </button>
                  </section>
                )}
            </div>
          )}

          {groupPanelTab === "SETTINGS" && canOpenSettings && (
            <div className="message-modern-group-tab">
              <section className="message-modern-detail-section">
                <div className="message-modern-section-heading">
                  <h3>Group details</h3>
                  <span>Editable</span>
                </div>

                <div className="message-modern-group-photo-setting">
                  {renderGroupAvatar(
                    groupInfoConversation,
                    "message-group-photo-preview",
                  )}
                  <div>
                    <strong>Group photo</strong>
                    <small>JPG, PNG or WEBP · Maximum 5 MB</small>
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
                          ? "Uploading..."
                          : groupInfoConversation.groupPhotoKey
                            ? "Change photo"
                            : "Upload photo"}
                      </button>
                      {groupInfoConversation.groupPhotoKey && (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void handleRemoveGroupPhoto()}
                          disabled={groupPhotoUploading || groupSubmitting}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <label className="message-modern-field">
                  <span>Group name</span>
                  <input
                    type="text"
                    value={groupTitle}
                    onChange={(event) => setGroupTitle(event.target.value)}
                    maxLength={150}
                  />
                </label>
                <label className="message-modern-field">
                  <span>Description</span>
                  <textarea
                    value={groupDescription}
                    onChange={(event) =>
                      setGroupDescription(event.target.value)
                    }
                    maxLength={500}
                    rows={3}
                    placeholder="Optional group description"
                  />
                </label>
                <button
                  type="button"
                  className="message-modern-primary-action"
                  onClick={() => void handleSaveGroupDetails()}
                  disabled={!groupTitle.trim() || groupSubmitting}
                >
                  {groupSubmitting ? "Saving..." : "Save group details"}
                </button>
              </section>

              {groupInfoConversation.groupKind === "PERSONAL" && (
                <section className="message-modern-detail-section">
                  <div className="message-modern-section-heading">
                    <h3>Invitation link</h3>
                    <span>Personal group</span>
                  </div>

                  {groupInviteLoading ? (
                    <p>Loading invitation link...</p>
                  ) : groupInviteLink ? (
                    <>
                      <label className="message-modern-field">
                        <span>Active link</span>
                        <input value={groupInviteUrl} readOnly />
                      </label>
                      <div className="message-modern-inline-actions">
                        <button
                          type="button"
                          onClick={() => void handleCopyGroupInviteLink()}
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCreateGroupInviteLink()}
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void handleRevokeGroupInviteLink()}
                        >
                          Revoke
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>No active invitation link.</p>
                      <button
                        type="button"
                        onClick={() => void handleCreateGroupInviteLink()}
                      >
                        Generate invite link
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
                    <h3>Official group audit</h3>
                    {account?.role === "SUPER_ADMIN" && (
                      <button
                        type="button"
                        onClick={() => void handleReconcileOfficialGroups()}
                        disabled={officialGroupReconciling}
                      >
                        {officialGroupReconciling
                          ? "Reconciling..."
                          : "Reconcile"}
                      </button>
                    )}
                  </div>
                  {officialGroupAuditLoading ? (
                    <div className="message-list-state compact">
                      <span className="message-small-spinner" />
                      <p>Loading audit history...</p>
                    </div>
                  ) : officialGroupAudit.length === 0 ? (
                    <p>No official group audit entries are available.</p>
                  ) : (
                    <div className="message-modern-audit-list">
                      {officialGroupAudit.map((entry) => (
                        <article key={entry.id}>
                          <strong>{officialAuditLabel(entry)}</strong>
                          <small>
                            {entry.actor?.displayName ?? "System"} ·{" "}
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
                      groupInfoConversation.title ?? "this group",
                  })
                }
                disabled={groupSubmitting}
              >
                {groupSubmitting ? "Leaving..." : "Leave group"}
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
            aria-label="Back to private conversation"
            title="Back to private conversation"
          >
            ←
          </button>
          <div>
            <span>Add member</span>
            <h2>Create a group from this conversation</h2>
            <p>
              A separate group will be created. This private conversation stays
              unchanged.
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
                  <span>People</span>
                  <h3>Choose members</h3>
                  <p>Only eligible active employees can be selected.</p>
                </div>
                <strong>{privateGroupSelectedAccountIds.length} selected</strong>
              </header>

              <label className="message-create-group-search">
                <MessageNavigationIcon name="search" />
                <input
                  type="search"
                  value={privateGroupSearch}
                  onChange={(event) => setPrivateGroupSearch(event.target.value)}
                  placeholder="Search employees"
                  autoFocus
                />
              </label>

              {privateGroupSelectedContacts.length > 0 && (
                <div
                  className="message-create-group-selected-strip"
                  aria-label="Selected members"
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
                    <p>Searching accounts...</p>
                  </div>
                ) : privateGroupContacts.length === 0 ? (
                  <div className="message-list-state compact" role="status">
                    <p>No matching active accounts.</p>
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
                              ? "Already in this private conversation"
                              : eligible
                                ? (contact.employee?.designation ??
                                  roleLabel(contact.role))
                                : contact.contactMode === "BLOCKED"
                                  ? "Blocked private contact"
                                  : "First-contact approval required"}
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
                  <span>Group setup</span>
                  <h3>Previous chat context</h3>
                  <p>Choose one history window for everyone selected.</p>
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
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                  </label>
                ))}
              </div>

              <div className="message-add-members-summary">
                <span>Selected members</span>
                <strong>{privateGroupSelectedAccountIds.length}</strong>
              </div>

              <div className="message-create-group-setup-actions">
                <button
                  type="button"
                  onClick={closePrivateGroupDialog}
                  disabled={privateGroupSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void handleCreatePrivateGroup()}
                  disabled={!canCreatePrivateGroup}
                >
                  {privateGroupSubmitting ? "Creating..." : "Create group"}
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
            aria-label="Back to groups"
            title="Back to groups"
          >
            ←
          </button>
          <div>
            <span>New group</span>
            <h2>
              {isOfficialGroup
                ? "Create an official group"
                : "Create a personal group"}
            </h2>
            <p>
              {isOfficialGroup
                ? "Choose the organizational scope, then add a clear group identity."
                : "Choose the people first, then finish the group details."}
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
                  <span>{isOfficialGroup ? "Membership" : "People"}</span>
                  <h3>
                    {isOfficialGroup
                      ? "Choose organizational scope"
                      : "Choose group members"}
                  </h3>
                  <p>
                    {isOfficialGroup
                      ? "Eligible members are synchronized automatically from the selected scope."
                      : "Only eligible active employees can be selected."}
                  </p>
                </div>
                {!isOfficialGroup && (
                  <strong>{groupSelectedAccountIds.length} selected</strong>
                )}
              </header>

              {isOfficialGroup ? (
                <div className="message-create-group-official-scope">
                  <div className="message-create-group-scope-visual" aria-hidden="true">
                    <MessageNavigationIcon name="newGroup" />
                  </div>
                  <label className="message-group-scope-field">
                    <span>Organizational scope</span>
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
                          ? "Loading official scopes..."
                          : "Select an official scope"}
                      </option>
                      {officialGroupScopes.map((scope) => (
                        <option key={scope.key} value={scope.key}>
                          {scope.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="message-create-group-scope-summary">
                    <span>Membership source</span>
                    <strong>
                      {selectedOfficialGroupScope?.label ??
                        "No organizational scope selected"}
                    </strong>
                    <small>
                      Membership remains controlled by current organizational
                      assignments.
                    </small>
                  </div>
                </div>
              ) : (
                <>
                  <label className="message-create-group-search">
                    <span className="sr-only">Search eligible employees</span>
                    <input
                      type="search"
                      value={groupSearch}
                      onChange={(event) => setGroupSearch(event.target.value)}
                      placeholder="Search name, employee ID or designation"
                    />
                  </label>

                  {groupSelectedContacts.length > 0 && (
                    <div
                      className="message-create-group-selected-strip"
                      aria-label="Selected group members"
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
                        <p>Searching accounts...</p>
                      </div>
                    ) : groupContacts.length === 0 ? (
                      <div className="message-list-state compact" role="status">
                        <p>No matching active accounts.</p>
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
                                    roleLabel(contact.role))
                                  : contact.contactMode === "BLOCKED"
                                    ? "Blocked private contact"
                                    : "First-contact approval required"}
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
                  <span>Group setup</span>
                  <h3>Identity and type</h3>
                  <p>Keep the name clear and the description brief.</p>
                </div>
              </div>

              {canCreateOfficialGroup && (
                <fieldset className="message-create-group-type-field">
                  <legend>Group type</legend>
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
                      <strong>Personal</strong>
                      <small>Choose members</small>
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
                      <strong>Official</strong>
                      <small>Use scope</small>
                    </button>
                  </div>
                </fieldset>
              )}

              <div className="message-create-group-fields">
                <label>
                  <span>Group name</span>
                  <input
                    type="text"
                    value={groupTitle}
                    onChange={(event) => setGroupTitle(event.target.value)}
                    maxLength={150}
                    placeholder="Enter group name"
                    autoFocus={isOfficialGroup}
                  />
                </label>

                <label>
                  <span>
                    Description <em>Optional</em>
                  </span>
                  <textarea
                    value={groupDescription}
                    onChange={(event) =>
                      setGroupDescription(event.target.value)
                    }
                    maxLength={500}
                    rows={4}
                    placeholder="Add a short purpose or context"
                  />
                </label>
              </div>

              <div className="message-create-group-status-card">
                <div>
                  <span>Type</span>
                  <strong>{isOfficialGroup ? "Official" : "Personal"}</strong>
                </div>
                <div>
                  <span>{isOfficialGroup ? "Scope" : "Members"}</span>
                  <strong>
                    {isOfficialGroup
                      ? (selectedOfficialGroupScope?.label ?? "Not selected")
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
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void handleCreateGroup()}
                  disabled={!canSubmitGroup}
                >
                  {groupSubmitting
                    ? "Creating..."
                    : isOfficialGroup
                      ? "Create official group"
                      : "Create group"}
                </button>
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  const resolvedMessagingTheme = resolveMessagingTheme(
    messagingCustomization.theme,
    systemPrefersDark,
  );
  const workspaceDetailOpen = newConversationMode
    ? false
    : Boolean(
      selectedConversation ||
      (requestMode && selectedMessageRequest) ||
      settingsMode ||
      ownProfileMode ||
      createGroupMode,
    );

  const sidebarTitle = announcementMode
    ? "Announcements"
    : requestMode
      ? "Message requests"
      : starredMode
        ? "Starred messages"
        : notificationMode
          ? "Notifications"
          : settingsMode
            ? "Settings"
            : ownProfileMode
              ? "My profile"
              : newConversationMode
                ? "New conversation"
                : createGroupMode
                  ? "Create group"
                  : conversationCategory === "GROUPS" ||
                    conversationCategory === "OFFICIAL"
                    ? "Groups"
                    : conversationListView === "ARCHIVED"
                      ? "Archived conversations"
                      : conversationListView === "FAVORITES"
                        ? "Favorite conversations"
                        : "Conversations";

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
              aria-label="Open NT Message"
            >
              <span className="message-app-logo">
                <img src="/nt-logo.png" alt="Nepal Telecom" />
              </span>
            </button>

            <span
              className="message-brand-text"
              aria-hidden={!navigationExpanded}
            >
              <strong>NT Message</strong>
              <small>NEPAL TELECOM</small>
            </span>
          </div>

          <button
            type="button"
            className="message-rail-toggle"
            onClick={() => setNavigationExpanded((current) => !current)}
            aria-expanded={navigationExpanded}
            aria-label={
              navigationExpanded ? "Collapse navigation" : "Expand navigation"
            }
            title={
              navigationExpanded ? "Collapse navigation" : "Expand navigation"
            }
          >
            <span aria-hidden="true">{navigationExpanded ? "‹" : "›"}</span>
          </button>
        </div>

        <nav
          className="message-rail-navigation"
          aria-label="Messaging sections"
        >
          <button
            type="button"
            className={
              !announcementMode &&
                !requestMode &&
                !notificationMode &&
                !settingsMode &&
                !ownProfileMode &&
                !createGroupMode &&
                (newConversationMode ||
                  starredMode ||
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
            aria-label="Chats"
            title={navigationExpanded ? undefined : "Chats"}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="chats" />
            </span>
            <span className="message-rail-label">Chats</span>
          </button>

          <button
            type="button"
            className={announcementMode ? "active" : ""}
            onClick={() => navigate("/messages/announcements")}
            aria-label="Official announcements"
            title={navigationExpanded ? undefined : "Official announcements"}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="announcement" />
            </span>
            <span className="message-rail-label">Announcements</span>
          </button>

          <button
            type="button"
            className={requestMode ? "active" : ""}
            onClick={() => openMessageRequests("RECEIVED")}
            aria-label="Message requests"
            title={navigationExpanded ? undefined : "Message requests"}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="requests" />
            </span>
            <span className="message-rail-label">Message requests</span>
            {messageRequests.counts.receivedPending > 0 && (
              <b>{messageRequests.counts.receivedPending}</b>
            )}
          </button>

          <button
            type="button"
            className={
              !announcementMode &&
                !starredMode &&
                !requestMode &&
                !notificationMode &&
                !settingsMode &&
                !ownProfileMode &&
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
            aria-label="Groups"
            title={navigationExpanded ? undefined : "Groups"}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="groups" />
            </span>
            <span className="message-rail-label">Groups</span>
          </button>

        </nav>

        <div className="message-app-account">
          <button
            type="button"
            className={`message-profile-topbar-button${ownProfileMode || profileAccountId === account?.id ? " active" : ""}`}
            onClick={() => openProfile(account?.id)}
            title={navigationExpanded ? undefined : "My profile"}
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
              <strong>{account?.displayName ?? "NT Message User"}</strong>
              <small>{account ? roleLabel(account.role) : "Employee"}</small>
            </span>
          </button>

          <button
            type="button"
            className={`message-settings-button${settingsMode ? " active" : ""}`}
            onClick={() => openSettingsWorkspace()}
            aria-current={settingsMode ? "page" : undefined}
            title={navigationExpanded ? undefined : "Settings"}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="settings" />
            </span>
            <span className="message-rail-label">Settings</span>
          </button>

          <button
            type="button"
            className={`message-notification-button${notificationMode ? " active" : ""}`}
            onClick={openNotificationsWorkspace}
            aria-current={notificationMode ? "page" : undefined}
            aria-label="Open notifications"
            title={navigationExpanded ? undefined : "Notifications"}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="bell" />
            </span>
            <span className="message-rail-label">Notifications</span>
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
            title={navigationExpanded ? undefined : "Back to main workspace"}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="workspace" />
            </span>
            <span className="message-rail-label">Back to workspace</span>
          </button>

          <button
            type="button"
            className="message-app-logout"
            onClick={handleLogout}
            disabled={loggingOut}
            title={navigationExpanded ? undefined : "Sign out"}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="logout" />
            </span>
            <span className="message-rail-label">
              {loggingOut ? "Signing out..." : "Sign out"}
            </span>
          </button>
        </div>
      </header>

      {navigationExpanded && (
        <button
          type="button"
          className="message-rail-scrim"
          onClick={() => setNavigationExpanded(false)}
          aria-label="Close messaging navigation"
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
            aria-label="Dismiss conversation action confirmation"
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
              : "Open NT Message to view this notification."}
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
                : "Open NT Message to view this notification."}
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
          }${createGroupMode ? " create-group-open" : ""}${ownProfileMode ? " profile-workspace-open" : ""}${settingsMode ? " settings-workspace-open" : ""}${notificationMode ? " notification-workspace-open" : ""}`}
      >
        {/* Create Group owns the full workspace so form instructions and status
            are not duplicated in the conversation sidebar. */}
        {!createGroupMode && !ownProfileMode && !settingsMode && !notificationMode && (
          <aside className="message-sidebar">
            <div className="message-sidebar-heading">
              <button
                type="button"
                className="message-mobile-menu-button"
                onClick={() => setNavigationExpanded(true)}
                aria-label="Open messaging navigation"
                title="Open navigation"
              >
                <span aria-hidden="true">☰</span>
              </button>

              <div>
                <span>Messages</span>
                <h1>{sidebarTitle}</h1>
              </div>

              {notificationMode ||
                ownProfileMode ||
                newConversationMode ||
                createGroupMode ? (
                <button
                  type="button"
                  className="message-sidebar-back-action"
                  onClick={() => navigate("/messages")}
                  aria-label="Back to chats"
                  title="Back to chats"
                >
                  ←
                </button>
              ) : !announcementMode &&
                !starredMode &&
                !requestMode &&
                !settingsMode ? (
                <div className="message-sidebar-actions">
                  <button
                    type="button"
                    className="message-group-new-button"
                    onClick={openCreateGroup}
                    aria-label="Create a new group"
                    title="New group"
                  >
                    <MessageNavigationIcon name="newGroup" />
                  </button>

                  <button
                    type="button"
                    className="message-new-button"
                    onClick={openNewConversation}
                    aria-label="Start a new private conversation"
                    title="New conversation"
                  >
                    <MessageNavigationIcon name="newChat" />
                  </button>
                </div>
              ) : null}
            </div>

            {!settingsMode && !ownProfileMode && !createGroupMode && (
              <label className="message-conversation-search">
                <span className="sr-only">
                  {newConversationMode
                    ? "Search eligible accounts"
                    : announcementMode
                      ? "Search official groups"
                      : requestMode
                        ? "Search message requests"
                        : starredMode
                          ? "Search starred messages"
                          : notificationMode
                            ? "Search notifications"
                            : "Search conversations"}
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
                      ? "Search people"
                      : announcementMode
                        ? "Search official groups"
                        : requestMode
                          ? "Search message requests"
                          : starredMode
                            ? "Search starred messages"
                            : notificationMode
                              ? "Search notifications"
                              : "Search conversations"
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
                    aria-label="Clear search"
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </label>
            )}

            {settingsMode ? (
              <nav
                className="message-settings-workspace-navigation"
                aria-label="Messaging settings sections"
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
                    <span>{tab.label}</span>
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
                    {profileData?.displayName ?? account?.displayName ?? "My profile"}
                  </strong>
                  <span>
                    {profileData
                      ? roleLabel(profileData.role)
                      : account
                        ? roleLabel(account.role)
                        : "NT Message account"}
                  </span>
                </div>
                <p>
                  Update your display photo and About message. Official identity
                  information stays read-only.
                </p>
              </div>
            ) : createGroupMode ? (
              <div className="message-create-flow-sidebar">
                <span className="message-create-flow-sidebar-icon" aria-hidden="true">
                  <MessageNavigationIcon name="newGroup" />
                </span>
                <strong>Build a clear group space</strong>
                <p>
                  Add a name, explain the purpose, then choose eligible members.
                </p>
                <dl>
                  <div>
                    <dt>Type</dt>
                    <dd>{groupKind === "OFFICIAL" ? "Official" : "Personal"}</dd>
                  </div>
                  <div>
                    <dt>Members</dt>
                    <dd>
                      {groupKind === "OFFICIAL"
                        ? "Automatic"
                        : groupSelectedAccountIds.length}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : newConversationMode ? null : notificationMode ? (
              <div
                className="message-conversation-category-tabs"
                aria-label="Notification filters"
              >
                <button
                  type="button"
                  className={notificationListView === "ALL" ? "active" : ""}
                  onClick={() => setNotificationListView("ALL")}
                >
                  All
                </button>
                <button
                  type="button"
                  className={notificationListView === "UNREAD" ? "active" : ""}
                  onClick={() => setNotificationListView("UNREAD")}
                >
                  Unread{notificationUnreadCount > 0 ? ` ${notificationUnreadCount}` : ""}
                </button>
              </div>
            ) : requestMode ? (
              <div
                className="message-conversation-category-tabs"
                aria-label="Message request filters"
              >
                <button
                  type="button"
                  className={requestListView === "RECEIVED" ? "active" : ""}
                  onClick={() => {
                    setRequestListView("RECEIVED");
                    setSelectedRequestId(null);
                  }}
                >
                  Received
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
                  Sent
                  {messageRequests.counts.sentPending > 0
                    ? ` ${messageRequests.counts.sentPending}`
                    : ""}
                </button>
              </div>
            ) : !announcementMode ? (
              <div
                className="message-conversation-category-tabs"
                aria-label={
                  !starredMode &&
                    (conversationCategory === "GROUPS" ||
                      conversationCategory === "OFFICIAL")
                    ? "Group filters"
                    : "Conversation filters"
                }
              >
                {!starredMode &&
                  (conversationCategory === "GROUPS" ||
                    conversationCategory === "OFFICIAL") ? (
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
                      Personal
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
                      Official
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={
                        !starredMode &&
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
                      All
                    </button>
                    <button
                      type="button"
                      className={
                        !starredMode &&
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
                      Unread{totalUnread > 0 ? ` ${totalUnread}` : ""}
                    </button>
                    <button
                      type="button"
                      className={
                        !starredMode && conversationListView === "FAVORITES"
                          ? "active"
                          : ""
                      }
                      onClick={() => {
                        navigate("/messages");
                        setConversationCategory("ALL");
                        setConversationListView("FAVORITES");
                      }}
                    >
                      Favorites
                    </button>
                    <button
                      type="button"
                      className={starredMode ? "active" : ""}
                      onClick={() => navigate("/messages/starred")}
                    >
                      Starred
                    </button>
                    <button
                      type="button"
                      className={
                        !starredMode && conversationListView === "ARCHIVED"
                          ? "active"
                          : ""
                      }
                      onClick={() => {
                        navigate("/messages");
                        setConversationCategory("ALL");
                        setConversationListView("ARCHIVED");
                      }}
                    >
                      Archived
                    </button>
                  </>
                )}
              </div>
            ) : null}

            <div className="message-sidebar-summary">
              {settingsMode ? (
                <>
                  <span>{SETTINGS_TABS.length} sections</span>
                  <span>Account preferences</span>
                </>
              ) : notificationMode ? (
                <>
                  <span>{filteredNotifications.length} notifications</span>
                  <span>{notificationUnreadCount} unread</span>
                </>
              ) : announcementMode ? (
                <>
                  <span>
                    {announcementGroupSearchResults.length} official groups
                  </span>
                  <span>Announcements</span>
                </>
              ) : starredMode ? (
                <>
                  <span>{filteredStarredItems.length} starred</span>
                  <span>{conversationSearch.trim() ? "Search" : "Personal"}</span>
                </>
              ) : requestMode ? (
                <>
                  <span>{filteredRequestItems.length} requests</span>
                  <span>
                    {requestListView === "RECEIVED" ? "Received" : "Sent"}
                  </span>
                </>
              ) : conversationSearch.trim() ? (
                <>
                  <span>{conversationSearchResultCount} results</span>
                  <span>Search</span>
                </>
              ) : (
                <>
                  <span>{filteredConversations.length} conversations</span>
                  <span>{totalUnread} unread</span>
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
                    ? "Marking..."
                    : "Mark all read"}
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
                    ? "Removing..."
                    : "Remove seen"}
                </button>
                <button
                  type="button"
                  onClick={() => openSettingsWorkspace("NOTIFICATIONS")}
                >
                  Settings
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
                  aria-label="Dismiss request notice"
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
                    Retry
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
                      ? "Loading eligible accounts..."
                      : notificationMode
                        ? "Loading notifications..."
                        : announcementMode
                          ? "Loading official groups..."
                          : starredMode
                            ? "Loading starred messages..."
                            : requestMode
                              ? "Loading message requests..."
                              : "Loading conversations..."}
                  </p>
                </div>
              ) : settingsMode ? (
                <div className="message-settings-sidebar-note">
                  <span aria-hidden="true">⚙</span>
                  <strong>{SETTINGS_TABS.find((tab) => tab.value === settingsTab)?.label}</strong>
                  <p>Choose a section to manage your account and device preferences.</p>
                </div>
              ) : ownProfileMode ? (
                <div className="message-profile-sidebar-note">
                  <strong>Profile and identity</strong>
                  <p>
                    Your About message and profile photo are editable. Official
                    account information stays protected and read-only.
                  </p>
                </div>
              ) : createGroupMode ? (
                <div className="message-create-flow-sidebar-note">
                  <strong>
                    {groupKind === "OFFICIAL"
                      ? "Official membership"
                      : "Personal membership"}
                  </strong>
                  <p>
                    {groupKind === "OFFICIAL"
                      ? "Members are generated from the selected organizational scope."
                      : groupSelectedAccountIds.length === 0
                        ? "Choose at least one eligible member to create the group."
                        : `${groupSelectedAccountIds.length} member${groupSelectedAccountIds.length === 1 ? "" : "s"} selected.`}
                  </p>
                </div>
              ) : newConversationMode ? (
                contactError ? (
                  <div className="message-list-state compact danger" role="alert">
                    <div className="message-empty-icon" aria-hidden="true">!</div>
                    <h2>People unavailable</h2>
                    <p>{contactError}</p>
                  </div>
                ) : contacts.length === 0 ? (
                  <div className="message-list-state compact" role="status">
                    <div className="message-empty-icon" aria-hidden="true">+</div>
                    <h2>No eligible accounts found</h2>
                    <p>Try another name, employee ID, username or designation.</p>
                  </div>
                ) : (
                  contacts.map((contact) => (
                    <article key={contact.accountId} className="message-contact-workspace-row">
                      <div className="message-contact-workspace-open">
                        {renderAccountAvatar(contact)}
                        <span>
                          <strong>{contact.displayName}</strong>
                          <small>
                            {contact.employee?.designation ?? roleLabel(contact.role)}
                          </small>
                          <em>
                            {contact.employee?.department?.name ??
                              contact.employee?.division?.name ??
                              contact.username ??
                              roleLabel(contact.role)}
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
                          ? "Opening..."
                          : contactActionLabel(contact)}
                      </button>
                    </article>
                  ))
                )
              ) : notificationMode ? (
                notificationError ? (
                  <div className="message-list-state compact danger" role="alert">
                    <div className="message-empty-icon" aria-hidden="true">!</div>
                    <h2>Notifications unavailable</h2>
                    <p>{notificationError}</p>
                  </div>
                ) : filteredNotifications.length === 0 ? (
                  <div className="message-list-state compact" role="status">
                    <div className="message-empty-icon" aria-hidden="true">N</div>
                    <h2>
                      {conversationSearch.trim()
                        ? "No matching notifications"
                        : notificationListView === "UNREAD"
                          ? "No unread notifications"
                          : "No notifications yet"}
                    </h2>
                    <p>
                      {conversationSearch.trim()
                        ? "Try a title, message preview or notification type."
                        : "New message, announcement, duty and work updates will appear here."}
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
                                : "Preview hidden by notification privacy."}
                            </small>
                          </span>
                          <em>{notificationTimestampLabel(notification.createdAt)}</em>
                        </button>
                        <button
                          type="button"
                          className="message-notification-delete"
                          aria-label={`Remove ${notification.title} notification`}
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
                    <h2>No official groups found</h2>
                    <p>
                      New authorized official groups will appear here
                      automatically.
                    </p>
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
                    <h2>Starred messages unavailable</h2>
                    <p>{starredError}</p>
                    <button type="button" onClick={() => void loadStarredMessages()}>
                      Try again
                    </button>
                  </div>
                ) : filteredStarredItems.length === 0 ? (
                  <div className="message-list-state compact" role="status">
                    <div className="message-empty-icon" aria-hidden="true">
                      ★
                    </div>
                    <h2>
                      {conversationSearch.trim()
                        ? "No matching starred messages"
                        : "No starred messages yet"}
                    </h2>
                    <p>
                      {conversationSearch.trim()
                        ? "Try a conversation name, sender, message text or file name."
                        : "Star important messages and they will remain easy to find here."}
                    </p>
                  </div>
                ) : (
                  <div className="message-starred-workspace-list">
                    {filteredStarredItems.map(renderStarredMessageRow)}
                  </div>
                )
              ) : requestMode ? (
                requestError ? (
                  <div className="message-list-state compact danger" role="alert">
                    <div className="message-empty-icon" aria-hidden="true">
                      !
                    </div>
                    <h2>Message requests unavailable</h2>
                    <p>{requestError}</p>
                    <button type="button" onClick={() => void loadMessageRequests()}>
                      Try again
                    </button>
                  </div>
                ) : filteredRequestItems.length === 0 ? (
                  <div className="message-list-state compact" role="status">
                    <div className="message-empty-icon" aria-hidden="true">
                      {requestListView === "RECEIVED" ? "↓" : "↑"}
                    </div>
                    <h2>
                      {conversationSearch.trim()
                        ? "No matching requests"
                        : requestListView === "RECEIVED"
                          ? "No received requests"
                          : "No sent requests"}
                    </h2>
                    <p>
                      {conversationSearch.trim()
                        ? "Try a name, employee ID, designation or request reason."
                        : requestListView === "RECEIVED"
                          ? "New first-contact requests will appear here."
                          : "Requests you send will appear here until they are resolved."}
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
                    <h2>No matching people or groups</h2>
                    <p>Try a name, employee ID, username or designation.</p>
                  </div>
                ) : (
                  <div className="message-conversation-search-results">
                    {conversationSearchResults.directChats.length > 0 && (
                      <section className="message-search-result-section">
                        <h2>Chats</h2>
                        <div className="message-search-result-list">
                          {conversationSearchResults.directChats.map(
                            renderConversationRow,
                          )}
                        </div>
                      </section>
                    )}

                    {conversationSearchResults.groupsInCommon.length > 0 && (
                      <section className="message-search-result-section">
                        <h2>Groups in common</h2>
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
                    M
                  </div>
                  <h2>No conversations found</h2>
                  <p>Start a private conversation or create a group.</p>
                  <button type="button" onClick={openNewConversation}>
                    New conversation
                  </button>
                </div>
              ) : (
                filteredConversations.map(renderConversationRow)
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
                    ? "Reconnecting to real-time updates"
                    : realtimeStatus === "CONNECTING"
                      ? "Connecting to real-time updates"
                      : "Real-time updates are offline"}
                </strong>
                <small>
                  {realtimeStatus === "DISCONNECTED"
                    ? "Check your connection. New activity may be delayed until NT Message reconnects."
                    : "NT Message will restore live updates automatically."}
                </small>
              </div>
            </div>
          )}

          {ownProfileMode ? (
            <div className="message-profile-workspace">
              <header className="message-profile-workspace-header">
                <button
                  type="button"
                  className="message-mobile-back"
                  onClick={() => navigate("/messages")}
                  aria-label="Back to conversations"
                >
                  ←
                </button>
                <div>
                  <span>My profile</span>
                  <h2>Profile and official identity</h2>
                  <p>
                    Manage your display details without changing verified
                    organizational information.
                  </p>
                </div>
                <button
                  type="button"
                  className="message-workspace-close-action"
                  onClick={() => navigate("/messages")}
                >
                  Back to chats
                </button>
              </header>
              <div className="message-profile-workspace-scroll">
                {renderProfileContent()}
              </div>
            </div>
          ) : createGroupMode ? (
            renderCreateGroupWorkspaceContent()
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
                <h2>Start a private conversation</h2>
                <p>
                  Search the employee list, review the person’s profile when
                  needed, then choose Message or Request according to the
                  existing contact rules.
                </p>
                <small>
                  Blocking, account eligibility and canonical conversation
                  reuse remain enforced by NT Message.
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
                  aria-label="Back to messages"
                >
                  ←
                </button>
                <div>
                  <span>Settings</span>
                  <h2>Manage your messaging preferences</h2>
                  <p>Account privacy, notifications, appearance, storage and security.</p>
                </div>
                <button
                  type="button"
                  className="message-workspace-close-action"
                  onClick={() => navigate("/messages")}
                >
                  Back to chats
                </button>
              </header>

              <div className="message-settings-workspace-layout">
              <div
                className="message-settings-workspace-mobile-tabs"
                role="tablist"
                aria-label="Messaging settings"
              >
                {SETTINGS_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    className={settingsTab === tab.value ? "active" : ""}
                    aria-selected={settingsTab === tab.value}
                    onClick={() => setSettingsTab(tab.value)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div
                id="message-settings-tabpanel"
                className="message-settings-body"
                role="tabpanel"
                aria-labelledby={`message-settings-nav-${settingsTab.toLowerCase()}`}
                tabIndex={0}
              >
                {settingsTab === "PRIVACY" && (
                  <section className="message-settings-section">
                    {messagingSettingsLoading && (
                      <p className="message-settings-note">
                        Loading account privacy settings...
                      </p>
                    )}

                    <label className="message-settings-toggle">
                      <span>
                        <strong>Share my online status</strong>
                        <small>
                          Allow other users to see when you are online, typing
                          and recently active.
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
                        <strong>Send my read receipts</strong>
                        <small>
                          Allow message senders to see when you have read
                          their messages.
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
                        <strong>Require message requests</strong>
                        <small>
                          When enabled, users covered by the existing
                          first-contact rules must request permission. When
                          disabled, eligible users can start a private chat
                          directly. Blocking and eligibility rules still apply.
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
                        Saving account settings...
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
                        Restore privacy defaults
                      </button>
                    </div>

                    <p className="message-settings-note">
                      Privacy and request preferences are saved to your NT
                      Message account and follow you across devices.
                    </p>
                  </section>
                )}

                {settingsTab === "NOTIFICATIONS" && (
                  <section className="message-settings-section">
                    <label className="message-settings-toggle">
                      <span>
                        <strong>Notification sound</strong>
                        <small>
                          Play the NT Message alert sound on this device for
                          new realtime notifications.
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
                        <strong>Browser notifications</strong>
                        <small>
                          Show system notifications on this device when the
                          browser permission is allowed.
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
                      Browser permission:{" "}
                      <strong>{browserNotificationPermissionLabel()}</strong>.
                      NT Message can stop using permission but cannot revoke
                      browser-level permission.
                    </p>

                    <label className="message-settings-toggle">
                      <span>
                        <strong>Show notification preview</strong>
                        <small>
                          Include approved preview text in in-app and browser
                          notification surfaces.
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
                        <strong>Mute ordinary popups</strong>
                        <small>
                          Keep the notification center and unread count, but
                          suppress ordinary toast, sound and browser popups.
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
                        Restore notification defaults
                      </button>
                    </div>

                    <p className="message-settings-note">
                      Sound and browser-notification controls apply only to
                      this browser. Notification previews and popup muting are
                      retained for this signed-in workspace.
                    </p>
                  </section>
                )}

                {settingsTab === "APPEARANCE" && (
                  <section className="message-settings-section">
                    <label className="message-customization-field">
                      <span>Theme</span>
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
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="message-customization-field">
                      <span>Chat wallpaper</span>
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
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="message-customization-field">
                      <span>Message density</span>
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
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="message-settings-toggle">
                      <span>
                        <strong>Reduce motion</strong>
                        <small>
                          Minimize interface animation for this account on this browser.
                          Your operating-system reduced-motion setting is always respected.
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
                        Restore appearance defaults
                      </button>
                    </div>

                    <p className="message-settings-note">
                      Appearance preferences are stored separately for this
                      account on this browser. System follows the device theme,
                      while NT Blue remains the product accent in every mode.
                    </p>
                  </section>
                )}

                {settingsTab === "STORAGE" && (
                  <section className="message-settings-section message-settings-storage-section">
                    <div className="message-settings-security-card">
                      <span>Storage and Data</span>
                      <strong>Review your visible file usage</strong>
                      <small>
                        See images, videos, documents, audio, largest files
                        and storage by authorized conversation.
                      </small>
                    </div>

                    <button
                      type="button"
                      className="message-settings-storage-open"
                      onClick={() => openStorageUsage({ kind: "USER" })}
                    >
                      <MessageNavigationIcon name="storage" />
                      <span>
                        <strong>Open storage manager</strong>
                        <small>
                          Totals reflect files currently visible to your
                          authenticated account.
                        </small>
                      </span>
                    </button>

                    <p className="message-settings-note">
                      Your storage manager never grants management accounts
                      access to private filenames, participants or message
                      content outside their own authorized conversations.
                    </p>
                  </section>
                )}

                {settingsTab === "BLOCKED" && (
                  <section className="message-settings-section">
                    <div className="message-settings-summary">
                      <strong>{blockedAccounts.length}</strong>
                      <span>
                        blocked private contact
                        {blockedAccounts.length === 1 ? "" : "s"}
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
                        Loading blocked accounts...
                      </p>
                    ) : blockedAccounts.length === 0 ? (
                      <p className="message-settings-empty">
                        No blocked private contacts.
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
                                Private messages and personal group invites
                                blocked
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
                                ? "Working..."
                                : "Unblock"}
                            </button>
                          </article>
                        ))}
                      </div>
                    )}

                    {blockedMessageRequests.length > 0 && (
                      <p className="message-settings-note">
                        {blockedMessageRequests.length} old blocked request
                        {blockedMessageRequests.length === 1 ? "" : "s"}{" "}
                        remain in history.
                      </p>
                    )}

                    <p className="message-settings-note">
                      Blocking is hierarchy-safe: it affects private chat and
                      new personal group invites only. Existing group
                      messages, official groups, announcements and authority
                      messages remain available.
                    </p>
                  </section>
                )}

                {settingsTab === "SECURITY" && (
                  <section className="message-settings-section">
                    <div className="message-settings-security-card">
                      <span>Signed-in account</span>
                      <strong>
                        {account?.displayName ?? "NT Message User"}
                      </strong>
                      <small>
                        {account?.positionLabel ??
                          (account
                            ? roleLabel(account.role)
                            : "Employee")}
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
                        Change password
                      </button>
                      <button
                        type="button"
                        onClick={handleLogout}
                        disabled={loggingOut || securityAction !== null}
                      >
                        {loggingOut
                          ? "Signing out..."
                          : "Sign out this device"}
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => void handleLogoutAllDevices()}
                        disabled={loggingOut || securityAction !== null}
                      >
                        {securityAction === "SIGN_OUT_ALL"
                          ? "Signing out all devices..."
                          : "Sign out all devices"}
                      </button>
                    </div>

                    <p className="message-settings-note">
                      Password and session actions use the existing secure auth
                      APIs. Active-device listing and one-device revocation
                      remain a separate audited feature.
                    </p>
                  </section>
                )}
              </div>
              </div>

            </div>
          ) : notificationMode ? (
            <div className="message-notification-workspace">
              <header className="message-notification-workspace-header">
                <div>
                  <span>Notification center</span>
                  <h2>Notifications</h2>
                  <p>Review updates and open the related item when needed.</p>
                </div>
                <button
                  type="button"
                  className="message-workspace-close-action"
                  onClick={() => navigate("/messages")}
                >
                  Back to chats
                </button>
              </header>

              <div className="message-notification-workspace-body">
              <aside className="message-notification-workspace-list-panel">
                <div className="message-notification-workspace-list-header">
                  <div className="message-notification-workspace-metrics">
                  <article>
                    <span>All notifications</span>
                    <strong>{notifications.length}</strong>
                  </article>
                  <article>
                    <span>Unread</span>
                    <strong>{notificationUnreadCount}</strong>
                  </article>
                </div>

                  <div className="message-notification-workspace-filters" aria-label="Notification filters">
                    <button
                      type="button"
                      className={notificationListView === "ALL" ? "active" : ""}
                      onClick={() => setNotificationListView("ALL")}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={notificationListView === "UNREAD" ? "active" : ""}
                      onClick={() => setNotificationListView("UNREAD")}
                    >
                      Unread {notificationUnreadCount > 0 ? notificationUnreadCount : ""}
                    </button>
                  </div>

                  <label className="message-notification-workspace-search">
                    <MessageNavigationIcon name="search" />
                    <input
                      type="search"
                      value={conversationSearch}
                      onChange={(event) => setConversationSearch(event.target.value)}
                      placeholder="Search notifications"
                    />
                  </label>
                </div>

                <div className="message-notification-workspace-list">
                  {notificationsLoading ? (
                    <div className="message-notification-workspace-empty">Loading notifications…</div>
                  ) : notificationError ? (
                    <div className="message-notification-workspace-empty danger">{notificationError}</div>
                  ) : filteredNotifications.length === 0 ? (
                    <div className="message-notification-workspace-empty">
                      {conversationSearch.trim()
                        ? "No notifications match your search."
                        : notificationListView === "UNREAD"
                          ? "You are all caught up."
                          : "No notifications yet."}
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
                                : "Preview hidden by notification privacy."}
                            </small>
                          </span>
                          <em>{notificationTimestampLabel(notification.createdAt)}</em>
                        </button>
                        <button
                          type="button"
                          className="message-notification-delete"
                          aria-label={`Remove ${notification.title} notification`}
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
                      ? "Marking..."
                      : "Mark all read"}
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
                      ? "Removing..."
                      : "Remove seen"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openSettingsWorkspace("NOTIFICATIONS")}
                  >
                    Notification settings
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
                  <h3>Keep up with what matters</h3>
                  <p>Choose an update from the list to open its related conversation, announcement, duty, or work item.</p>
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
                <span>Official announcements</span>
                <h2>Select an official group</h2>
                <p>
                  The selected group defines the authorized announcement
                  audience. Official-group chat messages are never displayed in
                  this section.
                </p>
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
                    <span>Official announcements</span>
                    <h2>{selectedConversation.title ?? "Official group"}</h2>
                    <p>{officialScopeLabel(selectedConversation)}</p>
                  </div>
                  {canManageSelectedAnnouncementGroup && (
                    <button
                      type="button"
                      className="message-announcement-create-button"
                      onClick={openAnnouncementComposer}
                    >
                      <span aria-hidden="true">+</span>
                      New announcement
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
                      <strong>Announcement updated</strong>
                      <span>{announcementComposerNotice}</span>
                      <button
                        type="button"
                        onClick={() => setAnnouncementComposerNotice(null)}
                        aria-label="Dismiss announcement status"
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
                      <h3>Loading official announcements</h3>
                      <p>
                        Retrieving records authorized for this official group.
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
                      <h3>Announcements could not be loaded</h3>
                      <p>{announcementError}</p>
                      <button
                        type="button"
                        onClick={() =>
                          void loadSelectedGroupAnnouncements(
                            selectedConversation.id,
                          )
                        }
                      >
                        Try again
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
                      <h3>No announcements yet</h3>
                      <p>
                        Official announcements for this group will appear here.
                        Group-chat messages and shared chat content remain
                        completely separate.
                      </p>
                      {canManageSelectedAnnouncementGroup && (
                        <button
                          type="button"
                          onClick={openAnnouncementComposer}
                        >
                          Create first announcement
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
                <span>First-contact protection</span>
                <h2>Select a message request</h2>
                <p>
                  Review received requests or check the status of requests you
                  sent without leaving the messaging workspace.
                </p>
                <div className="message-collection-welcome-metrics">
                  <span>
                    <strong>{messageRequests.counts.receivedPending}</strong>
                    Received
                  </span>
                  <span>
                    <strong>{messageRequests.counts.sentPending}</strong>
                    Sent
                  </span>
                </div>
              </div>
            ) : (
              <div className="message-request-detail-workspace">
                <header className="message-request-detail-header">
                  <button
                    type="button"
                    className="message-mobile-menu-button message-mobile-menu-button--chat"
                    onClick={() => setNavigationExpanded(true)}
                    aria-label="Open messaging navigation"
                  >
                    <span aria-hidden="true">☰</span>
                  </button>
                  <button
                    type="button"
                    className="message-mobile-back"
                    onClick={() => setSelectedRequestId(null)}
                    aria-label="Back to message requests"
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
                        ? "Received request"
                        : "Sent request"}
                    </span>
                    <h2>{selectedMessageRequest.peer.displayName}</h2>
                    <p>
                      {selectedMessageRequest.peer.employee?.designation ??
                        roleLabel(selectedMessageRequest.peer.role)}
                    </p>
                  </div>
                  <strong className="message-request-detail-status">
                    {requestStatusLabel(selectedMessageRequest)}
                  </strong>
                </header>

                <section className="message-request-detail-body">
                  {requestError && (
                    <div className="message-inline-error" role="alert">
                      <p>{requestError}</p>
                    </div>
                  )}

                  <div className="message-request-detail-card">
                    <span>Why this request exists</span>
                    <h3>{requestReasonLabel(selectedMessageRequest.reason)}</h3>
                    <p>
                      NT Message requires approval before this first private
                      conversation can begin. Existing blocking and account
                      eligibility rules remain in effect.
                    </p>
                  </div>

                  <dl className="message-request-detail-facts">
                    <div>
                      <dt>Requested</dt>
                      <dd>
                        {formatAnnouncementDate(
                          selectedMessageRequest.requestedAt,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Direction</dt>
                      <dd>
                        {selectedMessageRequest.direction === "RECEIVED"
                          ? "Received by you"
                          : "Sent by you"}
                      </dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{requestStatusLabel(selectedMessageRequest)}</dd>
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
                            ? "Working..."
                            : "Accept and open chat"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleDeclineRequest(selectedMessageRequest)
                          }
                          disabled={requestActionId !== null}
                        >
                          Decline
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() =>
                            void handleBlockRequest(selectedMessageRequest)
                          }
                          disabled={requestActionId !== null}
                        >
                          Block
                        </button>
                      </div>
                    )}
                </section>
              </div>
            )
          ) : starredMode && !selectedConversation ? (
            <div className="message-collection-welcome-state starred">
              <span className="message-collection-welcome-icon" aria-hidden="true">
                <MessageNavigationIcon name="starred" />
              </span>
              <span>Your saved messages</span>
              <h2>Select a starred message</h2>
              <p>
                Open the original conversation and jump directly to the saved
                message without leaving NT Message.
              </p>
              <small>
                Starred messages are personal to your account and do not affect
                other participants.
              </small>
            </div>
          ) : !selectedConversation ? (
            <div className="message-welcome-state">
              <div className="message-welcome-brand" aria-hidden="true">
                <img src="/nt-logo.png" alt="" />
              </div>
              <span>NT Message</span>
              <h2>Secure internal communication</h2>
              <p>
                Select a conversation, start a private chat, or create a group
                for your team.
              </p>
              <div className="message-welcome-actions">
                <button type="button" onClick={openNewConversation}>
                  <MessageNavigationIcon name="newChat" />
                  New conversation
                </button>
                <button type="button" onClick={openCreateGroup}>
                  <MessageNavigationIcon name="newGroup" />
                  New group
                </button>
              </div>
              <small>
                Private message content remains visible only to authorized
                participants.
              </small>
            </div>
          ) : (
            <>
              <header className="message-chat-header">
                <button
                  type="button"
                  className="message-mobile-menu-button message-mobile-menu-button--chat"
                  onClick={() => setNavigationExpanded(true)}
                  aria-label="Open messaging navigation"
                >
                  <span aria-hidden="true">☰</span>
                </button>

                <button
                  type="button"
                  className="message-mobile-back"
                  onClick={() => setSelectedConversationId(null)}
                  aria-label="Back to conversations"
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
                        aria-label={`${selectedConversation.title ?? "Contact"} is online`}
                      />
                    )}
                </span>

                <div className="message-chat-identity">
                  <h2>
                    {selectedConversation.title ?? "Private conversation"}
                  </h2>
                  <p>
                    {selectedConversation.type === "GROUP"
                      ? selectedConversation.groupKind === "OFFICIAL"
                        ? officialScopeLabel(selectedConversation)
                        : `${selectedConversation.memberCount} members · Personal group`
                      : [
                        peer?.employee?.designation ??
                        roleLabel(peer?.role ?? "EMPLOYEE"),
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
                  aria-label="Conversation actions"
                >
                  <button
                    ref={messageSearchTriggerRef}
                    type="button"
                    className={searchPanelOpen ? "active" : ""}
                    onClick={() => openMessageSearchPanel()}
                    aria-expanded={searchPanelOpen}
                    aria-label="Search this conversation"
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
                    aria-label="Open conversation information"
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
                      aria-label="More conversation actions"
                    >
                      <MessageNavigationIcon name="more" />
                    </button>

                    {conversationActionMenuOpen && (
                      <div
                        ref={conversationActionMenuRef}
                        className="message-conversation-action-menu compact"
                        role="menu"
                        aria-label="Conversation actions"
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
                              <span>Mute notifications</span>
                            </button>
                            {(
                              [
                                ["1_HOUR", "Mute for 1 hour"],
                                ["8_HOURS", "Mute for 8 hours"],
                                ["1_WEEK", "Mute for 1 week"],
                                ["ALWAYS", "Mute always"],
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
                                      ? "Add member"
                                      : "Manage group members"}
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
                                  ? "Remove from favorites"
                                  : "Add to favorites"}
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
                                <span>Unmute notifications</span>
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
                                <span>Mute notifications ›</span>
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
                                    ? "Unblock contact"
                                    : "Block contact"}
                                </span>
                              </button>
                            )}

                            <button
                              type="button"
                              role="menuitem"
                              onClick={closeActiveConversation}
                            >
                              <MessageNavigationIcon name="close" />
                              <span>Close conversation</span>
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
                              <span>Clear chat for me</span>
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
                                <span>Delete chat for me</span>
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
                    aria-label="Dismiss message error"
                  >
                    ×
                  </button>
                </div>
              )}

              {messageNotice && (
                <div
                  className="message-chat-notice"
                  role="status"
                  aria-live="polite"
                >
                  <span>{messageNotice}</span>
                  <button
                    type="button"
                    onClick={() => setMessageNotice(null)}
                    aria-label="Dismiss message notice"
                  >
                    ×
                  </button>
                </div>
              )}

              {inviteJoinLoading && (
                <div
                  className="message-chat-notice"
                  role="status"
                  aria-live="polite"
                >
                  <span>Joining group from invitation link...</span>
                </div>
              )}

              {activePinnedMessage && (
                <section
                  className="message-pinned-strip"
                  aria-label="Pinned message"
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
                        {attachmentLabel(activePinnedMessage)}
                      </strong>
                      <small>
                        {normalizedPinnedMessageIndex + 1} of {" "}
                        {visiblePinnedMessages.length}
                      </small>
                    </span>
                  </button>

                  <div className="message-pinned-strip-actions">
                    <button
                      type="button"
                      onClick={() => movePinnedMessageSelection(-1)}
                      disabled={visiblePinnedMessages.length < 2}
                      aria-label="Previous pinned message"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={() => movePinnedMessageSelection(1)}
                      disabled={visiblePinnedMessages.length < 2}
                      aria-label="Next pinned message"
                    >
                      ›
                    </button>
                    <button
                      type="button"
                      className="message-pinned-strip-browse"
                      onClick={() => setPinnedMessageBrowserOpen(true)}
                    >
                      All
                    </button>
                  </div>
                </section>
              )}

              <div className="message-thread-shell">
                <div
                  className="message-thread"
                  ref={messageListRef}
                  onScroll={handleMessageThreadScroll}
                  aria-busy={messageLoading || olderMessagesLoading}
                >
                  <div className="message-thread-content">
                    {hasOlderMessages && (
                      <button
                        type="button"
                        className="message-load-older"
                        onClick={() => void handleLoadOlderMessages()}
                        disabled={olderMessagesLoading}
                      >
                        {olderMessagesLoading
                          ? "Loading…"
                          : "Load older messages"}
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
                        <p>Loading messages...</p>
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
                            ? "This chat was cleared for you"
                            : "Start the conversation"}
                        </h3>
                        <p>
                          {selectedConversation.historyClearedAt
                            ? "New messages will appear here. Other participants were not affected."
                            : `Send the first message to ${selectedConversation.title}.`}
                        </p>
                      </div>
                    ) : (
                      displayMessages.map((message, index) => {
                        const ownMessage =
                          message.senderAccountId === account?.id;
                        const officialAnnouncement =
                          getOfficialAnnouncementPayload(message);
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
                          !message.textContent &&
                          (hasAttachments || isLocationMessage) &&
                          !message.replyTo &&
                          !message.forwardedFrom &&
                          !officialAnnouncement;

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
                                }${attachmentOnlyMessage ? " attachment-only" : ""}`}
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
                                    {!message.isDeleted &&
                                      (message.isStarred || message.isPinned) && (
                                        <div
                                          className="message-state-badges"
                                          aria-label="Message state"
                                        >
                                          {message.isPinned && (
                                            <span>📌 Pinned</span>
                                          )}
                                          {message.isStarred && (
                                            <span>★ Starred</span>
                                          )}
                                        </div>
                                      )}

                                    {officialAnnouncement && !message.isDeleted && (
                                      <div className="message-announcement-label">
                                        <strong>
                                          {officialAnnouncement.label}
                                        </strong>
                                        <span>Official group broadcast</span>
                                      </div>
                                    )}

                                    {message.forwardedFrom &&
                                      !message.isDeleted && (
                                        <div className="message-forwarded-label">
                                          <strong>Forwarded</strong>
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
                                            ? "Original reply message is unavailable"
                                            : "Open original reply message"
                                        }
                                      >
                                        <strong>
                                          {message.replyTo.senderAccountId ===
                                            account?.id
                                            ? "You"
                                            : message.replyTo.sender.displayName}
                                        </strong>
                                        <span>
                                          {message.replyTo.isDeleted
                                            ? "This message was deleted"
                                            : (message.replyTo.textContent ??
                                              "Message")}
                                        </span>
                                      </button>
                                    )}

                                    {message.isDeleted ? (
                                      <em>This message was deleted.</em>
                                    ) : (
                                      <>
                                        {message.textContent &&
                                          message.contentType !== "LOCATION" && (
                                            <p>
                                              {renderMessageTextWithMentions(
                                                message,
                                              )}
                                            </p>
                                          )}

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
                                                />
                                              ),
                                            )}
                                          </div>
                                        )}

                                        {(message.reactions?.length ?? 0) > 0 && (
                                          <div className="message-reactions">
                                            {groupMessageReactions(
                                              message,
                                              account?.id,
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
                                                aria-label={`${reactionGroup.emoji} reaction from ${reactionGroup.count} participant${reactionGroup.count === 1
                                                  ? ""
                                                  : "s"
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
                                      </>
                                    )}
                                  </div>

                                  <div
                                    className="message-bubble-actions"
                                    data-message-action-root={message.id}
                                    role="toolbar"
                                    aria-label="Message quick actions"
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
                                        aria-label="React to message"
                                        title="React"
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
                                        aria-label="Reply to message"
                                        title="Reply"
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
                                      aria-label="Open more message actions"
                                      title="More actions"
                                    >
                                      <MessageNavigationIcon name="more" />
                                    </button>
                                  </div>
                                </div>

                                {(!groupedWithNext || message.editedAt) && (
                                  <div className="message-bubble-meta">
                                    <time>
                                      {formatMessageTime(message.sentAt)}
                                    </time>

                                    {message.editedAt && !message.isDeleted && (
                                      <span>Edited</span>
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
                      ref={messageThreadBottomRef}
                      className="message-thread-bottom"
                      aria-hidden="true"
                    />
                  </div>
                </div>

                {newMessageCount > 0 && (
                  <button
                    type="button"
                    className="message-new-messages-button"
                    onClick={jumpToLatestMessages}
                    aria-live="polite"
                  >
                    <span aria-hidden="true">↓</span>
                    {newMessageCount} new {" "}
                    {newMessageCount === 1 ? "message" : "messages"}
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
                          ? "Editing message"
                          : `Replying to ${replyingTo?.senderAccountId === account?.id
                            ? "yourself"
                            : (replyingTo?.sender.displayName ?? "message")
                          }`}
                      </strong>
                      <small>
                        {(editingMessage ?? replyingTo)?.textContent ??
                          "Message"}
                      </small>
                    </span>

                    <button
                      type="button"
                      onClick={cancelMessageAction}
                      aria-label="Cancel message action"
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
                            ? "Voice note"
                            : `${selectedAttachments.length} attachment${selectedAttachments.length === 1 ? "" : "s"}`}
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
                            ? ` · ${MAX_MESSAGE_ATTACHMENT_FILES - selectedAttachments.length} remaining`
                            : ""}
                        </small>
                      </span>

                      <button
                        type="button"
                        onClick={clearSelectedAttachment}
                        disabled={sendingMessage}
                        aria-label="Remove all selected attachments"
                      >
                        Clear
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
                                  Your browser does not support audio playback.
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
                                  ? "Voice note"
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
                              aria-label={`Remove ${file.name}`}
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
                              ? "Upload failed"
                              : attachmentUpload.progressPercent > 0
                                ? attachmentUpload.totalBytes
                                  ? `Uploading ${attachmentUpload.progressPercent}% · ${formatFileSize(attachmentUpload.loadedBytes)} of ${formatFileSize(attachmentUpload.totalBytes)}`
                                  : `Uploading ${attachmentUpload.progressPercent}%`
                                : "Starting upload..."}
                          </small>
                          {attachmentUpload.status === "FAILED" && (
                            <button
                              type="button"
                              onClick={() => void handleSendMessage()}
                              disabled={sendingMessage}
                            >
                              Retry
                            </button>
                          )}
                        </div>
                        <div
                          className={`message-attachment-upload-track${attachmentUpload.status === "FAILED" ? " failed" : ""}`}
                          aria-label="Attachment upload progress"
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
                  aria-label="Choose attachment"
                />

                {mentionSuggestionsVisible && activeMentionQuery && (
                  <div
                    id="message-mention-suggestions"
                    className="message-mention-suggestions"
                    role="listbox"
                    aria-label="Mention group member"
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
                              "Group member"}
                          </small>
                        </span>
                      </button>
                    ))}
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
                          ? "Preparing voice note"
                          : "Recording voice note"}
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
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="message-recording-stop"
                      onClick={finishVoiceRecording}
                      disabled={voiceRecordingState !== "RECORDING"}
                    >
                      {voiceRecordingState === "STOPPING"
                        ? "Preparing…"
                        : "Stop and attach"}
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
                        aria-label="Open attachment options"
                        disabled={sendingMessage || editingMessage !== null}
                      >
                        <span aria-hidden="true">+</span>
                      </button>

                      {attachmentMenuOpen && (
                        <div
                          className={`message-attachment-menu${attachmentMenuView === "LIVE_LOCATION" ? " live-step" : ""}`}
                          role="dialog"
                          aria-label="Attachment options"
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
                                aria-label="Back to attachment options"
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
                                ? "Live location"
                                : "Attach"}
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
                              aria-label="Close attachment options"
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
                                  <strong>Photo & video</strong>
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
                                  <strong>Document</strong>
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
                                  <strong>Audio</strong>
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
                                  <strong>Location</strong>
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
                                  <strong>Live location</strong>
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
                                    ? "Stopping live location…"
                                    : "Stop live location"}
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
                                <strong>Share your live position</strong>
                                <small>
                                  Only participants in this conversation can
                                  view updates.
                                </small>
                              </div>
                              <div
                                className="message-live-duration-options"
                                role="group"
                                aria-label="Live location duration"
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
                                      ? "15 min"
                                      : duration === 60
                                        ? "1 hour"
                                        : "8 hours"}
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
                                  ? "Starting…"
                                  : "Start sharing"}
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
                        aria-label="Open emoji picker"
                        disabled={sendingMessage}
                      >
                        <MessageNavigationIcon name="emoji" />
                      </button>

                      {composerEmojiOpen && (
                        <div
                          className="message-composer-emoji-menu"
                          role="dialog"
                          aria-label="Quick emojis"
                          onKeyDown={(event) =>
                            handleLinearKeyboardNavigation(event, "BOTH")
                          }
                        >
                          <header className="message-composer-popover-header">
                            <span
                              className="message-popover-header-spacer"
                              aria-hidden="true"
                            />
                            <strong>Emoji</strong>
                            <button
                              type="button"
                              className="message-popover-close"
                              onClick={() => {
                                setComposerEmojiOpen(false);
                                window.requestAnimationFrame(() =>
                                  composerEmojiButtonRef.current?.focus(),
                                );
                              }}
                              aria-label="Close emoji picker"
                            >
                              ×
                            </button>
                          </header>
                          <div className="message-composer-emoji-body">
                            {COMPOSER_EMOJI_SECTIONS.map((section) => (
                              <section
                                key={section.label}
                                className="message-composer-emoji-section"
                                aria-label={section.label}
                              >
                                <h4>{section.label}</h4>
                                <div className="message-composer-emoji-grid">
                                  {section.emojis.map((emoji) => (
                                    <button
                                      key={`${section.label}-${emoji}`}
                                      type="button"
                                      onClick={() => insertComposerEmoji(emoji)}
                                      aria-label={`Insert ${emoji}`}
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
                          ? "Edit your message"
                          : replyingTo
                            ? "Write a reply"
                            : "Type a message"
                      }
                      maxLength={5000}
                      rows={1}
                      disabled={sendingMessage}
                      aria-label="Message text"
                      aria-autocomplete="list"
                      aria-controls={
                        mentionSuggestionsVisible
                          ? "message-mention-suggestions"
                          : undefined
                      }
                      aria-expanded={mentionSuggestionsVisible}
                      aria-activedescendant={activeMentionOptionId}
                      aria-keyshortcuts="Enter Shift+Enter Escape"
                    />

                    {showVoiceRecordAction && (
                      <button
                        type="button"
                        className="message-composer-control message-voice-record-button"
                        onClick={() => void beginVoiceRecording()}
                        disabled={sendingMessage}
                        aria-label="Record voice note"
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
                          ? "Sending message"
                          : sendAttemptFailed
                            ? "Retry sending message"
                            : editingMessage
                              ? "Save message"
                              : "Send message"
                      }
                      title={sendAttemptFailed ? "Retry sending" : undefined}
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
                    {remainingMessageCharacters} character
                    {remainingMessageCharacters === 1 ? "" : "s"} remaining
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
                sharedContentOpen
                  ? "Media, documents and links"
                  : activeUtilityPanel?.kind === "PROFILE"
                    ? "Profile"
                    : "Group information"
              }
            >
              {sharedContentOpen
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
              aria-label="Search messages"
            >
              <div className="message-search-panel-header">
                <div>
                  <strong>Search messages</strong>
                </div>
                <button
                  type="button"
                  className="message-search-panel-close"
                  onClick={(event) => {
                    event.currentTarget.blur();
                    closeMessageSearchPanel();
                  }}
                  aria-label="Close message search"
                >
                  <MessageNavigationIcon name="close" />
                </button>
              </div>

              <div className="message-search-panel-controls" role="search">
                <label className="message-search-input-shell">
                  <span className="sr-only">Search this conversation</span>
                  <MessageNavigationIcon name="search" />
                  <input
                    ref={messageSearchInputRef}
                    type="search"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="Search this conversation"
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
                      aria-label="Clear message search"
                    >
                      <MessageNavigationIcon name="close" />
                    </button>
                  )}
                </label>

                {searchResults.length > 0 && !searchLoading && !searchError && (
                  <p className="message-search-result-count" role="status">
                    {searchResults.length} result
                    {searchResults.length === 1 ? "" : "s"}
                  </p>
                )}
              </div>

              <div className="message-search-panel-results" aria-live="polite">
                {searchLoading ? (
                  <div className="message-search-panel-status">
                    <span className="message-small-spinner" aria-hidden="true" />
                    <span>Searching...</span>
                  </div>
                ) : searchError ? (
                  <div className="message-inline-error compact">
                    <p>{searchError}</p>
                  </div>
                ) : searchText.trim().length === 0 ? null : searchResults.length ===
                  0 ? (
                  <p className="message-search-panel-empty">No messages found</p>
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
                <span>Official announcement</span>
                <h2 id="message-announcement-detail-title">
                  {announcementDetail?.title ?? "Announcement details"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeAnnouncementDetail}
                aria-label="Close announcement details"
                disabled={announcementDetailAction !== null}
              >
                ×
              </button>
            </header>

            <div className="message-announcement-detail-body">
              {announcementDetailLoading ? (
                <div className="message-announcement-detail-state">
                  <strong>Loading announcement</strong>
                  <span>
                    Retrieving the official record and its attachments.
                  </span>
                </div>
              ) : announcementDetailError && !announcementDetail ? (
                <div
                  className="message-announcement-detail-state danger"
                  role="alert"
                >
                  <strong>Announcement could not be opened</strong>
                  <span>{announcementDetailError}</span>
                </div>
              ) : announcementDetail ? (
                <>
                  <section className="message-announcement-detail-overview">
                    <div className="message-announcement-detail-summary">
                      <div className="message-announcement-card-badges">
                        <span className="message-announcement-priority">
                          {announcementEnumLabel(announcementDetail.priority)}
                        </span>
                        {announcementDetail.status !== "PUBLISHED" && (
                          <span>
                            {announcementEnumLabel(announcementDetail.status)}
                          </span>
                        )}
                        {announcementDetail.isPinned && <span>Pinned</span>}
                        {announcementDetail.currentRevision > 1 && (
                          <strong>Edited</strong>
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
                        <small>Published by</small>
                        <strong>
                          {announcementDetail.publisher.displayName}
                        </strong>
                        <p>
                          {announcementDetail.publisher.designation ??
                            announcementEnumLabel(
                              announcementDetail.publisher.role,
                            )}
                        </p>
                      </div>
                    </div>
                  </section>

                  <div className="message-announcement-detail-content">
                    <p>
                      {announcementDetail.body ||
                        "This announcement was withdrawn."}
                    </p>
                  </div>

                  <section className="message-announcement-detail-attachments">
                    <header>
                      <div>
                        <strong>Attachments</strong>
                        <small>
                          {announcementDetail.attachments.length === 0
                            ? "No files attached"
                            : "Preview or download the files included with this announcement."}
                        </small>
                      </div>
                      <span>{announcementDetail.attachments.length}</span>
                    </header>

                    {announcementDetail.attachments.length === 0 ? (
                      <p className="message-announcement-detail-empty">
                        This announcement does not include attachments.
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
                            announcementDetail.allowAttachmentDownload ||
                            announcementDetail.canManage;

                          return (
                            <li
                              key={attachment.id}
                              className={`message-announcement-attachment-card ${attachment.category.toLowerCase()}`}
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
                                  {announcementEnumLabel(attachment.category)} ·{" "}
                                  {formatFileSize(attachment.fileSizeBytes)}
                                </small>
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
                                    {opening ? "Opening..." : "Preview"}
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
                                      ? "Downloading..."
                                      : "Download"}
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
                      <strong>Action could not be completed</strong>
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
                          Delete this announcement?
                        </strong>
                        <p id="message-announcement-delete-description">
                          This announcement, its recipient state, revisions and
                          uploaded files will be permanently deleted. This
                          action cannot be undone.
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
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void handleAnnouncementDelete()}
                          disabled={announcementDetailAction === "DELETE"}
                        >
                          {announcementDetailAction === "DELETE"
                            ? "Deleting..."
                            : "Delete permanently"}
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
                          ? "Acknowledging..."
                          : "Acknowledge"}
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
                        Edit announcement
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
                        Delete announcement
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={closeAnnouncementDetail}
                    disabled={announcementDetailAction !== null}
                  >
                    Close
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
                <span>Announcement</span>
                <h2 id="message-announcement-composer-title">
                  {announcementComposerMode === "EDIT"
                    ? "Edit announcement"
                    : "Create announcement"}
                </h2>
                <p>Publish a clear official update for the selected group.</p>
              </div>
              <button
                type="button"
                onClick={() => void handleAnnouncementComposerCancel()}
                aria-label="Close announcement composer"
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
                  aria-label="Announcement audience"
                >
                  <span>
                    {renderGroupAvatar(
                      announcementComposerGroup,
                      "message-avatar",
                    )}
                  </span>
                  <div>
                    <small>Audience</small>
                    <strong>
                      {announcementComposerGroup.title ?? "Official group"}
                    </strong>
                    <p>{officialScopeLabel(announcementComposerGroup)}</p>
                  </div>
                  <em>Locked</em>
                </section>

                <div className="message-announcement-composer-layout">
                  <div className="message-announcement-composer-main">
                    <section className="message-announcement-composer-section">
                      <header>
                        <div>
                          <strong>Announcement content</strong>
                          <small>Keep the title clear and the message concise.</small>
                        </div>
                      </header>

                      <div className="message-announcement-composer-grid content-grid">
                        <label className="full-width">
                          <span>Title</span>
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
                            placeholder="Enter a clear announcement title"
                            autoFocus
                            required
                          />
                          <small>
                            {announcementComposerValues.title.length}/160
                          </small>
                        </label>

                        <label className="full-width">
                          <span>Message</span>
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
                            placeholder="Write the announcement message"
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
                          <strong>Attachments</strong>
                          <small>
                            Add images, videos or documents when they are useful.
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
                          <strong>Add images</strong>
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
                          <strong>Add videos</strong>
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
                          <strong>Add files</strong>
                          <small>PDF, Office, text, CSV, ZIP · 50 MB</small>
                        </label>
                      </div>

                      {announcementComposerExistingAttachments.length === 0 &&
                        announcementComposerPendingAttachments.length === 0 ? (
                        <p className="message-announcement-attachment-empty">
                          No attachments selected.
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
                                      Existing{" "}
                                      {announcementEnumLabel(attachment.category)} ·{" "}
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
                                    {removed ? "Undo" : "Remove"}
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
                                      ? `Uploading ${attachment.progressPercent}%`
                                      : attachment.status === "UPLOADED"
                                        ? "Uploaded"
                                        : attachment.status === "REMOVING"
                                          ? "Removing..."
                                          : (attachment.error ??
                                            `${announcementEnumLabel(attachment.category)} · ${formatFileSize(attachment.file.size)}`)}
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
                                  Remove
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
                          <strong>Publishing</strong>
                          <small>Choose when and how prominently it appears.</small>
                        </div>
                      </header>

                      <div className="message-announcement-composer-grid publishing-grid">
                        <label>
                          <span>Priority</span>
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
                            <option value="NORMAL">Normal</option>
                            <option value="IMPORTANT">Important</option>
                            <option value="URGENT">Urgent</option>
                            <option value="EMERGENCY">Emergency</option>
                          </select>
                        </label>

                        <label>
                          <span>Publish</span>
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
                            <option value="NOW">Now</option>
                            <option value="SCHEDULE">Schedule</option>
                          </select>
                        </label>

                        {announcementComposerStatus !== "PUBLISHED" &&
                          announcementComposerValues.publishTiming ===
                          "SCHEDULE" && (
                            <label>
                              <span>Scheduled date and time</span>
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
                          <span>Expiry</span>
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
                          <small>Optional</small>
                        </label>
                      </div>
                    </section>

                    <section className="message-announcement-composer-section">
                      <header>
                        <div>
                          <strong>Delivery options</strong>
                          <small>Use only the controls needed for this update.</small>
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
                            <strong>Require acknowledgement</strong>
                            <small>Recipients must confirm they read it.</small>
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
                            <strong>Pin announcement</strong>
                            <small>Keep it prominent in the feed.</small>
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
                            <strong>Allow downloads</strong>
                            <small>Recipients can save attached files.</small>
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
                        ? "Announcement could not be updated"
                        : "Announcement could not be sent"}
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
                    ? "Cancelling..."
                    : "Cancel"}
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={announcementComposerSubmitting !== null}
                >
                  {announcementComposerSubmitting === "PUBLISH" ||
                    announcementComposerSubmitting === "SAVE"
                    ? "Processing..."
                    : announcementComposerMode === "EDIT"
                      ? "Save changes"
                      : announcementComposerValues.publishTiming === "SCHEDULE"
                        ? "Schedule announcement"
                        : "Publish announcement"}
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
              <strong>Before you continue</strong>
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
                <strong>Action could not be completed</strong>
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
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                onClick={submitDestructiveConfirmation}
                disabled={destructiveConfirmationSubmitting}
              >
                {destructiveConfirmationSubmitting
                  ? "Applying..."
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
              <span>Personal conversation action</span>
              <h2 id="message-conversation-history-title">
                {conversationHistoryAction === "DELETE"
                  ? "Delete this chat for me?"
                  : "Clear this chat for me?"}
              </h2>
              <p id="message-conversation-history-description">
                {conversationHistoryAction === "DELETE"
                  ? "This chat and its previous history will be removed from your account only. Other participants will not be affected. It may reappear when a new message is sent, but earlier history will remain hidden."
                  : "Previous messages, pinned messages and shared content will be hidden from your account. Other participants will not be affected."}
              </p>
            </div>

            <section className="message-conversation-history-scope">
              <strong>What remains unchanged</strong>
              <ul>
                <li>No message is deleted for another participant.</li>
                <li>Shared attachments remain stored for authorized users.</li>
                <li>Group membership and privacy settings are unchanged.</li>
              </ul>
            </section>

            {conversationHistoryError && (
              <div className="message-conversation-history-error" role="alert">
                <strong>Action could not be completed</strong>
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
                Cancel
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
                  ? "Applying..."
                  : conversationHistoryAction === "DELETE"
                    ? "Delete chat for me"
                    : "Clear chat for me"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {storageUsageScope && (
        <div
          className="message-dialog-backdrop message-storage-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closeStorageUsage();
            }
          }}
        >
          <section
            className="message-storage-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-storage-title"
            data-message-modal="storage-usage"
            tabIndex={-1}
          >
            <header className="message-storage-header">
              <div>
                <span>
                  {storageUsageScope.kind === "USER"
                    ? "Storage and Data"
                    : "Conversation Storage"}
                </span>
                <h2 id="message-storage-title">
                  {storageUsage?.scope === "CONVERSATION"
                    ? (storageUsage.conversation.title ??
                      conversations.find(
                        (conversation) =>
                          conversation.id === storageUsage.conversation.id,
                      )?.title ??
                      (storageUsage.conversation.type === "GROUP"
                        ? "Group storage usage"
                        : "Private conversation storage"))
                    : "Your visible storage usage"}
                </h2>
                <p>
                  {storageUsageScope.kind === "USER"
                    ? "Totals include only files currently visible to your account. Open a conversation below to review its details."
                    : "Totals include only files currently visible to you in this conversation."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeStorageUsage}
                aria-label="Close storage usage"
              >
                ×
              </button>
            </header>

            {storageUsageLoading && !storageUsage ? (
              <div className="message-storage-state" role="status">
                <span className="message-small-spinner" />
                <strong>Calculating authorized storage...</strong>
                <small>
                  Checking your authorized conversations and visible files.
                </small>
              </div>
            ) : storageUsageError && !storageUsage ? (
              <div className="message-storage-state error" role="alert">
                <MessageNavigationIcon name="storage" />
                <strong>Storage usage could not be loaded</strong>
                <small>{storageUsageError}</small>
                <button
                  type="button"
                  onClick={() => void loadStorageUsage(storageUsageScope)}
                >
                  Retry
                </button>
              </div>
            ) : storageUsage ? (
              <div className="message-storage-body">
                {storageUsageLoading && (
                  <div className="message-storage-refreshing" role="status">
                    <span className="message-small-spinner" />
                    Refreshing totals...
                  </div>
                )}

                {storageUsageError && (
                  <div className="message-storage-inline-error" role="alert">
                    <strong>Storage action could not be completed</strong>
                    <span>{storageUsageError}</span>
                  </div>
                )}

                <section
                  className="message-storage-total-grid"
                  aria-label="Storage totals"
                >
                  <article className="primary">
                    <span>Visible storage</span>
                    <strong>
                      {formatFileSize(storageUsage.totals.logicalVisibleBytes)}
                    </strong>
                    <small>
                      {storageUsage.totals.logicalItemCount} visible file
                      {storageUsage.totals.logicalItemCount === 1 ? "" : "s"}
                    </small>
                  </article>
                </section>

                <section className="message-storage-section">
                  <header>
                    <div>
                      <span>Category breakdown</span>
                      <h3>Files currently visible to you</h3>
                    </div>
                  </header>
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
                          <strong>{category.label}</strong>
                          <small>
                            {category.itemCount} item
                            {category.itemCount === 1 ? "" : "s"}
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
                      <div>
                        <span>Storage by conversation</span>
                        <h3>Authorized logical usage</h3>
                      </div>
                    </header>
                    {storageUsage.storageByConversation.length === 0 ? (
                      <p className="message-storage-empty">
                        No visible conversation files are using storage.
                      </p>
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
                              {(item.conversationTitle ?? "Conversation")
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                            <span>
                              <strong>
                                {item.conversationTitle ??
                                  (item.conversationType === "GROUP"
                                    ? "Group conversation"
                                    : "Private conversation")}
                              </strong>
                              <small>
                                {item.itemCount} visible item
                                {item.itemCount === 1 ? "" : "s"}
                              </small>
                            </span>
                            <b>{formatFileSize(item.logicalBytes)}</b>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                <section className="message-storage-section message-storage-largest-section">
                  <header>
                    <div>
                      <span>Large-file management</span>
                      <h3>Largest visible files</h3>
                    </div>
                    <small>Largest first · up to 40 records</small>
                  </header>

                  {storageUsage.largestFiles.length === 0 ? (
                    <p className="message-storage-empty">
                      No visible images, videos, documents or audio files.
                    </p>
                  ) : (
                    <div className="message-storage-file-list">
                      {storageUsage.largestFiles.map((file) => {
                        const actionPending =
                          storageUsageActionId?.endsWith(file.attachmentId) ??
                          false;

                        return (
                          <article key={file.attachmentId}>
                            <span
                              className={`message-storage-file-type ${file.contentType.toLowerCase()}`}
                              aria-hidden="true"
                            >
                              {file.contentType === "FILE"
                                ? "DOC"
                                : file.contentType.slice(0, 3)}
                            </span>
                            <div className="message-storage-file-copy">
                              <div>
                                <strong title={file.originalFileName}>
                                  {file.originalFileName}
                                </strong>
                                <b>{formatFileSize(file.fileSizeBytes)}</b>
                              </div>
                              <small>
                                {storageUsage.scope === "USER" &&
                                  `${file.conversationTitle ?? "Conversation"} · `}
                                {file.sender.displayName} ·{" "}
                                {formatConversationTime(file.sentAt)}
                              </small>
                            </div>
                            <div className="message-storage-file-actions">
                              <button
                                type="button"
                                onClick={() =>
                                  void openStorageOriginalMessage(file)
                                }
                                disabled={actionPending}
                              >
                                Open message
                              </button>
                              {file.canDeleteForMe && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleStorageFileDelete(file, "ME")
                                  }
                                  disabled={actionPending}
                                >
                                  Delete message for me
                                </button>
                              )}
                              {file.canDeleteForEveryone && (
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() =>
                                    void handleStorageFileDelete(
                                      file,
                                      "EVERYONE",
                                    )
                                  }
                                  disabled={actionPending}
                                >
                                  Delete message for everyone
                                </button>
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
                  <span>{storageUsage.privacyNotice}</span>
                </footer>
              </div>
            ) : null}
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
                <span>Pinned messages</span>
                <h2 id="message-pinned-dialog-title">
                  {selectedConversation.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={closePinnedMessageBrowser}
                aria-label="Close pinned messages"
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
                    <span>{attachmentLabel(message)}</span>
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
          className="message-contact-backdrop"
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
            <header>
              <div>
                <span>Message action</span>
                <h2 id="forward-message-title">Forward message</h2>
              </div>

              <button
                type="button"
                onClick={closeForwardDialog}
                disabled={forwardSubmitting}
                aria-label="Close forward message dialog"
              >
                ×
              </button>
            </header>

            <div className="message-forward-source">
              <strong>
                {forwardingMessage.forwardedFrom
                  ? "Forwarded message"
                  : `From ${forwardingMessage.sender.displayName}`}
              </strong>
              <p>{attachmentLabel(forwardingMessage)}</p>
            </div>

            <label className="message-contact-search">
              <span>Select up to 20 conversations</span>
              <input
                type="search"
                value={forwardSearch}
                onChange={(event) => setForwardSearch(event.target.value)}
                placeholder="Search conversations"
                autoFocus
              />
            </label>

            <div className="message-forward-list">
              {filteredForwardConversations.length === 0 ? (
                <div className="message-list-state compact">
                  <div className="message-empty-icon">?</div>
                  <h3>No conversations found</h3>
                  <p>Try another conversation name.</p>
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
                          {conversation.title ?? "Private conversation"}
                        </strong>
                        <small>
                          {messagePreview(conversation, account?.id ?? "")}
                        </small>
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <footer className="message-forward-footer">
              <span>{forwardDestinationIds.length} selected</span>
              <div>
                <button
                  type="button"
                  onClick={closeForwardDialog}
                  disabled={forwardSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void handleForwardMessage()}
                  disabled={
                    forwardSubmitting || forwardDestinationIds.length === 0
                  }
                >
                  {forwardSubmitting ? "Forwarding..." : "Forward"}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      {(messageInformation || messageInformationError) && (
        <div
          className="message-contact-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closeMessageInformationDialog();
            }
          }}
        >
          <section
            className="message-contact-dialog message-info-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-info-title"
            data-message-modal="message-information"
            tabIndex={-1}
          >
            <header>
              <div>
                <span>Message action</span>
                <h2 id="message-info-title">Message information</h2>
              </div>

              <button
                type="button"
                onClick={closeMessageInformationDialog}
                aria-label="Close message information dialog"
              >
                ×
              </button>
            </header>

            {messageInformationError && !messageInformation ? (
              <div className="message-info-state">
                <strong>Could not load message information</strong>
                <p>{messageInformationError}</p>
              </div>
            ) : messageInformation ? (
              <div className="message-info-body">
                <section className="message-info-summary">
                  <span>Original message</span>
                  <strong>{attachmentLabel(messageInformation.message)}</strong>
                  <small>
                    Sent {notificationTimestampLabel(messageInformation.sentAt)}
                  </small>
                </section>

                <section
                  className="message-info-counts"
                  aria-label="Delivery summary"
                >
                  <div>
                    <strong>
                      {messageInformation.summary.totalRecipients}
                    </strong>
                    <span>Recipients</span>
                  </div>
                  <div>
                    <strong>{messageInformation.summary.delivered}</strong>
                    <span>Delivered</span>
                  </div>
                  <div>
                    <strong>{messageInformation.summary.read}</strong>
                    <span>Read</span>
                  </div>
                </section>

                <section className="message-info-recipients">
                  <h3>Recipient details</h3>

                  {messageInformation.recipients.length === 0 ? (
                    <p>This message has no separate recipients.</p>
                  ) : (
                    messageInformation.recipients.map((recipient) => (
                      <article
                        key={recipient.accountId}
                        className="message-info-recipient"
                      >
                        {renderAccountAvatar(
                          recipient.account,
                          "message-avatar small",
                        )}

                        <div>
                          <strong>{recipient.account.displayName}</strong>
                          <small>
                            {recipient.account.employee?.designation ??
                              roleLabel(recipient.account.role)}
                          </small>
                        </div>

                        <dl>
                          <div>
                            <dt>Delivered</dt>
                            <dd>
                              {recipient.deliveredAt
                                ? notificationTimestampLabel(
                                  recipient.deliveredAt,
                                )
                                : "Pending"}
                            </dd>
                          </div>
                          <div>
                            <dt>Read</dt>
                            <dd>
                              {recipient.readAt
                                ? notificationTimestampLabel(recipient.readAt)
                                : recipient.readHidden
                                  ? "Hidden by privacy"
                                  : "Not read"}
                            </dd>
                          </div>
                        </dl>
                      </article>
                    ))
                  )}
                </section>
              </div>
            ) : null}
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
                  aria-label={`Download ${attachmentViewer.attachment.originalFileName}`}
                >
                  <AttachmentGlyph name="download" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  className="close"
                  data-message-media-viewer-close="true"
                  onClick={closeAttachmentViewer}
                  aria-label="Close attachment preview"
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
                  aria-label="View previous attachment"
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
                  <p>Loading preview...</p>
                </div>
              )}

              {!attachmentViewer.loading && attachmentViewer.error && (
                <div className="message-media-viewer-state error" role="alert">
                  <AttachmentGlyph name="retry" />
                  <strong>Preview unavailable</strong>
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
                    Your browser does not support video preview.
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
                    aria-label="View next attachment"
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
                    {attachmentTypeLabel(attachmentViewer.attachment)} ·{" "}
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
                    Announcement attachment ·{" "}
                    {announcementAttachmentViewer.attachment.originalFileName}
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
                      <span>Download</span>
                    </button>
                  )}
                <button
                  type="button"
                  className="close"
                  data-message-modal-initial-focus="true"
                  onClick={closeAnnouncementAttachmentViewer}
                  aria-label="Close announcement attachment preview"
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
                  aria-label="View previous announcement attachment"
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
                  <p>Loading preview...</p>
                </div>
              )}

              {!announcementAttachmentViewer.loading &&
                announcementAttachmentViewer.error && (
                  <div className="message-media-viewer-state error" role="alert">
                    <AttachmentGlyph name="retry" />
                    <strong>Preview unavailable</strong>
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
                    Your browser does not support video preview.
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
                    aria-label="View next announcement attachment"
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
