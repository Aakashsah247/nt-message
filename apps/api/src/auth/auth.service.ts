import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import {
  createHash,
  randomUUID,
} from "node:crypto";
import {
  AccountRole,
} from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { AdminLoginDto } from "./dto/admin-login.dto";

interface LoginMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

interface TokenPayload {
  sub: string;
  role: AccountRole;
  type: "access" | "refresh";
  sid?: string;
}

interface LoginResult {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  account: {
    id: string;
    username: string | null;
    role: AccountRole;
  };
}

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;

  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;

  private readonly maxLoginAttempts: number;
  private readonly lockMinutes: number;

  /*
   * Used when an account does not exist.
   *
   * It helps make missing-account requests perform password-hash
   * work instead of returning immediately.
   */
  private readonly dummyHashPromise = argon2.hash(
    "nt-message-invalid-password",
    {
      type: argon2.argon2id,
    },
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.accessSecret =
      this.configService.getOrThrow<string>(
        "JWT_ACCESS_SECRET",
      );

    this.refreshSecret =
      this.configService.getOrThrow<string>(
        "JWT_REFRESH_SECRET",
      );

    this.accessTtlSeconds =
      this.readPositiveInteger(
        "ACCESS_TOKEN_TTL_SECONDS",
      );

    this.refreshTtlSeconds =
      this.readPositiveInteger(
        "REFRESH_TOKEN_TTL_SECONDS",
      );

    this.maxLoginAttempts =
      this.readPositiveInteger(
        "LOGIN_MAX_ATTEMPTS",
      );

    this.lockMinutes =
      this.readPositiveInteger(
        "LOGIN_LOCK_MINUTES",
      );
  }

  async loginAdmin(
    dto: AdminLoginDto,
    metadata: LoginMetadata,
  ): Promise<LoginResult> {
    const username = dto.username
      .trim()
      .toLowerCase();

    const account =
      await this.prisma.account.findUnique({
        where: {
          username,
        },
      });

    /*
     * Use the same response when the account does not exist.
     * This prevents exposing whether a username is registered.
     */
    if (!account) {
      const dummyHash =
        await this.dummyHashPromise;

      await argon2.verify(
        dummyHash,
        dto.password,
      );

      throw this.invalidCredentials();
    }

    const now = new Date();

    if (
      account.lockedUntil &&
      account.lockedUntil > now
    ) {
      throw new HttpException(
        "Too many failed login attempts. Try again later.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const passwordIsValid =
      await argon2.verify(
        account.passwordHash,
        dto.password,
      );

    if (!passwordIsValid) {
      await this.recordFailedLogin(
        account.id,
        account.failedLoginAttempts,
        account.lockedUntil,
      );

      throw this.invalidCredentials();
    }

    if (
      account.role !== AccountRole.ADMIN ||
      !account.isEnabled
    ) {
      throw this.invalidCredentials();
    }

    const sessionId = randomUUID();

    const refreshTokenExpiresAt =
      new Date(
        Date.now() +
          this.refreshTtlSeconds * 1000,
      );

    const accessPayload: TokenPayload = {
      sub: account.id,
      role: account.role,
      type: "access",
    };

    const refreshPayload: TokenPayload = {
      sub: account.id,
      role: account.role,
      type: "refresh",
      sid: sessionId,
    };

    const [accessToken, refreshToken] =
      await Promise.all([
        this.jwtService.signAsync(
          accessPayload,
          {
            secret: this.accessSecret,
            expiresIn:
              this.accessTtlSeconds,
          },
        ),

        this.jwtService.signAsync(
          refreshPayload,
          {
            secret: this.refreshSecret,
            expiresIn:
              this.refreshTtlSeconds,
          },
        ),
      ]);

    const refreshTokenHash =
      createHash("sha256")
        .update(refreshToken)
        .digest("hex");

    /*
     * Both operations succeed together.
     *
     * If session creation fails, the account update is also
     * cancelled by the database transaction.
     */
    await this.prisma.$transaction([
      this.prisma.account.update({
        where: {
          id: account.id,
        },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: now,
        },
      }),

      this.prisma.authSession.create({
        data: {
          id: sessionId,
          accountId: account.id,
          refreshTokenHash,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          expiresAt:
            refreshTokenExpiresAt,
        },
      }),
    ]);

    return {
      accessToken,
      accessTokenExpiresIn:
        this.accessTtlSeconds,
      refreshToken,
      refreshTokenExpiresAt,
      account: {
        id: account.id,
        username: account.username,
        role: account.role,
      },
    };
  }

  private async recordFailedLogin(
    accountId: string,
    currentAttempts: number,
    existingLock: Date | null,
  ): Promise<void> {
    const lockExpired =
      existingLock !== null &&
      existingLock <= new Date();

    const previousAttempts =
      lockExpired ? 0 : currentAttempts;

    const nextAttempts =
      previousAttempts + 1;

    const shouldLock =
      nextAttempts >=
      this.maxLoginAttempts;

    const lockedUntil = shouldLock
      ? new Date(
          Date.now() +
            this.lockMinutes *
              60 *
              1000,
        )
      : null;

    await this.prisma.account.update({
      where: {
        id: accountId,
      },
      data: {
        failedLoginAttempts:
          nextAttempts,
        lockedUntil,
      },
    });
  }

  private invalidCredentials():
    UnauthorizedException {
    return new UnauthorizedException(
      "Invalid username or password.",
    );
  }

  private readPositiveInteger(
    variableName: string,
  ): number {
    const rawValue =
      this.configService.getOrThrow<string>(
        variableName,
      );

    const parsedValue =
      Number(rawValue);

    if (
      !Number.isInteger(parsedValue) ||
      parsedValue <= 0
    ) {
      throw new Error(
        `${variableName} must be a positive integer.`,
      );
    }

    return parsedValue;
  }
}
