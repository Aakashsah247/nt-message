import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router";

import { getAdminAccountRequestSummary } from "../services/account-request.service";
import type {
  AccountRequestStatus,
  AdminAccountRequestListItem,
  AdminAccountRequestSummaryResponse,
} from "../types/account-request";
import { ManagementIcon } from "./layout/ManagementIcon";

interface SuperAdminDashboardOverviewProps {
  accessToken: string;
}

const STATUS_META: Record<
  AccountRequestStatus,
  { label: string; shortLabel: string; tone: string }
> = {
  DRAFT: { label: "Draft", shortLabel: "Draft", tone: "neutral" },
  PENDING_APPROVAL: {
    label: "Pending approval",
    shortLabel: "Pending",
    tone: "info",
  },
  APPROVED: { label: "Approved", shortLabel: "Approved", tone: "blue" },
  REJECTED: {
    label: "Returned for correction",
    shortLabel: "Correction",
    tone: "danger",
  },
  ACTIVATION_PENDING: {
    label: "Activation pending",
    shortLabel: "Activating",
    tone: "warning",
  },
  ACTIVATED: { label: "Activated", shortLabel: "Activated", tone: "success" },
};

const LIFECYCLE_STATUSES: AccountRequestStatus[] = [
  "PENDING_APPROVAL",
  "APPROVED",
  "ACTIVATION_PENDING",
  "ACTIVATED",
  "REJECTED",
  "DRAFT",
];

function formatRole(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Time unavailable";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getRequesterName(request: AdminAccountRequestListItem): string {
  return (
    request.requestedBy.employee?.empName ??
    request.requestedBy.username ??
    "Unknown requester"
  );
}

export function SuperAdminDashboardOverview({
  accessToken,
}: SuperAdminDashboardOverviewProps) {
  const [summary, setSummary] =
    useState<AdminAccountRequestSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);

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
            : "Dashboard information could not be loaded.",
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

  const counts = summary?.counts ?? {
    DRAFT: 0,
    PENDING_APPROVAL: 0,
    APPROVED: 0,
    REJECTED: 0,
    ACTIVATION_PENDING: 0,
    ACTIVATED: 0,
  };

  const lifecycleMaximum = useMemo(
    () => Math.max(1, ...LIFECYCLE_STATUSES.map((status) => counts[status])),
    [counts],
  );

  const metricCards = [
    {
      label: "Pending approvals",
      value: counts.PENDING_APPROVAL,
      detail: "Requests waiting for your review",
      href: "/super-admin/account-requests?status=PENDING_APPROVAL",
      icon: "requests" as const,
      tone: "urgent",
    },
    {
      label: "Activation pending",
      value: counts.ACTIVATION_PENDING,
      detail: "Approved identities completing activation",
      href: "/super-admin/account-requests?status=ACTIVATION_PENDING",
      icon: "profile" as const,
      tone: "activation",
    },
    {
      label: "Returned for correction",
      value: counts.REJECTED,
      detail: "Requests requiring requester follow-up",
      href: "/super-admin/account-requests?status=REJECTED",
      icon: "monitoring" as const,
      tone: "rejected",
    },
    {
      label: "Activation completion",
      value: `${summary?.activationCompletionRate ?? 100}%`,
      detail: `${counts.ACTIVATED} fully activated request${
        counts.ACTIVATED === 1 ? "" : "s"
      }`,
      href: "/super-admin/account-requests?status=ACTIVATED",
      icon: "analytics" as const,
      tone: "healthy",
    },
  ];

  return (
    <main className="super-admin-overview">
      <header className="super-admin-overview__hero">
        <div className="super-admin-overview__hero-copy">
          <span className="super-admin-overview__eyebrow">Operations center</span>
          <h1>Super Admin Dashboard</h1>
          <p>
            Prioritize account governance, activation follow-up and recent
            administrative activity across Nepal Telecom.
          </p>
        </div>

        <div className="super-admin-overview__refresh">
          <span>
            {summary ? `Updated ${formatDate(summary.generatedAt)}` : "Loading current data"}
          </span>
          <button
            type="button"
            onClick={() => setRefreshKey((current) => current + 1)}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh dashboard"}
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
        aria-label="Governance summary"
      >
        {metricCards.map((metric, index) => (
          <Link
            key={metric.label}
            className={`super-admin-overview__metric super-admin-overview__metric--${metric.tone}`}
            style={{ "--metric-order": index } as CSSProperties}
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
              Open queue →
            </span>
          </Link>
        ))}
      </section>

      <section className="super-admin-overview__primary-grid">
        <article className="super-admin-overview__panel super-admin-overview__attention">
          <header>
            <div>
              <span>Attention center</span>
              <h2>Governance work requiring follow-up</h2>
              <p>
                {summary?.attentionTotal ?? 0} request
                {(summary?.attentionTotal ?? 0) === 1 ? "" : "s"} currently need attention.
              </p>
            </div>
            <Link to="/super-admin/account-requests">Review all requests</Link>
          </header>

          {!loading && summary?.attentionRequests.length === 0 ? (
            <div className="super-admin-overview__all-clear">
              <span aria-hidden="true">✓</span>
              <div>
                <strong>Governance queue is clear</strong>
                <p>
                  There are no pending approvals, activation follow-ups or
                  returned requests at this time.
                </p>
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
                      {request.empId} · {formatRole(request.requestedRole)} ·{" "}
                      {getRequesterName(request)}
                    </small>
                  </span>
                  <span
                    className={`super-admin-overview__status super-admin-overview__status--${STATUS_META[request.status].tone}`}
                  >
                    {STATUS_META[request.status].shortLabel}
                  </span>
                  <time>{formatDate(request.updatedAt)}</time>
                </Link>
              ))}
            </div>
          )}
        </article>

        <article className="super-admin-overview__panel super-admin-overview__quick-actions">
          <header>
            <div>
              <span>Governance workflow</span>
              <h2>Quick actions</h2>
              <p>Open the most frequently used administrative workspaces.</p>
            </div>
          </header>

          <div className="super-admin-overview__actions">
            <Link to="/super-admin/account-requests">
              <ManagementIcon name="requests" />
              <span>
                <strong>Review account requests</strong>
                <small>Approve, reject and inspect activation progress.</small>
              </span>
            </Link>
            <Link to="/directory">
              <ManagementIcon name="directory" />
              <span>
                <strong>Open employee directory</strong>
                <small>Review identities, roles and account status.</small>
              </span>
            </Link>
            <Link to="/super-admin/management-positions">
              <ManagementIcon name="management" />
              <span>
                <strong>Management positions</strong>
                <small>Inspect occupied, reserved and vacant positions.</small>
              </span>
            </Link>
            <Link to="/super-admin?view=analytics">
              <ManagementIcon name="analytics" />
              <span>
                <strong>View full analytics</strong>
                <small>Open privacy-safe workforce and governance analytics.</small>
              </span>
            </Link>
          </div>
        </article>
      </section>

      <section className="super-admin-overview__secondary-grid">
        <article className="super-admin-overview__panel super-admin-overview__lifecycle">
          <header>
            <div>
              <span>Request lifecycle</span>
              <h2>Current workflow distribution</h2>
              <p>{summary?.totalRequests ?? 0} total account requests.</p>
            </div>
          </header>

          <div className="super-admin-overview__lifecycle-list">
            {LIFECYCLE_STATUSES.map((status) => (
              <Link
                key={status}
                to={`/super-admin/account-requests?status=${status}`}
              >
                <span>{STATUS_META[status].label}</span>
                <span className="super-admin-overview__lifecycle-track" aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.max(
                        counts[status] > 0 ? 8 : 0,
                        (counts[status] / lifecycleMaximum) * 100,
                      )}%`,
                    }}
                  />
                </span>
                <strong>{counts[status]}</strong>
              </Link>
            ))}
          </div>
        </article>

        <article className="super-admin-overview__panel super-admin-overview__activity">
          <header>
            <div>
              <span>Recent governance activity</span>
              <h2>Latest request updates</h2>
              <p>Administrative metadata only—no communication content.</p>
            </div>
          </header>

          {summary?.recentActivity.length ? (
            <div className="super-admin-overview__activity-list">
              {summary.recentActivity.map((request) => (
                <Link
                  key={request.id}
                  to={`/super-admin/account-requests?status=${request.status}&request=${request.id}`}
                >
                  <span
                    className={`super-admin-overview__activity-dot super-admin-overview__activity-dot--${STATUS_META[request.status].tone}`}
                    aria-hidden="true"
                  />
                  <span>
                    <strong>{request.empName}</strong>
                    <small>
                      {STATUS_META[request.status].label} · {request.empId}
                    </small>
                  </span>
                  <time>{formatDate(request.updatedAt)}</time>
                </Link>
              ))}
            </div>
          ) : (
            <div className="super-admin-overview__compact-empty">
              No request activity has been recorded yet.
            </div>
          )}
        </article>
      </section>

      <footer className="super-admin-overview__notice">
        <ManagementIcon name="monitoring" />
        <div>
          <strong>Privacy-safe governance overview</strong>
          <p>
            This dashboard uses account-request and activation metadata only.
            Private messages, attachment contents and communication relationships
            are never displayed.
          </p>
        </div>
      </footer>
    </main>
  );
}
