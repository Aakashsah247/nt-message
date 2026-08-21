import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

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

function formatDateTime(value: string | null, locale: string, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, {
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
  const { t, i18n } = useTranslation("analytics");
  const locale = i18n.resolvedLanguage === "ne" ? "ne-NP" : "en-GB";

  const [analytics, setAnalytics] = useState<MessagingAnalyticsResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!accessToken) {
      setError(t("errors.session"));
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
            : t("errors.load"),
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
  }, [accessToken, refreshKey, t]);

  const primaryCards = useMemo<OverviewCard[]>(() => {
    if (!analytics) {
      return [];
    }

    return [
      {
        label: t("account.totalUsers"),
        value: analytics.totals.users,
        hint: t("account.totalUsersHint", { enabled: formatNumber(analytics.totals.enabledUsers), disabled: formatNumber(analytics.totals.disabledUsers) }),
        meta: t("account.enabledMeta", { percent: percentage(analytics.totals.enabledUsers, analytics.totals.users) }),
        icon: "users",
        tone: "blue",
      },
      {
        label: t("account.activeEmployees"),
        value: analytics.totals.activeEmployeeUsers,
        hint: t("account.activeEmployeesHint"),
        meta: t("account.ofUsers", { percent: percentage(analytics.totals.activeEmployeeUsers, analytics.totals.users) }),
        icon: "active",
        tone: "green",
      },
      {
        label: t("account.enabledAccounts"),
        value: analytics.totals.enabledUsers,
        hint: t("account.enabledAccountsHint"),
        meta: t("account.accessRate", { percent: percentage(analytics.totals.enabledUsers, analytics.totals.users) }),
        icon: "enabled",
        tone: "gold",
      },
      {
        label: t("account.disabledAccounts"),
        value: analytics.totals.disabledUsers,
        hint: t("account.disabledAccountsHint"),
        meta: t("account.ofUsers", { percent: percentage(analytics.totals.disabledUsers, analytics.totals.users) }),
        icon: "disabled",
        tone: "red",
      },
    ];
  }, [analytics, t]);

  if (loading) {
    return (
      <section className="analytics-panel analytics-panel-state" aria-busy="true">
        <div className="spinner" />
        <strong>{t("state.loadingTitle")}</strong>
        <p>{t("state.loadingDescription")}</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="analytics-panel analytics-panel-state" role="alert">
        <strong>{t("state.unavailable")}</strong>
        <p>{error}</p>
        <button
          type="button"
          onClick={() => setRefreshKey((current) => current + 1)}
        >
          {t("common.tryAgain")}
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
      ? analytics.scope.division?.name ?? t("scope.division")
      : analytics.scope.role === "TEAM_MANAGER"
        ? analytics.scope.department?.name ??
          analytics.scope.division?.name ??
          t("scope.department")
        : t("scope.allUnits");
  const operationCards: OperationCard[] = [
    {
      label: t("personal.conversations"),
      value: analytics.totals.conversations,
      hint: t("personal.conversationsHint"),
      icon: "conversations",
    },
    {
      label: t("personal.messages"),
      value: analytics.totals.messages,
      hint: t("personal.messagesHint"),
      icon: "messages",
    },
    {
      label: t("personal.attachments"),
      value: analytics.totals.attachments,
      hint: t("personal.attachmentsHint", { size: formatBytes(attachmentBytes) }),
      icon: "attachments",
    },
    {
      label: t("personal.notifications"),
      value: analytics.totals.notifications,
      hint: t("personal.notificationsHint", { value: formatNumber(analytics.totals.unreadNotifications) }),
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
    labelForItem: (item: MessagingAnalyticsCountItem) => string = (item) => item.label,
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
          <span>{labelForItem(item)}</span>
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
      aria-label={t("hero.aria")}
    >
      <header className="analytics-header">
        <div className="analytics-header__report">
          <span>{t("hero.eyebrow")}</span>
          <h2>{scopeLabel}</h2>
          <p>{t("hero.description")}</p>

          <div className="analytics-header__assurance">
            <strong>{t("hero.title")}</strong>
            <small>
              {t("hero.assuranceDescription")}
            </small>
          </div>
        </div>

        <aside className="analytics-scope-card" aria-label={t("hero.scope")}>
          <div className="analytics-scope-card__icon">
            <AnalyticsIcon name="scope" />
          </div>
          <div>
            <small>{t("hero.authorizedScope")}</small>
            <strong>{t(`role.${analytics.scope.role}`, { defaultValue: formatRole(analytics.scope.role) })}</strong>
            <span>{scopeLabel}</span>
          </div>
          <div className="analytics-scope-card__footer">
            <small>{t("hero.generated", { date: formatDateTime(analytics.generatedAt, locale, t("common.noActivity")) })}</small>
            <button
              type="button"
              onClick={() => setRefreshKey((current) => current + 1)}
            >
              {t("hero.refreshData")}
            </button>
          </div>
        </aside>
      </header>

      <section className="analytics-card-grid" aria-label={t("account.aria")}>
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
            <span>{t("personal.eyebrow")}</span>
            <h3>{t("personal.title")}</h3>
            <p>{t("personal.description")}</p>
          </div>
          <div className="analytics-section-card__badge">{t("personal.badge")}</div>
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
              <span>{t("workforce.eyebrow")}</span>
              <h3>{t("workforce.title")}</h3>
              <p>{t("workforce.description")}</p>
            </div>
          </header>

          <div className="analytics-metric-list">
            {renderDistribution(
              visibleRoles,
              largestRoleCount,
              t("workforce.empty"),
              (item) => t(`role.${item.key}`, { defaultValue: item.label }),
            )}
          </div>
        </article>

        <article className="analytics-section-card analytics-section-card--organization">
          <header>
            <div>
              <span>{t("organization.eyebrow")}</span>
              <h3>{t("organization.title")}</h3>
              <p>{t("organization.description")}</p>
            </div>
          </header>

          <div className="analytics-split-list">
            <section>
              <div className="analytics-split-list__title">
                <strong>{t("organization.divisions")}</strong>
                <span>{t("organization.shown", { count: visibleDivisions.length })}</span>
              </div>
              <div className="analytics-org-list">
                {renderDistribution(
                  visibleDivisions,
                  largestDivisionCount,
                  t("organization.noDivisions"),
                )}
              </div>
            </section>

            <section>
              <div className="analytics-split-list__title">
                <strong>{t("organization.departments")}</strong>
                <span>{t("organization.shown", { count: visibleDepartments.length })}</span>
              </div>
              <div className="analytics-org-list">
                {renderDistribution(
                  visibleDepartments,
                  largestDepartmentCount,
                  t("organization.noDepartments"),
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
              <span>{t("mix.eyebrow")}</span>
              <h3>{t("mix.title")}</h3>
              <p>{t("mix.description")}</p>
            </div>
          </header>

          <div className="analytics-split-list analytics-split-list--compact">
            <section>
              <div className="analytics-split-list__title">
                <strong>{t("mix.conversations")}</strong>
                <span>{t("mix.total", { value: formatNumber(analytics.totals.conversations) })}</span>
              </div>
              <div className="analytics-org-list">
                {renderDistribution(
                  visibleConversationTypes,
                  largestConversationCount,
                  t("mix.noConversations"),
                  (item) => t(`category.conversation.${item.key}`, { defaultValue: item.label }),
                )}
              </div>
            </section>

            <section>
              <div className="analytics-split-list__title">
                <strong>{t("mix.messages")}</strong>
                <span>{t("mix.total", { value: formatNumber(analytics.totals.messages) })}</span>
              </div>
              <div className="analytics-org-list">
                {renderDistribution(
                  visibleMessageTypes,
                  largestMessageCount,
                  t("mix.noMessages"),
                  (item) => t(`category.content.${item.key}`, { defaultValue: item.label }),
                )}
              </div>
            </section>
          </div>
        </article>

        <article className="analytics-section-card">
          <header>
            <div>
              <span>{t("storage.eyebrow")}</span>
              <h3>{t("storage.title")}</h3>
              <p>{t("storage.description")}</p>
            </div>
            <div className="analytics-section-card__badge">
              {t("storage.total", { size: formatBytes(attachmentBytes) })}
            </div>
          </header>

          <div className="analytics-attachment-list">
            {visibleAttachmentTypes.length === 0 && (
              <p className="analytics-empty-row">{t("storage.empty")}</p>
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
                    <span>{t(`category.content.${item.key}`, { defaultValue: item.label })}</span>
                    <small>{t("storage.files", { count: item.count })}</small>
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
            <span>{t("activity.eyebrow")}</span>
            <h3>{t("activity.title")}</h3>
            <p>{t("activity.description")}</p>
          </div>
          <div className="analytics-section-card__badge analytics-section-card__badge--secure">
            {t("activity.privacyProtected")}
          </div>
        </header>

        <div className="analytics-activity-grid">
          <div>
            <AnalyticsIcon name="activity" />
            <span>{t("activity.activeToday")}</span>
            <strong>{formatNumber(analytics.activeUsers.today)}</strong>
          </div>
          <div>
            <AnalyticsIcon name="users" />
            <span>{t("activity.activeWeek")}</span>
            <strong>{formatNumber(analytics.activeUsers.thisWeek)}</strong>
          </div>
          <div>
            <AnalyticsIcon name="messages" />
            <span>{t("activity.messagesToday")}</span>
            <strong>{formatNumber(analytics.recentActivity.messagesToday)}</strong>
          </div>
          <div>
            <AnalyticsIcon name="messages" />
            <span>{t("activity.messagesWeek")}</span>
            <strong>{formatNumber(analytics.recentActivity.messagesThisWeek)}</strong>
          </div>
          <div>
            <AnalyticsIcon name="attachments" />
            <span>{t("activity.attachmentsToday")}</span>
            <strong>{formatNumber(analytics.recentActivity.attachmentsToday)}</strong>
          </div>
          <div>
            <AnalyticsIcon name="notifications" />
            <span>{t("activity.notificationsToday")}</span>
            <strong>{formatNumber(analytics.recentActivity.notificationsToday)}</strong>
          </div>
        </div>

        <footer className="analytics-latest-activity">
          <div className="analytics-latest-activity__icon">
            <AnalyticsIcon name="activity" />
          </div>
          <div>
            <span>{t("activity.latest")}</span>
            <strong>{formatDateTime(analytics.recentActivity.latestMessageAt, locale, t("common.noActivity"))}</strong>
          </div>
          <small>{t("activity.latestDescription")}</small>
        </footer>
      </article>

      <footer className="analytics-data-note">
        <strong>{t("about.title")}</strong>
        <p>{t("about.description")}</p>
      </footer>
    </section>
  );
}
