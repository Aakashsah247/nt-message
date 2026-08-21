import { useEffect, useMemo, useState } from "react";

import type { CSSProperties, ReactNode } from "react";

import { getMessagingAnalytics } from "../services/messaging.service";

import type {
  MessagingAnalyticsAttachmentItem,
  MessagingAnalyticsCountItem,
  MessagingAnalyticsResponse,
} from "../types/messaging";

interface MessagingAnalyticsPanelProps {
  accessToken: string;
}

type AnalyticsTone = "blue" | "green" | "gold" | "red";
type AnalyticsIconName =
  | "users"
  | "active"
  | "enabled"
  | "disabled"
  | "conversations"
  | "messages"
  | "attachments"
  | "notifications"
  | "activity"
  | "scope";

interface OverviewCard {
  label: string;
  value: number;
  hint: string;
  meta: string;
  icon: AnalyticsIconName;
  tone: AnalyticsTone;
}

interface OperationCard {
  label: string;
  value: number;
  hint: string;
  icon: AnalyticsIconName;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatBytes(value: number): string {
  if (value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const amount = value / 1024 ** unitIndex;

  return `${amount >= 10 || unitIndex === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unitIndex]}`;
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

function formatRole(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function percentage(part: number, total: number): string {
  if (total <= 0) {
    return "0%";
  }

  return `${Math.round((part / total) * 100)}%`;
}

function topItems(
  items: MessagingAnalyticsCountItem[],
  limit = 6,
): MessagingAnalyticsCountItem[] {
  return [...items]
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, limit);
}

function topAttachmentItems(
  items: MessagingAnalyticsAttachmentItem[],
  limit = 6,
): MessagingAnalyticsAttachmentItem[] {
  return [...items]
    .filter((item) => item.count > 0 || item.totalBytes > 0)
    .sort((left, right) => right.totalBytes - left.totalBytes)
    .slice(0, limit);
}

function AnalyticsIcon({ name }: { name: AnalyticsIconName }): ReactNode {
  const commonProps = {
    "aria-hidden": true,
    fill: "none",
    height: 22,
    viewBox: "0 0 24 24",
    width: 22,
  } as const;

  switch (name) {
    case "users":
      return (
        <svg {...commonProps}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "active":
      return (
        <svg {...commonProps}>
          <path d="M3 12h4l2-7 4 14 2-7h6" />
        </svg>
      );
    case "enabled":
      return (
        <svg {...commonProps}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "disabled":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8 8 8 8" />
        </svg>
      );
    case "conversations":
      return (
        <svg {...commonProps}>
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
          <path d="M8 9h8M8 13h5" />
        </svg>
      );
    case "messages":
      return (
        <svg {...commonProps}>
          <path d="M4 4h16v12H8l-4 4Z" />
          <path d="M8 8h8M8 12h6" />
        </svg>
      );
    case "attachments":
      return (
        <svg {...commonProps}>
          <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      );
    case "notifications":
      return (
        <svg {...commonProps}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case "activity":
      return (
        <svg {...commonProps}>
          <path d="M3 3v18h18" />
          <path d="m7 15 4-4 3 3 5-7" />
        </svg>
      );
    case "scope":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        </svg>
      );
  }
}

export function MessagingAnalyticsPanel({
  accessToken,
}: MessagingAnalyticsPanelProps) {
  const [analytics, setAnalytics] = useState<MessagingAnalyticsResponse | null>(
    null,
  );
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

    // Workforce totals follow the authorized organization scope; communication totals are personal.
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

  const primaryCards = useMemo<OverviewCard[]>(() => {
    if (!analytics) {
      return [];
    }

    return [
      {
        label: "Total users",
        value: analytics.totals.users,
        hint: `${formatNumber(analytics.totals.enabledUsers)} enabled · ${formatNumber(analytics.totals.disabledUsers)} disabled`,
        meta: `${percentage(analytics.totals.enabledUsers, analytics.totals.users)} enabled`,
        icon: "users",
        tone: "blue",
      },
      {
        label: "Active employees",
        value: analytics.totals.activeEmployeeUsers,
        hint: "Activated, employed and enabled users",
        meta: `${percentage(analytics.totals.activeEmployeeUsers, analytics.totals.users)} of users`,
        icon: "active",
        tone: "green",
      },
      {
        label: "Enabled accounts",
        value: analytics.totals.enabledUsers,
        hint: "Accounts currently permitted to sign in",
        meta: `${percentage(analytics.totals.enabledUsers, analytics.totals.users)} access rate`,
        icon: "enabled",
        tone: "gold",
      },
      {
        label: "Disabled accounts",
        value: analytics.totals.disabledUsers,
        hint: "Accounts currently blocked from access",
        meta: `${percentage(analytics.totals.disabledUsers, analytics.totals.users)} of users`,
        icon: "disabled",
        tone: "red",
      },
    ];
  }, [analytics]);

  if (loading) {
    return (
      <section className="analytics-panel analytics-panel-state" aria-busy="true">
        <div className="spinner" />
        <strong>Preparing organization analytics</strong>
        <p>Loading scoped workforce data and your personal communication totals...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="analytics-panel analytics-panel-state" role="alert">
        <strong>Analytics unavailable</strong>
        <p>{error}</p>
        <button
          type="button"
          onClick={() => setRefreshKey((current) => current + 1)}
        >
          Try again
        </button>
      </section>
    );
  }

  if (!analytics) {
    return null;
  }

  const visibleRoles = topItems(analytics.usersByRole, 8);
  const visibleDivisions = topItems(analytics.usersByDivision);
  const visibleDepartments = topItems(analytics.usersByDepartment);
  const visibleConversationTypes = topItems(analytics.conversationsByType);
  const visibleMessageTypes = topItems(analytics.messagesByType);
  const visibleAttachmentTypes = topAttachmentItems(analytics.attachmentsByType);
  const largestRoleCount = Math.max(1, ...visibleRoles.map((item) => item.count));
  const largestDivisionCount = Math.max(
    1,
    ...visibleDivisions.map((item) => item.count),
  );
  const largestDepartmentCount = Math.max(
    1,
    ...visibleDepartments.map((item) => item.count),
  );
  const largestConversationCount = Math.max(
    1,
    ...visibleConversationTypes.map((item) => item.count),
  );
  const largestMessageCount = Math.max(
    1,
    ...visibleMessageTypes.map((item) => item.count),
  );
  const largestAttachmentBytes = Math.max(
    1,
    ...visibleAttachmentTypes.map((item) => item.totalBytes),
  );
  const attachmentBytes = analytics.attachmentsByType.reduce(
    (total, item) => total + item.totalBytes,
    0,
  );
  const scopeLabel =
    analytics.scope.role === "SENIOR_MANAGEMENT"
      ? analytics.scope.division?.name ?? "Assigned division"
      : analytics.scope.role === "TEAM_MANAGER"
        ? analytics.scope.department?.name ??
          analytics.scope.division?.name ??
          "Assigned department"
        : "All Nepal Telecom units";
  const operationCards: OperationCard[] = [
    {
      label: "Conversations",
      value: analytics.totals.conversations,
      hint: "Conversations where your account is a participant",
      icon: "conversations",
    },
    {
      label: "Messages",
      value: analytics.totals.messages,
      hint: "Messages sent by your account without exposing content",
      icon: "messages",
    },
    {
      label: "Attachments",
      value: analytics.totals.attachments,
      hint: `${formatBytes(attachmentBytes)} used by attachments you uploaded`,
      icon: "attachments",
    },
    {
      label: "Notifications",
      value: analytics.totals.notifications,
      hint: `${formatNumber(analytics.totals.unreadNotifications)} unread for your account`,
      icon: "notifications",
    },
  ];

  function progressStyle(value: number, maximum: number): CSSProperties {
    const percent = value <= 0 ? 0 : Math.max(7, Math.round((value / maximum) * 100));

    return {
      "--analytics-progress": `${percent}%`,
    } as CSSProperties;
  }

  function renderDistribution(
    items: MessagingAnalyticsCountItem[],
    maximum: number,
    emptyMessage: string,
  ): ReactNode {
    if (items.length === 0) {
      return <p className="analytics-empty-row">{emptyMessage}</p>;
    }

    return items.map((item, index) => (
      <div
        className="analytics-metric-row"
        key={item.key}
        style={{
          ...progressStyle(item.count, maximum),
          "--analytics-index": index,
        } as CSSProperties}
      >
        <div className="analytics-metric-row__heading">
          <span>{item.label}</span>
          <strong>{formatNumber(item.count)}</strong>
        </div>
        <div className="analytics-progress" aria-hidden="true">
          <span />
        </div>
      </div>
    ));
  }

  return (
    <section
      className="analytics-panel analytics-panel--professional"
      aria-label="Organization analytics dashboard"
    >
      <header className="analytics-header">
        <div className="analytics-header__report">
          <span>Analytics report</span>
          <h2>{analytics.scope.label}</h2>
          <p>{analytics.privacyNotice}</p>

          <div className="analytics-header__assurance">
            <strong>Governance scope + personal communication</strong>
            <small>
              Workforce totals follow your role scope. Message, attachment and notification totals belong only to your account.
            </small>
          </div>
        </div>

        <aside className="analytics-scope-card" aria-label="Analytics scope">
          <div className="analytics-scope-card__icon">
            <AnalyticsIcon name="scope" />
          </div>
          <div>
            <small>Authorized scope</small>
            <strong>{formatRole(analytics.scope.role)}</strong>
            <span>{scopeLabel}</span>
          </div>
          <div className="analytics-scope-card__footer">
            <small>Generated {formatDateTime(analytics.generatedAt)}</small>
            <button
              type="button"
              onClick={() => setRefreshKey((current) => current + 1)}
            >
              Refresh data
            </button>
          </div>
        </aside>
      </header>

      <section className="analytics-card-grid" aria-label="Account overview">
        {primaryCards.map((card, index) => (
          <article
            className={`analytics-card analytics-card--${card.tone}`}
            key={card.label}
            style={{ "--analytics-index": index } as CSSProperties}
          >
            <div className="analytics-card__topline">
              <div className="analytics-card__icon">
                <AnalyticsIcon name={card.icon} />
              </div>
              <span>{card.meta}</span>
            </div>
            <div className="analytics-card__value-row">
              <div>
                <span>{card.label}</span>
                <strong>{formatNumber(card.value)}</strong>
              </div>
            </div>
            <small>{card.hint}</small>
          </article>
        ))}
      </section>

      <article className="analytics-section-card analytics-section-card--operations">
        <header>
          <div>
            <span>My communication activity</span>
            <h3>Personal account snapshot</h3>
            <p>Only communication records belonging to your authenticated account.</p>
          </div>
          <div className="analytics-section-card__badge">Current snapshot</div>
        </header>

        <div className="analytics-operation-grid">
          {operationCards.map((card, index) => (
            <div
              className="analytics-operation-card"
              key={card.label}
              style={{ "--analytics-index": index } as CSSProperties}
            >
              <div className="analytics-operation-card__icon">
                <AnalyticsIcon name={card.icon} />
              </div>
              <div>
                <span>{card.label}</span>
                <strong>{formatNumber(card.value)}</strong>
                <small>{card.hint}</small>
              </div>
            </div>
          ))}
        </div>
      </article>

      <section className="analytics-two-column analytics-two-column--primary">
        <article className="analytics-section-card">
          <header>
            <div>
              <span>Workforce distribution</span>
              <h3>Users by role</h3>
              <p>Account distribution inside the authorized scope.</p>
            </div>
          </header>

          <div className="analytics-metric-list">
            {renderDistribution(
              visibleRoles,
              largestRoleCount,
              "No role distribution data is available.",
            )}
          </div>
        </article>

        <article className="analytics-section-card analytics-section-card--organization">
          <header>
            <div>
              <span>Organization coverage</span>
              <h3>Division and department spread</h3>
              <p>Top organization units by enabled account count.</p>
            </div>
          </header>

          <div className="analytics-split-list">
            <section>
              <div className="analytics-split-list__title">
                <strong>Divisions</strong>
                <span>{visibleDivisions.length} shown</span>
              </div>
              <div className="analytics-org-list">
                {renderDistribution(
                  visibleDivisions,
                  largestDivisionCount,
                  "No division data is available.",
                )}
              </div>
            </section>

            <section>
              <div className="analytics-split-list__title">
                <strong>Departments</strong>
                <span>{visibleDepartments.length} shown</span>
              </div>
              <div className="analytics-org-list">
                {renderDistribution(
                  visibleDepartments,
                  largestDepartmentCount,
                  "No department data is available.",
                )}
              </div>
            </section>
          </div>
        </article>
      </section>

      <section className="analytics-two-column analytics-two-column--secondary">
        <article className="analytics-section-card">
          <header>
            <div>
              <span>My communication mix</span>
              <h3>My conversation and message types</h3>
              <p>Personal distribution by system-defined content category.</p>
            </div>
          </header>

          <div className="analytics-split-list analytics-split-list--compact">
            <section>
              <div className="analytics-split-list__title">
                <strong>Conversations</strong>
                <span>{formatNumber(analytics.totals.conversations)} total</span>
              </div>
              <div className="analytics-org-list">
                {renderDistribution(
                  visibleConversationTypes,
                  largestConversationCount,
                  "No conversation data is available.",
                )}
              </div>
            </section>

            <section>
              <div className="analytics-split-list__title">
                <strong>Messages</strong>
                <span>{formatNumber(analytics.totals.messages)} total</span>
              </div>
              <div className="analytics-org-list">
                {renderDistribution(
                  visibleMessageTypes,
                  largestMessageCount,
                  "No message-type data is available.",
                )}
              </div>
            </section>
          </div>
        </article>

        <article className="analytics-section-card">
          <header>
            <div>
              <span>My storage footprint</span>
              <h3>My attachments by type</h3>
              <p>Files uploaded by your account and their current retained size.</p>
            </div>
            <div className="analytics-section-card__badge">
              {formatBytes(attachmentBytes)} total
            </div>
          </header>

          <div className="analytics-attachment-list">
            {visibleAttachmentTypes.length === 0 && (
              <p className="analytics-empty-row">No attachment data is available.</p>
            )}
            {visibleAttachmentTypes.map((item, index) => (
              <div
                className="analytics-attachment-row"
                key={item.key}
                style={{
                  ...progressStyle(item.totalBytes, largestAttachmentBytes),
                  "--analytics-index": index,
                } as CSSProperties}
              >
                <div className="analytics-attachment-row__heading">
                  <div>
                    <span>{item.label}</span>
                    <small>{formatNumber(item.count)} files</small>
                  </div>
                  <strong>{formatBytes(item.totalBytes)}</strong>
                </div>
                <div className="analytics-progress" aria-hidden="true">
                  <span />
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <article className="analytics-section-card analytics-activity-card">
        <header>
          <div>
            <span>Recent activity</span>
            <h3>Workforce access and my communication</h3>
            <p>Active-user counts follow your role scope; communication counts are personal.</p>
          </div>
          <div className="analytics-section-card__badge analytics-section-card__badge--secure">
            Privacy protected
          </div>
        </header>

        <div className="analytics-activity-grid">
          <div>
            <AnalyticsIcon name="activity" />
            <span>Active today</span>
            <strong>{formatNumber(analytics.activeUsers.today)}</strong>
          </div>
          <div>
            <AnalyticsIcon name="users" />
            <span>Active this week</span>
            <strong>{formatNumber(analytics.activeUsers.thisWeek)}</strong>
          </div>
          <div>
            <AnalyticsIcon name="messages" />
            <span>My messages today</span>
            <strong>{formatNumber(analytics.recentActivity.messagesToday)}</strong>
          </div>
          <div>
            <AnalyticsIcon name="messages" />
            <span>My messages this week</span>
            <strong>{formatNumber(analytics.recentActivity.messagesThisWeek)}</strong>
          </div>
          <div>
            <AnalyticsIcon name="attachments" />
            <span>My attachments today</span>
            <strong>{formatNumber(analytics.recentActivity.attachmentsToday)}</strong>
          </div>
          <div>
            <AnalyticsIcon name="notifications" />
            <span>My notifications today</span>
            <strong>{formatNumber(analytics.recentActivity.notificationsToday)}</strong>
          </div>
        </div>

        <footer className="analytics-latest-activity">
          <div className="analytics-latest-activity__icon">
            <AnalyticsIcon name="activity" />
          </div>
          <div>
            <span>My latest recorded message activity</span>
            <strong>{formatDateTime(analytics.recentActivity.latestMessageAt)}</strong>
          </div>
          <small>Timestamp only; message content is never included.</small>
        </footer>
      </article>

      <footer className="analytics-data-note">
        <strong>About this report</strong>
        <p>
          This page shows current aggregate snapshots from the existing analytics API.
          Historical trend charts and date-range comparisons should be added only after
          the backend provides verified time-series aggregates.
        </p>
      </footer>
    </section>
  );
}
