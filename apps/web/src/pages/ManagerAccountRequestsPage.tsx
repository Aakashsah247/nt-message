import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { ManagerAccountRequestForm } from "../components/ManagerAccountRequestForm";
import { ManagerRequestHistory } from "../components/ManagerRequestHistory";
import { MyAccountStatusPanel } from "../components/MyAccountStatusPanel";
import { useAuth } from "../context/AuthContext";
import { getMyRequestContext } from "../services/account-request.service";
import type { ManagerRequestContextResponse } from "../types/account-request";

type RequestWorkspaceTab = "MY_STATUS" | "REQUEST_MANAGEMENT";

function getErrorMessage(error: unknown, t: TFunction<"requests">): string {
  return error instanceof Error
    ? error.message
    : t("managerPage.loadError", { ns: "requests" });
}

export function ManagerAccountRequestsPage() {
  const { t } = useTranslation("requests");
  const { accessToken } = useAuth();
  const [requestContext, setRequestContext] =
    useState<ManagerRequestContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [activeTab, setActiveTab] =
    useState<RequestWorkspaceTab>("MY_STATUS");

  useEffect(() => {
    let active = true;

    if (!accessToken) {
      queueMicrotask(() => {
        if (active) setLoading(false);
      });
      return () => {
        active = false;
      };
    }

    queueMicrotask(() => {
      if (active) setLoading(true);
    });

    getMyRequestContext(accessToken)
      .then((response) => {
        if (!active) return;
        setRequestContext(response);
        setError("");
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setRequestContext(null);
        setError(getErrorMessage(requestError, t));
      })
      .finally(() => {
        if (active) setLoading(false);
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
            <span>{t("managerPage.v3.eyebrow")}</span>
            <h1>{t("managerPage.v3.title")}</h1>
            <p>{t("managerPage.v3.description")}</p>
          </div>

          <div className="manager-requests-page__hero-actions">
            <div className="manager-requests-page__authority">
              <span aria-hidden="true">✓</span>
              <div>
                <small>{t("managerPage.v3.scope")}</small>
                <strong>{t("managerPage.v3.requestAuthority")}</strong>
              </div>
            </div>
            <Link to="/">{t("common.backToDashboard")}</Link>
          </div>
        </header>

        {loading && (
          <section className="manager-workspace-state" aria-live="polite">
            <div className="spinner" />
            <p>{t("managerPage.loading")}</p>
          </section>
        )}

        {!loading && (!accessToken || error) && (
          <section
            className="manager-workspace-state manager-workspace-state--error"
            role="alert"
          >
            <div>
              <strong>{t("managerPage.unavailable")}</strong>
              <p>
                {accessToken ? error : t("managerPage.sessionUnavailable")}
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
                <span>{t("managerPage.v3.office")}</span>
                <strong>{requestContext.office.name}</strong>
                <small>{requestContext.office.code}</small>
              </div>
              <div>
                <span>{t("managerPage.v3.primaryOrgUnit")}</span>
                <strong>{requestContext.primaryOrgUnit.name}</strong>
                <small>{requestContext.primaryOrgUnit.code}</small>
              </div>
              <div>
                <span>{t("managerPage.v3.availableOrgUnits")}</span>
                <strong>{requestContext.orgUnits.length}</strong>
                <small>{t("managerPage.v3.orgUnitScopeHelp")}</small>
              </div>
            </section>

            <nav
              className="manager-requests-page__tabs"
              aria-label={t("managerPage.tabsAria")}
            >
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
                  <strong>{t("managerPage.v3.requestManagement")}</strong>
                  <small>{t("managerPage.v3.requestManagementDescription")}</small>
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
                className="manager-requests-page__request-management"
                aria-label={t("managerPage.v3.requestManagementDescription")}
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
                />
              </section>
            )}

            <section className="manager-requests-page__security-notice">
              <span aria-hidden="true">✓</span>
              <div>
                <strong>{t("managerPage.backendProtection")}</strong>
                <p>{t("managerPage.v3.backendProtection")}</p>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
