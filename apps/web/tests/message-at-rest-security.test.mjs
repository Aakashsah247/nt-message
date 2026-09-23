import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const cryptoModuleSourcePath = path.join(
  root,
  'apps/api/src/conversations/message-content-security.ts',
);
const cryptoModuleTempDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'nt-message-security-'),
);
const cryptoModulePath = path.join(
  cryptoModuleTempDir,
  'message-content-security.mts',
);
fs.copyFileSync(cryptoModuleSourcePath, cryptoModulePath);
test.after(() => {
  fs.rmSync(cryptoModuleTempDir, { recursive: true, force: true });
});
const serviceSource = fs.readFileSync(
  path.join(root, 'apps/api/src/conversations/conversations.service.ts'),
  'utf8',
);
const schemaSource = fs.readFileSync(
  path.join(root, 'apps/api/prisma/schema.prisma'),
  'utf8',
);
const migrationSource = fs.readFileSync(
  path.join(
    root,
    'apps/api/prisma/migrations/20260921070000_message_at_rest_security_foundation/migration.sql',
  ),
  'utf8',
);

function testEnvironment() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { format: 'der', type: 'pkcs8' },
    publicKeyEncoding: { format: 'der', type: 'spki' },
  });

  return {
    MESSAGE_CRYPTO_ACTIVE_KEY_VERSION: '1',
    MESSAGE_ENCRYPTION_KEY_V1_B64: randomBytes(32).toString('base64'),
    MESSAGE_SEARCH_INDEX_KEY_V1_B64: randomBytes(32).toString('base64'),
    MESSAGE_SIGNING_PRIVATE_KEY_V1_DER_B64: privateKey.toString('base64'),
    MESSAGE_SIGNING_PUBLIC_KEY_V1_DER_B64: publicKey.toString('base64'),
  };
}

test('AES-256-GCM stores ciphertext while Ed25519 verifies message identity and integrity', async () => {
  const { MessageContentSecurity, MessageContentIntegrityError } = await import(
    pathToFileURL(cryptoModulePath).href
  );
  const security = new MessageContentSecurity(testEnvironment());
  const context = {
    id: '62b73a87-8ec6-45fe-a856-d2b19aa1ade0',
    conversationId: 'f810e7b9-ea49-40c7-a038-4f2912816815',
    senderAccountId: '767341c0-ce29-4309-b68e-808241cd485b',
    contentType: 'TEXT',
    sentAt: new Date('2026-09-21T00:00:00.000Z'),
    editedAt: null,
  };

  const protectedFields = security.protectText('Hello Nepal Telecom', context);
  assert.equal(protectedFields.textSecurityVersion, 1);
  assert.notEqual(protectedFields.textContent, 'Hello Nepal Telecom');
  assert.equal(protectedFields.textContent?.includes('Hello'), false);
  assert.ok(protectedFields.textEncryptionIv);
  assert.ok(protectedFields.textEncryptionTag);
  assert.ok(protectedFields.textSignature);
  assert.equal(
    security.unprotectText(protectedFields, context),
    'Hello Nepal Telecom',
  );

  const originalCiphertext = protectedFields.textContent ?? '';
  const lastCiphertextCharacter = originalCiphertext.at(-1);
  const tamperedCiphertext = {
    ...protectedFields,
    textContent: `${originalCiphertext.slice(0, -1)}${
      lastCiphertextCharacter === 'A' ? 'B' : 'A'
    }`,
  };
  assert.throws(
    () => security.unprotectText(tamperedCiphertext, context),
    MessageContentIntegrityError,
  );

  assert.throws(
    () =>
      security.unprotectText(protectedFields, {
        ...context,
        senderAccountId: '00000000-0000-0000-0000-000000000001',
      }),
    MessageContentIntegrityError,
  );

  assert.throws(
    () =>
      security.unprotectText(
        { ...protectedFields, textSearchTokens: ['1.tampered'] },
        context,
      ),
    MessageContentIntegrityError,
  );
});

test('blind search tokens do not store plaintext and support protected prefix search', async () => {
  const { MessageContentSecurity } = await import(
    pathToFileURL(cryptoModulePath).href
  );
  const security = new MessageContentSecurity(testEnvironment());
  const indexed = security.buildSearchTokens('Hello Nepal Telecom');
  const query = security.buildSearchQueryTokens('Nep');

  assert.ok(indexed.length > 0);
  assert.ok(query.length > 0);
  assert.equal(indexed.some((token) => /hello|nepal|telecom/i.test(token)), false);
  for (const token of query) {
    assert.ok(indexed.includes(token));
  }
});

test('new message writes use protected text fields and DB notifications avoid plaintext previews', () => {
  assert.match(serviceSource, /const securedText = this\.protectMessageText\(textContent/);
  assert.match(serviceSource, /contentType: MessageContentType\.TEXT,[\s\S]*\.\.\.securedText/);
  assert.match(serviceSource, /const securedEditedText = this\.protectMessageText/);
  assert.match(serviceSource, /const securedForwardedText = this\.protectMessageText/);
  assert.match(serviceSource, /const securedAttachmentCaption = this\.protectMessageText/);
  assert.match(serviceSource, /body: storedNotificationBody/);
  assert.match(serviceSource, /body: 'Message reaction'/);
  assert.match(serviceSource, /originalTextContent: ''/);
});

test('Prisma schema and migration keep legacy rows readable while introducing signed ciphertext fields', () => {
  assert.match(schemaSource, /textSecurityVersion\s+Int\s+@default\(0\)/);
  assert.match(schemaSource, /textEncryptionIv/);
  assert.match(schemaSource, /textEncryptionTag/);
  assert.match(schemaSource, /textSignature/);
  assert.match(schemaSource, /textSearchTokens\s+String\[\]/);
  assert.match(migrationSource, /messages_text_security_envelope_check/);
  assert.match(migrationSource, /USING GIN \("text_search_tokens"\)/);
});
