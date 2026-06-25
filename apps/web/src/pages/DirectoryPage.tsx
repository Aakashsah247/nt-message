import { useState } from "react";
import { useNavigate } from "react-router";

import { EmployeeDirectory } from "../components/EmployeeDirectory";
import { EmployeeDirectoryDetailPanel } from "../components/EmployeeDirectoryDetailPanel";
import { useAuth } from "../context/AuthContext";

function formatRole(role: string | undefined): string {
  if (!role) {
    return "Authorized user";
  }

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

export function DirectoryPage() {
  const navigate = useNavigate();

  const {
    account,
    accessToken,
    logout,
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

  const [
    loggingOut,
    setLoggingOut,
  ] = useState(false);

  // The root route redirects every role to its correct dashboard.
  function returnToDashboard(): void {
    navigate("/");
  }

  // The shared authentication context safely clears the current session.
  async function handleLogout(): Promise<void> {
    setLoggingOut(true);

    try {
      await logout();

      navigate("/login", {
        replace: true,
      });
    } finally {
      setLoggingOut(false);
    }
  }

  // ProtectedRoute normally guarantees the token, but this prevents unsafe requests.
  if (!accessToken) {
    return (
      <main className="directory-page-shell">
        <section className="directory-page-session-error">
          <strong>
            Secure session unavailable
          </strong>

          <p>
            Sign in again to access the employee directory.
          </p>

          <button
            type="button"
            onClick={() =>
              navigate("/login", {
                replace: true,
              })
            }
          >
            Return to login
          </button>
        </section>
      </main>
    );
  }
  // The details panel is mounted only after an employee is selected.
  return (
    <main className="directory-page-shell">
      <header className="directory-page-topbar">
        <div className="directory-page-brand">
          <div className="directory-page-logo">
            <img
              src="/nt-logo.png"
              alt="Nepal Telecom"
            />
          </div>

          <div>
            <strong>
              NT Message
            </strong>

            <span>
              Secure Employee Directory
            </span>
          </div>
        </div>

        <div className="directory-page-account">
          <div>
            <span>
              Signed in as
            </span>

            <strong>
              {account?.username ??
                formatRole(
                  account?.role,
                )}
            </strong>

            <small>
              {formatRole(
                account?.role,
              )}
            </small>
          </div>

          <div className="directory-page-actions">
            <button
              type="button"
              className="directory-page-back"
              onClick={
                returnToDashboard
              }
            >
              Dashboard
            </button>

            <button
              type="button"
              className="directory-page-logout"
              onClick={
                handleLogout
              }
              disabled={
                loggingOut
              }
            >
              {loggingOut
                ? "Signing out..."
                : "Sign out"}
            </button>
          </div>
        </div>
      </header>

      <section className="directory-page-content">
        <header className="directory-page-heading">
          <div>
            <span>
              {formatRole(
                account?.role,
              )}
            </span>

            <h1>
              Organization Directory
            </h1>

            <p>
              Find verified Nepal Telecom employees within your authorized organization scope.
            </p>
          </div>

          <div className="directory-security-note">
            <span aria-hidden="true">
              ✓
            </span>

            <div>
              <strong>
                Scoped access
              </strong>

              <small>
                The backend controls which employees and contact details your role can view.
              </small>
            </div>
          </div>
        </header>

        <EmployeeDirectory
          reloadKey={
            directoryRefreshKey
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