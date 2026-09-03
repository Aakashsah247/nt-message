import { Module } from '@nestjs/common';
import { ActivationInvitationsModule } from '../activation-invitations/activation-invitations.module';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { EmployeeIdentityCorrectionService } from './employee-identity-correction.service';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  /*
   * AuthModule provides AccessTokenGuard and RolesGuard.
   */
  imports: [AuthModule, ActivationInvitationsModule, MailModule],

  controllers: [EmployeesController],

  providers: [EmployeeIdentityCorrectionService, EmployeesService],
})
export class EmployeesModule {}
