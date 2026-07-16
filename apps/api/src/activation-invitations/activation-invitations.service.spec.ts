import { ConfigService } from '@nestjs/config';

import type { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';

import { ActivationInvitationsService } from './activation-invitations.service';

// This suite tests pure cooldown calculations. Mocking the database provider keeps
// Jest isolated from the generated Prisma runtime, which is covered by API build
// and integration checks rather than by this focused unit test.
jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

function createService(): ActivationInvitationsService {
  const values: Record<string, string> = {
    WEB_ORIGIN: 'http://localhost:5173',
    ACTIVATION_INVITATION_TTL_HOURS: '72',
    OTP_RESEND_COOLDOWN_SECONDS: '60',
  };

  const configService = {
    getOrThrow: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;

  return new ActivationInvitationsService(
    {} as PrismaService,
    {} as MailService,
    configService,
  );
}

describe('ActivationInvitationsService resend cooldown', () => {
  it('allows the first resend immediately', () => {
    const service = createService();

    expect(service.getResendCooldownRemainingSeconds(null)).toBe(0);
  });

  it('returns the remaining whole seconds during cooldown', () => {
    const service = createService();
    const attemptedAt = new Date('2026-07-16T10:00:00.000Z');
    const now = new Date('2026-07-16T10:00:30.200Z');

    expect(service.getResendCooldownRemainingSeconds(attemptedAt, now)).toBe(
      30,
    );
  });

  it('allows resend exactly when the cooldown expires', () => {
    const service = createService();
    const attemptedAt = new Date('2026-07-16T10:00:00.000Z');
    const now = new Date('2026-07-16T10:01:00.000Z');

    expect(service.getResendCooldownRemainingSeconds(attemptedAt, now)).toBe(0);
  });

  it('returns the next allowed resend time', () => {
    const service = createService();
    const attemptedAt = new Date('2026-07-16T10:00:00.000Z');

    expect(service.getResendAvailableAt(attemptedAt).toISOString()).toBe(
      '2026-07-16T10:01:00.000Z',
    );
  });
});
