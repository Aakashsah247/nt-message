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

export interface ApiErrorResponse {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}