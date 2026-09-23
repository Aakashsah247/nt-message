import type { AccountClass, AccountRole } from "./auth";

export type DirectoryScopeType =
  | "OFFICE"
  | "ORG_UNIT";

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
  typeCode?: "DIVISION" | "DEPARTMENT" | "SECTION" | "UNIT" | string;
  typeName?: string;
}


export type DirectoryLeadershipType =
  | "OFFICE_HEAD"
  | "ORG_UNIT_HEAD";

export interface DirectoryLeadershipAssignment {
  id: string;
  type: DirectoryLeadershipType;
  isActing: boolean;
  effectiveFrom: string;
  effectiveUntil: string | null;
  office: DirectoryOrganizationUnit;
  orgUnit: DirectoryOrganizationUnit | null;
}

export interface DirectoryScope {
  accountClass: AccountClass;
  type: DirectoryScopeType;
  office: DirectoryOrganizationUnit | null;
  orgUnit: DirectoryOrganizationUnit | null;
  contactVisibility: DirectoryContactVisibility;
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

  office: DirectoryOrganizationUnit | null;
  primaryOrgUnit: DirectoryOrganizationUnit | null;
  orgUnitBreadcrumb: DirectoryOrganizationUnit[];
  leadership: DirectoryLeadershipAssignment[];

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

  accountClass: AccountClass | null;

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


  accountStatus:
    | DirectoryAccountStatus
    | null;

  activationStatus:
    | DirectoryActivationStatus
    | null;

  officeId: string | null;
  orgUnitId: string | null;
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


  accountStatus?:
    DirectoryAccountStatus;

  activationStatus?:
    DirectoryActivationStatus;

  officeId?: string;
  orgUnitId?: string;

  page?: number;
  limit?: number;
}

export interface TransferDirectoryEmployeeOfficeInput {
  targetOfficeId: string;
  targetOrgUnitId: string;
  reason: string;
  effectiveAt?: string;
}

export interface TransferDirectoryEmployeeOfficeResponse {
  message: string;
  employee: {
    id: string;
    empId: string;
    empName: string;
    status: DirectoryEmployeeStatus;
    employmentStatus: DirectoryEmploymentStatus;
  };
  transfer: {
    sourceOffice: DirectoryOrganizationUnit;
    sourceOrgUnit: DirectoryOrganizationUnit | null;
    targetOffice: DirectoryOrganizationUnit;
    targetOrgUnit: DirectoryOrganizationUnit;
    effectiveAt: string;
  };
  revokedSessions: number;
}

export type OfficeHeadTransferMode = "EMPLOYEE" | "OFFICE_HEAD";

export interface TransferOfficeHeadInput {
  targetOfficeId: string;
  targetOrgUnitId?: string;
  replacementEmployeeId: string;
  transferAs: OfficeHeadTransferMode;
  reason: string;
  effectiveAt?: string;
}

export interface TransferOfficeHeadResponse {
  message: string;
  employee: {
    id: string;
    empId: string;
    empName: string;
    status: DirectoryEmployeeStatus;
    employmentStatus: DirectoryEmploymentStatus;
  };
  transfer: {
    sourceOffice: DirectoryOrganizationUnit;
    sourceOrgUnit: DirectoryOrganizationUnit | null;
    targetOffice: DirectoryOrganizationUnit;
    targetOrgUnit: DirectoryOrganizationUnit | null;
    effectiveAt: string;
  };
  revokedSessions: number;
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
      "ACTIVE" | "TRANSFERRED"
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
