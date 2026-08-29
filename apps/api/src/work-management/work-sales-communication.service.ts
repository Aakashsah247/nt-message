import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AttachmentSecurityService } from '../attachments/attachment-security.service';
import { AttachmentStorageService } from '../attachments/attachment-storage.service';
import { assertAttachmentFileMatchesDeclaredType } from '../attachments/attachment-file-validation';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import type { UploadedMessageAttachmentFile } from '../conversations/types/uploaded-message-attachment-file';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
  WorkAssignmentRole,
  WorkItemStatus,
  WorkSalesCoordinationStatus,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { CreateWorkSalesMessageDto } from './dto/create-work-sales-message.dto';
import {
  MAX_WORK_SALES_ATTACHMENT_FILES,
  MAX_WORK_SALES_ATTACHMENT_FILE_BYTES,
  MAX_WORK_SALES_ATTACHMENT_TOTAL_BYTES,
  WORK_SALES_ATTACHMENT_MIME_TYPES,
} from './work-sales-attachment.constants';
import { WorkNotificationsService } from './work-notifications.service';
import { WorkScopeService } from './work-scope.service';

const salesMessageSelect = {
  id: true,
  workItemId: true,
  senderAccountId: true,
  text: true,
  createdAt: true,
  sender: {
    select: {
      id: true,
      username: true,
      role: true,
      employee: {
        select: {
          empName: true,
          designation: true,
        },
      },
    },
  },
  attachments: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      originalFileName: true,
      mimeType: true,
      fileSizeBytes: true,
      scanStatus: true,
      createdAt: true,
    },
  },
} satisfies Prisma.WorkSalesMessageSelect;

type SalesMessageRecord = Prisma.WorkSalesMessageGetPayload<{
  select: typeof salesMessageSelect;
}>;

interface SalesAccessContext {
  workItem: {
    id: string;
    ticketNumber: string;
    title: string;
    status: WorkItemStatus;
    assignedTeamId: string | null;
    salesMemberAccountId: string | null;
    responsibleManagerAccountId: string;
    salesCoordinationStatus: WorkSalesCoordinationStatus | null;
    assignments: Array<{
      assigneeAccountId: string;
      assignmentRole: WorkAssignmentRole;
      endedAt: Date | null;
    }>;
  };
  actorAccountId: string;
  isPrimaryTeamMember: boolean;
  isSalesMember: boolean;
  isResponsibleManager: boolean;
}

@Injectable()
export class WorkSalesCommunicationService {
  private readonly logger = new Logger(WorkSalesCommunicationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workScopeService: WorkScopeService,
    private readonly workNotificationsService: WorkNotificationsService,
    private readonly attachmentStorageService: AttachmentStorageService,
    private readonly attachmentSecurityService: AttachmentSecurityService,
  ) {}

  async listMessages(user: AuthenticatedUser, workItemId: string) {
    const access = await this.resolveAccess(user, workItemId);

    if (
      access.isSalesMember &&
      access.workItem.salesCoordinationStatus ===
        WorkSalesCoordinationStatus.WAITING_FOR_DOCUMENTS
    ) {
      // Files may be prepared by the field team before the explicit Send to Sales action.
      return { messages: [] };
    }

    const messages = await this.prisma.workSalesMessage.findMany({
      where: { workItemId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: salesMessageSelect,
    });

    return { messages: messages.map((message) => this.serializeMessage(message)) };
  }

  async createMessage(
    user: AuthenticatedUser,
    workItemId: string,
    dto: CreateWorkSalesMessageDto,
    files: UploadedMessageAttachmentFile[] = [],
  ) {
    const access = await this.resolveAccess(user, workItemId);
    this.assertCanSend(access);

    const text = this.normalizeOptionalText(dto.text);
    const attachments = this.validateFiles(files);
    if (!text && attachments.length === 0) {
      throw new BadRequestException('Add a message or a file before sending.');
    }

    const messageId = randomUUID();
    const storedKeys: string[] = [];
    let persisted = false;
    const prepared: Array<{
      id: string;
      storageKey: string;
      originalFileName: string;
      mimeType: string;
      fileSizeBytes: number;
      scanStatus: string;
    }> = [];

    try {
      for (const attachment of attachments) {
        const scanStatus = await this.attachmentSecurityService.scanValidatedUpload(
          attachment.file,
        );
        const attachmentId = randomUUID();
        const storageKey = `${workItemId}/sales/${messageId}/${attachmentId}-${attachment.originalFileName}`;
        await this.attachmentStorageService.writeUploadedFile(
          'work',
          storageKey,
          attachment.file,
        );
        storedKeys.push(storageKey);
        prepared.push({
          id: attachmentId,
          storageKey,
          originalFileName: attachment.originalFileName,
          mimeType: attachment.file.mimetype,
          fileSizeBytes: attachment.file.size,
          scanStatus,
        });
      }

      const message = await this.prisma.workSalesMessage.create({
        data: {
          id: messageId,
          workItemId,
          senderAccountId: access.actorAccountId,
          text,
          attachments: prepared.length
            ? {
                create: prepared.map((attachment) => ({
                  id: attachment.id,
                  storageKey: attachment.storageKey,
                  originalFileName: attachment.originalFileName,
                  mimeType: attachment.mimeType,
                  fileSizeBytes: attachment.fileSizeBytes,
                  scanStatus: attachment.scanStatus,
                })),
              }
            : undefined,
        },
        select: salesMessageSelect,
      });

      persisted = true;
      try {
        await this.publishMessageUpdate(access, message.id);
      } catch (error) {
        // File/message persistence is authoritative; a realtime notification failure
        // must not turn a successful upload into a broken retry or dangling row.
        this.logger.warn(
          `Sales message notification failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
      return {
        message: 'Sent.',
        salesMessage: this.serializeMessage(message),
      };
    } catch (error) {
      if (!persisted) {
        await Promise.all(
          storedKeys.map((storageKey) =>
            this.attachmentStorageService.deleteFile('work', storageKey),
          ),
        );
      }
      throw error;
    }
  }

  async getAttachmentDownload(
    user: AuthenticatedUser,
    workItemId: string,
    messageId: string,
    attachmentId: string,
  ) {
    const access = await this.resolveAccess(user, workItemId);
    if (
      access.isSalesMember &&
      access.workItem.salesCoordinationStatus ===
        WorkSalesCoordinationStatus.WAITING_FOR_DOCUMENTS
    ) {
      throw new ForbiddenException('Wait until the work is sent to Sales.');
    }

    const attachment = await this.prisma.workSalesAttachment.findFirst({
      where: {
        id: attachmentId,
        messageId,
        message: { is: { workItemId } },
      },
      select: {
        storageKey: true,
        originalFileName: true,
        mimeType: true,
        fileSizeBytes: true,
        scanStatus: true,
      },
    });
    if (!attachment) {
      throw new NotFoundException('File not found.');
    }
    if (!this.attachmentSecurityService.canAccessStoredAttachment(attachment.scanStatus)) {
      throw new ForbiddenException('This file is not available yet.');
    }
    if (!(await this.attachmentStorageService.exists('work', attachment.storageKey))) {
      throw new ServiceUnavailableException('This file is temporarily unavailable.');
    }

    return {
      originalFileName: attachment.originalFileName,
      mimeType: attachment.mimeType,
      fileSizeBytes: attachment.fileSizeBytes,
      absolutePath: this.attachmentStorageService.resolvePath(
        'work',
        attachment.storageKey,
      ),
    };
  }

  private async resolveAccess(
    user: AuthenticatedUser,
    workItemId: string,
  ): Promise<SalesAccessContext> {
    const actor = await this.workScopeService.resolveActorContext(user);
    const workItem = await this.prisma.workItem.findUnique({
      where: { id: workItemId },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        assignedTeamId: true,
        salesMemberAccountId: true,
        responsibleManagerAccountId: true,
        salesCoordinationStatus: true,
        assignments: {
          where: { endedAt: null },
          select: {
            assigneeAccountId: true,
            assignmentRole: true,
            endedAt: true,
          },
        },
      },
    });
    if (!workItem || !workItem.salesMemberAccountId) {
      throw new NotFoundException('Sales work not found.');
    }

    const isSalesMember = workItem.salesMemberAccountId === actor.accountId;
    const isResponsibleManager =
      workItem.responsibleManagerAccountId === actor.accountId;
    const isActivePrimary = workItem.assignments.some(
      (assignment) =>
        assignment.assignmentRole === WorkAssignmentRole.PRIMARY &&
        assignment.assigneeAccountId === actor.accountId,
    );
    let isPrimaryTeamMember = isActivePrimary;

    if (!isPrimaryTeamMember && workItem.assignedTeamId && actor.role === AccountRole.EMPLOYEE) {
      const membership = await this.prisma.departmentTeamMember.findFirst({
        where: {
          teamId: workItem.assignedTeamId,
          team: { is: { isActive: true, archivedAt: null } },
          employee: {
            is: {
              status: EmployeeStatus.ACTIVE,
              employmentStatus: EmploymentStatus.ACTIVE,
              archivedAt: null,
              isActivated: true,
              account: {
                is: {
                  id: actor.accountId,
                  isEnabled: true,
                  role: AccountRole.EMPLOYEE,
                },
              },
            },
          },
        },
        select: { id: true },
      });
      isPrimaryTeamMember = Boolean(membership);
    }

    if (!isSalesMember && !isResponsibleManager && !isPrimaryTeamMember) {
      throw new ForbiddenException('You cannot open these Sales files.');
    }

    return {
      workItem,
      actorAccountId: actor.accountId,
      isPrimaryTeamMember,
      isSalesMember,
      isResponsibleManager,
    };
  }

  private assertCanSend(access: SalesAccessContext): void {
    if (access.isResponsibleManager && !access.isPrimaryTeamMember && !access.isSalesMember) {
      throw new ForbiddenException('Managers can view Sales files but cannot send them.');
    }
    if (
      access.workItem.status === WorkItemStatus.CLOSED ||
      access.workItem.status === WorkItemStatus.CANCELLED
    ) {
      throw new ConflictException('This work is already finished.');
    }
    if (access.workItem.salesCoordinationStatus === WorkSalesCoordinationStatus.COMPLETED) {
      throw new ConflictException('Sales work is already completed.');
    }
    if (
      access.isSalesMember &&
      access.workItem.salesCoordinationStatus !== WorkSalesCoordinationStatus.READY_FOR_SALES
    ) {
      throw new ConflictException('Wait until the work is sent to Sales.');
    }
    if (
      access.isPrimaryTeamMember &&
      access.workItem.salesCoordinationStatus !== WorkSalesCoordinationStatus.WAITING_FOR_DOCUMENTS &&
      access.workItem.salesCoordinationStatus !== WorkSalesCoordinationStatus.READY_FOR_SALES
    ) {
      throw new ConflictException('Sales files cannot be changed now.');
    }
  }

  private validateFiles(files: UploadedMessageAttachmentFile[]) {
    if (files.length > MAX_WORK_SALES_ATTACHMENT_FILES) {
      throw new BadRequestException(
        `You can add up to ${MAX_WORK_SALES_ATTACHMENT_FILES} files at a time.`,
      );
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_WORK_SALES_ATTACHMENT_TOTAL_BYTES) {
      throw new BadRequestException('Files in one send must total 50 MB or smaller.');
    }

    return files.map((file) => {
      if ((!file.buffer && !file.path) || file.size <= 0) {
        throw new BadRequestException('One of the files is empty.');
      }
      if (file.size > MAX_WORK_SALES_ATTACHMENT_FILE_BYTES) {
        throw new BadRequestException('Each Sales file must be 25 MB or smaller.');
      }
      if (!WORK_SALES_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException(
          'Use an image, PDF, Word, Excel, PowerPoint, TXT, CSV or ZIP file.',
        );
      }
      assertAttachmentFileMatchesDeclaredType(file);
      return {
        file,
        originalFileName: this.normalizeFileName(file.originalname),
      };
    });
  }

  private normalizeFileName(value: string): string {
    const normalized = value
      .normalize('NFKC')
      .replace(/[\\/\0]/g, '_')
      .replace(/[\r\n]/g, ' ')
      .trim();
    return (normalized || 'file').slice(0, 180);
  }

  private normalizeOptionalText(value: string | undefined): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private serializeMessage(message: SalesMessageRecord) {
    const sender = message.sender;
    return {
      id: message.id,
      workItemId: message.workItemId,
      senderAccountId: message.senderAccountId,
      senderName:
        sender.employee?.empName ??
        sender.username ??
        (sender.role === AccountRole.SUPER_ADMIN ? 'Super Admin' : 'NT Message User'),
      senderRole: sender.role,
      senderDesignation: sender.employee?.designation ?? null,
      text: message.text,
      attachments: message.attachments.map((attachment) => ({
        id: attachment.id,
        originalFileName: attachment.originalFileName,
        mimeType: attachment.mimeType,
        fileSizeBytes: attachment.fileSizeBytes,
        createdAt: attachment.createdAt,
      })),
      createdAt: message.createdAt,
    };
  }

  private async publishMessageUpdate(
    access: SalesAccessContext,
    messageId: string,
  ): Promise<void> {
    // Draft files prepared before Send to Sales stay quiet until the explicit handoff.
    if (
      access.isPrimaryTeamMember &&
      access.workItem.salesCoordinationStatus ===
        WorkSalesCoordinationStatus.WAITING_FOR_DOCUMENTS
    ) {
      return;
    }

    const activePrimaryIds = access.workItem.assignments
      .filter((assignment) => assignment.assignmentRole === WorkAssignmentRole.PRIMARY)
      .map((assignment) => assignment.assigneeAccountId);
    const notificationRecipients = access.isSalesMember
      ? activePrimaryIds
      : access.workItem.salesMemberAccountId
        ? [access.workItem.salesMemberAccountId]
        : [];

    await this.workNotificationsService.publishWorkUpdate({
      workItem: access.workItem,
      action: 'SALES_MESSAGE_ADDED',
      actorAccountId: access.actorAccountId,
      recipientAccountIds: notificationRecipients,
      notificationRecipientAccountIds: notificationRecipients,
      title: access.isSalesMember ? 'Sales sent an update' : 'New file for Sales',
      body: `${access.workItem.ticketNumber}: ${access.workItem.title}`,
      metadata: { salesMessageId: messageId },
    });
  }
}
