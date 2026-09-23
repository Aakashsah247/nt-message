import { BadRequestException } from '@nestjs/common';

import type { AttachmentSecurityService } from '../attachments/attachment-security.service';
import type { AttachmentStorageService } from '../attachments/attachment-storage.service';
import { ConversationsService } from './conversations.service';
import type { UploadedMessageAttachmentFile } from './types/uploaded-message-attachment-file';

function uploadedPng(bytes: Buffer): UploadedMessageAttachmentFile {
  return {
    originalname: 'profile.png',
    mimetype: 'image/png',
    buffer: bytes,
    size: bytes.length,
  };
}

describe('ConversationsService photo upload hardening', () => {
  const validPng = uploadedPng(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );

  it('rejects profile and group photos whose bytes do not match the declared image type', () => {
    const service = new ConversationsService(
      {} as never,
      {} as never,
      {} as never,
    );
    const fakePng = uploadedPng(Buffer.from('this is not an image'));
    const internal = service as unknown as {
      validateProfilePhoto: (file: UploadedMessageAttachmentFile) => unknown;
      validateGroupPhoto: (file: UploadedMessageAttachmentFile) => unknown;
    };

    expect(() => internal.validateProfilePhoto(fakePng)).toThrow(
      BadRequestException,
    );
    expect(() => internal.validateGroupPhoto(fakePng)).toThrow(
      BadRequestException,
    );
  });

  it('scans a profile photo and writes it through durable attachment storage', async () => {
    const transaction = {
      account: { update: jest.fn().mockResolvedValue({}) },
      employee: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      account: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'account-1',
          employeeId: 'employee-1',
          profilePhotoKey: 'account-1/old.png',
          employee: { profilePhotoKey: 'account-1/old.png' },
        }),
      },
      $transaction: jest.fn(
        async (callback: (tx: typeof transaction) => unknown) =>
          callback(transaction),
      ),
    };
    const storage = {
      writeUploadedFile: jest.fn().mockResolvedValue(undefined),
      deleteFile: jest.fn().mockResolvedValue(true),
    } as unknown as AttachmentStorageService;
    const security = {
      scanValidatedUpload: jest.fn().mockResolvedValue('CLEAN'),
    } as unknown as AttachmentSecurityService;

    const service = new ConversationsService(
      prisma as never,
      {} as never,
      {} as never,
      storage,
      security,
    );

    jest
      .spyOn(
        service as unknown as { getMessagingViewer: () => Promise<unknown> },
        'getMessagingViewer',
      )
      .mockResolvedValue({ accountId: 'account-1', employeeId: 'employee-1' });
    jest
      .spyOn(
        service as unknown as { getMyMessagingProfile: () => Promise<unknown> },
        'getMyMessagingProfile',
      )
      .mockResolvedValue({ ok: true });

    await service.updateMyMessagingProfilePhoto(
      { accountId: 'account-1', sessionId: 'session-1' } as never,
      validPng,
    );

    expect(security.scanValidatedUpload).toHaveBeenCalledWith(validPng);
    expect(storage.writeUploadedFile).toHaveBeenCalledWith(
      'profile-photos',
      expect.stringMatching(/^account-1\/.+-profile\.png$/),
      validPng,
    );
    expect(storage.deleteFile).toHaveBeenCalledWith(
      'profile-photos',
      'account-1/old.png',
    );
  });
});
