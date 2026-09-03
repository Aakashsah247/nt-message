import { useTranslation } from "react-i18next";

import { AdminOrganizationPanel } from "../components/AdminOrganizationPanel";
import { useAuth } from "../context/AuthContext";

export function OrganizationPage() {
  const { t } = useTranslation("organization");
  const { accessToken } = useAuth();

  if (!accessToken) {
    return (
      <main className="management-page">
        <section className="organization-page-state" role="alert">
          <strong>{t("session.title")}</strong>
          <p>{t("session.description")}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="management-page organization-page">
      <AdminOrganizationPanel accessToken={accessToken} />
    </main>
  );
}
