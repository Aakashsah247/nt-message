import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

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
  t: TFunction<"requests">,
): ManagerDashboardContent {
  // Senior Management governs Team Manager requests across its assigned division.
  if (role === "SENIOR_MANAGEMENT") {
    return {
      eyebrow: t("dashboard.senior.eyebrow", { ns: "requests" }),
      title: t("dashboard.senior.title", { ns: "requests" }),
      description: t("dashboard.senior.description", { ns: "requests" }),
      requestedRoleLabel: t("dashboard.senior.requestRole", { ns: "requests" }),
      accountRequestsPath: "/senior-management/account-requests",
      scopeTitle: t("dashboard.senior.scope", { ns: "requests" }),
      scopeDescription: t("dashboard.senior.scopeDescription", { ns: "requests" }),
    };
  }

  // Team Managers govern employee onboarding inside one assigned department.
  return {
    eyebrow: t("dashboard.manager.eyebrow", { ns: "requests" }),
    title: t("dashboard.manager.title", { ns: "requests" }),
    description: t("dashboard.manager.description", { ns: "requests" }),
    requestedRoleLabel: t("dashboard.manager.requestRole", { ns: "requests" }),
    accountRequestsPath: "/team-manager/account-requests",
    scopeTitle: t("dashboard.manager.scope", { ns: "requests" }),
    scopeDescription: t("dashboard.manager.scopeDescription", { ns: "requests" }),
  };
}

function getErrorMessage(error: unknown, t: TFunction<"requests">): string {
  return error instanceof Error
    ? error.message
    : t("dashboard.loadError", { ns: "requests" });
}

function fallbackFormatRole(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatRole(role: string, t: TFunction<"requests">): string {
  return t(`values.${role}`, {
    ns: "requests",
    defaultValue: fallbackFormatRole(role),
  });
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(
    locale === "ne" ? "ne-NP-u-ca-gregory" : "en-GB",
    { dateStyle: "medium" },
  ).format(new Date(value));
}

export function ManagerRequestDashboardPage() {
  const { t, i18n } = useTranslation("requests");
  const { account, accessToken } = useAuth();
  const [requestContext, setRequestContext] =
    useState<ManagerRequestContextResponse | null>(null);
  const [requestSummary, setRequestSummary] =
    useState<MyAccountRequestListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  const dashboardContent = useMemo(
    () => getDashboardContent(account?.role, t),
    [account?.role, t],
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
        setError(getErrorMessage(requestError, t));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, retryKey, t]);

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
                <small>{t("dashboard.authorizedRequest")}</small>
                <strong>{dashboardContent.requestedRoleLabel}</strong>
              </div>
            </div>

            <Link
              className="manager-home__primary-action"
              to={dashboardContent.accountRequestsPath}
            >
              {t("dashboard.openRequests")}
            </Link>
          </div>
        </header>

        {loading && (
          <section className="manager-workspace-state" aria-live="polite">
            <div className="spinner" />
            <p>{t("dashboard.loading")}</p>
          </section>
        )}

        {!loading && (!accessToken || error) && (
          <section className="manager-workspace-state manager-workspace-state--error" role="alert">
            <div>
              <strong>{t("dashboard.unavailable")}</strong>
              <p>
                {accessToken
                  ? error
                  : t("dashboard.sessionUnavailable")}
              </p>
            </div>
            <button type="button" onClick={retryLoading}>
              {t("common.tryAgain")}
            </button>
          </section>
        )}

        {!loading && !error && requestContext && (
          <>
            <section className="manager-home__summary" aria-label={t("dashboard.summaryAria")}>
              <article>
                <span>{t("common.currentRole")}</span>
                <strong>{formatRole(requestContext.role, t)}</strong>
                <p>{account?.positionLabel || dashboardContent.scopeTitle}</p>
              </article>

              <article>
                <span>{t("common.assignedDivision")}</span>
                <strong>{requestContext.scope.division.name}</strong>
                <p>{requestContext.scope.division.code}</p>
              </article>

              <article>
                <span>
                  {requestContext.role === "SENIOR_MANAGEMENT"
                    ? t("common.availableDepartments")
                    : t("common.assignedDepartment")}
                </span>
                <strong>
                  {requestContext.role === "SENIOR_MANAGEMENT"
                    ? requestContext.departments.length
                    : requestContext.scope.department?.name ?? t("common.notAssigned")}
                </strong>
                <p>
                  {requestContext.role === "SENIOR_MANAGEMENT"
                    ? t("dashboard.activeDepartments")
                    : requestContext.scope.department?.code ?? t("common.scopeUnavailable")}
                </p>
              </article>

              <article>
                <span>{t("dashboard.requests")}</span>
                <strong>{totalRequests}</strong>
                <p>{t("dashboard.requestsDescription")}</p>
              </article>
            </section>

            <section className="manager-home__workspace">
              <article className="manager-home__overview-card">
                <header>
                  <div>
                    <span>{dashboardContent.scopeTitle}</span>
                    <h2>{t("dashboard.trustedScope")}</h2>
                  </div>
                  <span className="manager-home__role-badge">
                    {t("dashboard.requestedRoleBadge", { role: formatRole(requestContext.requestedRole, t) })}
                  </span>
                </header>

                <div className="manager-home__scope-details">
                  <div>
                    <span>{t("common.division")}</span>
                    <strong>{requestContext.scope.division.name}</strong>
                    <small>{requestContext.scope.division.code}</small>
                  </div>

                  <div>
                    <span>{t("common.department")}</span>
                    <strong>
                      {requestContext.scope.department?.name ?? t("dashboard.divisionWide")}
                    </strong>
                    <small>
                      {requestContext.scope.department?.code ??
                        t("dashboard.departmentsAvailable", { count: requestContext.departments.length })}
                    </small>
                  </div>

                  <div>
                    <span>{t("common.approvalAuthority")}</span>
                    <strong>{t("common.superAdmin")}</strong>
                    <small>{t("dashboard.centralApproval")}</small>
                  </div>
                </div>

                <p className="manager-home__scope-note">
                  {dashboardContent.scopeDescription}
                </p>
              </article>

              <article className="manager-home__recent-card">
                <header>
                  <div>
                    <span>{t("dashboard.recentActivity")}</span>
                    <h2>{t("dashboard.latestRequests")}</h2>
                  </div>
                  <Link to={dashboardContent.accountRequestsPath}>{t("dashboard.viewAll")}</Link>
                </header>

                {recentRequests.length === 0 ? (
                  <div className="manager-home__recent-empty">
                    <span aria-hidden="true">≡</span>
                    <strong>{t("dashboard.noRequests")}</strong>
                    <p>{t("dashboard.noRequestsDescription")}</p>
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
                            {request.empId} · {request.department?.name ?? t("common.noDepartment")}
                          </small>
                        </div>
                        <div className="manager-home__recent-meta">
                          <span
                            className={`manager-request-status manager-request-status--${request.status
                              .toLowerCase()
                              .replaceAll("_", "-")}`}
                          >
                            {formatRole(request.status, t)}
                          </span>
                          <small>{formatDate(request.submittedAt, i18n.language)}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </section>

            <section className="manager-home__quick-actions" aria-label={t("dashboard.quickActionsAria")}>
              <Link to="/work-management">
                <span aria-hidden="true">01</span>
                <div>
                  <strong>{t("dashboard.work")}</strong>
                  <p>{t("dashboard.workDescription")}</p>
                </div>
              </Link>

              <Link to={dashboardContent.accountRequestsPath}>
                <span aria-hidden="true">02</span>
                <div>
                  <strong>{t("dashboard.createRequest")}</strong>
                  <p>{t("dashboard.createRequestDescription", { role: dashboardContent.requestedRoleLabel })}</p>
                </div>
              </Link>

              <Link to="/directory">
                <span aria-hidden="true">03</span>
                <div>
                  <strong>{t("dashboard.directory")}</strong>
                  <p>{t("dashboard.directoryDescription")}</p>
                </div>
              </Link>

              <Link to="/messages">
                <span aria-hidden="true">04</span>
                <div>
                  <strong>{t("dashboard.messages")}</strong>
                  <p>{t("dashboard.messagesDescription")}</p>
                </div>
              </Link>
            </section>

            <section className="manager-home__analytics">
              <MessagingAnalyticsPanel accessToken={accessToken ?? ""} />
            </section>

            <section className="manager-home__security-notice">
              <span aria-hidden="true">✓</span>
              <div>
                <strong>{t("dashboard.backendProtection")}</strong>
                <p>{dashboardContent.scopeDescription}</p>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
