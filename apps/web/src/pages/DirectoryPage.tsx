import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { EmployeeDirectory } from "../components/EmployeeDirectory";
import { EmployeeDirectoryDetailPanel } from "../components/EmployeeDirectoryDetailPanel";
import { useAuth } from "../context/AuthContext";



export function DirectoryPage() {
  const { t } = useTranslation("directory");
  const navigate = useNavigate();

  const {
    account,
    accessToken,
  } = useAuth();

  // This ID controls which employee profile is shown in the details panel.
  const [
    selectedEmployeeId,
    setSelectedEmployeeId,
  ] = useState<string | null>(null);

  const [
    directoryRefreshKey,
    setDirectoryRefreshKey,
  ] = useState(0);



  // ProtectedRoute normally guarantees the token, but this prevents unsafe requests.
  if (!accessToken) {
    return (
      <main className="management-page directory-page">
        <section className="directory-page-session-error">
          <strong>{t("page.sessionTitle")}</strong>

          <p>{t("page.sessionDescription")}</p>

          <button
            type="button"
            onClick={() =>
              navigate("/login", {
                replace: true,
              })
            }
          >
            {t("page.returnToLogin")}
          </button>
        </section>
      </main>
    );
  }
  // The details panel is mounted only after an employee is selected.
  return (
    <main className="management-page directory-page">
      <section className="directory-page-content">
        <header className="directory-page-heading">
          <div>
            <span>
              {account?.positionLabel ?? t(`roles.${account?.role ?? "EMPLOYEE"}`, { defaultValue: t("page.authorizedUser") })}
            </span>

            <h1>{t("page.title")}</h1>

            <p>{t("page.description")}</p>
          </div>

          <div className="directory-security-note">
            <span aria-hidden="true">
              ✓
            </span>

            <div>
              <strong>{t("page.scopedAccess")}</strong>

              <small>{t("page.scopedAccessDescription")}</small>
            </div>
          </div>
        </header>

        <EmployeeDirectory
          reloadKey={
            directoryRefreshKey
          }
          selectedEmployeeId={
            selectedEmployeeId
          }
          accessToken={
            accessToken
          }
          onSelectEmployee={(
            employeeId,
          ) =>
            setSelectedEmployeeId(
              employeeId,
            )
          }
        />
      </section>

      {selectedEmployeeId && (
        <EmployeeDirectoryDetailPanel
          viewerRole={
            account?.role ??
            "EMPLOYEE"
          }
          onStatusChanged={() =>
            setDirectoryRefreshKey(
              (current) =>
                current + 1,
            )
          }
          accessToken={
            accessToken
          }
          employeeId={
            selectedEmployeeId
          }
          onClose={() =>
            setSelectedEmployeeId(
              null,
            )
          }
        />
      )}
    </main>
  );
}