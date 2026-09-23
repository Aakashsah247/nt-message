import type { ConfigService } from '@nestjs/config';

function readPositiveInteger(
  config: ConfigService,
  name: string,
  fallback: number,
): number {
  const raw = config.get<string>(name)?.trim();
  if (!raw) {
    return fallback;
  }

  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a positive integer.`);
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

export function assertProductionRateLimitTopology(config: ConfigService): void {
  if (config.get<string>('NODE_ENV') !== 'production') {
    return;
  }

  const store =
    config.get<string>('RATE_LIMIT_STORE')?.trim().toLowerCase() || 'native';

  if (store !== 'native') {
    throw new Error(
      'RATE_LIMIT_STORE must be native until a shared rate-limit backend is implemented.',
    );
  }

  const instanceCount = readPositiveInteger(config, 'API_INSTANCE_COUNT', 1);
  if (instanceCount !== 1) {
    throw new Error(
      'The native rate limiter is process-local. API_INSTANCE_COUNT must remain 1 until a shared Redis/Valkey or edge rate-limit backend is configured.',
    );
  }

  const maxBuckets = readPositiveInteger(
    config,
    'NATIVE_RATE_LIMIT_MAX_BUCKETS',
    100_000,
  );
  if (maxBuckets < 1_000 || maxBuckets > 1_000_000) {
    throw new Error(
      'NATIVE_RATE_LIMIT_MAX_BUCKETS must be between 1000 and 1000000 in production.',
    );
  }
}
