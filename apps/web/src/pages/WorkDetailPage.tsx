import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";

import { useAuth } from "../context/AuthContext";
import {
  acknowledgeWork,
  approveWorkCompletion,
  cancelWork,
  completeSalesWork,
  getWorkItem,
  reopenWork,
  requestWorkCorrection,
  sendWorkToSales,
  startWork,
  submitWorkCompletion,
} from "../services/work-management.service";
import {
  WORK_REALTIME_EVENT,
  WORK_REALTIME_RECONCILE_EVENT,
} from "../services/work-realtime.service";
import type { WorkItemDetail } from "../types/work-management";
import { formatWorkDateTime } from "../utils/work-calendar";

function statusLabel(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function accountName(account: WorkItemDetail["createdBy"] | null | undefined): string {
  return account?.employee?.empName ?? account?.username ?? "—";
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function WorkDetailPage() {
  const { accessToken, account } = useAuth();
  const { workItemId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [work, setWork] = useState<WorkItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [note, setNote] = useState("");
  const [completionResult, setCompletionResult] = useState("FULLY_RESOLVED");

  const source = searchParams.get("source");
  const backPath = source === "my-work" ? "/my-work" : source === "oversight" ? "/work-oversight" : "/work";
  const isReviewer = Boolean(work && account?.id === work.responsibleReviewerAccountId);
  const isSalesMember = Boolean(work && account?.id === work.salesMemberAccountId);
  const primaryAssignment = useMemo(
    () => work?.assignments.find((assignment) => assignment.assignmentRole === "PRIMARY") ?? null,
    [work],
  );
  const isPrimary = Boolean(primaryAssignment && primaryAssignment.assignee.id === account?.id);

  async function load(): Promise<void> {
    if (!accessToken || !workItemId) return;
    const response = await getWorkItem(accessToken, workItemId);
    setWork(response);
  }

  useEffect(() => {
    if (!accessToken || !workItemId) return;
    let active = true;
    getWorkItem(accessToken, workItemId)
      .then((response) => {
        if (!active) return;
        setError("");
        setWork(response);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Work could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, workItemId]);

  useEffect(() => {
    if (!accessToken || !workItemId) return;

    const refreshVisibleWork = (event: Event): void => {
      if (event.type === WORK_REALTIME_EVENT) {
        const payload = (event as CustomEvent).detail as { workItemId?: string } | undefined;
        if (payload?.workItemId && payload.workItemId !== workItemId) return;
      }
      void getWorkItem(accessToken, workItemId)
        .then((response) => setWork(response))
        .catch(() => undefined);
    };

    window.addEventListener(WORK_REALTIME_EVENT, refreshVisibleWork);
    window.addEventListener(WORK_REALTIME_RECONCILE_EVENT, refreshVisibleWork);
    return () => {
      window.removeEventListener(WORK_REALTIME_EVENT, refreshVisibleWork);
      window.removeEventListener(WORK_REALTIME_RECONCILE_EVENT, refreshVisibleWork);
    };
  }, [accessToken, workItemId]);

  async function mutate(operation: () => Promise<unknown>, message: string): Promise<void> {
    if (mutating) return;
    setMutating(true);
    setError("");
    setSuccess("");
    try {
      await operation();
      await load();
      setSuccess(message);
      setNote("");
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "The Work action could not be completed.");
    } finally {
      setMutating(false);
    }
  }

  if (loading) {
    return <main className="workspace-page"><p className="workspace-empty-state">Loading Work…</p></main>;
  }

  if (!work) {
    return <main className="workspace-page"><p className="form-error">{error || "Work was not found."}</p></main>;
  }

  const salesDisplayLabel = work.workTypeVersion.salesDisplayLabel?.trim() || "Sales";
  const canAcknowledge = work.status === "ASSIGNED";
  const canStart = (work.status === "ACKNOWLEDGED" || work.status === "REOPENED") && isPrimary;
  const canFinish = ["IN_PROGRESS", "HELP_REQUESTED", "BLOCKED"].includes(work.status) && isPrimary;
  const canReview = work.status === "COMPLETED_PENDING_REVIEW" && isReviewer;
  const canReopen = work.status === "CLOSED" && isReviewer;
  const canSendSales = Boolean(work.salesMemberAccountId) && isPrimary && work.salesCoordinationStatus !== "COMPLETED";
  const canCompleteSales = Boolean(work.salesMemberAccountId) && isSalesMember && work.salesCoordinationStatus !== "COMPLETED";
  const canCancel = !["CLOSED", "CANCELLED"].includes(work.status) && isReviewer;
  const hasAvailableAction =
    canAcknowledge ||
    canStart ||
    canFinish ||
    canReview ||
    canReopen ||
    canSendSales ||
    canCompleteSales ||
    canCancel;

  return (
    <main className="workspace-page work-detail-page">
      <div className="work-detail-back"><Link to={backPath}>← Back to Work</Link></div>
      <header className="workspace-page__header work-detail-hero">
        <div className="work-detail-hero__copy">
          <div className="work-detail-hero__eyebrow-row">
            <p className="workspace-page__eyebrow">{work.ticketNumber}</p>
            <span>{work.workTypeVersion.name}</span>
          </div>
          <h1>{work.title}</h1>
          <p>{work.primaryOwnerOrgUnit.name}</p>
        </div>
        <div className="work-detail-hero__status">
          <span>Current status</span>
          <strong className={`work-status-badge work-status-badge--${work.status.toLowerCase()}`}>{statusLabel(work.status)}</strong>
        </div>
      </header>

      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="form-success" role="status">{success}</p>}

      <section className="work-detail-grid">
        <article className="workspace-card work-detail-panel work-detail-panel--responsibility">
          <header className="work-detail-panel__header">
            <div><span>Assignment</span><h2>Responsibility</h2></div>
          </header>
          <dl className="work-detail-list">
            <div><dt>Main Team</dt><dd>{work.assignedOperationalTeam?.name ?? "Individual assignment"}</dd></div>
            <div><dt>Primary</dt><dd>{accountName(primaryAssignment?.assignee)}</dd></div>
            <div><dt>Responsible Reviewer</dt><dd>{accountName(work.responsibleReviewer)}</dd></div>
            <div><dt>{salesDisplayLabel}</dt><dd>{accountName(work.salesMember)}</dd></div>
            <div><dt>Registered</dt><dd>{formatWorkDateTime(work.registeredAt, "en", "—")}</dd></div>
            <div><dt>Planned start</dt><dd>{formatWorkDateTime(work.plannedStartAt, "en", "—")}</dd></div>
            <div><dt>Due</dt><dd>{formatWorkDateTime(work.dueAt, "en", "—")}</dd></div>
          </dl>
        </article>

        <article className="workspace-card work-detail-panel work-detail-panel--information">
          <header className="work-detail-panel__header">
            <div><span>Work details</span><h2>Work information</h2></div>
            <strong>{work.fieldValues.length}</strong>
          </header>
          {work.description && <p className="work-detail-description">{work.description}</p>}
          <dl className="work-detail-list">
            {work.fieldValues.map((field) => (
              <div key={field.id}><dt>{field.fieldDefinition.label}</dt><dd>{renderValue(field.value)}</dd></div>
            ))}
          </dl>
        </article>
      </section>

      {hasAvailableAction && (
        <section className="workspace-card work-action-card">
        <div>
          <h2>Actions</h2>
          <p>The server validates team membership, reviewer authority and Sales authority for every action.</p>
        </div>
        {(canFinish || canReview || canReopen || canSendSales || canCompleteSales) && (
          <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Action note / completion summary" rows={3} />
        )}
        {canFinish && (
          <label>Completion result
            <select value={completionResult} onChange={(event) => setCompletionResult(event.target.value)}>
              <option value="FULLY_RESOLVED">Fully resolved</option>
              <option value="TEMPORARY_SOLUTION">Temporary solution</option>
              <option value="UNABLE_TO_RESOLVE">Unable to resolve</option>
            </select>
          </label>
        )}
        <div className="work-action-row">
          {canAcknowledge && <button type="button" disabled={mutating} onClick={() => void mutate(() => acknowledgeWork(accessToken!, work.id), "Work acknowledged.")}>Acknowledge / Claim</button>}
          {canStart && <button type="button" disabled={mutating} onClick={() => void mutate(() => startWork(accessToken!, work.id), "Work started.")}>Start Work</button>}
          {canSendSales && <button type="button" disabled={mutating} onClick={() => void mutate(() => sendWorkToSales(accessToken!, work.id, note.trim() || undefined), "Sent to Sales.")}>Send to Sales</button>}
          {canCompleteSales && <button type="button" disabled={mutating} onClick={() => void mutate(() => completeSalesWork(accessToken!, work.id, note.trim() || undefined), "Sales work completed.")}>Complete Sales Work</button>}
          {canFinish && <button type="button" className="primary-button" disabled={mutating || note.trim().length < 3} onClick={() => void mutate(() => submitWorkCompletion(accessToken!, work.id, { result: completionResult, summary: note.trim(), moreWorkRequired: completionResult !== "FULLY_RESOLVED" }), "Completion sent to the Responsible Reviewer.")}>Finish Work</button>}
          {canReview && <button type="button" disabled={mutating || note.trim().length < 3} onClick={() => void mutate(() => requestWorkCorrection(accessToken!, work.id, note.trim()), "Work returned for correction.")}>Return for Correction</button>}
          {canReview && <button type="button" className="primary-button" disabled={mutating || note.trim().length < 3} onClick={() => void mutate(() => approveWorkCompletion(accessToken!, work.id, note.trim()), "Work approved and closed.")}>Approve & Close</button>}
          {canReopen && <button type="button" disabled={mutating || note.trim().length < 3} onClick={() => void mutate(() => reopenWork(accessToken!, work.id, note.trim()), "Work reopened.")}>Reopen</button>}
          {canCancel && <button type="button" className="danger-button" disabled={mutating || note.trim().length < 3} onClick={() => void mutate(() => cancelWork(accessToken!, work.id, note.trim()), "Work cancelled.")}>Cancel</button>}
        </div>
        </section>

      )}

      <section className="workspace-card work-detail-history-card work-detail-history-card--completion">
        <header className="work-detail-section-heading">
          <div><span>Outcome</span><h2>Completion & review</h2></div>
          <strong>{work.completionReports.length}</strong>
        </header>
        {work.completionReports.length === 0 ? <p className="work-detail-empty">No completion report yet.</p> : (
          <div className="work-completion-list">
            {work.completionReports.map((report) => (
              <article key={report.id} className="work-completion-entry">
                <div className="work-completion-entry__topline">
                  <strong>{statusLabel(report.reviewStatus)}</strong>
                  <time>{formatWorkDateTime(report.createdAt, "en", "—")}</time>
                </div>
                <p>{report.summary}</p>
                {report.managerNote && <p className="work-completion-entry__reviewer"><b>Reviewer:</b> {report.managerNote}</p>}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="workspace-card work-detail-history-card work-detail-history-card--activity">
        <header className="work-detail-section-heading">
          <div><span>Audit trail</span><h2>Activity</h2></div>
          <strong>{work.activities.length}</strong>
        </header>
        <div className="work-activity-timeline">
          {work.activities.map((activity) => (
            <article key={activity.id} className="work-activity-entry">
              <span className="work-activity-entry__marker" aria-hidden="true" />
              <div>
                <strong>{statusLabel(activity.action)}</strong>
                <span>{accountName(activity.actor)} · {formatWorkDateTime(activity.createdAt, "en", "—")}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
