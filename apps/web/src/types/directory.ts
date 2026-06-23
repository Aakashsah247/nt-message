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

  role: AccountRole | null;

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
