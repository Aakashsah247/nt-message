import { Navigate, Route, Routes,} from "react-router";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PublicRoute } from "./components/PublicRoute";
import { RoleHome } from "./components/RoleHome";
import { ActivationPage } from "./pages/ActivationPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { LoginPage } from "./pages/LoginPage";
import { MessageAppPage } from "./pages/MessageAppPage";

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <RoleHome />
          </ProtectedRoute>
        }
      />

      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />

      <Route
        path="/activate"
        element={
          <PublicRoute>
            <ActivationPage />
          </PublicRoute>
        }
      />

      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            <ForgotPasswordPage />
          </PublicRoute>
        }
      />

      <Route
        path="/super-admin"
        element={
          <ProtectedRoute
            roles={[
              "SUPER_ADMIN",
            ]}
          >
            <AdminDashboardPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <Navigate
            to="/super-admin"
            replace
          />
        }
      />

      <Route
        path="/senior-management"
        element={
          <ProtectedRoute
            roles={[
              "SENIOR_MANAGEMENT",
            ]}
          >
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/team-manager"
        element={
          <ProtectedRoute
            roles={[
              "TEAM_MANAGER",
            ]}
          >
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/messages"
        element={
          <ProtectedRoute
            roles={[
              "EMPLOYEE",
            ]}
          >
            <MessageAppPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="*"
        element={
          <Navigate
            to="/"
            replace
          />
        }
      />
    </Routes>
  );
}