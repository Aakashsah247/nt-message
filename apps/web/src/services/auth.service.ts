import { apiRequest } from "../lib/api";
import type {
  AuthResponse,
  ChangePasswordInput,
  ChangePasswordResponse,
  PasswordResetCompletionResponse,
  PasswordResetRequestResponse,
  PasswordResetVerificationResponse,
} from "../types/auth";

let refreshPromise: Promise<AuthResponse> | null = null;
const AUTH_REFRESH_LOCK_NAME = "nt-message-auth-refresh";

function refreshWithCurrentCookie(): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/refresh", {
    method: "POST",
  });
}

async function refreshWithCrossTabLock(): Promise<AuthResponse> {
  if (typeof navigator === "undefined" || !navigator.locks?.request) {
    return refreshWithCurrentCookie();
  }

  return navigator.locks.request(
    AUTH_REFRESH_LOCK_NAME,
    { mode: "exclusive" },
    () => refreshWithCurrentCookie(),
  );
}

export function loginUser(
  identifier: string,
  password: string,
): Promise<AuthResponse> {
  return apiRequest<AuthResponse>(
    "/auth/login",
    {
      method: "POST",

      body: JSON.stringify({
        identifier,
        password,
      }),
    },
  );
}

export function refreshAuth(): Promise<AuthResponse> {
  // Deduplicate inside this tab and serialize refresh-cookie rotation across tabs.
  if (!refreshPromise) {
    refreshPromise = refreshWithCrossTabLock().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

export function logoutAuth(): Promise<{ message: string }> {
  return apiRequest<{
    message: string;
  }>("/auth/logout", {
    method: "POST",
  });
}

export function logoutAllAuth(
  accessToken: string,
): Promise<{ message: string; revokedSessions: number }> {
  return apiRequest<{ message: string; revokedSessions: number }>(
    "/auth/logout-all",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
}

export function changePassword(
  accessToken: string,
  payload: ChangePasswordInput,
): Promise<ChangePasswordResponse> {
  return apiRequest<ChangePasswordResponse>("/auth/change-password", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
}

export function requestPasswordReset(
  officialEmail: string,
): Promise<PasswordResetRequestResponse> {
  return apiRequest<PasswordResetRequestResponse>(
    "/auth/forgot-password/request",
    {
      method: "POST",
      body: JSON.stringify({
        officialEmail,
      }),
    },
  );
}

export function verifyPasswordResetOtp(
  officialEmail: string,
  otp: string,
): Promise<PasswordResetVerificationResponse> {
  return apiRequest<PasswordResetVerificationResponse>(
    "/auth/forgot-password/verify",
    {
      method: "POST",
      body: JSON.stringify({
        officialEmail,
        otp,
      }),
    },
  );
}

export function completePasswordReset(
  resetToken: string,
  newPassword: string,
  confirmPassword: string,
): Promise<PasswordResetCompletionResponse> {
  return apiRequest<PasswordResetCompletionResponse>(
    "/auth/forgot-password/complete",
    {
      method: "POST",
      body: JSON.stringify({
        resetToken,
        newPassword,
        confirmPassword,
      }),
    },
  );
}
