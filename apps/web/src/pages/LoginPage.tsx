import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";

import { getRoleHomePath } from "../utils/get-role-home-path";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

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
          : "Login failed.",
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
          {/* Left side logo without background */}
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

        <div className="visual-copy">
          <span className="secure-badge">
            Secure internal communication
          </span>

          <h2>
            Connect every team.
            <br />
            Protect every conversation.
          </h2>

          <p>
            A secure internal messaging platform for Nepal Telecom
            employees and operational teams.
          </p>

          <div className="feature-list">
            <article className="feature-item">
              <span className="feature-number gold">1</span>
              <div>
                <h3>Verified employee access</h3>
                <p>
                  Official identity, OTP and secure account activation.
                </p>
              </div>
            </article>

            <article className="feature-item">
              <span className="feature-number red">2</span>
              <div>
                <h3>Fast collaboration</h3>
                <p>
                  Private chats, groups, files, voice and location.
                </p>
              </div>
            </article>

            <article className="feature-item">
              <span className="feature-number green">3</span>
              <div>
                <h3>Enterprise control</h3>
                <p>
                  Secure employee communication and official bots.
                </p>
              </div>
            </article>
          </div>
        </div>

        <footer className="visual-footer">
          Authorized Nepal Telecom employees only
        </footer>
      </section>

      <section className="login-area">
        <div className="login-card-new">
          {/* Right side logo with blue background */}
          <div className="card-brand">
            <div className="logo-tile">
              <img
                src="/nt-logo.png"
                alt="Nepal Telecom"
              />
            </div>

            <div>
              <strong>NEPAL TELECOM MESSAGE</strong>
              <span>Nepal Telecom</span>
            </div>
          </div>

          <div className="card-heading">
            <p>Secure account access</p>
            <h2>Welcome back</h2>

            <span>
              Sign in using your official email address.
            </span>
          </div>

          <form
            className="new-login-form"
            onSubmit={handleSubmit}
          >
            <label>
              Official email

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
              Password

              <div className="password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="Enter your password"
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
                    showPassword ? "Hide password" : "Show password"
                  }
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>
                                                                
            <div className="login-options">
              <Link className="forgot-link"to="/forgot-password">
              Forgot password?</Link>
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
                {submitting ? "Signing in..." : "Sign in"}
              </span>
            </button>
          </form>

          <p className="activation-link">
            Account not activated?{" "}
            <Link to="/activate">Activate employee account</Link>
          </p>

          <div className="security-strip">
            <strong>
              Protected by Nepal Telecom security policies
            </strong>

            <span>नेपाल टेलिकम — राष्ट्रको सञ्चार</span>
          </div>
        </div>
      </section>
    </main>
  );
}