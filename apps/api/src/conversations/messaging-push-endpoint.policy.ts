import { BadRequestException } from '@nestjs/common';
import { isIP } from 'node:net';

const DEFAULT_ALLOWED_PUSH_HOST_SUFFIXES = [
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
  'notify.windows.com',
] as const;

function normalizeHostSuffix(value: string): string | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, '');

  if (
    !normalized ||
    normalized.includes('/') ||
    normalized.includes(':') ||
    normalized === 'localhost' ||
    isIP(normalized) !== 0
  ) {
    return null;
  }

  return normalized;
}

export function resolveAllowedPushHostSuffixes(
  configuredValue: string | undefined,
): string[] {
  const configured = configuredValue
    ?.split(',')
    .map(normalizeHostSuffix)
    .filter((value): value is string => Boolean(value));

  return configured?.length
    ? [...new Set(configured)]
    : [...DEFAULT_ALLOWED_PUSH_HOST_SUFFIXES];
}

export function assertTrustedMessagingPushEndpoint(
  endpoint: string,
  allowedHostSuffixes: readonly string[],
): void {
  let url: URL;

  try {
    url = new URL(endpoint);
  } catch {
    throw new BadRequestException('Push subscription endpoint is invalid.');
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  ) {
    throw new BadRequestException(
      'Push subscription endpoint must use trusted HTTPS push delivery.',
    );
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');

  if (!hostname || hostname === 'localhost' || isIP(hostname) !== 0) {
    throw new BadRequestException(
      'Push subscription endpoint host is not an approved push service.',
    );
  }

  const allowed = allowedHostSuffixes.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );

  if (!allowed) {
    throw new BadRequestException(
      'Push subscription endpoint host is not an approved push service.',
    );
  }
}
