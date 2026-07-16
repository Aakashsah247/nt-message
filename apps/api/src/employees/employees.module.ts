import { Module } from '@nestjs/common';
import { ActivationInvitationsModule } from '../activation-invitations/activation-invitations.module';
import { AuthModule } from '../auth/auth.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  /*
   * AuthModule provides AccessTokenGuard and RolesGuard.
   */
  imports: [AuthModule, ActivationInvitationsModule],

  controllers: [EmployeesController],

  providers: [EmployeesService],
})
export class EmployeesModule {}
