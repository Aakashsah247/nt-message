import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { chmodSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseArguments(argv) {
  let version = 1;
  let output = '.env.message-security.generated';

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--version') {
      const raw = argv[index + 1];
      if (!raw || !/^\d+$/.test(raw) || Number(raw) <= 0) {
        throw new Error('--version must be a positive integer.');
      }
      version = Number(raw);
      index += 1;
      continue;
    }
    if (argument === '--output') {
      const raw = argv[index + 1];
      if (!raw?.trim()) {
        throw new Error('--output requires a file path.');
      }
      output = raw.trim();
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return { version, output: resolve(output) };
}

const { version, output } = parseArguments(process.argv.slice(2));
const encryptionKey = randomBytes(32).toString('base64');
const searchIndexKey = randomBytes(32).toString('base64');
const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { format: 'der', type: 'pkcs8' },
  publicKeyEncoding: { format: 'der', type: 'spki' },
});

const contents = [
  '# NT Message application-layer message security',
  `MESSAGE_CRYPTO_ACTIVE_KEY_VERSION=${version}`,
  `MESSAGE_ENCRYPTION_KEY_V${version}_B64=${encryptionKey}`,
  `MESSAGE_SEARCH_INDEX_KEY_V${version}_B64=${searchIndexKey}`,
  `MESSAGE_SIGNING_PRIVATE_KEY_V${version}_DER_B64=${privateKey.toString('base64')}`,
  `MESSAGE_SIGNING_PUBLIC_KEY_V${version}_DER_B64=${publicKey.toString('base64')}`,
  '',
].join('\n');

try {
  writeFileSync(output, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  chmodSync(output, 0o600);
} catch (error) {
  if (error && typeof error === 'object' && error.code === 'EEXIST') {
    throw new Error(`Refusing to overwrite existing key file: ${output}`);
  }
  throw error;
}

console.log('NT Message security key material generated successfully.');
console.log(`Output file: ${output}`);
console.log('File permissions: 0600');
console.log('Secret values were not printed to the terminal.');
