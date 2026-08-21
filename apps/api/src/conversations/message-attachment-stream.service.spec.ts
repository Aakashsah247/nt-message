import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { PrismaService } from '../database/prisma.service';
import {
  MessageAttachmentStreamService,
  parseSingleByteRange,
} from './message-attachment-stream.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('MessageAttachmentStreamService', () => {
  const accountId = '11111111-1111-4111-8111-111111111111';
  const sessionId = 'session-1';
  const user = {
    accountId,
    sessionId,
    username: 'viewer',
    role: 'EMPLOYEE',
  } as never;

  const prisma = {
    authSession: {
      findUnique: jest.fn(),
    },
  } as unknown as PrismaService;
  const config = {
    getOrThrow: jest.fn().mockReturnValue('test-access-secret'),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a short-lived token and validates the current session', async () => {
    const service = new MessageAttachmentStreamService(prisma, config);
    jest.mocked(prisma.authSession.findUnique).mockResolvedValue({
      id: sessionId,
      accountId,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      account: {
        id: accountId,
        username: 'viewer',
        role: 'EMPLOYEE',
        isEnabled: true,
      },
    } as never);

    const issued = service.createAccessToken(
      user,
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    );
    const verified = await service.verifyAccessToken(issued.token);

    expect(verified.user.accountId).toBe(accountId);
    expect(verified.attachmentId).toBe(
      '44444444-4444-4444-8444-444444444444',
    );
  });

  it('rejects a stream token after the session is revoked', async () => {
    const service = new MessageAttachmentStreamService(prisma, config);
    jest.mocked(prisma.authSession.findUnique).mockResolvedValue({
      id: sessionId,
      accountId,
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      account: {
        id: accountId,
        username: 'viewer',
        role: 'EMPLOYEE',
        isEnabled: true,
      },
    } as never);

    const issued = service.createAccessToken(
      user,
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    );

    await expect(service.verifyAccessToken(issued.token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('parseSingleByteRange', () => {
  it('parses explicit, open-ended and suffix byte ranges', () => {
    expect(parseSingleByteRange('bytes=0-999', 10_000)).toEqual({
      start: 0,
      end: 999,
    });
    expect(parseSingleByteRange('bytes=9000-', 10_000)).toEqual({
      start: 9000,
      end: 9999,
    });
    expect(parseSingleByteRange('bytes=9000-20000', 10_000)).toEqual({
      start: 9000,
      end: 9999,
    });
    expect(parseSingleByteRange('bytes=-500', 10_000)).toEqual({
      start: 9500,
      end: 9999,
    });
  });

  it('rejects invalid or out-of-file ranges', () => {
    expect(parseSingleByteRange('bytes=10000-', 10_000)).toBeNull();
    expect(parseSingleByteRange('bytes=900-800', 10_000)).toBeNull();
    expect(parseSingleByteRange('bytes=0-1,5-6', 10_000)).toBeNull();
  });
});
