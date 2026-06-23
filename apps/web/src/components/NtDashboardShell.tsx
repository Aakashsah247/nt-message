import type {
  ReactNode,
} from "react";

import { DirectoryButton } from "./DirectoryButton";

interface NtDashboardShellProps {
  roleLabel: string;
  title: string;
  description: string;
  accountName: string;
  loggingOut: boolean;
  onLogout: () => Promise<void>;
  children: ReactNode;
  headingAside?: ReactNode;
  headerActions?: ReactNode;
}

export function NtDashboardShell({
  roleLabel,
  title,
  description,
  accountName,
  loggingOut,
  onLogout,
  children,
  headingAside,
  headerActions,
}: NtDashboardShellProps) {
  // The shared layout keeps every role dashboard visually consistent.
  return (
    <main className="nt-dashboard-shell">
      <header className="nt-dashboard-topbar">
        <div className="nt-dashboard-brand">
          <div className="nt-dashboard-logo">
            <img
              src="/nt-logo.png"
              alt="Nepal Telecom"
            />
          </div>

          <div>
            <strong>
              NT Message
            </strong>

            <span>
              Secure Internal Communication
            </span>
          </div>
        </div>

        <div className="nt-dashboard-account">
          <div className="nt-dashboard-account-info">
            <span>
              Signed in as
            </span>

            <strong>
              {accountName}
            </strong>

            <small>
              {roleLabel}
            </small>
          </div>

          <div className="nt-dashboard-actions">
            {/* Custom role actions appear before the shared directory button. */}
            {headerActions}

            <DirectoryButton />

            <button
              type="button"
              className="nt-dashboard-logout"
              onClick={onLogout}
              disabled={loggingOut}
            >
              {loggingOut
                ? "Signing out..."
                : "Sign out"}
            </button>
          </div>
        </div>
      </header>

      <section className="nt-dashboard-content">
        <header className="nt-dashboard-heading">
          <div className="nt-dashboard-heading-text">
            <span>
              {roleLabel}
            </span>

            <h1>
              {title}
            </h1>

            <p>
              {description}
            </p>
          </div>

          {/* Each dashboard can provide its own security or scope summary card. */}
          {headingAside && (
            <div className="nt-dashboard-heading-aside">
              {headingAside}
            </div>
          )}
        </header>

        {/* Role-specific dashboard content is rendered inside the shared shell. */}
        <div className="nt-dashboard-body">
          {children}
        </div>
      </section>
    </main>
  );
}