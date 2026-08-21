import type { PrismaService } from '../database/prisma.service';
import { ConversationsService } from './conversations.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('ConversationsService conversation-list scalability', () => {
  const viewerAccountId = '11111111-1111-4111-8111-111111111111';
  const conversationOne = '22222222-2222-4222-8222-222222222222';
  const conversationTwo = '33333333-3333-4333-8333-333333333333';
  const viewer = {
    accountId: viewerAccountId,
    sessionId: 'session-1',
  } as never;

  const account = {
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

  function participantRow(
    conversationId: string,
    unreadCount: number,
    groupKind: 'PERSONAL' | 'OFFICIAL' = 'PERSONAL',
  ) {
    const joinedAt = new Date('2026-01-01T00:00:00.000Z');

    return {
      accountId: viewerAccountId,
      joinedAt,
      leftAt: null,
      role: 'OWNER',
      isMuted: false,
      isArchived: false,
      isPinned: false,
      isFavorite: false,
      pinnedAt: null,
      favoritedAt: null,
      mutedUntil: null,
      archivedAt: null,
      markedUnreadAt: null,
      historyClearedAt: null,
      deletedFromListAt: null,
      draftText: null,
      draftUpdatedAt: null,
      account,
      conversation: {
        id: conversationId,
        type: 'GROUP',
        title: `Group ${conversationId.slice(0, 4)}`,
        description: null,
        groupPhotoKey: null,
        groupKind,
        officialScopeType: groupKind === 'OFFICIAL' ? 'ORGANIZATION' : null,
        officialDivisionId: null,
        officialDepartmentId: null,
        privateParticipantKey: null,
        createdByAccountId: viewerAccountId,
        lastMessageAt: null,
        createdAt: joinedAt,
        updatedAt: joinedAt,
        officialDivision: null,
        officialDepartment: null,
      },
      unreadCount,
    };
  }

  const prisma = {
    conversationParticipant: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    messageReceipt: {
      count: jest.fn(),
    },
    message: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    $queryRawUnsafe: jest.fn(),
  } as unknown as PrismaService;

  let service: ConversationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConversationsService(prisma, {} as never, {} as never);

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
    Object.defineProperty(service, 'synchronizeOfficialGroupsForAccountSafely', {
      value: jest.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(service, 'markReceiptsDelivered', {
      value: jest.fn().mockResolvedValue(0),
    });
  });

  function boundedParticipant(
    conversationId: string,
  ) {
    const row = participantRow(conversationId, 0);
    const { conversation: _conversation, unreadCount: _unreadCount, ...participant } = row;

    return {
      conversationId,
      ...participant,
    };
  }

  it('uses one batched stats query instead of per-conversation unread/latest queries', async () => {
    const first = participantRow(conversationOne, 3);
    const second = participantRow(conversationTwo, 7);

    jest
      .mocked(prisma.conversationParticipant.findMany)
      .mockResolvedValueOnce([first, second] as never)
      .mockResolvedValueOnce([
        boundedParticipant(conversationOne),
        boundedParticipant(conversationTwo),
      ] as never);
    jest.mocked(prisma.conversationParticipant.groupBy).mockResolvedValue([
      { conversationId: conversationOne, _count: { _all: 1 } },
      { conversationId: conversationTwo, _count: { _all: 1 } },
    ] as never);
    jest.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
      {
        conversationId: conversationOne,
        lastMessageId: null,
        unreadCount: first.unreadCount,
      },
      {
        conversationId: conversationTwo,
        lastMessageId: null,
        unreadCount: second.unreadCount,
      },
    ] as never);

    const result = await service.listConversations(viewer, {
      limit: 2,
      view: 'ACTIVE',
    });

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(prisma.messageReceipt.count).not.toHaveBeenCalled();
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
    expect(prisma.message.findMany).not.toHaveBeenCalled();
    expect(result.data.map((conversation) => conversation.unreadCount)).toEqual([
      3, 7,
    ]);
  });

  it('loads sidebar preview messages without recipient receipt fan-out', async () => {
    const first = participantRow(conversationOne, 0);
    const messageId = '55555555-5555-4555-8555-555555555555';

    jest
      .mocked(prisma.conversationParticipant.findMany)
      .mockResolvedValueOnce([first] as never)
      .mockResolvedValueOnce([boundedParticipant(conversationOne)] as never);
    jest.mocked(prisma.conversationParticipant.groupBy).mockResolvedValue([
      { conversationId: conversationOne, _count: { _all: 1 } },
    ] as never);
    jest.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
      {
        conversationId: conversationOne,
        lastMessageId: messageId,
        unreadCount: 0,
      },
    ] as never);
    jest.mocked(prisma.message.findMany).mockResolvedValue([
      {
        id: messageId,
        conversationId: conversationOne,
        senderAccountId: viewerAccountId,
        clientMessageId: 'client-message-1',
        contentType: 'TEXT',
        textContent: 'Latest message',
        payload: null,
        replyToMessageId: null,
        sentAt: new Date('2026-01-02T00:00:00.000Z'),
        editedAt: null,
        deletedAt: null,
        deletedByAccountId: null,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        sender: account,
        attachments: [],
      },
    ] as never);

    const result = await service.listConversations(viewer, {
      limit: 1,
      view: 'ACTIVE',
    });

    expect(prisma.message.findMany).toHaveBeenCalledTimes(1);
    const previewQuery = jest.mocked(prisma.message.findMany).mock.calls[0]?.[0];
    expect(previewQuery?.select).not.toHaveProperty('receipts');
    expect(previewQuery?.select).not.toHaveProperty('reactions');
    expect(previewQuery?.select).not.toHaveProperty('stars');
    expect(previewQuery?.select).not.toHaveProperty('pins');
    expect(result.data[0]?.lastMessage?.textContent).toBe('Latest message');
  });

  it('keeps a 10,000-member official group lightweight in the sidebar response', async () => {
    const official = participantRow(conversationOne, 0, 'OFFICIAL');

    jest
      .mocked(prisma.conversationParticipant.findMany)
      .mockResolvedValueOnce([official] as never);
    jest.mocked(prisma.conversationParticipant.groupBy).mockResolvedValue([
      { conversationId: conversationOne, _count: { _all: 10_000 } },
    ] as never);
    jest.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
      {
        conversationId: conversationOne,
        lastMessageId: null,
        unreadCount: 0,
      },
    ] as never);

    const result = await service.listConversations(viewer, {
      limit: 1,
      view: 'ACTIVE',
    });

    // Official groups do not trigger the second full-participant query.
    expect(prisma.conversationParticipant.findMany).toHaveBeenCalledTimes(1);
    expect(result.data[0]?.memberCount).toBe(10_000);
    expect(result.data[0]?.participants).toHaveLength(1);
    expect(result.data[0]?.participants[0]?.accountId).toBe(viewerAccountId);
    expect(result.data[0]?.participantsComplete).toBe(false);

    const listQuery = jest.mocked(prisma.conversationParticipant.findMany)
      .mock.calls[0]?.[0];
    expect(listQuery?.select?.conversation?.select).not.toHaveProperty(
      'participants',
    );
  });

});
