import type { PrismaService } from '../database/prisma.service';
import { MonitoringService } from './monitoring.service';

describe('MonitoringService retention cleanup', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createService = () => {
    const prisma = {
      activityEvent: {
        deleteMany: jest.fn(),
      },
      dailyActivitySummary: {
        deleteMany: jest.fn(),
      },
    } as unknown as PrismaService;

    return {
      prisma,
      service: new MonitoringService(prisma),
    };
  };

  it('deletes expired events and summaries without opening a transaction', async () => {
    const { prisma, service } = createService();
    const activityDeleteMany = jest
      .mocked(prisma.activityEvent.deleteMany)
      .mockResolvedValue({ count: 2 });
    const summaryDeleteMany = jest
      .mocked(prisma.dailyActivitySummary.deleteMany)
      .mockResolvedValue({ count: 1 });

    await (service as unknown as {
      cleanupOldMonitoringRecords: () => Promise<void>;
    }).cleanupOldMonitoringRecords();

    expect(activityDeleteMany).toHaveBeenCalledTimes(1);
    expect(summaryDeleteMany).toHaveBeenCalledTimes(1);
  });

  it('contains a temporary database failure and permits the next cleanup retry', async () => {
    const { prisma, service } = createService();
    const warning = jest
      .spyOn(
        (service as unknown as { logger: { warn(message: string): void } }).logger,
        'warn',
      )
      .mockImplementation(() => undefined);
    const activityDeleteMany = jest.mocked(prisma.activityEvent.deleteMany);
    const summaryDeleteMany = jest
      .mocked(prisma.dailyActivitySummary.deleteMany)
      .mockResolvedValue({ count: 0 });

    activityDeleteMany
      .mockRejectedValueOnce(
        new Error('P2028: Unable to start a transaction in the given time.'),
      )
      .mockResolvedValueOnce({ count: 0 });

    const cleanup = () =>
      (service as unknown as {
        cleanupOldMonitoringRecords: () => Promise<void>;
      }).cleanupOldMonitoringRecords();

    await expect(cleanup()).resolves.toBeUndefined();
    await expect(cleanup()).resolves.toBeUndefined();

    expect(activityDeleteMany).toHaveBeenCalledTimes(2);
    expect(summaryDeleteMany).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('P2028: Unable to start a transaction'),
    );
  });

  it('does not start overlapping cleanup runs', async () => {
    const { prisma, service } = createService();
    let resolveDelete: ((value: { count: number }) => void) | undefined;
    const pendingDelete = new Promise<{ count: number }>((resolve) => {
      resolveDelete = resolve;
    });
    const activityDeleteMany = jest
      .mocked(prisma.activityEvent.deleteMany)
      .mockReturnValue(pendingDelete as never);
    jest
      .mocked(prisma.dailyActivitySummary.deleteMany)
      .mockResolvedValue({ count: 0 });

    const cleanup = () =>
      (service as unknown as {
        cleanupOldMonitoringRecords: () => Promise<void>;
      }).cleanupOldMonitoringRecords();

    const firstRun = cleanup();
    await cleanup();

    expect(activityDeleteMany).toHaveBeenCalledTimes(1);

    resolveDelete?.({ count: 0 });
    await firstRun;
  });
});
