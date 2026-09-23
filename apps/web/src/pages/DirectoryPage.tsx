import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { EmployeeDirectory } from "../components/EmployeeDirectory";
import { EmployeeDirectoryDetailPanel } from "../components/EmployeeDirectoryDetailPanel";
import { useAuth } from "../context/AuthContext";
import {
  connectMessagingSocketAfterEffectCommit,
  createMessagingSocket,
} from "../services/messaging-socket.service";

export function DirectoryPage() {
  const { t } = useTranslation("directory");
  const navigate = useNavigate();
  const { account, accessToken } = useAuth();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [directoryRefreshKey, setDirectoryRefreshKey] = useState(0);

  useEffect(() => {
    if (!accessToken) return;

    const socket = createMessagingSocket(accessToken);
    const refreshDirectory = () => {
      setDirectoryRefreshKey((current) => current + 1);
    };

    socket.on("directory:changed", refreshDirectory);
    const disconnect = connectMessagingSocketAfterEffectCommit(socket);

    return () => {
      socket.off("directory:changed", refreshDirectory);
      disconnect();
    };
  }, [accessToken]);

  if (!accessToken) {
    return (
      <main className="management-page directory-page">
        <section className="directory-page-session-error">
          <strong>{t("page.sessionTitle")}</strong>
          <p>{t("page.sessionDescription")}</p>
          <button type="button" onClick={() => navigate("/login", { replace: true })}>
            {t("page.returnToLogin")}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="management-page directory-page">
      <section className="directory-page-content">
        <header className="directory-page-heading directory-page-heading--compact">
          <div>
            <span>{account?.positionLabel ?? t("page.authorizedUser")}</span>
            <h1>{t("page.title")}</h1>
            <p>{t("page.description")}</p>
          </div>
        </header>

        <EmployeeDirectory
          reloadKey={directoryRefreshKey}
          selectedEmployeeId={selectedEmployeeId}
          accessToken={accessToken}
          onSelectEmployee={setSelectedEmployeeId}
        />
      </section>

      {selectedEmployeeId && (
        <EmployeeDirectoryDetailPanel
          viewerAccountClass={account?.accountClass ?? "OFFICE_USER"}
          onStatusChanged={() => setDirectoryRefreshKey((current) => current + 1)}
          accessToken={accessToken}
          employeeId={selectedEmployeeId}
          onClose={() => setSelectedEmployeeId(null)}
        />
      )}
    </main>
  );
}
