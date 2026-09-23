import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import { useAuth } from "../context/AuthContext";
import { getOrganizationOffices } from "../services/organization-v3.service";
import { listWorkItems } from "../services/work-management.service";
import type { WorkItemStatus, WorkItemSummary } from "../types/work-management";
import { formatWorkDateTime } from "../utils/work-calendar";

const STATUS_OPTIONS: Array<{ value: WorkItemStatus | ""; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "ACKNOWLEDGED", label: "Acknowledged" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "HELP_REQUESTED", label: "Help requested" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "COMPLETED_PENDING_REVIEW", label: "Pending review" },
  { value: "REOPENED", label: "Reopened" },
  { value: "CLOSED", label: "Closed" },
  { value: "CANCELLED", label: "Cancelled" },
];

function statusLabel(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function personName(item: WorkItemSummary): string {
  const primary = item.assignments.find(
    (assignment) => assignment.assignmentRole === "PRIMARY",
  );
  return (
    primary?.assignee.employee?.empName ??
    primary?.assignee.username ??
    "Unclaimed"
  );
}

export function WorkPage() {
  const { accessToken, account } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [officeId, setOfficeId] = useState("");
  const [items, setItems] = useState<WorkItemSummary[]>([]);

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<WorkItemStatus | "">("");
  const [view, setView] = useState<"ACTIVE" | "HISTORY">(
    pathname === "/work" ? "ACTIVE" : "ACTIVE",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isMyWork = pathname === "/my-work";
  const isOversight = pathname === "/work-oversight";
  const detailSource = isMyWork
    ? "my-work"
    : isOversight
      ? "oversight"
      : "work";

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    getOrganizationOffices(accessToken)
      .then((response) => {
        if (!active) return;
        const office =
          response.data.find((candidate) => candidate.isActive) ??
          response.data[0];
        setOfficeId(office?.id ?? "");
      })
      .catch((requestError: unknown) => {
        if (active)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Office could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !officeId) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      listWorkItems(accessToken, {
        view,
        search: search.trim() || undefined,
        status: status || undefined,
        assigneeAccountId: isMyWork ? account?.id : undefined,
        limit: 50,
      })
        .then((response) => {
          if (active)
            setItems(
              response.data.filter((item) => item.officeId === officeId),
            );
        })
        .catch((requestError: unknown) => {
          if (active)
            setError(
              requestError instanceof Error
                ? requestError.message
                : "Work could not be loaded.",
            );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [accessToken, account?.id, isMyWork, officeId, search, status, view]);

  const summary = useMemo(
    () => ({
      total: items.length,
      pendingReview: items.filter(
        (item) => item.status === "COMPLETED_PENDING_REVIEW",
      ).length,
      overdue: items.filter(
        (item) =>
          !["CLOSED", "CANCELLED"].includes(item.status) &&
          new Date(item.dueAt).getTime() < nowMs,
      ).length,
    }),
    [items, nowMs],
  );

  return (
    <main
      className={`workspace-page work-management-page${isOversight ? " work-oversight-page" : ""}`}
    >
      <header className="workspace-page__header">
        <div>
          <p className="workspace-page__eyebrow">Work Management</p>
          <h1>
            {isMyWork
              ? "My Work"
              : isOversight
                ? "Work Oversight"
                : "Work Management"}
          </h1>
          <p>
            Classic Work lifecycle on the current Office, OrgUnit and Main Team
            hierarchy.
          </p>
        </div>
        {isOversight ? (
          <div
            className="work-oversight-readonly"
            aria-label="Read-only oversight"
          >
            <span
              className="work-oversight-readonly__signal"
              aria-hidden="true"
            />
            <div>
              <strong>Read-only oversight</strong>
              <span>Operational visibility without Work mutation</span>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="primary-button"
            onClick={() => navigate("/work/create")}
          >
            Create Work
          </button>
        )}
      </header>

      <section className="work-summary-grid" aria-label="Work summary">
        <article className="work-summary-card work-summary-card--visible">
          {isOversight && (
            <span className="work-summary-card__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M4 7.5h16v11H4z" />
                <path d="M8 7.5V5.75A1.75 1.75 0 0 1 9.75 4h4.5A1.75 1.75 0 0 1 16 5.75V7.5" />
                <path d="M4 12h16" />
              </svg>
            </span>
          )}
          <div>
            <strong>{summary.total}</strong>
            <span>Visible Work</span>
            {isOversight && <small>Current Office scope</small>}
          </div>
        </article>
        <article className="work-summary-card work-summary-card--review">
          {isOversight && (
            <span className="work-summary-card__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M6 4h12v16H6z" />
                <path d="M9 8h6M9 12h6" />
                <path d="m9.5 16 1.5 1.5 3.5-3.5" />
              </svg>
            </span>
          )}
          <div>
            <strong>{summary.pendingReview}</strong>
            <span>Pending review</span>
            {isOversight && <small>Awaiting reviewer action</small>}
          </div>
        </article>
        <article className="work-summary-card work-summary-card--overdue">
          {isOversight && (
            <span className="work-summary-card__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8" />
                <path d="M12 8v4l2.5 1.5" />
              </svg>
            </span>
          )}
          <div>
            <strong>{summary.overdue}</strong>
            <span>Overdue</span>
            {isOversight && <small>Past the committed due time</small>}
          </div>
        </article>
      </section>

      <section className="workspace-card">
        <div className="work-filter-row">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search ticket, title or customer"
            aria-label="Search Work"
          />
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as WorkItemStatus | "")
            }
            aria-label="Filter Work status"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="segmented-control" aria-label="Work history view">
            <button
              type="button"
              className={view === "ACTIVE" ? "is-active" : ""}
              onClick={() => setView("ACTIVE")}
            >
              Active
            </button>
            <button
              type="button"
              className={view === "HISTORY" ? "is-active" : ""}
              onClick={() => setView("HISTORY")}
            >
              History
            </button>
          </div>
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p className="workspace-empty-state">Loading Work…</p>
        ) : items.length === 0 ? (
          <p className="workspace-empty-state">
            No Work matches the current filters.
          </p>
        ) : (
          <div className="work-list-grid">
            {items.map((item) => {
              const isOverdue =
                !["CLOSED", "CANCELLED"].includes(item.status) &&
                new Date(item.dueAt).getTime() < nowMs;

              return (
                <Link
                key={item.id}
                to={`/work/${item.officeId}/${item.id}?source=${detailSource}`}
                className={`work-list-card${isOverdue ? " is-overdue" : ""}`}
              >
                <div className="work-list-card__topline">
                  <span>{item.ticketNumber}</span>
                  <span
                    className={`work-status-badge work-status-badge--${item.status.toLowerCase()}`}
                  >
                    {statusLabel(item.status)}
                  </span>
                </div>
                <h2>{item.title}</h2>
                <p>
                  {item.workTypeVersion.name} · {item.primaryOwnerOrgUnit.name}
                </p>
                <dl>
                  <div>
                    <dt>Main Team</dt>
                    <dd>
                      {item.assignedOperationalTeam?.name ?? "Individual"}
                    </dd>
                  </div>
                  <div>
                    <dt>Current owner</dt>
                    <dd>{personName(item)}</dd>
                  </div>
                  <div>
                    <dt>Reviewer</dt>
                    <dd>
                      {item.responsibleReviewer.employee?.empName ??
                        item.responsibleReviewer.username ??
                        "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Due</dt>
                    <dd>{formatWorkDateTime(item.dueAt, "en", "—")}</dd>
                  </div>
                </dl>
                {isOversight && (
                  <span className="work-list-card__open" aria-hidden="true">
                    View work
                    <svg viewBox="0 0 24 24">
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </span>
                )}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
