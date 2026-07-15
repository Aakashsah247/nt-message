import type { AccountRole } from "./auth";

export type AccountRequestStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "ACTIVATION_PENDING"
  | "ACTIVATED";

export type AccountRequestActionType =
  | "CREATED"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "RESUBMITTED"
  | "ACTIVATION_STARTED"
  | "ACTIVATED";

export interface AccountRequestDivision {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
}

export interface AccountRequestDepartment {
  id: string;
  code: string;
  name: string;
  divisionId?: string;
  isActive?: boolean;
}

export type ManagementPositionType =
  | "SENIOR_MANAGEMENT"
  | "TEAM_MANAGER";

export interface AvailableManagementPosition {
  id: string;
  positionType: ManagementPositionType;
  divisionId: string;
  departmentId: string | null;
  isActive: boolean;
  department: AccountRequestDepartment;
}

export interface AccountRequestActor {
  id: string;
  username: string | null;
  role: AccountRole;
}

export interface AccountRequestRequester {
  id: string;
  username: string | null;
  role: AccountRole;

  employee: {
    empId: string;
    empName: string;
    officialEmail: string;
  } | null;
}

export interface AdminAccountRequestListItem {
  id: string;
  empId: string;
  empName: string;
  officialEmail: string;
  designation: string | null;
  requestedRole: AccountRole;
  managementPositionId: string | null;
  employeeId?: string | null;
  revisionNumber: number;
  status: AccountRequestStatus;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;

  division: AccountRequestDivision | null;

  department: AccountRequestDepartment | null;

  requestedBy: AccountRequestRequester;

  reviewedBy: AccountRequestActor | null;
}

export interface AccountRequestEmployee {
  id: string;
  empId: string;
  empName: string;
  officialEmail: string;
  isActivated: boolean;
  status: string;
}

export interface AccountRequestAction {
  id: string;
  action: AccountRequestActionType;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;

  actor: AccountRequestActor | null;
}

export interface AdminAccountRequestDetail {
  id: string;
  empId: string;
  empName: string;
  phoneNumber: string;
  officialEmail: string;
  designation: string | null;
  requestedRole: AccountRole;
  divisionId: string | null;
  departmentId: string | null;
  managementPositionId: string | null;
  employeeId: string | null;
  previousRequestId: string | null;
  revisionNumber: number;
  status: AccountRequestStatus;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;

  division: AccountRequestDivision | null;

  department: AccountRequestDepartment | null;

  employee: AccountRequestEmployee | null;

  requestedBy: AccountRequestRequester;

  reviewedBy: AccountRequestActor | null;

  actions: AccountRequestAction[];
}


export interface AdminAccountRequestListQuery {
  status: AccountRequestStatus;
  page?: number;
  limit?: number;
  requestedRole?: AccountRole;
  divisionId?: string;
  departmentId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AdminAccountRequestListResponse {
  data: AdminAccountRequestListItem[];

  filters: {
    status: AccountRequestStatus;
    requestedRole?: AccountRole;
    divisionId?: string;
    departmentId?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  };

  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminAccountRequestSummaryResponse {
  counts: Record<AccountRequestStatus, number>;
  totalRequests: number;
  attentionTotal: number;
  activationCompletionRate: number;
  attentionRequests: AdminAccountRequestListItem[];
  recentActivity: AdminAccountRequestListItem[];
  generatedAt: string;
}

export interface AdminAccountRequestDetailResponse {
  accountRequest: AdminAccountRequestDetail;
}

export interface ApproveAccountRequestResponse {
  message: string;

  accountRequest: {
    id: string;
    empId: string;
    empName: string;
    officialEmail: string;
    requestedRole: AccountRole;
    divisionId: string | null;
    departmentId: string | null;
    managementPositionId: string | null;
    employeeId: string | null;
    revisionNumber: number;
    status: AccountRequestStatus;
    rejectionReason: string | null;
    submittedAt: string;
    reviewedAt: string | null;
    updatedAt: string;
    division: AccountRequestDivision | null;
    department: AccountRequestDepartment | null;
  };

  employee: {
    id: string;
    empId: string;
    empName: string;
    phoneNumber: string;
    officialEmail: string;
    divisionId: string | null;
    departmentId: string | null;
    department: string | null;
    designation: string | null;
    status: string;
    isActivated: boolean;
    createdAt: string;
  };
}

export interface CloseAccountRequestResponse {
  message: string;

  accountRequest: {
    id: string;
    empId: string;
    empName: string;
    officialEmail: string;
    requestedRole: AccountRole;
    divisionId: string | null;
    departmentId: string | null;
    managementPositionId: string | null;
    employeeId: string | null;
    revisionNumber: number;
    status: AccountRequestStatus;
    rejectionReason: string | null;
    submittedAt: string;
    reviewedAt: string | null;
    updatedAt: string;
    division: AccountRequestDivision | null;
    department: AccountRequestDepartment | null;
  };
}

export interface RejectAccountRequestResponse {
  message: string;

  accountRequest: {
    id: string;
    empId: string;
    empName: string;
    officialEmail: string;
    requestedRole: AccountRole;
    divisionId: string | null;
    departmentId: string | null;
    managementPositionId: string | null;
    employeeId: string | null;
    revisionNumber: number;
    status: AccountRequestStatus;
    rejectionReason: string | null;
    submittedAt: string;
    reviewedAt: string | null;
    updatedAt: string;
    division: AccountRequestDivision | null;
    department: AccountRequestDepartment | null;
    reviewedBy: AccountRequestActor | null;
  };
}

/* MANAGER ACCOUNT REQUEST TYPES START */

export type ManagerAccountRole = "SENIOR_MANAGEMENT" | "TEAM_MANAGER";

export type ManagerRequestedRole = "TEAM_MANAGER" | "EMPLOYEE";

export interface ManagerRequestContextResponse {
  role: ManagerAccountRole;

  requestedRole: ManagerRequestedRole;

  scope: {
    division: AccountRequestDivision;

    department: AccountRequestDepartment | null;
  };

  departments: AccountRequestDepartment[];

  availableManagementPositions: AvailableManagementPosition[];
}

export interface CreateMyAccountRequestInput {
  empId: string;
  empName: string;
  phoneNumber: string;
  officialEmail: string;
  designation?: string;
  departmentId?: string;
  managementPositionId?: string;
}

export interface ResubmitMyAccountRequestInput {
  empId?: string;
  empName?: string;
  phoneNumber?: string;
  officialEmail?: string;
  designation?: string;
  departmentId?: string;
  managementPositionId?: string;
}

export interface SubmittedAccountRequest {
  id: string;
  empId: string;
  empName: string;
  phoneNumber: string;
  officialEmail: string;
  designation: string | null;
  requestedRole: AccountRole;
  divisionId: string | null;
  departmentId: string | null;
  managementPositionId: string | null;
  requestedByAccountId: string;
  previousRequestId?: string | null;
  revisionNumber: number;
  status: AccountRequestStatus;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;

  division: AccountRequestDivision | null;

  department: AccountRequestDepartment | null;
}

export interface CreateMyAccountRequestResponse {
  message: string;

  accountRequest: SubmittedAccountRequest;
}

export interface ResubmitMyAccountRequestResponse {
  message: string;

  accountRequest: SubmittedAccountRequest;
}

export interface MyAccountRequestListItem {
  id: string;
  empId: string;
  empName: string;
  officialEmail: string;
  designation: string | null;
  requestedRole: AccountRole;
  managementPositionId: string | null;
  revisionNumber: number;
  status: AccountRequestStatus;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;

  division: AccountRequestDivision | null;

  department: AccountRequestDepartment | null;

  reviewedBy: AccountRequestActor | null;
}

export interface MyAccountRequestAction {
  id: string;
  action: AccountRequestActionType;
  reason: string | null;
  createdAt: string;
}

export interface MyAccountRequestDetail {
  id: string;
  empId: string;
  empName: string;
  phoneNumber: string;
  officialEmail: string;
  designation: string | null;
  requestedRole: AccountRole;
  divisionId: string | null;
  departmentId: string | null;
  managementPositionId: string | null;
  employeeId: string | null;
  previousRequestId: string | null;
  revisionNumber: number;
  status: AccountRequestStatus;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;

  division: AccountRequestDivision | null;

  department: AccountRequestDepartment | null;

  reviewedBy: AccountRequestActor | null;

  actions: MyAccountRequestAction[];
}

export interface MyAccountRequestListResponse {
  data: MyAccountRequestListItem[];

  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface MyAccountRequestDetailResponse {
  accountRequest: MyAccountRequestDetail;
}

export interface OwnAccountStatusResponse {
  account: {
    id: string;
    username: string | null;
    role: AccountRole;
    isEnabled: boolean;
    lastLoginAt: string | null;
    createdAt: string;
    updatedAt: string;

    employee: {
      id: string;
      empId: string;
      empName: string;
      officialEmail: string;
      designation: string | null;
      status: string;
      employmentStatus: string;
      isActivated: boolean;
      divisionId: string | null;
      departmentId: string | null;
      division: AccountRequestDivision | null;
      departmentUnit: AccountRequestDepartment | null;
    } | null;
  };

  accountRequest: (MyAccountRequestDetail & {
    requestedBy: AccountRequestRequester;
  }) | null;
}

export interface ScopedAccountRequestListItem
  extends MyAccountRequestListItem {
  requestedBy: AccountRequestRequester;
}

export interface ScopedAccountRequestDetail
  extends MyAccountRequestDetail {
  requestedBy: AccountRequestRequester;
}

export interface ScopedAccountRequestListResponse {
  data: ScopedAccountRequestListItem[];

  scope: {
    divisionId: string;
    requestedRole: "EMPLOYEE";
  };

  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ScopedAccountRequestDetailResponse {
  accountRequest: ScopedAccountRequestDetail;
}

/* MANAGER ACCOUNT REQUEST TYPES END */
