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
  createBulkDutySchedule,
  cancelDutyHoliday,
  createDutyCoverageRequirement,
  createDutyHoliday,
  createDutyLeave,
  createDutyShiftTemplate,
  getDutyCalendar,
  getDutyManagementAccessContext,
  getDutyManagementSummary,
  getDutyRoster,
  listDutyAssignments,
  listDutyCoverageRequirements,
  listDutyShiftTemplates,
  listDutySupervisorOptions,
  previewBulkDutySchedule,
  updateDutyAssignment,
  updateDutyCoverageRequirement,
  updateDutyShiftTemplate,
  updateDutyWeeklyOff,
} from "../services/work-management.service";
import type {
  BulkDutyPreviewResponse,
  BulkDutyScheduleInput,
  DutyAssignment,
  DutyAuthorizationContext,
  DutyAssignmentListView,
  DutyCalendarResponse,
  DutyCoverageRequirement,
  DutyHolidayScope,
  DutyHolidayType,
  DutyManagementSummary,
  DutyRecurrenceType,
  DutyRosterPerson,
  DutyRosterResponse,
  DutyShiftScope,
  DutyShiftTemplate,
  DutySupervisorOption,
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
  | "HISTORY"
  | "COVERAGE";
type DutyDialog =
  | "SHIFTS"
  | "SHIFT_DELETE"
  | "SCHEDULE"
  | "LEAVE"
  | "HOLIDAYS"
  | "EDIT"
  | "CANCEL"
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
  const superAdminName =
    "superAdminProfile" in account ? account.superAdminProfile?.fullName : null;
  return account.employee?.empName ?? superAdminName ?? account.username ?? "NT Message user";
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

function assignmentCheckLabel(
  result: BulkDutyPreviewResponse["people"][number]["result"],
): string {
  switch (result) {
    case "READY":
      return "Ready";
    case "PARTLY_READY":
      return "Some dates blocked";
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
  const [accessContext, setAccessContext] = useState<DutyAuthorizationContext | null>(null);
  const canAssignDuty = accessContext?.canAssign ?? false;
  const canManageDuty = accessContext?.canManage ?? false;
  const canManageOfficeConfiguration = accessContext?.canManageOfficeConfiguration ?? false;
  const readOnlyOversight = accessContext?.readOnlyOversight ?? false;
  const [roster, setRoster] = useState<DutyRosterResponse | null>(null);
  const [templates, setTemplates] = useState<DutyShiftTemplate[]>([]);
  const [assignmentTemplates, setAssignmentTemplates] = useState<DutyShiftTemplate[]>([]);
  const [coverageRequirements, setCoverageRequirements] = useState<DutyCoverageRequirement[]>([]);
  const [calendar, setCalendar] = useState<DutyCalendarResponse | null>(null);
  const [history, setHistory] = useState<DutyAssignment[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [managers, setManagers] = useState<DutySupervisorOption[]>([]);
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
  const [weekFrom, setWeekFrom] = useState(initialWeek);
  const weekTo = addDays(weekFrom, 6);
  const [orgUnitId, setOrgUnitId] = useState("");
  const [operationalTeamId, setOperationalTeamId] = useState("");
  const [assignmentOrgUnitId, setAssignmentOrgUnitId] = useState("");
  const [assignmentOperationalTeamId, setAssignmentOperationalTeamId] = useState("");
  const [peopleSearch, setPeopleSearch] = useState("");
  const [peopleSearchDebounced, setPeopleSearchDebounced] = useState("");
  const [historyFrom, setHistoryFrom] = useState(today);
  const [historyTo, setHistoryTo] = useState(addDays(today, 30));
  const [historyPage, setHistoryPage] = useState(1);
  const [assignmentMode, setAssignmentMode] = useState<"ALL" | "ASSIGNED_BY_ME">("ALL");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<DutyRosterPerson[]>([]);
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [assignmentSearchDebounced, setAssignmentSearchDebounced] = useState("");
  const [assignmentCandidates, setAssignmentCandidates] = useState<DutyRosterPerson[]>([]);
  const [assignmentCandidatesLoading, setAssignmentCandidatesLoading] = useState(false);
  const [assignmentCandidatesError, setAssignmentCandidatesError] = useState("");
  const [preview, setPreview] = useState<BulkDutyPreviewResponse | null>(null);
  const dialogPanelRef = useRef<HTMLFormElement>(null);
  const busyRef = useRef(busy);
  const hasLoadedRef = useRef(false);

  const [shiftForm, setShiftForm] = useState({
    name: "",
    startTime: "09:00",
    endTime: "18:00",
    scope: "OFFICE" as DutyShiftScope,
    orgUnitId: "",
  });
  const [scheduleForm, setScheduleForm] = useState({
    shiftTemplateId: "",
    supervisorAccountId: "",
    recurrenceType: "ONE_TIME" as DutyRecurrenceType,
    startDate: today,
    endDate: today,
    weekdays: [0, 1, 2, 3, 4] as number[],
    reportingLocation: "",
    notes: "",
    createValidAssignmentsOnly: false,
  });
  const [leaveForm, setLeaveForm] = useState({
    employeeAccountId: "",
    startDate: today,
    endDate: today,
    note: "",
  });
  const [leaveOrgUnitId, setLeaveOrgUnitId] = useState("");
  const [leaveOperationalTeamId, setLeaveOperationalTeamId] = useState("");
  const [leaveSearch, setLeaveSearch] = useState("");
  const [leaveCandidates, setLeaveCandidates] = useState<DutyRosterPerson[]>([]);
  const [leaveCandidatesLoading, setLeaveCandidatesLoading] = useState(false);
  const [holidayForm, setHolidayForm] = useState({
    name: "",
    type: "GOVERNMENT" as DutyHolidayType,
    startDate: today,
    endDate: today,
    scope: "OFFICE" as DutyHolidayScope,
    orgUnitId: "",
    note: "",
  });
  const [coverageForm, setCoverageForm] = useState({
    orgUnitId: "",
    shiftTemplateId: "",
    dayOfWeek: 0,
    requiredStaff: 1,
    reportingLocation: "",
    effectiveFrom: today,
    effectiveUntil: "",
  });
  const [weeklyOffDays, setWeeklyOffDays] = useState<number[]>([]);
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
    const initialLoad = !hasLoadedRef.current;
    if (initialLoad) setLoading(true);
    setError("");
    try {
      // Load authority first so one secondary data request can never make an authorized
      // manager look read-only or hide Assign Duty / Shifts / Leave controls.
      const accessResponse = await getDutyManagementAccessContext(accessToken);
      setAccessContext(accessResponse);

      const [summaryResponse, templateResponse, calendarResponse, rosterResponse, optionResponse] = await Promise.all([
        getDutyManagementSummary(accessToken),
        listDutyShiftTemplates(accessToken),
        getDutyCalendar(accessToken, { from: today, to: addDays(today, 365) }),
        getDutyRoster(accessToken, {
          from: weekFrom,
          to: weekTo,
          orgUnitId: orgUnitId || undefined,
          operationalTeamId: operationalTeamId || undefined,
          search: peopleSearchDebounced || undefined,
        }),
        listDutySupervisorOptions(accessToken),
      ]);
      setSummary(summaryResponse);
      setTemplates(templateResponse.data);
      setCalendar(calendarResponse);
      setWeeklyOffDays(calendarResponse.weeklyOffDays);
      setRoster(rosterResponse);
      setManagers(optionResponse.data);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      if (initialLoad) {
        hasLoadedRef.current = true;
        setLoading(false);
      }
    }
  }, [accessToken, operationalTeamId, orgUnitId, peopleSearchDebounced, weekFrom, weekTo]);

  const loadHistory = useCallback(async () => {
    if (!accessToken || (view !== "ASSIGNMENTS" && view !== "HISTORY")) return;
    try {
      const response = await listDutyAssignments(accessToken, {
        from: historyFrom,
        to: historyTo,
        orgUnitId: orgUnitId || undefined,
        page: historyPage,
        limit: 25,
        view: activeAssignmentListView ?? "ALL",
        includeCancelled: view === "HISTORY",
      });
      setHistory(response.data);
      setHistoryTotal(response.pagination.total);
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }, [accessToken, activeAssignmentListView, historyFrom, historyPage, historyTo, orgUnitId, view]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void loadData();
    });
    return () => {
      active = false;
    };
  }, [loadData, refreshKey]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void loadHistory();
    });
    return () => {
      active = false;
    };
  }, [loadHistory, refreshKey]);

  useEffect(() => {
    if (view === "ASSIGNMENTS" || view === "HISTORY") {
      queueMicrotask(() => {
        setHistoryPage(1);
      });
    }
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
  const orgUnits = useMemo(
    () => accessContext?.orgUnits ?? [],
    [accessContext?.orgUnits],
  );
  const assignableOrgUnits = useMemo(() => {
    const allowed = new Set(accessContext?.assignableOrgUnitIds ?? []);
    return orgUnits.filter((unit) => allowed.has(unit.id));
  }, [accessContext?.assignableOrgUnitIds, orgUnits]);
  const manageableOrgUnits = useMemo(() => {
    const allowed = new Set(accessContext?.manageableOrgUnitIds ?? []);
    return orgUnits.filter((unit) => allowed.has(unit.id));
  }, [accessContext?.manageableOrgUnitIds, orgUnits]);
  const descendantOrgUnitIds = useCallback((rootOrgUnitId: string) => {
    const ids = new Set<string>([rootOrgUnitId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const unit of orgUnits) {
        if (unit.parentOrgUnitId && ids.has(unit.parentOrgUnitId) && !ids.has(unit.id)) {
          ids.add(unit.id);
          changed = true;
        }
      }
    }
    return ids;
  }, [orgUnits]);
  const orgUnitLabel = useCallback((orgUnitId: string) => {
    const byId = new Map(orgUnits.map((unit) => [unit.id, unit]));
    const parts: string[] = [];
    const seen = new Set<string>();
    let current = byId.get(orgUnitId);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      parts.unshift(current.name);
      current = current.parentOrgUnitId ? byId.get(current.parentOrgUnitId) : undefined;
    }
    return parts.join(" › ");
  }, [orgUnits]);

  const operationalTeams = useMemo(() => {
    if (!orgUnitId) return accessContext?.operationalTeams ?? [];
    const allowed = descendantOrgUnitIds(orgUnitId);
    return (accessContext?.operationalTeams ?? []).filter((team) => allowed.has(team.orgUnitId));
  }, [accessContext?.operationalTeams, descendantOrgUnitIds, orgUnitId]);
  const assignmentTeams = useMemo(() => {
    if (!assignmentOrgUnitId) return [];
    const allowed = descendantOrgUnitIds(assignmentOrgUnitId);
    return (accessContext?.operationalTeams ?? []).filter((team) => allowed.has(team.orgUnitId));
  }, [accessContext?.operationalTeams, assignmentOrgUnitId, descendantOrgUnitIds]);
  const leaveTeams = useMemo(() => {
    if (!leaveOrgUnitId) return [];
    const allowed = descendantOrgUnitIds(leaveOrgUnitId);
    return (accessContext?.operationalTeams ?? []).filter((team) => allowed.has(team.orgUnitId));
  }, [accessContext?.operationalTeams, descendantOrgUnitIds, leaveOrgUnitId]);
  const coverageShiftOptions = useMemo(() => {
    if (!coverageForm.orgUnitId) return templates.filter((template) => template.isActive && template.scope === "OFFICE");
    return templates.filter((template) => {
      if (!template.isActive) return false;
      if (!template.orgUnitId) return true;
      return descendantOrgUnitIds(template.orgUnitId).has(coverageForm.orgUnitId);
    });
  }, [coverageForm.orgUnitId, descendantOrgUnitIds, templates]);
  const editShiftOptions = useMemo(() => {
    const assignmentOrgUnitId = selectedAssignment?.orgUnit?.id;
    return templates.filter((template) => {
      if (!template.isActive) return false;
      if (!template.orgUnitId) return true;
      if (!assignmentOrgUnitId) return false;
      return descendantOrgUnitIds(template.orgUnitId).has(assignmentOrgUnitId);
    });
  }, [descendantOrgUnitIds, selectedAssignment?.orgUnit?.id, templates]);
  const assignmentScopeReady = Boolean(assignmentOrgUnitId);
  const currentManagerName = account?.displayName || account?.username || roleLabel(account?.role ?? "MANAGER");

  useEffect(() => {
    const timer = window.setTimeout(() => setPeopleSearchDebounced(peopleSearch.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [peopleSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => setAssignmentSearchDebounced(assignmentSearch.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [assignmentSearch]);

  useEffect(() => {
    let cancelled = false;
    if (!accessToken || dialog !== "LEAVE" || !leaveOrgUnitId) {
      queueMicrotask(() => {
        if (!cancelled) {
          setLeaveCandidates([]);
          setLeaveCandidatesLoading(false);
        }
      });
      return () => { cancelled = true; };
    }
    queueMicrotask(() => { if (!cancelled) setLeaveCandidatesLoading(true); });
    const timer = window.setTimeout(() => {
      void getDutyRoster(accessToken, {
        from: leaveForm.startDate,
        to: leaveForm.startDate,
        orgUnitId: leaveOrgUnitId,
        operationalTeamId: leaveOperationalTeamId || undefined,
        search: leaveSearch.trim() || undefined,
        limit: 40,
      }).then((response) => {
        if (!cancelled) setLeaveCandidates(response.people);
      }).catch((leaveError) => {
        if (!cancelled) {
          setLeaveCandidates([]);
          setError(errorMessage(leaveError));
        }
      }).finally(() => { if (!cancelled) setLeaveCandidatesLoading(false); });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [accessToken, dialog, leaveForm.startDate, leaveOperationalTeamId, leaveOrgUnitId, leaveSearch]);

  useEffect(() => {
    let cancelled = false;

    if (!accessToken || dialog !== "SCHEDULE" || !assignmentScopeReady) {
      queueMicrotask(() => {
        if (cancelled) {
          return;
        }

        setAssignmentCandidates([]);
        setAssignmentCandidatesLoading(false);
        setAssignmentCandidatesError("");
      });

      return () => {
        cancelled = true;
      };
    }

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      setAssignmentCandidatesLoading(true);
      setAssignmentCandidatesError("");
    });
    void getDutyRoster(accessToken, {
      from: scheduleForm.startDate,
      to: scheduleForm.startDate,
      orgUnitId: assignmentOrgUnitId || undefined,
      operationalTeamId: assignmentOperationalTeamId || undefined,
      search: assignmentSearchDebounced || undefined,
      limit: 40,
    })
      .then((response) => {
        if (cancelled) return;
        setAssignmentCandidates(response.people);
      })
      .catch((candidateError) => {
        if (cancelled) return;
        setAssignmentCandidates([]);
        setAssignmentCandidatesError(errorMessage(candidateError));
      })
      .finally(() => {
        if (!cancelled) setAssignmentCandidatesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    assignmentOperationalTeamId,
    assignmentOrgUnitId,
    assignmentScopeReady,
    assignmentSearchDebounced,
    dialog,
    scheduleForm.startDate,
  ]);

  useEffect(() => {
    let cancelled = false;

    if (!accessToken || dialog !== "SCHEDULE" || selectedStaff.length === 0) {
      queueMicrotask(() => {
        if (cancelled) {
          return;
        }

        setAssignmentTemplates([]);
        setScheduleForm((current) => current.shiftTemplateId ? { ...current, shiftTemplateId: "" } : current);
      });

      return () => {
        cancelled = true;
      };
    }

    void listDutyShiftTemplates(accessToken, assignmentOrgUnitId
      ? { targetScope: "ORG_UNIT", orgUnitId: assignmentOrgUnitId }
      : {}).then((response) => {
      if (cancelled) return;
      const active = response.data.filter((template) => template.isActive);
      setAssignmentTemplates(active);
      setScheduleForm((current) => ({
        ...current,
        shiftTemplateId: active.some((template) => template.id === current.shiftTemplateId)
          ? current.shiftTemplateId
          : "",
      }));
    }).catch((shiftError) => {
      if (!cancelled) {
        setAssignmentTemplates([]);
        setError(errorMessage(shiftError));
      }
    });
    return () => { cancelled = true; };
  }, [accessToken, assignmentOrgUnitId, dialog, selectedStaff]);

  useEffect(() => {
    let cancelled = false;
    if (!accessToken || view !== "COVERAGE" || !canManageDuty) return;
    void listDutyCoverageRequirements(accessToken, orgUnitId ? { orgUnitId } : {})
      .then((response) => { if (!cancelled) setCoverageRequirements(response.items); })
      .catch((coverageError) => { if (!cancelled) setError(errorMessage(coverageError)); });
    return () => { cancelled = true; };
  }, [accessToken, canManageDuty, orgUnitId, refreshKey, view]);

  useEffect(() => {
    // Roster selections follow the visible list, but the Assign Duty picker owns its own scoped selection.
    if (dialog === "SCHEDULE") return;
    const visibleIds = new Set(people.map((person) => person.account.id));
    queueMicrotask(() => {
      setSelectedIds((current) => {
        const next = current.filter((id) => visibleIds.has(id));
        return next.length === current.length ? current : next;
      });
    });
  }, [dialog, people]);
  const schedulePayload = useCallback((): BulkDutyScheduleInput => ({
    employeeAccountIds: selectedIds,
    orgUnitId: assignmentOrgUnitId || undefined,
    operationalTeamId: assignmentOperationalTeamId || undefined,
    shiftTemplateId: scheduleForm.shiftTemplateId,
    supervisorAccountId: scheduleForm.supervisorAccountId || undefined,
    recurrenceType: scheduleForm.recurrenceType,
    startDate: scheduleForm.startDate,
    endDate: scheduleForm.recurrenceType === "ONE_TIME" ? undefined : scheduleForm.endDate,
    weekdays: scheduleForm.recurrenceType === "WEEKLY" ? scheduleForm.weekdays : undefined,
    reportingLocation: scheduleForm.reportingLocation,
    notes: scheduleForm.notes || undefined,
    createValidAssignmentsOnly: scheduleForm.createValidAssignmentsOnly,
  }), [assignmentOperationalTeamId, assignmentOrgUnitId, scheduleForm, selectedIds]);

  function openSchedule(ids: string[]) {
    const preselectedPeople = people.filter((person) => ids.includes(person.account.id));
    const initialStaff = preselectedPeople;
    setSelectedIds(initialStaff.map((person) => person.account.id));
    setSelectedStaff(initialStaff);
    setAssignmentSearch("");
    setAssignmentSearchDebounced("");
    setAssignmentCandidates([]);
    setAssignmentCandidatesError("");
    setPreview(null);
    const initialOrgUnitId = orgUnitId || (assignableOrgUnits.length === 1 ? assignableOrgUnits[0].id : "");
    setAssignmentOrgUnitId(initialOrgUnitId);
    setAssignmentOperationalTeamId(initialOrgUnitId && operationalTeamId ? operationalTeamId : "");
    // Each assignment starts from the current manager as the supervisor.
    setScheduleForm((current) => ({
      ...current,
      supervisorAccountId: "",
      shiftTemplateId: "",
      reportingLocation: current.reportingLocation || accessContext?.office?.name || "",
      createValidAssignmentsOnly: false,
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
      setSelectedStaff([]);
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy("");
    }
  }

  function openShiftManager() {
    setSelectedTemplate(null);
    setShiftForm({
      name: "",
      startTime: "09:00",
      endTime: "18:00",
      scope: canManageOfficeConfiguration ? "OFFICE" : "ORG_UNIT",
      orgUnitId: accessContext?.primaryOrgUnitId ?? "",
    });
    setDialog("SHIFTS");
  }

  function editShift(template: DutyShiftTemplate) {
    setSelectedTemplate(template);
    setShiftForm({
      name: template.name,
      startTime: template.startTime,
      endTime: template.endTime,
      scope: template.scope,
      orgUnitId: template.orgUnitId ?? "",
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
        ? await updateDutyShiftTemplate(accessToken, selectedTemplate.id, {
            name: shiftForm.name, startTime: shiftForm.startTime, endTime: shiftForm.endTime,
          })
        : await createDutyShiftTemplate(accessToken, {
            name: shiftForm.name,
            startTime: shiftForm.startTime,
            endTime: shiftForm.endTime,
            scope: shiftForm.scope,
            orgUnitId: shiftForm.scope === "ORG_UNIT" ? shiftForm.orgUnitId || undefined : undefined,
          });
      setSuccess(response.message);
      setSelectedTemplate(null);
      setShiftForm({
        name: "", startTime: "09:00", endTime: "18:00",
        scope: canManageOfficeConfiguration ? "OFFICE" : "ORG_UNIT",
        orgUnitId: accessContext?.primaryOrgUnitId ?? "",
      });
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

  function openLeave() {
    const initialOrgUnitId = orgUnitId || (assignableOrgUnits.length === 1 ? assignableOrgUnits[0].id : "");
    setLeaveOrgUnitId(initialOrgUnitId);
    setLeaveOperationalTeamId(initialOrgUnitId && operationalTeamId ? operationalTeamId : "");
    setLeaveSearch("");
    setLeaveCandidates([]);
    setLeaveForm((current) => ({ ...current, employeeAccountId: "" }));
    setDialog("LEAVE");
  }

  async function submitLeave(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setBusy("leave");
    setError("");
    try {
      const response = await createDutyLeave(accessToken, leaveForm);
      setSuccess(response.message);
      setDialog(null);
      setLeaveForm({ employeeAccountId: "", startDate: today, endDate: today, note: "" });
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy("");
    }
  }

  function openHolidayCalendar() {
    setHolidayForm((current) => ({
      ...current,
      scope: canManageOfficeConfiguration ? current.scope : "ORG_UNIT",
      orgUnitId: canManageOfficeConfiguration
        ? current.orgUnitId
        : (current.orgUnitId || accessContext?.primaryOrgUnitId || ""),
    }));
    setDialog("HOLIDAYS");
  }

  async function submitHoliday(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canManageDuty) return;
    setBusy("holiday");
    setError("");
    try {
      const response = await createDutyHoliday(accessToken, {
        ...holidayForm,
        orgUnitId: holidayForm.scope === "ORG_UNIT" ? holidayForm.orgUnitId || undefined : undefined,
        note: holidayForm.note || undefined,
      });
      setSuccess(response.message);
      const nextCalendar = await getDutyCalendar(accessToken, { from: today, to: addDays(today, 365) });
      setCalendar(nextCalendar);
      setWeeklyOffDays(nextCalendar.weeklyOffDays);
      setHolidayForm({
        name: "",
        type: "GOVERNMENT",
        startDate: today,
        endDate: today,
        scope: canManageOfficeConfiguration ? "OFFICE" : "ORG_UNIT",
        orgUnitId: accessContext?.primaryOrgUnitId ?? "",
        note: "",
      });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy("");
    }
  }

  async function saveWeeklyOff() {
    if (!accessToken || !canManageOfficeConfiguration) return;
    setBusy("weekly-off");
    setError("");
    try {
      const response = await updateDutyWeeklyOff(accessToken, weeklyOffDays);
      setSuccess(response.message);
      const nextCalendar = await getDutyCalendar(accessToken, {
        from: today,
        to: addDays(today, 365),
      });
      setCalendar(nextCalendar);
      setWeeklyOffDays(nextCalendar.weeklyOffDays);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy("");
    }
  }

  async function removeHoliday(holidayId: string) {
    if (!accessToken || !canManageDuty) return;
    setBusy(`holiday-${holidayId}`);
    setError("");
    try {
      const response = await cancelDutyHoliday(accessToken, holidayId);
      setSuccess(response.message);
      const nextCalendar = await getDutyCalendar(accessToken, { from: today, to: addDays(today, 365) });
      setCalendar(nextCalendar);
      setWeeklyOffDays(nextCalendar.weeklyOffDays);
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy("");
    }
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

  async function submitCoverageRequirement(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canManageDuty || !coverageForm.orgUnitId || !coverageForm.shiftTemplateId) return;
    setBusy("coverage");
    setError("");
    try {
      await createDutyCoverageRequirement(accessToken, {
        orgUnitId: coverageForm.orgUnitId,
        shiftTemplateId: coverageForm.shiftTemplateId,
        dayOfWeek: coverageForm.dayOfWeek,
        requiredStaff: coverageForm.requiredStaff,
        reportingLocation: coverageForm.reportingLocation.trim() || undefined,
        effectiveFrom: coverageForm.effectiveFrom,
        effectiveUntil: coverageForm.effectiveUntil || undefined,
      });
      setSuccess("Coverage requirement saved.");
      setCoverageForm((current) => ({ ...current, shiftTemplateId: "", requiredStaff: 1, reportingLocation: "", effectiveUntil: "" }));
      setRefreshKey((value) => value + 1);
    } catch (coverageError) {
      setError(errorMessage(coverageError));
    } finally {
      setBusy("");
    }
  }

  async function endCoverageRequirement(requirement: DutyCoverageRequirement) {
    if (!accessToken || !canManageDuty) return;
    setBusy(`coverage-${requirement.id}`);
    setError("");
    try {
      await updateDutyCoverageRequirement(accessToken, requirement.id, { effectiveUntil: today });
      setSuccess("Coverage requirement ended.");
      setRefreshKey((value) => value + 1);
    } catch (coverageError) {
      setError(errorMessage(coverageError));
    } finally {
      setBusy("");
    }
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
    setPeopleSearch("");
    setPeopleSearchDebounced("");
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

  const scopeLabel = readOnlyOversight
    ? "Duty oversight"
    : accessContext?.operationalTeamLeadIds.length
      ? "Operational Team duty"
      : "Organization duty";

  const assignmentViews = new Set<DutyView>(["ASSIGNMENTS", "HISTORY"]);
  const createCount = preview
    ? preview.validAssignments
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
      label: "On leave",
      value: summary?.totals.leaveToday ?? 0,
      note: "Approved leave today",
      icon: "leave",
    },
    {
      label: "Cancelled today",
      value: summary?.totals.cancelledToday ?? 0,
      note: "Cancelled duty assignments",
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
          <p>{readOnlyOversight ? "View duty schedules and history without operational changes." : "Plan shifts, assign staff and check the week in one place."}</p>
        </div>
        <div className="management-duty-header__actions">
          {canAssignDuty && (
            <button type="button" className="is-primary" disabled={loading} onClick={() => openSchedule(selectedIds)}>
              <DutyIcon name="calendar" /> Assign Duty
            </button>
          )}
          {canManageDuty && (
            <button type="button" onClick={openShiftManager}>
              <DutyIcon name="settings" /> Shifts
            </button>
          )}
          {canAssignDuty && (
            <button type="button" onClick={openLeave}>
              <DutyIcon name="leave" /> Leave
            </button>
          )}
          <button type="button" onClick={openHolidayCalendar}>
            <DutyIcon name="calendar" /> Holiday Calendar
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

      {readOnlyOversight && <div className="management-duty-message" role="status"><strong>Read-only oversight.</strong> You can review Duty information, but operational actions are not available.</div>}
      {error && <div className="management-duty-message is-error" role="alert">{error}</div>}
      {success && <div className="management-duty-message is-success" role="status">{success}</div>}
      {summary && (summary.calendarToday.weeklyOff || summary.calendarToday.holidays.length > 0) && (
        <div className="management-duty-calendar-banner" role="status">
          <DutyIcon name="calendar" />
          <div>
            <strong>{summary.calendarToday.holidays.length > 0 ? summary.calendarToday.holidays.map((holiday) => holiday.name).join(" · ") : "Weekly off"}</strong>
            <span>Operational duty can still be scheduled today when coverage is required.</span>
          </div>
        </div>
      )}

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
            ["PEOPLE", "Staff"],
            ["ASSIGNMENTS", "Assignments"],
            ["HISTORY", "History"],
            ...(canManageDuty ? [["COVERAGE", "Coverage"] as [DutyView, string]] : []),
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
            <label>
              <span>Org Unit</span>
              <select value={orgUnitId} onChange={(event) => { setOrgUnitId(event.target.value); setOperationalTeamId(""); setHistoryPage(1); }}>
                <option value="">All permitted Org Units</option>
                {orgUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Operational Team</span>
              <select value={operationalTeamId} onChange={(event) => { setOperationalTeamId(event.target.value); setHistoryPage(1); }}>
                <option value="">All permitted teams</option>
                {operationalTeams.map((team) => (
                  <option key={team.id} value={team.id}>{team.code} · {team.name}</option>
                ))}
              </select>
            </label>
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
                {orgUnits.map((unit) => (
                  <button key={unit.id} type="button" onClick={() => { setOrgUnitId(unit.id); setOperationalTeamId(""); setView("WEEKLY"); }}>
                    <span>{unit.code} · {unit.name}</span>
                    <strong>Org Unit</strong>
                    <small>Open the scoped weekly roster</small>
                  </button>
                ))}
                {!orgUnits.length && <p>No permitted Org Unit information is available.</p>}
              </div>
            </section>
            <section className="management-duty-panel management-duty-overview__days">
              <header><div><span>Daily view</span><h2>People scheduled each day</h2></div></header>
              <div className="management-duty-daily-grid">
                {roster?.daily.map((day) => (
                  <article key={day.date}>
                    <span>{formatDate(day.date)}</span>
                    <strong>{day.scheduledPeople}</strong>
                    <small>{day.assignmentCount} duties</small>
                    <div><em>{day.leaveCount} leave</em></div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {view === "PEOPLE" && (
          <section className="management-duty-panel management-duty-people">
            <header>
              <div><span>Staff list</span><h2>Staff</h2></div>
              <div><strong>{selectedIds.length} selected</strong><button type="button" disabled={!selectedIds.length} onClick={() => openSchedule(selectedIds)}>Assign selected</button></div>
            </header>
            <div className="management-duty-people__list">
              {people.map((person) => (
                <article key={person.account.id} className={selectedIds.includes(person.account.id) ? "is-selected" : ""}>
                  <input type="checkbox" aria-label={`Select ${accountName(person)}`} checked={selectedIds.includes(person.account.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, person.account.id])] : current.filter((id) => id !== person.account.id))} />
                  <button type="button" className="management-duty-person" onClick={() => void openRoutine(person)}>
                    <span><strong>{accountName(person)}</strong><small>{person.account.employee?.designation || "NTC staff"} · {person.account.employee?.empId || "Office user"}</small></span>
                    <span><small>Today</small><strong>{statusLabel(person.todayStatus)}</strong></span>
                    <span><small>This week</small><strong>{formatHours(person.totalScheduledMinutes)}</strong></span>
                    <span><small>Next duty</small><strong>{person.next ? formatDateTime(person.next.startsAt) : "Not scheduled"}</strong></span>
                  </button>
                  {canAssignDuty && <button type="button" onClick={() => openSchedule([person.account.id])}>Assign</button>}
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
                      <th><button type="button" onClick={() => void openRoutine(person)}><strong>{accountName(person)}</strong><small>{person.account.employee?.designation || person.account.employee?.empId || "Office staff"}</small></button></th>
                      {roster?.period.days.map((date) => {
                        const assignment = assignmentFor(person, date);
                        const exception = exceptionFor(person, date);
                        if (assignment) {
                          const protectedOverride = false;
                          return (
                            <td key={date}>
                              <button
                                type="button"
                                className="duty-cell is-scheduled"
                                disabled={!canAssignDuty}
                                onClick={() => {
                                  if (!canAssignDuty) return;
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

                              </button>
                            </td>
                          );
                        }
                        if (exception) {
                          return <td key={date}><span className={`duty-cell is-${exception.type.toLowerCase()}`}><strong>{exception.type === "LEAVE" ? "Leave" : "Holiday"}</strong><small>{exception.note || "Recorded"}</small></span></td>;
                        }
                        return <td key={date}>{canAssignDuty ? <button type="button" className="duty-cell is-empty" onClick={() => { setScheduleForm((current) => ({ ...current, startDate: date, endDate: date, recurrenceType: "ONE_TIME" })); openSchedule([person.account.id]); }}>Assign</button> : <span className="duty-cell is-empty"><small>Unassigned</small></span>}</td>;
                      })}
                    </tr>
                  ))}
                  {!people.length && <tr><td colSpan={(roster?.period.days.length ?? 0) + 1}>No staff found.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {view === "COVERAGE" && canManageDuty && (
          <section className="management-duty-panel">
            <header><div><span>Duty settings</span><h2>Coverage Requirements</h2><p>Set the minimum planned staffing for an Org Unit, shift and weekday. This is a planning target, not attendance.</p></div><strong>{coverageRequirements.length}</strong></header>
            <form className="management-duty-dialog__grid" onSubmit={submitCoverageRequirement}>
              <label><span>Org Unit</span><select required value={coverageForm.orgUnitId} onChange={(event) => setCoverageForm((current) => ({ ...current, orgUnitId: event.target.value, shiftTemplateId: "" }))}><option value="">Select manageable Org Unit</option>{manageableOrgUnits.map((unit) => <option key={unit.id} value={unit.id}>{orgUnitLabel(unit.id)}</option>)}</select></label>
              <label><span>Shift</span><select required disabled={!coverageForm.orgUnitId} value={coverageForm.shiftTemplateId} onChange={(event) => setCoverageForm((current) => ({ ...current, shiftTemplateId: event.target.value }))}><option value="">Select applicable shift</option>{coverageShiftOptions.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.startTime}–{template.endTime}</option>)}</select></label>
              <label><span>Weekday</span><select value={coverageForm.dayOfWeek} onChange={(event) => setCoverageForm((current) => ({ ...current, dayOfWeek: Number(event.target.value) }))}>{WEEKDAYS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>Required staff</span><input required min={1} max={500} type="number" value={coverageForm.requiredStaff} onChange={(event) => setCoverageForm((current) => ({ ...current, requiredStaff: Number(event.target.value) }))} /></label>
              <label><span>Effective from</span><input required type="date" value={coverageForm.effectiveFrom} onChange={(event) => setCoverageForm((current) => ({ ...current, effectiveFrom: event.target.value }))} /></label>
              <label><span>Effective until (optional)</span><input type="date" min={coverageForm.effectiveFrom} value={coverageForm.effectiveUntil} onChange={(event) => setCoverageForm((current) => ({ ...current, effectiveUntil: event.target.value }))} /></label>
              <label className="wide"><span>Reporting location (optional)</span><input value={coverageForm.reportingLocation} onChange={(event) => setCoverageForm((current) => ({ ...current, reportingLocation: event.target.value }))} /></label>
              <div className="wide"><button type="submit" className="is-primary" disabled={busy === "coverage"}>{busy === "coverage" ? "Saving…" : "Add Coverage Requirement"}</button></div>
            </form>
            <div className="management-duty-table-wrap">
              <table>
                <thead><tr><th>Org Unit</th><th>Shift</th><th>Day</th><th>Required</th><th>Location</th><th>Effective</th><th>Action</th></tr></thead>
                <tbody>
                  {coverageRequirements.map((requirement) => <tr key={requirement.id}><td>{requirement.orgUnit.name}</td><td>{requirement.shift.name}</td><td>{WEEKDAYS.find(([value]) => value === requirement.dayOfWeek)?.[1] ?? requirement.dayOfWeek}</td><td>{requirement.requiredStaff}</td><td>{requirement.reportingLocation || "—"}</td><td>{formatDate(requirement.effectiveFrom)}{requirement.effectiveUntil ? ` – ${formatDate(requirement.effectiveUntil)}` : " onward"}</td><td>{!requirement.effectiveUntil && <button type="button" className="is-danger" disabled={busy === `coverage-${requirement.id}`} onClick={() => void endCoverageRequirement(requirement)}>End</button>}</td></tr>)}
                  {!coverageRequirements.length && <tr><td colSpan={7}>No coverage requirements are configured for this scope.</td></tr>}
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
                <thead><tr><th>Staff</th><th>Date & shift</th><th>Assigned by</th><th>Location</th><th>Supervisor</th><th>Status</th>{view === "ASSIGNMENTS" && canAssignDuty && <th>Actions</th>}</tr></thead>
                <tbody>
                  {history.map((assignment) => {
                    const protectedOverride = false;
                    return (
                      <tr key={assignment.id}>
                        <td><strong>{accountName(assignment.employee)}</strong><small>{assignment.operationalTeam?.name || assignment.orgUnit?.name || assignment.employee.employee?.designation || "Office staff"}</small></td>
                        <td><strong>{formatDateTime(assignment.startsAt)}</strong><small>{assignment.shift.name} · {assignment.shift.startTime}–{assignment.shift.endTime}</small></td>
                        <td><strong>{accountName(assignment.createdBy)}</strong><small>{assignment.createdBy.employee?.designation || "Office user"}</small></td>
                        <td>{assignment.reportingLocation}</td>
                        <td>{accountName(assignment.supervisor)}</td>
                        <td><span className={assignment.cancelledAt ? "is-cancelled" : "is-scheduled"}>{assignment.cancelledAt ? "Cancelled" : new Date(assignment.startsAt) <= new Date() && new Date(assignment.endsAt) > new Date() ? "On Duty" : new Date(assignment.endsAt) <= new Date() ? "Past Schedule" : "Scheduled"}</span></td>
                        {view === "ASSIGNMENTS" && canAssignDuty && (
                          <td>
                            <button type="button" disabled={Boolean(assignment.cancelledAt) || protectedOverride} title={protectedOverride ? "Only Super Admin can change this special assignment." : undefined} onClick={() => { setSelectedAssignment(assignment); setEditForm({ shiftTemplateId: assignment.shiftTemplateId ?? "", supervisorAccountId: assignment.supervisorAccountId, reportingLocation: assignment.reportingLocation, notes: assignment.notes || "" }); setDialog("EDIT"); }}>Change</button>
                            <button type="button" className="is-danger" disabled={Boolean(assignment.cancelledAt) || protectedOverride} title={protectedOverride ? "Only Super Admin can cancel this special assignment." : undefined} onClick={() => { setSelectedAssignment(assignment); setCancelReason(""); setDialog("CANCEL"); }}>Cancel</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {!history.length && <tr><td colSpan={view === "ASSIGNMENTS" && canAssignDuty ? 7 : 6}>No duty history was found for these dates.</td></tr>}
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
          <form ref={dialogPanelRef} role="dialog" aria-modal="true" aria-labelledby="duty-dialog-title" className="management-duty-dialog__panel" onSubmit={dialog === "SHIFTS" ? submitShift : dialog === "SHIFT_DELETE" ? submitDeleteShift : dialog === "SCHEDULE" ? previewSchedule : dialog === "LEAVE" ? submitLeave : dialog === "HOLIDAYS" ? submitHoliday : dialog === "EDIT" ? submitEdit : dialog === "CANCEL" ? submitCancel : (event) => event.preventDefault()}>
            <header><div><span>Duty Roster</span><h2 id="duty-dialog-title">{dialog === "SHIFTS" ? "Shifts" : dialog === "SHIFT_DELETE" ? "Delete Shift" : dialog === "SCHEDULE" ? preview ? "Review Duty Assignment" : "Assign Duty" : dialog === "LEAVE" ? "Record Leave" : dialog === "HOLIDAYS" ? "Holiday Calendar" : dialog === "EDIT" ? "Change Duty" : dialog === "CANCEL" ? "Cancel Duty" : `${accountName(selectedPerson)} Duty`}</h2></div><button type="button" aria-label="Close dialog" disabled={Boolean(busy)} onClick={() => setDialog(null)}><DutyIcon name="close" /></button></header>

            {dialog === "SHIFTS" && (
              <div className="management-duty-shifts">
                <section className="management-duty-shifts__list">
                  <div className="management-duty-shifts__heading">
                    <div><strong>Saved Shifts</strong><span>Create, edit or delete shifts.</span></div>
                    <button type="button" onClick={() => {
                      setSelectedTemplate(null);
                      setShiftForm({
                        name: "", startTime: "09:00", endTime: "18:00",
                        scope: canManageOfficeConfiguration ? "OFFICE" : "ORG_UNIT",
                        orgUnitId: accessContext?.primaryOrgUnitId ?? "",
                      });
                    }}>New Shift</button>
                  </div>
                  {templates.length ? templates.map((template) => (
                    <article key={template.id}>
                      <div>
                        <strong>{template.name}</strong>
                        <span>{template.startTime}–{template.endTime}{template.spansNextDay ? " · next day" : ""}</span>
                        <small>{template.scope === "OFFICE" ? "Office-wide" : template.orgUnit?.name ?? "Org Unit"}</small>
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
                    <p>Define the time and where this shift can be used.</p>
                  </div>
                  <label><span>Shift name</span><input required minLength={2} value={shiftForm.name} onChange={(event) => setShiftForm({ ...shiftForm, name: event.target.value })} /></label>
                  <label><span>Start time</span><input required type="time" value={shiftForm.startTime} onChange={(event) => setShiftForm({ ...shiftForm, startTime: event.target.value })} /></label>
                  <label><span>End time</span><input required type="time" value={shiftForm.endTime} onChange={(event) => setShiftForm({ ...shiftForm, endTime: event.target.value })} /></label>
                  {!selectedTemplate && (
                    <>
                      <label><span>Available for</span><select value={shiftForm.scope} onChange={(event) => { const scope = event.target.value as DutyShiftScope; setShiftForm((current) => ({ ...current, scope, orgUnitId: scope === "ORG_UNIT" ? current.orgUnitId : "" })); }}>
                        {canManageOfficeConfiguration && <option value="OFFICE">Entire Office</option>}
                        <option value="ORG_UNIT">One Org Unit</option>
                      </select></label>
                      {shiftForm.scope === "ORG_UNIT" && (
                        <label><span>Org Unit</span><select required value={shiftForm.orgUnitId} onChange={(event) => setShiftForm((current) => ({ ...current, orgUnitId: event.target.value }))}><option value="">Select Org Unit</option>{manageableOrgUnits.map((orgUnit) => <option key={orgUnit.id} value={orgUnit.id}>{orgUnitLabel(orgUnit.id)}</option>)}</select></label>
                      )}
                    </>
                  )}
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

            {dialog === "SCHEDULE" && <div className="management-duty-dialog__grid management-duty-dialog__grid--assignment">
              <section className="management-duty-assignment-step wide">
                <div className="management-duty-assignment-step__heading">
                  <span>1</span>
                  <div><strong>Choose staff</strong><small>Select the organization scope first, then choose one or more people.</small></div>
                </div>
                <div className="management-duty-assignment-scope">
                  <label>
                    <span>Org Unit</span>
                    <select required value={assignmentOrgUnitId} onChange={(event) => {
                      setAssignmentOrgUnitId(event.target.value);
                      setAssignmentOperationalTeamId("");
                      setSelectedIds([]);
                      setSelectedStaff([]);
                      setPreview(null);
                    }}>
                      <option value="">Select authorized Org Unit</option>
                      {assignableOrgUnits.map((unit) => <option key={unit.id} value={unit.id}>{orgUnitLabel(unit.id)}</option>)}
                    </select>
                    <small>Includes members in this Org Unit and its descendants.</small>
                  </label>
                  <label>
                    <span>Operational Team (optional)</span>
                    <select disabled={!assignmentOrgUnitId} value={assignmentOperationalTeamId} onChange={(event) => {
                      setAssignmentOperationalTeamId(event.target.value);
                      setSelectedIds([]);
                      setSelectedStaff([]);
                      setPreview(null);
                    }}>
                      <option value="">All teams in selected subtree</option>
                      {assignmentTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                    </select>
                  </label>
                </div>

                <div className="management-duty-staff-picker management-duty-staff-picker--searchable">
                  {selectedStaff.length > 0 && (
                    <div className="management-duty-selected-staff" aria-label="Selected staff">
                      <div><strong>Selected staff</strong><span>{selectedStaff.length} selected</span></div>
                      <div className="management-duty-selected-staff__chips">
                        {selectedStaff.map((person) => (
                          <button key={person.account.id} type="button" onClick={() => { setSelectedStaff((current) => current.filter((item) => item.account.id !== person.account.id)); setSelectedIds((current) => current.filter((id) => id !== person.account.id)); setPreview(null); }} aria-label={`Remove ${accountName(person)}`}>
                            <span>{accountName(person)}</span><em>×</em>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="management-duty-staff-picker__toolbar">
                    <label>
                      <span>Find staff</span>
                      <input value={assignmentSearch} onChange={(event) => setAssignmentSearch(event.target.value)} placeholder="Search name, employee ID or position" disabled={!assignmentScopeReady} />
                    </label>
                    <div><strong>{selectedStaff.length} selected</strong><small>Showing up to 40 matches</small></div>
                  </div>
                  {!assignmentScopeReady ? (
                    <div className="management-duty-staff-picker__empty">Choose the required organization fields first.</div>
                  ) : assignmentCandidatesLoading ? (
                    <div className="management-duty-staff-picker__empty is-loading">Searching eligible staff…</div>
                  ) : assignmentCandidatesError ? (
                    <div className="management-duty-staff-picker__empty is-error">{assignmentCandidatesError}</div>
                  ) : assignmentCandidates.length ? (
                    <div className="management-duty-staff-picker__results" role="listbox" aria-label="Staff search results">
                      {assignmentCandidates.map((person) => {
                        const selected = selectedIds.includes(person.account.id);
                        return (
                          <button
                            key={person.account.id}
                            type="button"
                            className={selected ? "is-selected" : ""}
                            onClick={() => {
                              if (selected) {
                                setSelectedIds((current) => current.filter((id) => id !== person.account.id));
                                setSelectedStaff((current) => current.filter((item) => item.account.id !== person.account.id));
                              } else {
                                setSelectedIds((current) => [...new Set([...current, person.account.id])]);
                                setSelectedStaff((current) => current.some((item) => item.account.id === person.account.id) ? current : [...current, person]);
                              }
                              setPreview(null);
                            }}
                          >
                            <span className="management-duty-staff-picker__avatar">{accountName(person).slice(0, 1).toUpperCase()}</span>
                            <span><strong>{accountName(person)}</strong><small>{person.account.employee?.empId || "Office user"}{person.account.employee?.designation ? ` · ${person.account.employee.designation}` : ""}</small></span>
                            <em>{selected ? "Selected" : "Add"}</em>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="management-duty-staff-picker__empty">No eligible staff match this search.</div>
                  )}
                </div>
              </section>

              <section className="management-duty-assignment-step wide">
                <div className="management-duty-assignment-step__heading">
                  <span>2</span>
                  <div><strong>Duty details</strong><small>Choose the shift and schedule. Your management account remains the supervisor.</small></div>
                </div>
                <div className="management-duty-assignment-fields">
                  <label><span>Shift</span><select required disabled={!selectedStaff.length} value={scheduleForm.shiftTemplateId} onChange={(event) => { setScheduleForm({ ...scheduleForm, shiftTemplateId: event.target.value }); setPreview(null); }}><option value="">{selectedStaff.length ? "Select valid shift" : "Select staff first"}</option>{assignmentTemplates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.startTime}–{template.endTime} · {template.scope === "OFFICE" ? "Office" : "Org Unit"}</option>)}</select><small>{selectedStaff.length && !assignmentTemplates.length ? "No shift is valid for all selected staff. Create an Office/Org Unit shift or change the selection." : "Only shifts valid for all selected staff are shown."}</small></label>
                  <label><span>Schedule type</span><select value={scheduleForm.recurrenceType} onChange={(event) => { setScheduleForm({ ...scheduleForm, recurrenceType: event.target.value as DutyRecurrenceType }); setPreview(null); }}><option value="ONE_TIME">One day</option><option value="DATE_RANGE">Every day</option><option value="WEEKLY">Selected weekdays</option></select></label>
                  <label><span>Start date</span><input required type="date" value={scheduleForm.startDate} onChange={(event) => { setScheduleForm({ ...scheduleForm, startDate: event.target.value }); setPreview(null); }} /></label>
                  {scheduleForm.recurrenceType !== "ONE_TIME" && <label><span>End date</span><input required type="date" value={scheduleForm.endDate} onChange={(event) => { setScheduleForm({ ...scheduleForm, endDate: event.target.value }); setPreview(null); }} /></label>}
                  <div className="management-duty-assignment-supervisor">
                    <span>Supervisor</span>
                    <strong>{currentManagerName}</strong>
                    <small>Eligible V3 Duty supervisor · automatic</small>
                  </div>
                  <label><span>Place</span><input required minLength={2} value={scheduleForm.reportingLocation} onChange={(event) => { setScheduleForm({ ...scheduleForm, reportingLocation: event.target.value }); setPreview(null); }} /></label>
                  {scheduleForm.recurrenceType === "WEEKLY" && <fieldset className="wide management-duty-weekday-fieldset"><legend>Repeat on</legend><div className="management-duty-weekday-shortcuts"><button type="button" onClick={() => { setScheduleForm((current) => ({ ...current, weekdays: WEEKDAYS.map(([value]) => value).filter((value) => !weeklyOffDays.includes(value)) })); setPreview(null); }}>Working days</button><button type="button" onClick={() => { setScheduleForm((current) => ({ ...current, weekdays: [0,1,2,3,4,5,6] })); setPreview(null); }}>All days</button><button type="button" onClick={() => { setScheduleForm((current) => ({ ...current, weekdays: [] })); setPreview(null); }}>Clear</button></div><div className="management-duty-weekdays">{WEEKDAYS.map(([value, label]) => { const active = scheduleForm.weekdays.includes(value); return <button key={value} type="button" aria-pressed={active} className={active ? "is-selected" : ""} onClick={() => { setScheduleForm((current) => ({ ...current, weekdays: active ? current.weekdays.filter((day) => day !== value) : [...current.weekdays, value].sort((a,b) => a-b) })); setPreview(null); }}><span>{label}</span><small>{active ? "Selected" : "Off"}</small></button>; })}</div></fieldset>}
                  <label className="wide"><span>Notes (optional)</span><textarea value={scheduleForm.notes} onChange={(event) => { setScheduleForm({ ...scheduleForm, notes: event.target.value }); setPreview(null); }} placeholder="Add only information staff need for this duty." /></label>
                </div>
              </section>
              {preview && (
                <div className="management-duty-preview wide">
                  <div className="management-duty-preview__summary">
                    <article><span>Total</span><strong>{preview.requestedAssignments}</strong></article>
                    <article><span>Ready</span><strong>{preview.validAssignments}</strong></article>
                    <article className={preview.conflictAssignments ? "has-conflict" : ""}><span>Blocked</span><strong>{preview.conflictAssignments}</strong></article><article className={preview.warningAssignments ? "has-warning" : ""}><span>Holiday / Off day</span><strong>{preview.warningAssignments}</strong></article>
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
                              <td><strong>{accountName(person.account)}</strong><small>{person.account.employee?.empId || "Office user"}</small></td>
                              <td><strong>{preview.dates.length === 1 ? formatDate(preview.dates[0]) : `${formatDate(preview.dates[0])} – ${formatDate(preview.dates[preview.dates.length - 1])}`}</strong><small>{person.validDates.length} ready · {person.conflicts.length} blocked</small></td>
                              <td>{preview.reportingLocation}</td>
                              <td>{accountName(person.supervisor)}</td>
                              <td>
                                <span className={`management-duty-check__result is-${person.result.toLowerCase().replaceAll("_", "-")}`}>{assignmentCheckLabel(person.result)}</span>
                                {person.conflicts.slice(0, 2).map((conflict) => <small key={`${conflict.date}-${conflict.type}`}>{formatDate(conflict.date)} · {conflict.message}</small>)}{person.warnings.slice(0, 2).map((warning) => <small className="is-warning" key={`${warning.date}-${warning.type}`}>{formatDate(warning.date)} · {warning.message}</small>)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {preview.conflictAssignments > 0 && (
                    <fieldset className="management-duty-preview__decision">
                      <legend>Blocked dates</legend>
                      <p>Overlapping duty, insufficient rest, or approved leave cannot be overridden. Change the schedule, or assign only the ready dates.</p>
                      <label className="management-duty-dialog__check">
                        <input type="checkbox" checked={scheduleForm.createValidAssignmentsOnly} onChange={(event) => setScheduleForm((current) => ({ ...current, createValidAssignmentsOnly: event.target.checked }))} />
                        <span><strong>Assign ready dates only</strong><small>Blocked dates will be skipped.</small></span>
                      </label>
                    </fieldset>
                  )}
                  {preview.warningAssignments > 0 && (
                    <section className="management-duty-governance-banner is-warning">
                      <DutyIcon name="calendar" />
                      <div><strong>Holiday or weekly off</strong><p>These are warnings only. Operational duty can still be scheduled.</p></div>
                    </section>
                  )}
                </div>
              )}
            </div>}

            {dialog === "LEAVE" && (
              <div className="management-duty-dialog__grid">
                <div className="management-duty-dialog__context wide"><strong>Employee leave</strong><p>Leave is employee-specific and blocks duty assignment for the selected dates.</p></div>
                <label><span>Org Unit</span><select required value={leaveOrgUnitId} onChange={(event) => { setLeaveOrgUnitId(event.target.value); setLeaveOperationalTeamId(""); setLeaveForm((current) => ({ ...current, employeeAccountId: "" })); }}><option value="">Select authorized Org Unit</option>{assignableOrgUnits.map((unit) => <option key={unit.id} value={unit.id}>{orgUnitLabel(unit.id)}</option>)}</select></label>
                <label><span>Operational Team (optional)</span><select disabled={!leaveOrgUnitId} value={leaveOperationalTeamId} onChange={(event) => { setLeaveOperationalTeamId(event.target.value); setLeaveForm((current) => ({ ...current, employeeAccountId: "" })); }}><option value="">All teams in subtree</option>{leaveTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
                <label className="wide"><span>Find staff</span><input value={leaveSearch} onChange={(event) => setLeaveSearch(event.target.value)} placeholder="Search name, employee ID or position" disabled={!leaveOrgUnitId} /></label>
                <label className="wide"><span>Staff member</span><select required disabled={!leaveOrgUnitId || leaveCandidatesLoading} value={leaveForm.employeeAccountId} onChange={(event) => setLeaveForm({ ...leaveForm, employeeAccountId: event.target.value })}><option value="">{leaveCandidatesLoading ? "Searching…" : "Select staff member"}</option>{leaveCandidates.map((person) => <option key={person.account.id} value={person.account.id}>{accountName(person)} · {person.account.employee?.empId || "Office user"}</option>)}</select><small>Showing up to 40 matching staff in the selected V3 scope.</small></label>
                <label><span>Start date</span><input required type="date" value={leaveForm.startDate} onChange={(event) => setLeaveForm((current) => ({ ...current, startDate: event.target.value, endDate: current.endDate < event.target.value ? event.target.value : current.endDate }))} /></label>
                <label><span>End date</span><input required type="date" min={leaveForm.startDate} value={leaveForm.endDate} onChange={(event) => setLeaveForm({ ...leaveForm, endDate: event.target.value })} /></label>
                <label className="wide"><span>Reason / note</span><textarea value={leaveForm.note} onChange={(event) => setLeaveForm({ ...leaveForm, note: event.target.value })} placeholder="Optional leave note" /></label>
              </div>
            )}

            {dialog === "HOLIDAYS" && (
              <div className="management-duty-holiday-calendar">
                <section className="management-duty-holiday-weekly">
                  <div><strong>Weekly off</strong><span>Configured once for this Office calendar.</span></div>
                  <div className="management-duty-weekdays is-calendar">{WEEKDAYS.map(([value, label]) => { const active = weeklyOffDays.includes(value); return <button key={value} type="button" disabled={!canManageOfficeConfiguration} aria-pressed={active} className={active ? "is-selected" : ""} onClick={() => setWeeklyOffDays((current) => active ? current.filter((day) => day !== value) : [...current, value].sort((a,b) => a-b))}><span>{label}</span><small>{active ? "Weekly off" : "Working"}</small></button>; })}</div>
                  {canManageOfficeConfiguration && <button type="button" className="is-primary" disabled={Boolean(busy)} onClick={() => void saveWeeklyOff()}>{busy === "weekly-off" ? "Saving…" : "Save weekly off"}</button>}
                </section>

                <section className="management-duty-holiday-list">
                  <header><div><strong>Upcoming holidays</strong><span>Holiday dates warn Duty planners but do not block essential operational coverage.</span></div></header>
                  {calendar?.holidays.filter((holiday) => !holiday.cancelledAt).length ? calendar.holidays.filter((holiday) => !holiday.cancelledAt).map((holiday) => (
                    <article key={holiday.id}>
                      <div><strong>{holiday.name}</strong><span>{formatDate(holiday.startDate)}{holiday.endDate !== holiday.startDate ? ` – ${formatDate(holiday.endDate)}` : ""} · {holiday.type.toLowerCase().replaceAll("_", " ")}</span><small>{holiday.scope === "OFFICE" ? "Entire Office" : holiday.orgUnit?.name ?? "Org Unit"}</small></div>
                      {((holiday.scope === "OFFICE" && canManageOfficeConfiguration) || (holiday.orgUnit?.id && accessContext?.manageableOrgUnitIds.includes(holiday.orgUnit.id))) && <button type="button" className="is-danger" disabled={Boolean(busy)} onClick={() => void removeHoliday(holiday.id)}>Cancel holiday</button>}
                    </article>
                  )) : <p className="management-duty-shifts__empty">No upcoming holidays are recorded.</p>}
                </section>

                {canManageDuty && (
                  <section className="management-duty-holiday-form">
                    <div><strong>Add holiday</strong><span>Use the official NTC/government calendar. Org Unit scope is for approved local closures.</span></div>
                    <div className="management-duty-dialog__grid">
                      <label className="wide"><span>Holiday name</span><input required minLength={2} value={holidayForm.name} onChange={(event) => setHolidayForm({ ...holidayForm, name: event.target.value })} placeholder="e.g. Dashain Holiday" /></label>
                      <label><span>Type</span><select value={holidayForm.type} onChange={(event) => setHolidayForm({ ...holidayForm, type: event.target.value as DutyHolidayType })}><option value="GOVERNMENT">Government</option><option value="FESTIVAL">Festival</option><option value="ORGANIZATION">Organization</option><option value="OTHER">Other</option></select></label>
                      <label><span>Scope</span><select value={holidayForm.scope} onChange={(event) => setHolidayForm((current) => ({ ...current, scope: event.target.value as DutyHolidayScope, orgUnitId: "" }))}>{canManageOfficeConfiguration && <option value="OFFICE">Entire Office</option>}<option value="ORG_UNIT">Org Unit</option></select></label>
                      {holidayForm.scope === "ORG_UNIT" && <label><span>Org Unit</span><select required value={holidayForm.orgUnitId} onChange={(event) => setHolidayForm({ ...holidayForm, orgUnitId: event.target.value })}><option value="">Select Org Unit</option>{manageableOrgUnits.map((orgUnit) => <option key={orgUnit.id} value={orgUnit.id}>{orgUnitLabel(orgUnit.id)}</option>)}</select></label>}
                      <label><span>From</span><input required type="date" value={holidayForm.startDate} onChange={(event) => setHolidayForm((current) => ({ ...current, startDate: event.target.value, endDate: current.endDate < event.target.value ? event.target.value : current.endDate }))} /></label>
                      <label><span>To</span><input required type="date" min={holidayForm.startDate} value={holidayForm.endDate} onChange={(event) => setHolidayForm({ ...holidayForm, endDate: event.target.value })} /></label>
                      <label className="wide"><span>Note (optional)</span><textarea value={holidayForm.note} onChange={(event) => setHolidayForm({ ...holidayForm, note: event.target.value })} /></label>
                    </div>
                  </section>
                )}
              </div>
            )}

            {dialog === "EDIT" && selectedAssignment && <div className="management-duty-dialog__grid"><div className="management-duty-dialog__context wide"><strong>{accountName(selectedAssignment.employee)}</strong><p>{formatDateTime(selectedAssignment.startsAt)} · {selectedAssignment.shift.name}</p></div><label><span>Shift</span><select value={editForm.shiftTemplateId} onChange={(event) => setEditForm({ ...editForm, shiftTemplateId: event.target.value })}>{editShiftOptions.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label><span>Supervisor</span><select value={editForm.supervisorAccountId} onChange={(event) => setEditForm({ ...editForm, supervisorAccountId: event.target.value })}>{managers.map((manager) => <option key={manager.account.id} value={manager.account.id}>{manager.account.employee?.empName || manager.account.superAdminProfile?.fullName || manager.account.username}</option>)}</select></label><label className="wide"><span>Place</span><input required value={editForm.reportingLocation} onChange={(event) => setEditForm({ ...editForm, reportingLocation: event.target.value })} /></label><label className="wide"><span>Notes</span><textarea value={editForm.notes} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} /></label></div>}

            {dialog === "CANCEL" && selectedAssignment && <div className="management-duty-dialog__grid"><div className="management-duty-cancel-summary wide"><DutyIcon name="warning" /><div><strong>Cancel {accountName(selectedAssignment.employee)} duty?</strong><p>{formatDateTime(selectedAssignment.startsAt)} · {selectedAssignment.shift.name}</p></div></div><label className="wide"><span>Cancellation reason</span><textarea required minLength={3} maxLength={500} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></label></div>}


            {dialog === "ROUTINE" && selectedPerson && (routineLoading ? <div className="management-duty-dialog__loading">Loading the next 31 days of duty…</div> : <div className="management-duty-routine"><div className="management-duty-routine__summary"><article><span>Staff</span><strong>{selectedPerson.account.employee?.designation || selectedPerson.account.employee?.empId || "Office staff"}</strong></article><article><span>Next 31 days</span><strong>{formatHours(selectedPerson.totalScheduledMinutes)}</strong></article><article><span>Current status</span><strong>{statusLabel(selectedPerson.todayStatus)}</strong></article></div><div className="management-duty-routine__list">{routineDates.map((date) => { const assignment = assignmentFor(selectedPerson, date); const exception = exceptionFor(selectedPerson, date); return <article key={date}><strong>{formatDate(date)}</strong>{assignment ? <><span>{assignment.shift.name} · {assignment.shift.startTime}–{assignment.shift.endTime}</span><small>{assignment.reportingLocation} · Supervisor {accountName(assignment.supervisor)}</small></> : exception ? <><span>{exception.type === "LEAVE" ? "Leave" : "Holiday exception"}</span><small>{exception.note || "No note"}</small></> : <span>Off duty</span>}</article>; })}</div></div>)}

            <footer>
              <button type="button" disabled={Boolean(busy)} onClick={() => setDialog(null)}>Close</button>
              {dialog === "SCHEDULE" && preview ? (
                <button type="button" className="is-primary" disabled={Boolean(busy) || createCount === 0} onClick={() => void createScheduleFromPreview()}>
                  {busy === "schedule" ? "Assigning..." : `Assign ${createCount}`}
                </button>
              ) : dialog !== "ROUTINE" && !(dialog === "HOLIDAYS" && !canManageDuty) ? (
                <button
                  type="submit"
                  className={dialog === "CANCEL" || dialog === "SHIFT_DELETE" ? "is-danger" : "is-primary"}
                  disabled={Boolean(busy) || (dialog === "SCHEDULE" && (!selectedIds.length || !scheduleForm.shiftTemplateId))}
                >
                  {busy ? "Saving..." : dialog === "SCHEDULE" ? "Review Assignment" : dialog === "SHIFT_DELETE" ? "Delete Shift" : dialog === "SHIFTS" ? selectedTemplate ? "Save Changes" : "Create Shift" : dialog === "CANCEL" ? "Cancel Duty" : dialog === "LEAVE" ? "Record Leave" : dialog === "HOLIDAYS" ? "Add Holiday" : "Save"}
                </button>
              ) : null}
            </footer>
          </form>
        </div>
      )}
    </main>
  );
}
