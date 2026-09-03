export interface OrganizationOfficeSummary {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  _count: {
    orgUnits: number;
    memberships: number;
  };
}

export interface OrganizationUnitType {
  id: string;
  officeId: string;
  code: string;
  name: string;
  isTeam: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationOfficeDetail extends OrganizationOfficeSummary {
  orgUnitTypes: OrganizationUnitType[];
  _count: OrganizationOfficeSummary["_count"] & {
    leadershipAssignments: number;
  };
}

export interface OrganizationUnitNode {
  id: string;
  officeId: string;
  parentOrgUnitId: string | null;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  orgUnitType: {
    id: string;
    code: string;
    name: string;
    isTeam: boolean;
    isActive: boolean;
  };
  _count: {
    memberships: number;
    childOrgUnits: number;
    leadershipAssignments: number;
  };
  children: OrganizationUnitNode[];
}

export interface OrganizationAvailableActions {
  createChildUnit: boolean;
  renameUnit: boolean;
  moveUnit: boolean;
  changeUnitStatus: boolean;
}

export interface OrganizationActionContext {
  officeId: string;
  orgUnitId: string | null;
  availableActions: OrganizationAvailableActions;
}

export interface OrganizationOfficeListResponse {
  data: OrganizationOfficeSummary[];
}

export interface OrganizationOfficeResponse {
  office: OrganizationOfficeDetail;
}

export interface OrganizationTreeResponse {
  office: Pick<OrganizationOfficeSummary, "id" | "code" | "name" | "isActive">;
  tree: OrganizationUnitNode[];
}

export interface CreateOrganizationUnitInput {
  orgUnitTypeId: string;
  parentOrgUnitId?: string | null;
  code: string;
  name: string;
  sortOrder?: number;
}

export interface UpdateOrganizationUnitInput {
  code?: string;
  name?: string;
  sortOrder?: number;
}

export interface MoveOrganizationUnitInput {
  parentOrgUnitId?: string | null;
  sortOrder?: number;
}

export interface SetOrganizationUnitStatusInput {
  isActive: boolean;
}

export interface OrganizationUnitMutationResponse {
  message: string;
  orgUnit: OrganizationUnitNode;
}
