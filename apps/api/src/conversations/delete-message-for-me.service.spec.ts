import type { PrismaService } from '../database/prisma.service';
import { ConversationsService } from './conversations.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('ConversationsService delete message for me', () => {
  const transaction = {
    messageHiddenForAccount: {
      upsert: jest.fn(),
    },
    messageReceipt: {
      updateMany: jest.fn(),
    },
  };

  const prisma = {
    $transaction: jest.fn(
      async (callback: (value: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as PrismaService;

  const messagingEventsService = {
    emitMessageHidden: jest.fn(),
    emitReceiptUpdated: jest.fn(),
  };

  let service: ConversationsService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new ConversationsService(
      prisma,
      messagingEventsService as never,
      {
        lockStorageKeys: jest.fn(),
        assertAttachmentReferencesAvailable: jest.fn(),
        removeDeletedMessageAttachmentReferences: jest.fn(),
        deletePhysicalStorageObjects: jest.fn(),
      } as never,
    );

    jest
      .spyOn(
        service as unknown as { getMessagingViewer: () => Promise<unknown> },
        'getMessagingViewer',
      )
      .mockResolvedValue({
        accountId: 'viewer-account',
        showReadReceipts: true,
      });

    transaction.messageHiddenForAccount.upsert.mockResolvedValue({
      messageId: 'message-1',
      accountId: 'viewer-account',
    });
    transaction.messageReceipt.updateMany.mockResolvedValue({ count: 1 });
  });

  it('allows an already-deleted tombstone to be removed from the viewer history', async () => {
    const findVisibleMessage = jest
      .spyOn(
        service as unknown as {
          findVisibleConversationMessageOrThrow: (
            accountId: string,
            conversationId: string,
            messageId: string,
            participant: unknown,
            options: { allowDeleted?: boolean },
          ) => Promise<unknown>;
        },
        'findVisibleConversationMessageOrThrow',
      )
      .mockResolvedValue({
        id: 'message-1',
        senderAccountId: 'viewer-account',
        deletedAt: new Date('2026-07-30T12:00:00.000Z'),
      });

    await service.deleteMessageForMe(
      { accountId: 'viewer-account' } as never,
      'conversation-1',
      'message-1',
    );

    expect(findVisibleMessage).toHaveBeenCalledWith(
      'viewer-account',
      'conversation-1',
      'message-1',
      undefined,
      { allowDeleted: true },
    );
    expect(transaction.messageHiddenForAccount.upsert).toHaveBeenCalledWith({
      where: {
        messageId_accountId: {
          messageId: 'message-1',
          accountId: 'viewer-account',
        },
      },
      update: {
        hiddenAt: expect.any(Date),
      },
      create: {
        messageId: 'message-1',
        accountId: 'viewer-account',
        hiddenAt: expect.any(Date),
      },
    });
    expect(messagingEventsService.emitMessageHidden).toHaveBeenCalledWith(
      'viewer-account',
      expect.objectContaining({
        conversationId: 'conversation-1',
        messageId: 'message-1',
      }),
    );
  });
});
