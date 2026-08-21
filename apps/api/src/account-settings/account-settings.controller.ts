import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { AccountSettingsService } from './account-settings.service';
import { UpdateAccountLanguageDto } from './dto/update-account-language.dto';

@Controller('account-settings')
@UseGuards(AccessTokenGuard)
export class AccountSettingsController {
  constructor(
    private readonly accountSettingsService: AccountSettingsService,
  ) {}

  @Get('language')
  getLanguage(@CurrentUser() user: AuthenticatedUser) {
    return this.accountSettingsService.getLanguage(user.accountId);
  }

  @Patch('language')
  updateLanguage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAccountLanguageDto,
  ) {
    return this.accountSettingsService.updateLanguage(user.accountId, dto);
  }
}
