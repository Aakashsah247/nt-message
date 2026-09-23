import { NativeCacheService } from './native-cache.service';

describe('NativeCacheService', () => {
  it('returns a cached value before expiry and expires it afterward', () => {
    const cache = new NativeCacheService();
    cache.set(
      'reference:office:1',
      { name: 'Patan' },
      { ttlMs: 1_000 },
      10_000,
    );

    expect(cache.get('reference:office:1', 10_500)).toEqual({ name: 'Patan' });
    expect(cache.get('reference:office:1', 11_001)).toBeUndefined();
    cache.onModuleDestroy();
  });

  it('loads a missing value once and supports prefix invalidation', async () => {
    const cache = new NativeCacheService();
    let loads = 0;

    const first = await cache.getOrSet(
      'reference:org-unit-types:office-1',
      async () => {
        loads += 1;
        return ['DIVISION', 'DEPARTMENT'];
      },
      { ttlMs: 60_000 },
    );
    const second = await cache.getOrSet(
      'reference:org-unit-types:office-1',
      async () => {
        loads += 1;
        return ['SHOULD_NOT_LOAD'];
      },
      { ttlMs: 60_000 },
    );

    expect(first).toEqual(['DIVISION', 'DEPARTMENT']);
    expect(second).toEqual(first);
    expect(loads).toBe(1);
    expect(cache.invalidatePrefix('reference:org-unit-types:')).toBe(1);
    expect(cache.size()).toBe(0);
    cache.onModuleDestroy();
  });

  it('rejects non-positive cache TTL values', () => {
    const cache = new NativeCacheService();
    expect(() => cache.set('x', 'y', { ttlMs: 0 })).toThrow(
      'Native cache ttlMs must be greater than zero.',
    );
    cache.onModuleDestroy();
  });
});
