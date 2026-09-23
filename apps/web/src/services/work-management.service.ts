import { apiRequest } from "../lib/api";

import type {
  BulkDutyPreviewResponse,
  BulkDutyScheduleInput,
  DutyAssignmentListResponse,
  DutyAssignmentListView,
  DutyAuthorizationContext,
  DutyCalendarResponse,
  DutyCoverageRequirement,
  DutyCoverageRequirementAuditResponse,
  DutyCoverageRequirementInput,
  DutyCoverageRequirementListResponse,
  DutyCoverageRequirementUpdateInput,
  DutyHelpRecommendationResponse,
  DutyHolidayScope,
  DutyHolidayType,
  DutyManagementHelpRecommendationResponse,
  DutyManagementSummary,
  DutyMutationResponse,
  DutyRecurrenceType,
  DutyRosterResponse,
  DutyShiftScope,
  DutyShiftTemplateListResponse,
  DutySupervisorOptionsResponse,
  MyDutySummary,
  PendingWorkHelpRequestsResponse,
  WorkAvailabilityPreference,
  WorkMutationResponse,
  WorkCreateContext,
  CreateWorkInput,
  CreateWorkResponse,
  WorkItemDetail,
  WorkItemListResponse,
  WorkItemStatus,
} from "../types/work-management";

function authorizationHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export interface DutyCoverageRequirementQuery {
  orgUnitId?: string;
  shiftTemplateId?: string;
  dayOfWeek?: number;
  from?: string;
  to?: string;
}

export interface DutyRosterQuery {
  orgUnitId?: string;
  operationalTeamId?: string;
  from?: string;
  to?: string;
  employeeAccountId?: string;
  search?: string;
  limit?: number;
}

export interface DutyAssignmentQuery {
  orgUnitId?: string;
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  employeeAccountId?: string;
  view?: DutyAssignmentListView;
  includeCancelled?: boolean;
}

function buildQueryString(
  query:
    | DutyAssignmentQuery
    | DutyRosterQuery
    | DutyCoverageRequirementQuery
    | WorkItemQuery
    | Record<string, string | number | boolean | undefined>,
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


export interface WorkItemQuery {
  view?: "ACTIVE" | "HISTORY";
  page?: number;
  limit?: number;
  search?: string;
  status?: WorkItemStatus;
  workTypeVersionId?: string;
  orgUnitId?: string;
  operationalTeamId?: string;
  assigneeAccountId?: string;
}

export function getWorkCreateContext(
  accessToken: string,
  officeId: string,
): Promise<WorkCreateContext> {
  return apiRequest<WorkCreateContext>(`/work-items/offices/${officeId}/create-context`, {
    headers: authorizationHeaders(accessToken),
  });
}

export function createWork(
  accessToken: string,
  officeId: string,
  payload: CreateWorkInput,
): Promise<CreateWorkResponse> {
  return apiRequest<CreateWorkResponse>(`/work-items/offices/${officeId}`, {
    method: "POST",
    headers: authorizationHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function listWorkItems(
  accessToken: string,
  query: WorkItemQuery = {},
): Promise<WorkItemListResponse> {
  return apiRequest<WorkItemListResponse>(`/work-items${buildQueryString(query)}`, {
    headers: authorizationHeaders(accessToken),
  });
}

export function getWorkItem(accessToken: string, workItemId: string): Promise<WorkItemDetail> {
  return apiRequest<WorkItemDetail>(`/work-items/${workItemId}`, {
    headers: authorizationHeaders(accessToken),
  });
}

function workMutation(accessToken: string, path: string, payload?: unknown): Promise<WorkMutationResponse> {
  return apiRequest<WorkMutationResponse>(path, {
    method: "POST",
    headers: authorizationHeaders(accessToken),
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
}

export const acknowledgeWork = (accessToken: string, id: string) => workMutation(accessToken, `/work-items/${id}/acknowledge`);
export const startWork = (accessToken: string, id: string) => workMutation(accessToken, `/work-items/${id}/start`);
export const submitWorkCompletion = (accessToken: string, id: string, payload: { result: string; summary: string; customerId?: string; rxLevelDbm?: number; fields?: Array<{ code: string; value: unknown }>; moreWorkRequired?: boolean }) => workMutation(accessToken, `/work-items/${id}/completion-reports`, payload);
export const requestWorkCorrection = (accessToken: string, id: string, note: string) => workMutation(accessToken, `/work-items/${id}/review/request-information`, { note });
export const approveWorkCompletion = (accessToken: string, id: string, note: string) => workMutation(accessToken, `/work-items/${id}/review/close`, { note });
export const reopenWork = (accessToken: string, id: string, note: string) => workMutation(accessToken, `/work-items/${id}/review/reopen`, { note });
export const cancelWork = (accessToken: string, id: string, reason: string) => workMutation(accessToken, `/work-items/${id}/cancel`, { reason });
export const reassignWork = (accessToken: string, id: string, payload: { mainOperationalTeamId?: string; mainAssigneeAccountId?: string; reason: string }) => workMutation(accessToken, `/work-items/${id}/reassign`, payload);
export const addWorkSupport = (accessToken: string, id: string, accountId: string, reason?: string) => workMutation(accessToken, `/work-items/${id}/support/add`, { accountId, reason });
export const removeWorkSupport = (accessToken: string, id: string, accountId: string, reason?: string) => workMutation(accessToken, `/work-items/${id}/support/remove`, { accountId, reason });
export const sendWorkToSales = (accessToken: string, id: string, note?: string) => workMutation(accessToken, `/work-items/${id}/sales/send`, { note });
export const completeSalesWork = (accessToken: string, id: string, note?: string) => workMutation(accessToken, `/work-items/${id}/sales/complete`, { note });

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

export function listDutySupervisorOptions(
  accessToken: string,
): Promise<DutySupervisorOptionsResponse> {
  return apiRequest<DutySupervisorOptionsResponse>(
    "/duty/management/supervisor-options",
    {
      headers: authorizationHeaders(accessToken),
    },
  );
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
  orgUnitId: string,
): Promise<DutyManagementHelpRecommendationResponse> {
  return apiRequest<DutyManagementHelpRecommendationResponse>(
    `/duty/management/help-recommendations${buildQueryString({ orgUnitId })}`,
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

export function getDutyManagementAccessContext(
  accessToken: string,
): Promise<DutyAuthorizationContext> {
  return apiRequest<DutyAuthorizationContext>("/duty/management/access-context", {
    headers: authorizationHeaders(accessToken),
  });
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
  query: { targetScope?: DutyShiftScope; orgUnitId?: string } = {},
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
    orgUnitId?: string;
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
  query: { from?: string; to?: string; orgUnitId?: string; includeCancelled?: boolean } = {},
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
    orgUnitId?: string;
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
    orgUnitId: string;
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
