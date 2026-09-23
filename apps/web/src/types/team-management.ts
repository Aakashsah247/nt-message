export interface OperationalTeamOrgUnitOption {
  id: string;
  officeId: string;
  code: string;
  name: string;
  parentOrgUnitId: string | null;
  orgUnitType: { code: string; name: string };
  office: { id: string; code: string; name: string };
}

export interface TeamManagementContext {
  scope: {
    officeIds: string[];
    officeHeadOfficeIds: string[];
    headedOrgUnitIds: string[];
  };
  orgUnits: OperationalTeamOrgUnitOption[];
}

export interface OperationalTeamEmployee {
  id: string;
  empId: string;
  empName?: string;
  name?: string;
  designation: string | null;
}

export interface OperationalTeam {
  id: string;
  orgUnitId: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  office: { id: string; code: string; name: string };
  orgUnit: { id: string; code: string; name: string };
  lead: {
    assignmentId: string;
    isActing: boolean;
    effectiveFrom: string;
    employee: OperationalTeamEmployee;
  } | null;
  members: Array<{
    membershipId: string;
    startsAt: string;
    employee: OperationalTeamEmployee;
  }>;
}

export interface OperationalTeamListResponse {
  data: OperationalTeam[];
  total: number;
}

export interface OperationalTeamMemberOption {
  id: string;
  empId: string;
  name: string;
  designation: string | null;
  teamCount: number;
}

export interface OperationalTeamMemberListResponse {
  orgUnit: { id: string; code: string; name: string };
  data: OperationalTeamMemberOption[];
  total: number;
}

export interface SaveOperationalTeamInput {
  orgUnitId?: string;
  name: string;
  memberEmployeeIds: string[];
  leadEmployeeId: string;
}

export interface OperationalTeamMutationResponse {
  message: string;
  team: OperationalTeam;
}
