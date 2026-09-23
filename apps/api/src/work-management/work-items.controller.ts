import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';

import { AttachmentTempCleanupInterceptor } from '../attachments/attachment-temp-cleanup.interceptor';
import { createBoundedAttachmentTempStorage } from '../attachments/attachment-upload-temp-storage';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccountClasses } from '../auth/decorators/account-classes.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { AccountClassesGuard } from '../auth/guards/account-classes.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import type { UploadedMessageAttachmentFile } from '../conversations/types/uploaded-message-attachment-file';
import { AccountClass } from '../generated/prisma/client';
import { CancelWorkItemDto } from './dto/cancel-work-item.dto';
import { CompleteSalesWorkDto } from './dto/complete-sales-work.dto';
import { CreateWorkItemDto } from './dto/create-work-item.dto';
import { ListWorkItemsQueryDto } from './dto/list-work-items-query.dto';
import { ManageWorkSupportDto } from './dto/manage-work-support.dto';
import { ReassignWorkDto } from './dto/reassign-work.dto';
import { ReviewWorkCompletionDto } from './dto/review-work-completion.dto';
import { SendWorkToSalesDto } from './dto/send-work-to-sales.dto';
import { SubmitWorkCompletionDto } from './dto/submit-work-completion.dto';
import { UpdateWorkItemDto } from './dto/update-work-item.dto';
import { CreateWorkSalesMessageDto } from './dto/create-work-sales-message.dto';
import { ManageWorkRetentionDto } from './dto/manage-work-retention.dto';
import { RequestWorkHelpDto } from './dto/request-work-help.dto';
import { RespondWorkHelpDto } from './dto/respond-work-help.dto';
import { WorkItemsService } from './work-items.service';
import { WorkLifecycleService } from './work-lifecycle.service';
import { WorkRetentionService } from './work-retention.service';
import { WorkSalesCommunicationService } from './work-sales-communication.service';
import {
  MAX_WORK_SALES_ATTACHMENT_FILES,
  MAX_WORK_SALES_ATTACHMENT_FILE_BYTES,
  MAX_WORK_SALES_ATTACHMENT_TOTAL_BYTES,
} from './work-sales-attachment.constants';
import {
  MAX_WORK_COMPLETION_ATTACHMENT_FILES,
  MAX_WORK_COMPLETION_ATTACHMENT_FILE_BYTES,
  MAX_WORK_COMPLETION_ATTACHMENT_TOTAL_BYTES,
} from './work-completion-attachment.constants';

const ALL_ACCOUNT_CLASSES = [
  AccountClass.SUPER_ADMIN,
  AccountClass.OFFICE_USER,
] as const;

const OFFICE_USER_ONLY = [AccountClass.OFFICE_USER] as const;
const SYSTEM_ADMIN_ONLY = [AccountClass.SUPER_ADMIN] as const;

@Controller('work-items')
@UseGuards(AccessTokenGuard, AccountClassesGuard)
export class WorkItemsController {
  constructor(
    private readonly workItemsService: WorkItemsService,
    private readonly workLifecycleService: WorkLifecycleService,
    private readonly workRetentionService: WorkRetentionService,
    private readonly workSalesCommunicationService: WorkSalesCommunicationService,
  ) {}

  @Get('offices/:officeId/create-context')
  @AccountClasses(...OFFICE_USER_ONLY)
  getCreateContext(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
  ) {
    return this.workItemsService.getCreateContext(user, officeId);
  }

  @Post('offices/:officeId')
  @AccountClasses(...OFFICE_USER_ONLY)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Body() dto: CreateWorkItemDto,
  ) {
    return this.workItemsService.create(user, officeId, dto);
  }

  @Get()
  @AccountClasses(...ALL_ACCOUNT_CLASSES)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListWorkItemsQueryDto,
  ) {
    return this.workItemsService.list(user, query);
  }

  @Patch(':workItemId')
  @AccountClasses(...OFFICE_USER_ONLY)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: UpdateWorkItemDto,
  ) {
    return this.workItemsService.updateDetails(user, workItemId, dto);
  }

  @Post(':workItemId/acknowledge')
  @AccountClasses(...OFFICE_USER_ONLY)
  acknowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
  ) {
    return this.workItemsService.acknowledge(user, workItemId);
  }

  @Post(':workItemId/start')
  @AccountClasses(...OFFICE_USER_ONLY)
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
  ) {
    return this.workItemsService.start(user, workItemId);
  }

  @Post(':workItemId/completion-reports')
  @AccountClasses(...OFFICE_USER_ONLY)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'files', maxCount: MAX_WORK_COMPLETION_ATTACHMENT_FILES },
        { name: 'file', maxCount: 1 },
      ],
      {
        storage: createBoundedAttachmentTempStorage(
          MAX_WORK_COMPLETION_ATTACHMENT_TOTAL_BYTES,
          'Completion evidence must total 50 MB or smaller.',
        ),
        limits: {
          fileSize: MAX_WORK_COMPLETION_ATTACHMENT_FILE_BYTES,
          files: MAX_WORK_COMPLETION_ATTACHMENT_FILES,
        },
      },
    ),
    AttachmentTempCleanupInterceptor,
  )
  submitCompletion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @UploadedFiles()
    uploadedFiles:
      | {
          files?: UploadedMessageAttachmentFile[];
          file?: UploadedMessageAttachmentFile[];
        }
      | undefined,
    @Body() dto: SubmitWorkCompletionDto,
  ) {
    const files = [
      ...(uploadedFiles?.files ?? []),
      ...(uploadedFiles?.file ?? []),
    ];
    return this.workLifecycleService.submitCompletion(
      user,
      workItemId,
      dto,
      files,
    );
  }

  @Get(':workItemId/completion-reports/:reportId/evidence/:evidenceId')
  @AccountClasses(...ALL_ACCOUNT_CLASSES)
  async downloadCompletionEvidence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Param('reportId', new ParseUUIDPipe({ version: '4' })) reportId: string,
    @Param('evidenceId', new ParseUUIDPipe({ version: '4' }))
    evidenceId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const evidence =
      await this.workLifecycleService.getCompletionEvidenceDownload(
        user,
        workItemId,
        reportId,
        evidenceId,
      );
    const safeFileName = evidence.originalFileName.replace(/[\r\n"]/g, '_');
    const encodedFileName = encodeURIComponent(evidence.originalFileName);
    response.setHeader('Content-Type', evidence.mimeType);
    response.setHeader('Content-Length', String(evidence.fileSizeBytes));
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`,
    );
    return new StreamableFile(createReadStream(evidence.absolutePath));
  }

  @Post(':workItemId/review/request-information')
  @AccountClasses(...OFFICE_USER_ONLY)
  requestInformation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: ReviewWorkCompletionDto,
  ) {
    return this.workLifecycleService.requestMoreInformation(
      user,
      workItemId,
      dto,
    );
  }

  @Post(':workItemId/review/close')
  @AccountClasses(...OFFICE_USER_ONLY)
  close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: ReviewWorkCompletionDto,
  ) {
    return this.workLifecycleService.close(user, workItemId, dto);
  }

  @Post(':workItemId/review/reopen')
  @AccountClasses(...OFFICE_USER_ONLY)
  reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: ReviewWorkCompletionDto,
  ) {
    return this.workLifecycleService.reopen(user, workItemId, dto);
  }

  @Post(':workItemId/cancel')
  @AccountClasses(...OFFICE_USER_ONLY)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: CancelWorkItemDto,
  ) {
    return this.workLifecycleService.cancel(user, workItemId, dto);
  }

  @Post(':workItemId/reassign')
  @AccountClasses(...OFFICE_USER_ONLY)
  reassign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: ReassignWorkDto,
  ) {
    return this.workLifecycleService.reassign(user, workItemId, dto);
  }

  @Post(':workItemId/support/add')
  @AccountClasses(...OFFICE_USER_ONLY)
  addSupport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: ManageWorkSupportDto,
  ) {
    return this.workLifecycleService.addSupport(user, workItemId, dto);
  }

  @Post(':workItemId/support/remove')
  @AccountClasses(...OFFICE_USER_ONLY)
  removeSupport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: ManageWorkSupportDto,
  ) {
    return this.workLifecycleService.removeSupport(user, workItemId, dto);
  }

  @Post(':workItemId/sales/send')
  @AccountClasses(...OFFICE_USER_ONLY)
  sendToSales(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: SendWorkToSalesDto,
  ) {
    return this.workLifecycleService.sendToSales(user, workItemId, dto);
  }

  @Post(':workItemId/sales/complete')
  @AccountClasses(...OFFICE_USER_ONLY)
  completeSales(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: CompleteSalesWorkDto,
  ) {
    return this.workLifecycleService.completeSalesWork(user, workItemId, dto);
  }

  @Get('help-requests/pending')
  @AccountClasses(...ALL_ACCOUNT_CLASSES)
  listPendingHelpRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.workLifecycleService.listPendingHelpRequests(user);
  }

  @Post('help-requests/:helpRequestId/respond')
  @AccountClasses(...OFFICE_USER_ONLY)
  respondToHelpRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('helpRequestId', new ParseUUIDPipe({ version: '4' }))
    helpRequestId: string,
    @Body() dto: RespondWorkHelpDto,
  ) {
    return this.workLifecycleService.respondToHelpRequest(
      user,
      helpRequestId,
      dto,
    );
  }

  @Post(':workItemId/retention/hold')
  @AccountClasses(...SYSTEM_ADMIN_ONLY)
  placeRetentionHold(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: ManageWorkRetentionDto,
  ) {
    return this.workRetentionService.placeHold(user, workItemId, dto);
  }

  @Delete(':workItemId/retention/hold')
  @AccountClasses(...SYSTEM_ADMIN_ONLY)
  releaseRetentionHold(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
  ) {
    return this.workRetentionService.releaseHold(user, workItemId);
  }

  @Post(':workItemId/retention/deletion-request')
  @AccountClasses(...SYSTEM_ADMIN_ONLY)
  requestDeletionReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: ManageWorkRetentionDto,
  ) {
    return this.workRetentionService.requestDeletionReview(
      user,
      workItemId,
      dto,
    );
  }

  @Delete(':workItemId/retention/deletion-request')
  @AccountClasses(...SYSTEM_ADMIN_ONLY)
  cancelDeletionReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
  ) {
    return this.workRetentionService.cancelDeletionReview(user, workItemId);
  }

  @Get(':workItemId/completion-reports')
  @AccountClasses(...ALL_ACCOUNT_CLASSES)
  listCompletionReports(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
  ) {
    return this.workLifecycleService.listCompletionReports(user, workItemId);
  }

  @Get(':workItemId/help-requests')
  @AccountClasses(...ALL_ACCOUNT_CLASSES)
  listHelpRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
  ) {
    return this.workLifecycleService.listHelpRequests(user, workItemId);
  }

  @Post(':workItemId/help-requests')
  @AccountClasses(...OFFICE_USER_ONLY)
  requestHelp(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Body() dto: RequestWorkHelpDto,
  ) {
    return this.workLifecycleService.requestHelp(user, workItemId, dto);
  }

  @Get(':workItemId/sales/messages')
  @AccountClasses(...ALL_ACCOUNT_CLASSES)
  listSalesMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
  ) {
    return this.workSalesCommunicationService.listMessages(user, workItemId);
  }

  @Post(':workItemId/sales/messages')
  @AccountClasses(...OFFICE_USER_ONLY)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'files', maxCount: MAX_WORK_SALES_ATTACHMENT_FILES },
        { name: 'file', maxCount: 1 },
      ],
      {
        storage: createBoundedAttachmentTempStorage(
          MAX_WORK_SALES_ATTACHMENT_TOTAL_BYTES,
          'Files in one send must total 50 MB or smaller.',
        ),
        limits: {
          fileSize: MAX_WORK_SALES_ATTACHMENT_FILE_BYTES,
          files: MAX_WORK_SALES_ATTACHMENT_FILES,
        },
      },
    ),
    AttachmentTempCleanupInterceptor,
  )
  createSalesMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @UploadedFiles()
    uploadedFiles:
      | {
          files?: UploadedMessageAttachmentFile[];
          file?: UploadedMessageAttachmentFile[];
        }
      | undefined,
    @Body() dto: CreateWorkSalesMessageDto,
  ) {
    const files = [
      ...(uploadedFiles?.files ?? []),
      ...(uploadedFiles?.file ?? []),
    ];
    return this.workSalesCommunicationService.createMessage(
      user,
      workItemId,
      dto,
      files,
    );
  }

  @Get(':workItemId/sales/messages/:messageId/attachments/:attachmentId')
  @AccountClasses(...ALL_ACCOUNT_CLASSES)
  async downloadSalesAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
    @Param('messageId', new ParseUUIDPipe({ version: '4' }))
    messageId: string,
    @Param('attachmentId', new ParseUUIDPipe({ version: '4' }))
    attachmentId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const attachment =
      await this.workSalesCommunicationService.getAttachmentDownload(
        user,
        workItemId,
        messageId,
        attachmentId,
      );
    const safeFileName = attachment.originalFileName.replace(/[\r\n"]/g, '_');
    const encodedFileName = encodeURIComponent(attachment.originalFileName);
    const inline =
      attachment.mimeType.startsWith('image/') ||
      attachment.mimeType === 'application/pdf' ||
      attachment.mimeType.startsWith('text/');

    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Length', String(attachment.fileSizeBytes));
    response.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`,
    );

    return new StreamableFile(createReadStream(attachment.absolutePath));
  }
  @Get(':workItemId')
  @AccountClasses(...ALL_ACCOUNT_CLASSES)
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workItemId', new ParseUUIDPipe({ version: '4' }))
    workItemId: string,
  ) {
    return this.workItemsService.getById(user, workItemId);
  }
}
