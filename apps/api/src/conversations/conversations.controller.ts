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
import { createReadStream } from 'node:fs';
import type { Response } from 'express';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';

import { ConversationsService } from './conversations.service';
import { AddGroupMembersDto } from './dto/add-group-members.dto';
import { CreateGroupConversationDto } from './dto/create-group-conversation.dto';
import { CreateOfficialGroupConversationDto } from './dto/create-official-group-conversation.dto';
import { CreatePrivateConversationDto } from './dto/create-private-conversation.dto';
import { ForwardTextMessageDto } from './dto/forward-text-message.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { ListOfficialGroupAuditQueryDto } from './dto/list-official-group-audit-query.dto';
import { SearchMessagingContactsQueryDto } from './dto/search-messaging-contacts-query.dto';
import { SearchMessagesQueryDto } from './dto/search-messages-query.dto';
import { SendTextMessageDto } from './dto/send-text-message.dto';
import { SendAttachmentMessageDto } from './dto/send-attachment-message.dto';
import { UpdateGroupConversationDto } from './dto/update-group-conversation.dto';
import { UpdateGroupMemberRoleDto } from './dto/update-group-member-role.dto';
import { UpdateTextMessageDto } from './dto/update-text-message.dto';
import { UpdateMessagingProfileDto } from './dto/update-messaging-profile.dto';
import { ReactMessageDto } from './dto/react-message.dto';
import type { UploadedMessageAttachmentFile } from './types/uploaded-message-attachment-file';

@Controller('conversations')
@UseGuards(AccessTokenGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}


  @Get('profiles/me')
  getMyMessagingProfile(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.conversationsService.getMyMessagingProfile(user);
  }

  @Patch('profiles/me')
  updateMyMessagingProfile(
    @CurrentUser()
    user: AuthenticatedUser,

    @Body()
    dto: UpdateMessagingProfileDto,
  ) {
    return this.conversationsService.updateMyMessagingProfile(user, dto);
  }

  @Post('profiles/me/photo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  updateMyMessagingProfilePhoto(
    @CurrentUser()
    user: AuthenticatedUser,

    @UploadedFile()
    file: UploadedMessageAttachmentFile | undefined,
  ) {
    return this.conversationsService.updateMyMessagingProfilePhoto(user, file);
  }

  @Delete('profiles/me/photo')
  removeMyMessagingProfilePhoto(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.conversationsService.removeMyMessagingProfilePhoto(user);
  }

  @Get('profiles/employees/:employeeId/photo')
  async downloadMessagingProfilePhotoByEmployee(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'employeeId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    employeeId: string,

    @Res({ passthrough: true })
    response: Response,
  ): Promise<StreamableFile> {
    const photo = await this.conversationsService.getMessagingProfilePhotoByEmployeeDownload(
      user,
      employeeId,
    );

    // Directory profile photos use the same protected response headers as messaging profile photos.
    response.setHeader('Content-Type', photo.mimeType);
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.setHeader('Cache-Control', 'private, max-age=300');

    return new StreamableFile(createReadStream(photo.absolutePath));
  }

  @Get('profiles/:accountId')
  getMessagingProfile(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'accountId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    accountId: string,
  ) {
    return this.conversationsService.getMessagingProfile(user, accountId);
  }

  @Get('profiles/:accountId/photo')
  async downloadMessagingProfilePhoto(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'accountId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    accountId: string,

    @Res({ passthrough: true })
    response: Response,
  ): Promise<StreamableFile> {
    const photo = await this.conversationsService.getMessagingProfilePhotoDownload(
      user,
      accountId,
    );

    // Profile photos are protected resources, not public object-storage URLs.
    response.setHeader('Content-Type', photo.mimeType);
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.setHeader('Cache-Control', 'private, max-age=300');

    return new StreamableFile(createReadStream(photo.absolutePath));
  }

  @Get('contacts')
  searchMessagingContacts(
    @CurrentUser()
    user: AuthenticatedUser,

    @Query()
    query: SearchMessagingContactsQueryDto,
  ) {
    return this.conversationsService.searchMessagingContacts(user, query);
  }

  @Get('requests')
  listMessageRequests(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.conversationsService.listMessageRequests(user);
  }

  @Get('analytics')
  getMessagingAnalytics(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.conversationsService.getMessagingAnalytics(user);
  }

  @Get('notifications')
  listMessagingNotifications(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.conversationsService.listMessagingNotifications(user);
  }

  @Patch('notifications/read')
  markAllMessagingNotificationsRead(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.conversationsService.markAllMessagingNotificationsRead(user);
  }

  @Delete('notifications/read')
  removeReadMessagingNotifications(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.conversationsService.removeReadMessagingNotifications(user);
  }

  @Delete('notifications/:id')
  removeMessagingNotification(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    notificationId: string,
  ) {
    return this.conversationsService.removeMessagingNotification(
      user,
      notificationId,
    );
  }

  @Patch('notifications/:id/read')
  markMessagingNotificationRead(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    notificationId: string,
  ) {
    return this.conversationsService.markMessagingNotificationRead(
      user,
      notificationId,
    );
  }

  @Patch('requests/:id/accept')
  acceptMessageRequest(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    requestId: string,
  ) {
    return this.conversationsService.acceptMessageRequest(user, requestId);
  }

  @Patch('requests/:id/decline')
  declineMessageRequest(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    requestId: string,
  ) {
    return this.conversationsService.declineMessageRequest(user, requestId);
  }

  @Patch('requests/:id/block')
  blockMessageRequest(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    requestId: string,
  ) {
    return this.conversationsService.blockMessageRequest(user, requestId);
  }

  @Get('official-groups/scopes')
  listOfficialGroupScopes(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.conversationsService.listOfficialGroupScopes(user);
  }

  @Post('official-groups')
  createOfficialGroupConversation(
    @CurrentUser()
    user: AuthenticatedUser,

    @Body()
    dto: CreateOfficialGroupConversationDto,
  ) {
    return this.conversationsService.createOfficialGroupConversation(user, dto);
  }

  @Post('official-groups/reconcile')
  reconcileOfficialGroups(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.conversationsService.reconcileOfficialGroups(user);
  }

  @Post('groups')
  createGroupConversation(
    @CurrentUser()
    user: AuthenticatedUser,

    @Body()
    dto: CreateGroupConversationDto,
  ) {
    return this.conversationsService.createGroupConversation(user, dto);
  }

  @Post('private')
  createPrivateConversation(
    @CurrentUser()
    user: AuthenticatedUser,

    @Body()
    dto: CreatePrivateConversationDto,
  ) {
    return this.conversationsService.createPrivateConversation(user, dto);
  }

  @Get()
  listConversations(
    @CurrentUser()
    user: AuthenticatedUser,

    @Query()
    query: ListConversationsQueryDto,
  ) {
    return this.conversationsService.listConversations(user, query);
  }

  @Get('search')
  searchMessaging(
    @CurrentUser()
    user: AuthenticatedUser,

    @Query()
    query: SearchMessagesQueryDto,
  ) {
    return this.conversationsService.searchMessaging(user, query);
  }

  @Patch(':id/group')
  updateGroupConversation(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    conversationId: string,

    @Body()
    dto: UpdateGroupConversationDto,
  ) {
    return this.conversationsService.updateGroupConversation(
      user,
      conversationId,
      dto,
    );
  }


  @Post(':id/group/photo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  updateGroupPhoto(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    conversationId: string,

    @UploadedFile()
    file: UploadedMessageAttachmentFile | undefined,
  ) {
    return this.conversationsService.updateGroupPhoto(
      user,
      conversationId,
      file,
    );
  }

  @Delete(':id/group/photo')
  removeGroupPhoto(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    conversationId: string,
  ) {
    return this.conversationsService.removeGroupPhoto(user, conversationId);
  }

  @Get(':id/group/photo')
  async downloadGroupPhoto(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    conversationId: string,

    @Res({ passthrough: true })
    response: Response,
  ): Promise<StreamableFile> {
    const photo = await this.conversationsService.getGroupPhotoDownload(
      user,
      conversationId,
    );

    response.setHeader('Content-Type', photo.mimeType);
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.setHeader('Cache-Control', 'private, max-age=300');

    return new StreamableFile(createReadStream(photo.absolutePath));
  }

  @Post(':id/group/members')
  addGroupMembers(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    conversationId: string,

    @Body()
    dto: AddGroupMembersDto,
  ) {
    return this.conversationsService.addGroupMembers(user, conversationId, dto);
  }

  @Patch(':id/group/members/:accountId/role')
  updateGroupMemberRole(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    conversationId: string,

    @Param(
      'accountId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    accountId: string,

    @Body()
    dto: UpdateGroupMemberRoleDto,
  ) {
    return this.conversationsService.updateGroupMemberRole(
      user,
      conversationId,
      accountId,
      dto,
    );
  }

  @Delete(':id/group/members/:accountId')
  removeGroupMember(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    conversationId: string,

    @Param(
      'accountId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    accountId: string,
  ) {
    return this.conversationsService.removeGroupMember(
      user,
      conversationId,
      accountId,
    );
  }

  @Post(':id/group/leave')
  leaveGroupConversation(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    conversationId: string,
  ) {
    return this.conversationsService.leaveGroupConversation(
      user,
      conversationId,
    );
  }

  @Get(':id/group/audit')
  listOfficialGroupAudit(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    conversationId: string,

    @Query()
    query: ListOfficialGroupAuditQueryDto,
  ) {
    return this.conversationsService.listOfficialGroupAudit(
      user,
      conversationId,
      query,
    );
  }

  @Get(':id/messages/search')
  searchConversationMessages(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    conversationId: string,

    @Query()
    query: SearchMessagesQueryDto,
  ) {
    return this.conversationsService.searchConversationMessages(
      user,
      conversationId,
      query,
    );
  }

  @Get(':id/messages')
  listMessages(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    conversationId: string,

    @Query()
    query: ListMessagesQueryDto,
  ) {
    return this.conversationsService.listMessages(user, conversationId, query);
  }

  @Post(':id/messages')
  sendTextMessage(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    conversationId: string,

    @Body()
    dto: SendTextMessageDto,
  ) {
    return this.conversationsService.sendTextMessage(user, conversationId, dto);
  }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 200 * 1024 * 1024 } }))
  sendAttachmentMessage(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    conversationId: string,

    @UploadedFile()
    file: UploadedMessageAttachmentFile | undefined,

    @Body()
    dto: SendAttachmentMessageDto,
  ) {
    return this.conversationsService.sendAttachmentMessage(
      user,
      conversationId,
      dto,
      file,
    );
  }

  @Get(':conversationId/messages/:messageId/attachments/:attachmentId/download')
  async downloadMessageAttachment(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'conversationId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    conversationId: string,

    @Param(
      'messageId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    messageId: string,

    @Param(
      'attachmentId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    attachmentId: string,

    @Res({ passthrough: true })
    response: Response,
  ): Promise<StreamableFile> {
    const attachment = await this.conversationsService.getAttachmentDownload(
      user,
      conversationId,
      messageId,
      attachmentId,
    );

    const safeFileName = attachment.originalFileName.replace(/[\r\n"]/g, '_');
    const encodedFileName = encodeURIComponent(attachment.originalFileName);

    const canPreviewInline =
      attachment.mimeType.startsWith('image/') ||
      attachment.mimeType.startsWith('video/') ||
      attachment.mimeType.startsWith('audio/') ||
      attachment.mimeType === 'application/pdf' ||
      attachment.mimeType.startsWith('text/');
    const disposition = canPreviewInline ? 'inline' : 'attachment';

    // Audio and video previews are served inline through the same protected endpoint.
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Length', String(attachment.fileSizeBytes));
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`,
    );

    return new StreamableFile(createReadStream(attachment.absolutePath));
  }

  @Post(':conversationId/messages/:messageId/reactions')
  reactToMessage(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'conversationId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    conversationId: string,

    @Param(
      'messageId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    messageId: string,

    @Body()
    dto: ReactMessageDto,
  ) {
    return this.conversationsService.reactToMessage(
      user,
      conversationId,
      messageId,
      dto,
    );
  }

  @Delete(':conversationId/messages/:messageId/reactions')
  removeMessageReaction(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'conversationId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    conversationId: string,

    @Param(
      'messageId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    messageId: string,
  ) {
    return this.conversationsService.removeMessageReaction(
      user,
      conversationId,
      messageId,
    );
  }

  // Forwarding is shared by text and attachment messages so the route stays stable.
  @Post(':id/messages/:messageId/forward')
  forwardTextMessage(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    conversationId: string,

    @Param(
      'messageId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    messageId: string,

    @Body()
    dto: ForwardTextMessageDto,
  ) {
    return this.conversationsService.forwardTextMessage(
      user,
      conversationId,
      messageId,
      dto,
    );
  }

  @Patch(':id/messages/:messageId')
  editTextMessage(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    conversationId: string,

    @Param(
      'messageId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    messageId: string,

    @Body()
    dto: UpdateTextMessageDto,
  ) {
    return this.conversationsService.editTextMessage(
      user,
      conversationId,
      messageId,
      dto,
    );
  }

  @Delete(':id/messages/:messageId/me')
  deleteMessageForMe(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    conversationId: string,

    @Param(
      'messageId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    messageId: string,
  ) {
    return this.conversationsService.deleteMessageForMe(
      user,
      conversationId,
      messageId,
    );
  }

  @Delete(':id/messages/:messageId')
  deleteMessageForEveryone(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    conversationId: string,

    @Param(
      'messageId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    messageId: string,
  ) {
    return this.conversationsService.deleteMessageForEveryone(
      user,
      conversationId,
      messageId,
    );
  }

  @Patch(':id/read')
  markConversationRead(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    conversationId: string,
  ) {
    return this.conversationsService.markConversationRead(user, conversationId);
  }
}
