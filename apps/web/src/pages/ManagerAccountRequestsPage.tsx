import { useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { ManagerAccountRequestForm } from "../components/ManagerAccountRequestForm";
import { ManagerRequestHistory } from "../components/ManagerRequestHistory";
import { useAuth } from "../context/AuthContext";
import { getMyRequestContext } from "../services/account-request.service";
import type { ManagerRequestContextResponse } from "../types/account-request";

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

  useEffect(() => {
    let active = true;
    if (!accessToken) {
      queueMicrotask(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }

    queueMicrotask(() => active && setLoading(true));
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
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [accessToken, retryKey, t]);

  return (
    <main className="management-page manager-requests-page">
      <section className="manager-requests-page__canvas">
        <header className="manager-requests-page__hero manager-requests-page__hero--compact">
          <div>
            <span>{t("managerPage.v3.eyebrow")}</span>
            <h1>{t("managerPage.v3.title")}</h1>
            <p>{t("managerPage.v3.simpleDescription")}</p>
          </div>
          {requestContext && (
            <div className="manager-requests-page__office-badge">
              <small>{t("managerPage.v3.office")}</small>
              <strong>{requestContext.office.name}</strong>
            </div>
          )}
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
              <p>{accessToken ? error : t("managerPage.sessionUnavailable")}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setError("");
                setRetryKey((current) => current + 1);
              }}
            >
              {t("common.tryAgain")}
            </button>
          </section>
        )}

        {!loading && !error && requestContext && (
          <section className="manager-requests-page__request-management">
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
      </section>
    </main>
  );
}
