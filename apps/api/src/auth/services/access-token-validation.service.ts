import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../../database/prisma.service';
import {
  AccountRole,
  ManagementPositionType,
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
    if (payload.type !== 'access' || !payload.sub || !payload.sid) {
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
            role: true,
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

    const effectiveRole = await this.resolveEffectiveRole(
      session.account.employeeId,
      session.account.role,
    );

    if (
      session.account.role !== effectiveRole ||
      payload.role !== effectiveRole
    ) {
      throw new UnauthorizedException(
        'Your account authority has changed. Sign in again.',
      );
    }

    return {
      accountId: session.account.id,
      sessionId: session.id,
      username: session.account.username,
      role: effectiveRole,
    };
  }

  private async resolveEffectiveRole(
    employeeId: string | null,
    storedRole: AccountRole,
  ): Promise<AccountRole> {
    if (storedRole === AccountRole.SUPER_ADMIN) {
      return AccountRole.SUPER_ADMIN;
    }

    if (!employeeId) {
      return AccountRole.EMPLOYEE;
    }

    const activeAssignment = await this.prisma.managementAssignment.findFirst({
      where: {
        employeeId,
        endedAt: null,

        position: {
          isActive: true,
        },
      },

      select: {
        position: {
          select: {
            positionType: true,
          },
        },
      },
    });

    if (!activeAssignment) {
      return AccountRole.EMPLOYEE;
    }

    return activeAssignment.position.positionType ===
      ManagementPositionType.SENIOR_MANAGEMENT
      ? AccountRole.SENIOR_MANAGEMENT
      : AccountRole.TEAM_MANAGER;
  }
}
