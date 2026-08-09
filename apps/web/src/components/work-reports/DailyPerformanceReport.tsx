import { useEffect, useRef, useState } from "react";

import type {
  DailyWorkPerformanceReport,
  DailyWorkPerformanceRow,
  DailyWorkPerformanceTicket,
  WorkItemStatus,
  WorkItemType,
} from "../../types/work-management";

function formatLabel(value: string): string {
  if (value === "MAINTENANCE") return "Network maintenance";
  if (value === "NEW_CONNECTION") return "New Installation";
  if (value === "UPDATE_SERVICES") return "Update services";

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusTone(status: WorkItemStatus): string {
  if (status === "CLOSED") return "success";
  if (status === "CANCELLED") return "danger";
  if (status === "HELP_REQUESTED" || status === "BLOCKED") return "warning";
  if (status === "COMPLETED_PENDING_REVIEW") return "review";
  return "active";
}

function typeClass(type: WorkItemType): string {
  if (type === "MAINTENANCE") return "maintenance";
  if (type === "NEW_CONNECTION") return "installation";
  if (type === "UPDATE_SERVICES") return "update";
  return "other";
}

function CountCell({ value }: { value: number }) {
  return <td className={value > 0 ? "daily-report-table__number daily-report-table__number--active" : "daily-report-table__number"}>{value}</td>;
}

interface EmployeeDetailsProps {
  row: DailyWorkPerformanceRow;
  onClose: () => void;
}

function EmployeeDetails({ row, onClose }: EmployeeDetailsProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="daily-report-drawer" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className="daily-report-drawer__panel" role="dialog" aria-modal="true" aria-labelledby="daily-report-drawer-title">
        <header className="daily-report-drawer__header">
          <div>
            <span>Daily work details</span>
            <h2 id="daily-report-drawer-title">{row.employeeName}</h2>
            <p>{row.employeeId}{row.designation ? ` · ${row.designation}` : ""}</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close employee work details">×</button>
        </header>

        <div className="daily-report-drawer__summary" aria-label="Employee daily totals">
          <div><span>Assigned</span><strong>{row.total.assigned}</strong></div>
          <div><span>Completed</span><strong>{row.total.completed}</strong></div>
          <div><span>Pending</span><strong>{row.total.pending}</strong></div>
        </div>

        {row.pendingReasons.length > 0 && (
          <section className="daily-report-drawer__pending">
            <strong>Pending reasons</strong>
            <p>{row.pendingReasons.join(" · ")}</p>
          </section>
        )}

        <div className="daily-report-drawer__tickets">
          {row.workItems.map((ticket: DailyWorkPerformanceTicket) => (
            <article key={ticket.id} className={`daily-report-ticket daily-report-ticket--${typeClass(ticket.type)}`}>
              <header>
                <div>
                  <span>{ticket.ticketNumber}</span>
                  <h3>{ticket.title}</h3>
                </div>
                <span className={`daily-report-status daily-report-status--${statusTone(ticket.status)}`}>{formatLabel(ticket.status)}</span>
              </header>
              <dl>
                <div><dt>Work type</dt><dd>{formatLabel(ticket.type)}</dd></div>
                <div><dt>Planned start</dt><dd>{formatDateTime(ticket.plannedStartAt)}</dd></div>
                <div><dt>Due</dt><dd>{formatDateTime(ticket.dueAt)}</dd></div>
                <div><dt>Closed</dt><dd>{formatDateTime(ticket.closedAt)}</dd></div>
                {ticket.customerName && <div><dt>Customer</dt><dd>{ticket.customerName}</dd></div>}
                {ticket.serviceNumber && <div><dt>Service number</dt><dd>{ticket.serviceNumber}</dd></div>}
                {ticket.location && <div><dt>Location</dt><dd>{ticket.location}</dd></div>}
              </dl>
              {ticket.pendingReason && <p className="daily-report-ticket__reason"><strong>Pending:</strong> {ticket.pendingReason}</p>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

interface DailyPerformanceReportProps {
  report: DailyWorkPerformanceReport;
}

export function DailyPerformanceReport({ report }: DailyPerformanceReportProps) {
  const [selectedRow, setSelectedRow] = useState<DailyWorkPerformanceRow | null>(null);
  const showDivision = report.scope.role === "SUPER_ADMIN";
  const showDepartment = report.scope.role !== "TEAM_MANAGER";
  const identityColumns = 3 + Number(showDivision) + Number(showDepartment);

  if (report.rows.length === 0) {
    return (
      <section className="daily-report-empty">
        <div aria-hidden="true">✓</div>
        <h2>No employee work recorded</h2>
        <p>No assigned or completed work was found for the selected date and scope.</p>
      </section>
    );
  }

  return (
    <>
      <section className="daily-report-table-card" aria-label="Daily employee performance report">
        <div className="daily-report-table-card__heading">
          <div>
            <span>Employee performance</span>
            <h2>Work assigned, completed and pending</h2>
          </div>
          <div className="daily-report-table-card__totals">
            <span>{report.totals.employees} employees</span>
            <strong>{report.totals.total.assigned} assigned · {report.totals.total.completed} completed · {report.totals.total.pending} pending</strong>
          </div>
        </div>

        <div className="daily-report-table-wrap">
          <table className="daily-report-table">
            <thead>
              <tr>
                <th rowSpan={2}>S.N.</th>
                {showDivision && <th rowSpan={2}>Division</th>}
                {showDepartment && <th rowSpan={2}>Department</th>}
                <th rowSpan={2}>Employee / Team</th>
                <th rowSpan={2}>Employee ID</th>
                <th colSpan={3} className="daily-report-table__group daily-report-table__group--maintenance">Network Maintenance</th>
                <th colSpan={2} className="daily-report-table__group daily-report-table__group--installation">New Installation</th>
                <th colSpan={2} className="daily-report-table__group daily-report-table__group--update">Update Services</th>
                <th colSpan={2} className="daily-report-table__group daily-report-table__group--other">Other Work</th>
                <th colSpan={3} className="daily-report-table__group daily-report-table__group--total">Daily Total</th>
                <th rowSpan={2}>Pending reason</th>
              </tr>
              <tr>
                <th>Assigned</th><th>Completed</th><th>Pending</th>
                <th>Assigned</th><th>Completed</th>
                <th>Assigned</th><th>Completed</th>
                <th>Assigned</th><th>Completed</th>
                <th>Assigned</th><th>Completed</th><th>Pending</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row, index) => (
                <tr
                  key={row.accountId}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open daily work details for ${row.employeeName}`}
                  onClick={() => setSelectedRow(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedRow(row);
                    }
                  }}
                >
                  <td className="daily-report-table__serial">{index + 1}</td>
                  {showDivision && <td>{row.division?.name ?? "—"}</td>}
                  {showDepartment && <td>{row.department?.name ?? "—"}</td>}
                  <td className="daily-report-table__employee">
                    <strong>{row.employeeName}</strong>
                    <span>{row.designation ?? formatLabel(row.role)}</span>
                  </td>
                  <td>{row.employeeId}</td>
                  <CountCell value={row.networkMaintenance.assigned} />
                  <CountCell value={row.networkMaintenance.completed} />
                  <CountCell value={row.networkMaintenance.pending} />
                  <CountCell value={row.newInstallation.assigned} />
                  <CountCell value={row.newInstallation.completed} />
                  <CountCell value={row.updateServices.assigned} />
                  <CountCell value={row.updateServices.completed} />
                  <CountCell value={row.otherWork.assigned} />
                  <CountCell value={row.otherWork.completed} />
                  <CountCell value={row.total.assigned} />
                  <CountCell value={row.total.completed} />
                  <CountCell value={row.total.pending} />
                  <td className="daily-report-table__reason">{row.pendingReasons.length > 0 ? row.pendingReasons.join(" · ") : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={identityColumns}>Total</th>
                <CountCell value={report.totals.networkMaintenance.assigned} />
                <CountCell value={report.totals.networkMaintenance.completed} />
                <CountCell value={report.totals.networkMaintenance.pending} />
                <CountCell value={report.totals.newInstallation.assigned} />
                <CountCell value={report.totals.newInstallation.completed} />
                <CountCell value={report.totals.updateServices.assigned} />
                <CountCell value={report.totals.updateServices.completed} />
                <CountCell value={report.totals.otherWork.assigned} />
                <CountCell value={report.totals.otherWork.completed} />
                <CountCell value={report.totals.total.assigned} />
                <CountCell value={report.totals.total.completed} />
                <CountCell value={report.totals.total.pending} />
                <td>—</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="daily-report-table-card__note">{report.note} Select any employee row to view the related work records.</p>
      </section>

      {selectedRow && <EmployeeDetails row={selectedRow} onClose={() => setSelectedRow(null)} />}
    </>
  );
}
