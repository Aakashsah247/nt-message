import { NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import { ConversationStorageService } from './conversation-storage.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/*
 * The storage service needs only generated enum values in focused unit tests.
 * API builds continue to validate the complete Prisma 7 generated client.
 */
jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('ConversationStorageService M18 acceptance', () => {
  const prisma = {
    $queryRawUnsafe: jest.fn(),
    conversation: {
      findFirst: jest.fn(),
    },
    conversationParticipant: {
      findFirst: jest.fn(),
    },
  } as unknown as PrismaService;

  const user = {
    accountId: '00000000-0000-4000-8000-000000000001',
    sessionId: '00000000-0000-4000-8000-000000000101',
  };

  const conversationId = '00000000-0000-4000-8000-000000000201';
  const categoryRows = [
    { contentType: 'IMAGE', logicalBytes: 10, itemCount: 1 },
    { contentType: 'VIDEO', logicalBytes: 20, itemCount: 1 },
  ];
  const conversationRows = [
    {
      conversationId,
      conversationTitle: 'Operations',
      conversationType: 'GROUP',
      groupKind: 'PERSONAL',
      logicalBytes: 30,
      itemCount: 2,
    },
  ];
  const largestFileRows = [
    {
      attachmentId: '00000000-0000-4000-8000-000000000301',
      messageId: '00000000-0000-4000-8000-000000000401',
      conversationId,
      conversationTitle: 'Operations',
      conversationType: 'GROUP',
      groupKind: 'PERSONAL',
      storageKey: 'conversation/video.mp4',
      originalFileName: 'training-video.mp4',
      mimeType: 'video/mp4',
      fileSizeBytes: 20,
      contentType: 'VIDEO',
      senderAccountId: user.accountId,
      senderDisplayName: 'Authorized User',
      sentAt: new Date('2026-07-19T04:00:00.000Z'),
    },
  ];

  let service: ConversationStorageService;
  let physicalAvailability: jest.SpyInstance<Promise<boolean>, [string]>;
  let internalWarning: jest.SpyInstance;

  function configureStorageQueries(input?: {
    categories?: typeof categoryRows;
    conversations?: typeof conversationRows;
    largestFiles?: typeof largestFileRows;
  }): void {
    jest
      .mocked(prisma.$queryRawUnsafe)
      .mockImplementation(async (query: string) => {
        if (query.includes('GROUP BY ma."content_type"')) {
          return input?.categories ?? categoryRows;
        }

        if (query.includes('GROUP BY c."id"')) {
          return input?.conversations ?? conversationRows;
        }

        if (query.includes('ORDER BY ma."file_size_bytes" DESC')) {
          return input?.largestFiles ?? largestFileRows;
        }

        return [];
      });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-07-19T05:00:00.000Z'));

    service = new ConversationStorageService(prisma);
    physicalAvailability = jest
      .spyOn(
        service as unknown as {
          isPhysicalObjectAvailable(storageKey: string): Promise<boolean>;
        },
        'isPhysicalObjectAvailable',
      )
      .mockResolvedValue(true);
    internalWarning = jest
      .spyOn(
        (
          service as unknown as {
            logger: { warn(message: string): void };
          }
        ).logger,
        'warn',
      )
      .mockImplementation(() => undefined);

    configureStorageQueries();
    jest.mocked(prisma.conversation.findFirst).mockResolvedValue({
      id: conversationId,
      title: 'Operations',
      type: 'GROUP',
      groupKind: 'PERSONAL',
      participants: [
        {
          accountId: user.accountId,
          role: 'MEMBER',
          account: { username: 'authorized', employee: null },
        },
      ],
    } as never);
    jest.mocked(prisma.conversationParticipant.findFirst).mockResolvedValue({
      account: {
        username: 'peer.user',
        employee: { empName: 'Peer User' },
      },
    } as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calculates only the authenticated user logical totals', async () => {
    const result = await service.getUserStorageUsage(user as never, 30);

    expect(result.totals).toEqual({
      logicalVisibleBytes: 30,
      logicalItemCount: 2,
    });
    expect(result.storageByConversation).toEqual([
      expect.objectContaining({
        conversationId,
        logicalBytes: 30,
        itemCount: 2,
      }),
    ]);
  });

  it('calculates private-conversation storage only after participant authorization', async () => {
    jest.mocked(prisma.conversation.findFirst).mockResolvedValue({
      id: conversationId,
      title: null,
      type: 'PRIVATE',
      groupKind: null,
      participants: [
        {
          accountId: user.accountId,
          role: 'MEMBER',
        },
      ],
    } as never);

    const result = await service.getConversationStorageUsage(
      user as never,
      conversationId,
      30,
    );

    expect(result.conversation.type).toBe('PRIVATE');
    expect(result.conversation.title).toBe('Peer User');
    expect(result.totals.logicalVisibleBytes).toBe(30);
    expect(result.privacyNotice).toContain('Private storage details');
  });

  it('calculates group storage and preserves the viewer group authorization', async () => {
    jest.mocked(prisma.conversation.findFirst).mockResolvedValue({
      id: conversationId,
      title: 'Operations',
      type: 'GROUP',
      groupKind: 'OFFICIAL',
      participants: [
        {
          accountId: user.accountId,
          role: 'ADMIN',
        },
      ],
    } as never);

    const result = await service.getConversationStorageUsage(
      user as never,
      conversationId,
      30,
    );

    expect(result.conversation).toEqual(
      expect.objectContaining({
        type: 'GROUP',
        groupKind: 'OFFICIAL',
        participantRole: 'ADMIN',
        canManageGroup: true,
      }),
    );
    expect(result.totals.logicalVisibleBytes).toBe(30);
  });

  it('returns a stable image, video, document and audio category breakdown', async () => {
    configureStorageQueries({
      categories: [
        { contentType: 'FILE', logicalBytes: 50, itemCount: 2 },
        { contentType: 'AUDIO', logicalBytes: 25, itemCount: 3 },
      ],
    });

    const result = await service.getUserStorageUsage(user as never, 30);

    expect(result.categories).toEqual([
      expect.objectContaining({ key: 'IMAGES', logicalBytes: 0, itemCount: 0 }),
      expect.objectContaining({ key: 'VIDEOS', logicalBytes: 0, itemCount: 0 }),
      expect.objectContaining({
        key: 'DOCUMENTS',
        logicalBytes: 50,
        itemCount: 2,
      }),
      expect.objectContaining({
        key: 'AUDIO',
        logicalBytes: 25,
        itemCount: 3,
      }),
    ]);
  });

  it('keeps forwarded logical references without exposing physical-storage metrics', async () => {
    configureStorageQueries({
      categories: [{ contentType: 'FILE', logicalBytes: 20, itemCount: 2 }],
    });

    const result = await service.getUserStorageUsage(user as never, 30);
    const serialized = JSON.stringify(result);

    expect(result.totals.logicalVisibleBytes).toBe(20);
    expect(result.totals.logicalItemCount).toBe(2);
    expect(serialized).not.toContain('physicalStoredBytes');
    expect(serialized).not.toContain('physicalObjectCount');
    expect(serialized).not.toContain('missingPhysicalObjectCount');
    expect(
      jest
        .mocked(prisma.$queryRawUnsafe)
        .mock.calls.some(([query]) =>
          String(query).includes('SELECT DISTINCT ON (ma."storage_key")'),
        ),
    ).toBe(false);
  });

  it('recalculates Delete for me totals by excluding viewer-hidden messages', async () => {
    let deletedForViewer = false;
    jest
      .mocked(prisma.$queryRawUnsafe)
      .mockImplementation(async (query: string) => {
        if (query.includes('GROUP BY ma."content_type"')) {
          return [
            {
              contentType: 'IMAGE',
              logicalBytes: deletedForViewer ? 10 : 20,
              itemCount: deletedForViewer ? 1 : 2,
            },
          ];
        }

        return [];
      });

    const before = await service.getUserStorageUsage(user as never, 30);
    deletedForViewer = true;
    const after = await service.getUserStorageUsage(user as never, 30);

    expect(before.totals.logicalVisibleBytes).toBe(20);
    expect(after.totals.logicalVisibleBytes).toBe(10);
    expect(
      jest
        .mocked(prisma.$queryRawUnsafe)
        .mock.calls.some(([query]) =>
          String(query).includes('message_hidden_for_accounts'),
        ),
    ).toBe(true);
  });

  it('recalculates Clear Chat totals using the participant history boundary', async () => {
    configureStorageQueries({
      categories: [],
      objects: [],
      conversations: [],
      largestFiles: [],
    });

    const result = await service.getUserStorageUsage(user as never, 30);

    expect(result.totals.logicalVisibleBytes).toBe(0);
    expect(
      jest
        .mocked(prisma.$queryRawUnsafe)
        .mock.calls.every(([query]) =>
          String(query).includes('history_cleared_at'),
        ),
    ).toBe(true);
  });

  it('removes the final Delete for everyone reference before physical cleanup eligibility', async () => {
    const transaction = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{}]),
      messageAttachment: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0),
      },
    };

    const unreferenced = await service.removeDeletedMessageAttachmentReferences(
      transaction as never,
      '00000000-0000-4000-8000-000000000401',
      ['shared/one-file.pdf'],
    );

    expect(unreferenced).toEqual(['shared/one-file.pdf']);
    expect(transaction.messageAttachment.deleteMany).toHaveBeenCalledWith({
      where: {
        messageId: '00000000-0000-4000-8000-000000000401',
      },
    });
    expect(transaction.$queryRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text AS "lockResult"',
      'shared/one-file.pdf',
    );
  });

  it('preserves the physical object while a forwarded attachment reference remains', async () => {
    const transaction = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{}]),
      messageAttachment: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        // One active row represents the same storage key in a forwarded message.
        count: jest.fn().mockResolvedValueOnce(1),
      },
    };

    const unreferenced = await service.removeDeletedMessageAttachmentReferences(
      transaction as never,
      '00000000-0000-4000-8000-000000000401',
      ['shared/one-file.pdf'],
    );

    expect(unreferenced).toEqual([]);
    expect(transaction.messageAttachment.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('rejects unauthorized conversation storage access without querying file details', async () => {
    jest.mocked(prisma.conversation.findFirst).mockResolvedValue(null);

    await expect(
      service.getConversationStorageUsage(user as never, conversationId, 30),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('logs a missing physical file internally without exposing infrastructure state', async () => {
    physicalAvailability.mockResolvedValue(false);

    const result = await service.getUserStorageUsage(user as never, 30);
    const serialized = JSON.stringify(result);

    expect(result.totals).toEqual({
      logicalVisibleBytes: 30,
      logicalItemCount: 2,
    });
    expect(result.largestFiles[0]).not.toHaveProperty('availability');
    expect(serialized).not.toContain('conversation/video.mp4');
    expect(internalWarning).toHaveBeenCalledWith(
      expect.stringContaining(
        'attachmentId=00000000-0000-4000-8000-000000000301',
      ),
    );
  });

  it.each([
    'EMPLOYEE',
    'TEAM_MANAGER',
    'SENIOR_MANAGEMENT',
    'SUPER_ADMIN',
  ])('does not expose infrastructure fields to the %s role', async (role) => {
    const result = await service.getUserStorageUsage(
      {
        ...user,
        role,
      } as never,
      30,
    );
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('physicalStoredBytes');
    expect(serialized).not.toContain('physicalObjectCount');
    expect(serialized).not.toContain('missingPhysicalObjectCount');
    expect(serialized).not.toContain('availability');
    expect(serialized).not.toContain('storageKey');
  });

  it('keeps management storage requests account-scoped and outside monitoring analytics', async () => {
    const managementUser = {
      ...user,
      accountId: '00000000-0000-4000-8000-000000000009',
      role: 'SUPER_ADMIN',
    };

    const result = await service.getUserStorageUsage(
      managementUser as never,
      30,
    );

    expect(
      jest
        .mocked(prisma.$queryRawUnsafe)
        .mock.calls.every(
          ([query, accountId]) =>
            String(query).includes('cp."account_id" = $1::uuid') &&
            accountId === managementUser.accountId,
        ),
    ).toBe(true);
    expect(result.privacyNotice).toContain('this authenticated account');
    expect(JSON.stringify(result)).not.toContain('storageKey');
  });
});
