import type { AccountRole } from "../../types/auth";
import type { ManagementIconName } from "./ManagementIcon";

export type AdminWorkspaceView =
  | "requests"
  | "organization"
  | "analytics"
  | "monitoring"
  | "profile";

export interface ManagementNavigationItem {
  icon: ManagementIconName;
  label: string;
  path: string;
  view?: string;
}

export interface ManagementNavigationSection {
  label: string;
  items: ManagementNavigationItem[];
}

const SUPER_ADMIN_NAVIGATION: ManagementNavigationSection[] = [
  {
    label: "Workspace",
    items: [
      {
        icon: "dashboard",
        label: "Dashboard",
        path: "/super-admin",
        view: "requests",
      },
      {
        icon: "directory",
        label: "Directory",
        path: "/directory",
      },
      {
        icon: "management",
        label: "Management positions",
        path: "/super-admin/management-positions",
      },
    ],
  },
  {
    label: "Governance",
    items: [
      {
        icon: "organization",
        label: "Organization",
        path: "/super-admin",
        view: "organization",
      },
      {
        icon: "analytics",
        label: "Analytics",
        path: "/super-admin",
        view: "analytics",
      },
      {
        icon: "monitoring",
        label: "Monitoring",
        path: "/super-admin",
        view: "monitoring",
      },
      {
        icon: "profile",
        label: "Official profile",
        path: "/super-admin",
        view: "profile",
      },
    ],
  },
  {
    label: "Communication",
    items: [
      {
        icon: "messages",
        label: "Messages",
        path: "/messages",
      },
    ],
  },
];

function getManagerNavigation(
  role: "SENIOR_MANAGEMENT" | "TEAM_MANAGER",
): ManagementNavigationSection[] {
  const dashboardPath = role === "SENIOR_MANAGEMENT"
    ? "/senior-management"
    : "/team-manager";

  return [
    {
      label: "Workspace",
      items: [
        {
          icon: "dashboard",
          label: "Dashboard",
          path: dashboardPath,
        },
        {
          icon: "directory",
          label: "Directory",
          path: "/directory",
        },
      ],
    },
    {
      label: "Communication",
      items: [
        {
          icon: "messages",
          label: "Messages",
          path: "/messages",
        },
      ],
    },
  ];
}

// ProtectedRoute remains the authorization boundary; this list controls navigation visibility only.
export function getManagementNavigation(
  role: AccountRole,
): ManagementNavigationSection[] {
  if (role === "SUPER_ADMIN") {
    return SUPER_ADMIN_NAVIGATION;
  }

  if (role === "SENIOR_MANAGEMENT" || role === "TEAM_MANAGER") {
    return getManagerNavigation(role);
  }

  return [];
}

export function getDefaultAdminView(
  value: string | null,
): AdminWorkspaceView {
  switch (value) {
    case "analytics":
    case "monitoring":
    case "organization":
    case "profile":
      return value;

    case "requests":
    default:
      return "requests";
  }
}
