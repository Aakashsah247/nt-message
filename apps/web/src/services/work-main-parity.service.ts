import { apiDownload, apiRequest } from "../lib/api";
import { getOrganizationTree, getOrganizationWorkspaceContext } from "./organization-v3.service";
import {
  listDutyHelpRecommendations as listDutyHelpRecommendationsCurrent,
} from "./work-management.service";
import type {
  DutyHelpRecommendationResponse as CurrentDutyHelpRecommendationResponse,
} from "../types/work-management";
import type {
  DepartmentWorkFunction,
  DutyHelpRecommendationResponse,
  WorkAccountSummary,
  WorkActivity,
  WorkActivityResponse,
  WorkAssignmentCandidate,
  WorkAssignmentOptionsResponse,
  WorkCompletionMutationResponse,
  WorkCompletionResult,
  WorkContactType,
  WorkDepartmentOption,
  WorkEmployeeDashboardSummary,
  WorkHelpMaterialType,
  WorkHelpMutationResponse,
  WorkHelpReason,
  WorkHelpRequest,
  WorkItem,
  WorkItemDetailResponse,
  WorkItemListResponse,
  WorkItemStatus,
  WorkItemType,
  WorkloadLevel,
  WorkManagementDashboardSummary,
  WorkManagementOrganizationSummaryResponse,
  WorkMutationResponse,
  WorkQueueFocus,
  WorkQueueView,
  WorkReportDataset,
  WorkReportDrilldownDataset,
  WorkReportDrilldownDutyRow,
  WorkReportDrilldownResponse,
  WorkReportDrilldownWorkRow,
  WorkReportPerformanceRow,
  WorkReportSummary,
  WorkReportWorkflowStageFilter,
  WorkSalesMessage,
  WorkServiceType,
} from "../types/work-main-parity";

function authorizationHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

function buildQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const output = params.toString();
  return output ? `?${output}` : "";
}

const CURRENT_TO_MAIN_TYPE: Record<string, WorkItemType> = {
  ROUTINE_WORK: "ROUTINE_TASK",
  TROUBLE_TICKET: "TROUBLE_TICKET",
  NETWORK_MAINTENANCE: "MAINTENANCE",
  NEW_INSTALLATION: "NEW_CONNECTION",
  UPDATE_SERVICES: "UPDATE_SERVICES",
  INSPECTION: "INSPECTION",
  EMERGENCY_WORK: "EMERGENCY_WORK",
  ADMINISTRATIVE_WORK: "ADMINISTRATIVE_TASK",
};

const MAIN_TO_CURRENT_TYPE: Record<WorkItemType, string> = {
  ROUTINE_TASK: "ROUTINE_WORK",
  TROUBLE_TICKET: "TROUBLE_TICKET",
  MAINTENANCE: "NETWORK_MAINTENANCE",
  NEW_CONNECTION: "NEW_INSTALLATION",
  UPDATE_SERVICES: "UPDATE_SERVICES",
  INSPECTION: "INSPECTION",
  EMERGENCY_WORK: "EMERGENCY_WORK",
  ADMINISTRATIVE_TASK: "ADMINISTRATIVE_WORK",
};

interface MainWorkListQuery {
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
  workTypeId?: string;
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

export interface CreateWorkItemInput {
  type: WorkItemType;
  workTypeVersionId: string;
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
  fields?: Array<{ code: string; value: unknown }>;
  registeredAt?: string;
  plannedStartAt?: string;
  dueAt: string;
  primaryExecutionOrgUnitId: string;
  primaryAssigneeAccountId?: string;
  assignedTeamId?: string;
  salesOrgUnitId?: string;
  salesMemberAccountId?: string;
  supportOrgUnitId?: string;
  supportingAssigneeAccountIds?: string[];
  responsibleManagerAccountId?: string;
  parentWorkItemId?: string;
  delegationInstructions?: string;
}

interface WorkspaceIdentity {
  officeId: string;
  accountId: string;
  accountClass: "SUPER_ADMIN" | "OFFICE_USER";
  role: WorkAccountSummary["role"];
}

async function workspaceIdentity(accessToken: string): Promise<WorkspaceIdentity> {
  const [workspace, me] = await Promise.all([
    getOrganizationWorkspaceContext(accessToken),
    apiRequest<any>("/auth/me", { headers: authorizationHeaders(accessToken) }),
  ]);
  const officeId = workspace.scope.officeIds[0];
  if (!officeId) throw new Error("Your Work Office could not be resolved.");
  const accountClass = me?.account?.accountClass === "SUPER_ADMIN" ? "SUPER_ADMIN" : "OFFICE_USER";
  const role: WorkAccountSummary["role"] = accountClass === "SUPER_ADMIN"
    ? "SUPER_ADMIN"
    : workspace.authority.isOfficeHead
      ? "SENIOR_MANAGEMENT"
      : (workspace.authority.isOrganizationHead || workspace.authority.isOrgUnitHead || workspace.features.workManagement)
        ? "TEAM_MANAGER"
        : "EMPLOYEE";
  return { officeId, accountId: me.account.id, accountClass, role };
}

function legacyRole(raw: any): WorkAccountSummary["role"] {
  if (raw?.role === "SUPER_ADMIN" || raw?.accountClass === "SUPER_ADMIN") return "SUPER_ADMIN";
  return "EMPLOYEE";
}

function mapAccount(raw: any, roleOverride?: WorkAccountSummary["role"]): WorkAccountSummary {
  const membership = raw?.employee?.orgMemberships?.[0];
  return {
    id: raw?.id ?? "",
    role: roleOverride ?? legacyRole(raw),
    username: raw?.username ?? null,
    employee: raw?.employee ? {
      id: raw.employee.id,
      empId: raw.employee.empId ?? "",
      empName: raw.employee.empName ?? raw.username ?? "NT Message user",
      designation: raw.employee.designation ?? null,
      divisionId: membership?.orgUnitId ?? null,
      departmentId: membership?.orgUnitId ?? null,
    } : null,
    superAdminProfile: raw?.superAdminProfile ?? null,
  };
}

function mapCompletionReport(report: any, rawWork: any) {
  return {
    id: report.id,
    result: report.result,
    summary: report.summary,
    cpcSerial: rawWork?.cpcSerial ?? null,
    serviceNumber: rawWork?.serviceNumber ?? null,
    customerId: report.customerId ?? null,
    rxLevelDbm: report.rxLevelDbm ?? null,
    olt: rawWork?.olt ?? null,
    fdcName: rawWork?.fdcName ?? null,
    fapName: rawWork?.fapName ?? null,
    moreWorkRequired: Boolean(report.moreWorkRequired),
    fieldValuesSnapshot: Array.isArray(report.fieldValuesSnapshot)
      ? report.fieldValuesSnapshot
          .filter((item: any) => item && typeof item.code === "string")
          .map((item: any) => ({ code: item.code, value: item.value }))
      : null,
    reviewStatus: report.reviewStatus,
    managerNote: report.managerNote ?? null,
    reviewedAt: report.reviewedAt ?? null,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt ?? report.reviewedAt ?? report.createdAt,
    submittedBy: mapAccount(report.submittedBy),
    reviewedBy: report.reviewedBy ? mapAccount(report.reviewedBy) : null,
    evidence: (report.evidence ?? []).map((evidence: any) => ({
      id: evidence.id,
      originalFileName: evidence.originalFileName,
      mimeType: evidence.mimeType,
      fileSizeBytes: Number(evidence.fileSizeBytes ?? 0),
      expiresAt: evidence.expiresAt ?? null,
      expiredAt: evidence.expiredAt ?? null,
      purgedAt: evidence.purgedAt ?? null,
      createdAt: evidence.createdAt,
    })),
  };
}

function mainType(raw: any): WorkItemType {
  const code = raw?.workTypeVersion?.workTypeDefinition?.code ?? raw?.workTypeCode ?? "ROUTINE_WORK";
  return CURRENT_TO_MAIN_TYPE[code] ?? "ROUTINE_TASK";
}

function teamSummary(raw: any, assignments: any[] = []) {
  if (!raw) return null;

  const members = (raw.members ?? []).map((membership: any) => {
    const employee = membership.employee;
    const account = employee?.account
      ? mapAccount({
          ...employee.account,
          employee: {
            id: employee.id,
            empId: employee.empId,
            empName: employee.empName,
            designation: employee.designation ?? null,
            orgMemberships: raw.orgUnit
              ? [{ orgUnitId: raw.orgUnit.id, orgUnit: raw.orgUnit }]
              : [],
          },
        })
      : null;
    return {
      id: membership.id,
      employee: {
        id: employee?.id ?? membership.id,
        empId: employee?.empId ?? "",
        empName: employee?.empName ?? account?.username ?? "Team member",
        designation: employee?.designation ?? null,
        account,
      },
    };
  });

  const leadEmployeeId = raw.leadAssignments?.[0]?.employeeId ?? null;
  const leadMember =
    members.find(
      (member: { employee: { id: string } }) =>
        member.employee.id === leadEmployeeId,
    ) ?? null;
  const primary = assignments.find((assignment) => assignment.assignmentRole === "PRIMARY");
  const primaryAccount = primary?.assignee ? mapAccount(primary.assignee) : null;
  const fallbackMember = leadMember ?? members[0] ?? null;
  const teamAdminAccount = fallbackMember?.employee.account ?? primaryAccount;

  return {
    id: raw.id,
    name: raw.name,
    departmentId: raw.orgUnitId ?? raw.orgUnit?.id ?? "",
    isActive: true,
    archivedAt: null,
    teamAdmin: {
      id: fallbackMember?.employee.id ?? primaryAccount?.employee?.id ?? raw.id,
      empId: fallbackMember?.employee.empId ?? primaryAccount?.employee?.empId ?? "",
      empName:
        fallbackMember?.employee.empName ??
        primaryAccount?.employee?.empName ??
        "Team member",
      designation:
        fallbackMember?.employee.designation ??
        primaryAccount?.employee?.designation ??
        null,
      account: teamAdminAccount,
    },
    _count: { members: members.length },
    members,
  };
}

function mapWork(raw: any): WorkItem {
  const owner = raw?.primaryOwnerOrgUnit ?? raw?.assignedOperationalTeam?.orgUnit ?? { id: "", code: "", name: "Org Unit" };
  const assignments = (raw?.assignments ?? []).map((assignment: any) => ({
    id: assignment.id,
    assignmentRole: assignment.assignmentRole,
    acknowledgedAt: assignment.acknowledgedAt ?? null,
    startedAt: assignment.startedAt ?? null,
    createdAt: assignment.createdAt ?? raw.createdAt,
    assignee: mapAccount(assignment.assignee),
    assignedBy: mapAccount(assignment.assignedBy ?? raw.createdBy),
  }));
  const completionReports = raw?.completionReports?.map((report: any) => mapCompletionReport(report, raw));
  const type = mainType(raw);
  return {
    id: raw.id,
    ticketNumber: raw.ticketNumber,
    type,
    title: raw.title,
    description: raw.description ?? "",
    category: null,
    customerName: raw.customerName ?? null,
    customerContactType: raw.customerContactType ?? null,
    customerContactNumber: raw.customerContactNumber ?? null,
    serviceTypes: (raw.serviceTypes ?? []) as WorkServiceType[],
    otherServiceText: raw.otherServiceText ?? null,
    requestNumber: raw.requestNumber ?? null,
    cpcSerial: raw.cpcSerial ?? null,
    serviceNumber: raw.serviceNumber ?? null,
    olt: raw.olt ?? null,
    fdcName: raw.fdcName ?? null,
    fapName: raw.fapName ?? null,
    status: raw.status,
    divisionId: owner.id,
    departmentId: owner.id || null,
    parentWorkItemId: null,
    assignedTeamId: raw.assignedOperationalTeamId ?? null,
    salesMemberAccountId: raw.salesMemberAccountId ?? null,
    salesCoordinationStatus: raw.salesCoordinationStatus ?? null,
    salesDocumentsSentAt: raw.salesDocumentsSentAt ?? null,
    salesCompletedAt: raw.salesCompletedAt ?? null,
    salesCompletionNote: raw.salesCompletionNote ?? null,
    locationText: raw.locationText ?? null,
    registeredAt: raw.registeredAt ?? raw.createdAt,
    plannedStartAt: raw.plannedStartAt ?? null,
    dueAt: raw.dueAt,
    completedAt: raw.completedAt ?? null,
    closedAt: raw.closedAt ?? null,
    cancelledAt: raw.cancelledAt ?? null,
    archiveEligibleAt: raw.archiveEligibleAt ?? null,
    deletionEligibleAt: raw.deletionEligibleAt ?? null,
    retentionHoldAt: raw.retentionHoldAt ?? null,
    retentionHoldReason: raw.retentionHoldReason ?? null,
    deletionRequestedAt: raw.deletionRequestedAt ?? null,
    deletionRequestReason: raw.deletionRequestReason ?? null,
    version: raw.version ?? 1,
    workTypeVersion: raw.workTypeVersion
      ? {
          id: raw.workTypeVersion.id,
          version: Number(raw.workTypeVersion.version ?? 1),
          name: raw.workTypeVersion.name ?? mainType(raw),
          template: raw.workTypeVersion.template ?? null,
          code: raw.workTypeVersion.workTypeDefinition?.code ?? "",
          salesDisplayLabel: raw.workTypeVersion.salesDisplayLabel ?? null,
          fields: (raw.workTypeVersion.fields ?? []).map((field: any) => ({
            id: field.id,
            code: field.code,
            label: field.label ?? field.code,
            fieldType: field.fieldType,
            isRequired: Boolean(field.isRequired),
            sortOrder: Number(field.sortOrder ?? 0),
            stageDefinitionId: field.stageDefinitionId ?? null,
            config: field.config && typeof field.config === "object" ? field.config : null,
          })),
        }
      : undefined,
    fieldValues: (raw.fieldValues ?? []).map((item: any) => ({
      id: item.id,
      value: item.value,
      fieldDefinition: {
        id: item.fieldDefinition?.id ?? "",
        code: item.fieldDefinition?.code ?? "",
        label: item.fieldDefinition?.label ?? item.fieldDefinition?.code ?? "",
        fieldType: item.fieldDefinition?.fieldType ?? "TEXT",
        isRequired: Boolean(item.fieldDefinition?.isRequired),
        sortOrder: Number(item.fieldDefinition?.sortOrder ?? 0),
        stageDefinitionId: item.fieldDefinition?.stageDefinitionId ?? null,
        config: item.fieldDefinition?.config && typeof item.fieldDefinition.config === "object"
          ? item.fieldDefinition.config
          : null,
      },
    })),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    division: owner,
    department: owner,
    assignedTeam: teamSummary(raw.assignedOperationalTeam, raw.assignments ?? []),
    salesMember: raw.salesMember ? mapAccount(raw.salesMember) : null,
    createdBy: mapAccount(raw.createdBy),
    responsibleManager: mapAccount(raw.responsibleReviewer),
    retentionHoldBy: raw.retentionHoldBy ? mapAccount(raw.retentionHoldBy) : null,
    deletionRequestedBy: raw.deletionRequestedBy ? mapAccount(raw.deletionRequestedBy) : null,
    assignments,
    completionReports,
    helpRequests: raw.helpRequests?.map((request: any) => mapHelpRequest(request)),
    parentWorkItem: null,
    childWorkItems: [],
    delegationProgress: undefined,
    delegatedWork: undefined,
  };
}

function mapHelpRequest(raw: any): WorkHelpRequest {
  return {
    id: raw.id,
    workItemId: raw.workItemId,
    reason: raw.reason,
    materialType: raw.materialType ?? null,
    note: raw.note ?? null,
    status: raw.status,
    previousStatus: raw.previousStatus,
    responseNote: raw.responseNote ?? null,
    respondedAt: raw.respondedAt ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    requestedBy: mapAccount(raw.requestedBy),
    requestedHelper: raw.requestedHelper ? mapAccount(raw.requestedHelper) : null,
    requestedDepartment: null,
    respondedBy: raw.respondedBy ? mapAccount(raw.respondedBy) : null,
    coordinatedBy: raw.coordinatedBy ? mapAccount(raw.coordinatedBy) : null,
    coordinatedAt: raw.coordinatedAt ?? null,
    workItem: raw.workItem ? {
      id: raw.workItem.id,
      ticketNumber: raw.workItem.ticketNumber,
      title: raw.workItem.title,
      status: raw.workItem.status,
      dueAt: raw.workItem.dueAt,
      responsibleManagerAccountId: raw.workItem.responsibleReviewerAccountId ?? "",
    } : undefined,
  };
}

async function modernCreateContext(accessToken: string, officeId?: string): Promise<any> {
  const identity = officeId ? null : await workspaceIdentity(accessToken);
  const resolvedOfficeId = officeId ?? identity!.officeId;
  return apiRequest<any>(`/work-items/offices/${resolvedOfficeId}/create-context`, {
    headers: authorizationHeaders(accessToken),
  });
}

async function currentAccountId(accessToken: string): Promise<string> {
  const me = await apiRequest<any>("/auth/me", { headers: authorizationHeaders(accessToken) });
  return me.account.id;
}

async function fetchModernList(accessToken: string, query: Record<string, unknown>): Promise<any> {
  return apiRequest<any>(`/work-items${buildQueryString(query)}`, { headers: authorizationHeaders(accessToken) });
}

async function fetchAllVisible(accessToken: string, view: "ACTIVE" | "HISTORY", base: Record<string, unknown> = {}): Promise<any[]> {
  const first = await fetchModernList(accessToken, { ...base, view, page: 1, limit: 100 });
  const data = [...(first.data ?? [])];
  const pages = Math.min(first.pagination?.totalPages ?? 1, 200);
  for (let page = 2; page <= pages; page += 1) {
    const next = await fetchModernList(accessToken, { ...base, view, page, limit: 100 });
    data.push(...(next.data ?? []));
  }
  return data;
}

function rangeBoundaryTime(value: string, endOfDay: boolean): number {
  const normalized = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(normalized);
  return new Date(
    dateOnly
      ? `${normalized}T${endOfDay ? "23:59:59.999" : "00:00:00"}`
      : normalized,
  ).getTime();
}

function dateInRange(value: string | null | undefined, from?: string, to?: string): boolean {
  if (!value) return !from && !to;

  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;

  if (from) {
    const fromTime = rangeBoundaryTime(from, false);
    if (!Number.isFinite(fromTime) || time < fromTime) return false;
  }
  if (to) {
    const toTime = rangeBoundaryTime(to, true);
    if (!Number.isFinite(toTime) || time > toTime) return false;
  }
  return true;
}

function historyTimestamp(raw: any): string | null | undefined {
  if (raw.status === "CLOSED") {
    return raw.closedAt ?? raw.completedAt ?? raw.updatedAt;
  }
  if (raw.status === "CANCELLED") {
    return raw.cancelledAt ?? raw.updatedAt;
  }
  return raw.updatedAt;
}

export async function listWorkItems(accessToken: string, query: MainWorkListQuery = {}): Promise<WorkItemListResponse> {
  const view = query.view === "HISTORY" || query.view === "ARCHIVE" || query.view === "DELETION_REVIEW" ? "HISTORY" : "ACTIVE";
  const serverQuery: Record<string, unknown> = { view };
  if (query.status) serverQuery.status = query.status;
  if (query.search) serverQuery.search = query.search;
  if (query.departmentId) serverQuery.orgUnitId = query.departmentId;
  else if (query.divisionId) serverQuery.orgUnitId = query.divisionId;
  if (query.assignedTeamId) serverQuery.operationalTeamId = query.assignedTeamId;
  if (query.assigneeAccountId) serverQuery.assigneeAccountId = query.assigneeAccountId;
  if (query.type) {
    const identity = await workspaceIdentity(accessToken);
    const context = await modernCreateContext(accessToken, identity.officeId);
    const code = MAIN_TO_CURRENT_TYPE[query.type];
    const type = context.workTypes?.find((item: any) => item.code === code);
    if (type?.workTypeVersionId) serverQuery.workTypeVersionId = type.workTypeVersionId;
  }

  const needsClientFilter = Boolean(
    query.focus || query.salesMemberAccountId || query.dueFrom || query.dueTo || query.plannedFrom || query.plannedTo || query.historyFrom || query.historyTo || query.view === "ARCHIVE" || query.view === "DELETION_REVIEW",
  );
  let rawRows: any[];
  if (needsClientFilter) rawRows = await fetchAllVisible(accessToken, view, serverQuery);
  else {
    const response = await fetchModernList(accessToken, { ...serverQuery, page: query.page ?? 1, limit: query.limit ?? 25 });
    const mapped = (response.data ?? []).map(mapWork);
    const total = response.pagination?.total ?? mapped.length;
    const focus = query.focus ?? "TEAM_QUEUE";
    return {
      data: mapped,
      pagination: { page: response.pagination?.page ?? 1, limit: response.pagination?.limit ?? (query.limit ?? 25), total, totalPages: response.pagination?.totalPages ?? Math.max(Math.ceil(total / (query.limit ?? 25)), 1) },
      queue: await queueSummary(accessToken, query.view ?? "ACTIVE", focus),
      filters: normalizedFilters(query),
    };
  }

  const accountId = await currentAccountId(accessToken);
  rawRows = rawRows.filter((raw) => {
    if (query.salesMemberAccountId && raw.salesMemberAccountId !== query.salesMemberAccountId) return false;
    if (!dateInRange(raw.dueAt, query.dueFrom, query.dueTo)) return false;
    if (!dateInRange(raw.plannedStartAt, query.plannedFrom, query.plannedTo)) return false;
    if (query.historyFrom || query.historyTo) {
      if (!dateInRange(historyTimestamp(raw), query.historyFrom, query.historyTo)) return false;
    }
    if (query.view === "DELETION_REVIEW" && !raw.deletionRequestedAt) return false;
    if (query.view === "ARCHIVE" && !raw.archiveEligibleAt) return false;
    if (query.focus === "ASSIGNED_TO_ME" && !(raw.assignments ?? []).some((item: any) => item.assignee?.id === accountId)) return false;
    if (query.focus === "CREATED_BY_ME" && raw.createdBy?.id !== accountId) return false;
    if (query.focus === "AWAITING_MY_REVIEW" && !(raw.responsibleReviewer?.id === accountId && raw.status === "COMPLETED_PENDING_REVIEW")) return false;
    if (query.focus === "EXCEPTIONS" && !(raw.status === "HELP_REQUESTED" || raw.status === "BLOCKED" || (new Date(raw.dueAt).getTime() < Date.now() && !["CLOSED", "CANCELLED"].includes(raw.status)))) return false;
    return true;
  });
  const mapped = rawRows.map(mapWork);
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const start = (page - 1) * limit;
  return {
    data: mapped.slice(start, start + limit),
    pagination: { page, limit, total: mapped.length, totalPages: Math.max(Math.ceil(mapped.length / limit), 1) },
    queue: await queueSummary(accessToken, query.view ?? "ACTIVE", query.focus ?? "TEAM_QUEUE"),
    filters: normalizedFilters(query),
  };
}

export const listEmployeeWorkItems = listWorkItems;

function normalizedFilters(query: MainWorkListQuery) {
  return {
    view: query.view ?? "ACTIVE",
    focus: query.focus ?? "TEAM_QUEUE",
    status: query.status ?? null,
    type: query.type ?? null,
    search: query.search ?? null,
    category: query.category ?? null,
    divisionId: query.divisionId ?? null,
    departmentId: query.departmentId ?? null,
    assigneeAccountId: query.assigneeAccountId ?? null,
    assignedTeamId: query.assignedTeamId ?? null,
    salesMemberAccountId: query.salesMemberAccountId ?? null,
    dueFrom: query.dueFrom ?? null,
    dueTo: query.dueTo ?? null,
    plannedFrom: query.plannedFrom ?? null,
    plannedTo: query.plannedTo ?? null,
    historyFrom: query.historyFrom ?? null,
    historyTo: query.historyTo ?? null,
  } as const;
}

async function queueSummary(accessToken: string, view: WorkQueueView, focus: WorkQueueFocus) {
  const [active, history, accountId] = await Promise.all([
    fetchAllVisible(accessToken, "ACTIVE"),
    fetchAllVisible(accessToken, "HISTORY"),
    currentAccountId(accessToken),
  ]);
  const now = Date.now();
  return {
    view,
    focus,
    defaultHistoryDays: 30,
    explorerRequiresFilter: false,
    focusCounts: {
      assignedToMe: active.filter((raw) => (raw.assignments ?? []).some((a: any) => a.assignee?.id === accountId)).length,
      createdByMe: active.filter((raw) => raw.createdBy?.id === accountId).length,
      awaitingMyReview: active.filter((raw) => raw.responsibleReviewer?.id === accountId && raw.status === "COMPLETED_PENDING_REVIEW").length,
      exceptions: active.filter((raw) => raw.status === "HELP_REQUESTED" || raw.status === "BLOCKED" || new Date(raw.dueAt).getTime() < now).length,
    },
    counts: {
      active: active.length,
      recentHistory: history.length,
      archive: history.filter((raw) => raw.archiveEligibleAt).length,
      eligibleForDeletion: history.filter((raw) => raw.deletionEligibleAt && !raw.retentionHoldAt).length,
      deletionRequested: history.filter((raw) => raw.deletionRequestedAt).length,
    },
  };
}

export async function getWorkItem(accessToken: string, workItemId: string): Promise<WorkItemDetailResponse> {
  const raw = await apiRequest<any>(`/work-items/${workItemId}`, { headers: authorizationHeaders(accessToken) });
  return { workItem: mapWork(raw) };
}
export const getEmployeeWorkItem = getWorkItem;

export async function listWorkActivity(accessToken: string, workItemId: string): Promise<WorkActivityResponse> {
  const raw = await apiRequest<any>(`/work-items/${workItemId}`, { headers: authorizationHeaders(accessToken) });
  const data: WorkActivity[] = (raw.activities ?? []).map((activity: any) => ({
    id: activity.id,
    action: activity.action,
    fromStatus: activity.fromStatus ?? null,
    toStatus: activity.toStatus ?? null,
    details: activity.details && typeof activity.details === "object" ? activity.details : null,
    createdAt: activity.createdAt,
    actor: activity.actor ? mapAccount(activity.actor) : null,
  }));
  return { data };
}
export const listEmployeeWorkActivity = listWorkActivity;

async function mutation(accessToken: string, path: string, options: RequestInit = {}): Promise<WorkMutationResponse> {
  const raw = await apiRequest<any>(path, { ...options, headers: { ...Object.fromEntries(new Headers(options.headers).entries()), ...Object.fromEntries(new Headers(authorizationHeaders(accessToken)).entries()) } });
  return { message: raw.message ?? "Work updated.", workItem: mapWork(raw.workItem ?? raw) };
}

export async function acknowledgeEmployeeWork(accessToken: string, workItemId: string) { return mutation(accessToken, `/work-items/${workItemId}/acknowledge`, { method: "POST" }); }
export async function startEmployeeWork(accessToken: string, workItemId: string) { return mutation(accessToken, `/work-items/${workItemId}/start`, { method: "POST" }); }
export async function requestEmployeeWorkHelp(accessToken: string, workItemId: string, payload: { reason: WorkHelpReason; materialType?: WorkHelpMaterialType; note?: string; requestedHelperAccountId?: string; requestedDepartmentId?: string; }): Promise<WorkHelpMutationResponse> {
  const raw = await apiRequest<any>(`/work-items/${workItemId}/help-requests`, { method: "POST", headers: authorizationHeaders(accessToken), body: JSON.stringify({ reason: payload.reason, materialType: payload.materialType, note: payload.note, requestedHelperAccountId: payload.requestedHelperAccountId }) });
  return { message: raw.message ?? "Help requested.", workItem: mapWork(raw.workItem), helpRequest: raw.helpRequest ? mapHelpRequest(raw.helpRequest) : undefined };
}
export async function respondToEmployeeHelpRequest(accessToken: string, helpRequestId: string, payload: { accept: boolean; note?: string; }) { return mutation(accessToken, `/work-items/help-requests/${helpRequestId}/respond`, { method: "POST", body: JSON.stringify(payload) }); }
export async function submitEmployeeWorkCompletion(
  accessToken: string,
  workItemId: string,
  payload: {
    result: WorkCompletionResult;
    summary: string;
    customerId?: string;
    rxLevelDbm?: number;
    fields?: Array<{ code: string; value: unknown }>;
    moreWorkRequired: boolean;
    files?: File[];
  },
): Promise<WorkCompletionMutationResponse> {
  const formData = new FormData();
  formData.set("result", payload.result);
  formData.set("summary", payload.summary);
  if (payload.customerId) formData.set("customerId", payload.customerId);
  if (payload.rxLevelDbm !== undefined) formData.set("rxLevelDbm", String(payload.rxLevelDbm));
  if (payload.fields) formData.set("fields", JSON.stringify(payload.fields));
  formData.set("moreWorkRequired", String(payload.moreWorkRequired));
  for (const file of payload.files ?? []) formData.append("files", file);

  const raw = await apiRequest<any>(`/work-items/${workItemId}/completion-reports`, {
    method: "POST",
    headers: authorizationHeaders(accessToken),
    body: formData,
  });
  const mapped = mapWork(raw.workItem);
  // Completion mutations intentionally return a compact Work compatibility record.
  // Use the authoritative report object from the mutation response instead of
  // requiring the compact Work response to redundantly contain completionReports.
  const report = raw.report ? mapCompletionReport(raw.report, raw.workItem) : mapped.completionReports?.[0];
  if (!report) throw new Error("The completion report response was incomplete.");
  return { message: raw.message ?? "Completion submitted.", workItem: mapped, report };
}

export async function downloadWorkCompletionEvidence(
  accessToken: string,
  workItemId: string,
  reportId: string,
  evidenceId: string,
) {
  return apiDownload(
    `/work-items/${workItemId}/completion-reports/${reportId}/evidence/${evidenceId}`,
    { headers: authorizationHeaders(accessToken) },
  );
}

export async function listPendingEmployeeHelpRequests(accessToken: string): Promise<{ data: WorkHelpRequest[] }> {
  const raw = await apiRequest<any>("/work-items/help-requests/pending", { headers: authorizationHeaders(accessToken) });
  return { data: (raw.data ?? []).map(mapHelpRequest) };
}

export async function getEmployeeWorkDashboardSummary(accessToken: string): Promise<WorkEmployeeDashboardSummary> {
  const [activeRaw, pendingHelp, accountId] = await Promise.all([
    fetchAllVisible(accessToken, "ACTIVE"),
    listPendingEmployeeHelpRequests(accessToken),
    currentAccountId(accessToken),
  ]);
  const active = activeRaw.filter((raw) => (raw.assignments ?? []).some((a: any) => a.assignee?.id === accountId) || raw.salesMember?.id === accountId).map(mapWork);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const dueSoonMs = now.getTime() + 4 * 60 * 60 * 1000;
  return {
    timezone: "Asia/Kathmandu",
    generatedAt: now.toISOString(),
    totals: {
      active: active.length,
      newWork: active.filter((item) => item.status === "ASSIGNED" || item.status === "ACKNOWLEDGED").length,
      working: active.filter((item) => item.status === "IN_PROGRESS" || item.status === "HELP_REQUESTED" || item.status === "BLOCKED" || item.status === "REOPENED").length,
      waitingForManager: active.filter((item) => item.status === "COMPLETED_PENDING_REVIEW").length,
      dueToday: active.filter((item) => item.dueAt.slice(0, 10) === today).length,
      dueSoon: active.filter((item) => { const t = new Date(item.dueAt).getTime(); return t >= now.getTime() && t <= dueSoonMs; }).length,
      overdue: active.filter((item) => new Date(item.dueAt).getTime() < now.getTime()).length,
      informationRequested: active.filter((item) => item.completionReports?.some((report) => report.reviewStatus === "INFORMATION_REQUESTED")).length,
      pendingHelpRequests: pendingHelp.data.length,
    },
    nextWork: [...active].sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt)).slice(0, 8),
  };
}

function workload(activeRows: any[], accountId?: string, teamId?: string) {
  const rows = activeRows.filter((raw) => teamId ? raw.assignedOperationalTeamId === teamId : (raw.assignments ?? []).some((a: any) => a.assignee?.id === accountId));
  const overdue = rows.filter((raw) => new Date(raw.dueAt).getTime() < Date.now()).length;
  const waitingForReview = rows.filter((raw) => raw.status === "COMPLETED_PENDING_REVIEW").length;
  const count = rows.length;
  const level: WorkloadLevel = count >= 10
    ? "OVERLOADED"
    : count >= 6
      ? "BUSY"
      : count >= 3
        ? "MODERATE"
        : "AVAILABLE";
  return { active: count, overdue, waitingForReview, level };
}

function flattenTree(
  nodes: any[],
  top?: any,
  prefix = "",
  ancestorOrgUnitIds: string[] = [],
): Array<{ node: any; top: any; breadcrumb: string; ancestorOrgUnitIds: string[] }> {
  const output: Array<{ node: any; top: any; breadcrumb: string; ancestorOrgUnitIds: string[] }> = [];
  for (const node of nodes) {
    const root = top ?? node;
    const breadcrumb = prefix ? `${prefix} / ${node.name}` : node.name;
    output.push({ node, top: root, breadcrumb, ancestorOrgUnitIds });
    output.push(
      ...flattenTree(
        node.children ?? [],
        root,
        breadcrumb,
        [...ancestorOrgUnitIds, node.id],
      ),
    );
  }
  return output;
}

function buildOfficeOrgTree(orgUnits: any[]) {
  const byId = new Map<string, any>();
  for (const unit of orgUnits) {
    byId.set(unit.id, { ...unit, children: [] });
  }
  const roots: any[] = [];
  for (const unit of byId.values()) {
    const parent = unit.parentOrgUnitId ? byId.get(unit.parentOrgUnitId) : null;
    if (parent) parent.children.push(unit);
    else roots.push(unit);
  }
  return roots;
}

function mapDepartmentOptions(flat: ReturnType<typeof flattenTree>): WorkDepartmentOption[] {
  return flat.map(({ node, top, breadcrumb, ancestorOrgUnitIds }) => ({
    id: node.id,
    code: node.code,
    name: breadcrumb,
    divisionId: top.id,
    workFunction: /sales/i.test(`${node.code} ${node.name}`)
      ? "SALES"
      : /support/i.test(`${node.code} ${node.name}`)
        ? "SUPPORT"
        : "GENERAL",
    division: { id: top.id, code: top.code, name: top.name },
    ancestorOrgUnitIds,
  }));
}

async function parityOrganization(accessToken: string) {
  const identity = await workspaceIdentity(accessToken);
  const [tree, context, activeRaw] = await Promise.all([
    getOrganizationTree(accessToken, identity.officeId),
    modernCreateContext(accessToken, identity.officeId),
    fetchAllVisible(accessToken, "ACTIVE"),
  ]);

  // The normal organization tree is authority-scoped and must stay that way for
  // Work Management oversight. Create Work is different: V3 cross-organization
  // assignment may target any active OrgUnit in the same Office. The create-context
  // endpoint deliberately returns that Office-wide flat OrgUnit registry, so build a
  // separate tree/map for assignment pickers instead of widening management scope.
  const flat = flattenTree(tree.tree ?? []);
  const unitById = new Map(flat.map((item) => [item.node.id, item]));
  const departments = mapDepartmentOptions(flat);

  const assignmentTree = buildOfficeOrgTree(context.orgUnits ?? []);
  const assignmentFlat = flattenTree(assignmentTree);
  const assignmentUnitById = new Map(
    assignmentFlat.map((item) => [item.node.id, item]),
  );
  const assignmentDepartments = mapDepartmentOptions(assignmentFlat);

  return {
    identity,
    tree,
    context,
    activeRaw,
    flat,
    unitById,
    departments,
    assignmentTree,
    assignmentFlat,
    assignmentUnitById,
    assignmentDepartments,
  };
}

function candidateFrom(raw: any, unitById: Map<string, any>, activeRaw: any[]): WorkAssignmentCandidate {
  const unitId = raw.orgUnit?.id ?? null;
  const unit = unitId ? unitById.get(unitId) : null;
  const account = mapAccount({ id: raw.accountId, username: raw.employeeCode, employee: { id: raw.employeeId, empId: raw.employeeCode, empName: raw.employeeName, designation: raw.designation ?? null, orgMemberships: unitId ? [{ orgUnitId: unitId }] : [] } });
  return {
    account,
    division: unit ? { id: unit.top.id, code: unit.top.code, name: unit.top.name } : null,
    department: unit
      ? {
          id: unit.node.id,
          code: unit.node.code,
          name: unit.breadcrumb,
          divisionId: unit.top.id,
          workFunction: /sales/i.test(`${unit.node.code} ${unit.node.name}`)
            ? "SALES"
            : /support/i.test(`${unit.node.code} ${unit.node.name}`)
              ? "SUPPORT"
              : "GENERAL",
          division: { id: unit.top.id, code: unit.top.code, name: unit.top.name },
          ancestorOrgUnitIds: unit.ancestorOrgUnitIds ?? [],
        }
      : null,
    workload: workload(activeRaw, raw.accountId),
  };
}

export async function listManagementAssignmentOptions(accessToken: string, query: WorkAssignmentOptionsQuery = {}): Promise<WorkAssignmentOptionsResponse> {
  const org = await parityOrganization(accessToken);
  const allCandidates: WorkAssignmentCandidate[] = (
    (org.context.supportMemberCandidates ?? []) as any[]
  ).map((raw) => candidateFrom(raw, org.assignmentUnitById, org.activeRaw));
  const search = query.search?.trim().toLowerCase();
  let data = allCandidates.filter((candidate) => !search || `${candidate.account.employee?.empName ?? ""} ${candidate.account.employee?.empId ?? ""}`.toLowerCase().includes(search));
  if (query.departmentId) data = data.filter((candidate) => candidate.department?.id === query.departmentId);
  const reviewerMap = new Map<string, any>();
  const teamsMap = new Map<string, any>();
  const workTypes = (org.context.workTypes ?? []).map((workType: any) => {
    const primaryOwnerOrgUnitId = workType.primaryOwnerOrgUnit?.id ?? "";
    const template = workType.template as "STANDARD" | "TEAM_SALES" | "ADMINISTRATIVE";
    const compatibilityType =
      CURRENT_TO_MAIN_TYPE[workType.code] ??
      (template === "ADMINISTRATIVE"
        ? "ADMINISTRATIVE_TASK"
        : template === "TEAM_SALES"
          ? "NEW_CONNECTION"
          : "ROUTINE_TASK");
    for (const reviewer of workType.reviewerCandidates ?? []) {
      const existing = reviewerMap.get(reviewer.accountId);
      reviewerMap.set(reviewer.accountId, {
        ...reviewer,
        eligibleOwnerOrgUnitIds: [
          ...new Set([
            ...(existing?.eligibleOwnerOrgUnitIds ?? []),
            ...(reviewer.eligibleOwnerOrgUnitIds ?? []),
          ]),
        ],
      });
    }
    for (const team of workType.mainTeams ?? []) {
      teamsMap.set(team.id, {
        ...team,
        ownerUnitId: team.orgUnit?.id,
      });
    }
    return {
      type: compatibilityType,
      code: workType.code,
      workTypeVersionId: workType.workTypeVersionId,
      version: workType.version,
      name: workType.name ?? workType.code,
      template,
      executionAssignmentMode:
        workType.executionAssignmentMode === "TEAM_OR_USER"
          ? "TEAM_OR_USER"
          : "TEAM",
      requiresSalesParticipant: Boolean(workType.requiresSalesParticipant),
      primaryOwnerOrgUnitId,
      registeredAtEnabled: Boolean(workType.registeredAtEnabled),
      salesDisplayLabel:
        typeof workType.salesDisplayLabel === "string" && workType.salesDisplayLabel.trim()
          ? workType.salesDisplayLabel.trim()
          : "Sales",
      fields: (workType.fields ?? []).map((field: any) => ({
        id: field.id,
        code: field.code,
        label: field.label,
        fieldType: field.fieldType,
        isRequired: Boolean(field.isRequired),
        sortOrder: Number(field.sortOrder ?? 0),
        stageDefinitionId: field.stageDefinitionId ?? null,
        config: field.config && typeof field.config === "object" ? field.config : null,
      })),
      mainTeamIds: (workType.mainTeams ?? []).map((team: any) => team.id),
      mainAssigneeAccountIds: (workType.mainAssigneeCandidates ?? []).map(
        (candidate: any) => candidate.accountId,
      ),
      reviewerAccountIds: (workType.reviewerCandidates ?? []).map(
        (reviewer: any) => reviewer.accountId,
      ),
    };
  });
  const responsibleManagers = [...reviewerMap.values()].map((reviewer) => {
    const unit = reviewer.orgUnit?.id
      ? org.assignmentUnitById.get(reviewer.orgUnit.id)
      : null;
    return {
      account: mapAccount(
        {
          id: reviewer.accountId,
          username: reviewer.employeeCode,
          employee: {
            id: reviewer.employeeId,
            empId: reviewer.employeeCode,
            empName: reviewer.employeeName,
            designation: reviewer.leadershipType,
            orgMemberships: reviewer.orgUnit
              ? [{ orgUnitId: reviewer.orgUnit.id }]
              : [],
          },
        },
        reviewer.leadershipType === "OFFICE_HEAD"
          ? "SENIOR_MANAGEMENT"
          : "TEAM_MANAGER",
      ),
      divisionId: unit?.top.id ?? null,
      departmentId: reviewer.orgUnit?.id ?? null,
      leadershipType: reviewer.leadershipType,
      eligibleOwnerOrgUnitIds: reviewer.eligibleOwnerOrgUnitIds ?? [],
    };
  });
  const departmentById = new Map(
    org.assignmentDepartments.map((department) => [department.id, department]),
  );
  const teams = [...teamsMap.values()].map((team) => {
    // The restored main UI filters teams by its selected legacy "department".
    // In V3 that selector represents the Work Type Primary Owner OrgUnit, while an
    // Operational Team may live in any descendant OrgUnit. Keep the real team ID,
    // but group the option under the owner OrgUnit so eligible subtree teams remain visible.
    const department = departmentById.get(team.ownerUnitId) ??
      departmentById.get(team.orgUnit?.id) ??
      org.departments[0];
    const memberAccountId = team.memberAccountIds?.[0];
    const member = allCandidates.find((candidate) => candidate.account.id === memberAccountId);
    return {
      id: team.id,
      name: team.name,
      department,
      admin: { employeeId: member?.account.employee?.id ?? team.id, empId: member?.account.employee?.empId ?? "", name: member?.account.employee?.empName ?? "Team member", designation: member?.account.employee?.designation ?? null, account: member?.account ?? null },
      memberCount: team.memberAccountIds?.length ?? 0,
      memberAccountIds: team.memberAccountIds ?? [],
      workload: workload(org.activeRaw, undefined, team.id),
    };
  });
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  return {
    scope: { role: org.identity.role === "SENIOR_MANAGEMENT" ? "SENIOR_MANAGEMENT" : "TEAM_MANAGER", type: org.identity.role === "SENIOR_MANAGEMENT" ? "ORGANIZATION" : "DEPARTMENT", divisionId: null, departmentId: null },
    departments: org.assignmentDepartments,
    myBranchOrgUnitIds: org.context.myBranchOrgUnitIds ?? [],
    responsibleManagers,
    workTypes,
    teams,
    salesMembers: allCandidates,
    supportMembers: allCandidates,
    data: data.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total: data.length, totalPages: Math.max(Math.ceil(data.length / limit), 1) },
    filters: { search: query.search ?? null, departmentId: query.departmentId ?? null },
  };
}

export async function getManagementOrganizationSummary(accessToken: string): Promise<WorkManagementOrganizationSummaryResponse> {
  const org = await parityOrganization(accessToken);
  const metrics = (rows: any[]) => ({
    active: rows.length,
    newWork: rows.filter((r) => r.status === "ASSIGNED" || r.status === "ACKNOWLEDGED").length,
    inProgress: rows.filter((r) => r.status === "IN_PROGRESS" || r.status === "HELP_REQUESTED" || r.status === "BLOCKED" || r.status === "REOPENED").length,
    waitingForSales: rows.filter((r) => r.salesMemberAccountId && r.salesCoordinationStatus !== "COMPLETED").length,
    waitingForApproval: rows.filter((r) => r.status === "COMPLETED_PENDING_REVIEW").length,
    overdue: rows.filter((r) => new Date(r.dueAt).getTime() < Date.now()).length,
    completedToday: 0,
  });
  const options = await listManagementAssignmentOptions(accessToken, { limit: 100 });
  const divisions = (org.tree.tree ?? []).map((top: any) => {
    const descendants = org.flat.filter((item) => item.top.id === top.id);
    const departmentRows = descendants.map(({ node, breadcrumb }) => {
      const rows = org.activeRaw.filter((raw) => raw.primaryOwnerOrgUnitId === node.id);
      const teams = options.teams.filter((team) => team.department.id === node.id).map((team) => ({ id: team.id, departmentId: node.id, name: team.name, memberCount: team.memberCount, totals: metrics(org.activeRaw.filter((raw) => raw.assignedOperationalTeamId === team.id)) }));
      return { id: node.id, code: node.code, name: breadcrumb, divisionId: top.id, workFunction: /sales/i.test(`${node.code} ${node.name}`) ? "SALES" as DepartmentWorkFunction : "GENERAL" as DepartmentWorkFunction, totals: metrics(rows), teams };
    });
    const rows = org.activeRaw.filter((raw) => descendants.some((item) => item.node.id === raw.primaryOwnerOrgUnitId));
    return { id: top.id, code: top.code, name: top.name, totals: metrics(rows), departments: departmentRows };
  });
  return {
    timezone: "Asia/Kathmandu",
    generatedAt: new Date().toISOString(),
    scope: { role: org.identity.role, type: org.identity.role === "SENIOR_MANAGEMENT" ? "ORGANIZATION" : "DEPARTMENT", divisionId: null, departmentId: null },
    organization: { divisionCount: divisions.length, departmentCount: org.departments.length, teamCount: options.teams.length },
    totals: metrics(org.activeRaw),
    divisions,
  };
}

export async function getManagementWorkDashboardSummary(accessToken: string): Promise<WorkManagementDashboardSummary> {
  const identity = await workspaceIdentity(accessToken);
  const [activeRaw, historyRaw] = await Promise.all([fetchAllVisible(accessToken, "ACTIVE"), fetchAllVisible(accessToken, "HISTORY")]);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const active = activeRaw.map(mapWork);
  const nextReview = active.filter((item) => item.status === "COMPLETED_PENDING_REVIEW" && item.responsibleManager.id === identity.accountId).sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt)).slice(0, 8);
  const attentionWork = active.filter((item) => item.status === "HELP_REQUESTED" || item.status === "BLOCKED" || new Date(item.dueAt).getTime() < now.getTime()).slice(0, 8);
  return {
    timezone: "Asia/Kathmandu",
    generatedAt: now.toISOString(),
    scope: { role: identity.role === "SENIOR_MANAGEMENT" ? "SENIOR_MANAGEMENT" : "TEAM_MANAGER", type: identity.role === "SENIOR_MANAGEMENT" ? "ORGANIZATION" : "DEPARTMENT", divisionId: null, departmentId: null },
    totals: {
      open: active.length,
      assignedToday: active.filter((item) => item.createdAt.slice(0, 10) === today).length,
      inProgress: active.filter((item) => item.status === "IN_PROGRESS" || item.status === "REOPENED").length,
      helpRequested: active.filter((item) => item.status === "HELP_REQUESTED").length,
      waitingForReview: active.filter((item) => item.status === "COMPLETED_PENDING_REVIEW").length,
      overdue: active.filter((item) => new Date(item.dueAt).getTime() < now.getTime()).length,
      closedToday: historyRaw.filter((item) => item.status === "CLOSED" && item.closedAt?.slice(0, 10) === today).length,
      needsAttention: attentionWork.length,
    },
    nextReview,
    attentionWork,
  };
}

function fieldValue(payload: CreateWorkItemInput, code: string): unknown {
  const map: Record<string, unknown> = {
    CUSTOMER_NAME: payload.customerName,
    CUSTOMER_CONTACT_TYPE: payload.customerContactType,
    CUSTOMER_CONTACT_NUMBER: payload.customerContactNumber,
    LOCATION: payload.locationText,
    TOKEN_NUMBER: payload.requestNumber,
    CPC_SERIAL: payload.cpcSerial,
    SERVICE_NUMBER: payload.serviceNumber,
    OLT: payload.olt,
    FDC_NAME: payload.fdcName,
    FAP_NAME: payload.fapName,
    SERVICE_TYPES: payload.serviceTypes,
    OTHER_SERVICE_TEXT: payload.otherServiceText,
    TASK_TITLE: payload.title,
    TASK_DESCRIPTION: payload.description,
  };
  return map[code];
}

export async function createManagementWorkItem(accessToken: string, payload: CreateWorkItemInput): Promise<WorkMutationResponse> {
  const identity = await workspaceIdentity(accessToken);
  const context = await modernCreateContext(accessToken, identity.officeId);
  const workType = context.workTypes?.find(
    (item: any) => item.workTypeVersionId === payload.workTypeVersionId,
  );
  if (!workType) {
    throw new Error(
      "This Work Type changed after this form was opened. Refresh Work Management and review the latest published version before submitting.",
    );
  }
  if (payload.parentWorkItemId) {
    throw new Error(
      "Administrative Work delegation is not available on the V3 create contract. Reassign or create a separate Administrative Work item instead.",
    );
  }
  const reviewer = payload.responsibleManagerAccountId || undefined;
  const fields = payload.fields ?? (workType.fields ?? []).flatMap((field: any) => {
    const value = fieldValue(payload, field.code);
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) return [];
    return [{ code: field.code, value }];
  });
  const raw = await apiRequest<any>(`/work-items/offices/${identity.officeId}`, {
    method: "POST",
    headers: authorizationHeaders(accessToken),
    body: JSON.stringify({
      clientRequestId: crypto.randomUUID(),
      workTypeVersionId: payload.workTypeVersionId,
      primaryExecutionOrgUnitId: payload.primaryExecutionOrgUnitId,
      mainOperationalTeamId: payload.assignedTeamId,
      mainAssigneeAccountId:
        workType.template === "ADMINISTRATIVE" && !payload.assignedTeamId
          ? payload.primaryAssigneeAccountId
          : undefined,
      responsibleReviewerAccountId: reviewer,
      salesOrgUnitId: payload.salesOrgUnitId,
      salesMemberAccountId: payload.salesMemberAccountId,
      supportOrgUnitId: payload.supportOrgUnitId,
      supportMemberAccountIds: payload.supportingAssigneeAccountIds,
      title: payload.title?.trim() || workType.name,
      description: payload.description,
      registeredAt: workType.registeredAtEnabled ? payload.registeredAt : undefined,
      plannedStartAt: payload.plannedStartAt,
      dueAt: payload.dueAt,
      fields,
    }),
  });
  return { message: raw.message ?? "Work assigned successfully.", workItem: mapWork(raw.workItem ?? raw) };
}

export async function updateManagementWorkItem(accessToken: string, workItemId: string, payload: { registeredAt?: string; plannedStartAt?: string; dueAt?: string; locationText?: string; }): Promise<WorkMutationResponse> {
  const raw = await apiRequest<any>(`/work-items/${workItemId}`, { method: "PATCH", headers: authorizationHeaders(accessToken), body: JSON.stringify(payload) });
  return { message: raw.message ?? "Work updated.", workItem: mapWork(raw.workItem ?? raw) };
}
export async function reassignManagementWorkItem(accessToken: string, workItemId: string, payload: { primaryAssigneeAccountId: string; reason: string; }): Promise<WorkMutationResponse> {
  return mutation(accessToken, `/work-items/${workItemId}/reassign`, { method: "POST", body: JSON.stringify({ assigneeAccountId: payload.primaryAssigneeAccountId, reason: payload.reason }) });
}
export async function addManagementWorkSupport(accessToken: string, workItemId: string, payload: { accountId: string; reason?: string; }) { return mutation(accessToken, `/work-items/${workItemId}/support/add`, { method: "POST", body: JSON.stringify(payload) }); }
export async function removeManagementWorkSupport(accessToken: string, workItemId: string, payload: { accountId: string; reason?: string; }) { return mutation(accessToken, `/work-items/${workItemId}/support/remove`, { method: "POST", body: JSON.stringify(payload) }); }
export async function requestManagementWorkInformation(accessToken: string, workItemId: string, note: string) { return mutation(accessToken, `/work-items/${workItemId}/review/request-information`, { method: "POST", body: JSON.stringify({ note }) }); }
export async function closeManagementWorkItem(accessToken: string, workItemId: string, note: string) { return mutation(accessToken, `/work-items/${workItemId}/review/close`, { method: "POST", body: JSON.stringify({ note }) }); }
export async function reopenManagementWorkItem(accessToken: string, workItemId: string, note: string) { return mutation(accessToken, `/work-items/${workItemId}/review/reopen`, { method: "POST", body: JSON.stringify({ note }) }); }
export async function cancelManagementWorkItem(accessToken: string, workItemId: string, reason: string) { return mutation(accessToken, `/work-items/${workItemId}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }); }
export async function placeWorkRetentionHold(accessToken: string, workItemId: string, reason: string) { return mutation(accessToken, `/work-items/${workItemId}/retention/hold`, { method: "POST", body: JSON.stringify({ reason }) }); }
export async function releaseWorkRetentionHold(accessToken: string, workItemId: string) { return mutation(accessToken, `/work-items/${workItemId}/retention/hold`, { method: "DELETE" }); }
export async function requestWorkDeletionReview(accessToken: string, workItemId: string, reason: string) { return mutation(accessToken, `/work-items/${workItemId}/retention/deletion-request`, { method: "POST", body: JSON.stringify({ reason }) }); }
export async function cancelWorkDeletionReview(accessToken: string, workItemId: string) { return mutation(accessToken, `/work-items/${workItemId}/retention/deletion-request`, { method: "DELETE" }); }

export async function listEmployeeWorkSalesMessages(accessToken: string, workItemId: string): Promise<{ messages: WorkSalesMessage[] }> {
  return apiRequest(`/work-items/${workItemId}/sales/messages`, { headers: authorizationHeaders(accessToken) });
}
export async function sendEmployeeWorkSalesMessage(accessToken: string, workItemId: string, payload: { text?: string; files?: File[]; }): Promise<{ message: string; salesMessage: WorkSalesMessage }> {
  const formData = new FormData();
  if (payload.text?.trim()) formData.set("text", payload.text.trim());
  for (const file of payload.files ?? []) formData.append("files", file);
  return apiRequest(`/work-items/${workItemId}/sales/messages`, { method: "POST", headers: authorizationHeaders(accessToken), body: formData });
}
export async function downloadEmployeeWorkSalesAttachment(accessToken: string, workItemId: string, messageId: string, attachmentId: string) {
  return apiDownload(`/work-items/${workItemId}/sales/messages/${messageId}/attachments/${attachmentId}`, { headers: authorizationHeaders(accessToken) });
}
export async function sendEmployeeWorkToSales(accessToken: string, workItemId: string, note?: string) { return mutation(accessToken, `/work-items/${workItemId}/sales/send`, { method: "POST", body: JSON.stringify({ note: note?.trim() || undefined }) }); }
export async function completeEmployeeSalesWork(accessToken: string, workItemId: string, note?: string) { return mutation(accessToken, `/work-items/${workItemId}/sales/complete`, { method: "POST", body: JSON.stringify({ note: note?.trim() || undefined }) }); }

export async function listDutyHelpRecommendations(
  accessToken: string,
  workItemId: string,
): Promise<DutyHelpRecommendationResponse> {
  const current: CurrentDutyHelpRecommendationResponse =
    await listDutyHelpRecommendationsCurrent(accessToken, workItemId);

  return {
    workItem: {
      id: current.workItem.id,
      ticketNumber: current.workItem.ticketNumber,
      title: current.workItem.title,
      // The current V3 recommendation endpoint already scopes candidates by
      // Office/OrgUnit. Legacy IDs are presentation-only compatibility fields.
      divisionId: "",
      departmentId: "",
    },
    data: current.data.map((candidate) => ({
      ...candidate,
      account: mapAccount(candidate.account),
    })),
    // V3 help requests target a concrete helper account. The retired
    // department-targeted request path is intentionally not fabricated.
    crossDepartmentOptions: [],
  };
}

function daysBetween(from: string, to: string) { return Math.max(Math.floor((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000) + 1, 1); }
function reportQueryModern(query: WorkReportQuery) {
  return {
    from: query.from,
    to: query.to,
    orgUnitId: query.departmentId || query.divisionId,
    operationalTeamId: query.teamId,
    workTypeId: query.workTypeId,
    search: query.search,
    slaState: query.workflowStage === "OVERDUE" ? "OVERDUE" : undefined,
    workflowStage: query.workflowStage && query.workflowStage !== "OVERDUE" ? query.workflowStage : undefined,
  };
}

export async function getWorkReportSummary(accessToken: string, query: WorkReportQuery = {}): Promise<WorkReportSummary> {
  const identity = await workspaceIdentity(accessToken);
  const modernQuery = reportQueryModern(query);
  const [context, overview] = await Promise.all([
    apiRequest<any>(`/work-reports/offices/${identity.officeId}/context`, { headers: authorizationHeaders(accessToken) }),
    apiRequest<any>(`/work-reports/offices/${identity.officeId}/overview${buildQueryString(modernQuery)}`, { headers: authorizationHeaders(accessToken) }),
  ]);
  const from = overview.period?.from ?? query.from ?? new Date().toISOString().slice(0, 10);
  const to = overview.period?.to ?? query.to ?? from;
  const departments = await reportDepartments(accessToken, context);
  const teams = (context.filters?.operationalTeams ?? []).map((team: any) => {
    const department = departments.find((item) => item.id === team.orgUnitId) ?? departments[0];
    return { id: team.id, name: team.name, isActive: team.isActive !== false, departmentId: team.orgUnitId, department: { id: department?.id ?? team.orgUnitId, code: department?.code ?? "", name: department?.name ?? "Org Unit", division: department?.division ?? { id: department?.divisionId ?? team.orgUnitId, code: "", name: department?.name ?? "Org Unit" } } };
  });
  const teamSummaries = (overview.teams ?? []).map((row: any) => {
    const department = departments.find((item) => item.id === row.orgUnitId);
    return {
      teamId: row.teamId,
      name: row.name,
      departmentId: row.orgUnitId,
      departmentName: department?.name ?? row.orgUnitName ?? "Org Unit",
      divisionId: department?.division.id ?? row.orgUnitId,
      divisionName: department?.division.name ?? row.orgUnitName ?? "Org Unit",
      activeWork: row.activeWork ?? 0,
      newWork: row.newWork ?? 0,
      inProgress: row.inProgress ?? 0,
      waitingForSales: row.waitingForSales ?? 0,
      waitingForApproval: row.waitingForApproval ?? 0,
      returnedForCorrection: row.returnedForCorrection ?? 0,
      overdueWork: row.overdueWork ?? 0,
      completedDuring: row.completedDuring ?? 0,
    };
  });
  return {
    timezone: "Asia/Kathmandu",
    generatedAt: overview.generatedAt ?? new Date().toISOString(),
    scope: { role: identity.role, type: identity.role === "EMPLOYEE" ? "PERSONAL" : identity.role === "SENIOR_MANAGEMENT" ? "ORGANIZATION" : "DEPARTMENT", label: context.office?.name ?? "Office", divisionId: null, departmentId: null },
    period: { from, to, days: overview.period?.days ?? daysBetween(from, to) },
    departmentOptions: departments,
    teamOptions: teams,
    workTypeOptions: overview.workTypeOptions ?? [],
    work: overview.work ?? { totals: { activeAtEnd: 0, completionRate: null } },
    workflow: overview.workflow ?? { newWork: 0, inProgress: 0, waitingForSales: 0, waitingForApproval: 0, returnedForCorrection: 0, overdue: overview.sla?.overdue ?? 0, completedDuring: 0 },
    teams: teamSummaries,
    trend: overview.trend ?? [],
  };
}

async function reportDepartments(accessToken: string, context: any) {
  const identity = await workspaceIdentity(accessToken);
  const tree = await getOrganizationTree(accessToken, identity.officeId);
  const flat = flattenTree(tree.tree ?? []);
  const allowed = new Set((context.filters?.orgUnits ?? []).map((unit: any) => unit.id));
  return flat.filter((item) => allowed.size === 0 || allowed.has(item.node.id)).map(({ node, top, breadcrumb }) => ({ id: node.id, divisionId: top.id, code: node.code, name: breadcrumb, division: { id: top.id, code: top.code, name: top.name } }));
}


export async function getWorkReportDrilldown(accessToken: string, query: WorkReportDrilldownQuery): Promise<WorkReportDrilldownResponse> {
  const identity = await workspaceIdentity(accessToken);
  const summary = await getWorkReportSummary(accessToken, query);
  if (query.dataset === "DUTY_ASSIGNMENTS") {
    const raw = await apiRequest<any>(
      `/work-reports/drilldown${buildQueryString({
        ...reportQueryModern(query),
        officeId: identity.officeId,
        dataset: "DUTY_ASSIGNMENTS",
        page: query.page,
        limit: query.limit,
      })}`,
      { headers: authorizationHeaders(accessToken) },
    );
    const rows: WorkReportDrilldownDutyRow[] = (raw.sections?.duty?.rows ?? []).map((row: any) => ({
      ...row,
      employeeRole: row.employeeRole ?? "EMPLOYEE",
      designation: row.designation ?? null,
      orgUnit: row.orgUnit ?? null,
      operationalTeam: row.operationalTeam ?? null,
      supervisor: row.supervisor ?? "—",
      supervisorEmployeeId: row.supervisorEmployeeId ?? null,
      notes: row.notes ?? null,
    }));
    return {
      ...raw,
      dataset: "DUTY_ASSIGNMENTS",
      scope: {
        ...summary.scope,
        label: raw.scope?.label ?? summary.scope.label,
      },
      period: raw.period ?? summary.period,
      sections: {
        work: null,
        performance: null,
        duty: raw.sections?.duty ? { ...raw.sections.duty, rows } : null,
      },
    };
  }
  const modernQuery = reportQueryModern(query);
  if (query.dataset === "PERFORMANCE_REPORT") {
    const report = await apiRequest<any>(`/work-reports/offices/${identity.officeId}/technical-performance${buildQueryString(modernQuery)}`, { headers: authorizationHeaders(accessToken) });
    const rows: WorkReportPerformanceRow[] = (report.rows ?? []).map((row: any) => {
      const department = summary.departmentOptions.find((item) => item.id === row.orgUnit?.id);
      return {
        kind: "PERFORMANCE_ROW",
        date: row.date,
        team: {
          id: row.operationalTeam?.id ?? row.orgUnit.id,
          name: row.operationalTeam?.name ?? row.orgUnit.name,
          departmentId: row.orgUnit.id,
          departmentName: department?.name ?? row.orgUnit.name,
          divisionId: department?.division.id ?? row.orgUnit.id,
          divisionName: department?.division.name ?? row.orgUnit.name,
        },
        supportStaffCount: row.supportStaff?.length ?? 0,
        otherStaffCount: row.otherStaff?.length ?? 0,
        references: row.references ?? [],
        workTypes: row.workTypes ?? {},
        total: row.total ?? { tickets: 0, completed: 0, pending: 0 },
      };
    });
    return {
      dataset: "PERFORMANCE_REPORT",
      generatedAt: report.generatedAt,
      timezone: "Asia/Kathmandu",
      scope: summary.scope,
      period: summary.period,
      dutySummary: null,
      sections: {
        work: null,
        performance: {
          workTypeGroups: report.workTypeGroups ?? [],
          rows,
          totals: {
            workTypes: report.totals?.workTypes ?? {},
            total: report.totals?.total ?? { tickets: 0, completed: 0, pending: 0 },
          },
        },
        duty: null,
      },
      notice: "",
    };
  }
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  const records = await apiRequest<any>(`/work-reports/offices/${identity.officeId}/work-records${buildQueryString({ ...modernQuery, page, limit })}`, { headers: authorizationHeaders(accessToken) });
  const rows: WorkReportDrilldownWorkRow[] = (records.items ?? []).map((record: any) => {
    const department = summary.departmentOptions.find((item) => item.id === record.primaryOwner?.id);
    const fixedType = CURRENT_TO_MAIN_TYPE[record.workType?.code] ?? "ROUTINE_TASK";
    return {
      kind: "WORK_ITEM",
      id: record.id,
      ticketNumber: record.ticketNumber,
      title: record.title,
      type: fixedType,
      workType: record.workType,
      workflowStage: record.workflowStage,
      customerName: record.customerName ?? null,
      location: record.location ?? null,
      reference: record.reference ?? null,
      information: Array.isArray(record.information) ? record.information : [],
      cpcSerial: record.cpcSerial ?? null,
      olt: record.olt ?? null,
      fdcName: record.fdcName ?? null,
      fapName: record.fapName ?? null,
      createdAt: record.createdAt,
      dueAt: record.dueAt,
      closedAt: record.closedAt ?? null,
      overdueDays: record.overdueDays ?? 0,
      division: department?.division ?? { id: record.primaryOwner?.id ?? "", code: record.primaryOwner?.code ?? "", name: record.primaryOwner?.name ?? "Org Unit" },
      department: department ? { id: department.id, code: department.code, name: department.name } : record.primaryOwner ?? null,
      assignedTeam: record.executionTeams?.[0] ? { id: record.executionTeams[0].id, name: record.executionTeams[0].name } : null,
      primaryAssignee: record.primaryAssignee ?? "Unclaimed",
      startedBy: record.startedBy ?? null,
      supportingStaff: record.supportingStaff ?? [],
      responsibleManager: record.responsibleReviewer ?? "Reviewer",
      salesMember: record.salesMember ?? null,
      salesCoordinationStatus: record.salesCoordinationStatus ?? null,
      childProgress: record.childProgress ?? { total: 0, completed: 0, inProgress: 0, percentage: null },
    };
  });
  return { dataset: "WORK_RECORDS", generatedAt: records.generatedAt ?? new Date().toISOString(), timezone: "Asia/Kathmandu", scope: summary.scope, period: summary.period, dutySummary: null, sections: { work: { pagination: { page, limit, total: records.total ?? rows.length, totalPages: records.totalPages ?? 1, hasPrevious: page > 1, hasNext: page < (records.totalPages ?? 1) }, rows }, performance: null, duty: null }, notice: "" };
}

export async function downloadWorkReportCsv(accessToken: string, dataset: WorkReportDataset, query: WorkReportQuery = {}): Promise<{ filename: string; truncated: boolean }> {
  const identity = await workspaceIdentity(accessToken);
  if (dataset === "DUTY_ASSIGNMENTS") {
    const identity = await workspaceIdentity(accessToken);
    const download = await apiDownload(
      `/work-reports/export${buildQueryString({ ...reportQueryModern(query), officeId: identity.officeId, dataset: "DUTY_ASSIGNMENTS" })}`,
      { headers: authorizationHeaders(accessToken) },
    );
    triggerDownload(download.blob, download.filename);
    return { filename: download.filename, truncated: download.truncated };
  }
  const mappedDataset = dataset === "PERFORMANCE_REPORT" ? "TECHNICAL_PERFORMANCE" : dataset === "WORK_RECORDS" ? "WORK_RECORDS" : "OVERVIEW";
  const download = await apiDownload(`/work-reports/offices/${identity.officeId}/export${buildQueryString({ ...reportQueryModern(query), dataset: mappedDataset })}`, { headers: authorizationHeaders(accessToken) });
  triggerDownload(download.blob, download.filename);
  return { filename: download.filename, truncated: download.truncated };
}

export interface WorkReportSnapshotSummary {
  id: string;
  name: string;
  dataset: "OVERVIEW" | "WORK_RECORDS" | "TECHNICAL_PERFORMANCE" | "DUTY_ASSIGNMENTS";
  periodFrom: string | null;
  periodTo: string | null;
  createdAt: string;
  rowCount: number | null;
}

export interface WorkReportSavedSnapshot extends WorkReportSnapshotSummary {
  query: Record<string, unknown>;
  payload: unknown;
}

export async function saveWorkReportSnapshot(
  accessToken: string,
  dataset: "OVERVIEW" | "WORK_RECORDS" | "TECHNICAL_PERFORMANCE" | "DUTY_ASSIGNMENTS",
  query: WorkReportQuery,
  name?: string,
): Promise<WorkReportSnapshotSummary> {
  const identity = await workspaceIdentity(accessToken);
  return apiRequest<WorkReportSnapshotSummary>(`/work-reports/offices/${identity.officeId}/snapshots`, {
    method: "POST",
    headers: { ...authorizationHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ ...reportQueryModern(query), dataset, name: name?.trim() || undefined }),
  });
}

export async function listWorkReportSnapshots(accessToken: string): Promise<WorkReportSnapshotSummary[]> {
  const identity = await workspaceIdentity(accessToken);
  return apiRequest<WorkReportSnapshotSummary[]>(`/work-reports/offices/${identity.officeId}/snapshots`, {
    headers: authorizationHeaders(accessToken),
  });
}

export async function getWorkReportSnapshot(
  accessToken: string,
  snapshotId: string,
): Promise<WorkReportSavedSnapshot> {
  const identity = await workspaceIdentity(accessToken);
  return apiRequest<WorkReportSavedSnapshot>(`/work-reports/offices/${identity.officeId}/snapshots/${snapshotId}`, {
    headers: authorizationHeaders(accessToken),
  });
}

function triggerDownload(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); }
