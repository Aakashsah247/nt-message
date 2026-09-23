import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

describe('message security key generation', () => {
  it('writes secret material to a private file without printing the secrets', () => {
    const repositoryRoot = resolve(__dirname, '../../../..');
    const script = join(
      repositoryRoot,
      'scripts/generate_message_security_keys.mjs',
    );
    const directory = mkdtempSync(join(tmpdir(), 'nt-message-keygen-'));
    const output = join(directory, '.env.message-security.generated');

    const stdout = execFileSync(
      process.execPath,
      [script, '--version', '7', '--output', output],
      { encoding: 'utf8' },
    );
    const contents = readFileSync(output, 'utf8');

    expect(stdout).toContain('Secret values were not printed to the terminal.');
    expect(stdout).not.toContain('MESSAGE_ENCRYPTION_KEY_V7_B64=');
    expect(stdout).not.toContain('MESSAGE_SEARCH_INDEX_KEY_V7_B64=');
    expect(stdout).not.toContain('MESSAGE_SIGNING_PRIVATE_KEY_V7_DER_B64=');
    expect(contents).toContain('MESSAGE_CRYPTO_ACTIVE_KEY_VERSION=7');
    expect(contents).toContain('MESSAGE_ENCRYPTION_KEY_V7_B64=');
    expect(contents).toContain('MESSAGE_SEARCH_INDEX_KEY_V7_B64=');
    expect(contents).toContain('MESSAGE_SIGNING_PRIVATE_KEY_V7_DER_B64=');
    expect(contents).toContain('MESSAGE_SIGNING_PUBLIC_KEY_V7_DER_B64=');
    expect(statSync(output).mode & 0o777).toBe(0o600);
  });
});
