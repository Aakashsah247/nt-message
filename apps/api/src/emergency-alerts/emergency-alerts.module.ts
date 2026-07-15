import { Module } from '@nestjs/common';

import { PrismaModule } from '../database/prisma.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { EmergencyAlertsController } from './emergency-alerts.controller';
import { EmergencyAlertsService } from './emergency-alerts.service';
import { MockSmsProvider } from './sms-providers/mock-sms.provider';
import { SMS_PROVIDER } from './sms-providers/sms-provider.interface';

@Module({
  imports: [PrismaModule, MonitoringModule],
  controllers: [EmergencyAlertsController],
  providers: [
    EmergencyAlertsService,
    MockSmsProvider,
    {
      provide: SMS_PROVIDER,
      useExisting: MockSmsProvider,
    },
  ],
})
export class EmergencyAlertsModule {}
