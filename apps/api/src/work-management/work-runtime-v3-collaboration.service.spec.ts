import { ForbiddenException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  WorkCollaborationStatus,
  WorkEventType,
  WorkItemStatus,
  WorkParticipantRole,
  WorkRuntimeStatus,
} from '../generated/prisma/client';
import { CAPABILITIES } from '../organization/organization-capabilities';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import type { CreateWorkRuntimeV3CollaborationRequestDto } from './dto/work-runtime-v3-collaboration.dto';
import { WorkRuntimeV3CollaborationService } from './work-runtime-v3-collaboration.service';
import { WorkRuntimeV3Service } from './work-runtime-v3.service';

const user = {
  accountId: '11111111-1111-4111-8111-111111111111',
  sessionId: 'session-1',
  username: 'manager',
  role: AccountRole.EMPLOYEE,
} satisfies AuthenticatedUser;

const officeId = '22222222-2222-4222-8222-222222222222';
const workItemId = '33333333-3333-4333-8333-333333333333';
const sourceOrgUnitId = '44444444-4444-4444-8444-444444444444';
const requestedOrgUnitId = '55555555-5555-4555-8555-555555555555';
const requestId = '66666666-6666-4666-8666-666666666666';

function collaborationRecord(
  status: WorkCollaborationStatus = WorkCollaborationStatus.REQUESTED,
  version = 1,
) {
  return {
    id: requestId,
    workItemId,
    workStageId: null,
    participantId: null,
    sourceOrgUnitId,
    requestedOrgUnitId,
    requestedByAccountId: user.accountId,
    respondedByAccountId: null,
    cancelledByAccountId: null,
    status,
    purpose: 'Verify billing details',
    neededBy: null,
    responseReason: null,
    cancellationReason: null,
    respondedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    version,
    createdAt: new Date('2026-09-07T16:00:00.000Z'),
    updatedAt: new Date('2026-09-07T16:00:00.000Z'),
    sourceOrgUnit: {
      id: sourceOrgUnitId,
      code: 'TECH',
      name: 'Technical',
    },
    requestedOrgUnit: {
      id: requestedOrgUnitId,
      code: 'ACCTS',
      name: 'Accounts',
    },
    requestedBy: {
      id: user.accountId,
      employee: { empId: 'NTC-1002', empName: 'Requester' },
    },
    respondedBy: null,
    cancelledBy: null,
    workItem: {
      id: workItemId,
      ticketNumber: 'NT-PATAN-TECH-2026-000001',
      title: 'Customer installation',
      runtimeStatus: WorkRuntimeStatus.IN_PROGRESS,
      primaryOwnerOrgUnitId: sourceOrgUnitId,
      dueAt: new Date('2026-09-08T12:00:00.000Z'),
    },
    workStage: null,
  };
}

function createHarness() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: workItemId }]),
    workItem: {
      findFirst: jest.fn().mockResolvedValue({
        id: workItemId,
        runtimeStatus: WorkRuntimeStatus.IN_PROGRESS,
        status: WorkItemStatus.V3_RUNTIME,
      }),
    },
    orgUnit: {
      findFirst: jest.fn().mockResolvedValue({ id: requestedOrgUnitId }),
    },
    workOrgUnitParticipant: {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce({ id: 'source-participant' })
        .mockResolvedValueOnce(null),
      create: jest.fn().mockResolvedValue({ id: 'support-participant' }),
    },
    workCollaborationRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: requestId }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    workEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (callback: (client: unknown) => unknown) =>
      callback(tx),
    ),
    workCollaborationRequest: {
      findFirst: jest.fn().mockResolvedValue(collaborationRecord()),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const authorization = {
    assertCan: jest.fn().mockResolvedValue(undefined),
    can: jest.fn().mockResolvedValue(true),
    visibleOrgUnitIds: jest.fn().mockResolvedValue([requestedOrgUnitId]),
  };
  const workRuntime = {
    getWork: jest.fn().mockResolvedValue({ id: workItemId }),
  };

  return {
    tx,
    prisma,
    authorization,
    workRuntime,
    service: new WorkRuntimeV3CollaborationService(
      prisma as unknown as PrismaService,
      authorization as unknown as OrganizationAuthorizationService,
      workRuntime as unknown as WorkRuntimeV3Service,
    ),
  };
}

function requestDto(): CreateWorkRuntimeV3CollaborationRequestDto {
  return {
    sourceOrgUnitId,
    requestedOrgUnitId,
    purpose: 'Verify billing details',
  };
}

describe('WorkRuntimeV3CollaborationService', () => {
  it('creates an audited same-Office collaboration request from an active participant', async () => {
    const harness = createHarness();

    await harness.service.request(user, officeId, workItemId, requestDto());

    expect(harness.authorization.assertCan).toHaveBeenCalledWith(
      user,
      CAPABILITIES.WORK_REQUEST_PARTICIPANT,
      officeId,
      sourceOrgUnitId,
    );
    expect(harness.tx.workCollaborationRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workItemId,
        sourceOrgUnitId,
        requestedOrgUnitId,
        requestedByAccountId: user.accountId,
        status: WorkCollaborationStatus.REQUESTED,
        purpose: 'Verify billing details',
      }),
      select: { id: true },
    });
    expect(harness.tx.workEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workItemId,
        eventType: WorkEventType.COLLABORATION_REQUESTED,
      }),
    });
  });

  it('accepts only through the receiving OrgUnit authority and adds that OrgUnit as support', async () => {
    const harness = createHarness();
    harness.prisma.workCollaborationRequest.findFirst.mockResolvedValue(
      collaborationRecord(),
    );
    harness.tx.workCollaborationRequest.findFirst.mockResolvedValue({
      id: requestId,
      workItemId,
      workStageId: null,
      participantId: null,
      sourceOrgUnitId,
      requestedOrgUnitId,
      status: WorkCollaborationStatus.REQUESTED,
      version: 1,
    });
    harness.tx.workOrgUnitParticipant.findFirst
      .mockReset()
      .mockResolvedValueOnce({ id: 'source-participant' })
      .mockResolvedValueOnce(null);

    await harness.service.accept(user, officeId, requestId, {
      expectedVersion: 1,
    });

    expect(harness.authorization.assertCan).toHaveBeenCalledWith(
      user,
      CAPABILITIES.WORK_ACCEPT_PARTICIPANT,
      officeId,
      requestedOrgUnitId,
    );
    expect(harness.tx.workCollaborationRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: requestId,
          version: 1,
          status: WorkCollaborationStatus.REQUESTED,
        }),
        data: expect.objectContaining({
          participantId: 'support-participant',
          status: WorkCollaborationStatus.ACCEPTED,
          respondedByAccountId: user.accountId,
          version: { increment: 1 },
        }),
      }),
    );
    expect(harness.tx.workOrgUnitParticipant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workItemId,
        orgUnitId: requestedOrgUnitId,
        role: WorkParticipantRole.SUPPORTING_PARTICIPANT,
      }),
      select: { id: true },
    });
    expect(harness.tx.workEvent.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          eventType: WorkEventType.COLLABORATION_ACCEPTED,
        }),
        expect.objectContaining({
          eventType: WorkEventType.PARTICIPANT_ADDED,
        }),
      ]),
    });
  });

  it('records a receiving-unit decline without adding a participant', async () => {
    const harness = createHarness();
    harness.tx.workCollaborationRequest.findFirst.mockResolvedValue({
      id: requestId,
      workItemId,
      workStageId: null,
      participantId: null,
      sourceOrgUnitId,
      requestedOrgUnitId,
      status: WorkCollaborationStatus.REQUESTED,
      version: 1,
    });
    harness.tx.workOrgUnitParticipant.findFirst
      .mockReset()
      .mockResolvedValue({ id: 'source-participant' });

    await harness.service.decline(user, officeId, requestId, {
      expectedVersion: 1,
      reason: 'No billing action is required.',
    });

    expect(harness.tx.workCollaborationRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WorkCollaborationStatus.DECLINED,
          responseReason: 'No billing action is required.',
        }),
      }),
    );
    expect(harness.tx.workOrgUnitParticipant.create).not.toHaveBeenCalled();
    expect(harness.tx.workEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: WorkEventType.COLLABORATION_DECLINED,
      }),
    });
  });

  it('lets the authorized source cancel a still-pending request with an audit reason', async () => {
    const harness = createHarness();
    harness.tx.workCollaborationRequest.findFirst.mockResolvedValue({
      id: requestId,
      workItemId,
      workStageId: null,
      participantId: null,
      sourceOrgUnitId,
      requestedOrgUnitId,
      status: WorkCollaborationStatus.REQUESTED,
      version: 1,
    });
    harness.tx.workOrgUnitParticipant.findFirst
      .mockReset()
      .mockResolvedValue({ id: 'source-participant' });

    await harness.service.cancel(user, officeId, requestId, {
      expectedVersion: 1,
      reason: 'Support is no longer required.',
    });

    expect(harness.authorization.assertCan).toHaveBeenCalledWith(
      user,
      CAPABILITIES.WORK_REQUEST_PARTICIPANT,
      officeId,
      sourceOrgUnitId,
    );
    expect(harness.tx.workCollaborationRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WorkCollaborationStatus.CANCELLED,
          cancellationReason: 'Support is no longer required.',
          cancelledByAccountId: user.accountId,
        }),
      }),
    );
    expect(harness.tx.workEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: WorkEventType.COLLABORATION_CANCELLED,
      }),
    });
  });

  it('stops a forbidden actor before collaboration mutation', async () => {
    const harness = createHarness();
    harness.authorization.assertCan.mockRejectedValue(
      new ForbiddenException('Forbidden'),
    );

    await expect(
      harness.service.request(user, officeId, workItemId, requestDto()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
    expect(harness.tx.workCollaborationRequest.create).not.toHaveBeenCalled();
  });
});
