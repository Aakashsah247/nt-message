import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync, randomBytes } from 'node:crypto';

import { assertProductionSecurityConfig } from './production-security-config';

function config(values: Record<string, string>): ConfigService {
  return new ConfigService(values);
}

function messageCryptoConfig(version = 1): Record<string, string> {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { format: 'der', type: 'pkcs8' },
    publicKeyEncoding: { format: 'der', type: 'spki' },
  });

  return {
    MESSAGE_CRYPTO_ACTIVE_KEY_VERSION: String(version),
    [`MESSAGE_ENCRYPTION_KEY_V${version}_B64`]:
      randomBytes(32).toString('base64'),
    [`MESSAGE_SEARCH_INDEX_KEY_V${version}_B64`]:
      randomBytes(32).toString('base64'),
    [`MESSAGE_SIGNING_PRIVATE_KEY_V${version}_DER_B64`]:
      privateKey.toString('base64'),
    [`MESSAGE_SIGNING_PUBLIC_KEY_V${version}_DER_B64`]:
      publicKey.toString('base64'),
  };
}

function validProductionConfig(): Record<string, string> {
  return {
    NODE_ENV: 'production',
    DEPLOYMENT_PROFILE: 'temporary_external_staging',
    TRUST_PROXY_MODE: 'render',
    WEB_ORIGIN: 'https://nt-message.example.test',
    JWT_ACCESS_SECRET: 'a'.repeat(48),
    JWT_REFRESH_SECRET: 'b'.repeat(48),
    OTP_HASH_SECRET: 'c'.repeat(48),
    ACTIVATION_TOKEN_SECRET: 'd'.repeat(48),
    AUTH_COOKIE_NAME: 'nt_message_refresh',
    SMTP_REQUIRE_TLS: 'true',
    SMTP_SECURE: 'false',
    ...messageCryptoConfig(),
  };
}

describe('production security configuration', () => {
  it('does nothing outside production', () => {
    expect(() =>
      assertProductionSecurityConfig(config({ NODE_ENV: 'development' })),
    ).not.toThrow();
  });

  it('accepts production only with HTTPS, distinct strong secrets, TLS SMTP and valid message crypto', () => {
    expect(() =>
      assertProductionSecurityConfig(config(validProductionConfig())),
    ).not.toThrow();
  });

  it('rejects insecure production origin, placeholder/weak secrets and plaintext SMTP', () => {
    expect(() =>
      assertProductionSecurityConfig(
        config({
          ...validProductionConfig(),
          WEB_ORIGIN: 'http://localhost:5173',
        }),
      ),
    ).toThrow('WEB_ORIGIN must use HTTPS in production.');

    expect(() =>
      assertProductionSecurityConfig(
        config({
          ...validProductionConfig(),
          JWT_ACCESS_SECRET: 'replace_with_secret',
        }),
      ),
    ).toThrow('JWT_ACCESS_SECRET');

    expect(() =>
      assertProductionSecurityConfig(
        config({
          ...validProductionConfig(),
          SMTP_REQUIRE_TLS: 'false',
          SMTP_SECURE: 'false',
        }),
      ),
    ).toThrow('Production SMTP');
  });

  it('requires complete active message encryption and search keys in production', () => {
    const values = validProductionConfig();
    delete values.MESSAGE_ENCRYPTION_KEY_V1_B64;
    expect(() => assertProductionSecurityConfig(config(values))).toThrow(
      'MESSAGE_ENCRYPTION_KEY_V1_B64',
    );

    expect(() =>
      assertProductionSecurityConfig(
        config({
          ...validProductionConfig(),
          MESSAGE_SEARCH_INDEX_KEY_V1_B64: randomBytes(16).toString('base64'),
        }),
      ),
    ).toThrow('MESSAGE_SEARCH_INDEX_KEY_V1_B64');
  });

  it('rejects malformed or non-positive message crypto versions', () => {
    expect(() =>
      assertProductionSecurityConfig(
        config({
          ...validProductionConfig(),
          MESSAGE_CRYPTO_ACTIVE_KEY_VERSION: '0',
        }),
      ),
    ).toThrow('MESSAGE_CRYPTO_ACTIVE_KEY_VERSION');

    expect(() =>
      assertProductionSecurityConfig(
        config({
          ...validProductionConfig(),
          MESSAGE_CRYPTO_ACTIVE_KEY_VERSION: 'latest',
        }),
      ),
    ).toThrow('MESSAGE_CRYPTO_ACTIVE_KEY_VERSION');
  });

  it('requires a valid matching Ed25519 signing key pair', () => {
    const other = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { format: 'der', type: 'spki' },
      privateKeyEncoding: { format: 'der', type: 'pkcs8' },
    });

    expect(() =>
      assertProductionSecurityConfig(
        config({
          ...validProductionConfig(),
          MESSAGE_SIGNING_PUBLIC_KEY_V1_DER_B64:
            other.publicKey.toString('base64'),
        }),
      ),
    ).toThrow('matching Ed25519 key pair');
  });
  it('rejects external staging when trusted proxy handling is disabled', () => {
    expect(() =>
      assertProductionSecurityConfig(
        config({
          ...validProductionConfig(),
          TRUST_PROXY_MODE: 'none',
        }),
      ),
    ).toThrow('TRUST_PROXY_MODE must be render');
  });
});
