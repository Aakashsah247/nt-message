export type WorkTypeNavigationMode = "NONE" | "VIEW" | "DRAFT" | "PUBLISH";

export type WorkTypeVersionStatus = "DRAFT" | "PUBLISHED" | "RETIRED";

export type WorkTypeTemplate = "STANDARD" | "TEAM_SALES" | "ADMINISTRATIVE";

export type WorkTypeCreatorCategory =
  | "OFFICE_HEAD"
  | "ORG_UNIT_HEAD"
  | "TEAM_LEAD"
  | "EMPLOYEE";

export type WorkTypeCreatorScope =
  | "OFFICE_WIDE"
  | "PRIMARY_OWNER_SUBTREE"
  | "SPECIFIC_ORG_UNITS";

export type WorkFieldType =
  | "TEXT"
  | "LONG_TEXT"
  | "NUMBER"
  | "DECIMAL"
  | "DATE"
  | "DATETIME"
  | "BOOLEAN"
  | "SELECT"
  | "MULTI_SELECT"
  | "USER"
  | "ORG_UNIT"
  | "REFERENCE"
  | "IMAGE"
  | "FILE";

export type WorkFinalClosureMode =
  | "AUTO_AFTER_REQUIRED_STAGES"
  | "PRIMARY_OWNER_HEAD"
  | "SPECIFIC_LEADERSHIP"
  | "OFFICE_HEAD";

export type WorkSlaBasis =
  | "CALENDAR_DURATION"
  | "OFFICE_WORKING_DURATION";

export type WorkLeadershipType =
  | "OFFICE_HEAD"
  | "ORG_UNIT_HEAD"
  | "TEAM_LEAD"
  | "DEPUTY";

export interface WorkTypeOfficeSummary {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface WorkTypeActions {
  view: boolean;
  draft: boolean;
  publish: boolean;
}

export interface WorkTypeActionContextResponse {
  office: WorkTypeOfficeSummary;
  availableActions: WorkTypeActions;
}

export interface WorkTypeVersionSummary {
  id: string;
  workTypeDefinitionId?: string;
  version: number;
  status: WorkTypeVersionStatus;
  name: string;
  description: string | null;
  template: WorkTypeTemplate;
  changeReason: string | null;
  createdByAccountId?: string | null;
  publishedByAccountId?: string | null;
  retiredByAccountId?: string | null;
  publishedAt: string | null;
  retiredAt?: string | null;
  createdAt: string;
  updatedAt: string;
  salesDisplayLabel: string | null;
}

export interface WorkTypeDefinitionListItem {
  id: string;
  officeId: string;
  code: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  currentPublishedVersion: WorkTypeVersionSummary | null;
  currentDraftVersion: WorkTypeVersionSummary | null;
}


export interface WorkTypeConfigurationOrgUnit {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  parentOrgUnitId: string | null;
  orgUnitType: {
    code: string;
    name: string;
    isTeam: boolean;
  };
}

export interface WorkTypeConfigurationCreatorAccount {
  accountId: string;
  username: string | null;
  role: string;
  employeeId: string;
  empId: string;
  empName: string;
  designation: string | null;
  primaryOrgUnitId: string | null;
}

export interface WorkTypeConfigurationContextResponse {
  office: WorkTypeOfficeSummary;
  orgUnits: WorkTypeConfigurationOrgUnit[];
  creatorAccounts: WorkTypeConfigurationCreatorAccount[];
  officeWideManagement: boolean;
  manageableDivisionOrgUnitIds: string[];
}

export interface WorkTypeListResponse {
  office: WorkTypeOfficeSummary;
  data: WorkTypeDefinitionListItem[];
}

export interface WorkTypeCreatorOrgUnit {
  id: string;
  orgUnitId: string;
  includeDescendants: boolean;
}

export interface WorkTypeCreatorAccount {
  id: string;
  accountId: string;
}

export interface WorkTypeFieldDefinition {
  id: string;
  code: string;
  label: string;
  fieldType: WorkFieldType;
  isRequired: boolean;
  sortOrder: number;
  config: Record<string, unknown> | null;
}

export interface WorkTypeVersionDetail extends WorkTypeVersionSummary {
  primaryOwnerOrgUnitId: string | null;
  creatorCategories: WorkTypeCreatorCategory[];
  creatorScope: WorkTypeCreatorScope;
  finalClosureMode: WorkFinalClosureMode;
  finalClosureLeadershipType: WorkLeadershipType | null;
  slaBasis: WorkSlaBasis;
  overallSlaMinutes: number | null;
  creatorOrgUnits: WorkTypeCreatorOrgUnit[];
  creatorAccounts: WorkTypeCreatorAccount[];
  fields: WorkTypeFieldDefinition[];
  createdBy?: { id: string; username: string } | null;
  publishedBy?: { id: string; username: string } | null;
  retiredBy?: { id: string; username: string } | null;
}

export interface WorkTypeDefinitionDetail {
  id: string;
  officeId: string;
  code: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  versions: WorkTypeVersionDetail[];
}

export interface WorkTypeDetailResponse {
  office: WorkTypeOfficeSummary;
  workType: WorkTypeDefinitionDetail;
}

export interface CreateWorkTypeDraftInput {
  changeReason?: string | null;
}

export interface UpdateWorkTypeDraftInput {
  name?: string;
  description?: string | null;
  changeReason?: string | null;
}

export interface WorkTypeCreatorOrgUnitInput {
  orgUnitId: string;
  includeDescendants?: boolean;
}

export interface WorkTypeCreatorAccountInput {
  accountId: string;
}

export interface WorkTypeFieldDefinitionInput {
  code: string;
  label: string;
  fieldType: WorkFieldType;
  isRequired?: boolean;
  sortOrder?: number;
  config?: Record<string, unknown>;
}

export interface ReplaceWorkTypeConfigurationInput {
  template: WorkTypeTemplate;
  salesDisplayLabel?: string | null;
  primaryOwnerOrgUnitId?: string | null;
  creatorCategories: WorkTypeCreatorCategory[];
  creatorScope: WorkTypeCreatorScope;
  creatorOrgUnits: WorkTypeCreatorOrgUnitInput[];
  creatorAccounts: WorkTypeCreatorAccountInput[];
  finalClosureMode: WorkFinalClosureMode;
  finalClosureLeadershipType?: WorkLeadershipType | null;
  slaBasis: WorkSlaBasis;
  overallSlaMinutes?: number | null;
  fields: WorkTypeFieldDefinitionInput[];
}

export interface WorkTypeDraftMutationResponse {
  office: WorkTypeOfficeSummary;
  draft: WorkTypeVersionDetail | WorkTypeVersionSummary;
}

export interface WorkTypeDiscardDraftResponse {
  office: WorkTypeOfficeSummary;
  discardedDraft: { id: string; version: number };
}

export interface WorkTypePublishResponse {
  office: WorkTypeOfficeSummary;
  publishedVersion: WorkTypeVersionSummary;
}

export interface CreateWorkTypeDefinitionInput {
  template: WorkTypeTemplate;
  name: string;
  description?: string | null;
}

export interface WorkTypeDefinitionMutationResponse {
  office: WorkTypeOfficeSummary;
  definition?: WorkTypeDefinitionListItem;
  draft?: WorkTypeVersionSummary;
  removedWorkType?: { id: string };
  restoredWorkType?: { id: string };
  permanentlyDeletedWorkType?: { id: string };
  message?: string;
}
