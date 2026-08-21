import { ForbiddenException } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import { ConversationsService } from './conversations.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('ConversationsService message edit window', () => {
  const now = new Date('2026-08-14T10:00:00.000Z');
  const prisma = {
    $transaction: jest.fn(async (operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    ),
    message: {
      update: jest.fn(),
    },
    conversationParticipant: {
      findMany: jest.fn(),
    },
  } as unknown as PrismaService;

  let service: ConversationsService;
  let visibleMessage: {
    id: string;
    conversationId: string;
    senderAccountId: string;
    contentType: 'TEXT';
    textContent: string;
    payload: null;
    sentAt: Date;
    deletedAt: null;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(now);

    service = new ConversationsService(prisma, {} as never, {} as never);
    visibleMessage = {
      id: 'message-1',
      conversationId: 'conversation-1',
      senderAccountId: 'account-1',
      contentType: 'TEXT',
      textContent: 'before',
      payload: null,
      sentAt: new Date(now.getTime() - 20 * 60 * 1000),
      deletedAt: null,
    };

    jest
      .spyOn(
        service as unknown as { getMessagingViewer: () => Promise<unknown> },
        'getMessagingViewer',
      )
      .mockResolvedValue({ accountId: 'account-1' });
    jest
      .spyOn(
        service as unknown as {
          findVisibleConversationMessageOrThrow: () => Promise<unknown>;
        },
        'findVisibleConversationMessageOrThrow',
      )
      .mockImplementation(async () => visibleMessage);
    jest
      .spyOn(
        service as unknown as { serializeMessage: () => unknown },
        'serializeMessage',
      )
      .mockReturnValue({ id: 'message-1', textContent: 'after' });
    jest
      .spyOn(
        service as unknown as {
          emitMessageUpdatedForVisibleParticipants: () => void;
        },
        'emitMessageUpdatedForVisibleParticipants',
      )
      .mockImplementation(() => undefined);

    jest.mocked(prisma.message.update).mockResolvedValue({
      ...visibleMessage,
      textContent: 'after',
      editedAt: now,
      attachments: [],
      hiddenForAccounts: [],
      reactions: [],
      stars: [],
      pins: [],
      receipts: [],
      sender: {},
      replyTo: null,
    } as never);
    jest.mocked(prisma.conversationParticipant.findMany).mockResolvedValue([
      {
        accountId: 'account-1',
        joinedAt: new Date('2026-08-14T08:00:00.000Z'),
        historyClearedAt: null,
      },
    ] as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows the sender to edit a text message at the 20-minute boundary', async () => {
    await expect(
      service.editTextMessage(
        { accountId: 'account-1', sessionId: 'session-1' } as never,
        'conversation-1',
        'message-1',
        { text: 'after' },
      ),
    ).resolves.toEqual(
      expect.objectContaining({ message: 'Message edited successfully.' }),
    );
  });

  it('rejects an edit after the 20-minute window', async () => {
    visibleMessage.sentAt = new Date(now.getTime() - 20 * 60 * 1000 - 1);

    await expect(
      service.editTextMessage(
        { accountId: 'account-1', sessionId: 'session-1' } as never,
        'conversation-1',
        'message-1',
        { text: 'after' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
