import { useEffect, useMemo, useState } from "react";

import { getMessagingAnalytics } from "../services/messaging.service";

import type {
  MessagingAnalyticsCountItem,
  MessagingAnalyticsResponse,
} from "../types/messaging";

interface MessagingAnalyticsPanelProps {
  accessToken: string;
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

  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "No activity yet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "No activity yet";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function topItems(items: MessagingAnalyticsCountItem[], limit = 5): MessagingAnalyticsCountItem[] {
  return items
    .filter((item) => item.count > 0)
    .slice(0, limit);
}

export function MessagingAnalyticsPanel({ accessToken }: MessagingAnalyticsPanelProps) {
  const [analytics, setAnalytics] = useState<MessagingAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!accessToken) {
      setError("Your secure session is not available. Sign in again.");
      setLoading(false);
      return;
    }

    let active = true;

    setLoading(true);
    setError("");

    // Analytics are fetched from a role-scoped backend endpoint, never from client-side filtering.
    getMessagingAnalytics(accessToken)
      .then((response) => {
        if (!active) {
          return;
        }

        setAnalytics(response);
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setAnalytics(null);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Analytics could not be loaded.",
        );
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

  const primaryCards = useMemo(() => {
    if (!analytics) {
      return [];
    }

    return [
      {
        label: "Total users",
        value: analytics.totals.users,
        hint: `${formatNumber(analytics.totals.enabledUsers)} enabled / ${formatNumber(analytics.totals.disabledUsers)} disabled`,
      },
      {
        label: "Active employees",
        value: analytics.totals.activeEmployeeUsers,
        hint: "Activated, employed and enabled users",
      },
      {
        label: "Conversations",
        value: analytics.totals.conversations,
        hint: "Private, personal and official groups",
      },
      {
        label: "Messages",
        value: analytics.totals.messages,
        hint: `${formatNumber(analytics.recentActivity.messagesToday)} sent today`,
      },
      {
        label: "Attachments",
        value: analytics.totals.attachments,
        hint: `${formatNumber(analytics.recentActivity.attachmentsToday)} shared today`,
      },
      {
        label: "Unread notifications",
        value: analytics.totals.unreadNotifications,
        hint: `${formatNumber(analytics.totals.notifications)} total notifications`,
      },
    ];
  }, [analytics]);

  if (loading) {
    return (
      <section className="analytics-panel analytics-panel-state">
        <div className="spinner" />
        <p>Loading audit-safe analytics...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="analytics-panel analytics-panel-state" role="alert">
        <strong>Analytics unavailable</strong>
        <p>{error}</p>
        <button type="button" onClick={() => setRefreshKey((current) => current + 1)}>
          Try again
        </button>
      </section>
    );
  }

  if (!analytics) {
    return null;
  }

  const visibleDivisions = topItems(analytics.usersByDivision);
  const visibleDepartments = topItems(analytics.usersByDepartment);

  return (
    <section className="analytics-panel" aria-label="Admin analytics dashboard">
      <header className="analytics-header">
        <div>
          <span>Y27 Admin analytics</span>
          <h2>{analytics.scope.label}</h2>
          <p>{analytics.privacyNotice}</p>
        </div>

        <div className="analytics-scope-card">
          <strong>{analytics.scope.role.replaceAll("_", " ")}</strong>
          <span>
            {analytics.scope.department?.name ??
              analytics.scope.division?.name ??
              "All Nepal Telecom units"}
          </span>
          <small>Generated {formatDateTime(analytics.generatedAt)}</small>
        </div>
      </header>

      <section className="analytics-card-grid" aria-label="Key analytics counters">
        {primaryCards.map((card) => (
          <article className="analytics-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{formatNumber(card.value)}</strong>
            <small>{card.hint}</small>
          </article>
        ))}
      </section>

      <section className="analytics-two-column">
        <article className="analytics-section-card">
          <header>
            <h3>Users by role</h3>
            <p>Role distribution inside the allowed scope.</p>
          </header>

          <div className="analytics-metric-list">
            {analytics.usersByRole.map((item) => (
              <div className="analytics-metric-row" key={item.key}>
                <span>{item.label}</span>
                <strong>{formatNumber(item.count)}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="analytics-section-card">
          <header>
            <h3>Messages by type</h3>
            <p>Content mix without exposing private message bodies.</p>
          </header>

          <div className="analytics-metric-list">
            {analytics.messagesByType.map((item) => (
              <div className="analytics-metric-row" key={item.key}>
                <span>{item.label}</span>
                <strong>{formatNumber(item.count)}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="analytics-two-column">
        <article className="analytics-section-card">
          <header>
            <h3>Conversation summary</h3>
            <p>Private chats and group usage.</p>
          </header>

          <div className="analytics-metric-list">
            {analytics.conversationsByType.map((item) => (
              <div className="analytics-metric-row" key={item.key}>
                <span>{item.label}</span>
                <strong>{formatNumber(item.count)}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="analytics-section-card">
          <header>
            <h3>Attachment storage</h3>
            <p>Storage usage by approved attachment type.</p>
          </header>

          <div className="analytics-metric-list">
            {analytics.attachmentsByType.length === 0 && (
              <div className="analytics-empty-row">No attachments shared yet.</div>
            )}

            {analytics.attachmentsByType.map((item) => (
              <div className="analytics-metric-row" key={item.key}>
                <span>{item.label}</span>
                <strong>{formatNumber(item.count)}</strong>
                <small>{formatBytes(item.totalBytes)}</small>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="analytics-two-column">
        <article className="analytics-section-card">
          <header>
            <h3>Organization spread</h3>
            <p>Top divisions and departments by account count.</p>
          </header>

          <div className="analytics-split-list">
            <div>
              <strong>Divisions</strong>
              {visibleDivisions.length === 0 && <span>No division data.</span>}
              {visibleDivisions.map((item) => (
                <p key={item.key}>{item.label}: {formatNumber(item.count)}</p>
              ))}
            </div>

            <div>
              <strong>Departments</strong>
              {visibleDepartments.length === 0 && <span>No department data.</span>}
              {visibleDepartments.map((item) => (
                <p key={item.key}>{item.label}: {formatNumber(item.count)}</p>
              ))}
            </div>
          </div>
        </article>

        <article className="analytics-section-card analytics-activity-card">
          <header>
            <h3>Recent activity</h3>
            <p>Operational activity without private content.</p>
          </header>

          <div className="analytics-activity-grid">
            <div>
              <span>Active today</span>
              <strong>{formatNumber(analytics.activeUsers.today)}</strong>
            </div>
            <div>
              <span>Active this week</span>
              <strong>{formatNumber(analytics.activeUsers.thisWeek)}</strong>
            </div>
            <div>
              <span>Messages this week</span>
              <strong>{formatNumber(analytics.recentActivity.messagesThisWeek)}</strong>
            </div>
            <div>
              <span>Notifications today</span>
              <strong>{formatNumber(analytics.recentActivity.notificationsToday)}</strong>
            </div>
          </div>

          <p className="analytics-latest-activity">
            Latest message activity: {formatDateTime(analytics.recentActivity.latestMessageAt)}
          </p>
        </article>
      </section>
    </section>
  );
}
