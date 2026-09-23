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
  currentPeopleCount?: number;
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
  linkedRecordCount: number;
  deletionProtected: boolean;
  children: OrganizationUnitNode[];
}

export interface OrganizationDeactivationBlockers {
  activeChildUnits: number;
  activeMemberships: number;
  activeLeadershipAssignments: number;
}

export interface OrganizationAvailableActions {
  createChildUnit: boolean;
  renameUnit: boolean;
  moveUnit: boolean;
  changeUnitStatus: boolean;
  deactivationBlockers: OrganizationDeactivationBlockers;
  deleteUnit: boolean;
  deleteBlockers: string[];
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

export interface OrganizationOfficeHeadContextResponse {
  isOfficeHead: boolean;
  officeIds: string[];
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

export interface DeleteOrganizationUnitResponse {
  message: string;
  deletedOrgUnit: {
    id: string;
    code: string;
    name: string;
  };
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
    profilePhotoKey: string | null;
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
    profilePhotoKey: string | null;
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

export type OrganizationSharedResponsibility =
  | "shared.organization_directory_view"
  | "shared.organization_management"
  | "shared.work_management"
  | "shared.work_type_management"
  | "shared.duty_roster_management"
  | "shared.team_management"
  | "shared.reports_export"
  | "shared.account_request_coordination"
  | "shared.official_communication_management";

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
  availableResponsibilities: OrganizationSharedResponsibility[];
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
  capability: OrganizationSharedResponsibility;
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

export interface CreateOrganizationOfficeInput { code: string; name: string; }
export interface CreateOrganizationOfficeResponse { message: string; office: OrganizationOfficeSummary; }
export interface AssignOfficeHeadInput { employeeId: string; effectiveFrom?: string; reason: string; }
export interface ReplaceOfficeHeadInput { employeeId: string; effectiveAt?: string; reason: string; }
export interface CreateOfficeHeadAccountInput { empId: string; empName: string; phoneNumber: string; officialEmail: string; designation: string; reason: string; replaceCurrent?: boolean; effectiveFrom?: string; }
export interface ReplaceOfficeHeadResponse { message: string; previousAssignmentId: string; assignment: { id: string; employeeId: string; officeId: string; orgUnitId: string | null; leadershipType: OrganizationLeadershipType; effectiveFrom: string; effectiveUntil: string | null }; }
export interface CreateOfficeHeadAccountResponse { message: string; employee: { id: string; empId: string; empName: string; phoneNumber: string; officialEmail: string; designation: string | null }; assignment: { id: string; employeeId: string; officeId: string; leadershipType: OrganizationLeadershipType }; activationEmailDelivery: { status: string; attemptedAt: string; sentAt: string | null; failureCategory: string | null }; }


export type OrganizationWorkspaceAuthorityKind =
  | "SUPER_ADMIN"
  | "OFFICE_HEAD"
  | "ORGANIZATION_HEAD"
  | "ORG_UNIT_HEAD"
  | "EMPLOYEE";

export interface OrganizationWorkspaceFeatures {
  dashboard: boolean;
  directory: boolean;
  organizationView: boolean;
  organizationManage: boolean;
  accountRequests: boolean;
  workManagement: boolean;
  myWork: boolean;
  dutyRoster: boolean;
  myDuty: boolean;
  teamManagement: boolean;
  reports: boolean;
  workTypes: boolean;
  messages: boolean;
  settings: boolean;
  emergency: boolean;
  workOversight: boolean;
}

export type OrganizationWorkspaceFeature = keyof OrganizationWorkspaceFeatures;

export interface OrganizationWorkspaceContext {
  primaryPlacement: {
    office: {
      id: string;
      code: string;
      name: string;
    };
    orgUnit: {
      id: string;
      code: string;
      name: string;
      orgUnitType: {
        id: string;
        code: string;
        name: string;
      };
    } | null;
  } | null;
  authority: {
    kind: OrganizationWorkspaceAuthorityKind;
    isOfficeHead: boolean;
    isOrganizationHead: boolean;
    isOrgUnitHead: boolean;
    isOperationalTeamLead: boolean;
  };
  scope: {
    officeIds: string[];
    headedOrgUnitIds: string[];
    topLevelHeadedOrgUnitIds: string[];
    operationalTeamLeadIds: string[];
  };
  features: OrganizationWorkspaceFeatures;
}
