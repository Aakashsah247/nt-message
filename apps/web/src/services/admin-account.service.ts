import { apiRequest } from "../lib/api";

import type {
  CreateAdminAccountInput,
  CreateAdminAccountResponse,
  CreateDepartmentInput,
  CreateDepartmentResponse,
  CreateDivisionInput,
  CreateDivisionResponse,
  DeleteDepartmentResponse,
  DeleteDivisionResponse,
  DepartmentListResponse,
  DivisionListResponse,
  UpdateDepartmentInput,
  UpdateDepartmentResponse,
  UpdateDivisionInput,
  UpdateDivisionResponse,
} from "../types/admin-account";

function authHeader(
  accessToken: string,
): HeadersInit {
  return {
    Authorization:
      `Bearer ${accessToken}`,
  };
}

export function getAdminDivisions(
  accessToken: string,
): Promise<DivisionListResponse> {
  return apiRequest<DivisionListResponse>(
    "/organization/divisions",
    {
      headers:
        authHeader(accessToken),
    },
  );
}

export function getAdminDepartments(
  accessToken: string,
): Promise<DepartmentListResponse> {
  return apiRequest<DepartmentListResponse>(
    "/organization/departments",
    {
      headers:
        authHeader(accessToken),
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

      headers:
        authHeader(accessToken),

      body:
        JSON.stringify(input),
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

      headers:
        authHeader(accessToken),

      body:
        JSON.stringify(input),
    },
  );
}

// Updates a division without changing its database identity.
export function updateAdminDivision(
  accessToken: string,
  divisionId: string,
  input: UpdateDivisionInput,
): Promise<UpdateDivisionResponse> {
  return apiRequest<UpdateDivisionResponse>(
    `/organization/divisions/${divisionId}`,
    {
      method: "PATCH",

      headers:
        authHeader(accessToken),

      body:
        JSON.stringify(input),
    },
  );
}

// Permanent deletion is allowed only for an unused division.
export function deleteAdminDivision(
  accessToken: string,
  divisionId: string,
): Promise<DeleteDivisionResponse> {
  return apiRequest<DeleteDivisionResponse>(
    `/organization/divisions/${divisionId}`,
    {
      method: "DELETE",

      headers:
        authHeader(accessToken),
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

      headers:
        authHeader(accessToken),

      body:
        JSON.stringify(input),
    },
  );
}

// Updates department details while the backend checks dependencies.
export function updateAdminDepartment(
  accessToken: string,
  departmentId: string,
  input: UpdateDepartmentInput,
): Promise<UpdateDepartmentResponse> {
  return apiRequest<UpdateDepartmentResponse>(
    `/organization/departments/${departmentId}`,
    {
      method: "PATCH",

      headers:
        authHeader(accessToken),

      body:
        JSON.stringify(input),
    },
  );
}

// Permanent deletion is allowed only for an unused department.
export function deleteAdminDepartment(
  accessToken: string,
  departmentId: string,
): Promise<DeleteDepartmentResponse> {
  return apiRequest<DeleteDepartmentResponse>(
    `/organization/departments/${departmentId}`,
    {
      method: "DELETE",

      headers:
        authHeader(accessToken),
    },
  );
}
