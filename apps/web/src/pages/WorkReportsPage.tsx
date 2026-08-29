import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link } from "react-router";

import { useAuth } from "../context/AuthContext";
import {
  downloadWorkReportCsv,
  getWorkReportDrilldown,
  getWorkReportSummary,
} from "../services/work-management.service";
import type { WorkReportQuery } from "../services/work-management.service";
import type {
  WorkItemType,
  WorkReportDrilldownDutyRow,
  WorkReportPerformanceCounts,
  WorkReportPerformanceRow,
  WorkReportPerformanceWorkTypes,
  WorkReportDrilldownResponse,
  WorkReportDrilldownWorkRow,
  WorkReportRecordStage,
  WorkReportSummary,
  WorkReportWorkflowStageFilter,
} from "../types/work-management";

type ReportView = "OVERVIEW" | "PERFORMANCE_REPORT" | "WORK_RECORDS" | "DUTY_REPORT";
type PeriodChoice = "TODAY" | "WEEK" | "MONTH" | "CUSTOM";

const WORK_TYPES: WorkItemType[] = [
  "ROUTINE_TASK",
  "TROUBLE_TICKET",
  "MAINTENANCE",
  "NEW_CONNECTION",
  "UPDATE_SERVICES",
  "INSPECTION",
  "EMERGENCY_WORK",
  "ADMINISTRATIVE_TASK",
];

type PerformanceWorkTypeKey = keyof WorkReportPerformanceWorkTypes;

const PERFORMANCE_WORK_GROUPS: Array<{ type: WorkItemType; key: PerformanceWorkTypeKey; label: string }> = [
  { type: "ROUTINE_TASK", key: "routineWork", label: "Routine Work" },
  { type: "TROUBLE_TICKET", key: "troubleTicket", label: "Trouble Ticket" },
  { type: "MAINTENANCE", key: "networkMaintenance", label: "Network Maintenance" },
  { type: "NEW_CONNECTION", key: "newInstallation", label: "New Installation" },
  { type: "UPDATE_SERVICES", key: "updateServices", label: "Update Services" },
  { type: "INSPECTION", key: "inspection", label: "Inspection" },
  { type: "EMERGENCY_WORK", key: "emergencyWork", label: "Emergency Work" },
];
const PERFORMANCE_WORK_TYPES = PERFORMANCE_WORK_GROUPS.map((group) => group.type);

function performanceCountsCells(counts: WorkReportPerformanceCounts) {
  return [counts.tickets, counts.completed, counts.pending];
}

function toDateInput(value: Date): string {
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function startOfWeek(value: Date): Date {
  const result = new Date(value);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function periodDates(choice: PeriodChoice): { from: string; to: string } {
  const today = new Date();
  const to = toDateInput(today);
  if (choice === "WEEK") return { from: toDateInput(startOfWeek(today)), to };
  if (choice === "MONTH") return { from: toDateInput(startOfMonth(today)), to };
  return { from: to, to };
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatShortDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}


function typeLabel(type: WorkItemType): string {
  const labels: Record<WorkItemType, string> = {
    ROUTINE_TASK: "Routine task",
    TROUBLE_TICKET: "Trouble ticket",
    MAINTENANCE: "Network maintenance",
    NEW_CONNECTION: "New installation",
    UPDATE_SERVICES: "Update services",
    INSPECTION: "Inspection",
    EMERGENCY_WORK: "Emergency work",
    ADMINISTRATIVE_TASK: "Administrative work",
  };
  return labels[type];
}

function statusLabel(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function recordStageLabel(stage: WorkReportRecordStage): string {
  const labels: Record<WorkReportRecordStage, string> = {
    NEW: "New",
    IN_PROGRESS: "In progress",
    WAITING_FOR_SALES: "Waiting for Sales",
    WAITING_FOR_APPROVAL: "Waiting approval",
    RETURNED_FOR_CORRECTION: "Returned for correction",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
  };
  return labels[stage];
}

function salesStatusLabel(row: WorkReportDrilldownWorkRow): string {
  if (!row.salesMember) return "Not required";
  if (row.salesCoordinationStatus === "COMPLETED") return "Sales done";
  if (row.salesCoordinationStatus === "READY_FOR_SALES") return "Waiting for Sales";
  return "Preparing documents";
}

function referenceLabel(row: WorkReportDrilldownWorkRow): string {
  if (!row.reference) return "No reference";
  return `${row.reference.type === "TOKEN_NUMBER" ? "Token" : "Service"}: ${row.reference.value}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The report could not be loaded.";
}

function scopeTitle(role: string | undefined): string {
  if (role === "SUPER_ADMIN") return "Branch Reports";
  if (role === "SENIOR_MANAGEMENT") return "Division Reports";
  return "Department Reports";
}

function formatPercent(value: number | null): string {
  return value == null ? "—" : `${Math.round(value)}%`;
}

function workflowStageFilterLabel(stage: WorkReportWorkflowStageFilter): string {
  if (stage === "OVERDUE") return "Overdue";
  if (stage === "WAITING_FOR_SALES") return "Waiting for Sales";
  if (stage === "WAITING_FOR_APPROVAL") return "Waiting for Approval";
  return "Returned for Correction";
}

function reportDivisionOptions(summary: WorkReportSummary | null) {
  if (!summary) return [];
  const divisions = new Map<string, { id: string; code: string; name: string }>();
  summary.departmentOptions.forEach((department) => {
    divisions.set(department.division.id, department.division);
  });
  return [...divisions.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function ReportSkeleton({
  variant,
  label,
}: {
  variant: "overview" | "records" | "duty";
  label: string;
}) {
  return (
    <section className={`report-v2-skeleton report-v2-skeleton--${variant}`} role="status" aria-live="polite" aria-label={label}>
      <span className="report-v2-visually-hidden">{label}</span>
      {variant === "overview" ? (
        <>
          <div className="report-v2-skeleton__kpis" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => <i key={index} />)}
          </div>
          <div className="report-v2-skeleton__panels" aria-hidden="true">
            <i />
            <i />
          </div>
          <i className="report-v2-skeleton__wide" aria-hidden="true" />
        </>
      ) : variant === "records" ? (
        <div className="report-v2-skeleton__records" aria-hidden="true">
          <i className="is-heading" />
          {Array.from({ length: 5 }, (_, index) => <i key={index} />)}
        </div>
      ) : (
        <>
          <div className="report-v2-skeleton__duty-kpis" aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => <i key={index} />)}
          </div>
          <div className="report-v2-skeleton__records" aria-hidden="true">
            <i className="is-heading" />
            {Array.from({ length: 4 }, (_, index) => <i key={index} />)}
          </div>
        </>
      )}
    </section>
  );
}

function OverviewReport({
  summary,
  loading,
  onOpenAttention,
  onOpenTeam,
}: {
  summary: WorkReportSummary | null;
  loading: boolean;
  onOpenAttention: (stage: WorkReportWorkflowStageFilter) => void;
  onOpenTeam: (teamId: string) => void;
}) {
  if (!summary && loading) {
    return <ReportSkeleton variant="overview" label="Preparing the report overview" />;
  }

  if (!summary) {
    return (
      <section className="report-v2-state">
        <strong>No report data is available.</strong>
        <p>Change the report filters or refresh the page.</p>
      </section>
    );
  }

  const workflow = [
    { key: "new", label: "New", value: summary.workflow.newWork, tone: "neutral" },
    { key: "progress", label: "In progress", value: summary.workflow.inProgress, tone: "blue" },
    { key: "sales", label: "Waiting for Sales", value: summary.workflow.waitingForSales, tone: "amber" },
    { key: "approval", label: "Waiting approval", value: summary.workflow.waitingForApproval, tone: "amber" },
    { key: "returned", label: "Returned for correction", value: summary.workflow.returnedForCorrection, tone: "purple" },
  ];
  const workflowMax = Math.max(1, ...workflow.map((item) => item.value));

  const trendCreatedTotal = summary.trend.reduce((total, day) => total + day.workCreated, 0);
  const trendCompletedTotal = summary.trend.reduce((total, day) => total + day.workClosed, 0);
  const singleTrendDay = summary.trend.length === 1 ? summary.trend[0] : null;
  const singleTrendMax = singleTrendDay
    ? Math.max(1, singleTrendDay.workCreated, singleTrendDay.workClosed)
    : 1;
  const useWeeklyTrend = summary.trend.length > 14;
  const trendBuckets = useWeeklyTrend
    ? Array.from({ length: Math.ceil(summary.trend.length / 7) }, (_, bucketIndex) => {
        const days = summary.trend.slice(bucketIndex * 7, bucketIndex * 7 + 7);
        const firstDay = days[0];
        const lastDay = days[days.length - 1];
        return {
          key: `${firstDay?.date ?? bucketIndex}-${lastDay?.date ?? bucketIndex}`,
          label: `${formatShortDate(firstDay?.date ?? null)} – ${formatShortDate(lastDay?.date ?? null)}`,
          created: days.reduce((total, day) => total + day.workCreated, 0),
          completed: days.reduce((total, day) => total + day.workClosed, 0),
        };
      })
    : summary.trend.map((day) => ({
        key: day.date,
        label: formatShortDate(day.date),
        created: day.workCreated,
        completed: day.workClosed,
      }));
  const trendBucketMax = Math.max(
    1,
    ...trendBuckets.flatMap((bucket) => [bucket.created, bucket.completed]),
  );
  const trendDifference = Math.abs(trendCreatedTotal - trendCompletedTotal);
  const trendInsight = trendCreatedTotal === trendCompletedTotal
    ? "Created and completed work are equal for this period."
    : trendCreatedTotal > trendCompletedTotal
      ? `Created work is higher by ${trendDifference} for this period.`
      : `Completed work is higher by ${trendDifference} for this period.`;

  const orderedTeams = [...summary.teams].sort((left, right) => {
    if (right.overdueWork !== left.overdueWork) return right.overdueWork - left.overdueWork;
    if (right.waitingForApproval !== left.waitingForApproval) {
      return right.waitingForApproval - left.waitingForApproval;
    }
    if (right.waitingForSales !== left.waitingForSales) {
      return right.waitingForSales - left.waitingForSales;
    }
    return right.activeWork - left.activeWork;
  });

  const attention: Array<{
    label: string;
    value: number;
    tone: string;
    note: string;
    stage: WorkReportWorkflowStageFilter;
  }> = [
    { label: "Overdue", value: summary.workflow.overdue, tone: "red", note: "Past the due time", stage: "OVERDUE" },
    { label: "Waiting for Sales", value: summary.workflow.waitingForSales, tone: "amber", note: "Primary team is waiting on Sales", stage: "WAITING_FOR_SALES" },
    { label: "Waiting for Approval", value: summary.workflow.waitingForApproval, tone: "amber", note: "Manager review is required", stage: "WAITING_FOR_APPROVAL" },
    { label: "Returned for Correction", value: summary.workflow.returnedForCorrection, tone: "purple", note: "Worker action is required", stage: "RETURNED_FOR_CORRECTION" },
  ];

  return (
    <div className="report-v2-overview">
      {loading && (
        <div className="report-v2-refreshing" role="status">
          Updating report…
        </div>
      )}

      <section className="report-v2-kpis" aria-label="Key work indicators">
        {[
          {
            label: "Active Work",
            value: summary.work.totals.activeAtEnd,
            note: "Open at the end of this period",
            tone: "blue",
          },
          {
            label: "Completed",
            value: summary.workflow.completedDuring,
            note: "Manager-approved work",
            tone: "green",
          },
          {
            label: "Need Review",
            value: summary.workflow.waitingForApproval,
            note: "Completion waiting for manager approval",
            tone: "amber",
          },
          {
            label: "Overdue",
            value: summary.workflow.overdue,
            note: "Active work past its due time",
            tone: "red",
          },
          {
            label: "Completion Rate",
            value: formatPercent(summary.work.totals.completionRate),
            note: "Manager-approved completion of work created in period",
            tone: "teal",
          },
        ].map((item) => (
          <article key={item.label} className={`report-v2-kpi is-${item.tone}`}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </article>
        ))}
      </section>

      <div className="report-v2-main-grid">
        <section className="report-v2-panel report-v2-panel--workflow">
          <header className="report-v2-panel__header">
            <div>
              <span>Current workflow</span>
              <h2>Where the work stands</h2>
            </div>
            <small>{summary.period.days} day{summary.period.days === 1 ? "" : "s"}</small>
          </header>
          <div className="report-v2-workflow-list">
            {workflow.map((item) => (
              <div key={item.key} className={`report-v2-workflow-row is-${item.tone}`}>
                <div>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
                <div className="report-v2-workflow-track" aria-hidden="true">
                  <i style={{ width: `${item.value === 0 ? 0 : Math.max(4, (item.value / workflowMax) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="report-v2-panel report-v2-panel--attention">
          <header className="report-v2-panel__header">
            <div>
              <span>Needs attention</span>
              <h2>Items management should watch</h2>
            </div>
          </header>
          <div className="report-v2-attention-list">
            {attention.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`is-${item.tone}`}
                onClick={() => onOpenAttention(item.stage)}
                aria-label={`Open Work Records filtered by ${item.label}`}
              >
                <strong>{item.value}</strong>
                <div>
                  <span>{item.label}</span>
                  <small>{item.note}</small>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="report-v2-panel report-v2-panel--teams">
        <header className="report-v2-panel__header">
          <div>
            <span>Organization performance</span>
            <h2>Team work at a glance</h2>
            <p>Team ownership is shown first; individual participation stays in work details.</p>
          </div>
          <small>{orderedTeams.length} team{orderedTeams.length === 1 ? "" : "s"}</small>
        </header>
        {orderedTeams.length === 0 ? (
          <div className="report-v2-empty">
            No team-owned work matches the selected period and filters.
          </div>
        ) : (
          <div className="report-v2-team-table-wrap" tabIndex={0} aria-label="Team work performance table">
            <table className="report-v2-team-table">
              <caption className="report-v2-visually-hidden">Team work performance</caption>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Active</th>
                  <th>In progress</th>
                  <th>Waiting Sales</th>
                  <th>Need Review</th>
                  <th>Overdue</th>
                  <th>Completed</th>
                </tr>
              </thead>
              <tbody>
                {orderedTeams.map((team) => (
                  <tr key={team.teamId}>
                    <td>
                      <button
                        type="button"
                        className="report-v2-team-open"
                        onClick={() => onOpenTeam(team.teamId)}
                        aria-label={`Open Work Records for ${team.name}`}
                      >
                        <strong>{team.name}</strong>
                        <small>{team.departmentName} · {team.divisionName}</small>
                      </button>
                    </td>
                    <td>{team.activeWork}</td>
                    <td>{team.inProgress}</td>
                    <td>{team.waitingForSales}</td>
                    <td>{team.waitingForApproval}</td>
                    <td className={team.overdueWork > 0 ? "is-alert" : undefined}>{team.overdueWork}</td>
                    <td className="is-success">{team.completedDuring}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="report-v2-panel report-v2-panel--trend">
        <header className="report-v2-panel__header">
          <div>
            <span>Work trend</span>
            <h2>Created versus completed</h2>
            <p>Compare incoming work with completed work. Every bar shows the exact count.</p>
          </div>
          <div className="report-v2-chart-legend" aria-label="Chart legend">
            <span className="is-created">Created</span>
            <span className="is-completed">Completed</span>
          </div>
        </header>

        {summary.trend.length === 0 ? (
          <div className="report-v2-empty">No work was created or completed in this period.</div>
        ) : summary.trend.length === 1 && singleTrendDay ? (
          <div
            className="report-v2-trend-comparison"
            role="img"
            aria-label={`${formatDate(singleTrendDay.date)}: ${singleTrendDay.workCreated} created and ${singleTrendDay.workClosed} completed`}
          >
            <div className="report-v2-trend-comparison__date">
              <strong>{formatDate(singleTrendDay.date)}</strong>
              <span>Today&apos;s comparison</span>
            </div>
            {[
              { label: "Created", value: singleTrendDay.workCreated, tone: "created" },
              { label: "Completed", value: singleTrendDay.workClosed, tone: "completed" },
            ].map((item) => (
              <div key={item.label} className={`report-v2-trend-comparison__row is-${item.tone}`}>
                <div>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
                <div className="report-v2-trend-comparison__track" aria-hidden="true">
                  <i
                    style={{
                      width: `${item.value === 0 ? 0 : (item.value / singleTrendMax) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            <p>{trendInsight}</p>
          </div>
        ) : (
          <>
            <div className="report-v2-trend-totals" aria-label="Work trend period totals">
              <span><small>Created</small><strong>{trendCreatedTotal}</strong></span>
              <span><small>Completed</small><strong>{trendCompletedTotal}</strong></span>
            </div>
            <div className="report-v2-bar-chart__heading">
              <strong>{useWeeklyTrend ? "Weekly comparison" : "Daily comparison"}</strong>
              <span>
                {useWeeklyTrend
                  ? "Longer periods are grouped into 7-day totals to keep the chart easy to read."
                  : "Each pair of bars compares created and completed work for that day."}
              </span>
            </div>
            <div
              className="report-v2-chart-scroll"
              tabIndex={0}
              aria-label={`${useWeeklyTrend ? "Weekly" : "Daily"} created and completed work comparison`}
            >
              <div
                className="report-v2-bar-chart"
                style={{ minWidth: `${Math.max(520, trendBuckets.length * 82)}px` }}
              >
                {trendBuckets.map((bucket) => (
                  <div
                    key={bucket.key}
                    className="report-v2-bar-chart__group"
                    role="group"
                    aria-label={`${bucket.label}: ${bucket.created} created and ${bucket.completed} completed`}
                  >
                    <div className="report-v2-bar-chart__bars">
                      {[
                        { label: "Created", value: bucket.created, tone: "created" },
                        { label: "Completed", value: bucket.completed, tone: "completed" },
                      ].map((item) => (
                        <div key={item.label} className={`report-v2-bar-chart__bar is-${item.tone}`}>
                          <strong>{item.value}</strong>
                          <span className="report-v2-bar-chart__track" aria-hidden="true">
                            <i style={{ height: `${(item.value / trendBucketMax) * 100}%` }} />
                          </span>
                        </div>
                      ))}
                    </div>
                    <span className="report-v2-bar-chart__label">{bucket.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="report-v2-trend-insight">{trendInsight}</p>
            <table className="report-v2-visually-hidden">
              <caption>Exact daily work trend values</caption>
              <thead><tr><th>Date</th><th>Created</th><th>Completed</th></tr></thead>
              <tbody>
                {summary.trend.map((day) => (
                  <tr key={day.date}>
                    <td>{formatDate(day.date)}</td>
                    <td>{day.workCreated}</td>
                    <td>{day.workClosed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

    </div>
  );
}

function WorkRecordsView({
  report,
  loading,
  onPageChange,
}: {
  report: WorkReportDrilldownResponse | null;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  const section = report?.sections.work ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!section || !selectedId) return;
    if (!section.rows.some((row) => row.id === selectedId)) setSelectedId(null);
  }, [section, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  if (!report && loading) return <ReportSkeleton variant="records" label="Preparing work records" />;
  if (!section) return <section className="report-v2-state"><strong>Work records are unavailable.</strong></section>;

  const { pagination, rows } = section;
  const selectedRow = selectedId ? rows.find((row) => row.id === selectedId) ?? null : null;

  return (
    <>
      <section className="report-v2-records-panel" aria-label="Work records">
        <header className="report-v2-records-panel__header is-simple">
          <h2>Work Records</h2>
          <strong>{pagination.total} record{pagination.total === 1 ? "" : "s"}</strong>
        </header>
        {loading && report && <div className="report-v2-refreshing" role="status">Updating records…</div>}
        {rows.length === 0 ? (
          <div className="report-v2-empty report-v2-records-empty">No work records match the selected filters.</div>
        ) : (
          <>
            <div className="report-v2-records-head is-compact" aria-hidden="true">
              <span>Ticket</span><span>Work Type</span><span>Team / Owner</span><span>Service / Token Number</span><span>Stage</span><span>Date</span><span>Details</span>
            </div>
            <div className="report-v2-records-list">
              {rows.map((row) => {
                const owner = row.assignedTeam?.name ?? row.primaryAssignee;
                const workflowClass = row.workflowStage.toLowerCase().replaceAll("_", "-");
                return (
                  <article key={row.id} className={`report-v2-record is-${workflowClass}`}>
                    <div className="report-v2-record__row">
                      <div className="report-v2-record__ticket"><strong>{row.ticketNumber}</strong></div>
                      <div className="report-v2-record__work"><strong>{typeLabel(row.type)}</strong></div>
                      <div className="report-v2-record__owner"><strong>{owner || "Not assigned"}</strong></div>
                      <div className="report-v2-record__reference"><strong>{referenceLabel(row)}</strong></div>
                      <div className="report-v2-record__stage"><span className={`report-v2-stage is-${workflowClass}`}>{recordStageLabel(row.workflowStage)}</span></div>
                      <div className="report-v2-record__date"><strong>{formatDate(row.createdAt)}</strong></div>
                      <button type="button" className="report-v2-record__view-button" onClick={() => setSelectedId(row.id)} aria-label={`View details for ${row.ticketNumber}`}>
                        View details <span aria-hidden="true">›</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            {pagination.totalPages > 1 && (
              <footer className="report-v2-pagination" aria-label="Work records pages">
                <button type="button" disabled={!pagination.hasPrevious || loading} onClick={() => onPageChange(pagination.page - 1)}>Previous</button>
                <span>Page {pagination.page} of {pagination.totalPages}</span>
                <button type="button" disabled={!pagination.hasNext || loading} onClick={() => onPageChange(pagination.page + 1)}>Next</button>
              </footer>
            )}
          </>
        )}
      </section>

      {selectedRow && (
        <div className="report-v2-record-drawer-layer">
          <button type="button" className="report-v2-record-drawer-backdrop" aria-label="Close work record details" onClick={() => setSelectedId(null)} />
          <aside className="report-v2-record-drawer" role="dialog" aria-modal="true" aria-labelledby="work-record-drawer-title">
            <header className="report-v2-record-drawer__header">
              <div><span>Work record</span><h2 id="work-record-drawer-title">{selectedRow.ticketNumber}</h2><p>{typeLabel(selectedRow.type)}</p></div>
              <button type="button" onClick={() => setSelectedId(null)} aria-label="Close details">×</button>
            </header>
            <div className="report-v2-record-drawer__body">
              <section className="report-v2-record-drawer__summary">
                <div><span>Stage</span><strong>{recordStageLabel(selectedRow.workflowStage)}</strong></div>
                <div><span>Date</span><strong>{formatDate(selectedRow.createdAt)}</strong></div>
                <div><span>Team / Owner</span><strong>{selectedRow.assignedTeam?.name ?? selectedRow.primaryAssignee}</strong></div>
                <div><span>Due date</span><strong>{formatDate(selectedRow.dueAt)}</strong></div>
              </section>
              <section className="report-v2-record-drawer__section">
                <h3>Work details</h3>
                <dl className="report-v2-record-drawer__facts">
                  <div><dt>Service / Token Number</dt><dd>{referenceLabel(selectedRow)}</dd></div>
                  {selectedRow.customerName && <div><dt>Customer</dt><dd>{selectedRow.customerName}</dd></div>}
                  {selectedRow.location && <div><dt>Location</dt><dd>{selectedRow.location}</dd></div>}
                  {selectedRow.cpcSerial && <div><dt>CPC Serial</dt><dd>{selectedRow.cpcSerial}</dd></div>}
                  {(selectedRow.olt || selectedRow.fdcName || selectedRow.fapName) && <div className="is-wide"><dt>Network</dt><dd>{[selectedRow.olt && `OLT ${selectedRow.olt}`, selectedRow.fdcName && `FDC ${selectedRow.fdcName}`, selectedRow.fapName && `FAP ${selectedRow.fapName}`].filter(Boolean).join(" · ")}</dd></div>}
                </dl>
              </section>
              <section className="report-v2-record-drawer__section">
                <h3>Responsibility</h3>
                <dl className="report-v2-record-drawer__facts">
                  <div><dt>Responsible Manager</dt><dd>{selectedRow.responsibleManager}</dd></div>
                  <div><dt>Started By</dt><dd>{selectedRow.startedBy ?? "Not started"}</dd></div>
                  <div><dt>Sales Staff</dt><dd>{selectedRow.salesMember ?? "Not required"}</dd></div>
                  <div><dt>Sales Status</dt><dd>{salesStatusLabel(selectedRow)}</dd></div>
                  {selectedRow.supportingStaff.length > 0 && <div className="is-wide"><dt>Supporting Staff</dt><dd>{selectedRow.supportingStaff.join(", ")}</dd></div>}
                </dl>
              </section>
              {selectedRow.closedAt && <section className="report-v2-record-drawer__section"><h3>Completion</h3><dl className="report-v2-record-drawer__facts"><div><dt>Manager Approved</dt><dd>{formatDateTime(selectedRow.closedAt)}</dd></div></dl></section>}
              {selectedRow.childProgress.total > 0 && <section className="report-v2-record-drawer__section"><h3>Delegation</h3><div className="report-v2-record__progress"><div><span>Progress</span><strong>{selectedRow.childProgress.completed} of {selectedRow.childProgress.total} completed</strong></div><div className="report-v2-record__progress-track" aria-hidden="true"><i style={{ width: `${selectedRow.childProgress.percentage ?? 0}%` }} /></div></div></section>}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function PerformanceReportView({
  report,
  loading,
  workType,
}: {
  report: WorkReportDrilldownResponse | null;
  loading: boolean;
  workType?: WorkItemType;
}) {
  if (!report && loading) {
    return <ReportSkeleton variant="records" label="Preparing the performance report" />;
  }

  const section = report?.sections.performance ?? null;
  if (!report || !section) {
    return (
      <section className="report-v2-state">
        <strong>Performance report is unavailable.</strong>
        <p>Refresh the report or change the selected period and organization filters.</p>
      </section>
    );
  }

  const rows = section.rows;
  const totals = section.totals;
  const visibleGroups = workType
    ? PERFORMANCE_WORK_GROUPS.filter((group) => group.type === workType)
    : PERFORMANCE_WORK_GROUPS;
  const showOverallTotal = visibleGroups.length > 1;

  return (
    <div className="report-v2-performance-view">
      <section className="report-v2-performance-panel" aria-label="Work performance report">
        <header className="report-v2-performance-panel__header">
          <span>Work Summary</span>
          <h2>Tickets by date, Team and work type</h2>
        </header>

        {loading && report && (
          <div className="report-v2-refreshing" role="status">Updating performance report…</div>
        )}

        {rows.length === 0 ? (
          <div className="report-v2-empty">
            No operational Team work matches the selected period and organization filters.
          </div>
        ) : (
          <>
            <div className="report-v2-performance-table-wrap" tabIndex={0} aria-label="Work performance report table">
              <table className={`report-v2-performance-table${showOverallTotal ? "" : " is-single-type"}`}>
                <caption className="report-v2-visually-hidden">
                  Operational work grouped by work date, Team and work type
                </caption>
                <thead>
                  <tr>
                    <th rowSpan={2}>S.N.</th>
                    <th rowSpan={2}>Date</th>
                    <th rowSpan={2}>Team</th>
                    <th rowSpan={2}>Support Staff</th>
                    <th rowSpan={2}>Other Staff</th>
                    <th rowSpan={2}>Service / Token Number</th>
                    {visibleGroups.map((group) => (
                      <th key={group.key} colSpan={3}>{group.label}</th>
                    ))}
                    {showOverallTotal && <th colSpan={3}>Total</th>}
                  </tr>
                  <tr>
                    {visibleGroups.map((group) => (
                      <Fragment key={group.key}>
                        <th>Tickets</th>
                        <th>Completed</th>
                        <th>Pending</th>
                      </Fragment>
                    ))}
                    {showOverallTotal && (
                      <>
                        <th>Tickets</th>
                        <th>Completed</th>
                        <th>Pending</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: WorkReportPerformanceRow, index) => (
                    <tr key={`${row.date}:${row.team.id}`}>
                      <td data-label="S.N.">{index + 1}</td>
                      <td data-label="Date" className="report-v2-performance-date">{formatDate(row.date)}</td>
                      <td data-label="Team" className="report-v2-performance-team">
                        <strong>{row.team.name}</strong>
                        <small>{row.team.departmentName} · {row.team.divisionName}</small>
                      </td>
                      <td data-label="Support Staff">{row.supportStaffCount}</td>
                      <td data-label="Other Staff">{row.otherStaffCount}</td>
                      <td data-label="Service / Token Number" className="report-v2-performance-references">
                        {row.references.length > 0
                          ? row.references.map((reference) => <span key={reference}>{reference}</span>)
                          : "—"}
                      </td>
                      {visibleGroups.map((group) => (
                        <Fragment key={group.key}>
                          <td data-label={`${group.label} tickets`}>{row.workTypes[group.key].tickets}</td>
                          <td data-label={`${group.label} completed`}>{row.workTypes[group.key].completed}</td>
                          <td data-label={`${group.label} pending`}>{row.workTypes[group.key].pending}</td>
                        </Fragment>
                      ))}
                      {showOverallTotal && (
                        <>
                          <td data-label="Total tickets" className="report-v2-performance-total">{row.total.tickets}</td>
                          <td data-label="Total completed" className="report-v2-performance-total is-completed">{row.total.completed}</td>
                          <td data-label="Total pending" className="report-v2-performance-total is-pending">{row.total.pending}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={3}>Total</th>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    {visibleGroups.map((group) => (
                      <Fragment key={group.key}>
                        {performanceCountsCells(totals.workTypes[group.key]).map((value, valueIndex) => (
                          <td key={valueIndex}>{value}</td>
                        ))}
                      </Fragment>
                    ))}
                    {showOverallTotal && (
                      <>
                        <td>{totals.total.tickets}</td>
                        <td>{totals.total.completed}</td>
                        <td>{totals.total.pending}</td>
                      </>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="report-v2-performance-cards" aria-label="Performance report mobile view">
              {rows.map((row: WorkReportPerformanceRow, index) => (
                <article key={`${row.date}:${row.team.id}`} className="report-v2-performance-card">
                  <header>
                    <span>#{index + 1}</span>
                    <div>
                      <strong>{row.team.name}</strong>
                      <small>{formatDate(row.date)} · {row.team.departmentName}</small>
                    </div>
                  </header>
                  <dl>
                    <div><dt>Support Staff</dt><dd>{row.supportStaffCount}</dd></div>
                    <div><dt>Other Staff</dt><dd>{row.otherStaffCount}</dd></div>
                    <div className="is-group">
                      <dt>Service / Token Number</dt>
                      <dd>{row.references.length > 0 ? row.references.join(" · ") : "—"}</dd>
                    </div>
                    {visibleGroups.filter((group) => row.workTypes[group.key].tickets > 0).map((group) => {
                      const counts = row.workTypes[group.key];
                      return (
                        <div key={group.key} className="is-group">
                          <dt>{group.label}</dt>
                          <dd>Tickets {counts.tickets} · Completed {counts.completed} · Pending {counts.pending}</dd>
                        </div>
                      );
                    })}
                    {showOverallTotal && (
                      <div className="is-group report-v2-performance-card__total">
                        <dt>Total</dt>
                        <dd>Tickets {row.total.tickets} · Completed {row.total.completed} · Pending {row.total.pending}</dd>
                      </div>
                    )}
                  </dl>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function formatDutyTime(start: string, end: string): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kathmandu",
  });
  return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))}`;
}

function DutyReportView({
  report,
  loading,
  onPageChange,
}: {
  report: WorkReportDrilldownResponse | null;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  if (!report && loading) {
    return <ReportSkeleton variant="duty" label="Preparing the duty report" />;
  }

  if (!report) {
    return (
      <section className="report-v2-state">
        <strong>No duty report is available.</strong>
        <p>Adjust the period or filters and try again.</p>
      </section>
    );
  }

  const duty = report.dutySummary;
  if (!duty) {
    return (
      <section className="report-v2-state">
        <strong>Duty summary is unavailable.</strong>
        <p>Refresh the report and try again.</p>
      </section>
    );
  }

  const section = report.sections.duty;
  const rows = section?.rows ?? [];
  const pagination = section?.pagination;

  return (
    <div className="report-v2-duty-view">
      <section className="report-v2-duty-kpis" aria-label="Duty summary">
        <article className="report-v2-duty-kpi is-scheduled">
          <span>Scheduled</span>
          <strong>{duty.scheduled}</strong>
          <small>Active planned duty</small>
        </article>
        <article className="report-v2-duty-kpi is-employees">
          <span>Employees Scheduled</span>
          <strong>{duty.uniqueEmployees}</strong>
          <small>Unique employees</small>
        </article>
        <article className="report-v2-duty-kpi is-leave">
          <span>Leave</span>
          <strong>{duty.leaveDays}</strong>
          <small>Recorded leave days</small>
        </article>
        <article className="report-v2-duty-kpi is-cancelled">
          <span>Cancelled</span>
          <strong>{duty.cancelled}</strong>
          <small>Cancelled duty</small>
        </article>
      </section>

      <section className="report-v2-duty-panel">
        <header className="report-v2-duty-panel__header">
          <div>
            <span>Duty schedule</span>
            <h2>Planned duty records</h2>
            <p>One concise schedule view. Duty records represent planned assignments, not attendance.</p>
          </div>
          <strong>{pagination?.total ?? rows.length} records</strong>
        </header>

        {loading && <div className="report-v2-refreshing" role="status">Updating duty records…</div>}

        {rows.length === 0 ? (
          <div className="report-v2-duty-empty">
            <strong>No duty records found.</strong>
            <span>Try a different period, organization filter or search.</span>
          </div>
        ) : (
          <div className="report-v2-duty-table-wrap" tabIndex={0} aria-label="Duty schedule table">
            <table className="report-v2-duty-table">
              <caption className="report-v2-visually-hidden">Planned duty schedule</caption>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>Shift</th>
                  <th>Department</th>
                  <th>Location</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: WorkReportDrilldownDutyRow) => {
                  const cancelled = Boolean(row.cancelledAt);
                  return (
                    <tr key={row.id}>
                      <td data-label="Date">
                        <strong>{formatDate(row.dutyDate)}</strong>
                      </td>
                      <td data-label="Employee" className="report-v2-duty-person">
                        <strong>{row.employee}</strong>
                        <small>{[row.employeeId, statusLabel(row.employeeRole)].filter(Boolean).join(" · ")}</small>
                      </td>
                      <td data-label="Shift">
                        <strong>{row.shift}</strong>
                        <small>{formatDutyTime(row.startsAt, row.endsAt)}</small>
                      </td>
                      <td data-label="Department">
                        <strong>{row.department?.name ?? "Division duty"}</strong>
                        <small>{row.division.name}</small>
                      </td>
                      <td data-label="Location">
                        <strong>{row.reportingLocation || "—"}</strong>
                      </td>
                      <td data-label="Status">
                        <span className={`report-v2-duty-status ${cancelled ? "is-cancelled" : "is-scheduled"}`}>
                          {cancelled ? "Cancelled" : "Scheduled"}
                        </span>
                        {cancelled && row.cancellationReason && <small>{row.cancellationReason}</small>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <footer className="report-v2-pagination" aria-label="Duty report pages">
            <button
              type="button"
              disabled={!pagination.hasPrevious || loading}
              onClick={() => onPageChange(pagination.page - 1)}
            >
              Previous
            </button>
            <span>Page {pagination.page} of {pagination.totalPages}</span>
            <button
              type="button"
              disabled={!pagination.hasNext || loading}
              onClick={() => onPageChange(pagination.page + 1)}
            >
              Next
            </button>
          </footer>
        )}
      </section>

      <p className="report-v2-duty-note">{report.notice}</p>
    </div>
  );
}

function ReportPrintView({
  view,
  overview,
  performance,
  performancePeriodChoice,
  performanceWorkType,
  records,
  duty,
}: {
  view: ReportView;
  overview: WorkReportSummary | null;
  performance: WorkReportDrilldownResponse | null;
  performancePeriodChoice: PeriodChoice;
  performanceWorkType?: WorkItemType;
  records: WorkReportDrilldownResponse | null;
  duty: WorkReportDrilldownResponse | null;
}) {
  const source =
    view === "OVERVIEW"
      ? overview
      : view === "PERFORMANCE_REPORT"
        ? performance
        : view === "WORK_RECORDS"
          ? records
          : duty;
  if (!source) return null;

  const title =
    view === "OVERVIEW"
      ? "NTC Patan Management Report"
      : view === "PERFORMANCE_REPORT"
        ? performancePeriodChoice === "TODAY"
          ? "NTC Patan Daily Work Performance Report"
          : performancePeriodChoice === "WEEK"
            ? "NTC Patan Weekly Work Performance Report"
            : performancePeriodChoice === "MONTH"
              ? "NTC Patan Monthly Work Performance Report"
              : "NTC Patan Work Performance Report"
        : view === "WORK_RECORDS"
          ? "NTC Patan Work Records Report"
          : "NTC Patan Duty Report";
  const period = source.period;
  const scope = source.scope;
  const generatedAt = source.generatedAt;

  return (
    <section className="report-v2-print" aria-label={`${title} printable report`}>
      <header className="report-v2-print__header">
        <div className="report-v2-print__identity">
          <span>NEPAL TELECOM</span>
          <h1>{title}</h1>
          <p>{scope.label}</p>
        </div>
        <dl>
          <div><dt>Period</dt><dd>{formatDate(period.from)} – {formatDate(period.to)}</dd></div>
          <div><dt>Generated</dt><dd>{formatDateTime(generatedAt)}</dd></div>
        </dl>
      </header>

      {view === "OVERVIEW" && overview && (
        <>
          <section className="report-v2-print__section">
            <h2>Key indicators</h2>
            <table className="report-v2-print__table is-kpis">
              <thead><tr><th>Active Work</th><th>Completed</th><th>Need Review</th><th>Overdue</th><th>Completion Rate</th></tr></thead>
              <tbody><tr>
                <td>{overview.work.totals.activeAtEnd}</td>
                <td>{overview.workflow.completedDuring}</td>
                <td>{overview.workflow.waitingForApproval}</td>
                <td>{overview.workflow.overdue}</td>
                <td>{formatPercent(overview.work.totals.completionRate)}</td>
              </tr></tbody>
            </table>
          </section>

          <section className="report-v2-print__section">
            <h2>Workflow status</h2>
            <table className="report-v2-print__table">
              <thead><tr><th>New</th><th>In Progress</th><th>Waiting Sales</th><th>Waiting Approval</th><th>Returned</th></tr></thead>
              <tbody><tr>
                <td>{overview.workflow.newWork}</td>
                <td>{overview.workflow.inProgress}</td>
                <td>{overview.workflow.waitingForSales}</td>
                <td>{overview.workflow.waitingForApproval}</td>
                <td>{overview.workflow.returnedForCorrection}</td>
              </tr></tbody>
            </table>
          </section>

          <section className="report-v2-print__section">
            <h2>Organization performance</h2>
            <table className="report-v2-print__table">
              <thead><tr><th>Team</th><th>Active</th><th>In Progress</th><th>Waiting Sales</th><th>Need Review</th><th>Overdue</th><th>Completed</th></tr></thead>
              <tbody>
                {overview.teams.length > 0 ? [...overview.teams]
                  .sort((left, right) => {
                    if (right.overdueWork !== left.overdueWork) return right.overdueWork - left.overdueWork;
                    if (right.waitingForApproval !== left.waitingForApproval) return right.waitingForApproval - left.waitingForApproval;
                    if (right.waitingForSales !== left.waitingForSales) return right.waitingForSales - left.waitingForSales;
                    return right.activeWork - left.activeWork;
                  })
                  .map((team) => (
                  <tr key={team.teamId}>
                    <td>{team.name}<small>{team.departmentName} · {team.divisionName}</small></td>
                    <td>{team.activeWork}</td><td>{team.inProgress}</td><td>{team.waitingForSales}</td>
                    <td>{team.waitingForApproval}</td><td>{team.overdueWork}</td><td>{team.completedDuring}</td>
                  </tr>
                )) : <tr><td colSpan={7}>No team performance rows for this scope and period.</td></tr>}
              </tbody>
            </table>
          </section>

          <section className="report-v2-print__section">
            <h2>Needs attention</h2>
            <table className="report-v2-print__table">
              <thead><tr><th>Overdue</th><th>Waiting for Sales</th><th>Waiting for Approval</th><th>Returned for Correction</th></tr></thead>
              <tbody><tr>
                <td>{overview.workflow.overdue}</td><td>{overview.workflow.waitingForSales}</td>
                <td>{overview.workflow.waitingForApproval}</td><td>{overview.workflow.returnedForCorrection}</td>
              </tr></tbody>
            </table>
          </section>
          <section className="report-v2-print__section">
            <h2>Work trend</h2>
            <table className="report-v2-print__table">
              <thead><tr><th>Date</th><th>Created</th><th>Completed</th></tr></thead>
              <tbody>
                {overview.trend.map((day) => (
                  <tr key={day.date}><td>{formatDate(day.date)}</td><td>{day.workCreated}</td><td>{day.workClosed}</td></tr>
                ))}
              </tbody>
            </table>
          </section>

        </>
      )}

      {view === "PERFORMANCE_REPORT" && performance && (() => {
        const section = performance.sections.performance;
        if (!section) return null;
        const visibleGroups = performanceWorkType
          ? PERFORMANCE_WORK_GROUPS.filter((group) => group.type === performanceWorkType)
          : PERFORMANCE_WORK_GROUPS;
        const showOverallTotal = !performanceWorkType;
        return (
          <section className="report-v2-print__section report-v2-print__section--performance">
            <table className="report-v2-print__table is-performance">
              <thead>
                <tr>
                  <th rowSpan={2}>S.N.</th>
                  <th rowSpan={2}>Date</th>
                  <th rowSpan={2}>Team</th>
                  <th rowSpan={2}>Support Staff</th>
                  <th rowSpan={2}>Other Staff</th>
                  <th rowSpan={2}>Service / Token Number</th>
                  {visibleGroups.map((group) => (
                    <th key={group.key} colSpan={3}>{group.label}</th>
                  ))}
                  {showOverallTotal && <th colSpan={3}>Total</th>}
                </tr>
                <tr>
                  {visibleGroups.map((group) => (
                    <Fragment key={group.key}>
                      <th>Tickets</th><th>Completed</th><th>Pending</th>
                    </Fragment>
                  ))}
                  {showOverallTotal && <><th>Tickets</th><th>Completed</th><th>Pending</th></>}
                </tr>
              </thead>
              <tbody>
                {section.rows.length > 0 ? section.rows.map((row, index) => (
                  <tr key={`${row.date}:${row.team.id}`}>
                    <td>{index + 1}</td>
                    <td>{formatDate(row.date)}</td>
                    <td>{row.team.name}<small>{row.team.departmentName} · {row.team.divisionName}</small></td>
                    <td>{row.supportStaffCount}</td>
                    <td>{row.otherStaffCount}</td>
                    <td>{row.references.length > 0 ? row.references.join(" · ") : "—"}</td>
                    {visibleGroups.map((group) => (
                      <Fragment key={group.key}>
                        <td>{row.workTypes[group.key].tickets}</td>
                        <td>{row.workTypes[group.key].completed}</td>
                        <td>{row.workTypes[group.key].pending}</td>
                      </Fragment>
                    ))}
                    {showOverallTotal && <>
                      <td>{row.total.tickets}</td>
                      <td>{row.total.completed}</td>
                      <td>{row.total.pending}</td>
                    </>}
                  </tr>
                )) : <tr><td colSpan={6 + visibleGroups.length * 3 + (showOverallTotal ? 3 : 0)}>No operational Team work matched this period.</td></tr>}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={3}>Total</th>
                  <td>—</td><td>—</td><td>—</td>
                  {visibleGroups.map((group) => (
                    <Fragment key={group.key}>
                      <td>{section.totals.workTypes[group.key].tickets}</td>
                      <td>{section.totals.workTypes[group.key].completed}</td>
                      <td>{section.totals.workTypes[group.key].pending}</td>
                    </Fragment>
                  ))}
                  {showOverallTotal && <>
                    <td>{section.totals.total.tickets}</td>
                    <td>{section.totals.total.completed}</td>
                    <td>{section.totals.total.pending}</td>
                  </>}
                </tr>
              </tfoot>
            </table>
          </section>
        );
      })()}

      {view === "WORK_RECORDS" && records && (() => {
        const rows = records.sections.work?.rows ?? [];
        const pagination = records.sections.work?.pagination;
        return (
          <section className="report-v2-print__section">
            <div className="report-v2-print__section-heading">
              <h2>Work Records</h2>
              <span>{pagination ? `${pagination.total} filtered records` : `${rows.length} records`}</span>
            </div>
            <table className="report-v2-print__table is-records">
              <thead><tr><th>Ticket</th><th>Work Type</th><th>Team / Owner</th><th>Service / Token Number</th><th>Stage</th><th>Date</th></tr></thead>
              <tbody>
                {rows.length > 0 ? rows.map((row: WorkReportDrilldownWorkRow) => (
                  <tr key={row.id}>
                    <td>{row.ticketNumber}</td>
                    <td>{typeLabel(row.type)}</td>
                    <td>{row.assignedTeam?.name ?? row.primaryAssignee}</td>
                    <td>{referenceLabel(row)}</td>
                    <td>{recordStageLabel(row.workflowStage)}</td>
                    <td>{formatDate(row.createdAt)}</td>
                  </tr>
                )) : <tr><td colSpan={6}>No work records found for the selected filters.</td></tr>}
              </tbody>
            </table>
          </section>
        );
      })()}

      {view === "DUTY_REPORT" && duty && (() => {
        const rows = duty.sections.duty?.rows ?? [];
        const pagination = duty.sections.duty?.pagination;
        return (
          <>
            <section className="report-v2-print__section">
              <h2>Duty summary</h2>
              <table className="report-v2-print__table is-kpis">
                <thead><tr><th>Scheduled</th><th>Employees Scheduled</th><th>Leave</th><th>Cancelled</th></tr></thead>
                <tbody><tr><td>{duty.dutySummary?.scheduled ?? 0}</td><td>{duty.dutySummary?.uniqueEmployees ?? 0}</td><td>{duty.dutySummary?.leaveDays ?? 0}</td><td>{duty.dutySummary?.cancelled ?? 0}</td></tr></tbody>
              </table>
            </section>
            <section className="report-v2-print__section">
              <div className="report-v2-print__section-heading">
                <h2>Planned duty records</h2>
                <span>{pagination ? `Page ${pagination.page} of ${pagination.totalPages} · ${pagination.total} filtered records` : `${rows.length} records`}</span>
              </div>
              <table className="report-v2-print__table is-duty">
                <thead><tr><th>Date</th><th>Employee</th><th>Shift</th><th>Department</th><th>Location</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.length > 0 ? rows.map((row: WorkReportDrilldownDutyRow) => (
                    <tr key={row.id}>
                      <td>{formatDate(row.dutyDate)}</td>
                      <td>{row.employee}<small>{row.employeeId ?? ""}</small></td>
                      <td>{row.shift}<small>{formatDutyTime(row.startsAt, row.endsAt)}</small></td>
                      <td>{row.department?.name ?? "Division duty"}<small>{row.division.name}</small></td>
                      <td>{row.reportingLocation || "—"}</td>
                      <td>{row.cancelledAt ? "Cancelled" : "Scheduled"}{row.cancellationReason ? ` · ${row.cancellationReason}` : ""}</td>
                    </tr>
                  )) : <tr><td colSpan={6}>No duty records found for the selected filters.</td></tr>}
                </tbody>
              </table>
            </section>
          </>
        );
      })()}

      <footer className="report-v2-print__footer">
        Generated by NT Message{view === "DUTY_REPORT" ? " · Planned duty is scheduling data, not attendance." : ""}
      </footer>
    </section>
  );
}

async function loadAllPrintableDrilldownRows(
  accessToken: string,
  query: WorkReportQuery,
  dataset: "WORK_RECORDS" | "DUTY_ASSIGNMENTS",
): Promise<WorkReportDrilldownResponse> {
  const first = await getWorkReportDrilldown(accessToken, {
    ...query,
    dataset,
    page: 1,
    limit: 100,
  });

  const firstSection = dataset === "WORK_RECORDS" ? first.sections.work : first.sections.duty;
  if (!firstSection || firstSection.pagination.totalPages <= 1) return first;

  if (dataset === "WORK_RECORDS") {
    const rows = [...(first.sections.work?.rows ?? [])];
    for (let page = 2; page <= firstSection.pagination.totalPages; page += 1) {
      const next = await getWorkReportDrilldown(accessToken, {
        ...query,
        dataset,
        page,
        limit: 100,
      });
      rows.push(...(next.sections.work?.rows ?? []));
    }
    return {
      ...first,
      sections: {
        ...first.sections,
        work: first.sections.work ? { ...first.sections.work, rows } : null,
      },
    };
  }

  const rows = [...(first.sections.duty?.rows ?? [])];
  for (let page = 2; page <= firstSection.pagination.totalPages; page += 1) {
    const next = await getWorkReportDrilldown(accessToken, {
      ...query,
      dataset,
      page,
      limit: 100,
    });
    rows.push(...(next.sections.duty?.rows ?? []));
  }
  return {
    ...first,
    sections: {
      ...first.sections,
      duty: first.sections.duty ? { ...first.sections.duty, rows } : null,
    },
  };
}

export function WorkReportsPage() {
  const { account, accessToken } = useAuth();
  const today = useMemo(() => toDateInput(new Date()), []);
  const [view, setView] = useState<ReportView>("OVERVIEW");
  const [overviewPeriodChoice, setOverviewPeriodChoice] = useState<PeriodChoice>("TODAY");
  const [overviewSummary, setOverviewSummary] = useState<WorkReportSummary | null>(null);
  const [overviewDraft, setOverviewDraft] = useState<WorkReportQuery>({
    from: today,
    to: today,
  });
  const [overviewApplied, setOverviewApplied] = useState<WorkReportQuery>(overviewDraft);
  const [overviewLoading, setOverviewLoading] = useState(true);

  const [performancePeriodChoice, setPerformancePeriodChoice] = useState<PeriodChoice>("TODAY");
  const [performanceDraft, setPerformanceDraft] = useState<WorkReportQuery>({
    from: today,
    to: today,
  });
  const [performanceApplied, setPerformanceApplied] = useState<WorkReportQuery>(performanceDraft);
  const [performanceReport, setPerformanceReport] = useState<WorkReportDrilldownResponse | null>(null);
  const [performanceLoading, setPerformanceLoading] = useState(false);

  const [recordsPeriodChoice, setRecordsPeriodChoice] = useState<PeriodChoice>("TODAY");
  const [recordsDraft, setRecordsDraft] = useState<WorkReportQuery>({
    from: today,
    to: today,
    search: "",
  });
  const [recordsApplied, setRecordsApplied] = useState<WorkReportQuery>(recordsDraft);
  const [recordsReport, setRecordsReport] = useState<WorkReportDrilldownResponse | null>(null);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsLoading, setRecordsLoading] = useState(false);

  const [dutyPeriodChoice, setDutyPeriodChoice] = useState<PeriodChoice>("TODAY");
  const [dutyDraft, setDutyDraft] = useState<WorkReportQuery>({
    from: today,
    to: today,
    search: "",
  });
  const [dutyApplied, setDutyApplied] = useState<WorkReportQuery>(dutyDraft);
  const [dutyReport, setDutyReport] = useState<WorkReportDrilldownResponse | null>(null);
  const [dutyPage, setDutyPage] = useState(1);
  const [dutyLoading, setDutyLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preparingPrint, setPreparingPrint] = useState(false);
  const [printRecordsReport, setPrintRecordsReport] = useState<WorkReportDrilldownResponse | null>(null);
  const [printDutyReport, setPrintDutyReport] = useState<WorkReportDrilldownResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadOverview = useCallback(async () => {
    if (!accessToken) return;
    setOverviewLoading(true);
    setError("");
    try {
      setOverviewSummary(await getWorkReportSummary(accessToken, overviewApplied));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setOverviewLoading(false);
    }
  }, [accessToken, overviewApplied]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const loadPerformanceReport = useCallback(async () => {
    if (!accessToken || view !== "PERFORMANCE_REPORT") return;
    setPerformanceLoading(true);
    setError("");
    try {
      setPerformanceReport(
        await getWorkReportDrilldown(accessToken, {
          ...performanceApplied,
          dataset: "PERFORMANCE_REPORT",
          page: 1,
          limit: 100,
        }),
      );
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setPerformanceLoading(false);
    }
  }, [accessToken, performanceApplied, view]);

  useEffect(() => {
    void loadPerformanceReport();
  }, [loadPerformanceReport]);

  const loadWorkRecords = useCallback(async () => {
    if (!accessToken || view !== "WORK_RECORDS") return;
    setRecordsLoading(true);
    setError("");
    try {
      setRecordsReport(
        await getWorkReportDrilldown(accessToken, {
          ...recordsApplied,
          dataset: "WORK_RECORDS",
          page: recordsPage,
          limit: 25,
        }),
      );
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setRecordsLoading(false);
    }
  }, [accessToken, recordsApplied, recordsPage, view]);

  useEffect(() => {
    void loadWorkRecords();
  }, [loadWorkRecords]);

  const loadDutyReport = useCallback(async () => {
    if (!accessToken || view !== "DUTY_REPORT") return;
    setDutyLoading(true);
    setError("");
    try {
      setDutyReport(
        await getWorkReportDrilldown(accessToken, {
          ...dutyApplied,
          dataset: "DUTY_ASSIGNMENTS",
          page: dutyPage,
          limit: 25,
        }),
      );
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setDutyLoading(false);
    }
  }, [accessToken, dutyApplied, dutyPage, view]);

  useEffect(() => {
    void loadDutyReport();
  }, [loadDutyReport]);

  const overviewDivisions = useMemo(
    () => reportDivisionOptions(overviewSummary),
    [overviewSummary],
  );
  const overviewDepartments = useMemo(() => {
    if (!overviewSummary) return [];
    if (!overviewDraft.divisionId) return overviewSummary.departmentOptions;
    return overviewSummary.departmentOptions.filter(
      (department) => department.divisionId === overviewDraft.divisionId,
    );
  }, [overviewDraft.divisionId, overviewSummary]);
  const overviewTeams = useMemo(() => {
    if (!overviewSummary) return [];
    return overviewSummary.teamOptions.filter((team) => {
      if (overviewDraft.departmentId && team.departmentId !== overviewDraft.departmentId) {
        return false;
      }
      if (
        overviewDraft.divisionId &&
        team.department.division.id !== overviewDraft.divisionId
      ) {
        return false;
      }
      return true;
    });
  }, [overviewDraft.departmentId, overviewDraft.divisionId, overviewSummary]);

  const performanceDepartments = useMemo(() => {
    if (!overviewSummary) return [];
    if (!performanceDraft.divisionId) return overviewSummary.departmentOptions;
    return overviewSummary.departmentOptions.filter(
      (department) => department.divisionId === performanceDraft.divisionId,
    );
  }, [overviewSummary, performanceDraft.divisionId]);

  const performanceTeams = useMemo(() => {
    if (!overviewSummary) return [];
    return overviewSummary.teamOptions.filter((team) => {
      if (performanceDraft.departmentId && team.departmentId !== performanceDraft.departmentId) {
        return false;
      }
      if (
        performanceDraft.divisionId &&
        team.department.division.id !== performanceDraft.divisionId
      ) {
        return false;
      }
      return true;
    });
  }, [overviewSummary, performanceDraft.departmentId, performanceDraft.divisionId]);

  const recordsDepartments = useMemo(() => {
    if (!overviewSummary) return [];
    if (!recordsDraft.divisionId) return overviewSummary.departmentOptions;
    return overviewSummary.departmentOptions.filter(
      (department) => department.divisionId === recordsDraft.divisionId,
    );
  }, [overviewSummary, recordsDraft.divisionId]);

  const recordsTeams = useMemo(() => {
    if (!overviewSummary) return [];
    return overviewSummary.teamOptions.filter((team) => {
      if (recordsDraft.departmentId && team.departmentId !== recordsDraft.departmentId) {
        return false;
      }
      if (
        recordsDraft.divisionId &&
        team.department.division.id !== recordsDraft.divisionId
      ) {
        return false;
      }
      return true;
    });
  }, [overviewSummary, recordsDraft.departmentId, recordsDraft.divisionId]);

  const dutyVisibleDepartments = useMemo(() => {
    if (!overviewSummary) return [];
    if (!dutyDraft.divisionId) return overviewSummary.departmentOptions;
    return overviewSummary.departmentOptions.filter(
      (department) => department.divisionId === dutyDraft.divisionId,
    );
  }, [dutyDraft.divisionId, overviewSummary]);

  const changeOverviewPeriod = (choice: PeriodChoice) => {
    setOverviewPeriodChoice(choice);
    if (choice === "CUSTOM") return;
    setOverviewDraft((current) => ({ ...current, ...periodDates(choice) }));
  };

  const applyOverview = (event: FormEvent) => {
    event.preventDefault();
    setNotice("");
    setOverviewApplied({
      ...overviewDraft,
      from: overviewDraft.from || today,
      to: overviewDraft.to || overviewDraft.from || today,
      divisionId: overviewDraft.divisionId || undefined,
      departmentId: overviewDraft.departmentId || undefined,
      teamId: overviewDraft.teamId || undefined,
      type: overviewDraft.type || undefined,
    });
  };

  const resetOverview = () => {
    const next = { ...periodDates("TODAY") };
    setOverviewPeriodChoice("TODAY");
    setOverviewDraft(next);
    setOverviewApplied(next);
    setNotice("");
  };

  const changePerformancePeriod = (choice: PeriodChoice) => {
    setPerformancePeriodChoice(choice);
    if (choice === "CUSTOM") return;
    setPerformanceDraft((current) => ({ ...current, ...periodDates(choice) }));
  };

  const applyPerformance = (event: FormEvent) => {
    event.preventDefault();
    setNotice("");
    setPerformanceApplied({
      ...performanceDraft,
      from: performanceDraft.from || today,
      to: performanceDraft.to || performanceDraft.from || today,
      divisionId: performanceDraft.divisionId || undefined,
      departmentId: performanceDraft.departmentId || undefined,
      teamId: performanceDraft.teamId || undefined,
      type: performanceDraft.type || undefined,
    });
  };

  const resetPerformance = () => {
    const next = { ...periodDates("TODAY") };
    setPerformancePeriodChoice("TODAY");
    setPerformanceDraft(next);
    setPerformanceApplied(next);
    setNotice("");
  };

  const openWorkRecordsFromOverview = (
    options: { workflowStage?: WorkReportWorkflowStageFilter; teamId?: string },
  ) => {
    const next: WorkReportQuery = {
      from: overviewApplied.from ?? today,
      to: overviewApplied.to ?? overviewApplied.from ?? today,
      divisionId: overviewApplied.divisionId || undefined,
      departmentId: overviewApplied.departmentId || undefined,
      teamId: options.teamId ?? overviewApplied.teamId ?? undefined,
      type: overviewApplied.type || undefined,
      workflowStage: options.workflowStage,
      search: "",
    };
    setRecordsPeriodChoice(overviewPeriodChoice);
    setRecordsDraft(next);
    setRecordsApplied(next);
    setRecordsPage(1);
    setNotice("");
    setView("WORK_RECORDS");
  };

  const changeRecordsPeriod = (choice: PeriodChoice) => {
    setRecordsPeriodChoice(choice);
    if (choice === "CUSTOM") return;
    setRecordsDraft((current) => ({ ...current, ...periodDates(choice) }));
  };

  const applyRecords = (event: FormEvent) => {
    event.preventDefault();
    setNotice("");
    setRecordsPage(1);
    setRecordsApplied({
      ...recordsDraft,
      from: recordsDraft.from || today,
      to: recordsDraft.to || recordsDraft.from || today,
      divisionId: recordsDraft.divisionId || undefined,
      departmentId: recordsDraft.departmentId || undefined,
      teamId: recordsDraft.teamId || undefined,
      type: recordsDraft.type || undefined,
      search: recordsDraft.search?.trim() || undefined,
    });
  };

  const resetRecords = () => {
    const next: WorkReportQuery = { ...periodDates("TODAY"), search: "" };
    setRecordsPeriodChoice("TODAY");
    setRecordsDraft(next);
    setRecordsApplied(next);
    setRecordsPage(1);
    setNotice("");
  };

  const clearRecordsWorkflowStage = () => {
    setRecordsDraft((current) => ({ ...current, workflowStage: undefined }));
    setRecordsApplied((current) => ({ ...current, workflowStage: undefined }));
    setRecordsPage(1);
    setNotice("");
  };

  const changeDutyPeriod = (choice: PeriodChoice) => {
    setDutyPeriodChoice(choice);
    if (choice === "CUSTOM") return;
    setDutyDraft((current) => ({ ...current, ...periodDates(choice) }));
  };

  const submitDuty = (event: FormEvent) => {
    event.preventDefault();
    setNotice("");
    setDutyPage(1);
    setDutyApplied({
      ...dutyDraft,
      from: dutyDraft.from || today,
      to: dutyDraft.to || dutyDraft.from || today,
      divisionId: dutyDraft.divisionId || undefined,
      departmentId: dutyDraft.departmentId || undefined,
      search: dutyDraft.search?.trim() || undefined,
    });
  };

  const resetDuty = () => {
    const next: WorkReportQuery = { ...periodDates("TODAY"), search: "" };
    setDutyPeriodChoice("TODAY");
    setDutyDraft(next);
    setDutyApplied(next);
    setDutyPage(1);
    setNotice("");
  };

  const exportCurrent = async () => {
    if (!accessToken) return;
    if (view === "OVERVIEW" && !overviewSummary) return;
    if (view === "PERFORMANCE_REPORT" && !performanceReport) return;
    if (view === "WORK_RECORDS" && !recordsReport) return;
    if (view === "DUTY_REPORT" && !dutyReport) return;

    setExporting(true);
    setError("");
    setNotice("");
    try {
      const result =
        view === "OVERVIEW"
          ? await downloadWorkReportCsv(accessToken, "SUMMARY", overviewApplied)
          : view === "PERFORMANCE_REPORT"
            ? await downloadWorkReportCsv(accessToken, "PERFORMANCE_REPORT", performanceApplied)
            : view === "WORK_RECORDS"
              ? await downloadWorkReportCsv(accessToken, "WORK_RECORDS", recordsApplied)
              : await downloadWorkReportCsv(accessToken, "DUTY_ASSIGNMENTS", dutyApplied);
      setNotice(
        result.truncated
          ? `${result.filename} downloaded. The export reached the safe row limit; narrow the filters for a complete file.`
          : `${result.filename} downloaded successfully.`,
      );
    } catch (exportError) {
      setError(getErrorMessage(exportError));
    } finally {
      setExporting(false);
    }
  };

  const printCurrent = async () => {
    if (!accessToken || !currentReportReady || preparingPrint) return;

    setPreparingPrint(true);
    setError("");
    try {
      if (view === "WORK_RECORDS") {
        setPrintRecordsReport(
          await loadAllPrintableDrilldownRows(accessToken, recordsApplied, "WORK_RECORDS"),
        );
      } else if (view === "DUTY_REPORT") {
        setPrintDutyReport(
          await loadAllPrintableDrilldownRows(accessToken, dutyApplied, "DUTY_ASSIGNMENTS"),
        );
      }

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      window.print();
    } catch (printError) {
      setError(getErrorMessage(printError));
    } finally {
      setPreparingPrint(false);
      setPrintRecordsReport(null);
      setPrintDutyReport(null);
    }
  };

  if (!accessToken) {
    return (
      <main className="performance-report-page">
        <section className="performance-report-state is-error">
          Your secure session is unavailable. Sign in again.
        </section>
      </main>
    );
  }

  const showDivisionFilter = account?.role === "SUPER_ADMIN";
  const showDepartmentFilter =
    account?.role === "SUPER_ADMIN" || account?.role === "SENIOR_MANAGEMENT";
  const showTeamFilter = account?.role !== "EMPLOYEE";
  const currentBusy =
    view === "OVERVIEW"
      ? overviewLoading
      : view === "PERFORMANCE_REPORT"
        ? performanceLoading
        : view === "WORK_RECORDS"
          ? recordsLoading
          : dutyLoading;
  const currentReportReady =
    view === "OVERVIEW"
      ? Boolean(overviewSummary)
      : view === "PERFORMANCE_REPORT"
        ? Boolean(performanceReport)
        : view === "WORK_RECORDS"
          ? Boolean(recordsReport)
          : Boolean(dutyReport);

  const retryCurrent = () => {
    if (view === "OVERVIEW") {
      void loadOverview();
      return;
    }
    if (view === "PERFORMANCE_REPORT") {
      void loadPerformanceReport();
      return;
    }
    if (view === "WORK_RECORDS") {
      void loadWorkRecords();
      return;
    }
    void loadDutyReport();
  };

  return (
    <main className="performance-report-page report-v2-page">
      <div className="performance-report-page__canvas" aria-busy={currentBusy}>
        <header className="performance-report-hero report-v2-hero">
          <div>
            <span>Work Management</span>
            <h1>Reports</h1>
            <p>{overviewSummary?.scope.label ?? scopeTitle(account?.role)}</p>
          </div>
          <div className="performance-report-hero__actions">
            <Link className="performance-report-action performance-report-action--back" to="/work-management">
              Back to Work Management
            </Link>
            <button
              className="performance-report-action performance-report-action--primary"
              type="button"
              onClick={exportCurrent}
              disabled={!currentReportReady || exporting}
            >
              {exporting ? "Preparing…" : "Export CSV"}
            </button>
            <button
              className="performance-report-action"
              type="button"
              onClick={() => void printCurrent()}
              disabled={!currentReportReady || preparingPrint}
            >
              {preparingPrint ? "Preparing all records…" : "Print / PDF"}
            </button>
          </div>
        </header>

        {error && (
          <section className="performance-report-message report-v2-message is-error" role="alert">
            <div>
              <strong>Report could not be updated</strong>
              <span>{error}</span>
            </div>
            <button type="button" onClick={retryCurrent} disabled={currentBusy}>
              {currentBusy ? "Retrying…" : "Retry"}
            </button>
          </section>
        )}
        {notice && <section className="performance-report-message report-v2-message is-success" role="status" aria-live="polite">{notice}</section>}

        <nav className="performance-report-tabs report-v2-tabs" aria-label="Report sections">
          <button type="button" aria-current={view === "OVERVIEW" ? "page" : undefined} className={view === "OVERVIEW" ? "is-active" : ""} onClick={() => setView("OVERVIEW")}>Overview</button>
          <button type="button" aria-current={view === "PERFORMANCE_REPORT" ? "page" : undefined} className={view === "PERFORMANCE_REPORT" ? "is-active" : ""} onClick={() => setView("PERFORMANCE_REPORT")}>Performance Report</button>
          <button type="button" aria-current={view === "WORK_RECORDS" ? "page" : undefined} className={view === "WORK_RECORDS" ? "is-active" : ""} onClick={() => setView("WORK_RECORDS")}>Work Records</button>
          <button type="button" aria-current={view === "DUTY_REPORT" ? "page" : undefined} className={view === "DUTY_REPORT" ? "is-active" : ""} onClick={() => setView("DUTY_REPORT")}>Duty</button>
        </nav>

        {view === "OVERVIEW" ? (
          <>
            <form className="report-v2-filters" onSubmit={applyOverview}>
              <div className="report-v2-filter-heading">
                <div>
                  <span>Report filters</span>
                  <h2>Choose only what you need</h2>
                </div>
                <div className="report-v2-periods" aria-label="Overview report period">
                  {([
                    ["TODAY", "Today"],
                    ["WEEK", "This Week"],
                    ["MONTH", "This Month"],
                    ["CUSTOM", "Custom"],
                  ] as Array<[PeriodChoice, string]>).map(([choice, label]) => (
                    <button key={choice} type="button" aria-pressed={overviewPeriodChoice === choice} className={overviewPeriodChoice === choice ? "is-active" : ""} onClick={() => changeOverviewPeriod(choice)}>{label}</button>
                  ))}
                </div>
              </div>

              <div className="report-v2-filter-grid">
                <label>
                  <span>From</span>
                  <input
                    type="date"
                    value={overviewDraft.from ?? today}
                    max={overviewDraft.to ?? today}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setOverviewPeriodChoice("CUSTOM");
                      setOverviewDraft((current) => ({ ...current, from: event.target.value }));
                    }}
                    required
                  />
                </label>
                <label>
                  <span>To</span>
                  <input
                    type="date"
                    value={overviewDraft.to ?? today}
                    min={overviewDraft.from ?? undefined}
                    max={today}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setOverviewPeriodChoice("CUSTOM");
                      setOverviewDraft((current) => ({ ...current, to: event.target.value }));
                    }}
                    required
                  />
                </label>
                {showDivisionFilter && (
                  <label>
                    <span>Division</span>
                    <select
                      value={overviewDraft.divisionId ?? ""}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        setOverviewDraft((current) => ({
                          ...current,
                          divisionId: event.target.value,
                          departmentId: "",
                          teamId: "",
                        }))
                      }
                    >
                      <option value="">All divisions</option>
                      {overviewDivisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
                    </select>
                  </label>
                )}
                {showDepartmentFilter && (
                  <label>
                    <span>Department</span>
                    <select
                      value={overviewDraft.departmentId ?? ""}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        setOverviewDraft((current) => ({
                          ...current,
                          departmentId: event.target.value,
                          teamId: "",
                        }))
                      }
                    >
                      <option value="">All departments</option>
                      {overviewDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                    </select>
                  </label>
                )}
                {showTeamFilter && (
                  <label>
                    <span>Team</span>
                    <select
                      value={overviewDraft.teamId ?? ""}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        setOverviewDraft((current) => ({ ...current, teamId: event.target.value }))
                      }
                    >
                      <option value="">All teams</option>
                      {overviewTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                    </select>
                  </label>
                )}
                <label>
                  <span>Work type</span>
                  <select
                    value={overviewDraft.type ?? ""}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setOverviewDraft((current) => ({
                        ...current,
                        type: event.target.value ? (event.target.value as WorkItemType) : undefined,
                      }))
                    }
                  >
                    <option value="">All work types</option>
                    {WORK_TYPES.map((type) => <option key={type} value={type}>{typeLabel(type)}</option>)}
                  </select>
                </label>
                <div className="report-v2-filter-actions">
                  <button type="button" className="is-secondary" onClick={resetOverview}>Reset</button>
                  <button type="submit" className="is-primary" disabled={overviewLoading}>{overviewLoading ? "Updating…" : "Apply"}</button>
                </div>
              </div>
            </form>

            {overviewSummary && (
              <div className="report-v2-context" aria-label="Current report context">
                <span>{formatDate(overviewSummary.period.from)} – {formatDate(overviewSummary.period.to)}</span>
                <span>{overviewSummary.scope.label}</span>
                <span>Generated {formatDateTime(overviewSummary.generatedAt)}</span>
              </div>
            )}

            <OverviewReport
              summary={overviewSummary}
              loading={overviewLoading}
              onOpenAttention={(workflowStage) =>
                openWorkRecordsFromOverview({ workflowStage })
              }
              onOpenTeam={(teamId) => openWorkRecordsFromOverview({ teamId })}
            />
          </>
        ) : view === "PERFORMANCE_REPORT" ? (
          <>
            <form className="report-v2-record-filters report-v2-performance-filters" onSubmit={applyPerformance}>
              <div className="report-v2-filter-heading">
                <div>
                  <span>Report Options</span>
                  <h2>Choose the period and report details</h2>
                </div>
                <div className="report-v2-periods" aria-label="Performance report period">
                  {([
                    ["TODAY", "Today"],
                    ["WEEK", "This Week"],
                    ["MONTH", "This Month"],
                    ["CUSTOM", "Custom"],
                  ] as Array<[PeriodChoice, string]>).map(([choice, label]) => (
                    <button key={choice} type="button" aria-pressed={performancePeriodChoice === choice} className={performancePeriodChoice === choice ? "is-active" : ""} onClick={() => changePerformancePeriod(choice)}>{label}</button>
                  ))}
                </div>
              </div>

              <div className="report-v2-filter-grid report-v2-performance-filter-grid">
                <label>
                  <span>From</span>
                  <input
                    type="date"
                    value={performanceDraft.from ?? today}
                    max={performanceDraft.to ?? today}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setPerformancePeriodChoice("CUSTOM");
                      setPerformanceDraft((current) => ({ ...current, from: event.target.value }));
                    }}
                    required
                  />
                </label>
                <label>
                  <span>To</span>
                  <input
                    type="date"
                    value={performanceDraft.to ?? today}
                    min={performanceDraft.from ?? undefined}
                    max={today}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setPerformancePeriodChoice("CUSTOM");
                      setPerformanceDraft((current) => ({ ...current, to: event.target.value }));
                    }}
                    required
                  />
                </label>
                {showDivisionFilter && (
                  <label>
                    <span>Division</span>
                    <select
                      value={performanceDraft.divisionId ?? ""}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        setPerformanceDraft((current) => ({
                          ...current,
                          divisionId: event.target.value,
                          departmentId: "",
                          teamId: "",
                        }))
                      }
                    >
                      <option value="">All divisions</option>
                      {overviewDivisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
                    </select>
                  </label>
                )}
                {showDepartmentFilter && (
                  <label>
                    <span>Department</span>
                    <select
                      value={performanceDraft.departmentId ?? ""}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        setPerformanceDraft((current) => ({
                          ...current,
                          departmentId: event.target.value,
                          teamId: "",
                        }))
                      }
                    >
                      <option value="">All departments</option>
                      {performanceDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                    </select>
                  </label>
                )}
                {showTeamFilter && (
                  <label>
                    <span>Team</span>
                    <select
                      value={performanceDraft.teamId ?? ""}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        setPerformanceDraft((current) => ({ ...current, teamId: event.target.value }))
                      }
                    >
                      <option value="">All teams</option>
                      {performanceTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                    </select>
                  </label>
                )}
                <label>
                  <span>Work Type</span>
                  <select
                    value={performanceDraft.type ?? ""}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setPerformanceDraft((current) => ({
                        ...current,
                        type: event.target.value ? (event.target.value as WorkItemType) : undefined,
                      }))
                    }
                  >
                    <option value="">All operational work types</option>
                    {PERFORMANCE_WORK_TYPES.map((type) => <option key={type} value={type}>{typeLabel(type)}</option>)}
                  </select>
                </label>
                <div className="report-v2-filter-actions">
                  <button type="button" className="is-secondary" onClick={resetPerformance}>Reset</button>
                  <button type="submit" className="is-primary" disabled={performanceLoading}>{performanceLoading ? "Updating…" : "Apply"}</button>
                </div>
              </div>
            </form>

            {performanceReport && (
              <section className="report-v2-performance-meta" aria-label="Current performance report context">
                <div><span>Report Period</span><strong>{formatDate(performanceReport.period.from)} – {formatDate(performanceReport.period.to)}</strong></div>
                <div><span>Report For</span><strong>{performanceReport.scope.label}</strong></div>
                <div><span>Rows Shown</span><strong>{performanceReport.sections.performance?.rows.length ?? 0}</strong></div>
                <div><span>Generated</span><strong>{formatDateTime(performanceReport.generatedAt)}</strong></div>
              </section>
            )}

            <PerformanceReportView report={performanceReport} loading={performanceLoading} workType={performanceApplied.type} />
          </>
        ) : view === "WORK_RECORDS" ? (
          <>
            <form className="report-v2-record-filters" onSubmit={applyRecords}>
              <div className="report-v2-performance-period-row">
                <span>Report Period</span>
                <div className="report-v2-periods" aria-label="Work records period">
                  {([
                    ["TODAY", "Today"],
                    ["WEEK", "This Week"],
                    ["MONTH", "This Month"],
                    ["CUSTOM", "Custom"],
                  ] as Array<[PeriodChoice, string]>).map(([choice, label]) => (
                    <button key={choice} type="button" aria-pressed={recordsPeriodChoice === choice} className={recordsPeriodChoice === choice ? "is-active" : ""} onClick={() => changeRecordsPeriod(choice)}>{label}</button>
                  ))}
                </div>
              </div>

              <div className="report-v2-record-filter-grid">
                <label className="report-v2-record-filter-search">
                  <span>Search</span>
                  <input
                    type="search"
                    placeholder="Ticket, customer, Token/Service, location or team"
                    value={recordsDraft.search ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setRecordsDraft((current) => ({ ...current, search: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>From</span>
                  <input
                    type="date"
                    value={recordsDraft.from ?? today}
                    max={recordsDraft.to ?? today}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setRecordsPeriodChoice("CUSTOM");
                      setRecordsDraft((current) => ({ ...current, from: event.target.value }));
                    }}
                    required
                  />
                </label>
                <label>
                  <span>To</span>
                  <input
                    type="date"
                    value={recordsDraft.to ?? today}
                    min={recordsDraft.from ?? undefined}
                    max={today}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setRecordsPeriodChoice("CUSTOM");
                      setRecordsDraft((current) => ({ ...current, to: event.target.value }));
                    }}
                    required
                  />
                </label>
                {showDivisionFilter && (
                  <label>
                    <span>Division</span>
                    <select
                      value={recordsDraft.divisionId ?? ""}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        setRecordsDraft((current) => ({
                          ...current,
                          divisionId: event.target.value,
                          departmentId: "",
                          teamId: "",
                        }))
                      }
                    >
                      <option value="">All divisions</option>
                      {overviewDivisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
                    </select>
                  </label>
                )}
                {showDepartmentFilter && (
                  <label>
                    <span>Department</span>
                    <select
                      value={recordsDraft.departmentId ?? ""}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        setRecordsDraft((current) => ({
                          ...current,
                          departmentId: event.target.value,
                          teamId: "",
                        }))
                      }
                    >
                      <option value="">All departments</option>
                      {recordsDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                    </select>
                  </label>
                )}
                {showTeamFilter && (
                  <label>
                    <span>Team</span>
                    <select
                      value={recordsDraft.teamId ?? ""}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        setRecordsDraft((current) => ({ ...current, teamId: event.target.value }))
                      }
                    >
                      <option value="">All teams</option>
                      {recordsTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                    </select>
                  </label>
                )}
                <label>
                  <span>Work type</span>
                  <select
                    value={recordsDraft.type ?? ""}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setRecordsDraft((current) => ({
                        ...current,
                        type: event.target.value ? (event.target.value as WorkItemType) : undefined,
                      }))
                    }
                  >
                    <option value="">All work types</option>
                    {WORK_TYPES.map((type) => <option key={type} value={type}>{typeLabel(type)}</option>)}
                  </select>
                </label>
                <div className="report-v2-filter-actions report-v2-record-filter-actions">
                  <button type="button" className="is-secondary" onClick={resetRecords}>Reset</button>
                  <button type="submit" className="is-primary" disabled={recordsLoading}>{recordsLoading ? "Updating…" : "Apply"}</button>
                </div>
              </div>
            </form>

            {recordsApplied.workflowStage && (
              <div className="report-v2-active-filter" role="status">
                <span>Work Records filter: <strong>{workflowStageFilterLabel(recordsApplied.workflowStage)}</strong></span>
                <button type="button" onClick={clearRecordsWorkflowStage}>Clear</button>
              </div>
            )}

            {recordsReport && (
              <div className="report-v2-context" aria-label="Current work records context">
                <span>{formatDate(recordsReport.period.from)} – {formatDate(recordsReport.period.to)}</span>
                <span>{recordsReport.scope.label}</span>
                <span>Generated {formatDateTime(recordsReport.generatedAt)}</span>
              </div>
            )}

            <WorkRecordsView
              report={recordsReport}
              loading={recordsLoading}
              onPageChange={setRecordsPage}
            />
          </>
        ) : (
          <>
            <form className="report-v2-record-filters report-v2-duty-filters" onSubmit={submitDuty}>
              <div className="report-v2-filter-heading">
                <div>
                  <span>Duty filters</span>
                  <h2>Planned duty, one clear view</h2>
                  <p>Search by employee, employee ID, shift or reporting location.</p>
                </div>
                <div className="report-v2-periods" aria-label="Duty report period">
                  {([
                    ["TODAY", "Today"],
                    ["WEEK", "This Week"],
                    ["MONTH", "This Month"],
                    ["CUSTOM", "Custom"],
                  ] as Array<[PeriodChoice, string]>).map(([choice, label]) => (
                    <button key={choice} type="button" aria-pressed={dutyPeriodChoice === choice} className={dutyPeriodChoice === choice ? "is-active" : ""} onClick={() => changeDutyPeriod(choice)}>{label}</button>
                  ))}
                </div>
              </div>

              <div className="report-v2-duty-filter-grid">
                <label className="report-v2-duty-filter-search">
                  <span>Search</span>
                  <input
                    type="search"
                    placeholder="Employee, ID, shift or location"
                    value={dutyDraft.search ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setDutyDraft((current) => ({ ...current, search: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>From</span>
                  <input
                    type="date"
                    value={dutyDraft.from ?? today}
                    max={dutyDraft.to ?? undefined}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setDutyPeriodChoice("CUSTOM");
                      setDutyDraft((current) => ({ ...current, from: event.target.value }));
                    }}
                    required
                  />
                </label>
                <label>
                  <span>To</span>
                  <input
                    type="date"
                    value={dutyDraft.to ?? today}
                    min={dutyDraft.from ?? undefined}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setDutyPeriodChoice("CUSTOM");
                      setDutyDraft((current) => ({ ...current, to: event.target.value }));
                    }}
                    required
                  />
                </label>
                {showDivisionFilter && (
                  <label>
                    <span>Division</span>
                    <select
                      value={dutyDraft.divisionId ?? ""}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        setDutyDraft((current) => ({
                          ...current,
                          divisionId: event.target.value,
                          departmentId: "",
                        }))
                      }
                    >
                      <option value="">All divisions</option>
                      {overviewDivisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
                    </select>
                  </label>
                )}
                {showDepartmentFilter && (
                  <label>
                    <span>Department</span>
                    <select
                      value={dutyDraft.departmentId ?? ""}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        setDutyDraft((current) => ({ ...current, departmentId: event.target.value }))
                      }
                    >
                      <option value="">All departments</option>
                      {dutyVisibleDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                    </select>
                  </label>
                )}
                <div className="report-v2-filter-actions report-v2-duty-filter-actions">
                  <button type="button" className="is-secondary" onClick={resetDuty}>Reset</button>
                  <button type="submit" className="is-primary" disabled={dutyLoading}>{dutyLoading ? "Updating…" : "Apply"}</button>
                </div>
              </div>
            </form>

            {dutyReport && (
              <div className="report-v2-context" aria-label="Current duty report context">
                <span>{formatDate(dutyReport.period.from)} – {formatDate(dutyReport.period.to)}</span>
                <span>{dutyReport.scope.label}</span>
                <span>Generated {formatDateTime(dutyReport.generatedAt)}</span>
              </div>
            )}

            <DutyReportView report={dutyReport} loading={dutyLoading} onPageChange={setDutyPage} />
          </>
        )}

        <ReportPrintView
          view={view}
          overview={overviewSummary}
          performance={performanceReport}
          performancePeriodChoice={performancePeriodChoice}
          performanceWorkType={performanceApplied.type}
          records={printRecordsReport ?? recordsReport}
          duty={printDutyReport ?? dutyReport}
        />
      </div>
    </main>
  );
}
