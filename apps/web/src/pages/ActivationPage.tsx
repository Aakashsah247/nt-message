import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";

import {
  completeActivation,
  getPublicDepartments,
  requestActivationOtp,
  verifyActivationOtp,
} from "../services/activation.service";

import type {
  ActivationIdentity,
  CompleteActivationResponse,
  PublicDepartment,
  VerifyActivationOtpResponse,
} from "../types/activation";

type ActivationStage = "identity" | "otp" | "password" | "success";

const emptyIdentity: ActivationIdentity = {
  empName: "",
  empId: "",
  phoneNumber: "",
  officialEmail: "",
  departmentId: "",
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

export function ActivationPage() {
  const [stage, setStage] = useState<ActivationStage>("identity");

  const [identity, setIdentity] = useState<ActivationIdentity>(emptyIdentity);

  const [departments, setDepartments] = useState<PublicDepartment[]>([]);

  const [departmentsLoading, setDepartmentsLoading] = useState(true);

  const [departmentError, setDepartmentError] = useState("");

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

  async function loadDepartments(): Promise<void> {
    setDepartmentsLoading(true);
    setDepartmentError("");

    try {
      const response = await getPublicDepartments();

      setDepartments(response.data);
    } catch (requestError) {
      setDepartmentError(
        getErrorMessage(requestError, "Departments could not be loaded."),
      );
    } finally {
      setDepartmentsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    getPublicDepartments()
      .then((response) => {
        if (!active) {
          return;
        }

        setDepartments(response.data);

        setDepartmentError("");
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setDepartmentError(
          getErrorMessage(requestError, "Departments could not be loaded."),
        );
      })
      .finally(() => {
        if (active) {
          setDepartmentsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const departmentGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        id: string;
        label: string;
        departments: PublicDepartment[];
      }
    >();

    for (const department of departments) {
      const divisionId = department.division.id;

      const existing = groups.get(divisionId);

      if (existing) {
        existing.departments.push(department);

        continue;
      }

      groups.set(divisionId, {
        id: divisionId,

        label: department.division.name,

        departments: [department],
      });
    }

    return Array.from(groups.values());
  }, [departments]);

  const currentStep = stage === "identity" ? 1 : stage === "otp" ? 2 : 3;

  function updateIdentity(
    field: keyof ActivationIdentity,
    value: string,
  ): void {
    setIdentity((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleIdentitySubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    setError("");
    setNotice("");

    if (!identity.departmentId) {
      setError("Select your official department.");

      return;
    }

    setSubmitting(true);

    try {
      const response = await requestActivationOtp({
        empName: identity.empName.trim(),

        empId: identity.empId.trim().toUpperCase(),

        phoneNumber: identity.phoneNumber.trim(),

        officialEmail: identity.officialEmail.trim().toLowerCase(),

        departmentId: identity.departmentId,
      });

      setIdentity((current) => ({
        ...current,

        empName: current.empName.trim(),

        empId: current.empId.trim().toUpperCase(),

        phoneNumber: current.phoneNumber.trim(),

        officialEmail: current.officialEmail.trim().toLowerCase(),
      }));

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
                {
                  number: 1,
                  label: "Identity",
                },
                {
                  number: 2,
                  label: "OTP",
                },
                {
                  number: 3,
                  label: "Password",
                },
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

          {stage === "identity" && (
            <>
              <div className="activation-heading">
                <p>Step 1 of 3</p>

                <h3>Verify employee identity</h3>

                <span>
                  Enter the same information approved by Nepal Telecom
                  management.
                </span>
              </div>

              <form className="activation-form" onSubmit={handleIdentitySubmit}>
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
                    required
                  />
                </label>

                <label className="activation-field">
                  <span>Employee ID</span>

                  <input
                    type="text"
                    value={identity.empId}
                    onChange={(event) =>
                      updateIdentity("empId", event.target.value.toUpperCase())
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
                    pattern="\+?[0-9]{7,20}"
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
                    required
                  />
                </label>

                <label className="activation-field activation-field-wide">
                  <span>Division and department</span>

                  <select
                    value={identity.departmentId}
                    onChange={(event) =>
                      updateIdentity("departmentId", event.target.value)
                    }
                    disabled={departmentsLoading || Boolean(departmentError)}
                    required
                  >
                    <option value="">
                      {departmentsLoading
                        ? "Loading departments..."
                        : "Select your official department"}
                    </option>

                    {departmentGroups.map((group) => (
                      <optgroup key={group.id} label={group.label}>
                        {group.departments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name} ({department.code})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>

                {departmentError && (
                  <div className="activation-load-error activation-field-wide">
                    <span>{departmentError}</span>

                    <button
                      type="button"
                      onClick={() => void loadDepartments()}
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
                    submitting || departmentsLoading || Boolean(departmentError)
                  }
                >
                  {submitting
                    ? "Verifying information..."
                    : "Verify identity and send OTP"}
                </button>
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
