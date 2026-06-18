import {
  useState,
} from "react";
import {
  useNavigate,
} from "react-router";
import { useAuth } from "../context/AuthContext";

export function DashboardPage() {
  const navigate = useNavigate();

  const {
    account,
    logout,
  } = useAuth();

  const [loggingOut, setLoggingOut] =
    useState(false);

  async function handleLogout():
    Promise<void> {
    setLoggingOut(true);

    await logout();

    navigate(
      "/login",
      {
        replace: true,
      },
    );
  }

  return (
    <main className="dashboard">
      <header className="topbar">
        <div className="brand compact">
          <div className="brand-mark">
            NT
          </div>

          <strong>NT Message</strong>
        </div>

        <button
          className="logout-btn"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut
            ? "Signing out..."
            : "Sign out"}
        </button>
      </header>

      <section className="welcome">
        <span className="role">
          {account?.role}
        </span>

        <h1>
          Welcome,{" "}
          {account?.username ??
            "NT Message User"}
        </h1>

        <p>
          Your authentication and session
          are working correctly.
        </p>

        <div className="dash-grid">
          <article className="dash-card">
            <h3>
              {account?.role === "ADMIN"
                ? "Employee Management"
                : "Messages"}
            </h3>

            <p>
              {account?.role === "ADMIN"
                ? "The employee management interface will be connected next."
                : "The private and group messaging interface will be added soon."}
            </p>
          </article>

          <article className="dash-card">
            <h3>Secure session</h3>
            <p>
              Your access token and
              refresh-token session are
              active.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}