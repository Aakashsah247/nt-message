import { useState } from "react";
import { useNavigate } from "react-router";

import { DirectoryButton } from "../components/DirectoryButton";
import { useAuth } from "../context/AuthContext";

export function MessageAppPage() {
  const navigate = useNavigate();

  const {
    account,
    logout,
  } = useAuth();

  const [
    loggingOut,
    setLoggingOut,
  ] = useState(false);

  // Employees can open the limited-contact directory from their dashboard.
  function openMessages(): void {
    navigate("/messages");
  }

  // The loading state prevents repeated logout requests.
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

  // This page will later become the main private and group messaging interface.
  return (
    <main className="role-page">
      <header className="role-header">
        <button
          type="button"
          className="role-brand-button"
          onClick={openMessages}
        >
          NT Message
        </button>

        <div className="role-header-actions">
          <DirectoryButton />

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut
              ? "Signing out..."
              : "Sign out"}
          </button>
        </div>
      </header>

      <section className="role-content">
        <span>EMPLOYEE</span>

        <h1>
          Welcome,{" "}
          {account?.username ??
            "NT Message Employee"}
        </h1>

        <p>
          Your private conversations,
          groups, announcements and message
          requests will appear here.
        </p>

        <div className="employee-dashboard-actions">
          <DirectoryButton
            className="employee-directory-card-button"
            label="Open Employee Directory"
          />
        </div>
      </section>
    </main>
  );
}