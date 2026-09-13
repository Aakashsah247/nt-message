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
  accountClass: "SUPER_ADMIN" | "OFFICE_USER";
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

export type OrganizationLeadershipType =
  | "OFFICE_HEAD"
  | "ORG_UNIT_HEAD"
  | "TEAM_LEAD"
  | "DEPUTY";

export interface OrganizationLeadershipRecord {
  id: string;
  officeId: string;
  orgUnitId: string | null;
  employeeId: string;
  leadershipType: OrganizationLeadershipType;
  assignmentSource: string;
  isActing: boolean;
  effectiveFrom: string;
  effectiveUntil: string | null;
  assignmentReason: string | null;
  endReason: string | null;
  createdAt: string;
  updatedAt: string;
  employee: {
    id: string;
    empId: string;
    empName: string;
    designation: string | null;
  };
  orgUnit: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
    orgUnitType: {
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

export interface OrganizationLeadershipResponse {
  data: OrganizationLeadershipRecord[];
}

export interface AssignOrganizationLeadershipInput {
  employeeId: string;
  orgUnitId?: string | null;
  leadershipType: OrganizationLeadershipType;
  isActing?: boolean;
  effectiveFrom?: string;
  effectiveUntil?: string;
  reason: string;
}

export interface EndOrganizationLeadershipInput {
  effectiveAt?: string;
  reason: string;
}

export interface OrganizationLeadershipMutationResponse {
  message: string;
  assignment: {
    id: string;
    employeeId: string;
    officeId: string;
    orgUnitId: string | null;
    leadershipType: OrganizationLeadershipType;
    assignmentSource: string;
    isActing: boolean;
    effectiveFrom: string;
    effectiveUntil: string | null;
    assignmentReason: string | null;
    endReason?: string | null;
  };
}
export type OrganizationDelegationCapability =
  | "organization.view"
  | "organization.create_unit"
  | "organization.rename_unit"
  | "organization.move_unit"
  | "organization.deactivate_unit"
  | "membership.view"
  | "membership.transfer_internal"
  | "membership.assign_secondary"
  | "leadership.view"
  | "leadership.assign"
  | "leadership.assign_acting"
  | "leadership.assign_deputy"
  | "users.request_create";

export interface OrganizationDelegationCandidate {
  accountId: string;
  username: string;
  employeeId: string;
  empId: string;
  empName: string;
  designation: string | null;
  primaryOrgUnit: {
    id: string;
    code: string;
    name: string;
  } | null;
}

export interface OrganizationDelegationContextResponse {
  officeId: string;
  orgUnitId: string | null;
  includeDescendants: boolean;
  hasDelegationAuthority: boolean;
  availableCapabilities: OrganizationDelegationCapability[];
  candidates: OrganizationDelegationCandidate[];
}

export interface OrganizationDelegationRecord {
  id: string;
  granteeAccountId: string;
  officeId: string;
  orgUnitId: string | null;
  capability: string;
  includeDescendants: boolean;
  canRedelegate: boolean;
  effectiveFrom: string;
  effectiveUntil: string | null;
  grantedByAccountId: string;
  revokedByAccountId: string | null;
  revokedAt: string | null;
  grantReason: string;
  revokeReason: string | null;
  createdAt: string;
  updatedAt: string;
  grantee: {
    id: string;
    username: string;
    employee: {
      empId: string;
      empName: string;
    } | null;
  };
  orgUnit: {
    id: string;
    code: string;
    name: string;
  } | null;
  grantedBy: {
    id: string;
    username: string;
  };
  revokedBy: {
    id: string;
    username: string;
  } | null;
  availableActions: {
    revoke: boolean;
  };
}

export interface OrganizationDelegationListResponse {
  data: OrganizationDelegationRecord[];
}

export interface CreateOrganizationDelegationInput {
  granteeAccountId: string;
  capability: OrganizationDelegationCapability;
  orgUnitId?: string | null;
  includeDescendants?: boolean;
  canRedelegate?: boolean;
  effectiveFrom?: string;
  effectiveUntil?: string;
  reason: string;
}

export interface RevokeOrganizationDelegationInput {
  effectiveAt?: string;
  reason: string;
}

export interface OrganizationDelegationMutationResponse {
  message: string;
  delegatedPermission: {
    id: string;
    granteeAccountId: string;
    officeId: string;
    orgUnitId: string | null;
    capability: string;
    includeDescendants: boolean;
    canRedelegate: boolean;
    effectiveFrom: string;
    effectiveUntil: string | null;
    revokedAt: string | null;
  };
}
