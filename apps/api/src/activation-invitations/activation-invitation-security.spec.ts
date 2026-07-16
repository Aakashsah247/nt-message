import { AccountRole } from '../generated/prisma/enums';
import {
  buildActivationInvitationUrl,
  getActivationRoleName,
  hashActivationInvitationToken,
  prepareActivationInvitation,
} from './activation-invitation-security';

describe('activation invitation security', () => {
  it('creates an opaque token and stores a different fixed-length hash', () => {
    const invitation = prepareActivationInvitation(
      72,
      new Date('2026-07-16T12:00:00.000Z'),
    );

    expect(invitation.rawToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(invitation.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(invitation.tokenHash).not.toBe(invitation.rawToken);
    expect(invitation.expiresAt.toISOString()).toBe(
      '2026-07-19T12:00:00.000Z',
    );
  });

  it('produces a stable token hash for database lookup', () => {
    expect(hashActivationInvitationToken('opaque-token')).toBe(
      hashActivationInvitationToken('opaque-token'),
    );
    expect(hashActivationInvitationToken('opaque-token')).not.toBe(
      hashActivationInvitationToken('different-token'),
    );
  });

  it('builds the activation URL without duplicating a trailing slash', () => {
    expect(
      buildActivationInvitationUrl(
        'http://localhost:5173/',
        'opaque_token-value',
      ),
    ).toBe(
      'http://localhost:5173/activate?invitation=opaque_token-value',
    );
  });

  it.each([
    [AccountRole.SENIOR_MANAGEMENT, 'Senior Management'],
    [AccountRole.TEAM_MANAGER, 'Team Manager'],
    [AccountRole.EMPLOYEE, 'Employee'],
  ])(
    'maps %s to its employee-facing role name',
    (role: AccountRole, expected: string) => {
      expect(getActivationRoleName(role)).toBe(expected);
    },
  );
});
