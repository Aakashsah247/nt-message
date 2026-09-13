import type { InterfaceLanguage } from "../i18n/language";

export type AccountClass = "SUPER_ADMIN" | "OFFICE_USER";

// Temporary compatibility field while the persisted legacy role column is retired.
// Authorization must use AccountClass plus server-provided capability/scope context.
export type AccountRole = string;

export interface AuthAccount {
  id: string;
  username: string | null;
  accountClass: AccountClass;
  role: AccountRole;
  displayName: string;
  positionLabel: string;
  interfaceLanguage: InterfaceLanguage;
}

export interface AuthResponse {
  accessToken: string;
  accessTokenExpiresIn: number;
  account: AuthAccount;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ChangePasswordResponse {
  message: string;
  revokedSessions: number;
}

export interface PasswordResetRequestResponse {
  message: string;
  resendAfterSeconds: number;
}

export interface PasswordResetVerificationResponse {
  message: string;
  resetToken: string;
  expiresInSeconds: number;
}

export interface PasswordResetCompletionResponse {
  message: string;
  revokedSessions: number;
}

export interface ApiErrorResponse {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}