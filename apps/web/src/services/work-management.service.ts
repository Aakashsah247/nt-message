import { apiDownload, apiRequest } from "../lib/api";

import type {
  BulkDutyPreviewResponse,
  BulkDutyScheduleInput,
  DutyAssignmentListResponse,
  DutyCoverageRequirement,
  DutyCoverageRequirementAuditResponse,
  DutyCoverageRequirementInput,
  DutyCoverageRequirementListResponse,
  DutyCoverageRequirementUpdateInput,
  DutyAssignmentListView,
  DutyCalendarResponse,
  DutyHolidayScope,
  DutyHolidayType,
  DutyHelpRecommendationResponse,
  DutyManagementHelpRecommendationResponse,
  DutyManagementSummary,
  DutyRosterResponse,
  DutyMutationResponse,
  DutyRecurrenceType,
  DutyShiftScope,
  DutyShiftTemplateListResponse,
  MyDutySummary,
  PendingWorkHelpRequestsResponse,
  WorkActivityResponse,
  WorkAvailabilityPreference,
  WorkAssignmentOptionsResponse,
  WorkCompletionMutationResponse,
  WorkCompletionResult,
  WorkContactType,
  WorkEmployeeDashboardSummary,
  WorkHelpMutationResponse,
  WorkHelpReason,
  WorkItemDetailResponse,
  WorkItemListResponse,
  WorkItemStatus,
  WorkItemType,
  WorkManagementDashboardSummary,
  WorkManagementOrganizationSummaryResponse,
  WorkMutationResponse,
  WorkQueueFocus,
  WorkServiceType,
  WorkQueueView,
  WorkReportDataset,
  WorkReportDrilldownDataset,
  WorkReportDrilldownResponse,
  WorkReportSummary,
  WorkReportWorkflowStageFilter,
  WorkSalesMessageListResponse,
  WorkSalesMessageMutationResponse,
} from "../types/work-management";

function authorizationHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export interface WorkItemListQuery {
  view?: WorkQueueView;
  focus?: WorkQueueFocus;
  page?: number;
  limit?: number;
  search?: string;
  status?: WorkItemStatus;
  type?: WorkItemType;
  category?: string;
  divisionId?: string;
  departmentId?: string;
  assigneeAccountId?: string;
  assignedTeamId?: string;
  salesMemberAccountId?: string;
  dueFrom?: string;
  dueTo?: string;
  plannedFrom?: string;
  plannedTo?: string;
  historyFrom?: string;
  historyTo?: string;
}

export interface WorkAssignmentOptionsQuery {
  page?: number;
  limit?: number;
  search?: string;
  departmentId?: string;
}

export interface WorkReportQuery {
  from?: string;
  to?: string;
  type?: WorkItemType;
  divisionId?: string;
  departmentId?: string;
  teamId?: string;
  workflowStage?: WorkReportWorkflowStageFilter;
  search?: string;
}

export interface WorkReportDrilldownQuery extends WorkReportQuery {
  dataset: WorkReportDrilldownDataset;
  page?: number;
  limit?: number;
}


export interface DutyCoverageRequirementQuery {
  departmentId?: string;
  shiftTemplateId?: string;
  dayOfWeek?: number;
  from?: string;
  to?: string;
}

export interface DutyRosterQuery {
  from?: string;
  to?: string;
  employeeAccountId?: string;
  divisionId?: string;
  departmentId?: string;
  search?: string;
  role?: "SENIOR_MANAGEMENT" | "TEAM_MANAGER" | "EMPLOYEE";
  limit?: number;
}

export interface DutyAssignmentQuery {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  employeeAccountId?: string;
  departmentId?: string;
  view?: DutyAssignmentListView;
  includeCancelled?: boolean;
}

export interface CreateWorkItemInput {
  type: WorkItemType;
  title?: string;
  description?: string;
  customerName?: string;
  customerContactType?: WorkContactType;
  customerContactNumber?: string;
  locationText?: string;
  requestNumber?: string;
  cpcSerial?: string;
  serviceNumber?: string;
  olt?: string;
  fdcName?: string;
  fapName?: string;
  serviceTypes?: WorkServiceType[];
  otherServiceText?: string;
  registeredAt?: string;
  plannedStartAt?: string;
  dueAt: string;
  primaryAssigneeAccountId?: string;
  assignedTeamId?: string;
  salesMemberAccountId?: string;
  supportingAssigneeAccountIds?: string[];
  responsibleManagerAccountId?: string;
  parentWorkItemId?: string;
  delegationInstructions?: string;
}

function buildQueryString(
  query:
    | WorkItemListQuery
    | WorkAssignmentOptionsQuery
    | DutyAssignmentQuery
    | DutyRosterQuery
    | DutyCoverageRequirementQuery
    | WorkReportQuery
    | WorkReportDrilldownQuery
    | (WorkReportQuery & { dataset: WorkReportDataset }),
): string {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (typeof value === "number" || typeof value === "boolean") {
      params.set(key, String(value));
      return;
    }

    if (typeof value === "string" && value.trim()) {
      params.set(key, value.trim());
    }
  });

  const value = params.toString();
  return value ? `?${value}` : "";
}

export function getEmployeeWorkDashboardSummary(
  accessToken: string,
): Promise<WorkEmployeeDashboardSummary> {
  return apiRequest<WorkEmployeeDashboardSummary>(
    "/work-items/employee/dashboard-summary",
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function getManagementWorkDashboardSummary(
  accessToken: string,
): Promise<WorkManagementDashboardSummary> {
  return apiRequest<WorkManagementDashboardSummary>(
    "/work-items/management/dashboard-summary",
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function getManagementOrganizationSummary(
  accessToken: string,
): Promise<WorkManagementOrganizationSummaryResponse> {
  return apiRequest<WorkManagementOrganizationSummaryResponse>(
    "/work-items/management/organization-summary",
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function listManagementAssignmentOptions(
  accessToken: string,
  query: WorkAssignmentOptionsQuery = {},
): Promise<WorkAssignmentOptionsResponse> {
  return apiRequest<WorkAssignmentOptionsResponse>(
    `/work-items/management/assignment-options${buildQueryString(query)}`,
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

// The API remains the source of truth for role scope even when the UI supplies a focus.
export function listWorkItems(
  accessToken: string,
  query: WorkItemListQuery = {},
): Promise<WorkItemListResponse> {
  return apiRequest<WorkItemListResponse>(
    `/work-items${buildQueryString(query)}`,
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export const listEmployeeWorkItems = listWorkItems;

export function placeWorkRetentionHold(
  accessToken: string,
  workItemId: string,
  reason: string,
): Promise<WorkMutationResponse> {
  return apiRequest<WorkMutationResponse>(
    `/work-items/${workItemId}/retention/hold`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify({ reason }),
    },
  );
}

export function releaseWorkRetentionHold(
  accessToken: string,
  workItemId: string,
): Promise<WorkMutationResponse> {
  return apiRequest<WorkMutationResponse>(
    `/work-items/${workItemId}/retention/hold`,
    {
      method: "DELETE",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function requestWorkDeletionReview(
  accessToken: string,
  workItemId: string,
  reason: string,
): Promise<WorkMutationResponse> {
  return apiRequest<WorkMutationResponse>(
    `/work-items/${workItemId}/retention/deletion-request`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify({ reason }),
    },
  );
}

export function cancelWorkDeletionReview(
  accessToken: string,
  workItemId: string,
): Promise<WorkMutationResponse> {
  return apiRequest<WorkMutationResponse>(
    `/work-items/${workItemId}/retention/deletion-request`,
    {
      method: "DELETE",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function getWorkItem(
  accessToken: string,
  workItemId: string,
): Promise<WorkItemDetailResponse> {
  return apiRequest<WorkItemDetailResponse>(`/work-items/${workItemId}`, {
    headers: authorizationHeaders(accessToken),
  });
}

export const getEmployeeWorkItem = getWorkItem;

export function listWorkActivity(
  accessToken: string,
  workItemId: string,
): Promise<WorkActivityResponse> {
  return apiRequest<WorkActivityResponse>(
    `/work-items/${workItemId}/activity`,
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export const listEmployeeWorkActivity = listWorkActivity;

export function listPendingEmployeeHelpRequests(
  accessToken: string,
): Promise<PendingWorkHelpRequestsResponse> {
  return apiRequest<PendingWorkHelpRequestsResponse>(
    "/work-items/help-requests/pending",
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function createManagementWorkItem(
  accessToken: string,
  payload: CreateWorkItemInput,
): Promise<WorkMutationResponse> {
  return apiRequest<WorkMutationResponse>("/work-items", {
    method: "POST",
    headers: authorizationHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function acknowledgeEmployeeWork(
  accessToken: string,
  workItemId: string,
): Promise<WorkMutationResponse> {
  return apiRequest<WorkMutationResponse>(
    `/work-items/${workItemId}/acknowledge`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function startEmployeeWork(
  accessToken: string,
  workItemId: string,
): Promise<WorkMutationResponse> {
  return apiRequest<WorkMutationResponse>(`/work-items/${workItemId}/start`, {
    method: "POST",
    headers: authorizationHeaders(accessToken),
  });
}


export function listEmployeeWorkSalesMessages(
  accessToken: string,
  workItemId: string,
): Promise<WorkSalesMessageListResponse> {
  return apiRequest<WorkSalesMessageListResponse>(
    `/work-items/${workItemId}/sales/messages`,
    { headers: authorizationHeaders(accessToken) },
  );
}

export function sendEmployeeWorkSalesMessage(
  accessToken: string,
  workItemId: string,
  payload: { text?: string; files?: File[] },
): Promise<WorkSalesMessageMutationResponse> {
  const formData = new FormData();
  if (payload.text?.trim()) formData.set("text", payload.text.trim());
  for (const file of payload.files ?? []) formData.append("files", file);

  return apiRequest<WorkSalesMessageMutationResponse>(
    `/work-items/${workItemId}/sales/messages`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: formData,
    },
  );
}

export function sendEmployeeWorkToSales(
  accessToken: string,
  workItemId: string,
  note?: string,
): Promise<WorkMutationResponse> {
  return apiRequest<WorkMutationResponse>(`/work-items/${workItemId}/sales/send`, {
    method: "POST",
    headers: authorizationHeaders(accessToken),
    body: JSON.stringify({ note: note?.trim() || undefined }),
  });
}

export function completeEmployeeSalesWork(
  accessToken: string,
  workItemId: string,
  note?: string,
): Promise<WorkMutationResponse> {
  return apiRequest<WorkMutationResponse>(`/work-items/${workItemId}/sales/complete`, {
    method: "POST",
    headers: authorizationHeaders(accessToken),
    body: JSON.stringify({ note: note?.trim() || undefined }),
  });
}

export function downloadEmployeeWorkSalesAttachment(
  accessToken: string,
  workItemId: string,
  messageId: string,
  attachmentId: string,
) {
  return apiDownload(
    `/work-items/${workItemId}/sales/messages/${messageId}/attachments/${attachmentId}`,
    { headers: authorizationHeaders(accessToken) },
  );
}

export function requestEmployeeWorkHelp(
  accessToken: string,
  workItemId: string,
  payload: {
    reason: WorkHelpReason;
    note?: string;
    requestedHelperAccountId?: string;
    requestedDepartmentId?: string;
  },
): Promise<WorkHelpMutationResponse> {
  return apiRequest<WorkHelpMutationResponse>(
    `/work-items/${workItemId}/help-requests`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify(payload),
    },
  );
}

export function respondToEmployeeHelpRequest(
  accessToken: string,
  helpRequestId: string,
  payload: {
    accept: boolean;
    note?: string;
  },
): Promise<WorkMutationResponse> {
  return apiRequest<WorkMutationResponse>(
    `/work-items/help-requests/${helpRequestId}/respond`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify(payload),
    },
  );
}

export function submitEmployeeWorkCompletion(
  accessToken: string,
  workItemId: string,
  payload: {
    result: WorkCompletionResult;
    summary: string;
    customerId?: string;
    rxLevelDbm?: number;
    moreWorkRequired: boolean;
  },
): Promise<WorkCompletionMutationResponse> {
  return apiRequest<WorkCompletionMutationResponse>(
    `/work-items/${workItemId}/completion-reports`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify(payload),
    },
  );
}

export function updateManagementWorkItem(
  accessToken: string,
  workItemId: string,
  payload: {
      registeredAt?: string;
    plannedStartAt?: string;
    dueAt?: string;
    locationText?: string;
  },
): Promise<WorkMutationResponse> {
  return apiRequest<WorkMutationResponse>(`/work-items/${workItemId}`, {
    method: "PATCH",
    headers: authorizationHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function reassignManagementWorkItem(
  accessToken: string,
  workItemId: string,
  payload: {
    primaryAssigneeAccountId: string;
    reason: string;
  },
): Promise<WorkMutationResponse> {
  return apiRequest<WorkMutationResponse>(
    `/work-items/${workItemId}/reassign`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify(payload),
    },
  );
}

export function addManagementWorkSupport(
  accessToken: string,
  workItemId: string,
  payload: { accountId: string; reason?: string },
): Promise<WorkMutationResponse> {
  return apiRequest<WorkMutationResponse>(
    `/work-items/${workItemId}/support/add`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify(payload),
    },
  );
}

export function removeManagementWorkSupport(
  accessToken: string,
  workItemId: string,
  payload: { accountId: string; reason?: string },
): Promise<WorkMutationResponse> {
  return apiRequest<WorkMutationResponse>(
    `/work-items/${workItemId}/support/remove`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify(payload),
    },
  );
}

export function requestManagementWorkInformation(
  accessToken: string,
  workItemId: string,
  note: string,
): Promise<WorkMutationResponse> {
  return apiRequest<WorkMutationResponse>(
    `/work-items/${workItemId}/review/request-information`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify({ note }),
    },
  );
}

export function closeManagementWorkItem(
  accessToken: string,
  workItemId: string,
  note: string,
): Promise<WorkMutationResponse> {
  return apiRequest<WorkMutationResponse>(
    `/work-items/${workItemId}/review/close`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify({ note }),
    },
  );
}

export function reopenManagementWorkItem(
  accessToken: string,
  workItemId: string,
  note: string,
): Promise<WorkMutationResponse> {
  return apiRequest<WorkMutationResponse>(
    `/work-items/${workItemId}/review/reopen`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify({ note }),
    },
  );
}

export function cancelManagementWorkItem(
  accessToken: string,
  workItemId: string,
  reason: string,
): Promise<WorkMutationResponse> {
  return apiRequest<WorkMutationResponse>(`/work-items/${workItemId}/cancel`, {
    method: "POST",
    headers: authorizationHeaders(accessToken),
    body: JSON.stringify({ reason }),
  });
}


export function getMyDutySummary(
  accessToken: string,
): Promise<MyDutySummary> {
  return apiRequest<MyDutySummary>("/duty/me", {
    headers: authorizationHeaders(accessToken),
  });
}

export function updateMyWorkAvailability(
  accessToken: string,
  preference: WorkAvailabilityPreference,
): Promise<{ message: string; availability: MyDutySummary["availability"] }> {
  return apiRequest("/duty/me/availability", {
    method: "PATCH",
    headers: authorizationHeaders(accessToken),
    body: JSON.stringify({ preference }),
  });
}

export function listDutyHelpRecommendations(
  accessToken: string,
  workItemId: string,
): Promise<DutyHelpRecommendationResponse> {
  return apiRequest<DutyHelpRecommendationResponse>(
    `/duty/work-items/${workItemId}/help-recommendations`,
    { headers: authorizationHeaders(accessToken) },
  );
}

export function listManagementDutyHelpRecommendations(
  accessToken: string,
  departmentId: string,
): Promise<DutyManagementHelpRecommendationResponse> {
  return apiRequest<DutyManagementHelpRecommendationResponse>(
    `/duty/management/help-recommendations${buildQueryString({ departmentId })}`,
    { headers: authorizationHeaders(accessToken) },
  );
}

export function listDutyCoverageRequirements(
  accessToken: string,
  query: DutyCoverageRequirementQuery = {},
): Promise<DutyCoverageRequirementListResponse> {
  return apiRequest<DutyCoverageRequirementListResponse>(
    `/duty/management/coverage-requirements${buildQueryString(query)}`,
    { headers: authorizationHeaders(accessToken) },
  );
}

export function createDutyCoverageRequirement(
  accessToken: string,
  payload: DutyCoverageRequirementInput,
): Promise<DutyCoverageRequirement> {
  return apiRequest<DutyCoverageRequirement>(
    "/duty/management/coverage-requirements",
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify(payload),
    },
  );
}

export function updateDutyCoverageRequirement(
  accessToken: string,
  requirementId: string,
  payload: DutyCoverageRequirementUpdateInput,
): Promise<DutyCoverageRequirement> {
  return apiRequest<DutyCoverageRequirement>(
    `/duty/management/coverage-requirements/${requirementId}`,
    {
      method: "PATCH",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify(payload),
    },
  );
}

export function getDutyCoverageRequirementAudit(
  accessToken: string,
  requirementId: string,
): Promise<DutyCoverageRequirementAuditResponse> {
  return apiRequest<DutyCoverageRequirementAuditResponse>(
    `/duty/management/coverage-requirements/${requirementId}/audit`,
    { headers: authorizationHeaders(accessToken) },
  );
}

export function getDutyManagementSummary(
  accessToken: string,
): Promise<DutyManagementSummary> {
  return apiRequest<DutyManagementSummary>("/duty/management/summary", {
    headers: authorizationHeaders(accessToken),
  });
}

export function listDutyShiftTemplates(
  accessToken: string,
  query: { targetScope?: DutyShiftScope; divisionId?: string; departmentId?: string } = {},
): Promise<DutyShiftTemplateListResponse> {
  return apiRequest<DutyShiftTemplateListResponse>(
    `/duty/management/shift-templates${buildQueryString(query)}`,
    { headers: authorizationHeaders(accessToken) },
  );
}

export function createDutyShiftTemplate(
  accessToken: string,
  payload: {
    name: string;
    startTime: string;
    endTime: string;
    scope: DutyShiftScope;
    divisionId?: string;
    departmentId?: string;
  },
): Promise<DutyMutationResponse> {
  return apiRequest<DutyMutationResponse>("/duty/management/shift-templates", {
    method: "POST",
    headers: authorizationHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function updateDutyShiftTemplate(
  accessToken: string,
  templateId: string,
  payload: {
    name?: string;
    startTime?: string;
    endTime?: string;
    isActive?: boolean;
  },
): Promise<DutyMutationResponse> {
  return apiRequest<DutyMutationResponse>(
    `/duty/management/shift-templates/${templateId}`,
    {
      method: "PATCH",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify(payload),
    },
  );
}

export function deleteDutyShiftTemplate(
  accessToken: string,
  templateId: string,
): Promise<DutyMutationResponse> {
  return apiRequest<DutyMutationResponse>(
    `/duty/management/shift-templates/${templateId}`,
    {
      method: "DELETE",
      headers: authorizationHeaders(accessToken),
    },
  );
}

// Roster endpoints return scoped summaries; detailed person routines are loaded only on demand.
export function getDutyRoster(
  accessToken: string,
  query: DutyRosterQuery = {},
): Promise<DutyRosterResponse> {
  return apiRequest<DutyRosterResponse>(
    `/duty/management/roster${buildQueryString(query)}`,
    { headers: authorizationHeaders(accessToken) },
  );
}

// Preview is read-only and must precede bulk creation in the management UI.
export function previewBulkDutySchedule(
  accessToken: string,
  payload: BulkDutyScheduleInput,
): Promise<BulkDutyPreviewResponse> {
  return apiRequest<BulkDutyPreviewResponse>(
    "/duty/management/assignments/preview",
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify(payload),
    },
  );
}

export function createBulkDutySchedule(
  accessToken: string,
  payload: BulkDutyScheduleInput,
): Promise<DutyMutationResponse & {
  createdCount: number;
  skippedConflictCount: number;
  warningCount: number;
}> {
  return apiRequest(
    "/duty/management/assignments/bulk",
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify(payload),
    },
  );
}

export function listDutyAssignments(
  accessToken: string,
  query: DutyAssignmentQuery = {},
): Promise<DutyAssignmentListResponse> {
  return apiRequest<DutyAssignmentListResponse>(
    `/duty/management/assignments${buildQueryString(query)}`,
    { headers: authorizationHeaders(accessToken) },
  );
}

export function createDutySchedule(
  accessToken: string,
  payload: {
    employeeAccountId: string;
    shiftTemplateId: string;
    supervisorAccountId?: string;
    recurrenceType: DutyRecurrenceType;
    startDate: string;
    endDate?: string;
    weekdays?: number[];
    reportingLocation: string;
    notes?: string;
  },
): Promise<DutyMutationResponse> {
  return apiRequest<DutyMutationResponse>("/duty/management/assignments", {
    method: "POST",
    headers: authorizationHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function updateDutyAssignment(
  accessToken: string,
  assignmentId: string,
  payload: {
    shiftTemplateId?: string;
    supervisorAccountId?: string;
    reportingLocation?: string;
    notes?: string;
  },
): Promise<DutyMutationResponse> {
  return apiRequest<DutyMutationResponse>(
    `/duty/management/assignments/${assignmentId}`,
    {
      method: "PATCH",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify(payload),
    },
  );
}

export function cancelDutyAssignment(
  accessToken: string,
  assignmentId: string,
  reason: string,
): Promise<DutyMutationResponse> {
  return apiRequest<DutyMutationResponse>(
    `/duty/management/assignments/${assignmentId}/cancel`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify({ reason }),
    },
  );
}

export function createDutyLeave(
  accessToken: string,
  payload: { employeeAccountId: string; startDate: string; endDate: string; note?: string },
): Promise<DutyMutationResponse> {
  return apiRequest<DutyMutationResponse>("/duty/management/leaves", {
    method: "POST",
    headers: authorizationHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function getDutyCalendar(
  accessToken: string,
  query: { from?: string; to?: string; divisionId?: string; departmentId?: string; includeCancelled?: boolean } = {},
): Promise<DutyCalendarResponse> {
  return apiRequest<DutyCalendarResponse>(`/duty/calendar${buildQueryString(query)}`, {
    headers: authorizationHeaders(accessToken),
  });
}

export function createDutyHoliday(
  accessToken: string,
  payload: {
    name: string;
    type: DutyHolidayType;
    startDate: string;
    endDate: string;
    scope: DutyHolidayScope;
    divisionId?: string;
    departmentId?: string;
    note?: string;
  },
): Promise<DutyMutationResponse & { holiday?: unknown }> {
  return apiRequest("/duty/management/holidays", {
    method: "POST",
    headers: authorizationHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function updateDutyHoliday(
  accessToken: string,
  holidayId: string,
  payload: Partial<{
    name: string;
    type: DutyHolidayType;
    startDate: string;
    endDate: string;
    scope: DutyHolidayScope;
    divisionId: string;
    departmentId: string;
    note: string;
  }>,
): Promise<DutyMutationResponse & { holiday?: unknown }> {
  return apiRequest(`/duty/management/holidays/${holidayId}`, {
    method: "PATCH",
    headers: authorizationHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function cancelDutyHoliday(
  accessToken: string,
  holidayId: string,
): Promise<DutyMutationResponse> {
  return apiRequest(`/duty/management/holidays/${holidayId}/cancel`, {
    method: "POST",
    headers: authorizationHeaders(accessToken),
  });
}

export function updateDutyWeeklyOff(
  accessToken: string,
  days: number[],
): Promise<DutyMutationResponse> {
  return apiRequest("/duty/management/weekly-off", {
    method: "PATCH",
    headers: authorizationHeaders(accessToken),
    body: JSON.stringify({ days }),
  });
}

export function coordinateManagementHelpRequest(
  accessToken: string,
  helpRequestId: string,
  payload: { helperAccountId: string; note?: string },
): Promise<WorkMutationResponse> {
  return apiRequest<WorkMutationResponse>(
    `/work-items/help-requests/${helpRequestId}/coordinate`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify(payload),
    },
  );
}

export function getWorkReportSummary(
  accessToken: string,
  query: WorkReportQuery = {},
): Promise<WorkReportSummary> {
  return apiRequest<WorkReportSummary>(
    `/work-reports/summary${buildQueryString(query)}`,
    { headers: authorizationHeaders(accessToken) },
  );
}


export function getWorkReportDrilldown(
  accessToken: string,
  query: WorkReportDrilldownQuery,
): Promise<WorkReportDrilldownResponse> {
  // The API re-applies role and organization scope for every paginated drill-down request.
  return apiRequest<WorkReportDrilldownResponse>(
    `/work-reports/drilldown${buildQueryString(query)}`,
    { headers: authorizationHeaders(accessToken) },
  );
}

export async function downloadWorkReportCsv(
  accessToken: string,
  dataset: WorkReportDataset,
  query: WorkReportQuery = {},
): Promise<{ filename: string; truncated: boolean }> {
  const download = await apiDownload(
    `/work-reports/export${buildQueryString({ ...query, dataset })}`,
    { headers: authorizationHeaders(accessToken) },
  );
  const objectUrl = URL.createObjectURL(download.blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = download.filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);

  return {
    filename: download.filename,
    truncated: download.truncated,
  };
}
