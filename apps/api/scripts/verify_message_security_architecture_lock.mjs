import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(apiRoot, '../..');

const failures = [];
const assertions = [];

function pass(message) {
  assertions.push(message);
}

function fail(message) {
  failures.push(message);
}

async function text(relativePath) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

async function exists(relativePath) {
  try {
    await stat(path.join(repoRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(directory, extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json'])) {
  const result = [];
  const absolute = path.join(repoRoot, directory);
  const entries = await readdir(absolute, { withFileTypes: true });
  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (['generated', 'node_modules', 'dist', 'coverage'].includes(entry.name)) continue;
      result.push(...(await collectFiles(relative, extensions)));
      continue;
    }
    if (extensions.has(path.extname(entry.name))) result.push(relative);
  }
  return result;
}

function requireContains(source, needle, label) {
  if (!source.includes(needle)) fail(`${label} is missing: ${needle}`);
  else pass(label);
}

function requireNotContains(source, needle, label) {
  if (source.includes(needle)) fail(`${label} still contains forbidden token: ${needle}`);
  else pass(label);
}

const schema = await text('apps/api/prisma/schema.prisma');
for (const field of [
  'textSecurityVersion',
  'textEncryptionKeyVersion',
  'textEncryptionIv',
  'textEncryptionTag',
  'textSignatureKeyVersion',
  'textSignature',
  'textSearchTokens',
  'contentSecurityVersion',
  'contentEncryptionKeyVersion',
  'contentEncryptionIv',
  'contentEncryptionTag',
  'contentSignatureKeyVersion',
  'contentSignature',
  'ciphertextSha256',
  'encryptedSizeBytes',
]) {
  requireContains(schema, field, `Prisma security field ${field}`);
}
requireContains(schema, 'model MessageSecurityTombstone', 'Message deletion tombstone model');

for (const migration of [
  'apps/api/prisma/migrations/20260921073000_lock_message_text_security/migration.sql',
  'apps/api/prisma/migrations/20260921080000_message_deletion_tombstone_audit/migration.sql',
  'apps/api/prisma/migrations/20260921090000_lock_attachment_content_security/migration.sql',
]) {
  if (!(await exists(migration))) fail(`Required security migration missing: ${migration}`);
  else pass(`Security migration present: ${path.basename(path.dirname(migration))}`);
}

const messageSecurity = await text('apps/api/src/conversations/message-content-security.ts');
requireContains(messageSecurity, "createCipheriv('aes-256-gcm'", 'Message AES-256-GCM encryption');
requireContains(messageSecurity, "generateKeyPairSync('ed25519')", 'Message Ed25519 support');
requireContains(messageSecurity, 'cipher.setAAD(aad)', 'Message authenticated metadata');
requireContains(messageSecurity, 'verify(', 'Message signature verification');

const attachmentSecurity = await text('apps/api/src/conversations/message-attachment-content-security.ts');
requireContains(attachmentSecurity, "createCipheriv('aes-256-gcm'", 'Attachment AES-256-GCM encryption');
requireContains(attachmentSecurity, "createHash('sha256')", 'Attachment ciphertext digest');
requireContains(attachmentSecurity, 'verify(', 'Attachment signature verification');

const conversationsService = await text('apps/api/src/conversations/conversations.service.ts');
requireContains(conversationsService, 'this.protectMessageText(', 'Message writes route through protection helper');
requireContains(conversationsService, 'this.messageContentSecurity.unprotectText(', 'Message reads route through verification/decryption');
requireContains(conversationsService, 'this.messageAttachmentContentSecurity.protectBuffer(', 'Attachment writes route through protection helper');
requireContains(conversationsService, 'this.messageAttachmentContentSecurity.unprotectBuffer(', 'Attachment reads route through verification/decryption');

for (const dangerousPattern of [
  /textContent\s*:\s*dto\.textContent/g,
  /textContent\s*:\s*dto\.text\b/g,
  /textContent\s*:\s*caption\b/g,
]) {
  if (dangerousPattern.test(conversationsService)) {
    fail(`ConversationsService contains a direct plaintext message write matching ${dangerousPattern}`);
  }
}
if (!failures.some((item) => item.includes('direct plaintext message write'))) {
  pass('No known direct plaintext message write bypass found');
}

const runtimeFiles = [
  ...(await collectFiles('apps/api/src')),
  ...(await collectFiles('apps/web/src')),
  'package.json',
  'apps/api/package.json',
  'apps/web/package.json',
];
for (const file of runtimeFiles) {
  const source = await text(file);
  for (const forbidden of ['OpenMLS', 'openmls', 'MLS_E2EE', 'MlsDevice', 'mlsGroupId', 'mlsEpoch']) {
    if (source.includes(forbidden)) fail(`MLS runtime token ${forbidden} remains in ${file}`);
  }
}
if (!failures.some((item) => item.includes('MLS runtime token'))) {
  pass('No MLS/OpenMLS runtime dependency remains');
}

const rootPackage = await text('package.json');
requireNotContains(rootPackage, 'e2ee:build-wasm', 'Root package MLS/WASM build command');
requireContains(rootPackage, 'message:security:audit', 'Root security audit command');
requireContains(rootPackage, 'message:security:backfill', 'Root message backfill command');
requireContains(rootPackage, 'message:security:backfill-attachments', 'Root attachment backfill command');

const envExample = await text('.env.example');
for (const variable of [
  'MESSAGE_CRYPTO_ACTIVE_KEY_VERSION',
  'MESSAGE_ENCRYPTION_KEY_V1_B64',
  'MESSAGE_SEARCH_INDEX_KEY_V1_B64',
  'MESSAGE_SIGNING_PRIVATE_KEY_V1_DER_B64',
  'MESSAGE_SIGNING_PUBLIC_KEY_V1_DER_B64',
]) {
  requireContains(envExample, variable, `.env.example documents ${variable}`);
}
const gitignore = await text('.gitignore');
if (/^\.env$/m.test(gitignore) || /^\.env\*/m.test(gitignore)) pass('Root .env is ignored by Git');
else fail('Root .env is not explicitly ignored by Git');

if (failures.length > 0) {
  console.error(`Message security architecture lock FAILED with ${failures.length} issue(s):`);
  for (const item of failures) console.error(` - ${item}`);
  process.exitCode = 1;
} else {
  console.log(`Message security architecture lock passed: ${assertions.length} invariant(s) verified.`);
  for (const item of assertions) console.log(` - ${item}`);
}
