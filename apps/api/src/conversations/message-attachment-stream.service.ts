import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/types/auth.types';

const STREAM_TOKEN_TTL_SECONDS = 30 * 60;
const STREAM_TOKEN_TYPE = 'message-attachment-stream-v1';

interface MessageAttachmentStreamTokenPayload {
  type: typeof STREAM_TOKEN_TYPE;
  accountId: string;
  sessionId: string;
  conversationId: string;
  messageId: string;
  attachmentId: string;
  expiresAt: number;
  nonce: string;
}

export interface VerifiedMessageAttachmentStreamAccess {
  user: AuthenticatedUser;
  conversationId: string;
  messageId: string;
  attachmentId: string;
}

@Injectable()
export class MessageAttachmentStreamService {
  private readonly signingKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    const accessSecret = configService.getOrThrow<string>('JWT_ACCESS_SECRET');

    // Use a derived key so a media token can never be accepted as a normal
    // access token even if another authentication check is changed later.
    this.signingKey = createHash('sha256')
      .update(`nt-message:${STREAM_TOKEN_TYPE}:${accessSecret}`)
      .digest();
  }

  createAccessToken(
    user: AuthenticatedUser,
    conversationId: string,
    messageId: string,
    attachmentId: string,
  ): { token: string; expiresAt: string } {
    const expiresAt = Date.now() + STREAM_TOKEN_TTL_SECONDS * 1000;
    const payload: MessageAttachmentStreamTokenPayload = {
      type: STREAM_TOKEN_TYPE,
      accountId: user.accountId,
      sessionId: user.sessionId,
      conversationId,
      messageId,
      attachmentId,
      expiresAt,
      nonce: randomUUID(),
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signature = this.sign(encodedPayload);

    return {
      token: `${encodedPayload}.${signature}`,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async verifyAccessToken(
    token: string,
  ): Promise<VerifiedMessageAttachmentStreamAccess> {
    const payload = this.verifySignatureAndDecode(token);

    if (payload.expiresAt <= Date.now()) {
      throw new UnauthorizedException('Media access has expired.');
    }

    const session = await this.prisma.authSession.findUnique({
      where: {
        id: payload.sessionId,
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
    const invalidSession =
      !session ||
      session.accountId !== payload.accountId ||
      session.revokedAt !== null ||
      session.expiresAt <= now ||
      !session.account.isEnabled;

    if (invalidSession) {
      throw new UnauthorizedException(
        'Authentication session is invalid or expired.',
      );
    }

    return {
      user: {
        accountId: session.account.id,
        sessionId: session.id,
        username: session.account.username,
        role: session.account.role,
      },
      conversationId: payload.conversationId,
      messageId: payload.messageId,
      attachmentId: payload.attachmentId,
    };
  }

  private sign(encodedPayload: string): string {
    return createHmac('sha256', this.signingKey)
      .update(encodedPayload)
      .digest('base64url');
  }

  private verifySignatureAndDecode(
    token: string,
  ): MessageAttachmentStreamTokenPayload {
    const separatorIndex = token.lastIndexOf('.');

    if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
      throw new UnauthorizedException('Invalid media access token.');
    }

    const encodedPayload = token.slice(0, separatorIndex);
    const providedSignature = token.slice(separatorIndex + 1);
    const expectedSignature = this.sign(encodedPayload);
    const providedBuffer = Buffer.from(providedSignature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid media access token.');
    }

    let payload: unknown;

    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      );
    } catch {
      throw new UnauthorizedException('Invalid media access token.');
    }

    if (!this.isValidPayload(payload)) {
      throw new UnauthorizedException('Invalid media access token.');
    }

    return payload;
  }

  private isValidPayload(
    payload: unknown,
  ): payload is MessageAttachmentStreamTokenPayload {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const candidate = payload as Partial<MessageAttachmentStreamTokenPayload>;

    return (
      candidate.type === STREAM_TOKEN_TYPE &&
      typeof candidate.accountId === 'string' &&
      candidate.accountId.length > 0 &&
      typeof candidate.sessionId === 'string' &&
      candidate.sessionId.length > 0 &&
      typeof candidate.conversationId === 'string' &&
      candidate.conversationId.length > 0 &&
      typeof candidate.messageId === 'string' &&
      candidate.messageId.length > 0 &&
      typeof candidate.attachmentId === 'string' &&
      candidate.attachmentId.length > 0 &&
      typeof candidate.expiresAt === 'number' &&
      Number.isFinite(candidate.expiresAt) &&
      typeof candidate.nonce === 'string' &&
      candidate.nonce.length > 0
    );
  }
}

export interface ParsedByteRange {
  start: number;
  end: number;
}

export function parseSingleByteRange(
  rangeHeader: string,
  fileSizeBytes: number,
): ParsedByteRange | null {
  if (!Number.isSafeInteger(fileSizeBytes) || fileSizeBytes <= 0) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());

  if (!match) {
    return null;
  }

  const startText = match[1] ?? '';
  const endText = match[2] ?? '';

  if (!startText && !endText) {
    return null;
  }

  if (!startText) {
    const suffixLength = Number(endText);

    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return null;
    }

    const start = Math.max(fileSizeBytes - suffixLength, 0);
    return {
      start,
      end: fileSizeBytes - 1,
    };
  }

  const start = Number(startText);

  if (!Number.isSafeInteger(start) || start < 0 || start >= fileSizeBytes) {
    return null;
  }

  const requestedEnd = endText ? Number(endText) : fileSizeBytes - 1;

  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) {
    return null;
  }

  return {
    start,
    end: Math.min(requestedEnd, fileSizeBytes - 1),
  };
}
