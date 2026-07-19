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
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { AuthenticatedUser } from '../auth/types/auth.types';
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
  OfficialGroupScopeType,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { MessagingEventsService } from '../realtime/messaging-events.service';
import type { UploadedMessageAttachmentFile } from '../conversations/types/uploaded-message-attachment-file';
import {
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
const WITHDRAWN_ANNOUNCEMENT_RETENTION_DAYS = 90;
const WITHDRAWN_ANNOUNCEMENT_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const WITHDRAWN_ANNOUNCEMENT_CLEANUP_BATCH_SIZE = 50;
const WITHDRAWN_ANNOUNCEMENT_CLEANUP_MAX_BATCHES = 20;
const ANNOUNCEMENT_STORAGE_DIR = path.resolve(
  process.env.MESSAGE_ATTACHMENT_STORAGE_DIR
    ? path.join(process.env.MESSAGE_ATTACHMENT_STORAGE_DIR, 'announcements')
    : path.join(process.cwd(), 'storage', 'announcement-attachments'),
);
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
  displayName: string;
  isEnabled: boolean;
}

interface ResolvedAnnouncementAudience extends AnnouncementPolicyAudience {
  divisionId: string | null;
  departmentId: string | null;
  officialConversationId: string | null;
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
      empName: true,
      designation: true,
      status: true,
      employmentStatus: true,
      archivedAt: true,
      isActivated: true,
      divisionId: true,
      departmentId: true,
      division: {
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
        },
      },
      departmentUnit: {
        select: {
          id: true,
          divisionId: true,
          code: true,
          name: true,
          isActive: true,
        },
      },
    },
  },
} satisfies Prisma.AccountSelect;

const announcementDetailInclude = {
  createdBy: {
    select: announcementAccountSelect,
  },
  withdrawnBy: {
    select: announcementAccountSelect,
  },
  division: {
    select: {
      id: true,
      code: true,
      name: true,
      isActive: true,
    },
  },
  department: {
    select: {
      id: true,
      divisionId: true,
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
      officialDivisionId: true,
      officialDepartmentId: true,
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
  private retentionTimer: ReturnType<typeof setInterval> | null = null;
  private workerRunning = false;
  private retentionWorkerRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingEventsService: MessagingEventsService,
  ) {}

  onModuleInit(): void {
    void this.processLifecycleQueue();
    void this.cleanupWithdrawnAnnouncements();

    this.publishTimer = setInterval(() => {
      void this.processLifecycleQueue();
    }, ANNOUNCEMENT_PUBLISH_INTERVAL_MS);
    this.retentionTimer = setInterval(() => {
      void this.cleanupWithdrawnAnnouncements();
    }, WITHDRAWN_ANNOUNCEMENT_CLEANUP_INTERVAL_MS);

    this.publishTimer.unref?.();
    this.retentionTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.publishTimer) {
      clearInterval(this.publishTimer);
    }
    if (this.retentionTimer) {
      clearInterval(this.retentionTimer);
    }
  }

  async listAvailableAudiences(user: AuthenticatedUser) {
    const viewer = await this.getViewer(user.accountId);
    this.assertPublisherRole(viewer);

    const divisionWhere: Prisma.DivisionWhereInput = {
      isActive: true,
      ...(viewer.role === AccountRole.SUPER_ADMIN
        ? {}
        : { id: viewer.divisionId ?? undefined }),
    };
    const departmentWhere: Prisma.DepartmentWhereInput = {
      isActive: true,
      division: {
        is: {
          isActive: true,
        },
      },
      ...(viewer.role === AccountRole.SUPER_ADMIN
        ? {}
        : viewer.role === AccountRole.SENIOR_MANAGEMENT
          ? { divisionId: viewer.divisionId ?? undefined }
          : { id: viewer.departmentId ?? undefined }),
    };
    const officialGroupWhere = this.buildOfficialGroupAudienceWhere(viewer);

    const [divisions, departments, officialGroups] = await Promise.all([
      this.prisma.division.findMany({
        where: divisionWhere,
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.department.findMany({
        where: departmentWhere,
        orderBy: [{ divisionId: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          divisionId: true,
          code: true,
          name: true,
          division: { select: { name: true } },
        },
      }),
      this.prisma.conversation.findMany({
        where: officialGroupWhere,
        orderBy: { title: 'asc' },
        select: {
          id: true,
          title: true,
          officialScopeType: true,
          officialDivisionId: true,
          officialDepartmentId: true,
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

    return {
      data: {
        canTargetOrganization: viewer.role === AccountRole.SUPER_ADMIN,
        divisions,
        departments,
        officialGroups: officialGroups.map((group) => ({
          id: group.id,
          title: group.title ?? 'Official group',
          scopeType: group.officialScopeType,
          divisionId: group.officialDivisionId,
          departmentId: group.officialDepartmentId,
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
          divisionId: audience.divisionId,
          departmentId: audience.departmentId,
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
    await this.assertCanManageAnnouncement(viewer, existing);
    this.assertUnpublishedOwnership(viewer, existing);
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

  async deleteDraft(user: AuthenticatedUser, announcementId: string) {
    const viewer = await this.getViewer(user.accountId);
    const existing = await this.getAnnouncement(announcementId);
    await this.assertCanManageAnnouncement(viewer, existing);
    this.assertUnpublishedOwnership(viewer, existing);

    if (
      existing.status !== AnnouncementStatus.DRAFT &&
      existing.status !== AnnouncementStatus.SCHEDULED
    ) {
      throw new ConflictException(
        'Only unpublished drafts or scheduled announcements can be deleted.',
      );
    }

    const storageKeys = existing.attachments.map(
      (attachment) => attachment.storageKey,
    );
    await this.prisma.announcement.delete({ where: { id: announcementId } });

    await Promise.all(
      storageKeys.map((storageKey) => this.deleteAttachmentFile(storageKey)),
    );

    return { message: 'Announcement draft deleted successfully.' };
  }

  async publish(user: AuthenticatedUser, announcementId: string) {
    const viewer = await this.getViewer(user.accountId);
    const existing = await this.getAnnouncement(announcementId);
    await this.assertCanManageAnnouncement(viewer, existing);
    this.assertUnpublishedOwnership(viewer, existing);

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

  async withdraw(user: AuthenticatedUser, announcementId: string) {
    const viewer = await this.getViewer(user.accountId);
    const existing = await this.getAnnouncement(announcementId);
    await this.assertCanManageAnnouncement(viewer, existing);

    if (
      existing.status !== AnnouncementStatus.PUBLISHED &&
      existing.status !== AnnouncementStatus.EXPIRED
    ) {
      throw new ConflictException(
        'Only a published or expired announcement can be withdrawn.',
      );
    }

    const withdrawnAt = new Date();
    const updated = await this.prisma.$transaction(async (transaction) => {
      const record = await transaction.announcement.update({
        where: { id: announcementId },
        data: {
          status: AnnouncementStatus.WITHDRAWN,
          withdrawnAt,
          withdrawnByAccountId: viewer.accountId,
          isPinned: false,
        },
        include: announcementDetailInclude,
      });

      await transaction.activityEvent.create({
        data: {
          accountId: viewer.accountId,
          sessionId: user.sessionId,
          eventType: ActivityEventType.ANNOUNCEMENT_WITHDRAWN,
          pagePath: 'Announcements',
          elementLabel: 'Announcement withdrawn',
          metadata: this.safeAuditMetadata(record),
        },
      });

      return record;
    });

    this.emitAnnouncementEvent(
      updated.recipients.map((recipient) => recipient.accountId),
      'WITHDRAWN',
      updated,
      viewer.accountId,
    );

    return {
      message: 'Announcement withdrawn successfully.',
      data: this.serializeAnnouncement(updated, viewer, true),
    };
  }

  async list(user: AuthenticatedUser, query: ListAnnouncementsQueryDto) {
    const viewer = await this.getViewer(user.accountId);
    const where = this.buildAnnouncementListWhere(viewer, query.filter);
    const searchText = query.search?.trim();

    if (query.officialConversationId) {
      // The announcement workspace selects one official group at a time.
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          audienceType: AnnouncementAudienceType.OFFICIAL_GROUP,
          officialConversationId: query.officialConversationId,
        },
        ...(query.filter === 'ALL'
          ? [
              {
                // Withdrawal is an audit-preserving delete. Keep the record
                // available to the explicit WITHDRAWN history filter, but do
                // not return it to the selected group's active workspace.
                status: { not: AnnouncementStatus.WITHDRAWN },
              },
            ]
          : []),
      ];
    }

    if (searchText) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { title: { contains: searchText, mode: 'insensitive' } },
            {
              AND: [
                { status: { not: AnnouncementStatus.WITHDRAWN } },
                { body: { contains: searchText, mode: 'insensitive' } },
              ],
            },
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
        division: { select: { id: true, code: true, name: true } },
        department: {
          select: { id: true, divisionId: true, code: true, name: true },
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
          bodyPreview:
            record.status === AnnouncementStatus.WITHDRAWN
              ? 'This official announcement was withdrawn.'
              : this.toPreview(record.body, 240),
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
          withdrawnAt: record.withdrawnAt,
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
    await this.assertCanManageAnnouncement(viewer, existing);
    this.assertUnpublishedOwnership(viewer, existing);
    this.assertEditableStatus(existing.status);
    const validated = this.validateAttachment(file);
    const uploadedFile = file as UploadedMessageAttachmentFile;
    const attachmentId = randomUUID();
    const storageKey = `${announcementId}/${attachmentId}`;
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
            scanStatus: 'FORMAT_VALIDATED',
            addedRevision: targetRevision,
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
    await this.assertCanManageAnnouncement(viewer, existing);
    this.assertUnpublishedOwnership(viewer, existing);
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

    if (announcement.status === AnnouncementStatus.WITHDRAWN && !canManage) {
      throw new NotFoundException('Announcement attachment was not found.');
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

    const absolutePath = this.resolveAttachmentPath(attachment.storageKey);

    try {
      await fs.access(absolutePath);
    } catch {
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

  private async cleanupWithdrawnAnnouncements(): Promise<void> {
    if (this.retentionWorkerRunning) {
      return;
    }

    this.retentionWorkerRunning = true;
    const cutoff = new Date(
      Date.now() -
        WITHDRAWN_ANNOUNCEMENT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const attemptedIds: string[] = [];
    let deletedCount = 0;

    try {
      for (
        let batchIndex = 0;
        batchIndex < WITHDRAWN_ANNOUNCEMENT_CLEANUP_MAX_BATCHES;
        batchIndex += 1
      ) {
        const records = await this.prisma.announcement.findMany({
          where: {
            status: AnnouncementStatus.WITHDRAWN,
            withdrawnAt: { lte: cutoff },
            ...(attemptedIds.length > 0
              ? { id: { notIn: attemptedIds } }
              : {}),
          },
          orderBy: [{ withdrawnAt: 'asc' }, { id: 'asc' }],
          take: WITHDRAWN_ANNOUNCEMENT_CLEANUP_BATCH_SIZE,
          select: { id: true },
        });

        if (records.length === 0) {
          break;
        }

        attemptedIds.push(...records.map((record) => record.id));

        for (const record of records) {
          try {
            /*
             * Files are removed before the database graph so a filesystem
             * failure leaves the withdrawn record available for the next
             * retry instead of creating untracked private attachment files.
             */
            await this.deleteAnnouncementAttachmentDirectory(record.id);
            const deleted = await this.prisma.announcement.deleteMany({
              where: {
                id: record.id,
                status: AnnouncementStatus.WITHDRAWN,
                withdrawnAt: { lte: cutoff },
              },
            });
            deletedCount += deleted.count;
          } catch {
            // Log only the opaque ID; announcement content and filenames stay private.
            this.logger.warn(
              `Withdrawn announcement ${record.id} could not be purged and will be retried.`,
            );
          }
        }

        if (records.length < WITHDRAWN_ANNOUNCEMENT_CLEANUP_BATCH_SIZE) {
          break;
        }
      }

      if (deletedCount > 0) {
        this.logger.log(
          `Announcement retention cleanup permanently removed ${deletedCount} withdrawn record(s).`,
        );
      }
    } catch {
      this.logger.warn(
        'Announcement retention cleanup could not complete and will be retried.',
      );
    } finally {
      this.retentionWorkerRunning = false;
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
    await this.assertCanManageAnnouncement(publisher, announcement);
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
      divisionId?: string;
      departmentId?: string;
      officialConversationId?: string;
    },
  ): Promise<ResolvedAnnouncementAudience> {
    const audience = await this.resolveAudience(input, viewer.accountId);
    const violation = getAnnouncementAudiencePolicyViolation(viewer, audience);

    if (violation) {
      throw new ForbiddenException(
        'You cannot publish announcements outside your assigned organizational scope.',
      );
    }

    return audience;
  }

  private async resolveAudience(
    input: {
      audienceType: AnnouncementAudienceType;
      divisionId?: string;
      departmentId?: string;
      officialConversationId?: string;
    },
    viewerAccountId: string,
  ): Promise<ResolvedAnnouncementAudience> {
    if (input.audienceType === AnnouncementAudienceType.ORGANIZATION) {
      if (input.divisionId || input.departmentId || input.officialConversationId) {
        throw new BadRequestException(
          'Organization announcements must not specify another audience target.',
        );
      }

      return {
        audienceType: input.audienceType,
        divisionId: null,
        departmentId: null,
        officialConversationId: null,
        label: 'Entire organization',
      };
    }

    if (input.audienceType === AnnouncementAudienceType.DIVISION) {
      if (!input.divisionId || input.departmentId || input.officialConversationId) {
        throw new BadRequestException(
          'A division announcement requires exactly one division.',
        );
      }

      const division = await this.prisma.division.findFirst({
        where: { id: input.divisionId, isActive: true },
        select: { id: true, name: true },
      });

      if (!division) {
        throw new NotFoundException('Active announcement division was not found.');
      }

      return {
        audienceType: input.audienceType,
        divisionId: division.id,
        departmentId: null,
        officialConversationId: null,
        label: division.name,
      };
    }

    if (input.audienceType === AnnouncementAudienceType.DEPARTMENT) {
      if (
        !input.divisionId ||
        !input.departmentId ||
        input.officialConversationId
      ) {
        throw new BadRequestException(
          'A department announcement requires its division and department.',
        );
      }

      const department = await this.prisma.department.findFirst({
        where: {
          id: input.departmentId,
          divisionId: input.divisionId,
          isActive: true,
          division: { is: { isActive: true } },
        },
        select: {
          id: true,
          divisionId: true,
          name: true,
          division: { select: { name: true } },
        },
      });

      if (!department) {
        throw new NotFoundException('Active announcement department was not found.');
      }

      return {
        audienceType: input.audienceType,
        divisionId: department.divisionId,
        departmentId: department.id,
        officialConversationId: null,
        label: `${department.division.name} / ${department.name}`,
      };
    }

    if (
      !input.officialConversationId ||
      input.divisionId ||
      input.departmentId
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
        officialDivisionId: true,
        officialDepartmentId: true,
        participants: {
          where: { accountId: viewerAccountId, leftAt: null },
          select: { role: true },
          take: 1,
        },
      },
    });

    if (!group || !group.officialScopeType) {
      throw new NotFoundException('Official announcement group was not found.');
    }

    return {
      audienceType: input.audienceType,
      divisionId: null,
      departmentId: null,
      officialConversationId: group.id,
      officialScopeType: group.officialScopeType,
      officialDivisionId: group.officialDivisionId,
      officialDepartmentId: group.officialDepartmentId,
      officialParticipantRole: group.participants[0]?.role ?? null,
      label: group.title ?? 'Official group',
    };
  }

  private async resolveRecipientAccountIds(
    announcement: AnnouncementDetailRecord,
  ): Promise<string[]> {
    if (
      announcement.audienceType === AnnouncementAudienceType.OFFICIAL_GROUP
    ) {
      const participants = await this.prisma.conversationParticipant.findMany({
        where: {
          conversationId: announcement.officialConversationId ?? undefined,
          leftAt: null,
          account: this.buildEligibleAccountWhere(),
        },
        orderBy: { accountId: 'asc' },
        select: { accountId: true },
      });

      return participants.map((participant) => participant.accountId);
    }

    const employeeScope: Prisma.EmployeeWhereInput = {
      status: EmployeeStatus.ACTIVE,
      employmentStatus: EmploymentStatus.ACTIVE,
      archivedAt: null,
      isActivated: true,
      division: { is: { isActive: true } },
      OR: [
        { departmentId: null },
        { departmentUnit: { is: { isActive: true } } },
      ],
    };

    if (announcement.audienceType === AnnouncementAudienceType.DIVISION) {
      employeeScope.divisionId = announcement.divisionId ?? undefined;
    }

    if (announcement.audienceType === AnnouncementAudienceType.DEPARTMENT) {
      employeeScope.divisionId = announcement.divisionId ?? undefined;
      employeeScope.departmentId = announcement.departmentId ?? undefined;
    }

    const accounts = await this.prisma.account.findMany({
      where:
        announcement.audienceType === AnnouncementAudienceType.ORGANIZATION
          ? this.buildEligibleAccountWhere()
          : {
              isEnabled: true,
              employee: { is: employeeScope },
            },
      orderBy: { id: 'asc' },
      select: { id: true },
    });

    return accounts.map((account) => account.id);
  }

  private buildEligibleAccountWhere(): Prisma.AccountWhereInput {
    return {
      isEnabled: true,
      OR: [
        { role: AccountRole.SUPER_ADMIN },
        {
          employee: {
            is: {
              status: EmployeeStatus.ACTIVE,
              employmentStatus: EmploymentStatus.ACTIVE,
              archivedAt: null,
              isActivated: true,
              division: { is: { isActive: true } },
              OR: [
                { departmentId: null },
                { departmentUnit: { is: { isActive: true } } },
              ],
            },
          },
        },
      ],
    };
  }

  private buildOfficialGroupAudienceWhere(
    viewer: AnnouncementViewer,
  ): Prisma.ConversationWhereInput {
    const base: Prisma.ConversationWhereInput = {
      type: 'GROUP',
      groupKind: GroupKind.OFFICIAL,
      officialScopeType: { not: null },
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
    };

    if (viewer.role === AccountRole.SUPER_ADMIN) {
      return base;
    }

    if (viewer.role === AccountRole.SENIOR_MANAGEMENT) {
      return {
        ...base,
        OR: [
          {
            officialScopeType: OfficialGroupScopeType.DIVISION,
            officialDivisionId: viewer.divisionId,
          },
          {
            officialScopeType: OfficialGroupScopeType.DEPARTMENT,
            officialDivisionId: viewer.divisionId,
          },
        ],
      };
    }

    return {
      ...base,
      officialScopeType: OfficialGroupScopeType.DEPARTMENT,
      officialDivisionId: viewer.divisionId,
      officialDepartmentId: viewer.departmentId,
    };
  }

  private buildAnnouncementListWhere(
    viewer: AnnouncementViewer,
    filter: AnnouncementListFilter,
  ): Prisma.AnnouncementWhereInput {
    const received: Prisma.AnnouncementWhereInput = {
      recipients: { some: { accountId: viewer.accountId } },
    };
    let managementScope: Prisma.AnnouncementWhereInput | null = null;

    const managedOfficialGroup: Prisma.AnnouncementWhereInput = {
      audienceType: AnnouncementAudienceType.OFFICIAL_GROUP,
      officialConversation: {
        is: {
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

    if (viewer.role === AccountRole.SUPER_ADMIN) {
      managementScope = {
        OR: [
          { audienceType: { not: AnnouncementAudienceType.OFFICIAL_GROUP } },
          managedOfficialGroup,
        ],
      };
    } else if (viewer.role === AccountRole.SENIOR_MANAGEMENT) {
      managementScope = {
        OR: [
          { createdByAccountId: viewer.accountId },
          {
            audienceType: AnnouncementAudienceType.DIVISION,
            divisionId: viewer.divisionId,
          },
          {
            audienceType: AnnouncementAudienceType.DEPARTMENT,
            divisionId: viewer.divisionId,
          },
          {
            ...managedOfficialGroup,
            officialConversation: {
              is: {
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
                OR: [
                  {
                    officialScopeType: OfficialGroupScopeType.DIVISION,
                    officialDivisionId: viewer.divisionId,
                  },
                  {
                    officialScopeType: OfficialGroupScopeType.DEPARTMENT,
                    officialDivisionId: viewer.divisionId,
                  },
                ],
              },
            },
          },
        ],
      };
    } else if (viewer.role === AccountRole.TEAM_MANAGER) {
      managementScope = {
        OR: [
          { createdByAccountId: viewer.accountId },
          {
            audienceType: AnnouncementAudienceType.DEPARTMENT,
            divisionId: viewer.divisionId,
            departmentId: viewer.departmentId,
          },
          {
            ...managedOfficialGroup,
            officialConversation: {
              is: {
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
                officialScopeType: OfficialGroupScopeType.DEPARTMENT,
                officialDivisionId: viewer.divisionId,
                officialDepartmentId: viewer.departmentId,
              },
            },
          },
        ],
      };
    }

    /*
     * Employees can see only announcements for which publication created a
     * recipient snapshot. Management scopes are optional application state,
     * not fabricated UUID values used to force an empty database branch.
     */
    const visible = buildAnnouncementVisibilityWhere(
      received,
      managementScope,
    );

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
        return {
          createdByAccountId: viewer.accountId,
          status: AnnouncementStatus.DRAFT,
        };
      case 'SCHEDULED':
        return { ...visible, status: AnnouncementStatus.SCHEDULED };
      case 'PUBLISHED':
        return { ...visible, status: AnnouncementStatus.PUBLISHED };
      case 'EXPIRED':
        return { ...visible, status: AnnouncementStatus.EXPIRED };
      case 'WITHDRAWN':
        return { ...visible, status: AnnouncementStatus.WITHDRAWN };
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

    if (account.role !== AccountRole.SUPER_ADMIN) {
      if (
        !account.employee ||
        account.employee.status !== EmployeeStatus.ACTIVE ||
        account.employee.employmentStatus !== EmploymentStatus.ACTIVE ||
        account.employee.archivedAt ||
        !account.employee.isActivated ||
        !account.employee.division?.isActive ||
        (account.employee.departmentId !== null &&
          !account.employee.departmentUnit?.isActive)
      ) {
        throw new ForbiddenException(
          'Your active employment record is required for announcements.',
        );
      }
    }

    if (
      account.role === AccountRole.SENIOR_MANAGEMENT &&
      !account.employee?.divisionId
    ) {
      throw new ForbiddenException(
        'Senior Management announcement access requires an assigned division.',
      );
    }

    if (
      account.role === AccountRole.TEAM_MANAGER &&
      (!account.employee?.divisionId || !account.employee.departmentId)
    ) {
      throw new ForbiddenException(
        'Team Manager announcement access requires an assigned department.',
      );
    }

    return {
      accountId: account.id,
      role: account.role,
      divisionId: account.employee?.divisionId ?? null,
      departmentId: account.employee?.departmentId ?? null,
      displayName: this.displayName(account),
      isEnabled: account.isEnabled,
    };
  }

  private assertPublisherRole(viewer: AnnouncementViewer): void {
    if (viewer.role === AccountRole.EMPLOYEE) {
      throw new ForbiddenException(
        'Employees can view and acknowledge announcements but cannot publish them.',
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

  private async canManageAnnouncement(
    viewer: AnnouncementViewer,
    announcement: AnnouncementDetailRecord,
  ): Promise<boolean> {
    if (viewer.role === AccountRole.EMPLOYEE) {
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
      divisionId: announcement.divisionId,
      departmentId: announcement.departmentId,
      officialScopeType: announcement.officialConversation?.officialScopeType,
      officialDivisionId:
        announcement.officialConversation?.officialDivisionId,
      officialDepartmentId:
        announcement.officialConversation?.officialDepartmentId,
      officialParticipantRole: officialParticipant?.role ?? null,
    };

    return getAnnouncementAudiencePolicyViolation(viewer, policyAudience) === null;
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

  private assertUnpublishedOwnership(
    viewer: AnnouncementViewer,
    announcement: {
      createdByAccountId: string;
      status: AnnouncementStatus;
    },
  ): void {
    if (
      (announcement.status === AnnouncementStatus.DRAFT ||
        announcement.status === AnnouncementStatus.SCHEDULED) &&
      viewer.role !== AccountRole.SUPER_ADMIN &&
      announcement.createdByAccountId !== viewer.accountId
    ) {
      throw new ForbiddenException(
        'Only the draft author can modify or publish this unpublished announcement.',
      );
    }
  }

  private assertEditableStatus(status: AnnouncementStatus): void {
    if (
      status === AnnouncementStatus.PUBLISHING ||
      status === AnnouncementStatus.EXPIRED ||
      status === AnnouncementStatus.WITHDRAWN
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
    divisionId: string | null;
    departmentId: string | null;
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
        divisionId: announcement.divisionId,
        departmentId: announcement.departmentId,
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
      body:
        announcement.status === AnnouncementStatus.WITHDRAWN && !canManage
          ? ''
          : announcement.body,
      priority: announcement.priority,
      status: announcement.status,
      audience: this.serializeAudience(announcement),
      publisher: this.serializeAccount(announcement.createdBy),
      withdrawnBy: announcement.withdrawnBy
        ? this.serializeAccount(announcement.withdrawnBy)
        : null,
      requiresAcknowledgement: announcement.requiresAcknowledgement,
      allowAttachmentDownload: announcement.allowAttachmentDownload,
      isPinned: announcement.isPinned,
      currentRevision: announcement.currentRevision,
      scheduledAt: announcement.scheduledAt,
      publishedAt: announcement.publishedAt,
      expiresAt: announcement.expiresAt,
      withdrawnAt: announcement.withdrawnAt,
      publishFailureReason: canManage
        ? announcement.publishFailureReason
        : null,
      viewerState: this.serializeRecipientState(
        recipient,
        announcement.currentRevision,
      ),
      canManage,
      attachments:
        announcement.status === AnnouncementStatus.WITHDRAWN && !canManage
          ? []
          : announcement.attachments
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
    division: { id: string; code: string; name: string } | null;
    department: {
      id: string;
      divisionId: string;
      code: string;
      name: string;
    } | null;
    officialConversation: { id: string; title: string | null } | null;
  }) {
    return {
      type: announcement.audienceType,
      division: announcement.division,
      department: announcement.department,
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
    createdAt: Date;
  }) {
    return {
      id: attachment.id,
      originalFileName: attachment.originalFileName,
      mimeType: attachment.mimeType,
      fileSizeBytes: attachment.fileSizeBytes,
      category: attachment.contentCategory,
      scanStatus: attachment.scanStatus,
      createdAt: attachment.createdAt,
    };
  }

  private safeAuditMetadata(announcement: {
    id: string;
    audienceType: AnnouncementAudienceType;
    divisionId: string | null;
    departmentId: string | null;
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

    if (announcement.divisionId) {
      metadata.divisionId = announcement.divisionId;
    }
    if (announcement.departmentId) {
      metadata.departmentId = announcement.departmentId;
    }
    if (announcement.officialConversationId) {
      metadata.officialConversationId = announcement.officialConversationId;
    }

    return metadata;
  }

  private eventPayload(
    action: 'PUBLISHED' | 'UPDATED' | 'WITHDRAWN' | 'READ' | 'ACKNOWLEDGED',
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
    action: 'UPDATED' | 'WITHDRAWN',
    announcement: AnnouncementDetailRecord,
    actorAccountId: string,
  ): void {
    const payload = this.eventPayload(
      action,
      announcement,
      actorAccountId,
    );

    if (action === 'WITHDRAWN') {
      this.messagingEventsService.emitAnnouncementWithdrawn(
        [...accountIds, announcement.createdByAccountId],
        payload,
      );
    } else {
      this.messagingEventsService.emitAnnouncementUpdated(
        [...accountIds, announcement.createdByAccountId],
        payload,
      );
    }
  }

  private validateAttachment(file?: UploadedMessageAttachmentFile): {
    originalFileName: string;
    category: AnnouncementAttachmentCategory;
  } {
    if (!file?.buffer || file.size <= 0) {
      throw new BadRequestException('Announcement attachment is required.');
    }

    const originalFileName = this.normalizeFileName(file.originalname);
    this.assertAttachmentSignature(file);

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

  private assertAttachmentSignature(
    file: UploadedMessageAttachmentFile,
  ): void {
    const buffer = file.buffer;
    const startsWith = (...bytes: number[]): boolean =>
      bytes.every((byte, index) => buffer[index] === byte);
    const ascii = (start: number, end: number): string =>
      buffer.subarray(start, end).toString('ascii');
    let valid = true;

    switch (file.mimetype) {
      case 'image/jpeg':
        valid = startsWith(0xff, 0xd8, 0xff);
        break;
      case 'image/png':
        valid = startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
        break;
      case 'image/webp':
        valid = ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
        break;
      case 'video/mp4':
        valid = ascii(4, 8) === 'ftyp';
        break;
      case 'video/webm':
        valid = startsWith(0x1a, 0x45, 0xdf, 0xa3);
        break;
      case 'application/pdf':
        valid = ascii(0, 5) === '%PDF-';
        break;
      case 'application/zip':
      case 'application/x-zip-compressed':
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        valid =
          startsWith(0x50, 0x4b, 0x03, 0x04) ||
          startsWith(0x50, 0x4b, 0x05, 0x06) ||
          startsWith(0x50, 0x4b, 0x07, 0x08);
        break;
      case 'text/plain':
      case 'text/csv':
        valid = !buffer.subarray(0, Math.min(buffer.length, 8192)).includes(0);
        break;
      default:
        valid = false;
    }

    if (!valid) {
      throw new BadRequestException(
        'The attachment content does not match its declared file type.',
      );
    }
  }

  private normalizeFileName(fileName: string): string {
    const normalized = fileName
      .normalize('NFKC')
      .replace(/[\\/\0]/g, '_')
      .replace(/[\r\n]/g, ' ')
      .trim();

    return (normalized || 'announcement-attachment').slice(0, 180);
  }

  private resolveAttachmentPath(storageKey: string): string {
    const absolutePath = path.resolve(ANNOUNCEMENT_STORAGE_DIR, storageKey);

    if (!absolutePath.startsWith(`${ANNOUNCEMENT_STORAGE_DIR}${path.sep}`)) {
      throw new BadRequestException('Announcement attachment key is invalid.');
    }

    return absolutePath;
  }

  private async writeAttachmentFile(
    storageKey: string,
    file: UploadedMessageAttachmentFile,
  ): Promise<void> {
    const absolutePath = this.resolveAttachmentPath(storageKey);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });

    // Exclusive creation prevents an unexpected storage-key collision.
    await fs.writeFile(absolutePath, file.buffer, {
      flag: 'wx',
      mode: 0o600,
    });
  }

  private async deleteAttachmentFile(storageKey: string): Promise<void> {
    try {
      await fs.unlink(this.resolveAttachmentPath(storageKey));
    } catch {
      // Best-effort cleanup never replaces the database as source of truth.
    }
  }

  private async deleteAnnouncementAttachmentDirectory(
    announcementId: string,
  ): Promise<void> {
    const directory = path.dirname(
      this.resolveAttachmentPath(`${announcementId}/retention-cleanup`),
    );

    // The directory contains only files belonging to this announcement ID.
    await fs.rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
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
