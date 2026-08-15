import { Global, Module } from '@nestjs/common';

import { AttachmentsModule } from '../attachments/attachments.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../database/prisma.module';
import { MessagingEventsService } from '../realtime/messaging-events.service';
import { MessagingPresenceService } from '../realtime/messaging-presence.service';

import { ConversationsController } from './conversations.controller';
import { ConversationsGateway } from './conversations.gateway';
import { ConversationsService } from './conversations.service';
import { ConversationStorageService } from './conversation-storage.service';

@Global()
@Module({
  imports: [PrismaModule, AuthModule, AttachmentsModule],

  controllers: [ConversationsController],

  providers: [
    ConversationsService,
    ConversationStorageService,
    ConversationsGateway,
    MessagingEventsService,
    MessagingPresenceService,
  ],

  exports: [
    ConversationsService,
    ConversationStorageService,
    MessagingEventsService,
    MessagingPresenceService,
  ],
})
export class ConversationsModule {}
