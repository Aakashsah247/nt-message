import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useNavigate } from "react-router";

import { ManagerAccountRequestForm } from "../components/ManagerAccountRequestForm";
import { ManagerRequestHistory } from "../components/ManagerRequestHistory";
import { MessagingAnalyticsPanel } from "../components/MessagingAnalyticsPanel";
import { NtDashboardShell } from "../components/NtDashboardShell";
import { useAuth } from "../context/AuthContext";
import { getMyRequestContext } from "../services/account-request.service";

import type {
  ManagerRequestContextResponse,
} from "../types/account-request";

import type {
  AccountRole,
} from "../types/auth";

interface ManagerDashboardContent {
  roleLabel: string;
  title: string;
  description: string;
  requestedRoleLabel: string;
}

function getDashboardContent(
  role: AccountRole | undefined,
): ManagerDashboardContent {
  // Senior Management can request Team Managers inside its assigned division.
  if (
    role ===
    "SENIOR_MANAGEMENT"
  ) {
    return {
      roleLabel:
        "SENIOR MANAGEMENT",

      title:
        "Division Account Requests",

      description:
        "Request Team Manager accounts for active departments inside your assigned Nepal Telecom division.",

      requestedRoleLabel:
        "Team Manager",
    };
  }

  // Team Managers can request employees only inside their assigned department.
  return {
    roleLabel:
      "TEAM MANAGER",

    title:
      "Department Account Requests",

    description:
      "Request employee accounts for personnel inside your assigned Nepal Telecom department.",

    requestedRoleLabel:
      "Employee",
  };
}

function getErrorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : "Your account-request scope could not be loaded.";
}

function formatRole(
  role: string,
): string {
  return role
    .toLowerCase()
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(" ");
}

export function ManagerRequestDashboardPage() {
  const navigate =
    useNavigate();

  const {
    account,
    accessToken,
    logout,
  } = useAuth();

  const [
    requestContext,
    setRequestContext,
  ] =
    useState<ManagerRequestContextResponse | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    loggingOut,
    setLoggingOut,
  ] =
    useState(false);

  const [
    retryKey,
    setRetryKey,
  ] =
    useState(0);

  const [
    historyRefreshKey,
    setHistoryRefreshKey,
  ] =
    useState(0);

  // Dashboard wording changes automatically according to the authenticated role.
  const dashboardContent =
    useMemo(
      () =>
        getDashboardContent(
          account?.role,
        ),
      [
        account?.role,
      ],
    );

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let active = true;

    // The backend returns the trusted division and department scope.
    getMyRequestContext(
      accessToken,
    )
      .then(
        (
          response,
        ) => {
          if (!active) {
            return;
          }

          setRequestContext(
            response,
          );

          setError("");
        },
      )
      .catch(
        (
          requestError:
            unknown,
        ) => {
          if (!active) {
            return;
          }

          setRequestContext(
            null,
          );

          setError(
            getErrorMessage(
              requestError,
            ),
          );
        },
      )
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    // The active flag prevents state updates after the page is unmounted.
    return () => {
      active = false;
    };
  }, [
    accessToken,
    retryKey,
  ]);

  function retryLoading():
    void {
    setLoading(true);
    setError("");

    setRetryKey(
      (current) =>
        current + 1,
    );
  }

  async function handleLogout():
    Promise<void> {
    setLoggingOut(true);

    try {
      await logout();

      navigate(
        "/login",
        {
          replace: true,
        },
      );
    } finally {
      setLoggingOut(false);
    }
  }

  const contextLoading =
    Boolean(accessToken) &&
    loading;

  const contextError =
    accessToken
      ? error
      : "Your secure session is not available. Sign in again.";

  const managerName =
    account?.displayName ??
    dashboardContent.roleLabel;

  const headingAside = (
    <div className="nt-scope-summary">
      <span aria-hidden="true">
        ✓
      </span>

      <div>
        <strong>
          Authorized request
        </strong>

        <p>
          {dashboardContent.requestedRoleLabel}
        </p>
      </div>
    </div>
  );

  // Both management roles use the same branded dashboard structure.
  return (
    <NtDashboardShell
      roleLabel={
        account?.positionLabel ??
        dashboardContent.roleLabel
      }
      title={
        dashboardContent.title
      }
      description={
        dashboardContent.description
      }
      accountName={
        managerName
      }
      loggingOut={
        loggingOut
      }
      onLogout={
        handleLogout
      }
      headingAside={
        headingAside
      }
    >
      {contextLoading && (
        <div className="manager-context-loading">
          <div className="spinner" />

          <p>
            Loading your organization scope...
          </p>
        </div>
      )}

      {!contextLoading &&
        contextError && (
          <div
            className="manager-context-error"
            role="alert"
          >
            <div>
              <strong>
                Account-request access unavailable
              </strong>

              <p>
                {contextError}
              </p>
            </div>

            <button
              type="button"
              onClick={
                retryLoading
              }
            >
              Try again
            </button>
          </div>
        )}

      {!contextLoading &&
        !contextError &&
        requestContext && (
          <>
            {/* These cards display the manager's trusted organization assignment. */}
            <section
              className="manager-scope-grid nt-manager-scope-grid"
              aria-label="Assigned organization scope"
            >
              <article className="manager-scope-card">
                <span>
                  Current role
                </span>

                <strong>
                  {formatRole(
                    requestContext.role,
                  )}
                </strong>

                <p>
                  Your authenticated organizational role.
                </p>
              </article>

              <article className="manager-scope-card">
                <span>
                  Assigned division
                </span>

                <strong>
                  {
                    requestContext
                      .scope
                      .division
                      .name
                  }
                </strong>

                <p>
                  {
                    requestContext
                      .scope
                      .division
                      .code
                  }
                </p>
              </article>

              <article className="manager-scope-card">
                <span>
                  Assigned department
                </span>

                <strong>
                  {requestContext
                    .scope
                    .department
                    ?.name ??
                    "Division-wide scope"}
                </strong>

                <p>
                  {requestContext
                    .scope
                    .department
                    ?.code ??
                    "Select an active department when submitting a request."}
                </p>
              </article>

              <article className="manager-scope-card">
                <span>
                  Allowed departments
                </span>

                <strong>
                  {
                    requestContext
                      .departments
                      .length
                  }
                </strong>

                <p>
                  {requestContext.role ===
                  "SENIOR_MANAGEMENT"
                    ? "Active departments inside your assigned division."
                    : "Your assigned department only."}
                </p>
              </article>
            </section>

            {/* Request creation and tracking stay first for management workflows. */}
            <section className="manager-workspace-grid nt-manager-workspace">
              <ManagerAccountRequestForm
                accessToken={
                  accessToken ??
                  ""
                }
                requestContext={
                  requestContext
                }
                onSubmitted={() =>
                  setHistoryRefreshKey(
                    (
                      current,
                    ) =>
                      current +
                      1,
                  )
                }
              />

              <ManagerRequestHistory
                accessToken={
                  accessToken ??
                  ""
                }
                requestContext={
                  requestContext
                }
                refreshKey={
                  historyRefreshKey
                }
              />
            </section>

            {/* Analytics stays below request work so reports do not hide daily tasks. */}
            <MessagingAnalyticsPanel accessToken={accessToken ?? ""} />

            <section className="manager-scope-notice nt-manager-security-notice">
              <div aria-hidden="true">
                ✓
              </div>

              <div>
                <strong>
                  Backend scope protection is active
                </strong>

                <p>
                  {requestContext.role ===
                  "SENIOR_MANAGEMENT"
                    ? "Only Team Manager requests for departments inside your assigned division will be accepted."
                    : "Only Employee requests for your assigned department will be accepted."}
                </p>
              </div>
            </section>
          </>
        )}
    </NtDashboardShell>
  );
}
