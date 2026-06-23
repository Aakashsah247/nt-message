import { apiRequest } from "../lib/api";

import type {
  CreateAdminAccountInput,
  CreateAdminAccountResponse,
  CreateDepartmentInput,
  CreateDepartmentResponse,
  CreateDivisionInput,
  CreateDivisionResponse,
  DepartmentListResponse,
  DivisionListResponse,

} from "../types/admin-account";

function authHeader(
  accessToken: string,
): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export function getAdminDivisions(
  accessToken: string,
): Promise<DivisionListResponse> {
  return apiRequest<DivisionListResponse>(
    "/organization/divisions",
    {
      headers: authHeader(accessToken),
    },
  );
}

export function getAdminDepartments(
  accessToken: string,
): Promise<DepartmentListResponse> {
  return apiRequest<DepartmentListResponse>(
    "/organization/departments",
    {
      headers: authHeader(accessToken),
    },
  );
}

export function createAdminAccount(
  accessToken: string,
  input: CreateAdminAccountInput,
): Promise<CreateAdminAccountResponse> {
  return apiRequest<CreateAdminAccountResponse>(
    "/admin/employees",
    {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}

// Creates a new division using Super Admin permission.
export function createAdminDivision(
  accessToken: string,
  input: CreateDivisionInput,
): Promise<CreateDivisionResponse> {
  return apiRequest<CreateDivisionResponse>(
    "/organization/divisions",
    {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}

// Creates a department inside the selected division.
export function createAdminDepartment(
  accessToken: string,
  input: CreateDepartmentInput,
): Promise<CreateDepartmentResponse> {
  return apiRequest<CreateDepartmentResponse>(
    "/organization/departments",
    {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}
