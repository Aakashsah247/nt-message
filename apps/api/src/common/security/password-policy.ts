/*
 * Activation, authenticated change and recovery share this backend policy.
 * Keep the frontend counterpart aligned when the approved policy changes.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_COMPLEXITY_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

export const PASSWORD_REQUIREMENTS_MESSAGE =
  'Password must include uppercase, lowercase, number and special character.';

export function isPasswordPolicyCompliant(value: string): boolean {
  return (
    value.length >= PASSWORD_MIN_LENGTH &&
    value.length <= PASSWORD_MAX_LENGTH &&
    PASSWORD_COMPLEXITY_PATTERN.test(value)
  );
}
