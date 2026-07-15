import { apiRequest } from "../lib/api";

import type {
  AccountRequestStatus,
  AdminAccountRequestListQuery,
  AdminAccountRequestDetailResponse,
  AdminAccountRequestListResponse,
  AdminAccountRequestSummaryResponse,
  ApproveAccountRequestResponse,
  CloseAccountRequestResponse,
  CreateMyAccountRequestInput,
  CreateMyAccountRequestResponse,
  ManagerRequestContextResponse,
  MyAccountRequestDetailResponse,
  MyAccountRequestListResponse,
  OwnAccountStatusResponse,
  ScopedAccountRequestDetailResponse,
  ScopedAccountRequestListResponse,
  RejectAccountRequestResponse,
  ResubmitMyAccountRequestInput,
  ResubmitMyAccountRequestResponse,
} from "../types/account-request";


export interface AccountRequestListFilters {
  search?: string;
  departmentId?: string;
  dateFrom?: string;
  dateTo?: string;
}

function appendListFilters(
  query: URLSearchParams,
  filters: AccountRequestListFilters,
): void {
  if (filters.search?.trim()) {
    query.set("search", filters.search.trim());
  }

  if (filters.departmentId) {
    query.set("departmentId", filters.departmentId);
  }

  if (filters.dateFrom) {
    query.set("dateFrom", filters.dateFrom);
  }

  if (filters.dateTo) {
    query.set("dateTo", filters.dateTo);
  }
}

function createAuthorizationHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export function getMyRequestContext(
  accessToken: string,
): Promise<ManagerRequestContextResponse> {
  return apiRequest<ManagerRequestContextResponse>(
    "/account-requests/context",
    {
      headers: createAuthorizationHeaders(accessToken),
    },
  );
}

export function createMyAccountRequest(
  accessToken: string,
  input: CreateMyAccountRequestInput,
): Promise<CreateMyAccountRequestResponse> {
  return apiRequest<CreateMyAccountRequestResponse>("/account-requests", {
    method: "POST",

    headers: createAuthorizationHeaders(accessToken),

    body: JSON.stringify(input),
  });
}

export function listMyAccountRequests(
  accessToken: string,
  status?: AccountRequestStatus,
  page = 1,
  limit = 20,
  filters: AccountRequestListFilters = {},
): Promise<MyAccountRequestListResponse> {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (status) {
    query.set("status", status);
  }

  appendListFilters(query, filters);

  return apiRequest<MyAccountRequestListResponse>(
    `/account-requests/mine?${query.toString()}`,
    {
      headers: createAuthorizationHeaders(accessToken),
    },
  );
}

export function getOwnAccountStatus(
  accessToken: string,
): Promise<OwnAccountStatusResponse> {
  return apiRequest<OwnAccountStatusResponse>(
    "/account-requests/own-status",
    {
      headers: createAuthorizationHeaders(accessToken),
    },
  );
}

export function listDivisionEmployeeRequests(
  accessToken: string,
  status?: AccountRequestStatus,
  page = 1,
  limit = 20,
  filters: AccountRequestListFilters = {},
): Promise<ScopedAccountRequestListResponse> {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (status) {
    query.set("status", status);
  }

  appendListFilters(query, filters);

  return apiRequest<ScopedAccountRequestListResponse>(
    `/account-requests/division-employees?${query.toString()}`,
    {
      headers: createAuthorizationHeaders(accessToken),
    },
  );
}

export function getDivisionEmployeeRequest(
  accessToken: string,
  requestId: string,
): Promise<ScopedAccountRequestDetailResponse> {
  return apiRequest<ScopedAccountRequestDetailResponse>(
    `/account-requests/division-employees/${requestId}`,
    {
      headers: createAuthorizationHeaders(accessToken),
    },
  );
}

export function getMyAccountRequest(
  accessToken: string,
  requestId: string,
): Promise<MyAccountRequestDetailResponse> {
  return apiRequest<MyAccountRequestDetailResponse>(
    `/account-requests/mine/${requestId}`,
    {
      headers: createAuthorizationHeaders(accessToken),
    },
  );
}

export function resubmitMyAccountRequest(
  accessToken: string,
  requestId: string,
  input: ResubmitMyAccountRequestInput,
): Promise<ResubmitMyAccountRequestResponse> {
  return apiRequest<ResubmitMyAccountRequestResponse>(
    `/account-requests/mine/${requestId}/resubmit`,
    {
      method: "POST",

      headers: createAuthorizationHeaders(accessToken),

      body: JSON.stringify(input),
    },
  );
}

export function cancelMyAccountRequest(
  accessToken: string,
  requestId: string,
  reason: string,
): Promise<CloseAccountRequestResponse> {
  return apiRequest<CloseAccountRequestResponse>(
    `/account-requests/mine/${requestId}/cancel`,
    {
      method: "PATCH",

      headers: createAuthorizationHeaders(accessToken),

      body: JSON.stringify({
        reason,
      }),
    },
  );
}

export function listAdminAccountRequests(
  accessToken: string,
  input: AdminAccountRequestListQuery,
): Promise<AdminAccountRequestListResponse> {
  const query = new URLSearchParams({
    status: input.status,
    page: String(input.page ?? 1),
    limit: String(input.limit ?? 20),
  });

  if (input.requestedRole) query.set("requestedRole", input.requestedRole);
  if (input.divisionId) query.set("divisionId", input.divisionId);
  if (input.departmentId) query.set("departmentId", input.departmentId);
  if (input.search) query.set("search", input.search);
  if (input.dateFrom) query.set("dateFrom", input.dateFrom);
  if (input.dateTo) query.set("dateTo", input.dateTo);

  return apiRequest<AdminAccountRequestListResponse>(
    `/admin/account-requests?${query.toString()}`,
    {
      headers: createAuthorizationHeaders(accessToken),
    },
  );
}

export function getAdminAccountRequestSummary(
  accessToken: string,
): Promise<AdminAccountRequestSummaryResponse> {
  return apiRequest<AdminAccountRequestSummaryResponse>(
    "/admin/account-requests/dashboard/summary",
    {
      headers: createAuthorizationHeaders(accessToken),
    },
  );
}

export function getAdminAccountRequest(
  accessToken: string,
  requestId: string,
): Promise<AdminAccountRequestDetailResponse> {
  return apiRequest<AdminAccountRequestDetailResponse>(
    `/admin/account-requests/${requestId}`,
    {
      headers: createAuthorizationHeaders(accessToken),
    },
  );
}

export function approveAdminAccountRequest(
  accessToken: string,
  requestId: string,
): Promise<ApproveAccountRequestResponse> {
  return apiRequest<ApproveAccountRequestResponse>(
    `/admin/account-requests/${requestId}/approve`,
    {
      method: "PATCH",

      headers: createAuthorizationHeaders(accessToken),
    },
  );
}

export function invalidateAdminAccountRequest(
  accessToken: string,
  requestId: string,
  reason: string,
): Promise<CloseAccountRequestResponse> {
  return apiRequest<CloseAccountRequestResponse>(
    `/admin/account-requests/${requestId}/invalidate`,
    {
      method: "PATCH",

      headers: createAuthorizationHeaders(accessToken),

      body: JSON.stringify({
        reason,
      }),
    },
  );
}

export function rejectAdminAccountRequest(
  accessToken: string,
  requestId: string,
  reason: string,
): Promise<RejectAccountRequestResponse> {
  return apiRequest<RejectAccountRequestResponse>(
    `/admin/account-requests/${requestId}/reject`,
    {
      method: "PATCH",

      headers: createAuthorizationHeaders(accessToken),

      body: JSON.stringify({
        reason,
      }),
    },
  );
}
