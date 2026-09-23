import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  assertProductionTrustedProxyConfig,
  configureTrustedProxy,
  resolveTrustedProxySetting,
} from './trusted-proxy';

function config(values: Record<string, string>): ConfigService {
  return new ConfigService(values);
}

describe('trusted proxy configuration', () => {
  it('does not trust forwarded headers by default', () => {
    expect(resolveTrustedProxySetting(config({}))).toBe(false);
  });

  it('enables the Render proxy chain explicitly', () => {
    expect(
      resolveTrustedProxySetting(config({ TRUST_PROXY_MODE: 'render' })),
    ).toBe(true);
  });

  it('supports a fixed hop count for non-Render reverse proxies', () => {
    expect(
      resolveTrustedProxySetting(
        config({
          TRUST_PROXY_MODE: 'hop-count',
          TRUST_PROXY_HOPS: '2',
        }),
      ),
    ).toBe(2);
  });

  it('rejects invalid proxy modes and unsafe hop counts', () => {
    expect(() =>
      resolveTrustedProxySetting(config({ TRUST_PROXY_MODE: 'all' })),
    ).toThrow('TRUST_PROXY_MODE');

    expect(() =>
      resolveTrustedProxySetting(
        config({
          TRUST_PROXY_MODE: 'hop-count',
          TRUST_PROXY_HOPS: '0',
        }),
      ),
    ).toThrow('TRUST_PROXY_HOPS');
  });

  it('requires Render mode for the current external staging profile', () => {
    expect(() =>
      assertProductionTrustedProxyConfig(
        config({
          NODE_ENV: 'production',
          DEPLOYMENT_PROFILE: 'temporary_external_staging',
          TRUST_PROXY_MODE: 'none',
        }),
      ),
    ).toThrow('TRUST_PROXY_MODE must be render');

    expect(() =>
      assertProductionTrustedProxyConfig(
        config({
          NODE_ENV: 'production',
          DEPLOYMENT_PROFILE: 'temporary_external_staging',
          TRUST_PROXY_MODE: 'render',
        }),
      ),
    ).not.toThrow();
  });

  it('applies the resolved setting to the underlying Express application', () => {
    const set = jest.fn();
    const app = {
      getHttpAdapter: () => ({
        getInstance: () => ({ set }),
      }),
    } as unknown as INestApplication;

    configureTrustedProxy(app, config({ TRUST_PROXY_MODE: 'render' }));

    expect(set).toHaveBeenCalledWith('trust proxy', true);
  });
});
