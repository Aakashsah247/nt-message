import { Injectable, OnModuleDestroy } from '@nestjs/common';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  lastAccessedAt: number;
}

export interface NativeCacheSetOptions {
  ttlMs: number;
}

@Injectable()
export class NativeCacheService implements OnModuleDestroy {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly cleanupTimer: NodeJS.Timeout;
  private readonly maxEntries: number;

  constructor() {
    const configuredMaxEntries = Number.parseInt(
      process.env.NATIVE_CACHE_MAX_ENTRIES ?? '',
      10,
    );
    this.maxEntries =
      Number.isInteger(configuredMaxEntries) && configuredMaxEntries > 0
        ? configuredMaxEntries
        : 1_000;

    this.cleanupTimer = setInterval(() => this.cleanupExpired(), 60_000);
    this.cleanupTimer.unref?.();
  }

  get<T>(key: string, now = Date.now()): T | undefined {
    const entry = this.entries.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }

    entry.lastAccessedAt = now;
    return entry.value;
  }

  set<T>(
    key: string,
    value: T,
    options: NativeCacheSetOptions,
    now = Date.now(),
  ): T {
    if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) {
      throw new Error('Native cache ttlMs must be greater than zero.');
    }

    this.entries.set(key, {
      value,
      expiresAt: now + options.ttlMs,
      lastAccessedAt: now,
    });
    this.enforceCapacity();
    return value;
  }

  async getOrSet<T>(
    key: string,
    loader: () => Promise<T>,
    options: NativeCacheSetOptions,
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await loader();
    return this.set(key, value, options);
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  invalidatePrefix(prefix: string): number {
    let removed = 0;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
    this.entries.clear();
  }

  private cleanupExpired(now = Date.now()): void {
    for (const [key, entry] of this.entries.entries()) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  private enforceCapacity(): void {
    if (this.entries.size <= this.maxEntries) {
      return;
    }

    let oldestKey: string | null = null;
    let oldestAccess = Number.POSITIVE_INFINITY;

    for (const [key, entry] of this.entries.entries()) {
      if (entry.lastAccessedAt < oldestAccess) {
        oldestKey = key;
        oldestAccess = entry.lastAccessedAt;
      }
    }

    if (oldestKey) {
      this.entries.delete(oldestKey);
    }
  }
}
