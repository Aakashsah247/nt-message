import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { FormEvent, ReactNode } from "react";
import type { TFunction } from "i18next";

import { ProtectedAvatar } from "./ProtectedAvatar";

import {
  approveAdminAccountRequest,
  getAdminAccountRequest,
  invalidateAdminAccountRequest,
  rejectAdminAccountRequest,
  resendActivationEmail,
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

type ActionType = "approve" | "reject" | "invalidate" | "resend" | null;

function DetailField({ label, value, secondary }: DetailFieldProps) {
  return (
    <div>
      <span>{label}</span>

      <strong>{value}</strong>

      {secondary && <small>{secondary}</small>}
    </div>
  );
}

function getErrorMessage(error: unknown, t: TFunction): string {
  return error instanceof Error
    ? error.message
    : t("adminDetail.errorFallback", { ns: "requests" });
}

function formatLabel(value: string, t: TFunction): string {
  const translated = t(`values.${value}`, {
    ns: "requests",
    defaultValue: "",
  });

  if (translated) {
    return translated;
  }

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusClass(status: AccountRequestStatus): string {
  return status.toLowerCase().replaceAll("_", "-");
}

function formatDate(
  value: string | null,
  language: string,
  t: TFunction,
): string {
  if (!value) {
    return t("common.notAvailable", { ns: "requests" });
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return t("common.notAvailable", { ns: "requests" });
  }

  return new Intl.DateTimeFormat(language.startsWith("ne") ? "ne-NP-u-ca-gregory" : "en-GB", {
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
  const { t, i18n } = useTranslation("requests");
  const [request, setRequest] = useState<AdminAccountRequestDetail | null>(
    null,
  );

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [retryKey, setRetryKey] = useState(0);

  const [showApproveConfirmation, setShowApproveConfirmation] = useState(false);

  const [showRejectForm, setShowRejectForm] = useState(false);

  const [showInvalidateForm, setShowInvalidateForm] = useState(false);

  const [rejectionReason, setRejectionReason] = useState("");

  const [invalidationReason, setInvalidationReason] = useState("");

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

        setError(getErrorMessage(requestError, t));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, requestId, retryKey, t]);

  function reloadDetails(): void {
    setLoading(true);
    setError("");
    setRequest(null);

    setRetryKey((current) => current + 1);
  }

  function resetDecisionForms(): void {
    setShowApproveConfirmation(false);

    setShowRejectForm(false);

    setShowInvalidateForm(false);

    setRejectionReason("");

    setInvalidationReason("");

    setActionError("");
  }

  function openApproveConfirmation(): void {
    setShowRejectForm(false);

    setShowInvalidateForm(false);

    setRejectionReason("");

    setActionError("");

    setActionMessage("");

    setShowApproveConfirmation(true);
  }

  function openRejectForm(): void {
    setShowApproveConfirmation(false);

    setShowInvalidateForm(false);

    setActionError("");

    setActionMessage("");

    setShowRejectForm(true);
  }

  function openInvalidateForm(): void {
    setShowApproveConfirmation(false);
    setShowRejectForm(false);
    setRejectionReason("");
    setActionError("");
    setActionMessage("");
    setShowInvalidateForm(true);
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
      setActionError(getErrorMessage(approveError, t));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleActivationEmailResend(): Promise<void> {
    if (!request || actionLoading) {
      return;
    }

    setActionLoading("resend");
    setActionError("");
    setActionMessage("");

    try {
      const response = await resendActivationEmail(accessToken, request.id);

      setActionMessage(response.message);
      onRequestUpdated();
      setRetryKey((current) => current + 1);
    } catch (resendError: unknown) {
      setActionError(getErrorMessage(resendError, t));
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
      setActionError(t("adminDetail.rejectReasonShort"));

      return;
    }

    if (reason.length > 500) {
      setActionError(t("adminDetail.rejectReasonLong"));

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
      setActionError(getErrorMessage(rejectError, t));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleInvalidate(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (
      !request ||
      actionLoading ||
      !["APPROVED", "ACTIVATION_PENDING"].includes(request.status)
    ) {
      return;
    }

    const reason = invalidationReason.trim().replace(/\s+/g, " ");

    if (reason.length < 3) {
      setActionError(t("adminDetail.invalidateReasonShort"));

      return;
    }

    if (reason.length > 500) {
      setActionError(t("adminDetail.invalidateReasonLong"));

      return;
    }

    setActionLoading("invalidate");
    setActionError("");
    setActionMessage("");

    try {
      const response = await invalidateAdminAccountRequest(
        accessToken,
        request.id,
        reason,
      );

      setActionMessage(response.message);
      setShowInvalidateForm(false);
      setInvalidationReason("");

      onRequestUpdated();

      setRetryKey((current) => current + 1);
    } catch (invalidateError: unknown) {
      setActionError(getErrorMessage(invalidateError, t));
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
            <span>{t("adminDetail.eyebrow")}</span>

            <h2 id="request-detail-title">{t("adminDetail.title")}</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(actionLoading)}
            aria-label={t("common.closeRequestDetails")}
          >
            ×
          </button>
        </header>

        {loading && (
          <div className="admin-detail-loading">
            <div className="spinner" />

            <p>{t("common.loadingRequestDetails")}</p>
          </div>
        )}

        {!loading && error && (
          <div className="admin-detail-error">
            <p>{error}</p>

            <button type="button" onClick={reloadDetails}>
              {t("common.tryAgain")}
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
                  {formatLabel(request.status, t)}
                </span>

                <h3>{request.empName}</h3>

                <p>
                  {request.empId}
                  {" · "}
                  {formatLabel(request.requestedRole, t)}
                </p>
              </div>

              <div className="admin-detail-revision">
                <span>{t("adminDetail.revision")}</span>

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

            <section className="activation-delivery-card">
              <div>
                <span>{t("common.activationEmail")}</span>
                <strong
                  className={`activation-delivery-status activation-delivery-status--${request.activationEmailStatus.toLowerCase()}`}
                >
                  {formatLabel(request.activationEmailStatus, t)}
                </strong>
              </div>

              <div>
                <span>{t("adminDetail.lastAttempt")}</span>
                <strong>
                  {formatDate(request.activationEmailLastAttemptAt, i18n.language, t)}
                </strong>
              </div>

              <div>
                <span>{t("adminDetail.sent")}</span>
                <strong>{formatDate(request.activationEmailSentAt, i18n.language, t)}</strong>
              </div>

              {["APPROVED", "ACTIVATION_PENDING"].includes(request.status) &&
                request.employee &&
                !request.employee.isActivated && (
                  <button
                    type="button"
                    onClick={() => void handleActivationEmailResend()}
                    disabled={Boolean(actionLoading)}
                  >
                    {actionLoading === "resend"
                      ? t("common.sending")
                      : request.activationEmailStatus === "NOT_SENT"
                        ? t("adminDetail.sendActivation")
                        : t("adminDetail.resendActivation")}
                  </button>
                )}
            </section>

            {request.status === "PENDING_APPROVAL" && (
              <section className="admin-detail-actions">
                <div>
                  <h4>{t("adminDetail.reviewDecision")}</h4>

                  <p>
                    {t("adminDetail.reviewDescription")}
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
                      {t("adminDetail.approveAction")}
                    </button>

                    <button
                      className="admin-reject-button"
                      type="button"
                      onClick={openRejectForm}
                      disabled={Boolean(actionLoading)}
                    >
                      {t("adminDetail.rejectAction")}
                    </button>
                  </div>
                )}

                {showApproveConfirmation && (
                  <div className="admin-approve-confirmation">
                    <strong>{t("adminDetail.approveQuestion")}</strong>

                    <p>
                      {t("adminDetail.approveDescription", { name: request.empName })}
                    </p>

                    <div>
                      <button
                        className="admin-confirm-approve"
                        type="button"
                        onClick={handleApprove}
                        disabled={Boolean(actionLoading)}
                      >
                        {actionLoading === "approve"
                          ? t("adminDetail.approving")
                          : t("adminDetail.confirmApproval")}
                      </button>

                      <button
                        className="admin-cancel-decision"
                        type="button"
                        onClick={resetDecisionForms}
                        disabled={Boolean(actionLoading)}
                      >
                        {t("adminDetail.cancel")}
                      </button>
                    </div>
                  </div>
                )}

                {showRejectForm && (
                  <form className="admin-reject-form" onSubmit={handleReject}>
                    <label htmlFor="account-request-rejection-reason">
                      {t("adminDetail.rejectionReason")}
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
                      placeholder={t("adminDetail.rejectPlaceholder")}
                      disabled={Boolean(actionLoading)}
                      required
                    />

                    <div className="admin-reject-form-meta">
                      <span>{t("common.minimum3")}</span>

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
                          ? t("adminDetail.rejecting")
                          : t("adminDetail.confirmRejection")}
                      </button>

                      <button
                        className="admin-cancel-decision"
                        type="button"
                        onClick={resetDecisionForms}
                        disabled={Boolean(actionLoading)}
                      >
                        {t("adminDetail.cancel")}
                      </button>
                    </div>
                  </form>
                )}
              </section>
            )}

            {["APPROVED", "ACTIVATION_PENDING"].includes(request.status) && (
              <section className="admin-detail-actions admin-invalidate-section">
                <div>
                  <h4>{t("adminDetail.invalidate")}</h4>

                  <p>
                    {t("adminDetail.invalidationDescription")}
                  </p>
                </div>

                {!showInvalidateForm ? (
                  <button
                    className="admin-invalidate-button"
                    type="button"
                    onClick={openInvalidateForm}
                    disabled={Boolean(actionLoading)}
                  >
                    {t("adminDetail.invalidate")}
                  </button>
                ) : (
                  <form
                    className="admin-invalidate-form"
                    onSubmit={handleInvalidate}
                  >
                    <label htmlFor="account-request-invalidation-reason">
                      {t("adminDetail.invalidationReason")}
                    </label>

                    <textarea
                      id="account-request-invalidation-reason"
                      value={invalidationReason}
                      onChange={(event) => {
                        setInvalidationReason(event.target.value);
                        setActionError("");
                      }}
                      minLength={3}
                      maxLength={500}
                      rows={5}
                      placeholder={t("adminDetail.invalidatePlaceholder")}
                      disabled={Boolean(actionLoading)}
                      required
                    />

                    <div className="admin-reject-form-meta">
                      <span>{t("common.minimum3")}</span>

                      <span>
                        {invalidationReason.length}
                        /500
                      </span>
                    </div>

                    <div className="admin-reject-form-buttons">
                      <button
                        className="admin-confirm-invalidate"
                        type="submit"
                        disabled={Boolean(actionLoading)}
                      >
                        {actionLoading === "invalidate"
                          ? t("adminDetail.invalidating")
                          : t("adminDetail.confirmInvalidation")}
                      </button>

                      <button
                        className="admin-cancel-decision"
                        type="button"
                        onClick={resetDecisionForms}
                        disabled={Boolean(actionLoading)}
                      >
                        {t("adminDetail.keepRequest")}
                      </button>
                    </div>
                  </form>
                )}
              </section>
            )}

            <section className="admin-detail-section">
              <h4>{t("adminDetail.employeeInformation")}</h4>

              <div className="admin-detail-grid">
                <DetailField label={t("adminDetail.fullName")} value={request.empName} />

                <DetailField label={t("common.employeeId")} value={request.empId} />

                <DetailField label={t("common.phoneNumber")} value={request.phoneNumber} />

                <DetailField
                  label={t("common.officialEmail")}
                  value={request.officialEmail}
                />

                <DetailField
                  label={t("common.designation")}
                  value={request.designation ?? t("common.notProvided")}
                />

                <DetailField
                  label={t("common.requestedRole")}
                  value={formatLabel(request.requestedRole, t)}
                />
              </div>
            </section>

            <section className="admin-detail-section">
              <h4>{t("adminDetail.organizationAssignment")}</h4>

              <div className="admin-detail-grid">
                <DetailField
                  label={t("common.division")}
                  value={request.division?.name ?? t("common.notAssigned")}
                  secondary={request.division?.code}
                />

                <DetailField
                  label={t("common.department")}
                  value={request.department?.name ?? t("common.notAssigned")}
                  secondary={request.department?.code}
                />
              </div>
            </section>

            <section className="admin-detail-section">
              <h4>{t("adminDetail.submissionReview")}</h4>

              <div className="admin-detail-grid">
                <DetailField
                  label={t("common.requestedBy")}
                  value={
                    request.requestedBy.employee?.empName ??
                    request.requestedBy.username ??
                    t("common.unknownRequester")
                  }
                  secondary={formatLabel(request.requestedBy.role, t)}
                />

                <DetailField
                  label={t("common.submitted")}
                  value={formatDate(request.submittedAt, i18n.language, t)}
                />

                <DetailField
                  label={t("common.reviewedBy")}
                  value={request.reviewedBy?.username ?? t("common.notReviewed")}
                  secondary={
                    request.reviewedBy
                      ? formatLabel(request.reviewedBy.role, t)
                      : undefined
                  }
                />

                <DetailField
                  label={t("common.reviewed")}
                  value={formatDate(request.reviewedAt, i18n.language, t)}
                />
              </div>
            </section>

            {request.rejectionReason && (
              <section className="admin-detail-rejection">
                <span>{t("adminDetail.rejectionReason")}</span>

                <p>{request.rejectionReason}</p>
              </section>
            )}

            {request.employee && (
              <section className="admin-detail-section">
                <h4>{t("adminDetail.linkedAccount")}</h4>

                <div className="admin-linked-employee">
                  <div className="admin-linked-employee__identity">
                    <ProtectedAvatar
                      employeeId={request.employee.id}
                      displayName={request.employee.empName}
                      className="admin-linked-employee__avatar"
                      ariaLabel={t("adminDetail.profileAria", { name: request.employee.empName })}
                    />

                    <div>
                      <strong>{request.employee.empName}</strong>
                      <span>{request.employee.officialEmail}</span>
                    </div>
                  </div>

                  <span
                    className={
                      request.employee.isActivated
                        ? "admin-employee-state active"
                        : "admin-employee-state"
                    }
                  >
                    {request.employee.isActivated
                      ? t("adminDetail.activated")
                      : t("adminDetail.awaitingActivation")}
                  </span>
                </div>
              </section>
            )}

            <section className="admin-detail-section">
              <h4>{t("adminDetail.history")}</h4>

              {request.actions.length === 0 ? (
                <p className="admin-detail-no-history">
                  {t("adminDetail.noHistory")}
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
                          <strong>{formatLabel(action.action, t)}</strong>

                          <time>{formatDate(action.createdAt, i18n.language, t)}</time>
                        </header>

                        <p>
                          {action.actor?.username ??
                            (action.actor
                              ? formatLabel(action.actor.role, t)
                              : t("common.systemAction"))}
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
