import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  FormEvent,
  KeyboardEvent,
} from "react";
import { useNavigate } from "react-router";

import { DirectoryButton } from "../components/DirectoryButton";
import { useAuth } from "../context/AuthContext";
import {
  acceptMessageRequest,
  blockMessageRequest,
  createPrivateConversation,
  declineMessageRequest,
  listConversationMessages,
  listMessageRequests,
  listMessagingConversations,
  markConversationRead,
  searchMessagingContacts,
  sendConversationTextMessage,
} from "../services/messaging.service";
import {
  createMessagingSocket,
} from "../services/messaging-socket.service";
import type {
  MessagingConversationUpdatedPayload,
  MessagingMessageCreatedPayload,
  MessagingMessageRequestUpdatedPayload,
  MessagingPresenceSnapshotPayload,
  MessagingPresenceState,
  MessagingReceiptUpdatedPayload,
  MessagingSocket,
  MessagingTypingUpdatedPayload,
} from "../services/messaging-socket.service";
import type {
  MessageRequestListResponse,
  MessagingContact,
  MessagingConversation,
  MessagingMessage,
  MessagingMessageRequest,
} from "../types/messaging";


type RealtimeConnectionStatus =
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "DISCONNECTED";
const SELECTED_CONVERSATION_STORAGE_KEY =
  "nt-message:selected-conversation";

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

  return `${prefix}${message.textContent ?? "Message"}`;
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
  const [conversationLoading, setConversationLoading] = useState(true);
  const [messageLoading, setMessageLoading] = useState(false);
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
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
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    void loadMessages(selectedConversationId);
  }, [loadMessages, selectedConversationId]);


  useEffect(() => {
    if (!messageLoading && !olderMessagesLoading) {
      const element = messageListRef.current;

      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    }
  }, [messageLoading, messages, olderMessagesLoading]);

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

  async function handleSendMessage(
    event?: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event?.preventDefault();

    const text = messageText.trim();

    if (
      !accessToken ||
      !selectedConversationId ||
      !text ||
      sendingMessage
    ) {
      return;
    }

    setSendingMessage(true);
    setMessageError(null);
    stopLocalTyping(selectedConversationId);

    try {
      const response = await sendConversationTextMessage(
        accessToken,
        selectedConversationId,
        text,
      );

      setMessageText("");
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

  const peer = selectedConversation?.participants.find(
    (participant) => participant.accountId !== account?.id,
  ) ?? null;
  const peerPresence = peer
    ? presenceByAccountId[peer.accountId]
    : undefined;
  const peerIsTyping = Boolean(
    peer &&
    selectedConversationId &&
    typingByConversation[selectedConversationId]?.includes(
      peer.accountId,
    ),
  );
  const peerActivityLabel = peerIsTyping
    ? "Typing…"
    : peerPresence?.isOnline
      ? "Online"
      : peerPresence?.lastSeenAt
        ? formatLastSeen(peerPresence.lastSeenAt)
        : "Offline";

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
                  Start a private conversation with an eligible NT account.
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
                const conversationPeer = conversation.participants.find(
                  (participant) => participant.accountId !== account?.id,
                );
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
                        {conversationPeer?.employee?.designation ??
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
              <span>Private messaging</span>
              <h2>Select a conversation</h2>
              <p>
                Choose an existing conversation or start a new secure message.
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

                  {peerPresence?.isOnline && (
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
                    {peer?.employee?.designation ?? roleLabel(peer?.role ?? "EMPLOYEE")}
                    {peer?.employee?.department?.name
                      ? ` · ${peer.employee.department.name}`
                      : peer?.employee?.division?.name
                        ? ` · ${peer.employee.division.name}`
                        : ""}
                  </p>
                  <small
                    className={`message-peer-activity${
                      peerIsTyping
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

                <span className="message-private-badge">
                  Private
                </span>
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
                      Send the first private message to {selectedConversation.title}.
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
                            {message.isDeleted ? (
                              <em>This message was deleted.</em>
                            ) : (
                              <p>{message.textContent}</p>
                            )}
                          </div>

                          <div className="message-bubble-meta">
                            <time>{formatMessageTime(message.sentAt)}</time>

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

                {peerIsTyping && peer && (
                  <div
                    className="message-typing-indicator"
                    aria-live="polite"
                  >
                    <span className="message-avatar small">
                      {initials(peer.displayName)}
                    </span>
                    <span className="message-typing-bubble">
                      <span aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                      <small>{peer.displayName} is typing</small>
                    </span>
                  </div>
                )}
              </div>

              <form
                className="message-composer"
                onSubmit={(event) => void handleSendMessage(event)}
              >
                <textarea
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
                  placeholder={`Message ${selectedConversation.title ?? "conversation"}`}
                  maxLength={5000}
                  rows={1}
                  disabled={sendingMessage}
                  aria-label="Message text"
                />

                <div className="message-composer-actions">
                  <span>
                    Enter to send · Shift + Enter for a new line
                  </span>

                  <button
                    type="submit"
                    disabled={!messageText.trim() || sendingMessage}
                  >
                    {sendingMessage ? "Sending..." : "Send"}
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
