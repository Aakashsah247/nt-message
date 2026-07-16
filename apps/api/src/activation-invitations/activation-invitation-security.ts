import { createHash, randomBytes } from 'node:crypto';

import { AccountRole } from '../generated/prisma/enums';

export interface PreparedActivationInvitation {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
}

export function hashActivationInvitationToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function prepareActivationInvitation(
  ttlHours: number,
  now = new Date(),
): PreparedActivationInvitation {
  const rawToken = randomBytes(32).toString('base64url');

  return {
    rawToken,
    tokenHash: hashActivationInvitationToken(rawToken),
    expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000),
  };
}

export function buildActivationInvitationUrl(
  webOrigin: string,
  rawToken: string,
): string {
  return `${webOrigin.replace(/\/+$/, '')}/activate?invitation=${encodeURIComponent(rawToken)}`;
}

export function getActivationRoleName(role: AccountRole): string {
  switch (role) {
    case AccountRole.SENIOR_MANAGEMENT:
      return 'Senior Management';
    case AccountRole.TEAM_MANAGER:
      return 'Team Manager';
    case AccountRole.EMPLOYEE:
      return 'Employee';
    default:
      return 'NT Message account';
  }
}
