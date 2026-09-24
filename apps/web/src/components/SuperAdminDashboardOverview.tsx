import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { getAdminAccountRequestSummary } from "../services/account-request.service";
import { getSuperAdminMonitoring } from "../services/monitoring.service";
import type {
  AccountRequestStatus,
  AdminAccountRequestListItem,
  AdminAccountRequestSummaryResponse,
} from "../types/account-request";
import type { SuperAdminMonitoringResponse } from "../types/monitoring";
import { ManagementIcon } from "./layout/ManagementIcon";

interface SuperAdminDashboardOverviewProps {
  accessToken: string;
}

type DashboardTone = "neutral" | "success" | "warning" | "danger";

interface DashboardActionItem {
  key: string;
  label: string;
  description: string;
  count: number;
  href: string;
  tone: DashboardTone;
}

const EMPTY_COUNTS: Record<AccountRequestStatus, number> = {
  DRAFT: 0,
  PENDING_APPROVAL: 0,
  APPROVED: 0,
  REJECTED: 0,
  ACTIVATION_PENDING: 0,
  ACTIVATED: 0,
};

function formatDateTime(value: string | null, locale: string, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours <= 0) return `${remaining}m`;
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
}

function requestStatusTone(status: AccountRequestStatus): DashboardTone {
  if (status === "ACTIVATED" || status === "APPROVED") return "success";
  if (status === "REJECTED") return "danger";
  if (status === "PENDING_APPROVAL" || status === "ACTIVATION_PENDING") return "warning";
  return "neutral";
}

function requestOfficeLabel(request: AdminAccountRequestListItem, fallback: string): string {
  return request.office?.name ?? request.intendedOrgUnit?.name ?? fallback;
}

export function SuperAdminDashboardOverview({
  accessToken,
}: SuperAdminDashboardOverviewProps) {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.resolvedLanguage === "ne" ? "ne-NP" : "en-GB";
  const [monitoring, setMonitoring] = useState<SuperAdminMonitoringResponse | null>(null);
  const [summary, setSummary] = useState<AdminAccountRequestSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [partialError, setPartialError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (active) setLoading(true);
    });

    Promise.allSettled([
      getSuperAdminMonitoring(accessToken, 7),
      getAdminAccountRequestSummary(accessToken),
    ]).then(([monitoringResult, summaryResult]) => {
      if (!active) return;

      if (monitoringResult.status === "fulfilled") {
        setMonitoring(monitoringResult.value);
      }
      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value);
      }

      setPartialError(
        monitoringResult.status === "rejected" || summaryResult.status === "rejected",
      );
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [accessToken, refreshKey]);

  const counts = summary?.counts ?? EMPTY_COUNTS;

  const actionItems = useMemo<DashboardActionItem[]>(() => {
    const organization = monitoring?.organizationHealth;
    const officeSetupCount =
      monitoring?.officeHealth.filter(
        (office) => office.isActive && office.setupStatus === "SETUP_INCOMPLETE",
      ).length ?? 0;
    const requestReviewCount = counts.PENDING_APPROVAL + counts.ACTIVATION_PENDING;
    const placementCount =
      (organization?.employeesWithoutPlacement ?? 0) + (organization?.placementPending ?? 0);

    const items: DashboardActionItem[] = [
      {
        key: "office-setup",
        label: t("dashboardLite.actions.officeSetup"),
        description: t("dashboardLite.actions.officeSetupDescription"),
        count: officeSetupCount,
        href: "/super-admin/offices",
        tone: "danger",
      },
      {
        key: "leadership",
        label: t("dashboardLite.actions.leadership"),
        description: t("dashboardLite.actions.leadershipDescription"),
        count: organization?.orgUnitsWithoutHead ?? 0,
        href: "/organization",
        tone: "warning",
      },
      {
        key: "request-review",
        label: t("dashboardLite.actions.requestReview"),
        description: t("dashboardLite.actions.requestReviewDescription"),
        count: requestReviewCount,
        href: "/super-admin/account-requests",
        tone: "warning",
      },
      {
        key: "returned",
        label: t("dashboardLite.actions.returned"),
        description: t("dashboardLite.actions.returnedDescription"),
        count: counts.REJECTED,
        href: "/super-admin/account-requests?status=REJECTED",
        tone: "warning",
      },
      {
        key: "placement",
        label: t("dashboardLite.actions.placement"),
        description: t("dashboardLite.actions.placementDescription"),
        count: placementCount,
        href: "/organization",
        tone: "warning",
      },
    ];

    return items.filter((item) => item.count > 0);
  }, [counts.ACTIVATION_PENDING, counts.PENDING_APPROVAL, counts.REJECTED, monitoring, t]);

  const attentionTotal = actionItems.reduce((total, item) => total + item.count, 0);
  const recentActivity = summary?.recentActivity.slice(0, 3) ?? [];
  const updatedAt = monitoring?.generatedAt ?? summary?.generatedAt ?? null;

  const kpis = [
    {
      key: "offices",
      label: t("dashboardLite.kpi.offices"),
      value: monitoring?.organizationHealth.activeOffices ?? "—",
      detail: monitoring
        ? t("dashboardLite.kpi.officesDetail", {
            active: monitoring.organizationHealth.activeOffices,
            inactive: monitoring.organizationHealth.inactiveOffices,
          })
        : t("dashboardLite.loading"),
      href: "/super-admin/offices",
      icon: "organization" as const,
      tone: "neutral" as DashboardTone,
    },
    {
      key: "accounts",
      label: t("dashboardLite.kpi.accounts"),
      value: monitoring?.accountHealth.totalAccounts ?? "—",
      detail: monitoring
        ? t("dashboardLite.kpi.accountsDetail", {
            enabled: monitoring.accountHealth.enabledAccounts,
            disabled: monitoring.accountHealth.disabledAccounts,
          })
        : t("dashboardLite.loading"),
      href: "/directory",
      icon: "directory" as const,
      tone: "neutral" as DashboardTone,
    },
    {
      key: "requests",
      label: t("dashboardLite.kpi.requests"),
      value: summary?.totalRequests ?? "—",
      detail: summary
        ? t("dashboardLite.kpi.requestsDetail", { count: summary.attentionTotal })
        : t("dashboardLite.loading"),
      href: "/super-admin/account-requests",
      icon: "requests" as const,
      tone: "neutral" as DashboardTone,
    },
    {
      key: "attention",
      label: t("dashboardLite.kpi.attention"),
      value: monitoring || summary ? attentionTotal : "—",
      detail:
        attentionTotal > 0
          ? t("dashboardLite.kpi.attentionDetail", { count: attentionTotal })
          : t("dashboardLite.kpi.allClear"),
      href: actionItems[0]?.href ?? "/super-admin/account-requests",
      icon: "monitoring" as const,
      tone: attentionTotal > 0 ? ("warning" as DashboardTone) : ("success" as DashboardTone),
    },
  ];

  const officeRows = useMemo(() => {
    if (!monitoring) return [];

    return [...monitoring.officeHealth]
      .sort((left, right) => {
        const leftRank = left.setupStatus === "SETUP_INCOMPLETE" ? 0 : left.isActive ? 1 : 2;
        const rightRank = right.setupStatus === "SETUP_INCOMPLETE" ? 0 : right.isActive ? 1 : 2;
        if (leftRank !== rightRank) return leftRank - rightRank;
        return left.name.localeCompare(right.name);
      })
      .slice(0, 4);
  }, [monitoring]);

  const emergency = monitoring?.emergencyDelivery;
  const emergencyHasIssue = Boolean(
    emergency && (emergency.failed > 0 || emergency.pending > 0 || emergency.skippedNoPhone > 0),
  );

  return (
    <main className="super-admin-lite">
      <header className="super-admin-lite__header">
        <div className="super-admin-lite__heading">
          <span className="super-admin-lite__eyebrow">{t("dashboardLite.eyebrow")}</span>
          <h1>{t("dashboardLite.title")}</h1>
          <p>{t("dashboardLite.description")}</p>
        </div>

        <div className="super-admin-lite__header-actions">
          <span className="super-admin-lite__updated">
            {updatedAt
              ? t("dashboardLite.updated", {
                  date: formatDateTime(updatedAt, locale, t("dashboard.timeUnavailable")),
                })
              : t("dashboardLite.loading")}
          </span>
          <button
            type="button"
            className={`super-admin-lite__refresh${loading ? " is-loading" : ""}`}
            onClick={() => setRefreshKey((current) => current + 1)}
            disabled={loading}
          >
            <span className="super-admin-lite__refresh-icon" aria-hidden="true">↻</span>
            {loading ? t("dashboardLite.refreshing") : t("dashboardLite.refresh")}
          </button>
        </div>
      </header>

      {partialError && (
        <div className="super-admin-lite__notice" role="status">
          {t("dashboardLite.partialError")}
        </div>
      )}

      <section className="super-admin-lite__kpis" aria-label={t("dashboardLite.kpi.aria")}>
        {kpis.map((kpi, index) => (
          <Link
            key={kpi.key}
            className={`super-admin-lite__kpi super-admin-lite__kpi--${kpi.tone}`}
            data-order={index + 1}
            to={kpi.href}
          >
            <span className="super-admin-lite__kpi-icon" aria-hidden="true">
              <ManagementIcon name={kpi.icon} />
            </span>
            <span className="super-admin-lite__kpi-copy">
              <span>{kpi.label}</span>
              <strong>{loading && !monitoring && !summary ? "—" : kpi.value}</strong>
              <small>{kpi.detail}</small>
            </span>
            <span className="super-admin-lite__chevron" aria-hidden="true">→</span>
          </Link>
        ))}
      </section>

      <section className="super-admin-lite__primary-grid">
        <article className="super-admin-lite__panel super-admin-lite__actions">
          <header className="super-admin-lite__panel-header">
            <div>
              <span className="super-admin-lite__section-label">{t("dashboardLite.actions.eyebrow")}</span>
              <h2>{t("dashboardLite.actions.title")}</h2>
            </div>
            <Link to="/super-admin/account-requests">{t("dashboardLite.viewAll")}</Link>
          </header>

          <div className="super-admin-lite__action-list">
            {loading && !monitoring && !summary ? (
              <div className="super-admin-lite__skeleton-list" aria-label={t("dashboardLite.loading")}>
                <span /><span /><span />
              </div>
            ) : actionItems.length > 0 ? (
              actionItems.slice(0, 4).map((item) => (
                <Link key={item.key} className="super-admin-lite__action-row" to={item.href}>
                  <span className={`super-admin-lite__dot super-admin-lite__dot--${item.tone}`} aria-hidden="true" />
                  <span className="super-admin-lite__action-copy">
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  <strong className="super-admin-lite__action-count">{item.count}</strong>
                  <span className="super-admin-lite__chevron" aria-hidden="true">→</span>
                </Link>
              ))
            ) : (
              <div className="super-admin-lite__empty">
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>{t("dashboardLite.actions.clearTitle")}</strong>
                  <small>{t("dashboardLite.actions.clearDescription")}</small>
                </div>
              </div>
            )}
          </div>
        </article>

        <article className="super-admin-lite__panel super-admin-lite__offices">
          <header className="super-admin-lite__panel-header">
            <div>
              <span className="super-admin-lite__section-label">{t("dashboardLite.offices.eyebrow")}</span>
              <h2>{t("dashboardLite.offices.title")}</h2>
            </div>
            <Link to="/super-admin/offices">{t("dashboardLite.offices.manage")}</Link>
          </header>

          <div className="super-admin-lite__office-list">
            {officeRows.map((office) => {
              const isHealthy = office.setupStatus === "HEALTHY";
              const isInactive = office.setupStatus === "INACTIVE";
              const tone = isInactive ? "neutral" : isHealthy ? "success" : "warning";
              return (
                <Link key={office.officeId} className="super-admin-lite__office-row" to="/super-admin/offices">
                  <span className="super-admin-lite__office-copy">
                    <strong>{office.name}</strong>
                    <small>
                      {t("dashboardLite.offices.meta", {
                        people: office.activePeople,
                        units: office.activeUnits,
                      })}
                    </small>
                  </span>
                  <span className="super-admin-lite__office-leadership">
                    {office.officeHeadAssigned
                      ? t("dashboardLite.offices.leadership", {
                          covered: office.headedFormalUnits,
                          total: office.formalUnits,
                        })
                      : t("dashboardLite.offices.officeHeadMissing")}
                  </span>
                  <span className={`super-admin-lite__badge super-admin-lite__badge--${tone}`}>
                    {isInactive
                      ? t("dashboardLite.offices.inactive")
                      : isHealthy
                        ? t("dashboardLite.offices.ready")
                        : t("dashboardLite.offices.attention")}
                  </span>
                </Link>
              );
            })}
            {!loading && officeRows.length === 0 && (
              <div className="super-admin-lite__empty super-admin-lite__empty--small">
                <span aria-hidden="true">○</span>
                <div><strong>{t("dashboardLite.offices.empty")}</strong></div>
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="super-admin-lite__secondary-grid">
        <article className="super-admin-lite__panel super-admin-lite__recent">
          <header className="super-admin-lite__panel-header">
            <div>
              <span className="super-admin-lite__section-label">{t("dashboardLite.recent.eyebrow")}</span>
              <h2>{t("dashboardLite.recent.title")}</h2>
            </div>
            <Link to="/super-admin/account-requests">{t("dashboardLite.viewAll")}</Link>
          </header>

          <div className="super-admin-lite__recent-list">
            {recentActivity.map((request) => (
              <Link
                key={request.id}
                className="super-admin-lite__recent-row"
                to={`/super-admin/account-requests?status=${request.status}`}
              >
                <span className={`super-admin-lite__status super-admin-lite__status--${requestStatusTone(request.status)}`}>
                  {t(`accountRequest.status.${request.status}.short`)}
                </span>
                <span className="super-admin-lite__recent-copy">
                  <strong>{request.empName}</strong>
                  <small>{requestOfficeLabel(request, t("dashboardLite.recent.officeUnavailable"))}</small>
                </span>
                <time dateTime={request.updatedAt}>
                  {formatDateTime(request.updatedAt, locale, "—")}
                </time>
                <span className="super-admin-lite__chevron" aria-hidden="true">→</span>
              </Link>
            ))}
            {!loading && recentActivity.length === 0 && (
              <div className="super-admin-lite__empty super-admin-lite__empty--small">
                <span aria-hidden="true">○</span>
                <div><strong>{t("dashboardLite.recent.empty")}</strong></div>
              </div>
            )}
          </div>
        </article>

        <article className="super-admin-lite__panel super-admin-lite__snapshot">
          <header className="super-admin-lite__panel-header">
            <div>
              <span className="super-admin-lite__section-label">{t("dashboardLite.snapshot.eyebrow")}</span>
              <h2>{t("dashboardLite.snapshot.title")}</h2>
            </div>
            <Link to="/super-admin?view=analytics">{t("dashboardLite.snapshot.analytics")}</Link>
          </header>

          <div className="super-admin-lite__snapshot-list">
            <div className="super-admin-lite__snapshot-row">
              <span className="super-admin-lite__snapshot-icon" aria-hidden="true"><ManagementIcon name="directory" /></span>
              <div>
                <strong>{t("dashboardLite.snapshot.presence")}</strong>
                <small>
                  {monitoring
                    ? t("dashboardLite.snapshot.presenceMeta", {
                        active: monitoring.totals.active,
                        idle: monitoring.totals.idle,
                        offline: monitoring.totals.offline,
                      })
                    : t("dashboardLite.loading")}
                </small>
              </div>
            </div>

            <div className="super-admin-lite__snapshot-row">
              <span className="super-admin-lite__snapshot-icon" aria-hidden="true"><ManagementIcon name="analytics" /></span>
              <div>
                <strong>{t("dashboardLite.snapshot.activity")}</strong>
                <small>
                  {monitoring
                    ? t("dashboardLite.snapshot.activityMeta", {
                        actions: monitoring.totals.periodActions,
                        time: formatDuration(monitoring.totals.periodActiveMinutes),
                      })
                    : t("dashboardLite.loading")}
                </small>
              </div>
            </div>

            <div className={`super-admin-lite__snapshot-row${emergencyHasIssue ? " is-warning" : ""}`}>
              <span className="super-admin-lite__snapshot-icon" aria-hidden="true"><ManagementIcon name="monitoring" /></span>
              <div>
                <strong>{t("dashboardLite.snapshot.emergency")}</strong>
                <small>
                  {!emergency
                    ? t("dashboardLite.loading")
                    : emergency.total === 0
                      ? t("dashboardLite.snapshot.emergencyEmpty")
                      : emergencyHasIssue
                        ? t("dashboardLite.snapshot.emergencyIssue", {
                            failed: emergency.failed,
                            pending: emergency.pending,
                          })
                        : t("dashboardLite.snapshot.emergencyHealthy", {
                            rate: emergency.deliveryRate ?? 0,
                            sent: emergency.sent,
                          })}
                </small>
              </div>
              {emergencyHasIssue && (
                <Link className="super-admin-lite__inline-link" to="/super-admin?view=monitoring">
                  {t("dashboardLite.snapshot.review")}
                </Link>
              )}
            </div>
          </div>
        </article>
      </section>

      <footer className="super-admin-lite__privacy">
        <span aria-hidden="true">✓</span>
        {t("dashboardLite.privacy")}
      </footer>
    </main>
  );
}
