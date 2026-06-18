import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";

export function AdminDashboardPage() {
  const navigate = useNavigate();

  const {
    account,
    logout,
  } = useAuth();

  async function handleLogout() {
    await logout();
    navigate("/login", {
      replace: true,
    });
  }

  return (
    <main className="role-page">
      <header className="role-header">
        <strong>
          NT Message Admin
        </strong>

        <button onClick={handleLogout}>
          Sign out
        </button>
      </header>

      <section className="role-content">
        <span>ADMIN</span>

        <h1>
          Welcome, {account?.username}
        </h1>

        <p>
          Employee management and system
          controls will appear here.
        </p>
      </section>
    </main>
  );
}