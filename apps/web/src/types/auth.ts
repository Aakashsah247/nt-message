export type AccountRole =
  | "SUPER_ADMIN"
  | "SENIOR_MANAGEMENT"
  | "TEAM_MANAGER"
  | "EMPLOYEE";

export interface AuthAccount {
  id: string;
  username: string | null;
  role: AccountRole;
}

export interface AuthResponse {
  accessToken: string;
  accessTokenExpiresIn: number;
  account: AuthAccount;
}

export interface ApiErrorResponse {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}