import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AccountRequestsController } from './account-requests.controller';
import { AccountRequestsService } from './account-requests.service';

@Module({
  imports: [AuthModule],

  controllers: [AccountRequestsController],

  providers: [AccountRequestsService],
})
export class AccountRequestsModule {}
