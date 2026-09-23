import { Injectable, OnModuleDestroy } from '@nestjs/common';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

@Injectable()
export class NativeRateLimitService implements OnModuleDestroy {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private readonly cleanupTimer: NodeJS.Timeout;
  private readonly maxBuckets: number;

  constructor() {
    this.maxBuckets = this.readMaxBuckets(
      process.env.NATIVE_RATE_LIMIT_MAX_BUCKETS,
    );
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), 60_000);
    this.cleanupTimer.unref?.();
  }

  consume(
    key: string,
    limit: number,
    windowMs: number,
    now = Date.now(),
  ): RateLimitDecision {
    const existing = this.buckets.get(key);

    if (!existing) {
      this.ensureCapacity(now);
    }

    const bucket =
      !existing || existing.resetAt <= now
        ? { count: 0, resetAt: now + windowMs }
        : existing;

    bucket.count += 1;
    this.buckets.set(key, bucket);

    const allowed = bucket.count <= limit;
    const remaining = Math.max(0, limit - bucket.count);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((bucket.resetAt - now) / 1000),
    );

    return {
      allowed,
      limit,
      remaining,
      resetAt: bucket.resetAt,
      retryAfterSeconds,
    };
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
    this.buckets.clear();
  }

  private cleanupExpired(now = Date.now()): void {
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }

  private ensureCapacity(now: number): void {
    if (this.buckets.size < this.maxBuckets) {
      return;
    }

    this.cleanupExpired(now);
    if (this.buckets.size < this.maxBuckets) {
      return;
    }

    /*
     * Keep memory bounded even if an attacker continuously invents new
     * identities. Prefer evicting the bucket that will expire first.
     */
    let evictionKey: string | null = null;
    let earliestResetAt = Number.POSITIVE_INFINITY;
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt < earliestResetAt) {
        evictionKey = key;
        earliestResetAt = bucket.resetAt;
      }
    }

    if (evictionKey) {
      this.buckets.delete(evictionKey);
    }
  }

  private readMaxBuckets(value: string | undefined): number {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isSafeInteger(parsed) && parsed >= 2 && parsed <= 1_000_000
      ? parsed
      : 100_000;
  }
}
