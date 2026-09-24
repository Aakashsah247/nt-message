import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import type { CSSProperties, ReactNode } from "react";

import { getAdminAccountRequestSummary } from "../services/account-request.service";
import { getSuperAdminMonitoring } from "../services/monitoring.service";

import type { AdminAccountRequestSummaryResponse } from "../types/account-request";
import type {
  SuperAdminMonitoringResponse,
  SystemAnalyticsRangeDays,
} from "../types/monitoring";

interface SuperAdminSystemAnalyticsPanelProps {
  accessToken: string;
  mode?: "analytics" | "dashboard";
}

type AnalyticsTone = "blue" | "green" | "gold" | "red";
type AnalyticsIconName =
  | "health"
  | "users"
  | "attention"
  | "organization"
  | "activity"
  | "scope"
  | "requests"
  | "emergency"
  | "leadership"
  | "placement";

interface OverviewCard {
  label: string;
  value: number | string;
  hint: string;
  meta: string;
  icon: AnalyticsIconName;
  tone: AnalyticsTone;
  actionPath?: string;
}

interface AnalyticsCountItem {
  key: string;
  label: string;
  count: number;
  tone?: AnalyticsTone;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDateTime(
  value: string | null,
  locale: string,
  fallback: string,
): string {
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

function percentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
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
    case "health":
      return (
        <svg {...commonProps}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "users":
      return (
        <svg {...commonProps}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "attention":
      return (
        <svg {...commonProps}>
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.3 3.7 2.5 17.2A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.8L13.7 3.7a2 2 0 0 0-3.4 0Z" />
        </svg>
      );
    case "organization":
      return (
        <svg {...commonProps}>
          <path d="M12 4v5M6 20v-5h12v5M6 15v-3h12v3" />
          <rect x="9" y="2" width="6" height="4" rx="1" />
          <rect x="3" y="18" width="6" height="4" rx="1" />
          <rect x="15" y="18" width="6" height="4" rx="1" />
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
    case "requests":
      return (
        <svg {...commonProps}>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </svg>
      );
    case "emergency":
      return (
        <svg {...commonProps}>
          <path d="M12 3 3 19h18L12 3Z" />
          <path d="M12 9v4M12 16h.01" />
        </svg>
      );
    case "leadership":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="7" r="3" />
          <path d="M6 21v-2a6 6 0 0 1 12 0v2M5 9l-2 2 2 2M19 9l2 2-2 2" />
        </svg>
      );
    case "placement":
      return (
        <svg {...commonProps}>
          <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" />
          <circle cx="12" cy="10" r="2" />
        </svg>
      );
  }
}

export function SuperAdminSystemAnalyticsPanel({
  accessToken,
  mode = "analytics",
}: SuperAdminSystemAnalyticsPanelProps) {
  const { t, i18n } = useTranslation("analytics");
  const navigate = useNavigate();
  const locale = i18n.resolvedLanguage === "ne" ? "ne-NP" : "en-GB";
  const dashboardMode = mode === "dashboard";

  const [monitoring, setMonitoring] =
    useState<SuperAdminMonitoringResponse | null>(null);
  const [requests, setRequests] =
    useState<AdminAccountRequestSummaryResponse | null>(null);
  const [rangeDays, setRangeDays] =
    useState<SystemAnalyticsRangeDays>(dashboardMode ? 7 : 1);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setErrors([]);
    });

    Promise.allSettled([
      getSuperAdminMonitoring(accessToken, rangeDays),
      getAdminAccountRequestSummary(accessToken),
    ]).then((results) => {
      if (!active) return;

      const nextErrors: string[] = [];
      const monitoringResult = results[0];
      const requestsResult = results[1];

      if (monitoringResult.status === "fulfilled") {
        setMonitoring(monitoringResult.value);
      } else {
        nextErrors.push(
          monitoringResult.reason instanceof Error
            ? monitoringResult.reason.message
            : t("errors.monitoring"),
        );
      }

      if (requestsResult.status === "fulfilled") {
        setRequests(requestsResult.value);
      } else {
        nextErrors.push(
          requestsResult.reason instanceof Error
            ? requestsResult.reason.message
            : t("errors.requests"),
        );
      }

      setErrors(nextErrors);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [accessToken, rangeDays, refreshKey, t]);

  const derived = useMemo(() => {
    if (!monitoring) return null;

    const needsAction = requests
      ? requests.counts.PENDING_APPROVAL + requests.counts.ACTIVATION_PENDING
      : null;
    const organizationIssueCount =
      monitoring.organizationHealth.officesWithoutHead +
      monitoring.organizationHealth.orgUnitsWithoutHead +
      monitoring.organizationHealth.employeesWithoutPlacement +
      monitoring.organizationHealth.placementPending +
      monitoring.organizationHealth.officesWithoutStructure;
    const emergencyIssueCount =
      monitoring.emergencyDelivery.failed +
      monitoring.emergencyDelivery.skippedNoPhone;
    const systemIssueCount =
      organizationIssueCount +
      (needsAction ?? 0) +
      emergencyIssueCount;
    const systemHealthy = systemIssueCount === 0;

    const accountAvailability: AnalyticsCountItem[] = [
      {
        key: "ENABLED",
        label: t("accounts.enabled"),
        count: monitoring.accountHealth.enabledAccounts,
        tone: "green",
      },
      {
        key: "DISABLED",
        label: t("accounts.disabled"),
        count: monitoring.accountHealth.disabledAccounts,
        tone: "gold",
      },
      {
        key: "NOT_ACTIVATED",
        label: t("accounts.notActivated"),
        count: monitoring.accountHealth.unactivatedEmployees,
        tone: "red",
      },
    ];

    const presence: AnalyticsCountItem[] = [
      {
        key: "ACTIVE",
        label: t("presence.active"),
        count: monitoring.totals.active,
        tone: "green",
      },
      {
        key: "IDLE",
        label: t("presence.idle"),
        count: monitoring.totals.idle,
        tone: "gold",
      },
      {
        key: "OFFLINE",
        label: t("presence.offline"),
        count: monitoring.totals.offline,
        tone: "blue",
      },
    ];

    const governance: AnalyticsCountItem[] = requests
      ? [
          {
            key: "PENDING_APPROVAL",
            label: t("governance.pendingApproval"),
            count: requests.counts.PENDING_APPROVAL,
            tone: "red",
          },
          {
            key: "APPROVED",
            label: t("governance.approved"),
            count: requests.counts.APPROVED,
            tone: "blue",
          },
          {
            key: "ACTIVATION_PENDING",
            label: t("governance.activationPending"),
            count: requests.counts.ACTIVATION_PENDING,
            tone: "gold",
          },
          {
            key: "ACTIVATED",
            label: t("governance.activated"),
            count: requests.counts.ACTIVATED,
            tone: "green",
          },
          {
            key: "REJECTED",
            label: t("governance.rejected"),
            count: requests.counts.REJECTED,
            tone: "blue",
          },
        ]
      : [];

    const organizationSignals: AnalyticsCountItem[] = [
      {
        key: "OFFICE_HEAD_GAPS",
        label: t("organization.officeHeadGaps"),
        count: monitoring.organizationHealth.officesWithoutHead,
        tone: monitoring.organizationHealth.officesWithoutHead ? "red" : "green",
      },
      {
        key: "UNIT_HEAD_GAPS",
        label: t("organization.unitHeadGaps"),
        count: monitoring.organizationHealth.orgUnitsWithoutHead,
        tone: monitoring.organizationHealth.orgUnitsWithoutHead ? "red" : "green",
      },
      {
        key: "UNPLACED",
        label: t("organization.withoutPlacement"),
        count: monitoring.organizationHealth.employeesWithoutPlacement,
        tone: monitoring.organizationHealth.employeesWithoutPlacement ? "red" : "green",
      },
      {
        key: "PLACEMENT_PENDING",
        label: t("organization.placementPending"),
        count: monitoring.organizationHealth.placementPending,
        tone: monitoring.organizationHealth.placementPending ? "gold" : "green",
      },
      {
        key: "EMPTY_UNITS",
        label: t("organization.emptyUnits"),
        count: monitoring.organizationHealth.activeUnitsWithoutPeople,
        tone: "blue",
      },
      {
        key: "OFFICES_NO_STRUCTURE",
        label: t("organization.noStructure"),
        count: monitoring.organizationHealth.officesWithoutStructure,
        tone: monitoring.organizationHealth.officesWithoutStructure ? "red" : "green",
      },
    ];

    return {
      needsAction,
      organizationIssueCount,
      systemHealthy,
      systemIssueCount,
      accountAvailability,
      presence,
      governance,
      organizationSignals,
    };
  }, [monitoring, requests, t]);

  if (loading && !monitoring) {
    return (
      <section className="analytics-panel analytics-panel-state" aria-busy="true">
        <div className="spinner" />
        <strong>{t("state.loadingTitle")}</strong>
        <p>{t("state.loadingDescription")}</p>
      </section>
    );
  }

  if (!monitoring || !derived) {
    return (
      <section className="analytics-panel analytics-panel-state" role="alert">
        <strong>{t("state.unavailable")}</strong>
        <p>{errors[0] ?? t("errors.load")}</p>
        <button
          type="button"
          onClick={() => setRefreshKey((current) => current + 1)}
        >
          {t("common.tryAgain")}
        </button>
      </section>
    );
  }

  const analyticsPrimaryCards: OverviewCard[] = [
    {
      label: t("overview.systemHealth"),
      value: derived.systemHealthy
        ? t("overview.healthy")
        : t("overview.attention"),
      hint: derived.systemHealthy
        ? t("overview.healthyHint")
        : t("overview.attentionHint", { count: derived.systemIssueCount }),
      meta: t("overview.coreServices"),
      icon: "health",
      tone: derived.systemHealthy ? "green" : "red",
      actionPath: "/super-admin?view=monitoring",
    },
    {
      label: t("overview.enabledAccounts"),
      value: monitoring.accountHealth.enabledAccounts,
      hint: t("overview.enabledAccountsHint", {
        total: monitoring.accountHealth.totalAccounts,
        disabled: monitoring.accountHealth.disabledAccounts,
      }),
      meta: t("overview.systemAccess"),
      icon: "users",
      tone: "blue",
    },
    {
      label: t("overview.needsAction"),
      value: derived.needsAction ?? "—",
      hint: requests
        ? t("overview.needsActionHint")
        : t("overview.requestsUnavailable"),
      meta: t("overview.governanceQueue"),
      icon: "attention",
      tone: (derived.needsAction ?? 0) > 0 ? "red" : "green",
      actionPath: "/super-admin/account-requests",
    },
    {
      label: t("overview.organizationHealth"),
      value: derived.organizationIssueCount,
      hint:
        derived.organizationIssueCount === 0
          ? t("overview.organizationHealthyHint")
          : t("overview.organizationAttentionHint"),
      meta: t("overview.v3Structure"),
      icon: "organization",
      tone: derived.organizationIssueCount > 0 ? "gold" : "green",
      actionPath: "/organization",
    },
  ];

  const dashboardPrimaryCards: OverviewCard[] = [
    {
      label: t("dashboardOverview.activeOffices"),
      value: monitoring.organizationHealth.activeOffices,
      hint: t("dashboardOverview.activeOfficesHint", {
        inactive: monitoring.organizationHealth.inactiveOffices,
      }),
      meta: t("dashboardOverview.officeGovernance"),
      icon: "organization",
      tone: "blue",
      actionPath: "/super-admin/offices",
    },
    {
      label: t("overview.enabledAccounts"),
      value: monitoring.accountHealth.enabledAccounts,
      hint: t("overview.enabledAccountsHint", {
        total: monitoring.accountHealth.totalAccounts,
        disabled: monitoring.accountHealth.disabledAccounts,
      }),
      meta: t("overview.systemAccess"),
      icon: "users",
      tone: "blue",
    },
    {
      label: t("dashboardOverview.activeNow"),
      value: monitoring.totals.active,
      hint: t("dashboardOverview.activeNowHint", {
        idle: monitoring.totals.idle,
        offline: monitoring.totals.offline,
      }),
      meta: t("dashboardOverview.platformActivity"),
      icon: "activity",
      tone: "green",
      actionPath: "/super-admin?view=monitoring",
    },
    {
      label: t("dashboardOverview.needsAttention"),
      value: derived.systemIssueCount,
      hint: t("dashboardOverview.needsAttentionHint"),
      meta: t("overview.governanceQueue"),
      icon: "attention",
      tone: derived.systemIssueCount > 0 ? "red" : "green",
      actionPath: "/super-admin?view=analytics",
    },
    {
      label: t("dashboardOverview.setupGaps"),
      value: derived.organizationIssueCount,
      hint: t("dashboardOverview.setupGapsHint"),
      meta: t("dashboardOverview.organizationReadiness"),
      icon: "organization",
      tone: derived.organizationIssueCount > 0 ? "gold" : "green",
      actionPath: "/organization",
    },
    {
      label: t("overview.systemHealth"),
      value: derived.systemHealthy
        ? t("overview.healthy")
        : t("overview.attention"),
      hint: derived.systemHealthy
        ? t("dashboardOverview.healthyHint")
        : t("dashboardOverview.attentionHint"),
      meta: t("overview.coreServices"),
      icon: "health",
      tone: derived.systemHealthy ? "green" : "gold",
      actionPath: "/super-admin?view=monitoring",
    },
  ];

  const primaryCards = dashboardMode
    ? dashboardPrimaryCards
    : analyticsPrimaryCards;

  function progressStyle(value: number, maximum: number): CSSProperties {
    const percent = value <= 0 ? 0 : Math.max(6, Math.round((value / maximum) * 100));
    return { "--analytics-progress": `${percent}%` } as CSSProperties;
  }

  function renderDistribution(
    items: AnalyticsCountItem[],
    emptyMessage: string,
  ): ReactNode {
    if (items.length === 0) {
      return <p className="analytics-empty-row">{emptyMessage}</p>;
    }

    const maximum = Math.max(1, ...items.map((item) => item.count));

    return items.map((item, index) => (
      <div
        className={`analytics-metric-row analytics-metric-row--${item.tone ?? "blue"}`}
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

  const generatedAt = [monitoring.generatedAt, requests?.generatedAt]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const maxTrendActions = Math.max(1, ...monitoring.trend.map((item) => item.actions));
  const officeHeadCoverage = percentage(
    monitoring.organizationHealth.officeHeadsAssigned,
    monitoring.organizationHealth.activeOffices,
  );
  const orgUnitHeadCoverage = percentage(
    monitoring.organizationHealth.orgUnitHeadsAssigned,
    monitoring.organizationHealth.activeFormalUnits,
  );
  const activationLabel = !requests
    ? t("governance.unavailable")
    : requests.totalRequests === 0
      ? t("governance.noRequests")
      : t("governance.completion", {
          percent: requests.activationCompletionRate,
        });

  const dashboardAttentionItems = [
    {
      key: "office-setup",
      label: t("dashboardAttention.officeSetup"),
      detail: t("dashboardAttention.officeSetupDetail"),
      count:
        monitoring.organizationHealth.officesWithoutHead +
        monitoring.organizationHealth.officesWithoutStructure,
      tone: "red",
      path: "/super-admin/offices",
    },
    {
      key: "unit-head",
      label: t("dashboardAttention.unitHead"),
      detail: t("dashboardAttention.unitHeadDetail"),
      count: monitoring.organizationHealth.orgUnitsWithoutHead,
      tone: "gold",
      path: "/organization",
    },
    {
      key: "placement",
      label: t("dashboardAttention.placement"),
      detail: t("dashboardAttention.placementDetail"),
      count:
        monitoring.organizationHealth.placementPending +
        monitoring.organizationHealth.employeesWithoutPlacement,
      tone: "gold",
      path: "/organization",
    },
    {
      key: "approval",
      label: t("dashboardAttention.approval"),
      detail: t("dashboardAttention.approvalDetail"),
      count: requests?.counts.PENDING_APPROVAL ?? 0,
      tone: "gold",
      path: "/super-admin/account-requests?status=PENDING_APPROVAL",
    },
    {
      key: "activation",
      label: t("dashboardAttention.activation"),
      detail: t("dashboardAttention.activationDetail"),
      count: requests?.counts.ACTIVATION_PENDING ?? 0,
      tone: "gold",
      path: "/super-admin/account-requests?status=ACTIVATION_PENDING",
    },
    {
      key: "returned",
      label: t("dashboardAttention.returned"),
      detail: t("dashboardAttention.returnedDetail"),
      count: requests?.counts.REJECTED ?? 0,
      tone: "gold",
      path: "/super-admin/account-requests?status=REJECTED",
    },
    {
      key: "emergency",
      label: t("dashboardAttention.emergency"),
      detail: t("dashboardAttention.emergencyDetail"),
      count:
        monitoring.emergencyDelivery.failed +
        monitoring.emergencyDelivery.skippedNoPhone,
      tone: "red",
      path: "/super-admin?view=monitoring",
    },
  ].filter((item) => item.count > 0);

  const dashboardAttentionTotal = dashboardAttentionItems.reduce(
    (total, item) => total + item.count,
    0,
  );

  const dashboardCriticalTotal =
    monitoring.organizationHealth.officesWithoutHead +
    monitoring.organizationHealth.officesWithoutStructure +
    monitoring.emergencyDelivery.failed +
    monitoring.emergencyDelivery.skippedNoPhone;

  if (dashboardMode) {
    return (
      <section
        className="analytics-panel sa-dashboard"
        aria-label={t("dashboardClean.aria")}
      >
        <header className="sa-dashboard__header">
          <div className="sa-dashboard__identity">
            <span className="sa-dashboard__brand-mark" aria-hidden="true">
              <AnalyticsIcon name="scope" />
            </span>

            <div>
              <span className="sa-dashboard__eyebrow">
                {t("dashboardClean.eyebrow")}
              </span>

              <h2>{t("dashboardClean.title")}</h2>

              <p>{t("dashboardClean.description")}</p>

              <span className="sa-dashboard__privacy">
                <AnalyticsIcon name="health" />
                {t("dashboardClean.privacy")}
              </span>
            </div>
          </div>

          <div className="sa-dashboard__header-actions">
            <div
              className={
                dashboardAttentionTotal > 0
                  ? "sa-dashboard__governance-status is-attention"
                  : "sa-dashboard__governance-status is-clear"
              }
            >
              <span aria-hidden="true" />
              {dashboardAttentionTotal > 0
                ? t("dashboardClean.governanceAttention", {
                    count: dashboardAttentionTotal,
                  })
                : t("dashboardClean.governanceClear")}
            </div>

            <small>
              {t("dashboardClean.updated", {
                date: formatDateTime(
                  generatedAt,
                  locale,
                  t("common.noActivity"),
                ),
              })}
            </small>

            <button
              className="sa-dashboard__refresh"
              type="button"
              onClick={() => setRefreshKey((current) => current + 1)}
              disabled={loading}
            >
              {loading
                ? t("common.refreshing")
                : t("dashboardClean.refresh")}
            </button>
          </div>
        </header>

        {errors.length > 0 && (
          <div className="analytics-inline-error" role="status">
            <strong>{t("state.partial")}</strong>
            <span>{errors.join(" · ")}</span>
          </div>
        )}

        <section
          className="sa-dashboard__kpis"
          aria-label={t("dashboardClean.snapshot")}
        >
          <button
            type="button"
            className="sa-dashboard-kpi"
            onClick={() => navigate("/super-admin/offices")}
          >
            <span className="sa-dashboard-kpi__icon">
              <AnalyticsIcon name="organization" />
            </span>
            <span className="sa-dashboard-kpi__content">
              <small>{t("dashboardClean.activeOffices")}</small>
              <strong>
                {formatNumber(
                  monitoring.organizationHealth.activeOffices,
                )}
              </strong>
              <span>
                {t("dashboardClean.officeSummary", {
                  active: monitoring.organizationHealth.activeOffices,
                  inactive:
                    monitoring.organizationHealth.inactiveOffices,
                })}
              </span>
            </span>
            <b aria-hidden="true">→</b>
          </button>

          <button
            type="button"
            className="sa-dashboard-kpi"
            onClick={() => navigate("/directory")}
          >
            <span className="sa-dashboard-kpi__icon">
              <AnalyticsIcon name="users" />
            </span>
            <span className="sa-dashboard-kpi__content">
              <small>{t("dashboardClean.accounts")}</small>
              <strong>
                {formatNumber(
                  monitoring.accountHealth.totalAccounts,
                )}
              </strong>
              <span>
                {t("dashboardClean.accountSummary", {
                  enabled: monitoring.accountHealth.enabledAccounts,
                  disabled:
                    monitoring.accountHealth.disabledAccounts,
                })}
              </span>
            </span>
            <b aria-hidden="true">→</b>
          </button>

          <button
            type="button"
            className={
              dashboardAttentionTotal > 0
                ? "sa-dashboard-kpi sa-dashboard-kpi--attention"
                : "sa-dashboard-kpi sa-dashboard-kpi--healthy"
            }
            onClick={() =>
              navigate("/super-admin?view=analytics")
            }
          >
            <span className="sa-dashboard-kpi__icon">
              <AnalyticsIcon name="attention" />
            </span>
            <span className="sa-dashboard-kpi__content">
              <small>{t("dashboardClean.needsAttention")}</small>
              <strong>
                {formatNumber(dashboardAttentionTotal)}
              </strong>
              <span>
                {dashboardAttentionTotal > 0
                  ? t("dashboardClean.attentionSummary", {
                      critical: dashboardCriticalTotal,
                    })
                  : t("dashboardClean.noAttention")}
              </span>
            </span>
            <b aria-hidden="true">→</b>
          </button>

          <button
            type="button"
            className="sa-dashboard-kpi"
            onClick={() =>
              navigate("/super-admin?view=monitoring")
            }
          >
            <span className="sa-dashboard-kpi__icon">
              <AnalyticsIcon name="activity" />
            </span>
            <span className="sa-dashboard-kpi__content">
              <small>{t("dashboardClean.activeNow")}</small>
              <strong>
                {formatNumber(monitoring.totals.active)}
              </strong>
              <span>
                {t("dashboardClean.presenceSummary", {
                  idle: monitoring.totals.idle,
                  offline: monitoring.totals.offline,
                })}
              </span>
            </span>
            <b aria-hidden="true">→</b>
          </button>
        </section>

        <section className="sa-dashboard__priority-grid">
          <article className="sa-dashboard-panel sa-dashboard-attention">
            <header className="sa-dashboard-panel__header">
              <div>
                <span>{t("dashboardClean.attentionEyebrow")}</span>
                <h3>{t("dashboardClean.attentionTitle")}</h3>
                <p>
                  {dashboardAttentionTotal > 0
                    ? t("dashboardClean.attentionDescription", {
                        count: dashboardAttentionTotal,
                      })
                    : t("dashboardClean.attentionClear")}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  navigate("/super-admin?view=analytics")
                }
              >
                {t("dashboardClean.viewAnalysis")}
              </button>
            </header>

            {dashboardAttentionItems.length === 0 ? (
              <div className="sa-dashboard-attention__clear">
                <AnalyticsIcon name="health" />
                <div>
                  <strong>
                    {t("dashboardClean.allClear")}
                  </strong>
                  <span>
                    {t("dashboardClean.allClearDescription")}
                  </span>
                </div>
              </div>
            ) : (
              <div className="sa-dashboard-attention__list">
                {dashboardAttentionItems
                  .slice(0, 4)
                  .map((item) => (
                    <button
                      type="button"
                      key={item.key}
                      className={`is-${item.tone}`}
                      onClick={() => navigate(item.path)}
                    >
                      <span
                        className="sa-dashboard-attention__indicator"
                        aria-hidden="true"
                      />

                      <span className="sa-dashboard-attention__copy">
                        <strong>{item.label}</strong>
                        <small>{item.detail}</small>
                      </span>

                      <span className="sa-dashboard-attention__count">
                        {formatNumber(item.count)}
                      </span>

                      <span
                        className="sa-dashboard-attention__arrow"
                        aria-hidden="true"
                      >
                        →
                      </span>
                    </button>
                  ))}
              </div>
            )}

            {dashboardAttentionItems.length > 4 && (
              <footer className="sa-dashboard-panel__footer">
                <span>
                  {t("dashboardClean.moreIssues", {
                    count:
                      dashboardAttentionItems.length - 4,
                  })}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    navigate("/super-admin?view=analytics")
                  }
                >
                  {t("dashboardClean.reviewAll")}
                </button>
              </footer>
            )}
          </article>

          <article className="sa-dashboard-panel sa-dashboard-offices">
            <header className="sa-dashboard-panel__header">
              <div>
                <span>{t("dashboardClean.officeEyebrow")}</span>
                <h3>{t("dashboardClean.officeTitle")}</h3>
                <p>{t("dashboardClean.officeDescription")}</p>
              </div>

              <button
                type="button"
                onClick={() => navigate("/super-admin/offices")}
              >
                {t("dashboardClean.manageOffices")}
              </button>
            </header>

            <div className="sa-dashboard-offices__list">
              {monitoring.officeHealth
                .slice(0, 4)
                .map((office) => {
                  const leadershipComplete =
                    office.officeHeadAssigned &&
                    office.headedFormalUnits >= office.formalUnits;

                  const status =
                    !office.isActive
                      ? "inactive"
                      : office.activeUnits === 0
                        ? "setup"
                        : leadershipComplete
                          ? "ready"
                          : "attention";

                  return (
                    <button
                      type="button"
                      key={office.officeId}
                      onClick={() => navigate("/organization")}
                    >
                      <span className="sa-dashboard-offices__identity">
                        <strong>{office.name}</strong>
                        <small>
                          {t("dashboardClean.officePeopleUnits", {
                            people: office.activePeople,
                            active: office.activeUnits,
                            inactive: office.inactiveUnits,
                          })}
                        </small>
                      </span>

                      <span className="sa-dashboard-offices__leadership">
                        {office.officeHeadAssigned
                          ? t(
                              "dashboardClean.officeLeadership",
                              {
                                covered:
                                  office.headedFormalUnits,
                                total: office.formalUnits,
                              },
                            )
                          : t(
                              "dashboardClean.officeHeadMissing",
                            )}
                      </span>

                      <span
                        className={`sa-dashboard-status is-${status}`}
                      >
                        {t(
                          `dashboardClean.officeStatus.${status}`,
                        )}
                      </span>
                    </button>
                  );
                })}
            </div>

            {monitoring.officeHealth.length === 0 && (
              <div className="sa-dashboard-empty">
                {t("dashboardClean.noOffices")}
              </div>
            )}
          </article>
        </section>

        <section className="sa-dashboard__governance-grid">
          <article className="sa-dashboard-panel">
            <header className="sa-dashboard-panel__header">
              <div>
                <span>{t("dashboardClean.identityEyebrow")}</span>
                <h3>{t("dashboardClean.identityTitle")}</h3>
                <p>{t("dashboardClean.identityDescription")}</p>
              </div>

              <button
                type="button"
                onClick={() => navigate("/directory")}
              >
                {t("dashboardClean.openDirectory")}
              </button>
            </header>

            <div className="sa-dashboard-stat-strip">
              <div>
                <strong>
                  {formatNumber(
                    monitoring.accountHealth.totalAccounts,
                  )}
                </strong>
                <span>{t("dashboardClean.totalAccounts")}</span>
              </div>

              <div>
                <strong>
                  {formatNumber(
                    monitoring.accountHealth.enabledAccounts,
                  )}
                </strong>
                <span>{t("dashboardClean.enabled")}</span>
              </div>

              <div>
                <strong>
                  {formatNumber(
                    monitoring.accountHealth.disabledAccounts,
                  )}
                </strong>
                <span>{t("dashboardClean.disabled")}</span>
              </div>

              <div>
                <strong>
                  {formatNumber(
                    monitoring.accountHealth.unactivatedEmployees,
                  )}
                </strong>
                <span>{t("dashboardClean.notActivated")}</span>
              </div>
            </div>

            <div className="sa-dashboard-presence">
              <span>{t("dashboardClean.livePresence")}</span>

              <div>
                <strong className="is-active">
                  {formatNumber(monitoring.totals.active)}
                </strong>
                {t("dashboardClean.active")}
              </div>

              <div>
                <strong className="is-idle">
                  {formatNumber(monitoring.totals.idle)}
                </strong>
                {t("dashboardClean.idle")}
              </div>

              <div>
                <strong>
                  {formatNumber(monitoring.totals.offline)}
                </strong>
                {t("dashboardClean.offline")}
              </div>
            </div>
          </article>

          <article className="sa-dashboard-panel">
            <header className="sa-dashboard-panel__header">
              <div>
                <span>
                  {t("dashboardClean.organizationEyebrow")}
                </span>
                <h3>{t("dashboardClean.organizationTitle")}</h3>
                <p>
                  {t("dashboardClean.organizationDescription")}
                </p>
              </div>

              <button
                type="button"
                onClick={() => navigate("/organization")}
              >
                {t("dashboardClean.openOrganization")}
              </button>
            </header>

            <div className="sa-dashboard-integrity">
              <div>
                <span>{t("organization.officeHeadCoverage")}</span>
                <strong>{officeHeadCoverage}%</strong>
                <small>
                  {
                    monitoring.organizationHealth
                      .officeHeadsAssigned
                  }
                  /
                  {monitoring.organizationHealth.activeOffices}
                </small>
              </div>

              <div>
                <span>{t("organization.unitHeadCoverage")}</span>
                <strong>{orgUnitHeadCoverage}%</strong>
                <small>
                  {
                    monitoring.organizationHealth
                      .orgUnitHeadsAssigned
                  }
                  /
                  {
                    monitoring.organizationHealth
                      .activeFormalUnits
                  }
                </small>
              </div>

              <div>
                <span>{t("organization.currentPlacements")}</span>
                <strong>
                  {formatNumber(
                    monitoring.organizationHealth
                      .activePrimaryPlacements,
                  )}
                </strong>
                <small>
                  {t("dashboardClean.currentEmployees")}
                </small>
              </div>
            </div>

            <div className="sa-dashboard-integrity__issues">
              <span>
                <b>
                  {
                    monitoring.organizationHealth
                      .officesWithoutHead
                  }
                </b>
                {t("dashboardClean.officeHeadGap")}
              </span>

              <span>
                <b>
                  {
                    monitoring.organizationHealth
                      .orgUnitsWithoutHead
                  }
                </b>
                {t("dashboardClean.unitHeadGap")}
              </span>

              <span>
                <b>
                  {
                    monitoring.organizationHealth
                      .placementPending
                  }
                </b>
                {t("dashboardClean.placementPending")}
              </span>
            </div>
          </article>
        </section>

        <section className="sa-dashboard__activity-grid">
          <article className="sa-dashboard-panel sa-dashboard-activity">
            <header className="sa-dashboard-panel__header sa-dashboard-activity__header">
              <div>
                <span>{t("dashboardClean.activityEyebrow")}</span>
                <h3>{t("dashboardClean.activityTitle")}</h3>
                <p>
                  {t("dashboardClean.activityDescription", {
                    days: rangeDays,
                  })}
                </p>
              </div>

              <div
                className="sa-dashboard-period"
                aria-label={t("period.aria")}
              >
                {(
                  [1, 7, 30] as SystemAnalyticsRangeDays[]
                ).map((days) => (
                  <button
                    key={days}
                    type="button"
                    className={
                      rangeDays === days ? "is-active" : ""
                    }
                    aria-pressed={rangeDays === days}
                    onClick={() => setRangeDays(days)}
                  >
                    {t(`period.days${days}`)}
                  </button>
                ))}
              </div>
            </header>

            <div className="sa-dashboard-activity__summary">
              <div>
                <strong>
                  {formatNumber(
                    monitoring.totals.periodActions,
                  )}
                </strong>
                <span>{t("activity.actions")}</span>
              </div>

              <div>
                <strong>
                  {formatDuration(
                    monitoring.totals.periodActiveMinutes,
                  )}
                </strong>
                <span>{t("activity.activeTime")}</span>
              </div>

              <div>
                <strong>
                  {formatNumber(
                    monitoring.totals.periodAccountRequests,
                  )}
                </strong>
                <span>{t("activity.accountRequests")}</span>
              </div>
            </div>

            <div
              className="sa-dashboard-chart"
              aria-label={t("activity.trendAria")}
            >
              {monitoring.trend.map((point) => (
                <div
                  className="sa-dashboard-chart__item"
                  key={point.date}
                  title={t("activity.trendTooltip", {
                    date: point.date,
                    actions: point.actions,
                    active: point.activeAccounts,
                  })}
                >
                  <span className="sa-dashboard-chart__value">
                    {formatNumber(point.actions)}
                  </span>

                  <div className="sa-dashboard-chart__track">
                    <span
                      style={{
                        height: `${Math.max(
                          point.actions > 0 ? 8 : 2,
                          Math.round(
                            (point.actions / maxTrendActions) *
                              100,
                          ),
                        )}%`,
                      }}
                    />
                  </div>

                  <small>
                    {new Intl.DateTimeFormat(locale, {
                      day: "2-digit",
                      month: "short",
                    }).format(new Date(point.date))}
                  </small>
                </div>
              ))}
            </div>
          </article>

          <article className="sa-dashboard-panel sa-dashboard-emergency">
            <header className="sa-dashboard-panel__header">
              <div>
                <span>{t("dashboardClean.emergencyEyebrow")}</span>
                <h3>{t("dashboardClean.emergencyTitle")}</h3>
                <p>
                  {t("dashboardClean.emergencyDescription")}
                </p>
              </div>
            </header>

            <div className="sa-dashboard-emergency__rate">
              <AnalyticsIcon name="emergency" />

              <div>
                <strong>
                  {monitoring.emergencyDelivery.deliveryRate ===
                  null
                    ? "—"
                    : `${monitoring.emergencyDelivery.deliveryRate}%`}
                </strong>

                <span>
                  {t("dashboardClean.deliveryRate")}
                </span>
              </div>
            </div>

            <div className="sa-dashboard-emergency__stats">
              <span>
                <b className="is-success">
                  {monitoring.emergencyDelivery.sent}
                </b>
                {t("emergency.sent")}
              </span>

              <span>
                <b className="is-error">
                  {monitoring.emergencyDelivery.failed}
                </b>
                {t("emergency.failed")}
              </span>

              <span>
                <b className="is-warning">
                  {monitoring.emergencyDelivery.pending}
                </b>
                {t("emergency.pending")}
              </span>

              <span>
                <b>
                  {
                    monitoring.emergencyDelivery
                      .skippedNoPhone
                  }
                </b>
                {t("emergency.noPhone")}
              </span>
            </div>

            <button
              className="sa-dashboard-emergency__link"
              type="button"
              onClick={() =>
                navigate("/super-admin?view=monitoring")
              }
            >
              {t("dashboardClean.openMonitoring")} →
            </button>
          </article>
        </section>

        {requests && (
          <section className="sa-dashboard-panel sa-dashboard-recent">
            <header className="sa-dashboard-panel__header">
              <div>
                <span>{t("dashboardClean.recentEyebrow")}</span>
                <h3>{t("dashboardClean.recentTitle")}</h3>
                <p>{t("dashboardClean.recentDescription")}</p>
              </div>

              <button
                type="button"
                onClick={() =>
                  navigate("/super-admin/account-requests")
                }
              >
                {t("dashboardClean.openRequests")}
              </button>
            </header>

            {requests.recentActivity.length === 0 ? (
              <div className="sa-dashboard-empty">
                {t("dashboardClean.noRecentActivity")}
              </div>
            ) : (
              <div className="sa-dashboard-recent__list">
                {requests.recentActivity
                  .slice(0, 3)
                  .map((request) => (
                    <button
                      type="button"
                      key={request.id}
                      onClick={() =>
                        navigate(
                          `/super-admin/account-requests?status=${request.status}&request=${request.id}`,
                        )
                      }
                    >
                      <span className="sa-dashboard-recent__action">
                        {t(
                          `dashboardRecent.status.${request.status}`,
                        )}
                      </span>

                      <span className="sa-dashboard-recent__identity">
                        <strong>{request.empName}</strong>
                        <small>
                          {request.empId}
                          {request.office?.name
                            ? ` · ${request.office.name}`
                            : ""}
                        </small>
                      </span>

                      <time>
                        {formatDateTime(
                          request.updatedAt,
                          locale,
                          t("common.noActivity"),
                        )}
                      </time>

                      <span aria-hidden="true">→</span>
                    </button>
                  ))}
              </div>
            )}
          </section>
        )}
      </section>
    );
  }

  return (
    <section
      className={`analytics-panel analytics-panel--professional analytics-panel--system${
        dashboardMode ? " analytics-panel--dashboard" : ""
      }`}
      aria-label={t(dashboardMode ? "dashboardHero.aria" : "hero.aria")}
    >
      <header className="analytics-commandbar">
        <div className="analytics-commandbar__identity">
          <div className="analytics-commandbar__icon">
            <AnalyticsIcon name="scope" />
          </div>
          <div>
            <span>
              {t(dashboardMode ? "dashboardHero.eyebrow" : "hero.eyebrow")}
            </span>
            <h2>
              {t(dashboardMode ? "dashboardHero.title" : "hero.title")}
            </h2>
            <p>
              {t(
                dashboardMode
                  ? "dashboardHero.description"
                  : "hero.description",
              )}
            </p>
          </div>
        </div>

        <div className="analytics-commandbar__controls">
          <div className="analytics-period-control" aria-label={t("period.aria")}>
            {([1, 7, 30] as SystemAnalyticsRangeDays[]).map((days) => (
              <button
                className={rangeDays === days ? "is-active" : ""}
                key={days}
                type="button"
                aria-pressed={rangeDays === days}
                onClick={() => setRangeDays(days)}
              >
                {t(`period.days${days}`)}
              </button>
            ))}
          </div>
          <div className="analytics-commandbar__updated">
            <span>{t("hero.superAdmin")}</span>
            <small>
              {t("hero.generated", {
                date: formatDateTime(generatedAt, locale, t("common.noActivity")),
              })}
            </small>
          </div>
          <button
            className="analytics-refresh-button"
            type="button"
            onClick={() => setRefreshKey((current) => current + 1)}
            disabled={loading}
          >
            {loading ? t("common.refreshing") : t("common.refresh")}
          </button>
        </div>
      </header>

      {errors.length > 0 && (
        <div className="analytics-inline-error" role="status">
          <strong>{t("state.partial")}</strong>
          <span>{errors.join(" · ")}</span>
        </div>
      )}

      <section className="analytics-card-grid" aria-label={t("overview.aria")}>
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
                <strong>
                  {typeof card.value === "number"
                    ? formatNumber(card.value)
                    : card.value}
                </strong>
              </div>
            </div>
            <small>{card.hint}</small>
            {card.actionPath && (
              <button
                className="analytics-card__link"
                type="button"
                onClick={() => navigate(card.actionPath!)}
              >
                {t("common.review")}
              </button>
            )}
          </article>
        ))}
      </section>

      {dashboardMode && monitoring.organizationHealth.activeOffices === 0 && (
        <section className="analytics-dashboard-setup">
          <div className="analytics-dashboard-setup__icon">
            <AnalyticsIcon name="organization" />
          </div>
          <div>
            <span>{t("dashboardSetup.eyebrow")}</span>
            <h3>{t("dashboardSetup.title")}</h3>
            <p>{t("dashboardSetup.description")}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/super-admin/offices")}
          >
            {t("dashboardSetup.action")}
          </button>
        </section>
      )}

      {dashboardMode && (
        <section className="analytics-section-card analytics-dashboard-attention">
          <header>
            <div>
              <span>{t("dashboardAttention.eyebrow")}</span>
              <h3>{t("dashboardAttention.title")}</h3>
              <p>
                {dashboardAttentionItems.length === 0
                  ? t("dashboardAttention.clearDescription")
                  : t("dashboardAttention.description", {
                      count: dashboardAttentionItems.reduce(
                        (total, item) => total + item.count,
                        0,
                      ),
                    })}
              </p>
            </div>
            <button
              className="analytics-inline-link"
              type="button"
              onClick={() => navigate("/super-admin?view=analytics")}
            >
              {t("dashboardAttention.reviewAll")}
            </button>
          </header>

          {dashboardAttentionItems.length === 0 ? (
            <div className="analytics-dashboard-attention__clear">
              <AnalyticsIcon name="health" />
              <div>
                <strong>{t("dashboardAttention.clearTitle")}</strong>
                <span>{t("dashboardAttention.clearDescription")}</span>
              </div>
            </div>
          ) : (
            <div className="analytics-dashboard-attention__grid">
              {dashboardAttentionItems.slice(0, 6).map((item) => (
                <button
                  key={item.key}
                  className={`analytics-dashboard-attention__item is-${item.tone}`}
                  type="button"
                  onClick={() => navigate(item.path)}
                >
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <b>{formatNumber(item.count)}</b>
                  <i aria-hidden="true">→</i>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="analytics-two-column analytics-two-column--balanced">
        <article className="analytics-section-card">
          <header>
            <div>
              <span>{t("accounts.eyebrow")}</span>
              <h3>{t("accounts.title")}</h3>
              <p>{t("accounts.description")}</p>
            </div>
            <div className="analytics-section-card__badge analytics-section-card__badge--secure">
              {t("presence.current")}
            </div>
          </header>
          <div className="analytics-dual-metrics">
            <section>
              <strong>{t("accounts.access")}</strong>
              <div className="analytics-metric-list analytics-metric-list--compact">
                {renderDistribution(
                  derived.accountAvailability,
                  t("accounts.empty"),
                )}
              </div>
            </section>
            <section>
              <strong>{t("presence.title")}</strong>
              <div className="analytics-metric-list analytics-metric-list--compact">
                {renderDistribution(derived.presence, t("presence.empty"))}
              </div>
            </section>
          </div>
        </article>

        <article className="analytics-section-card">
          <header>
            <div>
              <span>{t("governance.eyebrow")}</span>
              <h3>{t("governance.title")}</h3>
              <p>{t("governance.description")}</p>
            </div>
            <div className="analytics-section-card__badge">{activationLabel}</div>
          </header>
          <div className="analytics-metric-list">
            {renderDistribution(derived.governance, t("governance.empty"))}
          </div>
          <div className="analytics-section-action">
            <span>
              {t("governance.periodCreated", {
                count: monitoring.totals.periodAccountRequests,
              })}
            </span>
            <button type="button" onClick={() => navigate("/super-admin/account-requests")}>
              {t("common.openQueue")}
            </button>
          </div>
        </article>
      </section>

      <section className="analytics-two-column analytics-two-column--balanced">
        <article className="analytics-section-card analytics-section-card--organization-health">
          <header>
            <div>
              <span>{t("organization.eyebrow")}</span>
              <h3>{t("organization.title")}</h3>
              <p>{t("organization.description")}</p>
            </div>
            <div className="analytics-section-card__badge">
              {t("organization.unitSummary", {
                active: monitoring.organizationHealth.activeUnits,
                inactive: monitoring.organizationHealth.inactiveUnits,
              })}
            </div>
          </header>

          <div className="analytics-leadership-strip">
            <div>
              <span>{t("organization.officeHeadCoverage")}</span>
              <strong>{officeHeadCoverage}%</strong>
              <small>
                {monitoring.organizationHealth.officeHeadsAssigned}/
                {monitoring.organizationHealth.activeOffices}
              </small>
            </div>
            <div>
              <span>{t("organization.unitHeadCoverage")}</span>
              <strong>{orgUnitHeadCoverage}%</strong>
              <small>
                {monitoring.organizationHealth.orgUnitHeadsAssigned}/
                {monitoring.organizationHealth.activeFormalUnits}
              </small>
            </div>
            <div>
              <span>{t("organization.currentPlacements")}</span>
              <strong>
                {formatNumber(monitoring.organizationHealth.activePrimaryPlacements)}
              </strong>
              <small>
                {t("organization.historicalPlacements", {
                  count: monitoring.organizationHealth.historicalPlacementRecords,
                })}
              </small>
            </div>
          </div>

          <div className="analytics-metric-list analytics-metric-list--signals">
            {renderDistribution(
              derived.organizationSignals,
              t("organization.empty"),
            )}
          </div>
        </article>

        <article className="analytics-section-card">
          <header>
            <div>
              <span>{t("offices.eyebrow")}</span>
              <h3>{t("offices.title")}</h3>
              <p>{t("offices.description")}</p>
            </div>
            <button
              className="analytics-inline-link"
              type="button"
              onClick={() => navigate("/organization")}
            >
              {t("common.openOrganization")}
            </button>
          </header>
          <div className="analytics-office-table" role="table">
            <div className="analytics-office-table__head" role="row">
              <span>{t("offices.office")}</span>
              <span>{t("offices.people")}</span>
              <span>{t("offices.units")}</span>
              <span>{t("offices.headCoverage")}</span>
              <span>{t("offices.status")}</span>
            </div>
            {monitoring.officeHealth.map((office) => {
              const headed = office.officeHeadAssigned &&
                office.headedFormalUnits >= office.formalUnits;
              return (
                <div className="analytics-office-table__row" role="row" key={office.officeId}>
                  <strong>{office.name}</strong>
                  <span>{formatNumber(office.activePeople)}</span>
                  <span>
                    {office.activeUnits}
                    {office.inactiveUnits > 0 ? ` +${office.inactiveUnits}` : ""}
                  </span>
                  <span>{headed ? t("offices.complete") : t("offices.incomplete")}</span>
                  <span
                    className={`analytics-status-pill ${
                      office.setupStatus === "HEALTHY"
                        ? "is-healthy"
                        : office.setupStatus === "INACTIVE"
                          ? "is-neutral"
                          : "is-attention"
                    }`}
                  >
                    {office.setupStatus === "HEALTHY"
                      ? t("offices.healthy")
                      : office.setupStatus === "INACTIVE"
                        ? t("offices.inactive")
                        : t("offices.setupIncomplete")}
                  </span>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="analytics-two-column analytics-two-column--balanced">
        <article className="analytics-section-card analytics-section-card--trend">
          <header>
            <div>
              <span>{t("activity.eyebrow")}</span>
              <h3>{t("activity.title")}</h3>
              <p>{t("activity.description", { days: rangeDays })}</p>
            </div>
            <div className="analytics-section-card__badge analytics-section-card__badge--secure">
              {t("activity.privacyProtected")}
            </div>
          </header>

          <div className="analytics-activity-summary">
            <div>
              <span>{t("activity.actions")}</span>
              <strong>{formatNumber(monitoring.totals.periodActions)}</strong>
            </div>
            <div>
              <span>{t("activity.activeTime")}</span>
              <strong>{formatDuration(monitoring.totals.periodActiveMinutes)}</strong>
            </div>
            <div>
              <span>{t("activity.accountRequests")}</span>
              <strong>{formatNumber(monitoring.totals.periodAccountRequests)}</strong>
            </div>
          </div>

          <div className="analytics-trend" aria-label={t("activity.trendAria")}>
            {monitoring.trend.map((point, index) => (
              <div
                className="analytics-trend__day"
                key={point.date}
                style={{ "--analytics-index": index } as CSSProperties}
                title={t("activity.trendTooltip", {
                  date: point.date,
                  actions: point.actions,
                  active: point.activeAccounts,
                })}
              >
                <span
                  style={{
                    "--analytics-bar": `${Math.max(
                      point.actions > 0 ? 8 : 2,
                      Math.round((point.actions / maxTrendActions) * 100),
                    )}%`,
                  } as CSSProperties}
                />
                <small>{rangeDays === 30 ? point.date.slice(8) : point.date.slice(5)}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="analytics-section-card analytics-section-card--emergency">
          <header>
            <div>
              <span>{t("emergency.eyebrow")}</span>
              <h3>{t("emergency.title")}</h3>
              <p>{t("emergency.description")}</p>
            </div>
            <div
              className={`analytics-section-card__badge ${
                monitoring.emergencyDelivery.failed > 0 ||
                monitoring.emergencyDelivery.skippedNoPhone > 0
                  ? "analytics-section-card__badge--warning"
                  : "analytics-section-card__badge--secure"
              }`}
            >
              {monitoring.emergencyDelivery.deliveryRate === null
                ? t("emergency.noDelivery")
                : t("emergency.deliveryRate", {
                    percent: monitoring.emergencyDelivery.deliveryRate,
                  })}
            </div>
          </header>
          <div className="analytics-emergency-grid">
            <div className="is-total">
              <AnalyticsIcon name="emergency" />
              <span>{t("emergency.total")}</span>
              <strong>{formatNumber(monitoring.emergencyDelivery.total)}</strong>
            </div>
            <div className="is-sent">
              <span>{t("emergency.sent")}</span>
              <strong>{formatNumber(monitoring.emergencyDelivery.sent)}</strong>
            </div>
            <div className="is-failed">
              <span>{t("emergency.failed")}</span>
              <strong>{formatNumber(monitoring.emergencyDelivery.failed)}</strong>
            </div>
            <div className="is-pending">
              <span>{t("emergency.pending")}</span>
              <strong>{formatNumber(monitoring.emergencyDelivery.pending)}</strong>
            </div>
            <div className="is-skipped">
              <span>{t("emergency.noPhone")}</span>
              <strong>{formatNumber(monitoring.emergencyDelivery.skippedNoPhone)}</strong>
            </div>
          </div>
        </article>
      </section>

      {dashboardMode && requests && (
        <section className="analytics-section-card analytics-dashboard-recent">
          <header>
            <div>
              <span>{t("dashboardRecent.eyebrow")}</span>
              <h3>{t("dashboardRecent.title")}</h3>
              <p>{t("dashboardRecent.description")}</p>
            </div>
            <button
              className="analytics-inline-link"
              type="button"
              onClick={() => navigate("/super-admin/account-requests")}
            >
              {t("dashboardRecent.open")}
            </button>
          </header>

          {requests.recentActivity.length === 0 ? (
            <div className="analytics-dashboard-recent__empty">
              {t("dashboardRecent.empty")}
            </div>
          ) : (
            <div className="analytics-dashboard-recent__list">
              {requests.recentActivity.slice(0, 5).map((request) => (
                <button
                  key={request.id}
                  type="button"
                  onClick={() =>
                    navigate(
                      `/super-admin/account-requests?status=${request.status}&request=${request.id}`,
                    )
                  }
                >
                  <span className="analytics-dashboard-recent__avatar">
                    {request.empName.charAt(0).toUpperCase()}
                  </span>
                  <span className="analytics-dashboard-recent__identity">
                    <strong>{request.empName}</strong>
                    <small>
                      {request.empId}
                      {request.office?.name
                        ? ` · ${request.office.name}`
                        : ""}
                    </small>
                  </span>
                  <span className="analytics-dashboard-recent__status">
                    {t(`dashboardRecent.status.${request.status}`)}
                  </span>
                  <time>
                    {formatDateTime(
                      request.updatedAt,
                      locale,
                      t("common.noActivity"),
                    )}
                  </time>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <footer className="analytics-privacy-note">
        <AnalyticsIcon name="health" />
        <div>
          <strong>{t("about.title")}</strong>
          <span>{t("about.description")}</span>
        </div>
      </footer>
    </section>
  );
}
