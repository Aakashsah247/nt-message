import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Bloom filter security architecture', () => {
  const securityModule = readFileSync(
    resolve(process.cwd(), 'src/security/security.module.ts'),
    'utf8',
  );
  const bloomService = readFileSync(
    resolve(process.cwd(), 'src/security/native-bloom-filter.service.ts'),
    'utf8',
  );
  const authService = readFileSync(
    resolve(process.cwd(), 'src/auth/auth.service.ts'),
    'utf8',
  );

  it('registers one bounded rotating Bloom filter as a global provider', () => {
    expect(securityModule).toContain('NativeBloomFilterService');
    expect(bloomService).toContain('NATIVE_BLOOM_BIT_COUNT');
    expect(bloomService).toContain('NATIVE_BLOOM_ROTATION_MS');
    expect(bloomService).toContain('Uint8Array');
    expect(bloomService).toContain('previous');
  });

  it('uses the Bloom filter only as a refresh replay pre-check signal', () => {
    expect(authService).toContain("mightContain('auth:refresh-used'");
    expect(authService).toContain("add('auth:refresh-used'");
    expect(authService).toContain('tokenHashesMatch');
    expect(authService).toContain('authSession.updateMany');
    expect(authService).toContain('Bloom positives are never authoritative');
  });

  it('does not use Bloom membership as authorization or permission authority', () => {
    expect(authService).not.toContain(
      'if (probableRefreshReplay) {\n      throw',
    );
    expect(bloomService).not.toContain('accountClass');
    expect(bloomService).not.toContain('OrgUnit');
    expect(bloomService).not.toContain('permission');
  });
});
