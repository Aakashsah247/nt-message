import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
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

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "the stated expiry time";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function ActivationPage() {
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
          "Organization information could not be loaded.",
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
            "The activation invitation is invalid or expired.",
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
      setError("Select your official division.");
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
      const response = await requestActivationOtp(normalizedIdentity);

      setIdentity(normalizedIdentity);
      setNotice(response.message);
      setStage("otp");
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          "The activation request could not be completed.",
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
      setError("Enter the complete six-digit OTP.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await verifyActivationOtp(identity, otp);

      setVerifiedResult(response);
      setNotice(
        "Official email verification completed. Create your secure password.",
      );
      setStage("password");
    } catch (requestError) {
      setOtp("");
      setError(
        getErrorMessage(
          requestError,
          "The activation code could not be verified.",
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
      const response = await requestActivationOtp(identity);

      setOtp("");
      setNotice(response.message);
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          "Another activation code could not be requested.",
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
      setError("Verify the activation OTP before creating a password.");
      return;
    }

    if (password !== confirmPassword) {
      setConfirmPassword("");
      setError("Password confirmation does not match.");
      return;
    }

    const securePassword =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/;

    if (!securePassword.test(password)) {
      setError(
        "Password must contain at least 12 characters, including uppercase, lowercase, number and special character.",
      );
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
        getErrorMessage(requestError, "The account could not be activated."),
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
          <img src="/nt-logo-transparent.png" alt="Nepal Telecom" />

          <div>
            <strong>NEPAL TELECOM MESSAGE</strong>
            <span>Secure employee communication</span>
          </div>
        </header>

        <div className="activation-info-copy">
          <span className="activation-secure-label">
            Verified employee onboarding
          </span>

          <h1>Activate your official communication account.</h1>

          <p>
            Your identity must match an approved Nepal Telecom employee record
            before access is granted.
          </p>

          <div className="activation-benefits">
            <div>
              <strong>1</strong>
              <span>Verify your approved employee information</span>
            </div>
            <div>
              <strong>2</strong>
              <span>Confirm the OTP sent to your official email</span>
            </div>
            <div>
              <strong>3</strong>
              <span>Create a secure password and activate access</span>
            </div>
          </div>
        </div>

        <footer className="activation-info-footer">
          Authorized Nepal Telecom personnel only
        </footer>
      </section>

      <section className="activation-workspace">
        <article className="activation-card">
          <header className="activation-card-header">
            <div className="activation-logo-tile">
              <img src="/nt-logo.png" alt="Nepal Telecom" />
            </div>

            <div>
              <span>NT Message</span>
              <h2>
                {stage === "success"
                  ? "Account activated"
                  : "Employee activation"}
              </h2>
            </div>
          </header>

          {stage !== "success" && (
            <div
              className="activation-progress"
              aria-label="Activation progress"
            >
              {[
                { number: 1, label: "Identity" },
                { number: 2, label: "OTP" },
                { number: 3, label: "Password" },
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
              <strong>Checking activation invitation</strong>
              <p>Verifying that this secure link is active and unused.</p>
            </div>
          )}

          {stage === "identity" && !invitationLoading && invitationError && (
            <div className="activation-invitation-state" role="alert">
              <strong>Invitation unavailable</strong>
              <p>{invitationError}</p>
              <button type="button" onClick={switchToManualActivation}>
                Continue with manual activation
              </button>
            </div>
          )}

          {stage === "identity" &&
            !invitationLoading &&
            (!invitationError || manualMode) && (
              <>
                <div className="activation-heading">
                  <p>Step 1 of 3</p>
                  <h3>Verify employee identity</h3>
                  <span>
                    {usingInvitation
                      ? `This invitation is valid until ${formatDate(
                          invitation!.expiresAt,
                        )}. Confirm your Employee ID and phone number.`
                      : "Enter the same information approved by Nepal Telecom management."}
                  </span>
                </div>

                {usingInvitation && (
                  <section className="activation-invitation-summary">
                    <div>
                      <span>Approved role</span>
                      <strong>{formatRole(invitation!.requestedRole)}</strong>
                    </div>
                    <div>
                      <span>Official division</span>
                      <strong>{invitation!.organization.divisionName}</strong>
                    </div>
                    <div>
                      <span>Official department</span>
                      <strong>
                        {invitation!.organization.departmentName ??
                          "Division-level role"}
                      </strong>
                    </div>
                  </section>
                )}

                <form
                  className="activation-form"
                  onSubmit={handleIdentitySubmit}
                >
                  <label className="activation-field">
                    <span>Employee full name</span>
                    <input
                      type="text"
                      value={identity.empName}
                      onChange={(event) =>
                        updateIdentity("empName", event.target.value)
                      }
                      placeholder="Official employee name"
                      autoComplete="name"
                      minLength={2}
                      maxLength={150}
                      readOnly={usingInvitation}
                      required
                    />
                  </label>

                  <label className="activation-field">
                    <span>Employee ID</span>
                    <input
                      type="text"
                      value={identity.empId}
                      onChange={(event) =>
                        updateIdentity(
                          "empId",
                          event.target.value.toUpperCase(),
                        )
                      }
                      placeholder="Example: NTC-1001"
                      minLength={2}
                      maxLength={50}
                      pattern="[A-Za-z0-9_-]+"
                      required
                    />
                  </label>

                  <label className="activation-field">
                    <span>Phone number</span>
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
                    <span>Official email</span>
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
                        <span>Official division</span>
                        <input
                          type="text"
                          value={invitation!.organization.divisionName}
                          readOnly
                        />
                      </label>

                      <label className="activation-field">
                        <span>Official department</span>
                        <input
                          type="text"
                          value={
                            invitation!.organization.departmentName ??
                            "No department — division-level role"
                          }
                          readOnly
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="activation-field">
                        <span>Official division</span>
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
                              ? "Loading divisions..."
                              : "Select your official division"}
                          </option>
                          {divisions.map((division) => (
                            <option key={division.id} value={division.id}>
                              {division.name} ({division.code})
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="activation-field">
                        <span>Official department</span>
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
                            No department — division-level role
                          </option>
                          {visibleDepartments.map((department) => (
                            <option key={department.id} value={department.id}>
                              {department.name} ({department.code})
                            </option>
                          ))}
                        </select>
                        {selectedDivision && (
                          <small>
                            Division: {selectedDivision.name}
                            {selectedDepartment
                              ? ` · Department: ${selectedDepartment.name}`
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
                        Try again
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
                      ? "Verifying information..."
                      : "Verify identity and send OTP"}
                  </button>

                  {usingInvitation && (
                    <div className="activation-secondary-actions activation-field-wide">
                      <button
                        type="button"
                        onClick={switchToManualActivation}
                        disabled={submitting}
                      >
                        Use manual activation instead
                      </button>
                    </div>
                  )}
                </form>
              </>
            )}

          {stage === "otp" && (
            <>
              <div className="activation-heading">
                <p>Step 2 of 3</p>
                <h3>Verify official email</h3>
                <span>
                  Enter the six-digit code sent to{" "}
                  <strong>{identity.officialEmail}</strong>.
                </span>
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
                  <span>Six-digit activation code</span>
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
                  {submitting ? "Verifying code..." : "Verify activation code"}
                </button>

                <div className="activation-secondary-actions">
                  <button
                    type="button"
                    onClick={() => void handleResendOtp()}
                    disabled={submitting}
                  >
                    Request another code
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
                    Change employee details
                  </button>
                </div>
              </form>
            </>
          )}

          {stage === "password" && verifiedResult && (
            <>
              <div className="activation-heading">
                <p>Step 3 of 3</p>
                <h3>Create secure password</h3>
                <span>
                  Activating <strong>{verifiedResult.employee.empName}</strong>{" "}
                  as{" "}
                  <strong>
                    {formatRole(verifiedResult.accountRequest.requestedRole)}
                  </strong>
                  .
                </span>
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
                  <span>New password</span>
                  <div className="activation-password-field">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Create a secure password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={128}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </label>

                <label className="activation-field activation-field-wide">
                  <span>Confirm password</span>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Enter the password again"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    required
                  />
                </label>

                <div className="activation-password-rules">
                  Use at least 12 characters with uppercase, lowercase, number
                  and special character.
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
                    ? "Activating account..."
                    : "Create password and activate"}
                </button>
              </form>
            </>
          )}

          {stage === "success" && completionResult && (
            <section className="activation-success">
              <div className="activation-success-icon" aria-hidden="true">
                ✓
              </div>
              <p>Activation completed</p>
              <h3>Welcome to NT Message</h3>
              <span>
                The account for{" "}
                <strong>{completionResult.employee.empName}</strong> has been
                activated as{" "}
                <strong>{formatRole(completionResult.account.role)}</strong>.
              </span>
              <Link
                className="activation-primary activation-login-link"
                to="/login"
              >
                Continue to secure login
              </Link>
            </section>
          )}

          {stage !== "success" && (
            <footer className="activation-card-footer">
              Already activated? <Link to="/login">Return to login</Link>
            </footer>
          )}
        </article>
      </section>
    </main>
  );
}
