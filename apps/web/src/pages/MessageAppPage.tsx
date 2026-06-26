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
  createPrivateConversation,
  listConversationMessages,
  listMessagingConversations,
  markConversationRead,
  searchMessagingContacts,
  sendConversationTextMessage,
} from "../services/messaging.service";
import {
  createMessagingSocket,
} from "../services/messaging-socket.service";
import type {
  MessagingAccount,
  MessagingConversation,
  MessagingMessage,
} from "../types/messaging";

const CONVERSATION_POLL_INTERVAL = 6000;

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

function roleLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
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
  const [contacts, setContacts] = useState<MessagingAccount[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [creatingConversationId, setCreatingConversationId] = useState<string | null>(null);

  const messageListRef = useRef<HTMLDivElement | null>(null);

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


  useEffect(() => {
    if (!accessToken) {
      setRealtimeStatus("DISCONNECTED");
      return undefined;
    }

    const socket = createMessagingSocket(accessToken);

    const handleConnect = (): void => {
      setRealtimeStatus("CONNECTING");
      socket.emit("messaging:ping");
    };

    const handleReady = (): void => {
      setRealtimeStatus("CONNECTED");
    };

    const handlePong = (): void => {
      setRealtimeStatus("CONNECTED");
    };

    const handleDisconnect = (): void => {
      setRealtimeStatus(
        socket.active
          ? "RECONNECTING"
          : "DISCONNECTED",
      );
    };

    const handleConnectError = (): void => {
      setRealtimeStatus(
        socket.active
          ? "RECONNECTING"
          : "DISCONNECTED",
      );
    };

    socket.on("connect", handleConnect);
    socket.on("messaging:ready", handleReady);
    socket.on("messaging:pong", handlePong);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("messaging:ready", handleReady);
      socket.off("messaging:pong", handlePong);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.disconnect();
    };
  }, [accessToken]);

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
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    void loadMessages(selectedConversationId);
  }, [loadMessages, selectedConversationId]);

  useEffect(() => {
    if (!accessToken) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void loadConversations(true);

      if (selectedConversationId) {
        void loadMessages(selectedConversationId, true);
      }
    }, CONVERSATION_POLL_INTERVAL);

    return () => window.clearInterval(timer);
  }, [
    accessToken,
    loadConversations,
    loadMessages,
    selectedConversationId,
  ]);

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
    setContactSearch("");
    setContacts([]);
    setContactError(null);
    setNewConversationOpen(true);
  }

  async function handleCreateConversation(
    contact: MessagingAccount,
  ): Promise<void> {
    if (!accessToken) {
      return;
    }

    setCreatingConversationId(contact.accountId);
    setContactError(null);

    try {
      const response = await createPrivateConversation(
        accessToken,
        contact.accountId,
      );

      setConversations((current) => {
        const withoutConversation = current.filter(
          (conversation) => conversation.id !== response.data.id,
        );

        return [response.data, ...withoutConversation];
      });

      setSelectedConversationId(response.data.id);
      setNewConversationOpen(false);
      setContactSearch("");
      await loadConversations(true, response.data.id);
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

            <button
              type="button"
              className="message-new-button"
              onClick={openNewConversation}
              aria-label="Start a new private conversation"
            >
              +
            </button>
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
                    <span className="message-avatar">
                      {initials(title)}
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

                <span className="message-avatar large">
                  {initials(selectedConversation.title ?? "NT")}
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
              </div>

              <form
                className="message-composer"
                onSubmit={(event) => void handleSendMessage(event)}
              >
                <textarea
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
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
                    disabled={creatingConversationId !== null}
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
                    </span>

                    <b>
                      {creatingConversationId === contact.accountId
                        ? "Opening..."
                        : "Message"}
                    </b>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
