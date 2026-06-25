import type { AccountRole } from "./auth";

export type ManagementPositionType =
  | "SENIOR_MANAGEMENT"
  | "TEAM_MANAGER";

export type ManagementPositionOccupancy =
  | "ALL"
  | "VACANT"
  | "OCCUPIED";

export interface ManagementOrganizationUnit {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface ManagementAssignmentEmployee {
  id: string;
  empId: string;
  empName: string;
  officialEmail: string;
  designation: string | null;

  status?: string;
  employmentStatus?: string;

  account?: {
    role: AccountRole;
    isEnabled: boolean;
  } | null;
}

export interface ManagementAssignmentActor {
  id: string;
  username: string | null;
  role: AccountRole;

  employee: {
    empId: string;
    empName: string;
  } | null;
}

export interface ManagementAssignmentSummary {
  id: string;
  startedAt: string;
  endedAt?: string | null;
  assignmentReason: string | null;
  endReason?: string | null;
  createdAt?: string;
  updatedAt?: string;

  employee: ManagementAssignmentEmployee;

  assignedBy?: ManagementAssignmentActor;
  endedBy?: ManagementAssignmentActor | null;
}

export interface ManagementPositionListItem {
  id: string;

  positionType:
    ManagementPositionType;

  divisionId: string;
  departmentId: string | null;

  isActive: boolean;

  occupancy:
    Exclude<
      ManagementPositionOccupancy,
      "ALL"
    >;

  division:
    ManagementOrganizationUnit;

  department:
    ManagementOrganizationUnit | null;

  currentAssignment:
    ManagementAssignmentSummary | null;

  _count: {
    assignments: number;
  };

  createdAt: string;
  updatedAt: string;
}

export interface ManagementPositionDetail
  extends ManagementPositionListItem {
  assignments:
    ManagementAssignmentSummary[];
}

export interface ListManagementPositionsQuery {
  positionType?:
    ManagementPositionType;

  divisionId?: string;
  departmentId?: string;

  occupancy?:
    ManagementPositionOccupancy;
}

export interface ListManagementPositionsResponse {
  data: ManagementPositionListItem[];

  filters: {
    positionType:
      ManagementPositionType | null;

    divisionId: string | null;
    departmentId: string | null;

    occupancy:
      ManagementPositionOccupancy;
  };
}

export interface ManagementPositionDetailResponse {
  position:
    ManagementPositionDetail;
}

export interface CreateManagementPositionInput {
  positionType:
    ManagementPositionType;

  divisionId: string;
  departmentId?: string;
}

export interface CreateManagementPositionResponse {
  message: string;
  position: ManagementPositionListItem;
}

export interface AssignManagementPositionInput {
  employeeId: string;
  reason: string;
  startedAt?: string;
}

export interface ReplaceManagementPositionInput {
  newEmployeeId: string;
  reason: string;
  assignmentReason?: string;
  effectiveAt?: string;
}

export interface EndManagementAssignmentInput {
  reason: string;
  effectiveAt?: string;
}

export interface ManagementAssignmentActionResponse {
  message: string;

  assignment:
    ManagementAssignmentSummary;

  revokedSessions: number;
}
