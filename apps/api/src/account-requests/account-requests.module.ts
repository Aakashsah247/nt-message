import { Module } from '@nestjs/common';

import { ActivationInvitationsModule } from '../activation-invitations/activation-invitations.module';
import { AuthModule } from '../auth/auth.module';
import { AccountRequestLifecycleService } from './account-request-lifecycle.service';
import { AccountRequestsController } from './account-requests.controller';
import { AccountRequestsService } from './account-requests.service';
import { AdminAccountRequestsController } from './admin-account-requests.controller';

@Module({
  imports: [AuthModule, ActivationInvitationsModule],

  controllers: [AccountRequestsController, AdminAccountRequestsController],

  providers: [AccountRequestLifecycleService, AccountRequestsService],
})
export class AccountRequestsModule {}
