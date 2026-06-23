import type { AccountRole } from "./auth";

export type AdminCreatableRole =
  Exclude<AccountRole, "SUPER_ADMIN">;

export interface AdminDivision {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface AdminDepartment {
  id: string;
  code: string;
  name: string;
  isActive: boolean;

  division: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
  };
}

export interface DivisionListResponse {
  data: AdminDivision[];
}

export interface DepartmentListResponse {
  data: AdminDepartment[];
}

export interface CreateAdminAccountInput {
  empId: string;
  empName: string;
  phoneNumber: string;
  officialEmail: string;
  designation?: string;
  requestedRole: AdminCreatableRole;
  divisionId: string;
  departmentId: string;
}

export interface CreateAdminAccountResponse {
  message: string;

  employee: {
    id: string;
    empId: string;
    empName: string;
    officialEmail: string;
    isActivated: boolean;
  };

  accountRequest: {
    id: string;
    requestedRole: AdminCreatableRole;
    status: "APPROVED";
  };
}

export interface CreateDivisionInput {
  code: string;
  name: string;
}

export interface CreateDepartmentInput {
  divisionId: string;
  code: string;
  name: string;
}

export interface CreateDivisionResponse {
  message: string;
  division: AdminDivision;
}

export interface CreateDepartmentResponse {
  message: string;
  department: AdminDepartment;
}