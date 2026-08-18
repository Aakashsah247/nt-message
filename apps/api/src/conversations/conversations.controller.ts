import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from '@nestjs/platform-express';
import type { Response } from 'express';

import { AttachmentStorageService } from '../attachments/attachment-storage.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';

import { ConversationStorageService } from './conversation-storage.service';
import { MessageAttachmentStreamService } from './message-attachment-stream.service';
import { MessagingPushService } from './messaging-push.service';
import { ConversationsService } from './conversations.service';
import { AddGroupMembersDto } from './dto/add-group-members.dto';
import { CreateGroupConversationDto } from './dto/create-group-conversation.dto';
import { CreateOfficialGroupConversationDto } from './dto/create-official-group-conversation.dto';
import { CreatePrivateConversationDto } from './dto/create-private-conversation.dto';
import { CreatePrivateGroupFromPrivateConversationDto } from './dto/create-private-group-from-private-conversation.dto';
import { ForwardTextMessageDto } from './dto/forward-text-message.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { ListStarredMessagesQueryDto } from './dto/list-starred-messages-query.dto';
import { ListGroupMembersQueryDto } from './dto/list-group-members-query.dto';
import { ListOfficialGroupAuditQueryDto } from './dto/list-official-group-audit-query.dto';
import { SearchMessagingContactsQueryDto } from './dto/search-messaging-contacts-query.dto';
import { SearchMessagesQueryDto } from './dto/search-messages-query.dto';
import { SendTextMessageDto } from './dto/send-text-message.dto';
import { SendLocationMessageDto } from './dto/send-location-message.dto';
import { SendAttachmentMessageDto } from './dto/send-attachment-message.dto';
import { StorageUsageQueryDto } from './dto/storage-usage-query.dto';
import { UpdateGroupConversationDto } from './dto/update-group-conversation.dto';
import { UpdateGroupMemberRoleDto } from './dto/update-group-member-role.dto';
import { UpdateConversationPreferenceDto } from './dto/update-conversation-preference.dto';
import { UpdateTextMessageDto } from './dto/update-text-message.dto';
import { UpdateLiveLocationDto } from './dto/update-live-location.dto';
import { UpdateMessagingProfileDto } from './dto/update-messaging-profile.dto';
import { UpdateMessagingSettingsDto } from './dto/update-messaging-settings.dto';
import { UpsertMessagingPushSubscriptionDto } from './dto/upsert-messaging-push-subscription.dto';
import { DeleteMessagingPushSubscriptionDto } from './dto/delete-messaging-push-subscription.dto';
import { CreateChatFolderDto } from './dto/create-chat-folder.dto';
import { UpdateChatFolderDto } from './dto/update-chat-folder.dto';
import { ReorderChatFoldersDto } from './dto/reorder-chat-folders.dto';
import { ManageFolderItemDto } from './dto/manage-folder-item.dto';
import { ReactMessageDto } from './dto/react-message.dto';
import type { UploadedMessageAttachmentFile } from './types/uploaded-message-attachment-file';
import { AttachmentTempCleanupInterceptor } from '../attachments/attachment-temp-cleanup.interceptor';
import { createBoundedAttachmentTempStorage } from '../attachments/attachment-upload-temp-storage';
import {
  MAX_MESSAGE_ATTACHMENT_FILE_BYTES,
  MAX_MESSAGE_ATTACHMENT_FILES,
  MAX_MESSAGE_ATTACHMENT_TOTAL_BYTES,
} from './message-attachment-upload.constants';


@Controller('conversations')
@UseGuards(AccessTokenGuard)
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly conversationStorageService: ConversationStorageService,
    private readonly messageAttachmentStreamService: MessageAttachmentStreamService,
    private readonly messagingPushService: MessagingPushService,
    private readonly attachmentStorageService: AttachmentStorageService,
  ) {}

  @Get('settings')
  getMessagingSettings(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.conversationsService.getMessagingSettings(user);
  }

  @Get('push/config')
  getMessagingPushConfig() {
    return this.messagingPushService.getPublicConfig();
  }

  @Put('push/subscription')
  upsertMessagingPushSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertMessagingPushSubscriptionDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.messagingPushService.upsertSubscription(user, dto, userAgent);
  }

  @Delete('push/subscription')
  deleteMessagingPushSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteMessagingPushSubscriptionDto,
  ) {
    return this.messagingPushService.deleteSubscription(user, dto);
  }

  @Get('folders')
  listChatFolders(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.conversationsService.listChatFolders(user);
  }

  @Post('folders')
  createChatFolder(
    @CurrentUser()
    user: AuthenticatedUser,

    @Body()
    dto: CreateChatFolderDto,
  ) {
    return this.conversationsService.createChatFolder(user, dto);
  }

  @Put('folders/reorder')
  reorderChatFolders(
    @CurrentUser()
    user: AuthenticatedUser,

    @Body()
    dto: ReorderChatFoldersDto,
  ) {
    return this.conversationsService.reorderChatFolders(user, dto);
  }

  @Patch('folders/:folderId')
  updateChatFolder(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param('folderId', new ParseUUIDPipe({ version: '4' }))
    folderId: string,

    @Body()
    dto: UpdateChatFolderDto,
  ) {
    return this.conversationsService.updateChatFolder(user, folderId, dto);
  }

  @Delete('folders/:folderId')
  deleteChatFolder(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param('folderId', new ParseUUIDPipe({ version: '4' }))
    folderId: string,
  ) {
    return this.conversationsService.deleteChatFolder(user, folderId);
  }

  @Post('folders/:folderId/items')
  addFolderItem(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param('folderId', new ParseUUIDPipe({ version: '4' }))
    folderId: string,

    @Body()
    dto: ManageFolderItemDto,
  ) {
    return this.conversationsService.addFolderItem(user, folderId, dto);
  }

  @Delete('folders/:folderId/items/:itemId')
  removeFolderItem(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param('folderId', new ParseUUIDPipe({ version: '4' }))
    folderId: string,

    @Param('itemId', new ParseUUIDPipe({ version: '4' }))
    itemId: string,
  ) {
    return this.conversationsService.removeFolderItem(user, folderId, itemId);
  }

  @Patch('settings')
  updateMessagingSettings(
    @CurrentUser()
    user: AuthenticatedUser,

    @Body()
    dto: UpdateMessagingSettingsDto,
  ) {
    return this.conversationsService.updateMessagingSettings(user, dto);
  }

  @Get('blocks')
  listBlockedMessagingAccounts(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.conversationsService.listBlockedMessagingAccounts(user);
  }

  @Post('blocks/:accountId')
  blockMessagingAccount(
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
    return this.conversationsService.blockMessagingAccount(user, accountId);
  }

  @Delete('blocks/:accountId')
  unblockMessagingAccount(
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
    return this.conversationsService.unblockMessagingAccount(user, accountId);
  }

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
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
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
  ): Promise<StreamableFile | void> {
    const photo =
      await this.conversationsService.getMessagingProfilePhotoByEmployeeDownload(
        user,
        employeeId,
      );

    if (!photo) {
      // Missing custom photos are represented by initials in the directory.
      response.status(204);
      response.setHeader('Cache-Control', 'private, max-age=60');
      return;
    }

    // Directory profile photos use the same protected response headers as messaging profile photos.
    response.setHeader('Content-Type', photo.mimeType);
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.setHeader('Cache-Control', 'private, max-age=300');

    return new StreamableFile(
      await this.attachmentStorageService.openReadStream('profile-photos', photo.storageKey),
    );
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
  ): Promise<StreamableFile | void> {
    const photo =
      await this.conversationsService.getMessagingProfilePhotoDownload(
        user,
        accountId,
      );

    if (!photo) {
      // A valid account without an uploaded photo uses the initials fallback.
      response.status(204);
      response.setHeader('Cache-Control', 'private, max-age=60');
      return;
    }

    // Profile photos are protected resources, not public object-storage URLs.
    response.setHeader('Content-Type', photo.mimeType);
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.setHeader('Cache-Control', 'private, max-age=300');

    return new StreamableFile(
      await this.attachmentStorageService.openReadStream('profile-photos', photo.storageKey),
    );
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

  @Get('dashboard-summary')
  getPersonalDashboardSummary(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.conversationsService.getPersonalDashboardSummary(user);
  }

  @Get('analytics')
  getMessagingAnalytics(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.conversationsService.getMessagingAnalytics(user);
  }

  @Get('storage-usage')
  getUserStorageUsage(
    @CurrentUser()
    user: AuthenticatedUser,

    @Query()
    query: StorageUsageQueryDto,
  ) {
    return this.conversationStorageService.getUserStorageUsage(
      user,
      query.limit,
    );
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

  @Get('group-invites/:token')
  previewGroupInvitation(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param('token')
    token: string,
  ) {
    return this.conversationsService.previewGroupInvitation(user, token);
  }

  @Post('group-invites/:token/join')
  joinGroupInvitation(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param('token')
    token: string,
  ) {
    return this.conversationsService.joinGroupInvitation(user, token);
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

  @Post(':id/private-group')
  createPrivateGroupFromPrivateConversation(
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
    dto: CreatePrivateGroupFromPrivateConversationDto,
  ) {
    return this.conversationsService.createPrivateGroupFromPrivateConversation(
      user,
      conversationId,
      dto,
    );
  }

  @Delete(':id/group')
  deleteGroupConversation(
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
    return this.conversationsService.deleteGroupConversation(
      user,
      conversationId,
    );
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

  @Get(':id/group/invite-link')
  getGroupInvitationLink(
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
    return this.conversationsService.getGroupInvitationLink(
      user,
      conversationId,
    );
  }

  @Post(':id/group/invite-link')
  createGroupInvitationLink(
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
    return this.conversationsService.createGroupInvitationLink(
      user,
      conversationId,
    );
  }

  @Delete(':id/group/invite-link')
  revokeGroupInvitationLink(
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
    return this.conversationsService.revokeGroupInvitationLink(
      user,
      conversationId,
    );
  }

  @Post(':id/group/photo')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
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

    return new StreamableFile(
      await this.attachmentStorageService.openReadStream('group-photos', photo.storageKey),
    );
  }

  @Get(':id/group/members')
  listGroupMembers(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param('id', new ParseUUIDPipe({ version: '4' }))
    conversationId: string,

    @Query()
    query: ListGroupMembersQueryDto,
  ) {
    return this.conversationsService.listGroupMembers(
      user,
      conversationId,
      query,
    );
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

  @Get(':id/shared-content')
  getConversationSharedContent(
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
    return this.conversationsService.getConversationSharedContent(
      user,
      conversationId,
    );
  }

  @Get(':id/storage-usage')
  getConversationStorageUsage(
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
    query: StorageUsageQueryDto,
  ) {
    return this.conversationStorageService.getConversationStorageUsage(
      user,
      conversationId,
      query.limit,
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

  @Get('starred/messages')
  listStarredMessages(
    @CurrentUser()
    user: AuthenticatedUser,

    @Query()
    query: ListStarredMessagesQueryDto,
  ) {
    return this.conversationsService.listStarredMessages(user, query);
  }

  @Get(':id/pinned-messages')
  listPinnedMessages(
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
    return this.conversationsService.listPinnedMessages(user, conversationId);
  }

  @Post(':id/clear')
  clearConversationForAccount(
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
    return this.conversationsService.clearConversationForAccount(
      user,
      conversationId,
    );
  }

  @Delete(':id')
  deleteConversationForAccount(
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
    /*
     * This route deletes only the caller's list/history state. The service is
     * intentionally named "ForAccount" to prevent accidental canonical delete.
     */
    return this.conversationsService.deleteConversationForAccount(
      user,
      conversationId,
    );
  }

  @Patch(':id/preferences')
  updateConversationPreference(
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
    dto: UpdateConversationPreferenceDto,
  ) {
    return this.conversationsService.updateConversationPreference(
      user,
      conversationId,
      dto,
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

  @Post(':id/location')
  sendLocationMessage(
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
    dto: SendLocationMessageDto,
  ) {
    return this.conversationsService.sendLocationMessage(
      user,
      conversationId,
      dto,
    );
  }

  @Patch(':conversationId/messages/:messageId/live-location')
  updateLiveLocationMessage(
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
    dto: UpdateLiveLocationDto,
  ) {
    return this.conversationsService.updateLiveLocationMessage(
      user,
      conversationId,
      messageId,
      dto,
    );
  }

  @Post(':conversationId/messages/:messageId/live-location/stop')
  stopLiveLocationMessage(
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
    return this.conversationsService.stopLiveLocationMessage(
      user,
      conversationId,
      messageId,
    );
  }

  @Post(':id/attachments')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'files', maxCount: MAX_MESSAGE_ATTACHMENT_FILES },
        // Preserve compatibility with the previous single-file client during rollout.
        { name: 'file', maxCount: 1 },
      ],
      {
        storage: createBoundedAttachmentTempStorage(
          MAX_MESSAGE_ATTACHMENT_TOTAL_BYTES,
        ),
        limits: {
          fileSize: MAX_MESSAGE_ATTACHMENT_FILE_BYTES,
          files: MAX_MESSAGE_ATTACHMENT_FILES,
        },
      },
    ),
    AttachmentTempCleanupInterceptor,
  )
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

    @UploadedFiles()
    uploadedFiles:
      | {
          files?: UploadedMessageAttachmentFile[];
          file?: UploadedMessageAttachmentFile[];
        }
      | undefined,

    @Body()
    dto: SendAttachmentMessageDto,
  ) {
    const files = [
      ...(uploadedFiles?.files ?? []),
      ...(uploadedFiles?.file ?? []),
    ];

    return this.conversationsService.sendAttachmentMessage(
      user,
      conversationId,
      dto,
      files,
    );
  }

  @Post(':conversationId/messages/:messageId/attachments/:attachmentId/stream-access')
  async createMessageAttachmentStreamAccess(
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
  ) {
    // Validate the attachment with the normal membership, visibility, retention
    // and malware-scan rules before issuing a short-lived media link.
    const attachment = await this.conversationsService.getAttachmentDownload(
      user,
      conversationId,
      messageId,
      attachmentId,
    );

    if (
      !attachment.mimeType.startsWith('video/') &&
      !attachment.mimeType.startsWith('audio/')
    ) {
      throw new BadRequestException(
        'Streaming access is available only for video and audio attachments.',
      );
    }

    return {
      data: this.messageAttachmentStreamService.createAccessToken(
        user,
        conversationId,
        messageId,
        attachmentId,
      ),
    };
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
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Length', String(attachment.fileSizeBytes));
    response.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`,
    );

    return new StreamableFile(
      await this.attachmentStorageService.openReadStream('messages', attachment.storageKey),
    );
  }

  @Get(':conversationId/messages/:messageId/info')
  getMessageInformation(
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
    return this.conversationsService.getMessageInformation(
      user,
      conversationId,
      messageId,
    );
  }

  @Get(':conversationId/messages/:messageId')
  getConversationMessage(
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
    return this.conversationsService.getConversationMessage(
      user,
      conversationId,
      messageId,
    );
  }

  @Post(':conversationId/messages/:messageId/star')
  starMessage(
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
    return this.conversationsService.starMessage(
      user,
      conversationId,
      messageId,
    );
  }

  @Delete(':conversationId/messages/:messageId/star')
  unstarMessage(
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
    return this.conversationsService.unstarMessage(
      user,
      conversationId,
      messageId,
    );
  }

  @Post(':conversationId/messages/:messageId/pin')
  pinMessage(
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
    return this.conversationsService.pinMessage(
      user,
      conversationId,
      messageId,
    );
  }

  @Delete(':conversationId/messages/:messageId/pin')
  unpinMessage(
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
    return this.conversationsService.unpinMessage(
      user,
      conversationId,
      messageId,
    );
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
