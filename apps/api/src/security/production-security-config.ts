import type { ConfigService } from '@nestjs/config';
import {
  createPrivateKey,
  createPublicKey,
  timingSafeEqual,
  type KeyObject,
} from 'node:crypto';
import { assertProductionTrustedProxyConfig } from './trusted-proxy';

const PLACEHOLDER_PATTERN =
  /(replace[_-]?with|changeme|change[_-]?me|example|default|development|dev[_-]?secret)/i;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

function requireStrongSecret(
  config: ConfigService,
  name: string,
  minimumLength = 32,
): string {
  const value = config.get<string>(name)?.trim() ?? '';

  if (value.length < minimumLength || PLACEHOLDER_PATTERN.test(value)) {
    throw new Error(
      `${name} must be a non-placeholder secret of at least ${minimumLength} characters in production.`,
    );
  }

  return value;
}

function requirePositiveInteger(config: ConfigService, name: string): number {
  const raw = config.get<string>(name)?.trim() ?? '';
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a positive integer in production.`);
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer in production.`);
  }

  return value;
}

function requireBase64Secret(
  config: ConfigService,
  name: string,
  expectedBytes?: number,
): Buffer {
  const raw = config.get<string>(name)?.trim() ?? '';
  if (!raw || PLACEHOLDER_PATTERN.test(raw)) {
    throw new Error(`${name} must be configured in production.`);
  }
  if (raw.length % 4 !== 0 || !BASE64_PATTERN.test(raw)) {
    throw new Error(`${name} must contain valid base64 in production.`);
  }

  const decoded = Buffer.from(raw, 'base64');
  if (expectedBytes !== undefined && decoded.length !== expectedBytes) {
    decoded.fill(0);
    throw new Error(
      `${name} must decode to exactly ${expectedBytes} bytes in production.`,
    );
  }
  if (decoded.length === 0) {
    throw new Error(`${name} must not be empty in production.`);
  }

  return decoded;
}

function requireEd25519PrivateKey(
  config: ConfigService,
  name: string,
): KeyObject {
  const der = requireBase64Secret(config, name);
  try {
    const key = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
    if (key.asymmetricKeyType !== 'ed25519') {
      throw new Error(`${name} must contain an Ed25519 private key.`);
    }
    return key;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Ed25519')) {
      throw error;
    }
    throw new Error(`${name} must contain a valid Ed25519 private key.`);
  } finally {
    der.fill(0);
  }
}

function requireEd25519PublicKey(
  config: ConfigService,
  name: string,
): KeyObject {
  const der = requireBase64Secret(config, name);
  try {
    const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ed25519') {
      throw new Error(`${name} must contain an Ed25519 public key.`);
    }
    return key;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Ed25519')) {
      throw error;
    }
    throw new Error(`${name} must contain a valid Ed25519 public key.`);
  } finally {
    der.fill(0);
  }
}

function assertMessageCryptoConfig(config: ConfigService): void {
  const version = requirePositiveInteger(
    config,
    'MESSAGE_CRYPTO_ACTIVE_KEY_VERSION',
  );
  const encryptionName = `MESSAGE_ENCRYPTION_KEY_V${version}_B64`;
  const searchName = `MESSAGE_SEARCH_INDEX_KEY_V${version}_B64`;
  const privateName = `MESSAGE_SIGNING_PRIVATE_KEY_V${version}_DER_B64`;
  const publicName = `MESSAGE_SIGNING_PUBLIC_KEY_V${version}_DER_B64`;

  const encryptionKey = requireBase64Secret(config, encryptionName, 32);
  const searchKey = requireBase64Secret(config, searchName, 32);
  encryptionKey.fill(0);
  searchKey.fill(0);

  const privateKey = requireEd25519PrivateKey(config, privateName);
  const publicKey = requireEd25519PublicKey(config, publicName);
  const derivedPublic = createPublicKey(privateKey).export({
    format: 'der',
    type: 'spki',
  });
  const configuredPublic = publicKey.export({ format: 'der', type: 'spki' });

  if (
    derivedPublic.length !== configuredPublic.length ||
    !timingSafeEqual(derivedPublic, configuredPublic)
  ) {
    throw new Error(
      `${privateName} and ${publicName} must be a matching Ed25519 key pair.`,
    );
  }
}

export function assertProductionSecurityConfig(config: ConfigService): void {
  if (config.get<string>('NODE_ENV') !== 'production') {
    return;
  }

  assertProductionTrustedProxyConfig(config);

  const webOrigin = config.get<string>('WEB_ORIGIN')?.trim() ?? '';
  if (!webOrigin.startsWith('https://')) {
    throw new Error('WEB_ORIGIN must use HTTPS in production.');
  }

  const accessSecret = requireStrongSecret(config, 'JWT_ACCESS_SECRET');
  const refreshSecret = requireStrongSecret(config, 'JWT_REFRESH_SECRET');
  requireStrongSecret(config, 'OTP_HASH_SECRET');
  requireStrongSecret(config, 'ACTIVATION_TOKEN_SECRET');

  if (accessSecret === refreshSecret) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different in production.',
    );
  }

  const cookieName = config.get<string>('AUTH_COOKIE_NAME')?.trim() ?? '';
  if (!cookieName) {
    throw new Error('AUTH_COOKIE_NAME is required in production.');
  }

  const smtpSecure = config.get<string>('SMTP_SECURE') === 'true';
  const smtpRequireTls = config.get<string>('SMTP_REQUIRE_TLS') === 'true';
  if (!smtpSecure && !smtpRequireTls) {
    throw new Error(
      'Production SMTP must enable SMTP_SECURE or SMTP_REQUIRE_TLS.',
    );
  }

  assertMessageCryptoConfig(config);
}
