import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { useAuth } from "../context/AuthContext";
import {
  getEmployeeWorkDashboardSummary,
  getMyDutySummary,
  listEmployeeWorkItems,
} from "../services/work-management.service";
import type {
  MyDutySummary,
  WorkEmployeeDashboardSummary,
  WorkItem,
  WorkItemStatus,
} from "../types/work-management";

type DashboardIconName =
  | "arrow"
  | "calendar"
  | "check"
  | "clock"
  | "messages"
  | "refresh"
  | "warning"
  | "work";

function DashboardIcon({ name }: { name: DashboardIconName }): ReactNode {
  const props = {
    "aria-hidden": true,
    fill: "none",
    height: 22,
    viewBox: "0 0 24 24",
    width: 22,
  } as const;

  switch (name) {
    case "arrow":
      return <svg {...props}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    case "calendar":
      return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>;
    case "check":
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></svg>;
    case "clock":
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case "messages":
      return <svg {...props}><path d="M4 4h16v12H8l-4 4Z" /><path d="M8 8h8M8 12h5" /></svg>;
    case "refresh":
      return <svg {...props}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 8a7 7 0 0 1 11.8-1L20 12M4 12l2.1 5a7 7 0 0 0 11.8-1" /></svg>;
    case "warning":
      return <svg {...props}><path d="M12 3 2.8 19h18.4Z" /><path d="M12 9v4M12 17h.01" /></svg>;
    case "work":
      return <svg {...props}><path d="M9 6V4h6v2" /><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 11h18M9 11v2h6v-2" /></svg>;
  }
}

const ACTIVE_STATUSES: WorkItemStatus[] = [
  "ASSIGNED",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "HELP_REQUESTED",
  "COMPLETED_PENDING_REVIEW",
  "REOPENED",
  "BLOCKED",
];

const WORK_STATUS_LABELS: Record<WorkItemStatus, string> = {
  ASSIGNED: "New",
  ACKNOWLEDGED: "New",
  IN_PROGRESS: "In Progress",
  HELP_REQUESTED: "Need Help",
  COMPLETED_PENDING_REVIEW: "Waiting for Approval",
  CLOSED: "Completed",
  REOPENED: "Returned",
  BLOCKED: "Blocked",
  CANCELLED: "Cancelled",
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getLocalDayRange(value = new Date()) {
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  const end = new Date(value);
  end.setHours(23, 59, 59, 999);

  return {
    dayKey: `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`,
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

function getDutyHeadline(summary: MyDutySummary | null): string {
  switch (summary?.effectiveStatus) {
    case "ON_DUTY":
      return "You are on duty";
    case "UPCOMING":
      return "Duty starts later today";
    case "LEAVE":
      return "You are on leave today";
    case "HOLIDAY":
      return "Today is a holiday";
    default:
      return "You are off duty today";
  }
}

function getDutyDescription(summary: MyDutySummary | null): string {
  if (summary?.current) {
    return `${summary.current.shift.name} · ${formatTime(summary.current.startsAt)}–${formatTime(summary.current.endsAt)} · ${summary.current.reportingLocation}`;
  }

  if (summary?.next) {
    return `Next duty: ${formatDateTime(summary.next.startsAt)}`;
  }

  return "No upcoming duty has been scheduled.";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Your dashboard could not be loaded.";
}

export function EmployeeDashboardPage() {
  const { account, accessToken } = useAuth();
  const [workSummary, setWorkSummary] = useState<WorkEmployeeDashboardSummary | null>(null);
  const [dutySummary, setDutySummary] = useState<MyDutySummary | null>(null);
  const [todayOpen, setTodayOpen] = useState<WorkItem[]>([]);
  const [todayOpenTotal, setTodayOpenTotal] = useState(0);
  const [todayCompletedTotal, setTodayCompletedTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [dayKey, setDayKey] = useState(() => getLocalDayRange().dayKey);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextDayKey = getLocalDayRange().dayKey;
      setDayKey((current) => (current === nextDayKey ? current : nextDayKey));
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      setError("Your secure session is unavailable. Sign in again.");
      return;
    }

    let active = true;
    const range = getLocalDayRange();
    setLoading(true);
    setError("");

    Promise.all([
      getEmployeeWorkDashboardSummary(accessToken),
      getMyDutySummary(accessToken),
      listEmployeeWorkItems(accessToken, {
        view: "ACTIVE",
        page: 1,
        limit: 4,
        plannedFrom: range.from,
        plannedTo: range.to,
      }),
      listEmployeeWorkItems(accessToken, {
        view: "HISTORY",
        status: "CLOSED",
        page: 1,
        limit: 4,
        plannedFrom: range.from,
        plannedTo: range.to,
        historyFrom: range.from,
        historyTo: range.to,
      }),
    ])
      .then(([summaryResponse, dutyResponse, openResponse, completedResponse]) => {
        if (!active) return;

        setWorkSummary(summaryResponse);
        setDutySummary(dutyResponse);
        setTodayOpen(openResponse.data);
        setTodayOpenTotal(openResponse.pagination.total);
        setTodayCompletedTotal(completedResponse.pagination.total);
      })
      .catch((requestError: unknown) => {
        if (active) setError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, dayKey, refreshKey]);

  const attentionTotal = useMemo(
    () =>
      (workSummary?.totals.overdue ?? 0) +
      (workSummary?.totals.informationRequested ?? 0),
    [workSummary],
  );

  const importantWork = useMemo(() => {
    const workById = new Map<string, WorkItem>();

    [...todayOpen, ...(workSummary?.nextWork ?? [])]
      .filter((item) => ACTIVE_STATUSES.includes(item.status))
      .forEach((item) => workById.set(item.id, item));

    return Array.from(workById.values()).slice(0, 4);
  }, [todayOpen, workSummary]);

  return (
    <main className="employee-dashboard">
      <section className="employee-dashboard__canvas">
        <header className="employee-dashboard__hero employee-dashboard__hero--simple">
          <div>
            <span>Employee workspace</span>
            <h1>Hello, {account?.displayName ?? "NT Message User"}</h1>
            <p>See today&apos;s duty and work, then open the section you need.</p>
          </div>

          <button
            type="button"
            className="employee-dashboard__refresh"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
          >
            <DashboardIcon name="refresh" />
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </header>

        {error && (
          <section className="employee-dashboard__state" role="alert">
            <div>
              <strong>Dashboard data unavailable</strong>
              <p>{error}</p>
            </div>
            <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>
              Try again
            </button>
          </section>
        )}

        <section className="employee-dashboard__essential-grid">
          <article
            className={`employee-dashboard__duty-overview employee-dashboard__duty-overview--${dutySummary?.effectiveStatus?.toLowerCase().replaceAll("_", "-") ?? "off-duty"}`}
            aria-label="Today's duty"
          >
            <div className="employee-dashboard__duty-card">
              <div className="employee-dashboard__duty-icon" aria-hidden="true">
                <DashboardIcon name="calendar" />
              </div>

              <div className="employee-dashboard__duty-content">
                <span>Today&apos;s Duty</span>
                <h2>{getDutyHeadline(dutySummary)}</h2>

                {dutySummary?.current ? (
                  <div className="employee-dashboard__duty-facts">
                    <div>
                      <small>Shift</small>
                      <strong>{dutySummary.current.shift.name}</strong>
                    </div>
                    <div>
                      <small>Time</small>
                      <strong>{formatTime(dutySummary.current.startsAt)}–{formatTime(dutySummary.current.endsAt)}</strong>
                    </div>
                    <div>
                      <small>Location</small>
                      <strong>{dutySummary.current.reportingLocation}</strong>
                    </div>
                  </div>
                ) : (
                  <p>{getDutyDescription(dutySummary)}</p>
                )}
              </div>

              <Link to="/employee/duty">
                Open My Duty
                <DashboardIcon name="arrow" />
              </Link>
            </div>
          </article>

          <article className="employee-dashboard__quick-panel" aria-label="Quick actions">
            <header>
              <span>Quick access</span>
              <h2>Open what you need</h2>
            </header>
            <div>
              <Link to="/employee/work">
                <DashboardIcon name="work" />
                <strong>My Work</strong>
                <DashboardIcon name="arrow" />
              </Link>
              <Link to="/employee/duty">
                <DashboardIcon name="calendar" />
                <strong>My Duty</strong>
                <DashboardIcon name="arrow" />
              </Link>
              <Link to="/messages">
                <DashboardIcon name="messages" />
                <strong>Messages</strong>
                <DashboardIcon name="arrow" />
              </Link>
            </div>
          </article>
        </section>

        <section className="employee-dashboard__work-overview" aria-label="Today's work">
          <header>
            <div>
              <span>Today&apos;s Work</span>
              <h2>Work that needs your attention</h2>
              <p>These lists update automatically when the date changes.</p>
            </div>
            <Link to="/employee/work">Open My Work <DashboardIcon name="arrow" /></Link>
          </header>

          <div className="employee-dashboard__work-cards employee-dashboard__work-cards--simple">
            <article>
              <DashboardIcon name="clock" />
              <span>Uncompleted today</span>
              <strong>{formatNumber(todayOpenTotal)}</strong>
              <small>Planned for today and still open</small>
            </article>
            <article>
              <DashboardIcon name="check" />
              <span>Completed today</span>
              <strong>{formatNumber(todayCompletedTotal)}</strong>
              <small>Planned and completed today</small>
            </article>
            <article>
              <DashboardIcon name="work" />
              <span>New work</span>
              <strong>{formatNumber(workSummary?.totals.newWork ?? 0)}</strong>
              <small>Ready to start</small>
            </article>
            <article>
              <DashboardIcon name="warning" />
              <span>Need attention</span>
              <strong>{formatNumber(attentionTotal)}</strong>
              <small>Overdue or manager response required</small>
            </article>
          </div>

          <div className="employee-dashboard__next-work">
            {importantWork.map((item) => (
              <Link key={item.id} to={`/employee/work?ticket=${item.id}`}>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.ticketNumber} · Due {formatDateTime(item.dueAt)}</small>
                </div>
                <span>{WORK_STATUS_LABELS[item.status]}</span>
                <DashboardIcon name="arrow" />
              </Link>
            ))}

            {!loading && importantWork.length === 0 && (
              <div className="employee-dashboard__work-empty">
                <DashboardIcon name="check" />
                <div>
                  <strong>No work needs attention</strong>
                  <small>New assignments will appear here.</small>
                </div>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
