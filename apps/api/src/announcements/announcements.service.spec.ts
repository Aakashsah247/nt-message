import { promises as fs } from 'node:fs';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  AnnouncementAudienceType,
  AnnouncementPriority,
  AnnouncementStatus,
  EmployeeStatus,
  EmploymentStatus,
} from '../generated/prisma/enums';
import { MessagingEventsService } from '../realtime/messaging-events.service';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
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

const OFFICE_ID = '44444444-4444-4444-8444-444444444444';
const ORG_UNIT_ID = '99999999-9999-4999-8999-999999999999';
const ANNOUNCEMENT_ID = '55555555-5555-4555-8555-555555555555';
const MANAGER_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '77777777-7777-4777-8777-777777777777';
const RECIPIENT_ID = '88888888-8888-4888-8888-888888888888';
const NOW = new Date('2026-07-19T03:45:00.000Z');

function createAccount(id: string, role: AccountRole) {
  const isOwner = role === AccountRole.SUPER_ADMIN;

  return {
    id,
    username: isOwner ? 'super.admin' : 'team.manager',
    role,
    isEnabled: true,
    superAdminProfile: isOwner ? { fullName: 'Super Admin' } : null,
    employee: isOwner
      ? null
      : {
          id: `${id}-employee`,
          empName: 'Team Manager',
          designation: 'Department Manager',
          status: EmployeeStatus.ACTIVE,
          employmentStatus: EmploymentStatus.ACTIVE,
          archivedAt: null,
          isActivated: true,
        },
  };
}

function organizationAuthorityMocks(employeeId: string | null) {
  return {
    orgMembership: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          employeeId ? { officeId: OFFICE_ID, orgUnitId: ORG_UNIT_ID } : null,
        ),
    },
  };
}

function authorizationStub(
  input: {
    isOfficeHead?: boolean;
    canPublish?: boolean;
  } = {},
): OrganizationAuthorizationService {
  return {
    isOfficeHead: jest.fn().mockResolvedValue(input.isOfficeHead ?? false),
    can: jest.fn().mockResolvedValue(input.canPublish ?? true),
    visibleOrgUnitIds: jest.fn().mockResolvedValue([ORG_UNIT_ID]),
  } as unknown as OrganizationAuthorizationService;
}

function createAnnouncement(
  creator = createAccount(MANAGER_ID, AccountRole.EMPLOYEE),
  status: AnnouncementStatus = AnnouncementStatus.PUBLISHED,
) {
  return {
    id: ANNOUNCEMENT_ID,
    createdByAccountId: creator.id,
    audienceType: AnnouncementAudienceType.ORG_UNIT,
    officeId: OFFICE_ID,
    orgUnitId: ORG_UNIT_ID,
    includeDescendants: false,
    officialConversationId: null,
    title: 'Planned maintenance',
    body: 'Maintenance starts at 10:00 PM.',
    priority: AnnouncementPriority.IMPORTANT,
    status,
    requiresAcknowledgement: false,
    allowAttachmentDownload: true,
    isPinned: false,
    currentRevision: 1,
    scheduledAt: null,
    publishedAt: status === AnnouncementStatus.PUBLISHED ? NOW : null,
    expiresAt: null,
    publishClaimedAt: status === AnnouncementStatus.PUBLISHING ? NOW : null,
    nextPublishAttemptAt: null,
    publishAttempts: 0,
    publishFailureReason: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: creator,
    office: {
      id: OFFICE_ID,
      code: 'PATAN',
      name: 'Patan Office',
      isActive: true,
    },
    orgUnit: {
      id: ORG_UNIT_ID,
      officeId: OFFICE_ID,
      parentOrgUnitId: null,
      code: 'TECH',
      name: 'Technical',
      isActive: true,
    },
    officialConversation: null,
    attachments: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        announcementId: ANNOUNCEMENT_ID,
        storageKey: `${ANNOUNCEMENT_ID}/attachment.pdf`,
        originalFileName: 'attachment.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
        contentCategory: 'DOCUMENT',
        scanStatus: 'PENDING',
        addedRevision: 1,
        removedRevision: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    recipients: [
      {
        accountId: RECIPIENT_ID,
        deliveredAt: NOW,
        firstReadAt: null,
        readRevision: null,
        acknowledgedRevision: null,
      },
    ],
    revisions: [
      {
        revisionNumber: 1,
        editor: creator,
        createdAt: NOW,
      },
    ],
    _count: { recipients: 1, acknowledgements: 0 },
  };
}

function authenticatedUser(
  accountId: string,
  role: AccountRole,
): AuthenticatedUser {
  return {
    accountId,
    sessionId: '66666666-6666-4666-8666-666666666666',
    username: role === AccountRole.SUPER_ADMIN ? 'super.admin' : 'team.manager',
    role,
  };
}

describe('AnnouncementsService', () => {
  it('exposes creator-owned edit and delete permissions to the Admin creator', async () => {
    const manager = createAccount(MANAGER_ID, AccountRole.EMPLOYEE);
    const announcement = createAnnouncement(manager);
    const prisma = {
      account: { findUnique: jest.fn().mockResolvedValue(manager) },
      announcement: { findUnique: jest.fn().mockResolvedValue(announcement) },
      ...organizationAuthorityMocks(manager.employee?.id ?? null),
    } as unknown as PrismaService;
    const service = new AnnouncementsService(
      prisma,
      {} as MessagingEventsService,
      authorizationStub(),
    );

    const response = await service.getById(
      authenticatedUser(MANAGER_ID, AccountRole.EMPLOYEE),
      ANNOUNCEMENT_ID,
    );

    expect(response.data.canManage).toBe(true);
    expect(response.data.canEdit).toBe(true);
    expect(response.data.canDelete).toBe(true);
    expect(response.data.reporting).toEqual({
      recipientCount: 1,
      acknowledgementHistoryCount: 0,
    });
  });

  it('allows the Office Head to permanently delete a management announcement', async () => {
    const owner = createAccount(OWNER_ID, AccountRole.EMPLOYEE);
    const creator = createAccount(MANAGER_ID, AccountRole.EMPLOYEE);
    const announcement = createAnnouncement(creator);
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const emitAnnouncementDeleted = jest.fn();
    const removeDirectory = jest.spyOn(fs, 'rm').mockResolvedValue(undefined);
    const prisma = {
      account: { findUnique: jest.fn().mockResolvedValue(owner) },
      announcement: {
        findUnique: jest.fn().mockResolvedValue(announcement),
        deleteMany,
      },
      ...organizationAuthorityMocks(owner.employee?.id ?? null),
    } as unknown as PrismaService;
    const events = {
      emitAnnouncementDeleted,
    } as unknown as MessagingEventsService;
    const service = new AnnouncementsService(
      prisma,
      events,
      authorizationStub({ isOfficeHead: true }),
    );

    try {
      const response = await service.deleteAnnouncement(
        authenticatedUser(OWNER_ID, AccountRole.EMPLOYEE),
        ANNOUNCEMENT_ID,
      );

      expect(response).toEqual({
        message: 'Announcement deleted permanently.',
      });
      expect(deleteMany).toHaveBeenCalledWith({
        where: {
          id: ANNOUNCEMENT_ID,
          status: { not: AnnouncementStatus.PUBLISHING },
        },
      });
      expect(removeDirectory).toHaveBeenCalledWith(
        expect.stringContaining(ANNOUNCEMENT_ID),
        {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        },
      );
      expect(emitAnnouncementDeleted).toHaveBeenCalledWith(
        expect.arrayContaining([RECIPIENT_ID, MANAGER_ID, OWNER_ID]),
        expect.objectContaining({
          announcementId: ANNOUNCEMENT_ID,
          action: 'DELETED',
          actorAccountId: OWNER_ID,
        }),
      );
    } finally {
      removeDirectory.mockRestore();
    }
  });

  it('denies Super Admin operational announcement deletion', async () => {
    const superAdmin = createAccount(OWNER_ID, AccountRole.SUPER_ADMIN);
    const creator = createAccount(MANAGER_ID, AccountRole.EMPLOYEE);
    const announcement = createAnnouncement(creator);
    const deleteMany = jest.fn();
    const prisma = {
      account: { findUnique: jest.fn().mockResolvedValue(superAdmin) },
      announcement: {
        findUnique: jest.fn().mockResolvedValue(announcement),
        deleteMany,
      },
    } as unknown as PrismaService;
    const service = new AnnouncementsService(
      prisma,
      {} as MessagingEventsService,
    );

    await expect(
      service.deleteAnnouncement(
        authenticatedUser(OWNER_ID, AccountRole.SUPER_ADMIN),
        ANNOUNCEMENT_ID,
      ),
    ).rejects.toThrow(
      'You cannot manage this announcement outside your authorized scope.',
    );
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('does not delete an announcement while publication is in progress', async () => {
    const manager = createAccount(MANAGER_ID, AccountRole.EMPLOYEE);
    const announcement = createAnnouncement(
      manager,
      AnnouncementStatus.PUBLISHING,
    );
    const deleteMany = jest.fn();
    const prisma = {
      account: { findUnique: jest.fn().mockResolvedValue(manager) },
      announcement: {
        findUnique: jest.fn().mockResolvedValue(announcement),
        deleteMany,
      },
      ...organizationAuthorityMocks(manager.employee?.id ?? null),
    } as unknown as PrismaService;
    const service = new AnnouncementsService(
      prisma,
      {} as MessagingEventsService,
      authorizationStub(),
    );

    await expect(
      service.deleteAnnouncement(
        authenticatedUser(MANAGER_ID, AccountRole.EMPLOYEE),
        ANNOUNCEMENT_ID,
      ),
    ).rejects.toThrow(
      'An announcement cannot be deleted while publication is in progress.',
    );
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('removes only attachment directories whose announcement no longer exists', async () => {
    const existingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const orphanId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const readDirectory = jest.spyOn(fs, 'readdir').mockResolvedValue([
      {
        name: existingId,
        isDirectory: () => true,
      },
      {
        name: orphanId,
        isDirectory: () => true,
      },
      {
        name: 'README.txt',
        isDirectory: () => false,
      },
    ] as never);
    const removeDirectory = jest.spyOn(fs, 'rm').mockResolvedValue(undefined);
    const prisma = {
      announcement: {
        findMany: jest.fn().mockResolvedValue([{ id: existingId }]),
      },
    } as unknown as PrismaService;
    const service = new AnnouncementsService(
      prisma,
      {} as MessagingEventsService,
    );

    try {
      await (
        service as unknown as {
          cleanupOrphanedAttachmentDirectories(): Promise<void>;
        }
      ).cleanupOrphanedAttachmentDirectories();

      expect(removeDirectory).toHaveBeenCalledTimes(1);
      expect(removeDirectory).toHaveBeenCalledWith(
        expect.stringContaining(orphanId),
        {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        },
      );
      expect(removeDirectory).not.toHaveBeenCalledWith(
        expect.stringContaining(existingId),
        expect.anything(),
      );
    } finally {
      readDirectory.mockRestore();
      removeDirectory.mockRestore();
    }
  });

  it('expires and purges announcement attachments while keeping metadata for the expired UI state', async () => {
    const unlink = jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'attachment-1' }])
      .mockResolvedValueOnce([
        { storageKey: `${ANNOUNCEMENT_ID}/attachment.pdf` },
      ]);
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const prisma = {
      announcementAttachment: {
        findMany,
        updateMany,
        count: jest.fn().mockResolvedValue(0),
      },
    } as unknown as PrismaService;
    const service = new AnnouncementsService(
      prisma,
      {} as MessagingEventsService,
    );

    try {
      const result = await service.cleanupExpiredAttachmentRetention(
        new Date('2026-08-15T00:00:00.000Z'),
      );

      expect(result).toEqual({
        expiredReferenceCount: 1,
        purgedObjectCount: 1,
        failedObjectCount: 0,
      });
      expect(unlink).toHaveBeenCalledTimes(1);
      expect(updateMany).toHaveBeenLastCalledWith({
        where: {
          storageKey: `${ANNOUNCEMENT_ID}/attachment.pdf`,
          purgedAt: null,
        },
        data: {
          purgedAt: new Date('2026-08-15T00:00:00.000Z'),
        },
      });
    } finally {
      unlink.mockRestore();
    }
  });
});
