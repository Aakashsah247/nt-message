import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import {
  completePasswordReset,
  requestPasswordReset,
  verifyPasswordResetOtp,
} from "../services/auth.service";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  getPasswordRuleChecks,
  isSecurePassword,
} from "../utils/password-policy";

type RecoveryStep = "email" | "otp" | "password" | "success";

export function ForgotPasswordPage() {
  const { t } = useTranslation(["auth", "common"]);
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
      setNotice(t("recovery.notices.requested", { ns: "auth" }));
      setResendSeconds(response.resendAfterSeconds);
      setStep("otp");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("recovery.errors.requestFailed", { ns: "auth" }),
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

      setNotice(t("recovery.notices.requested", { ns: "auth" }));
      setResendSeconds(response.resendAfterSeconds);
      setOtp("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("recovery.errors.resendFailed", { ns: "auth" }),
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
      setNotice(t("recovery.notices.verified", { ns: "auth" }));
      setStep("password");
    } catch (requestError) {
      setOtp("");
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("recovery.errors.verificationFailed", { ns: "auth" }),
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
      setError(t("password.requirementsMessage", { ns: "common" }));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t("recovery.errors.passwordMismatch", { ns: "auth" }));
      return;
    }

    setSubmitting(true);

    try {
      await completePasswordReset(
        resetToken,
        newPassword,
        confirmPassword,
      );

      setNewPassword("");
      setConfirmPassword("");
      setResetToken("");
      setNotice(t("recovery.notices.resetComplete", { ns: "auth" }));
      setStep("success");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("recovery.errors.resetFailed", { ns: "auth" }),
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
              alt={t("brand.organization", { ns: "common" })}
              className="left-logo"
            />
          </div>

          <div>
            <h1>{t("brand.name", { ns: "common" })}</h1>
            <p>{t("brand.organization", { ns: "common" })} · {t("brand.tagline", { ns: "common" })}</p>
          </div>
        </header>

        <div className="visual-copy password-recovery-visual-copy">
          <span className="secure-badge">{t("recovery.visual.badge", { ns: "auth" })}</span>

          <h2>{t("recovery.visual.headlineLine1", { ns: "auth" })}<br />{t("recovery.visual.headlineLine2", { ns: "auth" })}</h2>

          <p>{t("recovery.visual.description", { ns: "auth" })}</p>

          <div className="feature-list">
            <article className="feature-item">
              <span className="feature-number gold">1</span>
              <div>
                <h3>{t("recovery.visual.features.privacyTitle", { ns: "auth" })}</h3>
                <p>{t("recovery.visual.features.privacyDescription", { ns: "auth" })}</p>
              </div>
            </article>

            <article className="feature-item">
              <span className="feature-number red">2</span>
              <div>
                <h3>{t("recovery.visual.features.otpTitle", { ns: "auth" })}</h3>
                <p>{t("recovery.visual.features.otpDescription", { ns: "auth" })}</p>
              </div>
            </article>

            <article className="feature-item">
              <span className="feature-number green">3</span>
              <div>
                <h3>{t("recovery.visual.features.sessionTitle", { ns: "auth" })}</h3>
                <p>{t("recovery.visual.features.sessionDescription", { ns: "auth" })}</p>
              </div>
            </article>
          </div>
        </div>

        <footer className="visual-footer">{t("brand.authorizedEmployeesOnly", { ns: "common" })}</footer>
      </section>

      <section className="login-area password-recovery-area">
        <div className="login-card-new password-recovery-card">
          <div className="card-brand">
            <div className="logo-tile">
              <img src="/nt-logo.png" alt={t("brand.organization", { ns: "common" })} />
            </div>

            <div>
              <strong>{t("brand.name", { ns: "common" })}</strong>
              <span>{t("brand.organization", { ns: "common" })}</span>
            </div>
          </div>

          <div className="password-recovery-heading">
            <div>
              <p>{t("recovery.card.eyebrow", { ns: "auth" })}</p>
              <h2 ref={headingRef} tabIndex={-1}>
                {step === "email" && t("recovery.card.titles.email", { ns: "auth" })}
                {step === "otp" && t("recovery.card.titles.otp", { ns: "auth" })}
                {step === "password" && t("recovery.card.titles.password", { ns: "auth" })}
                {step === "success" && t("recovery.card.titles.success", { ns: "auth" })}
              </h2>
            </div>

            {step !== "success" && (
              <span className="password-recovery-step-count">
                {t("recovery.card.stepCount", { ns: "auth", step: stepNumber })}
              </span>
            )}
          </div>

          {step !== "success" && (
            <ol
              className="password-recovery-progress"
              aria-label={t("recovery.card.progressAria", { ns: "auth" })}
            >
              {[t("recovery.card.steps.email", { ns: "auth" }), t("recovery.card.steps.otp", { ns: "auth" }), t("recovery.card.steps.password", { ns: "auth" })].map(
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
              <strong>{t("recovery.errors.heading", { ns: "auth" })}</strong>
              <span>{error}</span>
            </div>
          )}

          {step === "email" && (
            <form
              className="password-recovery-form"
              onSubmit={handleEmailSubmit}
            >
              <label htmlFor="recovery-email">
                {t("recovery.email.label", { ns: "auth" })}

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

              <p className="password-recovery-help">{t("recovery.email.privacyHelp", { ns: "auth" })}</p>

              <button
                className="sign-in-btn"
                type="submit"
                disabled={submitting}
              >
                <span>
                  {submitting ? t("recovery.email.requesting", { ns: "auth" }) : t("recovery.email.continue", { ns: "auth" })}
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
                  <small>{t("recovery.otp.recoveryEmail", { ns: "auth" })}</small>
                  <strong>{officialEmail}</strong>
                </div>

                <button
                  type="button"
                  onClick={restartRecovery}
                  disabled={submitting}
                >
                  {t("actions.change", { ns: "common" })}
                </button>
              </div>

              <label htmlFor="recovery-otp">
                {t("recovery.otp.codeLabel", { ns: "auth" })}

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
                <span>{t("recovery.otp.notReceived", { ns: "auth" })}</span>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={submitting || resendSeconds > 0}
                >
                  {resendSeconds > 0
                    ? t("recovery.otp.requestAgainIn", { ns: "auth", seconds: resendSeconds })
                    : t("recovery.otp.requestNew", { ns: "auth" })}
                </button>
              </div>

              <button
                className="sign-in-btn"
                type="submit"
                disabled={submitting || otp.length !== 6}
              >
                <span>
                  {submitting ? t("recovery.otp.verifying", { ns: "auth" }) : t("recovery.otp.verify", { ns: "auth" })}
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
                {t("recovery.password.newPassword", { ns: "auth" })}

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
                    aria-label={showPasswords
                      ? t("actions.hidePasswords", { ns: "common" })
                      : t("actions.showPasswords", { ns: "common" })}
                    disabled={submitting}
                  >
                    {showPasswords ? t("actions.hide", { ns: "common" }) : t("actions.show", { ns: "common" })}
                  </button>
                </div>
              </label>

              <label htmlFor="reset-confirm-password">
                {t("recovery.password.confirmPassword", { ns: "auth" })}

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
                  <strong>{t("password.standard", { ns: "common" })}</strong>
                  <span>{completedRules}/5</span>
                </header>

                <ul>
                  <li data-valid={passwordRules.length}>{t("password.rules.length", { ns: "common" })}</li>
                  <li data-valid={passwordRules.uppercase}>{t("password.rules.uppercase", { ns: "common" })}</li>
                  <li data-valid={passwordRules.lowercase}>{t("password.rules.lowercase", { ns: "common" })}</li>
                  <li data-valid={passwordRules.number}>{t("password.rules.number", { ns: "common" })}</li>
                  <li data-valid={passwordRules.special}>{t("password.rules.special", { ns: "common" })}</li>
                </ul>
              </section>

              <button
                className="sign-in-btn"
                type="submit"
                disabled={submitting}
              >
                <span>
                  {submitting ? t("recovery.password.resetting", { ns: "auth" }) : t("recovery.password.reset", { ns: "auth" })}
                </span>
              </button>
            </form>
          )}

          {step === "success" && (
            <section className="password-recovery-success">
              <span aria-hidden="true">✓</span>

              <h3>{t("recovery.success.title", { ns: "auth" })}</h3>
              <p>{notice}</p>

              <ul>
                <li>{t("recovery.success.previousInvalid", { ns: "auth" })}</li>
                <li>{t("recovery.success.sessionsSignedOut", { ns: "auth" })}</li>
                <li>{t("recovery.success.confirmationSent", { ns: "auth" })}</li>
              </ul>

              <Link className="sign-in-btn" to="/login">
                <span>{t("recovery.success.returnToSignIn", { ns: "auth" })}</span>
              </Link>
            </section>
          )}

          {step !== "success" && (
            <p className="password-recovery-login-link">
              {t("recovery.footer.remembered", { ns: "auth" })}{" "}
              <Link to="/login">{t("recovery.footer.returnToSignIn", { ns: "auth" })}</Link>
            </p>
          )}

          <div className="security-strip">
            <strong>{t("brand.securityPolicies", { ns: "common" })}</strong>
            <span>{t("brand.motto", { ns: "common" })}</span>
          </div>
        </div>
      </section>
    </main>
  );
}
