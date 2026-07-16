import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

export function generatePasswordResetOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function generatePasswordResetToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashPasswordResetOtp(
  challengeId: string,
  accountId: string,
  otp: string,
  secret: string,
): string {
  /*
   * Bind the OTP hash to both challenge and account. The same six-digit
   * value issued elsewhere cannot be replayed against this challenge.
   */
  return createHmac('sha256', secret)
    .update(`${challengeId}:${accountId}:${otp}`)
    .digest('hex');
}

export function hashPasswordResetToken(token: string): string {
  // The raw reset token is shown once and never stored in PostgreSQL.
  return createHash('sha256').update(token).digest('hex');
}

export function secureHexHashesMatch(
  storedHash: string,
  incomingHash: string,
): boolean {
  const stored = Buffer.from(storedHash, 'hex');
  const incoming = Buffer.from(incomingHash, 'hex');

  if (stored.length !== incoming.length) {
    return false;
  }

  return timingSafeEqual(stored, incoming);
}
