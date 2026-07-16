import { Module } from '@nestjs/common';

import { MailModule } from '../mail/mail.module';
import { ActivationInvitationsService } from './activation-invitations.service';

@Module({
  imports: [MailModule],
  providers: [ActivationInvitationsService],
  exports: [ActivationInvitationsService],
})
export class ActivationInvitationsModule {}
