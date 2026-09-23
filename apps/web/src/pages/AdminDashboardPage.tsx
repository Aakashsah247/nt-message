import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import { AdminOrganizationPanel } from "../components/AdminOrganizationPanel";
import { getDefaultAdminView } from "../components/layout/management-navigation";
import { SuperAdminSystemAnalyticsPanel } from "../components/SuperAdminSystemAnalyticsPanel";
import { SuperAdminDashboardOverview } from "../components/SuperAdminDashboardOverview";
import { SuperAdminMonitoringPanel } from "../components/SuperAdminMonitoringPanel";
import { SuperAdminProfilePanel } from "../components/SuperAdminProfilePanel";
import { useAuth } from "../context/AuthContext";

export function AdminDashboardPage() {
  const { t } = useTranslation("admin");
  const [searchParams] = useSearchParams();
  const { accessToken, account } = useAuth();
  const view = getDefaultAdminView(searchParams.get("view"));

  if (!accessToken || !account) {
    return (
      <main className="management-page">
        <div className="admin-request-error" role="alert">
          {t("session.unavailable")}
        </div>
      </main>
    );
  }

  // Account Requests has its own route. Query-based views are retained for
  // existing governance pages so completed functionality is not disrupted.
  if (view === "analytics") {
    return <SuperAdminSystemAnalyticsPanel accessToken={accessToken} />;
  }

  if (view === "monitoring") {
    return <SuperAdminMonitoringPanel accessToken={accessToken} />;
  }

  if (view === "profile") {
    return <SuperAdminProfilePanel accessToken={accessToken} />;
  }

  if (view === "organization") {
    return (
      <AdminOrganizationPanel
        accessToken={accessToken}
        viewerAccountClass={account.accountClass}
      />
    );
  }

  return <SuperAdminDashboardOverview accessToken={accessToken} />;
}
