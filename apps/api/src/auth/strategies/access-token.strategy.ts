import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../database/prisma.service';
import { AccessTokenPayload, AuthenticatedUser } from '../types/auth.types';

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      ignoreExpiration: false,

      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
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
      !session.account.isEnabled ||
      session.account.role !== payload.role;

    if (sessionIsInvalid) {
      throw new UnauthorizedException(
        'Authentication session is invalid or expired.',
      );
    }

    return {
      accountId: session.account.id,
      sessionId: session.id,
      username: session.account.username,
      role: session.account.role,
    };
  }
}
