import "./styles/manager-workspace.css";
import "./styles/employee-dashboard.css";
import "./styles/work-management.css";
import "./styles/super-admin-workspace.css";
import "./styles/organization-workspace.css";
import "./styles/monitoring-workspace.css";
import "./styles/official-profile-workspace.css";
import "./styles/security-workspace.css";
import "./styles/settings-workspace.css";
import "./styles/password-recovery.css";
import { Navigate, Route, Routes } from "react-router";
import { ManagementLayout } from "./components/layout/ManagementLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PublicRoute } from "./components/PublicRoute";
import { RoleHome } from "./components/RoleHome";
import { ActivationPage } from "./pages/ActivationPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AdminAccountRequestsPage } from "./pages/AdminAccountRequestsPage";
import { ManagerAccountRequestsPage } from "./pages/ManagerAccountRequestsPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { LoginPage } from "./pages/LoginPage";
import { MessageAppPage } from "./pages/MessageAppPage";
import { DirectoryPage } from "./pages/DirectoryPage";
import { EmployeeDutyPage } from "./pages/EmployeeDutyPage";
import { ManagementDutyPage } from "./pages/ManagementDutyPage";
import { WorkReportsPage } from "./pages/WorkReportsPage";
import { SecurityPage } from "./pages/SecurityPage";
import { SettingsPage } from "./pages/SettingsPage";
import { OrganizationPage } from "./pages/OrganizationPage";
import { WorkTypeManagementPage } from "./pages/WorkTypeManagementPage";
import { WorkRuntimeV3Page } from "./pages/WorkRuntimeV3Page";
import { WorkRuntimeV3DetailPage } from "./pages/WorkRuntimeV3DetailPage";
import { WorkRuntimeV3CreatePage } from "./pages/WorkRuntimeV3CreatePage";

const ALL_ACCOUNT_CLASSES = ["SUPER_ADMIN", "OFFICE_USER"] as const;
const OFFICE_USER_ONLY = ["OFFICE_USER"] as const;
const SUPER_ADMIN_ONLY = ["SUPER_ADMIN"] as const;

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
        path="/directory"
        element={
          <ProtectedRoute accountClasses={[...ALL_ACCOUNT_CLASSES]}>
            <ManagementLayout>
              <DirectoryPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/organization"
        element={
          <ProtectedRoute accountClasses={[...ALL_ACCOUNT_CLASSES]}>
            <ManagementLayout>
              <OrganizationPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/super-admin"
        element={
          <ProtectedRoute accountClasses={[...SUPER_ADMIN_ONLY]}>
            <ManagementLayout>
              <AdminDashboardPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/super-admin/account-requests"
        element={
          <ProtectedRoute accountClasses={[...SUPER_ADMIN_ONLY]}>
            <ManagementLayout>
              <AdminAccountRequestsPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/account-requests"
        element={
          <ProtectedRoute accountClasses={[...OFFICE_USER_ONLY]}>
            <ManagementLayout>
              <ManagerAccountRequestsPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/work-types"
        element={
          <ProtectedRoute accountClasses={[...ALL_ACCOUNT_CLASSES]}>
            <ManagementLayout>
              <WorkTypeManagementPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/work"
        element={
          <ProtectedRoute accountClasses={[...OFFICE_USER_ONLY]}>
            <ManagementLayout>
              <WorkRuntimeV3Page />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/work/create"
        element={
          <ProtectedRoute accountClasses={[...OFFICE_USER_ONLY]}>
            <ManagementLayout>
              <WorkRuntimeV3CreatePage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/work/:officeId/:workItemId"
        element={
          <ProtectedRoute accountClasses={[...ALL_ACCOUNT_CLASSES]}>
            <ManagementLayout>
              <WorkRuntimeV3DetailPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/my-work"
        element={
          <ProtectedRoute accountClasses={[...OFFICE_USER_ONLY]}>
            <ManagementLayout>
              <WorkRuntimeV3Page />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/incoming-work"
        element={
          <ProtectedRoute accountClasses={[...OFFICE_USER_ONLY]}>
            <ManagementLayout>
              <WorkRuntimeV3Page />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/work-oversight"
        element={
          <ProtectedRoute accountClasses={[...SUPER_ADMIN_ONLY]}>
            <ManagementLayout>
              <WorkRuntimeV3Page />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/my-duty"
        element={
          <ProtectedRoute accountClasses={[...OFFICE_USER_ONLY]}>
            <ManagementLayout>
              <EmployeeDutyPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/duty-management"
        element={
          <ProtectedRoute accountClasses={[...ALL_ACCOUNT_CLASSES]}>
            <ManagementLayout>
              <ManagementDutyPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/work-reports"
        element={
          <ProtectedRoute accountClasses={[...ALL_ACCOUNT_CLASSES]}>
            <ManagementLayout>
              <WorkReportsPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/settings"
        element={
          <ProtectedRoute accountClasses={[...ALL_ACCOUNT_CLASSES]}>
            <ManagementLayout>
              <SettingsPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/settings/security"
        element={
          <ProtectedRoute accountClasses={[...ALL_ACCOUNT_CLASSES]}>
            <ManagementLayout>
              <SecurityPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />

      {[
        "/messages",
        "/messages/announcements",
        "/messages/starred",
        "/messages/archived",
        "/messages/requests",
        "/messages/notifications",
        "/messages/settings",
        "/messages/lists/new",
        "/messages/lists/:listId",
        "/messages/lists/:listId/edit",
        "/messages/profile",
        "/messages/new",
        "/messages/groups/new",
      ].map((path) => (
        <Route
          key={path}
          path={path}
          element={
            <ProtectedRoute accountClasses={[...ALL_ACCOUNT_CLASSES]}>
              <MessageAppPage />
            </ProtectedRoute>
          }
        />
      ))}

      {/* Phase 13 compatibility aliases. They no longer expose legacy pages or
          fixed-role authorization and can be removed after deployment telemetry
          confirms clients have moved to the canonical routes. */}
      <Route path="/admin" element={<Navigate to="/super-admin" replace />} />
      <Route path="/super-admin/management-positions" element={<Navigate to="/organization" replace />} />
      <Route path="/senior-management" element={<Navigate to="/" replace />} />
      <Route path="/team-manager" element={<Navigate to="/" replace />} />
      <Route path="/employee" element={<Navigate to="/" replace />} />
      <Route path="/senior-management/account-requests" element={<Navigate to="/account-requests" replace />} />
      <Route path="/team-manager/account-requests" element={<Navigate to="/account-requests" replace />} />
      <Route path="/work-runtime-v3" element={<Navigate to="/work" replace />} />
      <Route path="/work-runtime-v3/create" element={<Navigate to="/work/create" replace />} />
      <Route
        path="/work-runtime-v3/offices/:officeId/work-items/:workItemId"
        element={
          <ProtectedRoute accountClasses={[...ALL_ACCOUNT_CLASSES]}>
            <ManagementLayout>
              <WorkRuntimeV3DetailPage />
            </ManagementLayout>
          </ProtectedRoute>
        }
      />
      <Route path="/work-management" element={<Navigate to="/work" replace />} />
      <Route path="/work-management/create" element={<Navigate to="/work/create" replace />} />
      <Route path="/work-management/:workItemId/edit" element={<Navigate to="/work" replace />} />
      <Route path="/employee/work" element={<Navigate to="/my-work" replace />} />
      <Route path="/employee/duty" element={<Navigate to="/my-duty" replace />} />
      <Route path="/team-management" element={<Navigate to="/organization" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
