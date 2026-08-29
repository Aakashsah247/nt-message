import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useSearchParams } from "react-router";

import { useAuth } from "../context/AuthContext";
import {
  connectMessagingSocketAfterEffectCommit,
  createMessagingSocket,
} from "../services/messaging-socket.service";
import {
  acknowledgeEmployeeWork,
  completeEmployeeSalesWork,
  downloadEmployeeWorkSalesAttachment,
  getEmployeeWorkItem,
  listEmployeeWorkActivity,
  listDutyHelpRecommendations,
  listEmployeeWorkItems,
  listEmployeeWorkSalesMessages,
  listPendingEmployeeHelpRequests,
  requestEmployeeWorkHelp,
  respondToEmployeeHelpRequest,
  sendEmployeeWorkSalesMessage,
  sendEmployeeWorkToSales,
  startEmployeeWork,
  submitEmployeeWorkCompletion,
} from "../services/work-management.service";
import type {
  DutyHelpRecommendationResponse,
  WorkActivity,
  WorkAssignment,
  WorkCompletionResult,
  WorkHelpReason,
  WorkHelpRequest,
  WorkItem,
  WorkItemStatus,
  WorkQueueView,
  WorkSalesMessage,
} from "../types/work-management";

const BRANCH_TIME_ZONE = "Asia/Kathmandu";
const TERMINAL_STATUSES: WorkItemStatus[] = ["CLOSED", "CANCELLED"];
const COMPLETABLE_STATUSES: WorkItemStatus[] = [
  "IN_PROGRESS",
  "HELP_REQUESTED",
  "BLOCKED",
];
const SALES_FILE_MAX_COUNT = 5;
const SALES_FILE_MAX_BYTES = 25 * 1024 * 1024;
const SALES_SEND_MAX_BYTES = 50 * 1024 * 1024;

// Keep employee-visible wording simple while the API retains precise workflow states.
const STATUS_LABELS: Record<WorkItemStatus, string> = {
  ASSIGNED: "New Work",
  ACKNOWLEDGED: "New Work",
  IN_PROGRESS: "In Progress",
  HELP_REQUESTED: "Need Help",
  COMPLETED_PENDING_REVIEW: "Waiting for Approval",
  CLOSED: "Completed",
  REOPENED: "Returned",
  BLOCKED: "Blocked",
  CANCELLED: "Cancelled",
};

const HELP_REASON_LABELS: Record<WorkHelpReason, string> = {
  NEED_ANOTHER_EMPLOYEE: "Need another employee",
  TECHNICAL_GUIDANCE: "Need technical guidance",
  TOOLS_OR_MATERIALS: "Need tools or materials",
  SAFETY_CONCERN: "Safety problem",
  OTHER: "Other problem",
};

const COMPLETION_RESULT_LABELS: Record<WorkCompletionResult, string> = {
  FULLY_RESOLVED: "Work finished",
  TEMPORARY_SOLUTION: "Temporary work done",
  UNABLE_TO_RESOLVE: "Could not finish",
};

const DAILY_WORK_LIST_LIMIT = 20;

type WorkIconName =
  | "work"
  | "clock"
  | "location"
  | "manager"
  | "help"
  | "check"
  | "history"
  | "search"
  | "arrow"
  | "warning"
  | "close";

function WorkIcon({ name }: { name: WorkIconName }): ReactNode {
  const props = {
    "aria-hidden": true,
    fill: "none",
    height: 21,
    viewBox: "0 0 24 24",
    width: 21,
  } as const;

  switch (name) {
    case "work":
      return <svg {...props}><path d="M9 6V4h6v2" /><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 11h18M9 11v2h6v-2" /></svg>;
    case "clock":
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case "location":
      return <svg {...props}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
    case "manager":
      return <svg {...props}><circle cx="12" cy="7" r="4" /><path d="M5 21a7 7 0 0 1 14 0M18 8h3M19.5 6.5v3" /></svg>;
    case "help":
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.4 2.4 0 1 1 3.3 2.2c-.9.4-1.1.9-1.1 1.8M12 17h.01" /></svg>;
    case "check":
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></svg>;
    case "history":
      return <svg {...props}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>;
    case "search":
      return <svg {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
    case "arrow":
      return <svg {...props}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    case "warning":
      return <svg {...props}><path d="M10.3 3.8 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>;
    case "close":
      return <svg {...props}><path d="m6 6 12 12M18 6 6 18" /></svg>;
  }
}

function accountName(account: WorkItem["createdBy"] | null | undefined): string {
  return account?.employee?.empName ?? account?.username ?? "NT Message user";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Not scheduled";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BRANCH_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRelativeDue(value: string): string {
  const due = new Date(value).getTime();
  const difference = due - Date.now();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;

  if (difference < 0) {
    const overdueHours = Math.max(1, Math.ceil(Math.abs(difference) / hour));
    return overdueHours < 24
      ? `Overdue by ${overdueHours} hr`
      : `Overdue by ${Math.ceil(overdueHours / 24)} day`;
  }

  if (difference <= hour) return "Due within 1 hour";
  if (difference < day) return `Due in ${Math.ceil(difference / hour)} hr`;
  return `Due in ${Math.ceil(difference / day)} day`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(kilobytes >= 10 ? 0 : 1)} KB`;
  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}

function salesStatusLabel(status: WorkItem["salesCoordinationStatus"]): string {
  if (status === "READY_FOR_SALES") return "Waiting for Sales";
  if (status === "COMPLETED") return "Sales Work Done";
  return "Not sent yet";
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The work request could not be completed.";
}

function toDateInput(value: Date): string {
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function getHistoryFrom(days: number): string {
  const value = new Date();
  value.setDate(value.getDate() - days);
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

function activeAssignment(
  workItem: WorkItem,
  accountId: string,
): WorkAssignment | undefined {
  return workItem.assignments.find(
    (assignment) => assignment.assignee.id === accountId,
  );
}

function latestInformationRequest(workItem: WorkItem): boolean {
  return workItem.completionReports?.some(
    (report) => report.reviewStatus === "INFORMATION_REQUESTED",
  ) ?? false;
}

function workTypeLabel(type: WorkItem["type"]): string {
  if (type === "MAINTENANCE") return "Network maintenance";
  if (type === "NEW_CONNECTION") return "New Installation";
  return type
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function serviceTypeLabel(serviceType: WorkItem["serviceTypes"][number]): string {
  if (serviceType === "IPTV" || serviceType === "SIP") return serviceType;
  return serviceType.charAt(0) + serviceType.slice(1).toLowerCase();
}

function isOperationalCompletionType(type: WorkItem["type"]): boolean {
  return type !== "ADMINISTRATIVE_TASK";
}

function completionRequiresCustomerId(type: WorkItem["type"]): boolean {
  return [
    "NEW_CONNECTION",
    "UPDATE_SERVICES",
    "TROUBLE_TICKET",
    "EMERGENCY_WORK",
  ].includes(type);
}

function completionAllowsCustomerId(type: WorkItem["type"]): boolean {
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

function activityLabel(activity: WorkActivity): string {
  const labels: Record<WorkActivity["action"], string> = {
    CREATED: "Work created",
    ASSIGNED: "Employee assigned",
    TEAM_ASSIGNED: "Team assigned",
    SALES_MEMBER_ASSIGNED: "Sales member assigned",
    ACKNOWLEDGED: "Work seen",
    STARTED: "Work started",
    STATUS_CHANGED: "Status updated",
    REASSIGNED: "Primary employee changed",
    SUPPORT_ADDED: "Supporting employee added",
    SUPPORT_REMOVED: "Supporting employee removed",
    HELP_REQUESTED: "Help requested",
    HELP_ACCEPTED: "Help request accepted",
    HELP_DECLINED: "Help request declined",
    COMPLETION_SUBMITTED: "Completion report submitted",
    INFORMATION_REQUESTED: "Manager requested more information",
    CLOSED: "Work verified and closed",
    REOPENED: "Work reopened",
    CANCELLED: "Work cancelled",
    DETAILS_UPDATED: "Work details updated",
    DUE_DATE_CHANGED: "Due time changed",
    RETENTION_HOLD_APPLIED: "Retention hold applied",
    RETENTION_HOLD_RELEASED: "Retention hold released",
    DELETION_REVIEW_REQUESTED: "Deletion review requested",
    DELETION_REVIEW_CANCELLED: "Deletion review cancelled",
    // Delegated child work remains visible in the employee audit timeline.
    DELEGATED: "Linked work delegated",
  };

  return labels[activity.action];
}

export function EmployeeWorkPage() {
  const { account, accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [pendingHelpRequests, setPendingHelpRequests] = useState<WorkHelpRequest[]>([]);
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const [activities, setActivities] = useState<WorkActivity[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [pageError, setPageError] = useState("");
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const actionLockRef = useRef(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<Extract<WorkQueueView, "ACTIVE" | "HISTORY">>("ACTIVE");
  const [status, setStatus] = useState<WorkItemStatus | "">("");
  const [historyFrom, setHistoryFrom] = useState(() => getHistoryFrom(30));
  const [historyTo, setHistoryTo] = useState(() => toDateInput(new Date()));
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dayKey, setDayKey] = useState(() => getLocalDayRange().dayKey);
  const [dailyOpen, setDailyOpen] = useState<WorkItem[]>([]);
  const [dailyCompleted, setDailyCompleted] = useState<WorkItem[]>([]);
  const [dailyTotals, setDailyTotals] = useState({ open: 0, completed: 0 });
  const [dailyLoading, setDailyLoading] = useState(true);
  const [dialog, setDialog] = useState<"help" | "complete" | null>(null);
  const [helpReason, setHelpReason] = useState<WorkHelpReason>("NEED_ANOTHER_EMPLOYEE");
  const [helpNote, setHelpNote] = useState("");
  const [helpOptions, setHelpOptions] = useState<DutyHelpRecommendationResponse | null>(null);
  const [selectedHelperAccountId, setSelectedHelperAccountId] = useState("");
  const [selectedHelpDepartmentId, setSelectedHelpDepartmentId] = useState("");
  const [loadingHelpOptions, setLoadingHelpOptions] = useState(false);
  const [completionResult, setCompletionResult] = useState<WorkCompletionResult>("FULLY_RESOLVED");
  const [completionSummary, setCompletionSummary] = useState("");
  const [completionCustomerId, setCompletionCustomerId] = useState("");
  const [completionRxLevel, setCompletionRxLevel] = useState("");
  const [moreWorkRequired, setMoreWorkRequired] = useState(false);
  const [salesMessages, setSalesMessages] = useState<WorkSalesMessage[]>([]);
  const [loadingSalesMessages, setLoadingSalesMessages] = useState(false);
  const [salesText, setSalesText] = useState("");
  const [salesFiles, setSalesFiles] = useState<File[]>([]);
  // Keep file inputs completely out of the visual/focus layout. Clicking a clipped
  // file input can make some browsers scroll the work page to the input after the
  // native picker closes, which is especially disruptive for field workers.
  const salesPhotoInputRef = useRef<HTMLInputElement>(null);
  const salesFileInputRef = useRef<HTMLInputElement>(null);
  // The query parameter preserves the selected ticket across refreshes and dashboard deep links.
  const selectedId = searchParams.get("ticket");

  const loadOverview = useCallback(async () => {
    if (!accessToken) return;

    setLoadingList(true);
    setPageError("");

    try {
      const [listResponse, helpResponse] = await Promise.all([
        listEmployeeWorkItems(accessToken, {
          view,
          page,
          limit: 10,
          search,
          status: status || undefined,
          historyFrom:
            view === "HISTORY" && historyFrom
              ? new Date(`${historyFrom}T00:00:00`).toISOString()
              : undefined,
          historyTo:
            view === "HISTORY" && historyTo
              ? new Date(`${historyTo}T23:59:59.999`).toISOString()
              : undefined,
        }),
        listPendingEmployeeHelpRequests(accessToken),
      ]);

      setItems(listResponse.data);
      setPagination({
        page: listResponse.pagination.page,
        total: listResponse.pagination.total,
        totalPages: Math.max(1, listResponse.pagination.totalPages),
      });
      setPendingHelpRequests(helpResponse.data);
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setLoadingList(false);
    }
  }, [accessToken, historyFrom, historyTo, page, refreshKey, search, status, view]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextDayKey = getLocalDayRange().dayKey;
      setDayKey((current) => (current === nextDayKey ? current : nextDayKey));
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const updateConnectionState = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateConnectionState);
    window.addEventListener("offline", updateConnectionState);

    return () => {
      window.removeEventListener("online", updateConnectionState);
      window.removeEventListener("offline", updateConnectionState);
    };
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    let active = true;
    const range = getLocalDayRange();
    setDailyLoading(true);

    Promise.all([
      listEmployeeWorkItems(accessToken, {
        view: "ACTIVE",
        page: 1,
        limit: DAILY_WORK_LIST_LIMIT,
        plannedFrom: range.from,
        plannedTo: range.to,
      }),
      listEmployeeWorkItems(accessToken, {
        view: "HISTORY",
        status: "CLOSED",
        page: 1,
        limit: DAILY_WORK_LIST_LIMIT,
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
      .catch((error) => {
        if (active) setPageError(errorMessage(error));
      })
      .finally(() => {
        if (active) setDailyLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, dayKey, refreshKey]);

  useEffect(() => {
    if (!accessToken || !selectedId) {
      setSelectedItem(null);
      setActivities([]);
      return;
    }

    let active = true;
    setLoadingDetail(true);
    setActionError("");

    Promise.all([
      getEmployeeWorkItem(accessToken, selectedId),
      listEmployeeWorkActivity(accessToken, selectedId),
    ])
      .then(([detailResponse, activityResponse]) => {
        if (!active) return;
        setSelectedItem(detailResponse.workItem);
        setActivities(activityResponse.data);
      })
      .catch((error) => {
        if (active) setActionError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoadingDetail(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, refreshKey, selectedId]);

  useEffect(() => {
    if (!accessToken) return;

    // Account-scoped realtime events refresh only work visible to the signed-in employee.
    const socket = createMessagingSocket(accessToken);
    const refreshWork = () => setRefreshKey((value) => value + 1);

    socket.on("work:item-updated", refreshWork);
    const disconnectSocket = connectMessagingSocketAfterEffectCommit(socket);

    return () => {
      socket.off("work:item-updated", refreshWork);
      disconnectSocket();
    };
  }, [accessToken]);

  // Shared team work stays as one ticket. Sales and Support can see the work,
  // but only Primary Team members may take the Start Work action. The API
  // independently verifies team membership before changing the shared work.
  const assignment = useMemo(
    () => selectedItem && account
      ? activeAssignment(selectedItem, account.id)
      : undefined,
    [account, selectedItem],
  );
  const primaryAssignment = useMemo(
    () => selectedItem?.assignments.find(
      (workAssignment) => workAssignment.assignmentRole === "PRIMARY",
    ),
    [selectedItem],
  );
  const primaryPeople = useMemo(() => {
    if (!selectedItem) return [];

    if (selectedItem.assignedTeam) {
      const teamAdminEmployeeId = selectedItem.assignedTeam.teamAdmin.id;
      return [...(selectedItem.assignedTeam.members ?? [])]
        .sort((left, right) => {
          const leftIsAdmin = left.employee.id === teamAdminEmployeeId ? 0 : 1;
          const rightIsAdmin = right.employee.id === teamAdminEmployeeId ? 0 : 1;
          if (leftIsAdmin !== rightIsAdmin) return leftIsAdmin - rightIsAdmin;
          return left.employee.empName.localeCompare(right.employee.empName);
        })
        .map((member) => ({
          key: `team:${member.employee.id}`,
          accountId: member.employee.account?.id ?? null,
          name: member.employee.empName,
          designation: member.employee.designation,
          isTeamAdmin: member.employee.id === teamAdminEmployeeId,
          startedWork: Boolean(
            primaryAssignment?.startedAt &&
              member.employee.account?.id === primaryAssignment.assignee.id,
          ),
        }));
    }

    if (!primaryAssignment) return [];
    return [{
      key: `primary:${primaryAssignment.assignee.id}`,
      accountId: primaryAssignment.assignee.id,
      name: accountName(primaryAssignment.assignee),
      designation: primaryAssignment.assignee.employee?.designation ?? null,
      isTeamAdmin: false,
      startedWork: Boolean(primaryAssignment.startedAt),
    }];
  }, [primaryAssignment, selectedItem]);
  const otherPeople = useMemo(() => {
    if (!selectedItem) return [];

    const primaryAccountIds = new Set(
      primaryPeople
        .map((person) => person.accountId)
        .filter((accountId): accountId is string => Boolean(accountId)),
    );
    const people = new Map<
      string,
      { account: WorkItem["createdBy"]; roles: string[] }
    >();
    const addPerson = (account: WorkItem["createdBy"], role: string) => {
      if (primaryAccountIds.has(account.id)) return;
      const current = people.get(account.id);
      if (current) {
        if (!current.roles.includes(role)) current.roles.push(role);
        return;
      }
      people.set(account.id, { account, roles: [role] });
    };

    if (selectedItem.salesMember) addPerson(selectedItem.salesMember, "Sales member");
    selectedItem.assignments
      .filter((workAssignment) => workAssignment.assignmentRole === "SUPPORTING")
      .forEach((workAssignment) => addPerson(workAssignment.assignee, "Supporting staff"));

    return [...people.values()].sort((left, right) =>
      accountName(left.account).localeCompare(accountName(right.account)),
    );
  }, [primaryPeople, selectedItem]);
  const peopleCount = useMemo(() => {
    const ids = new Set<string>();
    primaryPeople.forEach((person) => ids.add(person.accountId ?? person.key));
    otherPeople.forEach((person) => ids.add(person.account.id));
    return ids.size;
  }, [otherPeople, primaryPeople]);
  const isPrimary = assignment?.assignmentRole === "PRIMARY";
  const isSupportingParticipant = assignment?.assignmentRole === "SUPPORTING";
  const isSalesParticipant = Boolean(
    selectedItem && account && selectedItem.salesMemberAccountId === account.id,
  );
  const isSharedTeamWork = Boolean(selectedItem?.assignedTeamId);
  const canAcknowledge = Boolean(
    assignment &&
      !isSharedTeamWork &&
      !assignment.acknowledgedAt &&
      selectedItem &&
      !TERMINAL_STATUSES.includes(selectedItem.status),
  );
  const canStartSharedTeamWork = Boolean(
    selectedItem &&
      isSharedTeamWork &&
      !isSupportingParticipant &&
      !isSalesParticipant &&
      ["ASSIGNED", "ACKNOWLEDGED", "REOPENED"].includes(selectedItem.status),
  );
  const canStart = Boolean(
    selectedItem &&
      (canStartSharedTeamWork ||
        (isPrimary && ["ACKNOWLEDGED", "REOPENED"].includes(selectedItem.status))),
  );
  const sharedTeamStartedBy =
    isSharedTeamWork && primaryAssignment?.startedAt
      ? accountName(primaryAssignment.assignee)
      : null;
  const hasSalesWork = Boolean(selectedItem?.salesMemberAccountId);
  const canUseSalesPanel = Boolean(hasSalesWork && (isPrimary || isSalesParticipant));
  const salesBlocksCompletion = Boolean(
    selectedItem?.salesMemberAccountId &&
      selectedItem.salesCoordinationStatus !== "COMPLETED",
  );
  // Every operational work type uses the same structured finish flow. Saved
  // work facts are read-only; the worker only enters field facts that are not
  // known when management creates the work. Administrative work stays simple.
  const usesOperationalCompletionPackage = Boolean(
    selectedItem && isOperationalCompletionType(selectedItem.type),
  );
  const requiresCompletionCustomerId = Boolean(
    selectedItem && completionRequiresCustomerId(selectedItem.type),
  );
  const allowsCompletionCustomerId = Boolean(
    selectedItem && completionAllowsCustomerId(selectedItem.type),
  );
  const requiresCompletionRxLevel = usesOperationalCompletionPackage;
  const selectedCompletionReference = selectedItem
    ? completionReference(selectedItem)
    : null;
  const canSendToSales = Boolean(
    isPrimary &&
      primaryAssignment?.startedAt &&
      selectedItem?.salesCoordinationStatus === "WAITING_FOR_DOCUMENTS",
  );
  const canSendSalesUpdate = Boolean(
    canUseSalesPanel && selectedItem?.salesCoordinationStatus === "READY_FOR_SALES",
  );
  const canCompleteSalesWork = Boolean(
    isSalesParticipant && selectedItem?.salesCoordinationStatus === "READY_FOR_SALES",
  );
  const canRequestHelp = Boolean(
    isPrimary &&
      assignment?.startedAt &&
      selectedItem &&
      ["IN_PROGRESS", "HELP_REQUESTED", "BLOCKED"].includes(selectedItem.status),
  );
  const canSubmitCompletion = Boolean(
    isPrimary &&
      assignment?.startedAt &&
      selectedItem &&
      !salesBlocksCompletion &&
      (COMPLETABLE_STATUSES.includes(selectedItem.status) ||
        (selectedItem.status === "COMPLETED_PENDING_REVIEW" &&
          latestInformationRequest(selectedItem))),
  );

  // Keep the field-worker page focused on one clear next step. Detailed API
  // states remain unchanged; workers only see the action or waiting state that
  // matters to them right now.
  const workerNextStep = !selectedItem
    ? null
    : canAcknowledge
      ? { title: "Accept this work", message: "Confirm this work, then you can start it." }
      : canStart
        ? { title: "Start this work", message: "Start when you are ready to begin the job." }
        : canSubmitCompletion
          ? latestInformationRequest(selectedItem)
            ? { title: "Send the correction", message: "Check the manager's note, correct the details and send again." }
            : { title: "Finish this work", message: "Check the work details and send the result to your manager." }
          : isPrimary && salesBlocksCompletion
            ? { title: "Waiting for Sales", message: "You can finish the work after Sales marks their part done." }
            : selectedItem.status === "COMPLETED_PENDING_REVIEW"
              ? { title: "Waiting for approval", message: "Your manager is checking the work you submitted." }
              : selectedItem.status === "CLOSED"
                ? { title: "Work completed", message: "Your manager approved this work." }
                : selectedItem.status === "CANCELLED"
                  ? { title: "Work cancelled", message: "Management cancelled this work." }
                  : sharedTeamStartedBy && !isPrimary
                    ? { title: "Work already started", message: `Started by ${sharedTeamStartedBy}. Everyone on the team sees the same progress.` }
                    : null;

  useEffect(() => {
    if (!accessToken || !selectedItem || !canUseSalesPanel) {
      setSalesMessages([]);
      setSalesText("");
      setSalesFiles([]);
      return;
    }

    let active = true;
    setLoadingSalesMessages(true);
    listEmployeeWorkSalesMessages(accessToken, selectedItem.id)
      .then((response) => {
        if (active) setSalesMessages(response.messages);
      })
      .catch((error) => {
        if (active) setActionError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoadingSalesMessages(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, canUseSalesPanel, refreshKey, selectedItem?.id]);

  const selectTicket = (workItemId: string) => {
    setSearchParams({ ticket: workItemId });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closeTicketDetails = () => {
    setSearchParams({}, { replace: true });
    setSelectedItem(null);
    setActivities([]);
    setActionError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const refreshAfterAction = (message: string) => {
    setSuccessMessage(message);
    setActionError("");
    setDialog(null);
    setRefreshKey((value) => value + 1);
  };

  const beginNetworkAction = (): boolean => {
    if (!isOnline) {
      setSuccessMessage("");
      setActionError("No internet. Your details are still here. Try again when you are connected.");
      return false;
    }

    // React disables buttons after state updates, but a very fast double tap can
    // happen before the next render. This ref closes that small gap.
    if (actionLockRef.current) return false;
    actionLockRef.current = true;
    return true;
  };

  const finishNetworkAction = () => {
    actionLockRef.current = false;
  };

  const runSimpleAction = async (
    name: string,
    action: () => Promise<{ message: string }>,
  ) => {
    if (!beginNetworkAction()) return;
    setBusyAction(name);
    setActionError("");
    setSuccessMessage("");

    try {
      const response = await action();
      refreshAfterAction(response.message);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusyAction("");
      finishNetworkAction();
    }
  };

  const addSalesFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const incoming = Array.from(files);

    if (incoming.some((file) => file.size > SALES_FILE_MAX_BYTES)) {
      setActionError("Each file must be 25 MB or smaller.");
      return;
    }

    setSalesFiles((current) => {
      const next = [...current, ...incoming];
      if (next.length > SALES_FILE_MAX_COUNT) {
        setActionError("You can add up to 5 files at a time.");
        return current;
      }

      const totalBytes = next.reduce((total, file) => total + file.size, 0);
      if (totalBytes > SALES_SEND_MAX_BYTES) {
        setActionError("Keep the total files under 50 MB for one send.");
        return current;
      }

      setActionError("");
      return next;
    });
  };

  const sendSalesDraft = async (): Promise<boolean> => {
    if (!accessToken || !selectedItem) return false;
    const text = salesText.trim();
    if (!text && salesFiles.length === 0) return true;

    await sendEmployeeWorkSalesMessage(accessToken, selectedItem.id, {
      text: text || undefined,
      files: salesFiles,
    });
    setSalesText("");
    setSalesFiles([]);
    return true;
  };

  const runSalesAction = async (action: "message" | "send" | "complete") => {
    if (!accessToken || !selectedItem || !beginNetworkAction()) return;
    setBusyAction(`sales-${action}`);
    setActionError("");
    setSuccessMessage("");

    try {
      const note = salesText.trim();
      if (action === "message" && !note && salesFiles.length === 0) {
        setActionError("Add a message or a file first.");
        return;
      }

      await sendSalesDraft();
      let message = "Sent.";
      if (action === "send") {
        const response = await sendEmployeeWorkToSales(accessToken, selectedItem.id);
        message = response.message;
      } else if (action === "complete") {
        const response = await completeEmployeeSalesWork(
          accessToken,
          selectedItem.id,
          note || undefined,
        );
        message = response.message;
      }
      refreshAfterAction(message);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusyAction("");
      finishNetworkAction();
    }
  };

  const openSalesAttachment = async (
    messageId: string,
    attachment: WorkSalesMessage["attachments"][number],
  ) => {
    if (!accessToken || !selectedItem) return;
    if (!isOnline) {
      setActionError("No internet. Connect first to open this file.");
      return;
    }
    setBusyAction(`sales-file-${attachment.id}`);
    setActionError("");
    try {
      const download = await downloadEmployeeWorkSalesAttachment(
        accessToken,
        selectedItem.id,
        messageId,
        attachment.id,
      );
      const url = URL.createObjectURL(download.blob);
      const link = document.createElement("a");
      link.href = url;
      link.rel = "noopener";
      if (attachment.mimeType.startsWith("image/") || attachment.mimeType === "application/pdf") {
        link.target = "_blank";
      } else {
        link.download = download.filename || attachment.originalFileName;
      }
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusyAction("");
    }
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  useEffect(() => {
    if (
      dialog !== "help" ||
      !accessToken ||
      !selectedItem ||
      helpReason !== "NEED_ANOTHER_EMPLOYEE"
    ) {
      setHelpOptions(null);
      setSelectedHelperAccountId("");
      setSelectedHelpDepartmentId("");
      return;
    }

    let active = true;
    setLoadingHelpOptions(true);

    listDutyHelpRecommendations(accessToken, selectedItem.id)
      .then((response) => {
        if (active) setHelpOptions(response);
      })
      .catch((error) => {
        if (active) setActionError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoadingHelpOptions(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, dialog, helpReason, selectedItem]);

  const submitHelp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !selectedItem || !beginNetworkAction()) return;

    setBusyAction("help");
    setActionError("");

    try {
      const response = await requestEmployeeWorkHelp(accessToken, selectedItem.id, {
        reason: helpReason,
        note: helpNote.trim() || undefined,
        requestedHelperAccountId:
          helpReason === "NEED_ANOTHER_EMPLOYEE" && selectedHelperAccountId
            ? selectedHelperAccountId
            : undefined,
        requestedDepartmentId:
          helpReason === "NEED_ANOTHER_EMPLOYEE" && selectedHelpDepartmentId
            ? selectedHelpDepartmentId
            : undefined,
      });
      setHelpNote("");
      setSelectedHelperAccountId("");
      setSelectedHelpDepartmentId("");
      refreshAfterAction(response.message);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusyAction("");
      finishNetworkAction();
    }
  };

  const openCompletionDialog = () => {
    if (!selectedItem) return;

    const requestedReport = latestInformationRequest(selectedItem)
      ? selectedItem.completionReports?.find(
        (report) => report.reviewStatus === "INFORMATION_REQUESTED",
      )
      : undefined;

    // When a manager asks for more information, keep the worker's previous
    // answers so they only correct or add what is needed.
    setCompletionResult(requestedReport?.result ?? "FULLY_RESOLVED");
    setCompletionSummary(requestedReport?.summary ?? "");
    setCompletionCustomerId(requestedReport?.customerId ?? "");
    setCompletionRxLevel(
      requestedReport?.rxLevelDbm === null || requestedReport?.rxLevelDbm === undefined
        ? ""
        : String(requestedReport.rxLevelDbm),
    );
    setMoreWorkRequired(requestedReport?.moreWorkRequired ?? false);
    setActionError("");
    setDialog("complete");
  };

  const submitCompletion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !selectedItem || !beginNetworkAction()) return;

    setBusyAction("complete");
    setActionError("");

    try {
      const rxLevelText = completionRxLevel.trim();
      const rxLevelDbm = rxLevelText ? Number(rxLevelText) : undefined;

      if (requiresCompletionCustomerId && !completionCustomerId.trim()) {
        setActionError("Customer ID is required for this work type.");
        return;
      }

      if (
        requiresCompletionRxLevel &&
        (rxLevelDbm === undefined || !Number.isFinite(rxLevelDbm) || rxLevelDbm < -100 || rxLevelDbm > 20)
      ) {
        setActionError("Enter a valid RX Level between -100 and 20 dBm.");
        return;
      }

      const response = await submitEmployeeWorkCompletion(
        accessToken,
        selectedItem.id,
        {
          result: completionResult,
          summary: completionSummary.trim(),
          ...(allowsCompletionCustomerId && completionCustomerId.trim()
            ? { customerId: completionCustomerId.trim() }
            : {}),
          ...(requiresCompletionRxLevel ? { rxLevelDbm } : {}),
          moreWorkRequired,
        },
      );
      setCompletionSummary("");
      setCompletionCustomerId("");
      setCompletionRxLevel("");
      setMoreWorkRequired(false);
      refreshAfterAction(response.message);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusyAction("");
      finishNetworkAction();
    }
  };

  const respondToHelp = async (
    helpRequestId: string,
    accept: boolean,
  ) => {
    if (!accessToken) return;

    await runSimpleAction(
      `help-response-${helpRequestId}`,
      () => respondToEmployeeHelpRequest(accessToken, helpRequestId, { accept }),
    );
  };

  return (
    <main className="employee-work-page">
      <section className="employee-work-page__canvas">
        {!selectedId ? (
          <>
            <header className="employee-work__simple-header">
              <div>
                <Link to="/employee">Dashboard</Link>
                <span>My Work</span>
                <h1>Choose the work you need to do</h1>
                <p>Start with today&apos;s work, or open Current work and Work history below.</p>
              </div>
              <button
                type="button"
                onClick={() => setRefreshKey((value) => value + 1)}
                disabled={loadingList}
              >
                {loadingList ? "Refreshing..." : "Refresh"}
              </button>
            </header>

            <section className="employee-work__daily-board" aria-label="Today's work lists">
              <header>
                <div>
                  <span>Today</span>
                  <h2>Today&apos;s work</h2>
                  <p>Select any task below to open its full details.</p>
                </div>
                {dailyLoading && <small>Updating...</small>}
              </header>

              <div className="employee-work__daily-columns">
                <article>
                  <header>
                    <div>
                      <WorkIcon name="clock" />
                      <div>
                        <span>Pending work</span>
                        <strong>{dailyTotals.open}</strong>
                      </div>
                    </div>
                  </header>
                  <div className="employee-work__daily-list">
                    {dailyOpen.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectTicket(item.id)}
                        aria-label={`Open ${item.title}`}
                      >
                        <div>
                          <strong>{item.title}</strong>
                          <small>{item.ticketNumber}</small>
                        </div>
                        <span>{STATUS_LABELS[item.status]}</span>
                      </button>
                    ))}
                    {!dailyLoading && dailyOpen.length === 0 && (
                      <p>No uncompleted work is planned for today.</p>
                    )}
                  </div>
                </article>

                <article>
                  <header>
                    <div>
                      <WorkIcon name="check" />
                      <div>
                        <span>Completed today</span>
                        <strong>{dailyTotals.completed}</strong>
                      </div>
                    </div>
                  </header>
                  <div className="employee-work__daily-list">
                    {dailyCompleted.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectTicket(item.id)}
                        aria-label={`Open completed work ${item.title}`}
                      >
                        <div>
                          <strong>{item.title}</strong>
                          <small>{item.ticketNumber}</small>
                        </div>
                        <span>Completed</span>
                      </button>
                    ))}
                    {!dailyLoading && dailyCompleted.length === 0 && (
                      <p>No work planned for today has been completed yet.</p>
                    )}
                  </div>
                </article>
              </div>
            </section>

            {pendingHelpRequests.length > 0 && (
              <section className="employee-work__help-inbox" aria-label="Pending help requests">
                <header>
                  <div>
                    <span>Help Requests</span>
                    <h2>A coworker needs your support</h2>
                  </div>
                  <strong>{pendingHelpRequests.length}</strong>
                </header>
                <div className="employee-work__help-list">
                  {pendingHelpRequests.map((request) => (
                    <article key={request.id}>
                      <div>
                        <strong>{request.workItem?.title ?? "Assigned work"}</strong>
                        <p>
                          {accountName(request.requestedBy)} requested help: {HELP_REASON_LABELS[request.reason]}.
                        </p>
                        <small>{request.note || "No additional note was added."}</small>
                      </div>
                      <div className="employee-work__help-actions">
                        <button
                          type="button"
                          onClick={() => void respondToHelp(request.id, true)}
                          disabled={Boolean(busyAction) || !isOnline}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="employee-work-button--secondary"
                          onClick={() => void respondToHelp(request.id, false)}
                          disabled={Boolean(busyAction) || !isOnline}
                        >
                          Cannot Help
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <header className="employee-work__detail-navigation">
            <button type="button" onClick={closeTicketDetails}>
              <span aria-hidden="true">←</span> Back to My Work
            </button>
            <div>
              <span>Work details</span>
              <strong>{selectedItem?.ticketNumber ?? "Loading ticket..."}</strong>
            </div>
            <button
              type="button"
              onClick={() => setRefreshKey((value) => value + 1)}
              disabled={loadingDetail}
            >
              {loadingDetail ? "Refreshing..." : "Refresh"}
            </button>
          </header>
        )}

        {pageError && (
          <section className="employee-work__state" role="alert">
            <WorkIcon name="warning" />
            <div>
              <strong>My Work could not be loaded</strong>
              <p>{pageError}</p>
            </div>
            <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>
              Try Again
            </button>
          </section>
        )}

        {!isOnline && (
          <div className="employee-work__offline" role="status" aria-live="polite">
            <WorkIcon name="warning" />
            <div>
              <strong>No internet</strong>
              <span>You can still read the work and add details. Sending will be available when you reconnect.</span>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="employee-work__notice employee-work__notice--success" role="status">
            <WorkIcon name="check" />
            <span>{successMessage}</span>
            <button type="button" aria-label="Dismiss message" onClick={() => setSuccessMessage("")}>
              <WorkIcon name="close" />
            </button>
          </div>
        )}

        {actionError && (
          <div className="employee-work__notice employee-work__notice--error" role="alert">
            <WorkIcon name="warning" />
            <span>{actionError}</span>
            <button type="button" aria-label="Dismiss error" onClick={() => setActionError("")}>
              <WorkIcon name="close" />
            </button>
          </div>
        )}

        <section className={selectedId
          ? "employee-work__workspace employee-work__workspace--detail-only"
          : "employee-work__workspace employee-work__workspace--list-only"}>
          <aside className="employee-work__list-panel">
            <header>
              <div>
                <span>All work</span>
                <h2>Choose a task</h2>
              </div>
              <strong>{pagination.total}</strong>
            </header>

            <nav className="employee-work__view-tabs" aria-label="My work views">
              <button
                type="button"
                className={view === "ACTIVE" ? "is-active" : ""}
                aria-current={view === "ACTIVE" ? "page" : undefined}
                onClick={() => {
                  setView("ACTIVE");
                  setStatus("");
                  setPage(1);
                  setSearchParams({}, { replace: true });
                }}
              >
                Current work
              </button>
              <button
                type="button"
                className={view === "HISTORY" ? "is-active" : ""}
                aria-current={view === "HISTORY" ? "page" : undefined}
                onClick={() => {
                  setView("HISTORY");
                  setStatus("");
                  setPage(1);
                  setSearchParams({}, { replace: true });
                }}
              >
                Work history
              </button>
            </nav>

            {view === "HISTORY" && (
              <section className="employee-work__history-range" aria-label="History date range">
                <div className="employee-work__history-presets">
                  {[7, 30, 90].map((days) => (
                    <button
                      key={days}
                      type="button"
                      className={historyFrom === getHistoryFrom(days) && historyTo === toDateInput(new Date()) ? "is-active" : ""}
                      onClick={() => {
                        setHistoryFrom(getHistoryFrom(days));
                        setHistoryTo(toDateInput(new Date()));
                        setPage(1);
                      }}
                    >
                      Last {days} days
                    </button>
                  ))}
                </div>
                <div className="employee-work__history-dates">
                  <label>
                    <span>From</span>
                    <input
                      type="date"
                      value={historyFrom}
                      max={historyTo}
                      onChange={(event) => {
                        setHistoryFrom(event.target.value);
                        setPage(1);
                      }}
                    />
                  </label>
                  <label>
                    <span>To</span>
                    <input
                      type="date"
                      value={historyTo}
                      min={historyFrom}
                      max={toDateInput(new Date())}
                      onChange={(event) => {
                        setHistoryTo(event.target.value);
                        setPage(1);
                      }}
                    />
                  </label>
                </div>
              </section>
            )}

            <details className="employee-work__filter-disclosure">
              <summary>
                <WorkIcon name="search" />
                Search and filters
              </summary>
              <form className="employee-work__filters" onSubmit={submitSearch}>
                <label className="employee-work__search">
                  <span className="sr-only">Search work</span>
                  <WorkIcon name="search" />
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search ticket or location"
                  />
                  <button type="submit">Search</button>
                </label>

                <div>
                  <label>
                    <span>Status</span>
                    <select
                      value={status}
                      onChange={(event) => {
                        setStatus(event.target.value as WorkItemStatus | "");
                        setPage(1);
                      }}
                    >
                      <option value="">All statuses</option>
                      {Object.entries(STATUS_LABELS)
                        .filter(([value]) =>
                          view === "ACTIVE"
                            ? !TERMINAL_STATUSES.includes(value as WorkItemStatus)
                            : TERMINAL_STATUSES.includes(value as WorkItemStatus),
                        )
                        .map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                  </label>
                </div>
              </form>
            </details>

            <div className="employee-work__ticket-list">
              {loadingList && items.length === 0 && (
                <div className="employee-work__empty">
                  <span className="employee-work__spinner" />
                  <strong>Loading your assigned work</strong>
                </div>
              )}

              {!loadingList && items.length === 0 && (
                <div className="employee-work__empty">
                  <WorkIcon name="check" />
                  <strong>{view === "ACTIVE" ? "No active work" : "No recent work history"}</strong>
                  <p>
                    {view === "ACTIVE"
                      ? "New assignments that require action will appear here."
                      : `Closed and cancelled work from ${historyFrom} to ${historyTo} will appear here.`}
                  </p>
                </div>
              )}

              {items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={selectedId === item.id ? "employee-work-ticket employee-work-ticket--active" : "employee-work-ticket"}
                  onClick={() => selectTicket(item.id)}
                >
                  <strong>{item.title}</strong>
                  <small>{item.ticketNumber}</small>
                  <div>
                    <span className={`employee-work-status employee-work-status--${item.status.toLowerCase()}`}>
                      {STATUS_LABELS[item.status]}
                    </span>
                    <time className={new Date(item.dueAt).getTime() < Date.now() && !TERMINAL_STATUSES.includes(item.status) ? "employee-work-ticket__due employee-work-ticket__due--overdue" : "employee-work-ticket__due"}>
                      {formatRelativeDue(item.dueAt)}
                    </time>
                  </div>
                </button>
              ))}
            </div>

            <footer className="employee-work__pagination">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1 || loadingList}
              >
                Previous
              </button>
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(pagination.totalPages, value + 1))}
                disabled={page >= pagination.totalPages || loadingList}
              >
                Next
              </button>
            </footer>
          </aside>

          <article className="employee-work__detail-panel">
            {loadingDetail && (
              <div className="employee-work__empty employee-work__empty--detail">
                <span className="employee-work__spinner" />
                <strong>Loading work details</strong>
              </div>
            )}

            {!loadingDetail && !selectedItem && (
              <div className="employee-work__empty employee-work__empty--detail">
                <WorkIcon name="work" />
                <strong>Select a work item</strong>
                <p>Choose a ticket from the list to review its details and required action.</p>
              </div>
            )}

            {!loadingDetail && selectedItem && (
              <>
                <header className="employee-work-detail__header">
                  <div>
                    <div className="employee-work-detail__eyebrow">
                      <span>{selectedItem.ticketNumber}</span>
                    </div>
                    <h2>{selectedItem.title}</h2>
                    {!selectedItem.customerName && !selectedItem.serviceNumber && (
                      <p>{selectedItem.description}</p>
                    )}
                  </div>
                  <div className="employee-work-detail__status-block">
                    <span className={`employee-work-status employee-work-status--${selectedItem.status.toLowerCase()}`}>
                      {STATUS_LABELS[selectedItem.status]}
                    </span>
                    {sharedTeamStartedBy && (
                      <small>Started by {sharedTeamStartedBy}</small>
                    )}
                  </div>
                </header>

                {latestInformationRequest(selectedItem) && (
                  <section className="employee-work-detail__manager-note" role="status">
                    <WorkIcon name="warning" />
                    <div>
                      <strong>Manager returned this work</strong>
                      <p>
                        {selectedItem.completionReports?.find(
                          (report) => report.reviewStatus === "INFORMATION_REQUESTED",
                        )?.managerNote || "Please correct the information and send it again."}
                      </p>
                    </div>
                  </section>
                )}

                {workerNextStep && !isSalesParticipant && !isSupportingParticipant && (
                  <section className="employee-work-next-action" aria-label="Next step">
                    <div className="employee-work-next-action__copy">
                      <span>Next step</span>
                      <strong>{workerNextStep.title}</strong>
                      <p>{workerNextStep.message}</p>
                    </div>
                    <div className="employee-work-next-action__controls">
                      {canAcknowledge && (
                        <button
                          type="button"
                          onClick={() => accessToken && void runSimpleAction(
                            "acknowledge",
                            () => acknowledgeEmployeeWork(accessToken, selectedItem.id),
                          )}
                          disabled={Boolean(busyAction) || !isOnline}
                        >
                          {busyAction === "acknowledge" ? "Saving..." : "Accept Work"}
                        </button>
                      )}
                      {canStart && (
                        <button
                          type="button"
                          onClick={() => accessToken && void runSimpleAction(
                            "start",
                            () => startEmployeeWork(accessToken, selectedItem.id),
                          )}
                          disabled={Boolean(busyAction) || !isOnline}
                        >
                          {busyAction === "start" ? "Starting..." : "Start Work"}
                        </button>
                      )}
                      {canSubmitCompletion && (
                        <button
                          type="button"
                          className="employee-work-button--success"
                          onClick={openCompletionDialog}
                        >
                          <WorkIcon name="check" />
                          {latestInformationRequest(selectedItem) ? "Send Correction" : "Finish Work"}
                        </button>
                      )}
                      {canRequestHelp && (
                        <button
                          type="button"
                          className="employee-work-next-action__help"
                          onClick={() => setDialog("help")}
                        >
                          <WorkIcon name="help" />
                          Need Help
                        </button>
                      )}
                    </div>
                  </section>
                )}

                {selectedItem.type !== "ADMINISTRATIVE_TASK" && (
                <section className="employee-work-detail__service-details" aria-label="Customer and service details">
                  <header>
                    <span>Work details</span>
                    <h3>{workTypeLabel(selectedItem.type)}</h3>
                  </header>
                  <div>
                    <article>
                      <span>Customer</span>
                      <strong>{selectedItem.customerName ?? "Not recorded"}</strong>
                    </article>
                    <article>
                      <span>
                        {selectedItem.customerContactType === "MOBILE"
                          ? "Mobile number"
                          : selectedItem.customerContactType === "TELEPHONE"
                            ? "Telephone number"
                            : "Contact number"}
                      </span>
                      <strong>{selectedItem.customerContactNumber ?? "Not recorded"}</strong>
                    </article>
                    <article>
                      <span>Location</span>
                      <strong>{selectedItem.locationText ?? "Not recorded"}</strong>
                    </article>
                    {["NEW_CONNECTION", "UPDATE_SERVICES"].includes(selectedItem.type) && (
                      <article>
                        <span>Token number</span>
                        <strong>{selectedItem.requestNumber ?? "Not recorded"}</strong>
                      </article>
                    )}
                    {selectedItem.type === "NEW_CONNECTION" && (
                      <article>
                        <span>CPC Serial</span>
                        <strong>{selectedItem.cpcSerial ?? "Not recorded"}</strong>
                      </article>
                    )}
                    {!["MAINTENANCE", "NEW_CONNECTION"].includes(selectedItem.type) && (
                      <article>
                        <span>
                          {selectedItem.type === "UPDATE_SERVICES"
                            ? "Existing service number"
                            : "Service number"}
                        </span>
                        <strong>{selectedItem.serviceNumber ?? "Not recorded"}</strong>
                      </article>
                    )}
                    <article><span>OLT</span><strong>{selectedItem.olt ?? "Not recorded"}</strong></article>
                    <article><span>FDC</span><strong>{selectedItem.fdcName ?? "Not recorded"}</strong></article>
                    <article><span>FAP</span><strong>{selectedItem.fapName ?? "Not recorded"}</strong></article>
                    <article>
                      <span>Services</span>
                      <strong>
                        {selectedItem.serviceTypes.length > 0
                          ? selectedItem.serviceTypes
                            .map((serviceType) =>
                              serviceType === "OTHER"
                                ? selectedItem.otherServiceText ?? "Other"
                                : serviceTypeLabel(serviceType),
                            )
                            .join(", ")
                          : workTypeLabel(selectedItem.type)}
                      </strong>
                    </article>
                  </div>
                </section>
                )}

                <section className="employee-work-detail__facts" aria-label="Work details">
                  {selectedItem.type !== "ADMINISTRATIVE_TASK" && (
                    <div>
                      <WorkIcon name="clock" />
                      <span>Registered date and time</span>
                      <strong>{formatDateTime(selectedItem.registeredAt)}</strong>
                    </div>
                  )}
                  <div>
                    <WorkIcon name="clock" />
                    <span>System created</span>
                    <strong>{formatDateTime(selectedItem.createdAt)}</strong>
                  </div>
                  <div>
                    <WorkIcon name="clock" />
                    <span>Planned start</span>
                    <strong>{formatDateTime(selectedItem.plannedStartAt)}</strong>
                  </div>
                  <div>
                    <WorkIcon name="clock" />
                    <span>Due time</span>
                    <strong>{formatDateTime(selectedItem.dueAt)}</strong>
                    <small>{formatRelativeDue(selectedItem.dueAt)}</small>
                  </div>
                  <div>
                    <WorkIcon name="location" />
                    <span>Location</span>
                    <strong>{selectedItem.locationText || "Location not specified"}</strong>
                    <small>{selectedItem.department?.name ?? selectedItem.division.name}</small>
                  </div>
                  <div>
                    <WorkIcon name="manager" />
                    <span>Responsible manager</span>
                    <strong>{accountName(selectedItem.responsibleManager)}</strong>
                    <small>{selectedItem.responsibleManager.employee?.designation || "Management"}</small>
                  </div>
                  <div>
                    <WorkIcon name="manager" />
                    <span>Assigned by</span>
                    <strong>{accountName(selectedItem.createdBy)}</strong>
                    <small>{selectedItem.createdBy.employee?.designation || "Management"}</small>
                  </div>
                  <div>
                    <WorkIcon name="manager" />
                    <span>Assigned team</span>
                    <strong>{selectedItem.assignedTeam?.name ?? "Individual assignment"}</strong>
                    <small>{selectedItem.department?.name ?? selectedItem.division.name}</small>
                  </div>
                </section>

                {selectedItem.parentWorkItem && (
                  <section className="employee-work-detail__linked-context" aria-label="Linked parent responsibility">
                    {/* Employees see parent context without gaining access to management-only parent details. */}
                    <span>Linked child task</span>
                    <strong>{selectedItem.parentWorkItem.ticketNumber}</strong>
                    <p>{selectedItem.parentWorkItem.title}</p>
                  </section>
                )}

                {canUseSalesPanel && selectedItem.salesMember && (
                  <section className="employee-work-sales" aria-labelledby="employee-work-sales-title">
                    <header>
                      <div>
                        <span>Sales</span>
                        <h3 id="employee-work-sales-title">{accountName(selectedItem.salesMember)}</h3>
                      </div>
                      <strong className={`employee-work-sales__status employee-work-sales__status--${(selectedItem.salesCoordinationStatus ?? "WAITING_FOR_DOCUMENTS").toLowerCase()}`}>
                        {salesStatusLabel(selectedItem.salesCoordinationStatus)}
                      </strong>
                    </header>

                    {isSalesParticipant && selectedItem.salesCoordinationStatus === "WAITING_FOR_DOCUMENTS" && (
                      <div className="employee-work-sales__waiting">
                        <WorkIcon name="clock" />
                        <div>
                          <strong>Waiting for the field team</strong>
                          <span>The documents will appear here after they send the work to Sales.</span>
                        </div>
                      </div>
                    )}

                    {loadingSalesMessages ? (
                      <p className="employee-work-sales__loading">Loading Sales updates...</p>
                    ) : salesMessages.length > 0 ? (
                      <div className="employee-work-sales__messages" aria-label="Sales messages">
                        {salesMessages.map((message) => (
                          <article
                            key={message.id}
                            className={message.senderAccountId === account?.id ? "employee-work-sales__message employee-work-sales__message--mine" : "employee-work-sales__message"}
                          >
                            <div>
                              <strong>{message.senderName}</strong>
                              <time>{formatDateTime(message.createdAt)}</time>
                            </div>
                            {message.text && <p>{message.text}</p>}
                            {message.attachments.length > 0 && (
                              <div className="employee-work-sales__files">
                                {message.attachments.map((attachment) => (
                                  <button
                                    key={attachment.id}
                                    type="button"
                                    onClick={() => void openSalesAttachment(message.id, attachment)}
                                    disabled={busyAction === `sales-file-${attachment.id}` || !isOnline}
                                  >
                                    <span>{attachment.originalFileName}</span>
                                    <small>{busyAction === `sales-file-${attachment.id}` ? "Opening..." : formatFileSize(attachment.fileSizeBytes)}</small>
                                  </button>
                                ))}
                              </div>
                            )}
                          </article>
                        ))}
                      </div>
                    ) : selectedItem.salesCoordinationStatus !== "WAITING_FOR_DOCUMENTS" ? (
                      <p className="employee-work-sales__loading">No messages yet.</p>
                    ) : null}

                    {(canSendToSales || canSendSalesUpdate) && (
                      <div className="employee-work-sales__composer">
                        <label>
                          <span>{canSendToSales ? "Message for Sales" : "Add an update"}</span>
                          <textarea
                            value={salesText}
                            maxLength={1500}
                            onChange={(event) => setSalesText(event.target.value)}
                            placeholder={isSalesParticipant ? "Add a short update if needed." : "Add a short note if needed."}
                          />
                        </label>

                        {salesFiles.length > 0 && (
                          <div className="employee-work-sales__selected-files">
                            {salesFiles.map((file, index) => (
                              <span key={`${file.name}-${file.lastModified}-${index}`}>
                                {file.name}
                                <button
                                  type="button"
                                  aria-label={`Remove ${file.name}`}
                                  onClick={() => setSalesFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        <p className="employee-work-sales__send-note" role="status">
                          {isOnline
                            ? "Your message and selected files stay here if sending fails."
                            : "No internet. You can keep adding a note or photo and send it after you reconnect."}
                        </p>

                        <div className="employee-work-sales__composer-actions">
                          <input
                            ref={salesPhotoInputRef}
                            type="file"
                            hidden
                            tabIndex={-1}
                            accept="image/*"
                            capture="environment"
                            onChange={(event) => {
                              addSalesFiles(event.target.files);
                              event.currentTarget.value = "";
                            }}
                          />
                          <input
                            ref={salesFileInputRef}
                            type="file"
                            hidden
                            tabIndex={-1}
                            multiple
                            accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                            onChange={(event) => {
                              addSalesFiles(event.target.files);
                              event.currentTarget.value = "";
                            }}
                          />
                          <button
                            type="button"
                            className="employee-work-sales__file-button"
                            onClick={() => salesPhotoInputRef.current?.click()}
                          >
                            Take Photo
                          </button>
                          <button
                            type="button"
                            className="employee-work-sales__file-button"
                            onClick={() => salesFileInputRef.current?.click()}
                          >
                            Choose File
                          </button>
                          {canSendToSales ? (
                            <button
                              type="button"
                              className="employee-work-sales__primary-action"
                              onClick={() => void runSalesAction("send")}
                              disabled={Boolean(busyAction) || !isOnline}
                            >
                              {busyAction === "sales-send" ? "Sending..." : "Send to Sales"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void runSalesAction("message")}
                              disabled={Boolean(busyAction) || !isOnline || (!salesText.trim() && salesFiles.length === 0)}
                            >
                              {busyAction === "sales-message" ? "Sending..." : "Send Update"}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {canCompleteSalesWork && (
                      <div className="employee-work-sales__complete">
                        <div>
                          <strong>Finished in the NTC system?</strong>
                          <span>You can add a message or file above first, then mark the Sales work done.</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void runSalesAction("complete")}
                          disabled={Boolean(busyAction) || !isOnline}
                        >
                          {busyAction === "sales-complete" ? "Saving..." : "Sales Work Done"}
                        </button>
                      </div>
                    )}

                    {isPrimary && salesBlocksCompletion && selectedItem.salesCoordinationStatus === "READY_FOR_SALES" && (
                      <div className="employee-work-sales__waiting employee-work-sales__waiting--compact">
                        <WorkIcon name="clock" />
                        <div>
                          <strong>Waiting for Sales</strong>
                          <span>You can finish this work after Sales marks their part done.</span>
                        </div>
                      </div>
                    )}

                    {selectedItem.salesCoordinationStatus === "COMPLETED" && (
                      <div className="employee-work-sales__done">
                        <WorkIcon name="check" />
                        <div>
                          <strong>Sales Work Done</strong>
                          <span>{selectedItem.salesCompletionNote || "The primary team can continue and finish the work."}</span>
                        </div>
                      </div>
                    )}
                  </section>
                )}

                <details className="employee-work-detail__people employee-work-detail__secondary-section">
                  <summary>
                    <div>
                      <span>People on this work</span>
                      <strong>{peopleCount} {peopleCount === 1 ? "person" : "people"}</strong>
                    </div>
                    <span className="employee-work-detail__secondary-toggle" aria-hidden="true" />
                  </summary>
                  <div className="employee-work-people-groups">
                    <section className="employee-work-people-group">
                      <header>
                        <div>
                          <span>{selectedItem.assignedTeam ? "Primary team" : "Primary worker"}</span>
                          <strong>{selectedItem.assignedTeam?.name ?? "Main responsibility"}</strong>
                        </div>
                        <small>{primaryPeople.length} {primaryPeople.length === 1 ? "person" : "members"}</small>
                      </header>
                      <div className="employee-work-people-list">
                        {primaryPeople.map((person) => (
                          <article key={person.key}>
                            <span aria-hidden="true">{person.name.charAt(0).toUpperCase()}</span>
                            <div>
                              <strong>{person.name}</strong>
                              <small>{person.designation ?? "Employee"}</small>
                            </div>
                            <div className="employee-work-people-badges">
                              {person.isTeamAdmin && <em>Team Admin</em>}
                              {person.startedWork && <em className="is-started">Started work</em>}
                              {!person.isTeamAdmin && !person.startedWork && <em>Team member</em>}
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>

                    {otherPeople.length > 0 && (
                      <section className="employee-work-people-group">
                        <header>
                          <div>
                            <span>Other people</span>
                            <strong>Sales and support</strong>
                          </div>
                          <small>{otherPeople.length} {otherPeople.length === 1 ? "person" : "people"}</small>
                        </header>
                        <div className="employee-work-people-list">
                          {otherPeople.map(({ account: personAccount, roles }) => (
                            <article key={personAccount.id}>
                              <span aria-hidden="true">{accountName(personAccount).charAt(0).toUpperCase()}</span>
                              <div>
                                <strong>{accountName(personAccount)}</strong>
                                <small>{personAccount.employee?.designation ?? "Employee"}</small>
                              </div>
                              <div className="employee-work-people-badges">
                                {roles.map((role) => <em key={role}>{role}</em>)}
                              </div>
                            </article>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                </details>

                {selectedItem.completionReports && selectedItem.completionReports.length > 0 && (
                  <details className="employee-work-detail__reports employee-work-detail__secondary-section">
                    <summary>
                      <div>
                        <span>Work updates</span>
                        <strong>{selectedItem.completionReports.length} submitted update{selectedItem.completionReports.length === 1 ? "" : "s"}</strong>
                      </div>
                      <span className="employee-work-detail__secondary-toggle" aria-hidden="true" />
                    </summary>
                    {selectedItem.completionReports.map((report) => (
                      <article key={report.id}>
                        <div>
                          <strong>{COMPLETION_RESULT_LABELS[report.result]}</strong>
                          <span>{report.reviewStatus.replaceAll("_", " ").toLowerCase()}</span>
                        </div>
                        <p>{report.summary}</p>
                        {report.managerNote && (
                          <blockquote>
                            <strong>Manager note</strong>
                            {report.managerNote}
                          </blockquote>
                        )}
                        <small>Submitted {formatDateTime(report.createdAt)}</small>
                      </article>
                    ))}
                  </details>
                )}

                <details className="employee-work-detail__timeline employee-work-detail__timeline--collapsible employee-work-detail__secondary-section">
                  <summary>
                    <div>
                      <WorkIcon name="history" />
                      <span>Work history</span>
                    </div>
                    <span className="employee-work-detail__timeline-toggle">
                      <strong className="employee-work-detail__timeline-show">Show</strong>
                      <strong className="employee-work-detail__timeline-hide">Hide</strong>
                    </span>
                  </summary>
                  <div className="employee-work-detail__timeline-content">
                    <ol>
                      {activities.map((activity) => (
                        <li key={activity.id}>
                          <span />
                          <div>
                            <strong>{activityLabel(activity)}</strong>
                            <p>{accountName(activity.actor)}</p>
                            <time>{formatDateTime(activity.createdAt)}</time>
                          </div>
                        </li>
                      ))}
                      {activities.length === 0 && (
                        <li className="employee-work-detail__timeline-empty">
                          No activity has been recorded yet.
                        </li>
                      )}
                    </ol>
                  </div>
                </details>
              </>
            )}
          </article>
        </section>
      </section>

      {dialog === "help" && selectedItem && (
        <div className="employee-work-dialog" role="dialog" aria-modal="true" aria-labelledby="help-dialog-title">
          <form onSubmit={submitHelp}>
            <header>
              <div>
                <span>Need Help</span>
                <h2 id="help-dialog-title">What support do you need?</h2>
                <p>Your responsible manager will be notified immediately.</p>
              </div>
              <button type="button" aria-label="Close help form" onClick={() => setDialog(null)}>
                <WorkIcon name="close" />
              </button>
            </header>

            <fieldset>
              <legend>Select one reason</legend>
              {Object.entries(HELP_REASON_LABELS).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="helpReason"
                    value={value}
                    checked={helpReason === value}
                    onChange={() => setHelpReason(value as WorkHelpReason)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>

            {helpReason === "NEED_ANOTHER_EMPLOYEE" && (
              <section className="employee-work-dialog__helper-options" aria-label="Find Help Now">
                <div>
                  <strong>Find Help Now</strong>
                  <p>Choose an on-duty coworker, request another department, or leave both empty to notify your manager.</p>
                </div>

                {loadingHelpOptions && <p>Checking who can help now...</p>}

                {!loadingHelpOptions && helpOptions && (
                  <>
                    <label>
                      <span>On-duty coworker (optional)</span>
                      <select
                        value={selectedHelperAccountId}
                        onChange={(event) => {
                          setSelectedHelperAccountId(event.target.value);
                          if (event.target.value) setSelectedHelpDepartmentId("");
                        }}
                      >
                        <option value="">Notify manager without selecting a coworker</option>
                        {helpOptions.data.map((candidate) => (
                          <option
                            key={candidate.account.id}
                            value={candidate.account.id}
                            disabled={!candidate.eligibleForDirectHelp}
                          >
                            {accountName(candidate.account)} · {candidate.availability.replaceAll("_", " ").toLowerCase()} · {candidate.isOnline === true ? "online" : candidate.isOnline === false ? "offline" : "presence private"} · {candidate.workload.active} active
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span>Another department (manager coordination)</span>
                      <select
                        value={selectedHelpDepartmentId}
                        onChange={(event) => {
                          setSelectedHelpDepartmentId(event.target.value);
                          if (event.target.value) setSelectedHelperAccountId("");
                        }}
                      >
                        <option value="">No cross-department request</option>
                        {helpOptions.crossDepartmentOptions.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    {helpOptions.data.length === 0 && (
                      <p>No same-department coworker is currently eligible. Your manager can coordinate support.</p>
                    )}
                  </>
                )}
              </section>
            )}

            <label className="employee-work-dialog__textarea">
              <span>Short note (optional)</span>
              <textarea
                value={helpNote}
                onChange={(event) => setHelpNote(event.target.value)}
                maxLength={1000}
                placeholder="Example: I need a fiber splicing tool."
              />
            </label>

            <footer>
              <button type="button" className="employee-work-button--secondary" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button type="submit" disabled={busyAction === "help" || !isOnline}>
                {busyAction === "help"
                  ? "Sending..."
                  : selectedHelperAccountId
                    ? "Ask Coworker"
                    : selectedHelpDepartmentId
                      ? "Request Department Help"
                      : "Notify Manager"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {dialog === "complete" && selectedItem && (
        <div className="employee-work-dialog" role="dialog" aria-modal="true" aria-labelledby="completion-dialog-title">
          <form className="employee-work-completion" onSubmit={submitCompletion}>
            <header>
              <div>
                <span>{latestInformationRequest(selectedItem) ? "More Information" : "Finish Work"}</span>
                <h2 id="completion-dialog-title">
                  {latestInformationRequest(selectedItem)
                    ? "Send the requested information"
                    : "Check and send your work"}
                </h2>
                <p>
                  {!usesOperationalCompletionPackage
                    ? "Add a short note about the work, then send it to your manager."
                    : requiresCompletionCustomerId
                      ? "Check the saved details, add Customer ID and RX Level, then send to your manager."
                      : allowsCompletionCustomerId
                        ? "Check the saved details, add RX Level and Customer ID if available, then send to your manager."
                        : "Check the saved details, add RX Level, then send to your manager."}
                </p>
              </div>
              <button type="button" aria-label="Close finish work form" onClick={() => setDialog(null)}>
                <WorkIcon name="close" />
              </button>
            </header>

            {usesOperationalCompletionPackage && (
              <>
                <section className="employee-work-completion__saved" aria-labelledby="completion-saved-title">
                  <div className="employee-work-completion__section-heading">
                    <div>
                      <span>Already added</span>
                      <h3 id="completion-saved-title">Work details</h3>
                    </div>
                    <small>You do not need to type these again.</small>
                  </div>
                  <div className="employee-work-completion__saved-grid">
                    {[
                      { label: "Customer", value: selectedItem.customerName },
                      { label: "Location", value: selectedItem.locationText },
                      ...(selectedCompletionReference ? [selectedCompletionReference] : []),
                      ...(selectedItem.type === "NEW_CONNECTION"
                        ? [{ label: "CPC Serial", value: selectedItem.cpcSerial }]
                        : []),
                      { label: "OLT", value: selectedItem.olt },
                      { label: "FDC", value: selectedItem.fdcName },
                      { label: "FAP", value: selectedItem.fapName },
                    ].map(({ label, value }) => (
                      <article key={label} className={!value ? "employee-work-completion__saved-item employee-work-completion__saved-item--missing" : "employee-work-completion__saved-item"}>
                        <span>{label}</span>
                        <strong>{value || "Missing"}</strong>
                        <em aria-hidden="true">{value ? "✓" : "!"}</em>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="employee-work-completion__field-info" aria-labelledby="completion-field-info-title">
                  <div className="employee-work-completion__section-heading">
                    <div>
                      <span>Add now</span>
                      <h3 id="completion-field-info-title">Field information</h3>
                    </div>
                    <small>Enter only the details collected while doing the work.</small>
                  </div>
                  <div className={`employee-work-completion__field-grid${allowsCompletionCustomerId ? "" : " is-single"}`}>
                    {allowsCompletionCustomerId && (
                      <label>
                        <span>Customer ID {requiresCompletionCustomerId ? "*" : "(optional)"}</span>
                        <input
                          type="text"
                          required={requiresCompletionCustomerId}
                          maxLength={100}
                          value={completionCustomerId}
                          onChange={(event) => setCompletionCustomerId(event.target.value)}
                          placeholder="Enter Customer ID"
                          autoComplete="off"
                        />
                      </label>
                    )}
                    <label>
                      <span>RX Level (dBm) *</span>
                      <input
                        type="number"
                        required
                        step="0.01"
                        min="-100"
                        max="20"
                        inputMode="decimal"
                        value={completionRxLevel}
                        onChange={(event) => setCompletionRxLevel(event.target.value)}
                        placeholder="Example: -18.5"
                      />
                    </label>
                  </div>
                </section>
              </>
            )}

            <fieldset className="employee-work-completion__result">
              <legend>Work result</legend>
              {Object.entries(COMPLETION_RESULT_LABELS).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="completionResult"
                    value={value}
                    checked={completionResult === value}
                    onChange={() => setCompletionResult(value as WorkCompletionResult)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>

            <label className="employee-work-dialog__textarea employee-work-completion__summary">
              <span>What did you do? *</span>
              <textarea
                required
                minLength={3}
                maxLength={3000}
                value={completionSummary}
                onChange={(event) => setCompletionSummary(event.target.value)}
                placeholder="Example: Installed the service and checked the connection."
              />
            </label>

            <label className="employee-work-dialog__checkbox employee-work-completion__more-work">
              <input
                type="checkbox"
                checked={moreWorkRequired}
                onChange={(event) => setMoreWorkRequired(event.target.checked)}
              />
              <span>More work is still needed after this update.</span>
            </label>

            <footer>
              <button type="button" className="employee-work-button--secondary" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  busyAction === "complete" ||
                  !isOnline ||
                  completionSummary.trim().length < 3 ||
                  (requiresCompletionCustomerId && !completionCustomerId.trim()) ||
                  (requiresCompletionRxLevel && !completionRxLevel.trim())
                }
              >
                {!isOnline
                  ? "No Internet"
                  : busyAction === "complete"
                    ? "Sending..."
                    : "Submit to Manager"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </main>
  );
}
