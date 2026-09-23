import type { AccountClass } from "../../types/auth";
import type { OrganizationWorkspaceContext } from "../../types/organization-v3";
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
  | "organization-admin"
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

function officeItem(
  icon: ManagementIconName,
  label: string,
  labelKey: string,
  path: string,
): ManagementNavigationItem {
  return { icon, label, labelKey, path };
}

function buildOfficeUserNavigation(
  context: OrganizationWorkspaceContext,
): ManagementNavigationSection[] {
  const sections: ManagementNavigationSection[] = [
    {
      id: "overview",
      label: "Overview",
      labelKey: "navigation.sections.overview",
      items: [
        officeItem(
          "dashboard",
          "Dashboard",
          "navigation.items.dashboard",
          "/dashboard",
        ),
      ],
    },
  ];

  const peopleItems: ManagementNavigationItem[] = [];
  if (context.features.directory) {
    peopleItems.push(
      officeItem(
        "directory",
        "Directory",
        "navigation.items.directory",
        "/directory",
      ),
    );
  }
  if (peopleItems.length > 0) {
    sections.push({
      id: "people-access",
      label: "People & Access",
      labelKey: "navigation.sections.peopleAccess",
      items: peopleItems,
    });
  }

  const officeItems: ManagementNavigationItem[] = [];
  if (context.features.organizationView) {
    officeItems.push(
      officeItem(
        "organization",
        "Organization Management",
        "navigation.items.organizationPeople",
        "/organization",
      ),
    );
  }
  if (context.features.accountRequests) {
    officeItems.push(
      officeItem(
        "requests",
        "Account requests",
        "navigation.items.accountRequests",
        "/account-requests",
      ),
    );
  }
  if (officeItems.length > 0) {
    sections.push({
      id: "office-management",
      label: "Office Management",
      labelKey: "navigation.sections.officeManagement",
      items: officeItems,
    });
  }

  const operationItems: ManagementNavigationItem[] = [];
  if (context.features.workManagement) {
    operationItems.push(
      officeItem(
        "work",
        "Work Management",
        "navigation.items.workManagement",
        "/work",
      ),
    );
  }
  if (context.features.workTypes) {
    operationItems.push(
      officeItem(
        "work",
        "Work Types",
        "navigation.items.workTypes",
        "/work-types",
      ),
    );
  }
  if (context.features.myWork) {
    operationItems.push(
      officeItem("work", "My Work", "navigation.items.myWork", "/my-work"),
    );
  }
  if (context.features.dutyRoster) {
    operationItems.push(
      officeItem(
        "duty",
        "Duty Roster",
        "navigation.items.dutyRoster",
        "/duty-management",
      ),
    );
  }
  if (context.features.myDuty) {
    operationItems.push(
      officeItem("duty", "My Duty", "navigation.items.myDuty", "/my-duty"),
    );
  }
  if (context.features.teamManagement) {
    operationItems.push(
      officeItem(
        "teams",
        "Team Management",
        "navigation.items.teamManagement",
        "/team-management",
      ),
    );
  }
  if (context.features.reports) {
    operationItems.push(
      officeItem(
        "reports",
        "Reports",
        "navigation.items.reports",
        "/work-reports",
      ),
    );
  }
  if (operationItems.length > 0) {
    sections.push({
      id: "operations",
      label: "Operations",
      labelKey: "navigation.sections.operations",
      items: operationItems,
    });
  }

  if (context.features.messages) {
    sections.push({
      id: "communication",
      label: "Communication",
      labelKey: "navigation.sections.communication",
      items: [
        officeItem(
          "messages",
          "Messages",
          "navigation.items.messages",
          "/messages",
        ),
      ],
    });
  }

  return sections;
}

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
      { icon: "requests", label: "Account requests", labelKey: "navigation.items.accountRequests", path: "/super-admin/account-requests" },
    ],
  },
  {
    id: "organization-admin",
    label: "Organization Administration",
    labelKey: "navigation.sections.organizationAdministration",
    items: [
      {
        icon: "organization",
        label: "Offices",
        labelKey: "navigation.items.offices",
        path: "/super-admin/offices",
      },
      {
        icon: "organization",
        label: "Office Head Management",
        labelKey: "navigation.items.officeHeadManagement",
        path: "/super-admin/office-heads",
      },
    ],
  },
  {
    id: "operations",
    label: "Operational Oversight",
    labelKey: "navigation.sections.operationalOversight",
    items: [
      {
        icon: "work",
        label: "Work Oversight",
        labelKey: "navigation.items.workOversight",
        path: "/work-oversight",
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
    label: "System Governance",
    labelKey: "navigation.sections.systemGovernance",
    items: [
      {
        icon: "organization",
        label: "Office Organizations",
        labelKey: "navigation.items.organizationViewer",
        path: "/organization",
      },
      {
        icon: "analytics",
        label: "System Analytics",
        labelKey: "navigation.items.systemAnalytics",
        path: "/super-admin",
        view: "analytics",
      },
      {
        icon: "monitoring",
        label: "Monitoring & Audit",
        labelKey: "navigation.items.monitoringAudit",
        path: "/super-admin",
        view: "monitoring",
      },
      {
        icon: "profile",
        label: "Official Contact",
        labelKey: "navigation.items.officialContact",
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

export function getManagementNavigation(
  accountClass: AccountClass,
  workspaceContext: OrganizationWorkspaceContext | null = null,
): ManagementNavigationSection[] {
  if (accountClass === "SUPER_ADMIN") {
    return [...SUPER_ADMIN_NAVIGATION, ACCOUNT_SETTINGS_SECTION];
  }

  const officeNavigation = workspaceContext
    ? buildOfficeUserNavigation(workspaceContext)
    : [
        {
          id: "overview" as const,
          label: "Overview",
          labelKey: "navigation.sections.overview",
          items: [
            officeItem(
              "dashboard",
              "Dashboard",
              "navigation.items.dashboard",
              "/dashboard",
            ),
          ],
        },
      ];

  return [...officeNavigation, ACCOUNT_SETTINGS_SECTION];
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
