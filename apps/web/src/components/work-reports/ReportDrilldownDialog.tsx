import { useEffect, useRef } from "react";

import type {
  WorkReportDrilldownDutyRow,
  WorkReportDrilldownResponse,
  WorkReportDrilldownWorkRow,
} from "../../types/work-management";

function formatLabel(value: string): string {
  if (value === "MAINTENANCE") return "Network maintenance";
  if (value === "NEW_CONNECTION") return "New Installation";

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kathmandu",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function WorkRows({ rows }: { rows: WorkReportDrilldownWorkRow[] }) {
  return (
    <div className="work-report-e__drill-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Responsibility</th>
            <th>Status</th>
            <th>Due</th>
            <th>Delegation</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.ticketNumber}</strong>
                <span>{row.title}</span>
                <small>{formatLabel(row.type)} · {formatLabel(row.priority)}</small>
              </td>
              <td>
                <strong>{row.primaryAssignee}</strong>
                <span>Assigned by {row.assignedBy}</span>
                <small>{row.department?.name ?? row.division.name}</small>
              </td>
              <td>
                <span className={`work-report-e__status work-report-e__status--${row.status.toLowerCase()}`}>
                  {formatLabel(row.status)}
                </span>
                {row.overdueDays > 0 && <small>{row.overdueDays} day(s) overdue</small>}
              </td>
              <td>
                <strong>{formatDateTime(row.dueAt)}</strong>
                <small>{row.location ?? "No location recorded"}</small>
              </td>
              <td>
                {row.childProgress.total > 0 ? (
                  <>
                    <strong>{row.childProgress.completed}/{row.childProgress.total} completed</strong>
                    <span>{row.childProgress.inProgress} in progress</span>
                    <small>{row.childProgress.percentage ?? 0}% overall</small>
                  </>
                ) : (
                  <span>No linked child work</span>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5}>No matching work records are available.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function DutyRows({ rows }: { rows: WorkReportDrilldownDutyRow[] }) {
  return (
    <div className="work-report-e__drill-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Duty</th>
            <th>Employee</th>
            <th>Governance</th>
            <th>Location</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.shift}</strong>
                <span>{formatDateTime(row.startsAt)}</span>
                <small>to {formatDateTime(row.endsAt)}</small>
              </td>
              <td>
                <strong>{row.employee}</strong>
                <span>{formatLabel(row.employeeRole)}</span>
                <small>Supervisor: {row.supervisor}</small>
              </td>
              <td>
                <strong>{formatLabel(row.authority)}</strong>
                <span>Assigned by {row.assignedBy}</span>
                {(row.hierarchyOverride || row.conflictOverride) && (
                  <small>{row.overrideReason ?? "Audited override"}</small>
                )}
              </td>
              <td>
                <strong>{row.reportingLocation}</strong>
                <small>{row.department?.name ?? row.division.name}</small>
              </td>
              <td>
                <span className={`work-report-e__status ${row.cancelledAt ? "work-report-e__status--cancelled" : "work-report-e__status--closed"}`}>
                  {row.cancelledAt ? "Cancelled" : "Scheduled"}
                </span>
                {row.cancellationReason && <small>{row.cancellationReason}</small>}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5}>No matching duty records are available.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Pager({
  page,
  totalPages,
  hasPrevious,
  hasNext,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="work-report-e__pager">
      <button type="button" disabled={!hasPrevious} onClick={() => onPageChange(page - 1)}>Previous</button>
      <span>Page {page} of {Math.max(1, totalPages)}</span>
      <button type="button" disabled={!hasNext} onClick={() => onPageChange(page + 1)}>Next</button>
    </div>
  );
}

export function ReportDrilldownDialog({
  open,
  loading,
  error,
  report,
  onClose,
  onPageChange,
}: {
  open: boolean;
  loading: boolean;
  error: string;
  report: WorkReportDrilldownResponse | null;
  onClose: () => void;
  onPageChange: (section: "work" | "duty", page: number) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      // Keep keyboard focus inside the modal so protected report details cannot be tabbed behind the overlay.
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        closeButtonRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="work-report-e__dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={dialogRef} className="work-report-e__dialog" role="dialog" aria-modal="true" aria-labelledby="report-drilldown-title">
        <header>
          <div>
            <span>Protected drill-down</span>
            <h2 id="report-drilldown-title">
              {report?.target?.name ?? (report ? formatLabel(report.dataset) : "Loading details")}
            </h2>
            <p>{report?.notice ?? "Loading paginated records inside your authorized scope."}</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close report details">×</button>
        </header>

        {loading && <div className="work-report-e__dialog-state">Loading authorized details…</div>}
        {error && <div className="work-report-e__dialog-state work-report-e__dialog-state--error" role="alert">{error}</div>}

        {report && !loading && (
          <div className="work-report-e__dialog-body">
            <section className="work-report-e__drill-summary">
              <article><span>Created work</span><strong>{report.summary.work.created}</strong></article>
              <article><span>Active work</span><strong>{report.summary.work.activeAtEnd}</strong></article>
              <article><span>Overdue</span><strong>{report.summary.work.overdueAtEnd}</strong></article>
              <article><span>Planned duty</span><strong>{report.summary.duty.scheduled}</strong></article>
            </section>

            {report.sections.work && (
              <section className="work-report-e__drill-section">
                <header><div><span>Work records</span><h3>Operational work details</h3></div></header>
                <WorkRows rows={report.sections.work.rows} />
                <Pager {...report.sections.work.pagination} onPageChange={(page) => onPageChange("work", page)} />
              </section>
            )}

            {report.sections.duty && (
              <section className="work-report-e__drill-section">
                <header><div><span>Planned duty</span><h3>Duty schedule details</h3></div></header>
                <DutyRows rows={report.sections.duty.rows} />
                <Pager {...report.sections.duty.pagination} onPageChange={(page) => onPageChange("duty", page)} />
              </section>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
