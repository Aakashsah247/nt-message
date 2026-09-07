import type {
  WorkFieldType,
  WorkStageApprovalMode,
  WorkStageAssignmentMode,
} from "./work-type-v3";

export type WorkRuntimeV3Status =
  | "DRAFT"
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING"
  | "BLOCKED"
  | "COMPLETED"
  | "CANCELLED";

export type WorkRuntimeV3StageStatus =
  | "PENDING"
  | "READY"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "SUBMITTED"
  | "RETURNED"
  | "COMPLETED"
  | "SKIPPED"
  | "CANCELLED";

export type WorkRuntimeV3StageAction =
  | "ASSIGN"
  | "START"
  | "BLOCK"
  | "RESUME"
  | "SUBMIT"
  | "APPROVE"
  | "RETURN";

export type WorkRuntimeV3AssignmentTargetType =
  | "ORG_UNIT_QUEUE"
  | "TEAM"
  | "ACCOUNT";

export interface WorkRuntimeV3StageFieldDefinition {
  id: string;
  code: string;
  fieldType: WorkFieldType;
  isRequired: boolean;
  stageDefinitionId: string;
  config: Record<string, unknown> | null;
}

export interface WorkRuntimeV3StageAssignment {
  id: string;
  targetType: WorkRuntimeV3AssignmentTargetType;
  targetOrgUnitId: string | null;
  targetAccountId: string | null;
  assignmentRole: string;
  assignmentReason: string | null;
  startsAt: string;
  targetOrgUnit: {
    id: string;
    code: string;
    name: string;
  } | null;
  targetAccount: {
    id: string;
    employee: {
      empId: string;
      empName: string;
    } | null;
  } | null;
}

export interface WorkRuntimeV3StageSubmissionSummary {
  id: string;
  submissionNumber: number;
  submittedByAccountId: string;
  stageVersion: number;
  note: string | null;
  createdAt: string;
}

export interface WorkRuntimeV3Stage {
  id: string;
  workItemId: string;
  stageDefinitionId: string;
  responsibleOrgUnitId: string;
  code: string;
  name: string;
  sortOrder: number;
  isRequired: boolean;
  assignmentMode: WorkStageAssignmentMode;
  approvalMode: WorkStageApprovalMode;
  approvalLeadershipType: string | null;
  status: WorkRuntimeV3StageStatus;
  version: number;
  blockedFromStatus: WorkRuntimeV3StageStatus | null;
  blockerReason: string | null;
  dueAt: string | null;
  readyAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  blockedAt: string | null;
  workItem: {
    id: string;
    officeId: string;
    ticketNumber: string;
    title: string;
    runtimeStatus: WorkRuntimeV3Status;
    version: number;
    createdByAccountId: string;
    workTypeVersionId: string;
  };
  responsibleOrgUnit: {
    id: string;
    code: string;
    name: string;
    officeId: string;
    isActive: boolean;
  };
  stageDefinition: {
    fields: WorkRuntimeV3StageFieldDefinition[];
  };
  assignments: WorkRuntimeV3StageAssignment[];
  submissions: WorkRuntimeV3StageSubmissionSummary[];
  availableActions: WorkRuntimeV3StageAction[];
}

export interface WorkRuntimeV3CreateFieldDefinition {
  id: string;
  code: string;
  label: string;
  fieldType: WorkFieldType;
  isRequired: boolean;
  config: Record<string, unknown> | null;
}

export interface WorkRuntimeV3CreateWorkType {
  workTypeDefinitionId: string;
  code: string;
  workTypeVersionId: string;
  version: number;
  name: string;
  primaryOwnerOrgUnit: {
    id: string;
    code: string;
    name: string;
  };
  slaBasis: string;
  overallSlaMinutes: number | null;
  fields: WorkRuntimeV3CreateFieldDefinition[];
}

export interface WorkRuntimeV3CreateContext {
  office: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
  };
  workTypes: WorkRuntimeV3CreateWorkType[];
}

export interface CreateWorkRuntimeV3Input {
  clientRequestId: string;
  workTypeVersionId: string;
  title: string;
  description?: string;
  plannedStartAt?: string;
  dueAt?: string;
  fields: WorkRuntimeV3StageFieldInput[];
}

export interface AssignWorkRuntimeV3StageInput {
  expectedStageVersion: number;
  targetType?: WorkRuntimeV3AssignmentTargetType;
  targetOrgUnitId?: string;
  targetAccountId?: string;
  reason?: string;
}

export interface WorkRuntimeV3StageMutationInput {
  expectedStageVersion: number;
}

export interface BlockWorkRuntimeV3StageInput
  extends WorkRuntimeV3StageMutationInput {
  reason: string;
}

export interface WorkRuntimeV3StageFieldInput {
  code: string;
  value: unknown;
}

export interface SubmitWorkRuntimeV3StageInput
  extends WorkRuntimeV3StageMutationInput {
  note?: string;
  fields: WorkRuntimeV3StageFieldInput[];
}

export interface ApproveWorkRuntimeV3StageInput
  extends WorkRuntimeV3StageMutationInput {
  note?: string;
}

export interface ReturnWorkRuntimeV3StageInput
  extends WorkRuntimeV3StageMutationInput {
  reason: string;
}

export type WorkRuntimeV3WorkAction = "COMPLETE" | "CANCEL" | "REOPEN";

export interface CompleteWorkRuntimeV3Input {
  expectedWorkVersion: number;
  note?: string;
}

export interface CancelWorkRuntimeV3Input {
  expectedWorkVersion: number;
  reason: string;
}

export interface ReopenWorkRuntimeV3Input {
  expectedWorkVersion: number;
  stageId: string;
  reason: string;
}

export interface WorkRuntimeV3Participant {
  id: string;
  orgUnitId: string;
  role: string;
  startedAt: string;
  orgUnit: {
    id: string;
    code: string;
    name: string;
  };
}

export interface WorkRuntimeV3WorkStageSummary {
  id: string;
  stageDefinitionId: string;
  responsibleOrgUnitId: string;
  code: string;
  name: string;
  sortOrder: number;
  isRequired: boolean;
  assignmentMode: WorkStageAssignmentMode;
  approvalMode: WorkStageApprovalMode;
  activationMode: string;
  status: WorkRuntimeV3StageStatus;
  version: number;
  dueAt: string | null;
  readyAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  responsibleOrgUnit: {
    id: string;
    code: string;
    name: string;
  };
}

export interface WorkRuntimeV3FieldValue {
  id: string;
  fieldDefinitionId: string;
  value: unknown;
  version: number;
  fieldDefinition: {
    code: string;
    label: string;
    fieldType: WorkFieldType;
  };
}

export interface WorkRuntimeV3Reference {
  id: string;
  referenceType: string;
  value: string;
  normalizedValue: string;
  sourceFieldDefinitionId: string | null;
}

export interface WorkRuntimeV3Event {
  id: string;
  workStageId: string | null;
  actorAccountId: string | null;
  eventType: string;
  fromWorkStatus: WorkRuntimeV3Status | null;
  toWorkStatus: WorkRuntimeV3Status | null;
  fromStageStatus: WorkRuntimeV3StageStatus | null;
  toStageStatus: WorkRuntimeV3StageStatus | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  actor: {
    id: string;
    username: string | null;
    employee: {
      empId: string;
      empName: string;
    } | null;
  } | null;
  workStage: {
    id: string;
    code: string;
    name: string;
  } | null;
}

export interface WorkRuntimeV3Work {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  officeId: string;
  workTypeVersionId: string;
  primaryOwnerOrgUnitId: string;
  runtimeStatus: WorkRuntimeV3Status;
  openedAt: string | null;
  plannedStartAt: string | null;
  dueAt: string;
  version: number;
  createdByAccountId: string;
  createdAt: string;
  updatedAt: string;
  workTypeVersion: {
    id: string;
    version: number;
    name: string;
    workTypeDefinition: {
      id: string;
      code: string;
    };
  };
  primaryOwnerOrgUnit: {
    id: string;
    code: string;
    name: string;
  };
  orgUnitParticipants: WorkRuntimeV3Participant[];
  runtimeStages: WorkRuntimeV3WorkStageSummary[];
  fieldValues: WorkRuntimeV3FieldValue[];
  references: WorkRuntimeV3Reference[];
  events: WorkRuntimeV3Event[];
}
