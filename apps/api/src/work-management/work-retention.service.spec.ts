import { ConflictException, ForbiddenException } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  WorkItemStatus,
} from '../generated/prisma/enums';
import { WorkRetentionService } from './work-retention.service';
import type { WorkScopeService } from './work-scope.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

const superAdminUser = {
  accountId: 'super-admin',
  sessionId: 'session',
  username: 'admin@ntc.test',
  role: AccountRole.SUPER_ADMIN,
};

function archivedTicket(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: 'work-1',
    ticketNumber: 'NT-PAT-NET-2023-000001',
    title: 'Historical network repair',
    status: WorkItemStatus.CLOSED,
    version: 1,
    archiveEligibleAt: new Date(now - 2 * 365 * 24 * 60 * 60 * 1000),
    deletionEligibleAt: new Date(now - 24 * 60 * 60 * 1000),
    retentionHoldAt: null,
    retentionHoldReason: null,
    deletionRequestedAt: null,
    deletionRequestReason: null,
    ...overrides,
  };
}

describe('WorkRetentionService', () => {
  const transaction = {
    workItem: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    workActivity: {
      create: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(),
  } as unknown as PrismaService;
  const scope = {
    resolveActorContext: jest.fn(),
    buildVisibleWorkWhere: jest.fn(),
  } as unknown as WorkScopeService;
  const service = new WorkRetentionService(prisma, scope);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'super-admin',
      role: AccountRole.SUPER_ADMIN,
      divisionId: null,
      departmentId: null,
    });
    jest.mocked(scope.buildVisibleWorkWhere).mockReturnValue({});
    jest
      .mocked(prisma.$transaction)
      .mockImplementation(async (callback: unknown) =>
        (callback as (client: typeof transaction) => Promise<unknown>)(
          transaction,
        ) as never,
      );
    transaction.workItem.updateMany.mockResolvedValue({ count: 1 });
    transaction.workItem.findUniqueOrThrow.mockResolvedValue({
      id: 'work-1',
      status: WorkItemStatus.CLOSED,
    });
  });

  it('rejects retention actions from ordinary management roles', async () => {
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'manager',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });

    await expect(
      service.placeHold(
        { ...superAdminUser, accountId: 'manager', role: AccountRole.TEAM_MANAGER },
        'work-1',
        { reason: 'Unauthorized retention request.' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('applies a hold and clears a pending deletion request', async () => {
    transaction.workItem.findFirst.mockResolvedValue(
      archivedTicket({
        deletionRequestedAt: new Date(),
        deletionRequestReason: 'Old request',
      }),
    );

    await service.placeHold(superAdminUser, 'work-1', {
      reason: 'Keep for an active service-quality audit.',
    });

    expect(transaction.workItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          retentionHoldReason: 'Keep for an active service-quality audit.',
          deletionRequestedAt: null,
          deletionRequestReason: null,
          deletionRequestedByAccountId: null,
        }),
      }),
    );
    expect(transaction.workActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'RETENTION_HOLD_APPLIED',
        }),
      }),
    );
  });

  it('blocks deletion review while a retention hold is active', async () => {
    transaction.workItem.findFirst.mockResolvedValue(
      archivedTicket({
        retentionHoldAt: new Date(),
        retentionHoldReason: 'Complaint investigation',
      }),
    );

    await expect(
      service.requestDeletionReview(superAdminUser, 'work-1', {
        reason: 'Routine retention period completed.',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('records an eligible deletion-review request without deleting data', async () => {
    transaction.workItem.findFirst.mockResolvedValue(archivedTicket());

    const result = await service.requestDeletionReview(
      superAdminUser,
      'work-1',
      { reason: 'Routine retention period completed.' },
    );

    expect(transaction.workItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deletionRequestReason: 'Routine retention period completed.',
          deletionRequestedByAccountId: 'super-admin',
        }),
      }),
    );
    expect(transaction.workActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'DELETION_REVIEW_REQUESTED',
        }),
      }),
    );
    expect(result.message).toContain('remains archived');
  });
});
