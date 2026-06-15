import { AccountRole } from "../../generated/prisma/client";

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  role: AccountRole;
  type: "access";
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  role: AccountRole;
  type: "refresh";
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  accountId: string;
  sessionId: string;
  username: string | null;
  role: AccountRole;
}