import { useEffect, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import type { TFunction } from "i18next";
import type {
  AnnouncementAttachment,
  AnnouncementAttachmentCategory,
  AnnouncementCreateAudienceType,
  AnnouncementDetail,
  AnnouncementPriority,
  AnnouncementStatus,
} from "../types/announcements";
import {
  formatMessagingTime as formatMessageTime,
  isSameMessagingCalendarDay as isSameCalendarDay,
} from "../utils/messaging-date-time";
import type {
  GroupKind,
  MessagingAccount,
  MessagingContact,
  MessagingAttachment,
  MessagingConversation,
  ConversationSharedContent,
  SharedContentAttachmentItem,
  SharedContentLinkItem,
  MessagingMessage,
  MessagingMention,
  MessagingAnnouncementPayload,
  MessagingLocationPayload,
  MessagingMessageRequest,
  OfficialGroupAuditEntry,
  PrivateGroupHistoryWindow,
  StarredMessageItem,
  ConversationStorageUsageResponse,
  UserStorageUsageResponse,
} from "../types/messaging";

export type RealtimeConnectionStatus =
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "DISCONNECTED";

export type SharedContentTab = "MEDIA" | "DOCUMENTS" | "LINKS";
export type SharedContentReturnView =
  | "GROUP_INFORMATION"
  | "PROFILE"
  | "GROUP_MANAGEMENT";
export type StorageUsageScope =
  | { kind: "USER" }
  | { kind: "CONVERSATION"; conversationId: string };
export type StorageUsageData =
  | UserStorageUsageResponse
  | ConversationStorageUsageResponse;
export type ConversationCategory = "ALL" | "UNREAD" | "GROUPS" | "OFFICIAL";
export type PersonalConversationHistoryAction = "CLEAR" | "DELETE";
export type DestructiveConfirmation =
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

export interface DestructiveConfirmationCopy {
  eyebrow: string;
  title: string;
  description: string;
  consequences: string[];
  confirmLabel: string;
}

export type AnnouncementPublishTiming = "NOW" | "SCHEDULE";
export type AnnouncementComposerMode = "CREATE" | "EDIT";
export type AnnouncementComposerAction = "PUBLISH" | "SAVE" | "CANCEL";

export interface AnnouncementComposerValues {
  audienceType: AnnouncementCreateAudienceType;
  officeId: string;
  orgUnitId: string;
  officialConversationId: string;
  includeDescendants: boolean;
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

export type AnnouncementPendingAttachmentStatus =
  | "READY"
  | "UPLOADING"
  | "UPLOADED"
  | "REMOVING"
  | "ERROR";

export interface AnnouncementPendingAttachment {
  clientId: string;
  file: File;
  category: AnnouncementAttachmentCategory;
  progressPercent: number;
  status: AnnouncementPendingAttachmentStatus;
  serverAttachmentId: string | null;
  error: string | null;
}

export function destructiveConfirmationCopy(
  action: DestructiveConfirmation,
  t: TFunction,
): DestructiveConfirmationCopy {
  switch (action.kind) {
    case "DELETE_MESSAGE_FOR_ME":
      return {
        eyebrow: t("confirmation.deleteForMe.eyebrow", { ns: "messaging" }),
        title: t("confirmation.deleteForMe.title", { ns: "messaging" }),
        description: t("confirmation.deleteForMe.description", {
          ns: "messaging",
        }),
        consequences: [
          t("confirmation.deleteForMe.consequence1", { ns: "messaging" }),
          t("confirmation.deleteForMe.consequence2", { ns: "messaging" }),
          t("confirmation.deleteForMe.consequence3", { ns: "messaging" }),
        ],
        confirmLabel: t("confirmation.deleteForMe.confirm", {
          ns: "messaging",
        }),
      };
    case "DELETE_MESSAGE_FOR_EVERYONE":
      return {
        eyebrow: t("confirmation.deleteForEveryone.eyebrow", {
          ns: "messaging",
        }),
        title: t("confirmation.deleteForEveryone.title", { ns: "messaging" }),
        description: t("confirmation.deleteForEveryone.description", {
          ns: "messaging",
        }),
        consequences: [
          t("confirmation.deleteForEveryone.consequence1", { ns: "messaging" }),
          t("confirmation.deleteForEveryone.consequence2", { ns: "messaging" }),
          t("confirmation.deleteForEveryone.consequence3", { ns: "messaging" }),
        ],
        confirmLabel: t("confirmation.deleteForEveryone.confirm", {
          ns: "messaging",
        }),
      };
    case "LEAVE_GROUP":
      return {
        eyebrow: t("confirmation.leaveGroup.eyebrow", { ns: "messaging" }),
        title: t("confirmation.leaveGroup.title", {
          name: action.conversationTitle,
          ns: "messaging",
        }),
        description: t("confirmation.leaveGroup.description", {
          ns: "messaging",
        }),
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
            eyebrow: t("confirmation.deleteOfficialGroup.eyebrow", {
              ns: "messaging",
            }),
            title: t("confirmation.deleteOfficialGroup.title", {
              name: action.conversationTitle,
              ns: "messaging",
            }),
            description: t("confirmation.deleteOfficialGroup.description", {
              ns: "messaging",
            }),
            consequences: [
              t("confirmation.deleteOfficialGroup.consequence1", {
                ns: "messaging",
              }),
              t("confirmation.deleteOfficialGroup.consequence2", {
                ns: "messaging",
              }),
              t("confirmation.deleteOfficialGroup.consequence3", {
                ns: "messaging",
              }),
            ],
            confirmLabel: t("confirmation.deleteOfficialGroup.confirm", {
              ns: "messaging",
            }),
          }
        : {
            eyebrow: t("confirmation.deleteGroup.eyebrow", { ns: "messaging" }),
            title: t("confirmation.deleteGroup.title", {
              name: action.conversationTitle,
              ns: "messaging",
            }),
            description: t("confirmation.deleteGroup.description", {
              ns: "messaging",
            }),
            consequences: [
              t("confirmation.deleteGroup.consequence1", { ns: "messaging" }),
              t("confirmation.deleteGroup.consequence2", { ns: "messaging" }),
              t("confirmation.deleteGroup.consequence3", { ns: "messaging" }),
            ],
            confirmLabel: t("confirmation.deleteGroup.confirm", {
              ns: "messaging",
            }),
          };
    case "BLOCK_PRIVATE_CONTACT":
      return {
        eyebrow: t("confirmation.blockContact.eyebrow", { ns: "messaging" }),
        title: t("confirmation.blockContact.title", {
          name: action.target.displayName,
          ns: "messaging",
        }),
        description: t("confirmation.blockContact.description", {
          ns: "messaging",
        }),
        consequences: [
          t("confirmation.blockContact.consequence1", { ns: "messaging" }),
          t("confirmation.blockContact.consequence2", { ns: "messaging" }),
          t("confirmation.blockContact.consequence3", { ns: "messaging" }),
        ],
        confirmLabel: t("confirmation.blockContact.confirm", {
          ns: "messaging",
        }),
      };
  }
}

export const PRIVATE_GROUP_HISTORY_OPTIONS: Array<{
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
export const SELECTED_CONVERSATION_STORAGE_KEY =
  "nt-message:selected-conversation";
export const HIGHLIGHT_MESSAGE_STORAGE_KEY = "nt-message:highlight-message";
export const MESSAGE_NAVIGATION_STORAGE_KEY = "nt-message:navigation-expanded";
export const MESSAGE_EDIT_WINDOW_MS = 20 * 60 * 1000;
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;
export type QuickReaction = (typeof QUICK_REACTIONS)[number];
export const QUICK_REACTION_SET = new Set<string>(QUICK_REACTIONS);

export type MessagingSettingsTab =
  | "PRIVACY"
  | "NOTIFICATIONS"
  | "APPEARANCE"
  | "STORAGE"
  | "BLOCKED"
  | "SECURITY";

export type GroupInformationTab = "OVERVIEW" | "MEMBERS" | "SETTINGS";

export interface MessagingSettings {
  showOnlineStatus: boolean;
  showReadReceipts: boolean;
  requireMessageRequests: boolean;
  notificationPreview: boolean;
  muteAllNotifications: boolean;
}

export const DEFAULT_MESSAGING_SETTINGS: MessagingSettings = {
  showOnlineStatus: true,
  showReadReceipts: true,
  requireMessageRequests: true,
  notificationPreview: true,
  muteAllNotifications: false,
};

export const SETTINGS_TABS: Array<{
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

export function buildGroupInviteUrl(token: string): string {
  const encodedToken = encodeURIComponent(token);

  if (typeof window === "undefined") {
    return `/messages?invite=${encodedToken}`;
  }

  return `${window.location.origin}/messages?invite=${encodedToken}`;
}

// Copies text to the clipboard with a browser-safe fallback.
export async function copyTextToClipboard(text: string): Promise<void> {
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

export const MEDIA_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
] as const;
export const AUDIO_ATTACHMENT_TYPES = [
  "audio/aac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
] as const;
export const DOCUMENT_ATTACHMENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
] as const;
export const ACCEPTED_ATTACHMENT_TYPES = [
  ...MEDIA_ATTACHMENT_TYPES,
  ...AUDIO_ATTACHMENT_TYPES,
  ...DOCUMENT_ATTACHMENT_TYPES,
].join(",");
export const COMPOSER_EMOJI_SECTIONS = [
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
export const MAX_IMAGE_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_DOCUMENT_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const MAX_AUDIO_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_ATTACHMENT_BYTES = 200 * 1024 * 1024;
export const MAX_MESSAGE_ATTACHMENT_FILES = 10;
export const MAX_MESSAGE_ATTACHMENT_TOTAL_BYTES = 250 * 1024 * 1024;
export const ACCEPTED_ATTACHMENT_MIME_TYPES = new Set<string>([
  ...MEDIA_ATTACHMENT_TYPES,
  ...AUDIO_ATTACHMENT_TYPES,
  ...DOCUMENT_ATTACHMENT_TYPES,
]);
export const VOICE_NOTE_MIME_TYPE_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const;

export function customizationToken(value: string): string {
  return value.toLowerCase().replace(/_/g, "-");
}

export function isSupportedQuickReaction(
  value: string,
): value is QuickReaction {
  return QUICK_REACTION_SET.has(value);
}

export interface MessageReactionGroup {
  emoji: string;
  count: number;
  reactedByViewer: boolean;
  label: string;
}

export function groupMessageReactions(
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

export function getViewerReaction(
  message: MessagingMessage,
  viewerAccountId?: string | null,
): string | null {
  return (
    message.reactions?.find(
      (reaction) => reaction.accountId === viewerAccountId,
    )?.reactionValue ?? null
  );
}

export interface MessageAttachmentCardProps {
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

export interface AttachmentViewerState {
  message: MessagingMessage;
  attachment: MessagingAttachment;
  objectUrl: string | null;
  loading: boolean;
  error: string | null;
}

export interface AnnouncementAttachmentViewerState {
  announcement: AnnouncementDetail;
  attachment: AnnouncementAttachment;
  objectUrl: string | null;
  loading: boolean;
  error: string | null;
}

export type AttachmentUploadStatus = "IDLE" | "UPLOADING" | "FAILED";

export interface AttachmentUploadState {
  status: AttachmentUploadStatus;
  progressPercent: number;
  loadedBytes: number;
  totalBytes: number | null;
  error: string | null;
}

export interface SelectedComposerAttachment {
  id: string;
  file: File;
  previewUrl: string | null;
}

export const EMPTY_ATTACHMENT_UPLOAD_STATE: AttachmentUploadState = {
  status: "IDLE",
  progressPercent: 0,
  loadedBytes: 0,
  totalBytes: null,
  error: null,
};

export type AttachmentGlyphName =
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

export function attachmentVisualKind(
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

export function readStoredConversationId(): string | null {
  try {
    return window.sessionStorage.getItem(SELECTED_CONVERSATION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readStoredHighlightedMessageId(): string | null {
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

export function readStoredNavigationExpanded(): boolean {
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

export function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 0) {
    return "NT";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function toLocalDateTimeInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function createAnnouncementComposerValues(): AnnouncementComposerValues {
  return {
    audienceType: "OFFICIAL_GROUP",
    officeId: "",
    orgUnitId: "",
    officialConversationId: "",
    includeDescendants: false,
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

export function announcementDetailToComposerValues(
  announcement: AnnouncementDetail,
): AnnouncementComposerValues {
  return {
    audienceType:
      announcement.audience.type === "OFFICE" ||
      announcement.audience.type === "ORG_UNIT" ||
      announcement.audience.type === "OFFICIAL_GROUP"
        ? announcement.audience.type
        : "OFFICIAL_GROUP",
    officeId: announcement.audience.office?.id ?? "",
    orgUnitId: announcement.audience.orgUnit?.id ?? "",
    officialConversationId: announcement.audience.officialGroup?.id ?? "",
    includeDescendants: announcement.audience.includeDescendants,
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

export function isAnnouncementEditable(status: AnnouncementStatus): boolean {
  return status === "DRAFT" || status === "SCHEDULED" || status === "PUBLISHED";
}

export function isAnnouncementDeletable(status: AnnouncementStatus): boolean {
  return (
    status === "DRAFT" ||
    status === "SCHEDULED" ||
    status === "PUBLISHED" ||
    status === "EXPIRED"
  );
}

export function createAnnouncementAttachmentClientId(file: File): string {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${file.name}-${file.size}-${file.lastModified}-${randomPart}`;
}

export function announcementEnumLabel(value: string, t: TFunction): string {
  switch (value) {
    case "NORMAL":
      return t("announcement.enums.normal", { ns: "messaging" });
    case "IMPORTANT":
      return t("announcement.enums.important", { ns: "messaging" });
    case "URGENT":
      return t("announcement.enums.urgent", { ns: "messaging" });
    case "EMERGENCY":
      return t("announcement.enums.emergency", { ns: "messaging" });
    case "DRAFT":
      return t("announcement.enums.draft", { ns: "messaging" });
    case "SCHEDULED":
      return t("announcement.enums.scheduled", { ns: "messaging" });
    case "PUBLISHING":
      return t("announcement.enums.publishing", { ns: "messaging" });
    case "PUBLISHED":
      return t("announcement.enums.published", { ns: "messaging" });
    case "EXPIRED":
      return t("announcement.enums.expired", { ns: "messaging" });
    case "IMAGE":
      return t("announcement.enums.image", { ns: "messaging" });
    case "VIDEO":
      return t("announcement.enums.video", { ns: "messaging" });
    case "DOCUMENT":
      return t("announcement.enums.document", { ns: "messaging" });
    default:
      return value
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
  }
}

export function announcementAttachmentShortLabel(
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

export function isAnnouncementImageAttachment(
  attachment: AnnouncementAttachment,
): boolean {
  return (
    attachment.category === "IMAGE" && attachment.mimeType.startsWith("image/")
  );
}

export function isAnnouncementVideoAttachment(
  attachment: AnnouncementAttachment,
): boolean {
  return (
    attachment.category === "VIDEO" || attachment.mimeType.startsWith("video/")
  );
}

export function isAnnouncementPdfAttachment(
  attachment: AnnouncementAttachment,
): boolean {
  return (
    attachment.mimeType === "application/pdf" ||
    attachment.originalFileName.toLowerCase().endsWith(".pdf")
  );
}

export function isAnnouncementTextAttachment(
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

export function canPreviewAnnouncementAttachment(
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

export function messagesBelongToSameVisualGroup(
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

export function formatFileSize(bytes: number): string {
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

export function selectedAttachmentValidationError(file: File): string | null {
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

export function createSelectedComposerAttachment(
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

export function isImageAttachment(attachment: MessagingAttachment): boolean {
  return (
    attachment.contentType === "IMAGE" &&
    attachment.mimeType.startsWith("image/")
  );
}

export function isVideoAttachment(attachment: MessagingAttachment): boolean {
  return (
    attachment.contentType === "VIDEO" ||
    attachment.mimeType.startsWith("video/")
  );
}

export function isAudioAttachment(attachment: MessagingAttachment): boolean {
  return (
    attachment.contentType === "AUDIO" ||
    attachment.mimeType.startsWith("audio/")
  );
}

export function getMessagePayloadValue(
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
export function getOfficialAnnouncementPayload(
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
        : (t?.("announcement.messageLabel", { ns: "messaging" }) ??
          "Official announcement"),
  };
}

export function isOfficialAnnouncementMessage(
  message: Pick<MessagingMessage, "payload">,
): boolean {
  return getOfficialAnnouncementPayload(message) !== null;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function mentionSearchText(account: MessagingAccount): string {
  return [
    account.displayName,
    account.username ?? "",
    account.employee?.empName ?? "",
    account.employee?.empId ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

export function getComposerMentionQuery(
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

export function getMentionedAccountIds(
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

export function getMessageMentions(
  message: MessagingMessage,
): MessagingMention[] {
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

export const MESSAGE_TEXT_LINK_PATTERN =
  /\b(?:https?:\/\/|www\.)[^\s<>()"']+/gi;

export function normalizeMessageLink(value: string): string {
  const cleanUrl = value.replace(/[.,;:!?]+$/g, "");

  return cleanUrl.toLowerCase().startsWith("www.")
    ? `https://${cleanUrl}`
    : cleanUrl;
}

export function extractMessageLinks(text: string | null): string[] {
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

export function getMessageLocationPayload(
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

export function isLiveLocationActive(
  location: MessagingLocationPayload | null,
  currentTime: number,
): boolean {
  if (
    !location ||
    location.kind !== "LIVE" ||
    location.liveStoppedAt ||
    !location.liveExpiresAt
  ) {
    return false;
  }

  return (
    currentTime > 0 && new Date(location.liveExpiresAt).getTime() > currentTime
  );
}

export function formatLocationCoordinate(value: number): string {
  return value.toFixed(5);
}

export function formatLocationUpdatedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "just now";
  }

  return formatMessageTime(value);
}

export function browserNotificationPermissionLabel(t: TFunction): string {
  if (!("Notification" in window)) {
    return t("messageSettings.notifications.permission.unsupported", {
      ns: "messaging",
    });
  }

  switch (window.Notification.permission) {
    case "granted":
      return t("messageSettings.notifications.permission.allowed", {
        ns: "messaging",
      });
    case "denied":
      return t("messageSettings.notifications.permission.blocked", {
        ns: "messaging",
      });
    default:
      return t("messageSettings.notifications.permission.notRequested", {
        ns: "messaging",
      });
  }
}

export function browserPositionToLocationInput(position: GeolocationPosition): {
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

export interface LocationMessageCardProps {
  message: MessagingMessage;
  viewerAccountId?: string;
  stopping: boolean;
  onStop: (message: MessagingMessage) => void;
}

export function preferredVoiceNoteMimeType(): string {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  return (
    VOICE_NOTE_MIME_TYPE_CANDIDATES.find((value) =>
      MediaRecorder.isTypeSupported(value),
    ) ?? ""
  );
}

export function voiceNoteExtension(mimeType: string): string {
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) {
    return "m4a";
  }

  return "webm";
}

export function formatRecordingDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function isPdfAttachment(attachment: MessagingAttachment): boolean {
  return (
    attachment.mimeType === "application/pdf" ||
    attachment.originalFileName.toLowerCase().endsWith(".pdf")
  );
}

export function isTextPreviewAttachment(
  attachment: MessagingAttachment,
): boolean {
  const fileName = attachment.originalFileName.toLowerCase();

  return (
    attachment.mimeType.startsWith("text/") ||
    attachment.mimeType === "text/csv" ||
    fileName.endsWith(".txt") ||
    fileName.endsWith(".csv")
  );
}

export function isZipAttachment(attachment: MessagingAttachment): boolean {
  const fileName = attachment.originalFileName.toLowerCase();

  return (
    attachment.mimeType === "application/zip" ||
    attachment.mimeType === "application/x-zip-compressed" ||
    fileName.endsWith(".zip")
  );
}

export function canPreviewAttachment(attachment: MessagingAttachment): boolean {
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

export function attachmentTypeTranslationKey(
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

export function attachmentLabel(
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
    return t("preview.message", { ns: "messaging" });
  }

  if (isImageAttachment(firstAttachment)) {
    return t("preview.photo", { ns: "messaging" });
  }

  if (isVideoAttachment(firstAttachment)) {
    return t("preview.video", { ns: "messaging" });
  }

  if (isAudioAttachment(firstAttachment)) {
    return getMessagePayloadValue(message, "attachmentKind") === "VOICE_NOTE"
      ? t("preview.voiceNote", { ns: "messaging" })
      : t("preview.audio", { ns: "messaging" });
  }

  return t("preview.fileNamed", {
    ns: "messaging",
    name: firstAttachment.originalFileName,
  });
}

// Creates an empty shared-content result for media, documents and links.
export function emptySharedContent(): ConversationSharedContent {
  return {
    media: [],
    documents: [],
    links: [],
  };
}

export function sortSharedContent<T extends { sharedAt: string }>(
  items: T[],
): T[] {
  return [...items].sort(
    (first, second) =>
      new Date(second.sharedAt).getTime() - new Date(first.sharedAt).getTime(),
  );
}

// Collects shared media, documents and links from loaded chat messages.
export function collectSharedContentFromMessages(
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
export function mergeSharedContent(
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

export function firstAvailableSharedContentTab(
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

export function sharedContentMonthKey(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "UNKNOWN";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function sharedContentMonthLabel(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Earlier";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function groupSharedContentByMonth<T extends { sharedAt: string }>(
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

export function sharedLinkDomain(url: string, t: TFunction): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return t("sharedContent.externalLink", { ns: "messaging" });
  }
}

export function sharedLinkDescription(
  item: SharedContentLinkItem,
): string | null {
  const messageText = item.message.textContent?.trim();

  if (!messageText) {
    return null;
  }

  const withoutUrl = messageText.replace(item.url, "").trim();
  return withoutUrl || null;
}

export interface SharedMediaThumbnailProps {
  accessToken: string | null;
  item: SharedContentAttachmentItem;
  onOpen: () => void;
}

export function canForwardMessage(message: MessagingMessage): boolean {
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

export function roleLabel(value: string, t: TFunction): string {
  switch (value) {
    case "SUPER_ADMIN":
      return t("roles.superAdmin");
    case "OWNER":
      return t("roles.owner", { ns: "messaging" });
    case "ADMIN":
      return t("roles.admin", { ns: "messaging" });
    case "MEMBER":
      return t("roles.member", { ns: "messaging" });
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

export type MessageNavigationIconName =
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

export type MessageStatusGlyphName = "pin" | "star";

export function workspacePathForAccountClass(
  accountClass: string | undefined,
): string {
  return accountClass === "SUPER_ADMIN" ? "/super-admin" : "/";
}

export function officialScopeLabel(
  conversation: MessagingConversation,
  t: TFunction,
): string {
  const scope = conversation.officialScope;

  if (!scope) {
    return t("groupInfo.scope.organizational", { ns: "messaging" });
  }

  if (scope.scopeType === "OFFICE") {
    return t("groupInfo.scope.office", {
      ns: "messaging",
      name:
        scope.office?.name ?? t("profileDetail.office", { ns: "messaging" }),
    });
  }

  if (scope.scopeType === "ORG_UNIT") {
    return t("groupInfo.scope.orgUnit", {
      ns: "messaging",
      name:
        scope.orgUnit?.name ?? t("profileDetail.orgUnit", { ns: "messaging" }),
      membership:
        scope.membershipMode === "ENTIRE_SUBTREE"
          ? t("groupInfo.scope.entireSubtree", { ns: "messaging" })
          : t("groupInfo.scope.directMembers", { ns: "messaging" }),
    });
  }

  return t("groupInfo.scope.office", {
    ns: "messaging",
    name: scope.office?.name ?? t("profileDetail.office", { ns: "messaging" }),
  });
}

export function employeeOrgContextLabel(
  employee: MessagingAccount["employee"],
  fallback: string | null | undefined,
): string {
  if (!employee) {
    return fallback ?? "";
  }

  const breadcrumb = employee.orgUnitBreadcrumb
    .map((unit) => unit.name)
    .filter(Boolean);

  if (breadcrumb.length > 0) {
    return breadcrumb.join(" › ");
  }

  return (
    employee.primaryOrgUnit?.name ?? employee.office?.name ?? fallback ?? ""
  );
}

export function officialAuditLabel(
  entry: OfficialGroupAuditEntry,
  t: TFunction,
): string {
  if (entry.action === "CREATED") {
    return t("groupManagement.audit.created", { ns: "messaging" });
  }

  if (entry.action === "DETAILS_UPDATED") {
    return t("groupManagement.audit.detailsUpdated", { ns: "messaging" });
  }

  if (entry.action === "RECONCILED") {
    return t("groupManagement.audit.reconciled", { ns: "messaging" });
  }

  return t("groupManagement.audit.synchronized", { ns: "messaging" });
}

export function requestReasonLabel(
  reason: MessagingMessageRequest["reason"],
  t: TFunction,
): string {
  if (reason === "PROTECTED_RECIPIENT") {
    return t("requestWorkspace.reasons.protectedRecipient", {
      ns: "messaging",
    });
  }

  return t("requestWorkspace.reasons.outsideOrgScope", { ns: "messaging" });
}

export function starredMessagePreview(
  item: StarredMessageItem,
  t: TFunction,
): string {
  const { message } = item;

  if (message.isDeleted) {
    return t("starred.unavailableMessage", { ns: "messaging" });
  }

  if (message.textContent?.trim()) {
    return message.textContent.trim();
  }

  if (message.contentType === "LOCATION") {
    return t("starred.sharedLocation", { ns: "messaging" });
  }

  const firstAttachment = message.attachments?.[0];

  if (firstAttachment) {
    const attachmentCount = message.attachments?.length ?? 1;
    return attachmentCount > 1
      ? t("starred.andMore", {
          ns: "messaging",
          name: firstAttachment.originalFileName,
          count: attachmentCount - 1,
        })
      : firstAttachment.originalFileName;
  }

  return t("starred.messageFallback", { ns: "messaging" });
}

export function requestStatusLabel(
  request: MessagingMessageRequest,
  t: TFunction,
): string {
  if (request.status === "PENDING") {
    return request.direction === "RECEIVED"
      ? t("requestWorkspace.awaitingYourResponse", { ns: "messaging" })
      : t("requestWorkspace.awaitingResponse", { ns: "messaging" });
  }

  if (request.status === "ACCEPTED") {
    return t("requestWorkspace.accepted", { ns: "messaging" });
  }

  if (request.status === "DECLINED") {
    return t("requestWorkspace.declined", { ns: "messaging" });
  }

  if (request.status === "BLOCKED") {
    return t("requestWorkspace.blocked", { ns: "messaging" });
  }

  return roleLabel(request.status, t);
}

export function contactActionLabel(
  contact: MessagingContact,
  t: TFunction,
): string {
  if (contact.contactMode === "REQUEST_REQUIRED") {
    return t("contactActions.request", { ns: "messaging" });
  }

  if (contact.contactMode === "REQUEST_SENT") {
    return t("contactActions.pending", { ns: "messaging" });
  }

  if (contact.contactMode === "REQUEST_RECEIVED") {
    return t("contactActions.review", { ns: "messaging" });
  }

  if (contact.contactMode === "BLOCKED") {
    return t("contactActions.blocked", { ns: "messaging" });
  }

  return t("contactActions.message", { ns: "messaging" });
}

export function applyMessageUpdate(
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

export function canEditMessage(
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

export function canDeleteMessageForEveryone(
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

export function messagePreview(
  conversation: MessagingConversation,
  accountId: string,
  t: TFunction,
): string {
  const message = conversation.lastMessage;

  if (!message) {
    return t("preview.startConversation", { ns: "messaging" });
  }

  if (message.isDeleted) {
    return t("preview.messageDeleted", { ns: "messaging" });
  }

  const prefix =
    message.senderAccountId === accountId
      ? t("preview.youPrefix", { ns: "messaging" })
      : "";

  const announcementPrefix = isOfficialAnnouncementMessage(message)
    ? t("preview.announcementPrefix", { ns: "messaging" })
    : "";

  return `${prefix}${announcementPrefix}${message.forwardedFrom ? t("preview.forwardedPrefix", { ns: "messaging" }) : ""}${attachmentLabel(message, t)}`;
}

export function messageDeliveryPresentation(
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

export function notificationMetadataRecord(
  metadata: unknown,
): Record<string, unknown> | null {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : null;
}

export type KeyboardNavigationAxis = "VERTICAL" | "HORIZONTAL" | "BOTH";

export const MESSAGE_KEYBOARD_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function keyboardFocusableElements(
  container: HTMLElement,
): HTMLElement[] {
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
export function useMessageModalKeyboardBoundary(
  open: boolean,
  modalName: string,
  onRequestClose: () => void,
  closeDisabled = false,
): void {
  const closeRef = useRef(onRequestClose);
  const closeDisabledRef = useRef(closeDisabled);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    closeRef.current = onRequestClose;
    closeDisabledRef.current = closeDisabled;
  }, [closeDisabled, onRequestClose]);

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

    const handleModalKeyDown = (event: globalThis.KeyboardEvent): void => {
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

export function handleLinearKeyboardNavigation(
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
  const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
  let nextIndex: number;

  if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = focusable.length - 1;
  } else if (previous) {
    nextIndex = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1;
  } else {
    nextIndex =
      currentIndex < 0 || currentIndex >= focusable.length - 1
        ? 0
        : currentIndex + 1;
  }

  focusable[nextIndex]?.focus();
}
