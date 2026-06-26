import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../database/prisma.module';

import { ConversationsController } from './conversations.controller';
import { ConversationsGateway } from './conversations.gateway';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [PrismaModule, AuthModule],

  controllers: [ConversationsController],

  providers: [ConversationsService, ConversationsGateway],
})
export class ConversationsModule {}
