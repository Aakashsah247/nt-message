import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { useAuth } from "../context/AuthContext";
import { changePassword } from "../services/auth.service";
import { getRoleHomePath } from "../utils/get-role-home-path";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_MESSAGE,
  getPasswordRuleChecks,
  isSecurePassword,
} from "../utils/password-policy";

interface FieldErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export function SecurityPage() {
  const navigate = useNavigate();
  const { account, accessToken, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const passwordRules = useMemo(
    () => getPasswordRuleChecks(newPassword),
    [newPassword],
  );

  /*
   * This progress indicator is advisory UI only. The API remains authoritative
   * for password validation and must reject any non-compliant submission.
   */
  const completedPasswordRules = Object.values(passwordRules).filter(
    Boolean,
  ).length;

  const homePath = account
    ? account.role === "EMPLOYEE"
      ? "/employee"
      : getRoleHomePath(account.role)
    : "/";

  function validateForm(): boolean {
    const nextErrors: FieldErrors = {};
    if (!currentPassword) {
      nextErrors.currentPassword = "Enter your current password.";
    }
    if (!isSecurePassword(newPassword)) {
      nextErrors.newPassword = PASSWORD_REQUIREMENTS_MESSAGE;
    }
    if (newPassword === currentPassword && newPassword) {
      nextErrors.newPassword =
        "New password must be different from the current password.";
    }
    if (confirmPassword !== newPassword) {
      nextErrors.confirmPassword = "Password confirmation does not match.";
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");

    if (!accessToken || !validateForm()) {
      if (!accessToken) {
        setError("Your secure session is unavailable. Sign in again.");
      }
      return;
    }

    setSubmitting(true);
    try {
      /*
       * Password values stay only in component memory. They are never copied
       * to localStorage, sessionStorage, URLs or analytics events.
       */
      const response = await changePassword(accessToken, {
        currentPassword,
        newPassword,
        confirmPassword,
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      /*
       * The API revoked every device and cleared the refresh cookie. logout()
       * clears the in-memory access token even if its idempotent request fails.
       */
      await logout();
      navigate("/login", {
        replace: true,
        state: {
          notice: response.message,
        },
      });
    } catch (requestError) {
      setCurrentPassword("");
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Password could not be changed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!account) {
    return null;
  }

return (
  <main className="security-page">
    <header className="security-page__header">
      <div className="security-page__header-main">
        <span className="security-page__header-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 3 5 6v5c0 4.7 2.7 8 7 10 4.3-2 7-5.3 7-10V6z" />
            <path d="M9.5 12.2 11.2 14l3.7-4" />
          </svg>
        </span>

        <div>
          <span className="security-page__eyebrow">Account security</span>
          <h1>Change password</h1>
          <p>
            Verify your current password, set a stronger replacement and
            securely sign out every active NT Message session.
          </p>
        </div>
      </div>

      <div className="security-page__identity" aria-label="Current account">
        <span className="security-page__identity-avatar" aria-hidden="true">
          {account.displayName.trim().charAt(0).toUpperCase()}
        </span>

        <span className="security-page__identity-copy">
          <small>Protected account</small>
          <strong>{account.displayName}</strong>
          <span>{account.positionLabel}</span>
        </span>
      </div>
    </header>

    <section className="security-page__workspace">
      <form
        className="security-page__form-card"
        onSubmit={handleSubmit}
        noValidate
      >
        <header className="security-page__form-header">
          <div>
            <span>Credential update</span>
            <h2>Verify and replace your password</h2>
            <p>
              Only the authenticated account owner can complete this action.
            </p>
          </div>

          <span className="security-page__session-badge">
            All devices sign out
          </span>
        </header>

        <div className="security-page__field security-page__field--current">
          <label htmlFor="current-password">Current password</label>

          <input
            id="current-password"
            type={showPasswords ? "text" : "password"}
            value={currentPassword}
            onChange={(event) => {
              setCurrentPassword(event.target.value);
              setFieldErrors((current) => ({
                ...current,
                currentPassword: undefined,
              }));
            }}
            autoComplete="current-password"
            maxLength={PASSWORD_MAX_LENGTH}
            aria-invalid={Boolean(fieldErrors.currentPassword)}
            aria-describedby={
              fieldErrors.currentPassword
                ? "current-password-error"
                : "current-password-help"
            }
            disabled={submitting}
            required
          />

          <small id="current-password-help" className="security-page__field-help">
            Confirms that this request belongs to your signed-in account.
          </small>

          {fieldErrors.currentPassword && (
            <small
              id="current-password-error"
              className="security-page__field-error"
            >
              {fieldErrors.currentPassword}
            </small>
          )}
        </div>

        <div className="security-page__password-grid">
          <div className="security-page__field">
            <label htmlFor="new-password">New password</label>

            <input
              id="new-password"
              type={showPasswords ? "text" : "password"}
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                setFieldErrors((current) => ({
                  ...current,
                  newPassword: undefined,
                }));
              }}
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              aria-invalid={Boolean(fieldErrors.newPassword)}
              aria-describedby={
                fieldErrors.newPassword
                  ? "new-password-error new-password-rules"
                  : "new-password-rules"
              }
              disabled={submitting}
              required
            />

            {fieldErrors.newPassword && (
              <small
                id="new-password-error"
                className="security-page__field-error"
              >
                {fieldErrors.newPassword}
              </small>
            )}
          </div>

          <div className="security-page__field">
            <label htmlFor="confirm-password">Confirm new password</label>

            <input
              id="confirm-password"
              type={showPasswords ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setFieldErrors((current) => ({
                  ...current,
                  confirmPassword: undefined,
                }));
              }}
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              aria-describedby={
                fieldErrors.confirmPassword
                  ? "confirm-password-error"
                  : undefined
              }
              disabled={submitting}
              required
            />

            {fieldErrors.confirmPassword && (
              <small
                id="confirm-password-error"
                className="security-page__field-error"
              >
                {fieldErrors.confirmPassword}
              </small>
            )}
          </div>
        </div>

        <div className="security-page__form-controls">
          <button
            type="button"
            className="security-page__visibility"
            aria-pressed={showPasswords}
            onClick={() => setShowPasswords((current) => !current)}
            disabled={submitting}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2.8 12s3.3-5.5 9.2-5.5 9.2 5.5 9.2 5.5-3.3 5.5-9.2 5.5S2.8 12 2.8 12Z" />
              <circle cx="12" cy="12" r="2.6" />
            </svg>
            {showPasswords ? "Hide passwords" : "Show passwords"}
          </button>

          <span>
            Password values stay only in this secure form and are never
            written to browser storage.
          </span>
        </div>

        {error && (
          <div className="security-page__error" role="alert">
            <strong>Password could not be changed</strong>
            <span>{error}</span>
          </div>
        )}

        <footer className="security-page__actions">
          <Link to={homePath}>Cancel</Link>

          <button type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <span className="security-page__button-spinner" aria-hidden="true" />
                Changing password...
              </>
            ) : (
              <>
                Change password
                <span aria-hidden="true">→</span>
              </>
            )}
          </button>
        </footer>
      </form>

      <aside className="security-page__rail" aria-label="Password security guidance">
        <section
          id="new-password-rules"
          className="security-page__rules-card"
          aria-live="polite"
        >
          <header>
            <div>
              <span>Password standard</span>
              <h2>Build a strong password</h2>
            </div>

            <strong aria-label={`${completedPasswordRules} of 5 requirements met`}>
              {completedPasswordRules}/5
            </strong>
          </header>

          <div
            className="security-page__progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={5}
            aria-valuenow={completedPasswordRules}
          >
            <span
              style={{
                width: `${(completedPasswordRules / 5) * 100}%`,
              }}
            />
          </div>

          <ul>
            <li data-valid={passwordRules.length}>
              <span aria-hidden="true">✓</span>
              12–128 characters
            </li>
            <li data-valid={passwordRules.uppercase}>
              <span aria-hidden="true">✓</span>
              One uppercase letter
            </li>
            <li data-valid={passwordRules.lowercase}>
              <span aria-hidden="true">✓</span>
              One lowercase letter
            </li>
            <li data-valid={passwordRules.number}>
              <span aria-hidden="true">✓</span>
              One number
            </li>
            <li data-valid={passwordRules.special}>
              <span aria-hidden="true">✓</span>
              One special character
            </li>
          </ul>
        </section>

        <section className="security-page__impact-card">
          <header>
            <span className="security-page__impact-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 3a9 9 0 1 0 9 9" />
                <path d="M12 7v5l3 2" />
                <path d="M16.5 3H21v4.5" />
                <path d="M21 3l-4.5 4.5" />
              </svg>
            </span>

            <div>
              <span>After confirmation</span>
              <h2>Every session is revoked</h2>
            </div>
          </header>

          <ul>
            <li>The old password stops working immediately.</li>
            <li>You return to the login page for a fresh sign-in.</li>
            <li>A security notice is sent to your official email.</li>
          </ul>
        </section>

        <section className="security-page__privacy-card">
          <span aria-hidden="true">i</span>
          <div>
            <strong>Private credential boundary</strong>
            <p>
              Nepal Telecom administrators cannot view your password and
              will never ask you to share a password or OTP.
            </p>
          </div>
        </section>
      </aside>
    </section>
  </main>
);

}