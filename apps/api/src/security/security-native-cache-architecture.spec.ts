import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('native cache security architecture', () => {
  const securityModule = readFileSync(
    resolve(process.cwd(), 'src/security/security.module.ts'),
    'utf8',
  );
  const cacheService = readFileSync(
    resolve(process.cwd(), 'src/security/native-cache.service.ts'),
    'utf8',
  );
  const organizationService = readFileSync(
    resolve(
      process.cwd(),
      'src/organization/organization-hierarchy.service.ts',
    ),
    'utf8',
  );

  it('registers one bounded in-process cache as a global security provider', () => {
    expect(securityModule).toContain('NativeCacheService');
    expect(cacheService).toContain('NATIVE_CACHE_MAX_ENTRIES');
    expect(cacheService).toContain('enforceCapacity');
    expect(cacheService).toContain('cleanupExpired');
  });

  it('uses caching only after office authorization and invalidates reference data on mutation', () => {
    const getOfficeStart = organizationService.indexOf('async getOffice(');
    const getOfficeBody = organizationService.slice(
      getOfficeStart,
      getOfficeStart + 2_500,
    );

    expect(getOfficeBody.indexOf('assertCanViewOffice')).toBeGreaterThanOrEqual(
      0,
    );
    expect(getOfficeBody.indexOf('orgUnitTypesCacheKey')).toBeGreaterThan(
      getOfficeBody.indexOf('assertCanViewOffice'),
    );
    expect(organizationService).toContain(
      'invalidateOrgUnitTypeCache(officeId)',
    );
  });

  it('does not cache decrypted messages or cryptographic secrets', () => {
    const source = `${cacheService}\n${organizationService}`;
    expect(source).not.toContain('MESSAGE_ENCRYPTION_KEY_V1_B64');
    expect(source).not.toContain('MESSAGE_SIGNING_PRIVATE_KEY_V1_DER_B64');
    expect(source).not.toContain('Decrypted text');
    expect(source).not.toContain('textContentCache');
  });
});
