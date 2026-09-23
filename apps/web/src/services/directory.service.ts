import { apiRequest } from "../lib/api";

import type {
  ArchiveDirectoryEmployeeInput,
  ArchiveDirectoryEmployeeResponse,
  DirectoryEmployeeDetailResponse,
  DirectoryEmployeeStatus,
  DirectoryListQuery,
  DirectoryListResponse,
  DirectoryLifecycleHistoryResponse,
  EndDirectoryEmployeeEmploymentInput,
  EndDirectoryEmployeeEmploymentResponse,
  UpdateDirectoryEmployeeStatusResponse,
  TransferDirectoryEmployeeOfficeInput,
  TransferDirectoryEmployeeOfficeResponse,
  TransferOfficeHeadInput,
  TransferOfficeHeadResponse,
} from "../types/directory";

function createAuthorizationHeaders(
  accessToken: string,
): HeadersInit {
  return {
    Authorization:
      `Bearer ${accessToken}`,
  };
}

function createDirectoryQuery(
  query: DirectoryListQuery,
): string {
  const searchParams =
    new URLSearchParams();

  /*
   * Only defined filters are added.
   * This prevents empty values from being sent to the API.
   */
  if (query.search?.trim()) {
    searchParams.set(
      "search",
      query.search.trim(),
    );
  }

  if (query.status) {
    searchParams.set(
      "status",
      query.status,
    );
  }

  if (query.employmentStatus) {
    searchParams.set(
      "employmentStatus",
      query.employmentStatus,
    );
  }

  if (query.recordStatus) {
    searchParams.set(
      "recordStatus",
      query.recordStatus,
    );
  }


  if (query.accountStatus) {
    searchParams.set(
      "accountStatus",
      query.accountStatus,
    );
  }

  if (query.activationStatus) {
    searchParams.set(
      "activationStatus",
      query.activationStatus,
    );
  }

  if (query.officeId) {
    searchParams.set("officeId", query.officeId);
  }

  if (query.orgUnitId) {
    searchParams.set("orgUnitId", query.orgUnitId);
  }

  searchParams.set(
    "page",
    String(query.page ?? 1),
  );

  searchParams.set(
    "limit",
    String(query.limit ?? 20),
  );

  return searchParams.toString();
}

export function listDirectoryEmployees(
  accessToken: string,
  query: DirectoryListQuery = {},
): Promise<DirectoryListResponse> {
  const queryString =
    createDirectoryQuery(query);

  return apiRequest<DirectoryListResponse>(
    `/directory/employees?${queryString}`,
    {
      headers:
        createAuthorizationHeaders(
          accessToken,
        ),
    },
  );
}

export function getDirectoryEmployee(
  accessToken: string,
  employeeId: string,
): Promise<DirectoryEmployeeDetailResponse> {
  return apiRequest<DirectoryEmployeeDetailResponse>(
    `/directory/employees/${employeeId}`,
    {
      headers:
        createAuthorizationHeaders(
          accessToken,
        ),
    },
  );
}
export function transferDirectoryEmployeeOffice(
  accessToken: string,
  employeeId: string,
  input: TransferDirectoryEmployeeOfficeInput,
): Promise<TransferDirectoryEmployeeOfficeResponse> {
  return apiRequest<TransferDirectoryEmployeeOfficeResponse>(
    `/admin/employees/${employeeId}/office-transfer`,
    {
      method: "PATCH",
      headers: createAuthorizationHeaders(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function transferOfficeHead(
  accessToken: string,
  employeeId: string,
  input: TransferOfficeHeadInput,
): Promise<TransferOfficeHeadResponse> {
  return apiRequest<TransferOfficeHeadResponse>(
    `/admin/employees/${employeeId}/office-head-transfer`,
    {
      method: "PATCH",
      headers: createAuthorizationHeaders(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function updateDirectoryEmployeeStatus(
  accessToken: string,
  employeeId: string,
  status: DirectoryEmployeeStatus,
): Promise<UpdateDirectoryEmployeeStatusResponse> {
  // Only the protected Super Admin endpoint may change employee status.
  return apiRequest<UpdateDirectoryEmployeeStatusResponse>(
    `/admin/employees/${employeeId}/status`,
    {
      method: "PATCH",

      headers:
        createAuthorizationHeaders(
          accessToken,
        ),

      body: JSON.stringify({
        status,
      }),
    },
  );
}


export function endDirectoryEmployeeEmployment(
  accessToken: string,
  employeeId: string,
  input: EndDirectoryEmployeeEmploymentInput,
): Promise<EndDirectoryEmployeeEmploymentResponse> {
  // Employment exit disables the account and revokes every session.
  return apiRequest<EndDirectoryEmployeeEmploymentResponse>(
    `/admin/employees/${employeeId}/employment-end`,
    {
      method: "PATCH",

      headers:
        createAuthorizationHeaders(
          accessToken,
        ),

      body: JSON.stringify(input),
    },
  );
}


export function archiveDirectoryEmployee(
  accessToken: string,
  employeeId: string,
  input: ArchiveDirectoryEmployeeInput,
): Promise<ArchiveDirectoryEmployeeResponse> {
  // Archiving preserves history while preventing active use.
  return apiRequest<ArchiveDirectoryEmployeeResponse>(
    `/admin/employees/${employeeId}/archive`,
    {
      method: "PATCH",

      headers:
        createAuthorizationHeaders(
          accessToken,
        ),

      body: JSON.stringify(input),
    },
  );
}


export function getDirectoryEmployeeLifecycleHistory(
  accessToken: string,
  employeeId: string,
): Promise<DirectoryLifecycleHistoryResponse> {
  // Lifecycle history is available only through the Super Admin API.
  return apiRequest<DirectoryLifecycleHistoryResponse>(
    `/admin/employees/${employeeId}/lifecycle`,
    {
      headers:
        createAuthorizationHeaders(
          accessToken,
        ),
    },
  );
}

export function listAdminEmployees(accessToken: string, search = '', page = 1, limit = 20) { const q = new URLSearchParams({ page: String(page), limit: String(limit) }); if (search.trim()) q.set('search', search.trim()); return apiRequest(`/admin/employees?${q.toString()}`, { headers: createAuthorizationHeaders(accessToken) }); }
export function getAdminEmployee(accessToken: string, employeeId: string) { return apiRequest(`/admin/employees/${employeeId}`, { headers: createAuthorizationHeaders(accessToken) }); }
export function correctAdminEmployeeIdentity(accessToken: string, employeeId: string, input: { empId?: string; empName?: string; phoneNumber?: string; officialEmail?: string; reason: string }) { return apiRequest(`/admin/employees/${employeeId}/identity`, { method: 'PATCH', headers: createAuthorizationHeaders(accessToken), body: JSON.stringify(input) }); }
export function updateAdminEmployeeDesignation(accessToken: string, employeeId: string, designation: string) { return apiRequest(`/admin/employees/${employeeId}`, { method: 'PATCH', headers: createAuthorizationHeaders(accessToken), body: JSON.stringify({ designation }) }); }
export function getAdminEmployeeIdentityHistory(accessToken: string, employeeId: string) { return apiRequest(`/admin/employees/${employeeId}/identity-corrections`, { headers: createAuthorizationHeaders(accessToken) }); }
