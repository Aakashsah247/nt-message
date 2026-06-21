import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { ManagerAccountRequestForm } from "../components/ManagerAccountRequestForm";

import { ManagerRequestHistory } from "../components/ManagerRequestHistory";
import { useAuth } from "../context/AuthContext";
import { getMyRequestContext } from "../services/account-request.service";

import type { ManagerRequestContextResponse } from "../types/account-request";
import type { AccountRole } from "../types/auth";

interface ManagerDashboardContent {
  roleLabel: string;
  title: string;
  description: string;
  requestLabel: string;
  requestedRoleLabel: string;
}

function getDashboardContent(
  role: AccountRole | undefined,
): ManagerDashboardContent {
  if (role === "SENIOR_MANAGEMENT") {
    return {
      roleLabel: "SENIOR MANAGEMENT",
      title: "Division Account Requests",
      description:
        "Request Team Manager accounts for active departments inside your assigned division.",
      requestLabel: "Team Manager account request",
      requestedRoleLabel: "Team Manager",
    };
  }

  return {
    roleLabel: "TEAM MANAGER",
    title: "Department Account Requests",
    description:
      "Request employee accounts for personnel inside your assigned department.",
    requestLabel: "Employee account request",
    requestedRoleLabel: "Employee",
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Your account-request scope could not be loaded.";
}

function formatRole(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ManagerRequestDashboardPage() {
  const navigate = useNavigate();

  const { account, accessToken, logout } = useAuth();

  const [requestContext, setRequestContext] =
    useState<ManagerRequestContextResponse | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [loggingOut, setLoggingOut] = useState(false);

  const [retryKey, setRetryKey] = useState(0);

  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const dashboardContent = useMemo(
    () => getDashboardContent(account?.role),
    [account?.role],
  );

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let active = true;

    getMyRequestContext(accessToken)
      .then((response) => {
        if (!active) {
          return;
        }

        setRequestContext(response);

        setError("");
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setRequestContext(null);

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

  const contextLoading = Boolean(accessToken) && loading;

  const contextError = accessToken
    ? error
    : "Your secure session is not available. Sign in again.";

  const managerName = account?.username ?? dashboardContent.roleLabel;

  return (
    <main className="manager-dashboard-shell">
      <header className="manager-topbar">
        <div className="manager-brand">
          <div className="manager-logo">
            <img src="/nt-logo.png" alt="Nepal Telecom" />
          </div>

          <div>
            <strong>NT Message</strong>

            <span>Internal Account Portal</span>
          </div>
        </div>

        <div className="manager-account">
          <div>
            <span>Signed in as</span>

            <strong>{managerName}</strong>
          </div>

          <button type="button" onClick={handleLogout} disabled={loggingOut}>
            {loggingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </header>

      <section className="manager-dashboard-content">
        <div className="manager-page-heading">
          <div>
            <span className="manager-eyebrow">
              {dashboardContent.roleLabel}
            </span>

            <h1>{dashboardContent.title}</h1>

            <p>{dashboardContent.description}</p>
          </div>

          <div className="manager-role-chip">
            <span>Allowed request</span>

            <strong>{dashboardContent.requestedRoleLabel}</strong>
          </div>
        </div>

        {contextLoading && (
          <div className="manager-context-loading">
            <div className="spinner" />

            <p>Loading your organization scope...</p>
          </div>
        )}

        {!contextLoading && error && (
          <div className="manager-context-error" role="alert">
            <div>
              <strong>Account-request access unavailable</strong>

              <p>{contextError}</p>
            </div>

            <button type="button" onClick={retryLoading}>
              Try again
            </button>
          </div>
        )}

        {!contextLoading && !contextError && requestContext && (
          <>
            <section
              className="manager-scope-grid"
              aria-label="Assigned organization scope"
            >
              <article className="manager-scope-card">
                <span>Current role</span>

                <strong>{formatRole(requestContext.role)}</strong>

                <p>Your authenticated organizational role.</p>
              </article>

              <article className="manager-scope-card">
                <span>Assigned division</span>

                <strong>{requestContext.scope.division.name}</strong>

                <p>{requestContext.scope.division.code}</p>
              </article>

              <article className="manager-scope-card">
                <span>Assigned department</span>

                <strong>
                  {requestContext.scope.department?.name ??
                    "Division-wide scope"}
                </strong>

                <p>
                  {requestContext.scope.department?.code ??
                    "Select an active department when submitting a request."}
                </p>
              </article>

              <article className="manager-scope-card">
                <span>Allowed departments</span>

                <strong>{requestContext.departments.length}</strong>

                <p>
                  {requestContext.role === "SENIOR_MANAGEMENT"
                    ? "Active departments inside your division."
                    : "Your assigned department only."}
                </p>
              </article>
            </section>

            <section className="manager-workspace-grid">
              <ManagerAccountRequestForm
                accessToken={accessToken ?? ""}
                requestContext={requestContext}
                onSubmitted={() =>
                  setHistoryRefreshKey((current) => current + 1)
                }
              />

              <ManagerRequestHistory
                accessToken={accessToken ?? ""}
                requestContext={requestContext}
                refreshKey={historyRefreshKey}
              />
            </section>

            <section className="manager-scope-notice">
              <div aria-hidden="true">✓</div>

              <div>
                <strong>Backend scope protection is active</strong>

                <p>
                  {requestContext.role === "SENIOR_MANAGEMENT"
                    ? "Only Team Manager requests for departments inside your assigned division will be accepted."
                    : "Only Employee requests for your assigned department will be accepted."}
                </p>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
