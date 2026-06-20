import { useEffect, useState } from "react";

import type { FormEvent, ReactNode } from "react";

import {
  approveAdminAccountRequest,
  getAdminAccountRequest,
  rejectAdminAccountRequest,
} from "../services/account-request.service";

import type {
  AccountRequestStatus,
  AdminAccountRequestDetail,
} from "../types/account-request";

interface AdminRequestDetailPanelProps {
  accessToken: string;
  requestId: string;
  onClose: () => void;
  onRequestUpdated: () => void;
}

interface DetailFieldProps {
  label: string;
  value: ReactNode;
  secondary?: ReactNode;
}

type ActionType = "approve" | "reject" | null;

function DetailField({ label, value, secondary }: DetailFieldProps) {
  return (
    <div>
      <span>{label}</span>

      <strong>{value}</strong>

      {secondary && <small>{secondary}</small>}
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The requested operation could not be completed.";
}

function formatLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusClass(status: AccountRequestStatus): string {
  return status.toLowerCase().replaceAll("_", "-");
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function AdminRequestDetailPanel({
  accessToken,
  requestId,
  onClose,
  onRequestUpdated,
}: AdminRequestDetailPanelProps) {
  const [request, setRequest] = useState<AdminAccountRequestDetail | null>(
    null,
  );

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [retryKey, setRetryKey] = useState(0);

  const [showApproveConfirmation, setShowApproveConfirmation] = useState(false);

  const [showRejectForm, setShowRejectForm] = useState(false);

  const [rejectionReason, setRejectionReason] = useState("");

  const [actionLoading, setActionLoading] = useState<ActionType>(null);

  const [actionError, setActionError] = useState("");

  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    let active = true;

    getAdminAccountRequest(accessToken, requestId)
      .then((response) => {
        if (!active) {
          return;
        }

        setRequest(response.accountRequest);

        setError("");
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setRequest(null);

        setError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, requestId, retryKey]);

  function reloadDetails(): void {
    setLoading(true);
    setError("");
    setRequest(null);

    setRetryKey((current) => current + 1);
  }

  function resetDecisionForms(): void {
    setShowApproveConfirmation(false);

    setShowRejectForm(false);

    setRejectionReason("");

    setActionError("");
  }

  function openApproveConfirmation(): void {
    setShowRejectForm(false);

    setRejectionReason("");

    setActionError("");

    setActionMessage("");

    setShowApproveConfirmation(true);
  }

  function openRejectForm(): void {
    setShowApproveConfirmation(false);

    setActionError("");

    setActionMessage("");

    setShowRejectForm(true);
  }

  async function handleApprove(): Promise<void> {
    if (!request || actionLoading) {
      return;
    }

    setActionLoading("approve");

    setActionError("");
    setActionMessage("");

    try {
      const response = await approveAdminAccountRequest(
        accessToken,
        request.id,
      );

      setActionMessage(response.message);

      setShowApproveConfirmation(false);

      onRequestUpdated();

      setRetryKey((current) => current + 1);
    } catch (approveError: unknown) {
      setActionError(getErrorMessage(approveError));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!request || actionLoading) {
      return;
    }

    const reason = rejectionReason.trim().replace(/\s+/g, " ");

    if (reason.length < 3) {
      setActionError("Enter a rejection reason of at least 3 characters.");

      return;
    }

    if (reason.length > 500) {
      setActionError("The rejection reason cannot exceed 500 characters.");

      return;
    }

    setActionLoading("reject");

    setActionError("");
    setActionMessage("");

    try {
      const response = await rejectAdminAccountRequest(
        accessToken,
        request.id,
        reason,
      );

      setActionMessage(response.message);

      setShowRejectForm(false);

      setRejectionReason("");

      onRequestUpdated();

      setRetryKey((current) => current + 1);
    } catch (rejectError: unknown) {
      setActionError(getErrorMessage(rejectError));
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div
      className="admin-detail-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !actionLoading) {
          onClose();
        }
      }}
    >
      <aside
        className="admin-detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-detail-title"
      >
        <header className="admin-detail-header">
          <div>
            <span>Account request</span>

            <h2 id="request-detail-title">Request details</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(actionLoading)}
            aria-label="Close request details"
          >
            ×
          </button>
        </header>

        {loading && (
          <div className="admin-detail-loading">
            <div className="spinner" />

            <p>Loading request details...</p>
          </div>
        )}

        {!loading && error && (
          <div className="admin-detail-error">
            <p>{error}</p>

            <button type="button" onClick={reloadDetails}>
              Try again
            </button>
          </div>
        )}

        {!loading && !error && request && (
          <div className="admin-detail-content">
            <section className="admin-detail-summary">
              <div>
                <span
                  className={`admin-status-badge ${getStatusClass(
                    request.status,
                  )}`}
                >
                  {formatLabel(request.status)}
                </span>

                <h3>{request.empName}</h3>

                <p>
                  {request.empId}
                  {" · "}
                  {formatLabel(request.requestedRole)}
                </p>
              </div>

              <div className="admin-detail-revision">
                <span>Revision</span>

                <strong>{request.revisionNumber}</strong>
              </div>
            </section>

            <div className="admin-action-feedback" aria-live="polite">
              {actionMessage && (
                <div className="admin-action-success">{actionMessage}</div>
              )}

              {actionError && (
                <div className="admin-action-error" role="alert">
                  {actionError}
                </div>
              )}
            </div>

            {request.status === "PENDING_APPROVAL" && (
              <section className="admin-detail-actions">
                <div>
                  <h4>Review decision</h4>

                  <p>
                    Approve the verified request or reject it with a correction
                    reason.
                  </p>
                </div>

                {!showApproveConfirmation && !showRejectForm && (
                  <div className="admin-decision-buttons">
                    <button
                      className="admin-approve-button"
                      type="button"
                      onClick={openApproveConfirmation}
                      disabled={Boolean(actionLoading)}
                    >
                      Approve request
                    </button>

                    <button
                      className="admin-reject-button"
                      type="button"
                      onClick={openRejectForm}
                      disabled={Boolean(actionLoading)}
                    >
                      Reject request
                    </button>
                  </div>
                )}

                {showApproveConfirmation && (
                  <div className="admin-approve-confirmation">
                    <strong>Approve this account request?</strong>

                    <p>
                      An inactive employee identity will be created for{" "}
                      {request.empName}. The employee must then complete OTP
                      activation.
                    </p>

                    <div>
                      <button
                        className="admin-confirm-approve"
                        type="button"
                        onClick={handleApprove}
                        disabled={Boolean(actionLoading)}
                      >
                        {actionLoading === "approve"
                          ? "Approving..."
                          : "Confirm approval"}
                      </button>

                      <button
                        className="admin-cancel-decision"
                        type="button"
                        onClick={resetDecisionForms}
                        disabled={Boolean(actionLoading)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {showRejectForm && (
                  <form className="admin-reject-form" onSubmit={handleReject}>
                    <label htmlFor="account-request-rejection-reason">
                      Rejection reason
                    </label>

                    <textarea
                      id="account-request-rejection-reason"
                      value={rejectionReason}
                      onChange={(event) => {
                        setRejectionReason(event.target.value);

                        setActionError("");
                      }}
                      minLength={3}
                      maxLength={500}
                      rows={5}
                      placeholder="Explain what information must be corrected before resubmission."
                      disabled={Boolean(actionLoading)}
                      required
                    />

                    <div className="admin-reject-form-meta">
                      <span>Minimum 3 characters</span>

                      <span>
                        {rejectionReason.length}
                        /500
                      </span>
                    </div>

                    <div className="admin-reject-form-buttons">
                      <button
                        className="admin-confirm-reject"
                        type="submit"
                        disabled={Boolean(actionLoading)}
                      >
                        {actionLoading === "reject"
                          ? "Rejecting..."
                          : "Confirm rejection"}
                      </button>

                      <button
                        className="admin-cancel-decision"
                        type="button"
                        onClick={resetDecisionForms}
                        disabled={Boolean(actionLoading)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </section>
            )}

            <section className="admin-detail-section">
              <h4>Employee information</h4>

              <div className="admin-detail-grid">
                <DetailField label="Full name" value={request.empName} />

                <DetailField label="Employee ID" value={request.empId} />

                <DetailField label="Phone number" value={request.phoneNumber} />

                <DetailField
                  label="Official email"
                  value={request.officialEmail}
                />

                <DetailField
                  label="Designation"
                  value={request.designation ?? "Not provided"}
                />

                <DetailField
                  label="Requested role"
                  value={formatLabel(request.requestedRole)}
                />
              </div>
            </section>

            <section className="admin-detail-section">
              <h4>Organization assignment</h4>

              <div className="admin-detail-grid">
                <DetailField
                  label="Division"
                  value={request.division?.name ?? "Not assigned"}
                  secondary={request.division?.code}
                />

                <DetailField
                  label="Department"
                  value={request.department?.name ?? "Not assigned"}
                  secondary={request.department?.code}
                />
              </div>
            </section>

            <section className="admin-detail-section">
              <h4>Submission and review</h4>

              <div className="admin-detail-grid">
                <DetailField
                  label="Requested by"
                  value={
                    request.requestedBy.employee?.empName ??
                    request.requestedBy.username ??
                    "Unknown requester"
                  }
                  secondary={formatLabel(request.requestedBy.role)}
                />

                <DetailField
                  label="Submitted"
                  value={formatDate(request.submittedAt)}
                />

                <DetailField
                  label="Reviewed by"
                  value={request.reviewedBy?.username ?? "Not reviewed"}
                  secondary={
                    request.reviewedBy
                      ? formatLabel(request.reviewedBy.role)
                      : undefined
                  }
                />

                <DetailField
                  label="Reviewed"
                  value={formatDate(request.reviewedAt)}
                />
              </div>
            </section>

            {request.rejectionReason && (
              <section className="admin-detail-rejection">
                <span>Rejection reason</span>

                <p>{request.rejectionReason}</p>
              </section>
            )}

            {request.employee && (
              <section className="admin-detail-section">
                <h4>Linked employee account</h4>

                <div className="admin-linked-employee">
                  <div>
                    <strong>{request.employee.empName}</strong>

                    <span>{request.employee.officialEmail}</span>
                  </div>

                  <span
                    className={
                      request.employee.isActivated
                        ? "admin-employee-state active"
                        : "admin-employee-state"
                    }
                  >
                    {request.employee.isActivated
                      ? "Activated"
                      : "Awaiting activation"}
                  </span>
                </div>
              </section>
            )}

            <section className="admin-detail-section">
              <h4>Request history</h4>

              {request.actions.length === 0 ? (
                <p className="admin-detail-no-history">
                  No request history is available.
                </p>
              ) : (
                <div className="admin-request-timeline">
                  {request.actions.map((action) => (
                    <article key={action.id}>
                      <div
                        className="admin-timeline-marker"
                        aria-hidden="true"
                      />

                      <div>
                        <header>
                          <strong>{formatLabel(action.action)}</strong>

                          <time>{formatDate(action.createdAt)}</time>
                        </header>

                        <p>
                          {action.actor?.username ??
                            (action.actor
                              ? formatLabel(action.actor.role)
                              : "System action")}
                        </p>

                        {action.reason && <small>{action.reason}</small>}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
