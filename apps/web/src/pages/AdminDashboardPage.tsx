import {
  useNavigate,
} from "react-router";
import { useAuth } from "../context/AuthContext";

export function AdminDashboardPage() {
  const navigate = useNavigate();

  const {
    account,
    logout,
  } = useAuth();

  async function handleLogout():
    Promise<void> {
    await logout();

    navigate(
      "/login",
      {
        replace: true,
      },
    );
  }

  return (
    <main className="role-page">
      <header className="role-header">
        <strong>
          NT Message Super Admin
        </strong>

        <button
          type="button"
          onClick={handleLogout}
        >
          Sign out
        </button>
      </header>

      <section className="role-content">
        <span>SUPER ADMIN</span>

        <h1>
          Welcome,{" "}
          {account?.username ??
            "Super Admin"}
        </h1>

        <p>
          Account approvals, employee
          management, organization units,
          security controls and audit logs
          will appear here.
        </p>
      </section>
    </main>
  );
}