import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ActivationInvitationsModule } from '../activation-invitations/activation-invitations.module';
import { MailModule } from '../mail/mail.module';
import { ActivationController } from './activation.controller';
import { ActivationService } from './activation.service';

@Module({
  imports: [JwtModule.register({}), MailModule, ActivationInvitationsModule],

  controllers: [ActivationController],

  providers: [ActivationService],
})
export class ActivationModule {}
