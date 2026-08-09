import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import {
  connectMessagingSocketAfterEffectCommit,
  createMessagingSocket,
} from "../services/messaging-socket.service";
import {
  cancelDutyAssignment,
  deleteDutyShiftTemplate,
  coordinateManagementHelpRequest,
  createBulkDutySchedule,
  createDutyException,
  createDutyShiftTemplate,
  getDutyManagementSummary,
  getDutyRoster,
  listDutyAssignments,
  listDutyShiftTemplates,
  listManagementAssignmentOptions,
  listManagementDutyHelpRecommendations,
  listPendingEmployeeHelpRequests,
  previewBulkDutySchedule,
  updateDutyAssignment,
  updateDutyShiftTemplate,
} from "../services/work-management.service";
import type {
  BulkDutyPreviewResponse,
  BulkDutyScheduleInput,
  DutyAssignment,
  DutyAssignmentListView,
  DutyExceptionType,
  DutyHelpRecommendation,
  DutyManagementSummary,
  DutyRecurrenceType,
  DutyRosterPerson,
  DutyRosterResponse,
  DutyShiftTemplate,
  WorkHelpRequest,
  WorkResponsibleManagerOption,
} from "../types/work-management";

const BRANCH_TIME_ZONE = "Asia/Kathmandu";
const WEEKDAYS = [
  [0, "Sun"],
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
] as const;

type DutyView =
  | "OVERVIEW"
  | "PEOPLE"
  | "WEEKLY"
  | "ASSIGNMENTS"
  | "HISTORY";
type DutyDialog =
  | "SHIFTS"
  | "SHIFT_DELETE"
  | "SCHEDULE"
  | "EXCEPTION"
  | "EDIT"
  | "CANCEL"
  | "COORDINATE"
  | "ROUTINE"
  | null;
type DutyIconName =
  | "calendar"
  | "clock"
  | "plus"
  | "warning"
  | "close"
  | "help"
  | "arrow"
  | "chart"
  | "people"
  | "refresh"
  | "leave"
  | "settings";

function DutyIcon({ name }: { name: DutyIconName }): ReactNode {
  const props = {
    "aria-hidden": true,
    fill: "none",
    height: 21,
    viewBox: "0 0 24 24",
    width: 21,
  } as const;
  switch (name) {
    case "calendar":
      return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>;
    case "clock":
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case "plus":
      return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>;
    case "warning":
      return <svg {...props}><path d="M10.3 3.8 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>;
    case "close":
      return <svg {...props}><path d="m6 6 12 12M18 6 6 18" /></svg>;
    case "help":
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.4 2.4 0 1 1 3.3 2.2c-.9.4-1.1.9-1.1 1.8M12 17h.01" /></svg>;
    case "arrow":
      return <svg {...props}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    case "chart":
      return <svg {...props}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
    case "people":
      return <svg {...props}><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 11a3 3 0 0 1 0 6M19 20v-1a5 5 0 0 0-3-4.6" /></svg>;
    case "refresh":
      return <svg {...props}><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></svg>;
    case "leave":
      return <svg {...props}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M8 11h8M8 15h5" /></svg>;
    case "settings":
      return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-2.8-2.8.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1L7 4.2l.1.1A1.7 1.7 0 0 0 9 4a1.7 1.7 0 0 0 1-1.6V2h4v.4A1.7 1.7 0 0 0 15 4a1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 6l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1Z" /></svg>;
  }
}

function localDateInput(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRANCH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfWeek(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return addDays(value, -date.getUTCDay());
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BRANCH_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function accountName(person: DutyRosterPerson | DutyAssignment["employee"] | null | undefined): string {
  if (!person) return "NT Message user";
  const account = "account" in person ? person.account : person;
  return account.employee?.empName ?? account.username ?? "NT Message user";
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Duty operation could not be completed.";
}

function roleLabel(role: string): string {
  return role.toLowerCase().split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function statusLabel(status: string): string {
  return status.toLowerCase().split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function assignmentViewTitle(view: DutyView): string {
  return view === "ASSIGNMENTS" ? "Assignments" : "History";
}

function isOverrideAssignment(assignment: DutyAssignment): boolean {
  return assignment.authority === "SUPER_ADMIN_OVERRIDE";
}

function assignmentCheckLabel(
  result: BulkDutyPreviewResponse["people"][number]["result"],
): string {
  switch (result) {
    case "READY":
      return "Ready";
    case "PARTLY_READY":
      return "Some dates blocked";
    case "NEEDS_APPROVAL":
      return "Needs approval";
    case "BLOCKED":
      return "Cannot assign";
  }
}

const today = localDateInput();
const initialWeek = startOfWeek(today);

export function ManagementDutyPage() {
  const { accessToken, account } = useAuth();
  const [view, setView] = useState<DutyView>("OVERVIEW");
  const [summary, setSummary] = useState<DutyManagementSummary | null>(null);
  const [roster, setRoster] = useState<DutyRosterResponse | null>(null);
  const [templates, setTemplates] = useState<DutyShiftTemplate[]>([]);
  const [history, setHistory] = useState<DutyAssignment[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [managers, setManagers] = useState<WorkResponsibleManagerOption[]>([]);
  const [helpRequests, setHelpRequests] = useState<WorkHelpRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [dialog, setDialog] = useState<DutyDialog>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<DutyAssignment | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<DutyShiftTemplate | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<DutyRosterPerson | null>(null);
  const [routineDates, setRoutineDates] = useState<string[]>([]);
  const [routineLoading, setRoutineLoading] = useState(false);
  const [selectedHelpRequest, setSelectedHelpRequest] = useState<WorkHelpRequest | null>(null);
  const [coordinationCandidates, setCoordinationCandidates] = useState<DutyHelpRecommendation[]>([]);
  const [coordinationHelperId, setCoordinationHelperId] = useState("");
  const [weekFrom, setWeekFrom] = useState(initialWeek);
  const weekTo = addDays(weekFrom, 6);
  const [departmentId, setDepartmentId] = useState("");
  const [peopleSearch, setPeopleSearch] = useState("");
  const [historyFrom, setHistoryFrom] = useState(today);
  const [historyTo, setHistoryTo] = useState(addDays(today, 30));
  const [historyPage, setHistoryPage] = useState(1);
  const [assignmentMode, setAssignmentMode] = useState<"ALL" | "ASSIGNED_BY_ME">("ALL");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<BulkDutyPreviewResponse | null>(null);
  const dialogPanelRef = useRef<HTMLFormElement>(null);
  const busyRef = useRef(busy);

  const [shiftForm, setShiftForm] = useState({
    name: "",
    startTime: "09:00",
    endTime: "18:00",
  });
  const [scheduleForm, setScheduleForm] = useState({
    shiftTemplateId: "",
    supervisorAccountId: "",
    recurrenceType: "ONE_TIME" as DutyRecurrenceType,
    startDate: today,
    endDate: today,
    weekdays: [0, 1, 2, 3, 4] as number[],
    reportingLocation: "Patan Branch",
    notes: "",
    createValidAssignmentsOnly: false,
    overrideConflicts: false,
    overrideReason: "",
  });
  const [exceptionForm, setExceptionForm] = useState({
    employeeAccountId: "",
    date: today,
    type: "LEAVE" as DutyExceptionType,
    note: "",
  });
  const [editForm, setEditForm] = useState({
    shiftTemplateId: "",
    supervisorAccountId: "",
    reportingLocation: "",
    notes: "",
  });
  const [cancelReason, setCancelReason] = useState("");
  const activeAssignmentListView: DutyAssignmentListView | null =
    view === "ASSIGNMENTS" ? assignmentMode : view === "HISTORY" ? "ALL" : null;

  const openRoutine = useCallback(
    async (person: DutyRosterPerson) => {
      setSelectedPerson(person);
      setRoutineDates(roster?.period.days ?? []);
      setDialog("ROUTINE");
      if (!accessToken) return;

      setRoutineLoading(true);
      try {
        // Individual routines load only when requested so large rosters remain fast.
        const response = await getDutyRoster(accessToken, {
          from: today,
          to: addDays(today, 30),
          employeeAccountId: person.account.id,
        });
        setSelectedPerson(response.people[0] ?? person);
        setRoutineDates(response.period.days);
      } catch (routineError) {
        setError(errorMessage(routineError));
      } finally {
        setRoutineLoading(false);
      }
    },
    [accessToken, roster?.period.days],
  );

  const loadData = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    try {
      const [summaryResponse, templateResponse, rosterResponse, historyResponse, optionResponse, helpResponse] = await Promise.all([
        getDutyManagementSummary(accessToken),
        listDutyShiftTemplates(accessToken),
        getDutyRoster(accessToken, {
          from: weekFrom,
          to: weekTo,
          departmentId: departmentId || undefined,
          search: peopleSearch || undefined,
        }),
        listDutyAssignments(accessToken, {
          from: historyFrom,
          to: historyTo,
          departmentId: departmentId || undefined,
          page: historyPage,
          limit: 25,
          view: activeAssignmentListView ?? "ALL",
          includeCancelled: view === "HISTORY",
        }),
        listManagementAssignmentOptions(accessToken, { limit: 50 }),
        listPendingEmployeeHelpRequests(accessToken),
      ]);
      setSummary(summaryResponse);
      setTemplates(templateResponse.data);
      setRoster(rosterResponse);
      setHistory(historyResponse.data);
      setHistoryTotal(historyResponse.pagination.total);
      setManagers(optionResponse.responsibleManagers);
      setHelpRequests(helpResponse.data.filter((request) => request.requestedDepartment));
      setScheduleForm((current) => ({
        ...current,
        shiftTemplateId:
          current.shiftTemplateId ||
          templateResponse.data.find((template) => template.isActive)?.id ||
          "",
        supervisorAccountId:
          current.supervisorAccountId ||
          optionResponse.responsibleManagers[0]?.account.id ||
          "",
      }));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeAssignmentListView, departmentId, historyFrom, historyPage, historyTo, peopleSearch, refreshKey, view, weekFrom, weekTo]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    if (view === "ASSIGNMENTS" || view === "HISTORY") setHistoryPage(1);
  }, [view]);

  useEffect(() => {
    if (!accessToken) return;
    const socket = createMessagingSocket(accessToken);
    const refresh = () => setRefreshKey((value) => value + 1);
    socket.on("duty:schedule-updated", refresh);
    socket.on("work:item-updated", refresh);
    const disconnect = connectMessagingSocketAfterEffectCommit(socket);
    return () => {
      socket.off("duty:schedule-updated", refresh);
      socket.off("work:item-updated", refresh);
      disconnect();
    };
  }, [accessToken]);

  useEffect(() => { busyRef.current = busy; }, [busy]);

  useEffect(() => {
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      dialogPanelRef.current?.querySelector<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])")?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        setDialog(null);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialogPanelRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]") ?? []).filter((control) => control.offsetParent !== null);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [dialog]);

  const people = useMemo(() => roster?.people ?? [], [roster?.people]);
  const departments = roster?.departments ?? [];

  useEffect(() => {
    // Remove hidden selections when scope or search changes so bulk actions match the visible roster.
    const visibleIds = new Set(people.map((person) => person.account.id));
    setSelectedIds((current) => {
      const next = current.filter((id) => visibleIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [people]);
  const selectedPeople = useMemo(
    () => people.filter((person) => selectedIds.includes(person.account.id)),
    [people, selectedIds],
  );
  const schedulePayload = useCallback((): BulkDutyScheduleInput => ({
    employeeAccountIds: selectedIds,
    shiftTemplateId: scheduleForm.shiftTemplateId,
    supervisorAccountId: scheduleForm.supervisorAccountId || undefined,
    recurrenceType: scheduleForm.recurrenceType,
    startDate: scheduleForm.startDate,
    endDate: scheduleForm.recurrenceType === "ONE_TIME" ? undefined : scheduleForm.endDate,
    weekdays: scheduleForm.recurrenceType === "WEEKLY" ? scheduleForm.weekdays : undefined,
    reportingLocation: scheduleForm.reportingLocation,
    notes: scheduleForm.notes || undefined,
    createValidAssignmentsOnly: scheduleForm.createValidAssignmentsOnly,
    overrideConflicts: scheduleForm.overrideConflicts,
    overrideReason: scheduleForm.overrideReason.trim() || undefined,
  }), [scheduleForm, selectedIds]);

  function openSchedule(ids: string[]) {
    setSelectedIds(ids);
    setPreview(null);
    // Override choices belong to one reviewed preview and must not leak into the next operation.
    setScheduleForm((current) => ({
      ...current,
      createValidAssignmentsOnly: false,
      overrideConflicts: false,
      overrideReason: "",
    }));
    setDialog("SCHEDULE");
  }

  // Preview is mandatory so managers see conflicts before any duty rows are written.
  async function previewSchedule(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setBusy("preview");
    setError("");
    try {
      const response = await previewBulkDutySchedule(accessToken, schedulePayload());
      setPreview(response);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy("");
    }
  }

  // The server recomputes scope and conflicts; the browser preview is never trusted as authorization.
  async function createScheduleFromPreview() {
    if (!accessToken || !preview) return;
    setBusy("schedule");
    setError("");
    try {
      const response = await createBulkDutySchedule(accessToken, schedulePayload());
      setSuccess(response.message);
      setDialog(null);
      setPreview(null);
      setSelectedIds([]);
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy("");
    }
  }

  function openShiftManager() {
    setSelectedTemplate(null);
    setShiftForm({ name: "", startTime: "09:00", endTime: "18:00" });
    setDialog("SHIFTS");
  }

  function editShift(template: DutyShiftTemplate) {
    setSelectedTemplate(template);
    setShiftForm({
      name: template.name,
      startTime: template.startTime,
      endTime: template.endTime,
    });
    setDialog("SHIFTS");
  }

  async function submitShift(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setBusy("shift");
    setError("");
    try {
      const response = selectedTemplate
        ? await updateDutyShiftTemplate(accessToken, selectedTemplate.id, shiftForm)
        : await createDutyShiftTemplate(accessToken, shiftForm);
      setSuccess(response.message);
      setSelectedTemplate(null);
      setShiftForm({ name: "", startTime: "09:00", endTime: "18:00" });
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy("");
    }
  }

  async function submitDeleteShift(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !selectedTemplate) return;
    setBusy("delete-shift");
    setError("");
    try {
      const response = await deleteDutyShiftTemplate(accessToken, selectedTemplate.id);
      setSuccess(response.message);
      setDialog(null);
      setSelectedTemplate(null);
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy("");
    }
  }

  async function submitException(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setBusy("exception");
    try {
      const response = await createDutyException(accessToken, exceptionForm);
      setSuccess(response.message);
      setDialog(null);
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally { setBusy(""); }
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !selectedAssignment) return;
    setBusy("edit");
    try {
      const response = await updateDutyAssignment(accessToken, selectedAssignment.id, editForm);
      setSuccess(response.message);
      setDialog(null);
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally { setBusy(""); }
  }

  async function submitCancel(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !selectedAssignment) return;
    setBusy("cancel");
    try {
      const response = await cancelDutyAssignment(accessToken, selectedAssignment.id, cancelReason);
      setSuccess(response.message);
      setDialog(null);
      setCancelReason("");
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally { setBusy(""); }
  }

  async function openCoordination(request: WorkHelpRequest) {
    if (!accessToken || !request.requestedDepartment) return;
    setSelectedHelpRequest(request);
    setCoordinationHelperId("");
    setDialog("COORDINATE");
    try {
      const response = await listManagementDutyHelpRecommendations(accessToken, request.requestedDepartment.id);
      setCoordinationCandidates(response.data);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function submitCoordination(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !selectedHelpRequest || !coordinationHelperId) return;
    setBusy("coordinate");
    try {
      const response = await coordinateManagementHelpRequest(accessToken, selectedHelpRequest.id, { helperAccountId: coordinationHelperId });
      setSuccess(response.message);
      setDialog(null);
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally { setBusy(""); }
  }

  function changeView(nextView: DutyView) {
    setView(nextView);
    setHistoryPage(1);
    if (nextView === "ASSIGNMENTS") {
      setHistoryFrom(today);
      setHistoryTo(addDays(today, 30));
    } else if (nextView === "HISTORY") {
      setHistoryFrom(addDays(today, -30));
      setHistoryTo(today);
    }
  }

  function clearDutyFilters() {
    setWeekFrom(initialWeek);
    setDepartmentId("");
    setPeopleSearch("");
    setHistoryFrom(today);
    setHistoryTo(addDays(today, 30));
    setHistoryPage(1);
  }

  // Matrix cells read nested rows from one roster response instead of issuing employee-day requests.
  function assignmentFor(person: DutyRosterPerson, date: string) {
    return person.assignments.find((assignment) => assignment.dutyDate === date);
  }

  function exceptionFor(person: DutyRosterPerson, date: string) {
    return person.exceptions.find((exception) => exception.exceptionDate === date);
  }

  const scopeLabel = account?.role === "SUPER_ADMIN"
    ? "Branch schedule"
    : account?.role === "SENIOR_MANAGEMENT"
      ? "Division schedule"
      : "Department schedule";

  const assignmentViews = new Set<DutyView>(["ASSIGNMENTS", "HISTORY"]);
  const previewRequiresReason = Boolean(
    preview &&
      (preview.override.hierarchyOverrideCount > 0 || scheduleForm.overrideConflicts),
  );
  const conflictDecisionComplete = Boolean(
    !preview?.conflictAssignments ||
      scheduleForm.createValidAssignmentsOnly ||
      scheduleForm.overrideConflicts,
  );
  const overrideReasonValid = !previewRequiresReason || scheduleForm.overrideReason.trim().length >= 10;
  const createCount = preview
    ? preview.validAssignments +
      (scheduleForm.overrideConflicts ? preview.conflictAssignments : 0)
    : 0;
  const summaryItems: Array<{
    label: string;
    value: number;
    note: string;
    icon: DutyIconName;
    tone?: "attention";
  }> = [
    {
      label: "Scheduled today",
      value: summary?.totals.scheduledToday ?? 0,
      note: "People with duty today",
      icon: "calendar",
    },
    {
      label: "On duty now",
      value: summary?.totals.onDutyNow ?? 0,
      note: "Working at this time",
      icon: "clock",
    },
    {
      label: "Leave / holiday",
      value: (summary?.totals.leaveToday ?? 0) + (summary?.totals.holidayToday ?? 0),
      note: "Not available today",
      icon: "leave",
    },
    {
      label: "Need attention",
      value: helpRequests.length + (summary?.totals.conflictOverridesUpcoming ?? 0),
      note: "Items that need review",
      icon: "warning",
      tone: "attention",
    },
  ];
  const showRosterFilters = view === "OVERVIEW" || view === "WEEKLY" || view === "PEOPLE";

  return (
    <main className="management-duty-page management-duty-page--modern">
      <section className="management-duty-header">
        <div className="management-duty-header__copy">
          <span>{scopeLabel}</span>
          <h1>Duty Roster</h1>
          <p>Plan shifts, assign staff and check the week in one place.</p>
        </div>
        <div className="management-duty-header__actions">
          <button
            type="button"
            className="is-primary"
            disabled={!people.length}
            onClick={() =>
              openSchedule(
                selectedIds.length
                  ? selectedIds
                  : people.slice(0, 1).map((person) => person.account.id),
              )
            }
          >
            <DutyIcon name="calendar" /> Assign Duty
          </button>
          <button type="button" onClick={openShiftManager}>
            <DutyIcon name="settings" /> Shifts
          </button>
          <button type="button" onClick={() => setDialog("EXCEPTION")}>
            <DutyIcon name="leave" /> Leave / Holiday
          </button>
          <button
            type="button"
            className="is-icon"
            aria-label="Refresh duty roster"
            title="Refresh"
            onClick={() => setRefreshKey((value) => value + 1)}
          >
            <DutyIcon name="refresh" />
          </button>
        </div>
      </section>

      {error && <div className="management-duty-message is-error" role="alert">{error}</div>}
      {success && <div className="management-duty-message is-success" role="status">{success}</div>}

      <section className="management-duty-summary" aria-label="Duty summary">
        {summaryItems.map((item) => (
          <article key={item.label} className={item.tone ? `is-${item.tone}` : ""}>
            <span className="management-duty-summary__icon"><DutyIcon name={item.icon} /></span>
            <div>
              <span>{item.label}</span>
              <strong>{loading ? "—" : item.value}</strong>
              <small>{item.note}</small>
            </div>
          </article>
        ))}
      </section>

      <section className="management-duty-workspace">
        <nav className="management-duty-tabs" aria-label="Duty roster pages">
          {([
            ["OVERVIEW", "Overview"],
            ["WEEKLY", "Weekly Roster"],
            ["PEOPLE", account?.role === "TEAM_MANAGER" ? "Employees" : "Staff"],
            ["ASSIGNMENTS", "Assignments"],
            ["HISTORY", "History"],
          ] as Array<[DutyView, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={view === value ? "is-active" : ""}
              onClick={() => changeView(value)}
            >
              {label}
            </button>
          ))}
        </nav>

        {showRosterFilters && (
          <div className="management-duty-toolbar">
            <div className="management-duty-toolbar__week">
              <button type="button" aria-label="Previous week" onClick={() => setWeekFrom(addDays(weekFrom, -7))}>←</button>
              <label>
                <span>Week starting</span>
                <input type="date" value={weekFrom} onChange={(event) => setWeekFrom(startOfWeek(event.target.value))} />
              </label>
              <button type="button" aria-label="Next week" onClick={() => setWeekFrom(addDays(weekFrom, 7))}>→</button>
            </div>
            {account?.role !== "TEAM_MANAGER" && (
              <label>
                <span>Department</span>
                <select value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setHistoryPage(1); }}>
                  <option value="">All departments</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>{department.division.name} · {department.name}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="management-duty-toolbar__search">
              <span>Find staff</span>
              <input value={peopleSearch} onChange={(event) => setPeopleSearch(event.target.value)} placeholder="Name, ID or job title" />
            </label>
            <button type="button" className="management-duty-toolbar__clear" onClick={clearDutyFilters}>Clear</button>
          </div>
        )}

        {view === "OVERVIEW" && (
          <div className="management-duty-overview">
            <section className="management-duty-panel">
              <header><div><span>Week summary</span><h2>{formatDate(weekFrom)} – {formatDate(weekTo)}</h2></div><strong>{roster?.totals.scheduledPeople ?? 0} staff scheduled</strong></header>
              <div className="management-duty-department-grid">
                {(departments.length ? departments : []).map((department) => (
                  <button key={department.id} type="button" onClick={() => { setDepartmentId(department.id); setView("WEEKLY"); }}>
                    <span>{department.division.code} · {department.name}</span>
                    <strong>{department.scheduledPeople}/{department.people}</strong>
                    <small>{department.assignmentCount} duties · {department.leaveCount} on leave</small>
                  </button>
                ))}
                {!departments.length && <p>No department information is available.</p>}
              </div>
            </section>
            <section className={`management-duty-panel management-duty-attention ${helpRequests.length ? "has-items" : "is-clear"}`}>
              <header><div><span>Need attention</span><h2>{helpRequests.length ? "Help requests" : "Everything looks good"}</h2></div>{helpRequests.length > 0 && <strong>{helpRequests.length}</strong>}</header>
              {helpRequests.length ? (
                <div className="management-duty-help-list">
                  {helpRequests.slice(0, 6).map((request) => (
                    <article key={request.id}><div><strong>{request.workItem?.ticketNumber} · {request.workItem?.title}</strong><span>{request.requestedDepartment?.name} · {request.note || "Help requested"}</span></div><button type="button" onClick={() => void openCoordination(request)}>Choose Helper</button></article>
                  ))}
                </div>
              ) : (
                <div className="management-duty-all-clear">
                  <span><DutyIcon name="chart" /></span>
                  <p>No help request needs action.</p>
                </div>
              )}
            </section>
            <section className="management-duty-panel management-duty-overview__days">
              <header><div><span>Daily view</span><h2>People scheduled each day</h2></div></header>
              <div className="management-duty-daily-grid">
                {roster?.daily.map((day) => (
                  <article key={day.date}>
                    <span>{formatDate(day.date)}</span>
                    <strong>{day.scheduledPeople}</strong>
                    <small>{day.assignmentCount} duties</small>
                    <div><em>{day.leaveCount} leave</em><em>{day.holidayCount} holiday</em></div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {view === "PEOPLE" && (
          <section className="management-duty-panel management-duty-people">
            <header>
              <div><span>Staff list</span><h2>{account?.role === "TEAM_MANAGER" ? "Employees" : "Staff"}</h2></div>
              <div><strong>{selectedIds.length} selected</strong><button type="button" disabled={!selectedIds.length} onClick={() => openSchedule(selectedIds)}>Assign selected</button></div>
            </header>
            <div className="management-duty-people__list">
              {people.map((person) => (
                <article key={person.account.id} className={selectedIds.includes(person.account.id) ? "is-selected" : ""}>
                  <input type="checkbox" aria-label={`Select ${accountName(person)}`} checked={selectedIds.includes(person.account.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, person.account.id])] : current.filter((id) => id !== person.account.id))} />
                  <button type="button" className="management-duty-person" onClick={() => void openRoutine(person)}>
                    <span><strong>{accountName(person)}</strong><small>{roleLabel(person.account.role)} · {person.account.employee?.designation || person.account.employee?.department?.name || person.account.employee?.division.name}</small></span>
                    <span><small>Today</small><strong>{statusLabel(person.todayStatus)}</strong></span>
                    <span><small>This week</small><strong>{formatHours(person.totalScheduledMinutes)}</strong></span>
                    <span><small>Next duty</small><strong>{person.next ? formatDateTime(person.next.startsAt) : "Not scheduled"}</strong></span>
                  </button>
                  <button type="button" onClick={() => openSchedule([person.account.id])}>Assign</button>
                </article>
              ))}
              {!loading && !people.length && <div className="management-duty-empty"><DutyIcon name="people" /><strong>No staff found</strong><span>Try another department or search word.</span></div>}
            </div>
          </section>
        )}

        {view === "WEEKLY" && (
          <section className="management-duty-panel management-duty-matrix-panel">
            <header><div><span>Week</span><h2>Weekly Roster</h2><p>Choose an empty box to assign duty. Choose a shift to change it.</p></div><strong>{people.length} staff</strong></header>
            {/* Sticky headers preserve staff and date context while the full matrix scrolls. */}
            <div className="management-duty-matrix-wrap">
              <table className="management-duty-matrix">
                <thead><tr><th>Staff member</th>{roster?.period.days.map((date) => <th key={date}>{formatDate(date)}</th>)}</tr></thead>
                <tbody>
                  {people.map((person) => (
                    <tr key={person.account.id}>
                      <th><button type="button" onClick={() => void openRoutine(person)}><strong>{accountName(person)}</strong><small>{person.account.employee?.department?.name || roleLabel(person.account.role)}</small></button></th>
                      {roster?.period.days.map((date) => {
                        const assignment = assignmentFor(person, date);
                        const exception = exceptionFor(person, date);
                        if (assignment) {
                          const override = isOverrideAssignment(assignment);
                          const protectedOverride = override && account?.role !== "SUPER_ADMIN";
                          return (
                            <td key={date}>
                              <button
                                type="button"
                                className={`duty-cell is-scheduled ${override ? "is-override" : ""}`}
                                title={override ? assignment.overrideReason || "Special duty set by Super Admin" : undefined}
                                onClick={() => {
                                  if (protectedOverride) {
                                    setError("Only Super Admin can change this special assignment.");
                                    return;
                                  }
                                  setSelectedAssignment(assignment);
                                  setEditForm({ shiftTemplateId: assignment.shiftTemplateId ?? "", supervisorAccountId: assignment.supervisorAccountId, reportingLocation: assignment.reportingLocation, notes: assignment.notes || "" });
                                  setDialog("EDIT");
                                }}
                              >
                                <strong>{assignment.shift.name}</strong>
                                <small>{assignment.shift.startTime}–{assignment.shift.endTime}</small>
                                {override && <em className="duty-cell__badge">Special</em>}
                              </button>
                            </td>
                          );
                        }
                        if (exception) {
                          return <td key={date}><span className={`duty-cell is-${exception.type.toLowerCase()}`}><strong>{exception.type === "LEAVE" ? "Leave" : "Holiday"}</strong><small>{exception.note || "Recorded"}</small></span></td>;
                        }
                        return <td key={date}><button type="button" className="duty-cell is-empty" onClick={() => { setScheduleForm((current) => ({ ...current, startDate: date, endDate: date, recurrenceType: "ONE_TIME" })); openSchedule([person.account.id]); }}>Assign</button></td>;
                      })}
                    </tr>
                  ))}
                  {!people.length && <tr><td colSpan={(roster?.period.days.length ?? 0) + 1}>No staff found.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {assignmentViews.has(view) && (
          <section className="management-duty-panel">
            <header>
              <div>
                <span>{view === "ASSIGNMENTS" ? "Current and upcoming" : "Past duties"}</span>
                <h2>{assignmentViewTitle(view)}</h2>
              </div>
              <strong>{historyTotal}</strong>
            </header>
            {view === "ASSIGNMENTS" && (
              <div className="management-duty-assignment-filter" aria-label="Assignment filter">
                <button type="button" className={assignmentMode === "ALL" ? "is-active" : ""} onClick={() => { setAssignmentMode("ALL"); setHistoryPage(1); }}>All assignments</button>
                <button type="button" className={assignmentMode === "ASSIGNED_BY_ME" ? "is-active" : ""} onClick={() => { setAssignmentMode("ASSIGNED_BY_ME"); setHistoryPage(1); }}>Assigned by me</button>
              </div>
            )}
            <div className="management-duty-history-filters">
              <label><span>From</span><input type="date" value={historyFrom} onChange={(event) => { setHistoryFrom(event.target.value); setHistoryPage(1); }} /></label>
              <label><span>To</span><input type="date" value={historyTo} onChange={(event) => { setHistoryTo(event.target.value); setHistoryPage(1); }} /></label>
              <button type="button" onClick={() => { if (view === "ASSIGNMENTS") { setHistoryFrom(today); setHistoryTo(addDays(today, 30)); } else { setHistoryFrom(addDays(today, -30)); setHistoryTo(today); } setHistoryPage(1); }}>Reset dates</button>
            </div>
            <div className="management-duty-table-wrap">
              <table>
                <thead><tr><th>Staff</th><th>Date & shift</th><th>Assigned by</th><th>Type</th><th>Location</th><th>Supervisor</th><th>Status</th>{view === "ASSIGNMENTS" && <th>Actions</th>}</tr></thead>
                <tbody>
                  {history.map((assignment) => {
                    const override = isOverrideAssignment(assignment);
                    const protectedOverride = override && account?.role !== "SUPER_ADMIN";
                    return (
                      <tr key={assignment.id} className={override ? "is-override-row" : ""}>
                        <td><strong>{accountName(assignment.employee)}</strong><small>{roleLabel(assignment.employee.role)}</small></td>
                        <td><strong>{formatDateTime(assignment.startsAt)}</strong><small>{assignment.shift.name} · {assignment.shift.startTime}–{assignment.shift.endTime}</small></td>
                        <td><strong>{accountName(assignment.createdBy)}</strong><small>{roleLabel(assignment.createdBy.role)}</small></td>
                        <td>
                          <span className={`management-duty-authority ${override ? "is-override" : "is-standard"}`}>{override ? "Special approval" : "Standard"}</span>
                          {override && <small className="management-duty-override-reason">{assignment.overrideReason || "Reason not available"}</small>}
                          {assignment.conflictOverride && <small className="management-duty-governance-flag">Time overlap allowed</small>}
                          {assignment.hierarchyOverride && <small className="management-duty-governance-flag">Special approval</small>}
                        </td>
                        <td>{assignment.reportingLocation}</td>
                        <td>{accountName(assignment.supervisor)}</td>
                        <td><span className={assignment.cancelledAt ? "is-cancelled" : "is-scheduled"}>{assignment.cancelledAt ? "Cancelled" : new Date(assignment.startsAt) <= new Date() && new Date(assignment.endsAt) > new Date() ? "On Duty" : "Scheduled"}</span></td>
                        {view === "ASSIGNMENTS" && (
                          <td>
                            <button type="button" disabled={Boolean(assignment.cancelledAt) || protectedOverride} title={protectedOverride ? "Only Super Admin can change this special assignment." : undefined} onClick={() => { setSelectedAssignment(assignment); setEditForm({ shiftTemplateId: assignment.shiftTemplateId ?? "", supervisorAccountId: assignment.supervisorAccountId, reportingLocation: assignment.reportingLocation, notes: assignment.notes || "" }); setDialog("EDIT"); }}>Change</button>
                            <button type="button" className="is-danger" disabled={Boolean(assignment.cancelledAt) || protectedOverride} title={protectedOverride ? "Only Super Admin can cancel this special assignment." : undefined} onClick={() => { setSelectedAssignment(assignment); setCancelReason(""); setDialog("CANCEL"); }}>Cancel</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {!history.length && <tr><td colSpan={view === "ASSIGNMENTS" ? 8 : 7}>No duty history was found for these dates.</td></tr>}
                </tbody>
              </table>
            </div>
            <footer className="management-duty-pagination"><button type="button" disabled={historyPage <= 1} onClick={() => setHistoryPage((page) => page - 1)}>Previous</button><span>Page {historyPage} of {Math.max(1, Math.ceil(historyTotal / 25))}</span><button type="button" disabled={historyPage >= Math.ceil(historyTotal / 25)} onClick={() => setHistoryPage((page) => page + 1)}>Next</button></footer>
          </section>
        )}
      </section>

      <section className="management-duty-note"><strong>Work schedule only</strong><span>This page shows planned duty. It does not confirm attendance.</span></section>

      {dialog && (
        <div className="management-duty-dialog" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDialog(null); }}>
          <form ref={dialogPanelRef} role="dialog" aria-modal="true" aria-labelledby="duty-dialog-title" className="management-duty-dialog__panel" onSubmit={dialog === "SHIFTS" ? submitShift : dialog === "SHIFT_DELETE" ? submitDeleteShift : dialog === "SCHEDULE" ? previewSchedule : dialog === "EXCEPTION" ? submitException : dialog === "EDIT" ? submitEdit : dialog === "CANCEL" ? submitCancel : dialog === "COORDINATE" ? submitCoordination : (event) => event.preventDefault()}>
            <header><div><span>Duty Roster</span><h2 id="duty-dialog-title">{dialog === "SHIFTS" ? "Shifts" : dialog === "SHIFT_DELETE" ? "Delete Shift" : dialog === "SCHEDULE" ? "Check Before Assigning" : dialog === "EXCEPTION" ? "Record Leave or Holiday" : dialog === "EDIT" ? "Change Duty" : dialog === "CANCEL" ? "Cancel Duty" : dialog === "COORDINATE" ? "Choose a Helper" : `${accountName(selectedPerson)} Duty`}</h2></div><button type="button" aria-label="Close dialog" disabled={Boolean(busy)} onClick={() => setDialog(null)}><DutyIcon name="close" /></button></header>

            {dialog === "SHIFTS" && (
              <div className="management-duty-shifts">
                <section className="management-duty-shifts__list">
                  <div className="management-duty-shifts__heading">
                    <div><strong>Saved Shifts</strong><span>Create, edit or delete shifts.</span></div>
                    <button type="button" onClick={() => { setSelectedTemplate(null); setShiftForm({ name: "", startTime: "09:00", endTime: "18:00" }); }}>New Shift</button>
                  </div>
                  {templates.length ? templates.map((template) => (
                    <article key={template.id}>
                      <div>
                        <strong>{template.name}</strong>
                        <span>{template.startTime}–{template.endTime}{template.spansNextDay ? " · next day" : ""}</span>
                      </div>
                      <div>
                        {template.canManage === false ? (
                          <span>Shared shift</span>
                        ) : (
                          <>
                            <button type="button" onClick={() => editShift(template)}>Edit</button>
                            <button type="button" className="is-danger" onClick={() => { setSelectedTemplate(template); setDialog("SHIFT_DELETE"); }}>Delete</button>
                          </>
                        )}
                      </div>
                    </article>
                  )) : <p className="management-duty-shifts__empty">No shifts have been created.</p>}
                </section>
                <div className="management-duty-dialog__grid management-duty-dialog__grid--shift">
                  <div className="management-duty-dialog__context wide">
                    <strong>{selectedTemplate ? `Edit ${selectedTemplate.name}` : "Create a New Shift"}</strong>
                    <p>Enter a simple name and the start and end time.</p>
                  </div>
                  <label><span>Shift name</span><input required minLength={2} value={shiftForm.name} onChange={(event) => setShiftForm({ ...shiftForm, name: event.target.value })} /></label>
                  <label><span>Start time</span><input required type="time" value={shiftForm.startTime} onChange={(event) => setShiftForm({ ...shiftForm, startTime: event.target.value })} /></label>
                  <label><span>End time</span><input required type="time" value={shiftForm.endTime} onChange={(event) => setShiftForm({ ...shiftForm, endTime: event.target.value })} /></label>
                </div>
              </div>
            )}

            {dialog === "SHIFT_DELETE" && selectedTemplate && (
              <div className="management-duty-dialog__grid">
                <div className="management-duty-cancel-summary wide">
                  <DutyIcon name="warning" />
                  <div>
                    <strong>Delete “{selectedTemplate.name}” permanently?</strong>
                    <p>This cannot be undone. A shift can be deleted only when it is not used in a current or upcoming duty.</p>
                  </div>
                </div>
              </div>
            )}

            {dialog === "SCHEDULE" && <div className="management-duty-dialog__grid">
              <div className="management-duty-dialog__context wide"><strong>{selectedIds.length} staff selected</strong><p>{selectedPeople.slice(0, 5).map(accountName).join(", ")}{selectedPeople.length > 5 ? ` and ${selectedPeople.length - 5} more` : ""}</p></div>
              <label><span>Shift</span><select required value={scheduleForm.shiftTemplateId} onChange={(event) => { setScheduleForm({ ...scheduleForm, shiftTemplateId: event.target.value }); setPreview(null); }}><option value="">Select shift</option>{templates.filter((template) => template.isActive).map((template) => <option key={template.id} value={template.id}>{template.name} · {template.startTime}–{template.endTime}</option>)}</select></label>
              <label><span>Supervisor</span><select value={scheduleForm.supervisorAccountId} onChange={(event) => { setScheduleForm({ ...scheduleForm, supervisorAccountId: event.target.value }); setPreview(null); }}><option value="">Use my account</option>{managers.map((manager) => <option key={manager.account.id} value={manager.account.id}>{manager.account.employee?.empName || manager.account.username} · {roleLabel(manager.account.role)}</option>)}</select></label>
              <label><span>Schedule type</span><select value={scheduleForm.recurrenceType} onChange={(event) => { setScheduleForm({ ...scheduleForm, recurrenceType: event.target.value as DutyRecurrenceType }); setPreview(null); }}><option value="ONE_TIME">One day</option><option value="DATE_RANGE">Every day</option><option value="WEEKLY">Selected weekdays</option></select></label>
              <label><span>Start date</span><input required type="date" value={scheduleForm.startDate} onChange={(event) => { setScheduleForm({ ...scheduleForm, startDate: event.target.value }); setPreview(null); }} /></label>
              {scheduleForm.recurrenceType !== "ONE_TIME" && <label><span>End date</span><input required type="date" value={scheduleForm.endDate} onChange={(event) => { setScheduleForm({ ...scheduleForm, endDate: event.target.value }); setPreview(null); }} /></label>}
              {scheduleForm.recurrenceType === "WEEKLY" && <fieldset className="wide"><legend>Repeat on</legend><div className="management-duty-weekdays">{WEEKDAYS.map(([value, label]) => <label key={value}><input type="checkbox" checked={scheduleForm.weekdays.includes(value)} onChange={(event) => { setScheduleForm((current) => ({ ...current, weekdays: event.target.checked ? [...current.weekdays, value] : current.weekdays.filter((day) => day !== value) })); setPreview(null); }} /><span>{label}</span></label>)}</div></fieldset>}
              <label className="wide"><span>Place</span><input required minLength={2} value={scheduleForm.reportingLocation} onChange={(event) => { setScheduleForm({ ...scheduleForm, reportingLocation: event.target.value }); setPreview(null); }} /></label>
              <label className="wide"><span>Notes (optional)</span><textarea value={scheduleForm.notes} onChange={(event) => { setScheduleForm({ ...scheduleForm, notes: event.target.value }); setPreview(null); }} /></label>
              {preview && (
                <div className="management-duty-preview wide">
                  <div className="management-duty-preview__summary">
                    <article><span>Total</span><strong>{preview.requestedAssignments}</strong></article>
                    <article><span>Ready</span><strong>{preview.validAssignments}</strong></article>
                    <article className={preview.conflictAssignments ? "has-conflict" : ""}><span>Blocked</span><strong>{preview.conflictAssignments}</strong></article>
                  </div>

                  <section className="management-duty-check">
                    <header>
                      <div>
                        <strong>Check each person</strong>
                        <p>Confirm the shift, date, place and supervisor before saving.</p>
                      </div>
                      <span>{preview.shift.name} · {preview.shift.startTime}–{preview.shift.endTime}</span>
                    </header>
                    <div className="management-duty-check__table">
                      <table>
                        <thead>
                          <tr>
                            <th>Staff</th>
                            <th>Date</th>
                            <th>Place</th>
                            <th>Supervisor</th>
                            <th>Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.people.map((person) => (
                            <tr key={person.account.id}>
                              <td><strong>{accountName(person.account)}</strong><small>{person.account.employee?.empId || roleLabel(person.account.role)}</small></td>
                              <td><strong>{preview.dates.length === 1 ? formatDate(preview.dates[0]) : `${formatDate(preview.dates[0])} – ${formatDate(preview.dates[preview.dates.length - 1])}`}</strong><small>{person.validDates.length} ready · {person.conflicts.length} blocked</small></td>
                              <td>{preview.reportingLocation}</td>
                              <td>{accountName(person.supervisor)}</td>
                              <td>
                                <span className={`management-duty-check__result is-${person.result.toLowerCase().replaceAll("_", "-")}`}>{assignmentCheckLabel(person.result)}</span>
                                {person.conflicts.slice(0, 2).map((conflict) => <small key={`${conflict.date}-${conflict.type}`}>{formatDate(conflict.date)} · {conflict.message}</small>)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {preview.override.hierarchyOverrideCount > 0 && (
                    <section className="management-duty-governance-banner">
                      <DutyIcon name="warning" />
                      <div>
                        <strong>{preview.override.hierarchyOverrideCount} staff need approval</strong>
                        <p>Add a clear reason before assigning these staff.</p>
                      </div>
                    </section>
                  )}

                  {preview.conflictAssignments > 0 && (
                    <fieldset className="management-duty-preview__decision">
                      <legend>Choose what to do</legend>
                      <label className="management-duty-dialog__check">
                        <input type="checkbox" checked={scheduleForm.createValidAssignmentsOnly} onChange={(event) => setScheduleForm((current) => ({ ...current, createValidAssignmentsOnly: event.target.checked, overrideConflicts: event.target.checked ? false : current.overrideConflicts }))} />
                        <span><strong>Assign ready duties only</strong><small>Skip blocked dates.</small></span>
                      </label>
                      {preview.override.canOverrideConflicts && (
                        <label className="management-duty-dialog__check is-override-option">
                          <input type="checkbox" checked={scheduleForm.overrideConflicts} onChange={(event) => setScheduleForm((current) => ({ ...current, overrideConflicts: event.target.checked, createValidAssignmentsOnly: event.target.checked ? false : current.createValidAssignmentsOnly }))} />
                          <span><strong>Allow the blocked duties</strong><small>Super Admin must add a reason.</small></span>
                        </label>
                      )}
                    </fieldset>
                  )}

                  {previewRequiresReason && (
                    <label className="management-duty-preview__reason">
                      <span>Reason</span>
                      <textarea required minLength={10} maxLength={500} value={scheduleForm.overrideReason} onChange={(event) => setScheduleForm((current) => ({ ...current, overrideReason: event.target.value }))} placeholder="Write why this duty must be assigned." />
                      <small>{scheduleForm.overrideReason.trim().length}/500 · At least 10 characters</small>
                    </label>
                  )}
                </div>
              )}
            </div>}

            {dialog === "EXCEPTION" && <div className="management-duty-dialog__grid"><label className="wide"><span>Staff member</span><select required value={exceptionForm.employeeAccountId} onChange={(event) => setExceptionForm({ ...exceptionForm, employeeAccountId: event.target.value })}><option value="">Select staff member</option>{people.map((person) => <option key={person.account.id} value={person.account.id}>{accountName(person)} · {roleLabel(person.account.role)}</option>)}</select></label><label><span>Type</span><select value={exceptionForm.type} onChange={(event) => setExceptionForm({ ...exceptionForm, type: event.target.value as DutyExceptionType })}><option value="LEAVE">Leave</option><option value="HOLIDAY">Holiday</option></select></label><label><span>Date</span><input required type="date" value={exceptionForm.date} onChange={(event) => setExceptionForm({ ...exceptionForm, date: event.target.value })} /></label><label className="wide"><span>Reason / note</span><textarea value={exceptionForm.note} onChange={(event) => setExceptionForm({ ...exceptionForm, note: event.target.value })} /></label></div>}

            {dialog === "EDIT" && selectedAssignment && <div className="management-duty-dialog__grid"><div className="management-duty-dialog__context wide"><strong>{accountName(selectedAssignment.employee)}</strong><p>{formatDateTime(selectedAssignment.startsAt)} · {selectedAssignment.shift.name}</p>{isOverrideAssignment(selectedAssignment) && <small>Special duty set by Super Admin · {selectedAssignment.overrideReason || "Reason unavailable"}</small>}</div><label><span>Shift</span><select value={editForm.shiftTemplateId} onChange={(event) => setEditForm({ ...editForm, shiftTemplateId: event.target.value })}>{templates.filter((template) => template.isActive).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label><span>Supervisor</span><select value={editForm.supervisorAccountId} onChange={(event) => setEditForm({ ...editForm, supervisorAccountId: event.target.value })}>{managers.map((manager) => <option key={manager.account.id} value={manager.account.id}>{manager.account.employee?.empName || manager.account.username}</option>)}</select></label><label className="wide"><span>Place</span><input required value={editForm.reportingLocation} onChange={(event) => setEditForm({ ...editForm, reportingLocation: event.target.value })} /></label><label className="wide"><span>Notes</span><textarea value={editForm.notes} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} /></label></div>}

            {dialog === "CANCEL" && selectedAssignment && <div className="management-duty-dialog__grid"><div className="management-duty-cancel-summary wide"><DutyIcon name="warning" /><div><strong>Cancel {accountName(selectedAssignment.employee)} duty?</strong><p>{formatDateTime(selectedAssignment.startsAt)} · {selectedAssignment.shift.name}</p></div></div><label className="wide"><span>Cancellation reason</span><textarea required minLength={3} maxLength={500} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></label></div>}

            {dialog === "COORDINATE" && selectedHelpRequest && <div className="management-duty-dialog__grid"><div className="management-duty-dialog__context wide"><strong>{selectedHelpRequest.workItem?.ticketNumber} · {selectedHelpRequest.workItem?.title}</strong><p>Requested department: {selectedHelpRequest.requestedDepartment?.name}</p></div><label className="wide"><span>On-duty helper</span><select required value={coordinationHelperId} onChange={(event) => setCoordinationHelperId(event.target.value)}><option value="">Select eligible employee</option>{coordinationCandidates.filter((candidate) => candidate.eligibleForDirectHelp).map((candidate) => <option key={candidate.account.id} value={candidate.account.id}>{candidate.account.employee?.empName || candidate.account.username} · {candidate.workload.active} active work</option>)}</select></label></div>}

            {dialog === "ROUTINE" && selectedPerson && (routineLoading ? <div className="management-duty-dialog__loading">Loading the next 31 days of duty…</div> : <div className="management-duty-routine"><div className="management-duty-routine__summary"><article><span>Role</span><strong>{roleLabel(selectedPerson.account.role)}</strong></article><article><span>Next 31 days</span><strong>{formatHours(selectedPerson.totalScheduledMinutes)}</strong></article><article><span>Current status</span><strong>{statusLabel(selectedPerson.todayStatus)}</strong></article></div><div className="management-duty-routine__list">{routineDates.map((date) => { const assignment = assignmentFor(selectedPerson, date); const exception = exceptionFor(selectedPerson, date); return <article key={date}><strong>{formatDate(date)}</strong>{assignment ? <><span>{assignment.shift.name} · {assignment.shift.startTime}–{assignment.shift.endTime}</span><small>{assignment.reportingLocation} · Supervisor {accountName(assignment.supervisor)}</small></> : exception ? <><span>{exception.type === "LEAVE" ? "Leave" : "Holiday exception"}</span><small>{exception.note || "No note"}</small></> : <span>Off duty</span>}</article>; })}</div></div>)}

            <footer>
              <button type="button" disabled={Boolean(busy)} onClick={() => setDialog(null)}>Close</button>
              {dialog === "SCHEDULE" && preview ? (
                <button type="button" className="is-primary" disabled={Boolean(busy) || createCount === 0 || !conflictDecisionComplete || !overrideReasonValid} onClick={() => void createScheduleFromPreview()}>
                  {busy === "schedule" ? "Assigning..." : `Assign ${createCount}`}
                </button>
              ) : dialog !== "ROUTINE" ? (
                <button
                  type="submit"
                  className={dialog === "CANCEL" || dialog === "SHIFT_DELETE" ? "is-danger" : "is-primary"}
                  disabled={Boolean(busy) || (dialog === "SCHEDULE" && !selectedIds.length)}
                >
                  {busy ? "Saving..." : dialog === "SCHEDULE" ? "Check Before Assigning" : dialog === "SHIFT_DELETE" ? "Delete Shift" : dialog === "SHIFTS" ? selectedTemplate ? "Save Changes" : "Create Shift" : dialog === "CANCEL" ? "Cancel Duty" : dialog === "COORDINATE" ? "Choose Helper" : "Save"}
                </button>
              ) : null}
            </footer>
          </form>
        </div>
      )}
    </main>
  );
}
