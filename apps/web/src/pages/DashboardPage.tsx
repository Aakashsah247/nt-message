import {
  useState,
} from "react";
import {
  useNavigate,
} from "react-router";
import { useAuth } from "../context/AuthContext";
import type {
  AccountRole,
} from "../types/auth";

interface DashboardContent {
  label: string;
  title: string;
  description: string;
}

function getDashboardContent(
  role: AccountRole | undefined,
): DashboardContent {
  switch (role) {
    case "SENIOR_MANAGEMENT":
      return {
        label: "SENIOR MANAGEMENT",
        title: "Division Management",
        description:
          "Team Manager requests, division users, official groups and division announcements will appear here.",
      };

    case "TEAM_MANAGER":
      return {
        label: "TEAM MANAGER",
        title: "Department Management",
        description:
          "Employee requests, department users, official groups and department announcements will appear here.",
      };
      
    case "SUPER_ADMIN":
      return {
        label: "SUPER ADMIN",
        title: "System Administration",
        description:
          "Account approvals, organization management and security controls will appear here.",
      };

    case "EMPLOYEE":
    default:
      return {
        label: "EMPLOYEE",
        title: "Messages",
        description:
          "Private conversations, groups and announcements will appear here.",
      };
  }
}

export function DashboardPage() {
  const navigate = useNavigate();

  const {
    account,
    logout,
  } = useAuth();

  const [loggingOut, setLoggingOut] =
    useState(false);

  const dashboardContent =
    getDashboardContent(account?.role);

  async function handleLogout():
    Promise<void> {
    setLoggingOut(true);

    try {
      await logout();

      navigate(
        "/login",
        {
          replace: true,
        },
      );
    } finally {
      setLoggingOut(false);
    }
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
          type="button"
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
          {dashboardContent.label}
        </span>

        <h1>
          Welcome,{" "}
          {account?.username ??
            "NT Message User"}
        </h1>

        <p>
          Your authentication and secure
          session are working correctly.
        </p>

        <div className="dash-grid">
          <article className="dash-card">
            <h3>
              {dashboardContent.title}
            </h3>

            <p>
              {dashboardContent.description}
            </p>
          </article>

          <article className="dash-card">
            <h3>Secure session</h3>

            <p>
              Your access-token and
              refresh-token session are
              active.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}