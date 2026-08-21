import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  SettingsLanguageIcon,
  SettingsShell,
} from "../components/settings/SettingsShell";
import { useAuth } from "../context/AuthContext";
import type { InterfaceLanguage } from "../i18n/language";

interface LanguageOption {
  value: InterfaceLanguage;
  labelKey: "language.english" | "language.nepali";
  descriptionKey:
    | "language.englishDescription"
    | "language.nepaliDescription";
  code: string;
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  {
    value: "en",
    labelKey: "language.english",
    descriptionKey: "language.englishDescription",
    code: "EN",
  },
  {
    value: "ne",
    labelKey: "language.nepali",
    descriptionKey: "language.nepaliDescription",
    code: "ने",
  },
];

export function SettingsPage() {
  const { t } = useTranslation("settings");
  const { account, setInterfaceLanguage } = useAuth();
  const [savingLanguage, setSavingLanguage] = useState<InterfaceLanguage | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  if (!account) {
    return null;
  }

  async function handleLanguageChange(
    language: InterfaceLanguage,
  ): Promise<void> {
    if (!account || language === account.interfaceLanguage || savingLanguage) {
      return;
    }

    setSavingLanguage(language);
    setNotice("");
    setError("");

    try {
      await setInterfaceLanguage(language);
      setNotice(t("language.saved"));
    } catch {
      setError(t("language.saveError"));
    } finally {
      setSavingLanguage(null);
    }
  }

  return (
    <SettingsShell activeSection="language">
      <article className="settings-page__panel" aria-labelledby="settings-language-title">
        <header className="settings-page__panel-header">
          <span className="settings-page__panel-icon" aria-hidden="true">
            <SettingsLanguageIcon />
          </span>

          <div className="settings-page__panel-heading">
            <div className="settings-page__panel-title-row">
              <h2 id="settings-language-title">{t("language.title")}</h2>
              <span className="settings-page__scope-badge">{t("language.accountWide")}</span>
            </div>
            <p>{t("language.description")}</p>
          </div>
        </header>

        <div
          className="settings-page__language-options"
          role="radiogroup"
          aria-label={t("language.title")}
        >
          {LANGUAGE_OPTIONS.map((option) => {
            const selected = account.interfaceLanguage === option.value;
            const saving = savingLanguage === option.value;

            return (
              <button
                key={option.value}
                type="button"
                className={selected
                  ? "settings-page__language-option settings-page__language-option--selected"
                  : "settings-page__language-option"}
                role="radio"
                aria-checked={selected}
                disabled={Boolean(savingLanguage)}
                onClick={() => void handleLanguageChange(option.value)}
              >
                <span className="settings-page__language-code" aria-hidden="true">
                  {option.code}
                </span>
                <span className="settings-page__language-copy">
                  <strong>{t(option.labelKey)}</strong>
                  <small>{t(option.descriptionKey)}</small>
                </span>
                <span
                  className="settings-page__language-radio"
                  aria-hidden="true"
                  data-selected={selected || undefined}
                >
                  {saving ? (
                    <span className="settings-page__spinner" />
                  ) : selected ? (
                    <svg viewBox="0 0 20 20">
                      <path d="m5.1 10.2 3 3 6.8-7" />
                    </svg>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className="settings-page__language-meta">
          <span className="settings-page__language-meta-icon" aria-hidden="true">i</span>
          <div>
            <span>
              {t("language.current")}: <strong>{account.interfaceLanguage === "ne"
                ? t("language.nepali")
                : t("language.english")}</strong>
            </span>
            <p>{t("language.scope")}</p>
          </div>
        </div>

        <div className="settings-page__status-region" aria-live="polite">
          {savingLanguage && (
            <div className="settings-page__status" role="status">
              <span className="settings-page__status-dot" aria-hidden="true" />
              {t("language.saving")}
            </div>
          )}
          {notice && !savingLanguage && (
            <div className="settings-page__status settings-page__status--success" role="status">
              <span aria-hidden="true">✓</span>
              {notice}
            </div>
          )}
          {error && (
            <div className="settings-page__status settings-page__status--error" role="alert">
              <span aria-hidden="true">!</span>
              {error}
            </div>
          )}
        </div>
      </article>
    </SettingsShell>
  );
}
