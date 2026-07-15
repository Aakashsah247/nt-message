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
  ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router";

import { useAuth } from "../context/AuthContext";
import { useAvatarRegistry } from "../context/AvatarContext";
import {
  acceptMessageRequest,
  addGroupMembers,
  blockMessageRequest,
  blockMessagingAccount,
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
  getConversationSharedContent,
  getGroupInvitationLink,
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
  joinGroupInvitation,
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
import type {
  AttachmentUploadProgress,
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
  ConversationMuteSetting,
  MessageInformation,
  MessagingMessage,
  MessagingMention,
  MessagingAnnouncementPayload,
  MessagingLocationPayload,
  MessagingMessageRequest,
  MessagingNotification,
  MessagingSearchMessageResult,
  MessagingUserProfile,
  MessageContentType,
  OfficialGroupAuditEntry,
  OfficialGroupScopeOption,
  PrivateGroupHistoryWindow,
} from "../types/messaging";


type RealtimeConnectionStatus =
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "DISCONNECTED";

type SharedContentTab = "MEDIA" | "DOCUMENTS" | "LINKS";
type ConversationCategory = "ALL" | "UNREAD" | "GROUPS" | "OFFICIAL";

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
const SELECTED_CONVERSATION_STORAGE_KEY =
  "nt-message:selected-conversation";
const HIGHLIGHT_MESSAGE_STORAGE_KEY =
  "nt-message:highlight-message";
const NOTIFICATION_SOUND_STORAGE_KEY = "nt-message:notification-sound-enabled";
const BROWSER_NOTIFICATION_STORAGE_KEY = "nt-message:browser-notifications-enabled";
const CUSTOMIZATION_STORAGE_KEY = "nt-message:customization";
const SETTINGS_STORAGE_KEY = "nt-message:settings";
const MESSAGE_NAVIGATION_STORAGE_KEY = "nt-message:navigation-expanded";
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
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣",
      "😊", "🙂", "😉", "😍", "🥰", "😘", "😎", "🤩",
      "🤔", "😮", "😢", "😭", "😡", "🥳", "😴", "🤗",
    ],
  },
  {
    label: "Gestures",
    emojis: [
      "👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "👏",
      "🙌", "🙏", "💪", "👋", "🤝", "☝️", "👇", "👉",
    ],
  },
  {
    label: "Hearts & symbols",
    emojis: [
      "❤️", "🩷", "🧡", "💛", "💚", "💙", "💜", "🤍",
      "🤎", "🖤", "💔", "❣️", "💕", "💯", "✅", "❌",
    ],
  },
  {
    label: "Celebration",
    emojis: [
      "🎉", "🎊", "🎂", "🎁", "🏆", "🥇", "⭐", "🌟",
      "✨", "🔥", "🚀", "💡", "📌", "📣", "🔔", "💬",
    ],
  },
  {
    label: "Food & nature",
    emojis: [
      "☕", "🍵", "🍕", "🍔", "🍰", "🍎", "🌹", "🌻",
      "🌈", "☀️", "🌙", "⚡", "🌧️", "❄️", "🐶", "🐱",
    ],
  },
] as const;
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

type AttachmentUploadStatus = "IDLE" | "UPLOADING" | "FAILED";

interface AttachmentUploadState {
  status: AttachmentUploadStatus;
  progressPercent: number;
  loadedBytes: number;
  totalBytes: number | null;
  error: string | null;
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
    <div className={`message-audio-player-v3${voiceNote ? " voice-note" : " audio-file"}`}>
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
              className={(index + 1) / waveformBars <= progressRatio ? "is-played" : ""}
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
        onLoadedMetadata={(event) => setDuration(
          Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0,
        )}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
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

function attachmentVisualKind(attachment: MessagingAttachment): AttachmentGlyphName {
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
  const mediaPreview = isImageAttachment(attachment) || isVideoAttachment(attachment);
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
      className={`message-attachment-card-v2 message-attachment-${visualKind}-v2${
        previewError ? " has-preview-error" : ""
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
              <strong>Loading {isVideoAttachment(attachment) ? "video" : "image"}</strong>
            </div>
          )}
        </div>
      )}

      {audioPreview && (
        previewUrl ? (
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
            <span>{isVoiceNote ? "Loading voice message" : "Loading audio"}</span>
          </div>
        )
      )}

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
          aria-label={canPreview ? `Preview ${attachment.originalFileName}` : undefined}
        >
          <span className="message-attachment-document-icon-v2">
            <AttachmentGlyph name={isPdfAttachment(attachment) ? "pdf" : "document"} />
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

function isSameCalendarDay(first: string, second: string): boolean {
  return new Date(first).toDateString() === new Date(second).toDateString();
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

function formatMessageDay(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
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

// Reads the trusted official-announcement marker from a message payload.
function getOfficialAnnouncementPayload(
  message: Pick<MessagingMessage, "payload">,
): MessagingAnnouncementPayload | null {
  const announcement = getMessagePayloadValue(message, "announcement");

  if (!announcement || typeof announcement !== "object" || Array.isArray(announcement)) {
    return null;
  }

  const value = announcement as Record<string, unknown>;

  if (value.kind !== "OFFICIAL") {
    return null;
  }

  return {
    kind: "OFFICIAL",
    label: typeof value.label === "string" ? value.label : "Official announcement",
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
          <span className={`message-location-status-v2${active ? " active" : ""}`} />
          <strong>{statusLabel}</strong>
        </div>
        <span className="message-location-coordinates-v2">
          {formatLocationCoordinate(location.latitude)}, {formatLocationCoordinate(location.longitude)}
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

// Estimates visible shared-file storage from currently loaded media and document messages.
function sharedContentStorageBytes(sharedContent: ConversationSharedContent): number {
  return [...sharedContent.media, ...sharedContent.documents].reduce(
    (total, item) => total + item.attachment.fileSizeBytes,
    0,
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


type MessageNavigationIconName =
  | "search"
  | "chats"
  | "requests"
  | "groups"
  | "official"
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
  | "addUser"
  | "info"
  | "close"
  | "pin"
  | "unread"
  | "react"
  | "reply"
  | "more";

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
          <path d="M19 13.5v-3l-2-.7a7.5 7.5 0 0 0-.8-1.8l.9-1.9-2.2-2.2-1.9.9a7.5 7.5 0 0 0-1.8-.8L10.5 2h-3L6.8 4a7.5 7.5 0 0 0-1.8.8l-1.9-.9L.9 6.1 1.8 8a7.5 7.5 0 0 0-.8 1.8l-2 .7v3l2 .7a7.5 7.5 0 0 0 .8 1.8l-.9 1.9 2.2 2.2 1.9-.9a7.5 7.5 0 0 0 1.8.8l.7 2h3l.7-2a7.5 7.5 0 0 0 1.8-.8l1.9.9 2.2-2.2-.9-1.9a7.5 7.5 0 0 0 .8-1.8l2-.7Z" transform="translate(2 0) scale(.83)" />
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
          <circle cx="18" cy="6" r="2.5" fill="currentColor" stroke="white" strokeWidth="1.2" />
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

  const announcementPrefix = isOfficialAnnouncementMessage(message)
    ? "Announcement: "
    : "";

  return `${prefix}${announcementPrefix}${message.forwardedFrom ? "Forwarded: " : ""}${attachmentLabel(message)}`;
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
  const location = useLocation();
  const {
    account,
    accessToken,
    logout,
  } = useAuth();
  const { refreshAvatar } = useAvatarRegistry();
  const mainWorkspacePath = workspacePathForRole(account?.role);

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
  const [conversationCategory, setConversationCategory] = useState<ConversationCategory>("ALL");
  const [detailsPanelOpen, setDetailsPanelOpen] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 1500px)").matches,
  );
  const [navigationExpanded, setNavigationExpanded] = useState(() => {
    // Mobile navigation always starts closed so the drawer never covers the
    // initial conversation view after a previous desktop session.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches) {
      return false;
    }

    return readStoredNavigationExpanded();
  });
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [attachmentMenuView, setAttachmentMenuView] = useState<"ROOT" | "LIVE_LOCATION">("ROOT");
  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false);
  const [openMessageMenuId, setOpenMessageMenuId] = useState<string | null>(null);
  const [messageActionMenuPosition, setMessageActionMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [openReactionMenuId, setOpenReactionMenuId] = useState<string | null>(null);
  const [reactionMenuPosition, setReactionMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    readStoredConversationId,
  );
  const [messages, setMessages] = useState<MessagingMessage[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<MessagingMessage[]>([]);
  const [conversationSearch, setConversationSearch] = useState("");
  const [messageText, setMessageText] = useState("");
  const [announcementMode, setAnnouncementMode] = useState(false);
  const [composerCaretIndex, setComposerCaretIndex] = useState(0);
  const [replyingTo, setReplyingTo] = useState<MessagingMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<MessagingMessage | null>(null);
  const [messageActionId, setMessageActionId] = useState<string | null>(null);
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
  const [sendAttemptFailed, setSendAttemptFailed] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<File | null>(null);
  const [selectedAttachmentKind, setSelectedAttachmentKind] = useState<"FILE" | "VOICE_NOTE">("FILE");
  const [attachmentUpload, setAttachmentUpload] = useState<AttachmentUploadState>(
    EMPTY_ATTACHMENT_UPLOAD_STATE,
  );
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
  const [groupInviteLink, setGroupInviteLink] = useState<GroupInvitationLink | null>(null);
  const [groupInviteLoading, setGroupInviteLoading] = useState(false);
  const [groupInviteNotice, setGroupInviteNotice] = useState<string | null>(null);
  const [groupInviteError, setGroupInviteError] = useState<string | null>(null);
  const [inviteJoinLoading, setInviteJoinLoading] = useState(false);
  const groupInviteJoinTokenRef = useRef<string | null>(null);
  const [groupPhotoUploading, setGroupPhotoUploading] = useState(false);
  const groupPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [privateGroupDialogOpen, setPrivateGroupDialogOpen] = useState(false);
  const [privateGroupSearch, setPrivateGroupSearch] = useState("");
  const [privateGroupContacts, setPrivateGroupContacts] = useState<MessagingContact[]>([]);
  const [privateGroupSelectedAccountIds, setPrivateGroupSelectedAccountIds] = useState<string[]>([]);
  const [privateGroupHistoryWindow, setPrivateGroupHistoryWindow] =
    useState<PrivateGroupHistoryWindow>("NONE");
  const [privateGroupContactsLoading, setPrivateGroupContactsLoading] = useState(false);
  const [privateGroupSubmitting, setPrivateGroupSubmitting] = useState(false);
  const [privateGroupError, setPrivateGroupError] = useState<string | null>(null);
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
    if (!openMessageMenuId && !openReactionMenuId) {
      return;
    }

    const closeMenus = () => {
      setOpenMessageMenuId(null);
      setMessageActionMenuPosition(null);
      setOpenReactionMenuId(null);
      setReactionMenuPosition(null);
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
      const actionMenu = target.closest<HTMLElement>("[data-message-action-menu]");
      const reactionMenu = target.closest<HTMLElement>("[data-message-reaction-menu]");
      const clickedCurrentTrigger =
        actionTrigger?.dataset.messageActionTrigger === openMessageMenuId ||
        reactionTrigger?.dataset.messageReactionTrigger === openReactionMenuId;

      if (!clickedCurrentTrigger && !actionMenu && !reactionMenu) {
        closeMenus();
      }
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeMenus);
    document.addEventListener("scroll", closeMenus, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeMenus);
      document.removeEventListener("scroll", closeMenus, true);
    };
  }, [openMessageMenuId, openReactionMenuId]);

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
      if (event.key === "Escape") {
        closeComposerPopovers();
      }
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

  useEffect(() => () => {
    clearLiveLocationWatch();
  }, []);

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
  const [profilePhotoCacheKeys, setProfilePhotoCacheKeys] = useState<Record<string, string>>({});
  const [ownProfileAccount, setOwnProfileAccount] = useState<MessagingUserProfile | null>(null);
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
  const messageThreadBottomRef = useRef<HTMLDivElement | null>(null);
  const pendingSearchResultRef = useRef<MessagingSearchMessageResult | null>(null);
  const previousScrollConversationIdRef = useRef<string | null>(null);
  const previousMessageCountRef = useRef(0);
  const pendingBottomScrollConversationIdRef = useRef<string | null>(selectedConversationId);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentMenuRef = useRef<HTMLDivElement | null>(null);
  const composerEmojiMenuRef = useRef<HTMLDivElement | null>(null);
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

  // Only official group owners/admins can mark a text message as an announcement.
  const canSendOfficialAnnouncement = Boolean(
    selectedConversation?.type === "GROUP" &&
      selectedConversation.groupKind === "OFFICIAL" &&
      selectedConversation.canManageGroup,
  );

  useLayoutEffect(() => {
    const composer = composerRef.current;

    if (!composer) {
      return;
    }

    // Keep the composer compact for one line and grow only until its scroll limit.
    composer.style.height = "0px";
    const maximumHeight = 128;
    const nextHeight = Math.min(maximumHeight, Math.max(44, composer.scrollHeight));
    composer.style.height = `${nextHeight}px`;
    composer.style.overflowY = composer.scrollHeight > maximumHeight ? "auto" : "hidden";
  }, [editingMessage, messageText, replyingTo, selectedConversationId]);

  const groupInviteUrl = useMemo(
    () => groupInviteLink ? buildGroupInviteUrl(groupInviteLink.token) : "",
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
    if (!attachmentViewer) {
      return;
    }

    function handleViewerKeyboard(event: globalThis.KeyboardEvent): void {
      if (event.key === "Escape") {
        closeAttachmentViewer();
      }
    }

    document.body.classList.add("message-attachment-viewer-open");
    window.addEventListener("keydown", handleViewerKeyboard);

    return () => {
      document.body.classList.remove("message-attachment-viewer-open");
      window.removeEventListener("keydown", handleViewerKeyboard);
    };
  }, [attachmentViewer]);

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
      message.reactions.forEach((reaction) => collectAccount(reaction.account ?? null));
    });
    contacts.forEach(collectAccount);
    blockedAccounts.forEach((block) => collectAccount(block.account));
    searchContactResults.forEach(collectAccount);
    searchResults.forEach((result) => collectAccount(result.message.sender));
    messageRequests.received.forEach((request) => collectAccount(request.peer));
    messageRequests.sent.forEach((request) => collectAccount(request.peer));
    messageInformation?.recipients.forEach((recipient) => collectAccount(recipient.account));
    collectAccount(profileData);
    collectAccount(ownProfileAccount);

    const changedAccounts = [...visibleAccounts.values()].filter((candidate) => {
      const nextKey = candidate.profilePhotoKey ?? "";
      const cachedKey = profilePhotoCacheKeys[candidate.accountId] ?? "";
      const cachedUrl = profilePhotoUrls[candidate.accountId];

      return cachedKey !== nextKey || Boolean(!nextKey && cachedUrl);
    });

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
      (candidate): candidate is MessagingAccount & { profilePhotoKey: string } =>
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
          const url = await createMessagingProfilePhotoObjectUrl(accessToken, candidate.accountId);
          loadedUrls.push(url);
          return [candidate.accountId, candidate.profilePhotoKey, url] as const;
        } catch {
          // Cache the attempted key so an unavailable protected photo does not
          // trigger a request on every unrelated render.
          return [candidate.accountId, candidate.profilePhotoKey, null] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) {
        loadedUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      setProfilePhotoCacheKeys((current) => ({
        ...current,
        ...Object.fromEntries(entries.map(([accountId, photoKey]) => [accountId, photoKey])),
      }));

      const successfulEntries = entries.filter(
        (entry): entry is readonly [string, string, string] => Boolean(entry[2]),
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

  const filteredConversations = useMemo(
    () => conversations.filter((conversation) =>
      conversationCategory === "ALL" ||
      (conversationCategory === "UNREAD" && conversation.unreadCount > 0) ||
      (conversationCategory === "GROUPS" && conversation.type === "GROUP") ||
      (conversationCategory === "OFFICIAL" && conversation.groupKind === "OFFICIAL"),
    ),
    [conversationCategory, conversations],
  );

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

      return [{
        conversation,
        matchedDisplayName: matchingParticipant?.displayName ?? null,
      }];
    });

    return { directChats, groupsInCommon };
  }, [account?.id, conversationSearch, conversations]);

  const conversationSearchResultCount =
    conversationSearchResults.directChats.length +
    conversationSearchResults.groupsInCommon.length;

  const displayMessages = useMemo(
    () => messages,
    [messages],
  );

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
    setAnnouncementMode(false);

    if (!selectedConversationId) {
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
  }, [loadMessages, loadPinnedMessages, selectedConversationId]);


  function scrollMessageThreadToBottom(): void {
    const element = messageListRef.current;

    if (!element) {
      return;
    }

    const renderedMessages = element.querySelectorAll<HTMLElement>("[data-message-id]");
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
      timers.push(window.setTimeout(() => {
        pendingBottomScrollConversationIdRef.current = null;
      }, 1250));
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
      messages.every((message) => message.conversationId === selectedConversationId);

    if (!messagesBelongToSelectedConversation) {
      return undefined;
    }

    const conversationChanged =
      previousScrollConversationIdRef.current !== selectedConversationId;
    const messageCountIncreased =
      messages.length > previousMessageCountRef.current;
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    const viewerWasNearBottom = distanceFromBottom < 160;
    const pendingInitialBottomScroll =
      Boolean(selectedConversationId) &&
      pendingBottomScrollConversationIdRef.current === selectedConversationId &&
      messages.length > 0;

    const shouldScrollToBottom =
      pendingInitialBottomScroll ||
      conversationChanged ||
      (messageCountIncreased && viewerWasNearBottom);

    let cancelBottomScrollRetries: (() => void) | null = null;

    if (shouldScrollToBottom) {
      // Admin refresh can resize after render; repeat the anchor until the shell settles.
      cancelBottomScrollRetries = scheduleBottomScrollRetries(pendingInitialBottomScroll);
    }

    previousScrollConversationIdRef.current = selectedConversationId;
    previousMessageCountRef.current = messages.length;

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
    selectedConversation,
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
  }, [
    accessToken,
    location.search,
    loadConversations,
    navigate,
  ]);

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
    resetGroupInviteState();
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
    resetGroupInviteState();
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
    resetGroupInviteState();
  }

  function openPrivateGroupDialog(): void {
    if (!selectedConversation || selectedConversation.type !== "PRIVATE") {
      return;
    }

    setPrivateGroupDialogOpen(true);
    setPrivateGroupSearch("");
    setPrivateGroupContacts([]);
    setPrivateGroupSelectedAccountIds([]);
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
    setPrivateGroupHistoryWindow("NONE");
    setPrivateGroupError(null);
  }

  function togglePrivateGroupMember(accountId: string): void {
    setPrivateGroupSelectedAccountIds((current) => (
      current.includes(accountId)
        ? current.filter((value) => value !== accountId)
        : [...current, accountId]
    ));
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
        resetAttachmentUpload();
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

  function resetAttachmentUpload(): void {
    setAttachmentUpload(EMPTY_ATTACHMENT_UPLOAD_STATE);
  }

  function updateAttachmentUploadProgress(progress: AttachmentUploadProgress): void {
    setAttachmentUpload({
      status: "UPLOADING",
      progressPercent: progress.progressPercent,
      loadedBytes: progress.loadedBytes,
      totalBytes: progress.totalBytes,
      error: null,
    });
  }

  function clearSelectedAttachment(): void {
    setSelectedAttachment(null);
    setSelectedAttachmentKind("FILE");
    resetAttachmentUpload();

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
    resetAttachmentUpload();
    setMessageError(null);
    setSendAttemptFailed(false);

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

    // Announcement mode changes only this outgoing text message, not the normal composer flow.
    const sendAsAnnouncement = announcementMode && canSendOfficialAnnouncement && !editingMessage;

    if (sendAsAnnouncement && selectedAttachment) {
      setMessageError("Official announcements must be text-only. Remove the attachment first.");
      return;
    }

    const isAttachmentSend = selectedAttachment !== null && !editingMessage;

    setSendingMessage(true);
    setSendAttemptFailed(false);
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

      if (isAttachmentSend && selectedAttachment) {
        // Show progress immediately; XHR events will refine the exact percentage.
        setAttachmentUpload({
          status: "UPLOADING",
          progressPercent: 0,
          loadedBytes: 0,
          totalBytes: selectedAttachment.size,
          error: null,
        });
      }

      const response = selectedAttachment
        ? await sendConversationAttachmentMessage(
            accessToken,
            selectedConversationId,
            selectedAttachment,
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
            sendAsAnnouncement,
          );

      delete draftCacheRef.current[selectedConversationId];

      setMessageText("");
      setAnnouncementMode(false);
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
      const errorMessage = error instanceof Error
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
      setMessageError(
        errorMessage,
      );
    } finally {
      setSendingMessage(false);
    }
  }

  function handleComposerKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void {
    // Do not submit while an input method editor is still composing text.
    if (event.nativeEvent.isComposing) {
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
  const blockedAccountIds = new Set(blockedAccounts.map((block) => block.blockedAccountId));

  const groupInfoConversation = selectedConversation?.type === "GROUP"
    ? selectedConversation
    : null;
  const groupInfoOwner = groupInfoConversation?.participants.find(
    (participant) => participant.participantRole === "OWNER",
  ) ?? null;
  const groupInfoAdmins = groupInfoConversation?.participants.filter(
    (participant) => participant.participantRole === "ADMIN",
  ) ?? [];
  const groupInfoMembers = groupInfoConversation?.participants.filter(
    (participant) => participant.participantRole === "MEMBER",
  ) ?? [];
  const groupInfoSharedContent = useMemo(() => {
    if (!groupInfoConversation) {
      return emptySharedContent();
    }

    // M9 uses the currently loaded messages for an instant group information summary.
    return collectSharedContentFromMessages(
      messages.filter((message) => message.conversationId === groupInfoConversation.id),
    );
  }, [groupInfoConversation, messages]);
  const groupInfoStorageBytes = sharedContentStorageBytes(groupInfoSharedContent);

  function closeMessageActionMenu(): void {
    setOpenMessageMenuId(null);
    setMessageActionMenuPosition(null);
  }

  function closeReactionMenu(): void {
    setOpenReactionMenuId(null);
    setReactionMenuPosition(null);
  }

  function toggleMessageActionMenu(
    messageId: string,
    ownMessage: boolean,
    event: MouseEvent<HTMLButtonElement>,
  ): void {
    event.stopPropagation();
    closeReactionMenu();

    if (openMessageMenuId === messageId) {
      closeMessageActionMenu();
      return;
    }

    const triggerRect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 194;
    const estimatedMenuHeight = 316;
    const viewportPadding = 10;
    const gap = 8;
    const availableBelow = window.innerHeight - triggerRect.bottom;
    const top = availableBelow >= estimatedMenuHeight + gap
      ? triggerRect.bottom + gap
      : Math.max(
          viewportPadding,
          triggerRect.top - estimatedMenuHeight - gap,
        );
    const preferredLeft = ownMessage
      ? triggerRect.right - menuWidth
      : triggerRect.left;
    const left = Math.min(
      window.innerWidth - menuWidth - viewportPadding,
      Math.max(viewportPadding, preferredLeft),
    );

    setMessageActionMenuPosition({ top, left });
    setOpenMessageMenuId(messageId);
  }

  function toggleReactionMenu(
    messageId: string,
    ownMessage: boolean,
    event: MouseEvent<HTMLButtonElement>,
  ): void {
    event.stopPropagation();
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
    const top = preferredTop >= viewportPadding
      ? preferredTop
      : triggerRect.bottom + gap;
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
    if (
      typeof window === "undefined" ||
      !window.matchMedia("(max-width: 900px)").matches
    ) {
      return;
    }

    const target = event.target;

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
          <img
            src={photoUrl}
            alt=""
            draggable={false}
          />
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
          <img
            src={photoUrl}
            alt=""
            draggable={false}
          />
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
    const conversationPeer = conversation.type === "PRIVATE"
      ? conversation.participants.find(
          (participant) => participant.accountId !== account?.id,
        )
      : null;

    return conversationPeer
      ? renderAccountAvatar(conversationPeer, className)
      : renderGroupAvatar(conversation, className);
  }

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

  const composerHasContent = Boolean(messageText.trim() || selectedAttachment);
  const composerSendState = sendingMessage
    ? "sending"
    : sendAttemptFailed
      ? "failed"
      : composerHasContent
        ? "ready"
        : "disabled";

  const messageActionMenuMessage = openMessageMenuId
    ? messages.find((message) => message.id === openMessageMenuId) ?? null
    : null;

  const reactionMenuMessage = openReactionMenuId
    ? messages.find((message) => message.id === openReactionMenuId) ?? null
    : null;

  function renderFloatingReactionMenu(message: MessagingMessage) {
    const viewerReaction = getViewerReaction(message, account?.id);

    return (
      <div
        className="message-reaction-picker-floating"
        data-message-reaction-menu
        role="toolbar"
        aria-label="React to message"
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

  function renderFloatingMessageActionMenu(message: MessagingMessage) {
    const ownMessage = message.senderAccountId === account?.id;
    const attachments = message.attachments ?? [];
    const previewableAttachment = attachments.find(
      (attachment) => !isAudioAttachment(attachment) && canPreviewAttachment(attachment),
    );
    const attachmentLabel = attachments.length === 1 ? "attachment" : "attachments";

    return (
      <div
        className="message-action-menu message-action-menu-floating"
        data-message-action-menu
        role="menu"
        aria-label="Message actions"
        style={messageActionMenuPosition ?? undefined}
      >
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
            <AttachmentGlyph name={attachmentVisualKind(previewableAttachment)} />
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
            void handleDeleteMessageForMe(message);
          }}
          disabled={messageActionId !== null}
        >
          <AttachmentGlyph name="trash" />
          <span>Delete for me</span>
        </button>

        {ownMessage && !message.isDeleted && (
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              closeMessageActionMenu();
              void handleDeleteMessageForEveryone(message);
            }}
            disabled={messageActionId !== null}
          >
            <AttachmentGlyph name="trash" />
            <span>Delete for everyone</span>
          </button>
        )}
      </div>
    );
  }

  function renderConversationRow(
    conversation: MessagingConversation,
  ): ReactNode {
    const conversationPeer = conversation.type === "PRIVATE"
      ? conversation.participants.find(
          (participant) => participant.accountId !== account?.id,
        )
      : undefined;
    const title = conversation.title ?? "Private conversation";
    const organizationLabel = conversationPeer?.employee?.department?.name ??
      conversationPeer?.employee?.division?.name;
    const scopeLabel = conversation.type === "GROUP"
      ? conversation.groupKind === "OFFICIAL"
        ? officialScopeLabel(conversation)
        : `${conversation.memberCount} members · Personal group`
      : [
          conversationPeer?.employee?.designation ??
            roleLabel(conversationPeer?.role ?? "EMPLOYEE"),
          organizationLabel,
        ].filter(Boolean).join(" · ");

    return (
      <button
        type="button"
        key={conversation.id}
        className={`message-conversation-row${
          conversation.id === selectedConversationId ? " active" : ""
        }${conversation.unreadCount > 0 ? " unread" : ""}${
          conversation.groupKind === "OFFICIAL" ? " official" : ""
        }`}
        onClick={() => {
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
            <small>{messagePreview(conversation, account?.id ?? "")}</small>

            {conversation.unreadCount > 0 && (
              <b aria-label={`${conversation.unreadCount} unread messages`}>
                {conversation.unreadCount > 99
                  ? "99+"
                  : conversation.unreadCount}
              </b>
            )}
          </span>

          <span className="message-conversation-meta">
            {conversation.groupKind === "OFFICIAL" && (
              <span className="message-conversation-kind">Official</span>
            )}
            {conversation.draftText && (
              <span className="message-conversation-draft">Draft</span>
            )}
            <small>{scopeLabel}</small>
            <span className="message-conversation-indicators" aria-label="Conversation status">
              {conversation.isPinned && (
                <span aria-label="Pinned"><MessageNavigationIcon name="pin" /></span>
              )}
              {conversation.isMuted && (
                <span aria-label="Muted"><MessageNavigationIcon name="bell" /></span>
              )}
              {conversation.isArchived && (
                <span aria-label="Archived"><MessageNavigationIcon name="archive" /></span>
              )}
            </span>
          </span>
        </span>
      </button>
    );
  }

  function renderGroupSearchResult({
    conversation,
    matchedDisplayName,
  }: {
    conversation: MessagingConversation;
    matchedDisplayName: string | null;
  }): ReactNode {
    const scopeLabel = conversation.groupKind === "OFFICIAL"
      ? officialScopeLabel(conversation)
      : `${conversation.memberCount} members · Personal group`;

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

  return (
    <main
      className={`message-app-shell${navigationExpanded ? " navigation-expanded" : ""} theme-${customizationToken(messagingCustomization.theme)} accent-${customizationToken(messagingCustomization.accent)} wallpaper-${customizationToken(messagingCustomization.wallpaper)} density-${customizationToken(messagingCustomization.density)}`}
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
                <img
                  src="/nt-logo.png"
                  alt="Nepal Telecom"
                />
              </span>
            </button>

            <span className="message-brand-text" aria-hidden={!navigationExpanded}>
              <strong>NT Message</strong>
              <small>NEPAL TELECOM</small>
            </span>
          </div>

          <button
            type="button"
            className="message-rail-toggle"
            onClick={() => setNavigationExpanded((current) => !current)}
            aria-expanded={navigationExpanded}
            aria-label={navigationExpanded ? "Collapse navigation" : "Expand navigation"}
            title={navigationExpanded ? "Collapse navigation" : "Expand navigation"}
          >
            <span aria-hidden="true">{navigationExpanded ? "‹" : "›"}</span>
          </button>
        </div>

        <nav className="message-rail-navigation" aria-label="Messaging sections">
          <button
            type="button"
            className={conversationCategory === "ALL" && conversationListView === "ACTIVE" ? "active" : ""}
            onClick={() => {
              setConversationCategory("ALL");
              setConversationListView("ACTIVE");
            }}
            aria-label="Chats"
            title={navigationExpanded ? undefined : "Chats"}
          >
            <span className="message-rail-icon"><MessageNavigationIcon name="chats" /></span>
            <span className="message-rail-label">Chats</span>
          </button>

          <button
            type="button"
            onClick={openMessageRequests}
            aria-label="Message requests"
            title={navigationExpanded ? undefined : "Message requests"}
          >
            <span className="message-rail-icon"><MessageNavigationIcon name="requests" /></span>
            <span className="message-rail-label">Message requests</span>
            {messageRequests.counts.receivedPending > 0 && (
              <b>{messageRequests.counts.receivedPending}</b>
            )}
          </button>

          <button
            type="button"
            className={conversationCategory === "GROUPS" ? "active" : ""}
            onClick={() => {
              setConversationCategory("GROUPS");
              setConversationListView("ACTIVE");
            }}
            aria-label="Groups"
            title={navigationExpanded ? undefined : "Groups"}
          >
            <span className="message-rail-icon"><MessageNavigationIcon name="groups" /></span>
            <span className="message-rail-label">Groups</span>
          </button>

          <button
            type="button"
            className={conversationCategory === "OFFICIAL" && conversationListView === "ACTIVE" ? "active" : ""}
            onClick={() => {
              setConversationCategory("OFFICIAL");
              setConversationListView("ACTIVE");
            }}
            aria-label="Official groups"
            title={navigationExpanded ? undefined : "Official groups"}
          >
            <span className="message-rail-icon"><MessageNavigationIcon name="official" /></span>
            <span className="message-rail-label">Official groups</span>
          </button>

          <button
            type="button"
            className={conversationListView === "ARCHIVED" ? "active" : ""}
            onClick={() => {
              setConversationCategory("ALL");
              setConversationListView("ARCHIVED");
            }}
            aria-label="Archived conversations"
            title={navigationExpanded ? undefined : "Archived conversations"}
          >
            <span className="message-rail-icon"><MessageNavigationIcon name="archive" /></span>
            <span className="message-rail-label">Archived</span>
          </button>
        </nav>

        <div className="message-app-account">

          <button
            type="button"
            className={`message-profile-topbar-button${profileAccountId === account?.id ? " active" : ""}`}
            onClick={() => openProfile(account?.id)}
            title="My profile"
          >
            {account
              ? renderIdentityAvatar(account.id, account.displayName, "message-profile-rail-avatar")
              : <span className="message-profile-rail-avatar" aria-hidden="true">NT</span>}
            <span className="message-profile-rail-copy">
              <strong>{account?.displayName ?? "NT Message User"}</strong>
              <small>{account ? roleLabel(account.role) : "Employee"}</small>
            </span>
          </button>

          <div className="message-customization-wrapper">
            <button
              type="button"
              className={`message-customization-button${customizationPanelOpen ? " active" : ""}`}
              onClick={() => {
                setCustomizationPanelOpen((value) => !value);
                setSettingsPanelOpen(false);
              }}
              aria-expanded={customizationPanelOpen}
              title="Appearance"
            >
              <span className="message-rail-icon"><MessageNavigationIcon name="appearance" /></span>
              <span className="message-rail-label">Appearance</span>
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
              className={`message-settings-button${settingsPanelOpen ? " active" : ""}`}
              onClick={() => {
                setSettingsPanelOpen((value) => !value);
                setCustomizationPanelOpen(false);
              }}
              aria-expanded={settingsPanelOpen}
              title="Settings"
            >
              <span className="message-rail-icon"><MessageNavigationIcon name="settings" /></span>
              <span className="message-rail-label">Settings</span>
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
                        <strong>{account?.displayName ?? "NT Message User"}</strong>
                        <small>
                          {account?.positionLabel ??
                            (account ? roleLabel(account.role) : "Employee")} · {realtimeLabel}
                        </small>
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
            title="Starred messages"
          >
            <span className="message-rail-icon"><MessageNavigationIcon name="starred" /></span>
            <span className="message-rail-label">Starred messages</span>
          </button>


          <div className="message-notification-wrapper">
            <button
              type="button"
              className={`message-notification-button${notificationPanelOpen ? " active" : ""}`}
              onClick={() => setNotificationPanelOpen((value) => !value)}
              aria-label="Open notifications"
              title="Notifications"
            >
              <span className="message-rail-icon"><MessageNavigationIcon name="bell" /></span>
              <span className="message-rail-label">Notifications</span>
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
            className="message-workspace-return"
            onClick={() => navigate(mainWorkspacePath)}
            title="Back to main workspace"
          >
            <span className="message-rail-icon"><MessageNavigationIcon name="workspace" /></span>
            <span className="message-rail-label">Back to workspace</span>
          </button>

          <button
            type="button"
            className="message-app-logout"
            onClick={handleLogout}
            disabled={loggingOut}
            title="Sign out"
          >
            <span className="message-rail-icon"><MessageNavigationIcon name="logout" /></span>
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

      {reactionMenuMessage && reactionMenuPosition &&
        renderFloatingReactionMenu(reactionMenuMessage)}

      {messageActionMenuMessage && messageActionMenuPosition &&
        renderFloatingMessageActionMenu(messageActionMenuMessage)}

      <section
        className={`message-workspace${
          selectedConversation ? " conversation-open" : ""
        }${detailsPanelOpen && selectedConversation ? " details-open" : ""}`}
      >
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
              <h1>Conversations</h1>
            </div>

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
          </div>

          <label className="message-conversation-search">
            <span className="sr-only">Search conversations</span>
            <span className="message-conversation-search-icon" aria-hidden="true">
              <MessageNavigationIcon name="search" />
            </span>
            <input
              type="text"
              inputMode="search"
              autoComplete="off"
              value={conversationSearch}
              onChange={(event) => setConversationSearch(event.target.value)}
              placeholder="Search conversations"
            />
            {conversationSearch && (
              <button
                type="button"
                className="message-conversation-search-clear"
                onClick={() => setConversationSearch("")}
                aria-label="Clear search"
                title="Clear search"
              >
                ×
              </button>
            )}
          </label>

          <div className="message-conversation-category-tabs" aria-label="Conversation filters">
            {([
              ["ALL", conversationListView === "ARCHIVED" ? "Archived" : "All"],
              ["UNREAD", `Unread ${totalUnread > 0 ? totalUnread : ""}`.trim()],
            ] as Array<[ConversationCategory, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={conversationCategory === value ? "active" : ""}
                onClick={() => {
                  setConversationCategory(value);
                  if (conversationListView === "ARCHIVED" && value !== "ALL") {
                    setConversationListView("ACTIVE");
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="message-sidebar-summary">
            {conversationSearch.trim() ? (
              <>
                <span>{conversationSearchResultCount} results</span>
                <span>Search</span>
              </>
            ) : (
              <>
                <span>{conversations.length} conversations</span>
                <span>{totalUnread} unread</span>
              </>
            )}
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

          <div className={`message-conversation-list${
            conversationSearch.trim() ? " search-results" : ""
          }`}>
            {conversationLoading ? (
              <div className="message-list-state">
                <span className="message-small-spinner" />
                <p>Loading conversations...</p>
              </div>
            ) : conversationSearch.trim() ? (
              conversationSearchResultCount === 0 ? (
                <div className="message-list-state compact">
                  <div className="message-empty-icon">⌕</div>
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
              <div className="message-list-state">
                <div className="message-empty-icon">M</div>
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

        <section className="message-chat-panel">
          {!selectedConversation ? (
            <div className="message-welcome-state">
              <div className="message-welcome-brand" aria-hidden="true">
                <img src="/nt-logo.png" alt="" />
              </div>
              <span>NT Message</span>
              <h2>Secure internal communication</h2>
              <p>
                Select a conversation, start a private chat, or create a group for your team.
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
              <small>Private message content remains visible only to authorized participants.</small>
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

                <div className="message-chat-identity">
                  <h2>{selectedConversation.title ?? "Private conversation"}</h2>
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
                        ].filter(Boolean).join(" · ")}
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

                <div className="message-chat-header-actions" aria-label="Conversation actions">
                  <button
                    type="button"
                    onClick={() => openSearchDialog("CURRENT")}
                    aria-label="Search this conversation"
                  >
                    <MessageNavigationIcon name="search" />
                  </button>

                  {(selectedConversation.type === "PRIVATE" ||
                    selectedConversation.canManageGroup) && (
                    <button
                      type="button"
                      onClick={() =>
                        selectedConversation.type === "PRIVATE"
                          ? openPrivateGroupDialog()
                          : openManageGroup()
                      }
                      aria-label={
                        selectedConversation.type === "PRIVATE"
                          ? "Create a group from this conversation"
                          : "Manage group members"
                      }
                    >
                      <MessageNavigationIcon name="addUser" />
                    </button>
                  )}

                  <button
                    type="button"
                    className={detailsPanelOpen ? "active" : ""}
                    onClick={() => setDetailsPanelOpen((value) => !value)}
                    aria-expanded={detailsPanelOpen}
                    aria-label="Open conversation information"
                  >
                    <MessageNavigationIcon name="info" />
                  </button>
                </div>
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

              {inviteJoinLoading && (
                <div className="message-chat-notice">
                  <span>Joining group from invitation link...</span>
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
                <div className="message-thread-content">
                {hasOlderMessages && (
                  <button
                    type="button"
                    className="message-load-older"
                    onClick={() => void handleLoadOlderMessages()}
                    disabled={olderMessagesLoading}
                  >
                    {olderMessagesLoading ? "Loading…" : "Load older messages"}
                  </button>
                )}

                {messageLoading ?(
                  <div className="message-thread-state">
                    <span className="message-small-spinner" />
                    <p>Loading messages...</p>
                    </div>
                ): messages.length === 0 ? (
                  <div className="message-thread-state">
                    <div className="message-empty-icon">Hi</div>
                    <h3>Start the conversation</h3>
                    <p>
                      Send the first message to {selectedConversation.title}.
                    </p>
                    </div>
                ):(
                  displayMessages.map((message, index) => {
                    const ownMessage = message.senderAccountId === account?.id;
                    const officialAnnouncement = getOfficialAnnouncementPayload(message);
                    const previousMessage = displayMessages[index - 1];
                    const nextMessage = displayMessages[index + 1];
                    const showDaySeparator =
                      !previousMessage ||
                      !isSameCalendarDay(previousMessage.sentAt, message.sentAt);
                    const groupedWithPrevious = messagesBelongToSameVisualGroup(
                      previousMessage,
                      message,
                    );
                    const groupedWithNext = messagesBelongToSameVisualGroup(
                      message,
                      nextMessage,
                    );
                    const hasAttachments = (message.attachments?.length ?? 0) > 0;
                    const isLocationMessage = message.contentType === "LOCATION";
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
                          <div className="message-day-separator" role="separator">
                            <span>{formatMessageDay(message.sentAt)}</span>
                          </div>
                        )}

                        <article
                          data-message-id={message.id}
                          className={`message-bubble-row${
                            ownMessage ? " own" : ""
                          }${
                            groupedWithPrevious
                              ? " grouped grouped-with-previous"
                              : " group-start"
                          }${groupedWithNext ? " grouped-with-next" : " group-end"}${officialAnnouncement ? " official-announcement" : ""}${highlightedMessageId === message.id ? " search-highlight" : ""}${
                            openMessageMenuId === message.id || openReactionMenuId === message.id
                              ? " actions-open"
                              : ""
                          }${hasAttachments ? " has-attachments" : ""}${
                            isLocationMessage ? " has-location" : ""
                          }${attachmentOnlyMessage ? " attachment-only" : ""}`}
                        >
                          {!ownMessage && !groupedWithPrevious
                            ? renderAccountAvatar(message.sender, "message-avatar small")
                            : !ownMessage
                              ? <span className="message-avatar-spacer" aria-hidden="true" />
                              : null}

                        <div className="message-bubble-wrap">
                          {!ownMessage && !groupedWithPrevious && (
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

                            {officialAnnouncement && !message.isDeleted && (
                              <div className="message-announcement-label">
                                <strong>{officialAnnouncement.label}</strong>
                                <span>Official group broadcast</span>
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
                                  <div className="message-attachments-v2">
                                    {(message.attachments ?? []).map((attachment) => (
                                      <MessageAttachmentCard
                                        key={attachment.id}
                                        accessToken={accessToken}
                                        conversationId={message.conversationId}
                                        messageId={message.id}
                                        attachment={attachment}
                                        isVoiceNote={
                                          getMessagePayloadValue(message, "attachmentKind") === "VOICE_NOTE"
                                        }
                                        senderDisplayName={message.sender.displayName}
                                        senderPhotoUrl={profilePhotoUrls[message.sender.accountId] ?? null}
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


                          <div
                            className="message-bubble-actions"
                            data-message-action-root={message.id}
                          >
                            {!message.isDeleted && (
                              <button
                                type="button"
                                className="message-action-react"
                                data-message-reaction-trigger={message.id}
                                onClick={(event) => toggleReactionMenu(
                                  message.id,
                                  ownMessage,
                                  event,
                                )}
                                disabled={reactionActionId !== null}
                                aria-expanded={openReactionMenuId === message.id}
                                aria-haspopup="true"
                                aria-label="React to message"
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
                              >
                                <MessageNavigationIcon name="reply" />
                              </button>
                            )}

                            <button
                              type="button"
                              className="message-action-more"
                              data-message-action-trigger={message.id}
                              onClick={(event) => toggleMessageActionMenu(
                                message.id,
                                ownMessage,
                                event,
                              )}
                              aria-expanded={openMessageMenuId === message.id}
                              aria-haspopup="menu"
                              aria-label="Open more message actions"
                            >
                              <MessageNavigationIcon name="more" />
                            </button>
                          </div>

                          {(!groupedWithNext || message.editedAt) && (
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
                    {renderAccountAvatar(typingParticipants[0], "message-avatar small")}
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

              <form
                className={`message-composer${announcementMode ? " announcement-mode" : ""}`}
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
                          <span style={{ width: `${attachmentUpload.progressPercent}%` }} />
                        </div>
                        {attachmentUpload.error && (
                          <small className="message-attachment-upload-error">
                            {attachmentUpload.error}
                          </small>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={clearSelectedAttachment}
                      disabled={sendingMessage}
                      aria-label="Remove selected attachment"
                    >
                      ×
                    </button>
                  </div>
                )}

                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept={ACCEPTED_ATTACHMENT_TYPES}
                  className="message-attachment-input"
                  onChange={handleAttachmentChange}
                  disabled={sendingMessage || editingMessage !== null || announcementMode || voiceRecordingState !== "IDLE"}
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
                        {renderAccountAvatar(participant, "message-avatar small")}
                        <span>
                          <strong>{participant.displayName}</strong>
                          <small>{participant.employee?.designation ?? participant.username ?? "Group member"}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {canSendOfficialAnnouncement && !editingMessage && (
                  <label className={`message-announcement-toggle${announcementMode ? " active" : ""}`}>
                    <input
                      type="checkbox"
                      checked={announcementMode}
                      onChange={(event) => setAnnouncementMode(event.target.checked)}
                      disabled={sendingMessage || selectedAttachment !== null || voiceRecordingState !== "IDLE"}
                    />
                    <span className="message-announcement-switch" aria-hidden="true">
                      <span />
                    </span>
                    <span className="message-announcement-copy">
                      <strong>Announcement</strong>
                      <small>Notify every member prominently</small>
                    </span>
                  </label>
                )}

                {voiceRecordingState !== "IDLE" ? (
                  <div className="message-voice-recorder-bar" role="status" aria-live="polite">
                    <span className="message-recording-indicator" aria-hidden="true">
                      <span className="message-recording-dot" />
                    </span>
                    <span className="message-recording-copy">
                      <strong>{voiceRecordingState === "STOPPING" ? "Preparing voice note" : "Recording voice note"}</strong>
                      <small>{formatRecordingDuration(voiceRecordingSeconds)}</small>
                    </span>
                    <span className="message-recording-waveform" aria-hidden="true">
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
                      {voiceRecordingState === "STOPPING" ? "Preparing…" : "Stop and attach"}
                    </button>
                  </div>
                ) : (
                  <div className="message-composer-main">
                    <div
                      ref={attachmentMenuRef}
                      className="message-attachment-menu-wrapper"
                    >
                      <button
                        type="button"
                        className="message-composer-control message-composer-plus"
                        onClick={() => {
                          setComposerEmojiOpen(false);
                          setAttachmentMenuView("ROOT");
                          setAttachmentMenuOpen((value) => !value);
                        }}
                        aria-expanded={attachmentMenuOpen}
                        aria-label="Open attachment options"
                        disabled={
                          sendingMessage ||
                          editingMessage !== null ||
                          announcementMode
                        }
                      >
                        <span aria-hidden="true">+</span>
                      </button>

                      {attachmentMenuOpen && (
                        <div
                          className={`message-attachment-menu${attachmentMenuView === "LIVE_LOCATION" ? " live-step" : ""}`}
                          role="dialog"
                          aria-label="Attachment options"
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
                              <span className="message-popover-header-spacer" aria-hidden="true" />
                            )}
                            <strong>{attachmentMenuView === "LIVE_LOCATION" ? "Live location" : "Attach"}</strong>
                            <button
                              type="button"
                              className="message-popover-close"
                              onClick={() => {
                                setAttachmentMenuOpen(false);
                                setAttachmentMenuView("ROOT");
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
                                  onClick={() => openAttachmentPicker(MEDIA_ATTACHMENT_TYPES)}
                                  disabled={sendingMessage}
                                >
                                  <span className="media"><AttachmentGlyph name="image" /></span>
                                  <strong>Photo & video</strong>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openAttachmentPicker(DOCUMENT_ATTACHMENT_TYPES)}
                                  disabled={sendingMessage}
                                >
                                  <span className="document"><AttachmentGlyph name="document" /></span>
                                  <strong>Document</strong>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openAttachmentPicker(AUDIO_ATTACHMENT_TYPES)}
                                  disabled={sendingMessage}
                                >
                                  <span className="audio"><AttachmentGlyph name="audio" /></span>
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
                                  <span className="location"><AttachmentGlyph name="location" /></span>
                                  <strong>Location</strong>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAttachmentMenuView("LIVE_LOCATION")}
                                  disabled={locationActionLoading !== null || activeLiveLocation !== null}
                                >
                                  <span className="live-location"><AttachmentGlyph name="location" /></span>
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
                              <span className="message-live-location-illustration" aria-hidden="true">
                                <AttachmentGlyph name="location" />
                              </span>
                              <div>
                                <strong>Share your live position</strong>
                                <small>Only participants in this conversation can view updates.</small>
                              </div>
                              <div className="message-live-duration-options" role="group" aria-label="Live location duration">
                                {([15, 60, 480] as const).map((duration) => (
                                  <button
                                    key={duration}
                                    type="button"
                                    className={locationDurationMinutes === duration ? "active" : ""}
                                    onClick={() => setLocationDurationMinutes(duration)}
                                    aria-pressed={locationDurationMinutes === duration}
                                  >
                                    {duration === 15 ? "15 min" : duration === 60 ? "1 hour" : "8 hours"}
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
                                disabled={locationActionLoading !== null || activeLiveLocation !== null}
                              >
                                {locationActionLoading === "LIVE" ? "Starting…" : "Start sharing"}
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
                        <div className="message-composer-emoji-menu" role="dialog" aria-label="Quick emojis">
                          <header className="message-composer-popover-header">
                            <span className="message-popover-header-spacer" aria-hidden="true" />
                            <strong>Emoji</strong>
                            <button
                              type="button"
                              className="message-popover-close"
                              onClick={() => setComposerEmojiOpen(false)}
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
                        setComposerCaretIndex(event.target.selectionStart ?? value.length);
                        setSendAttemptFailed(false);

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
                            : "Type a message"
                      }
                      maxLength={5000}
                      rows={1}
                      disabled={sendingMessage}
                      aria-label="Message text"
                    />

                    <button
                      type="button"
                      className="message-composer-control message-voice-record-button"
                      onClick={() => void beginVoiceRecording()}
                      disabled={
                        sendingMessage ||
                        editingMessage !== null ||
                        announcementMode ||
                        selectedAttachment !== null
                      }
                      aria-label="Record voice note"
                    >
                      <MessageNavigationIcon name="microphone" />
                    </button>

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
                        <span className="message-send-spinner" aria-hidden="true" />
                      ) : sendAttemptFailed ? (
                        <span className="message-send-retry" aria-hidden="true">↻</span>
                      ) : editingMessage ? (
                        <span aria-hidden="true">✓</span>
                      ) : (
                        <MessageNavigationIcon name="send" />
                      )}
                    </button>
                  </div>
                )}
              </form>
            </>
          )}
        </section>

        <aside
          className={`message-conversation-details${
            selectedConversation && detailsPanelOpen ? " is-open" : ""
          }`}
          aria-label="Conversation information"
          aria-hidden={!selectedConversation || !detailsPanelOpen}
        >
          {!selectedConversation ? (
            <div className="message-details-empty">
              <MessageNavigationIcon name="info" />
              <strong>Conversation information</strong>
              <small>Select a conversation to review its profile and preferences.</small>
            </div>
          ) : (
            <>
              <div className="message-details-header">
                <div>
                  <span>Conversation</span>
                  <strong>Information</strong>
                </div>
                <button
                  type="button"
                  className="message-details-close"
                  onClick={(event) => {
                    // Move focus before hiding the drawer from assistive technology.
                    event.currentTarget.blur();
                    setDetailsPanelOpen(false);
                  }}
                  aria-label="Close conversation information"
                >
                  <MessageNavigationIcon name="close" />
                </button>
              </div>

              <header className="message-details-profile">
                <span className="message-avatar-presence large">
                  {selectedConversation.type === "PRIVATE" && peer
                    ? renderAccountAvatar(peer, "message-avatar large")
                    : renderGroupAvatar(selectedConversation, "message-avatar large")}
                  {peer?.showOnlineStatus !== false && peerPresence?.isOnline && (
                    <span className="message-presence-dot" aria-label="Online" />
                  )}
                </span>

                <strong>{selectedConversation.title ?? "Private conversation"}</strong>
                <small>
                  {selectedConversation.type === "GROUP"
                    ? selectedConversation.groupKind === "OFFICIAL"
                      ? officialScopeLabel(selectedConversation)
                      : `${selectedConversation.memberCount} members · Personal group`
                    : [
                        peer?.employee?.designation ?? roleLabel(peer?.role ?? "EMPLOYEE"),
                        peer?.employee?.department?.name ?? peer?.employee?.division?.name,
                      ].filter(Boolean).join(" · ")}
                </small>

                <div className="message-details-status-row">
                  {selectedConversation.groupKind === "OFFICIAL" && (
                    <span className="message-details-badge">Official group</span>
                  )}
                  {selectedConversation.type === "PRIVATE" && (
                    <span className={`message-details-presence${peerPresence?.isOnline ? " online" : ""}`}>
                      {peerPresence?.isOnline ? "Online" : "Offline"}
                    </span>
                  )}
                </div>
              </header>

              <div className="message-details-primary-actions">
                <button
                  type="button"
                  onClick={() =>
                    selectedConversation.type === "GROUP"
                      ? openManageGroup()
                      : openProfile(peer?.accountId)
                  }
                >
                  <MessageNavigationIcon name="profile" />
                  <span>{selectedConversation.type === "GROUP" ? "Group info" : "Profile"}</span>
                </button>
                <button type="button" onClick={() => void openSharedContentDialog()}>
                  <MessageNavigationIcon name="shared" />
                  <span>Shared</span>
                </button>
                <button type="button" onClick={() => openSearchDialog("CURRENT")}>
                  <MessageNavigationIcon name="search" />
                  <span>Search</span>
                </button>
              </div>

              <section className="message-details-summary" aria-label="Conversation summary">
                <div>
                  <span>Type</span>
                  <strong>{selectedConversation.type === "GROUP" ? "Group" : "Private"}</strong>
                </div>
                <div>
                  <span>{selectedConversation.type === "GROUP" ? "Members" : "Presence"}</span>
                  <strong>
                    {selectedConversation.type === "GROUP"
                      ? selectedConversation.memberCount
                      : peerPresence?.isOnline
                        ? "Online"
                        : "Offline"}
                  </strong>
                </div>
                <div>
                  <span>Unread</span>
                  <strong>{selectedConversation.unreadCount}</strong>
                </div>
              </section>

              {selectedConversation.description && (
                <section className="message-details-about">
                  <span>About</span>
                  <p>{selectedConversation.description}</p>
                </section>
              )}

              <section className="message-details-preferences">
                <span>Conversation preferences</span>

                <button
                  type="button"
                  onClick={() => void handleConversationPinnedToggle()}
                  disabled={conversationPreferenceLoading === selectedConversation.id}
                >
                  <MessageNavigationIcon name="pin" />
                  <span>{selectedConversation.isPinned ? "Unpin conversation" : "Pin conversation"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleConversationUnreadToggle()}
                  disabled={conversationPreferenceLoading === selectedConversation.id}
                >
                  <MessageNavigationIcon name="unread" />
                  <span>
                    {selectedConversation.isMarkedUnread || selectedConversation.unreadCount > 0
                      ? "Mark as read"
                      : "Mark as unread"}
                  </span>
                </button>

                <label>
                  <MessageNavigationIcon name="bell" />
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
                    <option value="OFF">Notifications on</option>
                    <option value="8_HOURS">Mute for 8 hours</option>
                    <option value="1_WEEK">Mute for 1 week</option>
                    <option value="ALWAYS">Mute always</option>
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => void handleConversationArchiveToggle()}
                  disabled={conversationPreferenceLoading === selectedConversation.id}
                >
                  <MessageNavigationIcon name="archive" />
                  <span>{selectedConversation.isArchived ? "Unarchive conversation" : "Archive conversation"}</span>
                </button>
              </section>

              <p className="message-details-privacy">
                Private message content is visible only to authorized conversation participants.
              </p>
            </>
          )}
        </aside>
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
                          {renderAccountAvatar(result.message.sender, "message-avatar small")}
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
                          {renderConversationAvatar(conversation, "message-avatar small")}
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

      {privateGroupDialogOpen && selectedConversation?.type === "PRIVATE" && (
        <div
          className="message-contact-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closePrivateGroupDialog();
            }
          }}
        >
          <section
            className="message-contact-dialog message-private-group-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="private-group-title"
          >
            <header>
              <div>
                <span>Private group</span>
                <h2 id="private-group-title">Create private group</h2>
              </div>

              <button
                type="button"
                onClick={closePrivateGroupDialog}
                disabled={privateGroupSubmitting}
                aria-label="Close private group dialog"
              >
                ×
              </button>
            </header>

            <div className="message-private-group-notice">
              <strong>Original private chat stays unchanged.</strong>
              <p>
                This creates a new group with the selected members. Future
                one-to-one messages between the original two users stay only in
                the private chat.
              </p>
            </div>

            {privateGroupError && (
              <div className="message-inline-error compact">
                <p>{privateGroupError}</p>
              </div>
            )}

            <label className="message-contact-search">
              <span>Select one or more members to add</span>
              <input
                type="search"
                value={privateGroupSearch}
                onChange={(event) => setPrivateGroupSearch(event.target.value)}
                placeholder="Search by name, employee ID or designation"
                autoFocus
              />
            </label>

            <div className="message-group-contact-list">
              {privateGroupContactsLoading ? (
                <div className="message-list-state compact">
                  <span className="message-small-spinner" />
                  <p>Searching accounts...</p>
                </div>
              ) : privateGroupContacts.length === 0 ? (
                <div className="message-list-state compact">
                  <p>No matching active accounts.</p>
                </div>
              ) : (
                privateGroupContacts.map((contact) => {
                  const alreadyOriginalMember = privateGroupOriginalMemberIds.has(
                    contact.accountId,
                  );
                  const selected = privateGroupSelectedAccountIds.includes(
                    contact.accountId,
                  );
                  const eligible =
                    contact.contactMode === "DIRECT" && !alreadyOriginalMember;

                  return (
                    <label
                      key={contact.accountId}
                      className={`message-group-contact-row${
                        selected ? " selected" : ""
                      }${!eligible ? " disabled" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => togglePrivateGroupMember(contact.accountId)}
                        disabled={!eligible || privateGroupSubmitting}
                      />

                      {renderAccountAvatar(contact, "message-avatar small")}

                      <span>
                        <strong>{contact.displayName}</strong>
                        <small>
                          {alreadyOriginalMember
                            ? "Already in this private chat"
                            : eligible
                              ? contact.employee?.designation ?? roleLabel(contact.role)
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

            <section className="message-private-group-history">
              <header>
                <h3>Previous private-chat context</h3>
                <span>{privateGroupSelectedAccountIds.length} selected</span>
              </header>

              <p>
                Choose how much previous one-to-one context should be copied
                into the new private group for every selected member in this
                batch.
              </p>

              <div className="message-private-group-history-options">
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
                      onChange={() => setPrivateGroupHistoryWindow(option.value)}
                      disabled={privateGroupSubmitting}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <footer className="message-group-dialog-footer">
              <span>
                One selected history rule applies to all selected members.
              </span>

              <div>
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
                  disabled={
                    privateGroupSelectedAccountIds.length === 0 ||
                    privateGroupSubmitting
                  }
                >
                  {privateGroupSubmitting ? "Creating..." : "Create private group"}
                </button>
              </div>
            </footer>
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

              {groupDialogMode === "MANAGE" && groupInfoConversation && (
                <section className="message-group-information-card">
                  <header>
                    {renderGroupAvatar(groupInfoConversation, "message-group-photo-preview")}
                    <div>
                      <span>Group information</span>
                      <h3>{groupInfoConversation.title ?? "Group"}</h3>
                      <p>
                        {groupInfoConversation.description ||
                          (groupInfoConversation.groupKind === "OFFICIAL"
                            ? officialScopeLabel(groupInfoConversation)
                            : "No group description added yet.")}
                      </p>
                    </div>
                  </header>

                  <div className="message-group-info-stats">
                    <article>
                      <span>Members</span>
                      <strong>{groupInfoConversation.memberCount}</strong>
                    </article>
                    <article>
                      <span>Owner</span>
                      <strong>{groupInfoOwner?.displayName ?? "Not assigned"}</strong>
                    </article>
                    <article>
                      <span>Admins</span>
                      <strong>{groupInfoAdmins.length}</strong>
                    </article>
                    <article>
                      <span>Storage shown</span>
                      <strong>{formatFileSize(groupInfoStorageBytes)}</strong>
                    </article>
                  </div>

                  <div className="message-group-info-sections">
                    <article>
                      <h4>Owner and admins</h4>
                      <div className="message-group-info-chip-list">
                        {groupInfoOwner && (
                          <button type="button" onClick={() => openProfile(groupInfoOwner.accountId)}>
                            Owner · {groupInfoOwner.displayName}
                          </button>
                        )}
                        {groupInfoAdmins.length === 0 ? (
                          <span>No group admins yet.</span>
                        ) : (
                          groupInfoAdmins.map((admin) => (
                            <button key={admin.accountId} type="button" onClick={() => openProfile(admin.accountId)}>
                              Admin · {admin.displayName}
                            </button>
                          ))
                        )}
                      </div>
                    </article>

                    <article>
                      <h4>Shared content</h4>
                      <div className="message-group-info-actions">
                        <button type="button" onClick={() => void openSharedContentDialog("MEDIA")}>
                          Media ({groupInfoSharedContent.media.length})
                        </button>
                        <button type="button" onClick={() => void openSharedContentDialog("DOCUMENTS")}>
                          Documents ({groupInfoSharedContent.documents.length})
                        </button>
                        <button type="button" onClick={() => void openSharedContentDialog("LINKS")}>
                          Links ({groupInfoSharedContent.links.length})
                        </button>
                      </div>
                    </article>

                    <article>
                      <h4>Notification settings</h4>
                      <select
                        value={groupInfoConversation.isMuted
                          ? groupInfoConversation.mutedUntil
                            ? "8_HOURS"
                            : "ALWAYS"
                          : "OFF"}
                        onChange={(event) => void handleConversationMuteChange(
                          event.target.value as ConversationMuteSetting,
                        )}
                        disabled={conversationPreferenceLoading === groupInfoConversation.id}
                        aria-label="Mute this group"
                      >
                        <option value="OFF">Unmuted</option>
                        <option value="8_HOURS">Mute 8h</option>
                        <option value="1_WEEK">Mute 1w</option>
                        <option value="ALWAYS">Mute always</option>
                      </select>
                      <small>Notification settings apply only to your own account.</small>
                    </article>

                    <article className="message-group-invite-panel">
                      <h4>Invitation links</h4>

                      {groupInfoConversation.groupKind === "OFFICIAL" ? (
                        <p>Official group membership is controlled by organization assignment, so invitation links are disabled.</p>
                      ) : !groupInfoConversation.canManageGroup ? (
                        <p>Only the group owner or admins can create and revoke invitation links.</p>
                      ) : groupInviteLoading ? (
                        <p>Loading invitation link...</p>
                      ) : groupInviteLink ? (
                        <>
                          <label className="message-group-invite-url">
                            <span>Active invite URL</span>
                            <input value={groupInviteUrl} readOnly />
                          </label>

                          <div className="message-group-invite-actions">
                            <button type="button" onClick={() => void handleCopyGroupInviteLink()}>
                              Copy link
                            </button>
                            <button type="button" onClick={() => void handleCreateGroupInviteLink()}>
                              Reset link
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => void handleRevokeGroupInviteLink()}
                            >
                              Revoke
                            </button>
                          </div>

                          <small>Created by {groupInviteLink.createdBy.displayName} · {formatConversationTime(groupInviteLink.createdAt)}</small>
                        </>
                      ) : (
                        <>
                          <p>No active invitation link. Generate one to let authorized employees join this personal group.</p>
                          <div className="message-group-invite-actions">
                            <button type="button" onClick={() => void handleCreateGroupInviteLink()}>
                              Generate invite link
                            </button>
                          </div>
                        </>
                      )}

                      {groupInviteNotice && (
                        <small className="message-group-info-success">{groupInviteNotice}</small>
                      )}

                      {groupInviteError && (
                        <small className="message-group-info-danger">{groupInviteError}</small>
                      )}
                    </article>
                  </div>
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
                      <span>
                        {selectedConversation.memberCount} total · {groupInfoAdmins.length} admins · {groupInfoMembers.length} members
                      </span>
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

                      {renderConversationAvatar(conversation, "message-avatar small")}

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
                        {renderAccountAvatar(recipient.account, "message-avatar small")}

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
            className={`message-media-viewer${
              isPdfAttachment(attachmentViewer.attachment) ||
              isTextPreviewAttachment(attachmentViewer.attachment)
                ? " document-viewer"
                : ""
            }${attachmentViewerShowsFooter ? " with-footer" : " without-footer"}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-media-viewer-title"
          >
            <header className="message-media-viewer-header">
              <div className="message-media-viewer-identity">
                {renderAccountAvatar(attachmentViewer.message.sender, "message-avatar small")}
                <div>
                  <strong>{attachmentViewer.message.sender.displayName}</strong>
                  <span id="message-media-viewer-title">
                    {notificationTimestampLabel(attachmentViewer.message.sentAt)} · {attachmentViewer.attachment.originalFileName}
                  </span>
                </div>
              </div>

              <div className="message-media-viewer-actions">
                <button
                  type="button"
                  onClick={() => void handleDownloadAttachment(
                    attachmentViewer.message,
                    attachmentViewer.attachment,
                  )}
                  aria-label={`Download ${attachmentViewer.attachment.originalFileName}`}
                >
                  <AttachmentGlyph name="download" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  className="close"
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
              {attachmentViewerIndex > 0 && (
                <button
                  type="button"
                  className="message-media-viewer-navigation previous"
                  onClick={() => void handlePreviewAttachment(
                    attachmentViewer.message,
                    attachmentViewerItems[attachmentViewerIndex - 1],
                  )}
                  aria-label="View previous attachment"
                >
                  ‹
                </button>
              )}

              {attachmentViewer.loading && (
                <div className="message-media-viewer-state">
                  <span className="message-small-spinner" />
                  <p>Loading preview...</p>
                </div>
              )}

              {!attachmentViewer.loading && attachmentViewer.error && (
                <div className="message-media-viewer-state error">
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
                    autoPlay
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
                      senderDisplayName={attachmentViewer.message.sender.displayName}
                      senderPhotoUrl={
                        profilePhotoUrls[attachmentViewer.message.sender.accountId] ?? null
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
                    onClick={() => void handlePreviewAttachment(
                      attachmentViewer.message,
                      attachmentViewerItems[attachmentViewerIndex + 1],
                    )}
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
                    {attachmentTypeLabel(attachmentViewer.attachment)} · {formatFileSize(
                      attachmentViewer.attachment.fileSizeBytes,
                    )}
                  </span>
                </div>
                {attachmentViewerItems.length > 1 && attachmentViewerIndex >= 0 && (
                  <span>
                    {attachmentViewerIndex + 1} / {attachmentViewerItems.length}
                  </span>
                )}
              </footer>
            )}
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
                          {renderAccountAvatar(request.peer)}

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
                          {renderAccountAvatar(request.peer)}

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
