import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  isPasswordPolicyCompliant,
} from './password-policy';

describe('password policy', () => {
  it('accepts a password that satisfies every requirement', () => {
    expect(isPasswordPolicyCompliant('CorrectHorse#42')).toBe(true);
  });

  it.each([
    'Short#1A',
    'alllowercase#123',
    'ALLUPPERCASE#123',
    'NoNumber#Password',
    'NoSpecial123Password',
  ])('rejects the invalid password %s', (password: string) => {
    expect(isPasswordPolicyCompliant(password)).toBe(false);
  });

  it('rejects passwords longer than the API boundary', () => {
    expect(
      isPasswordPolicyCompliant(`Aa1#${'x'.repeat(PASSWORD_MAX_LENGTH)}`),
    ).toBe(false);
  });

  it('keeps the documented minimum length stable', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
  });
});
