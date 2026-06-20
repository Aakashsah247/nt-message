import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AccountRequestsController } from './account-requests.controller';
import { AccountRequestsService } from './account-requests.service';
import { AdminAccountRequestsController } from './admin-account-requests.controller';

@Module({
  imports: [AuthModule],

  controllers: [AccountRequestsController, AdminAccountRequestsController],

  providers: [AccountRequestsService],
})
export class AccountRequestsModule {}
