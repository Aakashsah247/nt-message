import type { AuthenticatedUser } from '../auth/types/auth.types';
import { promises as fs } from 'node:fs';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  AnnouncementAudienceType,
  AnnouncementPriority,
  AnnouncementStatus,
  ConversationParticipantRole,
  EmployeeStatus,
  EmploymentStatus,
  GroupKind,
  OfficialGroupScopeType,
} from '../generated/prisma/enums';
import { MessagingEventsService } from '../realtime/messaging-events.service';
import { AnnouncementsService } from './announcements.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/*
 * This focused unit suite exercises announcement authorization without needing
 * Prisma's generated query runtime. Prisma 7 emits ESM-style internal .js
 * imports that Jest cannot resolve from generated TypeScript source; API builds
 * still compile the real client and protect that production integration.
 */
jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('AnnouncementsService', () => {
  it('returns management detail to an authorized official-group admin', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const divisionId = '22222222-2222-4222-8222-222222222222';
    const departmentId = '33333333-3333-4333-8333-333333333333';
    const conversationId = '44444444-4444-4444-8444-444444444444';
    const announcementId = '55555555-5555-4555-8555-555555555555';
    const now = new Date('2026-07-19T03:45:00.000Z');
    const account = {
      id: accountId,
      username: 'team.manager',
      role: AccountRole.TEAM_MANAGER,
      isEnabled: true,
      superAdminProfile: null,
      employee: {
        empName: 'Team Manager',
        designation: 'Department Manager',
        status: EmployeeStatus.ACTIVE,
        employmentStatus: EmploymentStatus.ACTIVE,
        archivedAt: null,
        isActivated: true,
        divisionId,
        departmentId,
        division: {
          id: divisionId,
          code: 'DIV-A',
          name: 'Division A',
          isActive: true,
        },
        departmentUnit: {
          id: departmentId,
          divisionId,
          code: 'DEP-A',
          name: 'Department A',
          isActive: true,
        },
      },
    };
    const announcement = {
      id: announcementId,
      createdByAccountId: accountId,
      withdrawnByAccountId: null,
      audienceType: AnnouncementAudienceType.OFFICIAL_GROUP,
      divisionId: null,
      departmentId: null,
      officialConversationId: conversationId,
      title: 'Planned maintenance',
      body: 'Maintenance starts at 10:00 PM.',
      priority: AnnouncementPriority.IMPORTANT,
      status: AnnouncementStatus.PUBLISHED,
      requiresAcknowledgement: false,
      allowAttachmentDownload: true,
      isPinned: false,
      currentRevision: 1,
      scheduledAt: null,
      publishedAt: now,
      expiresAt: null,
      withdrawnAt: null,
      publishClaimedAt: null,
      nextPublishAttemptAt: null,
      publishAttempts: 0,
      publishFailureReason: null,
      createdAt: now,
      updatedAt: now,
      createdBy: account,
      withdrawnBy: null,
      division: null,
      department: null,
      officialConversation: {
        id: conversationId,
        title: 'Department A',
        groupKind: GroupKind.OFFICIAL,
        officialScopeType: OfficialGroupScopeType.DEPARTMENT,
        officialDivisionId: divisionId,
        officialDepartmentId: departmentId,
      },
      attachments: [],
      recipients: [],
      revisions: [
        {
          revisionNumber: 1,
          editor: account,
          createdAt: now,
        },
      ],
      _count: { recipients: 8, acknowledgements: 0 },
    };
    const accountFindUnique = jest.fn().mockResolvedValue(account);
    const announcementFindUnique = jest.fn().mockResolvedValue(announcement);
    const participantFindFirst = jest.fn().mockResolvedValue({
      role: ConversationParticipantRole.ADMIN,
    });
    const prisma = {
      account: { findUnique: accountFindUnique },
      announcement: { findUnique: announcementFindUnique },
      conversationParticipant: { findFirst: participantFindFirst },
    } as unknown as PrismaService;
    const service = new AnnouncementsService(
      prisma,
      {} as MessagingEventsService,
    );
    const user: AuthenticatedUser = {
      accountId,
      sessionId: '66666666-6666-4666-8666-666666666666',
      username: 'team.manager',
      role: AccountRole.TEAM_MANAGER,
    };

    const response = await service.getById(user, announcementId);

    expect(response.data.canManage).toBe(true);
    expect(response.data.reporting).toEqual({
      recipientCount: 8,
      acknowledgementHistoryCount: 0,
    });
    expect(response.data.revisions).toHaveLength(1);
    expect(participantFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId,
          accountId,
          leftAt: null,
        }),
      }),
    );
  });

  it('hides withdrawn records from the selected official-group active feed', async () => {
    const accountId = '77777777-7777-4777-8777-777777777777';
    const conversationId = '88888888-8888-4888-8888-888888888888';
    const account = {
      id: accountId,
      username: 'super.admin',
      role: AccountRole.SUPER_ADMIN,
      isEnabled: true,
      superAdminProfile: { fullName: 'Super Admin' },
      employee: null,
    };
    const announcementFindMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      account: { findUnique: jest.fn().mockResolvedValue(account) },
      announcement: { findMany: announcementFindMany },
    } as unknown as PrismaService;
    const service = new AnnouncementsService(
      prisma,
      {} as MessagingEventsService,
    );
    const user: AuthenticatedUser = {
      accountId,
      sessionId: '99999999-9999-4999-8999-999999999999',
      username: 'super.admin',
      role: AccountRole.SUPER_ADMIN,
    };

    await service.list(user, {
      filter: 'ALL',
      officialConversationId: conversationId,
      limit: 100,
    });

    expect(announcementFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              audienceType: AnnouncementAudienceType.OFFICIAL_GROUP,
              officialConversationId: conversationId,
            },
            { status: { not: AnnouncementStatus.WITHDRAWN } },
          ]),
        }),
      }),
    );
  });

  it('permanently purges withdrawn announcements after 90 days', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-19T06:00:00.000Z'));

    const announcementId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const announcementFindMany = jest
      .fn()
      .mockResolvedValue([{ id: announcementId }]);
    const announcementDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const removeDirectory = jest.spyOn(fs, 'rm').mockResolvedValue(undefined);
    const prisma = {
      announcement: {
        findMany: announcementFindMany,
        deleteMany: announcementDeleteMany,
      },
    } as unknown as PrismaService;
    const service = new AnnouncementsService(
      prisma,
      {} as MessagingEventsService,
    );

    try {
      await (
        service as unknown as {
          cleanupWithdrawnAnnouncements(): Promise<void>;
        }
      ).cleanupWithdrawnAnnouncements();

      const cutoff = new Date('2026-04-20T06:00:00.000Z');
      expect(announcementFindMany).toHaveBeenCalledWith({
        where: {
          status: AnnouncementStatus.WITHDRAWN,
          withdrawnAt: { lte: cutoff },
        },
        orderBy: [{ withdrawnAt: 'asc' }, { id: 'asc' }],
        take: 50,
        select: { id: true },
      });
      expect(removeDirectory).toHaveBeenCalledWith(
        expect.stringContaining(announcementId),
        {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        },
      );
      expect(announcementDeleteMany).toHaveBeenCalledWith({
        where: {
          id: announcementId,
          status: AnnouncementStatus.WITHDRAWN,
          withdrawnAt: { lte: cutoff },
        },
      });
      expect(removeDirectory.mock.invocationCallOrder[0]).toBeLessThan(
        announcementDeleteMany.mock.invocationCallOrder[0],
      );
    } finally {
      removeDirectory.mockRestore();
      jest.useRealTimers();
    }
  });

  it('keeps the database record when protected attachment cleanup fails', async () => {
    const announcementId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const announcementDeleteMany = jest.fn();
    const removeDirectory = jest
      .spyOn(fs, 'rm')
      .mockRejectedValue(new Error('simulated storage failure'));
    const prisma = {
      announcement: {
        findMany: jest.fn().mockResolvedValue([{ id: announcementId }]),
        deleteMany: announcementDeleteMany,
      },
    } as unknown as PrismaService;
    const service = new AnnouncementsService(
      prisma,
      {} as MessagingEventsService,
    );
    const warn = jest
      .spyOn(
        (
          service as unknown as {
            logger: { warn(message: string): void };
          }
        ).logger,
        'warn',
      )
      .mockImplementation(() => undefined);

    try {
      await (
        service as unknown as {
          cleanupWithdrawnAnnouncements(): Promise<void>;
        }
      ).cleanupWithdrawnAnnouncements();

      expect(announcementDeleteMany).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        `Withdrawn announcement ${announcementId} could not be purged and will be retried.`,
      );
    } finally {
      warn.mockRestore();
      removeDirectory.mockRestore();
    }
  });
});
