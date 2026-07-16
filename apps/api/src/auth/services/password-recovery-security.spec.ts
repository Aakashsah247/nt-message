import {
  generatePasswordResetOtp,
  generatePasswordResetToken,
  hashPasswordResetOtp,
  hashPasswordResetToken,
  secureHexHashesMatch,
} from './password-recovery-security';

describe('password recovery security helpers', () => {
  it('generates a six-digit OTP', () => {
    expect(generatePasswordResetOtp()).toMatch(/^\d{6}$/);
  });

  it('generates a URL-safe opaque reset token', () => {
    expect(generatePasswordResetToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('binds an OTP hash to its challenge and account', () => {
    const first = hashPasswordResetOtp(
      'challenge-1',
      'account-1',
      '123456',
      'secret',
    );

    const second = hashPasswordResetOtp(
      'challenge-2',
      'account-1',
      '123456',
      'secret',
    );

    expect(first).not.toBe(second);
  });

  it('compares token hashes safely', () => {
    const hash = hashPasswordResetToken('opaque-token');

    expect(secureHexHashesMatch(hash, hash)).toBe(true);
    expect(
      secureHexHashesMatch(hash, hashPasswordResetToken('other-token')),
    ).toBe(false);
  });
});
