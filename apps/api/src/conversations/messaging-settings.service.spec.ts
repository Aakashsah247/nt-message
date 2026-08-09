import type { PrismaService } from '../database/prisma.service';
import { ConversationsService } from './conversations.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('ConversationsService messaging settings', () => {
  const prisma = {
    account: {
      update: jest.fn(),
    },
  } as unknown as PrismaService;

  const messagingEventsService = {
    emitPresenceUpdated: jest.fn(),
  };

  const conversationStorageService = {};

  let service: ConversationsService;

  beforeEach(() => {
    jest.clearAllMocks();
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
      .mockResolvedValue({
        accountId: 'account-1',
        role: 'EMPLOYEE',
        divisionId: 'division-1',
        departmentId: 'department-1',
        showOnlineStatus: true,
        showReadReceipts: true,
        requireMessageRequests: true,
      });
  });

  it('returns the message-request preference with existing privacy settings', async () => {
    await expect(
      service.getMessagingSettings({ accountId: 'account-1' } as never),
    ).resolves.toEqual({
      data: {
        accountId: 'account-1',
        showOnlineStatus: true,
        showReadReceipts: true,
        requireMessageRequests: true,
        updatedAt: null,
      },
    });
  });

  it('persists the request preference without changing the policy rules', async () => {
    const updatedAt = new Date('2026-07-30T12:00:00.000Z');
    jest.mocked(prisma.account.update).mockResolvedValue({
      id: 'account-1',
      showOnlineStatus: true,
      showReadReceipts: true,
      requireMessageRequests: false,
      updatedAt,
    } as never);

    const result = await service.updateMessagingSettings(
      { accountId: 'account-1' } as never,
      { requireMessageRequests: false },
    );

    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      data: { requireMessageRequests: false },
      select: {
        id: true,
        showOnlineStatus: true,
        showReadReceipts: true,
        requireMessageRequests: true,
        updatedAt: true,
      },
    });
    expect(result.data.requireMessageRequests).toBe(false);
    expect(messagingEventsService.emitPresenceUpdated).not.toHaveBeenCalled();
  });
});
