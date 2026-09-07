import { ConflictException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  WorkFieldType,
  WorkRuntimeStatus,
  WorkStageApprovalMode,
  WorkStageAssignmentMode,
  WorkStageAssignmentRole,
  WorkStageAssignmentTargetType,
  WorkStageStatus,
} from '../generated/prisma/client';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import { WorkRuntimeV3StageService } from './work-runtime-v3-stage.service';

const user = {
  accountId: '11111111-1111-4111-8111-111111111111',
  sessionId: 'session-1',
  username: 'worker',
  role: AccountRole.EMPLOYEE,
} satisfies AuthenticatedUser;

const officeId = '22222222-2222-4222-8222-222222222222';
const workItemId = '33333333-3333-4333-8333-333333333333';
const stageId = '44444444-4444-4444-8444-444444444444';
const stageDefinitionId = '55555555-5555-4555-8555-555555555555';
const responsibleOrgUnitId = '66666666-6666-4666-8666-666666666666';

function runtimeStage(overrides: Record<string, unknown> = {}) {
  return {
    id: stageId,
    workItemId,
    stageDefinitionId,
    responsibleOrgUnitId,
    code: 'EXECUTION',
    name: 'Execution',
    sortOrder: 10,
    isRequired: true,
    assignmentMode: WorkStageAssignmentMode.ORG_UNIT_QUEUE,
    approvalMode: WorkStageApprovalMode.NONE,
    approvalLeadershipType: null,
    status: WorkStageStatus.READY,
    version: 1,
    blockedFromStatus: null,
    blockerReason: null,
    dueAt: null,
    readyAt: new Date(),
    startedAt: null,
    submittedAt: null,
    completedAt: null,
    blockedAt: null,
    workItem: {
      id: workItemId,
      officeId,
      ticketNumber: 'NT-PATAN-TECH-2026-000001',
      title: 'Test Work',
      runtimeStatus: WorkRuntimeStatus.OPEN,
      version: 1,
      createdByAccountId: user.accountId,
      workTypeVersionId: '77777777-7777-4777-8777-777777777777',
    },
    responsibleOrgUnit: {
      id: responsibleOrgUnitId,
      code: 'TECH',
      name: 'Technical',
      officeId,
      isActive: true,
    },
    stageDefinition: { fields: [] },
    assignments: [],
    submissions: [],
    ...overrides,
  };
}

function createHarness(stage = runtimeStage()) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: workItemId }]),
    workStage: {
      findFirst: jest.fn().mockResolvedValue(stage),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([{ status: WorkStageStatus.IN_PROGRESS }]),
    },
    workStageAssignment: {
      update: jest.fn().mockResolvedValue({ id: 'old-assignment' }),
      create: jest.fn().mockResolvedValue({ id: 'new-assignment' }),
    },
    workStageSubmission: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'submission-1' }),
    },
    workFieldValue: {
      upsert: jest.fn().mockResolvedValue({ id: 'field-value-1' }),
    },
    workEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    },
    workItem: {
      findUnique: jest.fn().mockResolvedValue({ runtimeStatus: WorkRuntimeStatus.OPEN }),
      update: jest.fn().mockResolvedValue({ id: workItemId }),
    },
    orgUnit: {
      findFirst: jest.fn(),
    },
    orgUnitClosure: {
      count: jest.fn().mockResolvedValue(1),
    },
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: user.accountId }),
      count: jest.fn().mockResolvedValue(0),
    },
    orgLeadershipAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    workStage: {
      findFirst: jest.fn().mockResolvedValue(stage),
      findMany: jest.fn().mockResolvedValue([]),
    },
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: user.accountId }),
    },
    orgUnit: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const authorization = {
    assertCan: jest.fn().mockResolvedValue(undefined),
    can: jest.fn().mockResolvedValue(true),
    visibleOrgUnitIds: jest.fn().mockResolvedValue([responsibleOrgUnitId]),
  };
  const service = new WorkRuntimeV3StageService(
    prisma as unknown as PrismaService,
    authorization as unknown as OrganizationAuthorizationService,
  );
  jest.spyOn(service, 'getStage').mockResolvedValue({ id: stageId } as never);

  return { tx, prisma, authorization, service };
}

describe('WorkRuntimeV3StageService', () => {
  it('routes a READY stage to the responsible OrgUnit queue with assignment history', async () => {
    const harness = createHarness();

    await harness.service.assign(user, officeId, stageId, {
      expectedStageVersion: 1,
      targetType: WorkStageAssignmentTargetType.ORG_UNIT_QUEUE,
      reason: 'Route to receiving unit',
    });

    expect(harness.tx.workStageAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workStageId: stageId,
          targetType: WorkStageAssignmentTargetType.ORG_UNIT_QUEUE,
          targetOrgUnitId: responsibleOrgUnitId,
          targetAccountId: null,
          assignmentRole: WorkStageAssignmentRole.PRIMARY,
        }),
      }),
    );
    expect(harness.tx.workStage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: stageId, version: 1 },
        data: expect.objectContaining({ version: { increment: 1 } }),
      }),
    );
  });

  it('rejects a stale stage version before mutation', async () => {
    const harness = createHarness(runtimeStage({ version: 3 }));

    await expect(
      harness.service.start(user, officeId, stageId, {
        expectedStageVersion: 2,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(harness.tx.workStage.updateMany).not.toHaveBeenCalled();
  });

  it('moves READY to IN_PROGRESS and recalculates aggregate Work status', async () => {
    const harness = createHarness();

    await harness.service.start(user, officeId, stageId, {
      expectedStageVersion: 1,
    });

    expect(harness.tx.workStage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WorkStageStatus.IN_PROGRESS,
          version: { increment: 1 },
        }),
      }),
    );
    expect(harness.tx.workItem.update).toHaveBeenCalledWith({
      where: { id: workItemId },
      data: {
        runtimeStatus: WorkRuntimeStatus.IN_PROGRESS,
        version: { increment: 1 },
      },
    });
  });

  it('stores an immutable stage submission snapshot and submitted stage version', async () => {
    const fieldDefinitionId = '88888888-8888-4888-8888-888888888888';
    const stage = runtimeStage({
      status: WorkStageStatus.IN_PROGRESS,
      assignmentMode: WorkStageAssignmentMode.INDIVIDUAL,
      stageDefinition: {
        fields: [
          {
            id: fieldDefinitionId,
            code: 'RESULT',
            fieldType: WorkFieldType.TEXT,
            isRequired: true,
            stageDefinitionId,
            config: { maxLength: 500 },
          },
        ],
      },
      assignments: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          targetType: WorkStageAssignmentTargetType.ACCOUNT,
          targetOrgUnitId: null,
          targetAccountId: user.accountId,
          assignmentRole: WorkStageAssignmentRole.PRIMARY,
          assignmentReason: null,
          startsAt: new Date(),
          targetOrgUnit: null,
          targetAccount: {
            id: user.accountId,
            employee: { empId: 'NTC-1', empName: 'Worker' },
          },
        },
      ],
    });
    const harness = createHarness(stage);
    harness.tx.workStage.findMany.mockResolvedValue([{ status: WorkStageStatus.SUBMITTED }]);

    await harness.service.submit(user, officeId, stageId, {
      expectedStageVersion: 1,
      note: 'Completed',
      fields: [{ code: 'RESULT', value: 'Service restored' }],
    });

    expect(harness.tx.workStageSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workStageId: stageId,
          submissionNumber: 1,
          stageVersion: 2,
          valuesSnapshot: {
            fields: [
              expect.objectContaining({
                fieldDefinitionId,
                code: 'RESULT',
                value: 'Service restored',
              }),
            ],
          },
        }),
      }),
    );
  });
});
