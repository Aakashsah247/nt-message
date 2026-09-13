import type { AccountClass } from "../../types/auth";
import type { OrganizationNavigationMode } from "../../types/organization-v3";
import type { WorkTypeNavigationMode } from "../../types/work-type-v3";
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
  | "office-management"
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

const OFFICE_MANAGEMENT_SECTION: ManagementNavigationSection = {
  id: "office-management",
  label: "Office Management",
  labelKey: "navigation.sections.officeManagement",
  items: [
    {
      icon: "organization",
      label: "Organization & People",
      labelKey: "navigation.items.organizationPeople",
      path: "/organization",
    },
    {
      icon: "requests",
      label: "Account requests",
      labelKey: "navigation.items.accountRequests",
      path: "/account-requests",
    },
  ],
};

const OFFICE_USER_NAVIGATION: ManagementNavigationSection[] = [
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
    ],
  },
  {
    id: "operations",
    label: "Operations",
    labelKey: "navigation.sections.operations",
    items: [
      {
        icon: "work",
        label: "Work Overview",
        labelKey: "navigation.items.workOverview",
        path: "/work",
      },
      {
        icon: "work",
        label: "My Work",
        labelKey: "navigation.items.myWork",
        path: "/my-work",
      },
      {
        icon: "duty",
        label: "My Duty",
        labelKey: "navigation.items.myDuty",
        path: "/my-duty",
      },
      {
        icon: "reports",
        label: "Reports",
        labelKey: "navigation.items.reports",
        path: "/work-reports",
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
    ],
  },
  {
    id: "operations",
    label: "Operations",
    labelKey: "navigation.sections.operations",
    items: [
      {
        icon: "work",
        label: "Work Oversight",
        labelKey: "navigation.items.workOversight",
        path: "/work-oversight",
      },
      {
        icon: "duty",
        label: "Duty Roster",
        labelKey: "navigation.items.dutyRoster",
        path: "/duty-management",
      },
      {
        icon: "reports",
        label: "Reports",
        labelKey: "navigation.items.reports",
        path: "/work-reports",
      },
    ],
  },
  {
    id: "governance",
    label: "Governance",
    labelKey: "navigation.sections.governance",
    items: [
      {
        icon: "organization",
        label: "Organization Viewer",
        labelKey: "navigation.items.organizationViewer",
        path: "/organization",
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

function withOfficeManagement(
  sections: ManagementNavigationSection[],
  organizationMode: OrganizationNavigationMode,
): ManagementNavigationSection[] {
  if (organizationMode !== "MANAGE") {
    return sections;
  }

  const operationsIndex = sections.findIndex(
    (section) => section.id === "operations",
  );

  if (operationsIndex < 0) {
    return [...sections, OFFICE_MANAGEMENT_SECTION];
  }

  return [
    ...sections.slice(0, operationsIndex),
    OFFICE_MANAGEMENT_SECTION,
    ...sections.slice(operationsIndex),
  ];
}

function withWorkTypeNavigation(
  sections: ManagementNavigationSection[],
  workTypeMode: WorkTypeNavigationMode,
): ManagementNavigationSection[] {
  if (workTypeMode === "NONE") {
    return sections;
  }

  const item: ManagementNavigationItem = {
    icon: "work",
    label: "Work Types",
    labelKey: "navigation.items.workTypes",
    path: "/work-types",
  };

  const preferredIndex = sections.findIndex(
    (section) => section.id === "office-management",
  );
  const targetIndex = preferredIndex >= 0
    ? preferredIndex
    : sections.findIndex((section) => section.id === "operations");

  if (targetIndex < 0) {
    return sections;
  }

  return sections.map((section, index) =>
    index === targetIndex
      ? { ...section, items: [...section.items, item] }
      : section,
  );
}

// Navigation is keyed only by platform account class. Office authority is
// resolved server-side and exposed through organization/work-type contexts.
export function getManagementNavigation(
  accountClass: AccountClass,
  organizationMode: OrganizationNavigationMode = "NONE",
  workTypeMode: WorkTypeNavigationMode = "NONE",
): ManagementNavigationSection[] {
  if (accountClass === "SUPER_ADMIN") {
    return [
      ...withWorkTypeNavigation(SUPER_ADMIN_NAVIGATION, workTypeMode),
      ACCOUNT_SETTINGS_SECTION,
    ];
  }

  return [
    ...withWorkTypeNavigation(
      withOfficeManagement(OFFICE_USER_NAVIGATION, organizationMode),
      workTypeMode,
    ),
    ACCOUNT_SETTINGS_SECTION,
  ];
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
