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
  labelKey: string;
  path: string;
  view?: string;
}

export interface ManagementNavigationSection {
  id: ManagementNavigationSectionId;
  label: string;
  labelKey: string;
  items: ManagementNavigationItem[];
}

const ACCOUNT_SETTINGS_SECTION: ManagementNavigationSection = {
  id: "account",
  label: "Account",
  labelKey: "navigation.sections.account",
  items: [
    {
      icon: "settings",
      label: "Settings",
      labelKey: "navigation.items.settings",
      path: "/settings",
    },
  ],
};

const MANAGEMENT_OPERATIONS_SECTION: ManagementNavigationSection = {
  id: "operations",
  label: "Operations",
  labelKey: "navigation.sections.operations",
  items: [
    {
      icon: "work",
      label: "Work Management",
      labelKey: "navigation.items.workManagement",
      path: "/work-management",
    },
    {
      icon: "duty",
      label: "Duty Roster",
      labelKey: "navigation.items.dutyRoster",
      path: "/duty-management",
    },
    {
      icon: "teams",
      label: "Team Management",
      labelKey: "navigation.items.teamManagement",
      path: "/team-management",
    },
    {
      icon: "reports",
      label: "Reports",
      labelKey: "navigation.items.reports",
      path: "/work-reports",
    },
  ],
};

const SUPER_ADMIN_NAVIGATION: ManagementNavigationSection[] = [
  {
    id: "overview",
    label: "Overview",
    labelKey: "navigation.sections.overview",
    items: [
      {
        icon: "dashboard",
        label: "Dashboard",
        labelKey: "navigation.items.dashboard",
        path: "/super-admin",
      },
    ],
  },
  {
    id: "people-access",
    label: "People & Access",
    labelKey: "navigation.sections.peopleAccess",
    items: [
      {
        icon: "directory",
        label: "Directory",
        labelKey: "navigation.items.directory",
        path: "/directory",
      },
      {
        icon: "requests",
        label: "Account requests",
        labelKey: "navigation.items.accountRequests",
        path: "/super-admin/account-requests",
      },
      {
        icon: "management",
        label: "Management positions",
        labelKey: "navigation.items.managementPositions",
        path: "/super-admin/management-positions",
      },
    ],
  },
  MANAGEMENT_OPERATIONS_SECTION,
  {
    id: "governance",
    label: "Governance",
    labelKey: "navigation.sections.governance",
    items: [
      {
        icon: "organization",
        label: "Organization",
        labelKey: "navigation.items.organization",
        path: "/super-admin",
        view: "organization",
      },
      {
        icon: "analytics",
        label: "Analytics",
        labelKey: "navigation.items.analytics",
        path: "/super-admin",
        view: "analytics",
      },
      {
        icon: "monitoring",
        label: "Monitoring",
        labelKey: "navigation.items.monitoring",
        path: "/super-admin",
        view: "monitoring",
      },
      {
        icon: "profile",
        label: "Official profile",
        labelKey: "navigation.items.officialProfile",
        path: "/super-admin",
        view: "profile",
      },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    labelKey: "navigation.sections.communication",
    items: [
      {
        icon: "messages",
        label: "Messages",
        labelKey: "navigation.items.messages",
        path: "/messages",
      },
    ],
  },
];

const EMPLOYEE_NAVIGATION: ManagementNavigationSection[] = [
  {
    id: "overview",
    label: "Overview",
    labelKey: "navigation.sections.overview",
    items: [
      {
        icon: "dashboard",
        label: "Dashboard",
        labelKey: "navigation.items.dashboard",
        path: "/employee",
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    labelKey: "navigation.sections.operations",
    items: [
      {
        icon: "work",
        label: "My Work",
        labelKey: "navigation.items.myWork",
        path: "/employee/work",
      },
      {
        icon: "duty",
        label: "My Duty",
        labelKey: "navigation.items.myDuty",
        path: "/employee/duty",
      },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    labelKey: "navigation.sections.communication",
    items: [
      {
        icon: "messages",
        label: "Messages",
        labelKey: "navigation.items.messages",
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
      labelKey: "navigation.sections.overview",
      items: [
        {
          icon: "dashboard",
          label: "Dashboard",
          labelKey: "navigation.items.dashboard",
          path: dashboardPath,
        },
      ],
    },
    {
      id: "people-access",
      label: "People & Access",
      labelKey: "navigation.sections.peopleAccess",
      items: [
        {
          icon: "directory",
          label: "Directory",
          labelKey: "navigation.items.directory",
          path: "/directory",
        },
        {
          icon: "requests",
          label: "Account requests",
          labelKey: "navigation.items.accountRequests",
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
          labelKey: "navigation.items.myDuty",
          path: "/my-duty",
        },
        ...MANAGEMENT_OPERATIONS_SECTION.items.slice(2),
      ],
    },
    {
      id: "communication",
      label: "Communication",
      labelKey: "navigation.sections.communication",
      items: [
        {
          icon: "messages",
          label: "Messages",
          labelKey: "navigation.items.messages",
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
    return [...SUPER_ADMIN_NAVIGATION, ACCOUNT_SETTINGS_SECTION];
  }

  if (role === "SENIOR_MANAGEMENT" || role === "TEAM_MANAGER") {
    return [...getManagerNavigation(role), ACCOUNT_SETTINGS_SECTION];
  }

  if (role === "EMPLOYEE") {
    return [...EMPLOYEE_NAVIGATION, ACCOUNT_SETTINGS_SECTION];
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
