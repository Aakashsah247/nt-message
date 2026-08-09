import type { AccountRole } from "./auth";

export interface TeamDivisionOption {
  id: string;
  code: string;
  name: string;
}

export interface TeamDepartmentOption {
  id: string;
  divisionId: string;
  code: string;
  name: string;
  division: TeamDivisionOption;
}

export interface TeamManagementContext {
  scope: {
    role: AccountRole;
    type: "BRANCH" | "DIVISION" | "DEPARTMENT";
    division: TeamDivisionOption | null;
    department: Omit<TeamDepartmentOption, "division"> | null;
  };
  divisions: TeamDivisionOption[];
  departments: TeamDepartmentOption[];
}

export interface TeamMemberOption {
  id: string;
  empId: string;
  name: string;
  designation: string | null;
  teamCount: number;
}

export interface TeamMember extends TeamMemberOption {
  isAdmin: boolean;
  addedAt: string;
}

export interface DepartmentTeam {
  id: string;
  name: string;
  department: {
    id: string;
    code: string;
    name: string;
  };
  division: TeamDivisionOption;
  admin: {
    id: string;
    empId: string;
    name: string;
    designation: string | null;
  };
  members: TeamMember[];
  memberCount: number;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentTeamListResponse {
  items: DepartmentTeam[];
  total: number;
}

export interface TeamMemberListResponse {
  department: {
    id: string;
    divisionId: string;
    code: string;
    name: string;
  };
  items: TeamMemberOption[];
  total: number;
}

export interface SaveDepartmentTeamInput {
  departmentId?: string;
  teamName: string;
  memberEmployeeIds: string[];
  adminEmployeeId: string;
}

export interface DepartmentTeamMutationResponse {
  message: string;
  team: DepartmentTeam;
}

export interface DeleteDepartmentTeamResponse {
  message: string;
  archived: boolean;
}
