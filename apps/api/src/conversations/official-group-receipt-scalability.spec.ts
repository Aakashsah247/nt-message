import type { PrismaService } from '../database/prisma.service';
import { ConversationsService } from './conversations.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('ConversationsService official-group receipt scalability', () => {
  const viewerAccountId = '11111111-1111-4111-8111-111111111111';
  const recipientAccountId = '22222222-2222-4222-8222-222222222222';
  const conversationId = '33333333-3333-4333-8333-333333333333';
  const messageId = '44444444-4444-4444-8444-444444444444';
  const sentAt = new Date('2026-08-16T00:00:00.000Z');
  const viewer = {
    accountId: viewerAccountId,
    sessionId: 'session-1',
  } as never;

  const viewerAccount = {
    id: viewerAccountId,
    username: 'viewer',
    role: 'SUPER_ADMIN',
    isEnabled: true,
    profilePhotoKey: null,
    profileBio: null,
    showOnlineStatus: true,
    showReadReceipts: true,
    superAdminProfile: null,
    employee: null,
  };
  const recipientAccount = {
    ...viewerAccount,
    id: recipientAccountId,
    username: 'recipient',
    role: 'EMPLOYEE',
  };

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
      findUnique: jest.fn(),
    },
    messagingNotification: {
      deleteMany: jest.fn(),
    },
    activityEvent: {
      create: jest.fn(),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
    conversation: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    conversationParticipant: {
      update: jest.fn(),
    },
    message: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    messageReceipt: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  } as unknown as PrismaService;

  const messagingEventsService = {
    emitReceiptUpdated: jest.fn(),
    emitConversationUpdated: jest.fn(),
  };

  let service: ConversationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConversationsService(
      prisma,
      messagingEventsService as never,
      {} as never,
    );

    Object.defineProperty(service, 'getMessagingViewer', {
      value: jest.fn().mockResolvedValue({
        accountId: viewerAccountId,
        role: 'SUPER_ADMIN',
        divisionId: null,
        departmentId: null,
        showOnlineStatus: true,
        showReadReceipts: true,
        requireMessageRequests: false,
      }),
    });
    Object.defineProperty(service, 'serializeMessage', {
      value: jest.fn().mockReturnValue({ id: messageId }),
    });
    Object.defineProperty(service, 'emitMessageCreatedForVisibleParticipants', {
      value: jest.fn(),
    });
    Object.defineProperty(service, 'createAndEmitMessageNotifications', {
      value: jest.fn().mockResolvedValue(undefined),
    });
  });

  it('does not create message x recipient receipt rows for an official-group send', async () => {
    jest.mocked(prisma.conversation.findFirst).mockResolvedValue({
      id: conversationId,
      type: 'GROUP',
      groupKind: 'OFFICIAL',
      participants: [
        {
          accountId: viewerAccountId,
          role: 'OWNER',
          joinedAt: new Date('2026-01-01T00:00:00.000Z'),
          historyClearedAt: null,
          isMuted: false,
          mutedUntil: null,
          account: viewerAccount,
        },
        {
          accountId: recipientAccountId,
          role: 'MEMBER',
          joinedAt: new Date('2026-01-01T00:00:00.000Z'),
          historyClearedAt: null,
          isMuted: false,
          mutedUntil: null,
          account: recipientAccount,
        },
      ],
    } as never);
    jest.mocked(prisma.message.findUnique).mockResolvedValue(null);
    transaction.message.create.mockResolvedValue({ id: messageId, sentAt });
    transaction.conversation.update.mockResolvedValue({} as never);
    transaction.conversationParticipant.updateMany.mockResolvedValue({ count: 2 });
    transaction.message.findUniqueOrThrow.mockResolvedValue({
      id: messageId,
      conversationId,
      senderAccountId: viewerAccountId,
      sender: viewerAccount,
      receipts: [],
      hiddenForAccounts: [],
      reactions: [],
      stars: [],
      pins: [],
      attachments: [],
      replyTo: null,
    } as never);

    await service.sendTextMessage(viewer, conversationId, {
      clientMessageId: 'client-1',
      text: 'Scalable official message',
    });

    const createInput = transaction.message.create.mock.calls[0]?.[0];
    expect(createInput?.data).not.toHaveProperty('receipts');
  });

  it('marks an official group read by advancing one participant watermark', async () => {
    Object.defineProperty(service, 'assertActiveParticipant', {
      value: jest.fn().mockResolvedValue({
        joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        historyClearedAt: null,
        role: 'MEMBER',
        deletedFromListAt: null,
        deliveredThroughMessageId: null,
        deliveredThroughSentAt: null,
        deliveredThroughAt: null,
        readThroughMessageId: null,
        readThroughSentAt: null,
        readThroughAt: null,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    });
    jest.mocked(prisma.conversation.findUnique).mockResolvedValue({
      type: 'GROUP',
      groupKind: 'OFFICIAL',
    } as never);
    jest.mocked(prisma.message.findFirst).mockResolvedValue({
      id: messageId,
      sentAt,
    } as never);
    jest.mocked(prisma.message.count).mockResolvedValue(25);
    jest.mocked(prisma.conversationParticipant.update).mockResolvedValue({} as never);
    jest.mocked(prisma.message.findMany).mockResolvedValue([] as never);

    const result = await service.markConversationRead(viewer, conversationId);

    expect(prisma.messageReceipt.findMany).not.toHaveBeenCalled();
    expect(prisma.messageReceipt.updateMany).not.toHaveBeenCalled();
    expect(prisma.conversationParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          readThroughMessageId: messageId,
          readThroughSentAt: sentAt,
          deliveredThroughMessageId: messageId,
          deliveredThroughSentAt: sentAt,
        }),
      }),
    );
    expect(result.readMessages).toBe(25);
  });
  it('advances the official receipt watermark when clear chat hides unread history', async () => {
    const currentParticipant = {
      joinedAt: new Date('2026-01-01T00:00:00.000Z'),
      historyClearedAt: null,
      role: 'MEMBER',
      deletedFromListAt: null,
      deliveredThroughMessageId: null,
      deliveredThroughSentAt: null,
      deliveredThroughAt: null,
      readThroughMessageId: null,
      readThroughSentAt: null,
      readThroughAt: null,
      updatedAt: new Date('2026-08-15T23:59:00.000Z'),
    };
    Object.defineProperty(service, 'assertActiveParticipant', {
      value: jest.fn().mockResolvedValue(currentParticipant),
    });
    jest.mocked(prisma.conversation.findFirst).mockResolvedValue({
      id: conversationId,
      type: 'GROUP',
      groupKind: 'OFFICIAL',
    } as never);
    jest.mocked(prisma.message.findFirst).mockResolvedValue({
      id: messageId,
      sentAt,
    } as never);
    jest.mocked(prisma.message.findMany).mockResolvedValue([
      { senderAccountId: recipientAccountId },
    ] as never);
    jest.mocked(prisma.messageReceipt.findMany).mockResolvedValue([] as never);
    transaction.conversationParticipant.updateMany.mockResolvedValue({ count: 1 });
    transaction.conversationParticipant.findUnique.mockResolvedValue({
      conversationId,
      accountId: viewerAccountId,
      historyClearedAt: new Date('2026-08-16T00:01:00.000Z'),
      deletedFromListAt: null,
      isPinned: false,
      pinnedAt: null,
      isFavorite: false,
      favoritedAt: null,
      isArchived: false,
      archivedAt: null,
      isMuted: false,
      mutedUntil: null,
      markedUnreadAt: null,
      draftText: null,
      draftUpdatedAt: null,
    } as never);
    transaction.messagingNotification.deleteMany.mockResolvedValue({ count: 0 });
    transaction.activityEvent.create.mockResolvedValue({} as never);

    await service.clearConversationForAccount(viewer, conversationId);

    expect(transaction.conversationParticipant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          historyClearedAt: expect.any(Date),
          deliveredThroughMessageId: messageId,
          deliveredThroughSentAt: sentAt,
          readThroughMessageId: messageId,
          readThroughSentAt: sentAt,
        }),
      }),
    );
    expect(messagingEventsService.emitReceiptUpdated).toHaveBeenCalledWith(
      [recipientAccountId],
      expect.objectContaining({
        conversationId,
        messageIds: [],
        accountId: viewerAccountId,
        status: 'READ',
      }),
    );
  });

});
