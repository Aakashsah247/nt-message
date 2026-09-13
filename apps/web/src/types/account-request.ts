import type { AccountRole } from "./auth";

export type AccountRequestStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "ACTIVATION_PENDING"
  | "ACTIVATED";

export type ActivationEmailDeliveryStatus =
  | "NOT_SENT"
  | "PENDING"
  | "SENT"
  | "FAILED";

export type AccountRequestActionType =
  | "CREATED"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "RESUBMITTED"
  | "ACTIVATION_STARTED"
  | "ACTIVATED"
  | "ACTIVATION_EMAIL_QUEUED"
  | "ACTIVATION_EMAIL_SENT"
  | "ACTIVATION_EMAIL_FAILED"
  | "ACTIVATION_EMAIL_RESENT";


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
  office: AccountRequestOrgUnit | null;
  intendedOrgUnit: AccountRequestOrgUnit | null;
  employeeId?: string | null;
  revisionNumber: number;
  status: AccountRequestStatus;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  activationEmailStatus: ActivationEmailDeliveryStatus;
  activationEmailLastAttemptAt: string | null;
  activationEmailSentAt: string | null;
  activationEmailFailureCategory: string | null;



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
  office: AccountRequestOrgUnit | null;
  intendedOrgUnit: AccountRequestOrgUnit | null;
  employeeId: string | null;
  previousRequestId: string | null;
  revisionNumber: number;
  status: AccountRequestStatus;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  activationEmailStatus: ActivationEmailDeliveryStatus;
  activationEmailLastAttemptAt: string | null;
  activationEmailSentAt: string | null;
  activationEmailFailureCategory: string | null;



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
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AdminAccountRequestListResponse {
  data: AdminAccountRequestListItem[];

  filters: {
    status: AccountRequestStatus;
    requestedRole?: AccountRole;
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
    employeeId: string | null;
    revisionNumber: number;
    status: AccountRequestStatus;
    rejectionReason: string | null;
    submittedAt: string;
    reviewedAt: string | null;
    updatedAt: string;
    activationEmailStatus: ActivationEmailDeliveryStatus;
    activationEmailLastAttemptAt: string | null;
    activationEmailSentAt: string | null;
    activationEmailFailureCategory: string | null;
      };

  employee: {
    id: string;
    empId: string;
    empName: string;
    phoneNumber: string;
    officialEmail: string;
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
    employeeId: string | null;
    revisionNumber: number;
    status: AccountRequestStatus;
    rejectionReason: string | null;
    submittedAt: string;
    reviewedAt: string | null;
    updatedAt: string;
    activationEmailStatus: ActivationEmailDeliveryStatus;
    activationEmailLastAttemptAt: string | null;
    activationEmailSentAt: string | null;
    activationEmailFailureCategory: string | null;
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
    employeeId: string | null;
    revisionNumber: number;
    status: AccountRequestStatus;
    rejectionReason: string | null;
    submittedAt: string;
    reviewedAt: string | null;
    updatedAt: string;
    activationEmailStatus: ActivationEmailDeliveryStatus;
    activationEmailLastAttemptAt: string | null;
    activationEmailSentAt: string | null;
    activationEmailFailureCategory: string | null;
        reviewedBy: AccountRequestActor | null;
  };
}

export interface ResendActivationEmailResponse {
  message: string;

  accountRequest: {
    id: string;
    status: AccountRequestStatus;
    requestedRole: AccountRole;
    activationEmailStatus: ActivationEmailDeliveryStatus;
    activationEmailLastAttemptAt: string;
    activationEmailSentAt: string | null;
    activationEmailFailureCategory: string | null;
  };

  activationEmailDelivery: {
    status: ActivationEmailDeliveryStatus;
    attemptedAt: string;
    sentAt: string | null;
    failureCategory: string | null;
  };

  resendAvailableAt: string;
}

/* MANAGER ACCOUNT REQUEST TYPES START */

export interface AccountRequestOrgUnit {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
}

export interface ManagerRequestContextResponse {
  accountClass: "OFFICE_USER";
  requestedRole: "EMPLOYEE";
  office: {
    id: string;
    code: string;
    name: string;
    isActive?: boolean;
  };
  primaryOrgUnit: AccountRequestOrgUnit;
  orgUnits: AccountRequestOrgUnit[];
  scope: {
    office: {
      id: string;
      code: string;
      name: string;
      isActive?: boolean;
    };
    orgUnit: AccountRequestOrgUnit;
  };
}

export interface CreateMyAccountRequestInput {
  officeId: string;
  intendedOrgUnitId: string;
  empId: string;
  empName: string;
  phoneNumber: string;
  officialEmail: string;
  designation?: string;
}

export interface ResubmitMyAccountRequestInput {
  intendedOrgUnitId?: string;
  empId?: string;
  empName?: string;
  phoneNumber?: string;
  officialEmail?: string;
  designation?: string;
}

export interface SubmittedAccountRequest {
  id: string;
  empId: string;
  empName: string;
  phoneNumber: string;
  officialEmail: string;
  designation: string | null;
  requestedRole: AccountRole;
  officeId?: string | null;
  intendedOrgUnitId?: string | null;
  requestedByAccountId: string;
  previousRequestId?: string | null;
  revisionNumber: number;
  status: AccountRequestStatus;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
  activationEmailStatus: ActivationEmailDeliveryStatus;
  activationEmailLastAttemptAt: string | null;
  activationEmailSentAt: string | null;
  activationEmailFailureCategory: string | null;
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
  office: AccountRequestOrgUnit | null;
  intendedOrgUnit: AccountRequestOrgUnit | null;
  officeId?: string | null;
  intendedOrgUnitId?: string | null;
  revisionNumber: number;
  status: AccountRequestStatus;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  activationEmailStatus: ActivationEmailDeliveryStatus;
  activationEmailLastAttemptAt: string | null;
  activationEmailSentAt: string | null;
  activationEmailFailureCategory: string | null;
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
  office: AccountRequestOrgUnit | null;
  intendedOrgUnit: AccountRequestOrgUnit | null;
  officeId?: string | null;
  intendedOrgUnitId?: string | null;
  employeeId: string | null;
  previousRequestId: string | null;
  revisionNumber: number;
  status: AccountRequestStatus;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  activationEmailStatus: ActivationEmailDeliveryStatus;
  activationEmailLastAttemptAt: string | null;
  activationEmailSentAt: string | null;
  activationEmailFailureCategory: string | null;
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
                } | null;
  };
  accountRequest:
    | (MyAccountRequestDetail & {
        requestedBy: AccountRequestRequester;
      })
    | null;
}


/* MANAGER ACCOUNT REQUEST TYPES END */
