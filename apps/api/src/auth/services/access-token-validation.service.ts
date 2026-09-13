import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../../database/prisma.service';
import {
  AccountClass,
  AccountRole,
} from '../../generated/prisma/client';
import type {
  AccessTokenPayload,
  AuthenticatedUser,
} from '../types/auth.types';

@Injectable()
export class AccessTokenValidationService {
  private readonly accessSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.accessSecret = configService.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    const verified = await this.verifyAccessTokenWithMetadata(token);

    return verified.user;
  }

  async verifyAccessTokenWithMetadata(token: string): Promise<{
    user: AuthenticatedUser;
    accessTokenExpiresAt: Date;
  }> {
    let payload: AccessTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.accessSecret,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
      throw new UnauthorizedException('Invalid access token.');
    }

    return {
      user: await this.validatePayload(payload),
      accessTokenExpiresAt: new Date(payload.exp * 1000),
    };
  }

  async validatePayload(
    payload: AccessTokenPayload,
  ): Promise<AuthenticatedUser> {
    if (
      payload.type !== 'access' ||
      !payload.sub ||
      !payload.sid ||
      !payload.accountClass
    ) {
      throw new UnauthorizedException('Invalid access token.');
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

    // Leadership is resolved at authorization time. Tokens expose only the
    // stable platform class plus a temporary non-authoritative legacy role
    // value for clients that have not yet dropped the field.
    const role =
      session.account.accountClass === AccountClass.SUPER_ADMIN
        ? AccountRole.SUPER_ADMIN
        : AccountRole.EMPLOYEE;

    return {
      accountId: session.account.id,
      sessionId: session.id,
      username: session.account.username,
      accountClass: session.account.accountClass,
      role,
    };
  }


}
