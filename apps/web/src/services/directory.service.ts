import { apiRequest } from "../lib/api";

import type {
  DirectoryEmployeeDetailResponse,
  DirectoryEmployeeStatus,
  DirectoryListQuery,
  DirectoryListResponse,
  EndDirectoryEmployeeEmploymentInput,
  EndDirectoryEmployeeEmploymentResponse,
  UpdateDirectoryEmployeeStatusResponse,
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

  if (query.role) {
    searchParams.set(
      "role",
      query.role,
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

  if (query.divisionId) {
    searchParams.set(
      "divisionId",
      query.divisionId,
    );
  }

  if (query.departmentId) {
    searchParams.set(
      "departmentId",
      query.departmentId,
    );
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
