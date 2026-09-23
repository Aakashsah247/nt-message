export type WorkItemType =
  | "ROUTINE_TASK"
  | "TROUBLE_TICKET"
  | "MAINTENANCE"
  | "NEW_CONNECTION"
  | "UPDATE_SERVICES"
  | "INSPECTION"
  | "EMERGENCY_WORK"
  | "ADMINISTRATIVE_TASK";

export type WorkServiceType = "DATA" | "VOICE" | "IPTV" | "SIP" | "OTHER";
export type WorkContactType = "MOBILE" | "TELEPHONE";
export type DepartmentWorkFunction = "GENERAL" | "FIELD_OPERATIONS" | "SALES" | "SUPPORT";
export type WorkQueueView = "ACTIVE" | "HISTORY" | "ARCHIVE" | "DELETION_REVIEW";
export type WorkQueueFocus =
  | "TEAM_QUEUE"
  | "ACTION_CENTER"
  | "ASSIGNED_TO_ME"
  | "CREATED_BY_ME"
  | "AWAITING_MY_REVIEW"
  | "EXCEPTIONS"
  | "EXPLORER";
export type WorkItemStatus =
  | "ASSIGNED"
  | "ACKNOWLEDGED"
  | "IN_PROGRESS"
  | "HELP_REQUESTED"
  | "COMPLETED_PENDING_REVIEW"
  | "CLOSED"
  | "REOPENED"
  | "BLOCKED"
  | "CANCELLED";
export type WorkAssignmentRole = "PRIMARY" | "SUPPORTING";
export type WorkCompletionResult = "FULLY_RESOLVED" | "TEMPORARY_SOLUTION" | "UNABLE_TO_RESOLVE";
export type WorkCompletionReviewStatus = "PENDING_REVIEW" | "INFORMATION_REQUESTED" | "ACCEPTED" | "REJECTED";
export type WorkHelpReason = "NEED_ANOTHER_EMPLOYEE" | "TECHNICAL_GUIDANCE" | "TOOLS_OR_MATERIALS" | "FAP_MAINTENANCE" | "SAFETY_CONCERN" | "OTHER";
export type WorkHelpMaterialType = "STB" | "CPE" | "DROP_FIBER";
export type WorkHelpRequestStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
export type WorkActivityAction =
  | "CREATED" | "ASSIGNED" | "TEAM_ASSIGNED" | "SALES_MEMBER_ASSIGNED"
  | "ACKNOWLEDGED" | "STARTED" | "STATUS_CHANGED" | "REASSIGNED"
  | "SUPPORT_ADDED" | "SUPPORT_REMOVED" | "HELP_REQUESTED" | "HELP_ACCEPTED"
  | "HELP_DECLINED" | "COMPLETION_SUBMITTED" | "INFORMATION_REQUESTED" | "CLOSED"
  | "REOPENED" | "CANCELLED" | "DETAILS_UPDATED" | "DUE_DATE_CHANGED"
  | "RETENTION_HOLD_APPLIED" | "RETENTION_HOLD_RELEASED" | "DELETION_REVIEW_REQUESTED"
  | "DELETION_REVIEW_CANCELLED" | "DELEGATED";
export type WorkSalesCoordinationStatus = "WAITING_FOR_DOCUMENTS" | "READY_FOR_SALES" | "COMPLETED";
export type WorkManagementScopeType = "ORGANIZATION" | "DIVISION" | "DEPARTMENT";
export type WorkloadLevel = "AVAILABLE" | "MODERATE" | "BUSY" | "OVERLOADED";

export interface WorkEmployeeSummary {
  id: string;
  empId: string;
  empName: string;
  designation: string | null;
  divisionId: string | null;
  departmentId: string | null;
}

export interface WorkAccountSummary {
  id: string;
  role: "SUPER_ADMIN" | "SENIOR_MANAGEMENT" | "TEAM_MANAGER" | "EMPLOYEE";
  username: string | null;
  employee: WorkEmployeeSummary | null;
  superAdminProfile?: { fullName: string } | null;
}

export interface WorkOrganizationSummary { id: string; code: string; name: string; }
export interface WorkOrganizationMetrics {
  active: number; newWork: number; inProgress: number; waitingForSales: number;
  waitingForApproval: number; overdue: number; completedToday: number;
}
export interface WorkOrganizationTeamOverview {
  id: string; departmentId: string; name: string; memberCount: number; totals: WorkOrganizationMetrics;
}
export interface WorkOrganizationDepartmentOverview extends WorkOrganizationSummary {
  divisionId: string; workFunction: DepartmentWorkFunction; totals: WorkOrganizationMetrics; teams: WorkOrganizationTeamOverview[];
}
export interface WorkOrganizationDivisionOverview extends WorkOrganizationSummary {
  totals: WorkOrganizationMetrics; departments: WorkOrganizationDepartmentOverview[];
}
export interface WorkManagementOrganizationSummaryResponse {
  timezone: "Asia/Kathmandu";
  generatedAt: string;
  scope: { role: WorkAccountSummary["role"]; type: WorkManagementScopeType; divisionId: string | null; departmentId: string | null; };
  organization: { divisionCount: number; departmentCount: number; teamCount: number; };
  totals: WorkOrganizationMetrics;
  divisions: WorkOrganizationDivisionOverview[];
}
export interface WorkDepartmentOption extends WorkOrganizationSummary {
  divisionId: string;
  workFunction: DepartmentWorkFunction;
  division: WorkOrganizationSummary;
  ancestorOrgUnitIds: string[];
}
export interface WorkTeamSummary {
  id: string; name: string; departmentId: string; isActive: boolean; archivedAt: string | null;
  teamAdmin: { id: string; empId: string; empName: string; designation: string | null; account: WorkAccountSummary | null; };
  _count: { members: number };
  members?: Array<{ id: string; employee: { id: string; empId: string; empName: string; designation: string | null; account: WorkAccountSummary | null; }; }>;
}
export interface WorkAssignment {
  id: string; assignmentRole: WorkAssignmentRole; acknowledgedAt: string | null; startedAt: string | null; createdAt: string;
  assignee: WorkAccountSummary; assignedBy: WorkAccountSummary;
}
export interface WorkDynamicFieldDefinition {
  id: string;
  code: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  sortOrder: number;
  stageDefinitionId: string | null;
  config: Record<string, unknown> | null;
}
export interface WorkDynamicFieldValue {
  id: string;
  value: unknown;
  fieldDefinition: WorkDynamicFieldDefinition;
}
export interface WorkCompletionEvidence { id: string; originalFileName: string; mimeType: string; fileSizeBytes: number; expiresAt: string | null; expiredAt: string | null; purgedAt: string | null; createdAt: string; }
export interface WorkCompletionReport {
  id: string; result: WorkCompletionResult; summary: string; cpcSerial: string | null; serviceNumber: string | null;
  customerId: string | null; rxLevelDbm: number | null; olt: string | null; fdcName: string | null; fapName: string | null;
  moreWorkRequired: boolean; fieldValuesSnapshot: Array<{ code: string; value: unknown }> | null; reviewStatus: WorkCompletionReviewStatus; managerNote: string | null; reviewedAt: string | null;
  createdAt: string; updatedAt: string; submittedBy: WorkAccountSummary; reviewedBy: WorkAccountSummary | null; evidence: WorkCompletionEvidence[];
}
export interface WorkHelpRequest {
  id: string; workItemId: string; reason: WorkHelpReason; materialType?: WorkHelpMaterialType | null; note: string | null; status: WorkHelpRequestStatus;
  previousStatus: WorkItemStatus; responseNote: string | null; respondedAt: string | null; createdAt: string; updatedAt: string;
  requestedBy: WorkAccountSummary; requestedHelper: WorkAccountSummary | null;
  requestedDepartment?: { id: string; divisionId: string; code: string; name: string } | null;
  respondedBy: WorkAccountSummary | null; coordinatedBy?: WorkAccountSummary | null; coordinatedAt?: string | null;
  workItem?: Pick<WorkItem, "id" | "ticketNumber" | "title" | "status" | "dueAt"> & { responsibleManagerAccountId: string };
}
export interface WorkDelegationProgress { total: number; completed: number; inProgress: number; awaitingReview: number; notStarted: number; cancelled: number; completionPercentage: number; }
export interface WorkDelegatedMemberProgress {
  id: string; parentWorkItemId: string | null; depth: number; ticketNumber: string; title: string; instructions: string | null;
  status: WorkItemStatus; dueAt: string; createdAt: string; completedAt: string | null; closedAt: string | null; cancelledAt: string | null;
  primaryAssignee: WorkAccountSummary | null; assignedBy: WorkAccountSummary | null; latestProgressSummary: string | null; isOverdue: boolean;
}
export interface WorkDelegatedTracking extends WorkDelegationProgress { overdue: number; members: WorkDelegatedMemberProgress[]; }
export interface WorkSalesMessageAttachment { id: string; originalFileName: string; mimeType: string; fileSizeBytes: number; expiresAt: string | null; expiredAt: string | null; purgedAt: string | null; createdAt: string; }
export interface WorkSalesMessage {
  id: string; workItemId: string; senderAccountId: string; senderName: string; senderRole: WorkAccountSummary["role"];
  senderDesignation: string | null; text: string | null; attachments: WorkSalesMessageAttachment[]; createdAt: string;
}
export interface WorkItem {
  id: string; ticketNumber: string; type: WorkItemType; title: string; description: string; category: string | null;
  customerName: string | null; customerContactType: WorkContactType | null; customerContactNumber: string | null;
  serviceTypes: WorkServiceType[]; otherServiceText: string | null; requestNumber: string | null; cpcSerial: string | null;
  serviceNumber: string | null; olt: string | null; fdcName: string | null; fapName: string | null; status: WorkItemStatus;
  divisionId: string; departmentId: string | null; parentWorkItemId: string | null; assignedTeamId: string | null;
  salesMemberAccountId: string | null; salesCoordinationStatus: WorkSalesCoordinationStatus | null;
  salesDocumentsSentAt: string | null; salesCompletedAt: string | null; salesCompletionNote: string | null; locationText: string | null;
  registeredAt: string; plannedStartAt: string | null; dueAt: string; completedAt: string | null; closedAt: string | null; cancelledAt: string | null;
  archiveEligibleAt: string | null; deletionEligibleAt: string | null; retentionHoldAt: string | null; retentionHoldReason: string | null;
  deletionRequestedAt: string | null; deletionRequestReason: string | null; version: number; createdAt: string; updatedAt: string;
  division: WorkOrganizationSummary; department: WorkOrganizationSummary | null; assignedTeam: WorkTeamSummary | null; salesMember: WorkAccountSummary | null;
  createdBy: WorkAccountSummary; responsibleManager: WorkAccountSummary; retentionHoldBy: WorkAccountSummary | null; deletionRequestedBy: WorkAccountSummary | null;
  assignments: WorkAssignment[]; completionReports?: WorkCompletionReport[]; helpRequests?: WorkHelpRequest[];
  workTypeVersion?: { id: string; version: number; name: string; template: string | null; code: string; salesDisplayLabel?: string | null; fields: WorkDynamicFieldDefinition[] };
  fieldValues?: WorkDynamicFieldValue[];
  parentWorkItem?: WorkLinkedItem | null; childWorkItems?: WorkLinkedItem[]; delegationProgress?: WorkDelegationProgress; delegatedWork?: WorkDelegatedTracking;
}
export interface WorkLinkedItem { id: string; ticketNumber: string; title: string; status: WorkItemStatus; dueAt: string; }
export interface WorkActivity { id: string; action: WorkActivityAction; fromStatus: WorkItemStatus | null; toStatus: WorkItemStatus | null; details: Record<string, unknown> | null; createdAt: string; actor: WorkAccountSummary | null; }
export interface WorkPagination { page: number; limit: number; total: number; totalPages: number; }
export interface WorkListFilters {
  view: WorkQueueView; focus: WorkQueueFocus; status: WorkItemStatus | null; type: WorkItemType | null; search: string | null; category: string | null;
  divisionId: string | null; departmentId: string | null; assigneeAccountId: string | null; assignedTeamId: string | null; salesMemberAccountId: string | null;
  dueFrom: string | null; dueTo: string | null; plannedFrom: string | null; plannedTo: string | null; historyFrom: string | null; historyTo: string | null;
}
export interface WorkQueueSummary {
  view: WorkQueueView; focus: WorkQueueFocus; defaultHistoryDays: number; explorerRequiresFilter: boolean;
  focusCounts: { assignedToMe: number; createdByMe: number; awaitingMyReview: number; exceptions: number; };
  counts: { active: number; recentHistory: number; archive: number; eligibleForDeletion: number; deletionRequested: number; };
}
export interface WorkItemListResponse { data: WorkItem[]; pagination: WorkPagination; queue: WorkQueueSummary; filters: WorkListFilters; }
export interface WorkItemDetailResponse { workItem: WorkItem; }
export interface WorkActivityResponse { data: WorkActivity[]; }
export interface PendingWorkHelpRequestsResponse { data: WorkHelpRequest[]; }
export interface WorkMutationResponse { message: string; workItem: WorkItem; }
export interface WorkCompletionMutationResponse extends WorkMutationResponse { report: WorkCompletionReport; }
export interface WorkHelpMutationResponse extends WorkMutationResponse { helpRequest?: WorkHelpRequest; }
export interface WorkEmployeeDashboardSummary {
  timezone: "Asia/Kathmandu"; generatedAt: string;
  totals: { active: number; newWork: number; working: number; waitingForManager: number; dueToday: number; dueSoon: number; overdue: number; informationRequested: number; pendingHelpRequests: number; };
  nextWork: WorkItem[];
}
export interface WorkManagementScope { role: "SUPER_ADMIN" | "SENIOR_MANAGEMENT" | "TEAM_MANAGER"; type: WorkManagementScopeType; divisionId: string | null; departmentId: string | null; }
export interface WorkManagementDashboardSummary {
  timezone: "Asia/Kathmandu"; generatedAt: string; scope: WorkManagementScope;
  totals: { open: number; assignedToday: number; inProgress: number; helpRequested: number; waitingForReview: number; overdue: number; closedToday: number; needsAttention: number; };
  nextReview: WorkItem[]; attentionWork: WorkItem[];
}
export interface WorkloadSummary { active: number; overdue: number; waitingForReview: number; level: WorkloadLevel; }
export interface WorkAssignmentCandidate { account: WorkAccountSummary; division: WorkOrganizationSummary | null; department: WorkDepartmentOption | null; workload: WorkloadSummary; }
export interface WorkResponsibleManagerOption {
  account: WorkAccountSummary;
  divisionId: string | null;
  departmentId: string | null;
  leadershipType: "OFFICE_HEAD" | "ORG_UNIT_HEAD";
  eligibleOwnerOrgUnitIds: string[];
}
export interface WorkAssignmentTypeOption {
  type: WorkItemType;
  code: string;
  workTypeVersionId: string;
  version: number;
  name: string;
  template: "STANDARD" | "TEAM_SALES" | "ADMINISTRATIVE";
  executionAssignmentMode: "TEAM" | "TEAM_OR_USER";
  requiresSalesParticipant: boolean;
  primaryOwnerOrgUnitId: string;
  registeredAtEnabled: boolean;
  salesDisplayLabel: string | null;
  fields: WorkDynamicFieldDefinition[];
  mainTeamIds: string[];
  mainAssigneeAccountIds: string[];
  reviewerAccountIds: string[];
}
export interface WorkAssignmentTeamOption {
  id: string; name: string; department: WorkDepartmentOption;
  admin: { employeeId: string; empId: string; name: string; designation: string | null; account: WorkAccountSummary | null; };
  memberCount: number; memberAccountIds: string[]; workload: WorkloadSummary;
}
export interface WorkAssignmentOptionsResponse {
  scope: WorkManagementScope; departments: WorkDepartmentOption[]; myBranchOrgUnitIds: string[]; responsibleManagers: WorkResponsibleManagerOption[];
  workTypes: WorkAssignmentTypeOption[];
  teams: WorkAssignmentTeamOption[]; salesMembers: WorkAssignmentCandidate[]; supportMembers: WorkAssignmentCandidate[]; data: WorkAssignmentCandidate[];
  pagination: WorkPagination; filters: { search: string | null; departmentId: string | null };
}

export type WorkReportScopeType = "PERSONAL" | "DEPARTMENT" | "DIVISION" | "ORGANIZATION";
export type WorkReportWorkflowStageFilter = "OVERDUE" | "WAITING_FOR_SALES" | "WAITING_FOR_APPROVAL" | "RETURNED_FOR_CORRECTION";
export type WorkReportDataset = "SUMMARY" | "PERFORMANCE_REPORT" | "WORK_RECORDS" | "DUTY_ASSIGNMENTS";
export type WorkReportDrilldownDataset = "PERFORMANCE_REPORT" | "WORK_RECORDS" | "DUTY_ASSIGNMENTS";
export interface WorkReportDepartmentOption { id: string; divisionId: string; code: string; name: string; division: WorkOrganizationSummary; }
export interface WorkReportTeamOption { id: string; name: string; isActive: boolean; departmentId: string; department: { id: string; code: string; name: string; division: WorkOrganizationSummary; }; }
export interface WorkReportWorkflowSummary { newWork: number; inProgress: number; waitingForSales: number; waitingForApproval: number; returnedForCorrection: number; overdue: number; completedDuring: number; }
export interface WorkReportTeamSummary { teamId: string; name: string; departmentId: string; departmentName: string; divisionId: string; divisionName: string; activeWork: number; newWork: number; inProgress: number; waitingForSales: number; waitingForApproval: number; returnedForCorrection: number; overdueWork: number; completedDuring: number; }
export interface WorkReportSummary {
  timezone: "Asia/Kathmandu"; generatedAt: string;
  scope: { role: WorkAccountSummary["role"]; type: WorkReportScopeType; label: string; divisionId: string | null; departmentId: string | null; };
  period: { from: string; to: string; days: number; };
  departmentOptions: WorkReportDepartmentOption[]; teamOptions: WorkReportTeamOption[];
  workTypeOptions: Array<{ id: string; versionId: string; code: string; name: string; template: string; isActive: boolean; }>;
  work: { totals: { activeAtEnd: number; completionRate: number | null; }; };
  workflow: WorkReportWorkflowSummary; teams: WorkReportTeamSummary[]; trend: Array<{ date: string; workCreated: number; workClosed: number; }>;
}
export interface WorkReportDrilldownPagination { page: number; limit: number; total: number; totalPages: number; hasPrevious: boolean; hasNext: boolean; }
export type WorkReportRecordStage = "NEW" | "IN_PROGRESS" | "WAITING_FOR_SALES" | "WAITING_FOR_APPROVAL" | "RETURNED_FOR_CORRECTION" | "COMPLETED" | "CANCELLED";
export interface WorkReportDrilldownWorkRow {
  kind: "WORK_ITEM"; id: string; ticketNumber: string; title: string; type: WorkItemType; workType: { id: string; versionId: string; code: string; name: string; template: string; }; workflowStage: WorkReportRecordStage;
  customerName: string | null; location: string | null; reference: { label: string; value: string; display: string } | null;
  information: Array<{ code: string; label: string; value: string; display: string }>;
  cpcSerial: string | null; olt: string | null; fdcName: string | null; fapName: string | null; createdAt: string; dueAt: string; closedAt: string | null;
  overdueDays: number; division: WorkOrganizationSummary; department: WorkOrganizationSummary | null; assignedTeam: { id: string; name: string } | null;
  primaryAssignee: string; startedBy: string | null; supportingStaff: string[]; responsibleManager: string; salesMember: string | null;
  salesCoordinationStatus: WorkSalesCoordinationStatus | null; childProgress: { total: number; completed: number; inProgress: number; percentage: number | null; };
}
export interface WorkReportPerformanceCounts { tickets: number; completed: number; pending: number; }
export type WorkReportPerformanceWorkTypes = Record<string, WorkReportPerformanceCounts>;
export interface WorkReportPerformanceGroup { id: string; definitionId: string; code: string; name: string; referenceLabel: string; }
export interface WorkReportPerformanceRow {
  kind: "PERFORMANCE_ROW"; date: string; team: { id: string; name: string; departmentId: string; departmentName: string; divisionId: string; divisionName: string; };
  supportStaffCount: number; otherStaffCount: number; references: Array<{ label: string; value: string; display: string }>; workTypes: WorkReportPerformanceWorkTypes; total: WorkReportPerformanceCounts;
}
export interface WorkReportPerformanceSection { workTypeGroups: WorkReportPerformanceGroup[]; rows: WorkReportPerformanceRow[]; totals: { workTypes: WorkReportPerformanceWorkTypes; total: WorkReportPerformanceCounts; }; }
export interface WorkReportDrilldownDutyRow {
  kind: "DUTY_ASSIGNMENT";
  id: string;
  dutyDate: string;
  startsAt: string;
  endsAt: string;
  employee: string;
  employeeId: string | null;
  employeeRole: WorkAccountSummary["role"];
  designation: string | null;
  shift: string;
  orgUnit: WorkOrganizationSummary | null;
  operationalTeam: WorkOrganizationSummary | null;
  supervisor: string;
  supervisorEmployeeId: string | null;
  reportingLocation: string;
  notes: string | null;
  status: "Scheduled" | "On Duty" | "Past Schedule" | "Cancelled";
  cancelledAt: string | null;
  cancellationReason: string | null;
}
export interface WorkReportDrilldownResponse {
  dataset: WorkReportDrilldownDataset; generatedAt: string; timezone: "Asia/Kathmandu"; scope: WorkReportSummary["scope"]; period: WorkReportSummary["period"];
  dutySummary: { scheduled: number; cancelled: number; uniqueEmployees: number; leaveDays: number; } | null;
  sections: { work: { pagination: WorkReportDrilldownPagination; rows: WorkReportDrilldownWorkRow[]; } | null; performance: WorkReportPerformanceSection | null; duty: { pagination: WorkReportDrilldownPagination; rows: WorkReportDrilldownDutyRow[]; } | null; };
  notice: string;
}

export type WorkAvailabilityPreference = "AVAILABLE" | "BUSY";
export type EffectiveHelpAvailability = "AVAILABLE" | "BUSY" | "OFF_DUTY";

export interface DutyHelpRecommendation {
  account: WorkAccountSummary;
  onDuty: boolean;
  dutyEndsAt: string | null;
  reportingLocation: string | null;
  preference: WorkAvailabilityPreference;
  availability: EffectiveHelpAvailability;
  isOnline: boolean | null;
  onlineStatusVisible: boolean;
  workload: {
    active: number;
    overdue: number;
  };
  eligibleForDirectHelp: boolean;
}

export interface DutyHelpRecommendationResponse {
  workItem: {
    id: string;
    ticketNumber: string;
    title: string;
    divisionId: string;
    departmentId: string;
  };
  data: DutyHelpRecommendation[];
  crossDepartmentOptions: Array<{
    id: string;
    divisionId: string;
    code: string;
    name: string;
  }>;
}
