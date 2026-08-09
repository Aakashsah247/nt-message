import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link } from "react-router";

import { useAuth } from "../context/AuthContext";
import {
  downloadPerformanceReportCsv,
  getPerformanceReport,
} from "../services/work-management.service";
import type { PerformanceReportQuery } from "../services/work-management.service";
import type {
  PerformanceDutyDetailRow,
  PerformanceDutySummaryRow,
  PerformanceReportCounts,
  PerformanceReportGroup,
  PerformanceReportResponse,
  PerformanceReportSection,
  PerformanceReportWorkType,
  PerformanceWorkDetailRow,
  WorkItemType,
} from "../types/work-management";

type ReportView = "WORK_SUMMARY" | "WORK_DETAILS" | "DUTY_REPORT";
type DutyView = "DUTY_SUMMARY" | "DUTY_DETAILS";
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

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function showNumber(value: number): string | number {
  // Official tables are easier to scan when an empty count is shown as a dash.
  return value === 0 ? "—" : value;
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

function splitWorkPathForPrint(path: Array<{ name: string }>): string[] {
  // Two names per line keep long assignment paths readable in landscape PDF output.
  const names = path.map((person) => person.name);
  const lines: string[] = [];

  for (let index = 0; index < names.length; index += 2) {
    const line = names.slice(index, index + 2).join(" → ");
    lines.push(index === 0 ? line : `→ ${line}`);
  }

  return lines;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The report could not be loaded.";
}

function scopeTitle(role: string | undefined): string {
  if (role === "SUPER_ADMIN") return "Branch Reports";
  if (role === "SENIOR_MANAGEMENT") return "Division Reports";
  return "Department Reports";
}

function activeExportSection(
  view: ReportView,
  dutyView: DutyView,
): PerformanceReportSection {
  if (view === "WORK_DETAILS") return "WORK_DETAILS";
  if (view === "DUTY_REPORT") return dutyView;
  return "WORK_SUMMARY";
}

function selectedWorkTypes(workType: PerformanceReportWorkType): WorkItemType[] {
  return workType === "ALL" ? WORK_TYPES : [workType];
}

function groupLabel(groupBy: PerformanceReportGroup): string {
  if (groupBy === "DEPARTMENT") return "Department";
  if (groupBy === "DIVISION") return "Division";
  return "Employee";
}

function CountHead({ title }: { title: string }) {
  return (
    <th colSpan={3} className="performance-report-table__group">
      {title}
    </th>
  );
}

function CountSubHead() {
  return (
    <>
      <th>Tickets</th>
      <th>Completed</th>
      <th>Pending</th>
    </>
  );
}

function CountCells({ counts }: { counts: PerformanceReportCounts }) {
  return (
    <>
      <td className="performance-report-number">{showNumber(counts.assigned)}</td>
      <td className="performance-report-number">{showNumber(counts.completed)}</td>
      <td className="performance-report-number">{showNumber(counts.pending)}</td>
    </>
  );
}

function WorkSummaryTable({ report }: { report: PerformanceReportResponse }) {
  const types = selectedWorkTypes(report.filters.workType);
  const showTotal = report.filters.workType === "ALL";
  const firstColumns = 5;

  return (
    <section className="performance-report-card performance-report-card--summary">
      <header className="performance-report-card__heading">
        <div>
          <span>Work summary</span>
          <h2>Tickets by date, employee and work type</h2>
        </div>
        <strong className="performance-report-card__count">{report.summaryRows.length} rows</strong>
      </header>
      <div
        className="performance-report-table-wrap"
        tabIndex={0}
        aria-label="Work summary table. Scroll horizontally to see all columns."
      >
        <table
          className={`performance-report-table performance-report-table--summary${
            types.length === 1 ? " is-one-work-type" : ""
          }`}
        >
          <thead>
            <tr>
              <th rowSpan={2}>S.N.</th>
              <th rowSpan={2}>Date</th>
              <th rowSpan={2}>{groupLabel(report.filters.groupBy)}</th>
              <th rowSpan={2}>Supporting Staff</th>
              <th rowSpan={2}>Service Numbers</th>
              {types.map((type) => (
                <CountHead key={type} title={typeLabel(type)} />
              ))}
              {showTotal && <CountHead title="Total" />}
            </tr>
            <tr>
              {types.map((type) => (
                <CountSubHead key={type} />
              ))}
              {showTotal && <CountSubHead />}
            </tr>
          </thead>
          <tbody>
            {report.summaryRows.length === 0 ? (
              <tr>
                <td
                  className="performance-report-empty-cell"
                  colSpan={firstColumns + types.length * 3 + (showTotal ? 3 : 0)}
                >
                  No work was found for the selected report.
                </td>
              </tr>
            ) : (
              report.summaryRows.map((row, index) => (
                <tr key={row.id}>
                  <td className="performance-report-number">{index + 1}</td>
                  <td>{formatDate(row.date)}</td>
                  <td className="performance-report-name">
                    <strong>{row.name}</strong>
                    <span>{row.code ?? row.department?.name ?? row.division?.name ?? "—"}</span>
                  </td>
                  <td className="performance-report-list-cell">
                    {row.supportingStaff.map((person) => person.name).join(", ") || "—"}
                  </td>
                  <td className="performance-report-list-cell">
                    {row.serviceNumbers.join(", ") || "—"}
                  </td>
                  {types.map((type) => (
                    <CountCells key={type} counts={row.workTypeCounts[type]} />
                  ))}
                  {showTotal && <CountCells counts={row.total} />}
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              <th>—</th>
              <th>—</th>
              <th>—</th>
              <th>—</th>
              {types.map((type) => (
                <CountCells
                  key={type}
                  counts={report.summaryTotals.workTypeCounts[type]}
                />
              ))}
              {showTotal && <CountCells counts={report.summaryTotals.total} />}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="performance-report-note">{report.notes.work}</p>
    </section>
  );
}

function WorkDetailsTable({
  rows,
  truncated,
}: {
  rows: PerformanceWorkDetailRow[];
  truncated: boolean;
}) {
  return (
    <section className="performance-report-card performance-report-card--details">
      <header className="performance-report-card__heading">
        <div>
          <span>Work details</span>
          <h2>Main ticket, work path and supporting staff</h2>
        </div>
        <strong className="performance-report-card__count">{rows.length} main tickets</strong>
      </header>
      {truncated && (
        <div className="performance-report-warning">
          This table is very large. Export the report for the full result.
        </div>
      )}
      <div
        className="performance-report-table-wrap"
        tabIndex={0}
        aria-label="Work details table. Scroll horizontally to see all columns."
      >
        <table className="performance-report-table performance-report-table--details">
          <thead>
            <tr>
              <th>S.N.</th>
              <th>Ticket Reference</th>
              <th>Work Title</th>
              <th>Work Type</th>
              <th>Assigned By</th>
              <th>Main Responsible Person</th>
              <th>Work Path</th>
              <th>Supporting Staff</th>
              <th>Service Numbers</th>
              <th>Department</th>
              <th>Division</th>
              <th>Planned Start</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Completed Date</th>
              <th>Pending Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="performance-report-empty-cell" colSpan={16}>
                  No work details were found for the selected report.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={row.id}>
                  <td className="performance-report-number">{index + 1}</td>
                  <td>{row.ticketNumber}</td>
                  <td className="performance-report-name"><strong>{row.title}</strong></td>
                  <td>{typeLabel(row.type)}</td>
                  <td>{row.assignedBy?.name ?? "—"}</td>
                  <td>{row.mainWorker?.name ?? "—"}</td>
                  <td className="performance-report-path">
                    {row.workAssignmentPaths.length > 0
                      ? row.workAssignmentPaths.map((path, pathIndex) => (
                          <span key={`${row.id}-path-${pathIndex}`}>
                            {path.map((person) => person.name).join(" → ")}
                          </span>
                        ))
                      : "—"}
                  </td>
                  <td className="performance-report-list-cell">
                    {row.supportingStaff.map((person) => person.name).join(", ") || "—"}
                  </td>
                  <td className="performance-report-list-cell">
                    {row.serviceNumbers.join(", ") || "—"}
                  </td>
                  <td>{row.department?.name ?? "—"}</td>
                  <td>{row.division.name}</td>
                  <td>{formatDateTime(row.plannedStartAt)}</td>
                  <td>{formatDateTime(row.dueAt)}</td>
                  <td>
                    <span className={`performance-report-status is-${row.status.toLowerCase()}`}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td>{formatDateTime(row.closedAt)}</td>
                  <td>{row.pendingReason ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DutySummaryTable({
  rows,
  note,
}: {
  rows: PerformanceDutySummaryRow[];
  note: string;
}) {
  return (
    <section className="performance-report-card performance-report-card--duty">
      <header className="performance-report-card__heading">
        <div>
          <span>Duty summary</span>
          <h2>Planned duty by employee</h2>
        </div>
        <strong className="performance-report-card__count">{rows.length} employees</strong>
      </header>
      <div
        className="performance-report-table-wrap"
        tabIndex={0}
        aria-label="Duty summary table. Scroll horizontally to see all columns."
      >
        <table className="performance-report-table performance-report-table--duty-summary">
          <thead>
            <tr>
              <th>S.N.</th>
              <th>Employee</th>
              <th>Employee ID</th>
              <th>Job Title</th>
              <th>Division</th>
              <th>Department</th>
              <th>Scheduled Days</th>
              <th>Duty Assignments</th>
              <th>Scheduled Hours</th>
              <th>Cancelled</th>
              <th>Leave Days</th>
              <th>Holiday Days</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.accountId}>
                <td className="performance-report-number">{index + 1}</td>
                <td className="performance-report-name"><strong>{row.employeeName}</strong></td>
                <td>{row.employeeId}</td>
                <td>{row.jobTitle ?? "—"}</td>
                <td>{row.division?.name ?? "—"}</td>
                <td>{row.department?.name ?? "—"}</td>
                <td className="performance-report-number">{showNumber(row.scheduledDays)}</td>
                <td className="performance-report-number">{showNumber(row.assignments)}</td>
                <td className="performance-report-number">{showNumber(row.scheduledHours)}</td>
                <td className="performance-report-number">{showNumber(row.cancelled)}</td>
                <td className="performance-report-number">{showNumber(row.leaveDays)}</td>
                <td className="performance-report-number">{showNumber(row.holidayDays)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="performance-report-note">{note}</p>
    </section>
  );
}

function DutyDetailsTable({
  rows,
  truncated,
  note,
}: {
  rows: PerformanceDutyDetailRow[];
  truncated: boolean;
  note: string;
}) {
  return (
    <section className="performance-report-card performance-report-card--duty">
      <header className="performance-report-card__heading">
        <div>
          <span>Duty details</span>
          <h2>Shift, place, supervisor and assigned by</h2>
        </div>
        <strong className="performance-report-card__count">{rows.length} duty records</strong>
      </header>
      {truncated && (
        <div className="performance-report-warning">
          This table is very large. Export the report for the full result.
        </div>
      )}
      <div
        className="performance-report-table-wrap"
        tabIndex={0}
        aria-label="Duty details table. Scroll horizontally to see all columns."
      >
        <table className="performance-report-table performance-report-table--duty-details">
          <thead>
            <tr>
              <th>S.N.</th>
              <th>Date</th>
              <th>Employee</th>
              <th>Employee ID</th>
              <th>Shift</th>
              <th>Time</th>
              <th>Location</th>
              <th>Supervisor</th>
              <th>Assigned By</th>
              <th>Division</th>
              <th>Department</th>
              <th>Leave / Holiday</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                <td className="performance-report-number">{index + 1}</td>
                <td>{formatDate(row.date)}</td>
                <td className="performance-report-name"><strong>{row.employee.name}</strong></td>
                <td>{row.employee.employeeId ?? "—"}</td>
                <td>{row.shift}</td>
                <td>{row.time}</td>
                <td>{row.location}</td>
                <td>{row.supervisor.name}</td>
                <td>{row.assignedBy.name}</td>
                <td>{row.division.name}</td>
                <td>{row.department?.name ?? "—"}</td>
                <td>{row.leaveOrHoliday ? statusLabel(row.leaveOrHoliday) : "—"}</td>
                <td>
                  <span className={`performance-report-status is-${row.status.toLowerCase()}`}>
                    {statusLabel(row.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="performance-report-note">{note}</p>
    </section>
  );
}


function hasReportCounts(counts: PerformanceReportCounts): boolean {
  return counts.assigned > 0 || counts.completed > 0 || counts.pending > 0;
}

function PrintableWorkSummary({ report }: { report: PerformanceReportResponse }) {
  const requestedTypes = selectedWorkTypes(report.filters.workType);
  const types =
    report.filters.workType === "ALL"
      ? requestedTypes.filter((type) =>
          hasReportCounts(report.summaryTotals.workTypeCounts[type]),
        )
      : requestedTypes;
  const printableTypes = types.length > 0 ? types : requestedTypes.slice(0, 1);

  return (
    <>
      {printableTypes.map((type, sectionIndex) => {
        // A wide all-work-types table is split into one readable table per work type for print/PDF.
        const rows =
          report.filters.workType === "ALL"
            ? report.summaryRows.filter((row) => hasReportCounts(row.workTypeCounts[type]))
            : report.summaryRows;
        const totals = report.summaryTotals.workTypeCounts[type];

        return (
          <section
            key={type}
            className={`performance-report-print-section${
              sectionIndex > 0 ? " has-page-break" : ""
            }`}
          >
            <header className="performance-report-print-heading">
              <div>
                <span>Work summary</span>
                <h2>{typeLabel(type)}</h2>
              </div>
              <strong>{rows.length} rows</strong>
            </header>
            <table className="performance-report-print-table performance-report-print-table--summary">
              <thead>
                <tr>
                  <th>S.N.</th>
                  <th>Date</th>
                  <th>{groupLabel(report.filters.groupBy)}</th>
                  <th>Supporting Staff</th>
                  <th>Service Numbers</th>
                  <th>Tickets</th>
                  <th>Completed</th>
                  <th>Pending</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="performance-report-empty-cell">
                      No work was found for this work type.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, index) => (
                    <tr key={`${type}-${row.id}`}>
                      <td className="performance-report-number">{index + 1}</td>
                      <td>{formatDate(row.date)}</td>
                      <td className="performance-report-name">
                        <strong>{row.name}</strong>
                        <span>{row.code ?? row.department?.name ?? row.division?.name ?? "—"}</span>
                      </td>
                      <td>{row.supportingStaff.map((person) => person.name).join(", ") || "—"}</td>
                      <td>{row.serviceNumbers.join(", ") || "—"}</td>
                      <CountCells counts={row.workTypeCounts[type]} />
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr>
                  <th>Total</th>
                  <th>—</th>
                  <th>—</th>
                  <th>—</th>
                  <th>—</th>
                  <CountCells counts={totals} />
                </tr>
              </tfoot>
            </table>
          </section>
        );
      })}
      <p className="performance-report-print-note">{report.notes.work}</p>
    </>
  );
}

function PrintableWorkDetails({ rows }: { rows: PerformanceWorkDetailRow[] }) {
  return (
    <>
      <section className="performance-report-print-section">
        <header className="performance-report-print-heading">
          <div>
            <span>Work details</span>
            <h2>Main work information</h2>
          </div>
          <strong>{rows.length} main tickets</strong>
        </header>
        <table className="performance-report-print-table performance-report-print-table--work-main">
          <thead>
            <tr>
              <th>S.N.</th>
              <th>Ticket Reference</th>
              <th>Work Title</th>
              <th>Work Type</th>
              <th>Assigned By</th>
              <th>Main Responsible Person</th>
              <th>Work Path</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="performance-report-empty-cell">No work details were found.</td></tr>
            ) : rows.map((row, index) => (
              <tr key={`print-main-${row.id}`}>
                <td className="performance-report-number">{index + 1}</td>
                <td>{row.ticketNumber}</td>
                <td>{row.title}</td>
                <td>{typeLabel(row.type)}</td>
                <td>{row.assignedBy?.name ?? "—"}</td>
                <td>{row.mainWorker?.name ?? "—"}</td>
                <td className="performance-report-path performance-report-path--print-main">
                  {row.workAssignmentPaths.length > 0
                    ? row.workAssignmentPaths.map((path, pathIndex) => (
                        <span
                          className="performance-report-path-group"
                          key={`${row.id}-print-main-path-${pathIndex}`}
                        >
                          {splitWorkPathForPrint(path).map((line, lineIndex) => (
                            <span
                              className="performance-report-path-line"
                              key={`${row.id}-print-main-path-${pathIndex}-${lineIndex}`}
                            >
                              {line}
                            </span>
                          ))}
                        </span>
                      ))
                    : "—"}
                </td>
                <td>{statusLabel(row.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="performance-report-print-section has-page-break">
        <header className="performance-report-print-heading">
          <div>
            <span>Work details</span>
            <h2>Supporting staff and service numbers</h2>
          </div>
        </header>
        <table className="performance-report-print-table performance-report-print-table--work-path">
          <thead>
            <tr>
              <th>S.N.</th>
              <th>Ticket Reference</th>
              <th>Supporting Staff</th>
              <th>Service Numbers</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="performance-report-empty-cell">No work details were found.</td></tr>
            ) : rows.map((row, index) => (
              <tr key={`print-path-${row.id}`}>
                <td className="performance-report-number">{index + 1}</td>
                <td>{row.ticketNumber}</td>
                <td>{row.supportingStaff.map((person) => person.name).join(", ") || "—"}</td>
                <td>{row.serviceNumbers.join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="performance-report-print-section has-page-break">
        <header className="performance-report-print-heading">
          <div>
            <span>Work details</span>
            <h2>Office, dates and pending reason</h2>
          </div>
        </header>
        <table className="performance-report-print-table performance-report-print-table--work-dates">
          <thead>
            <tr>
              <th>S.N.</th>
              <th>Ticket Reference</th>
              <th>Department</th>
              <th>Division</th>
              <th>Planned Start</th>
              <th>Due Date</th>
              <th>Completed Date</th>
              <th>Pending Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="performance-report-empty-cell">No work details were found.</td></tr>
            ) : rows.map((row, index) => (
              <tr key={`print-dates-${row.id}`}>
                <td className="performance-report-number">{index + 1}</td>
                <td>{row.ticketNumber}</td>
                <td>{row.department?.name ?? "—"}</td>
                <td>{row.division.name}</td>
                <td>{formatDateTime(row.plannedStartAt)}</td>
                <td>{formatDateTime(row.dueAt)}</td>
                <td>{formatDateTime(row.closedAt)}</td>
                <td>{row.pendingReason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function PrintableDutySummary({
  rows,
  note,
}: {
  rows: PerformanceDutySummaryRow[];
  note: string;
}) {
  return (
    <>
      <section className="performance-report-print-section">
        <header className="performance-report-print-heading">
          <div>
            <span>Duty summary</span>
            <h2>Employee and office information</h2>
          </div>
          <strong>{rows.length} employees</strong>
        </header>
        <table className="performance-report-print-table performance-report-print-table--duty-people">
          <thead>
            <tr>
              <th>S.N.</th>
              <th>Employee</th>
              <th>Employee ID</th>
              <th>Job Title</th>
              <th>Division</th>
              <th>Department</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="performance-report-empty-cell">No duty summary was found.</td></tr>
            ) : rows.map((row, index) => (
              <tr key={`print-duty-person-${row.accountId}`}>
                <td className="performance-report-number">{index + 1}</td>
                <td>{row.employeeName}</td>
                <td>{row.employeeId}</td>
                <td>{row.jobTitle ?? "—"}</td>
                <td>{row.division?.name ?? "—"}</td>
                <td>{row.department?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="performance-report-print-section has-page-break">
        <header className="performance-report-print-heading">
          <div>
            <span>Duty summary</span>
            <h2>Planned duty totals</h2>
          </div>
        </header>
        <table className="performance-report-print-table performance-report-print-table--duty-totals">
          <thead>
            <tr>
              <th>S.N.</th>
              <th>Employee</th>
              <th>Scheduled Days</th>
              <th>Duty Assignments</th>
              <th>Scheduled Hours</th>
              <th>Cancelled</th>
              <th>Leave Days</th>
              <th>Holiday Days</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="performance-report-empty-cell">No duty summary was found.</td></tr>
            ) : rows.map((row, index) => (
              <tr key={`print-duty-total-${row.accountId}`}>
                <td className="performance-report-number">{index + 1}</td>
                <td>{row.employeeName}</td>
                <td className="performance-report-number">{showNumber(row.scheduledDays)}</td>
                <td className="performance-report-number">{showNumber(row.assignments)}</td>
                <td className="performance-report-number">{showNumber(row.scheduledHours)}</td>
                <td className="performance-report-number">{showNumber(row.cancelled)}</td>
                <td className="performance-report-number">{showNumber(row.leaveDays)}</td>
                <td className="performance-report-number">{showNumber(row.holidayDays)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="performance-report-print-note">{note}</p>
    </>
  );
}

function PrintableDutyDetails({
  rows,
  note,
}: {
  rows: PerformanceDutyDetailRow[];
  note: string;
}) {
  return (
    <>
      <section className="performance-report-print-section">
        <header className="performance-report-print-heading">
          <div>
            <span>Duty details</span>
            <h2>Employee and shift</h2>
          </div>
          <strong>{rows.length} duty records</strong>
        </header>
        <table className="performance-report-print-table performance-report-print-table--duty-shift">
          <thead>
            <tr>
              <th>S.N.</th>
              <th>Date</th>
              <th>Employee</th>
              <th>Employee ID</th>
              <th>Shift</th>
              <th>Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="performance-report-empty-cell">No duty details were found.</td></tr>
            ) : rows.map((row, index) => (
              <tr key={`print-duty-shift-${row.id}`}>
                <td className="performance-report-number">{index + 1}</td>
                <td>{formatDate(row.date)}</td>
                <td>{row.employee.name}</td>
                <td>{row.employee.employeeId ?? "—"}</td>
                <td>{row.shift}</td>
                <td>{row.time}</td>
                <td>{statusLabel(row.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="performance-report-print-section has-page-break">
        <header className="performance-report-print-heading">
          <div>
            <span>Duty details</span>
            <h2>Place and responsibility</h2>
          </div>
        </header>
        <table className="performance-report-print-table performance-report-print-table--duty-place">
          <thead>
            <tr>
              <th>S.N.</th>
              <th>Date</th>
              <th>Employee</th>
              <th>Location</th>
              <th>Supervisor</th>
              <th>Assigned By</th>
              <th>Division</th>
              <th>Department</th>
              <th>Leave / Holiday</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="performance-report-empty-cell">No duty details were found.</td></tr>
            ) : rows.map((row, index) => (
              <tr key={`print-duty-place-${row.id}`}>
                <td className="performance-report-number">{index + 1}</td>
                <td>{formatDate(row.date)}</td>
                <td>{row.employee.name}</td>
                <td>{row.location}</td>
                <td>{row.supervisor.name}</td>
                <td>{row.assignedBy.name}</td>
                <td>{row.division.name}</td>
                <td>{row.department?.name ?? "—"}</td>
                <td>{row.leaveOrHoliday ? statusLabel(row.leaveOrHoliday) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="performance-report-print-note">{note}</p>
    </>
  );
}

export function WorkReportsPage() {
  const { account, accessToken } = useAuth();
  const today = useMemo(() => toDateInput(new Date()), []);
  const [view, setView] = useState<ReportView>("WORK_SUMMARY");
  const [dutyView, setDutyView] = useState<DutyView>("DUTY_SUMMARY");
  const [periodChoice, setPeriodChoice] = useState<PeriodChoice>("TODAY");
  const [report, setReport] = useState<PerformanceReportResponse | null>(null);
  const [draft, setDraft] = useState<PerformanceReportQuery>({
    from: today,
    to: today,
    groupBy: "EMPLOYEE",
    staffMode: "WITH_WORK",
    workType: "ALL",
    search: "",
  });
  const [applied, setApplied] = useState<PerformanceReportQuery>(draft);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadReport = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    try {
      setReport(await getPerformanceReport(accessToken, applied));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [accessToken, applied]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const visibleDepartments = useMemo(() => {
    if (!report) return [];
    if (!draft.divisionId) return report.departmentOptions;
    return report.departmentOptions.filter(
      (department) => department.divisionId === draft.divisionId,
    );
  }, [draft.divisionId, report]);

  const changePeriod = (choice: PeriodChoice) => {
    setPeriodChoice(choice);
    if (choice === "CUSTOM") return;
    setDraft((current) => ({ ...current, ...periodDates(choice) }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setNotice("");
    setApplied({
      ...draft,
      from: draft.from || today,
      to: draft.to || draft.from || today,
      divisionId: draft.divisionId || undefined,
      departmentId: draft.departmentId || undefined,
      workType: draft.workType ?? "ALL",
      search: draft.search?.trim() || undefined,
    });
  };

  const exportCurrent = async () => {
    if (!accessToken || !report) return;
    setExporting(true);
    setError("");
    setNotice("");
    try {
      const result = await downloadPerformanceReportCsv(
        accessToken,
        activeExportSection(view, dutyView),
        applied,
      );
      setNotice(`${result.filename} downloaded successfully.`);
    } catch (exportError) {
      setError(getErrorMessage(exportError));
    } finally {
      setExporting(false);
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
  const showDepartmentFilter = account?.role !== "TEAM_MANAGER";
  const canGroupByDivision = account?.role !== "TEAM_MANAGER";

  return (
    <main className="performance-report-page">
      <div className="performance-report-page__canvas" aria-busy={loading}>
        <header className="performance-report-hero">
          <div>
            <span>Work Management</span>
            <h1>{scopeTitle(account?.role)}</h1>
            <p>Clear work and duty tables for the selected period.</p>
          </div>
          <div className="performance-report-hero__actions">
            <Link className="performance-report-action performance-report-action--back" to="/work-management">
              Back to Work Management
            </Link>
            <button
              className="performance-report-action performance-report-action--primary"
              type="button"
              onClick={exportCurrent}
              disabled={!report || exporting}
            >
              {exporting ? "Preparing…" : "Export Excel"}
            </button>
            <button
              className="performance-report-action"
              type="button"
              onClick={() => window.print()}
              disabled={!report}
            >
              Print / PDF
            </button>
          </div>
        </header>

        {error && <section className="performance-report-message is-error" role="alert">{error}</section>}
        {notice && <section className="performance-report-message is-success" role="status">{notice}</section>}

        <nav className="performance-report-tabs" aria-label="Report sections">
          <button type="button" className={view === "WORK_SUMMARY" ? "is-active" : ""} onClick={() => setView("WORK_SUMMARY")}>Work Summary</button>
          <button type="button" className={view === "WORK_DETAILS" ? "is-active" : ""} onClick={() => setView("WORK_DETAILS")}>Work Details</button>
          <button type="button" className={view === "DUTY_REPORT" ? "is-active" : ""} onClick={() => setView("DUTY_REPORT")}>Duty Report</button>
        </nav>

        <form className="performance-report-controls" onSubmit={submit}>
          <div className="performance-report-controls__heading">
            <div>
              <span>Report options</span>
              <h2>Choose the period and report details</h2>
            </div>
            <p>Change the options below, then generate the report.</p>
          </div>

          <div className="performance-report-periods" aria-label="Report period">
            <span>Report period</span>
            {([
              ["TODAY", "Today"],
              ["WEEK", "This Week"],
              ["MONTH", "This Month"],
              ["CUSTOM", "Custom"],
            ] as Array<[PeriodChoice, string]>).map(([choice, label]) => (
              <button key={choice} type="button" className={periodChoice === choice ? "is-active" : ""} onClick={() => changePeriod(choice)}>{label}</button>
            ))}
          </div>

          <div className="performance-report-controls__grid">
            <label>
              <span>From date</span>
              <input type="date" value={draft.from ?? today} onChange={(event: ChangeEvent<HTMLInputElement>) => { setPeriodChoice("CUSTOM"); setDraft({ ...draft, from: event.target.value }); }} required />
            </label>
            <label>
              <span>To date</span>
              <input type="date" value={draft.to ?? today} onChange={(event: ChangeEvent<HTMLInputElement>) => { setPeriodChoice("CUSTOM"); setDraft({ ...draft, to: event.target.value }); }} required />
            </label>
            {showDivisionFilter && (
              <label>
                <span>Division</span>
                <select value={draft.divisionId ?? ""} onChange={(event: ChangeEvent<HTMLSelectElement>) => setDraft({ ...draft, divisionId: event.target.value, departmentId: "" })}>
                  <option value="">All divisions</option>
                  {report?.divisionOptions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
                </select>
              </label>
            )}
            {showDepartmentFilter && (
              <label>
                <span>Department</span>
                <select value={draft.departmentId ?? ""} onChange={(event: ChangeEvent<HTMLSelectElement>) => setDraft({ ...draft, departmentId: event.target.value })}>
                  <option value="">All departments</option>
                  {visibleDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
              </label>
            )}
            <label>
              <span>Show by</span>
              <select value={draft.groupBy ?? "EMPLOYEE"} onChange={(event: ChangeEvent<HTMLSelectElement>) => setDraft({ ...draft, groupBy: event.target.value as PerformanceReportGroup })}>
                <option value="EMPLOYEE">Employee</option>
                <option value="DEPARTMENT">Department</option>
                {canGroupByDivision && <option value="DIVISION">Division</option>}
              </select>
            </label>
            {view !== "DUTY_REPORT" && (
              <label>
                <span>Work type</span>
                <select value={draft.workType ?? "ALL"} onChange={(event: ChangeEvent<HTMLSelectElement>) => setDraft({ ...draft, workType: event.target.value as PerformanceReportWorkType })}>
                  <option value="ALL">All work types</option>
                  {WORK_TYPES.map((type) => <option key={type} value={type}>{typeLabel(type)}</option>)}
                </select>
              </label>
            )}
            <label>
              <span>Staff</span>
              <select value={draft.staffMode ?? "WITH_WORK"} onChange={(event: ChangeEvent<HTMLSelectElement>) => setDraft({ ...draft, staffMode: event.target.value as "WITH_WORK" | "ALL" })}>
                <option value="WITH_WORK">Staff with work</option>
                <option value="ALL">All staff</option>
              </select>
            </label>
            <label className="performance-report-controls__search">
              <span>Find staff or work</span>
              <input type="search" placeholder="Name, employee ID, service number or ticket" value={draft.search ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, search: event.target.value })} />
            </label>
            <button className="performance-report-controls__generate" type="submit" disabled={loading}>
              {loading ? "Generating…" : "Generate Report"}
            </button>
          </div>
        </form>

        <section className="performance-report-meta" aria-label="Current report information">
          <div className="performance-report-meta__item performance-report-meta__item--period">
            <span>Report period</span>
            <strong>{report ? `${formatDate(report.period.from)} – ${formatDate(report.period.to)}` : "—"}</strong>
          </div>
          <div className="performance-report-meta__item performance-report-meta__item--scope">
            <span>Report for</span>
            <strong>{report?.scope.label ?? "Loading…"}</strong>
          </div>
          <div className="performance-report-meta__item performance-report-meta__item--rows">
            <span>Rows shown</span>
            <strong>{report?.summaryRows.length ?? "—"}</strong>
          </div>
          <div className="performance-report-meta__item performance-report-meta__item--time">
            <span>Generated</span>
            <strong>{formatDateTime(report?.generatedAt ?? null)}</strong>
          </div>
        </section>

        {view === "DUTY_REPORT" && (
          <div className="performance-report-subtabs">
            <button type="button" className={dutyView === "DUTY_SUMMARY" ? "is-active" : ""} onClick={() => setDutyView("DUTY_SUMMARY")}>Duty Summary</button>
            <button type="button" className={dutyView === "DUTY_DETAILS" ? "is-active" : ""} onClick={() => setDutyView("DUTY_DETAILS")}>Duty Details</button>
          </div>
        )}

        {loading && report && (
          <div className="performance-report-loading-bar" role="status">
            Updating report…
          </div>
        )}
        {loading && !report && (
          <section className="performance-report-state performance-report-state--loading">
            <span className="performance-report-spinner" aria-hidden="true" />
            <strong>Preparing the report…</strong>
            <p>Please wait while the latest records are collected.</p>
          </section>
        )}
        {report && view === "WORK_SUMMARY" && (
          <>
            <div className="performance-report-screen-only">
              <WorkSummaryTable report={report} />
            </div>
            <div className="performance-report-print-only">
              <PrintableWorkSummary report={report} />
            </div>
          </>
        )}
        {report && view === "WORK_DETAILS" && (
          <>
            <div className="performance-report-screen-only">
              <WorkDetailsTable rows={report.workDetails} truncated={report.truncated.workDetails} />
            </div>
            <div className="performance-report-print-only">
              <PrintableWorkDetails rows={report.workDetails} />
            </div>
          </>
        )}
        {report && view === "DUTY_REPORT" && dutyView === "DUTY_SUMMARY" && (
          <>
            <div className="performance-report-screen-only">
              <DutySummaryTable rows={report.dutySummary} note={report.notes.duty} />
            </div>
            <div className="performance-report-print-only">
              <PrintableDutySummary rows={report.dutySummary} note={report.notes.duty} />
            </div>
          </>
        )}
        {report && view === "DUTY_REPORT" && dutyView === "DUTY_DETAILS" && (
          <>
            <div className="performance-report-screen-only">
              <DutyDetailsTable rows={report.dutyDetails} truncated={report.truncated.dutyDetails} note={report.notes.duty} />
            </div>
            <div className="performance-report-print-only">
              <PrintableDutyDetails rows={report.dutyDetails} note={report.notes.duty} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
