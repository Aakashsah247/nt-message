import type { PrismaService } from '../database/prisma.service';
import { ConversationsService } from './conversations.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('ConversationsService delete for everyone transaction shape', () => {
  const transaction = {
    message: {
      update: jest.fn(),
    },
    conversationParticipant: {
      findMany: jest.fn(),
    },
  };

  const executionOrder: string[] = [];
  const prisma = {
    message: {
      findUnique: jest.fn(async () => {
        executionOrder.push('message:fetch-after-commit');
        return {
          id: 'message-1',
          conversationId: 'conversation-1',
          senderAccountId: 'account-1',
          attachments: [],
        };
      }),
    },
    $transaction: jest.fn(
      async (callback: (value: typeof transaction) => Promise<unknown>) => {
        executionOrder.push('transaction:start');
        const result = await callback(transaction);
        executionOrder.push('transaction:commit');
        return result;
      },
    ),
  } as unknown as PrismaService;

  const messagingEventsService = {};
  const conversationStorageService = {
    lockStorageKeys: jest.fn(),
    removeDeletedMessageAttachmentReferences: jest.fn(),
    deletePhysicalStorageObjects: jest.fn(),
  };

  let service: ConversationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    executionOrder.length = 0;

    transaction.message.update.mockResolvedValue({ id: 'message-1' });
    transaction.conversationParticipant.findMany.mockResolvedValue([
      {
        accountId: 'account-1',
        joinedAt: new Date('2026-07-31T00:00:00.000Z'),
        historyClearedAt: null,
      },
    ]);
    conversationStorageService.removeDeletedMessageAttachmentReferences.mockResolvedValue(
      [],
    );

    service = new ConversationsService(
      prisma,
      messagingEventsService as never,
      conversationStorageService as never,
    );

    jest
      .spyOn(
        service as unknown as {
          getMessagingViewer: () => Promise<unknown>;
        },
        'getMessagingViewer',
      )
      .mockResolvedValue({ accountId: 'account-1' });

    jest
      .spyOn(
        service as unknown as {
          assertActiveParticipant: () => Promise<unknown>;
        },
        'assertActiveParticipant',
      )
      .mockResolvedValue({
        accountId: 'account-1',
        conversationId: 'conversation-1',
        joinedAt: new Date('2026-07-31T00:00:00.000Z'),
        historyClearedAt: null,
      });

    jest
      .spyOn(
        service as unknown as {
          findVisibleConversationMessageOrThrow: () => Promise<unknown>;
        },
        'findVisibleConversationMessageOrThrow',
      )
      .mockResolvedValue({
        id: 'message-1',
        senderAccountId: 'account-1',
        deletedAt: null,
        attachments: [{ storageKey: 'storage-1' }],
      });

    jest
      .spyOn(
        service as unknown as {
          serializeMessage: () => unknown;
        },
        'serializeMessage',
      )
      .mockReturnValue({ id: 'message-1', isDeleted: true });

    jest
      .spyOn(
        service as unknown as {
          emitMessageUpdatedForVisibleParticipants: () => void;
        },
        'emitMessageUpdatedForVisibleParticipants',
      )
      .mockImplementation(() => undefined);
  });

  it('keeps the rich message read outside the interactive transaction', async () => {
    await service.deleteMessageForEveryone(
      {
        accountId: 'account-1',
        sessionId: 'session-1',
      } as never,
      'conversation-1',
      'message-1',
    );

    expect(transaction.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'message-1' },
        select: { id: true },
      }),
    );
    expect(prisma.message.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'message-1' },
        select: expect.any(Object),
      }),
    );
    expect(executionOrder).toEqual([
      'transaction:start',
      'transaction:commit',
      'message:fetch-after-commit',
    ]);
  });
});
