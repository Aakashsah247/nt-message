import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import { ManagerAccountRequestForm } from "../components/ManagerAccountRequestForm";
import { ManagerRequestHistory } from "../components/ManagerRequestHistory";
import { MyAccountStatusPanel } from "../components/MyAccountStatusPanel";
import { useAuth } from "../context/AuthContext";
import { getMyRequestContext } from "../services/account-request.service";

import type { ManagerRequestContextResponse } from "../types/account-request";
import type { AccountRole } from "../types/auth";

type RequestWorkspaceTab = "MY_STATUS" | "REQUEST_MANAGEMENT";

interface ManagerRequestPageContent {
  eyebrow: string;
  title: string;
  description: string;
  requestedRoleLabel: string;
  dashboardPath: string;
  scopeLabel: string;
}

function getPageContent(role: AccountRole | undefined): ManagerRequestPageContent {
  if (role === "SENIOR_MANAGEMENT") {
    return {
      eyebrow: "Division account governance",
      title: "Account Requests",
      description:
        "Review your own account, manage Team Manager requests and monitor Employee requests submitted under your division.",
      requestedRoleLabel: "Team Manager",
      dashboardPath: "/senior-management",
      scopeLabel: "Division authority",
    };
  }

  return {
    eyebrow: "Department account governance",
    title: "Account Requests",
    description:
      "Review your own account and manage Employee requests for personnel inside your assigned department.",
    requestedRoleLabel: "Employee",
    dashboardPath: "/team-manager",
    scopeLabel: "Department authority",
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Your account-request workspace could not be loaded.";
}

function formatRole(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ManagerAccountRequestsPage() {
  const { account, accessToken } = useAuth();
  const [requestContext, setRequestContext] =
    useState<ManagerRequestContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [activeTab, setActiveTab] =
    useState<RequestWorkspaceTab>("MY_STATUS");

  const pageContent = useMemo(
    () => getPageContent(account?.role),
    [account?.role],
  );
  const isSeniorManagement = account?.role === "SENIOR_MANAGEMENT";

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

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

  return (
    <main className="management-page manager-requests-page">
      <section className="manager-requests-page__canvas">
        <header className="manager-requests-page__hero">
          <div>
            <span>{pageContent.eyebrow}</span>
            <h1>{pageContent.title}</h1>
            <p>{pageContent.description}</p>
          </div>

          <div className="manager-requests-page__hero-actions">
            <div className="manager-requests-page__authority">
              <span aria-hidden="true">✓</span>
              <div>
                <small>{pageContent.scopeLabel}</small>
                <strong>Request {pageContent.requestedRoleLabel}</strong>
              </div>
            </div>

            <Link to={pageContent.dashboardPath}>Back to Dashboard</Link>
          </div>
        </header>

        {loading && (
          <section className="manager-workspace-state" aria-live="polite">
            <div className="spinner" />
            <p>Loading your trusted request scope...</p>
          </section>
        )}

        {!loading && (!accessToken || error) && (
          <section className="manager-workspace-state manager-workspace-state--error" role="alert">
            <div>
              <strong>Account Requests unavailable</strong>
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
            <section
              className="manager-requests-page__scope-strip"
              aria-label="Trusted account-request scope"
            >
              <div>
                <span>Current role</span>
                <strong>{formatRole(requestContext.role)}</strong>
              </div>

              <div>
                <span>Assigned division</span>
                <strong>{requestContext.scope.division.name}</strong>
                <small>{requestContext.scope.division.code}</small>
              </div>

              <div>
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
                <small>
                  {requestContext.role === "SENIOR_MANAGEMENT"
                    ? "Active departments in your division"
                    : requestContext.scope.department?.code ?? "Scope unavailable"}
                </small>
              </div>

              <div>
                <span>Request authority</span>
                <strong>{formatRole(requestContext.requestedRole)}</strong>
                <small>Approval authority: Super Admin</small>
              </div>
            </section>

            <nav className="manager-requests-page__tabs" aria-label="Account request workspace sections">
              <button
                type="button"
                className={activeTab === "MY_STATUS" ? "active" : ""}
                aria-pressed={activeTab === "MY_STATUS"}
                onClick={() => setActiveTab("MY_STATUS")}
              >
                <span>01</span>
                <div>
                  <strong>My Account Status</strong>
                  <small>Own identity and activation</small>
                </div>
              </button>

              <button
                type="button"
                className={activeTab === "REQUEST_MANAGEMENT" ? "active" : ""}
                aria-pressed={activeTab === "REQUEST_MANAGEMENT"}
                onClick={() => setActiveTab("REQUEST_MANAGEMENT")}
              >
                <span>02</span>
                <div>
                  <strong>
                    {isSeniorManagement
                      ? "Request Management"
                      : "My Employee Requests"}
                  </strong>
                  <small>
                    {isSeniorManagement
                      ? "Team Manager requests and division oversight"
                      : "Create and track submitted requests"}
                  </small>
                </div>
              </button>

            </nav>

            {activeTab === "MY_STATUS" && (
              <section className="manager-requests-page__single-panel">
                <MyAccountStatusPanel accessToken={accessToken ?? ""} />
              </section>
            )}

            {activeTab === "REQUEST_MANAGEMENT" && (
              <section
                className={`manager-requests-page__request-management${
                  isSeniorManagement
                    ? " manager-requests-page__request-management--senior"
                    : ""
                }`}
                aria-label={
                  isSeniorManagement
                    ? "Team Manager requests and division Employee request oversight"
                    : "Employee account request management"
                }
              >
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
                  mode="SUBMITTED"
                />

                {isSeniorManagement && (
                  <div className="manager-requests-page__division-oversight">
                    {/* Division Employee requests are intentionally read-only.
                        The API remains the authority for organization scope. */}
                    <ManagerRequestHistory
                      accessToken={accessToken ?? ""}
                      requestContext={requestContext}
                      refreshKey={historyRefreshKey}
                      mode="DIVISION_EMPLOYEES"
                    />
                  </div>
                )}
              </section>
            )}

            <section className="manager-requests-page__security-notice">
              <span aria-hidden="true">✓</span>
              <div>
                <strong>Backend scope protection is active</strong>
                <p>
                  {requestContext.role === "SENIOR_MANAGEMENT"
                    ? "Your account can create Team Manager requests and read Employee requests only inside your assigned division."
                    : "Your account can create and track Employee requests only for your assigned department."}
                </p>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
