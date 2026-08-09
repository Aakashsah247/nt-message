import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";

import { DualCalendarDateTimeInput } from "../components/work-management/DualCalendarDateTimeInput";
import { useAuth } from "../context/AuthContext";
import {
  acknowledgeEmployeeWork,
  addManagementWorkSupport,
  cancelManagementWorkItem,
  closeManagementWorkItem,
  createManagementWorkItem,
  getManagementWorkDashboardSummary,
  getWorkItem,
  listManagementAssignmentOptions,
  listWorkActivity,
  listWorkItems,
  placeWorkRetentionHold,
  reassignManagementWorkItem,
  releaseWorkRetentionHold,
  requestWorkDeletionReview,
  cancelWorkDeletionReview,
  removeManagementWorkSupport,
  reopenManagementWorkItem,
  requestEmployeeWorkHelp,
  requestManagementWorkInformation,
  startEmployeeWork,
  submitEmployeeWorkCompletion,
  updateManagementWorkItem,
} from "../services/work-management.service";
import {
  connectMessagingSocketAfterEffectCommit,
  createMessagingSocket,
} from "../services/messaging-socket.service";
import {
  formatBikramSambatDateTime,
  formatKathmanduDateTime,
  kathmanduDateTimeLocalToIso,
} from "../utils/nepal-calendar";
import type {
  WorkActivity,
  WorkAssignmentCandidate,
  WorkAssignmentOptionsResponse,
  WorkCompletionResult,
  WorkContactType,
  WorkHelpReason,
  WorkItem,
  WorkItemListResponse,
  WorkItemStatus,
  WorkItemType,
  WorkManagementDashboardSummary,
  WorkPriority,
  WorkQueueFocus,
  WorkServiceType,
  WorkQueueView,
} from "../types/work-management";

type ActionMode =
  | "CREATE"
  | "EDIT"
  | "REASSIGN"
  | "SUPPORT"
  | "REVIEW"
  | "REOPEN"
  | "CANCEL"
  | "RETENTION_HOLD"
  | "DELETION_REQUEST"
  | "COMPLETE"
  | "HELP"
  | null;

const WORK_TYPES: Array<{ value: WorkItemType; label: string }> = [
  { value: "ROUTINE_TASK", label: "Routine Work" },
  { value: "TROUBLE_TICKET", label: "Trouble ticket" },
  { value: "MAINTENANCE", label: "Network maintenance" },
  { value: "NEW_CONNECTION", label: "New Installation" },
  { value: "UPDATE_SERVICES", label: "Update Services" },
  { value: "INSPECTION", label: "Inspection" },
  { value: "EMERGENCY_WORK", label: "Emergency Work" },
  { value: "ADMINISTRATIVE_TASK", label: "Administrative Work" },
];

const SERVICE_TYPES: Array<{ value: WorkServiceType; label: string }> = [
  { value: "DATA", label: "Data" },
  { value: "VOICE", label: "Voice" },
  { value: "IPTV", label: "IPTV" },
  { value: "SIP", label: "SIP" },
  { value: "OTHER", label: "Other" },
];

const PRIORITIES: WorkPriority[] = ["LOW", "NORMAL", "HIGH", "CRITICAL"];
const STATUSES: WorkItemStatus[] = [
  "ASSIGNED",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "HELP_REQUESTED",
  "COMPLETED_PENDING_REVIEW",
  "REOPENED",
  "BLOCKED",
  "CLOSED",
  "CANCELLED",
];

function formatLabel(value: string): string {
  if (value === "MAINTENANCE") return "Network maintenance";
  if (value === "NEW_CONNECTION") return "New Installation";
  if (value === "DELEGATED") return "Assigned to Team";

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string | null): string {
  return formatKathmanduDateTime(value);
}

function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  return kathmanduDateTimeLocalToIso(value);
}

function createDefaultWorkForm() {
  const plannedStart = new Date();
  const dueAt = new Date(plannedStart.getTime() + 4 * 60 * 60 * 1000);

  return {
    type: "TROUBLE_TICKET" as WorkItemType,
    title: "",
    description: "",
    customerName: "",
    customerContactType: "MOBILE" as WorkContactType,
    customerContactNumber: "",
    locationText: "",
    serviceNumber: "",
    olt: "",
    fdcName: "",
    fapName: "",
    serviceTypes: [] as WorkServiceType[],
    otherServiceText: "",
    registeredAt: "",
    plannedStartAt: plannedStart.toISOString(),
    dueAt: dueAt.toISOString(),
    assignmentMode: "TEAM" as "TEAM" | "STAFF",
    assignedDepartmentId: "",
    assignedTeamId: "",
    primaryAssigneeAccountId: "",
    salesDepartmentId: "",
    salesMemberAccountId: "",
    supportingDepartmentId: "",
    supportingAssigneeAccountIds: [] as string[],
    responsibleManagerAccountId: "",
    parentWorkItemId: "",
    teamInstructions: "",
    createAnother: false,
  };
}

function toDateInput(value: Date): string {
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function getDefaultHistoryFrom(): string {
  const value = new Date();
  value.setDate(value.getDate() - 30);
  return toDateInput(value);
}

function getLocalDayRange(value = new Date()) {
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  const end = new Date(value);
  end.setHours(23, 59, 59, 999);

  return {
    dayKey: toDateInput(value),
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

function isArchivedWork(item: WorkItem | null): boolean {
  return Boolean(
    item?.archiveEligibleAt &&
      new Date(item.archiveEligibleAt).getTime() <= Date.now(),
  );
}

function isDeletionEligible(item: WorkItem | null): boolean {
  return Boolean(
    item?.deletionEligibleAt &&
      new Date(item.deletionEligibleAt).getTime() <= Date.now(),
  );
}

function getTerminalDate(item: WorkItem): string | null {
  return item.status === "CLOSED" ? item.closedAt : item.cancelledAt;
}

function getAccountName(account: WorkItem["createdBy"]): string {
  return account.employee?.empName ?? account.username ?? "Authorized account";
}

function getCandidateName(candidate: WorkAssignmentCandidate): string {
  return (
    candidate.account.employee?.empName ??
    candidate.account.username ??
    "Unnamed employee"
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The work-management request could not be completed.";
}

function hasInformationRequest(workItem: WorkItem | null): boolean {
  return Boolean(
    workItem?.completionReports?.some(
      (report) => report.reviewStatus === "INFORMATION_REQUESTED",
    ),
  );
}

function defaultFocusForRole(): WorkQueueFocus {
  return "CREATED_BY_ME";
}

interface SearchableSelectOption {
  value: string;
  label: string;
  searchText?: string;
}

interface SearchableSelectProps {
  id: string;
  label: string;
  value: string;
  options: SearchableSelectOption[];
  placeholder: string;
  required?: boolean;
  description?: string;
  onChange: (value: string) => void;
}

function SearchableSelect({
  id,
  label,
  value,
  options,
  placeholder,
  required = false,
  description,
  onChange,
}: SearchableSelectProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions = useMemo(
    () =>
      options.filter((option) => {
        if (!normalizedQuery || option.value === value) return true;
        return `${option.label} ${option.searchText ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery);
      }),
    [normalizedQuery, options, value],
  );

  return (
    <div className="management-work-searchable-select">
      <span className="management-work-form__label-text" id={`${id}-label`}>
        {label}{required && (
          <> <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span></>
        )}
      </span>
      <input
        type="search"
        className="management-work-searchable-select__search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={`Search ${label.toLowerCase()}`}
        aria-label={`Search ${label.toLowerCase()}`}
        autoComplete="off"
      />
      <select
        id={id}
        required={required}
        value={value}
        aria-labelledby={`${id}-label`}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {visibleOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {description && <small className="management-work-form__help">{description}</small>}
    </div>
  );
}

type CreateWizardStep = 1 | 2 | 3;

interface CreateValidationError {
  step: 1 | 2;
  message: string;
  fieldId?: string;
}

export function ManagementWorkPage() {
  const { account, accessToken } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDedicatedCreateRoute = location.pathname === "/work-management/create";
  const [summary, setSummary] =
    useState<WorkManagementDashboardSummary | null>(null);
  const [queue, setQueue] = useState<WorkItemListResponse | null>(null);
  const [options, setOptions] =
    useState<WorkAssignmentOptionsResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedWork, setSelectedWork] = useState<WorkItem | null>(null);
  const [activities, setActivities] = useState<WorkActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [openingReviewId, setOpeningReviewId] = useState<string | null>(null);
  const [openingTeamAssignmentId, setOpeningTeamAssignmentId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dayKey, setDayKey] = useState(() => getLocalDayRange().dayKey);
  const [dailyOpen, setDailyOpen] = useState<WorkItem[]>([]);
  const [dailyCompleted, setDailyCompleted] = useState<WorkItem[]>([]);
  const [dailyTotals, setDailyTotals] = useState({ open: 0, completed: 0 });
  const [dailyLoading, setDailyLoading] = useState(true);
  const [workspaceMode, setWorkspaceMode] = useState<
    "CURRENT" | "TODAY" | "HISTORY" | "ARCHIVE"
  >("CURRENT");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filters, setFilters] = useState({
    view: "ACTIVE" as WorkQueueView,
    focus: defaultFocusForRole(),
    search: "",
    status: "" as WorkItemStatus | "",
    type: "" as WorkItemType | "",
    priority: "" as WorkPriority | "",
    departmentId: "",
    assigneeAccountId: "",
    assignedTeamId: "",
    salesMemberAccountId: "",
    historyFrom: getDefaultHistoryFrom(),
    historyTo: toDateInput(new Date()),
    page: 1,
  });
  const requestedFocus = searchParams.get("focus");
  const requestedView = searchParams.get("view");
  const requestedStatus = searchParams.get("status");
  const requestedPriority = searchParams.get("priority");

  useEffect(() => {
    if (!account?.role) return;

    const teamFocuses: WorkQueueFocus[] = [
      "TEAM_QUEUE",
      "ASSIGNED_TO_ME",
      "CREATED_BY_ME",
      "AWAITING_MY_REVIEW",
    ];
    const seniorManagementFocuses: WorkQueueFocus[] = [
      "ACTION_CENTER",
      "ASSIGNED_TO_ME",
      "CREATED_BY_ME",
      "AWAITING_MY_REVIEW",
      "EXCEPTIONS",
      "EXPLORER",
    ];
    // Super Admin governs branch work but is not an employee assignee.
    const superAdminFocuses: WorkQueueFocus[] = [
      "ACTION_CENTER",
      "CREATED_BY_ME",
      "AWAITING_MY_REVIEW",
      "EXCEPTIONS",
      "EXPLORER",
    ];
    const allowedFocuses =
      account.role === "TEAM_MANAGER"
        ? teamFocuses
        : account.role === "SUPER_ADMIN"
          ? superAdminFocuses
          : seniorManagementFocuses;
    const allowedViews: WorkQueueView[] =
      account.role === "SUPER_ADMIN"
        ? ["ACTIVE", "HISTORY", "ARCHIVE", "DELETION_REVIEW"]
        : ["ACTIVE", "HISTORY", "ARCHIVE"];

    if (requestedView && allowedViews.includes(requestedView as WorkQueueView)) {
      setWorkspaceMode(
        requestedView === "HISTORY"
          ? "HISTORY"
          : requestedView === "ARCHIVE" || requestedView === "DELETION_REVIEW"
            ? "ARCHIVE"
            : "CURRENT",
      );
    }

    // Report links are navigation hints only; the role allow-list and API remain authoritative.
    setFilters((current) => {
      const focus =
        requestedFocus &&
        allowedFocuses.includes(requestedFocus as WorkQueueFocus)
          ? (requestedFocus as WorkQueueFocus)
          : allowedFocuses.includes(current.focus)
            ? current.focus
            : defaultFocusForRole();
      const view =
        requestedView && allowedViews.includes(requestedView as WorkQueueView)
          ? (requestedView as WorkQueueView)
          : current.view;
      const status =
        requestedStatus && STATUSES.includes(requestedStatus as WorkItemStatus)
          ? (requestedStatus as WorkItemStatus)
          : current.status;
      const priority =
        requestedPriority && PRIORITIES.includes(requestedPriority as WorkPriority)
          ? (requestedPriority as WorkPriority)
          : current.priority;

      return focus === current.focus &&
        view === current.view &&
        status === current.status &&
        priority === current.priority
        ? current
        : { ...current, focus, view, status, priority, page: 1 };
    });
  }, [
    account?.role,
    requestedFocus,
    requestedPriority,
    requestedStatus,
    requestedView,
  ]);

  const [createForm, setCreateForm] = useState(createDefaultWorkForm);
  const [createStep, setCreateStep] = useState<CreateWizardStep>(1);
  const [createInitialSnapshot, setCreateInitialSnapshot] = useState("");
  const [supportMemberSearch, setSupportMemberSearch] = useState("");
  const createFormRef = useRef<HTMLFormElement | null>(null);
  const createIsDirty = Boolean(
    isDedicatedCreateRoute &&
      createInitialSnapshot &&
      JSON.stringify(createForm) !== createInitialSnapshot,
  );
  const [actionForm, setActionForm] = useState({
    note: "",
    accountId: "",
    priority: "NORMAL" as WorkPriority,
    registeredAt: "",
    plannedStartAt: "",
    dueAt: "",
    locationText: "",
    completionResult: "FULLY_RESOLVED" as WorkCompletionResult,
    moreWorkRequired: false,
    helpReason: "NEED_ANOTHER_EMPLOYEE" as WorkHelpReason,
  });

  useEffect(() => {
    if (!isDedicatedCreateRoute) return;

    const initialForm = createDefaultWorkForm();
    setCreateForm(initialForm);
    setCreateInitialSnapshot(JSON.stringify(initialForm));
    setCreateStep(1);
    setSupportMemberSearch("");
    setActionError("");
    setNotice("");
    setActionMode("CREATE");
  }, [isDedicatedCreateRoute]);

  useEffect(() => {
    if (!createIsDirty) return;

    function warnBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = "";
    }

    function guardInternalNavigation(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        destination.pathname === window.location.pathname
      ) {
        return;
      }

      if (!window.confirm("Discard the information entered for this work item?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", guardInternalNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", guardInternalNavigation, true);
    };
  }, [createIsDirty]);

  useEffect(() => {
    if (isDedicatedCreateRoute) return;

    const message = window.sessionStorage.getItem("nt-message:work-created-notice");
    const workItemId = window.sessionStorage.getItem("nt-message:work-created-id");
    if (message) {
      setNotice(message);
      window.sessionStorage.removeItem("nt-message:work-created-notice");
    }
    if (workItemId) {
      setSelectedId(workItemId);
      window.sessionStorage.removeItem("nt-message:work-created-id");
    }
  }, [isDedicatedCreateRoute]);

  const loadOverview = useCallback(async () => {
    if (!accessToken) return;

    setLoading(true);
    setError("");

    try {
      const [summaryResponse, queueResponse] = await Promise.all([
        getManagementWorkDashboardSummary(accessToken),
        listWorkItems(accessToken, {
          view: filters.view,
          focus: filters.focus,
          page: filters.page,
          limit: 20,
          search: filters.search || undefined,
          status: filters.status || undefined,
          type: filters.type || undefined,
          priority: filters.priority || undefined,
          departmentId: filters.departmentId || undefined,
          assigneeAccountId: filters.assigneeAccountId || undefined,
          assignedTeamId: filters.assignedTeamId || undefined,
          salesMemberAccountId: filters.salesMemberAccountId || undefined,
          historyFrom:
            filters.view === "HISTORY" && filters.historyFrom
              ? new Date(`${filters.historyFrom}T00:00:00`).toISOString()
              : undefined,
          historyTo:
            filters.view === "HISTORY" && filters.historyTo
              ? new Date(`${filters.historyTo}T23:59:59.999`).toISOString()
              : undefined,
        }),
      ]);
      setSummary(summaryResponse);
      setQueue(queueResponse);
      setSelectedId((current) => {
        if (current && queueResponse.data.some((item) => item.id === current)) {
          return current;
        }
        // Keep the overview calm: users choose a ticket before the detail view opens.
        return null;
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [accessToken, filters]);

  const loadOptions = useCallback(async () => {
    if (!accessToken) return;

    try {
      const response = await listManagementAssignmentOptions(accessToken, {
        page: 1,
        limit: 200,
      });
      setOptions(response);
    } catch (requestError) {
      setActionError(getErrorMessage(requestError));
    }
  }, [accessToken]);

  const loadDetail = useCallback(async () => {
    if (!accessToken || !selectedId) {
      setSelectedWork(null);
      setActivities([]);
      return;
    }

    setDetailLoading(true);
    try {
      const [detail, activity] = await Promise.all([
        getWorkItem(accessToken, selectedId),
        listWorkActivity(accessToken, selectedId),
      ]);
      setSelectedWork(detail.workItem);
      setActivities(activity.data);
    } catch (requestError) {
      setActionError(getErrorMessage(requestError));
    } finally {
      setDetailLoading(false);
    }
  }, [accessToken, selectedId]);

  useEffect(() => {
    // Reconcile the queue focus after authentication restores the authoritative account role.
    setFilters((current) => {
      const teamManager = account?.role === "TEAM_MANAGER";
      const invalidTeamFocus =
        teamManager && ["ACTION_CENTER", "EXCEPTIONS", "EXPLORER"].includes(current.focus);
      const invalidOversightFocus = !teamManager && current.focus === "TEAM_QUEUE";
      const invalidSuperAdminFocus =
        account?.role === "SUPER_ADMIN" && current.focus === "ASSIGNED_TO_ME";

      return invalidTeamFocus || invalidOversightFocus || invalidSuperAdminFocus
        ? { ...current, focus: defaultFocusForRole(), page: 1 }
        : current;
    });
  }, [account?.role]);

  useEffect(() => {
    if (!isDedicatedCreateRoute) {
      void loadOverview();
    }
  }, [isDedicatedCreateRoute, loadOverview, refreshKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextDayKey = getLocalDayRange().dayKey;
      setDayKey((current) => (current === nextDayKey ? current : nextDayKey));
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isDedicatedCreateRoute || !accessToken || !account?.role) return;

    let active = true;
    const range = getLocalDayRange();
    const focus: WorkQueueFocus =
      account.role === "TEAM_MANAGER" ? "TEAM_QUEUE" : "EXPLORER";
    setDailyLoading(true);

    Promise.all([
      listWorkItems(accessToken, {
        view: "ACTIVE",
        focus,
        page: 1,
        limit: 6,
        plannedFrom: range.from,
        plannedTo: range.to,
      }),
      listWorkItems(accessToken, {
        view: "HISTORY",
        focus,
        status: "CLOSED",
        page: 1,
        limit: 6,
        plannedFrom: range.from,
        plannedTo: range.to,
        historyFrom: range.from,
        historyTo: range.to,
      }),
    ])
      .then(([openResponse, completedResponse]) => {
        if (!active) return;

        setDailyOpen(openResponse.data);
        setDailyCompleted(completedResponse.data);
        setDailyTotals({
          open: openResponse.pagination.total,
          completed: completedResponse.pagination.total,
        });
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setDailyLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, account?.role, dayKey, isDedicatedCreateRoute, refreshKey]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions, refreshKey]);

  useEffect(() => {
    if (!isDedicatedCreateRoute) {
      void loadDetail();
    }
  }, [isDedicatedCreateRoute, loadDetail, refreshKey]);

  useEffect(() => {
    if (!accessToken) return;
    // Realtime events trigger fresh authorized API reads instead of trusting socket payload data.
    const socket = createMessagingSocket(accessToken);
    const refresh = () => setRefreshKey((current) => current + 1);
    socket.on("work:item-updated", refresh);
    const disconnectSocket = connectMessagingSocketAfterEffectCommit(socket);

    return () => {
      socket.off("work:item-updated", refresh);
      disconnectSocket();
    };
  }, [accessToken]);

  const availableDepartments = useMemo(
    () => options?.departments ?? [],
    [options?.departments],
  );

  const selectedAssignedDepartment = useMemo(
    () =>
      availableDepartments.find(
        (department) => department.id === createForm.assignedDepartmentId,
      ) ?? null,
    [availableDepartments, createForm.assignedDepartmentId],
  );

  const availableAssignmentCandidates = useMemo(() => {
    const candidates = options?.data ?? [];

    if (createForm.parentWorkItemId) {
      // Delegated child work keeps the existing role hierarchy and parent-task scope.
      return candidates.filter((candidate) => {
        if (candidate.account.id === account?.id) return false;
        if (account?.role === "SENIOR_MANAGEMENT") {
          return ["TEAM_MANAGER", "EMPLOYEE"].includes(candidate.account.role);
        }
        if (account?.role === "TEAM_MANAGER") {
          return candidate.account.role === "EMPLOYEE";
        }
        return false;
      });
    }

    if (!createForm.assignedDepartmentId) return [];

    return candidates.filter(
      (candidate) =>
        candidate.department?.id === createForm.assignedDepartmentId,
    );
  }, [
    account?.id,
    account?.role,
    createForm.assignedDepartmentId,
    createForm.parentWorkItemId,
    options?.data,
  ]);

  // Workload warnings help managers make a decision without silently blocking emergencies.
  const selectedCandidate = useMemo(
    () =>
      availableAssignmentCandidates.find(
        (candidate) =>
          candidate.account.id === createForm.primaryAssigneeAccountId,
      ) ?? null,
    [availableAssignmentCandidates, createForm.primaryAssigneeAccountId],
  );

  const availableTeams = useMemo(() => {
    if (!createForm.assignedDepartmentId) return [];
    return (options?.teams ?? []).filter(
      (team) => team.department.id === createForm.assignedDepartmentId,
    );
  }, [createForm.assignedDepartmentId, options?.teams]);

  const selectedTeam = useMemo(
    () =>
      availableTeams.find((team) => team.id === createForm.assignedTeamId) ??
      null,
    [availableTeams, createForm.assignedTeamId],
  );

  const assignedTeamMemberAccountIds = useMemo(
    () => new Set(selectedTeam?.memberAccountIds ?? []),
    [selectedTeam?.memberAccountIds],
  );

  const targetWorkDivisionId =
    selectedTeam?.department.divisionId ?? selectedCandidate?.division?.id ?? null;

  const collaboratorDepartments = useMemo(() => {
    if (!targetWorkDivisionId) return [];
    return availableDepartments.filter(
      (department) => department.divisionId === targetWorkDivisionId,
    );
  }, [availableDepartments, targetWorkDivisionId]);

  const availableSalesMembers = useMemo(() => {
    if (!targetWorkDivisionId || !createForm.salesDepartmentId) return [];

    return (options?.salesMembers ?? []).filter(
      (candidate) =>
        candidate.division?.id === targetWorkDivisionId &&
        candidate.department?.id === createForm.salesDepartmentId &&
        candidate.account.id !== createForm.primaryAssigneeAccountId &&
        !assignedTeamMemberAccountIds.has(candidate.account.id) &&
        !createForm.supportingAssigneeAccountIds.includes(candidate.account.id),
    );
  }, [
    assignedTeamMemberAccountIds,
    createForm.primaryAssigneeAccountId,
    createForm.salesDepartmentId,
    createForm.supportingAssigneeAccountIds,
    options?.salesMembers,
    targetWorkDivisionId,
  ]);

  const selectedSalesMember = useMemo(
    () =>
      availableSalesMembers.find(
        (candidate) => candidate.account.id === createForm.salesMemberAccountId,
      ) ?? null,
    [availableSalesMembers, createForm.salesMemberAccountId],
  );

  const availableSupportMembers = useMemo(() => {
    if (!targetWorkDivisionId || !createForm.supportingDepartmentId) return [];

    return (options?.supportMembers ?? []).filter(
      (candidate) =>
        candidate.division?.id === targetWorkDivisionId &&
        candidate.department?.id === createForm.supportingDepartmentId &&
        candidate.account.id !== createForm.primaryAssigneeAccountId &&
        candidate.account.id !== createForm.salesMemberAccountId &&
        !assignedTeamMemberAccountIds.has(candidate.account.id),
    );
  }, [
    assignedTeamMemberAccountIds,
    createForm.primaryAssigneeAccountId,
    createForm.salesMemberAccountId,
    createForm.supportingDepartmentId,
    options?.supportMembers,
    targetWorkDivisionId,
  ]);

  const visibleSupportMembers = useMemo(() => {
    const query = supportMemberSearch.trim().toLowerCase();
    if (!query) return availableSupportMembers;

    return availableSupportMembers.filter((candidate) =>
      `${getCandidateName(candidate)} ${candidate.account.employee?.empId ?? ""} ${candidate.account.employee?.designation ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [availableSupportMembers, supportMemberSearch]);

  const selectedSupportingMembers = useMemo(
    () =>
      (options?.supportMembers ?? []).filter((candidate) =>
        createForm.supportingAssigneeAccountIds.includes(candidate.account.id),
      ),
    [createForm.supportingAssigneeAccountIds, options?.supportMembers],
  );

  const responsibleManagers = useMemo(() => {
    const managers = options?.responsibleManagers ?? [];
    const targetDivisionId =
      selectedTeam?.department.divisionId ?? selectedCandidate?.division?.id;
    const targetDepartmentId =
      selectedTeam?.department.id ?? selectedCandidate?.department?.id;
    if (!targetDivisionId && !targetDepartmentId) return managers;

    return managers.filter((manager) => {
      if (manager.account.id === account?.id) return true;
      if (manager.account.role === "SUPER_ADMIN") return true;
      if (manager.account.role === "SENIOR_MANAGEMENT") {
        return manager.divisionId === targetDivisionId;
      }
      return manager.departmentId === targetDepartmentId;
    });
  }, [account?.id, options, selectedCandidate, selectedTeam]);

  const selectedResponsibleManager = useMemo(
    () =>
      responsibleManagers.find(
        (manager) => manager.account.id === createForm.responsibleManagerAccountId,
      ) ?? null,
    [createForm.responsibleManagerAccountId, responsibleManagers],
  );

  const isAdministrativeWork = createForm.type === "ADMINISTRATIVE_TASK";
  const administrativeStaffAssignment =
    isAdministrativeWork && createForm.assignmentMode === "STAFF";
  const createRequiresServices = [
    "TROUBLE_TICKET",
    "NEW_CONNECTION",
    "UPDATE_SERVICES",
  ].includes(createForm.type);
  const createRequiresServiceNumber = createForm.type !== "MAINTENANCE";
  const createAllowsSalesMember = [
    "NEW_CONNECTION",
    "UPDATE_SERVICES",
  ].includes(createForm.type);
  const networkFieldQualifier =
    createForm.type === "NEW_CONNECTION"
      ? "New"
      : createForm.type === "UPDATE_SERVICES"
        ? "Existing"
        : "";

  const assignedDepartmentOptions: SearchableSelectOption[] =
    availableDepartments.map((department) => ({
      value: department.id,
      label: `${department.name} · ${department.division.name}`,
      searchText: `${department.code} ${department.division.code}`,
    }));
  const assignedTeamOptions: SearchableSelectOption[] = availableTeams.map(
    (team) => ({
      value: team.id,
      label: `${team.name} · ${team.admin.name} · ${team.memberCount} members`,
      searchText: `${team.admin.empId} ${team.workload.active} active`,
    }),
  );
  const assignedStaffOptions: SearchableSelectOption[] =
    availableAssignmentCandidates.map((candidate) => ({
      value: candidate.account.id,
      label: `${getCandidateName(candidate)} · ${candidate.account.employee?.empId ?? "No employee ID"}`,
      searchText: `${candidate.department?.name ?? ""} ${candidate.account.employee?.designation ?? ""}`,
    }));
  const collaboratorDepartmentOptions: SearchableSelectOption[] =
    collaboratorDepartments.map((department) => ({
      value: department.id,
      label: department.name,
      searchText: `${department.code} ${department.division.name}`,
    }));
  const salesMemberOptions: SearchableSelectOption[] =
    availableSalesMembers.map((candidate) => ({
      value: candidate.account.id,
      label: `${getCandidateName(candidate)} · ${candidate.account.employee?.empId ?? "No employee ID"}`,
      searchText: `${candidate.account.employee?.designation ?? ""} ${candidate.department?.name ?? ""}`,
    }));

  function refresh(message?: string): void {
    if (message) setNotice(message);
    setActionError("");
    setRefreshKey((current) => current + 1);
  }

  function openAction(
    mode: Exclude<ActionMode, null>,
    workItem: WorkItem | null = selectedWork,
  ): void {
    setActionError("");
    setNotice("");
    setActionMode(mode);
    setActionForm({
      note: "",
      accountId:
        workItem?.assignments.find(
          (assignment) => assignment.assignmentRole === "PRIMARY",
        )?.assignee.id ?? "",
      priority: workItem?.priority ?? "NORMAL",
      registeredAt: workItem?.registeredAt ?? "",
      plannedStartAt: workItem?.plannedStartAt ?? "",
      dueAt: workItem?.dueAt ?? "",
      locationText: workItem?.locationText ?? "",
      completionResult: "FULLY_RESOLVED",
      moreWorkRequired: false,
      helpReason: "NEED_ANOTHER_EMPLOYEE",
    });
  }

  async function openQueueReview(item: WorkItem): Promise<void> {
    if (!accessToken || openingReviewId) return;

    setOpeningReviewId(item.id);
    setError("");
    setActionError("");

    try {
      // Load the full ticket before opening the review form so the manager can
      // check the submitted completion report without opening the detail page.
      const detail = await getWorkItem(accessToken, item.id);
      const workItem = detail.workItem;

      if (
        workItem.status !== "COMPLETED_PENDING_REVIEW" ||
        workItem.responsibleManager.id !== account?.id
      ) {
        throw new Error("This task is no longer waiting for your review.");
      }

      if (!workItem.completionReports?.[0]) {
        throw new Error("The completion report is not available yet.");
      }

      setSelectedWork(workItem);
      openAction("REVIEW", workItem);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setOpeningReviewId(null);
    }
  }

  async function runAction(task: () => Promise<{ message: string }>) {
    setActionBusy(true);
    setActionError("");
    try {
      const result = await task();
      setActionMode(null);
      refresh(result.message);
    } catch (requestError) {
      setActionError(getErrorMessage(requestError));
    } finally {
      setActionBusy(false);
    }
  }

  function showCreateValidation(error: CreateValidationError): void {
    setCreateStep(error.step);
    setActionError(error.message);
    const fieldId = error.fieldId;
    if (fieldId) {
      window.setTimeout(() => {
        document.getElementById(fieldId)?.focus();
      }, 0);
    }
  }

  function validateCreateWizardStep(step: 1 | 2): CreateValidationError | null {
    if (step === 1) {
      if (isAdministrativeWork) {
        if (createForm.title.trim().length < 2) {
          return { step, message: "Enter a task title.", fieldId: "create-work-title" };
        }
        if (createForm.description.trim().length < 2) {
          return {
            step,
            message: "Enter a task description.",
            fieldId: "create-work-description",
          };
        }
        return null;
      }

      if (createForm.customerName.trim().length < 2) {
        return {
          step,
          message: "Enter the customer name.",
          fieldId: "create-work-customer-name",
        };
      }

      const contactNumber = createForm.customerContactNumber.trim();
      if (createForm.customerContactType === "MOBILE" && !/^\d{10}$/.test(contactNumber)) {
        return {
          step,
          message: "Mobile number must contain exactly 10 digits.",
          fieldId: "create-work-contact-number",
        };
      }
      if (createForm.customerContactType === "TELEPHONE") {
        const telephoneDigits = contactNumber.replace(/\D/g, "").length;
        if (!/^[0-9][0-9 -]*[0-9]$/.test(contactNumber)) {
          return {
            step,
            message: "Telephone number may contain only digits, spaces and hyphens.",
            fieldId: "create-work-contact-number",
          };
        }
        if (telephoneDigits < 6 || telephoneDigits > 12) {
          return {
            step,
            message: "Telephone number must contain between 6 and 12 digits.",
            fieldId: "create-work-contact-number",
          };
        }
      }
      if (createForm.locationText.trim().length < 2) {
        return { step, message: "Enter the work location.", fieldId: "create-work-location" };
      }
      if (createRequiresServiceNumber && !createForm.serviceNumber.trim()) {
        return {
          step,
          message: `Enter the ${["NEW_CONNECTION", "UPDATE_SERVICES"].includes(createForm.type) ? "token" : "service"} number.`,
          fieldId: "create-work-service-number",
        };
      }
      if (!createForm.olt.trim()) {
        return { step, message: "Enter the OLT.", fieldId: "create-work-olt" };
      }
      if (!createForm.fdcName.trim()) {
        return { step, message: "Enter the FDC name.", fieldId: "create-work-fdc" };
      }
      if (!createForm.fapName.trim()) {
        return { step, message: "Enter the FAP name.", fieldId: "create-work-fap" };
      }
      if (createRequiresServices && createForm.serviceTypes.length === 0) {
        return { step, message: "Select at least one service activity.", fieldId: "create-work-services" };
      }
      if (createForm.serviceTypes.includes("OTHER") && !createForm.otherServiceText.trim()) {
        return {
          step,
          message: "Describe the other service activity.",
          fieldId: "create-work-other-service",
        };
      }
      return null;
    }

    const registeredAt = toIso(createForm.registeredAt);
    const plannedStartAt = toIso(createForm.plannedStartAt);
    const dueAt = toIso(createForm.dueAt);
    if (!createForm.assignedDepartmentId || !selectedAssignedDepartment) {
      return {
        step,
        message: "Choose the department responsible for this work.",
        fieldId: "create-work-assigned-department",
      };
    }
    if (administrativeStaffAssignment) {
      if (!createForm.primaryAssigneeAccountId || !selectedCandidate) {
        return {
          step,
          message: "Choose the staff member responsible for this administrative work.",
          fieldId: "create-work-primary-assignee",
        };
      }
    } else if (!createForm.assignedTeamId || !selectedTeam) {
      return {
        step,
        message: "Choose the team responsible for this work.",
        fieldId: "create-work-assigned-team",
      };
    }
    if (createAllowsSalesMember) {
      if (!createForm.salesDepartmentId) {
        return {
          step,
          message: "Choose the department providing the Sales Member.",
          fieldId: "create-work-sales-department",
        };
      }
      if (!createForm.salesMemberAccountId || !selectedSalesMember) {
        return {
          step,
          message: "Choose a Sales Member for this work.",
          fieldId: "create-work-sales-member",
        };
      }
    }
    if (
      createForm.supportingAssigneeAccountIds.length > 0 &&
      !createForm.supportingDepartmentId
    ) {
      return {
        step,
        message: "Choose the Supporting Staff department first.",
        fieldId: "create-work-supporting-department",
      };
    }
    const invalidSupport = createForm.supportingAssigneeAccountIds.some(
      (accountId) =>
        !availableSupportMembers.some(
          (candidate) => candidate.account.id === accountId,
        ),
    );
    if (invalidSupport) {
      return {
        step,
        message: "Choose Supporting Staff only from the selected department and outside the main team.",
        fieldId: "create-work-support-search",
      };
    }
    if (!registeredAt) {
      return {
        step,
        message: "Select the customer registration date and time.",
        fieldId: "create-work-registered-at",
      };
    }
    if (!plannedStartAt) {
      return {
        step,
        message: "Select a valid planned start date and time.",
        fieldId: "create-work-planned-start",
      };
    }
    if (!dueAt) {
      return {
        step,
        message: "Select a valid due date and time.",
        fieldId: "create-work-due-at",
      };
    }
    if (new Date(registeredAt).getTime() > Date.now()) {
      return {
        step,
        message: "Registered date and time cannot be in the future.",
        fieldId: "create-work-registered-at",
      };
    }
    if (new Date(plannedStartAt).getTime() < new Date(registeredAt).getTime()) {
      return {
        step,
        message: "Planned start cannot be earlier than the registered date and time.",
        fieldId: "create-work-planned-start",
      };
    }
    if (new Date(dueAt).getTime() <= new Date(plannedStartAt).getTime()) {
      return {
        step,
        message: "Due date and time must be later than the planned start.",
        fieldId: "create-work-due-at",
      };
    }
    return null;
  }

  function continueCreateWizard(): void {
    if (!createFormRef.current?.reportValidity()) return;

    const currentError = validateCreateWizardStep(createStep === 1 ? 1 : 2);
    if (currentError) {
      showCreateValidation(currentError);
      return;
    }
    setActionError("");
    setCreateStep((current) => (current === 1 ? 2 : 3));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function leaveCreateWizard(): void {
    if (createIsDirty && !window.confirm("Discard the information entered for this work item?")) {
      return;
    }
    setActionMode(null);
    navigate("/work-management");
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;

    const isDelegatedAssignment = Boolean(createForm.parentWorkItemId);
    let registeredAt: string | undefined;
    let plannedStartAt: string | undefined;
    let dueAt: string | undefined;

    if (isDelegatedAssignment) {
      plannedStartAt = toIso(createForm.plannedStartAt);
      dueAt = toIso(createForm.dueAt);

      if (!plannedStartAt) {
        setActionError("Select a valid planned start date and time.");
        return;
      }
      if (!dueAt) {
        setActionError("Select a valid due date and time.");
        return;
      }
      if (new Date(dueAt).getTime() <= new Date(plannedStartAt).getTime()) {
        setActionError("Due date and time must be later than the planned start.");
        return;
      }
      if (createForm.teamInstructions.trim().length < 2) {
        setActionError("Enter clear instructions for the team member.");
        return;
      }
      if (
        !availableAssignmentCandidates.some(
          (candidate) => candidate.account.id === createForm.primaryAssigneeAccountId,
        )
      ) {
        setActionError("Choose an available team member below your management level.");
        return;
      }
      if (
        selectedWork &&
        new Date(dueAt).getTime() > new Date(selectedWork.dueAt).getTime()
      ) {
        setActionError("The team due time cannot be later than the main task due time.");
        return;
      }
    } else {
      const validationError =
        validateCreateWizardStep(1) ?? validateCreateWizardStep(2);
      if (validationError) {
        showCreateValidation(validationError);
        return;
      }

      registeredAt = toIso(createForm.registeredAt);
      plannedStartAt = toIso(createForm.plannedStartAt);
      dueAt = toIso(createForm.dueAt);
    }

    if (!plannedStartAt || !dueAt) {
      setActionError("Complete the schedule before assigning this work.");
      return;
    }

    const contactNumber = createForm.customerContactNumber.trim();
    setActionBusy(true);
    setActionError("");

    try {
      const result = await createManagementWorkItem(accessToken, {
        type: createForm.type,
        ...(isDelegatedAssignment
          ? {
              teamInstructions: createForm.teamInstructions.trim(),
            }
          : isAdministrativeWork
            ? {
                title: createForm.title.trim(),
                description: createForm.description.trim(),
              }
            : {
                customerName: createForm.customerName,
                customerContactType: createForm.customerContactType,
                customerContactNumber: contactNumber,
                locationText: createForm.locationText,
                serviceNumber: createRequiresServiceNumber
                  ? createForm.serviceNumber
                  : undefined,
                olt: createForm.olt,
                fdcName: createForm.fdcName,
                fapName: createForm.fapName,
                serviceTypes: createForm.serviceTypes,
                otherServiceText: createForm.serviceTypes.includes("OTHER")
                  ? createForm.otherServiceText
                  : undefined,
              }),
        registeredAt,
        plannedStartAt,
        dueAt,
        primaryAssigneeAccountId:
          isDelegatedAssignment || administrativeStaffAssignment
            ? createForm.primaryAssigneeAccountId
            : undefined,
        assignedTeamId:
          !isDelegatedAssignment && !administrativeStaffAssignment
            ? createForm.assignedTeamId
            : undefined,
        salesMemberAccountId:
          createAllowsSalesMember && createForm.salesMemberAccountId
            ? createForm.salesMemberAccountId
            : undefined,
        supportingAssigneeAccountIds: isDelegatedAssignment
          ? undefined
          : createForm.supportingAssigneeAccountIds,
        responsibleManagerAccountId:
          createForm.responsibleManagerAccountId || undefined,
        parentWorkItemId: createForm.parentWorkItemId || undefined,
      });

      setWorkspaceMode("CURRENT");
      setFilters((current) => ({
        ...current,
        view: "ACTIVE",
        focus: isDelegatedAssignment
          ? "ASSIGNED_TO_ME"
          : defaultFocusForRole(),
        status: "",
        page: 1,
      }));
      setSelectedId(
        isDelegatedAssignment
          ? createForm.parentWorkItemId
          : result.workItem.id,
      );
      setNotice(result.message);
      setRefreshKey((current) => current + 1);

      if (!isDelegatedAssignment && createForm.createAnother) {
        const nextForm = {
          ...createDefaultWorkForm(),
          createAnother: true,
        };
        setCreateForm(nextForm);
        setCreateInitialSnapshot(JSON.stringify(nextForm));
        setCreateStep(1);
        setSupportMemberSearch("");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (!isDelegatedAssignment && isDedicatedCreateRoute) {
        window.sessionStorage.setItem(
          "nt-message:work-created-notice",
          result.message,
        );
        window.sessionStorage.setItem(
          "nt-message:work-created-id",
          result.workItem.id,
        );
        setCreateForm(createDefaultWorkForm());
        setActionMode(null);
        navigate("/work-management?focus=CREATED_BY_ME&view=ACTIVE", {
          replace: true,
        });
      } else {
        setCreateForm(createDefaultWorkForm());
        setActionMode(null);
      }
    } catch (requestError) {
      setActionError(getErrorMessage(requestError));
    } finally {
      setActionBusy(false);
    }
  }

  async function submitCurrentAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !selectedWork || !actionMode) return;

    if (actionMode === "EDIT") {
      await runAction(() =>
        updateManagementWorkItem(accessToken, selectedWork.id, {
          priority: actionForm.priority,
          registeredAt: toIso(actionForm.registeredAt),
          plannedStartAt: toIso(actionForm.plannedStartAt),
          dueAt: toIso(actionForm.dueAt),
          locationText: actionForm.locationText,
        }),
      );
      return;
    }

    if (actionMode === "REASSIGN") {
      await runAction(() =>
        reassignManagementWorkItem(accessToken, selectedWork.id, {
          primaryAssigneeAccountId: actionForm.accountId,
          reason: actionForm.note,
        }),
      );
      return;
    }

    if (actionMode === "SUPPORT") {
      await runAction(() =>
        addManagementWorkSupport(accessToken, selectedWork.id, {
          accountId: actionForm.accountId,
          reason: actionForm.note || undefined,
        }),
      );
      return;
    }

    if (actionMode === "REVIEW") {
      await runAction(() =>
        closeManagementWorkItem(accessToken, selectedWork.id, actionForm.note),
      );
      return;
    }

    if (actionMode === "REOPEN") {
      await runAction(() =>
        reopenManagementWorkItem(accessToken, selectedWork.id, actionForm.note),
      );
      return;
    }

    if (actionMode === "CANCEL") {
      await runAction(() =>
        cancelManagementWorkItem(accessToken, selectedWork.id, actionForm.note),
      );
      return;
    }

    if (actionMode === "HELP") {
      await runAction(() =>
        requestEmployeeWorkHelp(accessToken, selectedWork.id, {
          reason: actionForm.helpReason,
          note: actionForm.note || undefined,
          requestedHelperAccountId: actionForm.accountId || undefined,
        }),
      );
      return;
    }

    if (actionMode === "COMPLETE") {
      await runAction(() =>
        submitEmployeeWorkCompletion(accessToken, selectedWork.id, {
          result: actionForm.completionResult,
          summary: actionForm.note,
          moreWorkRequired: actionForm.moreWorkRequired,
        }),
      );
      return;
    }

    if (actionMode === "RETENTION_HOLD") {
      await runAction(() =>
        placeWorkRetentionHold(accessToken, selectedWork.id, actionForm.note),
      );
      return;
    }

    if (actionMode === "DELETION_REQUEST") {
      await runAction(() =>
        requestWorkDeletionReview(accessToken, selectedWork.id, actionForm.note),
      );
    }
  }

  async function acknowledgeAssignedWork(): Promise<void> {
    if (!accessToken || !selectedWork) return;
    await runAction(() => acknowledgeEmployeeWork(accessToken, selectedWork.id));
  }

  async function startAssignedWork(): Promise<void> {
    if (!accessToken || !selectedWork) return;
    await runAction(() => startEmployeeWork(accessToken, selectedWork.id));
  }

  function openTeamAssignment(workItem: WorkItem | null = selectedWork): void {
    if (!workItem) return;
    setSelectedWork(workItem);
    setCreateForm({
      ...createDefaultWorkForm(),
      type: workItem.type,
      customerName: workItem.customerName ?? "",
      customerContactType: workItem.customerContactType ?? "MOBILE",
      customerContactNumber: workItem.customerContactNumber ?? "",
      locationText: workItem.locationText ?? "",
      serviceNumber: workItem.serviceNumber ?? "",
      olt: workItem.olt ?? "",
      fdcName: workItem.fdcName ?? "",
      fapName: workItem.fapName ?? "",
      serviceTypes: workItem.serviceTypes,
      otherServiceText: workItem.otherServiceText ?? "",
      parentWorkItemId: workItem.id,
      teamInstructions: "",
      plannedStartAt: new Date().toISOString(),
      dueAt: workItem.dueAt,
      responsibleManagerAccountId: account?.id ?? "",
    });
    openAction("CREATE");
  }

  async function openQueueTeamAssignment(item: WorkItem): Promise<void> {
    if (!accessToken || openingTeamAssignmentId) return;

    setOpeningTeamAssignmentId(item.id);
    setError("");
    setActionError("");

    try {
      // Re-read the task before delegation so status and assignee checks cannot
      // become stale while the My Work queue is open.
      const detail = await getWorkItem(accessToken, item.id);
      const workItem = detail.workItem;
      const activePrimary = workItem.assignments.find(
        (assignment) => assignment.assignmentRole === "PRIMARY",
      );
      const eligibleRole = Boolean(
        account && ["SENIOR_MANAGEMENT", "TEAM_MANAGER"].includes(account.role),
      );
      const activeStatus = [
        "IN_PROGRESS",
        "HELP_REQUESTED",
        "BLOCKED",
      ].includes(workItem.status);

      if (
        !eligibleRole ||
        !activePrimary ||
        activePrimary.assignee.id !== account?.id ||
        !activePrimary.startedAt ||
        !activeStatus ||
        isArchivedWork(workItem)
      ) {
        throw new Error(
          "Start this task before assigning part of it to your team.",
        );
      }

      openTeamAssignment(workItem);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setOpeningTeamAssignmentId(null);
    }
  }

  async function requestInformation(): Promise<void> {
    if (!accessToken || !selectedWork) return;
    await runAction(() =>
      requestManagementWorkInformation(
        accessToken,
        selectedWork.id,
        actionForm.note,
      ),
    );
  }

  async function removeSupport(accountId: string): Promise<void> {
    if (!accessToken || !selectedWork) return;
    await runAction(() =>
      removeManagementWorkSupport(accessToken, selectedWork.id, {
        accountId,
        reason: "Removed by authorized management.",
      }),
    );
  }

  async function releaseRetentionHold(): Promise<void> {
    if (!accessToken || !selectedWork) return;
    await runAction(() => releaseWorkRetentionHold(accessToken, selectedWork.id));
  }

  async function cancelDeletionRequest(): Promise<void> {
    if (!accessToken || !selectedWork) return;
    await runAction(() => cancelWorkDeletionReview(accessToken, selectedWork.id));
  }

  const primaryAssignment = selectedWork?.assignments.find(
    (assignment) => assignment.assignmentRole === "PRIMARY",
  );
  const supportingAssignments =
    selectedWork?.assignments.filter(
      (assignment) => assignment.assignmentRole === "SUPPORTING",
    ) ?? [];
  const assignedAccountIds =
    selectedWork?.assignments.map((assignment) => assignment.assignee.id) ?? [];
  const latestReport = selectedWork?.completionReports?.[0] ?? null;
  const isPrimaryAssignee = Boolean(
    primaryAssignment && primaryAssignment.assignee.id === account?.id,
  );
  const selectedWorkIsArchived = isArchivedWork(selectedWork);
  const selectedWorkIsOverdue = Boolean(
    selectedWork &&
      !["CLOSED", "CANCELLED"].includes(selectedWork.status) &&
      new Date(selectedWork.dueAt).getTime() < Date.now(),
  );
  const informationWasRequested = hasInformationRequest(selectedWork);
  // Management accounts can also be operational assignees. Actions are based on
  // the active primary assignment, not on the account's management role.
  const canAcknowledgeAssigned = Boolean(
    isPrimaryAssignee &&
      !selectedWorkIsArchived &&
      !primaryAssignment?.acknowledgedAt &&
      selectedWork?.status === "ASSIGNED",
  );
  const canStartAssigned = Boolean(
    isPrimaryAssignee &&
      !selectedWorkIsArchived &&
      primaryAssignment?.acknowledgedAt &&
      !primaryAssignment?.startedAt &&
      selectedWork &&
      ["ACKNOWLEDGED", "REOPENED"].includes(selectedWork.status),
  );
  const canRequestHelpAssigned = Boolean(
    isPrimaryAssignee &&
      !selectedWorkIsArchived &&
      primaryAssignment?.startedAt &&
      selectedWork &&
      ["IN_PROGRESS", "HELP_REQUESTED", "BLOCKED"].includes(selectedWork.status),
  );
  const unfinishedTeamTasks = selectedWork?.teamWork
    ? selectedWork.teamWork.total -
      selectedWork.teamWork.completed -
      selectedWork.teamWork.cancelled
    : 0;
  const canCompleteAssigned = Boolean(
    isPrimaryAssignee &&
      !selectedWorkIsArchived &&
      primaryAssignment?.startedAt &&
      selectedWork &&
      unfinishedTeamTasks === 0 &&
      (["IN_PROGRESS", "HELP_REQUESTED", "BLOCKED"].includes(
        selectedWork.status,
      ) ||
        (selectedWork.status === "COMPLETED_PENDING_REVIEW" &&
          informationWasRequested)),
  );
  const showAssignToTeam = Boolean(
    filters.focus === "ASSIGNED_TO_ME" &&
      isPrimaryAssignee &&
      !selectedWorkIsArchived &&
      selectedWork &&
      account &&
      ["SENIOR_MANAGEMENT", "TEAM_MANAGER"].includes(account.role) &&
      !["COMPLETED_PENDING_REVIEW", "CLOSED", "CANCELLED"].includes(
        selectedWork.status,
      ),
  );
  const canAssignToTeam = Boolean(
    showAssignToTeam &&
      primaryAssignment?.startedAt &&
      selectedWork &&
      ["IN_PROGRESS", "HELP_REQUESTED", "BLOCKED"].includes(
        selectedWork.status,
      ),
  );
  const assignToTeamButtonText = canAssignToTeam
    ? "Assign to Team"
    : !primaryAssignment?.acknowledgedAt
      ? "Accept Task First"
      : "Start Work First";
  const assignedWorkMessage = !selectedWork
    ? ""
    : selectedWork.status === "ASSIGNED"
      ? "Accept this task before you start working."
      : selectedWork.status === "ACKNOWLEDGED" ||
          selectedWork.status === "REOPENED"
        ? "Start the task when you are ready."
        : ["IN_PROGRESS", "HELP_REQUESTED", "BLOCKED"].includes(
              selectedWork.status,
            )
          ? "Update the task when the work is finished."
          : selectedWork.status === "COMPLETED_PENDING_REVIEW"
            ? informationWasRequested
              ? "More information is needed before this task can be closed."
              : "Your work is waiting for review."
            : selectedWork.status === "CLOSED"
              ? "This task was reviewed and closed."
              : selectedWork.status === "CANCELLED"
                ? "This task was cancelled."
                : "No action is needed right now.";
  const selectedWorkIsDeletionEligible = isDeletionEligible(selectedWork);
  const canManageSelectedWork = Boolean(
    selectedWork &&
      account &&
      !isPrimaryAssignee &&
      (account.role === "SUPER_ADMIN" ||
        selectedWork.createdBy.id === account.id ||
        selectedWork.responsibleManager.id === account.id),
  );
  const canManageAssignments = Boolean(
    canManageSelectedWork &&
      selectedWork &&
      !selectedWorkIsArchived &&
      !["CLOSED", "CANCELLED"].includes(selectedWork.status),
  );
  const canReassignOrCancel = canManageAssignments && unfinishedTeamTasks === 0;
  const canChangeIndividualAssignments =
    canReassignOrCancel && !selectedWork?.assignedTeam;
  const hasActiveFilters = Boolean(
    filters.search ||
      filters.status ||
      filters.type ||
      filters.priority ||
      filters.departmentId ||
      filters.assigneeAccountId ||
      filters.assignedTeamId ||
      filters.salesMemberAccountId ||
      (filters.view === "HISTORY" &&
        (filters.historyFrom !== getDefaultHistoryFrom() ||
          filters.historyTo !== toDateInput(new Date()))),
  );
  // Role-specific tabs keep default work queues operational instead of organization-wide.
  const focusTabs: Array<{
    focus: WorkQueueFocus;
    label: string;
    count?: number;
  }> = account?.role === "TEAM_MANAGER"
    ? [
        {
          focus: "CREATED_BY_ME",
          label: "Created by Me",
          count: queue?.queue.focusCounts.createdByMe,
        },
        { focus: "TEAM_QUEUE", label: "Department Queue" },
        {
          focus: "ASSIGNED_TO_ME",
          label: "My Work",
          count: queue?.queue.focusCounts.assignedToMe,
        },
        {
          focus: "AWAITING_MY_REVIEW",
          label: "Awaiting My Review",
          count: queue?.queue.focusCounts.awaitingMyReview,
        },
      ]
    : account?.role === "SUPER_ADMIN"
      ? [
          {
            focus: "CREATED_BY_ME",
            label: "Created by Me",
            count: queue?.queue.focusCounts.createdByMe,
          },
          { focus: "ACTION_CENTER", label: "Branch Queue" },
          {
            focus: "AWAITING_MY_REVIEW",
            label: "Awaiting My Review",
            count: queue?.queue.focusCounts.awaitingMyReview,
          },
          {
            focus: "EXCEPTIONS",
            label: "Branch Exceptions",
            count: queue?.queue.focusCounts.exceptions,
          },
          { focus: "EXPLORER", label: "Branch Ticket Explorer" },
        ]
      : [
          {
            focus: "CREATED_BY_ME",
            label: "Created by Me",
            count: queue?.queue.focusCounts.createdByMe,
          },
          { focus: "ACTION_CENTER", label: "Division Queue" },
          {
            focus: "ASSIGNED_TO_ME",
            label: "My Work",
            count: queue?.queue.focusCounts.assignedToMe,
          },
          {
            focus: "AWAITING_MY_REVIEW",
            label: "Awaiting My Review",
            count: queue?.queue.focusCounts.awaitingMyReview,
          },
          {
            focus: "EXCEPTIONS",
            label: "Division Exceptions",
            count: queue?.queue.focusCounts.exceptions,
          },
          { focus: "EXPLORER", label: "Division Ticket Explorer" },
        ];



  if (!accessToken) {
    return (
      <main className="management-page management-work-page">
        <section className="work-management-state work-management-state--error">
          Your secure session is unavailable. Sign in again.
        </section>
      </main>
    );
  }

  return (
    <main className={`management-page management-work-page${isDedicatedCreateRoute ? " management-work-page--create" : ""}`}>
      {!isDedicatedCreateRoute && (
      <section className="management-work__canvas">
        <header className="management-work__hero management-work__hero--compact">
          <div>
            <span>{account?.role === "TEAM_MANAGER"
                ? "Department Work"
                : account?.role === "SENIOR_MANAGEMENT"
                  ? "Division Work"
                  : "Branch Work"}</span>
            <h1>Work Management</h1>
            <p>Review active work, assign employees and complete pending reviews.</p>
          </div>
          <div className="management-work__hero-actions">
            <button
              type="button"
              className="management-work__refresh-button"
              onClick={() => refresh()}
              aria-label="Refresh work management"
            >
              Refresh
            </button>
            <Link className="management-work__duty-link" to="/duty-management">
              Duty Roster
            </Link>
            <Link className="management-work__report-link" to="/work-reports">
              Reports
            </Link>
            <button
              type="button"
              onClick={() => navigate("/work-management/create")}
            >
              + Create Work
            </button>
          </div>
        </header>

        {notice && <div className="management-work__notice" role="status">{notice}</div>}
        {error && (
          <div className="management-work__notice management-work__notice--error" role="alert">
            {error}
          </div>
        )}

        <section
          className="management-work__summary management-work__summary--essential"
          aria-label="Important work summary"
          aria-busy={loading}
        >
          {[
            { label: "Open Work", value: loading && !summary ? "—" : summary?.totals.open ?? 0, note: "Active work in your scope", tone: "blue" },
            { label: "Need Review", value: loading && !summary ? "—" : summary?.totals.waitingForReview ?? 0, note: "Completion reports waiting", tone: "gold" },
            { label: "Overdue", value: loading && !summary ? "—" : summary?.totals.overdue ?? 0, note: "Work past the due time", tone: "red" },
            { label: "Closed Today", value: loading && !summary ? "—" : summary?.totals.closedToday ?? 0, note: "Verified and completed today", tone: "green" },
          ].map((card) => (
            <article key={card.label} className={`management-work-summary-card management-work-summary-card--${card.tone}`}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </article>
          ))}
        </section>

        <section className="management-work__navigation" aria-label="Work navigation">
          <nav className="management-work__focus-tabs management-work__focus-tabs--primary" aria-label="Work focus">
            {focusTabs
              .filter((tab) => !["EXCEPTIONS", "EXPLORER"].includes(tab.focus))
              .map((tab) => (
                <button
                  key={tab.focus}
                  type="button"
                  className={filters.focus === tab.focus ? "is-active" : ""}
                  aria-current={filters.focus === tab.focus ? "page" : undefined}
                  onClick={() => {
                    setSelectedId(null);
                    setWorkspaceMode("CURRENT");
                    setFilters((current) => ({
                      ...current,
                      focus: tab.focus,
                      view: "ACTIVE",
                      status: "",
                      page: 1,
                    }));
                  }}
                >
                  <span>{tab.label}</span>
                  {typeof tab.count === "number" && <strong>{tab.count}</strong>}
                </button>
              ))}
          </nav>

          {focusTabs.some((tab) => ["EXCEPTIONS", "EXPLORER"].includes(tab.focus)) && (
            <details className="management-work__more-queues">
              <summary>More queues</summary>
              <div>
                {focusTabs
                  .filter((tab) => ["EXCEPTIONS", "EXPLORER"].includes(tab.focus))
                  .map((tab) => (
                    <button
                      key={tab.focus}
                      type="button"
                      className={filters.focus === tab.focus ? "is-active" : ""}
                      onClick={() => {
                        setSelectedId(null);
                        setWorkspaceMode("CURRENT");
                        setFilters((current) => ({
                          ...current,
                          focus: tab.focus,
                          view: "ACTIVE",
                          status: "",
                          page: 1,
                        }));
                      }}
                    >
                      {tab.label}
                      {typeof tab.count === "number" && <strong>{tab.count}</strong>}
                    </button>
                  ))}
              </div>
            </details>
          )}
        </section>

        <nav className="management-work__lifecycle-tabs" aria-label="Work record view">
          {[
            { mode: "CURRENT" as const, label: "Current Work", count: queue?.queue.counts.active ?? 0 },
            { mode: "TODAY" as const, label: "Today", count: dailyTotals.open + dailyTotals.completed },
            { mode: "HISTORY" as const, label: "Work History", count: queue?.queue.counts.recentHistory ?? 0 },
            { mode: "ARCHIVE" as const, label: "Archive", count: queue?.queue.counts.archive ?? 0 },
          ].map((tab) => (
            <button
              key={tab.mode}
              type="button"
              className={workspaceMode === tab.mode ? "is-active" : ""}
              aria-current={workspaceMode === tab.mode ? "page" : undefined}
              onClick={() => {
                setSelectedId(null);
                setWorkspaceMode(tab.mode);
                setFilters((current) => ({
                  ...current,
                  view:
                    tab.mode === "HISTORY"
                      ? "HISTORY"
                      : tab.mode === "ARCHIVE"
                        ? "ARCHIVE"
                        : "ACTIVE",
                  status: "",
                  page: 1,
                }));
              }}
            >
              <span>{tab.label}</span>
              <strong>{tab.count}</strong>
            </button>
          ))}
        </nav>

        {workspaceMode === "ARCHIVE" && account?.role === "SUPER_ADMIN" && (
          <div className="management-work__archive-switch" role="group" aria-label="Archive governance view">
            <button
              type="button"
              className={filters.view === "ARCHIVE" ? "is-active" : ""}
              onClick={() => {
                setSelectedId(null);
                setFilters((current) => ({ ...current, view: "ARCHIVE", page: 1 }));
              }}
            >
              Archive records
            </button>
            <button
              type="button"
              className={filters.view === "DELETION_REVIEW" ? "is-active" : ""}
              onClick={() => {
                setSelectedId(null);
                setFilters((current) => ({ ...current, view: "DELETION_REVIEW", page: 1 }));
              }}
            >
              Deletion review
              <strong>{queue?.queue.counts.eligibleForDeletion ?? 0}</strong>
            </button>
          </div>
        )}

        {workspaceMode === "TODAY" ? (
          <section className="management-work__today-view" aria-label="Today's scoped work">
            <header>
              <div>
                <span>Today</span>
                <h2>Work planned for today</h2>
                <p>Open a ticket to review its complete operational details.</p>
              </div>
              {dailyLoading && <small>Updating...</small>}
            </header>
            <div className="management-work__today-columns">
              <article className="management-work__today-column management-work__today-column--pending">
                <header><span>Pending Work</span><strong>{dailyTotals.open}</strong></header>
                <div>
                  {dailyOpen.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setWorkspaceMode("CURRENT");
                        setSelectedId(item.id);
                      }}
                    >
                      <span className={`work-priority work-priority--${item.priority.toLowerCase()}`}>{formatLabel(item.priority)}</span>
                      <strong>{item.title}</strong>
                      <small>{item.ticketNumber} · {item.department?.name ?? item.division.name}</small>
                      <em>{formatLabel(item.status)}</em>
                      <b aria-hidden="true">→</b>
                    </button>
                  ))}
                  {!dailyLoading && dailyOpen.length === 0 && <p>No pending work is planned for today.</p>}
                </div>
              </article>
              <article className="management-work__today-column management-work__today-column--completed">
                <header><span>Completed Today</span><strong>{dailyTotals.completed}</strong></header>
                <div>
                  {dailyCompleted.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setWorkspaceMode("CURRENT");
                        setSelectedId(item.id);
                      }}
                    >
                      <span className={`work-priority work-priority--${item.priority.toLowerCase()}`}>{formatLabel(item.priority)}</span>
                      <strong>{item.title}</strong>
                      <small>{item.ticketNumber} · {item.department?.name ?? item.division.name}</small>
                      <em>Completed</em>
                      <b aria-hidden="true">→</b>
                    </button>
                  ))}
                  {!dailyLoading && dailyCompleted.length === 0 && <p>No work planned for today has been completed yet.</p>}
                </div>
              </article>
            </div>
          </section>
        ) : selectedId ? (
          <section className="management-work__detail management-work__detail--standalone">
            {detailLoading && (
              <div className="work-management-state">Loading ticket details...</div>
            )}
            {!detailLoading && !selectedWork && (
              <div className="work-management-state">
                Select a ticket to review its operational details.
              </div>
            )}
            {!detailLoading && selectedWork && (
              <>
                <button
                  type="button"
                  className="management-work__back-button"
                  onClick={() => setSelectedId(null)}
                >
                  <span aria-hidden="true">←</span> Back to Work
                </button>
                <header className="management-work__detail-header">
                  <div>
                    <span>{selectedWork.ticketNumber}</span>
                    <h2>{selectedWork.title}</h2>
                    {!selectedWork.customerName && !selectedWork.serviceNumber && (
                      <p>{selectedWork.description}</p>
                    )}
                  </div>
                  <div>
                    <span className={`work-priority work-priority--${selectedWork.priority.toLowerCase()}`}>
                      {formatLabel(selectedWork.priority)}
                    </span>
                    <strong>{formatLabel(selectedWork.status)}</strong>
                  </div>
                </header>

                {selectedWorkIsArchived && (
                  <section className="management-work__archive-notice">
                    <div>
                      <strong>Read-only archive</strong>
                      <p>
                        This ticket passed its one-year archive date. Its work,
                        completion and audit records remain available, but the
                        operational lifecycle can no longer be changed.
                      </p>
                    </div>
                    <span>
                      Deletion review: {selectedWorkIsDeletionEligible ? "Eligible" : formatDateTime(selectedWork.deletionEligibleAt)}
                    </span>
                  </section>
                )}

                {isPrimaryAssignee && (
                  <section className="management-work__my-work" aria-label="My work actions">
                    <div className="management-work__my-work-copy">
                      <span>My Work</span>
                      <h3>{formatLabel(selectedWork.status)}</h3>
                      <p>{assignedWorkMessage}</p>
                      {informationWasRequested && latestReport?.managerNote && (
                        <small>Manager note: {latestReport.managerNote}</small>
                      )}
                      {unfinishedTeamTasks > 0 && (
                        <small className="management-work__team-blocker">
                          {unfinishedTeamTasks} team task{unfinishedTeamTasks === 1 ? " is" : "s are"} still unfinished. Review or cancel them before finishing this task.
                        </small>
                      )}
                    </div>
                    <div className="management-work__my-work-actions">
                      {canAcknowledgeAssigned && (
                        <button
                          type="button"
                          onClick={() => void acknowledgeAssignedWork()}
                          disabled={actionBusy}
                        >
                          {actionBusy ? "Saving..." : "Accept Task"}
                        </button>
                      )}
                      {canStartAssigned && (
                        <button
                          type="button"
                          onClick={() => void startAssignedWork()}
                          disabled={actionBusy}
                        >
                          {actionBusy ? "Starting..." : "Start Work"}
                        </button>
                      )}
                      {canRequestHelpAssigned && (
                        <button
                          type="button"
                          className="is-secondary"
                          onClick={() => openAction("HELP")}
                        >
                          Need Help
                        </button>
                      )}
                      {showAssignToTeam && (
                        <button
                          type="button"
                          className="is-secondary"
                          onClick={() => openTeamAssignment()}
                          disabled={!canAssignToTeam || actionBusy}
                          title={
                            canAssignToTeam
                              ? "Assign part of this work to a lower team member."
                              : "Accept and start this task before assigning it to your team."
                          }
                        >
                          {assignToTeamButtonText}
                        </button>
                      )}
                      {canCompleteAssigned && (
                        <button
                          type="button"
                          className="is-success"
                          onClick={() => openAction("COMPLETE")}
                        >
                          {informationWasRequested
                            ? "Send More Information"
                            : "Finish Work"}
                        </button>
                      )}
                    </div>
                  </section>
                )}

                <div className="management-work__detail-actions">
                  {canManageAssignments && (
                    <>
                      <button type="button" onClick={() => openAction("EDIT")}>
                        Update details
                      </button>
                      {canChangeIndividualAssignments && (
                        <button type="button" onClick={() => openAction("REASSIGN")}>
                          Reassign
                        </button>
                      )}
                      {canManageAssignments && (
                        <button type="button" onClick={() => openAction("SUPPORT")}>
                          Add support
                        </button>
                      )}
                    </>
                  )}
                  {selectedWork.status === "COMPLETED_PENDING_REVIEW" &&
                    selectedWork.responsibleManager.id === account?.id && (
                      <button type="button" onClick={() => openAction("REVIEW")}>
                        Review completion
                      </button>
                    )}
                  {selectedWork.status === "CLOSED" && !selectedWorkIsArchived && (
                    <button type="button" onClick={() => openAction("REOPEN")}>
                      Reopen work
                    </button>
                  )}
                  {canReassignOrCancel && (
                    <button
                      className="is-danger"
                      type="button"
                      onClick={() => openAction("CANCEL")}
                    >
                      Cancel work
                    </button>
                  )}
                </div>

                {account?.role === "SUPER_ADMIN" && selectedWorkIsArchived && (
                  <section className="management-work__retention">
                    <header>
                      <div>
                        <span>Retention controls</span>
                        <h3>Archive protection and deletion request</h3>
                      </div>
                      <strong>Permanent deletion disabled</strong>
                    </header>
                    <p>
                      The Super Admin may protect this record or request a future
                      Software-System Operator review. No record can be permanently
                      deleted from the current application.
                    </p>
                    {selectedWork.retentionHoldAt && (
                      <div className="management-work__retention-state is-hold">
                        <strong>Retention hold active</strong>
                        <span>{selectedWork.retentionHoldReason}</span>
                        <small>Applied by {selectedWork.retentionHoldBy ? getAccountName(selectedWork.retentionHoldBy) : "Super Admin"} · {formatDateTime(selectedWork.retentionHoldAt)}</small>
                      </div>
                    )}
                    {selectedWork.deletionRequestedAt && (
                      <div className="management-work__retention-state is-requested">
                        <strong>Deletion review requested</strong>
                        <span>{selectedWork.deletionRequestReason}</span>
                        <small>Requested by {selectedWork.deletionRequestedBy ? getAccountName(selectedWork.deletionRequestedBy) : "Super Admin"} · {formatDateTime(selectedWork.deletionRequestedAt)}</small>
                      </div>
                    )}
                    <div className="management-work__retention-actions">
                      {selectedWork.retentionHoldAt ? (
                        <button type="button" onClick={() => void releaseRetentionHold()} disabled={actionBusy}>
                          Release hold
                        </button>
                      ) : (
                        <button type="button" onClick={() => openAction("RETENTION_HOLD")}>
                          Place retention hold
                        </button>
                      )}
                      {selectedWork.deletionRequestedAt ? (
                        <button type="button" onClick={() => void cancelDeletionRequest()} disabled={actionBusy}>
                          Cancel deletion request
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!selectedWorkIsDeletionEligible || Boolean(selectedWork.retentionHoldAt)}
                          onClick={() => openAction("DELETION_REQUEST")}
                        >
                          Request deletion review
                        </button>
                      )}
                    </div>
                  </section>
                )}

                {selectedWork.type !== "ADMINISTRATIVE_TASK" && (
                <section className="management-work__service-details">
                  <header>
                    <span>Customer and service details</span>
                    <h3>{formatLabel(selectedWork.type)}</h3>
                  </header>
                  <div>
                    <article><span>Customer</span><strong>{selectedWork.customerName ?? "Legacy record"}</strong></article>
                    <article>
                      <span>
                        {selectedWork.customerContactType === "MOBILE"
                          ? "Mobile number"
                          : selectedWork.customerContactType === "TELEPHONE"
                            ? "Telephone number"
                            : "Contact number"}
                      </span>
                      <strong>{selectedWork.customerContactNumber ?? "Not recorded"}</strong>
                    </article>
                    <article><span>Location</span><strong>{selectedWork.locationText ?? "Not recorded"}</strong></article>
                    {selectedWork.type !== "MAINTENANCE" && (
                      <article>
                        <span>
                          {["NEW_CONNECTION", "UPDATE_SERVICES"].includes(selectedWork.type)
                            ? "Token number"
                            : "Service number"}
                        </span>
                        <strong>{selectedWork.serviceNumber ?? "Not recorded"}</strong>
                      </article>
                    )}
                    <article><span>OLT</span><strong>{selectedWork.olt ?? "Not recorded"}</strong></article>
                    <article><span>FDC name</span><strong>{selectedWork.fdcName ?? "Not recorded"}</strong></article>
                    <article><span>FAP name</span><strong>{selectedWork.fapName ?? "Not recorded"}</strong></article>
                    {selectedWork.serviceTypes.length > 0 && (
                      <article className="is-wide">
                        <span>Services</span>
                        <strong>
                          {selectedWork.serviceTypes
                            .map((serviceType) =>
                              serviceType === "OTHER"
                                ? selectedWork.otherServiceText ?? "Other"
                                : formatLabel(serviceType),
                            )
                            .join(", ")}
                        </strong>
                      </article>
                    )}
                  </div>
                </section>
                )}

                <section className="management-work__facts management-work__facts--schedule">
                  <article>
                    <span>Registered Date and Time</span>
                    <strong>AD: {formatKathmanduDateTime(selectedWork.registeredAt)}</strong>
                    <small>BS: {formatBikramSambatDateTime(selectedWork.registeredAt)}</small>
                  </article>
                  <article>
                    <span>System created</span>
                    <strong>{formatKathmanduDateTime(selectedWork.createdAt)}</strong>
                    <small>Automatic audit timestamp</small>
                  </article>
                  <article>
                    <span>Planned start</span>
                    <strong>AD: {formatKathmanduDateTime(selectedWork.plannedStartAt)}</strong>
                    <small>BS: {formatBikramSambatDateTime(selectedWork.plannedStartAt)}</small>
                  </article>
                  <article>
                    <span>Due</span>
                    <strong>AD: {formatKathmanduDateTime(selectedWork.dueAt)}</strong>
                    <small>BS: {formatBikramSambatDateTime(selectedWork.dueAt)}</small>
                  </article>
                  <article><span>Responsible manager</span><strong>{getAccountName(selectedWork.responsibleManager)}</strong></article>
                  <article><span>Assigned by</span><strong>{getAccountName(selectedWork.createdBy)}</strong></article>
                </section>

                <section className="management-work__responsibility">
                  <header>
                    <span>Work responsibility</span>
                    <h3>{selectedWork.assignedTeam ? "Team assignment" : "Individual assignment"}</h3>
                  </header>
                  <div>
                    {selectedWork.assignedTeam ? (
                      <article>
                        <span>Assigned Team</span>
                        <strong>{selectedWork.assignedTeam.name}</strong>
                        <small>{selectedWork.assignedTeam._count.members} members · Team Admin: {selectedWork.assignedTeam.teamAdmin.empName}</small>
                      </article>
                    ) : (
                      <article>
                        <span>Assigned Staff Member</span>
                        <strong>{primaryAssignment ? getAccountName(primaryAssignment.assignee) : "Not assigned"}</strong>
                        <small>{primaryAssignment?.assignee.employee?.designation ?? ""}</small>
                      </article>
                    )}
                    {selectedWork.salesMember && (
                      <article>
                        <span>Sales Member</span>
                        <strong>{getAccountName(selectedWork.salesMember)}</strong>
                        <small>{selectedWork.salesMember.employee?.designation ?? "Sales responsibility"}</small>
                      </article>
                    )}
                  </div>
                </section>

                {(selectedWork.parentWorkItem || (selectedWork.teamWork?.total ?? 0) > 0) && (
                  <section className="management-work__team-tracking">
                    <header>
                      <div>
                        <span>Team progress</span>
                        <h3>Who Is Working on This Task</h3>
                        <p>See every person who received part of this work and their current progress.</p>
                      </div>
                      {(selectedWork.teamWork?.total ?? 0) > 0 && (
                        <div className="management-work__team-score">
                          <strong>{selectedWork.teamWork!.completionPercentage}%</strong>
                          <span>Complete</span>
                        </div>
                      )}
                    </header>

                    {selectedWork.parentWorkItem && (
                      <button
                        type="button"
                        className="management-work__team-parent"
                        onClick={() => setSelectedId(selectedWork.parentWorkItem!.id)}
                      >
                        <span>Assigned from</span>
                        <strong>{selectedWork.parentWorkItem.title}</strong>
                        <small>Open the main task</small>
                      </button>
                    )}

                    {primaryAssignment && (
                      <article className="management-work__team-owner">
                        <div>
                          <span>Main responsibility</span>
                          <strong>{getAccountName(primaryAssignment.assignee)}</strong>
                          <small>{primaryAssignment.assignee.employee?.designation ?? formatLabel(primaryAssignment.assignee.role)}</small>
                        </div>
                        <div>
                          <span>Assigned by</span>
                          <strong>{getAccountName(selectedWork.createdBy)}</strong>
                          <small>{formatDateTime(primaryAssignment.createdAt)}</small>
                        </div>
                        <div>
                          <span>Due</span>
                          <strong>{formatDateTime(selectedWork.dueAt)}</strong>
                          <small>{selectedWork.teamWork?.total ?? 0} team task{(selectedWork.teamWork?.total ?? 0) === 1 ? "" : "s"}</small>
                        </div>
                        <em className={`management-work__team-status ${selectedWorkIsOverdue ? "is-overdue" : `is-${selectedWork.status.toLowerCase()}`}`}>
                          {selectedWorkIsOverdue ? "Overdue" : formatLabel(selectedWork.status)}
                        </em>
                      </article>
                    )}

                    {(selectedWork.teamWork?.total ?? 0) > 0 && (
                      <>
                        <div className="management-work__team-stats">
                          <article><span>Team tasks</span><strong>{selectedWork.teamWork!.total}</strong></article>
                          <article><span>Completed</span><strong>{selectedWork.teamWork!.completed}</strong></article>
                          <article><span>In progress</span><strong>{selectedWork.teamWork!.inProgress}</strong></article>
                          <article><span>Waiting for review</span><strong>{selectedWork.teamWork!.awaitingReview}</strong></article>
                          <article><span>Overdue</span><strong>{selectedWork.teamWork!.overdue}</strong></article>
                        </div>
                        <div
                          className="management-work__team-progress"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={selectedWork.teamWork!.completionPercentage}
                        >
                          <span style={{ width: `${selectedWork.teamWork!.completionPercentage}%` }} />
                        </div>
                        <div className="management-work__team-list">
                          {selectedWork.teamWork!.members.map((member) => (
                            <button
                              key={member.id}
                              type="button"
                              style={{ marginLeft: `${Math.min(member.depth - 1, 4) * 20}px` }}
                              onClick={() => setSelectedId(member.id)}
                            >
                              <div>
                                <span>{member.depth === 1 ? "Assigned team member" : `Next team level ${member.depth}`}</span>
                                <strong>{member.primaryAssignee ? getAccountName(member.primaryAssignee) : "Assignee unavailable"}</strong>
                                <small>{member.primaryAssignee?.employee?.designation ?? (member.primaryAssignee ? formatLabel(member.primaryAssignee.role) : "")}</small>
                                {member.instructions && <small title={member.instructions}>Task: {member.instructions}</small>}
                              </div>
                              <div>
                                <span>Assigned by</span>
                                <strong>{member.assignedBy ? getAccountName(member.assignedBy) : "Not recorded"}</strong>
                                <small>{formatDateTime(member.createdAt)}</small>
                              </div>
                              <div>
                                <span>Due</span>
                                <strong>{formatDateTime(member.dueAt)}</strong>
                                {member.latestProgressSummary && <small>{member.latestProgressSummary}</small>}
                              </div>
                              <em className={`management-work__team-status ${member.isOverdue ? "is-overdue" : `is-${member.status.toLowerCase()}`}`}>
                                {member.isOverdue ? "Overdue" : formatLabel(member.status)}
                              </em>
                            </button>
                          ))}
                        </div>
                        {(selectedWork.teamWork!.notStarted > 0 || selectedWork.teamWork!.cancelled > 0) && (
                          <p className="management-work__team-note">
                            {selectedWork.teamWork!.notStarted} not started · {selectedWork.teamWork!.cancelled} cancelled
                          </p>
                        )}
                      </>
                    )}
                  </section>
                )}

                <section className="management-work__assignments">
                  <header><h3>Assigned Staff</h3></header>
                  {primaryAssignment && (
                    <article>
                      <span>Primary</span>
                      <div>
                        <strong>{getAccountName(primaryAssignment.assignee)}</strong>
                        <small>{primaryAssignment.assignee.employee?.designation ?? formatLabel(primaryAssignment.assignee.role)}</small>
                      </div>
                    </article>
                  )}
                  {supportingAssignments.map((assignment) => (
                    <article key={assignment.id}>
                      <span>Supporting</span>
                      <div>
                        <strong>{getAccountName(assignment.assignee)}</strong>
                        <small>{assignment.assignee.employee?.designation ?? formatLabel(assignment.assignee.role)}</small>
                      </div>
                      {canManageAssignments && (
                        <button
                          type="button"
                          onClick={() => void removeSupport(assignment.assignee.id)}
                          disabled={actionBusy}
                        >
                          Remove
                        </button>
                      )}
                    </article>
                  ))}
                </section>

                {latestReport && (
                  <section className="management-work__completion">
                    <header>
                      <div>
                        <span>Latest completion report</span>
                        <h3>{formatLabel(latestReport.result)}</h3>
                      </div>
                      <strong>{formatLabel(latestReport.reviewStatus)}</strong>
                    </header>
                    <p>{latestReport.summary}</p>
                    <small>
                      Submitted by {getAccountName(latestReport.submittedBy)} · {formatDateTime(latestReport.createdAt)}
                    </small>
                    {latestReport.managerNote && <blockquote>{latestReport.managerNote}</blockquote>}
                  </section>
                )}

                <details className="management-work__timeline management-work__timeline--collapsible">
                  <summary>
                    <span>Activity History</span>
                    <strong>Show Timeline</strong>
                  </summary>
                  <div className="management-work__timeline-content">
                    {activities.length === 0 ? (
                      <p>No activity has been recorded.</p>
                    ) : (
                      activities.map((activity) => (
                        <article key={activity.id}>
                          <span aria-hidden="true" />
                          <div>
                            <strong>{formatLabel(activity.action)}</strong>
                            <small>
                              {activity.actor ? getAccountName(activity.actor) : "System"} · {formatDateTime(activity.createdAt)}
                            </small>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </details>
              </>
            )}
          </section>

        ) : (
          <>
            {workspaceMode === "HISTORY" && (
              <section className="management-work__history-tools" aria-label="History date range">
                <div className="management-work__history-presets">
                  {[7, 30, 90].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => {
                        const historyTo = new Date();
                        const historyFrom = new Date();
                        historyFrom.setDate(historyFrom.getDate() - (days - 1));
                        setFilters((current) => ({
                          ...current,
                          historyFrom: toDateInput(historyFrom),
                          historyTo: toDateInput(historyTo),
                          page: 1,
                        }));
                      }}
                    >
                      Last {days} days
                    </button>
                  ))}
                </div>
                <div className="management-work__history-range">
                  <label><span>From</span><input type="date" value={filters.historyFrom} max={filters.historyTo} onChange={(event) => setFilters((current) => ({ ...current, historyFrom: event.target.value, page: 1 }))} /></label>
                  <label><span>To</span><input type="date" value={filters.historyTo} min={filters.historyFrom} max={toDateInput(new Date())} onChange={(event) => setFilters((current) => ({ ...current, historyTo: event.target.value, page: 1 }))} /></label>
                </div>
              </section>
            )}

            <section className="management-work__filter-toolbar" aria-label="Search and filters">
              <div className="management-work__filter-toolbar-main">
                <input
                  value={filters.search}
                  onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value, page: 1 }))}
                  placeholder="Search ticket, customer, service number or location"
                  aria-label="Search work tickets"
                />
                <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as WorkItemStatus | "", page: 1 }))} aria-label="Filter by status">
                  <option value="">All statuses</option>
                  {STATUSES.filter((status) =>
                    filters.view === "ACTIVE"
                      ? !["CLOSED", "CANCELLED"].includes(status)
                      : ["CLOSED", "CANCELLED"].includes(status),
                  ).map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
                </select>
                <select value={filters.priority} onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value as WorkPriority | "", page: 1 }))} aria-label="Filter by priority">
                  <option value="">All priorities</option>
                  {PRIORITIES.map((priority) => <option key={priority} value={priority}>{formatLabel(priority)}</option>)}
                </select>
                <button type="button" className={filtersExpanded ? "is-active" : ""} onClick={() => setFiltersExpanded((current) => !current)}>
                  More Filters
                </button>
                <button
                  type="button"
                  className="management-work__clear-filters"
                  disabled={!hasActiveFilters}
                  onClick={() => setFilters((current) => ({
                    ...current, search: "", status: "", type: "", priority: "", departmentId: "", assigneeAccountId: "", assignedTeamId: "", salesMemberAccountId: "", historyFrom: getDefaultHistoryFrom(), historyTo: toDateInput(new Date()), page: 1,
                  }))}
                >
                  Clear
                </button>
              </div>
              {filtersExpanded && (
                <div className="management-work__filter-toolbar-more">
                  <select value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value as WorkItemType | "", page: 1 }))} aria-label="Filter by work type">
                    <option value="">All work types</option>
                    {WORK_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                  <select value={filters.departmentId} onChange={(event) => setFilters((current) => ({ ...current, departmentId: event.target.value, assigneeAccountId: "", assignedTeamId: "", salesMemberAccountId: "", page: 1 }))} aria-label="Filter by department">
                    <option value="">All departments</option>
                    {options?.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                  </select>
                  <select value={filters.assigneeAccountId} onChange={(event) => setFilters((current) => ({ ...current, assigneeAccountId: event.target.value, page: 1 }))} aria-label="Filter by assigned staff member">
                    <option value="">All assigned staff</option>
                    {options?.data.map((candidate) => <option key={candidate.account.id} value={candidate.account.id}>{getCandidateName(candidate)}</option>)}
                  </select>
                  <select value={filters.assignedTeamId} onChange={(event) => setFilters((current) => ({ ...current, assignedTeamId: event.target.value, page: 1 }))} aria-label="Filter by assigned team">
                    <option value="">All assigned teams</option>
                    {options?.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                  <select value={filters.salesMemberAccountId} onChange={(event) => setFilters((current) => ({ ...current, salesMemberAccountId: event.target.value, page: 1 }))} aria-label="Filter by Sales Member">
                    <option value="">All Sales Members</option>
                    {options?.salesMembers.map((candidate) => <option key={candidate.account.id} value={candidate.account.id}>{getCandidateName(candidate)}</option>)}
                  </select>
                </div>
              )}
              {queue?.queue.explorerRequiresFilter && (
                <div className="management-work__explorer-guidance" role="status">Choose at least one filter to load the authorized ticket explorer.</div>
              )}
            </section>

            <section className="management-work__overview">
              <header className="management-work__overview-header">
                <div>
                  <span>{workspaceMode === "CURRENT" ? focusTabs.find((tab) => tab.focus === filters.focus)?.label ?? "Current Work" : workspaceMode === "HISTORY" ? "Work History" : filters.view === "DELETION_REVIEW" ? "Deletion Review" : "Archive"}</span>
                  <h2>Choose a task</h2>
                </div>
                <strong>{queue?.pagination.total ?? 0}</strong>
              </header>

              {!loading && queue?.data.length === 0 ? (
                <div className="management-work__empty-state">
                  <strong>{workspaceMode === "CURRENT" ? "No current work" : workspaceMode === "HISTORY" ? "No work history" : "No archived work"}</strong>
                  <p>{queue?.queue.explorerRequiresFilter ? "Choose at least one filter to load this queue." : "There are no work items in this view."}</p>
                  {workspaceMode === "CURRENT" && (
                    <button type="button" onClick={() => navigate("/work-management/create")}>Create Work</button>
                  )}
                </div>
              ) : (
                <div className="management-work__card-grid" aria-busy={loading}>
                  {queue?.data.map((item) => {
                    const canReviewFromCard =
                      item.status === "COMPLETED_PENDING_REVIEW" &&
                      item.responsibleManager.id === account?.id &&
                      !isArchivedWork(item);
                    const myPrimaryAssignment = item.assignments.find(
                      (assignment) =>
                        assignment.assignmentRole === "PRIMARY" &&
                        assignment.assignee.id === account?.id,
                    );
                    const canOpenMyWorkFromCard =
                      filters.focus === "ASSIGNED_TO_ME" &&
                      Boolean(myPrimaryAssignment);
                    const canAssignToTeamFromCard = Boolean(
                      canOpenMyWorkFromCard &&
                        account &&
                        ["SENIOR_MANAGEMENT", "TEAM_MANAGER"].includes(
                          account.role,
                        ) &&
                        myPrimaryAssignment?.startedAt &&
                        ["IN_PROGRESS", "HELP_REQUESTED", "BLOCKED"].includes(
                          item.status,
                        ) &&
                        !isArchivedWork(item),
                    );

                    return (
                      <article key={item.id} className="management-work-ticket-card">
                        <button
                          type="button"
                          className="management-work-ticket-card__open"
                          onClick={() => setSelectedId(item.id)}
                          aria-label={`Open ${item.ticketNumber}`}
                        >
                          <div className="management-work-ticket-card__top">
                            <span className={`work-priority work-priority--${item.priority.toLowerCase()}`}>{formatLabel(item.priority)}</span>
                            <span className="management-work-ticket-card__arrow" aria-hidden="true">›</span>
                          </div>
                          <strong>{item.title}</strong>
                          {(item.assignedTeam || item.salesMember) && (
                            <div className="management-work__queue-responsibility">
                              {item.assignedTeam && <span>Team: {item.assignedTeam.name}</span>}
                              {item.salesMember && <span>Sales: {getAccountName(item.salesMember)}</span>}
                            </div>
                          )}
                          {(item.parentWorkItemId || (item.delegationProgress?.total ?? 0) > 0) && (
                            <div className="management-work__queue-linkage">
                              {item.parentWorkItemId && <span>Assigned from another task</span>}
                              {(item.delegationProgress?.total ?? 0) > 0 && <span>{item.delegationProgress!.total} team task{item.delegationProgress!.total === 1 ? "" : "s"} · {item.delegationProgress!.completionPercentage}% complete</span>}
                            </div>
                          )}
                          <div className="management-work-ticket-card__meta">
                            <span>{item.assignments.find((assignment) => assignment.assignmentRole === "PRIMARY") ? getAccountName(item.assignments.find((assignment) => assignment.assignmentRole === "PRIMARY")!.assignee) : "Unassigned"}</span>
                            <time>{filters.view === "ACTIVE" ? `Due ${formatDateTime(item.dueAt)}` : `${item.status === "CLOSED" ? "Closed" : "Cancelled"} ${formatDateTime(getTerminalDate(item))}`}</time>
                          </div>
                        </button>
                        <div className="management-work-ticket-card__status">
                          <em>{formatLabel(item.status)}</em>
                          <div className="management-work-ticket-card__actions">
                            {isArchivedWork(item) && <small>Read only</small>}
                            {canOpenMyWorkFromCard && (
                              <button
                                type="button"
                                className="management-work-ticket-card__work"
                                onClick={() => setSelectedId(item.id)}
                              >
                                Work on Task
                              </button>
                            )}
                            {canAssignToTeamFromCard && (
                              <button
                                type="button"
                                className="management-work-ticket-card__work"
                                disabled={openingTeamAssignmentId !== null}
                                onClick={() => void openQueueTeamAssignment(item)}
                              >
                                {openingTeamAssignmentId === item.id
                                  ? "Opening..."
                                  : "Assign to Team"}
                              </button>
                            )}
                            {canReviewFromCard && (
                              <button
                                type="button"
                                className="management-work-ticket-card__review"
                                disabled={openingReviewId !== null}
                                onClick={() => void openQueueReview(item)}
                              >
                                {openingReviewId === item.id ? "Opening..." : "Review"}
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {(queue?.pagination.totalPages ?? 0) > 1 && (
                <footer className="management-work__pagination">
                  <button type="button" disabled={filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Previous</button>
                  <span>Page {queue?.pagination.page} of {queue?.pagination.totalPages}</span>
                  <button type="button" disabled={filters.page >= (queue?.pagination.totalPages ?? 1)} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</button>
                </footer>
              )}
            </section>
          </>
        )}
      </section>
      )}

      {actionMode && (
        <div
          className={
            isDedicatedCreateRoute && actionMode === "CREATE" && !createForm.parentWorkItemId
              ? "management-work-create-shell"
              : "management-work-dialog"
          }
          role="presentation"
        >
          <section
            role={isDedicatedCreateRoute ? "region" : "dialog"}
            aria-modal={isDedicatedCreateRoute ? undefined : true}
            aria-labelledby="management-work-dialog-title"
            data-create-step={
              isDedicatedCreateRoute && actionMode === "CREATE"
                ? createStep
                : undefined
            }
          >
            <header>
              <div className="management-work-dialog__title-group">
                {actionMode === "CREATE" && (
                  <div className="management-work-dialog__visual" aria-hidden="true">
                    <svg viewBox="0 0 48 48">
                      <rect x="11" y="8" width="26" height="32" rx="7" />
                      <path d="M18 17h12M18 23h12M18 29h7" />
                      <circle cx="32" cy="32" r="8" />
                      <path d="m29 32 2 2 4-5" />
                    </svg>
                  </div>
                )}
                <div>
                  <span>Work management</span>
                  <h2 id="management-work-dialog-title">
                    {actionMode === "CREATE"
                      ? createForm.parentWorkItemId
                        ? "Assign to Team"
                        : "Create Work"
                      : actionMode === "RETENTION_HOLD"
                        ? "Place Retention Hold"
                        : actionMode === "DELETION_REQUEST"
                          ? "Request Deletion Review"
                          : actionMode === "COMPLETE"
                            ? "Submit Completion Report"
                            : actionMode === "HELP"
                              ? "Request Work Help"
                              : actionMode === "REVIEW"
                                ? "Review completion"
                                : formatLabel(actionMode)}
                  </h2>
                  {actionMode === "CREATE" && !createForm.parentWorkItemId && (
                    <p>Create, schedule and assign work in one guided flow.</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={isDedicatedCreateRoute ? leaveCreateWizard : () => setActionMode(null)}
                aria-label={isDedicatedCreateRoute ? "Return to Work Management" : "Close dialog"}
              >
                {isDedicatedCreateRoute ? "←" : "×"}
              </button>
            </header>

            {isDedicatedCreateRoute && actionMode === "CREATE" && !createForm.parentWorkItemId && (
              <nav className="management-work-wizard__steps" aria-label="Create Work progress">
                {[
                  { step: 1 as const, label: "Work details", note: "Customer and service" },
                  { step: 2 as const, label: "Assignment & schedule", note: "Responsibility and timing" },
                  { step: 3 as const, label: "Review", note: "Check and assign" },
                ].map((item) => (
                  <button
                    key={item.step}
                    type="button"
                    className={
                      createStep === item.step
                        ? "is-current"
                        : createStep > item.step
                          ? "is-complete"
                          : ""
                    }
                    aria-current={createStep === item.step ? "step" : undefined}
                    onClick={() => {
                      if (item.step < createStep) {
                        setActionError("");
                        setCreateStep(item.step);
                      }
                    }}
                  >
                    <span>{createStep > item.step ? "✓" : item.step}</span>
                    <strong>{item.label}</strong>
                    <small>{item.note}</small>
                  </button>
                ))}
              </nav>
            )}

            {actionError && <div className="management-work__notice management-work__notice--error" role="alert">{actionError}</div>}

            {actionMode === "REVIEW" && selectedWork && latestReport && (
              <section className="management-work-review-summary" aria-label="Completion report">
                <header>
                  <div>
                    <span>{selectedWork.ticketNumber}</span>
                    <strong>{selectedWork.title}</strong>
                  </div>
                  <em>{formatLabel(latestReport.result)}</em>
                </header>
                <div className="management-work-review-summary__facts">
                  <article>
                    <span>Submitted by</span>
                    <strong>{getAccountName(latestReport.submittedBy)}</strong>
                  </article>
                  <article>
                    <span>Submitted</span>
                    <strong>{formatDateTime(latestReport.createdAt)}</strong>
                  </article>
                  <article>
                    <span>More work needed</span>
                    <strong>{latestReport.moreWorkRequired ? "Yes" : "No"}</strong>
                  </article>
                </div>
                <div className="management-work-review-summary__note">
                  <span>Completion summary</span>
                  <p>{latestReport.summary}</p>
                </div>
              </section>
            )}

            {actionMode === "CREATE" ? (
              createForm.parentWorkItemId ? (
                <form onSubmit={submitCreate} className="management-work-form management-work-form--delegated">
                  {selectedWork && (
                    <div className="management-work-form__parent is-wide">
                      <span>Main task</span>
                      <strong>{selectedWork.title}</strong>
                      <small>You remain responsible for this task. The team member completes the assigned part and reports back to you.</small>
                    </div>
                  )}
                  <div className="management-work-form__section-heading is-wide">
                    <span>Team instructions</span>
                    <p>Explain exactly what the selected team member must complete.</p>
                  </div>
                  <label className="is-wide">
                    <span className="management-work-form__label-text">
                      Instructions <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span>
                    </span>
                    <textarea
                      required
                      minLength={2}
                      maxLength={2000}
                      rows={5}
                      value={createForm.teamInstructions}
                      onChange={(event) => setCreateForm((current) => ({ ...current, teamInstructions: event.target.value }))}
                      placeholder="Describe the part of the work, expected result and important checks."
                    />
                  </label>
                  <div className="management-work-form__schedule-grid is-wide is-delegated">
                    <DualCalendarDateTimeInput
                      id="create-work-planned-start"
                      label="Planned start"
                      value={createForm.plannedStartAt}
                      required
                      onChange={(plannedStartAt) =>
                        setCreateForm((current) => ({ ...current, plannedStartAt }))
                      }
                    />
                    <DualCalendarDateTimeInput
                      id="create-work-due-at"
                      label="Due date and time"
                      value={createForm.dueAt}
                      required
                      min={createForm.plannedStartAt}
                      onChange={(dueAt) =>
                        setCreateForm((current) => ({ ...current, dueAt }))
                      }
                    />
                  </div>
                  <label className="is-wide">
                    <span className="management-work-form__label-text">
                      Team member <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span>
                    </span>
                    <select
                      required
                      value={createForm.primaryAssigneeAccountId}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          primaryAssigneeAccountId: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select team member</option>
                      {availableAssignmentCandidates.map((candidate) => (
                        <option key={candidate.account.id} value={candidate.account.id}>
                          {getCandidateName(candidate)} · {formatLabel(candidate.workload.level)} workload
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedCandidate && (
                    <div className={`management-workload management-workload--${selectedCandidate.workload.level.toLowerCase()} is-wide`}>
                      <strong>{formatLabel(selectedCandidate.workload.level)} workload</strong>
                      <span>{selectedCandidate.workload.active} active · {selectedCandidate.workload.highPriority} high priority · {selectedCandidate.workload.overdue} overdue</span>
                    </div>
                  )}
                  <footer className="is-wide">
                    <button type="button" onClick={() => setActionMode(null)}>Cancel</button>
                    <button type="submit" disabled={actionBusy}>{actionBusy ? "Assigning..." : "Assign to Team"}</button>
                  </footer>
                </form>
              ) : (
                <form
                  ref={createFormRef}
                  onSubmit={submitCreate}
                  className="management-work-create-wizard"
                  noValidate
                >
                  {createStep === 1 && (
                    <section className="management-work-wizard__panel" aria-labelledby="create-work-step-1-title">
                      <header className="management-work-wizard__panel-header">
                        <div>
                          <span>Step 1 of 3</span>
                          <h3 id="create-work-step-1-title">Describe the work</h3>
                          <p>Enter only the customer, service or administrative information required for this work type.</p>
                        </div>
                        <span className="management-work-wizard__required-note">* Required</span>
                      </header>

                      <div className="management-work-wizard__grid">
                        <label className="is-wide">
                          <span className="management-work-form__label-text">
                            Work type <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span>
                          </span>
                          <select
                            id="create-work-type"
                            required
                            value={createForm.type}
                            onChange={(event) =>
                              setCreateForm((current) => ({
                                ...current,
                                type: event.target.value as WorkItemType,
                                serviceNumber:
                                  event.target.value === "MAINTENANCE"
                                    ? ""
                                    : current.serviceNumber,
                                serviceTypes: [
                                  "TROUBLE_TICKET",
                                  "NEW_CONNECTION",
                                  "UPDATE_SERVICES",
                                ].includes(event.target.value)
                                  ? current.serviceTypes
                                  : [],
                                otherServiceText: [
                                  "TROUBLE_TICKET",
                                  "NEW_CONNECTION",
                                  "UPDATE_SERVICES",
                                ].includes(event.target.value)
                                  ? current.otherServiceText
                                  : "",
                                salesDepartmentId: [
                                  "NEW_CONNECTION",
                                  "UPDATE_SERVICES",
                                ].includes(event.target.value)
                                  ? current.salesDepartmentId
                                  : "",
                                salesMemberAccountId: [
                                  "NEW_CONNECTION",
                                  "UPDATE_SERVICES",
                                ].includes(event.target.value)
                                  ? current.salesMemberAccountId
                                  : "",
                                assignmentMode:
                                  event.target.value === "ADMINISTRATIVE_TASK"
                                    ? current.assignmentMode
                                    : "TEAM",
                                assignedDepartmentId: "",
                                primaryAssigneeAccountId: "",
                                assignedTeamId: "",
                                supportingDepartmentId: "",
                                supportingAssigneeAccountIds: [],
                              }))
                            }
                          >
                            {WORK_TYPES.map((type) => (
                              <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                          </select>
                        </label>

                        {isAdministrativeWork ? (
                          <>
                            <label className="is-wide">
                              <span className="management-work-form__label-text">
                                Task title <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span>
                              </span>
                              <input
                                id="create-work-title"
                                required
                                minLength={2}
                                maxLength={160}
                                value={createForm.title}
                                onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))}
                                placeholder="Example: Prepare the monthly service report"
                              />
                            </label>
                            <label className="is-wide">
                              <span className="management-work-form__label-text">
                                Task description <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span>
                              </span>
                              <textarea
                                id="create-work-description"
                                required
                                minLength={2}
                                maxLength={4000}
                                rows={6}
                                value={createForm.description}
                                onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
                                placeholder="Explain the work, expected result and important instructions."
                              />
                            </label>
                          </>
                        ) : (
                          <>
                            <label>
                              <span className="management-work-form__label-text">
                                Customer name <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span>
                              </span>
                              <input
                                id="create-work-customer-name"
                                required
                                minLength={2}
                                maxLength={160}
                                autoComplete="name"
                                value={createForm.customerName}
                                onChange={(event) => setCreateForm((current) => ({ ...current, customerName: event.target.value }))}
                              />
                            </label>
                            <label>
                              <span className="management-work-form__label-text">
                                Contact type <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span>
                              </span>
                              <select
                                id="create-work-contact-type"
                                required
                                value={createForm.customerContactType}
                                onChange={(event) =>
                                  setCreateForm((current) => ({
                                    ...current,
                                    customerContactType: event.target.value as WorkContactType,
                                    customerContactNumber: "",
                                  }))
                                }
                              >
                                <option value="MOBILE">Mobile</option>
                                <option value="TELEPHONE">Telephone</option>
                              </select>
                            </label>
                            <label>
                              <span className="management-work-form__label-text">
                                Contact number <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span>
                              </span>
                              <input
                                id="create-work-contact-number"
                                required
                                inputMode="tel"
                                autoComplete="tel"
                                value={createForm.customerContactNumber}
                                onChange={(event) => {
                                  const value =
                                    createForm.customerContactType === "MOBILE"
                                      ? event.target.value.replace(/\D/g, "").slice(0, 10)
                                      : event.target.value.replace(/[^0-9 -]/g, "").slice(0, 20);
                                  setCreateForm((current) => ({ ...current, customerContactNumber: value }));
                                }}
                              />
                              <small className="management-work-form__field-help">
                                {createForm.customerContactType === "MOBILE"
                                  ? "10 digits"
                                  : "6–12 digits; spaces and hyphens allowed"}
                              </small>
                            </label>
                            <label>
                              <span className="management-work-form__label-text">
                                Location <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span>
                              </span>
                              <input
                                id="create-work-location"
                                required
                                minLength={2}
                                maxLength={300}
                                value={createForm.locationText}
                                onChange={(event) => setCreateForm((current) => ({ ...current, locationText: event.target.value }))}
                              />
                            </label>
                            {createRequiresServiceNumber && (
                              <label>
                                <span className="management-work-form__label-text">
                                  {[
                                    "NEW_CONNECTION",
                                    "UPDATE_SERVICES",
                                  ].includes(createForm.type)
                                    ? "Token number"
                                    : "Service number"} <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span>
                                </span>
                                <input
                                  id="create-work-service-number"
                                  required
                                  maxLength={100}
                                  value={createForm.serviceNumber}
                                  onChange={(event) => setCreateForm((current) => ({ ...current, serviceNumber: event.target.value }))}
                                />
                              </label>
                            )}
                            <label>
                              <span className="management-work-form__label-text">
                                {networkFieldQualifier ? `${networkFieldQualifier} OLT` : "OLT"} <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span>
                              </span>
                              <input
                                id="create-work-olt"
                                required
                                maxLength={100}
                                value={createForm.olt}
                                onChange={(event) => setCreateForm((current) => ({ ...current, olt: event.target.value }))}
                              />
                            </label>
                            <label>
                              <span className="management-work-form__label-text">
                                {networkFieldQualifier ? `${networkFieldQualifier} FDC name` : "FDC name"} <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span>
                              </span>
                              <input
                                id="create-work-fdc"
                                required
                                maxLength={100}
                                value={createForm.fdcName}
                                onChange={(event) => setCreateForm((current) => ({ ...current, fdcName: event.target.value }))}
                              />
                            </label>
                            <label>
                              <span className="management-work-form__label-text">
                                {networkFieldQualifier ? `${networkFieldQualifier} FAP name` : "FAP name"} <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span>
                              </span>
                              <input
                                id="create-work-fap"
                                required
                                maxLength={100}
                                value={createForm.fapName}
                                onChange={(event) => setCreateForm((current) => ({ ...current, fapName: event.target.value }))}
                              />
                            </label>
                            {createRequiresServices && (
                              <fieldset id="create-work-services" className="management-work-form__service-selector is-wide">
                                <legend>
                                  Services <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span>
                                </legend>
                                <div>
                                  {SERVICE_TYPES.map((serviceType) => (
                                    <label key={serviceType.value}>
                                      <input
                                        type="checkbox"
                                        checked={createForm.serviceTypes.includes(serviceType.value)}
                                        onChange={(event) =>
                                          setCreateForm((current) => ({
                                            ...current,
                                            serviceTypes: event.target.checked
                                              ? [...current.serviceTypes, serviceType.value]
                                              : current.serviceTypes.filter((value) => value !== serviceType.value),
                                            otherServiceText:
                                              serviceType.value === "OTHER" && !event.target.checked
                                                ? ""
                                                : current.otherServiceText,
                                          }))
                                        }
                                      />
                                      <span>{serviceType.label}</span>
                                    </label>
                                  ))}
                                </div>
                                {createForm.serviceTypes.includes("OTHER") && (
                                  <label className="management-work-form__other-service">
                                    <span className="management-work-form__label-text">
                                      Specify other service <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span>
                                    </span>
                                    <input
                                      id="create-work-other-service"
                                      required
                                      minLength={2}
                                      maxLength={160}
                                      value={createForm.otherServiceText}
                                      onChange={(event) => setCreateForm((current) => ({ ...current, otherServiceText: event.target.value }))}
                                    />
                                  </label>
                                )}
                              </fieldset>
                            )}
                          </>
                        )}
                      </div>
                    </section>
                  )}

                  {createStep === 2 && (
                    <section className="management-work-wizard__panel" aria-labelledby="create-work-step-2-title">
                      <header className="management-work-wizard__panel-header">
                        <div>
                          <span>Step 2 of 3</span>
                          <h3 id="create-work-step-2-title">Assign responsibility and schedule</h3>
                          <p>Choose the main owner first, then add required coordination, optional support and the work timeline.</p>
                        </div>
                      </header>

                      <div className="management-work-wizard__group">
                        <div className="management-work-wizard__group-heading">
                          <span>01</span>
                          <div>
                            <h4>Main responsibility</h4>
                            <p>The selected team or staff member owns technical execution.</p>
                          </div>
                        </div>
                        <div className="management-work-wizard__grid">
                          {isAdministrativeWork && (
                            <fieldset className="management-work-assignment-mode is-wide">
                              <legend>Assignment type <span className="management-work-form__required" aria-hidden="true">*</span></legend>
                              <div>
                                <label>
                                  <input
                                    type="radio"
                                    name="administrative-assignment-mode"
                                    value="TEAM"
                                    checked={createForm.assignmentMode === "TEAM"}
                                    onChange={() =>
                                      setCreateForm((current) => ({
                                        ...current,
                                        assignmentMode: "TEAM",
                                        primaryAssigneeAccountId: "",
                                        assignedTeamId: "",
                                        salesDepartmentId: "",
                                        salesMemberAccountId: "",
                                        supportingDepartmentId: "",
                                        supportingAssigneeAccountIds: [],
                                      }))
                                    }
                                  />
                                  <span>Team</span>
                                </label>
                                <label>
                                  <input
                                    type="radio"
                                    name="administrative-assignment-mode"
                                    value="STAFF"
                                    checked={createForm.assignmentMode === "STAFF"}
                                    onChange={() =>
                                      setCreateForm((current) => ({
                                        ...current,
                                        assignmentMode: "STAFF",
                                        primaryAssigneeAccountId: "",
                                        assignedTeamId: "",
                                        salesDepartmentId: "",
                                        salesMemberAccountId: "",
                                        supportingDepartmentId: "",
                                        supportingAssigneeAccountIds: [],
                                        responsibleManagerAccountId: "",
                                      }))
                                    }
                                  />
                                  <span>Staff member</span>
                                </label>
                              </div>
                            </fieldset>
                          )}

                          <SearchableSelect
                            id="create-work-assigned-department"
                            label="Assigned Department"
                            value={createForm.assignedDepartmentId}
                            options={assignedDepartmentOptions}
                            placeholder="Select responsible department"
                            required
                            onChange={(assignedDepartmentId) =>
                              setCreateForm((current) => ({
                                ...current,
                                assignedDepartmentId,
                                assignedTeamId: "",
                                primaryAssigneeAccountId: "",
                                salesDepartmentId: "",
                                salesMemberAccountId: "",
                                supportingDepartmentId: "",
                                supportingAssigneeAccountIds: [],
                                responsibleManagerAccountId: "",
                              }))
                            }
                          />

                          {createForm.assignedDepartmentId && (
                            administrativeStaffAssignment ? (
                              <SearchableSelect
                                key={`staff-${createForm.assignedDepartmentId}`}
                                id="create-work-primary-assignee"
                                label="Assigned Staff Member"
                                value={createForm.primaryAssigneeAccountId}
                                options={assignedStaffOptions}
                                placeholder="Select staff member"
                                required
                                description={`${availableAssignmentCandidates.length} eligible in the selected department`}
                                onChange={(primaryAssigneeAccountId) =>
                                  setCreateForm((current) => ({
                                    ...current,
                                    primaryAssigneeAccountId,
                                    salesDepartmentId: "",
                                    salesMemberAccountId: "",
                                    supportingDepartmentId: "",
                                    supportingAssigneeAccountIds: [],
                                  }))
                                }
                              />
                            ) : (
                              <SearchableSelect
                                key={`team-${createForm.assignedDepartmentId}`}
                                id="create-work-assigned-team"
                                label="Assigned Team"
                                value={createForm.assignedTeamId}
                                options={assignedTeamOptions}
                                placeholder="Select team"
                                required
                                description={`${availableTeams.length} active team${availableTeams.length === 1 ? "" : "s"} available`}
                                onChange={(assignedTeamId) =>
                                  setCreateForm((current) => ({
                                    ...current,
                                    assignedTeamId,
                                    salesDepartmentId: "",
                                    salesMemberAccountId: "",
                                    supportingDepartmentId: "",
                                    supportingAssigneeAccountIds: [],
                                    responsibleManagerAccountId: "",
                                  }))
                                }
                              />
                            )
                          )}

                          {selectedCandidate && (
                            <div className={`management-workload management-workload--${selectedCandidate.workload.level.toLowerCase()} is-wide`}>
                              <strong>{getCandidateName(selectedCandidate)} · {formatLabel(selectedCandidate.workload.level)} workload</strong>
                              <span>{selectedCandidate.workload.active} active · {selectedCandidate.workload.highPriority} high priority · {selectedCandidate.workload.overdue} overdue</span>
                            </div>
                          )}
                          {selectedTeam && (
                            <div className={`management-workload management-workload--${selectedTeam.workload.level.toLowerCase()} is-wide`}>
                              <strong>{selectedTeam.name} · {formatLabel(selectedTeam.workload.level)} workload</strong>
                              <span>Admin: {selectedTeam.admin.name} · {selectedTeam.memberCount} members · {selectedTeam.workload.active} active · {selectedTeam.workload.overdue} overdue</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {targetWorkDivisionId && (
                        <div className="management-work-wizard__group">
                          <div className="management-work-wizard__group-heading">
                            <span>02</span>
                            <div>
                              <h4>Additional participants</h4>
                              <p>Sales coordination is required for New Installation and Update Services. Supporting Staff remains optional.</p>
                            </div>
                          </div>
                          <div className="management-work-wizard__grid">
                            {createAllowsSalesMember && (
                              <>
                                <SearchableSelect
                                  id="create-work-sales-department"
                                  label="Sales Department"
                                  value={createForm.salesDepartmentId}
                                  options={collaboratorDepartmentOptions}
                                  placeholder="Select department"
                                  required
                                  onChange={(salesDepartmentId) =>
                                    setCreateForm((current) => ({
                                      ...current,
                                      salesDepartmentId,
                                      salesMemberAccountId: "",
                                    }))
                                  }
                                />
                                {createForm.salesDepartmentId && (
                                  <SearchableSelect
                                    key={`sales-${createForm.salesDepartmentId}`}
                                    id="create-work-sales-member"
                                    label="Sales Member"
                                    value={createForm.salesMemberAccountId}
                                    options={salesMemberOptions}
                                    placeholder="Select Sales Member"
                                    required
                                    description="Customer coordination only; technical completion remains with the main owner."
                                    onChange={(salesMemberAccountId) =>
                                      setCreateForm((current) => ({
                                        ...current,
                                        salesMemberAccountId,
                                        supportingAssigneeAccountIds:
                                          current.supportingAssigneeAccountIds.filter(
                                            (accountId) => accountId !== salesMemberAccountId,
                                          ),
                                      }))
                                    }
                                  />
                                )}
                                {selectedSalesMember && (
                                  <div className={`management-workload management-workload--${selectedSalesMember.workload.level.toLowerCase()} is-wide`}>
                                    <strong>Sales: {getCandidateName(selectedSalesMember)}</strong>
                                    <span>{selectedSalesMember.workload.active} active · {selectedSalesMember.workload.overdue} overdue</span>
                                  </div>
                                )}
                              </>
                            )}

                            <details className="management-work-form__support-panel is-wide">
                              <summary>
                                <span>
                                  <strong>Supporting Staff</strong>
                                  <small>Optional assistance from one department</small>
                                </span>
                                <em>
                                  {createForm.supportingAssigneeAccountIds.length > 0
                                    ? `${createForm.supportingAssigneeAccountIds.length} selected`
                                    : "Add support"}
                                </em>
                              </summary>
                              <div className="management-work-form__support-panel-body">
                                <SearchableSelect
                                  id="create-work-supporting-department"
                                  label="Supporting Department"
                                  value={createForm.supportingDepartmentId}
                                  options={collaboratorDepartmentOptions}
                                  placeholder="Select department"
                                  onChange={(supportingDepartmentId) => {
                                    setSupportMemberSearch("");
                                    setCreateForm((current) => ({
                                      ...current,
                                      supportingDepartmentId,
                                      supportingAssigneeAccountIds: [],
                                    }));
                                  }}
                                />
                                {createForm.supportingDepartmentId && (
                                  <div className="management-work-support-options">
                                    <input
                                      id="create-work-support-search"
                                      type="search"
                                      value={supportMemberSearch}
                                      onChange={(event) => setSupportMemberSearch(event.target.value)}
                                      placeholder="Search supporting members"
                                      aria-label="Search supporting members"
                                      autoComplete="off"
                                    />
                                    {visibleSupportMembers.length === 0 ? (
                                      <p className="management-work-support-options__empty">
                                        No eligible employee matches this department and search.
                                      </p>
                                    ) : (
                                      visibleSupportMembers.map((candidate) => {
                                        const checked = createForm.supportingAssigneeAccountIds.includes(candidate.account.id);
                                        return (
                                          <label key={candidate.account.id}>
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={(event) =>
                                                setCreateForm((current) => ({
                                                  ...current,
                                                  supportingAssigneeAccountIds: event.target.checked
                                                    ? [...current.supportingAssigneeAccountIds, candidate.account.id]
                                                    : current.supportingAssigneeAccountIds.filter(
                                                        (accountId) => accountId !== candidate.account.id,
                                                      ),
                                                }))
                                              }
                                            />
                                            <span>
                                              <strong>{getCandidateName(candidate)}</strong>
                                              <small>{candidate.account.employee?.empId ?? "No employee ID"} · {candidate.account.employee?.designation ?? "Employee"}</small>
                                            </span>
                                          </label>
                                        );
                                      })
                                    )}
                                  </div>
                                )}
                              </div>
                            </details>
                          </div>
                        </div>
                      )}

                      <div className="management-work-wizard__group">
                        <div className="management-work-wizard__group-heading">
                          <span>03</span>
                          <div>
                            <h4>Schedule</h4>
                            <p>Record when the request arrived, when work begins and the completion deadline.</p>
                          </div>
                        </div>
                        <div className="management-work-form__schedule-grid">
                          <DualCalendarDateTimeInput
                            id="create-work-registered-at"
                            label="Registered Date and Time"
                            value={createForm.registeredAt}
                            required
                            max={new Date().toISOString()}
                            onChange={(registeredAt) =>
                              setCreateForm((current) => ({ ...current, registeredAt }))
                            }
                          />
                          <DualCalendarDateTimeInput
                            id="create-work-planned-start"
                            label="Planned start"
                            value={createForm.plannedStartAt}
                            required
                            min={createForm.registeredAt}
                            onChange={(plannedStartAt) =>
                              setCreateForm((current) => ({ ...current, plannedStartAt }))
                            }
                          />
                          <DualCalendarDateTimeInput
                            id="create-work-due-at"
                            label="Due date and time"
                            value={createForm.dueAt}
                            required
                            min={createForm.plannedStartAt}
                            onChange={(dueAt) =>
                              setCreateForm((current) => ({ ...current, dueAt }))
                            }
                          />
                        </div>
                      </div>

                      <details className="management-work-form__more-options">
                        <summary>
                          <span>More options</span>
                          <small>Reviewer and repeat creation</small>
                        </summary>
                        <div className="management-work-form__more-options-body">
                          <label>
                            Responsible reviewer
                            <select
                              value={createForm.responsibleManagerAccountId}
                              onChange={(event) =>
                                setCreateForm((current) => ({
                                  ...current,
                                  responsibleManagerAccountId: event.target.value,
                                }))
                              }
                            >
                              <option value="">Use my management account</option>
                              {responsibleManagers.map((manager) => (
                                <option key={manager.account.id} value={manager.account.id}>
                                  {getAccountName(manager.account)} · {formatLabel(manager.account.role)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="management-work-form__check">
                            <input
                              type="checkbox"
                              checked={createForm.createAnother}
                              onChange={(event) =>
                                setCreateForm((current) => ({
                                  ...current,
                                  createAnother: event.target.checked,
                                }))
                              }
                            />
                            <span>Create another ticket after assigning this work</span>
                          </label>
                        </div>
                      </details>
                    </section>
                  )}

                  {createStep === 3 && (
                    <section className="management-work-wizard__panel management-work-wizard__review" aria-labelledby="create-work-step-3-title">
                      <header className="management-work-wizard__panel-header">
                        <div>
                          <span>Step 3 of 3</span>
                          <h3 id="create-work-step-3-title">Review before assigning</h3>
                          <p>Confirm the work information, responsibility and timeline. Use Edit to return to a section.</p>
                        </div>
                      </header>

                      <div className="management-work-review-card">
                        <header>
                          <div>
                            <span>Work details</span>
                            <strong>{WORK_TYPES.find((type) => type.value === createForm.type)?.label ?? formatLabel(createForm.type)}</strong>
                          </div>
                          <button type="button" onClick={() => setCreateStep(1)}>Edit</button>
                        </header>
                        <dl>
                          {isAdministrativeWork ? (
                            <>
                              <div><dt>Title</dt><dd>{createForm.title}</dd></div>
                              <div className="is-wide"><dt>Description</dt><dd>{createForm.description}</dd></div>
                            </>
                          ) : (
                            <>
                              <div><dt>Customer</dt><dd>{createForm.customerName}</dd></div>
                              <div><dt>Contact</dt><dd>{createForm.customerContactNumber}</dd></div>
                              <div><dt>Location</dt><dd>{createForm.locationText}</dd></div>
                              {createRequiresServiceNumber && <div><dt>{["NEW_CONNECTION", "UPDATE_SERVICES"].includes(createForm.type) ? "Token" : "Service number"}</dt><dd>{createForm.serviceNumber}</dd></div>}
                              <div><dt>OLT</dt><dd>{createForm.olt}</dd></div>
                              <div><dt>FDC / FAP</dt><dd>{createForm.fdcName} / {createForm.fapName}</dd></div>
                              {createRequiresServices && (
                                <div className="is-wide">
                                  <dt>Services</dt>
                                  <dd>{createForm.serviceTypes.map((value) => SERVICE_TYPES.find((service) => service.value === value)?.label ?? formatLabel(value)).join(", ")}{createForm.otherServiceText ? ` · ${createForm.otherServiceText}` : ""}</dd>
                                </div>
                              )}
                            </>
                          )}
                        </dl>
                      </div>

                      <div className="management-work-review-card">
                        <header>
                          <div>
                            <span>Responsibility</span>
                            <strong>{selectedTeam?.name ?? (selectedCandidate ? getCandidateName(selectedCandidate) : "Not selected")}</strong>
                          </div>
                          <button type="button" onClick={() => setCreateStep(2)}>Edit</button>
                        </header>
                        <dl>
                          <div><dt>Department</dt><dd>{selectedAssignedDepartment?.name ?? "—"}</dd></div>
                          <div><dt>Main owner</dt><dd>{selectedTeam ? `${selectedTeam.name} · Admin ${selectedTeam.admin.name}` : selectedCandidate ? getCandidateName(selectedCandidate) : "—"}</dd></div>
                          {createAllowsSalesMember && (
                            <div><dt>Sales Member</dt><dd>{selectedSalesMember ? getCandidateName(selectedSalesMember) : "—"}</dd></div>
                          )}
                          <div><dt>Supporting Staff</dt><dd>{selectedSupportingMembers.length > 0 ? selectedSupportingMembers.map(getCandidateName).join(", ") : "None"}</dd></div>
                          <div><dt>Reviewer</dt><dd>{selectedResponsibleManager ? getAccountName(selectedResponsibleManager.account) : "My management account"}</dd></div>
                        </dl>
                      </div>

                      <div className="management-work-review-card">
                        <header>
                          <div>
                            <span>Schedule</span>
                            <strong>{formatDateTime(createForm.plannedStartAt)} → {formatDateTime(createForm.dueAt)}</strong>
                          </div>
                          <button type="button" onClick={() => setCreateStep(2)}>Edit</button>
                        </header>
                        <dl>
                          <div><dt>Registered</dt><dd>{formatDateTime(createForm.registeredAt)}<small>{formatBikramSambatDateTime(createForm.registeredAt)}</small></dd></div>
                          <div><dt>Planned Start</dt><dd>{formatDateTime(createForm.plannedStartAt)}<small>{formatBikramSambatDateTime(createForm.plannedStartAt)}</small></dd></div>
                          <div><dt>Due</dt><dd>{formatDateTime(createForm.dueAt)}<small>{formatBikramSambatDateTime(createForm.dueAt)}</small></dd></div>
                          <div><dt>After assigning</dt><dd>{createForm.createAnother ? "Prepare another ticket" : "Return to Work Management"}</dd></div>
                        </dl>
                      </div>

                      <div className="management-work-wizard__confirmation">
                        <span aria-hidden="true">✓</span>
                        <div>
                          <strong>Ready to assign</strong>
                          <p>The backend will revalidate permissions, current department membership and assignment eligibility before saving.</p>
                        </div>
                      </div>
                    </section>
                  )}

                  <footer className="management-work-wizard__footer">
                    <button type="button" className="is-secondary" onClick={leaveCreateWizard}>Cancel</button>
                    <div>
                      {createStep > 1 && (
                        <button
                          type="button"
                          className="is-secondary"
                          onClick={() => {
                            setActionError("");
                            setCreateStep((current) => (current === 3 ? 2 : 1));
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Back
                        </button>
                      )}
                      {createStep < 3 ? (
                        <button type="button" className="is-primary" onClick={continueCreateWizard}>
                          Continue
                        </button>
                      ) : (
                        <button type="submit" className="is-primary" disabled={actionBusy}>
                          {actionBusy ? "Assigning..." : "Assign Work"}
                        </button>
                      )}
                    </div>
                  </footer>
                </form>
              )
            ) : (
              <form onSubmit={submitCurrentAction} className="management-work-form">
                {actionMode === "EDIT" && selectedWork && (
                  <>
                    <label>Priority<select value={actionForm.priority} onChange={(event) => setActionForm((current) => ({ ...current, priority: event.target.value as WorkPriority }))}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{formatLabel(priority)}</option>)}</select></label>
                    <DualCalendarDateTimeInput
                      id="edit-work-registered-at"
                      label="Registered Date and Time"
                      value={actionForm.registeredAt}
                      required
                      max={new Date().toISOString()}
                      onChange={(registeredAt) => setActionForm((current) => ({ ...current, registeredAt }))}
                    />
                    <DualCalendarDateTimeInput
                      id="edit-work-planned-start"
                      label="Planned start"
                      value={actionForm.plannedStartAt}
                      required
                      min={actionForm.registeredAt}
                      onChange={(plannedStartAt) => setActionForm((current) => ({ ...current, plannedStartAt }))}
                    />
                    <DualCalendarDateTimeInput
                      id="edit-work-due-at"
                      label="Due date and time"
                      value={actionForm.dueAt}
                      required
                      min={actionForm.plannedStartAt}
                      onChange={(dueAt) => setActionForm((current) => ({ ...current, dueAt }))}
                    />
                    <label className="is-wide">Location<input value={actionForm.locationText} onChange={(event) => setActionForm((current) => ({ ...current, locationText: event.target.value }))} /></label>
                  </>
                )}
                {(actionMode === "REASSIGN" || actionMode === "SUPPORT") && (
                  <label className="is-wide">
                    Staff member
                    <select required value={actionForm.accountId} onChange={(event) => setActionForm((current) => ({ ...current, accountId: event.target.value }))}>
                      <option value="">Select staff member</option>
                      {(actionMode === "SUPPORT"
                        ? (options?.supportMembers ?? []).filter(
                            (candidate) =>
                              selectedWork !== null &&
                              candidate.division?.id === selectedWork.divisionId &&
                              !assignedAccountIds.includes(candidate.account.id) &&
                              candidate.account.id !== selectedWork.salesMemberAccountId,
                          )
                        : (options?.data ?? []).filter(
                            (candidate) =>
                              candidate.account.id !== primaryAssignment?.assignee.id,
                          )
                      ).map((candidate) => (
                          <option key={candidate.account.id} value={candidate.account.id}>
                            {getCandidateName(candidate)} · {formatLabel(candidate.workload.level)} workload
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {actionMode === "HELP" && (
                  <>
                    <label>
                      Help reason
                      <select
                        value={actionForm.helpReason}
                        onChange={(event) =>
                          setActionForm((current) => ({
                            ...current,
                            helpReason: event.target.value as WorkHelpReason,
                          }))
                        }
                      >
                        <option value="NEED_ANOTHER_EMPLOYEE">Need another staff member</option>
                        <option value="TECHNICAL_GUIDANCE">Technical guidance</option>
                        <option value="TOOLS_OR_MATERIALS">Tools or materials</option>
                        <option value="SAFETY_CONCERN">Safety concern</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </label>
                    <label>
                      Preferred helper (optional)
                      <select
                        value={actionForm.accountId}
                        disabled={!selectedWork?.departmentId}
                        onChange={(event) =>
                          setActionForm((current) => ({
                            ...current,
                            accountId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Notify responsible management</option>
                        {options?.data
                          .filter((candidate) =>
                            candidate.department?.id === selectedWork?.departmentId &&
                            candidate.account.id !== account?.id,
                          )
                          .map((candidate) => (
                            <option key={candidate.account.id} value={candidate.account.id}>
                              {getCandidateName(candidate)} · {formatLabel(candidate.workload.level)}
                            </option>
                          ))}
                      </select>
                    </label>
                  </>
                )}
                {actionMode === "COMPLETE" && (
                  <>
                    <label>
                      Result
                      <select
                        value={actionForm.completionResult}
                        onChange={(event) =>
                          setActionForm((current) => ({
                            ...current,
                            completionResult: event.target.value as WorkCompletionResult,
                          }))
                        }
                      >
                        <option value="FULLY_RESOLVED">Fully resolved</option>
                        <option value="TEMPORARY_SOLUTION">Temporary solution</option>
                        <option value="UNABLE_TO_RESOLVE">Unable to resolve</option>
                      </select>
                    </label>
                    <label className="management-work-form__check">
                      <input
                        type="checkbox"
                        checked={actionForm.moreWorkRequired}
                        onChange={(event) =>
                          setActionForm((current) => ({
                            ...current,
                            moreWorkRequired: event.target.checked,
                          }))
                        }
                      />
                      <span>More work is required</span>
                    </label>
                  </>
                )}
                {actionMode !== "EDIT" && (
                  <label className="is-wide">
                    {actionMode === "REVIEW"
                      ? "Verification note"
                      : actionMode === "COMPLETE"
                        ? "Completion summary"
                        : actionMode === "HELP"
                          ? "Help request note"
                      : actionMode === "CANCEL"
                        ? "Cancellation reason"
                        : actionMode === "RETENTION_HOLD"
                          ? "Hold reason"
                          : actionMode === "DELETION_REQUEST"
                            ? "Deletion-review reason"
                            : "Reason or note"}
                    <textarea required={actionMode !== "HELP"} minLength={actionMode === "HELP" ? 0 : actionMode === "RETENTION_HOLD" || actionMode === "DELETION_REQUEST" ? 5 : 3} maxLength={actionMode === "RETENTION_HOLD" || actionMode === "DELETION_REQUEST" ? 500 : 1500} value={actionForm.note} onChange={(event) => setActionForm((current) => ({ ...current, note: event.target.value }))} />
                  </label>
                )}
                <footer className="is-wide">
                  <button type="button" onClick={() => setActionMode(null)}>Cancel</button>
                  {actionMode === "REVIEW" && <button type="button" onClick={() => void requestInformation()} disabled={actionBusy || actionForm.note.trim().length < 3}>Ask for information</button>}
                  <button className={actionMode === "CANCEL" || actionMode === "DELETION_REQUEST" ? "is-danger" : ""} type="submit" disabled={actionBusy}>{actionBusy ? "Saving..." : actionMode === "REVIEW" ? "Verify and Close" : actionMode === "COMPLETE" ? "Submit Completion" : actionMode === "HELP" ? "Send Help Request" : actionMode === "RETENTION_HOLD" ? "Apply Hold" : actionMode === "DELETION_REQUEST" ? "Submit Request" : "Save"}</button>
                </footer>
              </form>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
