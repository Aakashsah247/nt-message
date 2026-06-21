import { apiRequest } from "../lib/api";

import type {
  AccountRequestStatus,
  AdminAccountRequestDetailResponse,
  AdminAccountRequestListResponse,
  ApproveAccountRequestResponse,
  CreateMyAccountRequestInput,
  CreateMyAccountRequestResponse,
  ManagerRequestContextResponse,
  MyAccountRequestDetailResponse,
  MyAccountRequestListResponse,
  RejectAccountRequestResponse,
  ResubmitMyAccountRequestInput,
  ResubmitMyAccountRequestResponse,
} from "../types/account-request";

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
): Promise<MyAccountRequestListResponse> {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (status) {
    query.set("status", status);
  }

  return apiRequest<MyAccountRequestListResponse>(
    `/account-requests/mine?${query.toString()}`,
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

export function listAdminAccountRequests(
  accessToken: string,
  status: AccountRequestStatus,
  page = 1,
  limit = 20,
): Promise<AdminAccountRequestListResponse> {
  const query = new URLSearchParams({
    status,
    page: String(page),
    limit: String(limit),
  });

  return apiRequest<AdminAccountRequestListResponse>(
    `/admin/account-requests?${query.toString()}`,
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
