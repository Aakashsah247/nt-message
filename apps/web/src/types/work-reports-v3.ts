export type WorkReportV3ScopeType =
  | "PERSONAL"
  | "TEAM"
  | "ORG_UNIT"
  | "ORG_UNIT_SUBTREE"
  | "OFFICE";

export type WorkReportV3SlaState = "ON_TRACK" | "DUE_SOON" | "OVERDUE";

export type WorkReportV3RuntimeStatus =
  | "DRAFT"
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING"
  | "BLOCKED"
  | "COMPLETED"
  | "CANCELLED";

export type WorkReportV3StageStatus =
  | "PENDING"
  | "READY"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "SUBMITTED"
  | "RETURNED"
  | "COMPLETED"
  | "SKIPPED"
  | "CANCELLED";

export type WorkReportV3ExportDataset =
  | "OVERVIEW"
  | "WORK_RECORDS"
  | "TECHNICAL_PERFORMANCE"
  | "STAGE_SLA";

export interface WorkReportV3Query {
  from?: string;
  to?: string;
  orgUnitId?: string;
  participantOrgUnitId?: string;
  responsibleOrgUnitId?: string;
  operationalTeamId?: string;
  workTypeId?: string;
  runtimeStatus?: WorkReportV3RuntimeStatus;
  stageStatus?: WorkReportV3StageStatus;
  slaState?: WorkReportV3SlaState;
  search?: string;
}

export interface WorkReportV3RecordsQuery extends WorkReportV3Query {
  page?: number;
  limit?: number;
}

export interface WorkReportV3Context {
  office: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
  };
  scope: {
    type: WorkReportV3ScopeType;
    officeId: string;
    accountId: string;
    orgUnitIds: string[];
    operationalTeamIds: string[];
    availableActions: {
      view: boolean;
      export: boolean;
    };
  };
  filters: {
    orgUnits: Array<{
      id: string;
      code: string;
      name: string;
      isActive: boolean;
    }>;
    operationalTeams: Array<{
      id: string;
      code: string;
      name: string;
      orgUnitId: string;
      isActive: boolean;
      archivedAt: string | null;
    }>;
    workTypes: Array<{
      id: string;
      code: string;
      name: string;
      isActive: boolean;
    }>;
    canFilterByOrgUnit: boolean;
    canFilterByOperationalTeam: boolean;
  };
}

export interface WorkReportV3Overview {
  generatedAt: string;
  totalWork: number;
  statuses: Record<WorkReportV3RuntimeStatus, number>;
  sla: {
    overdue: number;
    dueSoon: number;
  };
  organizationPerformance: Array<{
    orgUnit: { id: string; code: string; name: string };
    primaryOwnerWork: number;
    participantWork: number;
    responsibleStages: number;
    completedWork: number;
    overdueWork: number;
  }>;
  teamExecution: Array<{
    operationalTeam: { id: string; code: string; name: string; orgUnitId: string };
    workCount: number;
  }>;
}

export interface WorkReportV3WorkRecord {
  id: string;
  ticketNumber: string;
  workType: { id: string; code: string; name: string };
  primaryOwner: { id: string; code: string; name: string };
  executionTeams: Array<{ id: string; code: string; name: string }>;
  reference: {
    display: string | null;
    items: Array<{ type: string; value: string }>;
  };
  date: string;
  status: WorkReportV3RuntimeStatus;
  availableActions: { view: true };
}

export interface WorkReportV3WorkRecords {
  generatedAt: string;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  items: WorkReportV3WorkRecord[];
}

export interface WorkReportV3TechnicalPerformanceCounts {
  tickets: number;
  completed: number;
  pending: number;
}

export interface WorkReportV3TechnicalPerformanceRow {
  date: string;
  orgUnit: { id: string; code: string; name: string };
  operationalTeam: { id: string; code: string; name: string } | null;
  supportStaff: Array<{
    accountId: string;
    name: string;
    employeeId: string | null;
  }>;
  otherStaff: Array<{
    accountId: string;
    name: string;
    employeeId: string | null;
  }>;
  references: string[];
  workTypes: Record<string, WorkReportV3TechnicalPerformanceCounts>;
  total: WorkReportV3TechnicalPerformanceCounts;
}

export interface WorkReportV3TechnicalPerformance {
  generatedAt: string;
  rows: WorkReportV3TechnicalPerformanceRow[];
  totals: {
    workTypes: Record<string, WorkReportV3TechnicalPerformanceCounts>;
    total: WorkReportV3TechnicalPerformanceCounts;
  };
}

export interface WorkReportV3StageAnalysisRow {
  id: string;
  workItem: {
    id: string;
    ticketNumber: string;
    status: WorkReportV3RuntimeStatus;
    dueAt: string;
    workSlaState: WorkReportV3SlaState;
  };
  stage: {
    code: string;
    name: string;
    status: WorkReportV3StageStatus;
    responsibleOrgUnit: { id: string; code: string; name: string };
    operationalTeams: Array<{ id: string; code: string; name: string }>;
    dueAt: string | null;
    slaMinutes: number | null;
    slaState: WorkReportV3SlaState;
    blockerReason: string | null;
    readyAt: string | null;
    startedAt: string | null;
    submittedAt: string | null;
    completedAt: string | null;
  };
  durations: {
    elapsedMinutes: number;
    activeMinutes: number;
    waitingMinutes: number;
    blockedMinutes: number;
  };
}

export interface WorkReportV3StageAnalysis {
  generatedAt: string;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  summary: Array<{
    orgUnit: { id: string; code: string; name: string };
    stageCount: number;
    completedStages: number;
    waitingStages: number;
    blockedStages: number;
    overdueStages: number;
  }>;
  items: WorkReportV3StageAnalysisRow[];
}

export interface WorkReportV3PrintPayload {
  dataset: WorkReportV3ExportDataset;
  generatedAt: string;
  office: { id: string; code: string; name: string };
  period: { from: string | null; to: string | null };
  rowCount: number;
  content:
    | WorkReportV3Overview
    | WorkReportV3WorkRecord[]
    | WorkReportV3TechnicalPerformance
    | WorkReportV3StageAnalysisRow[];
}

export interface WorkReportV3DutyCompatibility {
  generatedAt: string;
  mode: "LEGACY_COMPATIBILITY";
  migrationPhase: 11;
  message: string;
  dataRoute: "/work-reports/drilldown";
  csvRoute: "/work-reports/export";
  dataset: "DUTY_ASSIGNMENTS";
}

export interface WorkReportLegacyDutyQuery {
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface WorkReportLegacyDutyRow {
  kind: "DUTY_ASSIGNMENT";
  id: string;
  dutyDate: string;
  startsAt: string;
  endsAt: string;
  employee: string;
  employeeId: string | null;
  employeeRole: string;
  shift: string;
  division: { id: string; code: string; name: string };
  department: { id: string; code: string; name: string } | null;
  reportingLocation: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export interface WorkReportLegacyDutyResponse {
  dataset: "DUTY_ASSIGNMENTS";
  generatedAt: string;
  timezone: "Asia/Kathmandu";
  scope: {
    role: string;
    type: string;
    label: string;
    divisionId: string | null;
    departmentId: string | null;
  };
  period: {
    from: string;
    to: string;
    days: number;
  };
  dutySummary: {
    scheduled: number;
    cancelled: number;
    uniqueEmployees: number;
    leaveDays: number;
  } | null;
  sections: {
    duty: {
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasPrevious: boolean;
        hasNext: boolean;
      };
      rows: WorkReportLegacyDutyRow[];
    } | null;
  };
  notice: string;
}
