import type { AccountRole } from "./auth";

export type DirectoryScopeType =
  | "ORGANIZATION"
  | "DIVISION"
  | "DEPARTMENT";

export type DirectoryContactVisibility =
  | "FULL"
  | "LIMITED";

export type DirectoryEmployeeStatus =
  | "ACTIVE"
  | "INACTIVE";

export type DirectoryEmploymentStatus =
  | "ACTIVE"
  | "RESIGNED"
  | "RETIRED"
  | "TERMINATED"
  | "TRANSFERRED";

export type DirectoryRecordStatus =
  | "CURRENT"
  | "ARCHIVED";

export type DirectoryAccountStatus =
  | "ENABLED"
  | "DISABLED"
  | "NO_ACCOUNT";

export type DirectoryActivationStatus =
  | "ACTIVATED"
  | "AWAITING_ACTIVATION";

export interface DirectoryOrganizationUnit {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export type DirectoryManagementPositionType =
  | "SENIOR_MANAGEMENT"
  | "TEAM_MANAGER";

export type DirectoryManagementPositionStatus =
  | "ACTIVE"
  | "INACTIVE";

export interface DirectoryCurrentPosition {
  assignmentId: string;
  startedAt: string;

  id: string;

  positionType:
    DirectoryManagementPositionType;

  divisionId: string;
  departmentId: string | null;

  isActive: boolean;

  status:
    DirectoryManagementPositionStatus;

  division:
    DirectoryOrganizationUnit;

  department:
    | DirectoryOrganizationUnit
    | null;
}

export interface DirectoryScope {
  role: AccountRole;
  type: DirectoryScopeType;

  division:
    | DirectoryOrganizationUnit
    | null;

  department:
    | DirectoryOrganizationUnit
    | null;

  contactVisibility:
    DirectoryContactVisibility;
}

export interface DirectoryEmployee {
  id: string;
  empId: string;
  empName: string;

  /*
   * Regular employees receive limited directory data,
   * so contact fields may be hidden by the backend.
   */
  phoneNumber: string | null;
  officialEmail: string | null;

  designation: string | null;

  profilePhotoKey: string | null;

  status:
    DirectoryEmployeeStatus;

  employmentStatus:
    DirectoryEmploymentStatus;

  employmentEndedAt:
    string | null;

  employmentEndReason:
    string | null;

  archivedAt:
    string | null;

  activationStatus:
    DirectoryActivationStatus;

  accountStatus:
    DirectoryAccountStatus;

  /*
   * role remains a compatibility alias for
   * the stored account role.
   */
  role: AccountRole | null;

  accountRole:
    AccountRole | null;

  effectiveRole:
    AccountRole | null;

  currentPosition:
    DirectoryCurrentPosition | null;

  division:
    | DirectoryOrganizationUnit
    | null;

  department:
    | DirectoryOrganizationUnit
    | null;

  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DirectoryFilters {
  search: string | null;

  status:
    | DirectoryEmployeeStatus
    | null;

  employmentStatus:
    | DirectoryEmploymentStatus
    | null;

  recordStatus:
    DirectoryRecordStatus;


  role:
    | AccountRole
    | null;

  accountStatus:
    | DirectoryAccountStatus
    | null;

  activationStatus:
    | DirectoryActivationStatus
    | null;

  divisionId: string | null;
  departmentId: string | null;
}

export interface DirectoryPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DirectoryListResponse {
  data: DirectoryEmployee[];
  scope: DirectoryScope;
  filters: DirectoryFilters;
  pagination: DirectoryPagination;
}

export interface DirectoryEmployeeDetailResponse {
  employee: DirectoryEmployee;
  scope: DirectoryScope;
}

export interface DirectoryListQuery {
  search?: string;

  status?:
    DirectoryEmployeeStatus;

  employmentStatus?:
    DirectoryEmploymentStatus;

  recordStatus?:
    DirectoryRecordStatus;


  role?: AccountRole;

  accountStatus?:
    DirectoryAccountStatus;

  activationStatus?:
    DirectoryActivationStatus;

  divisionId?: string;
  departmentId?: string;

  page?: number;
  limit?: number;
}
export interface UpdateDirectoryEmployeeStatusResponse {
  message: string;

  employee: {
    id: string;
    empId: string;
    empName: string;
    officialEmail: string;
    status: DirectoryEmployeeStatus;
    isActivated: boolean;
    updatedAt: string;
  };
}


export interface EndDirectoryEmployeeEmploymentInput {
  employmentStatus:
    Exclude<
      DirectoryEmploymentStatus,
      "ACTIVE"
    >;

  reason: string;
  effectiveAt?: string;
}

export interface EndDirectoryEmployeeEmploymentResponse {
  message: string;

  employee: {
    id: string;
    empId: string;
    empName: string;
    officialEmail: string;
    status: DirectoryEmployeeStatus;
    employmentStatus:
      DirectoryEmploymentStatus;
    employmentEndedAt: string;
    employmentEndReason: string;
    archivedAt: string | null;
    isActivated: boolean;
    updatedAt: string;
  };

  revokedSessions: number;
}


export interface ArchiveDirectoryEmployeeInput {
  reason: string;
}

export interface ArchiveDirectoryEmployeeResponse {
  message: string;

  employee: {
    id: string;
    empId: string;
    empName: string;
    officialEmail: string;
    status: DirectoryEmployeeStatus;
    employmentStatus:
      DirectoryEmploymentStatus;
    employmentEndedAt: string | null;
    employmentEndReason: string | null;
    archivedAt: string;
    isActivated: boolean;
    updatedAt: string;
  };

  revokedSessions: number;
}


export type DirectoryLifecycleActionType =
  | "SUSPENDED"
  | "REACTIVATED"
  | "RESIGNED"
  | "RETIRED"
  | "TERMINATED"
  | "ARCHIVED"
  | "UNARCHIVED"
  | "TRANSFERRED"
  | "PROMOTED"
  | "DEMOTED"
  | "REHIRED";

export interface DirectoryLifecycleActor {
  id: string;
  username: string | null;
  role: AccountRole;

  employee: {
    empId: string;
    empName: string;
  } | null;
}

export interface DirectoryLifecycleAction {
  id: string;
  action:
    DirectoryLifecycleActionType;

  previousEmployeeStatus:
    DirectoryEmployeeStatus | null;

  newEmployeeStatus:
    DirectoryEmployeeStatus | null;

  previousEmploymentStatus:
    DirectoryEmploymentStatus | null;

  newEmploymentStatus:
    DirectoryEmploymentStatus | null;

  reason: string | null;
  effectiveAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;

  metadata:
    Record<string, unknown> | null;

  createdAt: string;
  actor: DirectoryLifecycleActor;
}

export interface DirectoryLifecycleHistoryResponse {
  employee: {
    id: string;
    empId: string;
    empName: string;
  };

  data: DirectoryLifecycleAction[];
}


export type DirectoryRoleChangeTarget =
  Exclude<
    AccountRole,
    "SUPER_ADMIN"
  >;

export interface DirectoryOrganizationDivision {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface DirectoryOrganizationDepartment {
  id: string;
  code: string;
  name: string;
  isActive: boolean;

  division: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
  };
}

export interface DirectoryOrganizationDivisionsResponse {
  data:
    DirectoryOrganizationDivision[];
}

export interface DirectoryOrganizationDepartmentsResponse {
  data:
    DirectoryOrganizationDepartment[];
}

export interface ChangeDirectoryEmployeeRoleInput {
  targetRole:
    DirectoryRoleChangeTarget;

  divisionId: string;
  departmentId?: string;

  managementPositionId?: string;

  designation?: string;
  reason: string;
}

export interface ChangeDirectoryEmployeeRoleResponse {
  message: string;

  action:
    | "PROMOTED"
    | "DEMOTED"
    | "TRANSFERRED";

  revokedSessions: number;

  previousManagementPositionId:
    string | null;

  newManagementPositionId:
    string | null;

  newManagementAssignmentId:
    string | null;

  employee: {
    id: string;
    empId: string;
    empName: string;
    officialEmail: string;
    designation: string | null;
    divisionId: string;
    departmentId: string | null;
    status:
      DirectoryEmployeeStatus;
    employmentStatus:
      DirectoryEmploymentStatus;
    isActivated: boolean;
    updatedAt: string;

    division:
      DirectoryOrganizationUnit;

    departmentUnit:
      DirectoryOrganizationUnit;

    account: {
      id: string;
      role: AccountRole;
      isEnabled: boolean;
    };
  };
}
