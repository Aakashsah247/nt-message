import type { ReactNode } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";

import { ProtectedAvatar } from "../ProtectedAvatar";
import { useAuth } from "../../context/AuthContext";

export type SettingsSection = "security" | "language";

interface SettingsShellProps {
  activeSection: SettingsSection;
  children: ReactNode;
}

export function SettingsSecurityIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.7 2.7 8 7 10 4.3-2 7-5.3 7-10V6z" />
      <path d="M9.5 12.2 11.2 14l3.7-4" />
    </svg>
  );
}

export function SettingsLanguageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.2 2.4 3.4 5.4 3.4 9S14.2 18.6 12 21" />
      <path d="M12 3C9.8 5.4 8.6 8.4 8.6 12s1.2 6.6 3.4 9" />
    </svg>
  );
}

export function SettingsShell({
  activeSection,
  children,
}: SettingsShellProps) {
  const { t } = useTranslation("settings");
  const { account } = useAuth();

  if (!account) {
    return null;
  }

  const securityActive = activeSection === "security";
  const languageActive = activeSection === "language";

  return (
    <main className="settings-page">
      <header className="settings-page__intro">
        <div className="settings-page__intro-copy">
          <span className="settings-page__eyebrow">{t("page.eyebrow")}</span>
          <h1>{t("page.title")}</h1>
          <p>{t("page.description")}</p>
        </div>

        <div className="settings-page__identity" aria-label={t("identity.account")}>
          <ProtectedAvatar
            accountId={account.id}
            displayName={account.displayName}
            className="settings-page__identity-avatar"
          />
          <span className="settings-page__identity-copy">
            <small>{t("identity.account")}</small>
            <strong>{account.displayName}</strong>
            <span>{account.positionLabel}</span>
          </span>
        </div>
      </header>

      <section className="settings-page__shell" aria-label={t("page.eyebrow")}>
        <nav className="settings-page__section-nav" aria-label={t("navigation.label")}>
          <Link
            className={securityActive
              ? "settings-page__section-link settings-page__section-link--active"
              : "settings-page__section-link"}
            to="/settings/security"
            aria-current={securityActive ? "page" : undefined}
          >
            <span className="settings-page__section-icon" aria-hidden="true">
              <SettingsSecurityIcon />
            </span>
            <span className="settings-page__section-copy">
              <strong>{t("security.title")}</strong>
              <small>{t("security.description")}</small>
            </span>
            {securityActive ? (
              <span className="settings-page__section-active-dot" aria-hidden="true" />
            ) : (
              <span className="settings-page__section-arrow" aria-hidden="true">→</span>
            )}
          </Link>

          <Link
            className={languageActive
              ? "settings-page__section-link settings-page__section-link--active"
              : "settings-page__section-link"}
            to="/settings"
            aria-current={languageActive ? "page" : undefined}
          >
            <span className="settings-page__section-icon" aria-hidden="true">
              <SettingsLanguageIcon />
            </span>
            <span className="settings-page__section-copy">
              <strong>{t("language.title")}</strong>
              <small>{t("language.description")}</small>
            </span>
            {languageActive ? (
              <span className="settings-page__section-active-dot" aria-hidden="true" />
            ) : (
              <span className="settings-page__section-arrow" aria-hidden="true">→</span>
            )}
          </Link>
        </nav>

        <div
          key={activeSection}
          className="settings-page__content"
          data-settings-section={activeSection}
        >
          {children}
        </div>
      </section>
    </main>
  );
}
