import { Module } from '@nestjs/common';

import { ActivationInvitationsModule } from '../activation-invitations/activation-invitations.module';
import { AuthModule } from '../auth/auth.module';
import { OrganizationModule } from '../organization/organization.module';
import { AccountRequestAuthorityService } from './account-request-authority.service';
import { AccountRequestLifecycleService } from './account-request-lifecycle.service';
import { AccountRequestsController } from './account-requests.controller';
import { AccountRequestsService } from './account-requests.service';
import { AdminAccountRequestsController } from './admin-account-requests.controller';

@Module({
  imports: [AuthModule, ActivationInvitationsModule, OrganizationModule],

  controllers: [AccountRequestsController, AdminAccountRequestsController],

  providers: [
    AccountRequestAuthorityService,
    AccountRequestLifecycleService,
    AccountRequestsService,
  ],
})
export class AccountRequestsModule {}
