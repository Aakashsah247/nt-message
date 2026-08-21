import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import { MessagingAnalyticsPanel } from "../components/MessagingAnalyticsPanel";
import { useAuth } from "../context/AuthContext";
import {
  getMyRequestContext,
  listMyAccountRequests,
} from "../services/account-request.service";

import type {
  ManagerRequestContextResponse,
  MyAccountRequestListResponse,
} from "../types/account-request";
import type { AccountRole } from "../types/auth";

interface ManagerDashboardContent {
  eyebrow: string;
  title: string;
  description: string;
  requestedRoleLabel: string;
  accountRequestsPath: string;
  scopeTitle: string;
  scopeDescription: string;
}

function getDashboardContent(
  role: AccountRole | undefined,
): ManagerDashboardContent {
  // Senior Management governs Team Manager requests across its assigned division.
  if (role === "SENIOR_MANAGEMENT") {
    return {
      eyebrow: "Division leadership workspace",
      title: "Division Leadership Dashboard",
      description:
        "Review your division scope, leadership request activity and organization analytics from one management workspace.",
      requestedRoleLabel: "Team Manager",
      accountRequestsPath: "/senior-management/account-requests",
      scopeTitle: "Division governance",
      scopeDescription:
        "Your account can request Team Managers only for active departments inside the assigned division.",
    };
  }

  // Team Managers govern employee onboarding inside one assigned department.
  return {
    eyebrow: "Department operations workspace",
    title: "Department Operations Dashboard",
    description:
      "Monitor your department scope, employee onboarding activity and organization analytics from one management workspace.",
    requestedRoleLabel: "Employee",
    accountRequestsPath: "/team-manager/account-requests",
    scopeTitle: "Department onboarding",
    scopeDescription:
      "Your account can request Employees only for the department assigned to your management position.",
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Your management dashboard could not be loaded.";
}

function formatRole(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatStatus(status: string): string {
  return formatRole(status);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function ManagerRequestDashboardPage() {
  const { account, accessToken } = useAuth();
  const [requestContext, setRequestContext] =
    useState<ManagerRequestContextResponse | null>(null);
  const [requestSummary, setRequestSummary] =
    useState<MyAccountRequestListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  const dashboardContent = useMemo(
    () => getDashboardContent(account?.role),
    [account?.role],
  );

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    Promise.all([
      getMyRequestContext(accessToken),
      listMyAccountRequests(accessToken, undefined, 1, 4),
    ])
      .then(([contextResponse, requestResponse]) => {
        if (!active) {
          return;
        }

        setRequestContext(contextResponse);
        setRequestSummary(requestResponse);
        setError("");
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setRequestContext(null);
        setRequestSummary(null);
        setError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, retryKey]);

  function retryLoading(): void {
    setLoading(true);
    setError("");
    setRetryKey((current) => current + 1);
  }

  const recentRequests = requestSummary?.data ?? [];
  const totalRequests = requestSummary?.pagination.total ?? 0;

  return (
    <main className="management-page manager-home">
      <section className="manager-home__canvas">
        <header className="manager-home__hero">
          <div className="manager-home__hero-copy">
            <span>{dashboardContent.eyebrow}</span>
            <h1>{dashboardContent.title}</h1>
            <p>{dashboardContent.description}</p>
          </div>

          <div className="manager-home__hero-actions">
            <div className="manager-home__authority">
              <span aria-hidden="true">✓</span>
              <div>
                <small>Authorized request</small>
                <strong>{dashboardContent.requestedRoleLabel}</strong>
              </div>
            </div>

            <Link
              className="manager-home__primary-action"
              to={dashboardContent.accountRequestsPath}
            >
              Open Account Requests
            </Link>
          </div>
        </header>

        {loading && (
          <section className="manager-workspace-state" aria-live="polite">
            <div className="spinner" />
            <p>Loading your trusted organization scope...</p>
          </section>
        )}

        {!loading && (!accessToken || error) && (
          <section className="manager-workspace-state manager-workspace-state--error" role="alert">
            <div>
              <strong>Dashboard unavailable</strong>
              <p>
                {accessToken
                  ? error
                  : "Your secure session is not available. Sign in again."}
              </p>
            </div>
            <button type="button" onClick={retryLoading}>
              Try again
            </button>
          </section>
        )}

        {!loading && !error && requestContext && (
          <>
            <section className="manager-home__summary" aria-label="Management summary">
              <article>
                <span>Current role</span>
                <strong>{formatRole(requestContext.role)}</strong>
                <p>{account?.positionLabel || dashboardContent.scopeTitle}</p>
              </article>

              <article>
                <span>Assigned division</span>
                <strong>{requestContext.scope.division.name}</strong>
                <p>{requestContext.scope.division.code}</p>
              </article>

              <article>
                <span>
                  {requestContext.role === "SENIOR_MANAGEMENT"
                    ? "Available departments"
                    : "Assigned department"}
                </span>
                <strong>
                  {requestContext.role === "SENIOR_MANAGEMENT"
                    ? requestContext.departments.length
                    : requestContext.scope.department?.name ?? "Not assigned"}
                </strong>
                <p>
                  {requestContext.role === "SENIOR_MANAGEMENT"
                    ? "Active departments inside your division"
                    : requestContext.scope.department?.code ?? "Scope unavailable"}
                </p>
              </article>

              <article>
                <span>Account requests</span>
                <strong>{totalRequests}</strong>
                <p>Requests submitted by your account</p>
              </article>
            </section>

            <section className="manager-home__workspace">
              <article className="manager-home__overview-card">
                <header>
                  <div>
                    <span>{dashboardContent.scopeTitle}</span>
                    <h2>Trusted organizational scope</h2>
                  </div>
                  <span className="manager-home__role-badge">
                    {formatRole(requestContext.requestedRole)} requests
                  </span>
                </header>

                <div className="manager-home__scope-details">
                  <div>
                    <span>Division</span>
                    <strong>{requestContext.scope.division.name}</strong>
                    <small>{requestContext.scope.division.code}</small>
                  </div>

                  <div>
                    <span>Department</span>
                    <strong>
                      {requestContext.scope.department?.name ?? "Division-wide scope"}
                    </strong>
                    <small>
                      {requestContext.scope.department?.code ??
                        `${requestContext.departments.length} departments available`}
                    </small>
                  </div>

                  <div>
                    <span>Approval authority</span>
                    <strong>Super Admin</strong>
                    <small>Every request requires centralized approval</small>
                  </div>
                </div>

                <p className="manager-home__scope-note">
                  {dashboardContent.scopeDescription}
                </p>
              </article>

              <article className="manager-home__recent-card">
                <header>
                  <div>
                    <span>Recent activity</span>
                    <h2>Latest account requests</h2>
                  </div>
                  <Link to={dashboardContent.accountRequestsPath}>View all</Link>
                </header>

                {recentRequests.length === 0 ? (
                  <div className="manager-home__recent-empty">
                    <span aria-hidden="true">≡</span>
                    <strong>No requests submitted yet</strong>
                    <p>Create the first approved onboarding request from Account Requests.</p>
                  </div>
                ) : (
                  <div className="manager-home__recent-list">
                    {recentRequests.map((request) => (
                      <div key={request.id} className="manager-home__recent-item">
                        <span className="manager-home__recent-avatar" aria-hidden="true">
                          {request.empName.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <strong>{request.empName}</strong>
                          <small>
                            {request.empId} · {request.department?.name ?? "No department"}
                          </small>
                        </div>
                        <div className="manager-home__recent-meta">
                          <span
                            className={`manager-request-status manager-request-status--${request.status
                              .toLowerCase()
                              .replaceAll("_", "-")}`}
                          >
                            {formatStatus(request.status)}
                          </span>
                          <small>{formatDate(request.submittedAt)}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </section>

            <section className="manager-home__quick-actions" aria-label="Quick actions">
              <Link to="/work-management">
                <span aria-hidden="true">01</span>
                <div>
                  <strong>Open Work Management</strong>
                  <p>Assign operational work, review tickets and manage completion reports.</p>
                </div>
              </Link>

              <Link to={dashboardContent.accountRequestsPath}>
                <span aria-hidden="true">02</span>
                <div>
                  <strong>Create account request</strong>
                  <p>Submit a new {dashboardContent.requestedRoleLabel} onboarding request.</p>
                </div>
              </Link>

              <Link to="/directory">
                <span aria-hidden="true">03</span>
                <div>
                  <strong>Open organization directory</strong>
                  <p>Review active employees and management contacts in your scope.</p>
                </div>
              </Link>

              <Link to="/messages">
                <span aria-hidden="true">04</span>
                <div>
                  <strong>Open secure messaging</strong>
                  <p>Continue internal communication in the dedicated messaging workspace.</p>
                </div>
              </Link>
            </section>

            <section className="manager-home__analytics">
              <MessagingAnalyticsPanel accessToken={accessToken ?? ""} />
            </section>

            <section className="manager-home__security-notice">
              <span aria-hidden="true">✓</span>
              <div>
                <strong>Backend scope protection is active</strong>
                <p>{dashboardContent.scopeDescription}</p>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
