import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { loginUser, logoutAuth, refreshAuth } from "../services/auth.service";
import { updateAccountLanguage } from "../services/account-settings.service";
import { recordActivityEvent } from "../services/monitoring.service";
import type { AuthAccount, AuthResponse } from "../types/auth";
<<<<<<< Updated upstream
=======
import {
  applyInterfaceLanguage,
  normalizeInterfaceLanguage,
  type InterfaceLanguage,
} from "../i18n";
import {
  BROWSER_NOTIFICATION_STORAGE_KEY,
  readMessagingBooleanPreference,
  readMessagingDeviceSettings,
} from "../utils/messaging-preferences";
>>>>>>> Stashed changes

const DAILY_LOGOUT_HOUR = 18;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const KATHMANDU_OFFSET_MINUTES = 5 * 60 + 45;
const TOKEN_REFRESH_SAFETY_SECONDS = 60;
const MIN_TOKEN_REFRESH_DELAY_MS = 30 * 1000;

interface AuthContextValue {
  account: AuthAccount | null;
  accessToken: string | null;
  loading: boolean;

  login: (identifier: string, password: string) => Promise<AuthAccount>;

  logout: () => Promise<void>;

  setInterfaceLanguage: (language: InterfaceLanguage) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

function recordSessionActivity(
  token: string | null,
  eventType: "LOGIN" | "LOGOUT" | "SESSION_POLICY_LOGOUT",
): void {
  if (!token) {
    return;
  }

  // Session events are audit metadata only; no message content is sent.
  void recordActivityEvent(token, {
    eventType,
    pagePath: window.location.pathname,
  }).catch(() => undefined);
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [account, setAccount] = useState<AuthAccount | null>(null);

  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [accessTokenExpiresIn, setAccessTokenExpiresIn] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);

  function saveSession(result: AuthResponse): AuthAccount {
    const normalizedAccount: AuthAccount = {
      ...result.account,
      interfaceLanguage: normalizeInterfaceLanguage(
        result.account.interfaceLanguage,
      ),
    };

    setAccount(normalizedAccount);
    setAccessToken(result.accessToken);
    setAccessTokenExpiresIn(result.accessTokenExpiresIn);

    // Authenticated account preference overrides the anonymous/local choice.
    void applyInterfaceLanguage(normalizedAccount.interfaceLanguage);

    return normalizedAccount;
  }

  function clearSession(): void {
    setAccount(null);
    setAccessToken(null);
    setAccessTokenExpiresIn(null);
  }

  useEffect(() => {
    let active = true;

    refreshAuth()
      .then((result) => {
        if (active) {
          saveSession(result);
        }
      })
      .catch(() => {
        if (active) {
          clearSession();
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!account || !accessToken || !accessTokenExpiresIn) {
      return;
    }

    const refreshDelayMs = Math.max(
      MIN_TOKEN_REFRESH_DELAY_MS,
      (accessTokenExpiresIn - TOKEN_REFRESH_SAFETY_SECONDS) * 1000,
    );

    // Keep long-open dashboards authenticated without waiting for a manual browser refresh.
    const timeoutId = window.setTimeout(() => {
      refreshAuth()
        .then(saveSession)
        .catch(() => {
          clearSession();
        });
    }, refreshDelayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [account, accessToken, accessTokenExpiresIn]);

  useEffect(() => {
    if (!account || !accessToken) {
      return;
    }

    const nextLogoutAt = getNextKathmanduDailyLogoutAt();
    const delay = nextLogoutAt.getTime() - Date.now();

    // The API revokes every device; this timer keeps the current tab in sync.
    const timeoutId = window.setTimeout(() => {
      recordSessionActivity(accessToken, "SESSION_POLICY_LOGOUT");
      clearSession();
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [account, accessToken]);

  async function login(
    identifier: string,
    password: string,
  ): Promise<AuthAccount> {
    const result = await loginUser(identifier, password);

    const authenticatedAccount = saveSession(result);
    recordSessionActivity(result.accessToken, "LOGIN");

    return authenticatedAccount;
  }

  async function setInterfaceLanguage(
    language: InterfaceLanguage,
  ): Promise<void> {
    if (!account || !accessToken) {
      throw new Error("Your secure session is unavailable. Sign in again.");
    }

    const previousLanguage = account.interfaceLanguage;

    // Update immediately for a responsive switch, then roll back if persistence fails.
    setAccount((current) => current
      ? { ...current, interfaceLanguage: language }
      : current);
    await applyInterfaceLanguage(language);

    try {
      const response = await updateAccountLanguage(accessToken, language);
      const confirmedLanguage = normalizeInterfaceLanguage(
        response.interfaceLanguage,
      );

      setAccount((current) => current
        ? { ...current, interfaceLanguage: confirmedLanguage }
        : current);
      await applyInterfaceLanguage(confirmedLanguage);
    } catch (error) {
      setAccount((current) => current
        ? { ...current, interfaceLanguage: previousLanguage }
        : current);
      await applyInterfaceLanguage(previousLanguage);
      throw error;
    }
  }

  async function logout(): Promise<void> {
    try {
      recordSessionActivity(accessToken, "LOGOUT");
      await logoutAuth();
    } finally {
      clearSession();
    }
  }

  return (
    <AuthContext.Provider
      value={{
        account,
        accessToken,
        loading,
        login,
        setInterfaceLanguage,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function getNextKathmanduDailyLogoutAt(now = new Date()): Date {
  const kathmanduNow = new Date(
    now.getTime() + KATHMANDU_OFFSET_MINUTES * 60 * 1000,
  );

  const logoutLocalTimestamp = Date.UTC(
    kathmanduNow.getUTCFullYear(),
    kathmanduNow.getUTCMonth(),
    kathmanduNow.getUTCDate(),
    DAILY_LOGOUT_HOUR,
    0,
    0,
    0,
  );

  let logoutUtcTimestamp =
    logoutLocalTimestamp - KATHMANDU_OFFSET_MINUTES * 60 * 1000;

  if (logoutUtcTimestamp <= now.getTime()) {
    logoutUtcTimestamp += DAY_IN_MILLISECONDS;
  }

  return new Date(logoutUtcTimestamp);
}

// The provider and its hook intentionally share this module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
