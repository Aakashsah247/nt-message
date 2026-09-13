import { AccountClass, AccountRole } from '../../generated/prisma/client';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  accountClass: AccountClass;
  type: 'access';
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  accountClass: AccountClass;
  type: 'refresh';
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  accountId: string;
  sessionId: string;
  username: string | null;
  accountClass?: AccountClass;

  /**
   * Temporary Phase 13 compatibility projection for legacy route/UI code.
   * It is derived from current V3 leadership rather than legacy management tables.
   * Authorization must migrate to capabilities/scope before AccountRole is removed.
   */
  role: AccountRole;
}
