import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";

import {
  completePasswordReset,
  requestPasswordReset,
  verifyPasswordResetOtp,
} from "../services/auth.service";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_MESSAGE,
  getPasswordRuleChecks,
  isSecurePassword,
} from "../utils/password-policy";

type RecoveryStep = "email" | "otp" | "password" | "success";

export function ForgotPasswordPage() {
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [step, setStep] = useState<RecoveryStep>("email");
  const [officialEmail, setOfficialEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const passwordRules = useMemo(
    () => getPasswordRuleChecks(newPassword),
    [newPassword],
  );

  const completedRules = Object.values(passwordRules).filter(Boolean).length;

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (resendSeconds <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setResendSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  async function handleEmailSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setError("");
    setNotice("");
    setSubmitting(true);

    try {
      const response = await requestPasswordReset(officialEmail.trim());

      /*
       * API response is deliberately generic. Advancing every valid email
       * format to OTP entry prevents account enumeration in the UI.
       */
      setNotice(response.message);
      setResendSeconds(response.resendAfterSeconds);
      setStep("otp");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The recovery request could not be completed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend(): Promise<void> {
    if (submitting || resendSeconds > 0) {
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      const response = await requestPasswordReset(officialEmail.trim());

      setNotice(response.message);
      setResendSeconds(response.resendAfterSeconds);
      setOtp("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "A new recovery code could not be requested.",
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
    setSubmitting(true);

    try {
      const response = await verifyPasswordResetOtp(
        officialEmail.trim(),
        otp.trim(),
      );

      /*
       * Opaque reset token stays only in React memory. It is never copied
       * into a URL, localStorage, sessionStorage or analytics event.
       */
      setResetToken(response.resetToken);
      setOtp("");
      setNotice(response.message);
      setStep("password");
    } catch (requestError) {
      setOtp("");
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The recovery code could not be verified.",
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

    if (!isSecurePassword(newPassword)) {
      setError(PASSWORD_REQUIREMENTS_MESSAGE);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Password confirmation does not match.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await completePasswordReset(
        resetToken,
        newPassword,
        confirmPassword,
      );

      setNewPassword("");
      setConfirmPassword("");
      setResetToken("");
      setNotice(response.message);
      setStep("success");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The password could not be reset.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function restartRecovery(): void {
    setStep("email");
    setOfficialEmail("");
    setOtp("");
    setResetToken("");
    setNewPassword("");
    setConfirmPassword("");
    setNotice("");
    setError("");
    setResendSeconds(0);
  }

  const stepNumber =
    step === "email" ? 1 : step === "otp" ? 2 : 3;

  return (
    <main className="login-shell password-recovery-shell">
      <section className="visual-panel">
        <div className="visual-orbit" />

        <header className="visual-brand">
          <div className="left-logo-wrap">
            <img
              src="/nt-logo-transparent.png"
              alt="Nepal Telecom"
              className="left-logo"
            />
          </div>

          <div>
            <h1>NEPAL TELECOM MESSAGE</h1>
            <p>नेपाल टेलिकम · Secure employee communication</p>
          </div>
        </header>

        <div className="visual-copy password-recovery-visual-copy">
          <span className="secure-badge">Protected account recovery</span>

          <h2>
            Recover access.
            <br />
            Protect every session.
          </h2>

          <p>
            Reset your NT Message password through your approved official
            email without exposing account availability or credentials.
          </p>

          <div className="feature-list">
            <article className="feature-item">
              <span className="feature-number gold">1</span>
              <div>
                <h3>Private account lookup</h3>
                <p>Generic responses prevent official-email enumeration.</p>
              </div>
            </article>

            <article className="feature-item">
              <span className="feature-number red">2</span>
              <div>
                <h3>One-time verification</h3>
                <p>Hashed OTP, expiry, attempt limits and resend cooldown.</p>
              </div>
            </article>

            <article className="feature-item">
              <span className="feature-number green">3</span>
              <div>
                <h3>Complete session protection</h3>
                <p>Every active device signs out after a successful reset.</p>
              </div>
            </article>
          </div>
        </div>

        <footer className="visual-footer">
          Authorized Nepal Telecom employees only
        </footer>
      </section>

      <section className="login-area password-recovery-area">
        <div className="login-card-new password-recovery-card">
          <div className="card-brand">
            <div className="logo-tile">
              <img src="/nt-logo.png" alt="Nepal Telecom" />
            </div>

            <div>
              <strong>NEPAL TELECOM MESSAGE</strong>
              <span>Nepal Telecom</span>
            </div>
          </div>

          <div className="password-recovery-heading">
            <div>
              <p>Secure account recovery</p>
              <h2 ref={headingRef} tabIndex={-1}>
                {step === "email" && "Forgot your password?"}
                {step === "otp" && "Verify recovery code"}
                {step === "password" && "Create a new password"}
                {step === "success" && "Password reset complete"}
              </h2>
            </div>

            {step !== "success" && (
              <span className="password-recovery-step-count">
                Step {stepNumber} of 3
              </span>
            )}
          </div>

          {step !== "success" && (
            <ol
              className="password-recovery-progress"
              aria-label="Password recovery progress"
            >
              {["Official email", "Verify code", "New password"].map(
                (label, index) => {
                  const number = index + 1;
                  const active = number === stepNumber;
                  const complete = number < stepNumber;

                  return (
                    <li
                      key={label}
                      data-active={active}
                      data-complete={complete}
                    >
                      <span>{complete ? "✓" : number}</span>
                      <small>{label}</small>
                    </li>
                  );
                },
              )}
            </ol>
          )}

          {notice && step !== "success" && (
            <div className="password-recovery-notice" role="status">
              <span aria-hidden="true">i</span>
              <p>{notice}</p>
            </div>
          )}

          {error && (
            <div className="password-recovery-error" role="alert">
              <strong>Recovery could not continue</strong>
              <span>{error}</span>
            </div>
          )}

          {step === "email" && (
            <form
              className="password-recovery-form"
              onSubmit={handleEmailSubmit}
            >
              <label htmlFor="recovery-email">
                Official email

                <input
                  id="recovery-email"
                  type="email"
                  value={officialEmail}
                  onChange={(event) => setOfficialEmail(event.target.value)}
                  placeholder="name@ntc.net.np"
                  autoComplete="email"
                  maxLength={255}
                  disabled={submitting}
                  required
                />
              </label>

              <p className="password-recovery-help">
                For privacy, the same confirmation is shown whether or not
                the email belongs to an eligible NT Message account.
              </p>

              <button
                className="sign-in-btn"
                type="submit"
                disabled={submitting}
              >
                <span>
                  {submitting ? "Requesting code..." : "Continue securely"}
                </span>
              </button>
            </form>
          )}

          {step === "otp" && (
            <form
              className="password-recovery-form"
              onSubmit={handleOtpSubmit}
            >
              <div className="password-recovery-account">
                <div>
                  <small>Recovery email</small>
                  <strong>{officialEmail}</strong>
                </div>

                <button
                  type="button"
                  onClick={restartRecovery}
                  disabled={submitting}
                >
                  Change
                </button>
              </div>

              <label htmlFor="recovery-otp">
                Six-digit recovery code

                <input
                  id="recovery-otp"
                  className="password-recovery-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(event) =>
                    setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="000000"
                  minLength={6}
                  maxLength={6}
                  disabled={submitting}
                  required
                />
              </label>

              <div className="password-recovery-resend">
                <span>Didn&apos;t receive the code?</span>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={submitting || resendSeconds > 0}
                >
                  {resendSeconds > 0
                    ? `Request again in ${resendSeconds}s`
                    : "Request a new code"}
                </button>
              </div>

              <button
                className="sign-in-btn"
                type="submit"
                disabled={submitting || otp.length !== 6}
              >
                <span>
                  {submitting ? "Verifying code..." : "Verify code"}
                </span>
              </button>
            </form>
          )}

          {step === "password" && (
            <form
              className="password-recovery-form"
              onSubmit={handlePasswordSubmit}
            >
              <label htmlFor="reset-new-password">
                New password

                <div className="password-field">
                  <input
                    id="reset-new-password"
                    type={showPasswords ? "text" : "password"}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={PASSWORD_MIN_LENGTH}
                    maxLength={PASSWORD_MAX_LENGTH}
                    disabled={submitting}
                    required
                  />

                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPasswords((current) => !current)}
                    aria-label={
                      showPasswords ? "Hide passwords" : "Show passwords"
                    }
                    disabled={submitting}
                  >
                    {showPasswords ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              <label htmlFor="reset-confirm-password">
                Confirm new password

                <input
                  id="reset-confirm-password"
                  type={showPasswords ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(event.target.value)
                  }
                  autoComplete="new-password"
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                  disabled={submitting}
                  required
                />
              </label>

              <section
                className="password-recovery-rules"
                aria-live="polite"
              >
                <header>
                  <strong>Password standard</strong>
                  <span>{completedRules}/5</span>
                </header>

                <ul>
                  <li data-valid={passwordRules.length}>12–128 characters</li>
                  <li data-valid={passwordRules.uppercase}>
                    One uppercase letter
                  </li>
                  <li data-valid={passwordRules.lowercase}>
                    One lowercase letter
                  </li>
                  <li data-valid={passwordRules.number}>One number</li>
                  <li data-valid={passwordRules.special}>
                    One special character
                  </li>
                </ul>
              </section>

              <button
                className="sign-in-btn"
                type="submit"
                disabled={submitting}
              >
                <span>
                  {submitting ? "Resetting password..." : "Reset password"}
                </span>
              </button>
            </form>
          )}

          {step === "success" && (
            <section className="password-recovery-success">
              <span aria-hidden="true">✓</span>

              <h3>Your password is secure and ready</h3>
              <p>{notice}</p>

              <ul>
                <li>Your previous password no longer works.</li>
                <li>Every active NT Message session was signed out.</li>
                <li>A security confirmation was sent to your official email.</li>
              </ul>

              <Link className="sign-in-btn" to="/login">
                <span>Return to sign in</span>
              </Link>
            </section>
          )}

          {step !== "success" && (
            <p className="password-recovery-login-link">
              Remembered your password?{" "}
              <Link to="/login">Return to sign in</Link>
            </p>
          )}

          <div className="security-strip">
            <strong>Protected by Nepal Telecom security policies</strong>
            <span>नेपाल टेलिकम — राष्ट्रको सञ्चार</span>
          </div>
        </div>
      </section>
    </main>
  );
}
