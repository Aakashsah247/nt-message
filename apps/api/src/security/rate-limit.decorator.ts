import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_METADATA = 'nt-message:rate-limit';

export type RateLimitKeyDimension = 'ip' | 'identity' | 'account';

export interface RateLimitPolicy {
  scope: string;
  limit: number;
  windowMs: number;
  keys: RateLimitKeyDimension[];
}

export function RateLimit(policy: RateLimitPolicy) {
  return SetMetadata(RATE_LIMIT_METADATA, policy);
}
