import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import adminEn from "./locales/en/admin.json";
import analyticsEn from "./locales/en/analytics.json";
import authEn from "./locales/en/auth.json";
import commonEn from "./locales/en/common.json";
import directoryEn from "./locales/en/directory.json";
import monitoringEn from "./locales/en/monitoring.json";
import officialProfileEn from "./locales/en/officialProfile.json";
import organizationEn from "./locales/en/organization.json";
import positionsEn from "./locales/en/positions.json";
import requestsEn from "./locales/en/requests.json";
import teamsEn from "./locales/en/teams.json";
import messagingEn from "./locales/en/messaging.json";
import settingsEn from "./locales/en/settings.json";
import workspaceEn from "./locales/en/workspace.json";
import adminNe from "./locales/ne/admin.json";
import analyticsNe from "./locales/ne/analytics.json";
import authNe from "./locales/ne/auth.json";
import commonNe from "./locales/ne/common.json";
import directoryNe from "./locales/ne/directory.json";
import monitoringNe from "./locales/ne/monitoring.json";
import officialProfileNe from "./locales/ne/officialProfile.json";
import organizationNe from "./locales/ne/organization.json";
import positionsNe from "./locales/ne/positions.json";
import requestsNe from "./locales/ne/requests.json";
import teamsNe from "./locales/ne/teams.json";
import messagingNe from "./locales/ne/messaging.json";
import settingsNe from "./locales/ne/settings.json";
import workspaceNe from "./locales/ne/workspace.json";
import {
  DEFAULT_INTERFACE_LANGUAGE,
  normalizeInterfaceLanguage,
  type InterfaceLanguage,
} from "./language";

const LANGUAGE_STORAGE_KEY = "nt-message:interface-language";

function readStoredLanguage(): InterfaceLanguage {
  if (typeof window === "undefined") {
    return DEFAULT_INTERFACE_LANGUAGE;
  }

  try {
    return normalizeInterfaceLanguage(
      window.localStorage.getItem(LANGUAGE_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_INTERFACE_LANGUAGE;
  }
}

export function applyInterfaceLanguage(
  language: InterfaceLanguage,
  persist = true,
): Promise<unknown> {
  if (typeof document !== "undefined") {
    document.documentElement.lang = language;
    document.documentElement.dir = "ltr";
  }

  if (persist && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Account persistence is authoritative; local storage is only a pre-login convenience.
    }
  }

  if (i18n.resolvedLanguage === language || i18n.language === language) {
    return Promise.resolve();
  }

  return i18n.changeLanguage(language);
}

const initialLanguage = readStoredLanguage();

void i18n
  .use(initReactI18next)
  .init({
    lng: initialLanguage,
    fallbackLng: DEFAULT_INTERFACE_LANGUAGE,
    supportedLngs: ["en", "ne"],
    defaultNS: "workspace",
    ns: ["workspace", "settings", "common", "auth", "messaging", "admin", "directory", "requests", "teams", "positions", "organization", "monitoring", "analytics", "officialProfile"],
    resources: {
      en: {
        workspace: workspaceEn,
        admin: adminEn,
        analytics: analyticsEn,
        settings: settingsEn,
        common: commonEn,
        directory: directoryEn,
        monitoring: monitoringEn,
        officialProfile: officialProfileEn,
        organization: organizationEn,
        requests: requestsEn,
        teams: teamsEn,
        positions: positionsEn,
        auth: authEn,
        messaging: messagingEn,
      },
      ne: {
        workspace: workspaceNe,
        admin: adminNe,
        analytics: analyticsNe,
        settings: settingsNe,
        common: commonNe,
        directory: directoryNe,
        monitoring: monitoringNe,
        officialProfile: officialProfileNe,
        organization: organizationNe,
        requests: requestsNe,
        teams: teamsNe,
        positions: positionsNe,
        auth: authNe,
        messaging: messagingNe,
      },
    },
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

if (typeof document !== "undefined") {
  document.documentElement.lang = initialLanguage;
  document.documentElement.dir = "ltr";
}

export { i18n };
export type { InterfaceLanguage } from "./language";
export { normalizeInterfaceLanguage } from "./language";
