import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import {
  connectMessagingSocketAfterEffectCommit,
  createMessagingSocket,
} from "../services/messaging-socket.service";
import {
  getDutyCalendar,
  getMyDutySummary,
  updateMyWorkAvailability,
} from "../services/work-management.service";
import type {
  DutyCalendarResponse,
  MyDutyAssignment,
  DutyEffectiveStatus,
  MyDutySummary,
  WorkAvailabilityPreference,
} from "../types/work-management";

const BRANCH_TIME_ZONE = "Asia/Kathmandu";

const STATUS_LABELS: Record<DutyEffectiveStatus, string> = {
  ON_DUTY: "On Duty",
  OFF_DUTY: "Off Duty Now",
  UPCOMING: "Duty Starts Later Today",
  LEAVE: "On Leave",
  HOLIDAY: "Holiday",
};

type DutyIconName = "clock" | "location" | "manager" | "calendar" | "help" | "arrow";

function DutyIcon({ name }: { name: DutyIconName }): ReactNode {
  const props = {
    "aria-hidden": true,
    fill: "none",
    height: 22,
    viewBox: "0 0 24 24",
    width: 22,
  } as const;

  switch (name) {
    case "clock":
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case "location":
      return <svg {...props}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
    case "manager":
      return <svg {...props}><circle cx="12" cy="7" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></svg>;
    case "calendar":
      return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>;
    case "help":
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.4 2.4 0 1 1 3.3 2.2c-.9.4-1.1.9-1.1 1.8M12 17h.01" /></svg>;
    case "arrow":
      return <svg {...props}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
  }
}

function accountName(assignment: MyDutyAssignment | null | undefined): string {
  const account = assignment?.supervisor;
  return account?.employee?.empName ?? account?.superAdminProfile?.fullName ?? account?.username ?? "Assigned supervisor";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BRANCH_TIME_ZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatTimeRange(assignment: MyDutyAssignment): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: BRANCH_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatter.format(new Date(assignment.startsAt))} – ${formatter.format(new Date(assignment.endsAt))}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Duty information could not be loaded.";
}

function branchDateInput(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: BRANCH_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function EmployeeDutyPage() {
  const { accessToken } = useAuth();
  const [summary, setSummary] = useState<MyDutySummary | null>(null);
  const [calendar, setCalendar] = useState<DutyCalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!accessToken) return;

    let active = true;
    setLoading(true);
    setError("");

    const from = branchDateInput();
    void Promise.all([
      getMyDutySummary(accessToken),
      getDutyCalendar(accessToken, { from, to: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10) }),
    ])
      .then(([dutyResponse, calendarResponse]) => {
        if (!active) return;
        setSummary(dutyResponse);
        setCalendar(calendarResponse);
      })
      .catch((loadError) => {
        if (active) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, refreshKey]);

  useEffect(() => {
    if (!accessToken) return;

    const socket = createMessagingSocket(accessToken);
    const refreshDuty = () => setRefreshKey((value) => value + 1);
    socket.on("duty:schedule-updated", refreshDuty);
    const disconnectSocket = connectMessagingSocketAfterEffectCommit(socket);

    return () => {
      socket.off("duty:schedule-updated", refreshDuty);
      disconnectSocket();
    };
  }, [accessToken]);

  const status = summary?.effectiveStatus ?? "OFF_DUTY";
  // The Today card must never present tomorrow's assignment as today's duty.
  const visibleDuty = status === "ON_DUTY"
    ? summary?.current ?? null
    : status === "UPCOMING"
      ? summary?.next ?? null
      : null;
  const canHelpNow = summary?.availability.effective === "AVAILABLE";
  const upcoming = useMemo(
    () =>
      summary?.upcoming.filter(
        (assignment) =>
          !assignment.cancelledAt && assignment.id !== visibleDuty?.id,
      ) ?? [],
    [summary, visibleDuty?.id],
  );

  // Availability is a work preference; it does not create or modify attendance records.
  const updateAvailability = async (preference: WorkAvailabilityPreference) => {
    if (!accessToken) return;
    setUpdating(true);
    setError("");
    setSuccess("");

    try {
      const response = await updateMyWorkAvailability(accessToken, preference);
      setSuccess(response.message);
      setRefreshKey((value) => value + 1);
    } catch (updateError) {
      setError(errorMessage(updateError));
    } finally {
      setUpdating(false);
    }
  };

  return (
    <main className="employee-duty-page employee-duty-page--streamlined">
      <section className="employee-duty-page__canvas">
        {error && <section className="employee-duty__message employee-duty__message--error" role="alert">{error}</section>}
        {success && <section className="employee-duty__message employee-duty__message--success" role="status">{success}</section>}

        {loading && !summary ? (
          <section className="employee-duty__loading" role="status" aria-live="polite">
            <span className="employee-duty__loading-spinner" aria-hidden="true" />
            <div>
              <strong>Loading duty schedule</strong>
              <p>Checking today&apos;s duty and upcoming assignments.</p>
            </div>
          </section>
        ) : (
          <section className={`employee-duty__overview employee-duty__overview--${status.toLowerCase()}`} aria-busy={loading}>
            <header className="employee-duty__overview-header">
              <div className="employee-duty__overview-status">
                <span className="employee-duty__overview-icon"><DutyIcon name="calendar" /></span>
                <div>
                  <span>Today&apos;s Duty</span>
                  <h1>{STATUS_LABELS[status]}</h1>
                  <p>
                    {status === "ON_DUTY"
                      ? "You are currently scheduled for duty."
                      : status === "UPCOMING"
                        ? "Your duty starts later today."
                        : status === "LEAVE"
                          ? summary?.exception?.note || "Leave has been recorded for today."
                          : status === "HOLIDAY"
                            ? summary?.exception?.note || "Today is recorded as a holiday."
                            : "You are not on duty right now."}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </header>

            {visibleDuty ? (
              <div className="employee-duty__summary-grid">
                <article className="employee-duty__summary-card">
                  <span className="employee-duty__summary-icon"><DutyIcon name="calendar" /></span>
                  <div className="employee-duty__summary-copy">
                    <span className="employee-duty__summary-label">Shift</span>
                    <strong>{visibleDuty.shift.name}</strong>
                    <small>Scheduled duty</small>
                  </div>
                </article>
                <article className="employee-duty__summary-card">
                  <span className="employee-duty__summary-icon"><DutyIcon name="clock" /></span>
                  <div className="employee-duty__summary-copy">
                    <span className="employee-duty__summary-label">Time</span>
                    <strong>{formatTimeRange(visibleDuty)}</strong>
                    <small>{formatDate(visibleDuty.startsAt)}</small>
                  </div>
                </article>
                <article className="employee-duty__summary-card">
                  <span className="employee-duty__summary-icon"><DutyIcon name="location" /></span>
                  <div className="employee-duty__summary-copy">
                    <span className="employee-duty__summary-label">Reporting location</span>
                    <strong>{visibleDuty.reportingLocation}</strong>
                    <small>{visibleDuty.department?.name ?? visibleDuty.division.name}</small>
                  </div>
                </article>
                <article className="employee-duty__summary-card">
                  <span className="employee-duty__summary-icon"><DutyIcon name="manager" /></span>
                  <div className="employee-duty__summary-copy">
                    <span className="employee-duty__summary-label">Supervisor / manager</span>
                    <strong>{accountName(visibleDuty)}</strong>
                    <small>{visibleDuty.supervisor.employee?.designation || "Management"}</small>
                  </div>
                </article>
              </div>
            ) : (
              <div className="employee-duty__overview-empty">
                <DutyIcon name="calendar" />
                <div>
                  <strong>No current duty assignment</strong>
                  <p>Your next scheduled assignment is shown below when available.</p>
                </div>
              </div>
            )}

          </section>
        )}

        <section className="employee-duty__availability employee-duty__availability--streamlined" aria-busy={loading}>
          <div>
            <DutyIcon name="help" />
            <div>
              <span>Help Availability</span>
              <h2>{canHelpNow ? "Available to help" : summary?.availability.preference === "BUSY" ? "Busy with current work" : "Available when on duty"}</h2>
              <p>Choose whether teammates may request your help during duty.</p>
            </div>
          </div>
          <div className="employee-duty__availability-actions" role="group" aria-label="Help availability">
            <button
              type="button"
              className={summary?.availability.preference === "AVAILABLE" ? "active" : ""}
              aria-pressed={summary?.availability.preference === "AVAILABLE"}
              onClick={() => void updateAvailability("AVAILABLE")}
              disabled={updating || loading || !summary}
            >
              Available to Help
            </button>
            <button
              type="button"
              className={summary?.availability.preference === "BUSY" ? "active" : ""}
              aria-pressed={summary?.availability.preference === "BUSY"}
              onClick={() => void updateAvailability("BUSY")}
              disabled={updating || loading || !summary}
            >
              Busy
            </button>
          </div>
        </section>

        <section className="employee-duty__schedule" aria-busy={loading}>
          <header>
            <div>
              <span>Upcoming Duty</span>
              <h2>Your next scheduled duties</h2>
            </div>
            <span className="employee-duty__schedule-count">{upcoming.length} scheduled</span>
          </header>

          {upcoming.length > 0 ? (
            <div className="employee-duty__schedule-table-wrap">
              <table className="employee-duty__schedule-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Shift</th>
                    <th>Time</th>
                    <th>Location</th>
                    <th>Supervisor</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((assignment) => (
                    <tr key={assignment.id}>
                      <td><strong>{formatDate(assignment.startsAt)}</strong></td>
                      <td>{assignment.shift.name}</td>
                      <td>{formatTimeRange(assignment)}</td>
                      <td>{assignment.reportingLocation}</td>
                      <td>{accountName(assignment)}</td>
                      <td>
                        <span className="employee-duty__schedule-status">Upcoming</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="employee-duty__schedule-empty">
              <DutyIcon name="calendar" />
              <div>
                <strong>No upcoming duty scheduled</strong>
                <p>Your next duty will appear here after management assigns it.</p>
              </div>
            </div>
          )}
        </section>

        <section className="employee-duty__schedule employee-duty__holiday-calendar" aria-label="Holiday calendar">
          <header><div><span>Holiday Calendar</span><h2>Upcoming non-working days</h2></div></header>
          <div className="employee-duty__holiday-list">
            {calendar?.weeklyOffDays.length ? <article><DutyIcon name="calendar" /><div><strong>Weekly off</strong><span>{calendar.weeklyOffDays.map((day) => ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][day]).join(", ")}</span></div></article> : null}
            {calendar?.holidays.slice(0, 5).map((holiday) => <article key={holiday.id}><DutyIcon name="calendar" /><div><strong>{holiday.name}</strong><span>{formatDate(`${holiday.startDate}T00:00:00Z`)}{holiday.endDate !== holiday.startDate ? ` – ${formatDate(`${holiday.endDate}T00:00:00Z`)}` : ""} · {holiday.type.toLowerCase().replaceAll("_", " ")}</span></div></article>)}
            {!calendar?.weeklyOffDays.length && !calendar?.holidays.length && <p>No upcoming holiday is recorded.</p>}
          </div>
          <p className="employee-duty__holiday-note">Holiday and weekly-off dates do not prevent essential operational duty when management schedules coverage.</p>
        </section>

        <section className="employee-duty__boundary employee-duty__boundary--compact">
          <DutyIcon name="help" />
          <div>
            <strong>Duty schedule is not attendance</strong>
            <p>Duty information shows planned work only. It does not confirm attendance or completed shift hours.</p>
          </div>
        </section>
      </section>
    </main>
  );
}
