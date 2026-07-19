import { ConflictException, ForbiddenException } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import { ConversationsService } from './conversations.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/*
 * This focused unit suite does not need Prisma's generated query runtime.
 * Loading only the generated enum module avoids Jest resolving Prisma 7's
 * ESM-only internal .js imports while API builds still validate the real client.
 */
jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('ConversationsService personal history actions', () => {
  const now = new Date('2026-07-17T04:00:00.000Z');

  const transaction = {
    conversationParticipant: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    messageReceipt: {
      updateMany: jest.fn(),
    },
    messagingNotification: {
      deleteMany: jest.fn(),
    },
    activityEvent: {
      create: jest.fn(),
    },
  };

  const prisma = {
    conversation: {
      findFirst: jest.fn(),
    },
    conversationParticipant: {
      findUnique: jest.fn(),
    },
    messageReceipt: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(
      async (callback: (value: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as PrismaService;

  const messagingEventsService = {
    emitReceiptUpdated: jest.fn(),
    emitConversationUpdated: jest.fn(),
  };

  const conversationStorageService = {
    lockStorageKeys: jest.fn(),
    assertAttachmentReferencesAvailable: jest.fn(),
    removeDeletedMessageAttachmentReferences: jest.fn(),
    deletePhysicalStorageObjects: jest.fn(),
  };

  const viewer = {
    accountId: 'account-1',
    showReadReceipts: true,
  };

  const participantState = {
    conversationId: 'conversation-1',
    accountId: 'account-1',
    historyClearedAt: now,
    deletedFromListAt: null,
    isPinned: true,
    pinnedAt: new Date('2026-07-17T03:00:00.000Z'),
    isArchived: false,
    archivedAt: null,
    isMuted: true,
    mutedUntil: null,
    markedUnreadAt: null,
    draftText: 'draft',
    draftUpdatedAt: new Date('2026-07-17T03:30:00.000Z'),
  };

  let service: ConversationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(now);

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
      .mockResolvedValue(viewer);

    jest.mocked(prisma.conversation.findFirst).mockResolvedValue({
      id: 'conversation-1',
      type: 'PRIVATE',
      groupKind: null,
    } as never);

    jest.mocked(prisma.conversationParticipant.findUnique).mockResolvedValue({
      joinedAt: new Date('2026-07-17T01:00:00.000Z'),
      leftAt: null,
      role: 'MEMBER',
      historyClearedAt: null,
      deletedFromListAt: null,
      updatedAt: new Date('2026-07-17T03:55:00.000Z'),
    } as never);

    jest.mocked(prisma.messageReceipt.findMany).mockResolvedValue([
      {
        messageId: 'message-1',
        message: {
          senderAccountId: 'account-2',
        },
      },
    ] as never);

    transaction.conversationParticipant.updateMany.mockResolvedValue({
      count: 1,
    });
    transaction.conversationParticipant.findUnique.mockResolvedValue(
      participantState,
    );
    transaction.messageReceipt.updateMany.mockResolvedValue({ count: 1 });
    transaction.messagingNotification.deleteMany.mockResolvedValue({
      count: 1,
    });
    transaction.activityEvent.create.mockResolvedValue({ id: 'event-1' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('clears only the requester history boundary and preserves preferences', async () => {
    const result = await service.clearConversationForAccount(
      {
        accountId: 'account-1',
        sessionId: 'session-1',
      } as never,
      'conversation-1',
    );

    expect(transaction.conversationParticipant.updateMany).toHaveBeenCalledWith(
      {
        where: {
          conversationId: 'conversation-1',
          accountId: 'account-1',
          leftAt: null,
          updatedAt: new Date('2026-07-17T03:55:00.000Z'),
        },
        data: {
          historyClearedAt: now,
          markedUnreadAt: null,
        },
      },
    );

    expect(transaction.messagingNotification.deleteMany).toHaveBeenCalledWith({
      where: {
        recipientAccountId: 'account-1',
        conversationId: 'conversation-1',
        createdAt: {
          lte: now,
        },
      },
    });

    expect(transaction.messageReceipt.updateMany).toHaveBeenCalledWith({
      where: {
        accountId: 'account-1',
        messageId: {
          in: ['message-1'],
        },
      },
      data: {
        deliveredAt: now,
        readAt: now,
      },
    });

    expect(transaction.activityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'account-1',
        sessionId: 'session-1',
        eventType: 'CHAT_CLEARED',
        metadata: {
          conversationId: 'conversation-1',
          conversationType: 'PRIVATE',
          groupKind: null,
        },
      }),
    });

    expect(messagingEventsService.emitConversationUpdated).toHaveBeenCalledWith(
      ['account-1'],
      expect.objectContaining({
        conversationId: 'conversation-1',
        reason: 'CLEARED_FOR_ACCOUNT',
      }),
    );

    expect(result.data).toEqual(
      expect.objectContaining({
        historyClearedAt: now,
        deletedFromListAt: null,
        isPinned: true,
        isMuted: true,
        draftText: 'draft',
      }),
    );
  });

  it('deletes a private chat only from the requester list state', async () => {
    transaction.conversationParticipant.findUnique.mockResolvedValue({
      ...participantState,
      deletedFromListAt: now,
      isPinned: false,
      pinnedAt: null,
      draftText: null,
      draftUpdatedAt: null,
    });

    await service.deleteConversationForAccount(
      {
        accountId: 'account-1',
        sessionId: 'session-1',
      } as never,
      'conversation-1',
    );

    expect(transaction.conversationParticipant.updateMany).toHaveBeenCalledWith(
      {
        where: {
          conversationId: 'conversation-1',
          accountId: 'account-1',
          leftAt: null,
          updatedAt: new Date('2026-07-17T03:55:00.000Z'),
        },
        data: {
          historyClearedAt: now,
          deletedFromListAt: now,
          isPinned: false,
          pinnedAt: null,
          isArchived: false,
          archivedAt: null,
          markedUnreadAt: null,
          draftText: null,
          draftUpdatedAt: null,
        },
      },
    );

    expect(messagingEventsService.emitConversationUpdated).toHaveBeenCalledWith(
      ['account-1'],
      expect.objectContaining({
        reason: 'DELETED_FOR_ACCOUNT',
      }),
    );
  });

  it('does not overwrite newer participant or message activity', async () => {
    transaction.conversationParticipant.updateMany.mockResolvedValueOnce({
      count: 0,
    });

    await expect(
      service.clearConversationForAccount(
        {
          accountId: 'account-1',
          sessionId: 'session-1',
        } as never,
        'conversation-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.messageReceipt.updateMany).not.toHaveBeenCalled();
    expect(transaction.messagingNotification.deleteMany).not.toHaveBeenCalled();
    expect(transaction.activityEvent.create).not.toHaveBeenCalled();
    expect(
      messagingEventsService.emitConversationUpdated,
    ).not.toHaveBeenCalled();
  });

  it('does not allow Delete chat for an active group', async () => {
    jest.mocked(prisma.conversation.findFirst).mockResolvedValue({
      id: 'conversation-1',
      type: 'GROUP',
      groupKind: 'PERSONAL',
    } as never);

    await expect(
      service.deleteConversationForAccount(
        {
          accountId: 'account-1',
          sessionId: 'session-1',
        } as never,
        'conversation-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(
      messagingEventsService.emitConversationUpdated,
    ).not.toHaveBeenCalled();
  });
});
