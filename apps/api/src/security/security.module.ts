import { Global, Module } from '@nestjs/common';

import { CookieAuthOriginGuard } from './cookie-auth-origin.guard';

import {
  NATIVE_BLOOM_FILTER_OPTIONS,
  NativeBloomFilterService,
} from './native-bloom-filter.service';
import { NativeCacheService } from './native-cache.service';
import { NativeRateLimitService } from './native-rate-limit.service';
import { RateLimitGuard } from './rate-limit.guard';

@Global()
@Module({
  providers: [
    { provide: NATIVE_BLOOM_FILTER_OPTIONS, useValue: {} },
    NativeBloomFilterService,
    NativeCacheService,
    NativeRateLimitService,
    RateLimitGuard,
    CookieAuthOriginGuard,
  ],
  exports: [
    NativeBloomFilterService,
    NativeCacheService,
    NativeRateLimitService,
    RateLimitGuard,
    CookieAuthOriginGuard,
  ],
})
export class SecurityModule {}
