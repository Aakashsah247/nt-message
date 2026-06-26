import {
  Body,
  Controller,
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
import { CreatePrivateConversationDto } from './dto/create-private-conversation.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { SearchMessagingContactsQueryDto } from './dto/search-messaging-contacts-query.dto';
import { SendTextMessageDto } from './dto/send-text-message.dto';

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
