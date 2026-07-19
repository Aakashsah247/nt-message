import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { PrismaModule } from '../database/prisma.module';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

@Module({
  imports: [PrismaModule, AuthModule, ConversationsModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
