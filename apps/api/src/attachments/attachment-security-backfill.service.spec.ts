import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

import { AttachmentSecurityBackfillService } from './attachment-security-backfill.service';

describe('AttachmentSecurityBackfillService', () => {
  function createFixture() {
    const prisma = {
      messageAttachment: {
        findMany: jest.fn().mockResolvedValue([{ storageKey: 'shared-object' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      announcementAttachment: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const storage = {
      exists: jest.fn().mockResolvedValue(true),
      resolvePath: jest.fn().mockReturnValue('/private/shared-object'),
      deleteFile: jest.fn().mockResolvedValue(true),
    };
    const security = {
      isStrictScanMode: jest.fn().mockReturnValue(true),
      scanStoredFile: jest.fn().mockResolvedValue('CLEAN'),
    };

    return {
      prisma,
      storage,
      security,
      service: new AttachmentSecurityBackfillService(
        prisma as never,
        storage as never,
        security as never,
      ),
    };
  }

  it('upgrades every reference sharing a clean legacy physical object', async () => {
    const { service, prisma, security } = createFixture();

    await service.processBackfillBatch();

    expect(security.scanStoredFile).toHaveBeenCalledWith('/private/shared-object');
    expect(prisma.messageAttachment.updateMany).toHaveBeenCalledWith({
      where: { storageKey: 'shared-object' },
      data: { scanStatus: 'CLEAN' },
    });
  });

  it('quarantines and removes a legacy object rejected by the scanner', async () => {
    const { service, prisma, storage, security } = createFixture();
    security.scanStoredFile.mockRejectedValue(
      new BadRequestException('malware'),
    );

    await service.processBackfillBatch();

    expect(storage.deleteFile).toHaveBeenCalledWith('messages', 'shared-object');
    expect(prisma.messageAttachment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storageKey: 'shared-object' },
        data: expect.objectContaining({ scanStatus: 'QUARANTINED' }),
      }),
    );
  });

  it('leaves legacy status unchanged when the scanner is temporarily unavailable', async () => {
    const { service, prisma, security } = createFixture();
    security.scanStoredFile.mockRejectedValue(
      new ServiceUnavailableException('scanner unavailable'),
    );

    await service.processBackfillBatch();

    expect(prisma.messageAttachment.updateMany).not.toHaveBeenCalled();
  });
});
