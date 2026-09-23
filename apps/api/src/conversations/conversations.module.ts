import { Global, Module } from '@nestjs/common';

import { AttachmentsModule } from '../attachments/attachments.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../database/prisma.module';
import { MessagingEventsService } from '../realtime/messaging-events.service';
import { MessagingPresenceService } from '../realtime/messaging-presence.service';
import { MessagingSocketSessionService } from '../realtime/messaging-socket-session.service';

import { ConversationsController } from './conversations.controller';
import { ConversationsGateway } from './conversations.gateway';
import { ConversationsService } from './conversations.service';
import { ConversationStorageService } from './conversation-storage.service';
import { MessageAttachmentStreamController } from './message-attachment-stream.controller';
import { MessageAttachmentStreamService } from './message-attachment-stream.service';
import { MessagingPushService } from './messaging-push.service';
import { MessageContentSecurity } from './message-content-security';
import { MessageAttachmentContentSecurity } from './message-attachment-content-security';

@Global()
@Module({
  imports: [PrismaModule, AuthModule, AttachmentsModule],

  controllers: [ConversationsController, MessageAttachmentStreamController],

  providers: [
    ConversationsService,
    ConversationStorageService,
    ConversationsGateway,
    MessagingEventsService,
    MessagingPresenceService,
    MessagingSocketSessionService,
    MessageAttachmentStreamService,
    MessagingPushService,
    MessageContentSecurity,
    MessageAttachmentContentSecurity,
  ],

  exports: [
    ConversationsService,
    ConversationStorageService,
    MessagingEventsService,
    MessagingPresenceService,
  ],
})
export class ConversationsModule {}
