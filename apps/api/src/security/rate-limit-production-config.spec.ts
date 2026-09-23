import { ConfigService } from '@nestjs/config';

import { assertProductionRateLimitTopology } from './rate-limit-production-config';

function config(values: Record<string, string>): ConfigService {
  return new ConfigService(values);
}

describe('production rate-limit topology', () => {
  it('does nothing outside production', () => {
    expect(() =>
      assertProductionRateLimitTopology(
        config({
          NODE_ENV: 'development',
          API_INSTANCE_COUNT: '20',
        }),
      ),
    ).not.toThrow();
  });

  it('accepts the current single-instance native deployment', () => {
    expect(() =>
      assertProductionRateLimitTopology(
        config({
          NODE_ENV: 'production',
          RATE_LIMIT_STORE: 'native',
          API_INSTANCE_COUNT: '1',
          NATIVE_RATE_LIMIT_MAX_BUCKETS: '100000',
        }),
      ),
    ).not.toThrow();
  });

  it('rejects multi-instance production while rate limiting is process-local', () => {
    expect(() =>
      assertProductionRateLimitTopology(
        config({
          NODE_ENV: 'production',
          RATE_LIMIT_STORE: 'native',
          API_INSTANCE_COUNT: '2',
        }),
      ),
    ).toThrow('process-local');
  });

  it('rejects unsupported stores and unsafe bucket bounds', () => {
    expect(() =>
      assertProductionRateLimitTopology(
        config({
          NODE_ENV: 'production',
          RATE_LIMIT_STORE: 'redis',
          API_INSTANCE_COUNT: '1',
        }),
      ),
    ).toThrow('RATE_LIMIT_STORE');

    expect(() =>
      assertProductionRateLimitTopology(
        config({
          NODE_ENV: 'production',
          RATE_LIMIT_STORE: 'native',
          API_INSTANCE_COUNT: '1',
          NATIVE_RATE_LIMIT_MAX_BUCKETS: '10',
        }),
      ),
    ).toThrow('NATIVE_RATE_LIMIT_MAX_BUCKETS');
  });
});
