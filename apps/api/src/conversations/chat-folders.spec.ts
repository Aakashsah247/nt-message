import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import { ConversationsService } from './conversations.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/*
 * These list tests exercise account ownership and conversation-membership
 * boundaries without loading Prisma 7's ESM query runtime in Jest.
 */
jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('ConversationsService custom message lists', () => {
  const folderId = '11111111-1111-4111-8111-111111111111';
  const conversationOne = '22222222-2222-4222-8222-222222222222';
  const conversationTwo = '33333333-3333-4333-8333-333333333333';
  const viewer = {
    accountId: '44444444-4444-4444-8444-444444444444',
    sessionId: 'session-1',
  } as never;

  const transaction = {
    chatFolderItem: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    chatFolder: {
      update: jest.fn(),
    },
  };

  const prisma = {
    chatFolder: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
    },
    chatFolderItem: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    conversationParticipant: {
      findMany: jest.fn(),
    },
    // These delegates are present only so the tests can prove that list
    // deletion never mutates the underlying conversation or message records.
    conversation: {
      findMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    message: {
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(
      async (callback: (value: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as PrismaService;

  let service: ConversationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConversationsService(prisma, {} as never, {} as never);
  });

  it('creates a private list only from conversations visible to its owner', async () => {
    jest.mocked(prisma.chatFolder.findFirst).mockResolvedValue(null);
    jest.mocked(prisma.conversationParticipant.findMany).mockResolvedValue([
      { conversationId: conversationOne },
      { conversationId: conversationTwo },
    ] as never);
    jest.mocked(prisma.chatFolder.aggregate).mockResolvedValue({
      _max: { position: 2 },
    } as never);
    jest.mocked(prisma.chatFolder.create).mockResolvedValue({
      id: folderId,
      accountId: (viewer as { accountId: string }).accountId,
      name: 'Field Team',
      items: [],
    } as never);

    const result = await service.createChatFolder(viewer, {
      name: '  Field   Team  ',
      conversationIds: [
        conversationOne,
        conversationTwo,
        conversationOne,
      ],
    });

    expect(prisma.chatFolder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: (viewer as { accountId: string }).accountId,
          name: 'Field Team',
          nameKey: 'field team',
          position: 3,
          items: {
            create: [
              { conversationId: conversationOne },
              { conversationId: conversationTwo },
            ],
          },
        }),
      }),
    );
    expect(result.message).toBe('List created successfully.');
  });

  it('rejects a duplicate list name for the same account', async () => {
    jest.mocked(prisma.chatFolder.findFirst).mockResolvedValue({
      id: folderId,
    } as never);

    await expect(
      service.createChatFolder(viewer, {
        name: 'FIELD TEAM',
        conversationIds: [],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.chatFolder.findFirst).toHaveBeenCalledWith({
      where: {
        accountId: (viewer as { accountId: string }).accountId,
        nameKey: 'field team',
      },
      select: { id: true },
    });
    expect(prisma.chatFolder.create).not.toHaveBeenCalled();
  });

  it('rejects conversations that are not currently visible to the list owner', async () => {
    jest.mocked(prisma.chatFolder.findFirst).mockResolvedValue(null);
    jest.mocked(prisma.conversationParticipant.findMany).mockResolvedValue([
      { conversationId: conversationOne },
    ] as never);

    await expect(
      service.createChatFolder(viewer, {
        name: 'Field Team',
        conversationIds: [conversationOne, conversationTwo],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.conversationParticipant.findMany).toHaveBeenCalledWith({
      where: {
        accountId: (viewer as { accountId: string }).accountId,
        conversationId: {
          in: [conversationOne, conversationTwo],
        },
        leftAt: null,
        deletedFromListAt: null,
      },
      select: { conversationId: true },
    });
    expect(prisma.chatFolder.create).not.toHaveBeenCalled();
  });

  it('replaces list membership without deleting conversations or messages', async () => {
    jest.mocked(prisma.chatFolder.findFirst)
      .mockResolvedValueOnce({ id: folderId } as never)
      .mockResolvedValueOnce(null);
    jest.mocked(prisma.conversationParticipant.findMany).mockResolvedValue([
      { conversationId: conversationTwo },
    ] as never);
    transaction.chatFolderItem.deleteMany.mockResolvedValue({ count: 2 });
    transaction.chatFolderItem.createMany.mockResolvedValue({ count: 1 });
    transaction.chatFolder.update.mockResolvedValue({
      id: folderId,
      name: 'Field Team',
      items: [],
    });

    await service.updateChatFolder(viewer, folderId, {
      name: 'Field Team',
      conversationIds: [conversationTwo],
    });

    expect(transaction.chatFolderItem.deleteMany).toHaveBeenCalledWith({
      where: { folderId },
    });
    expect(transaction.chatFolderItem.createMany).toHaveBeenCalledWith({
      data: [{ folderId, conversationId: conversationTwo }],
      skipDuplicates: true,
    });
    expect(transaction.chatFolder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: folderId },
        data: {
          name: 'Field Team',
          nameKey: 'field team',
        },
      }),
    );
    expect(prisma.conversation.delete).not.toHaveBeenCalled();
    expect(prisma.conversation.deleteMany).not.toHaveBeenCalled();
    expect(prisma.message.delete).not.toHaveBeenCalled();
    expect(prisma.message.deleteMany).not.toHaveBeenCalled();
  });

  it('filters the normal conversation query through an owned list', async () => {
    const viewerAccountId = (viewer as { accountId: string }).accountId;

    Object.defineProperty(service, 'getMessagingViewer', {
      value: jest.fn().mockResolvedValue({
        accountId: viewerAccountId,
        role: 'EMPLOYEE',
        divisionId: null,
        departmentId: null,
        showOnlineStatus: true,
        showReadReceipts: true,
        requireMessageRequests: false,
      }),
    });
    Object.defineProperty(service, 'synchronizeOfficialGroupsForAccountSafely', {
      value: jest.fn().mockResolvedValue(undefined),
    });

    jest.mocked(prisma.chatFolder.findFirst).mockResolvedValue({
      id: folderId,
    } as never);
    jest.mocked(prisma.conversation.findMany).mockResolvedValue([] as never);

    const result = await service.listConversations(viewer, {
      limit: 30,
      view: 'ALL',
      folderId,
    });

    expect(prisma.chatFolder.findFirst).toHaveBeenCalledWith({
      where: {
        id: folderId,
        accountId: viewerAccountId,
      },
      select: { id: true },
    });
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          chatFolderItems: {
            some: {
              folderId,
              folder: { accountId: viewerAccountId },
            },
          },
        }),
      }),
    );
    expect(result.data).toEqual([]);
  });

  it('lists only folders owned by the authenticated account', async () => {
    jest.mocked(prisma.chatFolder.findMany).mockResolvedValue([] as never);

    const result = await service.listChatFolders(viewer);

    expect(prisma.chatFolder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accountId: (viewer as { accountId: string }).accountId,
        },
      }),
    );
    expect(result.data).toEqual([]);
  });

  it('does not expose another account list through the conversation filter', async () => {
    const viewerAccountId = (viewer as { accountId: string }).accountId;

    Object.defineProperty(service, 'getMessagingViewer', {
      value: jest.fn().mockResolvedValue({
        accountId: viewerAccountId,
        role: 'EMPLOYEE',
        divisionId: null,
        departmentId: null,
        showOnlineStatus: true,
        showReadReceipts: true,
        requireMessageRequests: false,
      }),
    });
    Object.defineProperty(service, 'synchronizeOfficialGroupsForAccountSafely', {
      value: jest.fn().mockResolvedValue(undefined),
    });

    jest.mocked(prisma.chatFolder.findFirst).mockResolvedValue(null);

    await expect(
      service.listConversations(viewer, {
        limit: 30,
        view: 'ALL',
        folderId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.chatFolder.findFirst).toHaveBeenCalledWith({
      where: {
        id: folderId,
        accountId: viewerAccountId,
      },
      select: { id: true },
    });
    expect(prisma.conversation.findMany).not.toHaveBeenCalled();
  });

  it('refuses to update a list that is not owned by the authenticated account', async () => {
    jest.mocked(prisma.chatFolder.findFirst).mockResolvedValue(null);

    await expect(
      service.updateChatFolder(viewer, folderId, {
        name: 'Other account list',
        conversationIds: [conversationOne],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.chatFolder.findFirst).toHaveBeenCalledWith({
      where: {
        id: folderId,
        accountId: (viewer as { accountId: string }).accountId,
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deletes only the owned list container and preserves chat data', async () => {
    jest.mocked(prisma.chatFolder.findFirst).mockResolvedValue({
      id: folderId,
      accountId: (viewer as { accountId: string }).accountId,
    } as never);
    jest.mocked(prisma.chatFolder.delete).mockResolvedValue({
      id: folderId,
    } as never);

    const result = await service.deleteChatFolder(viewer, folderId);

    expect(prisma.chatFolder.findFirst).toHaveBeenCalledWith({
      where: {
        id: folderId,
        accountId: (viewer as { accountId: string }).accountId,
      },
    });
    expect(prisma.chatFolder.delete).toHaveBeenCalledWith({
      where: { id: folderId },
    });
    expect(prisma.conversation.delete).not.toHaveBeenCalled();
    expect(prisma.conversation.deleteMany).not.toHaveBeenCalled();
    expect(prisma.message.delete).not.toHaveBeenCalled();
    expect(prisma.message.deleteMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      message: 'List deleted successfully.',
      folderId,
    });
  });
});
