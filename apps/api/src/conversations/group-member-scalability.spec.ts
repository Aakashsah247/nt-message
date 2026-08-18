import type { PrismaService } from '../database/prisma.service';
import { ConversationsService } from './conversations.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('ConversationsService group-member scalability', () => {
  const viewerAccountId = '11111111-1111-4111-8111-111111111111';
  const conversationId = '22222222-2222-4222-8222-222222222222';
  const viewer = {
    accountId: viewerAccountId,
    sessionId: 'session-1',
  } as never;

  const prisma = {
    conversation: {
      findUnique: jest.fn(),
    },
    conversationParticipant: {
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
    Object.defineProperty(service, 'assertActiveParticipant', {
      value: jest.fn().mockResolvedValue({
        joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        role: 'OWNER',
        historyClearedAt: null,
        deletedFromListAt: null,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    });

    jest.mocked(prisma.conversation.findUnique).mockResolvedValue({
      type: 'GROUP',
    } as never);
  });

  function member(index: number) {
    const accountId = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    return {
      accountId,
      joinedAt: new Date(`2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`),
      role: index === 1 ? 'OWNER' : 'MEMBER',
      account: {
        id: accountId,
        username: `member${index}`,
        role: index === 1 ? 'SUPER_ADMIN' : 'EMPLOYEE',
        isEnabled: true,
        profilePhotoKey: null,
        profileBio: null,
        showOnlineStatus: true,
        showReadReceipts: true,
        requireMessageRequests: false,
        superAdminProfile:
          index === 1
            ? {
                fullName: 'System Owner',
                email: 'owner@example.com',
                phoneNumber: null,
              }
            : null,
        employee:
          index === 1
            ? null
            : {
                id: `employee-${index}`,
                empId: `NT-${index}`,
                empName: `Member ${index}`,
                officialEmail: `member${index}@example.com`,
                phoneNumber: null,
                designation: 'Engineer',
                profilePhotoKey: null,
                profileBio: null,
                status: 'ACTIVE',
                employmentStatus: 'ACTIVE',
                archivedAt: null,
                isActivated: true,
                divisionId: 'division-1',
                departmentId: 'department-1',
                division: {
                  id: 'division-1',
                  code: 'DIV',
                  name: 'Division',
                  isActive: true,
                },
                departmentUnit: {
                  id: 'department-1',
                  divisionId: 'division-1',
                  code: 'DEP',
                  name: 'Department',
                  isActive: true,
                },
              },
      },
    };
  }

  it('returns a bounded page instead of hydrating all members', async () => {
    jest
      .mocked(prisma.conversationParticipant.findMany)
      .mockResolvedValue(Array.from({ length: 26 }, (_, index) => member(index + 1)) as never);

    const result = await service.listGroupMembers(viewer, conversationId, {
      limit: 25,
    });

    expect(prisma.conversationParticipant.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.conversationParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId,
          leftAt: null,
        }),
        take: 26,
        orderBy: [
          { role: 'asc' },
          { joinedAt: 'asc' },
          { accountId: 'asc' },
        ],
      }),
    );
    expect(result.data).toHaveLength(25);
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.nextCursor).toBe(result.data[24]?.accountId);
  });

  it('pushes member-name search into PostgreSQL and keeps the configured Super Admin searchable', async () => {
    const previousName = process.env.SUPER_ADMIN_NAME;
    process.env.SUPER_ADMIN_NAME = 'Aakash Shah';

    try {
      jest.mocked(prisma.conversationParticipant.findMany).mockResolvedValue([] as never);

      await service.listGroupMembers(viewer, conversationId, {
        search: 'Aakash',
        limit: 7,
      });

      const query = jest.mocked(prisma.conversationParticipant.findMany).mock.calls[0]?.[0];
      expect(query?.take).toBe(8);
      expect(query?.where).toEqual(
        expect.objectContaining({
          conversationId,
          leftAt: null,
          account: {
            is: {
              OR: expect.arrayContaining([
                expect.objectContaining({
                  employee: expect.any(Object),
                }),
                expect.objectContaining({
                  superAdminProfile: expect.any(Object),
                }),
                { role: 'SUPER_ADMIN' },
              ]),
            },
          },
        }),
      );
    } finally {
      if (previousName === undefined) {
        delete process.env.SUPER_ADMIN_NAME;
      } else {
        process.env.SUPER_ADMIN_NAME = previousName;
      }
    }
  });
});
