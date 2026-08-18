import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import { ConversationsService } from './conversations.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('ConversationsService starred-message pagination', () => {
  const viewerAccountId = '11111111-1111-4111-8111-111111111111';
  const conversationId = '22222222-2222-4222-8222-222222222222';
  const viewer = {
    accountId: viewerAccountId,
    sessionId: 'session-1',
  } as never;
  const membership = {
    conversationId,
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
    historyClearedAt: null,
  };
  const conversation = { id: conversationId };

  function star(
    messageId: string,
    starredAt: string,
  ) {
    return {
      messageId,
      starredAt: new Date(starredAt),
      message: {
        id: messageId,
        conversationId,
      },
    };
  }

  const prisma = {
    conversationParticipant: {
      findMany: jest.fn(),
    },
    messageStar: {
      findMany: jest.fn(),
    },
    conversation: {
      findMany: jest.fn(),
    },
  } as unknown as PrismaService;

  let service: ConversationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConversationsService(prisma, {} as never, {} as never);

    Object.defineProperty(service, 'getMessagingViewer', {
      value: jest.fn().mockResolvedValue({
        accountId: viewerAccountId,
      }),
    });
    Object.defineProperty(service, 'serializeMessage', {
      value: jest.fn((message) => message),
    });
    Object.defineProperty(service, 'serializeConversation', {
      value: jest.fn((item) => item),
    });

    jest
      .mocked(prisma.conversationParticipant.findMany)
      .mockResolvedValue([membership] as never);
    jest
      .mocked(prisma.conversation.findMany)
      .mockResolvedValue([conversation] as never);
  });

  it('returns a bounded first page and an opaque cursor for older stars', async () => {
    const first = star(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '2026-08-16T08:00:00.000Z',
    );
    const second = star(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '2026-08-16T07:00:00.000Z',
    );
    const overflow = star(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '2026-08-16T06:00:00.000Z',
    );
    jest
      .mocked(prisma.messageStar.findMany)
      .mockResolvedValue([first, second, overflow] as never);

    const result = await service.listStarredMessages(viewer, {
      limit: 2,
    });

    expect(prisma.messageStar.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 3,
        orderBy: [{ starredAt: 'desc' }, { messageId: 'desc' }],
      }),
    );
    expect(result.data).toHaveLength(2);
    expect(result.pagination).toEqual({
      limit: 2,
      hasMore: true,
      nextCursor: expect.any(String),
    });
  });

  it('uses the prior page boundary to request only older starred messages', async () => {
    const first = star(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '2026-08-16T08:00:00.000Z',
    );
    const second = star(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '2026-08-16T07:00:00.000Z',
    );
    const overflow = star(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '2026-08-16T06:00:00.000Z',
    );
    jest
      .mocked(prisma.messageStar.findMany)
      .mockResolvedValueOnce([first, second, overflow] as never)
      .mockResolvedValueOnce([overflow] as never);

    const firstPage = await service.listStarredMessages(viewer, { limit: 2 });
    await service.listStarredMessages(viewer, {
      limit: 2,
      cursor: firstPage.pagination.nextCursor ?? undefined,
    });

    const secondQuery = jest.mocked(prisma.messageStar.findMany).mock.calls[1]?.[0];
    expect(secondQuery).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          accountId: viewerAccountId,
          OR: [
            { starredAt: { lt: second.starredAt } },
            {
              starredAt: second.starredAt,
              messageId: { lt: second.messageId },
            },
          ],
        }),
      }),
    );
  });

  it('rejects malformed cursors instead of silently returning the wrong page', async () => {
    await expect(
      service.listStarredMessages(viewer, {
        limit: 50,
        cursor: 'not-a-valid-starred-cursor',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.messageStar.findMany).not.toHaveBeenCalled();
  });
});
