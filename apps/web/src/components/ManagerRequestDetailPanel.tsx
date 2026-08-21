import { useEffect, useState } from "react";

import type { FormEvent } from "react";

import {
  cancelMyAccountRequest,
  getDivisionEmployeeRequest,
  getMyAccountRequest,
  resendActivationEmail,
  resubmitMyAccountRequest,
} from "../services/account-request.service";

import type {
  ManagerRequestContextResponse,
  MyAccountRequestDetail,
  ScopedAccountRequestDetail,
} from "../types/account-request";

interface ManagerRequestDetailPanelProps {
  accessToken: string;
  requestId: string;
  requestContext: ManagerRequestContextResponse;
  onClose: () => void;
  readOnly?: boolean;
  onCancelled: () => void;
  onResubmitted: (newRequestId: string) => void;
}

interface ResubmitFormState {
  empId: string;
  empName: string;
  phoneNumber: string;
  officialEmail: string;
  designation: string;
  departmentId: string;
}

const emptyForm: ResubmitFormState = {
  empId: "",
  empName: "",
  phoneNumber: "",
  officialEmail: "",
  designation: "",
  departmentId: "",
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The request could not be completed.";
}

function formatRole(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getStatusClass(status: string): string {
  return status.toLowerCase().replaceAll("_", "-");
}

export function ManagerRequestDetailPanel({
  accessToken,
  requestId,
  requestContext,
  readOnly = false,
  onClose,
  onCancelled,
  onResubmitted,
}: ManagerRequestDetailPanelProps) {
  const [detail, setDetail] = useState<
    MyAccountRequestDetail | ScopedAccountRequestDetail | null
  >(null);

  const [form, setForm] = useState<ResubmitFormState>(emptyForm);

  const [loading, setLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);

  const [cancelling, setCancelling] = useState(false);

  const [resendingActivationEmail, setResendingActivationEmail] =
    useState(false);

  const [showCancelForm, setShowCancelForm] = useState(false);

  const [cancelReason, setCancelReason] = useState("");

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  const [retryKey, setRetryKey] = useState(0);

  const isSeniorManagement = requestContext.role === "SENIOR_MANAGEMENT";

  const selectedDepartment =
    requestContext.departments.find(
      (department) => department.id === form.departmentId,
    ) ?? null;

  useEffect(() => {
    let active = true;

    const detailRequest = readOnly
      ? getDivisionEmployeeRequest(accessToken, requestId)
      : getMyAccountRequest(accessToken, requestId);

    detailRequest
      .then((response) => {
        if (!active) {
          return;
        }

        const accountRequest = response.accountRequest;

        setDetail(accountRequest);

        setForm({
          empId: accountRequest.empId,

          empName: accountRequest.empName,

          phoneNumber: accountRequest.phoneNumber,

          officialEmail: accountRequest.officialEmail,

          designation: accountRequest.designation ?? "",

          departmentId: accountRequest.departmentId ?? "",
        });

        setError("");
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

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
  }, [accessToken, requestId, readOnly, retryKey]);

  function updateField(field: keyof ResubmitFormState, value: string): void {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setError("");
    setSuccess("");
  }

  function retryLoading(): void {
    setLoading(true);
    setError("");

    setRetryKey((current) => current + 1);
  }

  function validateForm(): string | null {
    const empId = form.empId.trim();

    const empName = form.empName.trim();

    const phoneNumber = form.phoneNumber.trim();

    const officialEmail = form.officialEmail.trim();

    if (empId.length < 2) {
      return "Employee ID must contain at least 2 characters.";
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(empId)) {
      return "Employee ID may contain letters, numbers, underscores and hyphens only.";
    }

    if (empName.length < 2) {
      return "Employee name must contain at least 2 characters.";
    }

    if (!/^\+?[0-9]{7,20}$/.test(phoneNumber)) {
      return "Phone number must contain 7 to 20 digits and may start with +.";
    }

    if (!officialEmail.includes("@")) {
      return "Enter a valid official email address.";
    }

    if (isSeniorManagement && !form.departmentId) {
      return "Select the department this Team Manager will manage.";
    }

    return null;
  }

  async function handleActivationEmailResend(): Promise<void> {
    if (!detail || readOnly || resendingActivationEmail) {
      return;
    }

    setResendingActivationEmail(true);
    setError("");
    setSuccess("");

    try {
      const response = await resendActivationEmail(accessToken, detail.id);

      setSuccess(response.message);
      setRetryKey((current) => current + 1);
    } catch (resendError: unknown) {
      setError(getErrorMessage(resendError));
    } finally {
      setResendingActivationEmail(false);
    }
  }

  async function handleCancel(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (
      !detail ||
      readOnly ||
      cancelling ||
      submitting ||
      !["PENDING_APPROVAL", "APPROVED", "ACTIVATION_PENDING"].includes(
        detail.status,
      )
    ) {
      return;
    }

    const reason = cancelReason.trim().replace(/\s+/g, " ");

    if (reason.length < 3) {
      setError("Enter a cancellation reason of at least 3 characters.");

      return;
    }

    if (reason.length > 500) {
      setError("The cancellation reason cannot exceed 500 characters.");

      return;
    }

    setCancelling(true);
    setError("");
    setSuccess("");

    try {
      const response = await cancelMyAccountRequest(
        accessToken,
        requestId,
        reason,
      );

      setSuccess(response.message);
      setShowCancelForm(false);
      setCancelReason("");

      onCancelled();

      setRetryKey((current) => current + 1);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError));
    } finally {
      setCancelling(false);
    }
  }

  async function handleResubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (readOnly || submitting || detail?.status !== "REJECTED") {
      return;
    }

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);

      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const response = await resubmitMyAccountRequest(accessToken, requestId, {
        empId: form.empId.trim().toUpperCase(),

        empName: form.empName.trim().replace(/\s+/g, " "),

        phoneNumber: form.phoneNumber.trim(),

        officialEmail: form.officialEmail.trim().toLowerCase(),

        designation: form.designation.trim(),

        departmentId: isSeniorManagement ? form.departmentId : undefined,
      });

      setSuccess(response.message);

      onResubmitted(response.accountRequest.id);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="manager-detail-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !submitting &&
          !cancelling
        ) {
          onClose();
        }
      }}
    >
      <section
        className="manager-detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manager-request-detail-title"
      >
        <header className="manager-detail-header">
          <div>
            <span>
              {readOnly ? "Division employee request" : "Account request"}
            </span>

            <h2 id="manager-request-detail-title">Request details</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting || cancelling}
            aria-label="Close request details"
          >
            ×
          </button>
        </header>

        {loading && (
          <div className="manager-detail-loading">
            <div className="spinner" />

            <p>Loading request details...</p>
          </div>
        )}

        {!loading && error && !detail && (
          <div className="manager-detail-error">
            <p>{error}</p>

            <button type="button" onClick={retryLoading}>
              Try again
            </button>
          </div>
        )}

        {!loading && detail && (
          <div className="manager-detail-content">
            <section className="manager-detail-summary">
              <div>
                <span>Employee</span>

                <strong>{detail.empName}</strong>

                <small>{detail.empId}</small>
              </div>

              <div>
                <span>Requested role</span>

                <strong>{formatRole(detail.requestedRole)}</strong>

                <small>Revision {detail.revisionNumber}</small>
              </div>

              <div>
                <span>Status</span>

                <strong
                  className={`manager-status ${getStatusClass(detail.status)}`}
                >
                  {formatStatus(detail.status)}
                </strong>

                <small>Submitted {formatDate(detail.submittedAt)}</small>
              </div>
            </section>

            {(success || error) && (
              <div className="manager-detail-feedback" aria-live="polite">
                {success && (
                  <div className="manager-form-success" role="status">
                    {success}
                  </div>
                )}
                {error && (
                  <div className="manager-form-error" role="alert">
                    {error}
                  </div>
                )}
              </div>
            )}

            <section className="activation-delivery-card">
              <div>
                <span>Activation email</span>
                <strong
                  className={`activation-delivery-status activation-delivery-status--${detail.activationEmailStatus.toLowerCase()}`}
                >
                  {formatStatus(detail.activationEmailStatus)}
                </strong>
              </div>

              <div>
                <span>Last attempt</span>
                <strong>
                  {formatDate(detail.activationEmailLastAttemptAt)}
                </strong>
              </div>

              <div>
                <span>Sent</span>
                <strong>{formatDate(detail.activationEmailSentAt)}</strong>
              </div>

              {!readOnly &&
                ["APPROVED", "ACTIVATION_PENDING"].includes(detail.status) && (
                  <button
                    type="button"
                    onClick={() => void handleActivationEmailResend()}
                    disabled={resendingActivationEmail}
                  >
                    {resendingActivationEmail
                      ? "Sending..."
                      : detail.activationEmailStatus === "NOT_SENT"
                        ? "Send activation email"
                        : "Resend activation email"}
                  </button>
                )}
            </section>

            {detail.rejectionReason && (
              <section className="manager-rejection-box" role="alert">
                <strong>Rejection reason</strong>

                <p>{detail.rejectionReason}</p>
              </section>
            )}

            <section className="manager-detail-fields">
              <div>
                <span>Official email</span>

                <strong>{detail.officialEmail}</strong>
              </div>

              <div>
                <span>Phone number</span>

                <strong>{detail.phoneNumber}</strong>
              </div>

              <div>
                <span>Designation</span>

                <strong>{detail.designation ?? "Not provided"}</strong>
              </div>

              <div>
                <span>Division</span>

                <strong>{detail.division?.name ?? "Not assigned"}</strong>
              </div>

              <div>
                <span>Department</span>

                <strong>{detail.department?.name ?? "Not assigned"}</strong>
              </div>

              <div>
                <span>Reviewed</span>

                <strong>{formatDate(detail.reviewedAt)}</strong>
              </div>

              {"requestedBy" in detail && (
                <div>
                  <span>Requested by</span>

                  <strong>
                    {detail.requestedBy.employee?.empName ??
                      formatRole(detail.requestedBy.role)}
                  </strong>

                  <small>
                    {detail.requestedBy.employee?.empId ??
                      "Authorized requester"}
                  </small>
                </div>
              )}
            </section>

            <section className="manager-history-section">
              <header>
                <span>Request history</span>

                <h3>Activity timeline</h3>
              </header>

              <div className="manager-history-timeline">
                {detail.actions.map((action) => (
                  <article key={action.id}>
                    <div aria-hidden="true" />

                    <div>
                      <strong>{formatStatus(action.action)}</strong>

                      <time>{formatDate(action.createdAt)}</time>

                      {action.reason && <p>{action.reason}</p>}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {readOnly && (
              <section className="manager-detail-readonly">
                <strong>Read-only division oversight</strong>
                <p>
                  You can review this Employee request because it was submitted
                  by a Team Manager inside your assigned division. Only the
                  original requester and Super Admin can change its lifecycle.
                </p>
              </section>
            )}

            {!readOnly &&
              ["PENDING_APPROVAL", "APPROVED", "ACTIVATION_PENDING"].includes(
                detail.status,
              ) && (
                <section className="manager-close-section">
                  <header>
                    <span>Request control</span>

                    <h3>Cancel this request</h3>

                    <p>
                      Cancelling an approved management request releases its
                      reserved position and removes the unactivated employee
                      identity.
                    </p>
                  </header>

                  {!showCancelForm ? (
                    <button
                      className="manager-open-cancel"
                      type="button"
                      onClick={() => {
                        setShowCancelForm(true);
                        setError("");
                        setSuccess("");
                      }}
                      disabled={submitting || cancelling}
                    >
                      Cancel request
                    </button>
                  ) : (
                    <form
                      className="manager-cancel-form"
                      onSubmit={handleCancel}
                    >
                      <label htmlFor="manager-request-cancel-reason">
                        Cancellation reason
                      </label>

                      <textarea
                        id="manager-request-cancel-reason"
                        value={cancelReason}
                        onChange={(event) => {
                          setCancelReason(event.target.value);
                          setError("");
                        }}
                        minLength={3}
                        maxLength={500}
                        rows={4}
                        placeholder="Explain why this request should be cancelled."
                        disabled={cancelling}
                        required
                      />

                      <div className="manager-cancel-meta">
                        <span>Minimum 3 characters</span>

                        <span>
                          {cancelReason.length}
                          /500
                        </span>
                      </div>

                      <div className="manager-cancel-buttons">
                        <button
                          className="manager-confirm-cancel"
                          type="submit"
                          disabled={cancelling}
                        >
                          {cancelling
                            ? "Cancelling..."
                            : "Confirm cancellation"}
                        </button>

                        <button
                          className="manager-dismiss-cancel"
                          type="button"
                          onClick={() => {
                            setShowCancelForm(false);
                            setCancelReason("");
                            setError("");
                          }}
                          disabled={cancelling}
                        >
                          Keep request
                        </button>
                      </div>
                    </form>
                  )}
                </section>
              )}

            {!readOnly && detail.status === "REJECTED" && (
              <form className="manager-resubmit-form" onSubmit={handleResubmit}>
                <header>
                  <span>Correct and resubmit</span>

                  <h3>Create the next revision</h3>

                  <p>
                    Correct the rejected information and send a new request for
                    Super Admin review.
                  </p>
                </header>

                {success && (
                  <div className="manager-form-success" role="status">
                    {success}
                  </div>
                )}

                {error && (
                  <div className="manager-form-error" role="alert">
                    {error}
                  </div>
                )}

                <div className="manager-resubmit-grid">
                  <label>
                    <span>Employee name</span>

                    <input
                      type="text"
                      value={form.empName}
                      onChange={(event) =>
                        updateField("empName", event.target.value)
                      }
                      disabled={submitting}
                      required
                    />
                  </label>

                  <label>
                    <span>Employee ID</span>

                    <input
                      type="text"
                      value={form.empId}
                      onChange={(event) =>
                        updateField("empId", event.target.value.toUpperCase())
                      }
                      disabled={submitting}
                      required
                    />
                  </label>

                  <label>
                    <span>Phone number</span>

                    <input
                      type="tel"
                      value={form.phoneNumber}
                      onChange={(event) =>
                        updateField("phoneNumber", event.target.value)
                      }
                      disabled={submitting}
                      required
                    />
                  </label>

                  <label>
                    <span>Official email</span>

                    <input
                      type="email"
                      value={form.officialEmail}
                      onChange={(event) =>
                        updateField("officialEmail", event.target.value)
                      }
                      disabled={submitting}
                      required
                    />
                  </label>

                  <label>
                    <span>Designation</span>

                    <input
                      type="text"
                      value={form.designation}
                      onChange={(event) =>
                        updateField("designation", event.target.value)
                      }
                      disabled={submitting}
                    />
                  </label>

                  {isSeniorManagement ? (
                    <label>
                      <span>Managed department</span>

                      <select
                        value={form.departmentId}
                        onChange={(event) =>
                          updateField("departmentId", event.target.value)
                        }
                        disabled={submitting}
                        required
                      >
                        <option value="">Select department</option>

                        {requestContext.departments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name} ({department.code})
                          </option>
                        ))}
                      </select>

                      <small>
                        The Team Manager authority position is created
                        automatically.
                      </small>
                    </label>
                  ) : (
                    <div className="manager-fixed-field">
                      <span>Department</span>

                      <strong>
                        {requestContext.scope.department?.name ??
                          "Not assigned"}
                      </strong>

                      <small>Fixed by your account scope.</small>
                    </div>
                  )}
                </div>

                <div className="manager-resubmit-review">
                  <span>Resubmission department</span>

                  <strong>
                    {isSeniorManagement
                      ? (selectedDepartment?.name ?? "Select a department")
                      : (requestContext.scope.department?.name ??
                        "Not assigned")}
                  </strong>
                </div>

                <footer>
                  <button type="submit" disabled={submitting}>
                    {submitting ? "Resubmitting..." : "Resubmit request"}
                  </button>
                </footer>
              </form>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
