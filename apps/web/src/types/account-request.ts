import type { AccountRole } from "./auth";

export type AccountRequestStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "ACTIVATION_PENDING"
  | "ACTIVATED";

export type AccountRequestOrganizationRole = "EMPLOYEE" | "ORG_UNIT_HEAD";

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
  requestedOrganizationRole: AccountRequestOrganizationRole;
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
  requestedOrganizationRole: AccountRequestOrganizationRole;
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
  officeId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AdminAccountRequestListResponse {
  data: AdminAccountRequestListItem[];

  filters: {
    status: AccountRequestStatus;
    officeId?: string;
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
  officeId: string | null;
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
    requestedOrganizationRole: AccountRequestOrganizationRole;
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
  leadership?: {
    id: string;
    leadershipType: "ORG_UNIT_HEAD";
    orgUnitId: string;
  } | null;
}

export interface CloseAccountRequestResponse {
  message: string;
  accountRequest: {
    id: string;
    empId: string;
    empName: string;
    officialEmail: string;
    requestedRole: AccountRole;
    requestedOrganizationRole: AccountRequestOrganizationRole;
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
    requestedOrganizationRole: AccountRequestOrganizationRole;
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
    requestedOrganizationRole: AccountRequestOrganizationRole;
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
  parentOrgUnitId?: string | null;
  orgUnitType?: {
    code: string;
    name: string;
  };
  headTitle?: string;
  hasCurrentHead?: boolean;
  canRequestHead?: boolean;
}

export interface ManagerRequestContextResponse {
  accountClass: "OFFICE_USER";
  authority: {
    kind: "OFFICE_HEAD" | "ORG_UNIT_HEAD";
    headOrgUnitIds: string[];
  };
  office: {
    id: string;
    code: string;
    name: string;
    isActive?: boolean;
  };
  primaryOrgUnit: AccountRequestOrgUnit | null;
  orgUnits: AccountRequestOrgUnit[];
  scope: {
    office: {
      id: string;
      code: string;
      name: string;
      isActive?: boolean;
    };
    orgUnit: AccountRequestOrgUnit | null;
  };
}

export interface CreateMyAccountRequestInput {
  officeId: string;
  intendedOrgUnitId: string;
  requestedOrganizationRole: AccountRequestOrganizationRole;
  empId: string;
  empName: string;
  phoneNumber: string;
  officialEmail: string;
  designation?: string;
}

export interface ResubmitMyAccountRequestInput {
  intendedOrgUnitId?: string;
  requestedOrganizationRole?: AccountRequestOrganizationRole;
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
  requestedOrganizationRole: AccountRequestOrganizationRole;
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
  requestedOrganizationRole: AccountRequestOrganizationRole;
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
  requestedOrganizationRole: AccountRequestOrganizationRole;
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

/* MANAGER ACCOUNT REQUEST TYPES END */
