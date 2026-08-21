import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { AttachmentSecurityService } from './attachment-security.service';
import {
  AttachmentStorageService,
  type AttachmentStorageNamespace,
} from './attachment-storage.service';

const SECURITY_BACKFILL_INTERVAL_MS = 60 * 1000;
const SECURITY_BACKFILL_BATCH_SIZE = 50;
const LEGACY_SCAN_STATUSES = ['PENDING', 'FORMAT_VALIDATED'];

/**
 * Production transition helper for attachments created before strict malware
 * scanning was enabled. It upgrades legacy references to CLEAN in small
 * background batches without trusting them merely because they predate Phase 2C.
 */
@Injectable()
export class AttachmentSecurityBackfillService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AttachmentSecurityBackfillService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: AttachmentStorageService,
    private readonly security: AttachmentSecurityService,
  ) {}

  onModuleInit(): void {
    if (
      process.env.NODE_ENV !== 'production' ||
      !this.security.isStrictScanMode()
    ) {
      return;
    }

    void this.processBackfillBatch();
    this.timer = setInterval(() => {
      void this.processBackfillBatch();
    }, SECURITY_BACKFILL_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async processBackfillBatch(): Promise<void> {
    if (this.running || !this.security.isStrictScanMode()) return;
    this.running = true;

    try {
      const messageObjects = await this.prisma.messageAttachment.findMany({
        where: {
          scanStatus: { in: LEGACY_SCAN_STATUSES },
          expiredAt: null,
          purgedAt: null,
        },
        select: { storageKey: true },
        distinct: ['storageKey'],
        take: SECURITY_BACKFILL_BATCH_SIZE,
      });

      for (const object of messageObjects) {
        const shouldContinue = await this.scanOnePhysicalObject(
          'messages',
          object.storageKey,
        );
        if (!shouldContinue) return;
      }

      const announcementObjects =
        await this.prisma.announcementAttachment.findMany({
          where: {
            scanStatus: { in: LEGACY_SCAN_STATUSES },
            expiredAt: null,
            purgedAt: null,
          },
          select: { storageKey: true },
          distinct: ['storageKey'],
          take: SECURITY_BACKFILL_BATCH_SIZE,
        });

      for (const object of announcementObjects) {
        const shouldContinue = await this.scanOnePhysicalObject(
          'announcements',
          object.storageKey,
        );
        if (!shouldContinue) return;
      }
    } finally {
      this.running = false;
    }
  }

  private async scanOnePhysicalObject(
    namespace: AttachmentStorageNamespace,
    storageKey: string,
  ): Promise<boolean> {
    const exists = await this.storage.exists(namespace, storageKey);
    if (!exists) {
      await this.updateObjectReferences(namespace, storageKey, 'FAILED');
      this.logger.warn(
        `Legacy attachment security backfill found a missing ${namespace} object.`,
      );
      return true;
    }

    const absolutePath = this.storage.resolvePath(namespace, storageKey);

    try {
      await this.security.scanStoredFile(absolutePath);
      await this.updateObjectReferences(namespace, storageKey, 'CLEAN');
      return true;
    } catch (error) {
      if (error instanceof BadRequestException) {
        const removed = await this.storage.deleteFile(namespace, storageKey);
        await this.updateObjectReferences(
          namespace,
          storageKey,
          'QUARANTINED',
          removed ? new Date() : null,
        );
        this.logger.warn(
          `Legacy ${namespace} attachment was quarantined by the production scanner.`,
        );
        return true;
      }

      // Scanner outages are temporary infrastructure failures. Do not mark a
      // previously unknown object as safe or failed; retry on the next pass.
      this.logger.warn(
        'Legacy attachment security backfill paused because the scanner is unavailable.',
      );
      return false;
    }
  }

  private async updateObjectReferences(
    namespace: AttachmentStorageNamespace,
    storageKey: string,
    scanStatus: 'CLEAN' | 'FAILED' | 'QUARANTINED',
    purgedAt?: Date | null,
  ): Promise<void> {
    const data = {
      scanStatus,
      ...(purgedAt ? { purgedAt } : {}),
    };

    if (namespace === 'messages') {
      await this.prisma.messageAttachment.updateMany({
        where: { storageKey },
        data,
      });
      return;
    }

    await this.prisma.announcementAttachment.updateMany({
      where: { storageKey },
      data,
    });
  }
}
