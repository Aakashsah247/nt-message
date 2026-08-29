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
  getManagementOrganizationSummary,
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
import type { WorkCalendarMode } from "../utils/nepal-calendar";
import type {
  WorkActivity,
  WorkAssignmentCandidate,
  WorkAssignmentOptionsResponse,
  WorkCompletionResult,
  WorkContactType,
  WorkDepartmentOption,
  WorkHelpReason,
  WorkItem,
  WorkItemListResponse,
  WorkItemStatus,
  WorkItemType,
  WorkManagementDashboardSummary,
  WorkManagementOrganizationSummaryResponse,
  WorkQueueFocus,
  WorkServiceType,
  WorkQueueView,
} from "../types/work-management";

type ActionMode =
  | "CREATE"
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
  if (value === "DELEGATED") return "Delegated";

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string | null): string {
  return formatKathmanduDateTime(value);
}

function formatCompletionResult(value: WorkCompletionResult): string {
  if (value === "FULLY_RESOLVED") return "Work finished";
  if (value === "TEMPORARY_SOLUTION") return "Temporary work done";
  return "Could not finish";
}

function isOperationalCompletionType(type: WorkItemType): boolean {
  return type !== "ADMINISTRATIVE_TASK";
}

function completionRequiresCustomerId(type: WorkItemType): boolean {
  return [
    "NEW_CONNECTION",
    "UPDATE_SERVICES",
    "TROUBLE_TICKET",
    "EMERGENCY_WORK",
  ].includes(type);
}

function completionAllowsCustomerId(type: WorkItemType): boolean {
  return completionRequiresCustomerId(type) || type === "MAINTENANCE";
}

function completionReference(workItem: WorkItem): { label: string; value: string } | null {
  if (workItem.requestNumber?.trim()) {
    return { label: "Token Number", value: workItem.requestNumber };
  }
  if (workItem.type !== "NEW_CONNECTION" && workItem.serviceNumber?.trim()) {
    return { label: "Service Number", value: workItem.serviceNumber };
  }
  return null;
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
    requestNumber: "",
    cpcSerial: "",
    serviceNumber: "",
    olt: "",
    fdcName: "",
    fapName: "",
    serviceTypes: [] as WorkServiceType[],
    otherServiceText: "",
    registeredAt: "",
    plannedStartAt: plannedStart.toISOString(),
    dueAt: dueAt.toISOString(),
    assignmentMode: "TEAM" as "TEAM" | "INDIVIDUAL",
    administrativeRecipientRole: "" as "SENIOR_MANAGEMENT" | "TEAM_MANAGER" | "EMPLOYEE" | "",
    assignedDivisionId: "",
    assignedDepartmentId: "",
    assignedTeamId: "",
    primaryAssigneeAccountId: "",
    salesDepartmentId: "",
    salesMemberAccountId: "",
    supportingDepartmentId: "",
    supportingAssigneeAccountIds: [] as string[],
    responsibleManagerAccountId: "",
    parentWorkItemId: "",
    delegationInstructions: "",
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
  // Small scoped lists are faster with a single native select. Keep the
  // dedicated search field only where it provides real value.
  const showSearch = options.length > 10;

  return (
    <div className={`management-work-searchable-select ${showSearch ? "has-search" : ""}`.trim()}>
      <span className="management-work-form__label-text" id={`${id}-label`}>
        {label}{required && (
          <> <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span></>
        )}
      </span>
      {showSearch && (
        <input
          type="search"
          className="management-work-searchable-select__search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${label.toLowerCase()}`}
          aria-label={`Search ${label.toLowerCase()}`}
          autoComplete="off"
        />
      )}
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

function buildActionForm(workItem: WorkItem | null = null) {
  return {
    note: "",
    accountId:
      workItem?.assignments.find(
        (assignment) => assignment.assignmentRole === "PRIMARY",
      )?.assignee.id ?? "",
    registeredAt: workItem?.registeredAt ?? "",
    plannedStartAt: workItem?.plannedStartAt ?? "",
    dueAt: workItem?.dueAt ?? "",
    locationText: workItem?.locationText ?? "",
    completionResult: "FULLY_RESOLVED" as WorkCompletionResult,
    completionCustomerId: "",
    completionRxLevel: "",
    moreWorkRequired: false,
    helpReason: "NEED_ANOTHER_EMPLOYEE" as WorkHelpReason,
  };
}

export function ManagementWorkPage() {
  const { account, accessToken } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDedicatedCreateRoute = location.pathname === "/work-management/create";
  const editRouteMatch = location.pathname.match(/^\/work-management\/([^/]+)\/edit$/);
  const dedicatedEditWorkId = editRouteMatch?.[1] ? decodeURIComponent(editRouteMatch[1]) : null;
  const isDedicatedEditRoute = Boolean(dedicatedEditWorkId);
  const isDedicatedFormRoute = isDedicatedCreateRoute || isDedicatedEditRoute;
  const [summary, setSummary] =
    useState<WorkManagementDashboardSummary | null>(null);
  const [organizationSummary, setOrganizationSummary] =
    useState<WorkManagementOrganizationSummaryResponse | null>(null);
  const [organizationLoading, setOrganizationLoading] = useState(true);
  const [organizationError, setOrganizationError] = useState("");
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
  const [openingDelegationId, setOpeningDelegationId] = useState<string | null>(null);
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
    divisionId: "",
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
      return focus === current.focus &&
        view === current.view &&
        status === current.status
        ? current
        : { ...current, focus, view, status, page: 1 };
    });
  }, [
    account?.role,
    requestedFocus,
    requestedStatus,
    requestedView,
  ]);

  const [createForm, setCreateForm] = useState(createDefaultWorkForm);
  const [createStep, setCreateStep] = useState<CreateWizardStep>(1);
  const [createCalendarMode, setCreateCalendarMode] = useState<WorkCalendarMode>("AD");
  const [createInitialSnapshot, setCreateInitialSnapshot] = useState("");
  const [supportMemberSearch, setSupportMemberSearch] = useState("");
  const [createReviewSubmitReady, setCreateReviewSubmitReady] = useState(false);
  const createFormRef = useRef<HTMLFormElement | null>(null);
  const createIsDirty = Boolean(
    isDedicatedCreateRoute &&
      createInitialSnapshot &&
      JSON.stringify(createForm) !== createInitialSnapshot,
  );
  const [actionForm, setActionForm] = useState(() => buildActionForm());
  const [editCalendarMode, setEditCalendarMode] = useState<WorkCalendarMode>("AD");

  useEffect(() => {
    if (!isDedicatedCreateRoute) return;

    const initialForm = createDefaultWorkForm();
    setCreateForm(initialForm);
    setCreateInitialSnapshot(JSON.stringify(initialForm));
    setCreateStep(1);
    setCreateCalendarMode("AD");
    setSupportMemberSearch("");
    setCreateReviewSubmitReady(false);
    setActionError("");
    setNotice("");
    setActionMode("CREATE");
  }, [isDedicatedCreateRoute]);

  useEffect(() => {
    if (!isDedicatedEditRoute || !accessToken || !dedicatedEditWorkId) return;

    let cancelled = false;
    // Edit Work is route-driven. Clear any legacy dialog action state so
    // browser/touchpad history cannot resurrect the removed Edit modal.
    setActionMode(null);
    setActionError("");
    setNotice("");
    setSelectedWork(null);
    setDetailLoading(true);
    setEditCalendarMode("AD");

    void getWorkItem(accessToken, dedicatedEditWorkId)
      .then((response) => {
        if (cancelled) return;
        setSelectedId(response.workItem.id);
        setSelectedWork(response.workItem);
        setActionForm(buildActionForm(response.workItem));
      })
      .catch((requestError) => {
        if (!cancelled) setActionError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, dedicatedEditWorkId, isDedicatedEditRoute]);

  useEffect(() => {
    if (!isDedicatedCreateRoute || createForm.parentWorkItemId || createStep !== 3) {
      setCreateReviewSubmitReady(false);
      return;
    }

    // Keep the final submit disabled for the short step transition. This prevents
    // a rapid/double click on Continue from landing on the newly rendered Assign
    // Work button and submitting before the user has actually reviewed the page.
    const timer = window.setTimeout(() => setCreateReviewSubmitReady(true), 300);
    return () => window.clearTimeout(timer);
  }, [createForm.parentWorkItemId, createStep, isDedicatedCreateRoute]);

  useEffect(() => {
    if (
      isDedicatedCreateRoute ||
      actionMode !== "CREATE" ||
      createForm.parentWorkItemId
    ) {
      return;
    }

    // The dedicated Create Work route is the only place where a root work item
    // may be created. Browser/touchpad back navigation used to leave CREATE in
    // memory and re-render the same form through the legacy dialog path. Clear
    // that stale state as soon as the route is left. Administrative delegation
    // intentionally keeps using its existing dialog because it has a parent task.
    setActionMode(null);
    setCreateInitialSnapshot("");
    setCreateStep(1);
    setSupportMemberSearch("");
    setCreateReviewSubmitReady(false);
  }, [actionMode, createForm.parentWorkItemId, isDedicatedCreateRoute]);

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
    if (isDedicatedFormRoute) return;

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
  }, [isDedicatedFormRoute]);

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
          divisionId: filters.divisionId || undefined,
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

  const loadOrganizationSummary = useCallback(async () => {
    if (!accessToken) return;

    setOrganizationLoading(true);
    setOrganizationError("");
    try {
      setOrganizationSummary(await getManagementOrganizationSummary(accessToken));
    } catch (requestError) {
      setOrganizationError(getErrorMessage(requestError));
    } finally {
      setOrganizationLoading(false);
    }
  }, [accessToken]);

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
    if (!isDedicatedFormRoute) {
      void loadOverview();
    }
  }, [isDedicatedFormRoute, loadOverview, refreshKey]);

  useEffect(() => {
    if (!isDedicatedFormRoute) {
      void loadOrganizationSummary();
    }
  }, [isDedicatedFormRoute, loadOrganizationSummary, refreshKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextDayKey = getLocalDayRange().dayKey;
      setDayKey((current) => (current === nextDayKey ? current : nextDayKey));
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isDedicatedFormRoute || !accessToken || !account?.role) return;

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
  }, [accessToken, account?.role, dayKey, isDedicatedFormRoute, refreshKey]);

  useEffect(() => {
    if (!isDedicatedEditRoute) void loadOptions();
  }, [isDedicatedEditRoute, loadOptions, refreshKey]);

  useEffect(() => {
    if (!isDedicatedFormRoute) {
      void loadDetail();
    }
  }, [isDedicatedFormRoute, loadDetail, refreshKey]);

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

  const isAdministrativeWork = createForm.type === "ADMINISTRATIVE_TASK";
  const administrativeIndividualAssignment =
    isAdministrativeWork && createForm.assignmentMode === "INDIVIDUAL";

  const availableDivisions = useMemo(() => {
    const divisions = new Map<string, WorkDepartmentOption["division"]>();
    availableDepartments.forEach((department) => {
      divisions.set(department.division.id, department.division);
    });
    (options?.data ?? []).forEach((candidate) => {
      if (candidate.division) {
        divisions.set(candidate.division.id, candidate.division);
      }
    });
    return [...divisions.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }, [availableDepartments, options?.data]);

  const availableAssignedDepartments = useMemo(() => {
    if (account?.role === "SUPER_ADMIN") {
      if (!createForm.assignedDivisionId) return [];
      return availableDepartments.filter(
        (department) => department.divisionId === createForm.assignedDivisionId,
      );
    }

    if (administrativeIndividualAssignment && account?.role === "TEAM_MANAGER") {
      return availableDepartments.filter(
        (department) => department.id === options?.scope.departmentId,
      );
    }

    return availableDepartments;
  }, [
    account?.role,
    administrativeIndividualAssignment,
    availableDepartments,
    createForm.assignedDivisionId,
    options?.scope.departmentId,
  ]);

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
      const expectedRole =
        account?.role === "SENIOR_MANAGEMENT"
          ? "TEAM_MANAGER"
          : account?.role === "TEAM_MANAGER"
            ? "EMPLOYEE"
            : null;
      if (!expectedRole) return [];

      return candidates.filter((candidate) => {
        if (candidate.account.id === account?.id) return false;
        if (candidate.account.role !== expectedRole) return false;
        if (selectedWork && candidate.division?.id !== selectedWork.divisionId) {
          return false;
        }
        if (
          account?.role === "TEAM_MANAGER" &&
          selectedWork?.departmentId &&
          candidate.department?.id !== selectedWork.departmentId
        ) {
          return false;
        }
        return true;
      });
    }

    if (administrativeIndividualAssignment) {
      const recipientRole = createForm.administrativeRecipientRole;
      if (!recipientRole) return [];

      return candidates.filter((candidate) => {
        if (candidate.account.id === account?.id) return false;
        if (candidate.account.role !== recipientRole) return false;

        if (account?.role === "SUPER_ADMIN") {
          if (!createForm.assignedDivisionId) return false;
          if (candidate.division?.id !== createForm.assignedDivisionId) return false;
        }

        if (recipientRole === "SENIOR_MANAGEMENT") {
          return true;
        }

        if (!createForm.assignedDepartmentId) return false;
        return candidate.department?.id === createForm.assignedDepartmentId;
      });
    }

    if (!createForm.assignedDepartmentId) return [];
    return candidates.filter(
      (candidate) => candidate.department?.id === createForm.assignedDepartmentId,
    );
  }, [
    account?.id,
    account?.role,
    administrativeIndividualAssignment,
    createForm.administrativeRecipientRole,
    createForm.assignedDepartmentId,
    createForm.assignedDivisionId,
    createForm.parentWorkItemId,
    options?.data,
    selectedWork,
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

  const selectedSalesDepartment = useMemo(
    () =>
      collaboratorDepartments.find(
        (department) => department.id === createForm.salesDepartmentId,
      ) ?? null,
    [collaboratorDepartments, createForm.salesDepartmentId],
  );

  const selectedSupportingDepartment = useMemo(
    () =>
      collaboratorDepartments.find(
        (department) => department.id === createForm.supportingDepartmentId,
      ) ?? null,
    [collaboratorDepartments, createForm.supportingDepartmentId],
  );

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

  const createRequiresServices = [
    "TROUBLE_TICKET",
    "NEW_CONNECTION",
    "UPDATE_SERVICES",
  ].includes(createForm.type);
  const createRequiresRequestNumber = ["NEW_CONNECTION", "UPDATE_SERVICES"].includes(createForm.type);
  const createRequiresCpcSerial = createForm.type === "NEW_CONNECTION";
  const createRequiresServiceNumber = !["MAINTENANCE", "NEW_CONNECTION"].includes(createForm.type);
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

  const assignedDivisionOptions: SearchableSelectOption[] =
    availableDivisions.map((division) => ({
      value: division.id,
      label: division.name,
      searchText: division.code,
    }));
  const assignedDepartmentOptions: SearchableSelectOption[] =
    availableAssignedDepartments.map((department) => ({
      value: department.id,
      label:
        account?.role === "SUPER_ADMIN"
          ? department.name
          : `${department.name} · ${department.division.name}`,
      searchText: `${department.code} ${department.division.code}`,
    }));
  const assignedTeamOptions: SearchableSelectOption[] = availableTeams.map(
    (team) => ({
      value: team.id,
      label: `${team.name} · ${team.admin.name} · ${team.memberCount} members`,
      searchText: `${team.admin.empId} ${team.workload.active} active`,
    }),
  );
  const administrativeRecipientRoleOptions: SearchableSelectOption[] =
    account?.role === "SUPER_ADMIN"
      ? [
          { value: "SENIOR_MANAGEMENT", label: "Senior Management" },
          { value: "TEAM_MANAGER", label: "Team Manager" },
        ]
      : account?.role === "SENIOR_MANAGEMENT"
        ? [{ value: "TEAM_MANAGER", label: "Team Manager" }]
        : account?.role === "TEAM_MANAGER"
          ? [{ value: "EMPLOYEE", label: "Employee" }]
          : [];
  const assignedIndividualOptions: SearchableSelectOption[] =
    availableAssignmentCandidates.map((candidate) => ({
      value: candidate.account.id,
      label: `${getCandidateName(candidate)} · ${formatLabel(candidate.account.role)} · ${candidate.account.employee?.empId ?? "No employee ID"}`,
      searchText: `${candidate.division?.name ?? ""} ${candidate.department?.name ?? ""} ${candidate.account.employee?.designation ?? ""}`,
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

    const nextForm = buildActionForm(workItem);
    if (mode === "COMPLETE" && workItem) {
      const requestedReport = workItem.completionReports?.find(
        (report) => report.reviewStatus === "INFORMATION_REQUESTED",
      );
      if (requestedReport) {
        nextForm.note = requestedReport.summary;
        nextForm.completionResult = requestedReport.result;
        nextForm.completionCustomerId = requestedReport.customerId ?? "";
        nextForm.completionRxLevel =
          requestedReport.rxLevelDbm === null || requestedReport.rxLevelDbm === undefined
            ? ""
            : String(requestedReport.rxLevelDbm);
        nextForm.moreWorkRequired = requestedReport.moreWorkRequired;
      }
    }
    setActionForm(nextForm);
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
        const field = document.getElementById(fieldId);
        const focusTarget =
          field instanceof HTMLInputElement ||
          field instanceof HTMLSelectElement ||
          field instanceof HTMLTextAreaElement ||
          field instanceof HTMLButtonElement
            ? field
            : field?.querySelector<HTMLElement>(
                "input, select, textarea, button, [tabindex]:not([tabindex='-1'])",
              );
        field?.scrollIntoView({ behavior: "smooth", block: "center" });
        focusTarget?.focus({ preventScroll: true });
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
      if (createRequiresRequestNumber && !createForm.requestNumber.trim()) {
        return {
          step,
          message: "Enter the token number.",
          fieldId: "create-work-request-number",
        };
      }
      if (createRequiresCpcSerial && !createForm.cpcSerial.trim()) {
        return {
          step,
          message: "Enter the CPC Serial.",
          fieldId: "create-work-cpc-serial",
        };
      }
      if (createRequiresServiceNumber && !createForm.serviceNumber.trim()) {
        return {
          step,
          message: "Enter the service number.",
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

    const registeredAt = isAdministrativeWork ? undefined : toIso(createForm.registeredAt);
    const plannedStartAt = toIso(createForm.plannedStartAt);
    const dueAt = toIso(createForm.dueAt);
    if (
      account?.role === "SUPER_ADMIN" &&
      (!createForm.assignedDivisionId ||
        !availableDivisions.some(
          (division) => division.id === createForm.assignedDivisionId,
        ))
    ) {
      return {
        step,
        message: "Choose the division responsible for this work.",
        fieldId: "create-work-assigned-division",
      };
    }
    if (administrativeIndividualAssignment) {
      if (
        !createForm.administrativeRecipientRole ||
        !administrativeRecipientRoleOptions.some(
          (option) => option.value === createForm.administrativeRecipientRole,
        )
      ) {
        return {
          step,
          message: "Choose the management level receiving this administrative work.",
          fieldId: "create-work-recipient-level",
        };
      }
    }

    const requiresDepartment =
      !administrativeIndividualAssignment ||
      createForm.administrativeRecipientRole !== "SENIOR_MANAGEMENT";

    if (
      requiresDepartment &&
      (!createForm.assignedDepartmentId ||
        !selectedAssignedDepartment ||
        (account?.role === "SUPER_ADMIN" &&
          selectedAssignedDepartment.divisionId !== createForm.assignedDivisionId))
    ) {
      return {
        step,
        message: "Choose the department responsible for this work.",
        fieldId: "create-work-assigned-department",
      };
    }

    if (administrativeIndividualAssignment) {
      if (!createForm.primaryAssigneeAccountId || !selectedCandidate) {
        return {
          step,
          message: "Choose the individual responsible for this administrative work.",
          fieldId: "create-work-primary-assignee",
        };
      }
      if (selectedCandidate.account.role !== createForm.administrativeRecipientRole) {
        return {
          step,
          message: "The selected individual does not match the chosen management level.",
          fieldId: "create-work-primary-assignee",
        };
      }
    } else if (!createForm.assignedTeamId || !selectedTeam) {
      return {
        step,
        message: "Choose the Team responsible for this work.",
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
    if (!isAdministrativeWork && !registeredAt) {
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
    if (
      !isAdministrativeWork &&
      registeredAt &&
      new Date(registeredAt).getTime() > Date.now()
    ) {
      return {
        step,
        message: "Registered date and time cannot be in the future.",
        fieldId: "create-work-registered-at",
      };
    }
    if (
      !isAdministrativeWork &&
      registeredAt &&
      new Date(plannedStartAt).getTime() < new Date(registeredAt).getTime()
    ) {
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

  function scrollCreateStepIntoView(step: CreateWizardStep): void {
    // The workspace owns its own scrolling area, so window.scrollTo can leave
    // the next wizard step off-screen. Scroll the rendered step and move
    // keyboard/screen-reader focus to its heading after the transition.
    window.setTimeout(() => {
      const heading = document.getElementById(`create-work-step-${step}-title`);
      const panel = heading?.closest(".management-work-wizard__panel") ?? heading;
      panel?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (heading instanceof HTMLElement) {
        heading.focus({ preventScroll: true });
      }
    }, 0);
  }

  function continueCreateWizard(): void {
    if (!createFormRef.current?.reportValidity()) return;

    const currentError = validateCreateWizardStep(createStep === 1 ? 1 : 2);
    if (currentError) {
      showCreateValidation(currentError);
      return;
    }
    const nextStep: CreateWizardStep = createStep === 1 ? 2 : 3;
    setActionError("");
    setCreateStep(nextStep);
    scrollCreateStepIntoView(nextStep);
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

    // Root Create Work is a three-step wizard. Native form submission (including
    // pressing Enter in a field) must never bypass Work details or Assignment &
    // schedule, and the API may only be called from the stable Review step.
    if (!isDelegatedAssignment && isDedicatedCreateRoute) {
      if (createStep < 3) {
        continueCreateWizard();
        return;
      }
      if (!createReviewSubmitReady) return;
    }

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
      if (createForm.delegationInstructions.trim().length < 2) {
        setActionError("Enter clear delegation instructions.");
        return;
      }
      if (
        !availableAssignmentCandidates.some(
          (candidate) => candidate.account.id === createForm.primaryAssigneeAccountId,
        )
      ) {
        setActionError("Choose an eligible individual at the next administrative level.");
        return;
      }
      if (
        selectedWork &&
        new Date(dueAt).getTime() > new Date(selectedWork.dueAt).getTime()
      ) {
        setActionError("The delegated due time cannot be later than the parent task due time.");
        return;
      }
    } else {
      const validationError =
        validateCreateWizardStep(1) ?? validateCreateWizardStep(2);
      if (validationError) {
        showCreateValidation(validationError);
        return;
      }

      registeredAt = isAdministrativeWork
        ? undefined
        : toIso(createForm.registeredAt);
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
              delegationInstructions: createForm.delegationInstructions.trim(),
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
                requestNumber: createRequiresRequestNumber
                  ? createForm.requestNumber
                  : undefined,
                cpcSerial: createRequiresCpcSerial
                  ? createForm.cpcSerial
                  : undefined,
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
          isDelegatedAssignment || administrativeIndividualAssignment
            ? createForm.primaryAssigneeAccountId
            : undefined,
        assignedTeamId:
          !isDelegatedAssignment && !administrativeIndividualAssignment
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
          isDelegatedAssignment || administrativeIndividualAssignment
            ? undefined
            : createForm.responsibleManagerAccountId || undefined,
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
        setCreateReviewSubmitReady(false);
        scrollCreateStepIntoView(1);
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

  async function submitDedicatedEditWork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !selectedWork || !isDedicatedEditRoute) return;

    setActionBusy(true);
    setActionError("");
    try {
      await updateManagementWorkItem(accessToken, selectedWork.id, {
        registeredAt:
          selectedWork.type === "ADMINISTRATIVE_TASK"
            ? undefined
            : toIso(actionForm.registeredAt),
        plannedStartAt: toIso(actionForm.plannedStartAt),
        dueAt: toIso(actionForm.dueAt),
        locationText: actionForm.locationText,
      });
      navigate("/work-management", { replace: true });
    } catch (requestError) {
      setActionError(getErrorMessage(requestError));
    } finally {
      setActionBusy(false);
    }
  }

  async function submitCurrentAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !selectedWork || !actionMode) return;

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
      const usesOperationalPackage = isOperationalCompletionType(selectedWork.type);
      const requiresCustomerId = completionRequiresCustomerId(selectedWork.type);
      const allowsCustomerId = completionAllowsCustomerId(selectedWork.type);
      const rxLevelText = actionForm.completionRxLevel.trim();
      const rxLevelDbm = rxLevelText ? Number(rxLevelText) : undefined;

      if (requiresCustomerId && !actionForm.completionCustomerId.trim()) {
        setActionError("Customer ID is required for this work type.");
        return;
      }

      if (
        usesOperationalPackage &&
        (rxLevelDbm === undefined || !Number.isFinite(rxLevelDbm) || rxLevelDbm < -100 || rxLevelDbm > 20)
      ) {
        setActionError("Enter a valid RX Level between -100 and 20 dBm.");
        return;
      }

      await runAction(() =>
        submitEmployeeWorkCompletion(accessToken, selectedWork.id, {
          result: actionForm.completionResult,
          summary: actionForm.note,
          ...(allowsCustomerId && actionForm.completionCustomerId.trim()
            ? { customerId: actionForm.completionCustomerId.trim() }
            : {}),
          ...(usesOperationalPackage ? { rxLevelDbm } : {}),
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

  function openDelegation(workItem: WorkItem | null = selectedWork): void {
    if (
      !workItem ||
      workItem.type !== "ADMINISTRATIVE_TASK" ||
      workItem.assignedTeam
    ) {
      return;
    }
    setSelectedWork(workItem);
    setCreateForm({
      ...createDefaultWorkForm(),
      type: workItem.type,
      customerName: workItem.customerName ?? "",
      customerContactType: workItem.customerContactType ?? "MOBILE",
      customerContactNumber: workItem.customerContactNumber ?? "",
      locationText: workItem.locationText ?? "",
      requestNumber: workItem.requestNumber ?? "",
      cpcSerial: workItem.cpcSerial ?? "",
      serviceNumber: workItem.serviceNumber ?? "",
      olt: workItem.olt ?? "",
      fdcName: workItem.fdcName ?? "",
      fapName: workItem.fapName ?? "",
      serviceTypes: workItem.serviceTypes,
      otherServiceText: workItem.otherServiceText ?? "",
      parentWorkItemId: workItem.id,
      delegationInstructions: "",
      plannedStartAt: new Date().toISOString(),
      dueAt: workItem.dueAt,
      responsibleManagerAccountId: "",
    });
    openAction("CREATE");
  }

  async function openQueueDelegation(item: WorkItem): Promise<void> {
    if (!accessToken || openingDelegationId) return;

    setOpeningDelegationId(item.id);
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
          "Start this Administrative Work before delegating part of it.",
        );
      }

      openDelegation(workItem);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setOpeningDelegationId(null);
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
  const managementPrimaryPeople = selectedWork?.assignedTeam
    ? [...(selectedWork.assignedTeam.members ?? [])]
        .sort((left, right) => {
          const adminEmployeeId = selectedWork.assignedTeam!.teamAdmin.id;
          const leftIsAdmin = left.employee.id === adminEmployeeId ? 0 : 1;
          const rightIsAdmin = right.employee.id === adminEmployeeId ? 0 : 1;
          if (leftIsAdmin !== rightIsAdmin) return leftIsAdmin - rightIsAdmin;
          return left.employee.empName.localeCompare(right.employee.empName);
        })
        .map((member) => ({
          key: `team:${member.employee.id}`,
          accountId: member.employee.account?.id ?? null,
          name: member.employee.empName,
          designation: member.employee.designation,
          isTeamAdmin: member.employee.id === selectedWork.assignedTeam!.teamAdmin.id,
          startedWork: Boolean(
            primaryAssignment?.startedAt &&
              member.employee.account?.id === primaryAssignment.assignee.id,
          ),
        }))
    : primaryAssignment
      ? [{
          key: `primary:${primaryAssignment.assignee.id}`,
          accountId: primaryAssignment.assignee.id,
          name: getAccountName(primaryAssignment.assignee),
          designation: primaryAssignment.assignee.employee?.designation ?? null,
          isTeamAdmin: false,
          startedWork: Boolean(primaryAssignment.startedAt),
        }]
      : [];
  const managementOtherPeople = (() => {
    if (!selectedWork) return [];
    const primaryAccountIds = new Set(
      managementPrimaryPeople
        .map((person) => person.accountId)
        .filter((accountId): accountId is string => Boolean(accountId)),
    );
    const people = new Map<
      string,
      {
        account: WorkItem["createdBy"];
        roles: string[];
        canRemoveSupport: boolean;
      }
    >();
    const addPerson = (
      personAccount: WorkItem["createdBy"],
      role: string,
      removableSupport = false,
    ) => {
      if (primaryAccountIds.has(personAccount.id)) return;
      const current = people.get(personAccount.id);
      if (current) {
        if (!current.roles.includes(role)) current.roles.push(role);
        current.canRemoveSupport ||= removableSupport;
        return;
      }
      people.set(personAccount.id, {
        account: personAccount,
        roles: [role],
        canRemoveSupport: removableSupport,
      });
    };

    if (selectedWork.salesMember) addPerson(selectedWork.salesMember, "Sales member");
    supportingAssignments.forEach((assignment) =>
      addPerson(assignment.assignee, "Supporting staff", true),
    );
    return [...people.values()].sort((left, right) =>
      getAccountName(left.account).localeCompare(getAccountName(right.account)),
    );
  })();
  const managementPeopleCount = (() => {
    const ids = new Set<string>();
    managementPrimaryPeople.forEach((person) => ids.add(person.accountId ?? person.key));
    managementOtherPeople.forEach((person) => ids.add(person.account.id));
    return ids.size;
  })();
  const assignedAccountIds =
    selectedWork?.assignments.map((assignment) => assignment.assignee.id) ?? [];
  const latestReport = selectedWork?.completionReports?.[0] ?? null;
  const selectedCompletionUsesOperationalPackage = Boolean(
    selectedWork && isOperationalCompletionType(selectedWork.type),
  );
  const selectedCompletionRequiresCustomerId = Boolean(
    selectedWork && completionRequiresCustomerId(selectedWork.type),
  );
  const selectedCompletionAllowsCustomerId = Boolean(
    selectedWork && completionAllowsCustomerId(selectedWork.type),
  );
  const selectedCompletionReference = selectedWork
    ? completionReference(selectedWork)
    : null;
  const reviewSalesBlocked = Boolean(
    actionMode === "REVIEW" &&
      selectedWork?.salesMemberAccountId &&
      selectedWork.salesCoordinationStatus !== "COMPLETED",
  );
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
  const unfinishedDelegatedTasks = selectedWork?.delegatedWork
    ? selectedWork.delegatedWork.total -
      selectedWork.delegatedWork.completed -
      selectedWork.delegatedWork.cancelled
    : 0;
  const canCompleteAssigned = Boolean(
    isPrimaryAssignee &&
      !selectedWorkIsArchived &&
      primaryAssignment?.startedAt &&
      selectedWork &&
      unfinishedDelegatedTasks === 0 &&
      (["IN_PROGRESS", "HELP_REQUESTED", "BLOCKED"].includes(
        selectedWork.status,
      ) ||
        (selectedWork.status === "COMPLETED_PENDING_REVIEW" &&
          informationWasRequested)),
  );
  const showDelegateWork = Boolean(
    filters.focus === "ASSIGNED_TO_ME" &&
      isPrimaryAssignee &&
      !selectedWorkIsArchived &&
      selectedWork &&
      account &&
      selectedWork.type === "ADMINISTRATIVE_TASK" &&
      !selectedWork.assignedTeam &&
      ["SENIOR_MANAGEMENT", "TEAM_MANAGER"].includes(account.role) &&
      !["COMPLETED_PENDING_REVIEW", "CLOSED", "CANCELLED"].includes(
        selectedWork.status,
      ),
  );
  const canDelegateWork = Boolean(
    showDelegateWork &&
      primaryAssignment?.startedAt &&
      selectedWork &&
      ["IN_PROGRESS", "HELP_REQUESTED", "BLOCKED"].includes(
        selectedWork.status,
      ),
  );
  const delegateButtonText = canDelegateWork
    ? "Delegate"
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
  const canReassignOrCancel = canManageAssignments && unfinishedDelegatedTasks === 0;
  const canChangeIndividualAssignments =
    canReassignOrCancel &&
    !selectedWork?.assignedTeam &&
    selectedWork?.type === "ADMINISTRATIVE_TASK";
  const hasActiveFilters = Boolean(
    filters.search ||
      filters.status ||
      filters.type ||
      filters.divisionId ||
      filters.departmentId ||
      filters.assigneeAccountId ||
      filters.assignedTeamId ||
      filters.salesMemberAccountId ||
      (filters.view === "HISTORY" &&
        (filters.historyFrom !== getDefaultHistoryFrom() ||
          filters.historyTo !== toDateInput(new Date()))),
  );
  // Role-specific tabs keep default work queues operational instead of organization-wide.
  const organizationScopeTitle =
    account?.role === "SUPER_ADMIN"
      ? "Branch work"
      : account?.role === "SENIOR_MANAGEMENT"
        ? "Division work"
        : "Department work";
  const organizationScopeNote =
    account?.role === "SUPER_ADMIN"
      ? "Open a division, department or team to view its work."
      : account?.role === "SENIOR_MANAGEMENT"
        ? "Open a department or team inside your division."
        : "Open a team inside your department.";
  const organizationDepartments = organizationSummary?.divisions.flatMap(
    (division) => division.departments,
  ) ?? [];
  const visibleDepartmentOptions = filters.divisionId
    ? options?.departments.filter(
        (department) => department.divisionId === filters.divisionId,
      ) ?? []
    : options?.departments ?? [];
  const visibleTeamOptions = filters.departmentId
    ? options?.teams.filter((team) => team.department.id === filters.departmentId) ?? []
    : filters.divisionId
      ? options?.teams.filter((team) =>
          organizationDepartments.some(
            (department) =>
              department.divisionId === filters.divisionId &&
              department.id === team.department.id,
          ),
        ) ?? []
      : options?.teams ?? [];

  function openOrganizationWork(
    divisionId?: string,
    departmentId?: string,
    assignedTeamId?: string,
  ): void {
    setWorkspaceMode("CURRENT");
    setFiltersExpanded(true);
    setSelectedId(null);
    setFilters((current) => ({
      ...current,
      view: "ACTIVE",
      focus: account?.role === "TEAM_MANAGER" ? "TEAM_QUEUE" : "EXPLORER",
      divisionId: divisionId ?? "",
      departmentId: departmentId ?? "",
      assignedTeamId: assignedTeamId ?? "",
      assigneeAccountId: "",
      salesMemberAccountId: "",
      page: 1,
    }));

    // The Work Management workspace owns the scroll container. Wait for the
    // filter/queue layout to commit, then take the user directly to the work
    // list they asked to view instead of leaving them at the organization tree.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById("management-work-queue")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
  }

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
    <main className={`management-page management-work-page${isDedicatedFormRoute ? " management-work-page--create" : ""}${isDedicatedEditRoute ? " management-work-page--edit" : ""}`}>
      {!isDedicatedFormRoute && (
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

        <section
          className="management-work-organization"
          aria-label={`${organizationScopeTitle} organization view`}
          aria-busy={organizationLoading}
        >
          <header className="management-work-organization__header">
            <div>
              <span>Work by organization</span>
              <h2>{organizationScopeTitle}</h2>
              <p>{organizationScopeNote}</p>
            </div>
            {organizationSummary && (
              <div className="management-work-organization__size" aria-label="Organization size">
                <span>{organizationSummary.organization.divisionCount} divisions</span>
                <span>{organizationSummary.organization.departmentCount} departments</span>
                <span>{organizationSummary.organization.teamCount} teams</span>
              </div>
            )}
          </header>

          {organizationError && (
            <div className="management-work-organization__error" role="status">
              Organization view is unavailable right now. Refresh to try again.
            </div>
          )}

          {organizationLoading && !organizationSummary ? (
            <div className="management-work-organization__loading">Loading organization work…</div>
          ) : organizationSummary ? (
            <>
              <div className="management-work-organization__metrics" aria-label="Work totals">
                {[
                  ["Active", organizationSummary.totals.active],
                  ["New", organizationSummary.totals.newWork],
                  ["In Progress", organizationSummary.totals.inProgress],
                  ["Waiting Sales", organizationSummary.totals.waitingForSales],
                  ["Waiting Approval", organizationSummary.totals.waitingForApproval],
                  ["Overdue", organizationSummary.totals.overdue],
                  ["Completed Today", organizationSummary.totals.completedToday],
                ].map(([label, value]) => (
                  <div key={label} className={`management-work-organization__metric${label === "Overdue" && Number(value) > 0 ? " is-alert" : ""}`}>
                    <strong>{value}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>

              <div className="management-work-organization__tree">
                {organizationSummary.divisions.length === 0 ? (
                  <p className="management-work-organization__empty">No active organization units are available.</p>
                ) : (
                  organizationSummary.divisions.map((division) => (
                    <details
                      key={division.id}
                      className="management-work-org-node management-work-org-node--division"
                      open={account?.role !== "SUPER_ADMIN" || organizationSummary.divisions.length === 1}
                    >
                      <summary>
                        <div>
                          <strong>{division.name}</strong>
                          <span>{division.departments.length} departments · {division.totals.active} active</span>
                        </div>
                        <span className="management-work-org-node__status">
                          {division.totals.overdue > 0 ? `${division.totals.overdue} overdue` : `${division.totals.inProgress} in progress`}
                        </span>
                      </summary>
                      <div className="management-work-org-node__body">
                        {account?.role === "SUPER_ADMIN" && (
                          <button
                            type="button"
                            className="management-work-org-node__view"
                            onClick={() => openOrganizationWork(division.id)}
                          >
                            View division work
                          </button>
                        )}

                        {division.departments.map((department) => (
                          <details
                            key={department.id}
                            className="management-work-org-node management-work-org-node--department"
                            open={account?.role === "TEAM_MANAGER" || division.departments.length === 1}
                          >
                            <summary>
                              <div>
                                <strong>{department.name}</strong>
                                <span>{department.teams.length} teams · {department.totals.active} active</span>
                              </div>
                              <span className="management-work-org-node__status">
                                {department.totals.waitingForSales > 0
                                  ? `${department.totals.waitingForSales} waiting Sales`
                                  : department.totals.overdue > 0
                                    ? `${department.totals.overdue} overdue`
                                    : `${department.totals.inProgress} in progress`}
                              </span>
                            </summary>
                            <div className="management-work-org-node__body">
                              {account?.role !== "TEAM_MANAGER" && (
                                <button
                                  type="button"
                                  className="management-work-org-node__view"
                                  onClick={() => openOrganizationWork(division.id, department.id)}
                                >
                                  View department work
                                </button>
                              )}

                              <div className="management-work-org-teams">
                                {department.teams.length === 0 ? (
                                  <span className="management-work-organization__empty">No active teams.</span>
                                ) : (
                                  department.teams.map((team) => (
                                    <article key={team.id} className="management-work-org-team">
                                      <div>
                                        <strong>{team.name}</strong>
                                        <span>{team.memberCount} members</span>
                                      </div>
                                      <div className="management-work-org-team__counts">
                                        <span>{team.totals.active} active</span>
                                        {team.totals.waitingForSales > 0 && <span>{team.totals.waitingForSales} waiting Sales</span>}
                                        {team.totals.waitingForApproval > 0 && <span>{team.totals.waitingForApproval} waiting approval</span>}
                                        {team.totals.overdue > 0 && <span className="is-alert">{team.totals.overdue} overdue</span>}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => openOrganizationWork(division.id, department.id, team.id)}
                                      >
                                        View work
                                      </button>
                                    </article>
                                  ))
                                )}
                              </div>
                            </div>
                          </details>
                        ))}
                      </div>
                    </details>
                  ))
                )}
              </div>
            </>
          ) : null}
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
                      {unfinishedDelegatedTasks > 0 && (
                        <small className="management-work__team-blocker">
                          {unfinishedDelegatedTasks} delegated task{unfinishedDelegatedTasks === 1 ? " is" : "s are"} still unfinished. Review or cancel them before finishing this task.
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
                      {showDelegateWork && (
                        <button
                          type="button"
                          className="is-secondary"
                          onClick={() => openDelegation()}
                          disabled={!canDelegateWork || actionBusy}
                          title={
                            canDelegateWork
                              ? "Delegate part of this Administrative Work to the next level."
                              : "Accept and start this Administrative Work before delegating it."
                          }
                        >
                          {delegateButtonText}
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
                      <button
                        type="button"
                        onClick={() => navigate(`/work-management/${selectedWork.id}/edit`)}
                      >
                        Update details
                      </button>
                      {canChangeIndividualAssignments && (
                        <button type="button" onClick={() => openAction("REASSIGN")}>
                          Reassign owner
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
                    {["NEW_CONNECTION", "UPDATE_SERVICES"].includes(selectedWork.type) && (
                      <article><span>Token number</span><strong>{selectedWork.requestNumber ?? "Not recorded"}</strong></article>
                    )}
                    {selectedWork.type === "NEW_CONNECTION" && (
                      <article><span>CPC Serial</span><strong>{selectedWork.cpcSerial ?? "Not recorded"}</strong></article>
                    )}
                    {!["MAINTENANCE", "NEW_CONNECTION"].includes(selectedWork.type) && (
                      <article><span>Service number</span><strong>{selectedWork.serviceNumber ?? "Not recorded"}</strong></article>
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
                  {selectedWork.type !== "ADMINISTRATIVE_TASK" && (
                    <article>
                      <span>Registered Date and Time</span>
                      <strong>AD: {formatKathmanduDateTime(selectedWork.registeredAt)}</strong>
                      <small>BS: {formatBikramSambatDateTime(selectedWork.registeredAt)}</small>
                    </article>
                  )}
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

                {(selectedWork.parentWorkItem || (selectedWork.delegatedWork?.total ?? 0) > 0) && (
                  <section className="management-work__team-tracking">
                    <header>
                      <div>
                        <span>Delegation progress</span>
                        <h3>Administrative delegation chain</h3>
                        <p>See how this Administrative Work moved down the management hierarchy while the upper owner remains accountable.</p>
                      </div>
                      {(selectedWork.delegatedWork?.total ?? 0) > 0 && (
                        <div className="management-work__team-score">
                          <strong>{selectedWork.delegatedWork!.completionPercentage}%</strong>
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
                        <span>Delegated from</span>
                        <strong>{selectedWork.parentWorkItem.title}</strong>
                        <small>Open the parent task</small>
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
                          <span>Delegated by</span>
                          <strong>{getAccountName(selectedWork.createdBy)}</strong>
                          <small>{formatDateTime(primaryAssignment.createdAt)}</small>
                        </div>
                        <div>
                          <span>Due</span>
                          <strong>{formatDateTime(selectedWork.dueAt)}</strong>
                          <small>{selectedWork.delegatedWork?.total ?? 0} delegated task{(selectedWork.delegatedWork?.total ?? 0) === 1 ? "" : "s"}</small>
                        </div>
                        <em className={`management-work__team-status ${selectedWorkIsOverdue ? "is-overdue" : `is-${selectedWork.status.toLowerCase()}`}`}>
                          {selectedWorkIsOverdue ? "Overdue" : formatLabel(selectedWork.status)}
                        </em>
                      </article>
                    )}

                    {(selectedWork.delegatedWork?.total ?? 0) > 0 && (
                      <>
                        <div className="management-work__team-stats">
                          <article><span>Delegated tasks</span><strong>{selectedWork.delegatedWork!.total}</strong></article>
                          <article><span>Completed</span><strong>{selectedWork.delegatedWork!.completed}</strong></article>
                          <article><span>In progress</span><strong>{selectedWork.delegatedWork!.inProgress}</strong></article>
                          <article><span>Waiting for review</span><strong>{selectedWork.delegatedWork!.awaitingReview}</strong></article>
                          <article><span>Overdue</span><strong>{selectedWork.delegatedWork!.overdue}</strong></article>
                        </div>
                        <div
                          className="management-work__team-progress"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={selectedWork.delegatedWork!.completionPercentage}
                        >
                          <span style={{ width: `${selectedWork.delegatedWork!.completionPercentage}%` }} />
                        </div>
                        <div className="management-work__team-list">
                          {selectedWork.delegatedWork!.members.map((member) => (
                            <button
                              key={member.id}
                              type="button"
                              style={{ marginLeft: `${Math.min(member.depth - 1, 4) * 20}px` }}
                              onClick={() => setSelectedId(member.id)}
                            >
                              <div>
                                <span>{member.depth === 1 ? "Delegated owner" : `Delegation level ${member.depth}`}</span>
                                <strong>{member.primaryAssignee ? getAccountName(member.primaryAssignee) : "Assignee unavailable"}</strong>
                                <small>{member.primaryAssignee?.employee?.designation ?? (member.primaryAssignee ? formatLabel(member.primaryAssignee.role) : "")}</small>
                                {member.instructions && <small title={member.instructions}>Task: {member.instructions}</small>}
                              </div>
                              <div>
                                <span>Delegated by</span>
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
                        {(selectedWork.delegatedWork!.notStarted > 0 || selectedWork.delegatedWork!.cancelled > 0) && (
                          <p className="management-work__team-note">
                            {selectedWork.delegatedWork!.notStarted} not started · {selectedWork.delegatedWork!.cancelled} cancelled
                          </p>
                        )}
                      </>
                    )}
                  </section>
                )}

                <section className="management-work__assignments management-work__people">
                  <header>
                    <div>
                      <span>People on this work</span>
                      <h3>{managementPeopleCount} {managementPeopleCount === 1 ? "person" : "people"}</h3>
                    </div>
                  </header>

                  <div className="management-work__people-group">
                    <div className="management-work__people-group-heading">
                      <div>
                        <span>{selectedWork.assignedTeam ? "Primary team" : "Primary worker"}</span>
                        <strong>{selectedWork.assignedTeam?.name ?? "Main responsibility"}</strong>
                      </div>
                      <small>{managementPrimaryPeople.length} {managementPrimaryPeople.length === 1 ? "person" : "members"}</small>
                    </div>
                    <div className="management-work__people-list">
                      {managementPrimaryPeople.map((person) => (
                        <article key={person.key}>
                          <span className="management-work__person-avatar" aria-hidden="true">
                            {person.name.charAt(0).toUpperCase()}
                          </span>
                          <div>
                            <strong>{person.name}</strong>
                            <small>{person.designation ?? "Employee"}</small>
                          </div>
                          <div className="management-work__person-badges">
                            {person.isTeamAdmin && <em>Team Admin</em>}
                            {person.startedWork && <em className="is-started">Started work</em>}
                            {!person.isTeamAdmin && !person.startedWork && <em>Team member</em>}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>

                  {managementOtherPeople.length > 0 && (
                    <div className="management-work__people-group">
                      <div className="management-work__people-group-heading">
                        <div>
                          <span>Other people</span>
                          <strong>Sales and support</strong>
                        </div>
                        <small>{managementOtherPeople.length} {managementOtherPeople.length === 1 ? "person" : "people"}</small>
                      </div>
                      <div className="management-work__people-list">
                        {managementOtherPeople.map(({ account: personAccount, roles, canRemoveSupport }) => (
                          <article key={personAccount.id}>
                            <span className="management-work__person-avatar" aria-hidden="true">
                              {getAccountName(personAccount).charAt(0).toUpperCase()}
                            </span>
                            <div>
                              <strong>{getAccountName(personAccount)}</strong>
                              <small>{personAccount.employee?.designation ?? formatLabel(personAccount.role)}</small>
                            </div>
                            <div className="management-work__person-badges">
                              {roles.map((role) => <em key={role}>{role}</em>)}
                            </div>
                            {canRemoveSupport && canManageAssignments && (
                              <button
                                type="button"
                                onClick={() => void removeSupport(personAccount.id)}
                                disabled={actionBusy}
                              >
                                Remove
                              </button>
                            )}
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
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
                <button type="button" className={filtersExpanded ? "is-active" : ""} onClick={() => setFiltersExpanded((current) => !current)}>
                  More Filters
                </button>
                <button
                  type="button"
                  className="management-work__clear-filters"
                  disabled={!hasActiveFilters}
                  onClick={() => setFilters((current) => ({
                    ...current, search: "", status: "", type: "", divisionId: "", departmentId: "", assigneeAccountId: "", assignedTeamId: "", salesMemberAccountId: "", historyFrom: getDefaultHistoryFrom(), historyTo: toDateInput(new Date()), page: 1,
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
                  {account?.role === "SUPER_ADMIN" && (
                    <select
                      value={filters.divisionId}
                      onChange={(event) => setFilters((current) => ({
                        ...current,
                        divisionId: event.target.value,
                        departmentId: "",
                        assigneeAccountId: "",
                        assignedTeamId: "",
                        salesMemberAccountId: "",
                        page: 1,
                      }))}
                      aria-label="Filter by division"
                    >
                      <option value="">All divisions</option>
                      {organizationSummary?.divisions.map((division) => (
                        <option key={division.id} value={division.id}>{division.name}</option>
                      ))}
                    </select>
                  )}
                  <select value={filters.departmentId} onChange={(event) => setFilters((current) => ({ ...current, departmentId: event.target.value, assigneeAccountId: "", assignedTeamId: "", salesMemberAccountId: "", page: 1 }))} aria-label="Filter by department">
                    <option value="">All departments</option>
                    {visibleDepartmentOptions.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                  </select>
                  <select value={filters.assigneeAccountId} onChange={(event) => setFilters((current) => ({ ...current, assigneeAccountId: event.target.value, page: 1 }))} aria-label="Filter by assigned staff member">
                    <option value="">All assigned staff</option>
                    {options?.data.map((candidate) => <option key={candidate.account.id} value={candidate.account.id}>{getCandidateName(candidate)}</option>)}
                  </select>
                  <select value={filters.assignedTeamId} onChange={(event) => setFilters((current) => ({ ...current, assignedTeamId: event.target.value, page: 1 }))} aria-label="Filter by assigned team">
                    <option value="">All assigned teams</option>
                    {visibleTeamOptions.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
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

            <section id="management-work-queue" className="management-work__overview">
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
                    const canDelegateFromCard = Boolean(
                      canOpenMyWorkFromCard &&
                        account &&
                        item.type === "ADMINISTRATIVE_TASK" &&
                        !item.assignedTeam &&
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
                              {item.parentWorkItemId && <span>Delegated from a parent task</span>}
                              {(item.delegationProgress?.total ?? 0) > 0 && <span>{item.delegationProgress!.total} delegated task{item.delegationProgress!.total === 1 ? "" : "s"} · {item.delegationProgress!.completionPercentage}% complete</span>}
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
                            {canDelegateFromCard && (
                              <button
                                type="button"
                                className="management-work-ticket-card__work"
                                disabled={openingDelegationId !== null}
                                onClick={() => void openQueueDelegation(item)}
                              >
                                {openingDelegationId === item.id
                                  ? "Opening..."
                                  : "Delegate"}
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

      {(isDedicatedEditRoute || actionMode) &&
        !(actionMode === "CREATE" && !createForm.parentWorkItemId && !isDedicatedCreateRoute) && (
        <div
          className={
            isDedicatedEditRoute ||
            (isDedicatedCreateRoute && actionMode === "CREATE" && !createForm.parentWorkItemId)
              ? "management-work-create-shell management-work-edit-shell"
              : "management-work-dialog"
          }
          role="presentation"
        >
          <section
            role={isDedicatedFormRoute ? "region" : "dialog"}
            aria-modal={isDedicatedFormRoute ? undefined : true}
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
                    {isDedicatedEditRoute
                      ? "Edit Work"
                      : actionMode === "CREATE"
                        ? createForm.parentWorkItemId
                          ? "Delegate Work"
                          : "Create Work"
                        : actionMode === "RETENTION_HOLD"
                          ? "Place Retention Hold"
                          : actionMode === "DELETION_REQUEST"
                            ? "Request Deletion Review"
                            : actionMode === "COMPLETE"
                              ? "Finish Work"
                              : actionMode === "HELP"
                                ? "Request Work Help"
                                : actionMode === "REVIEW"
                                  ? "Approve Work"
                                  : actionMode
                                    ? formatLabel(actionMode)
                                    : "Work management"}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={
                  isDedicatedEditRoute
                    ? () => navigate("/work-management")
                    : isDedicatedCreateRoute
                      ? leaveCreateWizard
                      : () => setActionMode(null)
                }
                aria-label={isDedicatedFormRoute ? "Return to Work Management" : "Close dialog"}
              >
                {isDedicatedFormRoute ? "←" : "×"}
              </button>
            </header>

            {isDedicatedCreateRoute && actionMode === "CREATE" && !createForm.parentWorkItemId && (
              <nav className="management-work-wizard__steps" aria-label="Create Work progress">
                {[
                  { step: 1 as const, label: "Work details" },
                  { step: 2 as const, label: "Assign & schedule" },
                  { step: 3 as const, label: "Review" },
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
                  <em>Waiting for approval</em>
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
                    <span>Work result</span>
                    <strong>{formatCompletionResult(latestReport.result)}</strong>
                  </article>
                </div>

                {selectedCompletionUsesOperationalPackage && (
                  <section className="management-work-review-summary__package" aria-label="Operational completion details">
                    <div className="management-work-review-summary__section-title">
                      <div>
                        <span>Completion details</span>
                        <strong>Field completion information</strong>
                      </div>
                      <small>Check these before approving.</small>
                    </div>
                    <div className="management-work-review-summary__details">
                      {[
                        ...(selectedCompletionReference
                          ? [[selectedCompletionReference.label, selectedCompletionReference.value]]
                          : []),
                        ...(selectedWork.type === "NEW_CONNECTION"
                          ? [["CPC Serial", latestReport.cpcSerial ?? selectedWork.cpcSerial]]
                          : []),
                        ...((selectedCompletionRequiresCustomerId || latestReport.customerId)
                          ? [["Customer ID", latestReport.customerId]]
                          : []),
                        ["RX Level", latestReport.rxLevelDbm == null ? null : `${latestReport.rxLevelDbm} dBm`],
                        ["OLT", latestReport.olt],
                        ["FDC", latestReport.fdcName],
                        ["FAP", latestReport.fapName],
                      ].map(([label, value]) => (
                        <article key={String(label)} className={!value ? "is-missing" : undefined}>
                          <span>{label}</span>
                          <strong>{value || "Not provided"}</strong>
                        </article>
                      ))}
                    </div>
                  </section>
                )}

                {selectedWork.salesMember && (
                  <section
                    className={`management-work-review-summary__sales ${
                      selectedWork.salesCoordinationStatus === "COMPLETED" ? "is-complete" : "is-waiting"
                    }`}
                    aria-label="Sales status"
                  >
                    <div>
                      <span>Sales</span>
                      <strong>{getAccountName(selectedWork.salesMember)}</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong>
                        {selectedWork.salesCoordinationStatus === "COMPLETED"
                          ? "Sales Work Done"
                          : "Waiting for Sales"}
                      </strong>
                    </div>
                    {selectedWork.salesCompletedAt && (
                      <div>
                        <span>Finished</span>
                        <strong>{formatDateTime(selectedWork.salesCompletedAt)}</strong>
                      </div>
                    )}
                  </section>
                )}

                {reviewSalesBlocked && (
                  <div className="management-work-review-summary__warning" role="status">
                    Sales work is not finished yet. You can return this work for correction, but you cannot approve it yet.
                  </div>
                )}

                <div className="management-work-review-summary__note">
                  <span>Worker note</span>
                  <p>{latestReport.summary}</p>
                </div>
                {latestReport.moreWorkRequired && (
                  <div className="management-work-review-summary__warning" role="status">
                    The worker marked that more work is needed. Check the note before approving.
                  </div>
                )}
              </section>
            )}

            {actionMode === "CREATE" ? (
              createForm.parentWorkItemId ? (
                <form onSubmit={submitCreate} className="management-work-form management-work-form--delegated">
                  {selectedWork && (
                    <div className="management-work-form__parent is-wide">
                      <span>Main task</span>
                      <strong>{selectedWork.title}</strong>
                      <small>You remain accountable for this Administrative Work. The delegated owner completes the assigned part and reports back through the management chain.</small>
                    </div>
                  )}
                  <div className="management-work-form__section-heading is-wide">
                    <span>Delegation instructions</span>
                    <p>Explain exactly what the lower-level owner must complete before reporting back.</p>
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
                      value={createForm.delegationInstructions}
                      onChange={(event) => setCreateForm((current) => ({ ...current, delegationInstructions: event.target.value }))}
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
                      Delegate to <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span>
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
                      <option value="">Select individual</option>
                      {availableAssignmentCandidates.map((candidate) => (
                        <option key={candidate.account.id} value={candidate.account.id}>
                          {getCandidateName(candidate)} · {formatLabel(candidate.account.role)} · {formatLabel(candidate.workload.level)} workload
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedCandidate && (
                    <div className={`management-workload management-workload--${selectedCandidate.workload.level.toLowerCase()} is-wide`}>
                      <strong>{formatLabel(selectedCandidate.workload.level)} workload</strong>
                      <span>{selectedCandidate.workload.active} active · {selectedCandidate.workload.waitingForReview} waiting review · {selectedCandidate.workload.overdue} overdue</span>
                    </div>
                  )}
                  <footer className="is-wide">
                    <button type="button" onClick={() => setActionMode(null)}>Cancel</button>
                    <button type="submit" disabled={actionBusy}>{actionBusy ? "Delegating..." : "Delegate Work"}</button>
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
                    <section className="management-work-wizard__panel management-work-wizard__panel--details" aria-labelledby="create-work-step-1-title">
                      <header className="management-work-wizard__panel-header">
                        <div>
                          <h3 id="create-work-step-1-title" tabIndex={-1}>Work details</h3>
                          <p>Enter only the information needed to create this work.</p>
                        </div>
                      </header>

                      <div className="management-work-create-section management-work-create-section--type">
                        <div className="management-work-create-section__heading">
                          <div>
                            <h4>Work type</h4>
                            <p>Sets the fields and assignment rules.</p>
                          </div>
                        </div>
                        <div className="management-work-wizard__grid management-work-wizard__grid--single">
                          <label className="is-wide">
                            <span className="management-work-form__label-text">
                              Type <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span>
                            </span>
                            <select
                              id="create-work-type"
                              required
                              value={createForm.type}
                              onChange={(event) =>
                                setCreateForm((current) => ({
                                  ...current,
                                  type: event.target.value as WorkItemType,
                                  requestNumber: [
                                    "NEW_CONNECTION",
                                    "UPDATE_SERVICES",
                                  ].includes(event.target.value)
                                    ? current.requestNumber
                                    : "",
                                  cpcSerial:
                                    event.target.value === "NEW_CONNECTION"
                                      ? current.cpcSerial
                                      : "",
                                  serviceNumber:
                                    ["MAINTENANCE", "NEW_CONNECTION"].includes(event.target.value)
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
                                  registeredAt:
                                    event.target.value === "ADMINISTRATIVE_TASK"
                                      ? ""
                                      : current.registeredAt,
                                  assignmentMode:
                                    event.target.value === "ADMINISTRATIVE_TASK"
                                      ? current.assignmentMode
                                      : "TEAM",
                                  administrativeRecipientRole:
                                    event.target.value === "ADMINISTRATIVE_TASK" &&
                                    current.assignmentMode === "INDIVIDUAL"
                                      ? current.administrativeRecipientRole
                                      : "",
                                  assignedDivisionId: "",
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
                        </div>
                      </div>

                      {isAdministrativeWork ? (
                        <div className="management-work-create-section">
                          <div className="management-work-create-section__heading">
                            <div>
                              <h4>Task details</h4>
                              <p>Describe the administrative work clearly.</p>
                            </div>
                          </div>
                          <div className="management-work-wizard__grid">
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
                                rows={5}
                                value={createForm.description}
                                onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
                                placeholder="Explain the work, expected result and important instructions."
                              />
                            </label>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="management-work-create-section">
                            <div className="management-work-create-section__heading">
                              <div>
                                <h4>Customer</h4>
                                <p>Customer and contact information.</p>
                              </div>
                            </div>
                            <div className="management-work-wizard__grid">
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
                                  placeholder="Customer name"
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
                                  placeholder={createForm.customerContactType === "MOBILE" ? "98XXXXXXXX" : "01-XXXXXXX"}
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
                                  placeholder="Area or address"
                                  value={createForm.locationText}
                                  onChange={(event) => setCreateForm((current) => ({ ...current, locationText: event.target.value }))}
                                />
                              </label>
                            </div>
                          </div>

                          <div className="management-work-create-section">
                            <div className="management-work-create-section__heading">
                              <div>
                                <h4>Service & network</h4>
                                <p>Service reference and network connection details.</p>
                              </div>
                            </div>
                            <div className="management-work-wizard__grid">
                              {createRequiresRequestNumber && (
                                <label>
                                  <span className="management-work-form__label-text">
                                    Token number <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span>
                                  </span>
                                  <input
                                    id="create-work-request-number"
                                    required
                                    maxLength={100}
                                    placeholder="Token or request number"
                                    value={createForm.requestNumber}
                                    onChange={(event) => setCreateForm((current) => ({ ...current, requestNumber: event.target.value }))}
                                  />
                                </label>
                              )}
                              {createRequiresCpcSerial && (
                                <label>
                                  <span className="management-work-form__label-text">
                                    CPC Serial <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span>
                                  </span>
                                  <input
                                    id="create-work-cpc-serial"
                                    required
                                    maxLength={100}
                                    placeholder="CPC serial"
                                    value={createForm.cpcSerial}
                                    onChange={(event) => setCreateForm((current) => ({ ...current, cpcSerial: event.target.value }))}
                                  />
                                </label>
                              )}
                              {createRequiresServiceNumber && (
                                <label>
                                  <span className="management-work-form__label-text">
                                    {createForm.type === "UPDATE_SERVICES" ? "Existing service number" : "Service number"} <span className="management-work-form__required" aria-hidden="true">*</span><span className="sr-only"> required</span>
                                  </span>
                                  <input
                                    id="create-work-service-number"
                                    required
                                    maxLength={100}
                                    placeholder={createForm.type === "UPDATE_SERVICES" ? "Existing service number" : "Service number"}
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
                            </div>
                          </div>
                        </>
                      )}
                    </section>
                  )}

                  {createStep === 2 && (
                    <section className="management-work-wizard__panel management-work-wizard__panel--assignment" aria-labelledby="create-work-step-2-title">
                      <header className="management-work-wizard__panel-header">
                        <div>
                          <h3 id="create-work-step-2-title" tabIndex={-1}>Assignment & schedule</h3>
                          <p>Choose who owns the work, who coordinates, and when it is due.</p>
                        </div>
                      </header>

                      <div className="management-work-wizard__assignment-layout">
                        <div className="management-work-wizard__group management-work-wizard__group--responsibility">
                          <div className="management-work-wizard__group-heading">
                            <div>
                              <h4>Main assignment</h4>
                              <p>Primary responsibility for completing this work.</p>
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
                                          administrativeRecipientRole: "",
                                          assignedDepartmentId: "",
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
                                      value="INDIVIDUAL"
                                      checked={createForm.assignmentMode === "INDIVIDUAL"}
                                      onChange={() =>
                                        setCreateForm((current) => ({
                                          ...current,
                                          assignmentMode: "INDIVIDUAL",
                                          administrativeRecipientRole:
                                            account?.role === "SUPER_ADMIN"
                                              ? "SENIOR_MANAGEMENT"
                                              : account?.role === "SENIOR_MANAGEMENT"
                                                ? "TEAM_MANAGER"
                                                : "EMPLOYEE",
                                          assignedDepartmentId:
                                            account?.role === "TEAM_MANAGER"
                                              ? options?.scope.departmentId ?? ""
                                              : "",
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
                                    <span>Individual</span>
                                  </label>
                                </div>
                              </fieldset>
                            )}

                            {account?.role === "SUPER_ADMIN" && (
                              <SearchableSelect
                                id="create-work-assigned-division"
                                label="Assigned division"
                                value={createForm.assignedDivisionId}
                                options={assignedDivisionOptions}
                                placeholder="Select responsible division"
                                required
                                description={
                                  createForm.assignedDivisionId
                                    ? undefined
                                    : `${availableDivisions.length} active division${availableDivisions.length === 1 ? "" : "s"} available`
                                }
                                onChange={(assignedDivisionId) =>
                                  setCreateForm((current) => ({
                                    ...current,
                                    assignedDivisionId,
                                    assignedDepartmentId: "",
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
                            )}

                            {administrativeIndividualAssignment && (
                              <SearchableSelect
                                id="create-work-recipient-level"
                                label="Recipient level"
                                value={createForm.administrativeRecipientRole}
                                options={administrativeRecipientRoleOptions}
                                placeholder="Select management level"
                                required
                                description={
                                  account?.role === "SUPER_ADMIN"
                                    ? "Super Admin may assign to Senior Management or directly to a Team Manager."
                                    : account?.role === "SENIOR_MANAGEMENT"
                                      ? "Administrative work moves down to a Team Manager."
                                      : "Administrative work moves down to an Employee in your department."
                                }
                                onChange={(value) =>
                                  setCreateForm((current) => ({
                                    ...current,
                                    administrativeRecipientRole: value as "SENIOR_MANAGEMENT" | "TEAM_MANAGER" | "EMPLOYEE",
                                    assignedDepartmentId:
                                      account?.role === "TEAM_MANAGER" && value === "EMPLOYEE"
                                        ? options?.scope.departmentId ?? ""
                                        : "",
                                    primaryAssigneeAccountId: "",
                                    supportingDepartmentId: "",
                                    supportingAssigneeAccountIds: [],
                                    responsibleManagerAccountId: "",
                                  }))
                                }
                              />
                            )}

                            {(!administrativeIndividualAssignment ||
                              createForm.administrativeRecipientRole !== "SENIOR_MANAGEMENT") && (
                              <SearchableSelect
                                id="create-work-assigned-department"
                                label="Assigned department"
                                value={createForm.assignedDepartmentId}
                                options={assignedDepartmentOptions}
                                placeholder={
                                  account?.role === "SUPER_ADMIN" && !createForm.assignedDivisionId
                                    ? "Select division first"
                                    : "Select responsible department"
                                }
                                required
                                description={
                                  account?.role === "SUPER_ADMIN" && !createForm.assignedDivisionId
                                    ? "Choose a division to load its departments."
                                    : administrativeIndividualAssignment && account?.role === "TEAM_MANAGER"
                                      ? "Administrative delegation stays inside your own department."
                                      : undefined
                                }
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
                            )}

                            {administrativeIndividualAssignment ? (
                              ((createForm.administrativeRecipientRole === "SENIOR_MANAGEMENT" &&
                                (account?.role !== "SUPER_ADMIN" || createForm.assignedDivisionId)) ||
                                (createForm.administrativeRecipientRole !== "SENIOR_MANAGEMENT" &&
                                  createForm.assignedDepartmentId)) && (
                                <SearchableSelect
                                  key={`individual-${createForm.administrativeRecipientRole}-${createForm.assignedDivisionId}-${createForm.assignedDepartmentId}`}
                                  id="create-work-primary-assignee"
                                  label="Assigned individual"
                                  value={createForm.primaryAssigneeAccountId}
                                  options={assignedIndividualOptions}
                                  placeholder={`Select ${formatLabel(createForm.administrativeRecipientRole || "individual")}`}
                                  required
                                  description={
                                    createForm.primaryAssigneeAccountId
                                      ? "The assigning manager remains the responsible reviewer."
                                      : `${availableAssignmentCandidates.length} eligible ${availableAssignmentCandidates.length === 1 ? "person" : "people"}`
                                  }
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
                              )
                            ) : (
                              createForm.assignedDepartmentId && (
                                <SearchableSelect
                                  key={`team-${createForm.assignedDepartmentId}`}
                                  id="create-work-assigned-team"
                                  label="Assigned team"
                                  value={createForm.assignedTeamId}
                                  options={assignedTeamOptions}
                                  placeholder="Select team"
                                  required
                                  description={createForm.assignedTeamId ? undefined : `${availableTeams.length} active team${availableTeams.length === 1 ? "" : "s"} available`}
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

                            {selectedCandidate && (selectedCandidate.workload.level !== "AVAILABLE" || selectedCandidate.workload.active > 0 || selectedCandidate.workload.overdue > 0) && (
                              <div className={`management-workload management-workload--${selectedCandidate.workload.level.toLowerCase()} is-wide`}>
                                <strong>{getCandidateName(selectedCandidate)} · {formatLabel(selectedCandidate.workload.level)} workload</strong>
                                <span>{selectedCandidate.workload.active} active · {selectedCandidate.workload.waitingForReview} waiting review · {selectedCandidate.workload.overdue} overdue</span>
                              </div>
                            )}
                            {selectedTeam && (selectedTeam.workload.level !== "AVAILABLE" || selectedTeam.workload.active > 0 || selectedTeam.workload.overdue > 0) && (
                              <div className={`management-workload management-workload--${selectedTeam.workload.level.toLowerCase()} is-wide`}>
                                <strong>{selectedTeam.name} · {formatLabel(selectedTeam.workload.level)} workload</strong>
                                <span>Admin: {selectedTeam.admin.name} · {selectedTeam.memberCount} members · {selectedTeam.workload.active} active · {selectedTeam.workload.overdue} overdue</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {targetWorkDivisionId && createAllowsSalesMember && (
                          <div className="management-work-wizard__group management-work-wizard__group--participants">
                            <div className="management-work-wizard__group-heading">
                              <div>
                                <h4>Sales coordination</h4>
                                <p>Required for this work type.</p>
                              </div>
                            </div>
                            <div className="management-work-wizard__grid">
                              <SearchableSelect
                                id="create-work-sales-department"
                                label="Sales department"
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
                                  label="Sales member"
                                  value={createForm.salesMemberAccountId}
                                  options={salesMemberOptions}
                                  placeholder="Select sales member"
                                  required
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
                              {selectedSalesMember && (selectedSalesMember.workload.level !== "AVAILABLE" || selectedSalesMember.workload.active > 0 || selectedSalesMember.workload.overdue > 0) && (
                                <div className={`management-workload management-workload--${selectedSalesMember.workload.level.toLowerCase()} is-wide`}>
                                  <strong>Sales: {getCandidateName(selectedSalesMember)}</strong>
                                  <span>{selectedSalesMember.workload.active} active · {selectedSalesMember.workload.overdue} overdue</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {targetWorkDivisionId && (
                        <details className="management-work-form__support-panel management-work-form__support-panel--standalone">
                          <summary>
                            <span>
                              <strong>Supporting staff</strong>
                              <small>Optional help from one department</small>
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
                              label="Supporting department"
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
                                {availableSupportMembers.length > 10 && (
                                  <input
                                    id="create-work-support-search"
                                    type="search"
                                    value={supportMemberSearch}
                                    onChange={(event) => setSupportMemberSearch(event.target.value)}
                                    placeholder="Search supporting members"
                                    aria-label="Search supporting members"
                                    autoComplete="off"
                                  />
                                )}
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
                      )}

                      <div className="management-work-wizard__group management-work-wizard__group--schedule">
                        <div className="management-work-wizard__group-heading management-work-wizard__group-heading--schedule">
                          <div>
                            <h4>Schedule</h4>
                            <p>
                              {isAdministrativeWork
                                ? "Planned start and due time."
                                : "Registered, planned start and due time."}
                            </p>
                          </div>
                          <div
                            className="management-work-calendar-switch"
                            role="group"
                            aria-label="Schedule calendar system"
                          >
                            <span>Calendar</span>
                            <div>
                              <button
                                type="button"
                                className={createCalendarMode === "AD" ? "is-active" : ""}
                                aria-pressed={createCalendarMode === "AD"}
                                onClick={() => setCreateCalendarMode("AD")}
                              >
                                AD
                              </button>
                              <button
                                type="button"
                                className={createCalendarMode === "BS" ? "is-active" : ""}
                                aria-pressed={createCalendarMode === "BS"}
                                onClick={() => setCreateCalendarMode("BS")}
                              >
                                BS
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="management-work-form__schedule-grid">
                          {!isAdministrativeWork && (
                            <DualCalendarDateTimeInput
                              id="create-work-registered-at"
                              label="Registered"
                              value={createForm.registeredAt}
                              required
                              mode={createCalendarMode}
                              showAlternate={false}
                              max={new Date().toISOString()}
                              onChange={(registeredAt) =>
                                setCreateForm((current) => ({ ...current, registeredAt }))
                              }
                            />
                          )}
                          <DualCalendarDateTimeInput
                            id="create-work-planned-start"
                            label="Planned start"
                            value={createForm.plannedStartAt}
                            required
                            mode={createCalendarMode}
                            showAlternate={false}
                            min={isAdministrativeWork ? undefined : createForm.registeredAt}
                            onChange={(plannedStartAt) =>
                              setCreateForm((current) => ({ ...current, plannedStartAt }))
                            }
                          />
                          <DualCalendarDateTimeInput
                            id="create-work-due-at"
                            label="Due"
                            value={createForm.dueAt}
                            required
                            mode={createCalendarMode}
                            showAlternate={false}
                            min={createForm.plannedStartAt}
                            onChange={(dueAt) =>
                              setCreateForm((current) => ({ ...current, dueAt }))
                            }
                          />
                        </div>
                      </div>

                      <details className="management-work-form__more-options">
                        <summary>
                          <span>Additional options</span>
                          <small>{administrativeIndividualAssignment ? "Repeat creation" : "Reviewer and repeat creation"}</small>
                        </summary>
                        <div className="management-work-form__more-options-body">
                          {!administrativeIndividualAssignment && (
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
                          )}
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
                          <h3 id="create-work-step-3-title" tabIndex={-1}>Review &amp; assign</h3>
                          <p>Check the final details, then assign the work.</p>
                        </div>
                      </header>

                      <div className="management-work-review-overview" aria-label="Assignment summary">
                        <span className="management-work-review-overview__status" aria-hidden="true">✓</span>
                        <div className="management-work-review-overview__copy">
                          <span>Ready for assignment</span>
                          <strong>{WORK_TYPES.find((type) => type.value === createForm.type)?.label ?? formatLabel(createForm.type)}</strong>
                          <p>{isAdministrativeWork ? createForm.title : `${createForm.customerName} · ${createForm.locationText}`}</p>
                        </div>
                        <div className="management-work-review-overview__meta">
                          <div>
                            <span>{selectedTeam ? "Assigned team" : "Assigned individual"}</span>
                            <strong>{selectedTeam?.name ?? (selectedCandidate ? getCandidateName(selectedCandidate) : "—")}</strong>
                          </div>
                          <div>
                            <span>Due</span>
                            <strong>{formatDateTime(createForm.dueAt)}</strong>
                          </div>
                        </div>
                      </div>

                      <div className="management-work-review-grid">
                        <article className="management-work-review-card management-work-review-card--details">
                          <header>
                            <div>
                              <span>Work details</span>
                              <strong>{WORK_TYPES.find((type) => type.value === createForm.type)?.label ?? formatLabel(createForm.type)}</strong>
                            </div>
                            <button
                              type="button"
                              aria-label="Edit work details"
                              onClick={() => {
                                setCreateStep(1);
                                scrollCreateStepIntoView(1);
                              }}
                            >
                              Edit
                            </button>
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
                                <div><dt>Contact</dt><dd>{formatLabel(createForm.customerContactType)} · {createForm.customerContactNumber}</dd></div>
                                <div><dt>Location</dt><dd>{createForm.locationText}</dd></div>
                                {createRequiresRequestNumber && (
                                  <div><dt>Token</dt><dd>{createForm.requestNumber}</dd></div>
                                )}
                                {createRequiresCpcSerial && (
                                  <div><dt>CPC Serial</dt><dd>{createForm.cpcSerial}</dd></div>
                                )}
                                {createRequiresServiceNumber && (
                                  <div><dt>{createForm.type === "UPDATE_SERVICES" ? "Existing service number" : "Service number"}</dt><dd>{createForm.serviceNumber}</dd></div>
                                )}
                                <div><dt>OLT</dt><dd>{createForm.olt}</dd></div>
                                <div><dt>FDC / FAP</dt><dd>{createForm.fdcName} / {createForm.fapName}</dd></div>
                                {createRequiresServices && (
                                  <div className="is-wide management-work-review-card__services">
                                    <dt>Services</dt>
                                    <dd>
                                      {createForm.serviceTypes.map((value) => (
                                        <span key={value}>
                                          {value === "OTHER" && createForm.otherServiceText
                                            ? `Other · ${createForm.otherServiceText}`
                                            : SERVICE_TYPES.find((service) => service.value === value)?.label ?? formatLabel(value)}
                                        </span>
                                      ))}
                                    </dd>
                                  </div>
                                )}
                              </>
                            )}
                          </dl>
                        </article>

                        <article className="management-work-review-card management-work-review-card--responsibility">
                          <header>
                            <div>
                              <span>Assignment</span>
                              <strong>{selectedTeam?.name ?? (selectedCandidate ? getCandidateName(selectedCandidate) : "Not selected")}</strong>
                            </div>
                            <button
                              type="button"
                              aria-label="Edit assignment"
                              onClick={() => {
                                setCreateStep(2);
                                scrollCreateStepIntoView(2);
                              }}
                            >
                              Edit
                            </button>
                          </header>
                          <dl>
                            <div><dt>Division</dt><dd>{selectedAssignedDepartment?.division.name ?? selectedCandidate?.division?.name ?? "—"}</dd></div>
                            <div><dt>Department</dt><dd>{administrativeIndividualAssignment && createForm.administrativeRecipientRole === "SENIOR_MANAGEMENT" ? "Division-level" : selectedAssignedDepartment?.name ?? selectedCandidate?.department?.name ?? "—"}</dd></div>
                            <div>
                              <dt>Reviewer</dt>
                              <dd>
                                {selectedResponsibleManager
                                  ? `${getAccountName(selectedResponsibleManager.account)} · ${formatLabel(selectedResponsibleManager.account.role)}`
                                  : `${account?.displayName ?? account?.username ?? "Current account"} · ${account ? formatLabel(account.role) : "Manager"}`}
                              </dd>
                            </div>
                            <div className="is-wide">
                              <dt>Main owner</dt>
                              <dd>{selectedTeam ? `${selectedTeam.name} · Admin ${selectedTeam.admin.name}` : selectedCandidate ? `${getCandidateName(selectedCandidate)} · ${formatLabel(selectedCandidate.account.role)}` : "—"}</dd>
                            </div>
                            {createAllowsSalesMember && (
                              <div className="is-wide">
                                <dt>Sales coordination</dt>
                                <dd>{selectedSalesDepartment?.name ?? "—"} · {selectedSalesMember ? getCandidateName(selectedSalesMember) : "—"}</dd>
                              </div>
                            )}
                            {selectedSupportingMembers.length > 0 && (
                              <div className="is-wide">
                                <dt>Supporting staff</dt>
                                <dd>{selectedSupportingDepartment?.name ? `${selectedSupportingDepartment.name} · ` : ""}{selectedSupportingMembers.map(getCandidateName).join(", ")}</dd>
                              </div>
                            )}
                          </dl>
                        </article>

                        <article className="management-work-review-card management-work-review-card--schedule">
                          <header>
                            <div>
                              <span>Schedule</span>
                              <strong>
                                {isAdministrativeWork
                                  ? "Planned schedule and completion deadline"
                                  : "Registration to completion deadline"}
                              </strong>
                            </div>
                            <button
                              type="button"
                              aria-label="Edit schedule"
                              onClick={() => {
                                setCreateStep(2);
                                scrollCreateStepIntoView(2);
                              }}
                            >
                              Edit
                            </button>
                          </header>
                          <ol className="management-work-review-timeline">
                            {!isAdministrativeWork && (
                              <li>
                                <span className="management-work-review-timeline__marker" aria-hidden="true">1</span>
                                <div>
                                  <span>Registered</span>
                                  <strong>{formatDateTime(createForm.registeredAt)}</strong>
                                  <small>{formatBikramSambatDateTime(createForm.registeredAt)}</small>
                                </div>
                              </li>
                            )}
                            <li>
                              <span className="management-work-review-timeline__marker" aria-hidden="true">{isAdministrativeWork ? 1 : 2}</span>
                              <div>
                                <span>Planned start</span>
                                <strong>{formatDateTime(createForm.plannedStartAt)}</strong>
                                <small>{formatBikramSambatDateTime(createForm.plannedStartAt)}</small>
                              </div>
                            </li>
                            <li className="is-due">
                              <span className="management-work-review-timeline__marker" aria-hidden="true">{isAdministrativeWork ? 2 : 3}</span>
                              <div>
                                <span>Due</span>
                                <strong>{formatDateTime(createForm.dueAt)}</strong>
                                <small>{formatBikramSambatDateTime(createForm.dueAt)}</small>
                              </div>
                            </li>
                          </ol>
                        </article>
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
                            const previousStep: CreateWizardStep = createStep === 3 ? 2 : 1;
                            setActionError("");
                            setCreateStep(previousStep);
                            scrollCreateStepIntoView(previousStep);
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
                        <button
                          type="submit"
                          className="is-primary"
                          disabled={actionBusy || !createReviewSubmitReady}
                          aria-busy={actionBusy}
                        >
                          {actionBusy ? "Assigning..." : "Assign Work"}
                        </button>
                      )}
                    </div>
                  </footer>
                </form>
              )
            ) : isDedicatedEditRoute ? (
              selectedWork ? (
                <form onSubmit={submitDedicatedEditWork} className="management-work-edit-form">
                  <header className="management-work-edit-form__intro">
                    <div>
                      <span>{selectedWork.ticketNumber}</span>
                      <h3>{formatLabel(selectedWork.type)}</h3>
                      <p>Update the work details that can still be changed.</p>
                    </div>
                    <strong>{formatLabel(selectedWork.status)}</strong>
                  </header>

                  <section className="management-work-edit-section management-work-edit-section--reference">
                    <header>
                      <div>
                        <h3>Work information</h3>
                        <p>Check the job before making changes.</p>
                      </div>
                    </header>
                    <dl className="management-work-edit-summary">
                      <div><dt>Work type</dt><dd>{formatLabel(selectedWork.type)}</dd></div>
                      {selectedWork.customerName && <div><dt>Customer</dt><dd>{selectedWork.customerName}</dd></div>}
                      {selectedWork.customerContactNumber && <div><dt>Contact</dt><dd>{selectedWork.customerContactNumber}</dd></div>}
                      {selectedWork.requestNumber && <div><dt>Token number</dt><dd>{selectedWork.requestNumber}</dd></div>}
                      {selectedWork.cpcSerial && <div><dt>CPC Serial</dt><dd>{selectedWork.cpcSerial}</dd></div>}
                      {selectedWork.type !== "NEW_CONNECTION" && selectedWork.serviceNumber && (
                        <div><dt>Service number</dt><dd>{selectedWork.serviceNumber}</dd></div>
                      )}
                      {selectedWork.olt && <div><dt>OLT</dt><dd>{selectedWork.olt}</dd></div>}
                      {selectedWork.fdcName && <div><dt>FDC</dt><dd>{selectedWork.fdcName}</dd></div>}
                      {selectedWork.fapName && <div><dt>FAP</dt><dd>{selectedWork.fapName}</dd></div>}
                      {selectedWork.serviceTypes.length > 0 && (
                        <div className="is-wide"><dt>Services</dt><dd>{selectedWork.serviceTypes.map(formatLabel).join(", ")}</dd></div>
                      )}
                    </dl>
                  </section>

                  <section className="management-work-edit-section">
                    <header>
                      <div>
                        <h3>Details</h3>
                        <p>Keep the schedule and location up to date.</p>
                      </div>
                    </header>
                    <div className="management-work-edit-fields">
                      <label>
                        Location
                        <input
                          value={actionForm.locationText}
                          onChange={(event) => setActionForm((current) => ({ ...current, locationText: event.target.value }))}
                        />
                      </label>
                    </div>
                  </section>

                  <section className="management-work-wizard__group management-work-wizard__group--schedule management-work-edit-section--schedule">
                    <div className="management-work-wizard__group-heading management-work-wizard__group-heading--schedule">
                      <div>
                        <h4>Schedule</h4>
                        <p>
                          {selectedWork.type === "ADMINISTRATIVE_TASK"
                            ? "Update planned start and due time."
                            : "Update registration, planned start and due time."}
                        </p>
                      </div>
                      <div className="management-work-calendar-switch" role="group" aria-label="Edit Work calendar system">
                        <span>Calendar</span>
                        <div>
                          <button type="button" className={editCalendarMode === "AD" ? "is-active" : ""} aria-pressed={editCalendarMode === "AD"} onClick={() => setEditCalendarMode("AD")}>AD</button>
                          <button type="button" className={editCalendarMode === "BS" ? "is-active" : ""} aria-pressed={editCalendarMode === "BS"} onClick={() => setEditCalendarMode("BS")}>BS</button>
                        </div>
                      </div>
                    </div>
                    <div className="management-work-form__schedule-grid">
                      {selectedWork.type !== "ADMINISTRATIVE_TASK" && (
                        <DualCalendarDateTimeInput
                          id="edit-work-registered-at"
                          label="Registered"
                          value={actionForm.registeredAt}
                          required
                          mode={editCalendarMode}
                          showAlternate={false}
                          max={new Date().toISOString()}
                          onChange={(registeredAt) => setActionForm((current) => ({ ...current, registeredAt }))}
                        />
                      )}
                      <DualCalendarDateTimeInput
                        id="edit-work-planned-start"
                        label="Planned start"
                        value={actionForm.plannedStartAt}
                        required
                        mode={editCalendarMode}
                        showAlternate={false}
                        min={
                          selectedWork.type === "ADMINISTRATIVE_TASK"
                            ? undefined
                            : actionForm.registeredAt
                        }
                        onChange={(plannedStartAt) => setActionForm((current) => ({ ...current, plannedStartAt }))}
                      />
                      <DualCalendarDateTimeInput
                        id="edit-work-due-at"
                        label="Due"
                        value={actionForm.dueAt}
                        required
                        mode={editCalendarMode}
                        showAlternate={false}
                        min={actionForm.plannedStartAt}
                        onChange={(dueAt) => setActionForm((current) => ({ ...current, dueAt }))}
                      />
                    </div>
                  </section>

                  <footer className="management-work-wizard__footer">
                    <button type="button" className="is-secondary" onClick={() => navigate("/work-management")}>Cancel</button>
                    <div>
                      <button type="submit" className="is-primary" disabled={actionBusy}>
                        {actionBusy ? "Saving..." : "Save changes"}
                      </button>
                    </div>
                  </footer>
                </form>
              ) : (
                <div className="work-management-state">
                  {detailLoading ? "Loading work details..." : "This work could not be loaded."}
                </div>
              )
            ) : (
              <form onSubmit={submitCurrentAction} className="management-work-form">
                {(actionMode === "REASSIGN" || actionMode === "SUPPORT") && (
                  <label className="is-wide">
                    {actionMode === "REASSIGN" ? "New owner" : "Staff member"}
                    <select required value={actionForm.accountId} onChange={(event) => setActionForm((current) => ({ ...current, accountId: event.target.value }))}>
                      <option value="">{actionMode === "REASSIGN" ? "Select new owner" : "Select staff member"}</option>
                      {(actionMode === "SUPPORT"
                        ? (options?.supportMembers ?? []).filter(
                            (candidate) =>
                              selectedWork !== null &&
                              candidate.division?.id === selectedWork.divisionId &&
                              !assignedAccountIds.includes(candidate.account.id) &&
                              candidate.account.id !== selectedWork.salesMemberAccountId,
                          )
                        : (options?.data ?? []).filter((candidate) => {
                            if (!selectedWork || !account) return false;
                            if (candidate.account.id === primaryAssignment?.assignee.id) return false;
                            if (candidate.division?.id !== selectedWork.divisionId) return false;

                            // Reassignment is a corrective owner change, not delegation.
                            // Keep the replacement at the same work scope and hierarchy level.
                            if (selectedWork.departmentId === null) {
                              return (
                                account.role === "SUPER_ADMIN" &&
                                candidate.account.role === "SENIOR_MANAGEMENT" &&
                                candidate.department === null
                              );
                            }
                            if (candidate.department?.id !== selectedWork.departmentId) return false;
                            if (account.role === "SUPER_ADMIN" || account.role === "SENIOR_MANAGEMENT") {
                              return candidate.account.role === "TEAM_MANAGER";
                            }
                            if (account.role === "TEAM_MANAGER") {
                              return candidate.account.role === "EMPLOYEE";
                            }
                            return false;
                          })
                      ).map((candidate) => (
                          <option key={candidate.account.id} value={candidate.account.id}>
                            {getCandidateName(candidate)} · {formatLabel(candidate.account.role)} · {formatLabel(candidate.workload.level)} workload
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
                    {selectedWork && selectedCompletionUsesOperationalPackage && (
                      <section className="management-work-completion-entry is-wide" aria-label="Finish work details">
                        <header>
                          <div>
                            <span>Already added</span>
                            <strong>Work details</strong>
                          </div>
                          <small>You do not need to type these again.</small>
                        </header>
                        <div className="management-work-completion-entry__saved">
                          {[
                            { label: "Customer", value: selectedWork.customerName },
                            { label: "Location", value: selectedWork.locationText },
                            ...(selectedCompletionReference ? [selectedCompletionReference] : []),
                            ...(selectedWork.type === "NEW_CONNECTION"
                              ? [{ label: "CPC Serial", value: selectedWork.cpcSerial }]
                              : []),
                            { label: "OLT", value: selectedWork.olt },
                            { label: "FDC", value: selectedWork.fdcName },
                            { label: "FAP", value: selectedWork.fapName },
                          ].map(({ label, value }) => (
                            <article key={label}>
                              <span>{label}</span>
                              <strong>{value || "Not recorded"}</strong>
                            </article>
                          ))}
                        </div>
                        <div className={`management-work-completion-entry__fields${selectedCompletionAllowsCustomerId ? "" : " is-single"}`}>
                          {selectedCompletionAllowsCustomerId && (
                            <label>
                              Customer ID {selectedCompletionRequiresCustomerId ? "*" : "(optional)"}
                              <input
                                value={actionForm.completionCustomerId}
                                required={selectedCompletionRequiresCustomerId}
                                maxLength={100}
                                onChange={(event) =>
                                  setActionForm((current) => ({
                                    ...current,
                                    completionCustomerId: event.target.value,
                                  }))
                                }
                              />
                            </label>
                          )}
                          <label>
                            RX Level (dBm) *
                            <input
                              type="number"
                              required
                              min="-100"
                              max="20"
                              step="0.01"
                              value={actionForm.completionRxLevel}
                              onChange={(event) =>
                                setActionForm((current) => ({
                                  ...current,
                                  completionRxLevel: event.target.value,
                                }))
                              }
                            />
                          </label>
                        </div>
                      </section>
                    )}
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
                        <option value="FULLY_RESOLVED">Work finished</option>
                        <option value="TEMPORARY_SOLUTION">Temporary work done</option>
                        <option value="UNABLE_TO_RESOLVE">Could not finish</option>
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
                      <span>More work is still needed after this update.</span>
                    </label>
                  </>
                )}
                <label className="is-wide">
                  {actionMode === "REVIEW"
                    ? "Manager note"
                    : actionMode === "COMPLETE"
                      ? "What did you do? *"
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
                <footer className="is-wide">
                  <button type="button" onClick={() => setActionMode(null)}>Cancel</button>
                  {actionMode === "REVIEW" && <button type="button" onClick={() => void requestInformation()} disabled={actionBusy || actionForm.note.trim().length < 3}>Return for correction</button>}
                  <button
                    className={actionMode === "CANCEL" || actionMode === "DELETION_REQUEST" ? "is-danger" : ""}
                    type="submit"
                    disabled={
                      actionBusy ||
                      reviewSalesBlocked ||
                      (actionMode === "COMPLETE" &&
                        ((selectedCompletionRequiresCustomerId && !actionForm.completionCustomerId.trim()) ||
                          (selectedCompletionUsesOperationalPackage && !actionForm.completionRxLevel.trim())))
                    }
                  >
                    {actionBusy ? "Saving..." : actionMode === "REVIEW" ? "Approve" : actionMode === "COMPLETE" ? "Submit to Manager" : actionMode === "HELP" ? "Send Help Request" : actionMode === "RETENTION_HOLD" ? "Apply Hold" : actionMode === "DELETION_REQUEST" ? "Submit Request" : "Save"}
                  </button>
                </footer>
              </form>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
