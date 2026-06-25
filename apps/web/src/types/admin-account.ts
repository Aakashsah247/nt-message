import type { AccountRole } from "./auth";

export type AdminCreatableRole =
  Exclude<AccountRole, "SUPER_ADMIN">;

export interface OrganizationDependencyCount {
  employees: number;
  accountRequests: number;
  managementPositions: number;
}

export interface AdminDivision {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;

  _count: OrganizationDependencyCount & {
    departments: number;
  };
}

export interface AdminDepartment {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;

  division: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
  };

  _count: OrganizationDependencyCount;
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
  departmentId?: string;
  managementPositionId?: string;
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

export interface UpdateDivisionInput {
  code?: string;
  name?: string;
  isActive?: boolean;
}

export interface UpdateDepartmentInput {
  divisionId?: string;
  code?: string;
  name?: string;
  isActive?: boolean;
}

export interface CreateDivisionResponse {
  message: string;
  division: AdminDivision;
}

export interface CreateDepartmentResponse {
  message: string;
  department: AdminDepartment;
}

export interface UpdateDivisionResponse {
  message: string;
  division: AdminDivision;
}

export interface UpdateDepartmentResponse {
  message: string;
  department: AdminDepartment;
}

export interface DeleteDivisionResponse {
  message: string;

  deletedDivision: {
    id: string;
    code: string;
    name: string;
  };
}

export interface DeleteDepartmentResponse {
  message: string;

  deletedDepartment: {
    id: string;
    code: string;
    name: string;

    division: {
      id: string;
      code: string;
      name: string;
    };
  };
}
