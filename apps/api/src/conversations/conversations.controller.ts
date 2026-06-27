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
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';

import { ConversationsService } from './conversations.service';
import { AddGroupMembersDto } from './dto/add-group-members.dto';
import { CreateGroupConversationDto } from './dto/create-group-conversation.dto';
import { CreatePrivateConversationDto } from './dto/create-private-conversation.dto';
import { ForwardTextMessageDto } from './dto/forward-text-message.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { SearchMessagingContactsQueryDto } from './dto/search-messaging-contacts-query.dto';
import { SendTextMessageDto } from './dto/send-text-message.dto';
import { UpdateGroupConversationDto } from './dto/update-group-conversation.dto';
import { UpdateGroupMemberRoleDto } from './dto/update-group-member-role.dto';
import { UpdateTextMessageDto } from './dto/update-text-message.dto';

@Controller('conversations')
@UseGuards(AccessTokenGuard)
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
  ) {}

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
    return this.conversationsService.acceptMessageRequest(
      user,
      requestId,
    );
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
    return this.conversationsService.declineMessageRequest(
      user,
      requestId,
    );
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
    return this.conversationsService.blockMessageRequest(
      user,
      requestId,
    );
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
    return this.conversationsService.addGroupMembers(
      user,
      conversationId,
      dto,
    );
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
    return this.conversationsService.listMessages(
      user,
      conversationId,
      query,
    );
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
    return this.conversationsService.sendTextMessage(
      user,
      conversationId,
      dto,
    );
  }

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
    return this.conversationsService.markConversationRead(
      user,
      conversationId,
    );
  }
}
