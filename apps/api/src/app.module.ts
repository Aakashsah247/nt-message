import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AccountRequestsModule } from './account-requests/account-requests.module';
import { ActivationModule } from './activation/activation.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './database/prisma.module';
import { DirectoryModule } from './directory/directory.module';
import { EmployeesModule } from './employees/employees.module';
import { OrganizationModule } from './organization/organization.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),

    PrismaModule,
    DirectoryModule,
    AuthModule,
    EmployeesModule,
    OrganizationModule,
    ActivationModule,
    AccountRequestsModule,
  ],

  controllers: [AppController],

  providers: [AppService],
})
export class AppModule {}
