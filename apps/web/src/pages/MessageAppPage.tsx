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
} from "react";
import { useNavigate } from "react-router";

import { DirectoryButton } from "../components/DirectoryButton";
import { useAuth } from "../context/AuthContext";
import {
  acceptMessageRequest,
  addGroupMembers,
  blockMessageRequest,
  createGroupConversation,
  createOfficialGroupConversation,
  createPrivateConversation,
  declineMessageRequest,
  deleteConversationMessage,
  createConversationAttachmentObjectUrl,
  deleteConversationMessageForMe,
  downloadConversationAttachment,
  editConversationTextMessage,
  forwardConversationMessage,
  leaveGroupConversation,
  listConversationMessages,
  listMessageRequests,
  listMessagingConversations,
  listOfficialGroupAudit,
  listOfficialGroupScopes,
  markConversationRead,
  reconcileOfficialGroups,
  removeGroupMember,
  reactToMessage,
  searchMessagingContacts,
  sendConversationAttachmentMessage,
  sendConversationTextMessage,
  updateGroupConversation,
  updateGroupMemberRole,
} from "../services/messaging.service";
import {
  createMessagingSocket,
} from "../services/messaging-socket.service";
import type {
  MessagingConversationUpdatedPayload,
  MessagingMessageCreatedPayload,
  MessagingMessageHiddenPayload,
  MessagingMessageRequestUpdatedPayload,
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
  MessagingContact,
  MessagingAttachment,
  MessagingConversation,
  MessagingMessage,
  MessagingMessageRequest,
  OfficialGroupAuditEntry,
  OfficialGroupScopeOption,
} from "../types/messaging";


type RealtimeConnectionStatus =
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "DISCONNECTED";
const SELECTED_CONVERSATION_STORAGE_KEY =
  "nt-message:selected-conversation";
const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;
type QuickReaction = (typeof QUICK_REACTIONS)[number];
const QUICK_REACTION_SET = new Set<string>(QUICK_REACTIONS);
const ACCEPTED_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
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
const MAX_VIDEO_ATTACHMENT_BYTES = 200 * 1024 * 1024;


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
    if (!accessToken || !isImageAttachment(attachment)) {
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

      {!isImageAttachment(attachment) && (
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
    isPdfAttachment(attachment) ||
    isTextPreviewAttachment(attachment)
  );
}

function documentIcon(attachment: MessagingAttachment): string {
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

  if (isPdfAttachment(attachment)) {
    return "PDF document";
  }

  if (isTextPreviewAttachment(attachment)) {
    return "Text document";
  }

  return "Document";
}

function attachmentLabel(message: Pick<MessagingMessage, "contentType" | "attachments" | "textContent">): string {
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

  return `File: ${firstAttachment.originalFileName}`;
}

function canForwardMessage(message: MessagingMessage): boolean {
  if (message.isDeleted) {
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
): MessagingMessage[] {
  return messages.map((message) => {
    if (message.id === updatedMessage.id) {
      return{
        ...message,
        ...updatedMessage,
        reactions: updatedMessage.reactions ?? [],

      }
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
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    readStoredConversationId,
  );
  const [messages, setMessages] = useState<MessagingMessage[]>([]);
  const [conversationSearch, setConversationSearch] = useState("");
  const [messageText, setMessageText] = useState("");
  const [replyingTo, setReplyingTo] = useState<MessagingMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<MessagingMessage | null>(null);
  const [messageActionId, setMessageActionId] = useState<string | null>(null);
  const [messageActionMode, setMessageActionMode] = useState<
    "ME" | "EVERYONE" | null
  >(null);
  const [reactionActionId, setReactionActionId] = useState<string | null>(null);
  const [conversationLoading, setConversationLoading] = useState(true);
  const [messageLoading, setMessageLoading] = useState(false);
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<File | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const [attachmentViewer, setAttachmentViewer] = useState<AttachmentViewerState | null>(null);
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

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const previousScrollConversationIdRef = useRef<string | null>(null);
  const previousMessageCountRef = useRef(0);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentViewerRequestRef = useRef(0);
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

  useEffect(() => {
    return () => {
      if (attachmentPreviewUrl) {
        URL.revokeObjectURL(attachmentPreviewUrl);
      }
    };
  }, [attachmentPreviewUrl]);

  useEffect(() => {
    return () => {
      if (attachmentViewer?.objectUrl) {
        URL.revokeObjectURL(attachmentViewer.objectUrl);
      }
    };
  }, [attachmentViewer]);

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
  }, [accessToken]);

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

      setMessages(response.data);
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
      ));

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
    setMessageText("");

    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    void loadMessages(selectedConversationId);
  }, [loadMessages, selectedConversationId]);


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
      await loadMessageRequests(true);
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
      await loadMessageRequests(true);
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

  function focusComposer(): void {
    window.setTimeout(() => {
      composerRef.current?.focus();
    }, 0);
  }


  function clearSelectedAttachment(): void {
    setSelectedAttachment(null);

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
    const maxSize = isImage
      ? MAX_IMAGE_ATTACHMENT_BYTES
      : isVideo
        ? MAX_VIDEO_ATTACHMENT_BYTES
        : MAX_DOCUMENT_ATTACHMENT_BYTES;

    if (file.size > maxSize) {
      setMessageError(
        isImage
          ? "Image attachments must be 20 MB or smaller."
          : isVideo
            ? "Video attachments must be 200 MB or smaller."
            : "Document attachments must be 50 MB or smaller.",
      );
      clearSelectedAttachment();
      return;
    }

    setSelectedAttachment(file);
    setMessageError(null);

    setAttachmentPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }

      return isImage || isVideo ? URL.createObjectURL(file) : null;
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

  async function handleSendMessage(
    event?: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event?.preventDefault();

    const text = messageText.trim();

    if (
      !accessToken ||
      !selectedConversationId ||
      (!text && !selectedAttachment) ||
      sendingMessage
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
          )
        : await sendConversationTextMessage(
            accessToken,
            selectedConversationId,
            text,
            replyingTo?.id,
          );

      setMessageText("");
      setReplyingTo(null);
      clearSelectedAttachment();
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
      typingAccountIds.includes(participant.accountId),
  ) ?? [];
  const peerActivityLabel = selectedConversation?.type === "GROUP"
    ? typingParticipants.length > 0
      ? `${typingParticipants
          .slice(0, 2)
          .map((participant) => participant.displayName)
          .join(", ")}${typingParticipants.length > 2 ? " and others" : ""} typing…`
      : `${selectedConversation.memberCount} members`
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

  return (
    <main className="message-app-shell">
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

          {account?.role !== "EMPLOYEE" && (
            <DirectoryButton />
          )}

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
                      <span className="message-avatar">
                        {initials(title)}
                      </span>

                      {conversationPeer &&
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
                  <span className="message-avatar large">
                    {initials(selectedConversation.title ?? "NT")}
                  </span>

                  {selectedConversation.type === "PRIVATE" &&
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
                        : peerPresence?.isOnline
                          ? " online"
                          : ""
                    }`}
                    aria-live="polite"
                  >
                    {peerActivityLabel}
                  </small>
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
                  <span className="message-private-badge">
                    Private
                  </span>
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
                        className={`message-bubble-row${
                          ownMessage ? " own" : ""
                        }`}
                      >
                        {!ownMessage && (
                          <span className="message-avatar small">
                            {initials(message.sender.displayName)}
                          </span>
                        )}

                        <div className="message-bubble-wrap">
                          {!ownMessage && (
                            <strong className="message-sender-name">
                              {message.sender.displayName}
                            </strong>
                          )}

                          <div className="message-bubble">
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
                                {message.textContent && (
                                  <p>{message.textContent}</p>
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

                    <span>
                      <strong>{selectedAttachment.name}</strong>
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

                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept={ACCEPTED_ATTACHMENT_TYPES}
                  className="message-attachment-input"
                  onChange={handleAttachmentChange}
                  disabled={sendingMessage || editingMessage !== null}
                  aria-label="Choose attachment"
                />

                <textarea
                  ref={composerRef}
                  value={messageText}
                  onChange={(event) => {
                    const value = event.target.value;
                    setMessageText(value);

                    if (selectedConversationId) {
                      updateLocalTyping(selectedConversationId, value);
                    }
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
                  disabled={sendingMessage}
                  aria-label="Message text"
                />

                <div className="message-composer-actions">
                  <span>
                    Attach an image or document · Enter to send
                  </span>

                  <button
                    type="submit"
                    disabled={(!messageText.trim() && !selectedAttachment) || sendingMessage}
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
                    <span className="message-avatar">
                      {initials(contact.displayName)}
                    </span>

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
                            <span className="message-avatar small">
                              {initials(participant.displayName)}
                            </span>

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

                            {(canChangeRole || canRemove) && (
                              <div className="message-group-member-actions">
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
                            )}
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

                            <span className="message-avatar small">
                              {initials(contact.displayName)}
                            </span>

                            <span>
                              <strong>{contact.displayName}</strong>
                              <small>
                                {alreadyMember
                                  ? "Already a member"
                                  : eligible
                                    ? contact.employee?.designation ??
                                      roleLabel(contact.role)
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
