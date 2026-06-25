import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { ManagementAssignmentsController } from './management-assignments.controller';
import { ManagementAssignmentsService } from './management-assignments.service';

@Module({
  imports: [AuthModule],

  controllers: [ManagementAssignmentsController],

  providers: [ManagementAssignmentsService],

  exports: [ManagementAssignmentsService],
})
export class ManagementAssignmentsModule {}
