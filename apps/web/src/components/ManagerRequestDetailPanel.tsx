import { useEffect, useState } from "react";

import type { FormEvent } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

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

function getErrorMessage(error: unknown, t: TFunction<"requests">): string {
  return error instanceof Error
    ? error.message
    : t("managerDetail.errorFallback", { ns: "requests" });
}

function fallbackFormat(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatValue(value: string, t: TFunction<"requests">): string {
  return t(`values.${value}`, {
    ns: "requests",
    defaultValue: fallbackFormat(value),
  });
}

function formatDate(
  value: string | null,
  locale: string,
  t: TFunction<"requests">,
): string {
  if (!value) {
    return t("common.notAvailable", { ns: "requests" });
  }

  return new Intl.DateTimeFormat(
    locale === "ne" ? "ne-NP-u-ca-gregory" : "en-GB",
    { dateStyle: "medium", timeStyle: "short" },
  ).format(new Date(value));
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
  const { t, i18n } = useTranslation("requests");
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
  }, [accessToken, requestId, readOnly, retryKey, t]);

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
      return t("form.validationEmployeeIdShort");
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(empId)) {
      return t("form.validationEmployeeIdPattern");
    }

    if (empName.length < 2) {
      return t("form.validationNameShort");
    }

    if (!/^\+?[0-9]{7,20}$/.test(phoneNumber)) {
      return t("form.validationPhone");
    }

    if (!officialEmail.includes("@")) {
      return t("form.validationEmail");
    }

    if (isSeniorManagement && !form.departmentId) {
      return t("form.validationManagedDepartment");
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
      setError(getErrorMessage(resendError, t));
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
      setError(t("managerDetail.cancelReasonShort"));

      return;
    }

    if (reason.length > 500) {
      setError(t("managerDetail.cancelReasonLong"));

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
      setError(getErrorMessage(requestError, t));
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
      setError(getErrorMessage(requestError, t));
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
              {readOnly ? t("managerDetail.divisionEmployeeEyebrow") : t("managerDetail.accountEyebrow")}
            </span>

            <h2 id="manager-request-detail-title">{t("common.requestDetails")}</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting || cancelling}
            aria-label={t("common.closeRequestDetails")}
          >
            ×
          </button>
        </header>

        {loading && (
          <div className="manager-detail-loading">
            <div className="spinner" />

            <p>{t("common.loadingRequestDetails")}</p>
          </div>
        )}

        {!loading && error && !detail && (
          <div className="manager-detail-error">
            <p>{error}</p>

            <button type="button" onClick={retryLoading}>
              {t("common.tryAgain")}
            </button>
          </div>
        )}

        {!loading && detail && (
          <div className="manager-detail-content">
            <section className="manager-detail-summary">
              <div>
                <span>{t("common.employee")}</span>

                <strong>{detail.empName}</strong>

                <small>{detail.empId}</small>
              </div>

              <div>
                <span>{t("common.requestedRole")}</span>

                <strong>{formatValue(detail.requestedRole, t)}</strong>

                <small>{t("managerDetail.revision", { number: detail.revisionNumber })}</small>
              </div>

              <div>
                <span>{t("common.status")}</span>

                <strong
                  className={`manager-status ${getStatusClass(detail.status)}`}
                >
                  {formatValue(detail.status, t)}
                </strong>

                <small>{t("managerDetail.submittedDate", { date: formatDate(detail.submittedAt, i18n.language, t) })}</small>
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
                <span>{t("common.activationEmail")}</span>
                <strong
                  className={`activation-delivery-status activation-delivery-status--${detail.activationEmailStatus.toLowerCase()}`}
                >
                  {formatValue(detail.activationEmailStatus, t)}
                </strong>
              </div>

              <div>
                <span>{t("managerDetail.lastAttempt")}</span>
                <strong>
                  {formatDate(detail.activationEmailLastAttemptAt, i18n.language, t)}
                </strong>
              </div>

              <div>
                <span>{t("managerDetail.sent")}</span>
                <strong>{formatDate(detail.activationEmailSentAt, i18n.language, t)}</strong>
              </div>

              {!readOnly &&
                ["APPROVED", "ACTIVATION_PENDING"].includes(detail.status) && (
                  <button
                    type="button"
                    onClick={() => void handleActivationEmailResend()}
                    disabled={resendingActivationEmail}
                  >
                    {resendingActivationEmail
                      ? t("managerDetail.sending")
                      : detail.activationEmailStatus === "NOT_SENT"
                        ? t("managerDetail.sendActivation")
                        : t("managerDetail.resendActivation")}
                  </button>
                )}
            </section>

            {detail.rejectionReason && (
              <section className="manager-rejection-box" role="alert">
                <strong>{t("managerDetail.rejectionReason")}</strong>

                <p>{detail.rejectionReason}</p>
              </section>
            )}

            <section className="manager-detail-fields">
              <div>
                <span>{t("common.officialEmail")}</span>

                <strong>{detail.officialEmail}</strong>
              </div>

              <div>
                <span>{t("common.phoneNumber")}</span>

                <strong>{detail.phoneNumber}</strong>
              </div>

              <div>
                <span>{t("common.designation")}</span>

                <strong>{detail.designation ?? t("common.notProvided")}</strong>
              </div>

              <div>
                <span>{t("common.division")}</span>

                <strong>{detail.division?.name ?? t("common.notAssigned")}</strong>
              </div>

              <div>
                <span>{t("common.department")}</span>

                <strong>{detail.department?.name ?? t("common.notAssigned")}</strong>
              </div>

              <div>
                <span>{t("managerDetail.reviewed")}</span>

                <strong>{formatDate(detail.reviewedAt, i18n.language, t)}</strong>
              </div>

              {"requestedBy" in detail && (
                <div>
                  <span>{t("common.requestedBy")}</span>

                  <strong>
                    {detail.requestedBy.employee?.empName ??
                      formatValue(detail.requestedBy.role, t)}
                  </strong>

                  <small>
                    {detail.requestedBy.employee?.empId ??
                      t("common.authorizedRequester")}
                  </small>
                </div>
              )}
            </section>

            <section className="manager-history-section">
              <header>
                <span>{t("managerDetail.history")}</span>

                <h3>{t("managerDetail.timeline")}</h3>
              </header>

              <div className="manager-history-timeline">
                {detail.actions.map((action) => (
                  <article key={action.id}>
                    <div aria-hidden="true" />

                    <div>
                      <strong>{formatValue(action.action, t)}</strong>

                      <time>{formatDate(action.createdAt, i18n.language, t)}</time>

                      {action.reason && <p>{action.reason}</p>}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {readOnly && (
              <section className="manager-detail-readonly">
                <strong>{t("managerDetail.readOnly")}</strong>
                <p>{t("managerDetail.readOnlyDescription")}</p>
              </section>
            )}

            {!readOnly &&
              ["PENDING_APPROVAL", "APPROVED", "ACTIVATION_PENDING"].includes(
                detail.status,
              ) && (
                <section className="manager-close-section">
                  <header>
                    <span>{t("managerDetail.requestControl")}</span>

                    <h3>{t("managerDetail.cancelTitle")}</h3>

                    <p>{t("managerDetail.cancelDescription")}</p>
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
                      {t("managerDetail.cancelAction")}
                    </button>
                  ) : (
                    <form
                      className="manager-cancel-form"
                      onSubmit={handleCancel}
                    >
                      <label htmlFor="manager-request-cancel-reason">{t("managerDetail.cancelReasonLabel")}</label>

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
                        placeholder={t("managerDetail.cancelPlaceholder")}
                        disabled={cancelling}
                        required
                      />

                      <div className="manager-cancel-meta">
                        <span>{t("common.minimum3")}</span>

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
                            ? t("managerDetail.cancelling")
                            : t("managerDetail.confirmCancel")}
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
                          {t("managerDetail.keepRequest")}
                        </button>
                      </div>
                    </form>
                  )}
                </section>
              )}

            {!readOnly && detail.status === "REJECTED" && (
              <form className="manager-resubmit-form" onSubmit={handleResubmit}>
                <header>
                  <span>{t("managerDetail.correctResubmit")}</span>

                  <h3>{t("managerDetail.nextRevision")}</h3>

                  <p>{t("managerDetail.resubmitDescription")}</p>
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
                    <span>{t("common.employeeName")}</span>

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
                    <span>{t("common.employeeId")}</span>

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
                    <span>{t("common.phoneNumber")}</span>

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
                    <span>{t("common.officialEmail")}</span>

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
                    <span>{t("common.designation")}</span>

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
                      <span>{t("form.managedDepartment")}</span>

                      <select
                        value={form.departmentId}
                        onChange={(event) =>
                          updateField("departmentId", event.target.value)
                        }
                        disabled={submitting}
                        required
                      >
                        <option value="">{t("form.selectDepartment")}</option>

                        {requestContext.departments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name} ({department.code})
                          </option>
                        ))}
                      </select>

                      <small>{t("managerDetail.autoPositionHelp")}</small>
                    </label>
                  ) : (
                    <div className="manager-fixed-field">
                      <span>{t("common.department")}</span>

                      <strong>
                        {requestContext.scope.department?.name ??
                          t("common.notAssigned")}
                      </strong>

                      <small>{t("managerDetail.fixedScope")}</small>
                    </div>
                  )}
                </div>

                <div className="manager-resubmit-review">
                  <span>{t("managerDetail.resubmissionDepartment")}</span>

                  <strong>
                    {isSeniorManagement
                      ? (selectedDepartment?.name ?? t("form.selectDepartment"))
                      : (requestContext.scope.department?.name ??
                        t("common.notAssigned"))}
                  </strong>
                </div>

                <footer>
                  <button type="submit" disabled={submitting}>
                    {submitting ? t("managerDetail.resubmitting") : t("managerDetail.resubmit")}
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
