import { apiRequest } from "../lib/api";
import type {
  AuthResponse,
} from "../types/auth";

let refreshPromise:
  Promise<AuthResponse> | null = null;

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

export function refreshAuth():
  Promise<AuthResponse> {
  // Prevent simultaneous token rotation.
  if (!refreshPromise) {
    refreshPromise =
      apiRequest<AuthResponse>(
        "/auth/refresh",
        {
          method: "POST",
        },
      ).finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export function logoutAuth():
  Promise<{ message: string }> {
  return apiRequest<{
    message: string;
  }>("/auth/logout", {
    method: "POST",
  });
}