import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";

import { getRoleHomePath } from "../utils/get-role-home-path";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { t } = useTranslation(["auth", "common"]);

  const locationState = location.state as { notice?: unknown } | null;
  const securityNotice =
    typeof locationState?.notice === "string"
      ? locationState.notice
      : "";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    setError("");
    setSubmitting(true);

    try {
      const account = await login(identifier, password);

      navigate(
        account.role === "EMPLOYEE"
          ? "/employee"
          : getRoleHomePath(account.role),
        {
          replace: true,
        },
      );
    } catch (requestError) {
      setPassword("");

      setError(
        requestError instanceof Error
          ? requestError.message
          : t("login.errors.failed", { ns: "auth" }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
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
            <p>
              {t("brand.organization", { ns: "common" })} · {t("brand.tagline", { ns: "common" })}
            </p>
          </div>
        </header>

        <div className="visual-copy">
          <span className="secure-badge">
            {t("login.visual.badge", { ns: "auth" })}
          </span>

          <h2>
            {t("login.visual.headlineLine1", { ns: "auth" })}
            <br />
            {t("login.visual.headlineLine2", { ns: "auth" })}
          </h2>

          <p>{t("login.visual.description", { ns: "auth" })}</p>

          <div className="feature-list">
            <article className="feature-item">
              <span className="feature-number gold">1</span>
              <div>
                <h3>{t("login.visual.features.verifiedTitle", { ns: "auth" })}</h3>
                <p>{t("login.visual.features.verifiedDescription", { ns: "auth" })}</p>
              </div>
            </article>

            <article className="feature-item">
              <span className="feature-number red">2</span>
              <div>
                <h3>{t("login.visual.features.collaborationTitle", { ns: "auth" })}</h3>
                <p>{t("login.visual.features.collaborationDescription", { ns: "auth" })}</p>
              </div>
            </article>

            <article className="feature-item">
              <span className="feature-number green">3</span>
              <div>
                <h3>{t("login.visual.features.controlTitle", { ns: "auth" })}</h3>
                <p>{t("login.visual.features.controlDescription", { ns: "auth" })}</p>
              </div>
            </article>
          </div>
        </div>

        <footer className="visual-footer">
          {t("brand.authorizedEmployeesOnly", { ns: "common" })}
        </footer>
      </section>

      <section className="login-area">
        <div className="login-card-new">
          <div className="card-brand">
            <div className="logo-tile">
              <img
                src="/nt-logo.png"
                alt={t("brand.organization", { ns: "common" })}
              />
            </div>

            <div>
              <strong>{t("brand.name", { ns: "common" })}</strong>
              <span>{t("brand.organization", { ns: "common" })}</span>
            </div>
          </div>

          <div className="card-heading">
            <p>{t("login.card.eyebrow", { ns: "auth" })}</p>
            <h2>{t("login.card.title", { ns: "auth" })}</h2>

            <span>{t("login.card.description", { ns: "auth" })}</span>
          </div>

          <form
            className="new-login-form"
            onSubmit={handleSubmit}
          >
            <label>
              {t("login.card.officialEmail", { ns: "auth" })}

              <input
                type="text"
                value={identifier}
                onChange={(event) =>
                  setIdentifier(event.target.value)
                }
                placeholder="name@ntc.net.np"
                autoComplete="username"
                required
              />
            </label>

            <label>
              {t("login.card.password", { ns: "auth" })}

              <div className="password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder={t("login.card.passwordPlaceholder", { ns: "auth" })}
                  autoComplete="current-password"
                  required
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setShowPassword((current) => !current)
                  }
                  aria-label={
                    showPassword
                      ? t("actions.hidePassword", { ns: "common" })
                      : t("actions.showPassword", { ns: "common" })
                  }
                >
                  {showPassword
                    ? t("actions.hide", { ns: "common" })
                    : t("actions.show", { ns: "common" })}
                </button>
              </div>
            </label>

            <div className="login-options">
              <Link className="forgot-link" to="/forgot-password">
                {t("login.card.forgotPassword", { ns: "auth" })}
              </Link>
            </div>

            {securityNotice && (
              <div className="login-security-notice" role="status">
                {securityNotice}
              </div>
            )}

            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}

            <button
              className="sign-in-btn"
              type="submit"
              disabled={submitting}
            >
              <span>
                {submitting
                  ? t("login.card.signingIn", { ns: "auth" })
                  : t("login.card.signIn", { ns: "auth" })}
              </span>
            </button>
          </form>

          <p className="activation-link">
            {t("login.card.activationPrompt", { ns: "auth" })}{" "}
            <Link to="/activate">
              {t("login.card.activateAccount", { ns: "auth" })}
            </Link>
          </p>

          <div className="security-strip">
            <strong>{t("brand.securityPolicies", { ns: "common" })}</strong>

            <span>{t("brand.motto", { ns: "common" })}</span>
          </div>
        </div>
      </section>
    </main>
  );
}
