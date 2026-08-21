import type { PrismaService } from '../database/prisma.service';
import { ConversationsService } from './conversations.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('ConversationsService message-search scalability', () => {
  const viewerAccountId = '11111111-1111-4111-8111-111111111111';
  const senderAccountId = '22222222-2222-4222-8222-222222222222';
  const conversationId = '33333333-3333-4333-8333-333333333333';
  const viewer = {
    accountId: viewerAccountId,
    sessionId: 'session-1',
  } as never;

  const prisma = {
    conversationParticipant: {
      findMany: jest.fn(),
    },
    message: {
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
        role: 'EMPLOYEE',
        divisionId: null,
        departmentId: null,
        showOnlineStatus: true,
        showReadReceipts: true,
        requireMessageRequests: false,
      }),
    });
    Object.defineProperty(service, 'assertActiveParticipant', {
      value: jest.fn().mockResolvedValue({
        joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        historyClearedAt: null,
      }),
    });
    Object.defineProperty(service, 'getConversationRecord', {
      value: jest.fn().mockResolvedValue({}),
    });
  });

  it('pre-resolves sender identities within the conversation before querying messages', async () => {
    jest.mocked(prisma.conversationParticipant.findMany).mockResolvedValue([
      { accountId: senderAccountId },
    ] as never);
    jest.mocked(prisma.message.findMany).mockResolvedValue([] as never);

    await service.searchConversationMessages(viewer, conversationId, {
      search: 'Aakash',
      limit: 25,
    });

    expect(prisma.conversationParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId,
          account: {
            is: {
              OR: expect.any(Array),
            },
          },
        }),
        select: {
          accountId: true,
        },
      }),
    );

    const messageQuery = jest.mocked(prisma.message.findMany).mock.calls[0]?.[0];
    const serializedWhere = JSON.stringify(messageQuery?.where ?? {});

    expect(serializedWhere).toContain(senderAccountId);
    expect(serializedWhere).toContain('senderAccountId');
    expect(serializedWhere).not.toContain('superAdminProfile');
    expect(serializedWhere).not.toContain('employee');
    expect(messageQuery?.take).toBe(25);
  });

  it('keeps former group members eligible for sender-name search', async () => {
    jest.mocked(prisma.conversationParticipant.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.message.findMany).mockResolvedValue([] as never);

    await service.searchConversationMessages(viewer, conversationId, {
      search: 'former member',
      limit: 10,
    });

    const participantQuery = jest.mocked(prisma.conversationParticipant.findMany)
      .mock.calls[0]?.[0];

    // Search must not add leftAt:null here; former members' historical messages
    // remain legitimate searchable history while normal message visibility rules
    // still protect what the viewer is allowed to see.
    expect(participantQuery?.where).not.toHaveProperty('leftAt');
    expect(jest.mocked(prisma.message.findMany).mock.calls[0]?.[0]?.take).toBe(10);
  });
});
