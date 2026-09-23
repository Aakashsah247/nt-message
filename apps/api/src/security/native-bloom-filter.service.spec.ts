import { NativeBloomFilterService } from './native-bloom-filter.service';

describe('NativeBloomFilterService', () => {
  it('returns no before insertion and maybe after insertion', () => {
    const service = new NativeBloomFilterService({
      bitCount: 8_192,
      hashCount: 5,
      rotationMs: 60_000,
    });

    try {
      const now = Date.now();
      expect(service.mightContain('auth:refresh-used', 'jti-1', now)).toBe(
        false,
      );
      service.add('auth:refresh-used', 'jti-1', now);
      expect(service.mightContain('auth:refresh-used', 'jti-1', now + 1)).toBe(
        true,
      );
    } finally {
      service.onModuleDestroy();
    }
  });

  it('keeps scopes isolated', () => {
    const service = new NativeBloomFilterService({
      bitCount: 8_192,
      hashCount: 5,
      rotationMs: 60_000,
    });

    try {
      const now = Date.now();
      service.add('auth:refresh-used', 'same-value', now);
      expect(
        service.mightContain('auth:refresh-used', 'same-value', now + 1),
      ).toBe(true);
      expect(service.mightContain('other-scope', 'same-value', now + 1)).toBe(
        false,
      );
    } finally {
      service.onModuleDestroy();
    }
  });

  it('retains only the current and previous time generations', () => {
    const service = new NativeBloomFilterService({
      bitCount: 8_192,
      hashCount: 5,
      rotationMs: 1_000,
    });

    try {
      const now = Date.now();
      service.add('auth:refresh-used', 'old-jti', now);
      expect(
        service.mightContain('auth:refresh-used', 'old-jti', now + 1_001),
      ).toBe(true);
      expect(
        service.mightContain('auth:refresh-used', 'old-jti', now + 2_002),
      ).toBe(false);
    } finally {
      service.onModuleDestroy();
    }
  });
});
