import { ConflictException, ForbiddenException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  OrgLeadershipType,
  WorkEventType,
  WorkFieldType,
  WorkFinalClosureMode,
  WorkRuntimeStatus,
  WorkStageActivationMode,
  WorkStageApprovalDecision,
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
    workStageDependency: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    workStageAssignment: {
      update: jest.fn().mockResolvedValue({ id: 'old-assignment' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: 'new-assignment' }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    workStageSubmission: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'submission-1' }),
    },
    workStageApproval: {
      create: jest.fn().mockResolvedValue({ id: 'approval-1' }),
    },
    workFieldValue: {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 'field-value-1' }),
    },
    workEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    },
    workItem: {
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({
        runtimeStatus: WorkRuntimeStatus.OPEN,
        version: 1,
        workTypeVersion: {
          finalClosureMode: WorkFinalClosureMode.PRIMARY_OWNER_HEAD,
        },
      }),
      update: jest.fn().mockResolvedValue({ id: workItemId }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    orgUnit: {
      findFirst: jest.fn(),
    },
    orgUnitClosure: {
      count: jest.fn().mockResolvedValue(1),
    },
    account: {
      findFirst: jest.fn().mockResolvedValue({
        id: user.accountId,
        employee: { id: 'employee-1' },
      }),
      count: jest.fn().mockResolvedValue(0),
    },
    orgLeadershipAssignment: {
      findFirst: jest.fn().mockResolvedValue({ id: 'leadership-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    workStage: {
      findFirst: jest.fn().mockResolvedValue(stage),
      findMany: jest.fn().mockResolvedValue([]),
    },
    workItem: {
      findFirst: jest.fn().mockResolvedValue({
        id: workItemId,
        ticketNumber: 'NT-PATAN-TECH-2026-000001',
        runtimeStatus: WorkRuntimeStatus.OPEN,
        version: 2,
      }),
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

  it('approves a submitted stage and records immutable approval history', async () => {
    const stage = runtimeStage({
      status: WorkStageStatus.SUBMITTED,
      approvalMode: WorkStageApprovalMode.RESPONSIBLE_ORG_UNIT_HEAD,
      submissions: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          submissionNumber: 1,
          submittedByAccountId: user.accountId,
          stageVersion: 2,
          note: 'Ready for review',
          createdAt: new Date(),
        },
      ],
    });
    const harness = createHarness(stage);
    harness.tx.workStage.findMany.mockResolvedValue([
      { status: WorkStageStatus.COMPLETED },
    ]);

    await harness.service.approve(user, officeId, stageId, {
      expectedStageVersion: 1,
      note: 'Verified',
    });

    expect(harness.tx.workStageApproval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workStageId: stageId,
        submissionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        decidedByAccountId: user.accountId,
        decision: WorkStageApprovalDecision.APPROVED,
        reason: 'Verified',
      }),
    });
    expect(harness.tx.workStage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: stageId, version: 1 },
        data: expect.objectContaining({
          status: WorkStageStatus.COMPLETED,
          version: { increment: 1 },
        }),
      }),
    );
    expect(harness.tx.workEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: WorkEventType.STAGE_APPROVED,
        fromStageStatus: WorkStageStatus.SUBMITTED,
        toStageStatus: WorkStageStatus.COMPLETED,
      }),
    });
  });

  it('returns a submitted stage with a mandatory reason and preserves review history', async () => {
    const stage = runtimeStage({
      status: WorkStageStatus.SUBMITTED,
      approvalMode: WorkStageApprovalMode.RESPONSIBLE_ORG_UNIT_HEAD,
      submissions: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          submissionNumber: 2,
          submittedByAccountId: user.accountId,
          stageVersion: 4,
          note: 'Corrected result',
          createdAt: new Date(),
        },
      ],
    });
    const harness = createHarness(stage);
    harness.tx.workStage.findMany.mockResolvedValue([
      { status: WorkStageStatus.RETURNED },
    ]);

    await harness.service.returnStage(user, officeId, stageId, {
      expectedStageVersion: 1,
      reason: 'Please attach the required evidence.',
    });

    expect(harness.tx.workStageApproval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workStageId: stageId,
        submissionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        decidedByAccountId: user.accountId,
        decision: WorkStageApprovalDecision.RETURNED,
        reason: 'Please attach the required evidence.',
      }),
    });
    expect(harness.tx.workStage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WorkStageStatus.RETURNED,
          version: { increment: 1 },
        }),
      }),
    );
    expect(harness.tx.workEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: WorkEventType.STAGE_RETURNED,
        fromStageStatus: WorkStageStatus.SUBMITTED,
        toStageStatus: WorkStageStatus.RETURNED,
      }),
    });
  });

  it('resumes a RETURNED stage to IN_PROGRESS for correction without deleting history', async () => {
    const stage = runtimeStage({
      status: WorkStageStatus.RETURNED,
      submittedAt: new Date(),
      assignmentMode: WorkStageAssignmentMode.INDIVIDUAL,
      assignments: [
        {
          id: 'abababab-abab-4bab-8bab-abababababab',
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
      submissions: [
        {
          id: 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',
          submissionNumber: 1,
          submittedByAccountId: user.accountId,
          stageVersion: 2,
          note: 'Previous submission',
          createdAt: new Date(),
        },
      ],
    });
    const harness = createHarness(stage);

    await harness.service.resume(user, officeId, stageId, {
      expectedStageVersion: 1,
    });

    expect(harness.tx.workStage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: stageId, version: 1 },
        data: expect.objectContaining({
          status: WorkStageStatus.IN_PROGRESS,
          submittedAt: null,
          version: { increment: 1 },
        }),
      }),
    );
    expect(harness.tx.workStageSubmission.create).not.toHaveBeenCalled();
    expect(harness.tx.workStageApproval.create).not.toHaveBeenCalled();
    expect(harness.tx.workEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: WorkEventType.STAGE_STARTED,
        fromStageStatus: WorkStageStatus.RETURNED,
        toStageStatus: WorkStageStatus.IN_PROGRESS,
        details: { resumedAfterReturn: true },
      }),
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

  it('automatically completes a submitted stage when approval mode is NONE', async () => {
    const stage = runtimeStage({
      status: WorkStageStatus.IN_PROGRESS,
      assignmentMode: WorkStageAssignmentMode.INDIVIDUAL,
      approvalMode: WorkStageApprovalMode.NONE,
      assignments: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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
    harness.tx.workStage.findMany.mockResolvedValue([
      { status: WorkStageStatus.COMPLETED },
    ]);

    await harness.service.submit(user, officeId, stageId, {
      expectedStageVersion: 1,
      note: 'No approval required',
      fields: [],
    });

    expect(harness.tx.workStage.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: stageId,
          version: 2,
          status: WorkStageStatus.SUBMITTED,
        },
        data: expect.objectContaining({
          status: WorkStageStatus.COMPLETED,
          version: { increment: 1 },
        }),
      }),
    );
    expect(harness.tx.workEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: WorkEventType.STAGE_COMPLETED,
        fromStageStatus: WorkStageStatus.SUBMITTED,
        toStageStatus: WorkStageStatus.COMPLETED,
        details: expect.objectContaining({ automatic: true }),
      }),
    });
  });

  it('keeps a dependent stage PENDING until every prerequisite is satisfied', async () => {
    const dependentDefinitionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const dependentStageId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const otherPrerequisiteId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const stage = runtimeStage({
      status: WorkStageStatus.SUBMITTED,
      approvalMode: WorkStageApprovalMode.RESPONSIBLE_ORG_UNIT_HEAD,
      submissions: [
        {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          submissionNumber: 1,
          submittedByAccountId: user.accountId,
          stageVersion: 2,
          note: 'Ready for approval',
          createdAt: new Date(),
        },
      ],
    });
    const harness = createHarness(stage);
    harness.tx.workStageDependency.findMany
      .mockResolvedValueOnce([{ stageDefinitionId: dependentDefinitionId }])
      .mockResolvedValueOnce([
        { prerequisiteStageId: stageDefinitionId },
        { prerequisiteStageId: otherPrerequisiteId },
      ]);
    harness.tx.workStage.findFirst
      .mockResolvedValueOnce(stage)
      .mockResolvedValueOnce({
        id: dependentStageId,
        stageDefinitionId: dependentDefinitionId,
        status: WorkStageStatus.PENDING,
        version: 1,
        activationMode: WorkStageActivationMode.ALWAYS,
        activationFieldCode: null,
        activationExpectedValue: null,
        slaMinutes: null,
      });
    harness.tx.workStage.findMany
      .mockResolvedValueOnce([
        { stageDefinitionId, status: WorkStageStatus.COMPLETED },
        {
          stageDefinitionId: otherPrerequisiteId,
          status: WorkStageStatus.IN_PROGRESS,
        },
      ])
      .mockResolvedValueOnce([{ status: WorkStageStatus.IN_PROGRESS }]);

    await harness.service.approve(user, officeId, stageId, {
      expectedStageVersion: 1,
      note: 'Approved',
    });

    expect(harness.tx.workStage.updateMany).toHaveBeenCalledTimes(1);
    expect(harness.tx.workEvent.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({
        workStageId: dependentStageId,
        eventType: WorkEventType.STAGE_READY,
      }),
    });
  });

  it('releases an ALWAYS dependent stage to READY when prerequisites are satisfied', async () => {
    const dependentDefinitionId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const dependentStageId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const stage = runtimeStage({
      status: WorkStageStatus.SUBMITTED,
      approvalMode: WorkStageApprovalMode.RESPONSIBLE_ORG_UNIT_HEAD,
      submissions: [
        {
          id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          submissionNumber: 1,
          submittedByAccountId: user.accountId,
          stageVersion: 2,
          note: 'Ready for approval',
          createdAt: new Date(),
        },
      ],
    });
    const harness = createHarness(stage);
    harness.tx.workStageDependency.findMany
      .mockResolvedValueOnce([{ stageDefinitionId: dependentDefinitionId }])
      .mockResolvedValueOnce([{ prerequisiteStageId: stageDefinitionId }]);
    harness.tx.workStage.findFirst
      .mockResolvedValueOnce(stage)
      .mockResolvedValueOnce({
        id: dependentStageId,
        stageDefinitionId: dependentDefinitionId,
        status: WorkStageStatus.PENDING,
        version: 4,
        activationMode: WorkStageActivationMode.ALWAYS,
        activationFieldCode: null,
        activationExpectedValue: null,
        slaMinutes: 30,
      });
    harness.tx.workStage.findMany
      .mockResolvedValueOnce([
        { stageDefinitionId, status: WorkStageStatus.COMPLETED },
      ])
      .mockResolvedValueOnce([{ status: WorkStageStatus.READY }]);

    await harness.service.approve(user, officeId, stageId, {
      expectedStageVersion: 1,
      note: 'Approved',
    });

    expect(harness.tx.workStage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: dependentStageId,
          version: 4,
          status: WorkStageStatus.PENDING,
        },
        data: expect.objectContaining({
          status: WorkStageStatus.READY,
          readyAt: expect.any(Date),
          dueAt: expect.any(Date),
          version: { increment: 1 },
        }),
      }),
    );
    expect(harness.tx.workEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workStageId: dependentStageId,
        eventType: WorkEventType.STAGE_READY,
        fromStageStatus: WorkStageStatus.PENDING,
        toStageStatus: WorkStageStatus.READY,
      }),
    });
  });

  it('automatically closes Work after every required stage is settled', async () => {
    const stage = runtimeStage({
      status: WorkStageStatus.SUBMITTED,
      approvalMode: WorkStageApprovalMode.RESPONSIBLE_ORG_UNIT_HEAD,
      submissions: [
        {
          id: '11111111-2222-4333-8444-555555555555',
          submissionNumber: 1,
          submittedByAccountId: user.accountId,
          stageVersion: 2,
          note: 'Ready for final approval',
          createdAt: new Date(),
        },
      ],
    });
    const harness = createHarness(stage);
    harness.tx.workStage.findMany.mockResolvedValue([
      { status: WorkStageStatus.COMPLETED, isRequired: true },
    ]);
    harness.tx.workItem.findUnique.mockResolvedValue({
      runtimeStatus: WorkRuntimeStatus.IN_PROGRESS,
      version: 4,
      workTypeVersion: {
        finalClosureMode: WorkFinalClosureMode.AUTO_AFTER_REQUIRED_STAGES,
      },
    });

    await harness.service.approve(user, officeId, stageId, {
      expectedStageVersion: 1,
      note: 'Approved',
    });

    expect(harness.tx.workItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: workItemId,
          version: 4,
          runtimeStatus: WorkRuntimeStatus.IN_PROGRESS,
        }),
        data: expect.objectContaining({
          runtimeStatus: WorkRuntimeStatus.COMPLETED,
          version: { increment: 1 },
        }),
      }),
    );
    expect(harness.tx.workEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: WorkEventType.WORK_COMPLETED,
        fromWorkStatus: WorkRuntimeStatus.IN_PROGRESS,
        toWorkStatus: WorkRuntimeStatus.COMPLETED,
        details: { automatic: true },
      }),
    });
  });

  it('allows the configured Primary Owner Head to perform manual final closure', async () => {
    const harness = createHarness();
    harness.tx.workItem.findFirst.mockResolvedValue({
      id: workItemId,
      officeId,
      primaryOwnerOrgUnitId: responsibleOrgUnitId,
      runtimeStatus: WorkRuntimeStatus.WAITING,
      version: 3,
      workTypeVersion: {
        finalClosureMode: WorkFinalClosureMode.PRIMARY_OWNER_HEAD,
        finalClosureLeadershipType: null,
      },
    });
    harness.tx.workStage.findMany.mockResolvedValue([
      { status: WorkStageStatus.COMPLETED },
      { status: WorkStageStatus.SKIPPED },
    ]);

    await harness.service.completeWork(user, officeId, workItemId, {
      expectedWorkVersion: 3,
      note: 'Final review complete',
    });

    expect(harness.authorization.assertCan).toHaveBeenCalledWith(
      user,
      expect.any(String),
      officeId,
      responsibleOrgUnitId,
    );

    expect(harness.tx.orgLeadershipAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          officeId,
          orgUnitId: responsibleOrgUnitId,
          leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
        }),
      }),
    );
    expect(harness.tx.workItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: workItemId,
          version: 3,
        }),
        data: expect.objectContaining({
          runtimeStatus: WorkRuntimeStatus.COMPLETED,
          version: { increment: 1 },
        }),
      }),
    );
  });

  it('cancels active Work only through current Office Head authority and preserves stage history', async () => {
    const harness = createHarness();
    harness.tx.workItem.findFirst.mockResolvedValue({
      id: workItemId,
      officeId,
      runtimeStatus: WorkRuntimeStatus.IN_PROGRESS,
      version: 5,
    });
    harness.tx.workStage.findMany.mockResolvedValue([
      { id: stageId, status: WorkStageStatus.IN_PROGRESS, version: 4 },
    ]);

    await harness.service.cancelWork(user, officeId, workItemId, {
      expectedWorkVersion: 5,
      reason: 'Work is no longer required.',
    });

    expect(harness.tx.orgLeadershipAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          officeId,
          orgUnitId: null,
          leadershipType: OrgLeadershipType.OFFICE_HEAD,
        }),
      }),
    );
    expect(harness.tx.workStage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: stageId,
          version: 4,
          status: WorkStageStatus.IN_PROGRESS,
        },
        data: expect.objectContaining({
          status: WorkStageStatus.CANCELLED,
          version: { increment: 1 },
        }),
      }),
    );
    expect(harness.tx.workStageAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workStageId: stageId, endsAt: null },
        data: expect.objectContaining({
          endedByAccountId: user.accountId,
          endReason: 'Work is no longer required.',
        }),
      }),
    );
    expect(harness.tx.workItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runtimeStatus: WorkRuntimeStatus.CANCELLED,
          version: { increment: 1 },
        }),
      }),
    );
    expect(harness.tx.workEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: WorkEventType.WORK_CANCELLED,
        details: expect.objectContaining({
          reason: 'Work is no longer required.',
        }),
      }),
    });
  });

  it('reopens one completed stage without deleting its previous submission or approval history', async () => {
    const completedStage = runtimeStage({
      status: WorkStageStatus.COMPLETED,
      version: 6,
    });
    const harness = createHarness(completedStage);
    harness.tx.workItem.findFirst.mockResolvedValue({
      id: workItemId,
      officeId,
      primaryOwnerOrgUnitId: responsibleOrgUnitId,
      runtimeStatus: WorkRuntimeStatus.COMPLETED,
      version: 8,
      workTypeVersion: {
        finalClosureMode: WorkFinalClosureMode.PRIMARY_OWNER_HEAD,
        finalClosureLeadershipType: null,
      },
    });
    harness.tx.workStage.findFirst.mockResolvedValue({
      id: stageId,
      status: WorkStageStatus.COMPLETED,
      version: 6,
      slaMinutes: 30,
    });
    harness.tx.workStageAssignment.findFirst.mockResolvedValue({
      id: 'active-assignment',
    });

    await harness.service.reopenWork(user, officeId, workItemId, {
      expectedWorkVersion: 8,
      stageId,
      reason: 'Correct the final execution evidence.',
    });

    expect(harness.tx.workStage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: stageId,
          version: 6,
          status: WorkStageStatus.COMPLETED,
        },
        data: expect.objectContaining({
          status: WorkStageStatus.IN_PROGRESS,
          submittedAt: null,
          completedAt: null,
          version: { increment: 1 },
        }),
      }),
    );
    expect(harness.tx.workStageSubmission.create).not.toHaveBeenCalled();
    expect(harness.tx.workStageApproval.create).not.toHaveBeenCalled();
    expect(harness.tx.workItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runtimeStatus: WorkRuntimeStatus.IN_PROGRESS,
          completedAt: null,
          closedAt: null,
          version: { increment: 1 },
        }),
      }),
    );
    expect(harness.tx.workEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workStageId: stageId,
        eventType: WorkEventType.WORK_REOPENED,
        fromWorkStatus: WorkRuntimeStatus.COMPLETED,
        toWorkStatus: WorkRuntimeStatus.IN_PROGRESS,
        details: expect.objectContaining({
          reason: 'Correct the final execution evidence.',
          preservedHistory: true,
        }),
      }),
    });
  });

  it('denies Super Admin operational Work cancellation before mutation', async () => {
    const superAdmin = {
      ...user,
      accountId: '99999999-9999-4999-8999-999999999999',
      role: AccountRole.SUPER_ADMIN,
    } satisfies AuthenticatedUser;
    const harness = createHarness();
    harness.tx.workItem.findFirst.mockResolvedValue({
      id: workItemId,
      officeId,
      runtimeStatus: WorkRuntimeStatus.OPEN,
      version: 1,
    });

    await expect(
      harness.service.cancelWork(superAdmin, officeId, workItemId, {
        expectedWorkVersion: 1,
        reason: 'Attempted system cancellation',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(harness.tx.workItem.updateMany).not.toHaveBeenCalled();
  });
});
