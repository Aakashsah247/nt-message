import { workAttachmentExpiresAt } from './work-attachment-retention.constants';
import { WorkAttachmentRetentionService } from './work-attachment-retention.service';

const NOW = new Date('2026-09-21T00:30:00.000Z');

describe('WorkAttachmentRetentionService', () => {
  const salesUpdateMany = jest.fn();
  const evidenceUpdateMany = jest.fn();
  const salesFindMany = jest.fn();
  const evidenceFindMany = jest.fn();
  const prisma = {
    $transaction: jest.fn(),
    workSalesAttachment: {
      updateMany: salesUpdateMany,
      findMany: salesFindMany,
    },
    workEvidence: {
      updateMany: evidenceUpdateMany,
      findMany: evidenceFindMany,
    },
  };
  const storage = {
    deleteFile: jest.fn(),
  };

  const service = new WorkAttachmentRetentionService(
    prisma as never,
    storage as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    salesUpdateMany.mockResolvedValue({ count: 1 });
    evidenceUpdateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockResolvedValue([{ count: 1 }, { count: 1 }]);
    salesFindMany.mockResolvedValue([]);
    evidenceFindMany.mockResolvedValue([]);
    storage.deleteFile.mockResolvedValue(true);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('sets the retention boundary to exactly 90 days after the terminal event', () => {
    expect(
      workAttachmentExpiresAt(
        new Date('2026-01-01T00:00:00.000Z'),
      ).toISOString(),
    ).toBe('2026-04-01T00:00:00.000Z');
  });

  it('marks due Sales and completion attachment metadata expired', async () => {
    const result = await service.cleanupExpiredAttachments(NOW);

    expect(salesUpdateMany).toHaveBeenCalledWith({
      where: { expiredAt: null, expiresAt: { lte: NOW } },
      data: { expiredAt: NOW },
    });
    expect(evidenceUpdateMany).toHaveBeenCalledWith({
      where: {
        completionReportId: { not: null },
        expiredAt: null,
        expiresAt: { lte: NOW },
      },
      data: { expiredAt: NOW },
    });
    expect(result).toEqual({ expiredCount: 2, purgedCount: 0, failedCount: 0 });
  });

  it('permanently deletes due physical files and keeps metadata with purgedAt', async () => {
    salesFindMany.mockResolvedValue([
      { id: 'sales-attachment', storageKey: 'work-1/sales/message/file.pdf' },
    ]);
    evidenceFindMany.mockResolvedValue([
      {
        id: 'completion-evidence',
        storageKey: 'work-1/completion/report/photo.jpg',
      },
    ]);

    const result = await service.cleanupExpiredAttachments(NOW);

    expect(storage.deleteFile).toHaveBeenNthCalledWith(
      1,
      'work',
      'work-1/sales/message/file.pdf',
    );
    expect(storage.deleteFile).toHaveBeenNthCalledWith(
      2,
      'work',
      'work-1/completion/report/photo.jpg',
    );
    expect(salesUpdateMany).toHaveBeenLastCalledWith({
      where: { id: 'sales-attachment', purgedAt: null },
      data: { purgedAt: NOW },
    });
    expect(evidenceUpdateMany).toHaveBeenLastCalledWith({
      where: { id: 'completion-evidence', purgedAt: null },
      data: { purgedAt: NOW },
    });
    expect(result).toEqual({ expiredCount: 2, purgedCount: 2, failedCount: 0 });
  });

  it('leaves failed storage deletions for the next cleanup retry', async () => {
    salesFindMany.mockResolvedValue([
      { id: 'sales-attachment', storageKey: 'work-1/sales/message/file.pdf' },
    ]);
    storage.deleteFile.mockResolvedValue(false);

    const result = await service.cleanupExpiredAttachments(NOW);

    expect(result).toEqual({ expiredCount: 2, purgedCount: 0, failedCount: 1 });
    expect(salesUpdateMany).not.toHaveBeenCalledWith({
      where: { id: 'sales-attachment', purgedAt: null },
      data: { purgedAt: NOW },
    });
  });
});
