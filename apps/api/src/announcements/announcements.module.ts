import { Module } from '@nestjs/common';

import { AttachmentsModule } from '../attachments/attachments.module';
import { AuthModule } from '../auth/auth.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { PrismaModule } from '../database/prisma.module';
import { OrganizationModule } from '../organization/organization.module';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ConversationsModule,
    AttachmentsModule,
    OrganizationModule,
  ],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
