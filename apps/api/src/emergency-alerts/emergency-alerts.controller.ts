import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { SendEmergencyAlertDto } from './dto/send-emergency-alert.dto';
import { EmergencyAlertsService } from './emergency-alerts.service';

@Controller('emergency-alerts')
@UseGuards(AccessTokenGuard)
export class EmergencyAlertsController {
  constructor(private readonly emergencyAlertsService: EmergencyAlertsService) {}

  @Get('contacts')
  listEmergencyContacts(@CurrentUser() user: AuthenticatedUser) {
    // The sender chooses one exact emergency recipient before sending an alert.
    return this.emergencyAlertsService.listEmergencyContacts(user);
  }

  @Get('super-admin-profile')
  getOwnSuperAdminProfile(@CurrentUser() user: AuthenticatedUser) {
    // Super Admin emergency identity is read-only and controlled by setup data.
    return this.emergencyAlertsService.getOwnSuperAdminProfile(user);
  }

  @Post()
  sendEmergencyAlert(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendEmergencyAlertDto,
  ) {
    // Business logic is provider-based; only the SMS provider changes later.
    return this.emergencyAlertsService.sendEmergencyAlert(user, dto);
  }
}
