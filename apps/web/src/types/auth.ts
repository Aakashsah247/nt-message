import type { InterfaceLanguage } from "../i18n/language";

export type AccountRole =
  | "SUPER_ADMIN"
  | "SENIOR_MANAGEMENT"
  | "TEAM_MANAGER"
  | "EMPLOYEE";

export interface AuthAccount {
  id: string;
  username: string | null;
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