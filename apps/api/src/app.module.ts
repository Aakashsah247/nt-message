import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AnnouncementsModule } from './announcements/announcements.module';
import { ConversationsModule } from './conversations/conversations.module';

import { AccountRequestsModule } from './account-requests/account-requests.module';
import { ActivationModule } from './activation/activation.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './database/prisma.module';
import { DirectoryModule } from './directory/directory.module';
import { EmployeesModule } from './employees/employees.module';
import { EmergencyAlertsModule } from './emergency-alerts/emergency-alerts.module';
import { ManagementAssignmentsModule } from './management-assignments/management-assignments.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { OrganizationModule } from './organization/organization.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),

    PrismaModule,
    ConversationsModule,
    AnnouncementsModule,
    DirectoryModule,
    AuthModule,
    EmployeesModule,
    ManagementAssignmentsModule,
    MonitoringModule,
    EmergencyAlertsModule,
    OrganizationModule,
    ActivationModule,
    AccountRequestsModule,
  ],

  controllers: [AppController],

  providers: [AppService],
})
export class AppModule {}
