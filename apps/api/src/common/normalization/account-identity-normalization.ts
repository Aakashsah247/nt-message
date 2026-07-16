import { BadRequestException } from '@nestjs/common';

const NEPAL_COUNTRY_CODE = '977';
const NEPAL_LOCAL_MOBILE_PATTERN = /^9\d{9}$/;
const NEPAL_PREFIXED_MOBILE_PATTERN = /^9779\d{9}$/;
const NEPAL_CANONICAL_MOBILE_PATTERN = /^\+9779\d{9}$/;

export function normalizeEmployeeName(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}

export function normalizeEmployeeId(value: string): string {
  return value.trim().toUpperCase();
}

export function sanitizeOfficialEmail(value: string): string {
  return value.trim();
}

export function normalizeOfficialEmailForLookup(value: string): string {
  /*
   * Preserve the approved address exactly for display and delivery, but use
   * a lowercase comparison key so capitalization cannot block login or
   * activation for the same mailbox.
   */
  return sanitizeOfficialEmail(value).toLowerCase();
}

export function normalizeNepalPhoneNumber(value: string): string {
  const phoneNumber = value.trim();

  /*
   * NT Message accepts the three approved Nepal mobile forms below and
   * stores all of them as +9779XXXXXXXXX. The international 00-prefix form
   * is intentionally rejected because it is outside the approved UI format.
   */
  if (NEPAL_LOCAL_MOBILE_PATTERN.test(phoneNumber)) {
    return `+${NEPAL_COUNTRY_CODE}${phoneNumber}`;
  }

  if (NEPAL_PREFIXED_MOBILE_PATTERN.test(phoneNumber)) {
    return `+${phoneNumber}`;
  }

  if (NEPAL_CANONICAL_MOBILE_PATTERN.test(phoneNumber)) {
    return phoneNumber;
  }

  throw new BadRequestException(
    'Use 98XXXXXXXX, 97798XXXXXXXX or +97798XXXXXXXX format.',
  );
}

export function getNepalPhoneLookupVariants(value: string): string[] {
  const canonicalPhoneNumber = normalizeNepalPhoneNumber(value);
  const localNumber = canonicalPhoneNumber.slice(4);

  /*
   * Existing development records may still use a local or 977-prefixed
   * value. Reads compare these approved equivalents while every new write
   * continues to use the canonical +977 format.
   */
  return [
    canonicalPhoneNumber,
    localNumber,
    `${NEPAL_COUNTRY_CODE}${localNumber}`,
  ];
}

export interface AccountIdentityInput {
  empId: string;
  empName: string;
  phoneNumber: string;
  officialEmail: string;
}

export interface NormalizedAccountIdentity {
  empId: string;
  empName: string;
  phoneNumber: string;
  phoneLookupValues: string[];
  officialEmail: string;
  officialEmailLookup: string;
}

export function normalizeAccountIdentity(
  input: AccountIdentityInput,
): NormalizedAccountIdentity {
  const phoneNumber = normalizeNepalPhoneNumber(input.phoneNumber);
  const officialEmail = sanitizeOfficialEmail(input.officialEmail);

  /*
   * Normalize the four approved identity fields once per request and reuse
   * the prepared values for validation, duplicate checks and persistence.
   * This prevents services from implementing slightly different rules.
   */
  return {
    empId: normalizeEmployeeId(input.empId),
    empName: normalizeEmployeeName(input.empName),
    phoneNumber,
    phoneLookupValues: getNepalPhoneLookupVariants(phoneNumber),
    officialEmail,
    officialEmailLookup: normalizeOfficialEmailForLookup(officialEmail),
  };
}

export function maskNepalPhoneNumber(value: string): string {
  const canonicalPhoneNumber = normalizeNepalPhoneNumber(value);

  /*
   * Activation emails confirm the approved phone identity without exposing
   * the complete number in an inbox or forwarded message.
   */
  return `${canonicalPhoneNumber.slice(0, 6)}******${canonicalPhoneNumber.slice(-2)}`;
}
