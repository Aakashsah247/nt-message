import { BadRequestException } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import { ConversationsService } from './conversations.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('ConversationsService message-history scalability and visibility', () => {
  const viewerAccountId = '11111111-1111-4111-8111-111111111111';
  const senderAccountId = '22222222-2222-4222-8222-222222222222';
  const conversationId = '33333333-3333-4333-8333-333333333333';
  const cursorId = '44444444-4444-4444-8444-444444444444';
  const viewer = {
    accountId: viewerAccountId,
    sessionId: 'session-1',
  } as never;

  const messageHiddenForAccount = {
    upsert: jest.fn(),
  };
  const messageReceipt = {
    upsert: jest.fn(),
    updateMany: jest.fn(),
  };
  const transaction = {
    messageHiddenForAccount,
    messageReceipt,
  };
  const prisma = {
    conversation: {
      findUnique: jest.fn(),
    },
    message: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    messageHiddenForAccount,
    messageReceipt,
    $transaction: jest.fn(),
  } as unknown as PrismaService;

  const messagingEventsService = {
    emitMessageHidden: jest.fn(),
    emitReceiptUpdated: jest.fn(),
  };

  let service: ConversationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as unknown as jest.Mock).mockImplementation(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );

    service = new ConversationsService(
      prisma,
      messagingEventsService as never,
      {} as never,
    );

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
      configurable: true,
    });
    Object.defineProperty(service, 'markReceiptsDelivered', {
      value: jest.fn().mockResolvedValue(0),
      configurable: true,
    });
  });

  it('uses an explicit sentAt/id keyset boundary and preserves clear-history visibility', async () => {
    const joinedAt = new Date('2026-01-01T00:00:00.000Z');
    const historyClearedAt = new Date('2026-02-01T00:00:00.000Z');
    const cursorSentAt = new Date('2026-03-01T12:00:00.000Z');

    Object.defineProperty(service, 'assertActiveParticipant', {
      value: jest.fn().mockResolvedValue({
        joinedAt,
        historyClearedAt,
      }),
      configurable: true,
    });
    jest.mocked(prisma.conversation.findUnique).mockResolvedValue({
      type: 'PRIVATE',
      groupKind: null,
    } as never);
    jest.mocked(prisma.message.findUnique).mockResolvedValue({
      id: cursorId,
      conversationId,
      sentAt: cursorSentAt,
    } as never);
    jest.mocked(prisma.message.findMany).mockResolvedValue([] as never);

    await service.listMessages(viewer, conversationId, {
      cursor: cursorId,
      limit: 50,
    });

    expect(prisma.message.findUnique).toHaveBeenCalledWith({
      where: { id: cursorId },
      select: {
        id: true,
        conversationId: true,
        sentAt: true,
      },
    });

    const query = jest.mocked(prisma.message.findMany).mock.calls[0]?.[0];
    expect(query).not.toHaveProperty('cursor');
    expect(query).not.toHaveProperty('skip');
    expect(query?.take).toBe(51);
    expect(query?.where).toEqual(
      expect.objectContaining({
        conversationId,
        sentAt: { gt: historyClearedAt },
        hiddenForAccounts: {
          none: { accountId: viewerAccountId },
        },
        OR: [
          { sentAt: { lt: cursorSentAt } },
          {
            sentAt: cursorSentAt,
            id: { lt: cursorId },
          },
        ],
      }),
    );
  });

  it('rejects a cursor from another conversation before querying history', async () => {
    Object.defineProperty(service, 'assertActiveParticipant', {
      value: jest.fn().mockResolvedValue({
        joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        historyClearedAt: null,
      }),
      configurable: true,
    });
    jest.mocked(prisma.conversation.findUnique).mockResolvedValue({
      type: 'PRIVATE',
      groupKind: null,
    } as never);
    jest.mocked(prisma.message.findUnique).mockResolvedValue({
      id: cursorId,
      conversationId: '55555555-5555-4555-8555-555555555555',
      sentAt: new Date('2026-03-01T12:00:00.000Z'),
    } as never);

    await expect(
      service.listMessages(viewer, conversationId, {
        cursor: cursorId,
        limit: 50,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('persists only one sparse receipt exception when deleting an official-group message for me', async () => {
    Object.defineProperty(service, 'findVisibleConversationMessageOrThrow', {
      value: jest.fn().mockResolvedValue({
        id: cursorId,
        senderAccountId,
      }),
      configurable: true,
    });
    jest.mocked(prisma.conversation.findUnique).mockResolvedValue({
      type: 'GROUP',
      groupKind: 'OFFICIAL',
    } as never);

    await service.deleteMessageForMe(viewer, conversationId, cursorId);

    expect(messageHiddenForAccount.upsert).toHaveBeenCalledTimes(1);
    expect(messageReceipt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          messageId_accountId: {
            messageId: cursorId,
            accountId: viewerAccountId,
          },
        },
        create: expect.objectContaining({
          messageId: cursorId,
          accountId: viewerAccountId,
          deliveredAt: expect.any(Date),
          readAt: expect.any(Date),
        }),
      }),
    );
    expect(messageReceipt.updateMany).not.toHaveBeenCalled();
    expect(messagingEventsService.emitReceiptUpdated).toHaveBeenCalledTimes(1);
  });

  it('does not leak a read event when the viewer has disabled read receipts', async () => {
    Object.defineProperty(service, 'getMessagingViewer', {
      value: jest.fn().mockResolvedValue({
        accountId: viewerAccountId,
        role: 'EMPLOYEE',
        divisionId: null,
        departmentId: null,
        showOnlineStatus: true,
        showReadReceipts: false,
        requireMessageRequests: false,
      }),
      configurable: true,
    });
    Object.defineProperty(service, 'findVisibleConversationMessageOrThrow', {
      value: jest.fn().mockResolvedValue({
        id: cursorId,
        senderAccountId,
      }),
      configurable: true,
    });
    jest.mocked(prisma.conversation.findUnique).mockResolvedValue({
      type: 'GROUP',
      groupKind: 'OFFICIAL',
    } as never);

    await service.deleteMessageForMe(viewer, conversationId, cursorId);

    // Durable read state remains internal for unread correctness, while the
    // sender receives no realtime read signal when privacy disables receipts.
    expect(messageReceipt.upsert).toHaveBeenCalledTimes(1);
    expect(messagingEventsService.emitReceiptUpdated).not.toHaveBeenCalled();
  });
});
