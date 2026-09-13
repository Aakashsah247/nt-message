import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { assertAttachmentFileMatchesDeclaredType } from '../attachments/attachment-file-validation';
import { AttachmentSecurityService } from '../attachments/attachment-security.service';
import { AttachmentStorageService } from '../attachments/attachment-storage.service';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import {
  getAnnouncementAttachmentExpiresAt,
  isAttachmentReferenceExpired,
} from '../attachments/attachment-retention';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  ActivityEventType,
  AnnouncementAudienceType,
  AnnouncementPriority,
  AnnouncementStatus,
  ConversationParticipantRole,
  EmployeeStatus,
  EmploymentStatus,
  GroupKind,
  MessagingNotificationType,
  OfficialGroupMembershipMode,
  OfficialGroupScopeType,
  OrgMembershipType,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { MessagingEventsService } from '../realtime/messaging-events.service';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import { CAPABILITIES } from '../organization/organization-capabilities';
import type { UploadedMessageAttachmentFile } from '../conversations/types/uploaded-message-attachment-file';
import {
  canModifyAnnouncementByCreator,
  getAnnouncementAudiencePolicyViolation,
  type AnnouncementPolicyAudience,
  type AnnouncementPolicyViewer,
} from './announcement-access.policy';
import { buildAnnouncementVisibilityWhere } from './announcement-list-visibility';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import type { AnnouncementListFilter } from './dto/list-announcements-query.dto';
import { ListAnnouncementsQueryDto } from './dto/list-announcements-query.dto';
import { ListOfficialGroupAnnouncementsQueryDto } from './dto/list-official-group-announcements-query.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

const ANNOUNCEMENT_PUBLISH_INTERVAL_MS = 15 * 1000;
const ANNOUNCEMENT_PUBLISH_BATCH_SIZE = 20;
const ANNOUNCEMENT_MAX_PUBLISH_ATTEMPTS = 5;
const ANNOUNCEMENT_ORPHAN_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ANNOUNCEMENT_ORPHAN_CLEANUP_BATCH_SIZE = 500;
const ANNOUNCEMENT_RETENTION_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ANNOUNCEMENT_RETENTION_CLEANUP_BATCH_SIZE = 250;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm']);
const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
]);

type AnnouncementAttachmentCategory = 'IMAGE' | 'DOCUMENT' | 'VIDEO';

interface AnnouncementViewer extends AnnouncementPolicyViewer {
  username: string | null;
  employeeId: string | null;
  officeId: string | null;
  primaryOrgUnitId: string | null;
  displayName: string;
  isEnabled: boolean;
}

interface ResolvedAnnouncementAudience extends AnnouncementPolicyAudience {
  officeId: string;
  orgUnitId: string | null;
  includeDescendants: boolean;
  officialConversationId: string | null;
  officialMembershipMode?: OfficialGroupMembershipMode | null;
  label: string;
}

const announcementAccountSelect = {
  id: true,
  username: true,
  role: true,
  isEnabled: true,
  superAdminProfile: {
    select: {
      fullName: true,
    },
  },
  employee: {
    select: {
      id: true,
      empName: true,
      designation: true,
      status: true,
      employmentStatus: true,
      archivedAt: true,
      isActivated: true,
    },
  },
} satisfies Prisma.AccountSelect;

const announcementDetailInclude = {
  createdBy: {
    select: announcementAccountSelect,
  },
  office: {
    select: {
      id: true,
      code: true,
      name: true,
      isActive: true,
    },
  },
  orgUnit: {
    select: {
      id: true,
      officeId: true,
      parentOrgUnitId: true,
      code: true,
      name: true,
      isActive: true,
    },
  },
  officialConversation: {
    select: {
      id: true,
      title: true,
      groupKind: true,
      officialScopeType: true,
      officialOfficeId: true,
      officialOrgUnitId: true,
      officialMembershipMode: true,
    },
  },
  attachments: {
    orderBy: {
      createdAt: 'asc' as const,
    },
  },
  recipients: {
    select: {
      accountId: true,
      deliveredAt: true,
      firstReadAt: true,
      readRevision: true,
      acknowledgedRevision: true,
    },
  },
  revisions: {
    orderBy: {
      revisionNumber: 'desc' as const,
    },
    include: {
      editor: {
        select: announcementAccountSelect,
      },
    },
  },
  _count: {
    select: {
      recipients: true,
      acknowledgements: true,
    },
  },
} satisfies Prisma.AnnouncementInclude;

type AnnouncementDetailRecord = Prisma.AnnouncementGetPayload<{
  include: typeof announcementDetailInclude;
}>;

type AnnouncementAccountRecord = Prisma.AccountGetPayload<{
  select: typeof announcementAccountSelect;
}>;

@Injectable()
export class AnnouncementsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnnouncementsService.name);
  private publishTimer: ReturnType<typeof setInterval> | null = null;
  private orphanCleanupTimer: ReturnType<typeof setInterval> | null = null;
  private retentionCleanupTimer: ReturnType<typeof setInterval> | null = null;
  private workerRunning = false;
  private orphanCleanupRunning = false;
  private retentionCleanupRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingEventsService: MessagingEventsService,
    private readonly organizationAuthorization: OrganizationAuthorizationService =
      new OrganizationAuthorizationService(prisma),
    private readonly attachmentStorageService: AttachmentStorageService =
      new AttachmentStorageService(),
    private readonly attachmentSecurityService: AttachmentSecurityService =
      new AttachmentSecurityService(),
  ) {}

  onModuleInit(): void {
    void this.processLifecycleQueue();
    void this.cleanupOrphanedAttachmentDirectories();
    void this.cleanupExpiredAttachmentRetention();

    this.publishTimer = setInterval(() => {
      void this.processLifecycleQueue();
    }, ANNOUNCEMENT_PUBLISH_INTERVAL_MS);
    this.orphanCleanupTimer = setInterval(() => {
      void this.cleanupOrphanedAttachmentDirectories();
    }, ANNOUNCEMENT_ORPHAN_CLEANUP_INTERVAL_MS);
    this.retentionCleanupTimer = setInterval(() => {
      void this.cleanupExpiredAttachmentRetention();
    }, ANNOUNCEMENT_RETENTION_CLEANUP_INTERVAL_MS);

    this.publishTimer.unref?.();
    this.orphanCleanupTimer.unref?.();
    this.retentionCleanupTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.publishTimer) {
      clearInterval(this.publishTimer);
    }
    if (this.orphanCleanupTimer) {
      clearInterval(this.orphanCleanupTimer);
    }
    if (this.retentionCleanupTimer) {
      clearInterval(this.retentionCleanupTimer);
    }
  }

  async listAvailableAudiences(user: AuthenticatedUser) {
    const viewer = await this.getViewer(user.accountId);
    this.assertPublisherRole(viewer);
    const officeId = this.requireViewerOffice(viewer);
    const authorizationUser = this.toAuthorizationUser(viewer);
    const [canTargetOffice, manageableOrgUnitIds] = await Promise.all([
      this.organizationAuthorization.can(
        authorizationUser,
        CAPABILITIES.ANNOUNCEMENT_PUBLISH,
        officeId,
        null,
      ),
      this.organizationAuthorization.visibleOrgUnitIds(
        authorizationUser,
        CAPABILITIES.ANNOUNCEMENT_PUBLISH,
        officeId,
      ),
    ]);

    if (!canTargetOffice && manageableOrgUnitIds.length === 0) {
      throw new ForbiddenException(
        'You do not have announcement publishing authority in this Office.',
      );
    }

    const [office, orgUnits, officialGroups] = await Promise.all([
      this.prisma.office.findFirst({
        where: { id: officeId, isActive: true },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.orgUnit.findMany({
        where: {
          officeId,
          isActive: true,
          ...(canTargetOffice
            ? {}
            : { id: { in: manageableOrgUnitIds } }),
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          code: true,
          name: true,
          parentOrgUnitId: true,
          orgUnitType: { select: { name: true, isTeam: true } },
        },
      }),
      this.prisma.conversation.findMany({
        where: {
          type: 'GROUP',
          groupKind: GroupKind.OFFICIAL,
          officialOfficeId: officeId,
          participants: {
            some: {
              accountId: viewer.accountId,
              leftAt: null,
              role: {
                in: [
                  ConversationParticipantRole.OWNER,
                  ConversationParticipantRole.ADMIN,
                ],
              },
            },
          },
        },
        orderBy: { title: 'asc' },
        select: {
          id: true,
          title: true,
          officialScopeType: true,
          officialOfficeId: true,
          officialOrgUnitId: true,
          officialMembershipMode: true,
          _count: {
            select: {
              participants: {
                where: { leftAt: null },
              },
            },
          },
        },
      }),
    ]);

    if (!office) {
      throw new ConflictException('The active announcement Office was not found.');
    }

    const officialGroupAuthorization = await Promise.all(
      officialGroups.map((group) =>
        this.canPublishScope(
          viewer,
          officeId,
          group.officialOrgUnitId,
          group.officialMembershipMode ===
            OfficialGroupMembershipMode.ENTIRE_SUBTREE,
        ),
      ),
    );
    const authorizedOfficialGroups = officialGroups.filter(
      (_group, index) => officialGroupAuthorization[index],
    );

    return {
      data: {
        canTargetOrganization: canTargetOffice,
        canTargetOffice,
        office,
        orgUnits,
        officialGroups: authorizedOfficialGroups.map((group) => ({
          id: group.id,
          title: group.title ?? 'Official group',
          scopeType: group.officialScopeType,
          officeId: group.officialOfficeId,
          orgUnitId: group.officialOrgUnitId,
          membershipMode: group.officialMembershipMode,
          activeMemberCount: group._count.participants,
        })),
      },
    };
  }

  async createDraft(user: AuthenticatedUser, dto: CreateAnnouncementDto) {
    const viewer = await this.getViewer(user.accountId);
    this.assertPublisherRole(viewer);
    const audience = await this.resolveAndAuthorizeAudience(viewer, dto);
    const now = new Date();
    const title = dto.title?.trim() ?? '';
    const body = dto.body?.trim() ?? '';
    const scheduledAt = this.parseOptionalDate(dto.scheduledAt, 'scheduled time');
    const expiresAt = this.parseOptionalDate(dto.expiresAt, 'expiry time');
    const requiresAcknowledgement = dto.requiresAcknowledgement ?? false;
    const isPinned = requiresAcknowledgement || (dto.isPinned ?? false);

    this.validateLifecycleDates(scheduledAt, expiresAt, now, false);

    const announcement = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.announcement.create({
        data: {
          createdByAccountId: viewer.accountId,
          audienceType: audience.audienceType,
          officeId: audience.officeId,
          orgUnitId: audience.orgUnitId,
          includeDescendants: audience.includeDescendants,
          officialConversationId: audience.officialConversationId,
          title,
          body,
          priority: dto.priority ?? AnnouncementPriority.NORMAL,
          requiresAcknowledgement,
          allowAttachmentDownload: dto.allowAttachmentDownload ?? true,
          isPinned,
          scheduledAt,
          expiresAt,
          revisions: {
            create: {
              editorAccountId: viewer.accountId,
              revisionNumber: 1,
              title,
              body,
              priority: dto.priority ?? AnnouncementPriority.NORMAL,
              requiresAcknowledgement,
              allowAttachmentDownload:
                dto.allowAttachmentDownload ?? true,
              isPinned,
              expiresAt,
            },
          },
        },
        include: announcementDetailInclude,
      });

      // Audit metadata intentionally excludes title, body and attachment names.
      await transaction.activityEvent.create({
        data: {
          accountId: viewer.accountId,
          sessionId: user.sessionId,
          eventType: ActivityEventType.ANNOUNCEMENT_DRAFT_CREATED,
          pagePath: 'Announcements',
          elementLabel: 'Announcement draft created',
          metadata: this.safeAuditMetadata(created),
        },
      });

      return created;
    });

    return {
      message: 'Announcement draft created successfully.',
      data: this.serializeAnnouncement(announcement, viewer, true),
    };
  }

  async updateAnnouncement(
    user: AuthenticatedUser,
    announcementId: string,
    dto: UpdateAnnouncementDto,
  ) {
    const viewer = await this.getViewer(user.accountId);
    const existing = await this.getAnnouncement(announcementId);
    await this.assertCanModifyAnnouncement(viewer, existing);
    this.assertEditableStatus(existing.status);

    const title = dto.title === undefined ? existing.title : dto.title.trim();
    const body = dto.body === undefined ? existing.body : dto.body.trim();
    const priority = dto.priority ?? existing.priority;
    const requiresAcknowledgement =
      dto.requiresAcknowledgement ?? existing.requiresAcknowledgement;
    const allowAttachmentDownload =
      dto.allowAttachmentDownload ?? existing.allowAttachmentDownload;
    const isPinned = requiresAcknowledgement
      ? true
      : (dto.isPinned ?? existing.isPinned);
    const scheduledAt =
      dto.scheduledAt === undefined
        ? existing.scheduledAt
        : this.parseOptionalDate(dto.scheduledAt, 'scheduled time');
    const expiresAt =
      dto.expiresAt === undefined
        ? existing.expiresAt
        : this.parseOptionalDate(dto.expiresAt, 'expiry time');

    this.validateLifecycleDates(
      scheduledAt,
      expiresAt,
      new Date(),
      existing.status === AnnouncementStatus.PUBLISHED,
    );

    const isPublished = existing.status === AnnouncementStatus.PUBLISHED;

    if (isPublished && dto.scheduledAt !== undefined) {
      throw new ConflictException(
        'A published announcement cannot be rescheduled.',
      );
    }

    const nextRevision = isPublished
      ? existing.currentRevision + 1
      : existing.currentRevision;
    const nextStatus =
      existing.status === AnnouncementStatus.SCHEDULED && scheduledAt === null
        ? AnnouncementStatus.DRAFT
        : existing.status;

    if (isPublished && isPinned) {
      await this.assertPinCapacity({ ...existing, isPinned });
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      if (isPublished) {
        await transaction.announcementRevision.create({
          data: {
            announcementId,
            editorAccountId: viewer.accountId,
            revisionNumber: nextRevision,
            title,
            body,
            priority,
            requiresAcknowledgement,
            allowAttachmentDownload,
            isPinned,
            expiresAt,
          },
        });

        // A material revision must be read and acknowledged independently.
        await transaction.announcementRecipient.updateMany({
          where: { announcementId },
          data: {
            readRevision: null,
            acknowledgedRevision: null,
          },
        });
      } else {
        await transaction.announcementRevision.update({
          where: {
            announcementId_revisionNumber: {
              announcementId,
              revisionNumber: existing.currentRevision,
            },
          },
          data: {
            editorAccountId: viewer.accountId,
            title,
            body,
            priority,
            requiresAcknowledgement,
            allowAttachmentDownload,
            isPinned,
            expiresAt,
          },
        });
      }

      const record = await transaction.announcement.update({
        where: { id: announcementId },
        data: {
          title,
          body,
          priority,
          requiresAcknowledgement,
          allowAttachmentDownload,
          isPinned,
          scheduledAt,
          expiresAt,
          currentRevision: nextRevision,
          status: nextStatus,
          publishFailureReason: null,
          nextPublishAttemptAt:
            nextStatus === AnnouncementStatus.SCHEDULED ? scheduledAt : null,
        },
        include: announcementDetailInclude,
      });

      await transaction.activityEvent.create({
        data: {
          accountId: viewer.accountId,
          sessionId: user.sessionId,
          eventType: ActivityEventType.ANNOUNCEMENT_EDITED,
          pagePath: 'Announcements',
          elementLabel: 'Announcement edited',
          metadata: this.safeAuditMetadata(record),
        },
      });

      return record;
    });

    if (isPublished) {
      this.emitAnnouncementEvent(
        updated.recipients.map((recipient) => recipient.accountId),
        'UPDATED',
        updated,
        viewer.accountId,
      );
    }

    return {
      message: isPublished
        ? 'Published announcement revised successfully.'
        : 'Announcement draft updated successfully.',
      data: this.serializeAnnouncement(updated, viewer, true),
    };
  }

  async publish(user: AuthenticatedUser, announcementId: string) {
    const viewer = await this.getViewer(user.accountId);
    const existing = await this.getAnnouncement(announcementId);
    await this.assertCanModifyAnnouncement(viewer, existing);

    if (
      existing.status !== AnnouncementStatus.DRAFT &&
      existing.status !== AnnouncementStatus.SCHEDULED
    ) {
      throw new ConflictException(
        'Only a draft or scheduled announcement can be published.',
      );
    }

    this.validatePublishable(existing);
    const now = new Date();

    if (existing.scheduledAt && existing.scheduledAt.getTime() > now.getTime()) {
      const scheduled = await this.prisma.announcement.update({
        where: { id: announcementId },
        data: {
          status: AnnouncementStatus.SCHEDULED,
          nextPublishAttemptAt: existing.scheduledAt,
          publishFailureReason: null,
        },
        include: announcementDetailInclude,
      });

      return {
        message: 'Announcement scheduled successfully.',
        data: this.serializeAnnouncement(scheduled, viewer, true),
      };
    }

    await this.claimAnnouncementForPublishing(announcementId, [
      AnnouncementStatus.DRAFT,
      AnnouncementStatus.SCHEDULED,
    ]);

    try {
      const published = await this.finalizePublication(
        announcementId,
        viewer.accountId,
        user.sessionId,
      );

      return {
        message: 'Announcement published successfully.',
        data: this.serializeAnnouncement(published, viewer, true),
      };
    } catch (error) {
      await this.releaseFailedPublication(announcementId, error);
      throw error;
    }
  }

  async deleteAnnouncement(user: AuthenticatedUser, announcementId: string) {
    const viewer = await this.getViewer(user.accountId);
    const existing = await this.getAnnouncement(announcementId);
    await this.assertCanModifyAnnouncement(viewer, existing);

    if (existing.status === AnnouncementStatus.PUBLISHING) {
      throw new ConflictException(
        'An announcement cannot be deleted while publication is in progress.',
      );
    }

    const recipientAccountIds = existing.recipients.map(
      (recipient) => recipient.accountId,
    );
    const deleted = await this.prisma.announcement.deleteMany({
      where: {
        id: announcementId,
        status: { not: AnnouncementStatus.PUBLISHING },
      },
    });

    if (deleted.count === 0) {
      throw new ConflictException(
        'The announcement changed state before it could be deleted.',
      );
    }

    try {
      await this.deleteAnnouncementAttachmentDirectory(announcementId);
    } catch {
      /*
       * The database remains authoritative. Daily orphan cleanup retries a
       * failed filesystem removal without restoring deleted official content.
       */
      this.logger.warn(
        `Deleted announcement ${announcementId} attachment cleanup will be retried.`,
      );
    }

    this.emitAnnouncementDeleted(
      [...recipientAccountIds, existing.createdByAccountId, viewer.accountId],
      existing,
      viewer.accountId,
    );

    return { message: 'Announcement deleted permanently.' };
  }

  async list(user: AuthenticatedUser, query: ListAnnouncementsQueryDto) {
    const viewer = await this.getViewer(user.accountId);
    const where = await this.buildAnnouncementListWhere(viewer, query.filter);
    const searchText = query.search?.trim();

    if (query.officialConversationId) {
      // The announcement workspace selects one official group at a time.
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          audienceType: AnnouncementAudienceType.OFFICIAL_GROUP,
          officialConversationId: query.officialConversationId,
        },
      ];
    }

    if (searchText) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { title: { contains: searchText, mode: 'insensitive' } },
            { body: { contains: searchText, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const records = await this.prisma.announcement.findMany({
      where,
      orderBy: [
        { isPinned: 'desc' },
        { publishedAt: 'desc' },
        { updatedAt: 'desc' },
        { id: 'desc' },
      ],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        createdBy: { select: announcementAccountSelect },
        office: { select: { id: true, code: true, name: true } },
        orgUnit: {
          select: {
            id: true,
            officeId: true,
            parentOrgUnitId: true,
            code: true,
            name: true,
          },
        },
        officialConversation: { select: { id: true, title: true } },
        recipients: {
          where: { accountId: viewer.accountId },
          select: {
            accountId: true,
            deliveredAt: true,
            firstReadAt: true,
            readRevision: true,
            acknowledgedRevision: true,
          },
        },
        attachments: {
          select: {
            id: true,
            originalFileName: true,
            mimeType: true,
            fileSizeBytes: true,
            contentCategory: true,
            addedRevision: true,
            removedRevision: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { recipients: true } },
      },
    });

    const hasMore = records.length > query.limit;
    const page = hasMore ? records.slice(0, query.limit) : records;

    return {
      data: page.map((record) => {
        const recipient = record.recipients[0] ?? null;
        const attachments = record.attachments.filter((attachment) =>
          this.isAttachmentVisibleAtRevision(
            attachment,
            record.currentRevision,
          ),
        );

        return {
          id: record.id,
          title: record.title,
          bodyPreview: this.toPreview(record.body, 240),
          priority: record.priority,
          status: record.status,
          audience: this.serializeAudience(record),
          publisher: this.serializeAccount(record.createdBy),
          requiresAcknowledgement: record.requiresAcknowledgement,
          allowAttachmentDownload: record.allowAttachmentDownload,
          isPinned: record.isPinned,
          currentRevision: record.currentRevision,
          scheduledAt: record.scheduledAt,
          publishedAt: record.publishedAt,
          expiresAt: record.expiresAt,
          recipientCount: record._count.recipients,
          viewerState: this.serializeRecipientState(
            recipient,
            record.currentRevision,
          ),
          attachmentCount: attachments.length,
          attachmentCategories: [
            ...new Set(attachments.map((attachment) => attachment.contentCategory)),
          ],
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        };
      }),
      pagination: {
        nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
        hasMore,
      },
    };
  }

  async getById(user: AuthenticatedUser, announcementId: string) {
    const viewer = await this.getViewer(user.accountId);
    const announcement = await this.getAnnouncement(announcementId);
    const canManage = await this.assertCanViewAnnouncement(viewer, announcement);

    return {
      data: this.serializeAnnouncement(announcement, viewer, canManage),
    };
  }

  async markRead(user: AuthenticatedUser, announcementId: string) {
    const viewer = await this.getViewer(user.accountId);
    const announcement = await this.getAnnouncement(announcementId);
    await this.assertCanViewAnnouncement(viewer, announcement);

    if (
      announcement.status === AnnouncementStatus.DRAFT ||
      announcement.status === AnnouncementStatus.SCHEDULED ||
      announcement.status === AnnouncementStatus.PUBLISHING
    ) {
      throw new ConflictException('This announcement is not published yet.');
    }

    const viewerRecipient = announcement.recipients.find(
      (recipient) => recipient.accountId === viewer.accountId,
    );

    if (!viewerRecipient) {
      throw new NotFoundException('Announcement was not found.');
    }

    const now = new Date();
    const recipient = await this.prisma.announcementRecipient.updateMany({
      where: {
        announcementId,
        accountId: viewer.accountId,
        OR: [
          { readRevision: null },
          { readRevision: { lt: announcement.currentRevision } },
        ],
      },
      data: {
        firstReadAt: viewerRecipient.firstReadAt ?? now,
        readRevision: announcement.currentRevision,
      },
    });

    if (recipient.count > 0) {
      this.messagingEventsService.emitAnnouncementRead(
        [viewer.accountId, announcement.createdByAccountId],
        this.eventPayload('READ', announcement, viewer.accountId),
      );
    }

    return {
      message:
        recipient.count > 0
          ? 'Announcement marked as read.'
          : 'Announcement was already read.',
      data: {
        announcementId,
        readRevision: announcement.currentRevision,
        readAt: viewerRecipient.firstReadAt ?? now,
      },
    };
  }

  async acknowledge(user: AuthenticatedUser, announcementId: string) {
    const viewer = await this.getViewer(user.accountId);
    const announcement = await this.getAnnouncement(announcementId);
    await this.assertCanViewAnnouncement(viewer, announcement);

    if (announcement.status !== AnnouncementStatus.PUBLISHED) {
      throw new ConflictException(
        'Only an active published announcement can be acknowledged.',
      );
    }

    if (
      announcement.expiresAt &&
      announcement.expiresAt.getTime() <= Date.now()
    ) {
      throw new ConflictException(
        'Acknowledgement is closed because this announcement has expired.',
      );
    }

    if (!announcement.requiresAcknowledgement) {
      throw new BadRequestException(
        'This announcement does not require acknowledgement.',
      );
    }

    const viewerRecipient = announcement.recipients.find(
      (recipient) => recipient.accountId === viewer.accountId,
    );

    if (!viewerRecipient) {
      throw new NotFoundException('Announcement was not found.');
    }

    const acknowledgedAt = new Date();
    const result = await this.prisma.$transaction(async (transaction) => {
      const recipient = await transaction.announcementRecipient.findUnique({
        where: {
          announcementId_accountId: {
            announcementId,
            accountId: viewer.accountId,
          },
        },
      });

      if (!recipient) {
        throw new NotFoundException('Announcement was not found.');
      }

      const inserted = await transaction.announcementAcknowledgement.createMany({
        data: [
          {
            announcementId,
            accountId: viewer.accountId,
            revisionNumber: announcement.currentRevision,
            acknowledgedAt,
          },
        ],
        skipDuplicates: true,
      });

      const acknowledgement =
        await transaction.announcementAcknowledgement.findUniqueOrThrow({
          where: {
            announcementId_accountId_revisionNumber: {
              announcementId,
              accountId: viewer.accountId,
              revisionNumber: announcement.currentRevision,
            },
          },
        });

      await transaction.announcementRecipient.update({
        where: {
          announcementId_accountId: {
            announcementId,
            accountId: viewer.accountId,
          },
        },
        data: {
          firstReadAt: recipient.firstReadAt ?? acknowledgedAt,
          readRevision: announcement.currentRevision,
          acknowledgedRevision: announcement.currentRevision,
        },
      });

      if (inserted.count > 0) {
        await transaction.activityEvent.create({
          data: {
            accountId: viewer.accountId,
            sessionId: user.sessionId,
            eventType: ActivityEventType.ANNOUNCEMENT_ACKNOWLEDGED,
            pagePath: 'Announcements',
            elementLabel: 'Announcement acknowledged',
            metadata: this.safeAuditMetadata(announcement),
          },
        });
      }

      return {
        acknowledgement,
        created: inserted.count > 0,
      };
    });

    if (result.created) {
      this.messagingEventsService.emitAnnouncementAcknowledged(
        [viewer.accountId, announcement.createdByAccountId],
        this.eventPayload('ACKNOWLEDGED', announcement, viewer.accountId),
      );
    }

    return {
      message: result.created
        ? 'Announcement acknowledged successfully.'
        : 'Announcement was already acknowledged.',
      data: {
        announcementId,
        revisionNumber: result.acknowledgement.revisionNumber,
        acknowledgedAt: result.acknowledgement.acknowledgedAt,
      },
    };
  }

  async getReport(user: AuthenticatedUser, announcementId: string) {
    const viewer = await this.getViewer(user.accountId);
    const announcement = await this.getAnnouncement(announcementId);
    await this.assertCanManageAnnouncement(viewer, announcement);

    const [readCount, acknowledgedCount] = await Promise.all([
      this.prisma.announcementRecipient.count({
        where: {
          announcementId,
          readRevision: announcement.currentRevision,
        },
      }),
      this.prisma.announcementRecipient.count({
        where: {
          announcementId,
          acknowledgedRevision: announcement.currentRevision,
        },
      }),
    ]);

    return {
      data: {
        announcementId,
        revisionNumber: announcement.currentRevision,
        recipients: announcement._count.recipients,
        delivered: announcement.recipients.filter(
          (recipient) => recipient.deliveredAt !== null,
        ).length,
        read: readCount,
        acknowledged: acknowledgedCount,
        pendingAcknowledgement: announcement.requiresAcknowledgement
          ? Math.max(0, announcement._count.recipients - acknowledgedCount)
          : 0,
      },
    };
  }

  async listOfficialGroupReferences(
    user: AuthenticatedUser,
    conversationId: string,
    query: ListOfficialGroupAnnouncementsQueryDto,
  ) {
    const viewer = await this.getViewer(user.accountId);
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: {
        conversationId,
        accountId: viewer.accountId,
        leftAt: null,
        conversation: {
          type: 'GROUP',
          groupKind: GroupKind.OFFICIAL,
        },
      },
      select: {
        joinedAt: true,
        historyClearedAt: true,
      },
    });

    if (!participant) {
      throw new NotFoundException('Official group was not found.');
    }

    const visibilityBoundary = participant.historyClearedAt ?? participant.joinedAt;
    const records = await this.prisma.announcement.findMany({
      where: {
        officialConversationId: conversationId,
        status: AnnouncementStatus.PUBLISHED,
        publishedAt: { gt: visibilityBoundary },
        recipients: { some: { accountId: viewer.accountId } },
      },
      orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        createdBy: { select: announcementAccountSelect },
        recipients: {
          where: { accountId: viewer.accountId },
          select: {
            accountId: true,
            deliveredAt: true,
            firstReadAt: true,
            readRevision: true,
            acknowledgedRevision: true,
          },
        },
        _count: { select: { attachments: true } },
      },
    });

    const hasMore = records.length > query.limit;
    const page = hasMore ? records.slice(0, query.limit) : records;

    return {
      data: page.map((record) => ({
        id: record.id,
        title: record.title,
        bodyPreview: this.toPreview(record.body, 180),
        priority: record.priority,
        isPinned: record.isPinned,
        requiresAcknowledgement: record.requiresAcknowledgement,
        publisher: this.serializeAccount(record.createdBy),
        publishedAt: record.publishedAt,
        expiresAt: record.expiresAt,
        attachmentCount: record._count.attachments,
        viewerState: this.serializeRecipientState(
          record.recipients[0] ?? null,
          record.currentRevision,
        ),
      })),
      pagination: {
        nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
        hasMore,
      },
    };
  }

  async uploadAttachment(
    user: AuthenticatedUser,
    announcementId: string,
    file?: UploadedMessageAttachmentFile,
  ) {
    const viewer = await this.getViewer(user.accountId);
    const existing = await this.getAnnouncement(announcementId);
    await this.assertCanModifyAnnouncement(viewer, existing);
    this.assertEditableStatus(existing.status);
    const validated = this.validateAttachment(file);
    const uploadedFile = file as UploadedMessageAttachmentFile;
    const scanStatus =
      await this.attachmentSecurityService.scanValidatedUpload(uploadedFile);
    const attachmentId = randomUUID();
    const storageKey = `${announcementId}/${attachmentId}`;
    const attachmentReferenceAt = new Date();
    let targetRevision = existing.currentRevision;

    await this.writeAttachmentFile(storageKey, uploadedFile);

    try {
      const updated = await this.prisma.$transaction(async (transaction) => {
        if (existing.status === AnnouncementStatus.PUBLISHED) {
          targetRevision += 1;
          await this.createRevisionSnapshot(
            transaction,
            existing,
            viewer.accountId,
            targetRevision,
          );
          await transaction.announcement.update({
            where: { id: announcementId },
            data: { currentRevision: targetRevision },
          });
          await transaction.announcementRecipient.updateMany({
            where: { announcementId },
            data: {
              readRevision: null,
              acknowledgedRevision: null,
            },
          });
        }

        await transaction.announcementAttachment.create({
          data: {
            id: attachmentId,
            announcementId,
            storageKey,
            originalFileName: validated.originalFileName,
            mimeType: uploadedFile.mimetype,
            fileSizeBytes: uploadedFile.size,
            contentCategory: validated.category,
            scanStatus,
            addedRevision: targetRevision,
            // Draft files begin retention at publication. An attachment added
            // to an already-published announcement starts a fresh 90-day
            // (configurable) logical reference window from this edit.
            expiresAt:
              existing.status === AnnouncementStatus.PUBLISHED
                ? getAnnouncementAttachmentExpiresAt(attachmentReferenceAt)
                : null,
          },
        });

        const record = await transaction.announcement.findUniqueOrThrow({
          where: { id: announcementId },
          include: announcementDetailInclude,
        });

        // Attachment audit metadata excludes file names, storage keys and content.
        await transaction.activityEvent.create({
          data: {
            accountId: viewer.accountId,
            sessionId: user.sessionId,
            eventType: ActivityEventType.ANNOUNCEMENT_EDITED,
            pagePath: 'Announcements',
            elementLabel: 'Announcement attachment added',
            metadata: {
              ...this.safeAuditMetadata(record),
              attachmentAction: 'ADDED',
              attachmentCategory: validated.category,
            },
          },
        });

        return record;
      });

      if (existing.status === AnnouncementStatus.PUBLISHED) {
        this.emitAnnouncementEvent(
          updated.recipients.map((recipient) => recipient.accountId),
          'UPDATED',
          updated,
          viewer.accountId,
        );
      }

      const attachment = updated.attachments.find(
        (item) => item.id === attachmentId,
      );

      return {
        message: 'Announcement attachment uploaded successfully.',
        data: attachment ? this.serializeAttachment(attachment) : null,
      };
    } catch (error) {
      await this.deleteAttachmentFile(storageKey);
      throw error;
    }
  }

  async removeAttachment(
    user: AuthenticatedUser,
    announcementId: string,
    attachmentId: string,
  ) {
    const viewer = await this.getViewer(user.accountId);
    const existing = await this.getAnnouncement(announcementId);
    await this.assertCanModifyAnnouncement(viewer, existing);
    this.assertEditableStatus(existing.status);
    const attachment = existing.attachments.find(
      (item) =>
        item.id === attachmentId &&
        this.isAttachmentVisibleAtRevision(item, existing.currentRevision),
    );

    if (!attachment) {
      throw new NotFoundException('Announcement attachment was not found.');
    }

    if (existing.status === AnnouncementStatus.PUBLISHED) {
      const nextRevision = existing.currentRevision + 1;
      const updated = await this.prisma.$transaction(async (transaction) => {
        await this.createRevisionSnapshot(
          transaction,
          existing,
          viewer.accountId,
          nextRevision,
        );
        await transaction.announcementAttachment.update({
          where: { id: attachmentId },
          data: { removedRevision: nextRevision },
        });
        await transaction.announcementRecipient.updateMany({
          where: { announcementId },
          data: {
            readRevision: null,
            acknowledgedRevision: null,
          },
        });
        const record = await transaction.announcement.update({
          where: { id: announcementId },
          data: { currentRevision: nextRevision },
          include: announcementDetailInclude,
        });

        await transaction.activityEvent.create({
          data: {
            accountId: viewer.accountId,
            sessionId: user.sessionId,
            eventType: ActivityEventType.ANNOUNCEMENT_EDITED,
            pagePath: 'Announcements',
            elementLabel: 'Announcement attachment removed',
            metadata: {
              ...this.safeAuditMetadata(record),
              attachmentAction: 'REMOVED',
              attachmentCategory: attachment.contentCategory,
            },
          },
        });

        return record;
      });

      /*
       * Published files are retained for historical revisions. M18 may reclaim
       * them only after no authorized governance reference remains.
       */
      this.emitAnnouncementEvent(
        updated.recipients.map((recipient) => recipient.accountId),
        'UPDATED',
        updated,
        viewer.accountId,
      );
    } else {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.announcementAttachment.delete({
          where: { id: attachmentId },
        });
        await transaction.activityEvent.create({
          data: {
            accountId: viewer.accountId,
            sessionId: user.sessionId,
            eventType: ActivityEventType.ANNOUNCEMENT_EDITED,
            pagePath: 'Announcements',
            elementLabel: 'Announcement attachment removed',
            metadata: {
              ...this.safeAuditMetadata(existing),
              attachmentAction: 'REMOVED',
              attachmentCategory: attachment.contentCategory,
            },
          },
        });
      });
      await this.deleteAttachmentFile(attachment.storageKey);
    }

    return { message: 'Announcement attachment removed successfully.' };
  }

  async getAttachmentDownload(
    user: AuthenticatedUser,
    announcementId: string,
    attachmentId: string,
    disposition: 'inline' | 'download',
  ) {
    const viewer = await this.getViewer(user.accountId);
    const announcement = await this.getAnnouncement(announcementId);
    await this.assertCanViewAnnouncement(viewer, announcement);
    const canManage = await this.canManageAnnouncement(viewer, announcement);

    if (
      disposition === 'download' &&
      !announcement.allowAttachmentDownload &&
      !canManage
    ) {
      throw new ForbiddenException(
        'The publisher disabled downloads for this announcement.',
      );
    }


    const attachment = announcement.attachments.find(
      (item) =>
        item.id === attachmentId &&
        this.isAttachmentVisibleAtRevision(
          item,
          announcement.currentRevision,
        ),
    );

    if (!attachment) {
      throw new NotFoundException('Announcement attachment was not found.');
    }

    if (
      isAttachmentReferenceExpired(
        attachment.expiresAt,
        attachment.expiredAt,
      )
    ) {
      throw new NotFoundException(
        'This announcement attachment has expired and is no longer available.',
      );
    }

    if (
      !this.attachmentSecurityService.canAccessStoredAttachment(
        attachment.scanStatus,
      )
    ) {
      throw new ForbiddenException(
        'This attachment has not passed the required security checks.',
      );
    }

    const absolutePath = this.attachmentStorageService.resolvePath(
      'announcements',
      attachment.storageKey,
    );

    if (
      !(await this.attachmentStorageService.exists(
        'announcements',
        attachment.storageKey,
      ))
    ) {
      throw new NotFoundException('Announcement attachment file was not found.');
    }

    return {
      absolutePath,
      mimeType: attachment.mimeType,
      originalFileName: attachment.originalFileName,
      fileSizeBytes: attachment.fileSizeBytes,
      disposition,
    };
  }

  private async processLifecycleQueue(): Promise<void> {
    if (this.workerRunning) {
      return;
    }

    this.workerRunning = true;

    try {
      await this.expirePublishedAnnouncements();
      const now = new Date();

      // A crashed API instance must not leave an announcement locked forever.
      await this.prisma.announcement.updateMany({
        where: {
          status: AnnouncementStatus.PUBLISHING,
          publishClaimedAt: {
            lt: new Date(now.getTime() - 5 * 60 * 1000),
          },
        },
        data: {
          status: AnnouncementStatus.SCHEDULED,
          scheduledAt: now,
          publishClaimedAt: null,
          nextPublishAttemptAt: now,
          publishFailureReason: 'Recovered an interrupted publication claim.',
        },
      });
      const due = await this.prisma.announcement.findMany({
        where: {
          status: AnnouncementStatus.SCHEDULED,
          scheduledAt: { lte: now },
          OR: [
            { nextPublishAttemptAt: null },
            { nextPublishAttemptAt: { lte: now } },
          ],
        },
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        take: ANNOUNCEMENT_PUBLISH_BATCH_SIZE,
        select: { id: true, createdByAccountId: true },
      });

      for (const item of due) {
        try {
          await this.claimAnnouncementForPublishing(item.id, [
            AnnouncementStatus.SCHEDULED,
          ]);
          await this.finalizePublication(item.id, item.createdByAccountId, null);
        } catch (error) {
          await this.releaseFailedPublication(item.id, error);
          this.logger.warn(
            `Scheduled announcement ${item.id} was not published: ${this.errorMessage(error)}`,
          );
        }
      }
    } finally {
      this.workerRunning = false;
    }
  }

  private async expirePublishedAnnouncements(): Promise<void> {
    const now = new Date();
    const expiring = await this.prisma.announcement.findMany({
      where: {
        status: AnnouncementStatus.PUBLISHED,
        expiresAt: { lte: now },
      },
      select: { id: true },
      take: ANNOUNCEMENT_PUBLISH_BATCH_SIZE,
    });

    for (const item of expiring) {
      const updated = await this.prisma.announcement.updateMany({
        where: {
          id: item.id,
          status: AnnouncementStatus.PUBLISHED,
          expiresAt: { lte: now },
        },
        data: {
          status: AnnouncementStatus.EXPIRED,
          isPinned: false,
        },
      });

      if (updated.count === 0) {
        continue;
      }

      const record = await this.getAnnouncement(item.id);
      this.emitAnnouncementEvent(
        record.recipients.map((recipient) => recipient.accountId),
        'UPDATED',
        record,
        record.createdByAccountId,
      );
    }
  }

  async cleanupExpiredAttachmentRetention(
    now = new Date(),
  ): Promise<{
    expiredReferenceCount: number;
    purgedObjectCount: number;
    failedObjectCount: number;
  }> {
    if (this.retentionCleanupRunning) {
      return {
        expiredReferenceCount: 0,
        purgedObjectCount: 0,
        failedObjectCount: 0,
      };
    }

    this.retentionCleanupRunning = true;

    try {
      const dueReferences = await this.prisma.announcementAttachment.findMany({
        where: {
          expiredAt: null,
          expiresAt: { lte: now },
        },
        orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
        take: ANNOUNCEMENT_RETENTION_CLEANUP_BATCH_SIZE * 4,
        select: {
          id: true,
        },
      });

      let expiredReferenceCount = 0;

      if (dueReferences.length > 0) {
        const updated = await this.prisma.announcementAttachment.updateMany({
          where: {
            id: { in: dueReferences.map((attachment) => attachment.id) },
            expiredAt: null,
            expiresAt: { lte: now },
          },
          data: {
            expiredAt: now,
          },
        });
        expiredReferenceCount = updated.count;
      }

      /*
       * purgedAt is the retry marker for physical storage. The logical
       * attachment remains visible as expired even when a disk deletion fails.
       */
      const purgeRows = await this.prisma.announcementAttachment.findMany({
        where: {
          purgedAt: null,
          expiresAt: { lte: now },
        },
        orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
        take: ANNOUNCEMENT_RETENTION_CLEANUP_BATCH_SIZE * 4,
        select: {
          storageKey: true,
        },
      });
      const purgeStorageKeys = [
        ...new Set(purgeRows.map((attachment) => attachment.storageKey)),
      ].slice(0, ANNOUNCEMENT_RETENTION_CLEANUP_BATCH_SIZE);

      let purgedObjectCount = 0;
      let failedObjectCount = 0;

      for (const storageKey of purgeStorageKeys) {
        const activeReferenceCount =
          await this.prisma.announcementAttachment.count({
            where: {
              storageKey: storageKey,
              expiredAt: null,
              expiresAt: { gt: now },
            },
          });

        if (activeReferenceCount > 0) {
          continue;
        }

        const removed = await this.deleteAttachmentFileWithResult(
          storageKey,
        );

        if (!removed) {
          failedObjectCount += 1;
          continue;
        }

        await this.prisma.announcementAttachment.updateMany({
          where: {
            storageKey: storageKey,
            purgedAt: null,
          },
          data: {
            purgedAt: now,
          },
        });
        purgedObjectCount += 1;
      }

      if (expiredReferenceCount > 0 || purgedObjectCount > 0) {
        this.logger.log(
          `Announcement attachment retention expired ${expiredReferenceCount} reference(s) and purged ${purgedObjectCount} physical object(s).`,
        );
      }

      return {
        expiredReferenceCount,
        purgedObjectCount,
        failedObjectCount,
      };
    } finally {
      this.retentionCleanupRunning = false;
    }
  }

  private async cleanupOrphanedAttachmentDirectories(): Promise<void> {
    if (this.orphanCleanupRunning) {
      return;
    }

    this.orphanCleanupRunning = true;

    try {
      const directoryIds = (
        await this.attachmentStorageService.listDirectories('announcements')
      ).filter((name) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          name,
        ),
      );

      const existingIds = new Set<string>();
      for (
        let index = 0;
        index < directoryIds.length;
        index += ANNOUNCEMENT_ORPHAN_CLEANUP_BATCH_SIZE
      ) {
        const batch = directoryIds.slice(
          index,
          index + ANNOUNCEMENT_ORPHAN_CLEANUP_BATCH_SIZE,
        );
        const records = await this.prisma.announcement.findMany({
          where: { id: { in: batch } },
          select: { id: true },
        });
        records.forEach((record) => existingIds.add(record.id));
      }

      let deletedCount = 0;
      for (const announcementId of directoryIds) {
        if (existingIds.has(announcementId)) {
          continue;
        }

        await this.deleteAnnouncementAttachmentDirectory(announcementId);
        deletedCount += 1;
      }

      if (deletedCount > 0) {
        this.logger.log(
          `Announcement storage cleanup removed ${deletedCount} orphaned director${
            deletedCount === 1 ? 'y' : 'ies'
          }.`,
        );
      }
    } catch {
      this.logger.warn(
        'Announcement orphaned attachment cleanup could not complete and will be retried.',
      );
    } finally {
      this.orphanCleanupRunning = false;
    }
  }

  private async claimAnnouncementForPublishing(
    announcementId: string,
    statuses: AnnouncementStatus[],
  ): Promise<void> {
    const claimed = await this.prisma.announcement.updateMany({
      where: {
        id: announcementId,
        status: { in: statuses },
      },
      data: {
        status: AnnouncementStatus.PUBLISHING,
        publishClaimedAt: new Date(),
        publishFailureReason: null,
      },
    });

    if (claimed.count !== 1) {
      throw new ConflictException(
        'Announcement publication is already being processed.',
      );
    }
  }

  private async finalizePublication(
    announcementId: string,
    actorAccountId: string,
    sessionId: string | null,
  ): Promise<AnnouncementDetailRecord> {
    const announcement = await this.getAnnouncement(announcementId);

    if (announcement.status !== AnnouncementStatus.PUBLISHING) {
      throw new ConflictException('Announcement is not ready for publication.');
    }

    this.validatePublishable(announcement);
    await this.assertPinCapacity(announcement);
    const publisher = await this.getViewer(announcement.createdByAccountId);
    if (publisher.role === AccountRole.SUPER_ADMIN && sessionId === null) {
      // P12-F compatibility: Super Admin cannot create, edit or manually publish
      // announcements anymore. A record already scheduled before the cutover may
      // still complete through the system worker after P12-A bound it to V3 scope.
      if (!announcement.officeId) {
        throw new ConflictException(
          'Historical scheduled announcement is missing its V3 Office binding.',
        );
      }
    } else {
      await this.assertCanManageAnnouncement(publisher, announcement);
    }
    const recipientAccountIds = await this.resolveRecipientAccountIds(
      announcement,
    );

    if (recipientAccountIds.length === 0) {
      throw new ConflictException(
        'The selected audience has no active eligible recipients.',
      );
    }

    const publishedAt = new Date();
    const bodyPreview = this.toPreview(announcement.body, 420);

    const published = await this.prisma.$transaction(async (transaction) => {
      /*
       * The recipient snapshot, notifications and state transition share one
       * transaction. Repeated workers cannot create a partial publication.
       */
      await transaction.announcementRecipient.createMany({
        data: recipientAccountIds.map((accountId) => ({
          announcementId,
          accountId,
          deliveredAt: publishedAt,
        })),
        skipDuplicates: true,
      });

      await transaction.messagingNotification.createMany({
        data: recipientAccountIds
          .filter((accountId) => accountId !== actorAccountId)
          .map((accountId) => ({
            recipientAccountId: accountId,
            actorAccountId,
            conversationId: announcement.officialConversationId,
            announcementId,
            type: MessagingNotificationType.ANNOUNCEMENT,
            title: announcement.title,
            body: bodyPreview,
            metadata: {
              priority: announcement.priority,
              requiresAcknowledgement:
                announcement.requiresAcknowledgement,
              revisionNumber: announcement.currentRevision,
              audienceType: announcement.audienceType,
            },
          })),
      });

      // Draft attachment retention begins only when recipients can actually
      // receive the announcement, not while the publisher is still editing it.
      await transaction.announcementAttachment.updateMany({
        where: {
          announcementId,
          expiresAt: null,
          removedRevision: null,
        },
        data: {
          expiresAt: getAnnouncementAttachmentExpiresAt(publishedAt),
        },
      });

      const record = await transaction.announcement.update({
        where: { id: announcementId },
        data: {
          status: AnnouncementStatus.PUBLISHED,
          publishedAt,
          publishClaimedAt: null,
          nextPublishAttemptAt: null,
          publishAttempts: { increment: 1 },
          publishFailureReason: null,
        },
        include: announcementDetailInclude,
      });

      await transaction.activityEvent.create({
        data: {
          accountId: actorAccountId,
          sessionId,
          eventType: ActivityEventType.ANNOUNCEMENT_PUBLISHED,
          pagePath: 'Announcements',
          elementLabel: 'Announcement published',
          metadata: {
            ...this.safeAuditMetadata(record),
            recipientCount: recipientAccountIds.length,
          },
        },
      });

      return record;
    });

    this.messagingEventsService.emitAnnouncementPublished(
      [...recipientAccountIds, actorAccountId],
      this.eventPayload('PUBLISHED', published, actorAccountId),
    );

    return published;
  }

  private async releaseFailedPublication(
    announcementId: string,
    error: unknown,
  ): Promise<void> {
    const current = await this.prisma.announcement.findUnique({
      where: { id: announcementId },
      select: { status: true, publishAttempts: true },
    });

    if (!current || current.status !== AnnouncementStatus.PUBLISHING) {
      return;
    }

    const nextAttempts = current.publishAttempts + 1;
    const backoffMinutes = Math.min(60, 2 ** Math.min(nextAttempts, 6));
    const nextPublishAttemptAt = new Date(
      Date.now() + backoffMinutes * 60 * 1000,
    );

    await this.prisma.announcement.updateMany({
      where: {
        id: announcementId,
        status: AnnouncementStatus.PUBLISHING,
      },
      data: {
        status: AnnouncementStatus.SCHEDULED,
        scheduledAt: new Date(),
        publishClaimedAt: null,
        publishAttempts: nextAttempts,
        publishFailureReason: this.toPreview(this.errorMessage(error), 500),
        nextPublishAttemptAt:
          nextAttempts >= ANNOUNCEMENT_MAX_PUBLISH_ATTEMPTS
            ? new Date(Date.now() + 24 * 60 * 60 * 1000)
            : nextPublishAttemptAt,
      },
    });
  }

  private async resolveAndAuthorizeAudience(
    viewer: AnnouncementViewer,
    input: {
      audienceType: AnnouncementAudienceType;
      officeId?: string;
      orgUnitId?: string;
      includeDescendants?: boolean;
      officialConversationId?: string;
    },
  ): Promise<ResolvedAnnouncementAudience> {
    const audience = await this.resolveAudience(input, viewer);
    const violation = getAnnouncementAudiencePolicyViolation(viewer, audience);

    if (violation) {
      throw new ForbiddenException(
        'You cannot publish announcements outside your assigned organizational scope.',
      );
    }

    if (
      !(await this.canPublishScope(
        viewer,
        audience.officeId,
        audience.orgUnitId,
        audience.audienceType === AnnouncementAudienceType.OFFICIAL_GROUP
          ? audience.officialMembershipMode ===
            OfficialGroupMembershipMode.ENTIRE_SUBTREE
          : audience.includeDescendants,
      ))
    ) {
      throw new ForbiddenException(
        'You cannot publish announcements outside your assigned organizational scope.',
      );
    }

    return audience;
  }

  private async resolveAudience(
    input: {
      audienceType: AnnouncementAudienceType;
      officeId?: string;
      orgUnitId?: string;
      includeDescendants?: boolean;
      officialConversationId?: string;
    },
    viewer: AnnouncementViewer,
  ): Promise<ResolvedAnnouncementAudience> {
    if (input.audienceType === AnnouncementAudienceType.OFFICE) {
      if (
        !input.officeId ||
        input.orgUnitId ||
        input.officialConversationId ||
        input.includeDescendants
      ) {
        throw new BadRequestException(
          'An Office announcement requires exactly one Office.',
        );
      }

      const office = await this.prisma.office.findFirst({
        where: { id: input.officeId, isActive: true },
        select: { id: true, name: true },
      });
      if (!office) {
        throw new NotFoundException('Active announcement Office was not found.');
      }

      return {
        audienceType: input.audienceType,
        officeId: office.id,
        orgUnitId: null,
        includeDescendants: false,
        officialConversationId: null,
        label: office.name,
      };
    }

    if (input.audienceType === AnnouncementAudienceType.ORG_UNIT) {
      if (
        !input.officeId ||
        !input.orgUnitId ||
        input.officialConversationId
      ) {
        throw new BadRequestException(
          'An OrgUnit announcement requires exactly one Office and OrgUnit.',
        );
      }

      const orgUnit = await this.prisma.orgUnit.findFirst({
        where: {
          id: input.orgUnitId,
          officeId: input.officeId,
          isActive: true,
          office: { is: { isActive: true } },
        },
        select: {
          id: true,
          officeId: true,
          name: true,
        },
      });
      if (!orgUnit) {
        throw new NotFoundException('Active announcement OrgUnit was not found.');
      }

      return {
        audienceType: input.audienceType,
        officeId: orgUnit.officeId,
        orgUnitId: orgUnit.id,
        includeDescendants: input.includeDescendants ?? false,
        officialConversationId: null,
        label: orgUnit.name,
      };
    }

    if (
      !input.officialConversationId ||
      input.officeId ||
      input.orgUnitId ||
      input.includeDescendants
    ) {
      throw new BadRequestException(
        'An official-group announcement requires exactly one official group.',
      );
    }

    const group = await this.prisma.conversation.findFirst({
      where: {
        id: input.officialConversationId,
        type: 'GROUP',
        groupKind: GroupKind.OFFICIAL,
        officialScopeType: { not: null },
      },
      select: {
        id: true,
        title: true,
        officialScopeType: true,
        officialOfficeId: true,
        officialOrgUnitId: true,
        officialMembershipMode: true,
        participants: {
          where: { accountId: viewer.accountId, leftAt: null },
          select: { role: true },
          take: 1,
        },
      },
    });

    if (!group || !group.officialScopeType) {
      throw new NotFoundException('Official announcement group was not found.');
    }
    if (!group.officialOfficeId) {
      throw new ConflictException(
        'The official group is not bound to the V3 Office hierarchy.',
      );
    }

    if (group.officialOrgUnitId) {
      await this.assertActiveV3Scope(
        group.officialOfficeId,
        group.officialOrgUnitId,
      );
    }

    return {
      audienceType: input.audienceType,
      officeId: group.officialOfficeId,
      orgUnitId: group.officialOrgUnitId,
      // Official-group recipients come from the synchronized group membership.
      // The group membership mode is kept separately for authorization scope.
      includeDescendants: false,
      officialConversationId: group.id,
      officialScopeType: group.officialScopeType,
      officialOfficeId: group.officialOfficeId,
      officialOrgUnitId: group.officialOrgUnitId,
      officialParticipantRole: group.participants[0]?.role ?? null,
      officialMembershipMode: group.officialMembershipMode,
      label: group.title ?? 'Official group',
    };
  }

  private async assertActiveV3Scope(
    officeId: string,
    orgUnitId: string,
  ): Promise<void> {
    const orgUnit = await this.prisma.orgUnit.findFirst({
      where: {
        id: orgUnitId,
        officeId,
        isActive: true,
        office: { is: { isActive: true } },
      },
      select: { id: true },
    });
    if (!orgUnit) {
      throw new ConflictException(
        'The announcement scope is no longer active in the V3 hierarchy.',
      );
    }
  }

  private async canPublishScope(
    viewer: AnnouncementViewer,
    officeId: string,
    orgUnitId: string | null,
    includeDescendants: boolean,
    at = new Date(),
  ): Promise<boolean> {
    if (viewer.role === AccountRole.SUPER_ADMIN) {
      return false;
    }

    const authorizationUser = this.toAuthorizationUser(viewer);
    const allowed = await this.organizationAuthorization.can(
      authorizationUser,
      CAPABILITIES.ANNOUNCEMENT_PUBLISH,
      officeId,
      orgUnitId,
      at,
    );
    if (!allowed) {
      return false;
    }

    if (!orgUnitId || !includeDescendants) {
      return true;
    }

    const [visibleIds, descendants] = await Promise.all([
      this.organizationAuthorization.visibleOrgUnitIds(
        authorizationUser,
        CAPABILITIES.ANNOUNCEMENT_PUBLISH,
        officeId,
      ),
      this.prisma.orgUnitClosure.findMany({
        where: { ancestorOrgUnitId: orgUnitId },
        select: { descendantOrgUnitId: true },
      }),
    ]);
    const visible = new Set(visibleIds);
    visible.add(orgUnitId);

    return descendants.every((link) =>
      visible.has(link.descendantOrgUnitId),
    );
  }

  private async resolveRecipientAccountIds(
    announcement: AnnouncementDetailRecord,
  ): Promise<string[]> {
    const now = new Date();

    if (
      announcement.audienceType === AnnouncementAudienceType.OFFICIAL_GROUP
    ) {
      const participants = await this.prisma.conversationParticipant.findMany({
        where: {
          conversationId: announcement.officialConversationId ?? undefined,
          leftAt: null,
          account: this.buildEligibleAccountWhere(now),
        },
        orderBy: { accountId: 'asc' },
        select: { accountId: true },
      });

      return participants.map((participant) => participant.accountId);
    }

    if (!announcement.officeId) {
      throw new ConflictException(
        'The announcement is not bound to a V3 Office audience.',
      );
    }

    let orgUnitIds: string[] | null = null;
    if (announcement.orgUnitId) {
      if (announcement.includeDescendants) {
        const descendants = await this.prisma.orgUnitClosure.findMany({
          where: { ancestorOrgUnitId: announcement.orgUnitId },
          select: { descendantOrgUnitId: true },
        });
        orgUnitIds = [
          ...new Set([
            announcement.orgUnitId,
            ...descendants.map((item) => item.descendantOrgUnitId),
          ]),
        ];
      } else {
        orgUnitIds = [announcement.orgUnitId];
      }
    }

    const accounts = await this.prisma.account.findMany({
      where: this.buildEligibleAccountWhere(
        now,
        announcement.officeId,
        orgUnitIds,
      ),
      orderBy: { id: 'asc' },
      select: { id: true },
    });

    return accounts.map((account) => account.id);
  }

  private buildEligibleAccountWhere(
    at = new Date(),
    officeId?: string,
    orgUnitIds?: string[] | null,
  ): Prisma.AccountWhereInput {
    return {
      isEnabled: true,
      employee: {
        is: {
          status: EmployeeStatus.ACTIVE,
          employmentStatus: EmploymentStatus.ACTIVE,
          archivedAt: null,
          isActivated: true,
          orgMemberships: {
            some: {
              ...(officeId ? { officeId } : {}),
              membershipType: OrgMembershipType.PRIMARY,
              startsAt: { lte: at },
              OR: [{ endsAt: null }, { endsAt: { gt: at } }],
              ...(orgUnitIds
                ? { orgUnitId: { in: orgUnitIds } }
                : {}),
            },
          },
        },
      },
    };
  }

  private async buildAnnouncementListWhere(
    viewer: AnnouncementViewer,
    filter: AnnouncementListFilter,
  ): Promise<Prisma.AnnouncementWhereInput> {
    const received: Prisma.AnnouncementWhereInput = {
      recipients: { some: { accountId: viewer.accountId } },
    };
    let managementScope: Prisma.AnnouncementWhereInput | null = null;

    if (viewer.role !== AccountRole.SUPER_ADMIN && viewer.officeId) {
      const authorizationUser = this.toAuthorizationUser(viewer);
      const [canTargetOffice, manageableOrgUnitIds] = await Promise.all([
        this.organizationAuthorization.can(
          authorizationUser,
          CAPABILITIES.ANNOUNCEMENT_PUBLISH,
          viewer.officeId,
          null,
        ),
        this.organizationAuthorization.visibleOrgUnitIds(
          authorizationUser,
          CAPABILITIES.ANNOUNCEMENT_PUBLISH,
          viewer.officeId,
        ),
      ]);
      const subtreeManageableOrgUnitIds: string[] = [];

      if (!canTargetOffice) {
        for (const orgUnitId of manageableOrgUnitIds) {
          if (
            await this.canPublishScope(
              viewer,
              viewer.officeId,
              orgUnitId,
              true,
            )
          ) {
            subtreeManageableOrgUnitIds.push(orgUnitId);
          }
        }
      }

      const managedOfficialGroupBase: Prisma.AnnouncementWhereInput = {
        audienceType: AnnouncementAudienceType.OFFICIAL_GROUP,
        officialConversation: {
          is: {
            officialOfficeId: viewer.officeId,
            participants: {
              some: {
                accountId: viewer.accountId,
                leftAt: null,
                role: {
                  in: [
                    ConversationParticipantRole.OWNER,
                    ConversationParticipantRole.ADMIN,
                  ],
                },
              },
            },
          },
        },
      };

      if (canTargetOffice) {
        managementScope = {
          officeId: viewer.officeId,
          OR: [
            { audienceType: { not: AnnouncementAudienceType.OFFICIAL_GROUP } },
            managedOfficialGroupBase,
          ],
        };
      } else if (manageableOrgUnitIds.length > 0) {
        const scoped: Prisma.AnnouncementWhereInput[] = [
          {
            officeId: viewer.officeId,
            orgUnitId: { in: manageableOrgUnitIds },
            includeDescendants: false,
            audienceType: { not: AnnouncementAudienceType.OFFICIAL_GROUP },
          },
          {
            audienceType: AnnouncementAudienceType.OFFICIAL_GROUP,
            officialConversation: {
              is: {
                officialOfficeId: viewer.officeId,
                officialOrgUnitId: { in: manageableOrgUnitIds },
                officialMembershipMode:
                  OfficialGroupMembershipMode.DIRECT_MEMBERS,
                participants: {
                  some: {
                    accountId: viewer.accountId,
                    leftAt: null,
                    role: {
                      in: [
                        ConversationParticipantRole.OWNER,
                        ConversationParticipantRole.ADMIN,
                      ],
                    },
                  },
                },
              },
            },
          },
        ];

        if (subtreeManageableOrgUnitIds.length > 0) {
          scoped.push(
            {
              officeId: viewer.officeId,
              orgUnitId: { in: subtreeManageableOrgUnitIds },
              includeDescendants: true,
              audienceType: { not: AnnouncementAudienceType.OFFICIAL_GROUP },
            },
            {
              audienceType: AnnouncementAudienceType.OFFICIAL_GROUP,
              officialConversation: {
                is: {
                  officialOfficeId: viewer.officeId,
                  officialOrgUnitId: { in: subtreeManageableOrgUnitIds },
                  officialMembershipMode:
                    OfficialGroupMembershipMode.ENTIRE_SUBTREE,
                  participants: {
                    some: {
                      accountId: viewer.accountId,
                      leftAt: null,
                      role: {
                        in: [
                          ConversationParticipantRole.OWNER,
                          ConversationParticipantRole.ADMIN,
                        ],
                      },
                    },
                  },
                },
              },
            },
          );
        }

        managementScope = { OR: scoped };
      }
    }

    const visible = buildAnnouncementVisibilityWhere(received, managementScope);

    switch (filter) {
      case 'UNREAD':
        return {
          ...visible,
          status: AnnouncementStatus.PUBLISHED,
          recipients: {
            some: {
              accountId: viewer.accountId,
              readRevision: null,
            },
          },
        };
      case 'ACTION_REQUIRED':
        return {
          ...visible,
          status: AnnouncementStatus.PUBLISHED,
          requiresAcknowledgement: true,
          recipients: {
            some: {
              accountId: viewer.accountId,
              acknowledgedRevision: null,
            },
          },
        };
      case 'DRAFTS':
        return managementScope
          ? {
              AND: [managementScope, { status: AnnouncementStatus.DRAFT }],
            }
          : {
              createdByAccountId: viewer.accountId,
              status: AnnouncementStatus.DRAFT,
            };
      case 'SCHEDULED':
        return { ...visible, status: AnnouncementStatus.SCHEDULED };
      case 'PUBLISHED':
        return { ...visible, status: AnnouncementStatus.PUBLISHED };
      case 'EXPIRED':
        return { ...visible, status: AnnouncementStatus.EXPIRED };
      case 'ALL':
      default:
        return visible;
    }
  }

  private async getViewer(accountId: string): Promise<AnnouncementViewer> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: announcementAccountSelect,
    });

    if (!account || !account.isEnabled) {
      throw new ForbiddenException('Your account cannot access announcements.');
    }

    let primaryMembership: {
      officeId: string;
      orgUnitId: string | null;
    } | null = null;

    if (account.role !== AccountRole.SUPER_ADMIN) {
      if (
        !account.employee ||
        account.employee.status !== EmployeeStatus.ACTIVE ||
        account.employee.employmentStatus !== EmploymentStatus.ACTIVE ||
        account.employee.archivedAt ||
        !account.employee.isActivated
      ) {
        throw new ForbiddenException(
          'Your active employment record is required for announcements.',
        );
      }

      const now = new Date();
      primaryMembership = await this.prisma.orgMembership.findFirst({
        where: {
          employeeId: account.employee.id,
          membershipType: OrgMembershipType.PRIMARY,
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          office: { is: { isActive: true } },
        },
        select: { officeId: true, orgUnitId: true },
      });

      if (!primaryMembership) {
        throw new ForbiddenException(
          'Your active Office placement is required for announcements.',
        );
      }
    }

    const authorizationUser: AuthenticatedUser = {
      accountId: account.id,
      sessionId: '',
      username: account.username,
      role: account.role,
    };
    const isOfficeHead = primaryMembership
      ? await this.organizationAuthorization.isOfficeHead(
          authorizationUser,
          primaryMembership.officeId,
        )
      : false;

    return {
      accountId: account.id,
      username: account.username,
      role: account.role,
      employeeId: account.employee?.id ?? null,
      officeId: primaryMembership?.officeId ?? null,
      primaryOrgUnitId: primaryMembership?.orgUnitId ?? null,
      isOfficeHead,
      displayName: this.displayName(account),
      isEnabled: account.isEnabled,
    };
  }

  private toAuthorizationUser(viewer: AnnouncementViewer): AuthenticatedUser {
    return {
      accountId: viewer.accountId,
      sessionId: '',
      username: viewer.username,
      role: viewer.role,
    };
  }

  private requireViewerOffice(viewer: AnnouncementViewer): string {
    if (!viewer.officeId) {
      throw new ForbiddenException(
        'An active Office placement is required for announcement publishing.',
      );
    }
    return viewer.officeId;
  }

  private assertPublisherRole(viewer: AnnouncementViewer): void {
    if (viewer.role === AccountRole.SUPER_ADMIN || !viewer.officeId) {
      throw new ForbiddenException(
        'Only authorized Office members can publish announcements.',
      );
    }
  }

  private async assertCanManageAnnouncement(
    viewer: AnnouncementViewer,
    announcement: AnnouncementDetailRecord,
  ): Promise<void> {
    if (!(await this.canManageAnnouncement(viewer, announcement))) {
      throw new ForbiddenException(
        'You cannot manage this announcement outside your authorized scope.',
      );
    }
  }

  private async assertCanModifyAnnouncement(
    viewer: AnnouncementViewer,
    announcement: AnnouncementDetailRecord,
  ): Promise<void> {
    await this.assertCanManageAnnouncement(viewer, announcement);

    if (!canModifyAnnouncementByCreator(viewer, announcement.createdBy)) {
      throw new ForbiddenException(
        'Only the announcement creator or the Owner can edit or delete this announcement.',
      );
    }
  }

  private async canManageAnnouncement(
    viewer: AnnouncementViewer,
    announcement: AnnouncementDetailRecord,
  ): Promise<boolean> {
    if (
      viewer.role === AccountRole.SUPER_ADMIN ||
      !viewer.officeId ||
      !announcement.officeId ||
      viewer.officeId !== announcement.officeId
    ) {
      return false;
    }

    const officialParticipant = announcement.officialConversationId
      ? await this.prisma.conversationParticipant.findFirst({
          where: {
            conversationId: announcement.officialConversationId,
            accountId: viewer.accountId,
            leftAt: null,
          },
          select: { role: true },
        })
      : null;
    const policyAudience: AnnouncementPolicyAudience = {
      audienceType: announcement.audienceType,
      officeId: announcement.officeId,
      orgUnitId: announcement.orgUnitId,
      includeDescendants: announcement.includeDescendants,
      officialScopeType: announcement.officialConversation?.officialScopeType,
      officialOfficeId: announcement.officialConversation?.officialOfficeId,
      officialOrgUnitId: announcement.officialConversation?.officialOrgUnitId,
      officialParticipantRole: officialParticipant?.role ?? null,
    };

    if (getAnnouncementAudiencePolicyViolation(viewer, policyAudience)) {
      return false;
    }

    return this.canPublishScope(
      viewer,
      announcement.officeId,
      announcement.orgUnitId,
      announcement.audienceType === AnnouncementAudienceType.OFFICIAL_GROUP
        ? announcement.officialConversation?.officialMembershipMode ===
          OfficialGroupMembershipMode.ENTIRE_SUBTREE
        : announcement.includeDescendants,
    );
  }

  private async assertCanViewAnnouncement(
    viewer: AnnouncementViewer,
    announcement: AnnouncementDetailRecord,
  ): Promise<boolean> {
    const isRecipient = announcement.recipients.some(
      (recipient) => recipient.accountId === viewer.accountId,
    );
    const canManage = await this.canManageAnnouncement(viewer, announcement);

    if (!isRecipient && !canManage) {
      // A generic not-found response prevents audience-membership probing.
      throw new NotFoundException('Announcement was not found.');
    }

    return canManage;
  }

  private assertEditableStatus(status: AnnouncementStatus): void {
    if (
      status === AnnouncementStatus.PUBLISHING ||
      status === AnnouncementStatus.EXPIRED
    ) {
      throw new ConflictException(
        'This announcement is not editable in its current lifecycle state.',
      );
    }
  }

  private async assertPinCapacity(announcement: {
    id: string;
    isPinned: boolean;
    audienceType: AnnouncementAudienceType;
    officeId: string | null;
    orgUnitId: string | null;
    officialConversationId: string | null;
  }): Promise<void> {
    if (!announcement.isPinned) {
      return;
    }

    const activePinnedCount = await this.prisma.announcement.count({
      where: {
        id: { not: announcement.id },
        status: AnnouncementStatus.PUBLISHED,
        isPinned: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        audienceType: announcement.audienceType,
        officialConversationId: announcement.officialConversationId,
      },
    });

    if (activePinnedCount >= 3) {
      throw new ConflictException(
        'This audience already has three active pinned announcements.',
      );
    }
  }

  private validatePublishable(announcement: AnnouncementDetailRecord): void {
    if (announcement.title.trim().length < 5) {
      throw new BadRequestException(
        'Announcement title must contain at least 5 characters before publication.',
      );
    }

    if (!announcement.body.trim()) {
      throw new BadRequestException(
        'Announcement body is required before publication.',
      );
    }

    const now = new Date();
    if (announcement.expiresAt && announcement.expiresAt <= now) {
      throw new BadRequestException(
        'Announcement expiry must be in the future.',
      );
    }

    if (
      announcement.scheduledAt &&
      announcement.expiresAt &&
      announcement.expiresAt <= announcement.scheduledAt
    ) {
      throw new BadRequestException(
        'Announcement expiry must be after its scheduled publication time.',
      );
    }
  }

  private validateLifecycleDates(
    scheduledAt: Date | null,
    expiresAt: Date | null,
    reference: Date,
    alreadyPublished: boolean,
  ): void {
    if (!alreadyPublished && scheduledAt && expiresAt && expiresAt <= scheduledAt) {
      throw new BadRequestException(
        'Announcement expiry must be after its scheduled publication time.',
      );
    }

    if (alreadyPublished && expiresAt && expiresAt <= reference) {
      throw new BadRequestException(
        'Published announcement expiry must be after publication.',
      );
    }
  }

  private parseOptionalDate(
    value: string | null | undefined,
    label: string,
  ): Date | null {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Announcement ${label} is invalid.`);
    }

    return parsed;
  }

  private async getAnnouncement(id: string): Promise<AnnouncementDetailRecord> {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
      include: announcementDetailInclude,
    });

    if (!announcement) {
      throw new NotFoundException('Announcement was not found.');
    }

    return announcement;
  }

  private serializeAnnouncement(
    announcement: AnnouncementDetailRecord,
    viewer: AnnouncementViewer,
    canManage: boolean,
  ) {
    const recipient = announcement.recipients.find(
      (item) => item.accountId === viewer.accountId,
    ) ?? null;

    return {
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      priority: announcement.priority,
      status: announcement.status,
      audience: this.serializeAudience(announcement),
      publisher: this.serializeAccount(announcement.createdBy),
      requiresAcknowledgement: announcement.requiresAcknowledgement,
      allowAttachmentDownload: announcement.allowAttachmentDownload,
      isPinned: announcement.isPinned,
      currentRevision: announcement.currentRevision,
      scheduledAt: announcement.scheduledAt,
      publishedAt: announcement.publishedAt,
      expiresAt: announcement.expiresAt,
      publishFailureReason: canManage
        ? announcement.publishFailureReason
        : null,
      viewerState: this.serializeRecipientState(
        recipient,
        announcement.currentRevision,
      ),
      canManage,
      canEdit:
        canManage &&
        canModifyAnnouncementByCreator(viewer, announcement.createdBy) &&
        announcement.status !== AnnouncementStatus.PUBLISHING &&
        announcement.status !== AnnouncementStatus.EXPIRED,
      canDelete:
        canManage &&
        canModifyAnnouncementByCreator(viewer, announcement.createdBy) &&
        announcement.status !== AnnouncementStatus.PUBLISHING,
      attachments: announcement.attachments
        .filter((attachment) =>
          this.isAttachmentVisibleAtRevision(
            attachment,
            announcement.currentRevision,
          ),
        )
        .map((attachment) => this.serializeAttachment(attachment)),
      revisions: canManage
        ? announcement.revisions.map((revision) => ({
            revisionNumber: revision.revisionNumber,
            editor: this.serializeAccount(revision.editor),
            createdAt: revision.createdAt,
          }))
        : [],
      reporting: canManage
        ? {
            recipientCount: announcement._count.recipients,
            acknowledgementHistoryCount:
              announcement._count.acknowledgements,
          }
        : null,
      createdAt: announcement.createdAt,
      updatedAt: announcement.updatedAt,
    };
  }

  private serializeAudience(announcement: {
    audienceType: AnnouncementAudienceType;
    includeDescendants: boolean;
    office: { id: string; code: string; name: string } | null;
    orgUnit: {
      id: string;
      officeId: string;
      parentOrgUnitId: string | null;
      code: string;
      name: string;
    } | null;
    officialConversation: { id: string; title: string | null } | null;
  }) {
    return {
      type: announcement.audienceType,
      office: announcement.office,
      orgUnit: announcement.orgUnit,
      includeDescendants: announcement.includeDescendants,
      officialGroup: announcement.officialConversation
        ? {
            id: announcement.officialConversation.id,
            title:
              announcement.officialConversation.title ?? 'Official group',
          }
        : null,
    };
  }

  private serializeRecipientState(
    recipient: {
      deliveredAt: Date | null;
      firstReadAt: Date | null;
      readRevision: number | null;
      acknowledgedRevision: number | null;
    } | null,
    currentRevision: number,
  ) {
    return recipient
      ? {
          deliveredAt: recipient.deliveredAt,
          firstReadAt: recipient.firstReadAt,
          isRead: recipient.readRevision === currentRevision,
          readRevision: recipient.readRevision,
          isAcknowledged:
            recipient.acknowledgedRevision === currentRevision,
          acknowledgedRevision: recipient.acknowledgedRevision,
        }
      : null;
  }

  private serializeAccount(account: AnnouncementAccountRecord) {
    return {
      id: account.id,
      displayName: this.displayName(account),
      role: account.role,
      designation: account.employee?.designation ?? null,
    };
  }

  private displayName(account: AnnouncementAccountRecord): string {
    return (
      account.employee?.empName ??
      account.superAdminProfile?.fullName ??
      account.username ??
      'NT Message user'
    );
  }

  private serializeAttachment(attachment: {
    id: string;
    originalFileName: string;
    mimeType: string;
    fileSizeBytes: number;
    contentCategory: string;
    scanStatus: string;
    expiresAt: Date | null;
    expiredAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: attachment.id,
      originalFileName: attachment.originalFileName,
      mimeType: attachment.mimeType,
      fileSizeBytes: attachment.fileSizeBytes,
      category: attachment.contentCategory,
      scanStatus: attachment.scanStatus,
      expiresAt: attachment.expiresAt,
      expiredAt: attachment.expiredAt,
      isExpired: isAttachmentReferenceExpired(
        attachment.expiresAt,
        attachment.expiredAt,
      ),
      createdAt: attachment.createdAt,
    };
  }

  private safeAuditMetadata(announcement: {
    id: string;
    audienceType: AnnouncementAudienceType;
    officeId: string | null;
    orgUnitId: string | null;
    includeDescendants: boolean;
    officialConversationId: string | null;
    priority: AnnouncementPriority;
    currentRevision: number;
    requiresAcknowledgement: boolean;
  }): Prisma.InputJsonObject {
    const metadata: Record<string, Prisma.InputJsonValue> = {
      announcementId: announcement.id,
      audienceType: announcement.audienceType,
      priority: announcement.priority,
      revisionNumber: announcement.currentRevision,
      requiresAcknowledgement: announcement.requiresAcknowledgement,
    };

    if (announcement.officeId) {
      metadata.officeId = announcement.officeId;
    }
    if (announcement.orgUnitId) {
      metadata.orgUnitId = announcement.orgUnitId;
      metadata.includeDescendants = announcement.includeDescendants;
    }
    if (announcement.officialConversationId) {
      metadata.officialConversationId = announcement.officialConversationId;
    }

    return metadata;
  }

  private eventPayload(
    action: 'PUBLISHED' | 'UPDATED' | 'DELETED' | 'READ' | 'ACKNOWLEDGED',
    announcement: {
      id: string;
      officialConversationId: string | null;
      currentRevision: number;
      priority: AnnouncementPriority;
      requiresAcknowledgement: boolean;
      status: AnnouncementStatus;
    },
    actorAccountId: string,
  ) {
    return {
      announcementId: announcement.id,
      officialConversationId: announcement.officialConversationId,
      action,
      status: announcement.status,
      priority: announcement.priority,
      requiresAcknowledgement: announcement.requiresAcknowledgement,
      revisionNumber: announcement.currentRevision,
      actorAccountId,
      occurredAt: new Date().toISOString(),
    };
  }

  private emitAnnouncementEvent(
    accountIds: string[],
    action: 'UPDATED',
    announcement: AnnouncementDetailRecord,
    actorAccountId: string,
  ): void {
    const payload = this.eventPayload(
      action,
      announcement,
      actorAccountId,
    );

    this.messagingEventsService.emitAnnouncementUpdated(
      [...accountIds, announcement.createdByAccountId],
      payload,
    );
  }

  private emitAnnouncementDeleted(
    accountIds: string[],
    announcement: AnnouncementDetailRecord,
    actorAccountId: string,
  ): void {
    this.messagingEventsService.emitAnnouncementDeleted(
      accountIds,
      this.eventPayload('DELETED', announcement, actorAccountId),
    );
  }

  private validateAttachment(file?: UploadedMessageAttachmentFile): {
    originalFileName: string;
    category: AnnouncementAttachmentCategory;
  } {
    if (!file || (!file.buffer && !file.path) || file.size <= 0) {
      throw new BadRequestException('Announcement attachment is required.');
    }

    const originalFileName = this.normalizeFileName(file.originalname);
    assertAttachmentFileMatchesDeclaredType(file);

    if (IMAGE_MIME_TYPES.has(file.mimetype)) {
      if (file.size > MAX_IMAGE_BYTES) {
        throw new BadRequestException('Announcement images must be 20 MB or smaller.');
      }
      return { originalFileName, category: 'IMAGE' };
    }

    if (VIDEO_MIME_TYPES.has(file.mimetype)) {
      if (file.size > MAX_VIDEO_BYTES) {
        throw new BadRequestException('Announcement videos must be 200 MB or smaller.');
      }
      return { originalFileName, category: 'VIDEO' };
    }

    if (DOCUMENT_MIME_TYPES.has(file.mimetype)) {
      if (file.size > MAX_DOCUMENT_BYTES) {
        throw new BadRequestException('Announcement documents must be 50 MB or smaller.');
      }
      return { originalFileName, category: 'DOCUMENT' };
    }

    throw new BadRequestException(
      'Allowed announcement attachments are JPG, PNG, WEBP, MP4, WEBM, PDF, DOCX, XLSX, PPTX, TXT, CSV and ZIP.',
    );
  }

  private normalizeFileName(fileName: string): string {
    const normalized = fileName
      .normalize('NFKC')
      .replace(/[\\/\0]/g, '_')
      .replace(/[\r\n]/g, ' ')
      .trim();

    return (normalized || 'announcement-attachment').slice(0, 180);
  }

  private async writeAttachmentFile(
    storageKey: string,
    file: UploadedMessageAttachmentFile,
  ): Promise<void> {
    await this.attachmentStorageService.writeUploadedFile(
      'announcements',
      storageKey,
      file,
    );
  }

  private async deleteAttachmentFileWithResult(
    storageKey: string,
  ): Promise<boolean> {
    return this.attachmentStorageService.deleteFile(
      'announcements',
      storageKey,
    );
  }

  private async deleteAttachmentFile(storageKey: string): Promise<void> {
    await this.deleteAttachmentFileWithResult(storageKey);
  }

  private async deleteAnnouncementAttachmentDirectory(
    announcementId: string,
  ): Promise<void> {
    await this.attachmentStorageService.removeDirectory(
      'announcements',
      announcementId,
    );
  }

  private isAttachmentVisibleAtRevision(
    attachment: { addedRevision: number; removedRevision: number | null },
    revision: number,
  ): boolean {
    return (
      attachment.addedRevision <= revision &&
      (attachment.removedRevision === null ||
        attachment.removedRevision > revision)
    );
  }

  private async createRevisionSnapshot(
    transaction: Prisma.TransactionClient,
    announcement: AnnouncementDetailRecord,
    editorAccountId: string,
    revisionNumber: number,
  ): Promise<void> {
    await transaction.announcementRevision.create({
      data: {
        announcementId: announcement.id,
        editorAccountId,
        revisionNumber,
        title: announcement.title,
        body: announcement.body,
        priority: announcement.priority,
        requiresAcknowledgement: announcement.requiresAcknowledgement,
        allowAttachmentDownload: announcement.allowAttachmentDownload,
        isPinned: announcement.isPinned,
        expiresAt: announcement.expiresAt,
      },
    });
  }

  private toPreview(value: string, maxLength: number): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length <= maxLength
      ? normalized
      : `${normalized.slice(0, maxLength - 1)}…`;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown publication failure';
  }
}
