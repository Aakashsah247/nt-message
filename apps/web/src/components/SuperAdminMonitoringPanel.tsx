import { useEffect, useMemo, useState } from "react";

import {
  getSuperAdminActivityLogs,
  getSuperAdminMonitoring,
} from "../services/monitoring.service";
import type {
  ActivityEventType,
  MonitoringActivityLogQuery,
  MonitoringActivityLogRow,
  MonitoringActivityLogsResponse,
  MonitoringEmployeeRow,
  MonitoringStatus,
  SuperAdminMonitoringResponse,
} from "../types/monitoring";

interface SuperAdminMonitoringPanelProps {
  accessToken: string;
}

type MonitoringView = "OVERVIEW" | "LOGS" | "EMPLOYEE";

const DEFAULT_LOG_LIMIT = 25;
const DEFAULT_FROM_TIME = "09:00";
const DEFAULT_TO_TIME = "18:00";
const ACTIVITY_EVENT_OPTIONS: Array<ActivityEventType | "ALL"> = [
  "ALL",
  "LOGIN",
  "LOGOUT",
  "PAGE_VIEW",
  "BUTTON_CLICK",
  "ACTIVE_HEARTBEAT",
  "IDLE_STARTED",
  "IDLE_HEARTBEAT",
  "ACTIVE_RESUMED",
  "EMERGENCY_ALERT_SENT",
  "SESSION_POLICY_LOGOUT",
];

function getTodayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusLabel(status: MonitoringStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function SuperAdminMonitoringPanel({
  accessToken,
}: SuperAdminMonitoringPanelProps) {
  const [monitoring, setMonitoring] =
    useState<SuperAdminMonitoringResponse | null>(null);
  const [activityLogs, setActivityLogs] =
    useState<MonitoringActivityLogsResponse | null>(null);
  const [view, setView] = useState<MonitoringView>("OVERVIEW");
  const [date, setDate] = useState(getTodayInputValue);
  const [fromTime, setFromTime] = useState(DEFAULT_FROM_TIME);
  const [toTime, setToTime] = useState(DEFAULT_TO_TIME);
  const [accountId, setAccountId] = useState("ALL");
  const [role, setRole] = useState("ALL");
  const [department, setDepartment] = useState("ALL");
  const [eventType, setEventType] = useState<ActivityEventType | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState("");
  const [logsError, setLogsError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!accessToken) {
      setError("Your secure session is not available. Sign in again.");
      setLoading(false);
      return;
    }

    let active = true;

    function loadMonitoring(): void {
      getSuperAdminMonitoring(accessToken)
        .then((response) => {
          if (!active) {
            return;
          }

          setMonitoring(response);
          setError("");
        })
        .catch((requestError: unknown) => {
          if (!active) {
            return;
          }

          setMonitoring(null);
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Monitoring data could not be loaded.",
          );
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });
    }

    setLoading(true);
    loadMonitoring();

    // Polling every 15 seconds gives near real-time status without exposing private content.
    const intervalId = window.setInterval(loadMonitoring, 15_000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [accessToken, refreshKey]);

  const activityQuery = useMemo<MonitoringActivityLogQuery>(() => ({
    date,
    fromTime,
    toTime,
    accountId: accountId === "ALL" ? undefined : accountId,
    role: role === "ALL" ? undefined : role,
    department: department === "ALL" ? undefined : department,
    eventType,
    search: search.trim() || undefined,
    page,
    limit: DEFAULT_LOG_LIMIT,
  }), [accountId, date, department, eventType, fromTime, page, role, search, toTime]);

  useEffect(() => {
    if (!accessToken || !monitoring || view === "OVERVIEW") {
      return;
    }

    let active = true;

    function loadActivityLogs(): void {
      setLogsLoading(true);
      getSuperAdminActivityLogs(accessToken, activityQuery)
        .then((response) => {
          if (!active) {
            return;
          }

          setActivityLogs(response);
          setLogsError("");
        })
        .catch((requestError: unknown) => {
          if (!active) {
            return;
          }

          setActivityLogs(null);
          setLogsError(
            requestError instanceof Error
              ? requestError.message
              : "Activity logs could not be loaded.",
          );
        })
        .finally(() => {
          if (active) {
            setLogsLoading(false);
          }
        });
    }

    loadActivityLogs();

    // Detailed log polling is slower than overview polling to reduce database load.
    const intervalId = window.setInterval(loadActivityLogs, 30_000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [accessToken, activityQuery, monitoring, view]);

  const sortedEmployees = useMemo(() => {
    const rows = monitoring?.employees ?? [];

    return [...rows].sort(compareMonitoringRows);
  }, [monitoring]);

  const roles = useMemo(
    () => Array.from(new Set(sortedEmployees.map((employee) => employee.role))).sort(),
    [sortedEmployees],
  );

  const departments = useMemo(
    () => Array.from(
      new Set(
        sortedEmployees
          .map((employee) => employee.department ?? employee.division ?? "No unit")
          .filter(Boolean),
      ),
    ).sort(),
    [sortedEmployees],
  );

  const selectedEmployee = useMemo(
    () => sortedEmployees.find((employee) => employee.accountId === accountId) ?? null,
    [accountId, sortedEmployees],
  );

  if (loading) {
    return (
      <section className="monitoring-panel monitoring-state">
        <div className="spinner" />
        <p>Loading live employee activity...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="monitoring-panel monitoring-state" role="alert">
        <strong>Monitoring unavailable</strong>
        <p>{error}</p>
        <button type="button" onClick={() => setRefreshKey((current) => current + 1)}>
          Try again
        </button>
      </section>
    );
  }

  if (!monitoring) {
    return null;
  }

  function resetLogPage(): void {
    setPage(1);
  }

  return (
    <section className="monitoring-panel" aria-label="Privacy-safe employee monitoring">
      <header className="monitoring-header">
        <div>
          <span>Privacy-safe monitoring</span>
          <h2>Employee activity monitoring</h2>
          <p>{monitoring.privacyNotice}</p>
        </div>

        <div className="monitoring-retention-card">
          <strong>Retention policy</strong>
          <span>{monitoring.retention.detailedActivityDays} days detailed logs</span>
          <small>{monitoring.retention.dailySummaryDays} days daily summaries</small>
        </div>
      </header>

      <section className="monitoring-summary-grid" aria-label="Monitoring summary">
        <MonitoringMetric label="Active" value={monitoring.totals.active} />
        <MonitoringMetric label="Idle" value={monitoring.totals.idle} />
        <MonitoringMetric label="Offline" value={monitoring.totals.offline} />
        <MonitoringMetric label="Actions" value={monitoring.totals.actions} />
        <MonitoringMetric label="Emergency alerts" value={monitoring.totals.emergencyAlerts} />
      </section>

      <nav className="monitoring-view-tabs" aria-label="Monitoring views">
        {([
          ["OVERVIEW", "Overview"],
          ["LOGS", "Activity logs"],
          ["EMPLOYEE", "Employee detail"],
        ] as Array<[MonitoringView, string]>).map(([nextView, label]) => (
          <button
            key={nextView}
            type="button"
            className={view === nextView ? "active" : undefined}
            onClick={() => {
              setView(nextView);
              setPage(1);

              // Employee detail focuses one selected worker instead of showing the global log view again.
              if (nextView === "EMPLOYEE" && accountId === "ALL" && sortedEmployees.length > 0) {
                setAccountId(sortedEmployees[0].accountId);
              }
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {view === "OVERVIEW" ? (
        <OverviewTable monitoring={monitoring} employees={sortedEmployees} />
      ) : (
        <>
          <section className="monitoring-filter-card" aria-label="Activity log filters">
            <label>
              Date
              <input
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  resetLogPage();
                }}
              />
            </label>
            <label>
              From
              <input
                type="time"
                value={fromTime}
                onChange={(event) => {
                  setFromTime(event.target.value);
                  resetLogPage();
                }}
              />
            </label>
            <label>
              To
              <input
                type="time"
                value={toTime}
                onChange={(event) => {
                  setToTime(event.target.value);
                  resetLogPage();
                }}
              />
            </label>
            <label>
              Employee
              <select
                value={accountId}
                onChange={(event) => {
                  setAccountId(event.target.value);
                  resetLogPage();
                }}
              >
                <option value="ALL" disabled={view === "EMPLOYEE"}>
                  {view === "EMPLOYEE" ? "Choose employee" : "All employees"}
                </option>
                {sortedEmployees.map((employee) => (
                  <option key={employee.accountId} value={employee.accountId}>
                    {employee.employeeName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Role
              <select
                value={role}
                onChange={(event) => {
                  setRole(event.target.value);
                  resetLogPage();
                }}
              >
                <option value="ALL">All roles</option>
                {roles.map((roleOption) => (
                  <option key={roleOption} value={roleOption}>
                    {formatLabel(roleOption)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Department
              <select
                value={department}
                onChange={(event) => {
                  setDepartment(event.target.value);
                  resetLogPage();
                }}
              >
                <option value="ALL">All departments</option>
                {departments.map((departmentOption) => (
                  <option key={departmentOption} value={departmentOption}>
                    {departmentOption}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Action
              <select
                value={eventType}
                onChange={(event) => {
                  setEventType(event.target.value as ActivityEventType | "ALL");
                  resetLogPage();
                }}
              >
                {ACTIVITY_EVENT_OPTIONS.map((eventOption) => (
                  <option key={eventOption} value={eventOption}>
                    {eventOption === "ALL" ? "All actions" : formatLabel(eventOption)}
                  </option>
                ))}
              </select>
            </label>
            <label className="monitoring-search-filter">
              Search safe metadata
              <input
                type="search"
                value={search}
                placeholder="Employee, safe page, action..."
                onChange={(event) => {
                  setSearch(event.target.value);
                  resetLogPage();
                }}
              />
            </label>
          </section>

          {view === "EMPLOYEE" && (
            <EmployeeDetailCard employee={selectedEmployee} logs={activityLogs?.records ?? []} />
          )}

          <ActivityLogTable
            logs={activityLogs}
            loading={logsLoading}
            error={logsError}
            page={page}
            onPageChange={setPage}
            title={view === "EMPLOYEE" ? "Selected employee activity log" : "System activity log"}
            description={
              view === "EMPLOYEE"
                ? "Full office-hours audit trail for the selected employee. Private message content and recipients stay hidden."
                : "Office-hours view defaults to 09:00–18:00 Nepal time. Private message content and recipients stay hidden."
            }
          />
        </>
      )}
    </section>
  );
}

function MonitoringMetric({ label, value }: { label: string; value: number }) {
  return (
    <article className="monitoring-summary-card">
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
    </article>
  );
}

function OverviewTable({
  monitoring,
  employees,
}: {
  monitoring: SuperAdminMonitoringResponse;
  employees: MonitoringEmployeeRow[];
}) {
  return (
    <div className="monitoring-table-card">
      <header>
        <div>
          <h3>Real-time employee activity</h3>
          <p>Updated automatically every 15 seconds.</p>
        </div>

        <small>Generated {formatDateTime(monitoring.generatedAt)}</small>
      </header>

      <div className="monitoring-table-scroll">
        <table className="monitoring-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Status</th>
              <th>Last active</th>
              <th>Active / idle</th>
              <th>Pages</th>
              <th>Actions</th>
              <th>Emergency</th>
              <th>Login / logout</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <MonitoringRow key={employee.accountId} employee={employee} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MonitoringRow({ employee }: { employee: MonitoringEmployeeRow }) {
  return (
    <tr>
      <td>
        <strong>{employee.employeeName}</strong>
        <span>{employee.role.replaceAll("_", " ")}</span>
        <small>{employee.department ?? employee.division ?? "No unit"}</small>
      </td>
      <td>
        <span className={`monitoring-status ${employee.status.toLowerCase()}`}>
          {getStatusLabel(employee.status)}
        </span>
      </td>
      <td>
        <strong>{formatDateTime(employee.lastActiveAt)}</strong>
        <small>{employee.currentPage ?? "No page recorded"}</small>
      </td>
      <td>
        <strong>{formatNumber(employee.totalActiveMinutesToday)}m active</strong>
        <small>{formatNumber(employee.idleMinutesToday)}m idle</small>
      </td>
      <td>{formatNumber(employee.pagesVisited)}</td>
      <td>
        <strong>{formatNumber(employee.actionsCount)}</strong>
        <small>{employee.lastEventLabel ?? employee.lastEventType ?? "No action"}</small>
      </td>
      <td>{formatNumber(employee.emergencyAlertsSent)}</td>
      <td>
        <strong>{formatDateTime(employee.firstLoginAt)}</strong>
        <small>{formatDateTime(employee.lastLogoutAt)}</small>
      </td>
    </tr>
  );
}

function ActivityLogTable({
  logs,
  loading,
  error,
  page,
  onPageChange,
  title,
  description,
}: {
  logs: MonitoringActivityLogsResponse | null;
  loading: boolean;
  error: string;
  page: number;
  onPageChange: (page: number) => void;
  title: string;
  description: string;
}) {
  return (
    <div className="monitoring-table-card monitoring-log-card">
      <header>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <small>{logs ? `Showing ${logs.records.length} of ${logs.pagination.total}` : "Loading"}</small>
      </header>

      {error ? (
        <div className="monitoring-inline-state" role="alert">{error}</div>
      ) : loading && !logs ? (
        <div className="monitoring-inline-state">Loading activity logs...</div>
      ) : (
        <>
          <div className="monitoring-table-scroll">
            <table className="monitoring-table monitoring-log-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Employee</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Page</th>
                  <th>Action</th>
                  <th>Details</th>
                  <th>Status</th>
                  <th>Session</th>
                </tr>
              </thead>
              <tbody>
                {(logs?.records ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={9}>No activity records found for this filter.</td>
                  </tr>
                ) : (
                  logs?.records.map((record) => (
                    <ActivityLogRow key={record.id} record={record} />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {logs && (
            <div className="monitoring-pagination">
              <button
                type="button"
                onClick={() => onPageChange(Math.max(page - 1, 1))}
                disabled={page <= 1 || loading}
              >
                Previous
              </button>
              <span>
                Page {logs.pagination.page} of {logs.pagination.totalPages}
              </span>
              <button
                type="button"
                onClick={() => onPageChange(Math.min(page + 1, logs.pagination.totalPages))}
                disabled={page >= logs.pagination.totalPages || loading}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ActivityLogRow({ record }: { record: MonitoringActivityLogRow }) {
  return (
    <tr>
      <td>
        <strong>{formatTime(record.occurredAt)}</strong>
        <small>{record.isOfficeHours ? "Office hours" : "After hours"}</small>
      </td>
      <td>
        <strong>{record.employeeName}</strong>
        <small>{record.designation ?? "No designation"}</small>
      </td>
      <td>{formatLabel(record.role)}</td>
      <td>{record.department ?? "No unit"}</td>
      <td>{record.pageName ?? "Application"}</td>
      <td>
        <span className={`monitoring-action-badge ${record.eventType.toLowerCase()}`}>
          {record.actionLabel}
        </span>
      </td>
      <td>{record.details}</td>
      <td>
        <span className="monitoring-status active">{formatLabel(record.status)}</span>
      </td>
      <td>{record.sessionLabel}</td>
    </tr>
  );
}

function EmployeeDetailCard({
  employee,
  logs,
}: {
  employee: MonitoringEmployeeRow | null;
  logs: MonitoringActivityLogRow[];
}) {
  if (!employee) {
    return (
      <section className="monitoring-employee-detail empty">
        Select one employee to view their full office-hours timeline.
      </section>
    );
  }

  const timelineLogs = logs.slice(0, 8);

  return (
    <section className="monitoring-employee-detail" aria-label="Selected employee activity detail">
      <div className="monitoring-employee-profile">
        <span>Employee detail</span>
        <h3>{employee.employeeName}</h3>
        <p>{employee.department ?? employee.division ?? "No unit"} · {formatLabel(employee.role)}</p>
      </div>

      <dl>
        <div>
          <dt>Active</dt>
          <dd>{formatNumber(employee.totalActiveMinutesToday)}m</dd>
        </div>
        <div>
          <dt>Idle</dt>
          <dd>{formatNumber(employee.idleMinutesToday)}m</dd>
        </div>
        <div>
          <dt>Actions</dt>
          <dd>{formatNumber(employee.actionsCount)}</dd>
        </div>
        <div>
          <dt>Logs shown</dt>
          <dd>{formatNumber(logs.length)}</dd>
        </div>
      </dl>

      <div className="monitoring-employee-timeline">
        <strong>Office-hours timeline</strong>
        {timelineLogs.length === 0 ? (
          <p>No activity records found for this employee and time range.</p>
        ) : (
          <ol>
            {timelineLogs.map((record) => (
              <li key={record.id}>
                <time>{formatTime(record.occurredAt)}</time>
                <span className={`monitoring-action-badge ${record.eventType.toLowerCase()}`}>
                  {record.actionLabel}
                </span>
                <p>{record.details}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function compareMonitoringRows(
  first: MonitoringEmployeeRow,
  second: MonitoringEmployeeRow,
): number {
  const statusWeight: Record<MonitoringStatus, number> = {
    ACTIVE: 0,
    IDLE: 1,
    OFFLINE: 2,
  };

  const statusDifference =
    statusWeight[first.status] - statusWeight[second.status];

  if (statusDifference !== 0) {
    return statusDifference;
  }

  return first.employeeName.localeCompare(second.employeeName);
}
