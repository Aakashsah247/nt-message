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

export type WorkPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

export type DepartmentWorkFunction =
  | "GENERAL"
  | "FIELD_OPERATIONS"
  | "SALES"
  | "SUPPORT";

export type WorkQueueView =
  | "ACTIVE"
  | "HISTORY"
  | "ARCHIVE"
  | "DELETION_REVIEW";

// Queue focus is role-scoped; it does not grant broader ticket visibility.
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

export type WorkCompletionResult =
  | "FULLY_RESOLVED"
  | "TEMPORARY_SOLUTION"
  | "UNABLE_TO_RESOLVE";

export type WorkCompletionReviewStatus =
  | "PENDING_REVIEW"
  | "INFORMATION_REQUESTED"
  | "ACCEPTED"
  | "REJECTED";

export type WorkHelpReason =
  | "NEED_ANOTHER_EMPLOYEE"
  | "TECHNICAL_GUIDANCE"
  | "TOOLS_OR_MATERIALS"
  | "SAFETY_CONCERN"
  | "OTHER";

export type WorkHelpRequestStatus =
  | "PENDING"
  | "ACCEPTED"
  | "DECLINED"
  | "CANCELLED";

export type WorkActivityAction =
  | "CREATED"
  | "ASSIGNED"
  | "TEAM_ASSIGNED"
  | "SALES_MEMBER_ASSIGNED"
  | "ACKNOWLEDGED"
  | "STARTED"
  | "STATUS_CHANGED"
  | "REASSIGNED"
  | "SUPPORT_ADDED"
  | "SUPPORT_REMOVED"
  | "HELP_REQUESTED"
  | "HELP_ACCEPTED"
  | "HELP_DECLINED"
  | "COMPLETION_SUBMITTED"
  | "INFORMATION_REQUESTED"
  | "CLOSED"
  | "REOPENED"
  | "CANCELLED"
  | "DETAILS_UPDATED"
  | "PRIORITY_CHANGED"
  | "DUE_DATE_CHANGED"
  | "RETENTION_HOLD_APPLIED"
  | "RETENTION_HOLD_RELEASED"
  | "DELETION_REVIEW_REQUESTED"
  | "DELETION_REVIEW_CANCELLED"
  | "DELEGATED";

export type WorkItemRealtimeAction =
  | "CREATED"
  | "ACKNOWLEDGED"
  | "STARTED"
  | "HELP_REQUESTED"
  | "HELP_ACCEPTED"
  | "HELP_DECLINED"
  | "COMPLETION_SUBMITTED"
  | "INFORMATION_REQUESTED"
  | "CLOSED"
  | "REOPENED"
  | "CANCELLED"
  | "REASSIGNED"
  | "SUPPORT_ADDED"
  | "SUPPORT_REMOVED"
  | "DETAILS_UPDATED"
  | "DUE_SOON"
  | "OVERDUE";

export type WorkManagementScopeType =
  | "ORGANIZATION"
  | "DIVISION"
  | "DEPARTMENT";

export type WorkloadLevel =
  | "AVAILABLE"
  | "MODERATE"
  | "BUSY"
  | "OVERLOADED";

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
}

export interface WorkOrganizationSummary {
  id: string;
  code: string;
  name: string;
}

export interface WorkDepartmentOption extends WorkOrganizationSummary {
  divisionId: string;
  workFunction: DepartmentWorkFunction;
  division: WorkOrganizationSummary;
}

export interface WorkTeamSummary {
  id: string;
  name: string;
  departmentId: string;
  isActive: boolean;
  archivedAt: string | null;
  teamAdmin: {
    id: string;
    empId: string;
    empName: string;
    designation: string | null;
    account: WorkAccountSummary | null;
  };
  _count: {
    members: number;
  };
}

export interface WorkAssignment {
  id: string;
  assignmentRole: WorkAssignmentRole;
  acknowledgedAt: string | null;
  startedAt: string | null;
  createdAt: string;
  assignee: WorkAccountSummary;
  assignedBy: WorkAccountSummary;
}

export interface WorkCompletionReport {
  id: string;
  result: WorkCompletionResult;
  summary: string;
  moreWorkRequired: boolean;
  reviewStatus: WorkCompletionReviewStatus;
  managerNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  submittedBy: WorkAccountSummary;
  reviewedBy: WorkAccountSummary | null;
}

export interface WorkHelpRequest {
  id: string;
  workItemId: string;
  reason: WorkHelpReason;
  note: string | null;
  status: WorkHelpRequestStatus;
  previousStatus: WorkItemStatus;
  responseNote: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  requestedBy: WorkAccountSummary;
  requestedHelper: WorkAccountSummary | null;
  requestedDepartment?: {
    id: string;
    divisionId: string;
    code: string;
    name: string;
  } | null;
  respondedBy: WorkAccountSummary | null;
  coordinatedBy?: WorkAccountSummary | null;
  coordinatedAt?: string | null;
  workItem?: Pick<
    WorkItem,
    "id" | "ticketNumber" | "title" | "status" | "priority" | "dueAt"
  > & { responsibleManagerAccountId: string };
}

export interface WorkDelegationProgress {
  total: number;
  completed: number;
  inProgress: number;
  awaitingReview: number;
  notStarted: number;
  cancelled: number;
  completionPercentage: number;
}

export interface WorkTeamMemberProgress {
  id: string;
  parentWorkItemId: string | null;
  depth: number;
  ticketNumber: string;
  title: string;
  instructions: string | null;
  status: WorkItemStatus;
  priority: WorkPriority;
  dueAt: string;
  createdAt: string;
  completedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  primaryAssignee: WorkAccountSummary | null;
  assignedBy: WorkAccountSummary | null;
  latestProgressSummary: string | null;
  isOverdue: boolean;
}

export interface WorkTeamTracking {
  total: number;
  completed: number;
  inProgress: number;
  awaitingReview: number;
  notStarted: number;
  cancelled: number;
  overdue: number;
  completionPercentage: number;
  members: WorkTeamMemberProgress[];
}

export interface WorkItem {
  id: string;
  ticketNumber: string;
  type: WorkItemType;
  title: string;
  description: string;
  category: string | null;
  customerName: string | null;
  customerContactType: WorkContactType | null;
  customerContactNumber: string | null;
  serviceTypes: WorkServiceType[];
  otherServiceText: string | null;
  serviceNumber: string | null;
  olt: string | null;
  fdcName: string | null;
  fapName: string | null;
  priority: WorkPriority;
  status: WorkItemStatus;
  divisionId: string;
  departmentId: string | null;
  parentWorkItemId: string | null;
  assignedTeamId: string | null;
  salesMemberAccountId: string | null;
  locationText: string | null;
  registeredAt: string;
  plannedStartAt: string | null;
  dueAt: string;
  completedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  archiveEligibleAt: string | null;
  deletionEligibleAt: string | null;
  retentionHoldAt: string | null;
  retentionHoldReason: string | null;
  deletionRequestedAt: string | null;
  deletionRequestReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  division: WorkOrganizationSummary;
  department: WorkOrganizationSummary | null;
  assignedTeam: WorkTeamSummary | null;
  salesMember: WorkAccountSummary | null;
  createdBy: WorkAccountSummary;
  responsibleManager: WorkAccountSummary;
  retentionHoldBy: WorkAccountSummary | null;
  deletionRequestedBy: WorkAccountSummary | null;
  assignments: WorkAssignment[];
  completionReports?: WorkCompletionReport[];
  helpRequests?: WorkHelpRequest[];
  parentWorkItem?: WorkLinkedItem | null;
  childWorkItems?: WorkLinkedItem[];
  delegationProgress?: WorkDelegationProgress;
  teamWork?: WorkTeamTracking;
}

export interface WorkLinkedItem {
  id: string;
  ticketNumber: string;
  title: string;
  status: WorkItemStatus;
  priority: WorkPriority;
  dueAt: string;
}

export interface WorkActivity {
  id: string;
  action: WorkActivityAction;
  fromStatus: WorkItemStatus | null;
  toStatus: WorkItemStatus | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  actor: WorkAccountSummary | null;
}

export interface WorkPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface WorkListFilters {
  view: WorkQueueView;
  focus: WorkQueueFocus;
  status: WorkItemStatus | null;
  type: WorkItemType | null;
  priority: WorkPriority | null;
  search: string | null;
  category: string | null;
  departmentId: string | null;
  assigneeAccountId: string | null;
  assignedTeamId: string | null;
  salesMemberAccountId: string | null;
  dueFrom: string | null;
  dueTo: string | null;
  plannedFrom: string | null;
  plannedTo: string | null;
  historyFrom: string | null;
  historyTo: string | null;
}

export interface WorkQueueSummary {
  view: WorkQueueView;
  focus: WorkQueueFocus;
  defaultHistoryDays: number;
  explorerRequiresFilter: boolean;
  focusCounts: {
    assignedToMe: number;
    createdByMe: number;
    awaitingMyReview: number;
    exceptions: number;
  };
  counts: {
    active: number;
    recentHistory: number;
    archive: number;
    eligibleForDeletion: number;
    deletionRequested: number;
  };
}

export interface WorkItemListResponse {
  data: WorkItem[];
  pagination: WorkPagination;
  queue: WorkQueueSummary;
  filters: WorkListFilters;
}

export interface WorkItemDetailResponse {
  workItem: WorkItem;
}

export interface WorkActivityResponse {
  data: WorkActivity[];
}

export interface PendingWorkHelpRequestsResponse {
  data: WorkHelpRequest[];
}

export interface WorkMutationResponse {
  message: string;
  workItem: WorkItem;
}

export interface WorkCompletionMutationResponse extends WorkMutationResponse {
  report: WorkCompletionReport;
}

export interface WorkHelpMutationResponse extends WorkMutationResponse {
  helpRequest?: WorkHelpRequest;
}

export interface WorkEmployeeDashboardSummary {
  timezone: "Asia/Kathmandu";
  generatedAt: string;
  totals: {
    active: number;
    newWork: number;
    working: number;
    waitingForManager: number;
    highPriority: number;
    dueToday: number;
    dueSoon: number;
    overdue: number;
    informationRequested: number;
    pendingHelpRequests: number;
  };
  nextWork: WorkItem[];
}

export interface WorkManagementScope {
  role: "SUPER_ADMIN" | "SENIOR_MANAGEMENT" | "TEAM_MANAGER";
  type: WorkManagementScopeType;
  divisionId: string | null;
  departmentId: string | null;
}

export interface WorkManagementDashboardSummary {
  timezone: "Asia/Kathmandu";
  generatedAt: string;
  scope: WorkManagementScope;
  totals: {
    open: number;
    assignedToday: number;
    inProgress: number;
    helpRequested: number;
    waitingForReview: number;
    overdue: number;
    closedToday: number;
    critical: number;
  };
  nextReview: WorkItem[];
  urgentWork: WorkItem[];
}

export interface WorkloadSummary {
  active: number;
  highPriority: number;
  overdue: number;
  waitingForReview: number;
  level: WorkloadLevel;
}

export interface WorkAssignmentCandidate {
  account: WorkAccountSummary;
  division: WorkOrganizationSummary | null;
  department: (WorkOrganizationSummary & { divisionId: string }) | null;
  workload: WorkloadSummary;
}

export interface WorkResponsibleManagerOption {
  account: WorkAccountSummary;
  divisionId: string | null;
  departmentId: string | null;
}

export interface WorkAssignmentTeamOption {
  id: string;
  name: string;
  department: WorkDepartmentOption;
  admin: {
    employeeId: string;
    empId: string;
    name: string;
    designation: string | null;
    account: WorkAccountSummary | null;
  };
  memberCount: number;
  memberAccountIds: string[];
  workload: WorkloadSummary;
}

export interface WorkAssignmentOptionsResponse {
  scope: WorkManagementScope;
  departments: WorkDepartmentOption[];
  responsibleManagers: WorkResponsibleManagerOption[];
  teams: WorkAssignmentTeamOption[];
  salesMembers: WorkAssignmentCandidate[];
  supportMembers: WorkAssignmentCandidate[];
  data: WorkAssignmentCandidate[];
  pagination: WorkPagination;
  filters: {
    search: string | null;
    departmentId: string | null;
  };
}

export interface WorkItemRealtimePayload {
  workItemId: string;
  ticketNumber: string;
  status: WorkItemStatus;
  priority: WorkPriority;
  action: WorkItemRealtimeAction;
  actorAccountId: string | null;
  occurredAt: string;
}

export type DutyRecurrenceType = "ONE_TIME" | "DATE_RANGE" | "WEEKLY";
export type DutyExceptionType = "LEAVE" | "HOLIDAY";
export type DutyAssignmentAuthority =
  | "STANDARD_HIERARCHY"
  | "SUPER_ADMIN_OVERRIDE";
export type DutyAssignmentListView =
  | "ALL"
  | "ASSIGNED_BY_ME"
  | "MANAGEMENT_DUTIES"
  | "OVERRIDES";
export type WorkAvailabilityPreference = "AVAILABLE" | "BUSY";
export type DutyEffectiveStatus =
  | "ON_DUTY"
  | "OFF_DUTY"
  | "UPCOMING"
  | "LEAVE"
  | "HOLIDAY";
export type EffectiveHelpAvailability = "AVAILABLE" | "BUSY" | "OFF_DUTY";
export type DutyScheduleRealtimeAction =
  | "ASSIGNED"
  | "CHANGED"
  | "CANCELLED"
  | "LEAVE_RECORDED"
  | "HOLIDAY_RECORDED"
  | "AVAILABILITY_CHANGED";

export interface DutyShiftTemplate {
  id: string;
  name: string;
  startMinute: number;
  endMinute: number;
  startTime: string;
  endTime: string;
  spansNextDay: boolean;
  isActive: boolean;
  divisionId: string | null;
  departmentId: string | null;
  createdAt: string;
  updatedAt: string;
  canManage?: boolean;
}


export interface DutyAssignmentShift {
  id: string | null;
  name: string;
  startMinute: number;
  endMinute: number;
  startTime: string;
  endTime: string;
  spansNextDay: boolean;
  isActive: boolean;
  divisionId: string | null;
  departmentId: string | null;
  deleted: boolean;
}

export interface DutyAssignment {
  id: string;
  seriesId: string;
  employeeAccountId: string;
  shiftTemplateId: string | null;
  supervisorAccountId: string;
  createdByAccountId: string;
  divisionId: string;
  departmentId: string | null;
  dutyDate: string;
  startsAt: string;
  endsAt: string;
  reportingLocation: string;
  notes: string | null;
  authority: DutyAssignmentAuthority;
  overrideReason: string | null;
  hierarchyOverride: boolean;
  conflictOverride: boolean;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  employee: WorkAccountSummary;
  supervisor: WorkAccountSummary;
  createdBy: WorkAccountSummary;
  shift: DutyAssignmentShift;
  division: WorkOrganizationSummary;
  department: WorkOrganizationSummary | null;
}

export interface DutyException {
  id: string;
  employeeAccountId: string;
  exceptionDate: string;
  type: DutyExceptionType;
  note: string | null;
  createdAt: string;
  employee: WorkAccountSummary;
}

export interface DutyAvailabilitySummary {
  preference: WorkAvailabilityPreference;
  effective: EffectiveHelpAvailability;
  updatedAt: string | null;
}

// Personal duty uses a deliberately smaller contract than management roster records.
export interface MyDutyAssignment {
  id: string;
  dutyDate: string;
  startsAt: string;
  endsAt: string;
  reportingLocation: string;
  notes: string | null;
  authority: DutyAssignmentAuthority;
  overrideReason: string | null;
  hierarchyOverride: boolean;
  conflictOverride: boolean;
  cancelledAt: string | null;
  supervisor: WorkAccountSummary;
  createdBy: WorkAccountSummary;
  shift: Pick<
    DutyAssignmentShift,
    "id" | "name" | "startMinute" | "endMinute" | "startTime" | "endTime" | "spansNextDay" | "deleted"
  >;
  division: WorkOrganizationSummary;
  department: WorkOrganizationSummary | null;
}

export interface MyDutySummary {
  timezone: "Asia/Kathmandu";
  generatedAt: string;
  effectiveStatus: DutyEffectiveStatus;
  availability: DutyAvailabilitySummary;
  exception: {
    id: string;
    type: DutyExceptionType;
    note: string | null;
    exceptionDate: string;
  } | null;
  current: MyDutyAssignment | null;
  next: MyDutyAssignment | null;
  upcoming: MyDutyAssignment[];
}


// Roster accounts contain operational identity only; private contact fields are intentionally absent.
export interface DutyRosterAccount {
  id: string;
  role: "SENIOR_MANAGEMENT" | "TEAM_MANAGER" | "EMPLOYEE";
  username: string;
  employee: {
    id: string;
    empId: string;
    empName: string;
    designation: string | null;
    division: WorkOrganizationSummary;
    department: (WorkOrganizationSummary & { divisionId: string }) | null;
    managementPosition: {
      positionType: "SENIOR_MANAGEMENT" | "TEAM_MANAGER";
      divisionId: string;
      departmentId: string | null;
      isActive: boolean;
    } | null;
  } | null;
}

export interface DutyRosterPerson {
  account: DutyRosterAccount;
  totalScheduledMinutes: number;
  todayStatus: "ON_DUTY" | "SCHEDULED_LATER" | "EXCEPTION" | "OFF_DUTY";
  current: DutyAssignment | null;
  next: DutyAssignment | null;
  assignments: DutyAssignment[];
  exceptions: DutyException[];
}

export interface DutyRosterResponse {
  timezone: "Asia/Kathmandu";
  generatedAt: string;
  scope: DutyManagementSummary["scope"];
  period: { from: string; to: string; days: string[] };
  totals: {
    people: number;
    scheduledPeople: number;
    assignments: number;
    leave: number;
    holiday: number;
  };
  people: DutyRosterPerson[];
  daily: Array<{
    date: string;
    scheduledPeople: number;
    assignmentCount: number;
    leaveCount: number;
    holidayCount: number;
  }>;
  departments: Array<{
    id: string;
    divisionId: string;
    code: string;
    name: string;
    division: WorkOrganizationSummary;
    people: number;
    scheduledPeople: number;
    assignmentCount: number;
    leaveCount: number;
    holidayCount: number;
  }>;
}

// Bulk schedules describe planned coverage and never imply attendance confirmation.
export interface BulkDutyScheduleInput {
  employeeAccountIds: string[];
  shiftTemplateId: string;
  supervisorAccountId?: string;
  recurrenceType: DutyRecurrenceType;
  startDate: string;
  endDate?: string;
  weekdays?: number[];
  reportingLocation: string;
  notes?: string;
  createValidAssignmentsOnly?: boolean;
  overrideConflicts?: boolean;
  overrideReason?: string;
}

export interface BulkDutyPreviewResponse {
  shift: DutyShiftTemplate;
  reportingLocation: string;
  dates: string[];
  requestedAssignments: number;
  validAssignments: number;
  conflictAssignments: number;
  override: {
    canOverrideConflicts: boolean;
    requestedConflictOverride: boolean;
    hierarchyOverrideCount: number;
    requiresReason: boolean;
  };
  people: Array<{
    account: WorkAccountSummary;
    supervisor: WorkAccountSummary;
    validDates: string[];
    result: "READY" | "PARTLY_READY" | "BLOCKED" | "NEEDS_APPROVAL";
    hierarchyOverride: boolean;
    conflicts: Array<{
      date: string;
      startsAt: string;
      endsAt: string;
      type: "DUTY_CONFLICT" | "LEAVE" | "HOLIDAY";
      message: string;
      existingAssignmentId: string | null;
    }>;
  }>;
}

export interface DutyManagementSummary {
  timezone: "Asia/Kathmandu";
  generatedAt: string;
  scope: {
    accountId: string;
    role: "SUPER_ADMIN" | "SENIOR_MANAGEMENT" | "TEAM_MANAGER";
    divisionId: string | null;
    departmentId: string | null;
  };
  totals: {
    scheduledToday: number;
    onDutyNow: number;
    leaveToday: number;
    holidayToday: number;
    cancelledToday: number;
    assignedByMeUpcoming: number;
    managementDutiesUpcoming: number;
    overridesUpcoming: number;
    hierarchyOverridesUpcoming: number;
    conflictOverridesUpcoming: number;
  };
}

export interface DutyAssignmentListResponse {
  data: DutyAssignment[];
  pagination: WorkPagination;
  filters: {
    from: string;
    to: string;
    employeeAccountId: string | null;
    departmentId: string | null;
    includeCancelled: boolean;
    view: DutyAssignmentListView;
  };
}

export interface DutyShiftTemplateListResponse {
  data: DutyShiftTemplate[];
}

export interface DutyMutationResponse {
  message: string;
  assignment?: DutyAssignment;
  assignments?: DutyAssignment[];
  seriesId?: string;
  template?: DutyShiftTemplate;
  exception?: DutyException;
}

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
    urgent: number;
    overdue: number;
  };
  eligibleForDirectHelp: boolean;
}

export interface DutyManagementHelpRecommendationResponse {
  department: {
    id: string;
    divisionId: string;
    code: string;
    name: string;
  };
  data: DutyHelpRecommendation[];
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

export interface DutyScheduleRealtimePayload {
  assignmentId: string | null;
  employeeAccountId: string;
  action: DutyScheduleRealtimeAction;
  startsAt: string | null;
  endsAt: string | null;
  actorAccountId: string | null;
  occurredAt: string;
}

export type WorkReportScopeType =
  | "PERSONAL"
  | "DEPARTMENT"
  | "DIVISION"
  | "ORGANIZATION";

export type WorkReportDutyStatus = "SCHEDULED" | "CANCELLED";

export type WorkReportDataset =
  | "SUMMARY"
  | "WORK_ITEMS"
  | "DUTY_ASSIGNMENTS"
  | "HELP_REQUESTS"
  | "RETENTION_REVIEW";

export type WorkReportDrilldownDataset =
  | "OVERDUE_WORK"
  | "EMPLOYEE_PERFORMANCE"
  | "DEPARTMENT_SUMMARY"
  | "DIVISION_SUMMARY"
  | "DUTY_CONFLICT_OVERRIDES"
  | "DUTY_CANCELLATIONS";

export interface WorkReportDepartmentOption {
  id: string;
  divisionId: string;
  code: string;
  name: string;
  division: WorkOrganizationSummary;
}

export interface DailyWorkPerformanceCounts {
  assigned: number;
  completed: number;
  pending: number;
}

export interface DailyWorkPerformanceTicket {
  id: string;
  ticketNumber: string;
  title: string;
  type: WorkItemType;
  priority: WorkPriority;
  status: WorkItemStatus;
  customerName: string | null;
  serviceNumber: string | null;
  location: string | null;
  plannedStartAt: string | null;
  dueAt: string;
  closedAt: string | null;
  pendingReason: string | null;
}

export interface DailyWorkPerformanceRow {
  accountId: string;
  employeeId: string;
  employeeName: string;
  designation: string | null;
  role: WorkAccountSummary["role"];
  division: WorkOrganizationSummary | null;
  department: WorkOrganizationSummary | null;
  networkMaintenance: DailyWorkPerformanceCounts;
  newInstallation: DailyWorkPerformanceCounts;
  updateServices: DailyWorkPerformanceCounts;
  otherWork: DailyWorkPerformanceCounts;
  total: DailyWorkPerformanceCounts;
  pendingReasons: string[];
  workItems: DailyWorkPerformanceTicket[];
}

export interface DailyWorkPerformanceReport {
  timezone: "Asia/Kathmandu";
  generatedAt: string;
  date: string;
  scope: {
    role: WorkAccountSummary["role"];
    type: WorkReportScopeType;
    label: string;
    divisionId: string | null;
    departmentId: string | null;
  };
  filters: {
    divisionId: string | null;
    departmentId: string | null;
    employeeAccountId: string | null;
    search: string | null;
  };
  divisionOptions: WorkOrganizationSummary[];
  departmentOptions: WorkReportDepartmentOption[];
  rows: DailyWorkPerformanceRow[];
  totals: {
    employees: number;
    networkMaintenance: DailyWorkPerformanceCounts;
    newInstallation: DailyWorkPerformanceCounts;
    updateServices: DailyWorkPerformanceCounts;
    otherWork: DailyWorkPerformanceCounts;
    total: DailyWorkPerformanceCounts;
  };
  note: string;
}

export interface WorkReportSummary {
  timezone: "Asia/Kathmandu";
  generatedAt: string;
  scope: {
    role: WorkAccountSummary["role"];
    type: WorkReportScopeType;
    label: string;
    divisionId: string | null;
    departmentId: string | null;
  };
  period: {
    from: string;
    to: string;
    days: number;
  };
  filters: {
    status: WorkItemStatus | null;
    priority: WorkPriority | null;
    type: WorkItemType | null;
    divisionId: string | null;
    departmentId: string | null;
    employeeAccountId: string | null;
    assignedByAccountId: string | null;
    assignedToRole: WorkAccountSummary["role"] | null;
    shiftTemplateId: string | null;
    dutyStatus: WorkReportDutyStatus | null;
    location: string | null;
  };
  departmentOptions: WorkReportDepartmentOption[];
  filterOptions: {
    assigners: WorkAccountSummary[];
    assignedToRoles: WorkAccountSummary["role"][];
  };
  work: {
    totals: {
      created: number;
      activeAtEnd: number;
      dueDuring: number;
      overdueAtEnd: number;
      closedDuring: number;
      completedDuring: number;
      reopenedTickets: number;
      cancelledTickets: number;
      uniqueAssignees: number;
      completionRate: number | null;
      averageClosureHours: number | null;
    };
    byStatus: Array<{ key: WorkItemStatus; count: number }>;
    byPriority: Array<{ key: WorkPriority; count: number }>;
    byType: Array<{ key: WorkItemType; count: number }>;
  };
  completion: {
    submitted: number;
    accepted: number;
    informationRequested: number;
    rejected: number;
    fullyResolved: number;
    temporarySolution: number;
    unableToResolve: number;
    moreWorkRequired: number;
    acceptanceRate: number | null;
  };
  help: {
    requested: number;
    accepted: number;
    declined: number;
    pending: number;
    cancelled: number;
    crossDepartment: number;
  };
  duty: {
    scheduled: number;
    cancelled: number;
    uniqueEmployees: number;
    leaveDays: number;
    holidayDays: number;
    scheduledHours: number;
    conflictOverrides: number;
    hierarchyOverrides: number;
    superAdminOverrides: number;
    nightAssignments: number;
    weekendAssignments: number;
    byShift: Array<{ shiftTemplateId: string; name: string; count: number }>;
    coverage: {
      configured: boolean;
      requiredCoverage: number | null;
      coveredPositions: number | null;
      coveragePercentage: number | null;
      unfilledShifts: number | null;
      reason: string;
    };
  };
  trend: Array<{
    date: string;
    workCreated: number;
    workClosed: number;
    helpRequested: number;
    dutyScheduled: number;
  }>;
  departments: Array<{
    departmentId: string;
    code: string;
    name: string;
    workCreated: number;
    workClosed: number;
    activeWork: number;
    overdueWork: number;
    completionRate: number | null;
    dutyCoverage: number | null;
    leaveDays: number;
    conflicts: number;
    helpRequested: number;
    dutyScheduled: number;
  }>;
  divisions: Array<{
    divisionId: string;
    code: string;
    name: string;
    workCreated: number;
    workClosed: number;
    activeWork: number;
    overdueWork: number;
    completionRate: number | null;
    dutyCoverage: number | null;
    leaveDays: number;
    conflicts: number;
    helpRequested: number;
    dutyScheduled: number;
  }>;
  exceptions: {
    criticalActive: number;
    seriouslyOverdue: number;
    awaitingReview: number;
    pendingHelp: number;
  };
  assignmentFlow: {
    assignedByRole: Array<{ key: WorkAccountSummary["role"]; count: number }>;
    assignedToRole: Array<{ key: WorkAccountSummary["role"]; count: number }>;
  };
  workload: {
    level: "EMPLOYEE" | "DEPARTMENT" | "DIVISION";
    rows: Array<{
      id: string;
      code: string;
      name: string;
      activeWork: number;
      criticalWork: number;
      overdueWork: number;
      scheduledHours: number;
    }>;
  };
  retention: {
    archived: number;
    eligibleForReview: number;
    held: number;
    deletionRequested: number;
  } | null;
  reportNotice: string;
}

export interface WorkReportDrilldownPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface WorkReportDrilldownWorkRow {
  kind: "WORK_ITEM";
  id: string;
  ticketNumber: string;
  title: string;
  type: WorkItemType;
  priority: WorkPriority;
  status: WorkItemStatus;
  location: string | null;
  createdAt: string;
  dueAt: string;
  completedAt: string | null;
  closedAt: string | null;
  overdueDays: number;
  division: WorkOrganizationSummary;
  department: WorkOrganizationSummary | null;
  primaryAssignee: string;
  assignedBy: string;
  responsibleManager: string;
  childProgress: {
    total: number;
    completed: number;
    inProgress: number;
    percentage: number | null;
  };
}

export interface WorkReportDrilldownDutyRow {
  kind: "DUTY_ASSIGNMENT";
  id: string;
  dutyDate: string;
  startsAt: string;
  endsAt: string;
  employee: string;
  employeeRole: WorkAccountSummary["role"];
  shift: string;
  supervisor: string;
  assignedBy: string;
  division: WorkOrganizationSummary;
  department: WorkOrganizationSummary | null;
  reportingLocation: string;
  authority: DutyAssignmentAuthority;
  hierarchyOverride: boolean;
  conflictOverride: boolean;
  overrideReason: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export interface WorkReportDrilldownResponse {
  dataset: WorkReportDrilldownDataset;
  generatedAt: string;
  timezone: "Asia/Kathmandu";
  scope: WorkReportSummary["scope"];
  period: WorkReportSummary["period"];
  target: {
    type: "EMPLOYEE" | "DEPARTMENT" | "DIVISION";
    id: string;
    code: string;
    name: string;
  } | null;
  summary: {
    work: WorkReportSummary["work"]["totals"];
    duty: Pick<
      WorkReportSummary["duty"],
      | "scheduled"
      | "cancelled"
      | "uniqueEmployees"
      | "scheduledHours"
      | "conflictOverrides"
      | "hierarchyOverrides"
      | "superAdminOverrides"
    >;
  };
  sections: {
    work: {
      pagination: WorkReportDrilldownPagination;
      rows: WorkReportDrilldownWorkRow[];
    } | null;
    duty: {
      pagination: WorkReportDrilldownPagination;
      rows: WorkReportDrilldownDutyRow[];
    } | null;
  };
  notice: string;
}

export interface DutyCoverageRequirement {
  id: string;
  department: WorkReportDepartmentOption;
  shift: DutyShiftTemplate;
  dayOfWeek: number;
  requiredStaff: number;
  reportingLocation: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DutyCoverageRequirementListResponse {
  generatedAt: string;
  timezone: "Asia/Kathmandu";
  items: DutyCoverageRequirement[];
}

export type DutyCoverageRequirementAction = "CREATED" | "UPDATED" | "RETIRED";

export interface DutyCoverageRequirementAuditResponse {
  requirement: DutyCoverageRequirement;
  activities: Array<{
    id: string;
    action: DutyCoverageRequirementAction;
    previousState: Record<string, unknown> | null;
    nextState: Record<string, unknown> | null;
    actor: string;
    createdAt: string;
  }>;
}

export interface DutyCoverageRequirementInput {
  departmentId: string;
  shiftTemplateId: string;
  dayOfWeek: number;
  requiredStaff: number;
  reportingLocation?: string;
  effectiveFrom: string;
  effectiveUntil?: string;
}

export interface DutyCoverageRequirementUpdateInput {
  departmentId?: string;
  shiftTemplateId?: string;
  dayOfWeek?: number;
  requiredStaff?: number;
  reportingLocation?: string | null;
  effectiveFrom?: string;
  effectiveUntil?: string | null;
}

export type PerformanceReportGroup = "EMPLOYEE" | "DEPARTMENT" | "DIVISION";
export type PerformanceReportStaffMode = "WITH_WORK" | "ALL";
export type PerformanceReportWorkType = "ALL" | WorkItemType;
export type PerformanceReportSection =
  | "WORK_SUMMARY"
  | "WORK_DETAILS"
  | "DUTY_SUMMARY"
  | "DUTY_DETAILS";

export interface PerformanceReportCounts {
  assigned: number;
  completed: number;
  pending: number;
}

export interface PerformanceReportPerson {
  id: string;
  name: string;
  employeeId: string | null;
  role: WorkAccountSummary["role"];
  jobTitle: string | null;
}

export interface PerformanceSummaryRow {
  id: string;
  date: string | null;
  name: string;
  code: string | null;
  role: WorkAccountSummary["role"] | null;
  division: WorkOrganizationSummary | null;
  department: WorkOrganizationSummary | null;
  supportingStaff: PerformanceReportPerson[];
  serviceNumbers: string[];
  workTypeCounts: Record<WorkItemType, PerformanceReportCounts>;
  total: PerformanceReportCounts;
}

export interface PerformanceWorkDetailRow {
  id: string;
  ticketNumber: string;
  title: string;
  type: WorkItemType;
  status: WorkItemStatus;
  assignedBy: PerformanceReportPerson | null;
  mainWorker: PerformanceReportPerson | null;
  supportingStaff: PerformanceReportPerson[];
  serviceNumbers: string[];
  workAssignmentPaths: PerformanceReportPerson[][];
  division: WorkOrganizationSummary;
  department: WorkOrganizationSummary | null;
  plannedStartAt: string | null;
  dueAt: string;
  closedAt: string | null;
  pendingReason: string | null;
}

export interface PerformanceDutySummaryRow {
  accountId: string;
  employeeId: string;
  employeeName: string;
  jobTitle: string | null;
  division: WorkOrganizationSummary | null;
  department: WorkOrganizationSummary | null;
  scheduledDays: number;
  assignments: number;
  scheduledHours: number;
  cancelled: number;
  leaveDays: number;
  holidayDays: number;
}

export interface PerformanceDutyDetailRow {
  id: string;
  date: string;
  employee: PerformanceReportPerson;
  shift: string;
  time: string;
  location: string;
  supervisor: PerformanceReportPerson;
  assignedBy: PerformanceReportPerson;
  division: WorkOrganizationSummary;
  department: WorkOrganizationSummary | null;
  leaveOrHoliday: "LEAVE" | "HOLIDAY" | null;
  status: "SCHEDULED" | "CANCELLED";
}

export interface PerformanceReportResponse {
  timezone: "Asia/Kathmandu";
  generatedAt: string;
  scope: {
    role: WorkAccountSummary["role"];
    label: string;
    divisionId: string | null;
    departmentId: string | null;
  };
  period: { from: string; to: string; days: number };
  filters: {
    divisionId: string | null;
    departmentId: string | null;
    groupBy: PerformanceReportGroup;
    staffMode: PerformanceReportStaffMode;
    workType: PerformanceReportWorkType;
    search: string | null;
  };
  divisionOptions: WorkOrganizationSummary[];
  departmentOptions: WorkReportDepartmentOption[];
  summaryRows: PerformanceSummaryRow[];
  summaryTotals: {
    workTypeCounts: Record<WorkItemType, PerformanceReportCounts>;
    total: PerformanceReportCounts;
  };
  workDetails: PerformanceWorkDetailRow[];
  dutySummary: PerformanceDutySummaryRow[];
  dutyDetails: PerformanceDutyDetailRow[];
  truncated: { workDetails: boolean; dutyDetails: boolean };
  notes: { work: string; duty: string };
}
