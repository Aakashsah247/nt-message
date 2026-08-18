import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { loginUser, logoutAuth, refreshAuth } from "../services/auth.service";
import { recordActivityEvent } from "../services/monitoring.service";
import { syncMessagingPushSubscription } from "../services/messaging-push.service";
import type { AuthAccount, AuthResponse } from "../types/auth";
import {
  BROWSER_NOTIFICATION_STORAGE_KEY,
  readMessagingBooleanPreference,
  readMessagingDeviceSettings,
} from "../utils/messaging-preferences";

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

  function saveSession(result: AuthResponse): void {
    setAccount(result.account);
    setAccessToken(result.accessToken);
    setAccessTokenExpiresIn(result.accessTokenExpiresIn);
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
    if (!account || !accessToken || !("Notification" in window)) {
      return;
    }

    const browserNotificationsEnabled = readMessagingBooleanPreference(
      window.localStorage,
      BROWSER_NOTIFICATION_STORAGE_KEY,
      account.id,
      false,
    );

    if (!browserNotificationsEnabled || window.Notification.permission !== "granted") {
      return;
    }

    const settings = readMessagingDeviceSettings(window.localStorage, account.id);

    // Re-link the browser's persistent PushSubscription to the newly authenticated
    // session after login/refresh. The server rejects delivery once that session is revoked.
    void syncMessagingPushSubscription(accessToken, {
      showPreview: settings.notificationPreview,
      isMuted: settings.muteAllNotifications,
    }).catch(() => undefined);
  }, [account, accessToken]);

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

    saveSession(result);
    recordSessionActivity(result.accessToken, "LOGIN");

    return result.account;
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
