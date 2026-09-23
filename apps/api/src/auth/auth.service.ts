import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import {
  AccountClass,
  AccountRole,
  EmployeeStatus,
} from '../generated/prisma/client';
import { AdminLoginDto } from './dto/admin-login.dto';
import { EmployeeLoginDto } from './dto/employee-login.dto';
import { UnifiedLoginDto } from './dto/unified-login.dto';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  normalizeOfficialEmailForLookup,
  sanitizeOfficialEmail,
} from '../common/normalization/account-identity-normalization';
import { PrismaService } from '../database/prisma.service';
import { NativeBloomFilterService } from '../security/native-bloom-filter.service';
import type { RefreshTokenPayload } from './types/auth.types';

interface LoginMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface TokenResult {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface AccountResult {
  id: string;
  username: string | null;
  accountClass: AccountClass;
  role: AccountRole;
  displayName: string;
  positionLabel: string;
  interfaceLanguage: string;
}

export interface LoginResult extends TokenResult {
  account: AccountResult;
}

export interface RefreshResult extends TokenResult {
  account: AccountResult;
}

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;

  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;

  private readonly maxLoginAttempts: number;
  private readonly lockMinutes: number;

  private readonly dummyHashPromise = argon2.hash(
    'nt-message-invalid-password',
    {
      type: argon2.argon2id,
    },
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly nativeBloomFilter: NativeBloomFilterService,
  ) {
    this.accessSecret =
      this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');

    this.refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');

    this.accessTtlSeconds = this.readPositiveInteger(
      'ACCESS_TOKEN_TTL_SECONDS',
    );

    this.refreshTtlSeconds = this.readPositiveInteger(
      'REFRESH_TOKEN_TTL_SECONDS',
    );

    this.maxLoginAttempts = this.readPositiveInteger('LOGIN_MAX_ATTEMPTS');

    this.lockMinutes = this.readPositiveInteger('LOGIN_LOCK_MINUTES');
  }

  async loginUnified(
    dto: UnifiedLoginDto,
    metadata: LoginMetadata,
  ): Promise<LoginResult> {
    const identifier = dto.identifier.trim().toLowerCase();

    if (!identifier.includes('@')) {
      const dummyHash = await this.dummyHashPromise;

      await argon2.verify(dummyHash, dto.password);

      throw this.invalidCredentials();
    }

    // Super Admin now uses the same official-email login field as every other account.
    const superAdminAccount = await this.prisma.account.findFirst({
      where: {
        username: {
          equals: identifier,
          mode: 'insensitive',
        },
        accountClass: AccountClass.SUPER_ADMIN,
      },
      select: {
        id: true,
      },
    });

    if (superAdminAccount) {
      return this.loginAdmin(
        {
          username: identifier,
          password: dto.password,
        },
        metadata,
      );
    }

    return this.loginEmployee(
      {
        officialEmail: identifier,
        password: dto.password,
      },
      metadata,
    );
  }

  async loginAdmin(
    dto: AdminLoginDto,
    metadata: LoginMetadata,
  ): Promise<LoginResult> {
    const username = dto.username.trim().toLowerCase();

    const account = await this.prisma.account.findUnique({
      where: {
        username,
      },
    });

    if (!account) {
      const dummyHash = await this.dummyHashPromise;

      await argon2.verify(dummyHash, dto.password);

      throw this.invalidCredentials();
    }

    const now = new Date();

    if (account.lockedUntil && account.lockedUntil > now) {
      throw new HttpException(
        'Too many failed login attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const passwordIsValid = await argon2.verify(
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
      account.accountClass !== AccountClass.SUPER_ADMIN ||
      !account.isEnabled
    ) {
      throw this.invalidCredentials();
    }

    const sessionId = randomUUID();

    const refreshTokenExpiresAt = new Date(
      Date.now() + this.refreshTtlSeconds * 1000,
    );

    const tokens = await this.createTokenPair(
      account.id,
      account.accountClass,
      sessionId,
      refreshTokenExpiresAt,
    );

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

          refreshTokenHash: this.hashToken(tokens.refreshToken),

          ipAddress: metadata.ipAddress,

          userAgent: metadata.userAgent,

          expiresAt: refreshTokenExpiresAt,
        },
      }),
    ]);

    return {
      ...tokens,

      account: await this.buildAccountResult(account.id),
    };
  }

  async loginEmployee(
    dto: EmployeeLoginDto,
    metadata: LoginMetadata,
  ): Promise<LoginResult> {
    const officialEmail = sanitizeOfficialEmail(dto.officialEmail);
    const officialEmailLookup = normalizeOfficialEmailForLookup(officialEmail);

    const employee = await this.prisma.employee.findFirst({
      where: {
        officialEmail: {
          equals: officialEmailLookup,
          mode: 'insensitive',
        },
      },

      select: {
        id: true,
        status: true,
        isActivated: true,

        account: true,
      },
    });

    const account = employee?.account;

    if (!account) {
      const dummyHash = await this.dummyHashPromise;

      await argon2.verify(dummyHash, dto.password);

      throw this.invalidCredentials();
    }

    const now = new Date();

    if (account.lockedUntil && account.lockedUntil > now) {
      throw new HttpException(
        'Too many failed login attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const passwordIsValid = await argon2.verify(
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

    const employeeCanLogin =
      account.accountClass === AccountClass.OFFICE_USER &&
      account.isEnabled &&
      employee.isActivated &&
      employee.status === EmployeeStatus.ACTIVE;

    if (!employeeCanLogin) {
      throw this.invalidCredentials();
    }

    const sessionId = randomUUID();

    const refreshTokenExpiresAt = new Date(
      Date.now() + this.refreshTtlSeconds * 1000,
    );

    const tokens = await this.createTokenPair(
      account.id,
      account.accountClass,
      sessionId,
      refreshTokenExpiresAt,
    );

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

          refreshTokenHash: this.hashToken(tokens.refreshToken),

          ipAddress: metadata.ipAddress,

          userAgent: metadata.userAgent,

          expiresAt: refreshTokenExpiresAt,
        },
      }),
    ]);

    return {
      ...tokens,

      account: await this.buildAccountResult(account.id),
    };
  }

  async refreshSession(
    refreshToken: string | undefined,
  ): Promise<RefreshResult> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is missing.');
    }

    const payload = await this.verifyRefreshToken(refreshToken);

    const probableRefreshReplay =
      typeof payload.jti === 'string' && payload.jti.length > 0
        ? this.nativeBloomFilter.mightContain('auth:refresh-used', payload.jti)
        : false;

    if (payload.type !== 'refresh' || !payload.sub || !payload.sid) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const session = await this.prisma.authSession.findUnique({
      where: {
        id: payload.sid,
      },

      include: {
        account: {
          select: {
            id: true,
            employeeId: true,
            username: true,
            accountClass: true,
            isEnabled: true,
          },
        },
      },
    });

    const now = new Date();

    const sessionIsInvalid =
      !session ||
      session.accountId !== payload.sub ||
      session.revokedAt !== null ||
      session.expiresAt <= now ||
      !session.account.isEnabled;

    if (sessionIsInvalid) {
      throw new UnauthorizedException(
        'Authentication session is invalid or expired.',
      );
    }

    if (payload.accountClass !== session.account.accountClass) {
      throw new UnauthorizedException(
        'Your account class has changed. Sign in again.',
      );
    }

    const incomingTokenHash = this.hashToken(refreshToken);

    const tokenHashMatches = this.tokenHashesMatch(
      session.refreshTokenHash,
      incomingTokenHash,
    );

    if (!tokenHashMatches) {
      /*
       * Bloom positives are never authoritative because false positives are
       * possible. The persisted refresh-token hash remains the final replay
       * decision. probableRefreshReplay is intentionally only a fast signal.
       */
      void probableRefreshReplay;
      throw new UnauthorizedException(
        'Refresh token is invalid or has already been used.',
      );
    }

    const tokens = await this.createTokenPair(
      session.account.id,
      session.account.accountClass,
      session.id,
      session.expiresAt,
    );

    const newRefreshTokenHash = this.hashToken(tokens.refreshToken);

    /*
     * updateMany makes rotation conditional.
     *
     * The update succeeds only when the old hash
     * still exists and the session is still active.
     */
    const updateResult = await this.prisma.authSession.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: incomingTokenHash,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },

      data: {
        refreshTokenHash: newRefreshTokenHash,
        lastUsedAt: now,
      },
    });

    if (updateResult.count !== 1) {
      throw new UnauthorizedException(
        'Refresh token is invalid or has already been used.',
      );
    }

    if (typeof payload.jti === 'string' && payload.jti.length > 0) {
      this.nativeBloomFilter.add('auth:refresh-used', payload.jti);
    }

    return {
      ...tokens,

      account: await this.buildAccountResult(session.account.id),
    };
  }

  async getCurrentAccountResult(accountId: string): Promise<AccountResult> {
    return this.buildAccountResult(accountId);
  }

  async logoutSession(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }

    try {
      const payload = await this.verifyRefreshToken(refreshToken);

      const refreshTokenHash = this.hashToken(refreshToken);

      await this.prisma.authSession.updateMany({
        where: {
          id: payload.sid,
          accountId: payload.sub,
          refreshTokenHash,
          revokedAt: null,
        },

        data: {
          revokedAt: new Date(),
        },
      });
    } catch {
      /*
       * Logout remains safe and idempotent.
       * The controller will still clear the cookie.
       */
    }
  }

  async logoutAllSessions(accountId: string): Promise<number> {
    const result = await this.prisma.authSession.updateMany({
      where: {
        accountId,
        revokedAt: null,
      },

      data: {
        revokedAt: new Date(),
      },
    });

    return result.count;
  }

  private async buildAccountResult(accountId: string): Promise<AccountResult> {
    const account = await this.prisma.account.findUnique({
      where: {
        id: accountId,
      },

      select: {
        id: true,
        username: true,
        accountClass: true,
        employeeId: true,
        interfaceLanguage: true,

        employee: {
          select: {
            empName: true,
            designation: true,
          },
        },

        superAdminProfile: {
          select: {
            fullName: true,
          },
        },
      },
    });

    if (!account) {
      throw new UnauthorizedException('Authenticated account was not found.');
    }

    // Phase 13: platform identity is AccountClass. Office leadership is
    // resolved through V3 organization assignments, not projected into
    // legacy hierarchy-role compatibility projections.
    const effectiveRole =
      account.accountClass === AccountClass.SUPER_ADMIN
        ? AccountRole.SUPER_ADMIN
        : AccountRole.EMPLOYEE;

    const fallbackName =
      account.accountClass === AccountClass.SUPER_ADMIN
        ? this.configService.get<string>('SUPER_ADMIN_NAME')?.trim()
        : null;

    return {
      id: account.id,
      username: account.username,
      accountClass: account.accountClass,
      role: effectiveRole,

      // Headers show official identity, not login email or internal username.
      displayName:
        account.superAdminProfile?.fullName ??
        account.employee?.empName ??
        fallbackName ??
        (account.accountClass === AccountClass.SUPER_ADMIN
          ? 'Super Admin'
          : 'Office User'),

      // Position stays separate so every header can show name + authority clearly.
      positionLabel:
        account.accountClass === AccountClass.SUPER_ADMIN
          ? 'Super Admin'
          : (account.employee?.designation ?? 'Office User'),

      interfaceLanguage: account.interfaceLanguage,
    };
  }

  private async createTokenPair(
    accountId: string,
    accountClass: AccountClass,
    sessionId: string,
    refreshTokenExpiresAt: Date,
  ): Promise<TokenResult> {
    const remainingRefreshSeconds = Math.floor(
      (refreshTokenExpiresAt.getTime() - Date.now()) / 1000,
    );

    if (remainingRefreshSeconds <= 0) {
      throw new UnauthorizedException('Authentication session has expired.');
    }

    const accessPayload = {
      sub: accountId,
      sid: sessionId,
      accountClass,
      type: 'access' as const,
    };

    const refreshPayload = {
      sub: accountId,
      sid: sessionId,
      accountClass,
      type: 'refresh' as const,

      /*
       * Makes every rotated refresh token unique.
       */
      jti: randomUUID(),
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.accessSecret,

        expiresIn: this.accessTtlSeconds,
      }),

      this.jwtService.signAsync(refreshPayload, {
        secret: this.refreshSecret,

        expiresIn: remainingRefreshSeconds,
      }),
    ]);

    return {
      accessToken,
      accessTokenExpiresIn: this.accessTtlSeconds,
      refreshToken,
      refreshTokenExpiresAt,
    };
  }

  private async verifyRefreshToken(
    refreshToken: string,
  ): Promise<RefreshTokenPayload> {
    try {
      return await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        {
          secret: this.refreshSecret,

          algorithms: ['HS256'],
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private tokenHashesMatch(storedHash: string, incomingHash: string): boolean {
    const storedBuffer = Buffer.from(storedHash, 'hex');

    const incomingBuffer = Buffer.from(incomingHash, 'hex');

    if (storedBuffer.length !== incomingBuffer.length) {
      return false;
    }

    return timingSafeEqual(storedBuffer, incomingBuffer);
  }

  private async recordFailedLogin(
    accountId: string,
    currentAttempts: number,
    existingLock: Date | null,
  ): Promise<void> {
    const lockExpired = existingLock !== null && existingLock <= new Date();

    const previousAttempts = lockExpired ? 0 : currentAttempts;

    const nextAttempts = previousAttempts + 1;

    const shouldLock = nextAttempts >= this.maxLoginAttempts;

    const lockedUntil = shouldLock
      ? new Date(Date.now() + this.lockMinutes * 60 * 1000)
      : null;

    await this.prisma.account.update({
      where: {
        id: accountId,
      },

      data: {
        failedLoginAttempts: nextAttempts,
        lockedUntil,
      },
    });
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException('Invalid username or password.');
  }

  private readPositiveInteger(variableName: string): number {
    const rawValue = this.configService.getOrThrow<string>(variableName);

    const parsedValue = Number(rawValue);

    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      throw new Error(`${variableName} must be a positive integer.`);
    }

    return parsedValue;
  }
}
