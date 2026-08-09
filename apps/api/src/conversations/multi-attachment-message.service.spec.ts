import { BadRequestException } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import { ConversationsService } from './conversations.service';
import type { UploadedMessageAttachmentFile } from './types/uploaded-message-attachment-file';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

function uploadedFile(
  name: string,
  mimetype: string,
  size: number,
): UploadedMessageAttachmentFile {
  return {
    buffer: Buffer.from([1]),
    originalname: name,
    mimetype,
    size,
  };
}

describe('ConversationsService multi-attachment messages', () => {
  const sentAt = new Date('2026-07-31T00:00:00.000Z');

  const transaction = {
    message: {
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    conversation: {
      update: jest.fn(),
    },
    conversationParticipant: {
      updateMany: jest.fn(),
    },
  };

  const prisma = {
    conversation: {
      findFirst: jest.fn(),
    },
    message: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(
      async (callback: (value: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as PrismaService;

  const messagingEventsService = {
    emitMessageCreated: jest.fn(),
  };

  const conversationStorageService = {
    lockStorageKeys: jest.fn(),
    assertAttachmentReferencesAvailable: jest.fn(),
  };

  let service: ConversationsService;
  let writeAttachmentFile: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new ConversationsService(
      prisma,
      messagingEventsService as never,
      conversationStorageService as never,
    );

    jest
      .spyOn(
        service as unknown as { getMessagingViewer: () => Promise<unknown> },
        'getMessagingViewer',
      )
      .mockResolvedValue({
        accountId: 'account-1',
        role: 'EMPLOYEE',
        divisionId: 'division-1',
        departmentId: 'department-1',
        showOnlineStatus: true,
        showReadReceipts: true,
        requireMessageRequests: true,
      });

    writeAttachmentFile = jest
      .spyOn(
        service as unknown as {
          writeAttachmentFile: () => Promise<void>;
        },
        'writeAttachmentFile',
      )
      .mockResolvedValue(undefined);

    jest
      .spyOn(
        service as unknown as {
          deleteAttachmentFileIfExists: () => Promise<void>;
        },
        'deleteAttachmentFileIfExists',
      )
      .mockResolvedValue(undefined);

    jest
      .spyOn(
        service as unknown as {
          serializeMessage: () => unknown;
        },
        'serializeMessage',
      )
      .mockReturnValue({ id: 'message-1' });

    jest
      .spyOn(
        service as unknown as {
          emitMessageCreatedForVisibleParticipants: () => void;
        },
        'emitMessageCreatedForVisibleParticipants',
      )
      .mockImplementation(() => undefined);

    jest
      .spyOn(
        service as unknown as {
          createAndEmitMessageNotifications: () => Promise<void>;
        },
        'createAndEmitMessageNotifications',
      )
      .mockResolvedValue(undefined);

    jest.mocked(prisma.conversation.findFirst).mockResolvedValue({
      id: 'conversation-1',
      type: 'GROUP',
      groupKind: 'PERSONAL',
      participants: [
        {
          accountId: 'account-1',
          joinedAt: new Date('2026-07-30T00:00:00.000Z'),
          historyClearedAt: null,
          isMuted: false,
          mutedUntil: null,
        },
        {
          accountId: 'account-2',
          joinedAt: new Date('2026-07-30T00:00:00.000Z'),
          historyClearedAt: null,
          isMuted: false,
          mutedUntil: null,
        },
      ],
    } as never);
    jest.mocked(prisma.message.findUnique).mockResolvedValue(null);
    transaction.message.create.mockResolvedValue({
      id: 'message-1',
      sentAt,
    });
    transaction.conversation.update.mockResolvedValue({ id: 'conversation-1' });
    transaction.conversationParticipant.updateMany.mockResolvedValue({
      count: 2,
    });
    transaction.message.findUniqueOrThrow.mockResolvedValue({
      id: 'message-1',
      conversationId: 'conversation-1',
      senderAccountId: 'account-1',
      attachments: [],
    });
  });

  it('creates one logical message with mixed attachment rows', async () => {
    const files = [
      uploadedFile('photo.png', 'image/png', 1024),
      uploadedFile('clip.mp4', 'video/mp4', 2048),
      uploadedFile('note.pdf', 'application/pdf', 4096),
    ];

    const result = await service.sendAttachmentMessage(
      { accountId: 'account-1' } as never,
      'conversation-1',
      {
        clientMessageId: '11111111-1111-4111-8111-111111111111',
        caption: 'Field evidence',
      },
      files,
    );

    expect(writeAttachmentFile).toHaveBeenCalledTimes(3);
    expect(transaction.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contentType: 'FILE',
          textContent: 'Field evidence',
          payload: {
            attachmentCount: 3,
          },
          attachments: {
            create: [
              expect.objectContaining({
                originalFileName: 'photo.png',
                contentType: 'IMAGE',
              }),
              expect.objectContaining({
                originalFileName: 'clip.mp4',
                contentType: 'VIDEO',
              }),
              expect.objectContaining({
                originalFileName: 'note.pdf',
                contentType: 'FILE',
              }),
            ],
          },
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        message: 'Attachments sent successfully.',
        duplicate: false,
        data: { id: 'message-1' },
      }),
    );
  });

  it('rejects more than ten attachments before writing files', async () => {
    const files = Array.from({ length: 11 }, (_, index) =>
      uploadedFile(`photo-${index}.png`, 'image/png', 1024),
    );

    await expect(
      service.sendAttachmentMessage(
        { accountId: 'account-1' } as never,
        'conversation-1',
        {
          clientMessageId: '22222222-2222-4222-8222-222222222222',
        },
        files,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(writeAttachmentFile).not.toHaveBeenCalled();
  });

  it('rejects batches larger than 250 MB', async () => {
    const files = [
      uploadedFile('one.mp4', 'video/mp4', 130 * 1024 * 1024),
      uploadedFile('two.mp4', 'video/mp4', 130 * 1024 * 1024),
    ];

    await expect(
      service.sendAttachmentMessage(
        { accountId: 'account-1' } as never,
        'conversation-1',
        {
          clientMessageId: '33333333-3333-4333-8333-333333333333',
        },
        files,
      ),
    ).rejects.toThrow('Attachments in one message must total 250 MB or smaller.');

    expect(writeAttachmentFile).not.toHaveBeenCalled();
  });

  it('keeps voice notes restricted to one audio file', async () => {
    const files = [
      uploadedFile('one.webm', 'audio/webm', 1024),
      uploadedFile('two.webm', 'audio/webm', 1024),
    ];

    await expect(
      service.sendAttachmentMessage(
        { accountId: 'account-1' } as never,
        'conversation-1',
        {
          clientMessageId: '44444444-4444-4444-8444-444444444444',
          attachmentKind: 'VOICE_NOTE',
        },
        files,
      ),
    ).rejects.toThrow('A voice note must contain exactly one audio attachment.');

    expect(writeAttachmentFile).not.toHaveBeenCalled();
  });
});
