import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { getAdminAccountRequestSummary } from "../services/account-request.service";
import type {
  AccountRequestStatus,
  AdminAccountRequestSummaryResponse,
} from "../types/account-request";
import { ManagementIcon } from "./layout/ManagementIcon";

interface SuperAdminDashboardOverviewProps {
  accessToken: string;
}

const STATUS_META: Record<
  AccountRequestStatus,
  { labelKey: string; shortLabelKey: string; tone: string }
> = {
  DRAFT: {
    labelKey: "accountRequest.status.DRAFT.label",
    shortLabelKey: "accountRequest.status.DRAFT.short",
    tone: "neutral",
  },
  PENDING_APPROVAL: {
    labelKey: "accountRequest.status.PENDING_APPROVAL.label",
    shortLabelKey: "accountRequest.status.PENDING_APPROVAL.short",
    tone: "info",
  },
  APPROVED: {
    labelKey: "accountRequest.status.APPROVED.label",
    shortLabelKey: "accountRequest.status.APPROVED.short",
    tone: "blue",
  },
  REJECTED: {
    labelKey: "accountRequest.status.REJECTED.label",
    shortLabelKey: "accountRequest.status.REJECTED.short",
    tone: "danger",
  },
  ACTIVATION_PENDING: {
    labelKey: "accountRequest.status.ACTIVATION_PENDING.label",
    shortLabelKey: "accountRequest.status.ACTIVATION_PENDING.short",
    tone: "warning",
  },
  ACTIVATED: {
    labelKey: "accountRequest.status.ACTIVATED.label",
    shortLabelKey: "accountRequest.status.ACTIVATED.short",
    tone: "success",
  },
};


function formatDate(value: string, locale: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(locale === "ne" ? "ne-NP" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}


export function SuperAdminDashboardOverview({
  accessToken,
}: SuperAdminDashboardOverviewProps) {
  const { t, i18n } = useTranslation("admin");
  const [summary, setSummary] =
    useState<AdminAccountRequestSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (active) {
        setLoading(true);
      }
    });

    // The operational dashboard uses governance metadata only. It never asks
    // the API for private messages, attachment contents or communication links.
    getAdminAccountRequestSummary(accessToken)
      .then((response) => {
        if (!active) {
          return;
        }

        setSummary(response);
        setError("");
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : t("dashboard.error"),
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

  const counts = useMemo(
    () =>
      summary?.counts ?? {
        DRAFT: 0,
        PENDING_APPROVAL: 0,
        APPROVED: 0,
        REJECTED: 0,
        ACTIVATION_PENDING: 0,
        ACTIVATED: 0,
      },
    [summary?.counts],
  );



  const metricCards = [
    {
      label: t("dashboard.metrics.pendingApprovals"),
      value: counts.PENDING_APPROVAL,
      detail: t("dashboard.metrics.pendingApprovalsDetail"),
      href: "/super-admin/account-requests?status=PENDING_APPROVAL",
      icon: "requests" as const,
      tone: "urgent",
    },
    {
      label: t("dashboard.metrics.activationPending"),
      value: counts.ACTIVATION_PENDING,
      detail: t("dashboard.metrics.activationPendingDetail"),
      href: "/super-admin/account-requests?status=ACTIVATION_PENDING",
      icon: "profile" as const,
      tone: "activation",
    },
    {
      label: t("dashboard.metrics.returned"),
      value: counts.REJECTED,
      detail: t("dashboard.metrics.returnedDetail"),
      href: "/super-admin/account-requests?status=REJECTED",
      icon: "monitoring" as const,
      tone: "rejected",
    },
    {
      label: t("dashboard.metrics.activationCompletion"),
      value: `${summary?.activationCompletionRate ?? 100}%`,
      detail: t("dashboard.metrics.activated", { count: counts.ACTIVATED }),
      href: "/super-admin/account-requests?status=ACTIVATED",
      icon: "analytics" as const,
      tone: "healthy",
    },
  ];

  return (
    <main className="super-admin-overview">
      <header className="super-admin-overview__hero">
        <div className="super-admin-overview__hero-copy">
          <span className="super-admin-overview__eyebrow">{t("dashboard.eyebrow")}</span>
          <h1>{t("dashboard.title")}</h1>
          <p>{t("dashboard.description")}</p>
        </div>

        <div className="super-admin-overview__refresh">
          <span>
            {summary
              ? t("dashboard.updated", {
                  date: formatDate(summary.generatedAt, i18n.language),
                })
              : t("dashboard.loadingCurrentData")}
          </span>
          <button
            type="button"
            onClick={() => setRefreshKey((current) => current + 1)}
            disabled={loading}
          >
            {loading ? t("dashboard.refreshing") : t("dashboard.refresh")}
          </button>
        </div>
      </header>

      {error && (
        <div className="super-admin-overview__error" role="alert">
          {error}
        </div>
      )}

      <section
        className="super-admin-overview__metrics"
        aria-label={t("dashboard.governanceSummary")}
      >
        {metricCards.map((metric) => (
          <Link
            key={metric.label}
            className={`super-admin-overview__metric super-admin-overview__metric--${metric.tone}`}
            to={metric.href}
          >
            <span className="super-admin-overview__metric-icon" aria-hidden="true">
              <ManagementIcon name={metric.icon} />
            </span>
            <span className="super-admin-overview__metric-copy">
              <span>{metric.label}</span>
              <strong>{loading && !summary ? "—" : metric.value}</strong>
              <small>{metric.detail}</small>
            </span>
            <span className="super-admin-overview__metric-link" aria-hidden="true">
              {t("dashboard.openQueue")}
            </span>
          </Link>
        ))}
      </section>

      <section className="super-admin-overview__primary-grid">
        <article className="super-admin-overview__panel super-admin-overview__attention">
          <header>
            <div>
              <span>{t("dashboard.attention.eyebrow")}</span>
              <h2>{t("dashboard.attention.title")}</h2>
              <p>{t("dashboard.attention.count", { count: summary?.attentionTotal ?? 0 })}</p>
            </div>
            <Link to="/super-admin/account-requests">{t("dashboard.attention.reviewAll")}</Link>
          </header>

          {!loading && summary?.attentionRequests.length === 0 ? (
            <div className="super-admin-overview__all-clear">
              <span aria-hidden="true">✓</span>
              <div>
                <strong>{t("dashboard.attention.clearTitle")}</strong>
                <p>{t("dashboard.attention.clearDescription")}</p>
              </div>
            </div>
          ) : (
            <div className="super-admin-overview__request-list">
              {(summary?.attentionRequests ?? []).map((request) => (
                <Link
                  key={request.id}
                  to={`/super-admin/account-requests?status=${request.status}&request=${request.id}`}
                >
                  <span className="super-admin-overview__avatar" aria-hidden="true">
                    {request.empName.charAt(0).toUpperCase()}
                  </span>
                  <span className="super-admin-overview__request-copy">
                    <strong>{request.empName}</strong>
                    <small>
                      {request.empId} · {request.requestedOrganizationRole === "ORG_UNIT_HEAD" ? (request.intendedOrgUnit?.orgUnitType?.name ? `${request.intendedOrgUnit.orgUnitType.name} Head` : t("requests:form.v3.unitHeadRole")) : t("requests:form.v3.employeeRole")} ·{" "}
                      {request.requestedBy.employee?.empName ?? request.requestedBy.username ?? t("dashboard.unknownRequester")}
                    </small>
                  </span>
                  <span
                    className={`super-admin-overview__status super-admin-overview__status--${STATUS_META[request.status].tone}`}
                  >
                    {t(STATUS_META[request.status].shortLabelKey)}
                  </span>
                  <time>{formatDate(request.updatedAt, i18n.language) || t("dashboard.timeUnavailable")}</time>
                </Link>
              ))}
            </div>
          )}
        </article>

        <article className="super-admin-overview__panel super-admin-overview__quick-actions">
          <header>
            <div>
              <span>{t("dashboard.quickActions.eyebrow")}</span>
              <h2>{t("dashboard.quickActions.title")}</h2>
              <p>{t("dashboard.quickActions.description")}</p>
            </div>
          </header>

          <div className="super-admin-overview__actions">
            <Link to="/work-oversight">
              <ManagementIcon name="management" />
              <span>
                <strong>{t("dashboard.quickActions.work")}</strong>
                <small>{t("dashboard.quickActions.workDescription")}</small>
              </span>
            </Link>
            <Link to="/super-admin/account-requests">
              <ManagementIcon name="requests" />
              <span>
                <strong>{t("dashboard.quickActions.requests")}</strong>
                <small>{t("dashboard.quickActions.requestsDescription")}</small>
              </span>
            </Link>
            <Link to="/directory">
              <ManagementIcon name="directory" />
              <span>
                <strong>{t("dashboard.quickActions.directory")}</strong>
                <small>{t("dashboard.quickActions.directoryDescription")}</small>
              </span>
            </Link>
            <Link to="/organization">
              <ManagementIcon name="management" />
              <span>
                <strong>{t("dashboard.quickActions.organization")}</strong>
                <small>{t("dashboard.quickActions.organizationDescription")}</small>
              </span>
            </Link>
            <Link to="/super-admin?view=analytics">
              <ManagementIcon name="analytics" />
              <span>
                <strong>{t("dashboard.quickActions.analytics")}</strong>
                <small>{t("dashboard.quickActions.analyticsDescription")}</small>
              </span>
            </Link>
          </div>
        </article>
      </section>

      <footer className="super-admin-overview__notice">
        <ManagementIcon name="monitoring" />
        <div>
          <strong>{t("dashboard.privacy.title")}</strong>
          <p>{t("dashboard.privacy.description")}</p>
        </div>
      </footer>
    </main>
  );
}
