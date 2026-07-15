import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccessTokenGuard } from './guards/access-token.guard';
import { RolesGuard } from './guards/roles.guard';
import { AccessTokenValidationService } from './services/access-token-validation.service';
import { DailySessionLogoutService } from './services/daily-session-logout.service';
import { AccessTokenStrategy } from './strategies/access-token.strategy';

@Module({
  imports: [
    PassportModule.register({
      defaultStrategy: 'jwt',
      session: false,
    }),

    JwtModule.register({}),
  ],

  controllers: [AuthController],

  providers: [
    AuthService,
    AccessTokenValidationService,
    DailySessionLogoutService,
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
