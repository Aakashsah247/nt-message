import { generateKeyPairSync, randomBytes } from 'node:crypto';

import {
  MessageContentIntegrityError,
  MessageContentSecurity,
} from './message-content-security';

function securityEnvironment(): NodeJS.ProcessEnv {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { format: 'der', type: 'pkcs8' },
    publicKeyEncoding: { format: 'der', type: 'spki' },
  });

  return {
    NODE_ENV: 'production',
    MESSAGE_CRYPTO_ACTIVE_KEY_VERSION: '1',
    MESSAGE_ENCRYPTION_KEY_V1_B64: randomBytes(32).toString('base64'),
    MESSAGE_SEARCH_INDEX_KEY_V1_B64: randomBytes(32).toString('base64'),
    MESSAGE_SIGNING_PRIVATE_KEY_V1_DER_B64: privateKey.toString('base64'),
    MESSAGE_SIGNING_PUBLIC_KEY_V1_DER_B64: publicKey.toString('base64'),
  };
}

describe('MessageContentSecurity', () => {
  const context = {
    id: '62b73a87-8ec6-45fe-a856-d2b19aa1ade0',
    conversationId: 'f810e7b9-ea49-40c7-a038-4f2912816815',
    senderAccountId: '767341c0-ce29-4309-b68e-808241cd485b',
    contentType: 'TEXT',
    sentAt: new Date('2026-09-21T00:00:00.000Z'),
    editedAt: null,
  };

  it('encrypts text with AES-256-GCM and verifies the Ed25519 envelope', () => {
    const security = new MessageContentSecurity(securityEnvironment());
    const secured = security.protectText('Hello Nepal Telecom', context);

    expect(secured.textSecurityVersion).toBe(1);
    expect(secured.textContent).not.toContain('Hello Nepal Telecom');
    expect(secured.textEncryptionIv).toEqual(expect.any(String));
    expect(secured.textEncryptionTag).toEqual(expect.any(String));
    expect(secured.textSignature).toEqual(expect.any(String));
    expect(security.unprotectText(secured, context)).toBe(
      'Hello Nepal Telecom',
    );
  });

  it('rejects ciphertext or identity metadata changed directly in storage', () => {
    const security = new MessageContentSecurity(securityEnvironment());
    const secured = security.protectText(
      'Official office instruction',
      context,
    );

    expect(() =>
      security.unprotectText(
        {
          ...secured,
          textContent: `${secured.textContent?.slice(0, -1)}A`,
        },
        context,
      ),
    ).toThrow(MessageContentIntegrityError);

    expect(() =>
      security.unprotectText(secured, {
        ...context,
        senderAccountId: '00000000-0000-0000-0000-000000000001',
      }),
    ).toThrow(MessageContentIntegrityError);
  });

  it('rejects conversation, timestamp, and blind-search-token tampering', () => {
    const security = new MessageContentSecurity(securityEnvironment());
    const secured = security.protectText('Inspection ticket 8842', context);

    expect(() =>
      security.unprotectText(secured, {
        ...context,
        conversationId: '00000000-0000-0000-0000-000000000002',
      }),
    ).toThrow(MessageContentIntegrityError);

    expect(() =>
      security.unprotectText(secured, {
        ...context,
        sentAt: new Date('2026-09-21T00:00:01.000Z'),
      }),
    ).toThrow(MessageContentIntegrityError);

    expect(() =>
      security.unprotectText(
        {
          ...secured,
          textSearchTokens: [...secured.textSearchTokens, 'forged-token'],
        },
        context,
      ),
    ).toThrow(MessageContentIntegrityError);
  });

  it('keeps version-0 historical plaintext readable during migration', () => {
    const security = new MessageContentSecurity(securityEnvironment());
    expect(
      security.unprotectText(
        {
          textContent: 'Historical message',
          textSecurityVersion: 0,
          textEncryptionKeyVersion: null,
          textEncryptionIv: null,
          textEncryptionTag: null,
          textSignatureKeyVersion: null,
          textSignature: null,
          textSearchTokens: [],
        },
        context,
      ),
    ).toBe('Historical message');
  });
});
