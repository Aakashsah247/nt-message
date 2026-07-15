import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router";

import { MyAccountStatusPanel } from "../components/MyAccountStatusPanel";
import { useAuth } from "../context/AuthContext";
import {
  getPersonalDashboardSummary,
  listMessagingConversations,
} from "../services/messaging.service";

import type {
  MessagingConversation,
  PersonalDashboardSummaryResponse,
} from "../types/messaging";

type DashboardIconName =
  | "messages"
  | "conversation"
  | "notification"
  | "attachment"
  | "profile"
  | "shield"
  | "arrow";

function DashboardIcon({ name }: { name: DashboardIconName }): ReactNode {
  const props = {
    "aria-hidden": true,
    fill: "none",
    height: 22,
    viewBox: "0 0 24 24",
    width: 22,
  } as const;

  switch (name) {
    case "messages":
      return <svg {...props}><path d="M4 4h16v12H8l-4 4Z" /><path d="M8 8h8M8 12h5" /></svg>;
    case "conversation":
      return <svg {...props}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /><path d="M8 9h8M8 13h6" /></svg>;
    case "notification":
      return <svg {...props}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>;
    case "attachment":
      return <svg {...props}><path d="m21.4 11-9.2 9.2a6 6 0 0 1-8.4-8.5L13 2.6a4 4 0 1 1 5.6 5.6l-9.2 9.2a2 2 0 1 1-2.8-2.8L15.1 6" /></svg>;
    case "profile":
      return <svg {...props}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
    case "shield":
      return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></svg>;
    case "arrow":
      return <svg {...props}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatBytes(value: number): string {
  if (value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const amount = value / 1024 ** index;

  return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}

function formatRelativeTime(value: string | null): string {
  if (!value) {
    return "No activity yet";
  }

  const date = new Date(value);
  const difference = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (difference < minute) return "Just now";
  if (difference < hour) return `${Math.floor(difference / minute)} min ago`;
  if (difference < day) return `${Math.floor(difference / hour)} hr ago`;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function conversationLabel(
  conversation: MessagingConversation,
  accountId: string,
): string {
  if (conversation.title?.trim()) {
    return conversation.title;
  }

  const otherParticipant = conversation.participants.find(
    (participant) => participant.accountId !== accountId,
  );

  return otherParticipant?.displayName ?? "Private conversation";
}

function conversationDescription(conversation: MessagingConversation): string {
  if (!conversation.lastMessage) {
    return "No messages yet";
  }

  if (conversation.lastMessage.isDeleted) {
    return "Message deleted";
  }

  if (conversation.lastMessage.textContent?.trim()) {
    return conversation.lastMessage.textContent;
  }

  return conversation.lastMessage.contentType
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Your employee dashboard could not be loaded.";
}

export function EmployeeDashboardPage() {
  const { account, accessToken } = useAuth();
  const [summary, setSummary] = useState<PersonalDashboardSummaryResponse | null>(
    null,
  );
  const [conversations, setConversations] = useState<MessagingConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      setError("Your secure session is unavailable. Sign in again.");
      return;
    }

    let active = true;
    setLoading(true);
    setError("");

    Promise.all([
      getPersonalDashboardSummary(accessToken),
      listMessagingConversations(accessToken, undefined, 5),
    ])
      .then(([summaryResponse, conversationResponse]) => {
        if (!active) {
          return;
        }

        setSummary(summaryResponse);
        setConversations(conversationResponse.data);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(errorMessage(requestError));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, refreshKey]);

  const summaryCards = useMemo(() => {
    if (!summary) {
      return [];
    }

    return [
      {
        label: "Messages today",
        value: formatNumber(summary.totals.messagesToday),
        hint: `${formatNumber(summary.totals.messagesThisWeek)} sent in the last 7 days`,
        icon: "messages" as const,
      },
      {
        label: "Active conversations",
        value: formatNumber(summary.totals.activeConversations),
        hint: "Your current, non-archived conversations",
        icon: "conversation" as const,
      },
      {
        label: "Unread notifications",
        value: formatNumber(summary.totals.unreadNotifications),
        hint: "Notifications waiting for your review",
        icon: "notification" as const,
      },
      {
        label: "My attachments",
        value: formatNumber(summary.totals.attachmentsTotal),
        hint: `${formatBytes(summary.totals.attachmentStorageBytes)} used by your uploads`,
        icon: "attachment" as const,
      },
    ];
  }, [summary]);

  return (
    <main className="employee-dashboard">
      <section className="employee-dashboard__canvas">
        <header className="employee-dashboard__hero">
          <div>
            <span>Employee workspace</span>
            <h1>Welcome, {account?.displayName ?? "NT Message User"}</h1>
            <p>
              Review your own communication activity, recent conversations and
              personal account status from one secure workspace.
            </p>
          </div>

          <div className="employee-dashboard__hero-actions">
            <div className="employee-dashboard__privacy">
              <DashboardIcon name="shield" />
              <div>
                <strong>Personal data scope</strong>
                <small>Only your own communication totals are shown.</small>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRefreshKey((value) => value + 1)}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh dashboard"}
            </button>
          </div>
        </header>

        {error && (
          <section className="employee-dashboard__state" role="alert">
            <div>
              <strong>Dashboard data unavailable</strong>
              <p>{error}</p>
            </div>
            <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>
              Try again
            </button>
          </section>
        )}

        <section className="employee-dashboard__metrics" aria-label="Personal summary">
          {(loading && summaryCards.length === 0
            ? Array.from({ length: 4 }, (_, index) => ({
                label: `Loading ${index + 1}`,
                value: "—",
                hint: "Preparing your personal summary",
                icon: "messages" as const,
              }))
            : summaryCards
          ).map((card, index) => (
            <article
              key={card.label}
              className={loading ? "employee-metric employee-metric--loading" : "employee-metric"}
              style={{ "--employee-index": index } as CSSProperties}
            >
              <div className="employee-metric__icon">
                <DashboardIcon name={card.icon} />
              </div>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.hint}</small>
            </article>
          ))}
        </section>

        <section className="employee-dashboard__main-grid">
          <article className="employee-dashboard__panel employee-dashboard__panel--conversations">
            <header>
              <div>
                <span>Communication</span>
                <h2>Recent conversations</h2>
                <p>Your latest personal, group and official conversations.</p>
              </div>
              <Link to="/messages">Open Messages</Link>
            </header>

            <div className="employee-dashboard__conversation-list">
              {!loading && conversations.length === 0 && (
                <div className="employee-dashboard__empty">
                  <DashboardIcon name="conversation" />
                  <strong>No conversations yet</strong>
                  <p>Your recent conversations will appear here.</p>
                  <Link to="/messages">Start messaging</Link>
                </div>
              )}

              {conversations.map((conversation, index) => (
                <Link
                  className="employee-conversation"
                  key={conversation.id}
                  to="/messages"
                  style={{ "--employee-index": index } as CSSProperties}
                >
                  <span className="employee-conversation__avatar" aria-hidden="true">
                    {conversationLabel(conversation, account?.id ?? "").charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <strong>{conversationLabel(conversation, account?.id ?? "")}</strong>
                    <p>{conversationDescription(conversation)}</p>
                  </div>
                  <aside>
                    <time>{formatRelativeTime(conversation.lastMessageAt)}</time>
                    {conversation.unreadCount > 0 && (
                      <span>{formatNumber(conversation.unreadCount)}</span>
                    )}
                  </aside>
                </Link>
              ))}
            </div>
          </article>

          <aside className="employee-dashboard__side-column">
            <article className="employee-dashboard__panel employee-dashboard__panel--quick">
              <header>
                <div>
                  <span>Quick access</span>
                  <h2>Continue working</h2>
                </div>
              </header>

              <div className="employee-dashboard__quick-actions">
                <Link to="/messages">
                  <DashboardIcon name="messages" />
                  <div><strong>Open Messages</strong><small>Continue secure conversations</small></div>
                  <DashboardIcon name="arrow" />
                </Link>
                <Link to="/messages/starred">
                  <DashboardIcon name="attachment" />
                  <div><strong>Starred messages</strong><small>Review saved information</small></div>
                  <DashboardIcon name="arrow" />
                </Link>
                <a href="#my-account-status">
                  <DashboardIcon name="profile" />
                  <div><strong>My account status</strong><small>Review identity and activation</small></div>
                  <DashboardIcon name="arrow" />
                </a>
              </div>
            </article>

            <article className="employee-dashboard__panel employee-dashboard__panel--privacy">
              <DashboardIcon name="shield" />
              <div>
                <span>Privacy boundary</span>
                <strong>Your dashboard belongs only to you</strong>
                <p>{summary?.privacyNotice ?? "No other employee communication totals are included."}</p>
              </div>
            </article>
          </aside>
        </section>

        <section id="my-account-status" className="employee-dashboard__account-section">
          <MyAccountStatusPanel accessToken={accessToken ?? ""} />
        </section>
      </section>
    </main>
  );
}
