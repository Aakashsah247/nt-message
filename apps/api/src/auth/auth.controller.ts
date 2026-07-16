import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { AdminLoginDto } from './dto/admin-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { EmployeeLoginDto } from './dto/employee-login.dto';
import { UnifiedLoginDto } from './dto/unified-login.dto';
import { AccessTokenGuard } from './guards/access-token.guard';
import { PasswordManagementService } from './services/password-management.service';
import type { AuthenticatedUser } from './types/auth.types';

@Controller('auth')
export class AuthController {
  private readonly cookieName: string;
  private readonly isProduction: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly passwordManagementService: PasswordManagementService,

    configService: ConfigService,
  ) {
    this.cookieName = configService.getOrThrow<string>('AUTH_COOKIE_NAME');

    this.isProduction = configService.get<string>('NODE_ENV') === 'production';
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body()
    dto: UnifiedLoginDto,

    @Req()
    request: Request,

    @Res({
      passthrough: true,
    })
    response: Response,
  ) {
    const result = await this.authService.loginUnified(dto, {
      ipAddress: request.ip ?? request.socket.remoteAddress ?? null,

      userAgent: request.get('user-agent') ?? null,
    });

    this.setRefreshCookie(
      response,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );

    return {
      accessToken: result.accessToken,

      accessTokenExpiresIn: result.accessTokenExpiresIn,

      account: result.account,
    };
  }

  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  async adminLogin(
    @Body()
    dto: AdminLoginDto,

    @Req()
    request: Request,

    @Res({
      passthrough: true,
    })
    response: Response,
  ) {
    const result = await this.authService.loginAdmin(dto, {
      ipAddress: request.ip ?? request.socket.remoteAddress ?? null,

      userAgent: request.get('user-agent') ?? null,
    });

    this.setRefreshCookie(
      response,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );

    return {
      accessToken: result.accessToken,

      accessTokenExpiresIn: result.accessTokenExpiresIn,

      account: result.account,
    };
  }

  @Post('employee/login')
  @HttpCode(HttpStatus.OK)
  async employeeLogin(
    @Body()
    dto: EmployeeLoginDto,

    @Req()
    request: Request,

    @Res({
      passthrough: true,
    })
    response: Response,
  ) {
    const result = await this.authService.loginEmployee(dto, {
      ipAddress: request.ip ?? request.socket.remoteAddress ?? null,

      userAgent: request.get('user-agent') ?? null,
    });

    this.setRefreshCookie(
      response,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );

    return {
      accessToken: result.accessToken,

      accessTokenExpiresIn: result.accessTokenExpiresIn,

      account: result.account,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req()
    request: Request,

    @Res({
      passthrough: true,
    })
    response: Response,
  ) {
    const refreshToken = this.readRefreshCookie(request);

    const result = await this.authService.refreshSession(refreshToken);

    this.setRefreshCookie(
      response,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );

    return {
      accessToken: result.accessToken,

      accessTokenExpiresIn: result.accessTokenExpiresIn,

      account: result.account,
    };
  }

  @Post('change-password')
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser()
    user: AuthenticatedUser,

    @Body()
    dto: ChangePasswordDto,

    @Res({
      passthrough: true,
    })
    response: Response,
  ) {
    /*
     * Account and session identifiers come only from the verified access
     * token; the request body cannot select another user's account.
     */
    const result = await this.passwordManagementService.changePassword(
      user.accountId,
      user.sessionId,
      dto,
    );

    /*
     * The service revoked every persisted session. Clearing the browser
     * cookie completes the forced fresh-login boundary for this device.
     */
    this.clearRefreshCookie(response);

    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req()
    request: Request,

    @Res({
      passthrough: true,
    })
    response: Response,
  ) {
    const refreshToken = this.readRefreshCookie(request);

    await this.authService.logoutSession(refreshToken);

    this.clearRefreshCookie(response);

    return {
      message: 'Logged out successfully.',
    };
  }

  @Post('logout-all')
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser()
    user: AuthenticatedUser,

    @Res({
      passthrough: true,
    })
    response: Response,
  ) {
    const revokedSessions = await this.authService.logoutAllSessions(
      user.accountId,
    );

    this.clearRefreshCookie(response);

    return {
      message: 'All sessions logged out successfully.',

      revokedSessions,
    };
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  async getCurrentUser(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return {
      // Account display data is resolved by account ID so disabled or duplicate
      // records cannot leak stale header names into the frontend.
      account: await this.authService.getCurrentAccountResult(
        user.accountId,
        user.role,
      ),

      session: {
        id: user.sessionId,
      },
    };
  }

  private readRefreshCookie(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, unknown> | undefined;

    const value = cookies?.[this.cookieName];

    return typeof value === 'string' ? value : undefined;
  }

  private setRefreshCookie(
    response: Response,
    refreshToken: string,
    expiresAt: Date,
  ): void {
    response.cookie(this.cookieName, refreshToken, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'strict',
      path: '/api/v1/auth',
      expires: expiresAt,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(this.cookieName, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'strict',
      path: '/api/v1/auth',
    });
  }
}
