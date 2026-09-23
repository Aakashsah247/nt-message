import "./styles/manager-workspace.css";
import "./styles/employee-dashboard.css";
import "./styles/work-management.css";
import "./styles/work-main-parity.css";
import "./styles/super-admin-workspace.css";
import "./styles/organization-workspace.css";
import "./styles/monitoring-workspace.css";
import "./styles/official-profile-workspace.css";
import "./styles/security-workspace.css";
import "./styles/settings-workspace.css";
import "./styles/password-recovery.css";
import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router";
import { ManagementLayout } from "./components/layout/ManagementLayout";
import { WorkspaceFeatureRoute } from "./components/WorkspaceFeatureRoute";
import { OrganizationWorkspaceProvider } from "./context/OrganizationWorkspaceContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PublicRoute } from "./components/PublicRoute";
import { RoleHome } from "./components/RoleHome";
import { ActivationPage } from "./pages/ActivationPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AdminAccountRequestsPage } from "./pages/AdminAccountRequestsPage";
import { ManagerAccountRequestsPage } from "./pages/ManagerAccountRequestsPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { LoginPage } from "./pages/LoginPage";
import { DirectoryPage } from "./pages/DirectoryPage";
import { TeamManagementPage } from "./pages/TeamManagementPage";
import { TeamEditorPage } from "./pages/TeamEditorPage";
import { TeamDetailPage } from "./pages/TeamDetailPage";
import { RemovedTeamsPage } from "./pages/RemovedTeamsPage";
import { SecurityPage } from "./pages/SecurityPage";
import { SettingsPage } from "./pages/SettingsPage";
import { OrganizationPage } from "./pages/OrganizationPage";
import { WorkPage } from "./pages/WorkPage";
import { WorkDetailPage } from "./pages/WorkDetailPage";
import { SuperAdminOfficesPage } from "./pages/SuperAdminOfficesPage";
import { SuperAdminOfficeHeadsPage } from "./pages/SuperAdminOfficeHeadsPage";
import { EmergencySmsPage } from "./pages/EmergencySmsPage";

const MessageAppPage = lazy(() =>
  import("./pages/MessageAppPage").then((module) => ({
    default: module.MessageAppPage,
  })),
);
const ManagementWorkPage = lazy(() =>
  import("./pages/ManagementWorkPage").then((module) => ({
    default: module.ManagementWorkPage,
  })),
);
const EmployeeWorkPage = lazy(() =>
  import("./pages/EmployeeWorkPage").then((module) => ({
    default: module.EmployeeWorkPage,
  })),
);
const ManagementDutyPage = lazy(() =>
  import("./pages/ManagementDutyPage").then((module) => ({
    default: module.ManagementDutyPage,
  })),
);
const EmployeeDutyPage = lazy(() =>
  import("./pages/EmployeeDutyPage").then((module) => ({
    default: module.EmployeeDutyPage,
  })),
);
const WorkReportsRoutePage = lazy(() =>
  import("./pages/WorkReportsRoutePage").then((module) => ({
    default: module.WorkReportsRoutePage,
  })),
);
const WorkTypeManagementPage = lazy(() =>
  import("./pages/WorkTypeManagementPage").then((module) => ({
    default: module.WorkTypeManagementPage,
  })),
);
const OfficeDashboardPage = lazy(() =>
  import("./pages/OfficeDashboardPage").then((module) => ({
    default: module.OfficeDashboardPage,
  })),
);

const ALL_ACCOUNT_CLASSES = ["SUPER_ADMIN", "OFFICE_USER"] as const;
const OFFICE_USER_ONLY = ["OFFICE_USER"] as const;
const SUPER_ADMIN_ONLY = ["SUPER_ADMIN"] as const;

export default function App() {
  return (
    <Suspense fallback={null}>
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
        element={
          <OrganizationWorkspaceProvider>
            <ManagementLayout>
              <Outlet />
            </ManagementLayout>
          </OrganizationWorkspaceProvider>
        }
      >
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute accountClasses={[...OFFICE_USER_ONLY]}>
              <WorkspaceFeatureRoute feature="dashboard">
                <OfficeDashboardPage />
              </WorkspaceFeatureRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/directory"
          element={
            <ProtectedRoute accountClasses={[...ALL_ACCOUNT_CLASSES]}>
              <WorkspaceFeatureRoute feature="directory">
                <DirectoryPage />
              </WorkspaceFeatureRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/organization/*"
          element={
            <ProtectedRoute accountClasses={[...ALL_ACCOUNT_CLASSES]}>
              <WorkspaceFeatureRoute feature="organizationView">
                <OrganizationPage />
              </WorkspaceFeatureRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/super-admin"
          element={
            <ProtectedRoute accountClasses={[...SUPER_ADMIN_ONLY]}>
              <AdminDashboardPage />
            </ProtectedRoute>
          }
        />

        <Route path="/super-admin/offices" element={<ProtectedRoute accountClasses={[...SUPER_ADMIN_ONLY]}><SuperAdminOfficesPage /></ProtectedRoute>} />
        <Route path="/super-admin/office-heads" element={<ProtectedRoute accountClasses={[...SUPER_ADMIN_ONLY]}><SuperAdminOfficeHeadsPage /></ProtectedRoute>} />

        <Route
          path="/super-admin/account-requests"
          element={
            <ProtectedRoute accountClasses={[...SUPER_ADMIN_ONLY]}>
              <AdminAccountRequestsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/account-requests"
          element={
            <ProtectedRoute accountClasses={[...OFFICE_USER_ONLY]}>
              <WorkspaceFeatureRoute feature="accountRequests">
                <ManagerAccountRequestsPage />
              </WorkspaceFeatureRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/work-types/*"
          element={
            <ProtectedRoute accountClasses={[...OFFICE_USER_ONLY]}>
              <WorkspaceFeatureRoute feature="workManagement">
                <WorkTypeManagementPage />
              </WorkspaceFeatureRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/work"
          element={
            <ProtectedRoute accountClasses={[...OFFICE_USER_ONLY]}>
              <WorkspaceFeatureRoute feature="workManagement">
                <ManagementWorkPage />
              </WorkspaceFeatureRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/work/create"
          element={
            <ProtectedRoute accountClasses={[...OFFICE_USER_ONLY]}>
              <WorkspaceFeatureRoute feature="workManagement">
                <ManagementWorkPage />
              </WorkspaceFeatureRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/work/:workItemId/edit"
          element={
            <ProtectedRoute accountClasses={[...OFFICE_USER_ONLY]}>
              <WorkspaceFeatureRoute feature="workManagement">
                <ManagementWorkPage />
              </WorkspaceFeatureRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/work/:officeId/:workItemId"
          element={
            <ProtectedRoute accountClasses={[...ALL_ACCOUNT_CLASSES]}>
              <WorkDetailPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/my-work"
          element={
            <ProtectedRoute accountClasses={[...OFFICE_USER_ONLY]}>
              <WorkspaceFeatureRoute feature="myWork">
                <EmployeeWorkPage />
              </WorkspaceFeatureRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/work-oversight"
          element={
            <ProtectedRoute accountClasses={[...SUPER_ADMIN_ONLY]}>
              <WorkPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/my-duty"
          element={
            <ProtectedRoute accountClasses={[...OFFICE_USER_ONLY]}>
              <WorkspaceFeatureRoute feature="myDuty">
                <EmployeeDutyPage />
              </WorkspaceFeatureRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/duty-management"
          element={
            <ProtectedRoute accountClasses={[...OFFICE_USER_ONLY]}>
              <WorkspaceFeatureRoute feature="dutyRoster">
                <ManagementDutyPage />
              </WorkspaceFeatureRoute>
            </ProtectedRoute>
          }
        />


        <Route
          path="/team-management"
          element={
            <ProtectedRoute accountClasses={[...OFFICE_USER_ONLY]}>
              <WorkspaceFeatureRoute feature="teamManagement">
                <TeamManagementPage />
              </WorkspaceFeatureRoute>
            </ProtectedRoute>
          }
        />

        <Route path="/team-management/new" element={<ProtectedRoute accountClasses={[...OFFICE_USER_ONLY]}><WorkspaceFeatureRoute feature="teamManagement"><TeamEditorPage /></WorkspaceFeatureRoute></ProtectedRoute>} />
        <Route path="/team-management/removed" element={<ProtectedRoute accountClasses={[...OFFICE_USER_ONLY]}><WorkspaceFeatureRoute feature="teamManagement"><RemovedTeamsPage /></WorkspaceFeatureRoute></ProtectedRoute>} />
        <Route path="/team-management/:teamId/edit" element={<ProtectedRoute accountClasses={[...OFFICE_USER_ONLY]}><WorkspaceFeatureRoute feature="teamManagement"><TeamEditorPage /></WorkspaceFeatureRoute></ProtectedRoute>} />
        <Route path="/team-management/:teamId" element={<ProtectedRoute accountClasses={[...OFFICE_USER_ONLY]}><WorkspaceFeatureRoute feature="teamManagement"><TeamDetailPage /></WorkspaceFeatureRoute></ProtectedRoute>} />

        <Route
          path="/work-reports"
          element={
            <ProtectedRoute accountClasses={[...ALL_ACCOUNT_CLASSES]}>
              <WorkspaceFeatureRoute feature="reports">
                <WorkReportsRoutePage />
              </WorkspaceFeatureRoute>
            </ProtectedRoute>
          }
        />

        <Route

          path="/emergency-sms"

          element={

            <ProtectedRoute accountClasses={[...ALL_ACCOUNT_CLASSES]}>

              <EmergencySmsPage />

            </ProtectedRoute>

          }

        />


        <Route
          path="/settings"
          element={
            <ProtectedRoute accountClasses={[...ALL_ACCOUNT_CLASSES]}>
              <SettingsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/settings/security"
          element={
            <ProtectedRoute accountClasses={[...ALL_ACCOUNT_CLASSES]}>
              <SecurityPage />
            </ProtectedRoute>
          }
        />

      </Route>


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
      <Route path="/work-management" element={<Navigate to="/work" replace />} />
      <Route path="/work-management/create" element={<Navigate to="/work/create" replace />} />
      <Route path="/work-management/:workItemId/edit" element={<Navigate to="/work" replace />} />
      <Route path="/employee/work" element={<Navigate to="/my-work" replace />} />
      <Route path="/employee/duty" element={<Navigate to="/my-duty" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
