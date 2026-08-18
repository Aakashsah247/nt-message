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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import { AttachmentStorageService } from '../attachments/attachment-storage.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import type { UploadedMessageAttachmentFile } from '../conversations/types/uploaded-message-attachment-file';
import { AttachmentTempCleanupInterceptor } from '../attachments/attachment-temp-cleanup.interceptor';
import { createBoundedAttachmentTempStorage } from '../attachments/attachment-upload-temp-storage';
import { AnnouncementsService } from './announcements.service';
import { AttachmentDispositionQueryDto } from './dto/attachment-disposition-query.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { ListAnnouncementsQueryDto } from './dto/list-announcements-query.dto';
import { ListOfficialGroupAnnouncementsQueryDto } from './dto/list-official-group-announcements-query.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@Controller('announcements')
@UseGuards(AccessTokenGuard)
export class AnnouncementsController {
  constructor(
    private readonly announcementsService: AnnouncementsService,
    private readonly attachmentStorageService: AttachmentStorageService,
  ) {}

  @Get('audiences')
  listAvailableAudiences(@CurrentUser() user: AuthenticatedUser) {
    return this.announcementsService.listAvailableAudiences(user);
  }

  @Get('official-groups/:conversationId/references')
  listOfficialGroupReferences(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' }))
    conversationId: string,
    @Query() query: ListOfficialGroupAnnouncementsQueryDto,
  ) {
    return this.announcementsService.listOfficialGroupReferences(
      user,
      conversationId,
      query,
    );
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAnnouncementsQueryDto,
  ) {
    return this.announcementsService.list(user, query);
  }

  @Post()
  createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.announcementsService.createDraft(user, dto);
  }

  @Get(':announcementId')
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('announcementId', new ParseUUIDPipe({ version: '4' }))
    announcementId: string,
  ) {
    return this.announcementsService.getById(user, announcementId);
  }

  @Patch(':announcementId')
  updateAnnouncement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('announcementId', new ParseUUIDPipe({ version: '4' }))
    announcementId: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.announcementsService.updateAnnouncement(
      user,
      announcementId,
      dto,
    );
  }

  @Delete(':announcementId')
  deleteAnnouncement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('announcementId', new ParseUUIDPipe({ version: '4' }))
    announcementId: string,
  ) {
    return this.announcementsService.deleteAnnouncement(user, announcementId);
  }

  @Post(':announcementId/publish')
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('announcementId', new ParseUUIDPipe({ version: '4' }))
    announcementId: string,
  ) {
    return this.announcementsService.publish(user, announcementId);
  }

  @Post(':announcementId/read')
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('announcementId', new ParseUUIDPipe({ version: '4' }))
    announcementId: string,
  ) {
    return this.announcementsService.markRead(user, announcementId);
  }

  @Post(':announcementId/acknowledge')
  acknowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('announcementId', new ParseUUIDPipe({ version: '4' }))
    announcementId: string,
  ) {
    return this.announcementsService.acknowledge(user, announcementId);
  }

  @Get(':announcementId/report')
  getReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('announcementId', new ParseUUIDPipe({ version: '4' }))
    announcementId: string,
  ) {
    return this.announcementsService.getReport(user, announcementId);
  }

  @Post(':announcementId/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: createBoundedAttachmentTempStorage(
        200 * 1024 * 1024,
        'Announcement attachment must be 200 MB or smaller.',
      ),
      limits: { fileSize: 200 * 1024 * 1024 },
    }),
    AttachmentTempCleanupInterceptor,
  )
  uploadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('announcementId', new ParseUUIDPipe({ version: '4' }))
    announcementId: string,
    @UploadedFile() file: UploadedMessageAttachmentFile | undefined,
  ) {
    return this.announcementsService.uploadAttachment(
      user,
      announcementId,
      file,
    );
  }

  @Delete(':announcementId/attachments/:attachmentId')
  removeAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('announcementId', new ParseUUIDPipe({ version: '4' }))
    announcementId: string,
    @Param('attachmentId', new ParseUUIDPipe({ version: '4' }))
    attachmentId: string,
  ) {
    return this.announcementsService.removeAttachment(
      user,
      announcementId,
      attachmentId,
    );
  }

  @Get(':announcementId/attachments/:attachmentId')
  async downloadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('announcementId', new ParseUUIDPipe({ version: '4' }))
    announcementId: string,
    @Param('attachmentId', new ParseUUIDPipe({ version: '4' }))
    attachmentId: string,
    @Query() query: AttachmentDispositionQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const attachment = await this.announcementsService.getAttachmentDownload(
      user,
      announcementId,
      attachmentId,
      query.disposition,
    );
    const safeName = attachment.originalFileName.replace(/[\r\n"]/g, '_');
    const encodedName = encodeURIComponent(attachment.originalFileName);
    const disposition =
      attachment.disposition === 'download' ? 'attachment' : 'inline';

    // Protected files use private caching and never expose their storage key.
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('Content-Length', attachment.fileSizeBytes);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodedName}`,
    );

    return new StreamableFile(
      await this.attachmentStorageService.openReadStream(
        'announcements',
        attachment.storageKey,
      ),
    );
  }
}
