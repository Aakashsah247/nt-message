import type { PrismaService } from '../database/prisma.service';
import { AccountRole } from '../generated/prisma/enums';
import { MessagingSocketSessionService } from './messaging-socket-session.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('MessagingSocketSessionService', () => {
  const prisma = {
    authSession: {
      findMany: jest.fn(),
    },
  } as unknown as PrismaService;

  const activeSession = {
    id: 'session-1',
    accountId: 'account-1',
    revokedAt: null,
    expiresAt: new Date('2026-08-16T00:00:00.000Z'),
    account: {
      isEnabled: true,
      role: AccountRole.EMPLOYEE,
    },
  };

  let service: MessagingSocketSessionService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-08-15T18:00:00.000Z'));
    service = new MessagingSocketSessionService(prisma);
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  function register(invalidate = jest.fn()): jest.Mock {
    service.register({
      socketId: 'socket-1',
      user: {
        accountId: 'account-1',
        sessionId: 'session-1',
        username: 'employee.one',
        role: AccountRole.EMPLOYEE,
      },
      accessTokenExpiresAt: new Date('2026-08-15T18:10:00.000Z'),
      invalidate,
    });

    return invalidate;
  }

  it('keeps an active matching session connected', async () => {
    jest.mocked(prisma.authSession.findMany).mockResolvedValue([
      activeSession,
    ] as never);
    const invalidate = register();

    await service.validateNow();

    expect(invalidate).not.toHaveBeenCalled();
    expect(prisma.authSession.findMany).toHaveBeenCalledTimes(1);
  });

  it('invalidates a revoked persisted session', async () => {
    jest.mocked(prisma.authSession.findMany).mockResolvedValue([
      {
        ...activeSession,
        revokedAt: new Date('2026-08-15T17:59:59.000Z'),
      },
    ] as never);
    const invalidate = register();

    await service.validateNow();

    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('invalidates an expired access token without querying PostgreSQL', async () => {
    const invalidate = jest.fn();
    service.register({
      socketId: 'socket-1',
      user: {
        accountId: 'account-1',
        sessionId: 'session-1',
        username: 'employee.one',
        role: AccountRole.EMPLOYEE,
      },
      accessTokenExpiresAt: new Date('2026-08-15T17:59:59.000Z'),
      invalidate,
    });

    await service.validateNow();

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(prisma.authSession.findMany).not.toHaveBeenCalled();
  });

  it('does not mass-disconnect users when revalidation hits a transient DB error', async () => {
    jest
      .mocked(prisma.authSession.findMany)
      .mockRejectedValue(new Error('temporary database failure'));
    const invalidate = register();
    const warn = jest
      .spyOn(
        (service as unknown as { logger: { warn(message: string): void } }).logger,
        'warn',
      )
      .mockImplementation(() => undefined);

    await service.validateNow();

    expect(invalidate).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});
