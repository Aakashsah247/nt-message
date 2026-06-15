import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  Request,
  Response,
} from "express";
import { AuthService } from "./auth.service";
import { AdminLoginDto } from "./dto/admin-login.dto";

@Controller("auth")
export class AuthController {
  private readonly cookieName: string;
  private readonly isProduction: boolean;

  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    this.cookieName =
      configService.getOrThrow<string>(
        "AUTH_COOKIE_NAME",
      );

    this.isProduction =
      configService.get<string>(
        "NODE_ENV",
      ) === "production";
  }

  @Post("admin/login")
  @HttpCode(HttpStatus.OK)
  async adminLogin(
    @Body() dto: AdminLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true })
    response: Response,
  ) {
    const result =
      await this.authService.loginAdmin(
        dto,
        {
          ipAddress:
            request.ip ??
            request.socket
              .remoteAddress ??
            null,

          userAgent:
            request.get(
              "user-agent",
            ) ?? null,
        },
      );

    response.cookie(
      this.cookieName,
      result.refreshToken,
      {
        httpOnly: true,

        /*
         * Secure cookies require HTTPS.
         * It is false during local HTTP development
         * and true in production.
         */
        secure: this.isProduction,

        sameSite: "strict",

        /*
         * The browser sends this cookie only to
         * authentication endpoints.
         */
        path: "/api/v1/auth",

        expires:
          result.refreshTokenExpiresAt,
      },
    );

    return {
      accessToken:
        result.accessToken,

      accessTokenExpiresIn:
        result.accessTokenExpiresIn,

      account:
        result.account,
    };
  }
}
