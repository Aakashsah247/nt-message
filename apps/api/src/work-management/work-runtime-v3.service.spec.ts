import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
  OrgMembershipType,
  WorkFieldType,
  WorkFinalClosureMode,
  WorkRuntimeStatus,
  WorkSlaBasis,
  WorkStageActivationMode,
  WorkStageApprovalMode,
  WorkStageAssignmentMode,
  WorkStageResponsibleOrgUnitRule,
  WorkStageStatus,
  WorkTypeCreatorCategory,
  WorkTypeCreatorScope,
  WorkTypeVersionStatus,
} from '../generated/prisma/client';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import type { CreateWorkRuntimeV3Dto } from './dto/create-work-runtime-v3.dto';
import { WorkRuntimeV3Service } from './work-runtime-v3.service';

const user = {
  accountId: '11111111-1111-4111-8111-111111111111',
  sessionId: 'session-1',
  username: 'worker',
  role: AccountRole.EMPLOYEE,
} satisfies AuthenticatedUser;

const officeId = '22222222-2222-4222-8222-222222222222';
const ownerId = '33333333-3333-4333-8333-333333333333';
const versionId = '44444444-4444-4444-8444-444444444444';
const definitionId = '55555555-5555-4555-8555-555555555555';
const stageDefinitionId = '66666666-6666-4666-8666-666666666666';
const fieldDefinitionId = '77777777-7777-4777-8777-777777777777';

function runtimeVersion() {
  return {
    id: versionId,
    version: 1,
    status: WorkTypeVersionStatus.PUBLISHED,
    name: 'Trouble Ticket',
    primaryOwnerOrgUnitId: ownerId,
    creatorCategories: [WorkTypeCreatorCategory.EMPLOYEE],
    creatorScope: WorkTypeCreatorScope.PRIMARY_OWNER_SUBTREE,
    finalClosureMode: WorkFinalClosureMode.AUTO_AFTER_REQUIRED_STAGES,
    slaBasis: WorkSlaBasis.CALENDAR_DURATION,
    overallSlaMinutes: null,
    workTypeDefinition: {
      id: definitionId,
      officeId,
      code: 'TROUBLE_TICKET',
      isActive: true,
    },
    primaryOwnerOrgUnit: {
      id: ownerId,
      officeId,
      code: 'TECH',
      name: 'Technical',
      isActive: true,
    },
    creatorOrgUnits: [],
    creatorAccounts: [],
    fields: [
      {
        id: fieldDefinitionId,
        code: 'SERVICE_NUMBER',
        fieldType: WorkFieldType.REFERENCE,
        isRequired: true,
        stageDefinitionId: null,
        config: { maxLength: 100 },
      },
    ],
    stages: [
      {
        id: stageDefinitionId,
        code: 'EXECUTION',
        name: 'Work execution',
        sortOrder: 10,
        isRequired: true,
        responsibleOrgUnitRule: WorkStageResponsibleOrgUnitRule.PRIMARY_OWNER,
        responsibleOrgUnitId: null,
        assignmentMode: WorkStageAssignmentMode.ORG_UNIT_QUEUE,
        approvalMode: WorkStageApprovalMode.NONE,
        approvalLeadershipType: null,
        activationMode: WorkStageActivationMode.ALWAYS,
        activationFieldDefinitionId: null,
        activationExpectedValue: null,
        slaMinutes: 60,
        responsibleOrgUnit: null,
      },
    ],
    stageDependencies: [],
  };
}

function actorRecord() {
  return {
    id: user.accountId,
    role: AccountRole.EMPLOYEE,
    isEnabled: true,
    employee: {
      id: '88888888-8888-4888-8888-888888888888',
      status: EmployeeStatus.ACTIVE,
      employmentStatus: EmploymentStatus.ACTIVE,
      archivedAt: null,
      orgMemberships: [
        {
          orgUnitId: ownerId,
          membershipType: OrgMembershipType.PRIMARY,
        },
      ],
      orgLeadershipAssignments: [],
    },
  };
}

function createHarness() {
  const createdResponse = {
    id: '99999999-9999-4999-8999-999999999999',
    officeId,
    workTypeVersionId: versionId,
    runtimeStatus: WorkRuntimeStatus.OPEN,
  };

  const tx = {
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ nextValue: 42 }]),
    office: {
      findUnique: jest.fn().mockResolvedValue({
        id: officeId,
        code: 'PATAN',
        name: 'Patan Office',
        isActive: true,
      }),
    },
    workTypeVersion: {
      findFirst: jest.fn().mockResolvedValue(runtimeVersion()),
    },
    account: {
      findUnique: jest.fn().mockResolvedValue(actorRecord()),
      count: jest.fn().mockResolvedValue(0),
    },
    orgUnit: {
      count: jest.fn().mockResolvedValue(0),
    },
    orgUnitClosure: {
      count: jest.fn().mockResolvedValue(0),
    },
    workItem: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: createdResponse.id }),
      findUnique: jest.fn().mockResolvedValue(createdResponse),
    },
    workStage: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          code: 'EXECUTION',
          status: WorkStageStatus.READY,
        },
      ]),
    },
    workEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (callback: (client: unknown) => unknown) =>
      callback(tx),
    ),
  };
  const authorization = {
    assertCan: jest.fn().mockResolvedValue(undefined),
  };

  return {
    tx,
    prisma,
    authorization,
    service: new WorkRuntimeV3Service(
      prisma as unknown as PrismaService,
      authorization as unknown as OrganizationAuthorizationService,
    ),
  };
}

function createDto(): CreateWorkRuntimeV3Dto {
  return {
    clientRequestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    workTypeVersionId: versionId,
    title: 'Customer service fault',
    description: 'Investigate and restore service.',
    dueAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    fields: [{ code: 'SERVICE_NUMBER', value: '  nt-12345  ' }],
  };
}

describe('WorkRuntimeV3Service creation', () => {
  it('creates a native V3 Work without fabricating legacy ownership fields', async () => {
    const harness = createHarness();

    const result = await harness.service.create(user, officeId, createDto());

    expect(result).toEqual(
      expect.objectContaining({
        officeId,
        workTypeVersionId: versionId,
        runtimeStatus: WorkRuntimeStatus.OPEN,
      }),
    );

    expect(harness.tx.workItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: null,
          divisionId: null,
          departmentId: null,
          responsibleManagerAccountId: null,
          registeredAt: null,
          officeId,
          workTypeVersionId: versionId,
          primaryOwnerOrgUnitId: ownerId,
          runtimeStatus: WorkRuntimeStatus.OPEN,
          orgUnitParticipants: {
            create: [
              expect.objectContaining({
                orgUnitId: ownerId,
              }),
            ],
          },
          references: {
            create: [
              expect.objectContaining({
                referenceType: 'SERVICE_NUMBER',
                value: 'nt-12345',
                normalizedValue: 'NT-12345',
              }),
            ],
          },
        }),
        select: { id: true },
      }),
    );

    expect(harness.tx.workStage.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          code: 'EXECUTION',
          responsibleOrgUnitId: ownerId,
          status: WorkStageStatus.READY,
        }),
      ],
    });
  });

  it('creates runtime-requested participant stages as pending without pre-adding another OrgUnit', async () => {
    const harness = createHarness();
    const version = runtimeVersion();
    version.stages[0] = {
      ...version.stages[0],
      code: 'ACCOUNTS_SUPPORT',
      name: 'Accounts support',
      responsibleOrgUnitRule:
        WorkStageResponsibleOrgUnitRule.RUNTIME_REQUESTED_PARTICIPANT,
    };
    harness.tx.workTypeVersion.findFirst.mockResolvedValue(version);
    harness.tx.workStage.findMany.mockResolvedValue([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        code: 'ACCOUNTS_SUPPORT',
        status: WorkStageStatus.PENDING,
      },
    ]);

    await harness.service.create(user, officeId, createDto());

    expect(harness.tx.workItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgUnitParticipants: {
            create: [
              expect.objectContaining({
                orgUnitId: ownerId,
              }),
            ],
          },
        }),
      }),
    );
    expect(harness.tx.workStage.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          code: 'ACCOUNTS_SUPPORT',
          responsibleOrgUnitId: ownerId,
          status: WorkStageStatus.PENDING,
          readyAt: null,
          dueAt: null,
        }),
      ],
    });
  });

  it('returns the original Work for an identical idempotent retry', async () => {
    const harness = createHarness();
    const dto = createDto();
    const first = await harness.service.create(user, officeId, dto);

    const fingerprint = (
      harness.tx.workItem.create.mock.calls[0]?.[0] as {
        data: { creationRequestFingerprint: string };
      }
    ).data.creationRequestFingerprint;

    const secondHarness = createHarness();
    secondHarness.tx.workItem.findFirst.mockResolvedValue({
      id: first.id,
      creationRequestFingerprint: fingerprint,
    });
    secondHarness.tx.workItem.findUnique.mockResolvedValue(first);

    await expect(secondHarness.service.create(user, officeId, dto)).resolves.toEqual(first);
    expect(secondHarness.tx.workTypeVersion.findFirst).not.toHaveBeenCalled();
    expect(secondHarness.tx.workItem.create).not.toHaveBeenCalled();
  });
});

describe('WorkRuntimeV3Service shared Work visibility', () => {
  it('allows scoped leadership to read Work through an active participant OrgUnit', async () => {
    const participantOrgUnitId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const sharedWork = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      officeId,
      primaryOwnerOrgUnitId: ownerId,
      createdByAccountId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      orgUnitParticipants: [{ orgUnitId: participantOrgUnitId }],
    };
    const prisma = {
      workItem: {
        findFirst: jest.fn().mockResolvedValue(sharedWork),
      },
    };
    const authorization = {
      can: jest
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
    };
    const service = new WorkRuntimeV3Service(
      prisma as unknown as PrismaService,
      authorization as unknown as OrganizationAuthorizationService,
    );

    await expect(
      service.getWork(user, officeId, sharedWork.id),
    ).resolves.toBe(sharedWork);

    expect(authorization.can).toHaveBeenNthCalledWith(
      1,
      user,
      'work.view',
      officeId,
      ownerId,
    );
    expect(authorization.can).toHaveBeenNthCalledWith(
      2,
      user,
      'work.view',
      officeId,
      participantOrgUnitId,
    );
  });
});
