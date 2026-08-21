import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";

import {
  completeActivation,
  getActivationInvitationPreview,
  getPublicDepartments,
  getPublicDivisions,
  requestActivationOtp,
  verifyActivationOtp,
} from "../services/activation.service";

import type {
  ActivationIdentity,
  ActivationInvitationPreview,
  CompleteActivationResponse,
  PublicDepartment,
  PublicDivision,
  VerifyActivationOtpResponse,
} from "../types/activation";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  isSecurePassword,
} from "../utils/password-policy";

type ActivationStage = "identity" | "otp" | "password" | "success";

const emptyIdentity: ActivationIdentity = {
  empName: "",
  empId: "",
  phoneNumber: "",
  officialEmail: "",
  divisionId: "",
  departmentId: null,
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatRole(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(
  value: string,
  language: string,
  fallback: string,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  // UI language may localize labels/digits, but activation expiry stays AD/Gregorian.
  const locale = language === "ne" ? "ne-NP-u-ca-gregory" : "en-GB";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function ActivationPage() {
  const { t, i18n } = useTranslation(["auth", "common", "workspace"]);
  const [searchParams] = useSearchParams();
  // The bearer token is read only from the invitation URL and is never copied
  // into localStorage, sessionStorage, analytics state, or visible form fields.
  const invitationToken = searchParams.get("invitation")?.trim() ?? "";

  const [stage, setStage] = useState<ActivationStage>("identity");
  const [identity, setIdentity] = useState<ActivationIdentity>(emptyIdentity);
  const [divisions, setDivisions] = useState<PublicDivision[]>([]);
  const [departments, setDepartments] = useState<PublicDepartment[]>([]);
  const [organizationLoading, setOrganizationLoading] = useState(true);
  const [organizationError, setOrganizationError] = useState("");
  const [invitation, setInvitation] =
    useState<ActivationInvitationPreview | null>(null);
  const [invitationLoading, setInvitationLoading] = useState(
    Boolean(invitationToken),
  );
  const [invitationError, setInvitationError] = useState("");
  const [manualMode, setManualMode] = useState(!invitationToken);
  const [otp, setOtp] = useState("");
  const [verifiedResult, setVerifiedResult] =
    useState<VerifyActivationOtpResponse | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [completionResult, setCompletionResult] =
    useState<CompleteActivationResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const usingInvitation = Boolean(invitation && !manualMode);

  function getRoleLabel(role: string): string {
    switch (role) {
      case "SUPER_ADMIN":
        return t("roles.superAdmin", { ns: "workspace" });
      case "SENIOR_MANAGEMENT":
        return t("roles.seniorManagement", { ns: "workspace" });
      case "TEAM_MANAGER":
        return t("roles.teamManager", { ns: "workspace" });
      case "EMPLOYEE":
        return t("roles.employee", { ns: "workspace" });
      default:
        return formatRole(role);
    }
  }

  async function loadOrganization(): Promise<void> {
    setOrganizationLoading(true);
    setOrganizationError("");

    try {
      const [divisionResponse, departmentResponse] = await Promise.all([
        getPublicDivisions(),
        getPublicDepartments(),
      ]);

      setDivisions(divisionResponse.data);
      setDepartments(departmentResponse.data);
    } catch (requestError) {
      setOrganizationError(
        getErrorMessage(
          requestError,
          t("activation.errors.organizationLoad", { ns: "auth" }),
        ),
      );
    } finally {
      setOrganizationLoading(false);
    }
  }

  useEffect(() => {
    void loadOrganization();
  }, []);

  useEffect(() => {
    if (!invitationToken) {
      setInvitationLoading(false);
      setManualMode(true);
      return;
    }

    let active = true;
    setInvitationLoading(true);
    setInvitationError("");

    getActivationInvitationPreview(invitationToken)
      .then((preview) => {
        if (!active) {
          return;
        }

        /*
         * Approved identity and organization values remain read-only. The user
         * confirms only Employee ID and phone before the existing OTP flow.
         */
        setInvitation(preview);
        setIdentity({
          empName: preview.employee.empName,
          empId: "",
          phoneNumber: "",
          officialEmail: preview.employee.officialEmail,
          divisionId: preview.organization.divisionId,
          departmentId: preview.organization.departmentId,
        });
        setManualMode(false);
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setInvitation(null);
        setInvitationError(
          getErrorMessage(
            requestError,
            t("activation.errors.invitationInvalid", { ns: "auth" }),
          ),
        );
      })
      .finally(() => {
        if (active) {
          setInvitationLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [invitationToken]);

  const visibleDepartments = useMemo(
    () =>
      departments.filter(
        (department) => department.divisionId === identity.divisionId,
      ),
    [departments, identity.divisionId],
  );

  const selectedDivision = useMemo(
    () => divisions.find((division) => division.id === identity.divisionId),
    [divisions, identity.divisionId],
  );

  const selectedDepartment = useMemo(
    () =>
      departments.find((department) => department.id === identity.departmentId),
    [departments, identity.departmentId],
  );

  const currentStep = stage === "identity" ? 1 : stage === "otp" ? 2 : 3;

  function updateIdentity(
    field: keyof ActivationIdentity,
    value: string | null,
  ): void {
    setIdentity((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function switchToManualActivation(): void {
    setManualMode(true);
    setInvitation(null);
    setInvitationError("");
    setIdentity(emptyIdentity);
    setError("");
    setNotice("");
  }

  async function handleIdentitySubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!identity.divisionId) {
      setError(t("activation.errors.selectDivision", { ns: "auth" }));
      return;
    }

    const normalizedIdentity: ActivationIdentity = {
      empName: identity.empName.trim(),
      empId: identity.empId.trim().toUpperCase(),
      phoneNumber: identity.phoneNumber.trim(),
      officialEmail: identity.officialEmail.trim(),
      divisionId: identity.divisionId,
      departmentId: identity.departmentId || null,
    };

    setSubmitting(true);

    try {
      await requestActivationOtp(normalizedIdentity);

      setIdentity(normalizedIdentity);
      setNotice(t("activation.notices.otpSent", { ns: "auth" }));
      setStage("otp");
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          t("activation.errors.requestFailed", { ns: "auth" }),
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOtpSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!/^[0-9]{6}$/.test(otp)) {
      setError(t("activation.errors.otpIncomplete", { ns: "auth" }));
      return;
    }

    setSubmitting(true);

    try {
      const response = await verifyActivationOtp(identity, otp);

      setVerifiedResult(response);
      setNotice(t("activation.notices.emailVerified", { ns: "auth" }));
      setStage("password");
    } catch (requestError) {
      setOtp("");
      setError(
        getErrorMessage(
          requestError,
          t("activation.errors.otpVerificationFailed", { ns: "auth" }),
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendOtp(): Promise<void> {
    setError("");
    setNotice("");
    setSubmitting(true);

    try {
      await requestActivationOtp(identity);

      setOtp("");
      setNotice(t("activation.notices.otpResent", { ns: "auth" }));
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          t("activation.errors.otpResendFailed", { ns: "auth" }),
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!verifiedResult) {
      setError(t("activation.errors.verifyOtpFirst", { ns: "auth" }));
      return;
    }

    if (password !== confirmPassword) {
      setConfirmPassword("");
      setError(t("activation.errors.passwordMismatch", { ns: "auth" }));
      return;
    }

    if (!isSecurePassword(password)) {
      setError(t("password.requirementsMessage", { ns: "common" }));
      return;
    }

    setSubmitting(true);

    try {
      const response = await completeActivation({
        activationToken: verifiedResult.activationToken,
        password,
        confirmPassword,
      });

      setCompletionResult(response);
      setPassword("");
      setConfirmPassword("");
      setStage("success");
    } catch (requestError) {
      setPassword("");
      setConfirmPassword("");
      setError(
        getErrorMessage(requestError, t("activation.errors.activationFailed", { ns: "auth" })),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="activation-shell">
      <section className="activation-info">
        <div className="activation-info-overlay" />

        <header className="activation-brand">
          <img src="/nt-logo-transparent.png" alt={t("brand.organization", { ns: "common" })} />

          <div>
            <strong>{t("brand.name", { ns: "common" })}</strong>
            <span>{t("brand.tagline", { ns: "common" })}</span>
          </div>
        </header>

        <div className="activation-info-copy">
          <span className="activation-secure-label">{t("activation.visual.badge", { ns: "auth" })}</span>

          <h1>{t("activation.visual.title", { ns: "auth" })}</h1>

          <p>{t("activation.visual.description", { ns: "auth" })}</p>

          <div className="activation-benefits">
            <div>
              <strong>1</strong>
              <span>{t("activation.visual.benefit1", { ns: "auth" })}</span>
            </div>
            <div>
              <strong>2</strong>
              <span>{t("activation.visual.benefit2", { ns: "auth" })}</span>
            </div>
            <div>
              <strong>3</strong>
              <span>{t("activation.visual.benefit3", { ns: "auth" })}</span>
            </div>
          </div>
        </div>

        <footer className="activation-info-footer">{t("brand.authorizedPersonnelOnly", { ns: "common" })}</footer>
      </section>

      <section className="activation-workspace">
        <article className="activation-card">
          <header className="activation-card-header">
            <div className="activation-logo-tile">
              <img src="/nt-logo.png" alt={t("brand.organization", { ns: "common" })} />
            </div>

            <div>
              <span>NT Message</span>
              <h2>
                {stage === "success"
                  ? t("activation.card.accountActivated", { ns: "auth" })
                  : t("activation.card.employeeActivation", { ns: "auth" })}
              </h2>
            </div>
          </header>

          {stage !== "success" && (
            <div
              className="activation-progress"
              aria-label={t("activation.card.progressAria", { ns: "auth" })}
            >
              {[
                { number: 1, label: t("activation.card.steps.identity", { ns: "auth" }) },
                { number: 2, label: t("activation.card.steps.otp", { ns: "auth" }) },
                { number: 3, label: t("activation.card.steps.password", { ns: "auth" }) },
              ].map((step) => (
                <div
                  className={
                    currentStep >= step.number
                      ? "activation-step active"
                      : "activation-step"
                  }
                  key={step.number}
                >
                  <span>{step.number}</span>
                  <small>{step.label}</small>
                </div>
              ))}
            </div>
          )}

          {stage === "identity" && invitationLoading && (
            <div className="activation-invitation-state" aria-live="polite">
              <div className="spinner" aria-hidden="true" />
              <strong>{t("activation.invitation.checkingTitle", { ns: "auth" })}</strong>
              <p>{t("activation.invitation.checkingDescription", { ns: "auth" })}</p>
            </div>
          )}

          {stage === "identity" && !invitationLoading && invitationError && (
            <div className="activation-invitation-state" role="alert">
              <strong>{t("activation.invitation.unavailableTitle", { ns: "auth" })}</strong>
              <p>{invitationError}</p>
              <button type="button" onClick={switchToManualActivation}>{t("activation.invitation.manualAction", { ns: "auth" })}</button>
            </div>
          )}

          {stage === "identity" &&
            !invitationLoading &&
            (!invitationError || manualMode) && (
              <>
                <div className="activation-heading">
                  <p>{t("activation.identity.step", { ns: "auth" })}</p>
                  <h3>{t("activation.identity.title", { ns: "auth" })}</h3>
                  <span>
                    {usingInvitation
                      ? t("activation.invitation.validUntil", {
                          ns: "auth",
                          expiry: formatDate(
                            invitation!.expiresAt,
                            i18n.resolvedLanguage ?? i18n.language,
                            t("activation.date.invalidExpiry", { ns: "auth" }),
                          ),
                        })
                      : t("activation.invitation.manualDescription", { ns: "auth" })}
                  </span>
                </div>

                {usingInvitation && (
                  <section className="activation-invitation-summary">
                    <div>
                      <span>{t("activation.invitation.approvedRole", { ns: "auth" })}</span>
                      <strong>{getRoleLabel(invitation!.requestedRole)}</strong>
                    </div>
                    <div>
                      <span>{t("activation.identity.officialDivision", { ns: "auth" })}</span>
                      <strong>{invitation!.organization.divisionName}</strong>
                    </div>
                    <div>
                      <span>{t("activation.identity.officialDepartment", { ns: "auth" })}</span>
                      <strong>
                        {invitation!.organization.departmentName ??
                          t("activation.invitation.divisionLevelRole", { ns: "auth" })}
                      </strong>
                    </div>
                  </section>
                )}

                <form
                  className="activation-form"
                  onSubmit={handleIdentitySubmit}
                >
                  <label className="activation-field">
                    <span>{t("activation.identity.employeeFullName", { ns: "auth" })}</span>
                    <input
                      type="text"
                      value={identity.empName}
                      onChange={(event) =>
                        updateIdentity("empName", event.target.value)
                      }
                      placeholder={t("activation.identity.employeeNamePlaceholder", { ns: "auth" })}
                      autoComplete="name"
                      minLength={2}
                      maxLength={150}
                      readOnly={usingInvitation}
                      required
                    />
                  </label>

                  <label className="activation-field">
                    <span>{t("activation.identity.employeeId", { ns: "auth" })}</span>
                    <input
                      type="text"
                      value={identity.empId}
                      onChange={(event) =>
                        updateIdentity(
                          "empId",
                          event.target.value.toUpperCase(),
                        )
                      }
                      placeholder={t("activation.identity.employeeIdPlaceholder", { ns: "auth" })}
                      minLength={2}
                      maxLength={50}
                      pattern="[A-Za-z0-9_-]+"
                      required
                    />
                  </label>

                  <label className="activation-field">
                    <span>{t("activation.identity.phoneNumber", { ns: "auth" })}</span>
                    <input
                      type="tel"
                      value={identity.phoneNumber}
                      onChange={(event) =>
                        updateIdentity("phoneNumber", event.target.value)
                      }
                      placeholder="+97798XXXXXXXX"
                      autoComplete="tel"
                      pattern="(?:9[0-9]{9}|9779[0-9]{9}|\+9779[0-9]{9})"
                      required
                    />
                  </label>

                  <label className="activation-field">
                    <span>{t("activation.identity.officialEmail", { ns: "auth" })}</span>
                    <input
                      type="email"
                      value={identity.officialEmail}
                      onChange={(event) =>
                        updateIdentity("officialEmail", event.target.value)
                      }
                      placeholder="name@ntc.net.np"
                      autoComplete="email"
                      maxLength={255}
                      readOnly={usingInvitation}
                      required
                    />
                  </label>

                  {usingInvitation ? (
                    <>
                      <label className="activation-field">
                        <span>{t("activation.identity.officialDivision", { ns: "auth" })}</span>
                        <input
                          type="text"
                          value={invitation!.organization.divisionName}
                          readOnly
                        />
                      </label>

                      <label className="activation-field">
                        <span>{t("activation.identity.officialDepartment", { ns: "auth" })}</span>
                        <input
                          type="text"
                          value={
                            invitation!.organization.departmentName ??
                            t("activation.identity.noDepartment", { ns: "auth" })
                          }
                          readOnly
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="activation-field">
                        <span>{t("activation.identity.officialDivision", { ns: "auth" })}</span>
                        <select
                          value={identity.divisionId}
                          onChange={(event) => {
                            updateIdentity("divisionId", event.target.value);
                            updateIdentity("departmentId", null);
                          }}
                          disabled={
                            organizationLoading || Boolean(organizationError)
                          }
                          required
                        >
                          <option value="">
                            {organizationLoading
                              ? t("activation.identity.loadingDivisions", { ns: "auth" })
                              : t("activation.identity.selectDivision", { ns: "auth" })}
                          </option>
                          {divisions.map((division) => (
                            <option key={division.id} value={division.id}>
                              {division.name} ({division.code})
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="activation-field">
                        <span>{t("activation.identity.officialDepartment", { ns: "auth" })}</span>
                        <select
                          value={identity.departmentId ?? ""}
                          onChange={(event) =>
                            updateIdentity(
                              "departmentId",
                              event.target.value || null,
                            )
                          }
                          disabled={
                            organizationLoading ||
                            Boolean(organizationError) ||
                            !identity.divisionId
                          }
                        >
                          <option value="">
                            {t("activation.identity.noDepartment", { ns: "auth" })}
                          </option>
                          {visibleDepartments.map((department) => (
                            <option key={department.id} value={department.id}>
                              {department.name} ({department.code})
                            </option>
                          ))}
                        </select>
                        {selectedDivision && (
                          <small>
                            {t("activation.identity.divisionContext", { ns: "auth", division: selectedDivision.name })}
                            {selectedDepartment
                              ? t("activation.identity.departmentContext", { ns: "auth", department: selectedDepartment.name })
                              : ""}
                          </small>
                        )}
                      </label>
                    </>
                  )}

                  {organizationError && !usingInvitation && (
                    <div className="activation-load-error activation-field-wide">
                      <span>{organizationError}</span>
                      <button
                        type="button"
                        onClick={() => void loadOrganization()}
                      >
                        {t("actions.tryAgain", { ns: "common" })}
                      </button>
                    </div>
                  )}

                  {error && (
                    <div
                      className="activation-error activation-field-wide"
                      role="alert"
                    >
                      {error}
                    </div>
                  )}

                  <button
                    className="activation-primary activation-field-wide"
                    type="submit"
                    disabled={
                      submitting ||
                      (!usingInvitation &&
                        (organizationLoading || Boolean(organizationError)))
                    }
                  >
                    {submitting
                      ? t("activation.identity.verifying", { ns: "auth" })
                      : t("activation.identity.submit", { ns: "auth" })}
                  </button>

                  {usingInvitation && (
                    <div className="activation-secondary-actions activation-field-wide">
                      <button
                        type="button"
                        onClick={switchToManualActivation}
                        disabled={submitting}
                      >
                        {t("activation.identity.manualInstead", { ns: "auth" })}
                      </button>
                    </div>
                  )}
                </form>
              </>
            )}

          {stage === "otp" && (
            <>
              <div className="activation-heading">
                <p>{t("activation.otp.step", { ns: "auth" })}</p>
                <h3>{t("activation.otp.title", { ns: "auth" })}</h3>
                <span><Trans ns="auth" i18nKey="activation.otp.description" values={{ email: identity.officialEmail }} components={{ strong: <strong /> }} /></span>
              </div>

              <form
                className="activation-form activation-single-form"
                onSubmit={handleOtpSubmit}
              >
                {notice && (
                  <div className="activation-notice" role="status">
                    {notice}
                  </div>
                )}

                <label className="activation-field activation-field-wide">
                  <span>{t("activation.otp.codeLabel", { ns: "auth" })}</span>
                  <input
                    className="activation-otp-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(event) =>
                      setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="000000"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    required
                    autoFocus
                  />
                </label>

                {error && (
                  <div className="activation-error" role="alert">
                    {error}
                  </div>
                )}

                <button
                  className="activation-primary"
                  type="submit"
                  disabled={submitting || otp.length !== 6}
                >
                  {submitting ? t("activation.otp.verifying", { ns: "auth" }) : t("activation.otp.submit", { ns: "auth" })}
                </button>

                <div className="activation-secondary-actions">
                  <button
                    type="button"
                    onClick={() => void handleResendOtp()}
                    disabled={submitting}
                  >
                    {t("activation.otp.requestAnother", { ns: "auth" })}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setNotice("");
                      setOtp("");
                      setStage("identity");
                    }}
                    disabled={submitting}
                  >
                    {t("activation.otp.changeDetails", { ns: "auth" })}
                  </button>
                </div>
              </form>
            </>
          )}

          {stage === "password" && verifiedResult && (
            <>
              <div className="activation-heading">
                <p>{t("activation.password.step", { ns: "auth" })}</p>
                <h3>{t("activation.password.title", { ns: "auth" })}</h3>
                <span><Trans ns="auth" i18nKey="activation.password.activatingAs" values={{ name: verifiedResult.employee.empName, role: getRoleLabel(verifiedResult.accountRequest.requestedRole) }} components={{ strong: <strong /> }} /></span>
              </div>

              <form
                className="activation-form activation-single-form"
                onSubmit={handlePasswordSubmit}
              >
                {notice && (
                  <div className="activation-notice" role="status">
                    {notice}
                  </div>
                )}

                <label className="activation-field activation-field-wide">
                  <span>{t("activation.password.newPassword", { ns: "auth" })}</span>
                  <div className="activation-password-field">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={t("activation.password.newPasswordPlaceholder", { ns: "auth" })}
                      autoComplete="new-password"
                      minLength={PASSWORD_MIN_LENGTH}
                      maxLength={PASSWORD_MAX_LENGTH}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      aria-label={
                        showPassword ? t("actions.hidePassword", { ns: "common" }) : t("actions.showPassword", { ns: "common" })
                      }
                    >
                      {showPassword ? t("actions.hide", { ns: "common" }) : t("actions.show", { ns: "common" })}
                    </button>
                  </div>
                </label>

                <label className="activation-field activation-field-wide">
                  <span>{t("activation.password.confirmPassword", { ns: "auth" })}</span>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder={t("activation.password.confirmPasswordPlaceholder", { ns: "auth" })}
                    autoComplete="new-password"
                    minLength={PASSWORD_MIN_LENGTH}
                    maxLength={PASSWORD_MAX_LENGTH}
                    required
                  />
                </label>

                <div className="activation-password-rules">
                  {t("password.requirementsMessage", { ns: "common" })}
                </div>

                {error && (
                  <div className="activation-error" role="alert">
                    {error}
                  </div>
                )}

                <button
                  className="activation-primary"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting
                    ? t("activation.password.activating", { ns: "auth" })
                    : t("activation.password.submit", { ns: "auth" })}
                </button>
              </form>
            </>
          )}

          {stage === "success" && completionResult && (
            <section className="activation-success">
              <div className="activation-success-icon" aria-hidden="true">
                ✓
              </div>
              <p>{t("activation.success.eyebrow", { ns: "auth" })}</p>
              <h3>{t("activation.success.title", { ns: "auth" })}</h3>
              <span><Trans ns="auth" i18nKey="activation.success.description" values={{ name: completionResult.employee.empName, role: getRoleLabel(completionResult.account.role) }} components={{ strong: <strong /> }} /></span>
              <Link
                className="activation-primary activation-login-link"
                to="/login"
              >
                {t("activation.success.continue", { ns: "auth" })}
              </Link>
            </section>
          )}

          {stage !== "success" && (
            <footer className="activation-card-footer">
              {t("activation.footer.alreadyActivated", { ns: "auth" })}{" "}<Link to="/login">{t("activation.footer.returnToLogin", { ns: "auth" })}</Link>
            </footer>
          )}
        </article>
      </section>
    </main>
  );
}
