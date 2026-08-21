import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

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

function getPageContent(role: AccountRole | undefined, t: TFunction<"requests">): ManagerRequestPageContent {
  if (role === "SENIOR_MANAGEMENT") {
    return {
      eyebrow: t("managerPage.senior.eyebrow", { ns: "requests" }),
      title: t("managerPage.senior.title", { ns: "requests" }),
      description: t("managerPage.senior.description", { ns: "requests" }),
      requestedRoleLabel: t("managerPage.senior.requestedRole", { ns: "requests" }),
      dashboardPath: "/senior-management",
      scopeLabel: t("managerPage.senior.scope", { ns: "requests" }),
    };
  }

  return {
    eyebrow: t("managerPage.manager.eyebrow", { ns: "requests" }),
    title: t("managerPage.manager.title", { ns: "requests" }),
    description: t("managerPage.manager.description", { ns: "requests" }),
    requestedRoleLabel: t("managerPage.manager.requestedRole", { ns: "requests" }),
    dashboardPath: "/team-manager",
    scopeLabel: t("managerPage.manager.scope", { ns: "requests" }),
  };
}

function getErrorMessage(error: unknown, t: TFunction<"requests">): string {
  return error instanceof Error
    ? error.message
    : t("managerPage.loadError", { ns: "requests" });
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

export function ManagerAccountRequestsPage() {
  const { t } = useTranslation("requests");
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
    () => getPageContent(account?.role, t),
    [account?.role, t],
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
                <strong>{t("managerPage.requestRole", { role: pageContent.requestedRoleLabel })}</strong>
              </div>
            </div>

            <Link to={pageContent.dashboardPath}>{t("common.backToDashboard")}</Link>
          </div>
        </header>

        {loading && (
          <section className="manager-workspace-state" aria-live="polite">
            <div className="spinner" />
            <p>{t("managerPage.loading")}</p>
          </section>
        )}

        {!loading && (!accessToken || error) && (
          <section className="manager-workspace-state manager-workspace-state--error" role="alert">
            <div>
              <strong>{t("managerPage.unavailable")}</strong>
              <p>
                {accessToken
                  ? error
                  : t("managerPage.sessionUnavailable")}
              </p>
            </div>
            <button type="button" onClick={retryLoading}>
              {t("common.tryAgain")}
            </button>
          </section>
        )}

        {!loading && !error && requestContext && (
          <>
            <section
              className="manager-requests-page__scope-strip"
              aria-label={t("managerPage.scopeAria")}
            >
              <div>
                <span>{t("common.currentRole")}</span>
                <strong>{formatRole(requestContext.role, t)}</strong>
              </div>

              <div>
                <span>{t("common.assignedDivision")}</span>
                <strong>{requestContext.scope.division.name}</strong>
                <small>{requestContext.scope.division.code}</small>
              </div>

              <div>
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
                <small>
                  {requestContext.role === "SENIOR_MANAGEMENT"
                    ? t("managerPage.activeDepartments")
                    : requestContext.scope.department?.code ?? t("common.scopeUnavailable")}
                </small>
              </div>

              <div>
                <span>{t("common.requestAuthority")}</span>
                <strong>{formatRole(requestContext.requestedRole, t)}</strong>
                <small>{t("common.approvalAuthority")}</small>
              </div>
            </section>

            <nav className="manager-requests-page__tabs" aria-label={t("managerPage.tabsAria")}>
              <button
                type="button"
                className={activeTab === "MY_STATUS" ? "active" : ""}
                aria-pressed={activeTab === "MY_STATUS"}
                onClick={() => setActiveTab("MY_STATUS")}
              >
                <span>01</span>
                <div>
                  <strong>{t("managerPage.myStatus")}</strong>
                  <small>{t("managerPage.myStatusDescription")}</small>
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
                      ? t("managerPage.requestManagement")
                      : t("managerPage.myEmployeeRequests")}
                  </strong>
                  <small>
                    {isSeniorManagement
                      ? t("managerPage.seniorTabDescription")
                      : t("managerPage.managerTabDescription")}
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
                    ? t("managerPage.seniorManagementDescription")
                    : t("managerPage.managerManagementDescription")
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
                <strong>{t("managerPage.backendProtection")}</strong>
                <p>
                  {requestContext.role === "SENIOR_MANAGEMENT"
                    ? t("managerPage.seniorProtection")
                    : t("managerPage.managerProtection")}
                </p>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
