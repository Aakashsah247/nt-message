import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { AttachmentStorageService } from '../attachments/attachment-storage.service';
import { PrismaService } from '../database/prisma.service';
import {
  WORK_ATTACHMENT_RETENTION_CLEANUP_BATCH_SIZE,
  WORK_ATTACHMENT_RETENTION_CLEANUP_INTERVAL_MS,
} from './work-attachment-retention.constants';

@Injectable()
export class WorkAttachmentRetentionService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WorkAttachmentRetentionService.name);
  private retentionCleanupTimer: ReturnType<typeof setInterval> | null = null;
  private retentionCleanupRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly attachmentStorage: AttachmentStorageService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.cleanupExpiredAttachments();
    this.retentionCleanupTimer = setInterval(() => {
      void this.cleanupExpiredAttachments();
    }, WORK_ATTACHMENT_RETENTION_CLEANUP_INTERVAL_MS);
    this.retentionCleanupTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.retentionCleanupTimer) {
      clearInterval(this.retentionCleanupTimer);
    }
  }

  async cleanupExpiredAttachments(now = new Date()): Promise<{
    expiredCount: number;
    purgedCount: number;
    failedCount: number;
  }> {
    if (this.retentionCleanupRunning) {
      return { expiredCount: 0, purgedCount: 0, failedCount: 0 };
    }

    this.retentionCleanupRunning = true;
    try {
      const [expiredSales, expiredCompletion] = await this.prisma.$transaction([
        this.prisma.workSalesAttachment.updateMany({
          where: {
            expiredAt: null,
            expiresAt: { lte: now },
          },
          data: { expiredAt: now },
        }),
        this.prisma.workEvidence.updateMany({
          where: {
            completionReportId: { not: null },
            expiredAt: null,
            expiresAt: { lte: now },
          },
          data: { expiredAt: now },
        }),
      ]);

      const [salesRows, completionRows] = await Promise.all([
        this.prisma.workSalesAttachment.findMany({
          where: {
            purgedAt: null,
            expiresAt: { lte: now },
          },
          orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
          take: WORK_ATTACHMENT_RETENTION_CLEANUP_BATCH_SIZE,
          select: { id: true, storageKey: true },
        }),
        this.prisma.workEvidence.findMany({
          where: {
            completionReportId: { not: null },
            purgedAt: null,
            expiresAt: { lte: now },
          },
          orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
          take: WORK_ATTACHMENT_RETENTION_CLEANUP_BATCH_SIZE,
          select: { id: true, storageKey: true },
        }),
      ]);

      let purgedCount = 0;
      let failedCount = 0;

      for (const row of salesRows) {
        const removed = await this.attachmentStorage.deleteFile(
          'work',
          row.storageKey,
        );
        if (!removed) {
          failedCount += 1;
          continue;
        }
        await this.prisma.workSalesAttachment.updateMany({
          where: { id: row.id, purgedAt: null },
          data: { purgedAt: now },
        });
        purgedCount += 1;
      }

      for (const row of completionRows) {
        const removed = await this.attachmentStorage.deleteFile(
          'work',
          row.storageKey,
        );
        if (!removed) {
          failedCount += 1;
          continue;
        }
        await this.prisma.workEvidence.updateMany({
          where: { id: row.id, purgedAt: null },
          data: { purgedAt: now },
        });
        purgedCount += 1;
      }

      const expiredCount = expiredSales.count + expiredCompletion.count;
      if (expiredCount > 0 || purgedCount > 0 || failedCount > 0) {
        this.logger.log(
          `Work attachment retention expired ${expiredCount} metadata record(s), purged ${purgedCount} physical file(s), and left ${failedCount} file(s) for retry.`,
        );
      }

      return { expiredCount, purgedCount, failedCount };
    } finally {
      this.retentionCleanupRunning = false;
    }
  }
}
