import type { WorkItemStatus } from "./work-management";

export type WorkReportScopeType =
  | "PERSONAL"
  | "TEAM"
  | "ORG_UNIT"
  | "ORG_UNIT_SUBTREE"
  | "OFFICE";

export type WorkReportSlaState = "ON_TRACK" | "DUE_SOON" | "OVERDUE";
export type WorkReportStatus = WorkItemStatus;
export type WorkReportExportDataset =
  | "OVERVIEW"
  | "WORK_RECORDS"
  | "TECHNICAL_PERFORMANCE"
  | "DUTY_ASSIGNMENTS";

export interface WorkReportQuery {
  from?: string;
  to?: string;
  orgUnitId?: string;
  operationalTeamId?: string;
  workTypeId?: string;
  status?: WorkReportStatus;
  slaState?: WorkReportSlaState;
  search?: string;
}

export interface WorkReportRecordsQuery extends WorkReportQuery {
  page?: number;
  limit?: number;
}

export interface WorkReportContext {
  office: { id: string; code: string; name: string; isActive: boolean };
  scope: {
    type: WorkReportScopeType;
    officeId: string;
    accountId: string;
    orgUnitIds: string[];
    operationalTeamIds: string[];
    availableActions: { view: boolean; export: boolean };
  };
  filters: {
    orgUnits: Array<{ id: string; code: string; name: string; isActive: boolean }>;
    operationalTeams: Array<{
      id: string;
      code: string;
      name: string;
      orgUnitId: string;
      isActive: boolean;
      archivedAt: string | null;
    }>;
    workTypes: Array<{ id: string; code: string; name: string; isActive: boolean }>;
    canFilterByOrgUnit: boolean;
    canFilterByOperationalTeam: boolean;
  };
}

export interface WorkReportOverview {
  generatedAt: string;
  period: {
    from: string;
    to: string;
    days: number;
  };
  totalWork: number;
  statuses: Record<WorkReportStatus, number>;
  sla: {
    overdue: number;
    dueSoon: number;
  };
  work: {
    totals: {
      activeAtEnd: number;
      completionRate: number | null;
    };
  };
  workflow: {
    newWork: number;
    inProgress: number;
    waitingForSales: number;
    waitingForApproval: number;
    returnedForCorrection: number;
    overdue: number;
    completedDuring: number;
  };
  teams: Array<{
    teamId: string;
    name: string;
    orgUnitId: string;
    orgUnitName: string;
    activeWork: number;
    newWork: number;
    inProgress: number;
    waitingForSales: number;
    waitingForApproval: number;
    returnedForCorrection: number;
    overdueWork: number;
    completedDuring: number;
  }>;
  trend: Array<{
    date: string;
    workCreated: number;
    workClosed: number;
  }>;
  workTypeOptions: Array<{
    id: string;
    versionId: string;
    code: string;
    name: string;
    template: string;
    isActive: boolean;
  }>;
}

export interface WorkReportWorkRecord {
  id: string;
  ticketNumber: string;
  workType: { id: string; code: string; name: string };
  primaryOwner: { id: string; code: string; name: string };
  executionTeams: Array<{ id: string; code: string; name: string }>;
  reference: { display: string | null; items: Array<{ type: string; value: string }> };
  date: string;
  status: WorkReportStatus;
  availableActions: { view: true };
}

export interface WorkReportWorkRecords {
  generatedAt: string;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  items: WorkReportWorkRecord[];
}

export interface WorkReportTechnicalPerformanceCounts {
  tickets: number;
  completed: number;
  pending: number;
}

export interface WorkReportTechnicalPerformanceRow {
  date: string;
  orgUnit: { id: string; code: string; name: string };
  operationalTeam: { id: string; code: string; name: string } | null;
  supportStaff: Array<{ accountId: string; name: string; employeeId: string | null }>;
  otherStaff: Array<{ accountId: string; name: string; employeeId: string | null }>;
  references: string[];
  workTypes: Record<string, WorkReportTechnicalPerformanceCounts>;
  total: WorkReportTechnicalPerformanceCounts;
}

export interface WorkReportTechnicalPerformance {
  generatedAt: string;
  rows: WorkReportTechnicalPerformanceRow[];
  totals: {
    workTypes: Record<string, WorkReportTechnicalPerformanceCounts>;
    total: WorkReportTechnicalPerformanceCounts;
  };
}

export interface WorkReportPrintPayload {
  dataset: WorkReportExportDataset;
  generatedAt: string;
  office: { id: string; code: string; name: string };
  period: { from: string | null; to: string | null };
  rowCount: number;
  content: WorkReportOverview | WorkReportWorkRecord[] | WorkReportTechnicalPerformance | WorkReportLegacyDutyResponse;
}

export interface WorkReportDutyCompatibility {
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
  officeId?: string;
  orgUnitId?: string;
  operationalTeamId?: string;
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
  designation: string | null;
  shift: string;
  orgUnit: { id: string; code: string; name: string } | null;
  operationalTeam: { id: string; code: string; name: string } | null;
  supervisor: string;
  supervisorEmployeeId: string | null;
  reportingLocation: string;
  notes: string | null;
  status: "Scheduled" | "On Duty" | "Past Schedule" | "Cancelled";
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export interface WorkReportLegacyDutyResponse {
  dataset: "DUTY_ASSIGNMENT" | "DUTY_ASSIGNMENTS";
  generatedAt: string;
  timezone: "Asia/Kathmandu";
  scope: { role: string; type: string; label: string };
  period: { from: string; to: string; days: number };
  dutySummary: { scheduled: number; cancelled: number; uniqueEmployees: number; leaveDays: number } | null;
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
