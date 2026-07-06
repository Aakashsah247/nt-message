import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
} from "react";
import { useNavigate } from "react-router";

import { DirectoryButton } from "../components/DirectoryButton";
import { useAuth } from "../context/AuthContext";
import {
  acceptMessageRequest,
  addGroupMembers,
  blockMessageRequest,
  blockMessagingAccount,
  createGroupConversation,
  createOfficialGroupConversation,
  createPrivateConversation,
  createMessagingProfilePhotoObjectUrl,
  createGroupPhotoObjectUrl,
  deleteGroupPhoto,
  deleteMyMessagingProfilePhoto,
  declineMessageRequest,
  deleteMessagingNotification,
  getConversationMessageInformation,
  getConversationSharedContent,
  getMessagingPrivacySettings,
  getMessagingProfile,
  getMyMessagingProfile,
  deleteReadMessagingNotifications,
  deleteConversationMessage,
  createConversationAttachmentObjectUrl,
  deleteConversationMessageForMe,
  downloadConversationAttachment,
  editConversationTextMessage,
  forwardConversationMessage,
  leaveGroupConversation,
  listConversationMessages,
  listConversationPinnedMessages,
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
  searchMessaging,
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
import {
  createMessagingSocket,
} from "../services/messaging-socket.service";
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
  GroupKind,
  MessageRequestListResponse,
  MessagingAccount,
  MessagingBlockedAccount,
  MessagingContact,
  MessagingAttachment,
  MessagingConversation,
  ConversationListView,
  ConversationSharedContent,
  ConversationMuteSetting,
  MessageInformation,
  MessagingMessage,
  MessagingMention,
  MessagingLocationPayload,
  MessagingMessageRequest,
  MessagingNotification,
  MessagingSearchMessageResult,
  MessagingUserProfile,
  MessageContentType,
  OfficialGroupAuditEntry,
  OfficialGroupScopeOption,
} from "../types/messaging";


type RealtimeConnectionStatus =
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "DISCONNECTED";

type SharedContentTab = "MEDIA" | "DOCUMENTS" | "LINKS";
const SELECTED_CONVERSATION_STORAGE_KEY =
  "nt-message:selected-conversation";
const HIGHLIGHT_MESSAGE_STORAGE_KEY =
  "nt-message:highlight-message";
const NOTIFICATION_SOUND_STORAGE_KEY = "nt-message:notification-sound-enabled";
const BROWSER_NOTIFICATION_STORAGE_KEY = "nt-message:browser-notifications-enabled";
const CUSTOMIZATION_STORAGE_KEY = "nt-message:customization";
const SETTINGS_STORAGE_KEY = "nt-message:settings";
const NOTIFICATION_SOUND_URL = "/sounds/web-whatsapp.mp3";
const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;
type QuickReaction = (typeof QUICK_REACTIONS)[number];
const QUICK_REACTION_SET = new Set<string>(QUICK_REACTIONS);

type MessagingTheme = "NT_BLUE" | "LIGHT" | "DARK";
type MessagingAccent = "BLUE" | "EMERALD" | "PURPLE" | "GOLD" | "ROSE";
type MessagingWallpaper = "CLEAN" | "DOTS" | "WAVES" | "GRID";
type MessagingDensity = "COMFORTABLE" | "COMPACT";

type MessagingSettingsTab = "PRIVACY" | "NOTIFICATIONS" | "BLOCKED" | "SECURITY";

interface MessagingSettings {
  showOnlineStatus: boolean;
  showReadReceipts: boolean;
  notificationPreview: boolean;
  muteAllNotifications: boolean;
}

const DEFAULT_MESSAGING_SETTINGS: MessagingSettings = {
  showOnlineStatus: true,
  showReadReceipts: true,
  notificationPreview: true,
  muteAllNotifications: false,
};

const SETTINGS_TABS: Array<{ value: MessagingSettingsTab; label: string }> = [
  { value: "PRIVACY", label: "Privacy" },
  { value: "NOTIFICATIONS", label: "Notifications" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "SECURITY", label: "Security" },
];

interface MessagingCustomization {
  theme: MessagingTheme;
  accent: MessagingAccent;
  wallpaper: MessagingWallpaper;
  density: MessagingDensity;
}

const DEFAULT_MESSAGING_CUSTOMIZATION: MessagingCustomization = {
  theme: "NT_BLUE",
  accent: "BLUE",
  wallpaper: "CLEAN",
  density: "COMFORTABLE",
};

const THEME_OPTIONS: Array<{ value: MessagingTheme; label: string }> = [
  { value: "NT_BLUE", label: "NT Blue" },
  { value: "LIGHT", label: "Light" },
  { value: "DARK", label: "Dark" },
];

const ACCENT_OPTIONS: Array<{ value: MessagingAccent; label: string }> = [
  { value: "BLUE", label: "Blue" },
  { value: "EMERALD", label: "Emerald" },
  { value: "PURPLE", label: "Purple" },
  { value: "GOLD", label: "Gold" },
  { value: "ROSE", label: "Rose" },
];

const WALLPAPER_OPTIONS: Array<{ value: MessagingWallpaper; label: string }> = [
  { value: "CLEAN", label: "Clean" },
  { value: "DOTS", label: "Dots" },
  { value: "WAVES", label: "Waves" },
  { value: "GRID", label: "Grid" },
];

const DENSITY_OPTIONS: Array<{ value: MessagingDensity; label: string }> = [
  { value: "COMFORTABLE", label: "Comfortable" },
  { value: "COMPACT", label: "Compact" },
];
const ACCEPTED_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
  "audio/aac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
].join(",");
const MAX_IMAGE_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENT_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const MAX_AUDIO_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_ATTACHMENT_BYTES = 200 * 1024 * 1024;
const VOICE_NOTE_MIME_TYPE_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const;


function isMessagingTheme(value: unknown): value is MessagingTheme {
  return value === "NT_BLUE" || value === "LIGHT" || value === "DARK";
}

function isMessagingAccent(value: unknown): value is MessagingAccent {
  return (
    value === "BLUE" ||
    value === "EMERALD" ||
    value === "PURPLE" ||
    value === "GOLD" ||
    value === "ROSE"
  );
}

function isMessagingWallpaper(value: unknown): value is MessagingWallpaper {
  return value === "CLEAN" || value === "DOTS" || value === "WAVES" || value === "GRID";
}

function isMessagingDensity(value: unknown): value is MessagingDensity {
  return value === "COMFORTABLE" || value === "COMPACT";
}

function readMessagingCustomization(): MessagingCustomization {
  try {
    const stored = window.localStorage.getItem(CUSTOMIZATION_STORAGE_KEY);

    if (!stored) {
      return DEFAULT_MESSAGING_CUSTOMIZATION;
    }

    const parsed = JSON.parse(stored) as Partial<MessagingCustomization>;

    return {
      theme: isMessagingTheme(parsed.theme)
        ? parsed.theme
        : DEFAULT_MESSAGING_CUSTOMIZATION.theme,
      accent: isMessagingAccent(parsed.accent)
        ? parsed.accent
        : DEFAULT_MESSAGING_CUSTOMIZATION.accent,
      wallpaper: isMessagingWallpaper(parsed.wallpaper)
        ? parsed.wallpaper
        : DEFAULT_MESSAGING_CUSTOMIZATION.wallpaper,
      density: isMessagingDensity(parsed.density)
        ? parsed.density
        : DEFAULT_MESSAGING_CUSTOMIZATION.density,
    };
  } catch {
    return DEFAULT_MESSAGING_CUSTOMIZATION;
  }
}

function customizationToken(value: string): string {
  return value.toLowerCase().replace(/_/g, "-");
}

function readMessagingSettings(): MessagingSettings {
  try {
    const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);

    if (!stored) {
      return DEFAULT_MESSAGING_SETTINGS;
    }

    const parsed = JSON.parse(stored) as Partial<MessagingSettings>;

    return {
      showOnlineStatus:
        typeof parsed.showOnlineStatus === "boolean"
          ? parsed.showOnlineStatus
          : DEFAULT_MESSAGING_SETTINGS.showOnlineStatus,
      showReadReceipts:
        typeof parsed.showReadReceipts === "boolean"
          ? parsed.showReadReceipts
          : DEFAULT_MESSAGING_SETTINGS.showReadReceipts,
      notificationPreview:
        typeof parsed.notificationPreview === "boolean"
          ? parsed.notificationPreview
          : DEFAULT_MESSAGING_SETTINGS.notificationPreview,
      muteAllNotifications:
        typeof parsed.muteAllNotifications === "boolean"
          ? parsed.muteAllNotifications
          : DEFAULT_MESSAGING_SETTINGS.muteAllNotifications,
    };
  } catch {
    return DEFAULT_MESSAGING_SETTINGS;
  }
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
  onDownload: (attachment: MessagingAttachment) => void;
  onPreview: (attachment: MessagingAttachment) => void;
}

interface AttachmentViewerState {
  message: MessagingMessage;
  attachment: MessagingAttachment;
  objectUrl: string | null;
  loading: boolean;
  error: string | null;
}

function MessageAttachmentCard({
  accessToken,
  conversationId,
  messageId,
  attachment,
  onDownload,
  onPreview,
}: MessageAttachmentCardProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || (!isImageAttachment(attachment) && !isAudioAttachment(attachment))) {
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

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
        setPreviewError(null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setPreviewError(
          error instanceof Error
            ? error.message
            : isAudioAttachment(attachment)
              ? "Audio preview could not be loaded."
              : "Image preview could not be loaded.",
        );
      });

    return () => {
      cancelled = true;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [accessToken, attachment, conversationId, messageId]);

  const canPreview = canPreviewAttachment(attachment);

  return (
    <div className="message-attachment-card">
      {isImageAttachment(attachment) && previewUrl && (
        <button
          type="button"
          className="message-attachment-preview-button"
          onClick={() => onPreview(attachment)}
          aria-label={`Open ${attachment.originalFileName}`}
        >
          <img
            src={previewUrl}
            alt={attachment.originalFileName}
            className="message-attachment-preview"
          />
        </button>
      )}

      {isImageAttachment(attachment) && !previewUrl && !previewError && (
        <div className="message-attachment-preview-placeholder">
          Loading image...
        </div>
      )}

      {isAudioAttachment(attachment) && previewUrl && (
        <div className="message-audio-card">
          <div className="message-audio-waveform" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <audio src={previewUrl} controls preload="metadata">
            Your browser does not support audio playback.
          </audio>
        </div>
      )}

      {isAudioAttachment(attachment) && !previewUrl && !previewError && (
        <div className="message-attachment-preview-placeholder">
          Loading audio...
        </div>
      )}

      {!isImageAttachment(attachment) && !isAudioAttachment(attachment) && (
        <button
          type="button"
          className={`message-attachment-file-preview${canPreview ? "" : " disabled"}`}
          onClick={() => {
            if (canPreview) {
              onPreview(attachment);
            }
          }}
          disabled={!canPreview}
          aria-label={canPreview ? `Preview ${attachment.originalFileName}` : undefined}
        >
          <span aria-hidden="true">
            {isVideoAttachment(attachment) ? "▶" : documentIcon(attachment)}
          </span>
          <small>
            {canPreview ? "Tap to preview" : "Download to open"}
          </small>
        </button>
      )}

      {previewError && (
        <div className="message-attachment-preview-placeholder error">
          {previewError}
        </div>
      )}

      <div className="message-attachment-info">
        <strong>{attachment.originalFileName}</strong>
        <span>
          {attachmentTypeLabel(attachment)} · {formatFileSize(attachment.fileSizeBytes)}
        </span>
      </div>

      <div className="message-attachment-actions">
        {canPreview && (
          <button
            type="button"
            onClick={() => onPreview(attachment)}
          >
            Preview
          </button>
        )}

        <button
          type="button"
          onClick={() => onDownload(attachment)}
        >
          Download
        </button>
      </div>
    </div>
  );
}

function readStoredConversationId(): string | null {
  try {
    return window.sessionStorage.getItem(
      SELECTED_CONVERSATION_STORAGE_KEY,
    );
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

function initials(value: string): string {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "NT";
  }

  return parts
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatConversationTime(value: string | null): string {
  if (!value) {
    return "New";
  }

  const date = new Date(value);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
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

function isImageAttachment(attachment: MessagingAttachment): boolean {
  return attachment.contentType === "IMAGE" && attachment.mimeType.startsWith("image/");
}

function isVideoAttachment(attachment: MessagingAttachment): boolean {
  return attachment.contentType === "VIDEO" || attachment.mimeType.startsWith("video/");
}

function isAudioAttachment(attachment: MessagingAttachment): boolean {
  return attachment.contentType === "AUDIO" || attachment.mimeType.startsWith("audio/");
}

function getMessagePayloadValue(
  message: Pick<MessagingMessage, "payload">,
  key: string,
): unknown {
  if (!message.payload || typeof message.payload !== "object" || Array.isArray(message.payload)) {
    return null;
  }

  return (message.payload as Record<string, unknown>)[key];
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
  ].join(" ").toLowerCase();
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
      const pattern = new RegExp(`(^|\\s)@${escapeRegExp(participant.displayName)}(?=\\s|$|[.,!?;:])`, "i");

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
    .sort((first, second) => first.start - second.start || second.end - first.end)
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

function getMessageLocationPayload(message: MessagingMessage): MessagingLocationPayload | null {
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
    accuracyMeters: typeof value.accuracyMeters === "number" ? value.accuracyMeters : null,
    headingDegrees: typeof value.headingDegrees === "number" ? value.headingDegrees : null,
    speedMetersPerSecond: typeof value.speedMetersPerSecond === "number" ? value.speedMetersPerSecond : null,
    label: typeof value.label === "string" ? value.label : null,
    mapUrl: value.mapUrl,
    liveExpiresAt: typeof value.liveExpiresAt === "string" ? value.liveExpiresAt : null,
    liveStoppedAt: typeof value.liveStoppedAt === "string" ? value.liveStoppedAt : null,
    updatedAt: value.updatedAt,
  };
}

function isLiveLocationActive(location: MessagingLocationPayload | null): boolean {
  if (!location || location.kind !== "LIVE" || location.liveStoppedAt || !location.liveExpiresAt) {
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

  if (location.liveExpiresAt && new Date(location.liveExpiresAt).getTime() <= Date.now()) {
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

  return `Updated ${new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date)}`;
}

function browserPositionToLocationInput(
  position: GeolocationPosition,
): {
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
    headingDegrees: typeof position.coords.heading === "number" && Number.isFinite(position.coords.heading)
      ? position.coords.heading
      : undefined,
    speedMetersPerSecond: typeof position.coords.speed === "number" && Number.isFinite(position.coords.speed)
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

  return (
    <div className={`message-location-card${active ? " live" : ""}`}>
      <div className="message-location-map-preview" aria-hidden="true">
        <span>📍</span>
      </div>

      <div className="message-location-content">
        <strong>{location.label ?? locationStatusLabel(location)}</strong>
        <span>
          {formatLocationCoordinate(location.latitude)}, {formatLocationCoordinate(location.longitude)}
        </span>
        <small>
          {formatLocationUpdatedAt(location.updatedAt)}
          {location.accuracyMeters !== null
            ? ` · ±${Math.round(location.accuracyMeters)}m`
            : ""}
        </small>

        <div className="message-location-actions">
          <a href={location.mapUrl} target="_blank" rel="noreferrer">
            Open map
          </a>

          {ownMessage && active && (
            <button
              type="button"
              onClick={() => onStop(message)}
              disabled={stopping}
            >
              {stopping ? "Stopping..." : "Stop sharing"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


function preferredVoiceNoteMimeType(): string {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  return VOICE_NOTE_MIME_TYPE_CANDIDATES.find((value) => MediaRecorder.isTypeSupported(value)) ?? "";
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
  return attachment.mimeType === "application/pdf" || attachment.originalFileName.toLowerCase().endsWith(".pdf");
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

function documentIcon(attachment: MessagingAttachment): string {
  if (isAudioAttachment(attachment)) {
    return "♪";
  }

  if (isPdfAttachment(attachment)) {
    return "PDF";
  }

  if (isTextPreviewAttachment(attachment)) {
    return "TXT";
  }

  return "DOC";
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

function attachmentLabel(message: Pick<MessagingMessage, "contentType" | "attachments" | "textContent" | "payload">): string {
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
    (first, second) => new Date(second.sharedAt).getTime() - new Date(first.sharedAt).getTime(),
  );
}

// Collects shared media, documents and links from loaded chat messages.
function collectSharedContentFromMessages(messages: MessagingMessage[]): ConversationSharedContent {
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
  const linkIds = new Set(primary.links.map((item) => `${item.message.id}:${item.url}`));

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
      ...fallback.links.filter((item) => !linkIds.has(`${item.message.id}:${item.url}`)),
    ]),
  };
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

function formatLastSeen(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Offline";
  }

  const now = new Date();
  const difference = Math.max(0, now.getTime() - date.getTime());

  if (difference < 60_000) {
    return "Last seen just now";
  }

  if (date.toDateString() === now.toDateString()) {
    return `Last seen today at ${new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date)}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (date.toDateString() === yesterday.toDateString()) {
    return `Last seen yesterday at ${new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date)}`;
  }

  return `Last seen ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)}`;
}

function roleLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function officialScopeLabel(
  conversation: MessagingConversation,
): string {
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

function requestReasonLabel(
  reason: MessagingMessageRequest["reason"],
): string {
  if (reason === "PROTECTED_RECIPIENT") {
    return "Protected first contact";
  }

  if (reason === "CROSS_DIVISION") {
    return "Different division";
  }

  return "Different department";
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

  const prefix =
    message.senderAccountId === accountId
      ? "You: "
      : "";

  return `${prefix}${message.forwardedFrom ? "Forwarded: " : ""}${attachmentLabel(message)}`;
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textArea);

  if (!copied) {
    throw new Error("The browser could not copy this message.");
  }
}

function playGeneratedNotificationFallback(): void {
  const audioWindow = window as Window & typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextClass = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;

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

function notificationTimestampLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function MessageAppPage() {
  const navigate = useNavigate();
  const {
    account,
    accessToken,
    logout,
  } = useAuth();

  const [loggingOut, setLoggingOut] = useState(false);
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeConnectionStatus>("CONNECTING");
  const [presenceByAccountId, setPresenceByAccountId] = useState<
    Record<string, MessagingPresenceState>
  >({});
  const [typingByConversation, setTypingByConversation] = useState<
    Record<string, string[]>
  >({});
  const [conversations, setConversations] = useState<MessagingConversation[]>([]);
  const [conversationListView, setConversationListView] = useState<ConversationListView>("ACTIVE");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    readStoredConversationId,
  );
  const [messages, setMessages] = useState<MessagingMessage[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<MessagingMessage[]>([]);
  const [conversationSearch, setConversationSearch] = useState("");
  const [messageText, setMessageText] = useState("");
  const [composerCaretIndex, setComposerCaretIndex] = useState(0);
  const [replyingTo, setReplyingTo] = useState<MessagingMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<MessagingMessage | null>(null);
  const [messageActionId, setMessageActionId] = useState<string | null>(null);
  const [messageActionMode, setMessageActionMode] = useState<
    "ME" | "EVERYONE" | null
  >(null);
  const [reactionActionId, setReactionActionId] = useState<string | null>(null);
  const [pinActionId, setPinActionId] = useState<string | null>(null);
  const [messageInformation, setMessageInformation] = useState<MessageInformation | null>(null);
  const [messageInformationLoadingId, setMessageInformationLoadingId] = useState<string | null>(null);
  const [messageInformationError, setMessageInformationError] = useState<string | null>(null);
  const [conversationPreferenceLoading, setConversationPreferenceLoading] = useState<string | null>(null);
  const [conversationLoading, setConversationLoading] = useState(true);
  const [messageLoading, setMessageLoading] = useState(false);
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<File | null>(null);
  const [selectedAttachmentKind, setSelectedAttachmentKind] = useState<"FILE" | "VOICE_NOTE">("FILE");
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const [voiceRecordingState, setVoiceRecordingState] = useState<"IDLE" | "RECORDING" | "STOPPING">("IDLE");
  const [voiceRecordingSeconds, setVoiceRecordingSeconds] = useState(0);
  const [locationDurationMinutes, setLocationDurationMinutes] = useState<15 | 60 | 480>(15);
  const [locationActionLoading, setLocationActionLoading] = useState<"CURRENT" | "LIVE" | "STOP" | null>(null);
  const [activeLiveLocation, setActiveLiveLocation] = useState<{
    conversationId: string;
    messageId: string;
    expiresAt: string;
  } | null>(null);
  const [attachmentViewer, setAttachmentViewer] = useState<AttachmentViewerState | null>(null);
  const [sharedContentOpen, setSharedContentOpen] = useState(false);
  const [sharedContentTab, setSharedContentTab] = useState<SharedContentTab>("MEDIA");
  const [sharedContent, setSharedContent] = useState<ConversationSharedContent | null>(null);
  const [sharedContentLoading, setSharedContentLoading] = useState(false);
  const [sharedContentError, setSharedContentError] = useState<string | null>(null);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [messageNotice, setMessageNotice] = useState<string | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<MessagingMessage | null>(null);
  const [forwardDestinationIds, setForwardDestinationIds] = useState<string[]>([]);
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardClientId, setForwardClientId] = useState<string | null>(null);
  const [forwardSubmitting, setForwardSubmitting] = useState(false);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [groupDialogMode, setGroupDialogMode] = useState<
    "CREATE" | "MANAGE" | null
  >(null);
  const [groupKind, setGroupKind] = useState<GroupKind>("PERSONAL");
  const [officialGroupScopes, setOfficialGroupScopes] = useState<OfficialGroupScopeOption[]>([]);
  const [officialGroupScopeKey, setOfficialGroupScopeKey] = useState("");
  const [officialGroupScopesLoading, setOfficialGroupScopesLoading] = useState(false);
  const [officialGroupAudit, setOfficialGroupAudit] = useState<OfficialGroupAuditEntry[]>([]);
  const [officialGroupAuditLoading, setOfficialGroupAuditLoading] = useState(false);
  const [officialGroupReconciling, setOfficialGroupReconciling] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [groupContacts, setGroupContacts] = useState<MessagingContact[]>([]);
  const [groupSelectedAccountIds, setGroupSelectedAccountIds] = useState<string[]>([]);
  const [groupContactsLoading, setGroupContactsLoading] = useState(false);
  const [groupSubmitting, setGroupSubmitting] = useState(false);
  const [groupActionAccountId, setGroupActionAccountId] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [groupPhotoUploading, setGroupPhotoUploading] = useState(false);
  const groupPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [contacts, setContacts] = useState<MessagingContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [creatingConversationId, setCreatingConversationId] = useState<string | null>(null);
  const [messageRequests, setMessageRequests] = useState<MessageRequestListResponse>({
    received: [],
    sent: [],
    counts: {
      receivedPending: 0,
      sentPending: 0,
    },
  });
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestNotice, setRequestNotice] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<MessagingNotification[]>([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [notificationToast, setNotificationToast] = useState<MessagingNotification | null>(null);
  const notificationToastTimerRef = useRef<number | null>(null);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(() => (
    window.localStorage.getItem(NOTIFICATION_SOUND_STORAGE_KEY) !== "false"
  ));
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(() => (
    window.localStorage.getItem(BROWSER_NOTIFICATION_STORAGE_KEY) === "true"
  ));
  const [customizationPanelOpen, setCustomizationPanelOpen] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<MessagingSettingsTab>("PRIVACY");
  const [messagingCustomization, setMessagingCustomization] = useState<MessagingCustomization>(
    readMessagingCustomization,
  );
  const [messagingSettings, setMessagingSettings] = useState<MessagingSettings>(
    readMessagingSettings,
  );
  const [blockedAccounts, setBlockedAccounts] = useState<MessagingBlockedAccount[]>([]);
  const [blockedAccountsLoading, setBlockedAccountsLoading] = useState(false);
  const [blockActionAccountId, setBlockActionAccountId] = useState<string | null>(null);
  const [blockSettingsError, setBlockSettingsError] = useState<string | null>(null);
  const [blockSettingsNotice, setBlockSettingsNotice] = useState<string | null>(null);
  useEffect(() => {
    window.localStorage.setItem(
      CUSTOMIZATION_STORAGE_KEY,
      JSON.stringify(messagingCustomization),
    );
  }, [messagingCustomization]);

  useEffect(() => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify(messagingSettings),
    );
  }, [messagingSettings]);

  useEffect(() => () => {
    clearLiveLocationWatch();
  }, []);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    void getMessagingPrivacySettings(accessToken)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setMessagingSettings((current) => ({
          ...current,
          showOnlineStatus: response.data.showOnlineStatus,
          showReadReceipts: response.data.showReadReceipts,
        }));
      })
      .catch(() => {
        // Local notification settings still work if privacy settings cannot load.
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

  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchScope, setSearchScope] = useState<"CURRENT" | "GLOBAL">("CURRENT");
  const [searchText, setSearchText] = useState("");
  const [searchContentType, setSearchContentType] = useState<"" | MessageContentType>("");
  const [searchDateFrom, setSearchDateFrom] = useState("");
  const [searchDateTo, setSearchDateTo] = useState("");
  const [searchResults, setSearchResults] = useState<MessagingSearchMessageResult[]>([]);
  const [searchConversationResults, setSearchConversationResults] = useState<MessagingConversation[]>([]);
  const [searchContactResults, setSearchContactResults] = useState<MessagingContact[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(
    readStoredHighlightedMessageId,
  );
  const [profileAccountId, setProfileAccountId] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<MessagingUserProfile | null>(null);
  const [profileBioDraft, setProfileBioDraft] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [profilePhotoUrls, setProfilePhotoUrls] = useState<Record<string, string>>({});
  const profilePhotoUrlsRef = useRef<Record<string, string>>({});
  const [groupPhotoUrls, setGroupPhotoUrls] = useState<Record<string, string>>({});
  const [groupPhotoCacheKeys, setGroupPhotoCacheKeys] = useState<Record<string, string>>({});
  const groupPhotoUrlsRef = useRef<Record<string, string>>({});
  const [profilePhotoRefreshKey, setProfilePhotoRefreshKey] = useState(0);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profilePhotoUploading, setProfilePhotoUploading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const pendingSearchResultRef = useRef<MessagingSearchMessageResult | null>(null);
  const previousScrollConversationIdRef = useRef<string | null>(null);
  const previousMessageCountRef = useRef(0);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentViewerRequestRef = useRef(0);
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
  const messagingSocketRef = useRef<MessagingSocket | null>(null);
  const activeTypingConversationIdRef = useRef<string | null>(null);
  const typingStopTimerRef = useRef<number | null>(null);
  const lastTypingEmitAtRef = useRef(0);

  const selectedConversation = useMemo(
    () => conversations.find(
      (conversation) => conversation.id === selectedConversationId,
    ) ?? null,
    [conversations, selectedConversationId],
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
        query
          ? mentionSearchText(participant).includes(query)
          : true,
      )
      .slice(0, 6);
  }, [account?.id, activeMentionQuery, editingMessage, selectedConversation]);


  useEffect(() => {
    return () => {
      if (attachmentPreviewUrl) {
        URL.revokeObjectURL(attachmentPreviewUrl);
      }
    };
  }, [attachmentPreviewUrl]);

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
    if (!accessToken || !profileAccountId) {
      setProfileData(null);
      setProfileBioDraft("");
      return;
    }

    let cancelled = false;
    setProfileLoading(true);
    setProfileError(null);

    const request = profileAccountId === account?.id
      ? getMyMessagingProfile(accessToken)
      : getMessagingProfile(accessToken, profileAccountId);

    void request
      .then((response) => {
        if (cancelled) {
          return;
        }

        setProfileData(response.data);
        setProfileBioDraft(response.data.profileBio ?? "");
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
    void createMessagingProfilePhotoObjectUrl(accessToken, profileData.accountId)
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
  }, [accessToken, profileData?.accountId, profileData?.profilePhotoKey, profilePhotoRefreshKey]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const accountsToLoad = new Map<string, MessagingAccount>();
    const collectAccount = (candidate?: MessagingAccount | null) => {
      if (candidate?.profilePhotoKey) {
        accountsToLoad.set(candidate.accountId, candidate);
      }
    };

    // Collect every visible account so avatars update across conversations, messages and search results.
    conversations.forEach((conversation) => {
      conversation.participants.forEach(collectAccount);
    });
    messages.forEach((message) => {
      collectAccount(message.sender);
      collectAccount(message.replyTo?.sender ?? null);
      message.reactions.forEach((reaction) => collectAccount(reaction.account ?? null));
    });
    contacts.forEach(collectAccount);
    blockedAccounts.forEach((block) => collectAccount(block.account));
    searchContactResults.forEach(collectAccount);
    searchResults.forEach((result) => collectAccount(result.message.sender));
    if (profileData) {
      collectAccount(profileData);
    }

    const missingAccounts = [...accountsToLoad.values()].filter(
      (candidate) => !profilePhotoUrls[candidate.accountId],
    );

    if (missingAccounts.length === 0) {
      return;
    }

    let cancelled = false;
    const loadedUrls: string[] = [];

    void Promise.all(
      missingAccounts.map(async (candidate) => {
        try {
          const url = await createMessagingProfilePhotoObjectUrl(accessToken, candidate.accountId);
          loadedUrls.push(url);
          return [candidate.accountId, url] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) {
        loadedUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      const nextEntries = entries.filter((entry): entry is readonly [string, string] => Boolean(entry));

      if (nextEntries.length === 0) {
        return;
      }

      setProfilePhotoUrls((current) => ({
        ...current,
        ...Object.fromEntries(nextEntries),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    blockedAccounts,
    contacts,
    conversations,
    messages,
    profileData,
    profilePhotoRefreshKey,
    profilePhotoUrls,
    searchContactResults,
    searchResults,
  ]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const groupsToLoad = conversations.filter(
      (conversation) => conversation.type === "GROUP" &&
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
          const url = await createGroupPhotoObjectUrl(accessToken, conversation.id);
          loadedUrls.push(url);
          return [conversation.id, conversation.groupPhotoKey as string, url] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) {
        loadedUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      const nextEntries = entries.filter((entry): entry is readonly [string, string, string] => Boolean(entry));

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
        ...Object.fromEntries(nextEntries.map(([conversationId, photoKey]) => [conversationId, photoKey])),
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

  useEffect(() => () => {
    Object.values(profilePhotoUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    Object.values(groupPhotoUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const canCreateOfficialGroup =
    account?.role === "SUPER_ADMIN" ||
    account?.role === "SENIOR_MANAGEMENT" ||
    account?.role === "TEAM_MANAGER";

  const selectedOfficialGroupScope = useMemo(
    () => officialGroupScopes.find(
      (scope) => scope.key === officialGroupScopeKey,
    ) ?? null,
    [officialGroupScopeKey, officialGroupScopes],
  );

  const filteredConversations = useMemo(() => {
    const search = conversationSearch.trim().toLowerCase();

    if (!search) {
      return conversations;
    }

    return conversations.filter((conversation) => {
      const participantText = conversation.participants
        .map((participant) => [
          participant.displayName,
          participant.username,
          participant.employee?.empId,
          participant.employee?.designation,
        ].filter(Boolean).join(" "))
        .join(" ");

      return [
        conversation.title,
        participantText,
        conversation.lastMessage?.textContent,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [conversationSearch, conversations]);

  const filteredForwardConversations = useMemo(() => {
    const search = forwardSearch.trim().toLowerCase();

    if (!search) {
      return conversations;
    }

    return conversations.filter((conversation) => {
      const participantText = conversation.participants
        .map((participant) => [
          participant.displayName,
          participant.username,
          participant.employee?.empId,
          participant.employee?.designation,
        ].filter(Boolean).join(" "))
        .join(" ");

      return [
        conversation.title,
        participantText,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [conversations, forwardSearch]);

  const totalUnread = useMemo(
    () => conversations.reduce(
      (total, conversation) => total + conversation.unreadCount,
      0,
    ),
    [conversations],
  );

  const loadConversations = useCallback(async (
    silent = false,
    preferredConversationId?: string,
  ): Promise<void> => {
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
  }, [accessToken, conversationListView]);

  const loadMessageRequests = useCallback(async (
    silent = false,
  ): Promise<void> => {
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
  }, [accessToken]);

  const loadMessages = useCallback(async (
    conversationId: string,
    silent = false,
  ): Promise<void> => {
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
      const pendingMessage = pendingSearchResult?.conversation.id === conversationId
        ? pendingSearchResult.message
        : null;
      const nextMessages = pendingMessage && !response.data.some((message) => message.id === pendingMessage.id)
        ? [...response.data, pendingMessage].sort((first, second) => (
            new Date(first.sentAt).getTime() - new Date(second.sentAt).getTime()
          ))
        : response.data;

      // Keep an older search result visible even when the first page does not contain it.
      setMessages(nextMessages);
      setMessageCursor(response.pagination.nextCursor);
      setHasOlderMessages(response.pagination.hasMore);
      setMessageError(null);

      const hasUnreadIncomingMessage = response.data.some(
        (message) =>
          message.senderAccountId !== account?.id &&
          message.readAt === null,
      );

      if (!silent || hasUnreadIncomingMessage) {
        try {
          await markConversationRead(accessToken, conversationId);

          setConversations((current) => current.map((conversation) => (
            conversation.id === conversationId
              ? {
                  ...conversation,
                  unreadCount: 0,
                }
              : conversation
          )));
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
  }, [accessToken, account?.id]);

  const loadPinnedMessages = useCallback(async (
    conversationId: string,
  ): Promise<void> => {
    if (!accessToken) {
      setPinnedMessages([]);
      return;
    }

    try {
      const response = await listConversationPinnedMessages(accessToken, conversationId);
      setPinnedMessages(response.data);
    } catch {
      // Pinning is non-blocking; the message thread can still load without the banner.
      setPinnedMessages([]);
    }
  }, [accessToken]);

  const applyConversationPreference = useCallback((
    preference: Awaited<ReturnType<typeof updateConversationPreference>>["data"],
  ): void => {
    setConversations((current) => current.map((conversation) => (
      conversation.id === preference.conversationId
        ? {
            ...conversation,
            isPinned: preference.isPinned,
            pinnedAt: preference.pinnedAt,
            isArchived: preference.isArchived,
            archivedAt: preference.archivedAt,
            isMuted: preference.isMuted,
            mutedUntil: preference.mutedUntil,
            isMarkedUnread: preference.isMarkedUnread,
            markedUnreadAt: preference.markedUnreadAt,
            unreadCount: preference.isMarkedUnread && conversation.unreadCount === 0
              ? 1
              : preference.isMarkedUnread
                ? conversation.unreadCount
                : conversation.unreadCount,
            draftText: preference.draftText,
            draftUpdatedAt: preference.draftUpdatedAt,
          }
        : conversation
    )));
  }, []);

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
    if (!selectedConversation || draftConversationIdRef.current === selectedConversation.id) {
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
      selectedAttachment ||
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
    selectedAttachment,
    selectedConversationId,
    voiceRecordingState,
  ]);


  const stopLocalTyping = useCallback((
    requestedConversationId?: string | null,
  ): void => {
    const conversationId =
      requestedConversationId ?? activeTypingConversationIdRef.current;

    if (typingStopTimerRef.current !== null) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }

    if (
      conversationId &&
      messagingSocketRef.current?.connected
    ) {
      messagingSocketRef.current.emit("messaging:typing", {
        conversationId,
        isTyping: false,
      });
    }

    if (activeTypingConversationIdRef.current === conversationId) {
      activeTypingConversationIdRef.current = null;
    }

    lastTypingEmitAtRef.current = 0;
  }, []);

  const updateLocalTyping = useCallback((
    conversationId: string,
    value: string,
  ): void => {
    const socket = messagingSocketRef.current;

    if (!socket?.connected || !value.trim()) {
      stopLocalTyping(conversationId);
      return;
    }

    const previousConversationId = activeTypingConversationIdRef.current;

    if (
      previousConversationId &&
      previousConversationId !== conversationId
    ) {
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
  }, [stopLocalTyping]);

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;

    const activeTypingConversationId =
      activeTypingConversationIdRef.current;

    if (
      activeTypingConversationId &&
      activeTypingConversationId !== selectedConversationId
    ) {
      stopLocalTyping(activeTypingConversationId);
    }
  }, [selectedConversationId, stopLocalTyping]);

  useEffect(() => {
    window.localStorage.setItem(
      NOTIFICATION_SOUND_STORAGE_KEY,
      notificationSoundEnabled ? "true" : "false",
    );
  }, [notificationSoundEnabled]);

  useEffect(() => {
    window.localStorage.setItem(
      BROWSER_NOTIFICATION_STORAGE_KEY,
      browserNotificationsEnabled ? "true" : "false",
    );
  }, [browserNotificationsEnabled]);

  useEffect(() => () => {
    if (notificationToastTimerRef.current !== null) {
      window.clearTimeout(notificationToastTimerRef.current);
    }
  }, []);

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

    const handlePresenceUpdated = (
      payload: MessagingPresenceState,
    ): void => {
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
      setNotifications((current) => [
        payload.notification,
        ...current.filter((notification) => notification.id !== payload.notification.id),
      ].slice(0, 40));
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
        new window.Notification(payload.notification.title, {
          body: messagingSettings.notificationPreview
            ? payload.notification.body
            : "Open NT Message to view this notification.",
          tag: payload.notification.id,
        });
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

      setMessages((current) => {
        if (current.some((message) => message.id === payload.message.id)) {
          return current;
        }

        return [...current, payload.message];
      });

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

      setMessages((current) => applyMessageUpdate(
        current,
        payload.message,
        { preservePersonalState: true },
      ));

      setPinnedMessages((current) => {
        if (payload.action === "PINNED") {
          const withoutCurrent = current.filter((item) => item.id !== payload.message.id);
          return [payload.message, ...withoutCurrent];
        }

        if (payload.action === "UNPINNED" || payload.action === "DELETED") {
          return current.filter((item) => item.id !== payload.message.id);
        }

        return applyMessageUpdate(current, payload.message, { preservePersonalState: true });
      });

      setReplyingTo((current) => (
        current?.id === payload.message.id
          ? payload.action === "DELETED"
            ? null
            : payload.message
          : current
      ));

      setEditingMessage((current) => (
        current?.id === payload.message.id && payload.action === "DELETED"
          ? null
          : current
      ));
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

      setMessages((current) => current.filter(
        (message) => message.id !== payload.messageId,
      ));
      setReplyingTo((current) => (
        current?.id === payload.messageId ? null : current
      ));
      setEditingMessage((current) => (
        current?.id === payload.messageId ? null : current
      ));
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
      _payload: MessagingConversationUpdatedPayload,
    ): void => {
      void loadConversations(
        true,
        selectedConversationIdRef.current ?? undefined,
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
      setRealtimeStatus(
        socket.active
          ? "RECONNECTING"
          : "DISCONNECTED",
      );
    };

    const handleConnectError = (): void => {
      setTypingByConversation({});
      setPresenceByAccountId({});
      setRealtimeStatus(
        socket.active
          ? "RECONNECTING"
          : "DISCONNECTED",
      );
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
    socket.on("messaging:receipt-updated", handleReceiptUpdated);
    socket.on(
      "messaging:conversation-updated",
      handleConversationUpdated,
    );
    socket.on(
      "messaging:request-updated",
      handleMessageRequestUpdated,
    );
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    socket.connect();

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
      socket.off("messaging:receipt-updated", handleReceiptUpdated);
      socket.off(
        "messaging:conversation-updated",
        handleConversationUpdated,
      );
      socket.off(
        "messaging:request-updated",
        handleMessageRequestUpdated,
      );
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.disconnect();

      if (messagingSocketRef.current === socket) {
        messagingSocketRef.current = null;
      }
    };
  }, [
    accessToken,
    loadConversations,
    loadMessageRequests,
    loadMessages,
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
        window.sessionStorage.removeItem(
          SELECTED_CONVERSATION_STORAGE_KEY,
        );
      }
    } catch {
      // Session storage is optional; messaging still works without it.
    }
  }, [selectedConversationId]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    void loadMessageRequests();
  }, [loadMessageRequests]);

  useEffect(() => {
    setReplyingTo(null);
    setEditingMessage(null);

    if (!selectedConversationId) {
      setMessageText("");
      setMessages([]);
      setPinnedMessages([]);
      draftConversationIdRef.current = null;
      return;
    }

    void loadMessages(selectedConversationId);
    void loadPinnedMessages(selectedConversationId);
  }, [loadMessages, loadPinnedMessages, selectedConversationId]);


  useEffect(() => {
    if (messageLoading || olderMessagesLoading) {
      return;
    }

    const element = messageListRef.current;

    if (!element) {
      return;
    }

    const conversationChanged =
      previousScrollConversationIdRef.current !== selectedConversationId;
    const messageCountIncreased =
      messages.length > previousMessageCountRef.current;
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    const viewerWasNearBottom = distanceFromBottom < 160;

    if (conversationChanged || (messageCountIncreased && viewerWasNearBottom)) {
      element.scrollTop = element.scrollHeight;
    }

    previousScrollConversationIdRef.current = selectedConversationId;
    previousMessageCountRef.current = messages.length;
  }, [messageLoading, messages.length, olderMessagesLoading, selectedConversationId]);

  useEffect(() => {
    if (!highlightedMessageId) {
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
  }, [highlightedMessageId, messages]);

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
        setOfficialGroupScopeKey((current) => (
          response.scopes.some((scope) => scope.key === current)
            ? current
            : response.scopes[0]?.key ?? ""
        ));
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
  }, [
    accessToken,
    canCreateOfficialGroup,
    groupDialogMode,
  ]);

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

    listOfficialGroupAudit(
      accessToken,
      selectedConversation.id,
      30,
    )
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
    selectedConversation,
  ]);

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
    setNewConversationOpen(false);
    setRequestDialogOpen(false);
    setGroupDialogMode("CREATE");
    setGroupKind("PERSONAL");
    setOfficialGroupScopeKey("");
    setOfficialGroupAudit([]);
    setGroupTitle("");
    setGroupDescription("");
    setGroupSearch("");
    setGroupContacts([]);
    setGroupSelectedAccountIds([]);
    setGroupError(null);
  }

  function openManageGroup(): void {
    if (!selectedConversation || selectedConversation.type !== "GROUP") {
      return;
    }

    setGroupDialogMode("MANAGE");
    setGroupKind(selectedConversation.groupKind ?? "PERSONAL");
    setOfficialGroupAudit([]);
    setGroupTitle(selectedConversation.title ?? "");
    setGroupDescription(selectedConversation.description ?? "");
    setGroupSearch("");
    setGroupContacts([]);
    setGroupSelectedAccountIds([]);
    setGroupError(null);
  }

  function closeGroupDialog(): void {
    if (groupSubmitting || groupActionAccountId) {
      return;
    }

    setGroupDialogMode(null);
    setOfficialGroupAudit([]);
    setGroupSelectedAccountIds([]);
    setGroupSearch("");
    setGroupError(null);
  }

  function toggleGroupMember(accountId: string): void {
    setGroupSelectedAccountIds((current) => (
      current.includes(accountId)
        ? current.filter((value) => value !== accountId)
        : [...current, accountId]
    ));
  }

  function replaceConversation(conversation: MessagingConversation): void {
    setConversations((current) => {
      const remaining = current.filter(
        (item) => item.id !== conversation.id,
      );

      return [conversation, ...remaining];
    });
  }

  async function handleCreateGroup(): Promise<void> {
    if (
      !accessToken ||
      !groupTitle.trim() ||
      groupSubmitting ||
      (groupKind === "PERSONAL" &&
        groupSelectedAccountIds.length === 0) ||
      (groupKind === "OFFICIAL" && !selectedOfficialGroupScope)
    ) {
      return;
    }

    setGroupSubmitting(true);
    setGroupError(null);

    try {
      const response = groupKind === "OFFICIAL" && selectedOfficialGroupScope
        ? await createOfficialGroupConversation(
            accessToken,
            {
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
            },
          )
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
      const response = await deleteGroupPhoto(accessToken, selectedConversation.id);

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

  async function handleRemoveGroupMember(
    accountId: string,
  ): Promise<void> {
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

  async function handleLeaveGroup(): Promise<void> {
    if (
      !accessToken ||
      !selectedConversation ||
      selectedConversation.type !== "GROUP" ||
      groupSubmitting
    ) {
      return;
    }

    if (!window.confirm("Leave this group?")) {
      return;
    }

    setGroupSubmitting(true);
    setGroupError(null);

    try {
      const response = await leaveGroupConversation(
        accessToken,
        selectedConversation.id,
      );

      setMessageNotice(response.message);
      setGroupDialogMode(null);
      setSelectedConversationId(null);
      await loadConversations(true);
    } catch (error) {
      setGroupError(
        error instanceof Error
          ? error.message
          : "The group could not be left.",
      );
    } finally {
      setGroupSubmitting(false);
    }
  }

  function openNewConversation(): void {
    setRequestDialogOpen(false);
    setRequestNotice(null);
    setContactSearch("");
    setContacts([]);
    setContactError(null);
    setNewConversationOpen(true);
  }

  function openProfile(accountId?: string | null): void {
    if (!accountId) {
      return;
    }

    setProfileAccountId(accountId);
    setProfileError(null);
  }

  function closeProfile(): void {
    setProfileAccountId(null);
    setProfileData(null);
    setProfileBioDraft("");
    setProfileError(null);
  }

  async function handleSaveProfileBio(): Promise<void> {
    if (!accessToken || !profileData?.isOwnProfile) {
      return;
    }

    setProfileSaving(true);
    setProfileError(null);

    try {
      // Users can update display bio only; official identity fields remain read-only.
      const response = await updateMyMessagingProfile(accessToken, profileBioDraft);
      setProfileData(response.data);
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

  async function handleProfilePhotoChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
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
      setProfileData(response.data);
      setProfilePhotoUrls((current) => {
        const previousUrl = current[response.data.accountId];
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl);
        }

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
      setProfileData(response.data);
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
      setRequestDialogOpen(true);
      void loadMessageRequests();
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
      setNewConversationOpen(false);
      setRequestDialogOpen(true);
      void loadMessageRequests();
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

      setNewConversationOpen(false);
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

  function openMessageRequests(): void {
    setNewConversationOpen(false);
    setRequestError(null);
    setRequestDialogOpen(true);
    void loadMessageRequests();
  }

  async function handleNotificationClick(notification: MessagingNotification): Promise<void> {
    if (!accessToken) {
      return;
    }

    try {
      const response = await markMessagingNotificationRead(accessToken, notification.id);
      setNotifications(response.data);
      setNotificationUnreadCount(response.unreadCount);
    } catch {
      // Opening the related conversation is still useful even if read-state sync fails.
    }

    if (notification.conversationId) {
      setSelectedConversationId(notification.conversationId);
    }

    if (notification.messageId) {
      setHighlightedMessageId(notification.messageId);
    }

    setNotificationPanelOpen(false);
  }

  async function handleMarkAllNotificationsRead(): Promise<void> {
    if (!accessToken) {
      return;
    }

    const response = await markAllMessagingNotificationsRead(accessToken);
    setNotifications(response.data);
    setNotificationUnreadCount(response.unreadCount);
  }

  async function handleDeleteNotification(
    notification: MessagingNotification,
    event?: MouseEvent<HTMLElement>,
  ): Promise<void> {
    event?.stopPropagation();

    if (!accessToken) {
      return;
    }

    // Delete only the current user's notification row and refresh the unread badge from the server.
    const response = await deleteMessagingNotification(accessToken, notification.id);
    setNotifications(response.data);
    setNotificationUnreadCount(response.unreadCount);

    if (notificationToast?.id === notification.id) {
      setNotificationToast(null);
    }
  }

  async function handleDeleteReadNotifications(): Promise<void> {
    if (!accessToken || !notifications.some((notification) => notification.isRead)) {
      return;
    }

    // Remove seen notifications while leaving unread alerts visible for action.
    const response = await deleteReadMessagingNotifications(accessToken);
    setNotifications(response.data);
    setNotificationUnreadCount(response.unreadCount);
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

  function updateMessagingSettings(
    changes: Partial<MessagingSettings>,
  ): void {
    setMessagingSettings((current) => ({
      ...current,
      ...changes,
    }));

    const privacyChanges: Pick<
      Partial<MessagingSettings>,
      "showOnlineStatus" | "showReadReceipts"
    > = {};

    if (typeof changes.showOnlineStatus === "boolean") {
      privacyChanges.showOnlineStatus = changes.showOnlineStatus;
    }

    if (typeof changes.showReadReceipts === "boolean") {
      privacyChanges.showReadReceipts = changes.showReadReceipts;
    }

    if (accessToken && Object.keys(privacyChanges).length > 0) {
      void updateMessagingPrivacySettings(accessToken, privacyChanges)
        .then((response) => {
          setMessagingSettings((current) => ({
            ...current,
            showOnlineStatus: response.data.showOnlineStatus,
            showReadReceipts: response.data.showReadReceipts,
          }));
        })
        .catch(() => {
          void getMessagingPrivacySettings(accessToken).then((response) => {
            setMessagingSettings((current) => ({
              ...current,
              showOnlineStatus: response.data.showOnlineStatus,
              showReadReceipts: response.data.showReadReceipts,
            }));
          });
        });
    }
  }

  function resetMessagingSettings(): void {
    setMessagingSettings((current) => ({
      ...DEFAULT_MESSAGING_SETTINGS,
      showOnlineStatus: current.showOnlineStatus,
      showReadReceipts: current.showReadReceipts,
    }));
  }

  function clearLocalMessagingPreferences(): void {
    setMessagingCustomization(DEFAULT_MESSAGING_CUSTOMIZATION);
    setMessagingSettings((current) => ({
      ...DEFAULT_MESSAGING_SETTINGS,
      showOnlineStatus: current.showOnlineStatus,
      showReadReceipts: current.showReadReceipts,
    }));
    setNotificationSoundEnabled(true);
    setBrowserNotificationsEnabled(false);
    window.localStorage.removeItem(CUSTOMIZATION_STORAGE_KEY);
    window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
    window.localStorage.removeItem(NOTIFICATION_SOUND_STORAGE_KEY);
    window.localStorage.removeItem(BROWSER_NOTIFICATION_STORAGE_KEY);
  }

  async function handleBrowserNotificationToggle(): Promise<void> {
    if (!browserNotificationsEnabled && "Notification" in window) {
      // Browser permission must be requested from a direct user click.
      const permission = await window.Notification.requestPermission();
      setBrowserNotificationsEnabled(permission === "granted");
      return;
    }

    setBrowserNotificationsEnabled((value) => !value);
  }

  function openSearchDialog(scope: "CURRENT" | "GLOBAL" = selectedConversationId ? "CURRENT" : "GLOBAL"): void {
    setSearchScope(scope);
    setSearchError(null);
    setSearchDialogOpen(true);
  }

  function searchFilters() {
    return {
      search: searchText,
      contentType: searchContentType || undefined,
      dateFrom: searchDateFrom || undefined,
      dateTo: searchDateTo || undefined,
      limit: 25,
    };
  }

  async function handleMessagingSearch(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!accessToken) {
      return;
    }

    if (searchScope === "CURRENT" && !selectedConversationId) {
      setSearchError("Select a conversation before searching inside it.");
      return;
    }

    setSearchLoading(true);
    setSearchError(null);

    try {
      if (searchScope === "CURRENT" && selectedConversationId) {
        // Current-conversation search still uses the same backend membership checks.
        const response = await searchConversationMessages(
          accessToken,
          selectedConversationId,
          searchFilters(),
        );

        setSearchResults(response.data);
        setSearchConversationResults([]);
        setSearchContactResults([]);
      } else {
        // Global search combines authorized messages, conversations and eligible contacts.
        const response = await searchMessaging(accessToken, searchFilters());

        setSearchResults(response.messages);
        setSearchConversationResults(response.conversations);
        setSearchContactResults(response.contacts);
      }
    } catch (error) {
      setSearchError(
        error instanceof Error
          ? error.message
          : "Search could not be completed.",
      );
    } finally {
      setSearchLoading(false);
    }
  }

  function openSearchMessageResult(result: MessagingSearchMessageResult): void {
    pendingSearchResultRef.current = result;
    setSearchDialogOpen(false);
    setHighlightedMessageId(result.message.id);
    setSelectedConversationId(result.conversation.id);
    setConversations((current) => {
      if (current.some((conversation) => conversation.id === result.conversation.id)) {
        return current;
      }

      return [result.conversation, ...current];
    });
  }

  function openSearchConversationResult(conversation: MessagingConversation): void {
    setSearchDialogOpen(false);
    setSelectedConversationId(conversation.id);
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
      const response = await acceptMessageRequest(
        accessToken,
        request.id,
      );

      setRequestNotice(response.message);
      setRequestDialogOpen(false);
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
      const response = await declineMessageRequest(
        accessToken,
        request.id,
      );

      setRequestNotice(response.message);
      await Promise.all([
        loadMessageRequests(true),
        loadBlockedAccounts(),
      ]);
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
      const response = await blockMessageRequest(
        accessToken,
        request.id,
      );

      setRequestNotice(response.message);
      await Promise.all([
        loadMessageRequests(true),
        loadBlockedAccounts(),
      ]);
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

    const confirmed = window.confirm(
      `Block ${target.displayName} for private messaging? Official groups and announcements will still remain visible.`,
    );

    if (!confirmed) {
      return;
    }

    setBlockActionAccountId(target.accountId);
    setBlockSettingsError(null);
    setBlockSettingsNotice(null);
    setProfileError(null);

    try {
      const response = await blockMessagingAccount(accessToken, target.accountId);
      setBlockSettingsNotice(response.message);
      await loadBlockedAccounts();

      if (profileData?.accountId === target.accountId) {
        setProfileData((current) => current
          ? {
              ...current,
              contactMode: "BLOCKED",
              blockDirection: "BLOCKED_BY_ME",
            }
          : current,
        );
      }

      setContacts((current) => current.map((contact) => (
        contact.accountId === target.accountId
          ? {
              ...contact,
              contactMode: "BLOCKED",
              blockDirection: "BLOCKED_BY_ME",
            }
          : contact
      )));
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Account could not be blocked.";
      setBlockSettingsError(message);
      setProfileError(message);
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
      const response = await unblockMessagingAccount(accessToken, targetAccountId);
      setBlockSettingsNotice(response.message);
      await loadBlockedAccounts();

      if (profileData?.accountId === targetAccountId) {
        const refreshed = await getMessagingProfile(accessToken, targetAccountId);
        setProfileData(refreshed.data);
      }

      setContacts((current) => current.map((contact) => (
        contact.accountId === targetAccountId
          ? {
              ...contact,
              contactMode: "DIRECT",
              blockDirection: null,
            }
          : contact
      )));
    } catch (error) {
      const message = error instanceof Error
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
    voiceRecorderStreamRef.current?.getTracks().forEach((track) => track.stop());
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

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessageError("Voice recording is not supported in this browser.");
      return;
    }

    try {
      clearSelectedAttachment();
      setMessageError(null);
      // Microphone access must be explicit before the browser can record a voice note.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredVoiceNoteMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

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

        // Store the recorded audio as a normal attachment with a voice-note marker.
        setSelectedAttachment(file);
        setSelectedAttachmentKind("VOICE_NOTE");
        setAttachmentPreviewUrl(URL.createObjectURL(file));
      };

      // A one-second timeslice keeps longer recordings responsive without manual polling.
      recorder.start(1000);
      voiceRecordingStartedAtRef.current = Date.now();
      setVoiceRecordingSeconds(0);
      setVoiceRecordingState("RECORDING");
      voiceRecordingTimerRef.current = window.setInterval(() => {
        setVoiceRecordingSeconds(Math.floor((Date.now() - voiceRecordingStartedAtRef.current) / 1000));
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
    if (liveLocationWatchIdRef.current !== null && navigator.geolocation?.clearWatch) {
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
      return Promise.reject(new Error("Location sharing is not supported in this browser."));
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        () => reject(new Error("Location permission was denied or unavailable.")),
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

    setConversations((current) => current.map((conversation) => (
      conversation.id === message.conversationId
        ? {
            ...conversation,
            lastMessage: message,
            lastMessageAt: message.sentAt,
            updatedAt: message.updatedAt,
          }
        : conversation
    )));
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

    liveLocationExpiryTimerRef.current = window.setTimeout(() => {
      clearLiveLocationWatch();
      setActiveLiveLocation(null);
      setMessageNotice("Live location sharing expired.");
    }, Math.max(0, expiresAtMs - Date.now()));

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
            setMessages((current) => applyMessageUpdate(current, response.data));
            setConversations((current) => current.map((conversation) => (
              conversation.id === response.data.conversationId &&
              conversation.lastMessage?.id === response.data.id
                ? {
                    ...conversation,
                    lastMessage: response.data,
                    updatedAt: response.data.updatedAt,
                  }
                : conversation
            )));
          })
          .catch(() => {
            setMessageNotice("Live location update failed. Sharing will keep trying until it expires or you stop it.");
          });
      },
      () => {
        setMessageNotice("Live location permission was interrupted. Stop and start again if needed.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      },
    );
  }

  async function handleShareCurrentLocation(): Promise<void> {
    if (!accessToken || !selectedConversationId || sendingMessage || editingMessage || voiceRecordingState !== "IDLE") {
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
    if (!accessToken || !selectedConversationId || sendingMessage || editingMessage || voiceRecordingState !== "IDLE") {
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

  async function handleStopLiveLocation(message?: MessagingMessage): Promise<void> {
    if (!accessToken) {
      return;
    }

    const conversationId = message?.conversationId ?? activeLiveLocation?.conversationId;
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

  function clearSelectedAttachment(): void {
    setSelectedAttachment(null);
    setSelectedAttachmentKind("FILE");

    setAttachmentPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }

      return null;
    });

    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  }

  function handleAttachmentChange(
    event: ChangeEvent<HTMLInputElement>,
  ): void {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      clearSelectedAttachment();
      return;
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

    if (file.size > maxSize) {
      setMessageError(
        isImage
          ? "Image attachments must be 20 MB or smaller."
          : isVideo
            ? "Video attachments must be 200 MB or smaller."
            : isAudio
              ? "Audio attachments must be 25 MB or smaller."
              : "Document attachments must be 50 MB or smaller.",
      );
      clearSelectedAttachment();
      return;
    }

    setSelectedAttachment(file);
    setSelectedAttachmentKind("FILE");
    setMessageError(null);

    setAttachmentPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }

      return isImage || isVideo || isAudio ? URL.createObjectURL(file) : null;
    });
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

  function closeAttachmentViewer(): void {
    attachmentViewerRequestRef.current += 1;

    setAttachmentViewer((current) => {
      if (current?.objectUrl) {
        URL.revokeObjectURL(current.objectUrl);
      }

      return null;
    });
  }

  async function handlePreviewAttachment(
    message: MessagingMessage,
    attachment: MessagingAttachment,
  ): Promise<void> {
    if (!accessToken || !canPreviewAttachment(attachment)) {
      return;
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
        error: error instanceof Error
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
      setConversations((current) => current.map((conversation) => (
        conversation.id === response.data.conversationId &&
        conversation.lastMessage?.id === response.data.id
          ? {
              ...conversation,
              lastMessage: response.data,
            }
          : conversation
      )));
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
    setMessageActionMode(null);
    setMessageError(null);
    setMessageNotice(null);

    try {
      const response = message.isStarred
        ? await unstarConversationMessage(accessToken, message.conversationId, message.id)
        : await starConversationMessage(accessToken, message.conversationId, message.id);

      setMessages((current) => applyMessageUpdate(current, response.data));
      setPinnedMessages((current) => applyMessageUpdate(current, response.data));
      setMessageNotice(response.message);
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : "The starred state could not be updated.",
      );
    } finally {
      setMessageActionId(null);
      setMessageActionMode(null);
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
        ? await unpinConversationMessage(accessToken, message.conversationId, message.id)
        : await pinConversationMessage(accessToken, message.conversationId, message.id);

      setMessages((current) => applyMessageUpdate(current, response.data));
      setPinnedMessages((current) => {
        if (response.data.isPinned) {
          const withoutCurrent = current.filter((item) => item.id !== response.data.id);
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

  function focusPinnedMessage(message: MessagingMessage): void {
    if (message.conversationId !== selectedConversationId) {
      setSelectedConversationId(message.conversationId);
    }

    setHighlightedMessageId(message.id);
  }

  // Closes the shared dialog and highlights the original message in the chat.
  function focusSharedContentMessage(message: MessagingMessage): void {
    setSharedContentOpen(false);

    if (message.conversationId !== selectedConversationId) {
      setSelectedConversationId(message.conversationId);
    }

    // Older shared items may not be present in the current paginated message window.
    setMessages((current) => {
      if (current.some((item) => item.id === message.id)) {
        return current;
      }

      return [...current, message].sort(
        (first, second) => new Date(first.sentAt).getTime() - new Date(second.sentAt).getTime(),
      );
    });

    setHighlightedMessageId(message.id);
  }

  // Opens the shared-content dialog and loads media, documents and links.
  async function openSharedContentDialog(tab: SharedContentTab = "MEDIA"): Promise<void> {
    if (!accessToken || !selectedConversationId) {
      return;
    }

    const localSharedContent = collectSharedContentFromMessages(
      messages.filter((message) => message.conversationId === selectedConversationId),
    );

    setSharedContentOpen(true);
    setSharedContentTab(tab);
    setSharedContent(localSharedContent);
    setSharedContentLoading(true);
    setSharedContentError(null);

    try {
      const response = await getConversationSharedContent(accessToken, selectedConversationId);
      setSharedContent(mergeSharedContent(response.data, localSharedContent));
    } catch (error) {
      const hasLocalSharedContent =
        localSharedContent.media.length > 0 ||
        localSharedContent.documents.length > 0 ||
        localSharedContent.links.length > 0;

      // The local fallback keeps recently loaded shared content usable if the API request fails.
      if (!hasLocalSharedContent) {
        setSharedContentError(
          error instanceof Error
            ? error.message
            : "Shared content could not be loaded.",
        );
      }
    } finally {
      setSharedContentLoading(false);
    }
  }

  function closeSharedContentDialog(): void {
    setSharedContentOpen(false);
    setSharedContentError(null);
  }

  function closeMessageInformationDialog(): void {
    setMessageInformation(null);
    setMessageInformationError(null);
  }

  async function handleViewMessageInformation(message: MessagingMessage): Promise<void> {
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

  async function handleConversationPinnedToggle(): Promise<void> {
    if (!selectedConversation) {
      return;
    }

    await saveConversationPreference(
      selectedConversation.id,
      {
        isPinned: !selectedConversation.isPinned,
      },
      selectedConversation.isPinned
        ? "Conversation unpinned."
        : "Conversation pinned.",
    );
  }

  async function handleConversationArchiveToggle(): Promise<void> {
    if (!selectedConversation) {
      return;
    }

    await saveConversationPreference(
      selectedConversation.id,
      {
        isArchived: !selectedConversation.isArchived,
      },
      selectedConversation.isArchived
        ? "Conversation restored."
        : "Conversation archived.",
    );
    await loadConversations(true, selectedConversation.id);
  }

  async function handleConversationMuteChange(
    mute: ConversationMuteSetting,
  ): Promise<void> {
    if (!selectedConversation) {
      return;
    }

    await saveConversationPreference(
      selectedConversation.id,
      {
        mute,
      },
      mute === "OFF" ? "Conversation unmuted." : "Conversation muted.",
    );
  }

  async function handleConversationUnreadToggle(): Promise<void> {
    if (!accessToken || !selectedConversation) {
      return;
    }

    if (selectedConversation.isMarkedUnread || selectedConversation.unreadCount > 0) {
      await markConversationRead(accessToken, selectedConversation.id);
      await saveConversationPreference(
        selectedConversation.id,
        {
          markUnread: false,
        },
        "Conversation marked as read.",
      );
      await loadConversations(true, selectedConversation.id);
      return;
    }

    await saveConversationPreference(
      selectedConversation.id,
      {
        markUnread: true,
      },
      "Conversation marked as unread.",
    );
  }

  function beginReply(message: MessagingMessage): void {
    if (message.isDeleted) {
      return;
    }

    setEditingMessage(null);
    setReplyingTo(message);
    focusComposer();
  }

  function beginEdit(message: MessagingMessage): void {
    if (
      !canEditMessage(message, account?.id)
    ) {
      return;
    }

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

  async function handleCopyMessage(
    message: MessagingMessage,
  ): Promise<void> {
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
    if (
      !accessToken ||
      !selectedConversationId ||
      messageActionId
    ) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this message only for you? Other participants will still see it.",
    );

    if (!confirmed) {
      return;
    }

    setMessageActionId(message.id);
    setMessageActionMode("ME");
    setMessageError(null);

    try {
      await deleteConversationMessageForMe(
        accessToken,
        selectedConversationId,
        message.id,
      );

      setMessages((current) => current.filter(
        (currentMessage) => currentMessage.id !== message.id,
      ));

      if (replyingTo?.id === message.id || editingMessage?.id === message.id) {
        cancelMessageAction();
      }

      await loadConversations(true, selectedConversationId);
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : "The message could not be deleted for you.",
      );
    } finally {
      setMessageActionId(null);
      setMessageActionMode(null);
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

    const confirmed = window.confirm(
      "Delete this message for everyone? This action cannot be undone.",
    );

    if (!confirmed) {
      return;
    }

    setMessageActionId(message.id);
    setMessageActionMode("EVERYONE");
    setMessageError(null);

    try {
      const response = await deleteConversationMessage(
        accessToken,
        selectedConversationId,
        message.id,
      );

      setMessages((current) => applyMessageUpdate(
        current,
        response.data,
      ));

      if (replyingTo?.id === message.id || editingMessage?.id === message.id) {
        cancelMessageAction();
      }

      await loadConversations(true, selectedConversationId);
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : "The message could not be deleted for everyone.",
      );
    } finally {
      setMessageActionId(null);
      setMessageActionMode(null);
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

    if (
      !accessToken ||
      !selectedConversationId ||
      (!text && !selectedAttachment) ||
      sendingMessage ||
      voiceRecordingState !== "IDLE"
    ) {
      return;
    }

    setSendingMessage(true);
    setMessageError(null);
    stopLocalTyping(selectedConversationId);

    try {
      if (editingMessage) {
        if (selectedAttachment) {
          setMessageError("Remove the selected attachment before saving an edited text message.");
          return;
        }

        const response = await editConversationTextMessage(
          accessToken,
          selectedConversationId,
          editingMessage.id,
          text,
        );

        setMessages((current) => applyMessageUpdate(
          current,
          response.data,
        ));
        setEditingMessage(null);
        setMessageText("");
        await loadConversations(true, selectedConversationId);
        return;
      }

      const response = selectedAttachment
        ? await sendConversationAttachmentMessage(
            accessToken,
            selectedConversationId,
            selectedAttachment,
            text,
            replyingTo?.id,
            selectedAttachmentKind === "VOICE_NOTE" ? "VOICE_NOTE" : undefined,
          )
        : await sendConversationTextMessage(
            accessToken,
            selectedConversationId,
            text,
            replyingTo?.id,
            getMentionedAccountIds(text, selectedConversation, account?.id),
          );

      delete draftCacheRef.current[selectedConversationId];

      setMessageText("");
      setReplyingTo(null);
      clearSelectedAttachment();
      updateConversationPreference(accessToken, selectedConversationId, {
        draftText: null,
      })
        .then((draftResponse) => applyConversationPreference(draftResponse.data))
        .catch(() => {
          // Sending succeeded, so a failed draft cleanup should not block the chat.
        });
      setMessages((current) => {
        if (current.some((message) => message.id === response.data.id)) {
          return current;
        }

        return [...current, response.data];
      });

      setConversations((current) => current.map((conversation) => (
        conversation.id === selectedConversationId
          ? {
              ...conversation,
              lastMessage: response.data,
              lastMessageAt: response.data.sentAt,
              updatedAt: response.data.updatedAt,
            }
          : conversation
      )));

      await loadConversations(true);
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : "The message could not be sent.",
      );
    } finally {
      setSendingMessage(false);
    }
  }

  function handleComposerKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void {
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

  const peer = selectedConversation?.type === "PRIVATE"
    ? selectedConversation.participants.find(
        (participant) => participant.accountId !== account?.id,
      ) ?? null
    : null;
  const peerPresence = peer
    ? presenceByAccountId[peer.accountId]
    : undefined;
  const typingAccountIds = selectedConversationId
    ? typingByConversation[selectedConversationId] ?? []
    : [];
  const typingParticipants = selectedConversation?.participants.filter(
    (participant) =>
      participant.accountId !== account?.id &&
      participant.showOnlineStatus !== false &&
      typingAccountIds.includes(participant.accountId),
  ) ?? [];
  const peerActivityLabel = selectedConversation?.type === "GROUP"
    ? typingParticipants.length > 0
      ? `${typingParticipants
          .slice(0, 2)
          .map((participant) => participant.displayName)
          .join(", ")}${typingParticipants.length > 2 ? " and others" : ""} typing…`
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
    groupDialogMode === "MANAGE" &&
    selectedConversation?.type === "GROUP"
      ? selectedConversation.participants.map(
          (participant) => participant.accountId,
        )
      : [],
  );

  const blockedMessageRequests = [
    ...messageRequests.received,
    ...messageRequests.sent,
  ].filter((request) => request.status === "BLOCKED");
  const blockedAccountIds = new Set(blockedAccounts.map((block) => block.blockedAccountId));

  function renderAccountAvatar(
    targetAccount: MessagingAccount,
    className = "message-avatar",
  ) {
    const photoUrl = profilePhotoUrls[targetAccount.accountId];

    return (
      <span className={className}>
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={`${targetAccount.displayName} profile`}
          />
        ) : (
          initials(targetAccount.displayName)
        )}
      </span>
    );
  }


  function renderGroupAvatar(
    conversation: MessagingConversation,
    className = "message-avatar",
  ) {
    const photoUrl = groupPhotoUrls[conversation.id];
    const title = conversation.title ?? "Group";

    return (
      <span className={className}>
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={`${title} group`}
          />
        ) : (
          initials(title)
        )}
      </span>
    );
  }

  return (
    <main
      className={`message-app-shell theme-${customizationToken(messagingCustomization.theme)} accent-${customizationToken(messagingCustomization.accent)} wallpaper-${customizationToken(messagingCustomization.wallpaper)} density-${customizationToken(messagingCustomization.density)}`}
    >
      <header className="message-app-topbar">
        <button
          type="button"
          className="message-app-brand"
          onClick={() => navigate("/messages")}
        >
          <span className="message-app-logo">
            <img
              src="/nt-logo.png"
              alt="Nepal Telecom"
            />
          </span>

          <span>
            <strong>NT Message</strong>
            <small>Secure Internal Communication</small>
          </span>
        </button>

        <div className="message-app-account">
          <div className="message-app-account-copy">
            <span>Signed in as</span>
            <strong>{account?.username ?? "NT Message User"}</strong>
            <small aria-live="polite">
              {account ? roleLabel(account.role) : "Employee"}
              {` · ${realtimeLabel}`}
            </small>
          </div>

          <button
            type="button"
            className="message-profile-topbar-button"
            onClick={() => openProfile(account?.id)}
          >
            My profile
          </button>

          <div className="message-customization-wrapper">
            <button
              type="button"
              className="message-customization-button"
              onClick={() => {
                setCustomizationPanelOpen((value) => !value);
                setSettingsPanelOpen(false);
              }}
              aria-expanded={customizationPanelOpen}
            >
              Customize
            </button>

            {customizationPanelOpen && (
              <div className="message-customization-panel">
                <div className="message-customization-panel-header">
                  <span>Customization</span>
                  <strong>Theme & wallpaper</strong>
                </div>

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
                  <span>Accent color</span>
                  <select
                    value={messagingCustomization.accent}
                    onChange={(event) =>
                      updateMessagingCustomization({
                        accent: event.target.value as MessagingAccent,
                      })
                    }
                  >
                    {ACCENT_OPTIONS.map((option) => (
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

                <button
                  type="button"
                  className="message-customization-reset"
                  onClick={resetMessagingCustomization}
                >
                  Reset to default
                </button>

                <small>Saved automatically on this browser.</small>
              </div>
            )}
          </div>

          <div className="message-settings-wrapper">
            <button
              type="button"
              className="message-settings-button"
              onClick={() => {
                setSettingsPanelOpen((value) => !value);
                setCustomizationPanelOpen(false);
              }}
              aria-expanded={settingsPanelOpen}
            >
              Settings
            </button>

            {settingsPanelOpen && (
              <div className="message-settings-panel">
                <div className="message-settings-panel-header">
                  <span>M6 Settings</span>
                  <strong>Privacy, alerts & security</strong>
                </div>

                <div className="message-settings-tabs" role="tablist" aria-label="Messaging settings">
                  {SETTINGS_TABS.map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      className={settingsTab === tab.value ? "active" : ""}
                      onClick={() => setSettingsTab(tab.value)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="message-settings-body">
                  {settingsTab === "PRIVACY" && (
                    <section className="message-settings-section">
                      <label className="message-settings-toggle">
                        <span>
                          <strong>Share my online status</strong>
                          <small>Allow other users to see when you are online, typing and recently active.</small>
                        </span>
                        <input
                          type="checkbox"
                          checked={messagingSettings.showOnlineStatus}
                          onChange={(event) => updateMessagingSettings({ showOnlineStatus: event.target.checked })}
                        />
                      </label>

                      <label className="message-settings-toggle">
                        <span>
                          <strong>Send my read receipts</strong>
                          <small>Allow message senders to see when you have read their messages.</small>
                        </span>
                        <input
                          type="checkbox"
                          checked={messagingSettings.showReadReceipts}
                          onChange={(event) => updateMessagingSettings({ showReadReceipts: event.target.checked })}
                        />
                      </label>

                      <p className="message-settings-note">
                        Privacy settings are saved to your account. Turning them off hides your status or read activity from other users, not from your own screen.
                      </p>
                    </section>
                  )}

                  {settingsTab === "NOTIFICATIONS" && (
                    <section className="message-settings-section">
                      <label className="message-settings-toggle">
                        <span>
                          <strong>Notification sound</strong>
                          <small>Play the NT Message alert sound for new realtime notifications.</small>
                        </span>
                        <input
                          type="checkbox"
                          checked={notificationSoundEnabled}
                          onChange={(event) => setNotificationSoundEnabled(event.target.checked)}
                          disabled={messagingSettings.muteAllNotifications}
                        />
                      </label>

                      <label className="message-settings-toggle">
                        <span>
                          <strong>Browser notifications</strong>
                          <small>Show system notifications when permission is granted.</small>
                        </span>
                        <input
                          type="checkbox"
                          checked={browserNotificationsEnabled}
                          onChange={() => void handleBrowserNotificationToggle()}
                          disabled={messagingSettings.muteAllNotifications}
                        />
                      </label>

                      <label className="message-settings-toggle">
                        <span>
                          <strong>Show notification preview</strong>
                          <small>Include message preview text in toast and browser notifications.</small>
                        </span>
                        <input
                          type="checkbox"
                          checked={messagingSettings.notificationPreview}
                          onChange={(event) => updateMessagingSettings({ notificationPreview: event.target.checked })}
                        />
                      </label>

                      <label className="message-settings-toggle">
                        <span>
                          <strong>Mute all popups</strong>
                          <small>Keep the bell count, but suppress toast, sound and browser popups.</small>
                        </span>
                        <input
                          type="checkbox"
                          checked={messagingSettings.muteAllNotifications}
                          onChange={(event) => updateMessagingSettings({ muteAllNotifications: event.target.checked })}
                        />
                      </label>
                    </section>
                  )}

                  {settingsTab === "BLOCKED" && (
                    <section className="message-settings-section">
                      <div className="message-settings-summary">
                        <strong>{blockedAccounts.length}</strong>
                        <span>blocked private contact{blockedAccounts.length === 1 ? "" : "s"}</span>
                      </div>

                      {blockSettingsNotice && (
                        <p className="message-settings-success">{blockSettingsNotice}</p>
                      )}

                      {blockSettingsError && (
                        <p className="message-settings-danger-note">{blockSettingsError}</p>
                      )}

                      {blockedAccountsLoading ? (
                        <p className="message-settings-empty">Loading blocked accounts...</p>
                      ) : blockedAccounts.length === 0 ? (
                        <p className="message-settings-empty">No blocked private contacts.</p>
                      ) : (
                        <div className="message-settings-blocked-list">
                          {blockedAccounts.map((block) => (
                            <article key={block.blockedAccountId}>
                              {renderAccountAvatar(block.account, "message-avatar small")}
                              <div>
                                <strong>{block.account.displayName}</strong>
                                <small>Private messages and personal group invites blocked</small>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleUnblockAccount(block.blockedAccountId)}
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
                          {blockedMessageRequests.length} old blocked request{blockedMessageRequests.length === 1 ? "" : "s"} remain in history.
                        </p>
                      )}

                      <p className="message-settings-note">
                        Blocking is hierarchy-safe: it affects private chat and new personal group invites only. Existing group messages, official groups, announcements and authority messages remain available.
                      </p>
                    </section>
                  )}

                  {settingsTab === "SECURITY" && (
                    <section className="message-settings-section">
                      <div className="message-settings-security-card">
                        <span>Signed-in account</span>
                        <strong>{account?.username ?? "NT Message User"}</strong>
                        <small>{account ? roleLabel(account.role) : "Employee"} · {realtimeLabel}</small>
                      </div>

                      <div className="message-settings-actions">
                        <button
                          type="button"
                          onClick={clearLocalMessagingPreferences}
                        >
                          Reset local settings
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={handleLogout}
                          disabled={loggingOut}
                        >
                          {loggingOut ? "Signing out..." : "Sign out this session"}
                        </button>
                      </div>

                      <p className="message-settings-note">
                        Current session termination is available through sign out. Multi-session review and password rotation need auth API support.
                      </p>
                    </section>
                  )}
                </div>

                <button
                  type="button"
                  className="message-settings-reset"
                  onClick={resetMessagingSettings}
                >
                  Reset local alert settings
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="message-starred-topbar-button"
            onClick={() => navigate("/messages/starred")}
          >
            Starred
          </button>

          {account?.role !== "EMPLOYEE" && (
            <DirectoryButton />
          )}

          <div className="message-notification-wrapper">
            <button
              type="button"
              className="message-notification-button"
              onClick={() => setNotificationPanelOpen((value) => !value)}
              aria-label="Open notifications"
            >
              🔔
              {notificationUnreadCount > 0 && (
                <b>{notificationUnreadCount > 99 ? "99+" : notificationUnreadCount}</b>
              )}
            </button>

            {notificationPanelOpen && (
              <div className="message-notification-panel">
                <div className="message-notification-panel-header">
                  <strong>Notifications</strong>
                  <div className="message-notification-header-actions">
                    <button
                      type="button"
                      onClick={() => void handleMarkAllNotificationsRead()}
                      disabled={notificationUnreadCount === 0}
                    >
                      Mark all read
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteReadNotifications()}
                      disabled={!notifications.some((notification) => notification.isRead)}
                    >
                      Remove seen
                    </button>
                  </div>
                </div>

                <div className="message-notification-settings">
                  <button
                    type="button"
                    onClick={() => setNotificationSoundEnabled((value) => !value)}
                  >
                    Sound: {notificationSoundEnabled ? "On" : "Off"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleBrowserNotificationToggle()}
                  >
                    Browser: {browserNotificationsEnabled ? "On" : "Off"}
                  </button>
                </div>

                {notificationsLoading && (
                  <p className="message-notification-empty">Loading notifications...</p>
                )}

                {notificationError && (
                  <p className="message-notification-error">{notificationError}</p>
                )}

                {!notificationsLoading && notifications.length === 0 && (
                  <p className="message-notification-empty">No notifications yet.</p>
                )}

                <div className="message-notification-list">
                  {notifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      className={`message-notification-row${notification.isRead ? "" : " unread"}`}
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
                      <span
                        role="button"
                        tabIndex={0}
                        className="message-notification-delete"
                        aria-label="Remove notification"
                        onClick={(event) => void handleDeleteNotification(notification, event)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            void handleDeleteNotification(notification);
                          }
                        }}
                      >
                        ×
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            className="message-app-logout"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </header>

      {notificationToast && (
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
      )}

      <section
        className={`message-workspace${
          selectedConversation ? " conversation-open" : ""
        }`}
      >
        <aside className="message-sidebar">
          <div className="message-sidebar-heading">
            <div>
              <span>Messages</span>
              <h1>Conversations</h1>
            </div>

            <div className="message-sidebar-actions">
              <button
                type="button"
                className="message-search-mini-button"
                onClick={() => openSearchDialog("GLOBAL")}
              >
                Search
              </button>

              <button
                type="button"
                className="message-requests-button"
                onClick={openMessageRequests}
              >
                Requests
                {messageRequests.counts.receivedPending > 0 && (
                  <b>{messageRequests.counts.receivedPending}</b>
                )}
              </button>

              <button
                type="button"
                className="message-group-new-button"
                onClick={openCreateGroup}
              >
                Group
              </button>

              <button
                type="button"
                className="message-new-button"
                onClick={openNewConversation}
                aria-label="Start a new private conversation"
              >
                +
              </button>
            </div>
          </div>

          <label className="message-conversation-search">
            <span className="sr-only">Search conversations</span>
            <input
              type="search"
              value={conversationSearch}
              onChange={(event) => setConversationSearch(event.target.value)}
              placeholder="Search conversations"
            />
          </label>

          <div className="message-conversation-view-tabs" aria-label="Conversation view">
            {(["ACTIVE", "ARCHIVED"] as ConversationListView[]).map((view) => (
              <button
                key={view}
                type="button"
                className={conversationListView === view ? "active" : ""}
                onClick={() => setConversationListView(view)}
              >
                {view === "ACTIVE" ? "Active" : "Archived"}
              </button>
            ))}
          </div>

          <div className="message-sidebar-summary">
            <span>{conversations.length} conversations</span>
            <span>{totalUnread} unread</span>
          </div>

          {requestNotice && (
            <div className="message-inline-notice">
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

          {pageError && (
            <div className="message-inline-error">
              <p>{pageError}</p>
              <button
                type="button"
                onClick={() => void loadConversations()}
              >
                Retry
              </button>
            </div>
          )}

          <div className="message-conversation-list">
            {conversationLoading ? (
              <div className="message-list-state">
                <span className="message-small-spinner" />
                <p>Loading conversations...</p>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="message-list-state">
                <div className="message-empty-icon">M</div>
                <h2>No conversations found</h2>
                <p>
                  Start a private conversation or create a group.
                </p>
                <button
                  type="button"
                  onClick={openNewConversation}
                >
                  New conversation
                </button>
              </div>
            ) : (
              filteredConversations.map((conversation) => {
                const conversationPeer = conversation.type === "PRIVATE"
                  ? conversation.participants.find(
                      (participant) => participant.accountId !== account?.id,
                    )
                  : undefined;
                const title = conversation.title ?? "Private conversation";

                return (
                  <button
                    type="button"
                    key={conversation.id}
                    className={`message-conversation-row${
                      conversation.id === selectedConversationId
                        ? " active"
                        : ""
                    }`}
                    onClick={() => setSelectedConversationId(conversation.id)}
                  >
                    <span className="message-avatar-presence">
                      {conversationPeer
                        ? renderAccountAvatar(conversationPeer)
                        : renderGroupAvatar(conversation)}

                      {conversationPeer?.showOnlineStatus !== false &&
                        conversationPeer &&
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
                        <small>
                          {messagePreview(conversation, account?.id ?? "")}
                        </small>

                        {conversation.unreadCount > 0 && (
                          <b>
                            {conversation.unreadCount > 99
                              ? "99+"
                              : conversation.unreadCount}
                          </b>
                        )}
                      </span>

                      <span className="message-conversation-meta">
                        {conversation.isPinned && <span title="Pinned conversation">📌</span>}
                        {conversation.isMuted && <span title="Muted conversation">🔕</span>}
                        {conversation.draftText && <span title="Draft message">Draft</span>}
                        {conversation.type === "GROUP"
                          ? `${conversation.memberCount} members · ${
                              conversation.groupKind === "OFFICIAL"
                                ? officialScopeLabel(conversation)
                                : "Personal group"
                            }`
                          : conversationPeer?.employee?.designation ??
                            roleLabel(conversationPeer?.role ?? "EMPLOYEE")}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="message-chat-panel">
          {!selectedConversation ? (
            <div className="message-welcome-state">
              <div className="message-welcome-mark">NT</div>
              <span>Secure messaging</span>
              <h2>Select a conversation</h2>
              <p>
                Choose a private conversation or group, or start a new secure message.
              </p>
              <button
                type="button"
                onClick={openNewConversation}
              >
                Start conversation
              </button>
            </div>
          ) : (
            <>
              <header className="message-chat-header">
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
                    renderGroupAvatar(selectedConversation, "message-avatar large")
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

                <div>
                  <h2>
                    {selectedConversation.title ?? "Private conversation"}
                  </h2>
                  <p>
                    {selectedConversation.type === "GROUP"
                      ? selectedConversation.description ||
                        (selectedConversation.groupKind === "OFFICIAL"
                          ? officialScopeLabel(selectedConversation)
                          : "Personal group")
                      : `${
                          peer?.employee?.designation ??
                          roleLabel(peer?.role ?? "EMPLOYEE")
                        }${
                          peer?.employee?.department?.name
                            ? ` · ${peer.employee.department.name}`
                            : peer?.employee?.division?.name
                              ? ` · ${peer.employee.division.name}`
                              : ""
                        }`}
                  </p>
                  <small
                    className={`message-peer-activity${
                      typingParticipants.length > 0
                        ? " typing"
                        : peer?.showOnlineStatus !== false && peerPresence?.isOnline
                          ? " online"
                          : ""
                    }`}
                    aria-live="polite"
                  >
                    {peerActivityLabel}
                  </small>
                </div>

                <button
                  type="button"
                  className="message-search-open-button"
                  onClick={() => openSearchDialog("CURRENT")}
                >
                  Search
                </button>

                <button
                  type="button"
                  className="message-shared-open-button"
                  onClick={() => void openSharedContentDialog()}
                >
                  Shared
                </button>

                <div className="message-conversation-controls" aria-label="Conversation controls">
                  <button
                    type="button"
                    onClick={() => void handleConversationPinnedToggle()}
                    disabled={conversationPreferenceLoading === selectedConversation.id}
                  >
                    {selectedConversation.isPinned ? "Unpin chat" : "Pin chat"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConversationUnreadToggle()}
                    disabled={conversationPreferenceLoading === selectedConversation.id}
                  >
                    {selectedConversation.isMarkedUnread || selectedConversation.unreadCount > 0
                      ? "Mark read"
                      : "Mark unread"}
                  </button>
                  <select
                    value={selectedConversation.isMuted
                      ? selectedConversation.mutedUntil
                        ? "8_HOURS"
                        : "ALWAYS"
                      : "OFF"}
                    onChange={(event) => void handleConversationMuteChange(
                      event.target.value as ConversationMuteSetting,
                    )}
                    disabled={conversationPreferenceLoading === selectedConversation.id}
                    aria-label="Mute conversation"
                  >
                    <option value="OFF">Unmuted</option>
                    <option value="8_HOURS">Mute 8h</option>
                    <option value="1_WEEK">Mute 1w</option>
                    <option value="ALWAYS">Mute always</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleConversationArchiveToggle()}
                    disabled={conversationPreferenceLoading === selectedConversation.id}
                  >
                    {selectedConversation.isArchived ? "Unarchive" : "Archive"}
                  </button>
                </div>

                {selectedConversation.type === "GROUP" ? (
                  <button
                    type="button"
                    className="message-group-info-button"
                    onClick={openManageGroup}
                  >
                    Group info
                  </button>
                ) : (
                  <button
                    type="button"
                    className="message-group-info-button"
                    onClick={() => openProfile(peer?.accountId)}
                  >
                    View profile
                  </button>
                )}
              </header>

              {messageError && (
                <div className="message-chat-error">
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
                <div className="message-chat-notice">
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

              {pinnedMessages.length > 0 && (
                <section className="message-pinned-panel" aria-label="Pinned messages">
                  <div>
                    <strong>Pinned messages</strong>
                    <span>{pinnedMessages.length} pinned</span>
                  </div>

                  {pinnedMessages.slice(0, 3).map((pinnedMessage) => (
                    <button
                      key={pinnedMessage.id}
                      type="button"
                      onClick={() => focusPinnedMessage(pinnedMessage)}
                    >
                      <span>📌</span>
                      <small>{attachmentLabel(pinnedMessage)}</small>
                    </button>
                  ))}
                </section>
              )}

              <div
                className="message-thread"
                ref={messageListRef}
              >
                {hasOlderMessages && (
                  <button
                    type="button"
                    className="message-load-older"
                    onClick={() => void handleLoadOlderMessages()}
                    disabled={olderMessagesLoading}
                  >
                    {olderMessagesLoading
                      ? "Loading..."
                      : "Load older messages"}
                  </button>
                )}

                {messageLoading ? (
                  <div className="message-thread-state">
                    <span className="message-small-spinner" />
                    <p>Loading messages...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="message-thread-state">
                    <div className="message-empty-icon">Hi</div>
                    <h3>Start the conversation</h3>
                    <p>
                      Send the first message to {selectedConversation.title}.
                    </p>
                  </div>
                ) : (
                  messages.map((message) => {
                    const ownMessage = message.senderAccountId === account?.id;

                    return (
                      <article
                        key={message.id}
                        data-message-id={message.id}
                        className={`message-bubble-row${
                          ownMessage ? " own" : ""
                        }${highlightedMessageId === message.id ? " search-highlight" : ""}`}
                      >
                        {!ownMessage && renderAccountAvatar(message.sender, "message-avatar small")}

                        <div className="message-bubble-wrap">
                          {!ownMessage && (
                            <strong className="message-sender-name">
                              {message.sender.displayName}
                            </strong>
                          )}

                          <div className="message-bubble">
                            {!message.isDeleted && (message.isStarred || message.isPinned) && (
                              <div className="message-state-badges" aria-label="Message state">
                                {message.isPinned && <span>📌 Pinned</span>}
                                {message.isStarred && <span>★ Starred</span>}
                              </div>
                            )}

                            {message.forwardedFrom && !message.isDeleted && (
                              <div className="message-forwarded-label">
                                <strong>Forwarded</strong>
                                <span>
                                  Originally from {message.forwardedFrom.originalSenderDisplayName}
                                </span>
                              </div>
                            )}

                            {message.replyTo && !message.isDeleted && (
                              <div className="message-reply-preview">
                                <strong>
                                  {message.replyTo.senderAccountId === account?.id
                                    ? "You"
                                    : message.replyTo.sender.displayName}
                                </strong>
                                <span>
                                  {message.replyTo.isDeleted
                                    ? "This message was deleted"
                                    : message.replyTo.textContent ?? "Message"}
                                </span>

                              </div>
                            )}

                            {message.isDeleted ? (
                              <em>This message was deleted.</em>
                            ) : (
                              <>
                                {message.textContent && message.contentType !== "LOCATION" && (
                                  <p>{renderMessageTextWithMentions(message)}</p>
                                )}

                                {message.contentType === "LOCATION" && (
                                  <LocationMessageCard
                                    message={message}
                                    viewerAccountId={account?.id}
                                    stopping={
                                      locationActionLoading === "STOP" &&
                                      (activeLiveLocation?.messageId === message.id ||
                                        message.senderAccountId === account?.id)
                                    }
                                    onStop={(selected) => void handleStopLiveLocation(selected)}
                                  />
                                )}

                                {(message.attachments?.length ?? 0) > 0 && (
                                  <div className="message-attachments">
                                    {(message.attachments ?? []).map((attachment) => (
                                      <MessageAttachmentCard
                                        key={attachment.id}
                                        accessToken={accessToken}
                                        conversationId={message.conversationId}
                                        messageId={message.id}
                                        attachment={attachment}
                                        onDownload={(selected) => void handleDownloadAttachment(
                                          message,
                                          selected,
                                        )}
                                        onPreview={(selected) => void handlePreviewAttachment(
                                          message,
                                          selected,
                                        )}
                                      />
                                    ))}
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
                                        aria-label={`${reactionGroup.emoji} reaction from ${reactionGroup.count} participant${
                                          reactionGroup.count === 1 ? "" : "s"
                                        }`}
                                        onClick={() => void handleReaction(
                                          message,
                                          reactionGroup.emoji,
                                        )}
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


                          <div className="message-bubble-actions">

                            {!message.isDeleted && (
                              <div
                                className="message-quick-reactions"
                                aria-label="Message reactions"
                              >
                                {QUICK_REACTIONS.map((emoji) => {
                                  const viewerReaction = getViewerReaction(
                                    message,
                                    account?.id,
                                  );
                                  const isSelected = viewerReaction === emoji;

                                  return (
                                    <button
                                      key={emoji}
                                      type="button"
                                      className={
                                        isSelected
                                          ? "message-quick-reaction is-selected"
                                          : "message-quick-reaction"
                                      }
                                      onClick={() => void handleReaction(
                                        message,
                                        emoji,
                                      )}
                                      disabled={
                                        messageActionId !== null ||
                                        reactionActionId !== null
                                      }
                                      aria-pressed={isSelected}
                                      title={
                                        isSelected
                                          ? "Remove reaction"
                                          : `React with ${emoji}`
                                      }
                                    >
                                      {emoji}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {!message.isDeleted && (
                              <button
                                type="button"
                                onClick={() => void handleStarMessage(message)}
                                disabled={messageActionId !== null}
                                aria-pressed={message.isStarred}
                              >
                                {messageActionId === message.id && messageActionMode === null
                                  ? "Saving..."
                                  : message.isStarred
                                    ? "Unstar"
                                    : "Star"}
                              </button>
                            )}

                            {!message.isDeleted && (
                              <button
                                type="button"
                                onClick={() => void handlePinMessage(message)}
                                disabled={pinActionId !== null}
                                aria-pressed={message.isPinned}
                              >
                                {pinActionId === message.id
                                  ? "Saving..."
                                  : message.isPinned
                                    ? "Unpin"
                                    : "Pin"}
                              </button>
                            )}

                            {ownMessage && (
                              <button
                                type="button"
                                onClick={() => void handleViewMessageInformation(message)}
                                disabled={messageInformationLoadingId !== null}
                              >
                                {messageInformationLoadingId === message.id
                                  ? "Loading..."
                                  : "Info"}
                              </button>
                            )}

                            {!message.isDeleted && message.textContent && (
                              <button
                                type="button"
                                onClick={() => void handleCopyMessage(message)}
                                disabled={messageActionId !== null}
                              >
                                Copy
                              </button>
                            )}

                            {canForwardMessage(message) && (
                              <button
                                type="button"
                                onClick={() => beginForward(message)}
                                disabled={messageActionId !== null}
                              >
                                Forward
                              </button>
                            )}

                            {!message.isDeleted && (
                              <button
                                type="button"
                                onClick={() => beginReply(message)}
                                disabled={messageActionId !== null}
                              >
                                Reply
                              </button>
                            )}

                            {ownMessage && canEditMessage(message, account?.id) && (
                              <button
                                type="button"
                                onClick={() => beginEdit(message)}
                                disabled={messageActionId !== null}
                              >
                                Edit
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => void handleDeleteMessageForMe(message)}
                              disabled={messageActionId !== null}
                            >
                              {messageActionId === message.id &&
                              messageActionMode === "ME"
                                ? "Deleting..."
                                : "Delete for me"}
                            </button>

                            {ownMessage && !message.isDeleted && (
                              <button
                                type="button"
                                className="danger"
                                onClick={() => void handleDeleteMessageForEveryone(message)}
                                disabled={messageActionId !== null}
                              >
                                {messageActionId === message.id &&
                                messageActionMode === "EVERYONE"
                                  ? "Deleting..."
                                  : "Delete for everyone"}
                              </button>
                            )}
                          </div>

                          <div className="message-bubble-meta">
                            <time>{formatMessageTime(message.sentAt)}</time>

                            {message.editedAt && !message.isDeleted && (
                              <span>Edited</span>
                            )}

                            {ownMessage && (
                              <span className={`message-delivery ${message.deliveryStatus.toLowerCase()}`}>
                                {message.deliveryStatus === "READ"
                                  ? "Read"
                                  : message.deliveryStatus === "DELIVERED"
                                    ? "Delivered"
                                    : "Sent"}
                              </span>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}

                {typingParticipants.length > 0 && (
                  <div
                    className="message-typing-indicator"
                    aria-live="polite"
                  >
                    <span className="message-avatar small">
                      {initials(typingParticipants[0].displayName)}
                    </span>
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
                          : `Replying to ${
                              replyingTo?.senderAccountId === account?.id
                                ? "yourself"
                                : replyingTo?.sender.displayName ?? "message"
                            }`}
                      </strong>
                      <small>
                        {(editingMessage ?? replyingTo)?.textContent ?? "Message"}
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

                {selectedAttachment && (
                  <div className="message-selected-attachment">
                    {attachmentPreviewUrl && selectedAttachment.type.startsWith("image/") && (
                      <img
                        src={attachmentPreviewUrl}
                        alt={selectedAttachment.name}
                      />
                    )}

                    {attachmentPreviewUrl && selectedAttachment.type.startsWith("video/") && (
                      <video
                        src={attachmentPreviewUrl}
                        muted
                        playsInline
                        preload="metadata"
                      />
                    )}

                    {attachmentPreviewUrl && selectedAttachment.type.startsWith("audio/") && (
                      <div className="message-selected-audio">
                        <span aria-hidden="true">♪</span>
                        <audio src={attachmentPreviewUrl} controls preload="metadata">
                          Your browser does not support audio playback.
                        </audio>
                      </div>
                    )}

                    <span>
                      <strong>{selectedAttachmentKind === "VOICE_NOTE" ? "Voice note" : selectedAttachment.name}</strong>
                      <small>{formatFileSize(selectedAttachment.size)}</small>
                    </span>

                    <button
                      type="button"
                      onClick={clearSelectedAttachment}
                      aria-label="Remove selected attachment"
                    >
                      ×
                    </button>
                  </div>
                )}

                {voiceRecordingState !== "IDLE" && (
                  <div className="message-voice-recorder-bar">
                    <span className="message-recording-dot" aria-hidden="true" />
                    <strong>{voiceRecordingState === "STOPPING" ? "Preparing voice note" : "Recording voice note"}</strong>
                    <small>{formatRecordingDuration(voiceRecordingSeconds)}</small>
                    <button
                      type="button"
                      onClick={finishVoiceRecording}
                      disabled={voiceRecordingState !== "RECORDING"}
                    >
                      Stop
                    </button>
                    <button
                      type="button"
                      onClick={cancelVoiceRecording}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept={ACCEPTED_ATTACHMENT_TYPES}
                  className="message-attachment-input"
                  onChange={handleAttachmentChange}
                  disabled={sendingMessage || editingMessage !== null || voiceRecordingState !== "IDLE"}
                  aria-label="Choose attachment"
                />

                {mentionSuggestions.length > 0 && activeMentionQuery && (
                  <div className="message-mention-suggestions" role="listbox" aria-label="Mention group member">
                    {mentionSuggestions.map((participant) => (
                      <button
                        key={participant.accountId}
                        type="button"
                        role="option"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleMentionSelect(participant)}
                      >
                        <span className="message-avatar small">
                          {initials(participant.displayName)}
                        </span>
                        <span>
                          <strong>{participant.displayName}</strong>
                          <small>{participant.employee?.designation ?? participant.username ?? "Group member"}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <textarea
                  ref={composerRef}
                  value={messageText}
                  onChange={(event) => {
                    const value = event.target.value;
                    setMessageText(value);
                    setComposerCaretIndex(event.target.selectionStart ?? value.length);

                    if (selectedConversationId) {
                      updateLocalTyping(selectedConversationId, value);
                    }
                  }}
                  onSelect={(event) => {
                    setComposerCaretIndex(event.currentTarget.selectionStart ?? messageText.length);
                  }}
                  onBlur={() => stopLocalTyping(selectedConversationId)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={
                    editingMessage
                      ? "Edit your message"
                      : replyingTo
                        ? "Write a reply"
                        : `Message ${selectedConversation.title ?? "conversation"}`
                  }
                  maxLength={5000}
                  rows={1}
                  disabled={sendingMessage || voiceRecordingState !== "IDLE"}
                  aria-label="Message text"
                />

                <div className="message-composer-actions">
                  <span>
                    Attach image, video, audio or document · Enter to send
                  </span>

                  <button
                    type="button"
                    className="message-location-button"
                    onClick={() => void handleShareCurrentLocation()}
                    disabled={sendingMessage || editingMessage !== null || voiceRecordingState !== "IDLE" || locationActionLoading !== null}
                  >
                    {locationActionLoading === "CURRENT" ? "Sharing..." : "📍 Location"}
                  </button>

                  <label className="message-live-location-control">
                    <span className="sr-only">Live location duration</span>
                    <select
                      onChange={(event) =>
                        setLocationDurationMinutes(Number(event.target.value) as 15 | 60 | 480)
                      }
                      disabled={
                        sendingMessage ||
                        editingMessage !== null ||
                        voiceRecordingState !== "IDLE" ||
                        locationActionLoading !== null
                      }
                      >
                       <option value={15}>15m</option>
                      <option value={60}>1h</option>
                      <option value={480}>8h</option>
                    </select>
                    <button
                      type="button"
                      className="message-live-location-button"
                      onClick={() => void handleStartLiveLocation()}
                      disabled={sendingMessage || editingMessage !== null || voiceRecordingState !== "IDLE" || locationActionLoading !== null || activeLiveLocation !== null}
                    >
                      {locationActionLoading === "LIVE" ? "Starting..." : "Live"}
                    </button>
                  </label>

                  {activeLiveLocation && (
                    <button
                      type="button"
                      className="message-live-stop-button"
                      onClick={() => void handleStopLiveLocation()}
                      disabled={locationActionLoading === "STOP"}
                    >
                      {locationActionLoading === "STOP" ? "Stopping..." : "Stop live"}
                    </button>
                  )}

                  <button
                    type="button"
                    className="message-voice-record-button"
                    onClick={() => void beginVoiceRecording()}
                    disabled={sendingMessage || editingMessage !== null || selectedAttachment !== null || voiceRecordingState !== "IDLE"}
                  >
                    🎙 Voice note
                  </button>

                  <button
                    type="submit"
                    className="message-send-button"
                    disabled={(!messageText.trim() && !selectedAttachment) || sendingMessage || voiceRecordingState !== "IDLE"}
                  >
                    {sendingMessage
                      ? editingMessage
                        ? "Saving..."
                        : "Sending..."
                      : editingMessage
                        ? "Save"
                        : "Send"}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </section>

      {searchDialogOpen && (
        <div
          className="message-contact-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !searchLoading) {
              setSearchDialogOpen(false);
            }
          }}
        >
          <section
            className="message-search-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-search-title"
          >
            <header>
              <div>
                <span>Search and filters</span>
                <h2 id="message-search-title">Find messages</h2>
              </div>

              <button
                type="button"
                onClick={() => setSearchDialogOpen(false)}
                aria-label="Close message search"
                disabled={searchLoading}
              >
                ×
              </button>
            </header>

            <form
              className="message-search-form"
              onSubmit={(event) => void handleMessagingSearch(event)}
            >
              <label>
                <span>Search text</span>
                <input
                  type="search"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Search text, sender or file name"
                  autoFocus
                />
              </label>

              <label>
                <span>Scope</span>
                <select
                  value={searchScope}
                  onChange={(event) => setSearchScope(event.target.value as "CURRENT" | "GLOBAL")}
                >
                  <option value="CURRENT" disabled={!selectedConversationId}>Current conversation</option>
                  <option value="GLOBAL">All conversations</option>
                </select>
              </label>

              <label>
                <span>Message type</span>
                <select
                  value={searchContentType}
                  onChange={(event) => setSearchContentType(event.target.value as "" | MessageContentType)}
                >
                  <option value="">All types</option>
                  <option value="TEXT">Text</option>
                  <option value="IMAGE">Images</option>
                  <option value="VIDEO">Videos</option>
                  <option value="AUDIO">Audio / voice notes</option>
                  <option value="FILE">Documents</option>
                </select>
              </label>

              <label>
                <span>From date</span>
                <input
                  type="date"
                  value={searchDateFrom}
                  onChange={(event) => setSearchDateFrom(event.target.value)}
                />
              </label>

              <label>
                <span>To date</span>
                <input
                  type="date"
                  value={searchDateTo}
                  onChange={(event) => setSearchDateTo(event.target.value)}
                />
              </label>

              <button type="submit" disabled={searchLoading}>
                {searchLoading ? "Searching..." : "Search"}
              </button>
            </form>

            {searchError && (
              <div className="message-inline-error compact">
                <p>{searchError}</p>
              </div>
            )}

            <div className="message-search-results">
              {searchLoading ? (
                <div className="message-list-state compact">
                  <span className="message-small-spinner" />
                  <p>Searching authorized conversations...</p>
                </div>
              ) : searchResults.length === 0 &&
                searchConversationResults.length === 0 &&
                searchContactResults.length === 0 ? (
                <div className="message-list-state compact">
                  <div className="message-empty-icon">S</div>
                  <h3>No search results yet</h3>
                  <p>Enter a keyword or use filters, then press Search.</p>
                </div>
              ) : (
                <>
                  {searchResults.length > 0 && (
                    <section className="message-search-section">
                      <h3>Messages</h3>
                      {searchResults.map((result) => (
                        <button
                          key={result.message.id}
                          type="button"
                          className="message-search-result-row"
                          onClick={() => openSearchMessageResult(result)}
                        >
                          <span className="message-avatar small">
                            {initials(result.message.sender.displayName)}
                          </span>
                          <span>
                            <strong>{result.conversation.title ?? "Conversation"}</strong>
                            <small>{result.snippet}</small>
                            <em>
                              {attachmentLabel(result.message)} · {formatConversationTime(result.message.sentAt)}
                            </em>
                          </span>
                        </button>
                      ))}
                    </section>
                  )}

                  {searchConversationResults.length > 0 && (
                    <section className="message-search-section">
                      <h3>Conversations</h3>
                      {searchConversationResults.map((conversation) => (
                        <button
                          key={conversation.id}
                          type="button"
                          className="message-search-result-row"
                          onClick={() => openSearchConversationResult(conversation)}
                        >
                          <span className="message-avatar small">
                            {initials(conversation.title ?? "NT")}
                          </span>
                          <span>
                            <strong>{conversation.title ?? "Private conversation"}</strong>
                            <small>{conversation.description ?? messagePreview(conversation, account?.id ?? "")}</small>
                          </span>
                        </button>
                      ))}
                    </section>
                  )}

                  {searchContactResults.length > 0 && (
                    <section className="message-search-section">
                      <h3>People</h3>
                      {searchContactResults.map((contact) => (
                        <button
                          key={contact.accountId}
                          type="button"
                          className="message-search-result-row"
                          onClick={() => {
                            setSearchDialogOpen(false);
                            void handleCreateConversation(contact);
                          }}
                          disabled={contact.contactMode === "REQUEST_SENT" || contact.contactMode === "BLOCKED"}
                        >
                          {renderAccountAvatar(contact, "message-avatar small")}
                          <span>
                            <strong>{contact.displayName}</strong>
                            <small>{contact.employee?.designation ?? roleLabel(contact.role)}</small>
                            <em>{contactActionLabel(contact)}</em>
                          </span>
                        </button>
                      ))}
                    </section>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {sharedContentOpen && (
        <div className="message-dialog-backdrop" role="presentation">
          <section
            className="message-shared-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-shared-title"
          >
            <header>
              <div>
                <span>Shared content</span>
                <h2 id="message-shared-title">Media, documents and links</h2>
              </div>
              <button
                type="button"
                onClick={closeSharedContentDialog}
                aria-label="Close shared content"
              >
                ×
              </button>
            </header>

            <div className="message-shared-tabs" role="tablist" aria-label="Shared content views">
              {([
                ["MEDIA", `Media (${sharedContent?.media.length ?? 0})`],
                ["DOCUMENTS", `Documents (${sharedContent?.documents.length ?? 0})`],
                ["LINKS", `Links (${sharedContent?.links.length ?? 0})`],
              ] as Array<[SharedContentTab, string]>).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  className={sharedContentTab === tab ? "active" : undefined}
                  onClick={() => setSharedContentTab(tab)}
                  aria-pressed={sharedContentTab === tab}
                >
                  {label}
                </button>
              ))}
            </div>

            {sharedContentLoading ? (
              <div className="message-shared-state">
                <strong>Loading shared content...</strong>
                <p>Checking authorized media, documents and links.</p>
              </div>
            ) : sharedContentError ? (
              <div className="message-shared-state">
                <strong>Shared content unavailable</strong>
                <p>{sharedContentError}</p>
                <button type="button" onClick={() => void openSharedContentDialog(sharedContentTab)}>
                  Retry
                </button>
              </div>
            ) : sharedContentTab === "MEDIA" ? (
              <div className="message-shared-grid">
                {(sharedContent?.media ?? []).length === 0 ? (
                  <div className="message-shared-state">
                    <strong>No media yet</strong>
                    <p>Photos and videos shared in this conversation will appear here.</p>
                  </div>
                ) : (
                  sharedContent?.media.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="message-shared-media-card"
                      onClick={() => focusSharedContentMessage(item.message)}
                    >
                      <span>{isImageAttachment(item.attachment) ? "Photo" : "Video"}</span>
                      <strong>{item.attachment.originalFileName}</strong>
                      <small>{item.sender.displayName} · {formatConversationTime(item.sharedAt)}</small>
                    </button>
                  ))
                )}
              </div>
            ) : sharedContentTab === "DOCUMENTS" ? (
              <div className="message-shared-list">
                {(sharedContent?.documents ?? []).length === 0 ? (
                  <div className="message-shared-state">
                    <strong>No documents yet</strong>
                    <p>Files shared in this conversation will appear here.</p>
                  </div>
                ) : (
                  sharedContent?.documents.map((item) => (
                    <article key={item.id} className="message-shared-document-row">
                      <button type="button" onClick={() => focusSharedContentMessage(item.message)}>
                        <span>{documentIcon(item.attachment)}</span>
                        <span>
                          <strong>{item.attachment.originalFileName}</strong>
                          <small>
                            {attachmentTypeLabel(item.attachment)} · {formatFileSize(item.attachment.fileSizeBytes)} · {item.sender.displayName}
                          </small>
                          <em>{formatConversationTime(item.sharedAt)}</em>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDownloadAttachment(item.message, item.attachment)}
                      >
                        Download
                      </button>
                    </article>
                  ))
                )}
              </div>
            ) : (
              <div className="message-shared-list">
                {(sharedContent?.links ?? []).length === 0 ? (
                  <div className="message-shared-state">
                    <strong>No links yet</strong>
                    <p>Links shared in text messages will appear here.</p>
                  </div>
                ) : (
                  sharedContent?.links.map((item) => (
                    <article key={`${item.message.id}:${item.url}`} className="message-shared-link-row">
                      <button type="button" onClick={() => focusSharedContentMessage(item.message)}>
                        <strong>{item.label}</strong>
                        <small>{item.sender.displayName} · {formatConversationTime(item.sharedAt)}</small>
                      </button>
                      <a href={item.url} target="_blank" rel="noreferrer">Open</a>
                    </article>
                  ))
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {profileAccountId && (
        <div
          className="message-contact-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closeProfile();
            }
          }}
        >
          <section
            className="message-profile-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-profile-title"
          >
            <header>
              <div>
                <span>User profile</span>
                <h2 id="message-profile-title">
                  {profileData?.displayName ?? "Profile"}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeProfile}
                aria-label="Close profile dialog"
              >
                ×
              </button>
            </header>

            {profileLoading ? (
              <div className="message-list-state compact">
                <span className="message-small-spinner" />
                <p>Loading profile...</p>
              </div>
            ) : profileError && !profileData ? (
              <div className="message-inline-error compact">
                <p>{profileError}</p>
              </div>
            ) : profileData ? (
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
                  <div className="message-inline-error compact">
                    <p>{profileError}</p>
                  </div>
                )}

                <section className="message-profile-section">
                  <h3>About</h3>

                  {profileData.isOwnProfile ? (
                    <>
                      <textarea
                        value={profileBioDraft}
                        onChange={(event) => setProfileBioDraft(event.target.value.slice(0, 160))}
                        maxLength={160}
                        placeholder="Add a short about message"
                      />
                      <div className="message-profile-actions">
                        <small>{profileBioDraft.length}/160</small>
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
                    <h3>Profile photo</h3>
                    <div className="message-profile-photo-controls">
                      <label className="message-profile-photo-upload">
                        <span>{profilePhotoUploading ? "Uploading..." : profileData.profilePhotoKey ? "Change photo" : "Upload JPG, PNG or WEBP"}</span>
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
                  <h3>Official information</h3>
                  <dl className="message-profile-details">
                    <div>
                      <dt>Employee ID</dt>
                      <dd>{profileData.official?.employeeId ?? "System account"}</dd>
                    </div>
                    <div>
                      <dt>Official email</dt>
                      <dd>{profileData.official?.officialEmail ?? profileData.username ?? "—"}</dd>
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
                    Official identity fields are managed through the approved account workflow.
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
                              {group.groupKind === "OFFICIAL" ? "Official" : "Personal"} · {group.memberCount} members
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
                          onClick={() => void handleBlockAccount(profileData)}
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
            ) : null}
          </section>
        </div>
      )}

      {newConversationOpen && (
        <div
          className="message-contact-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setNewConversationOpen(false);
            }
          }}
        >
          <section
            className="message-contact-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-conversation-title"
          >
            <header>
              <div>
                <span>Private message</span>
                <h2 id="new-conversation-title">
                  Start a conversation
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setNewConversationOpen(false)}
                aria-label="Close new conversation dialog"
              >
                ×
              </button>
            </header>

            <label className="message-contact-search">
              <span>Find an eligible NT account</span>
              <input
                type="search"
                value={contactSearch}
                onChange={(event) => setContactSearch(event.target.value)}
                placeholder="Search by name, employee ID, username or designation"
                autoFocus
              />
            </label>

            {contactError && (
              <div className="message-inline-error compact">
                <p>{contactError}</p>
              </div>
            )}

            <div className="message-contact-list">
              {contactsLoading ? (
                <div className="message-list-state compact">
                  <span className="message-small-spinner" />
                  <p>Searching accounts...</p>
                </div>
              ) : contacts.length === 0 ? (
                <div className="message-list-state compact">
                  <div className="message-empty-icon">?</div>
                  <h3>No eligible accounts found</h3>
                  <p>Try another name, employee ID or username.</p>
                </div>
              ) : (
                contacts.map((contact) => (
                  <button
                    type="button"
                    key={contact.accountId}
                    className="message-contact-row"
                    onClick={() => void handleCreateConversation(contact)}
                    disabled={
                      creatingConversationId !== null ||
                      contact.contactMode === "REQUEST_SENT" ||
                      contact.contactMode === "BLOCKED"
                    }
                  >
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
                      {contact.requestReason &&
                        contact.contactMode !== "DIRECT" && (
                          <i>
                            {requestReasonLabel(contact.requestReason)}
                          </i>
                        )}
                    </span>

                    <b>
                      {creatingConversationId === contact.accountId
                        ? "Opening..."
                        : contactActionLabel(contact)}
                    </b>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {groupDialogMode && (
        <div
          className="message-contact-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closeGroupDialog();
            }
          }}
        >
          <section
            className="message-contact-dialog message-group-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-dialog-title"
          >
            <header>
              <div>
                <span>
                  {groupDialogMode === "CREATE"
                    ? groupKind === "OFFICIAL"
                      ? "Official group"
                      : "Personal group"
                    : selectedConversation?.groupKind === "OFFICIAL"
                      ? "Official organizational group"
                      : "Group settings"}
                </span>
                <h2 id="group-dialog-title">
                  {groupDialogMode === "CREATE"
                    ? groupKind === "OFFICIAL"
                      ? "Create an official group"
                      : "Create a group"
                    : selectedConversation?.title ?? "Group info"}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeGroupDialog}
                disabled={groupSubmitting || groupActionAccountId !== null}
                aria-label="Close group dialog"
              >
                ×
              </button>
            </header>

            {groupError && (
              <div className="message-inline-error compact">
                <p>{groupError}</p>
              </div>
            )}

            <div className="message-group-dialog-body">
              {groupDialogMode === "CREATE" && canCreateOfficialGroup && (
                <section className="message-group-kind-section">
                  <header>
                    <h3>Group category</h3>
                    <span>Choose how membership is controlled</span>
                  </header>

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
                      <small>Select members manually.</small>
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

                        if (defaultScope) {
                          setOfficialGroupScopeKey(defaultScope.key);
                          setGroupTitle((current) => (
                            current.trim()
                              ? current
                              : defaultScope.defaultTitle
                          ));
                        }

                        setGroupError(null);
                      }}
                      disabled={groupSubmitting || officialGroupScopesLoading}
                    >
                      <strong>Official</strong>
                      <small>Membership follows organization assignments.</small>
                    </button>
                  </div>

                  {groupKind === "OFFICIAL" && (
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
                      <small>
                        Eligible active accounts are added automatically and synchronized after activation, transfer, suspension, or role changes.
                      </small>
                    </label>
                  )}
                </section>
              )}

              {groupDialogMode === "MANAGE" &&
                selectedConversation?.groupKind === "OFFICIAL" && (
                  <section className="message-official-scope-card">
                    <span>Official scope</span>
                    <strong>{officialScopeLabel(selectedConversation)}</strong>
                    <small>
                      Membership and group roles are synchronized from active Nepal Telecom assignments.
                    </small>
                  </section>
                )}

              {(groupDialogMode === "CREATE" ||
                selectedConversation?.canManageGroup) && (
                <section className="message-group-details">
                  {groupDialogMode === "MANAGE" && selectedConversation?.type === "GROUP" && (
                    <div className="message-group-photo-card">
                      {renderGroupAvatar(selectedConversation, "message-group-photo-preview")}

                      <div className="message-group-photo-copy">
                        <strong>Group photo</strong>
                        <small>JPG, PNG or WEBP. Maximum 5 MB.</small>
                        <div className="message-group-photo-actions">
                          <input
                            ref={groupPhotoInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            hidden
                            onChange={(event) => void handleGroupPhotoChange(event)}
                          />

                          <button
                            type="button"
                            className="primary"
                            onClick={() => groupPhotoInputRef.current?.click()}
                            disabled={groupPhotoUploading || groupSubmitting}
                          >
                            {groupPhotoUploading
                              ? "Uploading..."
                              : selectedConversation.groupPhotoKey
                                ? "Change photo"
                                : "Upload photo"}
                          </button>

                          {selectedConversation.groupPhotoKey && (
                            <button
                              type="button"
                              className="danger"
                              onClick={() => void handleRemoveGroupPhoto()}
                              disabled={groupPhotoUploading || groupSubmitting}
                            >
                              Remove photo
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <label>
                    <span>Group name</span>
                    <input
                      type="text"
                      value={groupTitle}
                      onChange={(event) => setGroupTitle(event.target.value)}
                      maxLength={150}
                      placeholder="Enter a group name"
                      autoFocus={groupDialogMode === "CREATE"}
                    />
                  </label>

                  <label>
                    <span>Description</span>
                    <textarea
                      value={groupDescription}
                      onChange={(event) => setGroupDescription(event.target.value)}
                      maxLength={500}
                      rows={2}
                      placeholder="Optional group description"
                    />
                  </label>

                  {groupDialogMode === "MANAGE" && (
                    <button
                      type="button"
                      className="message-group-primary"
                      onClick={() => void handleSaveGroupDetails()}
                      disabled={!groupTitle.trim() || groupSubmitting}
                    >
                      {groupSubmitting ? "Saving..." : "Save group details"}
                    </button>
                  )}
                </section>
              )}

              {groupDialogMode === "MANAGE" &&
                selectedConversation?.type === "GROUP" && (
                  <section className="message-group-members-section">
                    <header>
                      <h3>Members</h3>
                      <span>{selectedConversation.memberCount}</span>
                    </header>

                    {selectedConversation.groupKind === "OFFICIAL" && (
                      <p className="message-group-sync-note">
                        Members and administrator roles are read-only because they follow active organizational assignments.
                      </p>
                    )}

                    <div className="message-group-member-list">
                      {selectedConversation.participants.map((participant) => {
                        const isViewer = participant.accountId === account?.id;
                        const viewerRole = selectedConversation.viewerParticipantRole;
                        const canChangeRole =
                          selectedConversation.groupKind === "PERSONAL" &&
                          viewerRole === "OWNER" &&
                          participant.participantRole !== "OWNER" &&
                          !isViewer;
                        const canRemove =
                          selectedConversation.groupKind === "PERSONAL" &&
                          selectedConversation.canManageGroup &&
                          participant.participantRole !== "OWNER" &&
                          !isViewer &&
                          (viewerRole === "OWNER" ||
                            participant.participantRole === "MEMBER");

                        return (
                          <article
                            key={participant.accountId}
                            className="message-group-member-row"
                          >
                            {renderAccountAvatar(participant, "message-avatar small")}

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

                            <div className="message-group-member-actions">
                              <button
                                type="button"
                                className="message-group-member-profile"
                                onClick={() => openProfile(participant.accountId)}
                              >
                                Profile
                              </button>

                              {canChangeRole && (
                                <button
                                  type="button"
                                  onClick={() => void handleGroupRoleChange(
                                    participant.accountId,
                                    participant.participantRole === "ADMIN"
                                      ? "MEMBER"
                                      : "ADMIN",
                                  )}
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
                                  onClick={() => void handleRemoveGroupMember(
                                    participant.accountId,
                                  )}
                                  disabled={groupActionAccountId !== null}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}

              {groupDialogMode === "MANAGE" &&
                selectedConversation?.groupKind === "OFFICIAL" &&
                selectedConversation.canManageGroup && (
                  <section className="message-official-audit-section">
                    <header>
                      <div>
                        <h3>Official group audit</h3>
                        <span>Membership and administrator changes</span>
                      </div>

                      {account?.role === "SUPER_ADMIN" && (
                        <button
                          type="button"
                          onClick={() => void handleReconcileOfficialGroups()}
                          disabled={officialGroupReconciling}
                        >
                          {officialGroupReconciling
                            ? "Reconciling..."
                            : "Reconcile all"}
                        </button>
                      )}
                    </header>

                    {officialGroupAuditLoading ? (
                      <div className="message-list-state compact">
                        <span className="message-small-spinner" />
                        <p>Loading audit history...</p>
                      </div>
                    ) : officialGroupAudit.length === 0 ? (
                      <p className="message-group-sync-note">
                        No official group audit entries are available yet.
                      </p>
                    ) : (
                      <div className="message-official-audit-list">
                        {officialGroupAudit.map((entry) => (
                          <article key={entry.id}>
                            <span />
                            <div>
                              <strong>{officialAuditLabel(entry)}</strong>
                              <small>
                                {entry.actor?.displayName ?? "System"} · {new Intl.DateTimeFormat(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                }).format(new Date(entry.createdAt))}
                              </small>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                )}

              {((groupDialogMode === "CREATE" && groupKind === "PERSONAL") ||
                (groupDialogMode === "MANAGE" &&
                  selectedConversation?.groupKind === "PERSONAL" &&
                  selectedConversation.canManageGroup)) && (
                <section className="message-group-add-section">
                  <header>
                    <h3>
                      {groupDialogMode === "CREATE"
                        ? "Choose members"
                        : "Add members"}
                    </h3>
                    <span>{groupSelectedAccountIds.length} selected</span>
                  </header>

                  <label className="message-contact-search">
                    <span>Search active NT accounts</span>
                    <input
                      type="search"
                      value={groupSearch}
                      onChange={(event) => setGroupSearch(event.target.value)}
                      placeholder="Search by name, employee ID or designation"
                    />
                  </label>

                  <div className="message-group-contact-list">
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
                            className={`message-group-contact-row${
                              selected ? " selected" : ""
                            }${!eligible || alreadyMember ? " disabled" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleGroupMember(contact.accountId)}
                              disabled={
                                !eligible ||
                                alreadyMember ||
                                groupSubmitting
                              }
                            />

                            {renderAccountAvatar(contact, "message-avatar small")}

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

                  {groupDialogMode === "MANAGE" && (
                    <button
                      type="button"
                      className="message-group-primary"
                      onClick={() => void handleAddGroupMembers()}
                      disabled={
                        groupSelectedAccountIds.length === 0 ||
                        groupSubmitting
                      }
                    >
                      {groupSubmitting ? "Adding..." : "Add selected members"}
                    </button>
                  )}
                </section>
              )}
            </div>

            <footer className="message-group-dialog-footer">
              {groupDialogMode === "MANAGE" ? (
                selectedConversation?.groupKind === "PERSONAL" ? (
                  <button
                    type="button"
                    className="danger"
                    onClick={() => void handleLeaveGroup()}
                    disabled={groupSubmitting}
                  >
                    {groupSubmitting ? "Leaving..." : "Leave group"}
                  </button>
                ) : (
                  <span>
                    Official membership changes automatically with organizational assignments.
                  </span>
                )
              ) : (
                <span>
                  {groupKind === "OFFICIAL"
                    ? "Official membership is generated from the selected scope."
                    : "Personal groups can include up to 100 active members."}
                </span>
              )}

              <div>
                <button
                  type="button"
                  onClick={closeGroupDialog}
                  disabled={groupSubmitting || groupActionAccountId !== null}
                >
                  Cancel
                </button>

                {groupDialogMode === "CREATE" && (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void handleCreateGroup()}
                    disabled={
                      !groupTitle.trim() ||
                      groupSubmitting ||
                      (groupKind === "PERSONAL" &&
                        groupSelectedAccountIds.length === 0) ||
                      (groupKind === "OFFICIAL" &&
                        !selectedOfficialGroupScope)
                    }
                  >
                    {groupSubmitting
                      ? "Creating..."
                      : groupKind === "OFFICIAL"
                        ? "Create official group"
                        : "Create group"}
                  </button>
                )}
              </div>
            </footer>
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
          >
            <header>
              <div>
                <span>Message action</span>
                <h2 id="forward-message-title">
                  Forward message
                </h2>
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
                      className={`message-forward-row${
                        selected ? " selected" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleForwardDestination(conversation.id)}
                        disabled={
                          forwardSubmitting ||
                          (!selected && forwardDestinationIds.length >= 20)
                        }
                      />

                      <span className="message-avatar small">
                        {initials(conversation.title ?? "NT")}
                      </span>

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
              <span>
                {forwardDestinationIds.length} selected
              </span>
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
                    forwardSubmitting ||
                    forwardDestinationIds.length === 0
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
                  <small>Sent {notificationTimestampLabel(messageInformation.sentAt)}</small>
                </section>

                <section className="message-info-counts" aria-label="Delivery summary">
                  <div>
                    <strong>{messageInformation.summary.totalRecipients}</strong>
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
                      <article key={recipient.accountId} className="message-info-recipient">
                        <span className="message-avatar small">
                          {initials(recipient.account.displayName)}
                        </span>

                        <div>
                          <strong>{recipient.account.displayName}</strong>
                          <small>{recipient.account.employee?.designation ?? roleLabel(recipient.account.role)}</small>
                        </div>

                        <dl>
                          <div>
                            <dt>Delivered</dt>
                            <dd>{recipient.deliveredAt ? notificationTimestampLabel(recipient.deliveredAt) : "Pending"}</dd>
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
            className="message-media-viewer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-media-viewer-title"
          >
            <header>
              <div>
                <strong id="message-media-viewer-title">
                  {attachmentViewer.attachment.originalFileName}
                </strong>
                <span>
                  {attachmentTypeLabel(attachmentViewer.attachment)} · {formatFileSize(attachmentViewer.attachment.fileSizeBytes)}
                </span>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => void handleDownloadAttachment(
                    attachmentViewer.message,
                    attachmentViewer.attachment,
                  )}
                >
                  Download
                </button>
                <button
                  type="button"
                  onClick={closeAttachmentViewer}
                  aria-label="Close attachment preview"
                >
                  ×
                </button>
              </div>
            </header>

            <div
              className={`message-media-viewer-body ${
                isImageAttachment(attachmentViewer.attachment)
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
              {attachmentViewer.loading && (
                <div className="message-media-viewer-state">
                  <span className="message-small-spinner" />
                  <p>Loading preview...</p>
                </div>
              )}

              {!attachmentViewer.loading && attachmentViewer.error && (
                <div className="message-media-viewer-state error">
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
                    <div className="message-audio-waveform large" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <audio src={attachmentViewer.objectUrl} controls preload="metadata">
                      Your browser does not support audio playback.
                    </audio>
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
            </div>
          </section>
        </div>
      )}

      {requestDialogOpen && (
        <div
          className="message-contact-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setRequestDialogOpen(false);
            }
          }}
        >
          <section
            className="message-contact-dialog message-request-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-requests-title"
          >
            <header>
              <div>
                <span>First-contact protection</span>
                <h2 id="message-requests-title">
                  Message requests
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setRequestDialogOpen(false)}
                aria-label="Close message requests"
              >
                ×
              </button>
            </header>

            {requestError && (
              <div className="message-inline-error compact">
                <p>{requestError}</p>
              </div>
            )}

            <div className="message-request-content">
              {requestsLoading ? (
                <div className="message-list-state compact">
                  <span className="message-small-spinner" />
                  <p>Loading message requests...</p>
                </div>
              ) : (
                <>
                  <section className="message-request-section">
                    <header>
                      <h3>Received</h3>
                      <span>
                        {messageRequests.counts.receivedPending} pending
                      </span>
                    </header>

                    {messageRequests.received.length === 0 ? (
                      <p className="message-request-empty">
                        No incoming message requests.
                      </p>
                    ) : (
                      messageRequests.received.map((request) => (
                        <article
                          key={request.id}
                          className="message-request-card"
                        >
                          <span className="message-avatar">
                            {initials(request.peer.displayName)}
                          </span>

                          <div>
                            <strong>{request.peer.displayName}</strong>
                            <small>
                              {request.peer.employee?.designation ??
                                roleLabel(request.peer.role)}
                            </small>
                            <em>{requestReasonLabel(request.reason)}</em>
                          </div>

                          <div className="message-request-actions">
                            <button
                              type="button"
                              className="accept"
                              onClick={() => void handleAcceptRequest(request)}
                              disabled={requestActionId !== null}
                            >
                              {requestActionId === request.id
                                ? "Working..."
                                : "Accept"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeclineRequest(request)}
                              disabled={requestActionId !== null}
                            >
                              Decline
                            </button>
                            <button
                              type="button"
                              className="block"
                              onClick={() => void handleBlockRequest(request)}
                              disabled={requestActionId !== null}
                            >
                              Block
                            </button>
                          </div>
                        </article>
                      ))
                    )}
                  </section>

                  <section className="message-request-section">
                    <header>
                      <h3>Sent</h3>
                      <span>
                        {messageRequests.counts.sentPending} pending
                      </span>
                    </header>

                    {messageRequests.sent.length === 0 ? (
                      <p className="message-request-empty">
                        No outgoing message requests.
                      </p>
                    ) : (
                      messageRequests.sent.map((request) => (
                        <article
                          key={request.id}
                          className="message-request-card sent"
                        >
                          <span className="message-avatar">
                            {initials(request.peer.displayName)}
                          </span>

                          <div>
                            <strong>{request.peer.displayName}</strong>
                            <small>Awaiting response</small>
                            <em>{requestReasonLabel(request.reason)}</em>
                          </div>

                          <time>
                            {formatConversationTime(request.requestedAt)}
                          </time>
                        </article>
                      ))
                    )}
                  </section>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
