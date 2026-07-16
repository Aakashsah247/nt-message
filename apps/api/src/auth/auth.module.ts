import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccessTokenGuard } from './guards/access-token.guard';
import { RolesGuard } from './guards/roles.guard';
import { AccessTokenValidationService } from './services/access-token-validation.service';
import { DailySessionLogoutService } from './services/daily-session-logout.service';
import { PasswordManagementService } from './services/password-management.service';
import { AccessTokenStrategy } from './strategies/access-token.strategy';

@Module({
  imports: [
    PassportModule.register({
      defaultStrategy: 'jwt',
      session: false,
    }),

    JwtModule.register({}),
    MailModule,
  ],

  controllers: [AuthController],

  providers: [
    AuthService,
    AccessTokenValidationService,
    DailySessionLogoutService,
    PasswordManagementService,
    AccessTokenStrategy,
    AccessTokenGuard,
    RolesGuard,
  ],

  /*
   * Other modules can now use both authentication guards.
   */
  exports: [
    AuthService,
    AccessTokenValidationService,
    AccessTokenGuard,
    RolesGuard,
  ],
})
export class AuthModule {}
