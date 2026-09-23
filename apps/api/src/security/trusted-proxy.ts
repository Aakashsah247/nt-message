import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

export type TrustedProxyMode = 'none' | 'render' | 'hop-count';
export type TrustedProxySetting = boolean | number;

interface ExpressLikeApplication {
  set(name: string, value: unknown): unknown;
}

function proxyMode(config: ConfigService): TrustedProxyMode {
  const raw =
    config.get<string>('TRUST_PROXY_MODE')?.trim().toLowerCase() ?? '';
  const mode = raw || 'none';

  if (mode === 'none' || mode === 'render' || mode === 'hop-count') {
    return mode;
  }

  throw new Error('TRUST_PROXY_MODE must be one of: none, render, hop-count.');
}

function proxyHopCount(config: ConfigService): number {
  const raw = config.get<string>('TRUST_PROXY_HOPS')?.trim() ?? '';
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      'TRUST_PROXY_HOPS must be a positive integer when TRUST_PROXY_MODE=hop-count.',
    );
  }

  const hops = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(hops) || hops < 1 || hops > 10) {
    throw new Error(
      'TRUST_PROXY_HOPS must be between 1 and 10 when TRUST_PROXY_MODE=hop-count.',
    );
  }

  return hops;
}

export function resolveTrustedProxySetting(
  config: ConfigService,
): TrustedProxySetting {
  const mode = proxyMode(config);

  if (mode === 'render') {
    // Render guarantees that the first X-Forwarded-For address is the real
    // client address. Trusting the provider chain lets Express expose it as
    // req.ip while keeping local/direct deployments untrusted by default.
    return true;
  }

  if (mode === 'hop-count') {
    return proxyHopCount(config);
  }

  return false;
}

export function assertProductionTrustedProxyConfig(
  config: ConfigService,
): void {
  if (config.get<string>('NODE_ENV') !== 'production') {
    return;
  }

  const mode = proxyMode(config);
  const deploymentProfile =
    config.get<string>('DEPLOYMENT_PROFILE')?.trim().toLowerCase() ?? '';

  if (deploymentProfile === 'temporary_external_staging' && mode !== 'render') {
    throw new Error(
      'TRUST_PROXY_MODE must be render for the Render external staging deployment.',
    );
  }

  // Validate any mode-specific values before the application accepts traffic.
  resolveTrustedProxySetting(config);
}

export function configureTrustedProxy(
  app: INestApplication,
  config: ConfigService,
): void {
  const expressApp = app
    .getHttpAdapter()
    .getInstance() as ExpressLikeApplication;
  expressApp.set('trust proxy', resolveTrustedProxySetting(config));
}
