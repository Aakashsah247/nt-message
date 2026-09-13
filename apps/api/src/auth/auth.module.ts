import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccountClassesGuard } from './guards/account-classes.guard';
import { AccessTokenGuard } from './guards/access-token.guard';
import { AccessTokenValidationService } from './services/access-token-validation.service';
import { DailySessionLogoutService } from './services/daily-session-logout.service';
import { PasswordManagementService } from './services/password-management.service';
import { PasswordRecoveryService } from './services/password-recovery.service';
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
    PasswordRecoveryService,
    AccessTokenStrategy,
    AccessTokenGuard,
    AccountClassesGuard,
  ],

  /*
   * Other modules use AccountClass/capability authorization guards.
   */
  exports: [
    AuthService,
    AccessTokenValidationService,
    AccessTokenGuard,
    AccountClassesGuard,
  ],
})
export class AuthModule {}
