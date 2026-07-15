import { Global, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../database/prisma.module';
import { MessagingEventsService } from '../realtime/messaging-events.service';
import { MessagingPresenceService } from '../realtime/messaging-presence.service';

import { ConversationsController } from './conversations.controller';
import { ConversationsGateway } from './conversations.gateway';
import { ConversationsService } from './conversations.service';

@Global()
@Module({
  imports: [PrismaModule, AuthModule],

  controllers: [ConversationsController],

  providers: [
    ConversationsService,
    ConversationsGateway,
    MessagingEventsService,
    MessagingPresenceService,
  ],

  exports: [ConversationsService, MessagingEventsService],
})
export class ConversationsModule {}
