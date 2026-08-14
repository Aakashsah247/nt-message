import "./styles/manager-workspace.css";
import "./styles/employee-dashboard.css";
import "./styles/work-management.css";
import "./styles/team-management.css";
import "./styles/super-admin-workspace.css";
import "./styles/organization-workspace.css";
import "./styles/monitoring-workspace.css";
import "./styles/official-profile-workspace.css";
import "./styles/security-workspace.css";
import "./styles/password-recovery.css";
import { Navigate, Route, Routes } from "react-router";
import { ManagementLayout } from "./components/layout/ManagementLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PublicRoute } from "./components/PublicRoute";
import { RoleHome } from "./components/RoleHome";
import { ActivationPage } from "./pages/ActivationPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AdminAccountRequestsPage } from "./pages/AdminAccountRequestsPage";
import { ManagementPositionsPage } from "./pages/ManagementPositionsPage";
import { ManagerAccountRequestsPage } from "./pages/ManagerAccountRequestsPage";
import { ManagerRequestDashboardPage } from "./pages/ManagerRequestDashboardPage";
import { ManagementWorkPage } from "./pages/ManagementWorkPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { LoginPage } from "./pages/LoginPage";
import { MessageAppPage } from "./pages/MessageAppPage";
import { DirectoryPage } from "./pages/DirectoryPage";
import { EmployeeDashboardPage } from "./pages/EmployeeDashboardPage";
import { EmployeeWorkPage } from "./pages/EmployeeWorkPage";
import { EmployeeDutyPage } from "./pages/EmployeeDutyPage";
import { ManagementDutyPage } from "./pages/ManagementDutyPage";
import { WorkReportsPage } from "./pages/WorkReportsPage";
import { TeamManagementPage } from "./pages/TeamManagementPage";
import { SecurityPage } from "./pages/SecurityPage";

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

      {/* The management directory is not available to regular employees. */}
      <Route
        path="/directory"
        element={
          <ProtectedRoute
            roles={[
              "SUPER_ADMIN",
              "SENIOR_MANAGEMENT",
              "TEAM_MANAGER",
            ]}
          >
            <ManagementLayout>
              <DirectoryPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/super-admin"
        element={
          <ProtectedRoute roles={["SUPER_ADMIN"]}>
            <ManagementLayout>
              <AdminDashboardPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/super-admin/account-requests"
        element={
          <ProtectedRoute roles={["SUPER_ADMIN"]}>
            <ManagementLayout>
              <AdminAccountRequestsPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/super-admin/management-positions"
        element={
          <ProtectedRoute roles={["SUPER_ADMIN"]}>
            <ManagementLayout>
              <ManagementPositionsPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route path="/admin" element={<Navigate to="/super-admin" replace />} />

      <Route
        path="/senior-management"
        element={
          <ProtectedRoute roles={["SENIOR_MANAGEMENT"]}>
            <ManagementLayout>
              <ManagerRequestDashboardPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/team-manager"
        element={
          <ProtectedRoute roles={["TEAM_MANAGER"]}>
            <ManagementLayout>
              <ManagerRequestDashboardPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />


      <Route
        path="/senior-management/account-requests"
        element={
          <ProtectedRoute roles={["SENIOR_MANAGEMENT"]}>
            <ManagementLayout>
              <ManagerAccountRequestsPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/team-manager/account-requests"
        element={
          <ProtectedRoute roles={["TEAM_MANAGER"]}>
            <ManagementLayout>
              <ManagerAccountRequestsPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/work-management"
        element={
          <ProtectedRoute
            roles={[
              "SUPER_ADMIN",
              "SENIOR_MANAGEMENT",
              "TEAM_MANAGER",
            ]}
          >
            <ManagementLayout>
              <ManagementWorkPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/work-management/create"
        element={
          <ProtectedRoute
            roles={[
              "SUPER_ADMIN",
              "SENIOR_MANAGEMENT",
              "TEAM_MANAGER",
            ]}
          >
            <ManagementLayout>
              <ManagementWorkPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/employee"
        element={
          <ProtectedRoute roles={["EMPLOYEE"]}>
            <ManagementLayout>
              <EmployeeDashboardPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/employee/work"
        element={
          <ProtectedRoute roles={["EMPLOYEE"]}>
            <ManagementLayout>
              <EmployeeWorkPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/employee/duty"
        element={
          <ProtectedRoute roles={["EMPLOYEE"]}>
            <ManagementLayout>
              <EmployeeDutyPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      {/* Management roles use the same account-scoped My Duty page as employees. */}
      <Route
        path="/my-duty"
        element={
          <ProtectedRoute roles={["SENIOR_MANAGEMENT", "TEAM_MANAGER"]}>
            <ManagementLayout>
              <EmployeeDutyPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/duty-management"
        element={
          <ProtectedRoute
            roles={["SUPER_ADMIN", "SENIOR_MANAGEMENT", "TEAM_MANAGER"]}
          >
            <ManagementLayout>
              <ManagementDutyPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/team-management"
        element={
          <ProtectedRoute
            roles={["SUPER_ADMIN", "SENIOR_MANAGEMENT", "TEAM_MANAGER"]}
          >
            <ManagementLayout>
              <TeamManagementPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/work-reports"
        element={
          <ProtectedRoute
            roles={[
              "SUPER_ADMIN",
              "SENIOR_MANAGEMENT",
              "TEAM_MANAGER",
            ]}
          >
            <ManagementLayout>
              <WorkReportsPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/settings/security"
        element={
          <ProtectedRoute
            roles={[
              "SUPER_ADMIN",
              "SENIOR_MANAGEMENT",
              "TEAM_MANAGER",
              "EMPLOYEE",
            ]}
          >
            <ManagementLayout>
              <SecurityPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/messages"
        element={
          <ProtectedRoute
            roles={[
              "SUPER_ADMIN",
              "SENIOR_MANAGEMENT",
              "TEAM_MANAGER",
              "EMPLOYEE",
            ]}
          >
            <MessageAppPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/messages/announcements"
        element={
          <ProtectedRoute
            roles={[
              "SUPER_ADMIN",
              "SENIOR_MANAGEMENT",
              "TEAM_MANAGER",
              "EMPLOYEE",
            ]}
          >
            <MessageAppPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/messages/starred"
        element={
          <ProtectedRoute
            roles={[
              "SUPER_ADMIN",
              "SENIOR_MANAGEMENT",
              "TEAM_MANAGER",
              "EMPLOYEE",
            ]}
          >
            <MessageAppPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/messages/archived"
        element={
          <ProtectedRoute
            roles={[
              "SUPER_ADMIN",
              "SENIOR_MANAGEMENT",
              "TEAM_MANAGER",
              "EMPLOYEE",
            ]}
          >
            <MessageAppPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/messages/requests"
        element={
          <ProtectedRoute
            roles={[
              "SUPER_ADMIN",
              "SENIOR_MANAGEMENT",
              "TEAM_MANAGER",
              "EMPLOYEE",
            ]}
          >
            <MessageAppPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/messages/notifications"
        element={
          <ProtectedRoute
            roles={[
              "SUPER_ADMIN",
              "SENIOR_MANAGEMENT",
              "TEAM_MANAGER",
              "EMPLOYEE",
            ]}
          >
            <MessageAppPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/messages/settings"
        element={
          <ProtectedRoute
            roles={[
              "SUPER_ADMIN",
              "SENIOR_MANAGEMENT",
              "TEAM_MANAGER",
              "EMPLOYEE",
            ]}
          >
            <MessageAppPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/messages/lists/new"
        element={
          <ProtectedRoute
            roles={[
              "SUPER_ADMIN",
              "SENIOR_MANAGEMENT",
              "TEAM_MANAGER",
              "EMPLOYEE",
            ]}
          >
            <MessageAppPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/messages/lists/:listId"
        element={
          <ProtectedRoute
            roles={[
              "SUPER_ADMIN",
              "SENIOR_MANAGEMENT",
              "TEAM_MANAGER",
              "EMPLOYEE",
            ]}
          >
            <MessageAppPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/messages/lists/:listId/edit"
        element={
          <ProtectedRoute
            roles={[
              "SUPER_ADMIN",
              "SENIOR_MANAGEMENT",
              "TEAM_MANAGER",
              "EMPLOYEE",
            ]}
          >
            <MessageAppPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/messages/profile"
        element={
          <ProtectedRoute
            roles={[
              "SUPER_ADMIN",
              "SENIOR_MANAGEMENT",
              "TEAM_MANAGER",
              "EMPLOYEE",
            ]}
          >
            <MessageAppPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/messages/new"
        element={
          <ProtectedRoute
            roles={[
              "SUPER_ADMIN",
              "SENIOR_MANAGEMENT",
              "TEAM_MANAGER",
              "EMPLOYEE",
            ]}
          >
            <MessageAppPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/messages/groups/new"
        element={
          <ProtectedRoute
            roles={[
              "SUPER_ADMIN",
              "SENIOR_MANAGEMENT",
              "TEAM_MANAGER",
              "EMPLOYEE",
            ]}
          >
            <MessageAppPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
