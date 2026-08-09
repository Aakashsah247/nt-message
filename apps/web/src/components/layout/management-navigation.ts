import type { AccountRole } from "../../types/auth";
import type { ManagementIconName } from "./ManagementIcon";

export type AdminWorkspaceView =
  | "dashboard"
  | "requests"
  | "organization"
  | "analytics"
  | "monitoring"
  | "profile";

export type ManagementNavigationSectionId =
  | "overview"
  | "people-access"
  | "operations"
  | "governance"
  | "communication"
  | "account";

export interface ManagementNavigationItem {
  icon: ManagementIconName;
  label: string;
  path: string;
  view?: string;
}

export interface ManagementNavigationSection {
  id: ManagementNavigationSectionId;
  label: string;
  items: ManagementNavigationItem[];
}

const ACCOUNT_SECURITY_SECTION: ManagementNavigationSection = {
  id: "account",
  label: "Account",
  items: [
    {
      icon: "security",
      label: "Security",
      path: "/settings/security",
    },
  ],
};

const MANAGEMENT_OPERATIONS_SECTION: ManagementNavigationSection = {
  id: "operations",
  label: "Operations",
  items: [
    {
      icon: "work",
      label: "Work Management",
      path: "/work-management",
    },
    {
      icon: "duty",
      label: "Duty Roster",
      path: "/duty-management",
    },
    {
      icon: "teams",
      label: "Team Management",
      path: "/team-management",
    },
    {
      icon: "reports",
      label: "Reports",
      path: "/work-reports",
    },
  ],
};

const SUPER_ADMIN_NAVIGATION: ManagementNavigationSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      {
        icon: "dashboard",
        label: "Dashboard",
        path: "/super-admin",
      },
    ],
  },
  {
    id: "people-access",
    label: "People & Access",
    items: [
      {
        icon: "directory",
        label: "Directory",
        path: "/directory",
      },
      {
        icon: "requests",
        label: "Account requests",
        path: "/super-admin/account-requests",
      },
      {
        icon: "management",
        label: "Management positions",
        path: "/super-admin/management-positions",
      },
    ],
  },
  MANAGEMENT_OPERATIONS_SECTION,
  {
    id: "governance",
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
    id: "communication",
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

const EMPLOYEE_NAVIGATION: ManagementNavigationSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      {
        icon: "dashboard",
        label: "Dashboard",
        path: "/employee",
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      {
        icon: "work",
        label: "My Work",
        path: "/employee/work",
      },
      {
        icon: "duty",
        label: "My Duty",
        path: "/employee/duty",
      },
    ],
  },
  {
    id: "communication",
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
      id: "overview",
      label: "Overview",
      items: [
        {
          icon: "dashboard",
          label: "Dashboard",
          path: dashboardPath,
        },
      ],
    },
    {
      id: "people-access",
      label: "People & Access",
      items: [
        {
          icon: "directory",
          label: "Directory",
          path: "/directory",
        },
        {
          icon: "requests",
          label: "Account requests",
          path: `${dashboardPath}/account-requests`,
        },
      ],
    },
    {
      ...MANAGEMENT_OPERATIONS_SECTION,
      // My Duty is personal schedule access; Duty Management remains the planning workspace.
      items: [
        ...MANAGEMENT_OPERATIONS_SECTION.items.slice(0, 2),
        {
          icon: "duty",
          label: "My Duty",
          path: "/my-duty",
        },
        ...MANAGEMENT_OPERATIONS_SECTION.items.slice(2),
      ],
    },
    {
      id: "communication",
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
    return [...SUPER_ADMIN_NAVIGATION, ACCOUNT_SECURITY_SECTION];
  }

  if (role === "SENIOR_MANAGEMENT" || role === "TEAM_MANAGER") {
    return [...getManagerNavigation(role), ACCOUNT_SECURITY_SECTION];
  }

  if (role === "EMPLOYEE") {
    return [...EMPLOYEE_NAVIGATION, ACCOUNT_SECURITY_SECTION];
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
      return "dashboard";
  }
}
