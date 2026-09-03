export interface OrganizationOfficeSummary {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  _count: {
    orgUnits: number;
    memberships: number;
  };
}

export interface OrganizationUnitType {
  id: string;
  officeId: string;
  code: string;
  name: string;
  isTeam: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationOfficeDetail extends OrganizationOfficeSummary {
  orgUnitTypes: OrganizationUnitType[];
  _count: OrganizationOfficeSummary["_count"] & {
    leadershipAssignments: number;
  };
}

export interface OrganizationUnitNode {
  id: string;
  officeId: string;
  parentOrgUnitId: string | null;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  orgUnitType: {
    id: string;
    code: string;
    name: string;
    isTeam: boolean;
    isActive: boolean;
  };
  _count: {
    memberships: number;
    childOrgUnits: number;
    leadershipAssignments: number;
  };
  children: OrganizationUnitNode[];
}

export interface OrganizationAvailableActions {
  createChildUnit: boolean;
  renameUnit: boolean;
  moveUnit: boolean;
  changeUnitStatus: boolean;
}

export interface OrganizationActionContext {
  officeId: string;
  orgUnitId: string | null;
  availableActions: OrganizationAvailableActions;
}

export type OrganizationNavigationMode = "NONE" | "VIEW" | "MANAGE";

export interface OrganizationNavigationContextResponse {
  mode: OrganizationNavigationMode;
  officeIds: string[];
  manageableOfficeIds: string[];
}

export interface OrganizationOfficeListResponse {
  data: OrganizationOfficeSummary[];
}

export interface OrganizationOfficeResponse {
  office: OrganizationOfficeDetail;
}

export interface OrganizationTreeResponse {
  office: Pick<OrganizationOfficeSummary, "id" | "code" | "name" | "isActive">;
  tree: OrganizationUnitNode[];
}

export interface CreateOrganizationUnitInput {
  orgUnitTypeId: string;
  parentOrgUnitId?: string | null;
  code: string;
  name: string;
  sortOrder?: number;
}

export interface UpdateOrganizationUnitInput {
  code?: string;
  name?: string;
  sortOrder?: number;
}

export interface MoveOrganizationUnitInput {
  parentOrgUnitId?: string | null;
  sortOrder?: number;
}

export interface SetOrganizationUnitStatusInput {
  isActive: boolean;
}

export interface OrganizationUnitMutationResponse {
  message: string;
  orgUnit: OrganizationUnitNode;
}

export type OrganizationMembershipType =
  | "PRIMARY"
  | "SECONDARY"
  | "TEMPORARY";

export interface OrganizationPeopleAvailableActions {
  viewMemberships: boolean;
  transferPrimary: boolean;
  assignSecondary: boolean;
  viewLeadership: boolean;
  assignLeadership: boolean;
  assignActing: boolean;
  assignDeputy: boolean;
}

export interface OrganizationPeopleActionContext {
  officeId: string;
  orgUnitId: string | null;
  availableActions: OrganizationPeopleAvailableActions;
}

export interface OrganizationPersonAccount {
  id: string;
  username: string;
  role: string;
  isEnabled: boolean;
}

export interface OrganizationPersonSummary {
  employee: {
    id: string;
    empId: string;
    empName: string;
    designation: string | null;
    status: string;
    employmentStatus: string;
    isActivated: boolean;
    account: OrganizationPersonAccount | null;
  };
  primaryMembership: {
    id: string;
    officeId: string;
    orgUnitId: string | null;
    membershipType: "PRIMARY";
    assignmentSource: string;
    startsAt: string;
    orgUnit: {
      id: string;
      code: string;
      name: string;
      isActive: boolean;
      orgUnitType: {
        id: string;
        code: string;
        name: string;
        isTeam: boolean;
      };
    } | null;
  };
}

export interface OrganizationPeopleResponse {
  data: OrganizationPersonSummary[];
  scope: {
    officeWide: boolean;
    visibleOrgUnitIds: string[];
  };
}

export interface OrganizationMembershipRecord {
  id: string;
  officeId: string;
  orgUnitId: string | null;
  membershipType: OrganizationMembershipType;
  assignmentSource: string;
  startsAt: string;
  endsAt: string | null;
  assignmentReason: string | null;
  endReason: string | null;
  createdAt: string;
  updatedAt: string;
  orgUnit: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
    orgUnitType: {
      id: string;
      name: string;
      isTeam: boolean;
    };
  } | null;
  assignedBy: {
    id: string;
    username: string;
  } | null;
  endedBy: {
    id: string;
    username: string;
  } | null;
}

export interface OrganizationEmployeeMembershipsResponse {
  employee: {
    id: string;
    empId: string;
    empName: string;
    designation: string | null;
    status: string;
    employmentStatus: string;
    archivedAt: string | null;
    account: OrganizationPersonAccount | null;
  };
  data: OrganizationMembershipRecord[];
}

export interface TransferPrimaryMembershipInput {
  employeeId: string;
  orgUnitId?: string | null;
  effectiveAt?: string;
  reason: string;
}

export interface AssignOrganizationMembershipInput {
  employeeId: string;
  orgUnitId?: string | null;
  membershipType: "SECONDARY" | "TEMPORARY";
  startsAt?: string;
  endsAt?: string;
  reason: string;
}

export interface EndOrganizationMembershipInput {
  effectiveAt?: string;
  reason: string;
}

export interface OrganizationMembershipMutationResponse {
  message: string;
  membership: OrganizationMembershipRecord;
}
