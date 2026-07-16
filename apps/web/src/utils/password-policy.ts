/*
 * Mirrors the API policy for immediate feedback only; the API remains the
 * authoritative enforcement boundary for every password-writing workflow.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_REQUIREMENTS_MESSAGE =
  'Use 12–128 characters with uppercase, lowercase, number and special character.';

export interface PasswordRuleChecks {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
}

export function getPasswordRuleChecks(value: string): PasswordRuleChecks {
  return {
    length: value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH,
    uppercase: /[A-Z]/.test(value),
    lowercase: /[a-z]/.test(value),
    number: /\d/.test(value),
    special: /[^A-Za-z0-9]/.test(value),
  };
}

export function isSecurePassword(value: string): boolean {
  return Object.values(getPasswordRuleChecks(value)).every(Boolean);
}
