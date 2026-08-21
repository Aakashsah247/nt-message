import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

import {
  SettingsSecurityIcon,
  SettingsShell,
} from "../components/settings/SettingsShell";
import { useAuth } from "../context/AuthContext";
import { changePassword } from "../services/auth.service";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
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
  const { t } = useTranslation(["settings", "auth", "common"]);
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

  const homePath = "/settings";

  function validateForm(): boolean {
    const nextErrors: FieldErrors = {};
    if (!currentPassword) {
      nextErrors.currentPassword = t("security.validation.currentRequired", { ns: "auth" });
    }
    if (!isSecurePassword(newPassword)) {
      nextErrors.newPassword = t("password.requirementsMessage", { ns: "common" });
    }
    if (newPassword === currentPassword && newPassword) {
      nextErrors.newPassword = t("security.validation.differentPassword", { ns: "auth" });
    }
    if (confirmPassword !== newPassword) {
      nextErrors.confirmPassword = t("security.validation.confirmationMismatch", { ns: "auth" });
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");

    if (!accessToken || !validateForm()) {
      if (!accessToken) {
        setError(t("security.validation.sessionUnavailable", { ns: "auth" }));
      }
      return;
    }

    setSubmitting(true);
    try {
      /*
       * Password values stay only in component memory. They are never copied
       * to localStorage, sessionStorage, URLs or analytics events.
       */
      await changePassword(accessToken, {
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
          notice: t("security.notices.changed", { ns: "auth" }),
        },
      });
    } catch (requestError) {
      setCurrentPassword("");
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("security.errors.fallback", { ns: "auth" }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!account) {
    return null;
  }

  return (
    <SettingsShell activeSection="security">
      <article
        className="settings-page__panel settings-page__panel--security"
        aria-labelledby="settings-security-title"
      >
        <header className="settings-page__panel-header">
          <span className="settings-page__panel-icon" aria-hidden="true">
            <SettingsSecurityIcon />
          </span>

          <div className="settings-page__panel-heading">
            <div className="settings-page__panel-title-row">
              <h2 id="settings-security-title">{t("security.title")}</h2>
              <span className="settings-page__scope-badge settings-page__scope-badge--secure">
                {t("security.badge")}
              </span>
            </div>
            <p>{t("security.panelDescription")}</p>
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
                <span>{t("security.form.eyebrow", { ns: "auth" })}</span>
                <h3>{t("security.form.title", { ns: "auth" })}</h3>
                <p>{t("security.form.description", { ns: "auth" })}</p>
              </div>

              <span className="security-page__session-badge">{t("security.form.sessionBadge", { ns: "auth" })}</span>
            </header>

            <div className="security-page__field security-page__field--current">
              <label htmlFor="current-password">{t("security.form.currentPassword", { ns: "auth" })}</label>

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

              <small id="current-password-help" className="security-page__field-help">{t("security.form.currentHelp", { ns: "auth" })}</small>

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
                <label htmlFor="new-password">{t("security.form.newPassword", { ns: "auth" })}</label>

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
                <label htmlFor="confirm-password">{t("security.form.confirmPassword", { ns: "auth" })}</label>

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
                {showPasswords
                  ? t("actions.hidePasswords", { ns: "common" })
                  : t("actions.showPasswords", { ns: "common" })}
              </button>

              <span>{t("security.form.storageNotice", { ns: "auth" })}</span>
            </div>

            {error && (
              <div className="security-page__error" role="alert">
                <strong>{t("security.errors.heading", { ns: "auth" })}</strong>
                <span>{error}</span>
              </div>
            )}

            <footer className="security-page__actions">
              <Link to={homePath}>{t("actions.cancel", { ns: "common" })}</Link>

              <button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <span className="security-page__button-spinner" aria-hidden="true" />
                    {t("security.form.changing", { ns: "auth" })}
                  </>
                ) : (
                  <>
                    {t("security.form.change", { ns: "auth" })}
                    <span aria-hidden="true">→</span>
                  </>
                )}
              </button>
            </footer>
          </form>

          <aside className="security-page__rail" aria-label={t("security.guidance.aria", { ns: "auth" })}>
            <section
              id="new-password-rules"
              className="security-page__rules-card"
              aria-live="polite"
            >
              <header>
                <div>
                  <span>{t("password.standard", { ns: "common" })}</span>
                  <h3>{t("password.strong", { ns: "common" })}</h3>
                </div>

                <strong aria-label={t("password.requirementsMet", { ns: "common", count: completedPasswordRules })}>
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
                  {t("password.rules.length", { ns: "common" })}
                </li>
                <li data-valid={passwordRules.uppercase}>
                  <span aria-hidden="true">✓</span>
                  {t("password.rules.uppercase", { ns: "common" })}
                </li>
                <li data-valid={passwordRules.lowercase}>
                  <span aria-hidden="true">✓</span>
                  {t("password.rules.lowercase", { ns: "common" })}
                </li>
                <li data-valid={passwordRules.number}>
                  <span aria-hidden="true">✓</span>
                  {t("password.rules.number", { ns: "common" })}
                </li>
                <li data-valid={passwordRules.special}>
                  <span aria-hidden="true">✓</span>
                  {t("password.rules.special", { ns: "common" })}
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
                  <span>{t("security.guidance.afterConfirmation", { ns: "auth" })}</span>
                  <h3>{t("security.guidance.sessionsRevoked", { ns: "auth" })}</h3>
                </div>
              </header>

              <ul>
                <li>{t("security.guidance.oldPasswordStops", { ns: "auth" })}</li>
                <li>{t("security.guidance.returnLogin", { ns: "auth" })}</li>
                <li>{t("security.guidance.noticeSent", { ns: "auth" })}</li>
              </ul>
            </section>

            <section className="security-page__privacy-card">
              <span aria-hidden="true">i</span>
              <div>
                <strong>{t("security.guidance.privateBoundary", { ns: "auth" })}</strong>
                <p>{t("security.guidance.privateBoundaryDescription", { ns: "auth" })}</p>
              </div>
            </section>
          </aside>
        </section>
      </article>
    </SettingsShell>
  );
}
