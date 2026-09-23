import { NativeRateLimitService } from './native-rate-limit.service';

describe('NativeRateLimitService', () => {
  it('allows the configured number of requests and blocks the next one', () => {
    const service = new NativeRateLimitService();

    try {
      expect(service.consume('login:user', 2, 60_000, 1_000).allowed).toBe(
        true,
      );
      expect(service.consume('login:user', 2, 60_000, 1_001).allowed).toBe(
        true,
      );
      const blocked = service.consume('login:user', 2, 60_000, 1_002);

      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    } finally {
      service.onModuleDestroy();
    }
  });

  it('starts a fresh window after the previous bucket expires', () => {
    const service = new NativeRateLimitService();

    try {
      service.consume('otp:user', 1, 1_000, 1_000);
      expect(service.consume('otp:user', 1, 1_000, 1_500).allowed).toBe(false);
      expect(service.consume('otp:user', 1, 1_000, 2_001).allowed).toBe(true);
    } finally {
      service.onModuleDestroy();
    }
  });

  it('keeps independent scopes and subjects isolated', () => {
    const service = new NativeRateLimitService();

    try {
      service.consume('login:user-a', 1, 60_000, 1_000);
      expect(service.consume('login:user-b', 1, 60_000, 1_001).allowed).toBe(
        true,
      );
      expect(service.consume('message:user-a', 1, 60_000, 1_001).allowed).toBe(
        true,
      );
    } finally {
      service.onModuleDestroy();
    }
  });

  it('keeps the process-local bucket map bounded under high-cardinality input', () => {
    const previous = process.env.NATIVE_RATE_LIMIT_MAX_BUCKETS;
    process.env.NATIVE_RATE_LIMIT_MAX_BUCKETS = '2';
    const service = new NativeRateLimitService();

    try {
      service.consume('scope:a', 10, 60_000, 1_000);
      service.consume('scope:b', 10, 60_000, 1_001);
      service.consume('scope:c', 10, 60_000, 1_002);

      expect(
        (
          service as unknown as {
            buckets: Map<string, unknown>;
          }
        ).buckets.size,
      ).toBeLessThanOrEqual(2);
    } finally {
      service.onModuleDestroy();
      if (previous === undefined) {
        delete process.env.NATIVE_RATE_LIMIT_MAX_BUCKETS;
      } else {
        process.env.NATIVE_RATE_LIMIT_MAX_BUCKETS = previous;
      }
    }
  });
});
