import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'node:crypto';

interface BloomGeneration {
  bits: Uint8Array;
  startedAt: number;
}

export const NATIVE_BLOOM_FILTER_OPTIONS = Symbol(
  'NATIVE_BLOOM_FILTER_OPTIONS',
);

export interface NativeBloomFilterOptions {
  bitCount?: number;
  hashCount?: number;
  rotationMs?: number;
}

@Injectable()
export class NativeBloomFilterService implements OnModuleDestroy {
  private readonly bitCount: number;
  private readonly hashCount: number;
  private readonly rotationMs: number;
  private current: BloomGeneration;
  private previous: BloomGeneration | null = null;
  private readonly rotationTimer: NodeJS.Timeout;

  constructor(
    @Inject(NATIVE_BLOOM_FILTER_OPTIONS)
    options: NativeBloomFilterOptions = {},
  ) {
    this.bitCount = this.readPositiveInteger(
      options.bitCount,
      process.env.NATIVE_BLOOM_BIT_COUNT,
      1_048_576,
    );
    this.hashCount = this.readPositiveInteger(
      options.hashCount,
      process.env.NATIVE_BLOOM_HASH_COUNT,
      7,
    );
    this.rotationMs = this.readPositiveInteger(
      options.rotationMs,
      process.env.NATIVE_BLOOM_ROTATION_MS,
      15 * 60_000,
    );

    this.current = this.createGeneration(Date.now());
    this.rotationTimer = setInterval(() => this.rotate(), this.rotationMs);
    this.rotationTimer.unref?.();
  }

  add(scope: string, value: string, now = Date.now()): void {
    this.rotateIfNeeded(now);
    const digest = this.digest(scope, value);
    for (const index of this.indexes(digest)) {
      this.setBit(this.current.bits, index);
    }
  }

  mightContain(scope: string, value: string, now = Date.now()): boolean {
    this.rotateIfNeeded(now);
    const digest = this.digest(scope, value);
    const indexes = this.indexes(digest);

    if (indexes.every((index) => this.hasBit(this.current.bits, index))) {
      return true;
    }

    return (
      this.previous !== null &&
      indexes.every((index) => this.hasBit(this.previous!.bits, index))
    );
  }

  clear(): void {
    this.previous = null;
    this.current = this.createGeneration(Date.now());
  }

  onModuleDestroy(): void {
    clearInterval(this.rotationTimer);
    this.previous = null;
    this.current.bits.fill(0);
  }

  private rotateIfNeeded(now: number): void {
    if (now - this.current.startedAt >= this.rotationMs) {
      this.rotate(now);
    }
  }

  private rotate(now = Date.now()): void {
    this.previous = this.current;
    this.current = this.createGeneration(now);
  }

  private createGeneration(startedAt: number): BloomGeneration {
    return {
      bits: new Uint8Array(Math.ceil(this.bitCount / 8)),
      startedAt,
    };
  }

  private digest(scope: string, value: string): Buffer {
    return createHash('sha256')
      .update(scope)
      .update('\0')
      .update(value)
      .digest();
  }

  private indexes(digest: Buffer): number[] {
    const first = digest.readUInt32BE(0);
    const second = digest.readUInt32BE(4) || 0x9e3779b9;
    const result: number[] = [];

    for (let index = 0; index < this.hashCount; index += 1) {
      result.push((first + index * second) % this.bitCount);
    }

    return result;
  }

  private setBit(bits: Uint8Array, bitIndex: number): void {
    const byteIndex = Math.floor(bitIndex / 8);
    const mask = 1 << (bitIndex % 8);
    bits[byteIndex] = (bits[byteIndex] ?? 0) | mask;
  }

  private hasBit(bits: Uint8Array, bitIndex: number): boolean {
    const byteIndex = Math.floor(bitIndex / 8);
    const mask = 1 << (bitIndex % 8);
    return ((bits[byteIndex] ?? 0) & mask) !== 0;
  }

  private readPositiveInteger(
    explicitValue: number | undefined,
    environmentValue: string | undefined,
    fallback: number,
  ): number {
    if (Number.isInteger(explicitValue) && (explicitValue ?? 0) > 0) {
      return explicitValue!;
    }

    const parsed = Number.parseInt(environmentValue ?? '', 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
