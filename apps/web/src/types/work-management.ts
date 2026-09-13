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

export interface WorkEmployeeSummary {
  id: string;
  empId: string;
  empName: string;
  designation: string | null;
}

export interface WorkAccountSummary {
  id: string;
  role: string;
  username: string | null;
  employee: WorkEmployeeSummary | null;
  superAdminProfile?: { fullName: string } | null;
}


export interface WorkOrganizationSummary {
  id: string;
  code: string;
  name: string;
}

export interface WorkPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
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
  respondedBy: WorkAccountSummary | null;
  coordinatedBy?: WorkAccountSummary | null;
  coordinatedAt?: string | null;
  workItem?: {
    id: string;
    ticketNumber: string;
    title: string;
    status: WorkItemStatus;
    dueAt: string;
  };
}

export interface PendingWorkHelpRequestsResponse {
  data: WorkHelpRequest[];
}

export interface WorkMutationResponse {
  message: string;
  workItem: {
    id: string;
    ticketNumber: string;
    title: string;
    status: WorkItemStatus;
    dueAt: string;
  };
}

export interface WorkItemRealtimePayload {
  workItemId: string;
  ticketNumber: string;
  status: WorkItemStatus;
  action: WorkItemRealtimeAction;
  actorAccountId: string | null;
  occurredAt: string;
}

export interface DutyAuthorizationContext {
  officeId: string | null;
  primaryOrgUnitId: string | null;
  operationalTeamLeadIds: string[];
  orgUnits: Array<{ id: string; code: string; name: string }>;
  operationalTeams: Array<{ id: string; code: string; name: string; orgUnitId: string }>;
  canView: boolean;
  canCreate: boolean;
  canAssign: boolean;
  canManage: boolean;
  readOnlyOversight: boolean;
}

export interface DutySupervisorOption {
  account: {
    id: string;
    username: string | null;
    superAdminProfile?: { fullName: string } | null;
    employee: {
      id: string;
      empId: string;
      empName: string;
      designation: string | null;
    } | null;
  };
}

export interface DutySupervisorOptionsResponse {
  data: DutySupervisorOption[];
}

export type DutyRecurrenceType = "ONE_TIME" | "DATE_RANGE" | "WEEKLY";
export type DutyExceptionType = "LEAVE" | "HOLIDAY";
export type DutyShiftScope = "OFFICE" | "ORG_UNIT";
export type DutyHolidayScope = "OFFICE" | "ORG_UNIT";
export type DutyHolidayType = "GOVERNMENT" | "FESTIVAL" | "ORGANIZATION" | "OTHER";
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
  officeId: string | null;
  orgUnitId: string | null;
  office: WorkOrganizationSummary | null;
  orgUnit: WorkOrganizationSummary | null;
  scope: DutyShiftScope;
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
  deleted: boolean;
}

export interface DutyAssignment {
  id: string;
  seriesId: string;
  employeeAccountId: string;
  shiftTemplateId: string | null;
  supervisorAccountId: string;
  createdByAccountId: string;
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
  department: WorkOrganizationSummary | null;
  orgUnit?: WorkOrganizationSummary | null;
  operationalTeam?: WorkOrganizationSummary | null;
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
  orgUnit: {
    id: string;
    code: string;
    name: string;
  } | null;
  operationalTeam: {
    id: string;
    code: string;
    name: string;
  } | null;
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
  role: string;
  username: string;
  employee: {
    id: string;
    empId: string;
    empName: string;
    designation: string | null;
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
}

// Bulk schedules describe planned coverage and never imply attendance confirmation.
export interface BulkDutyScheduleInput {
  employeeAccountIds: string[];
  orgUnitId?: string;
  operationalTeamId?: string;
  shiftTemplateId: string;
  supervisorAccountId?: string;
  recurrenceType: DutyRecurrenceType;
  startDate: string;
  endDate?: string;
  weekdays?: number[];
  reportingLocation: string;
  notes?: string;
  createValidAssignmentsOnly?: boolean;
}

export interface BulkDutyPreviewResponse {
  shift: DutyShiftTemplate;
  reportingLocation: string;
  dates: string[];
  requestedAssignments: number;
  validAssignments: number;
  conflictAssignments: number;
  warningAssignments: number;
  people: Array<{
    account: WorkAccountSummary;
    supervisor: WorkAccountSummary;
    validDates: string[];
    result: "READY" | "PARTLY_READY" | "BLOCKED";
    conflicts: Array<{
      date: string;
      startsAt: string;
      endsAt: string;
      type: "DUTY_CONFLICT" | "REST_PERIOD" | "LEAVE";
      message: string;
      existingAssignmentId: string | null;
    }>;
    warnings: Array<{
      date: string;
      startsAt: string;
      endsAt: string;
      type: "HOLIDAY" | "WEEKLY_OFF";
      message: string;
      holidayId: string | null;
    }>;
  }>;
}

export interface DutyHoliday {
  id: string;
  name: string;
  type: DutyHolidayType;
  scope: DutyHolidayScope;
  startDate: string;
  endDate: string;
  officeId: string | null;
  orgUnitId: string | null;
  office: WorkOrganizationSummary | null;
  orgUnit: WorkOrganizationSummary | null;
  note: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DutyCalendarResponse {
  timezone: "Asia/Kathmandu";
  period: { from: string; to: string };
  weeklyOffDays: number[];
  holidays: DutyHoliday[];
  canManage: boolean;
}

export interface DutyManagementSummary {
  timezone: "Asia/Kathmandu";
  generatedAt: string;
  scope: {
    accountId: string;
    role: string;
      };
  totals: {
    scheduledToday: number;
    onDutyNow: number;
    leaveToday: number;
    cancelledToday: number;
    assignedByMeUpcoming: number;
    managementDutiesUpcoming: number;
  };
  calendarToday: {
    date: string;
    weeklyOff: boolean;
    holidays: DutyHoliday[];
  };
}

export interface DutyAssignmentListResponse {
  data: DutyAssignment[];
  pagination: WorkPagination;
  filters: {
    from: string;
    to: string;
    employeeAccountId: string | null;
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
    overdue: number;
  };
  eligibleForDirectHelp: boolean;
}

export interface DutyManagementHelpRecommendationResponse {
  data: DutyHelpRecommendation[];
}

export interface DutyHelpRecommendationResponse {
  workItem: {
    id: string;
    ticketNumber: string;
    title: string;
  };
  data: DutyHelpRecommendation[];
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


export interface DutyCoverageRequirement {
  id: string;
  office: WorkOrganizationSummary;
  orgUnit: WorkOrganizationSummary;
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
  orgUnitId: string;
  shiftTemplateId: string;
  dayOfWeek: number;
  requiredStaff: number;
  reportingLocation?: string;
  effectiveFrom: string;
  effectiveUntil?: string;
}

export interface DutyCoverageRequirementUpdateInput {
  orgUnitId?: string;
  shiftTemplateId?: string;
  dayOfWeek?: number;
  requiredStaff?: number;
  reportingLocation?: string | null;
  effectiveFrom?: string;
  effectiveUntil?: string | null;
}
