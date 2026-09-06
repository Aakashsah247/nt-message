import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  WorkFieldType,
  WorkFinalClosureMode,
  WorkSlaBasis,
  WorkStageActivationMode,
  WorkStageApprovalMode,
  WorkStageAssignmentMode,
  WorkStageResponsibleOrgUnitRule,
  WorkTypeCreatorCategory,
  WorkTypeCreatorScope,
  WorkTypeVersionStatus,
} from '../generated/prisma/client';
import { CAPABILITIES } from '../organization/organization-capabilities';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import { WorkTypeV3Service } from './work-type-v3.service';

const user = {
  accountId: 'account-1',
  role: AccountRole.EMPLOYEE,
} as AuthenticatedUser;

const office = {
  id: 'office-1',
  code: 'PATAN',
  name: 'Patan Telecom Office',
  isActive: true,
};

const definitionId = 'definition-1';
const draftId = 'draft-2';
function emptyPublishedConfiguration() {
  return {
    primaryOwnerOrgUnitId: null,
    creatorCategories: [],
    creatorScope: WorkTypeCreatorScope.PRIMARY_OWNER_SUBTREE,
    finalClosureMode: WorkFinalClosureMode.AUTO_AFTER_REQUIRED_STAGES,
    finalClosureLeadershipType: null,
    slaBasis: WorkSlaBasis.CALENDAR_DURATION,
    overallSlaMinutes: null,
    creatorOrgUnits: [],
    creatorAccounts: [],
    fields: [],
    stages: [],
    stageDependencies: [],
  };
}

function publishableConfiguration() {
  return {
    ...emptyPublishedConfiguration(),
    primaryOwnerOrgUnitId: 'org-1',
    creatorCategories: [WorkTypeCreatorCategory.OFFICE_HEAD],
    stages: [
      {
        id: 'stage-1',
        code: 'EXECUTE',
        name: 'Execute',
        description: null,
        sortOrder: 0,
        isRequired: true,
        responsibleOrgUnitRule: WorkStageResponsibleOrgUnitRule.PRIMARY_OWNER,
        responsibleOrgUnitId: null,
        assignmentMode: WorkStageAssignmentMode.ORG_UNIT_QUEUE,
        approvalMode: WorkStageApprovalMode.NONE,
        approvalLeadershipType: null,
        activationMode: WorkStageActivationMode.ALWAYS,
        activationFieldDefinitionId: null,
        activationExpectedValue: null,
        slaMinutes: null,
      },
    ],
  };
}

function draftVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: draftId,
    workTypeDefinitionId: definitionId,
    version: 2,
    status: WorkTypeVersionStatus.DRAFT,
    name: 'Routine Work',
    description: 'Draft description',
    changeReason: 'Update wording',
    createdByAccountId: user.accountId,
    publishedByAccountId: null,
    retiredByAccountId: null,
    publishedAt: null,
    retiredAt: null,
    createdAt: new Date('2026-09-05T00:00:00Z'),
    updatedAt: new Date('2026-09-05T00:00:00Z'),
    ...overrides,
  };
}

function createHarness(
  options: {
    lockRows?: Array<{ id: string }>;
    assertCanError?: Error;
  } = {},
) {
  const tx = {
    $queryRaw: jest
      .fn()
      .mockResolvedValue(
        options.lockRows === undefined
          ? [{ id: definitionId }]
          : options.lockRows,
      ),
    $executeRaw: jest.fn().mockResolvedValue(0),
    workTypeVersion: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(publishableConfiguration()),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    workTypeCreatorOrgUnit: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    workTypeCreatorAccount: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    workStageDefinition: {
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    workFieldDefinition: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    workStageDependency: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    orgUnit: {
      findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]),
    },
    account: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const prisma = {
    office: {
      findUnique: jest.fn().mockResolvedValue(office),
    },
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  } as unknown as PrismaService;

  const authorization = {
    assertCan: options.assertCanError
      ? jest.fn().mockRejectedValue(options.assertCanError)
      : jest.fn().mockResolvedValue(undefined),
  } as unknown as OrganizationAuthorizationService;

  return {
    service: new WorkTypeV3Service(prisma, authorization),
    prisma,
    authorization,
    tx,
  };
}

describe('WorkTypeV3Service lifecycle', () => {
  it('creates the next draft from the current published version under a definition lock', async () => {
    const { service, authorization, tx } = createHarness();

    tx.workTypeVersion.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        name: 'Routine Work',
        description: 'Current description',
        ...emptyPublishedConfiguration(),
      })
      .mockResolvedValueOnce({
        version: 1,
      });

    const created = draftVersion({
      description: 'Current description',
      changeReason: 'Clarify wording',
    });

    tx.workTypeVersion.create.mockResolvedValue(created);

    await expect(
      service.createDraft(user, office.id, definitionId, {
        changeReason: 'Clarify wording',
      }),
    ).resolves.toEqual({
      office,
      draft: created,
    });

    expect(authorization.assertCan).toHaveBeenCalledWith(
      user,
      CAPABILITIES.WORK_TYPE_DRAFT,
      office.id,
      null,
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.workTypeVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workTypeDefinitionId: definitionId,
          version: 2,
          status: WorkTypeVersionStatus.DRAFT,
          name: 'Routine Work',
          description: 'Current description',
          changeReason: 'Clarify wording',
          createdByAccountId: user.accountId,
        }),
      }),
    );
  });

  it('clones normalized configuration into a new draft without reusing source IDs', async () => {
    const { service, tx } = createHarness();

    tx.workTypeVersion.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        name: 'New Installation',
        description: 'Current configuration',
        ...emptyPublishedConfiguration(),
        primaryOwnerOrgUnitId: 'org-1',
        creatorCategories: [WorkTypeCreatorCategory.OFFICE_HEAD],
        creatorOrgUnits: [
          {
            id: 'creator-rule-1',
            orgUnitId: 'org-1',
            includeDescendants: true,
          },
        ],
        fields: [
          {
            id: 'field-old',
            code: 'MATERIAL_REQUIRED',
            label: 'Material required',
            fieldType: WorkFieldType.BOOLEAN,
            isRequired: false,
            sortOrder: 10,
            config: null,
            stageDefinitionId: null,
          },
        ],
        stages: [
          {
            id: 'stage-old',
            code: 'MATERIAL_SUPPORT',
            name: 'Material support',
            description: null,
            sortOrder: 20,
            isRequired: false,
            responsibleOrgUnitRule:
              WorkStageResponsibleOrgUnitRule.PRIMARY_OWNER,
            responsibleOrgUnitId: null,
            assignmentMode: WorkStageAssignmentMode.ORG_UNIT_QUEUE,
            approvalMode: WorkStageApprovalMode.NONE,
            approvalLeadershipType: null,
            activationMode: WorkStageActivationMode.FIELD_TRUE,
            activationFieldDefinitionId: 'field-old',
            activationExpectedValue: null,
            slaMinutes: null,
          },
        ],
      })
      .mockResolvedValueOnce({ version: 1 });

    tx.workTypeVersion.create.mockResolvedValue(
      draftVersion({ name: 'New Installation' }),
    );
    tx.workStageDefinition.create.mockResolvedValue({ id: 'stage-new' });
    tx.workFieldDefinition.create.mockResolvedValue({ id: 'field-new' });
    tx.workStageDefinition.update.mockResolvedValue({ id: 'stage-new' });

    await service.createDraft(user, office.id, definitionId, {});

    expect(tx.workTypeCreatorOrgUnit.createMany).toHaveBeenCalledWith({
      data: [
        {
          workTypeVersionId: draftId,
          orgUnitId: 'org-1',
          includeDescendants: true,
        },
      ],
    });
    expect(tx.workStageDefinition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workTypeVersionId: draftId,
          code: 'MATERIAL_SUPPORT',
          activationMode: WorkStageActivationMode.ALWAYS,
        }),
      }),
    );
    expect(tx.workFieldDefinition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workTypeVersionId: draftId,
          code: 'MATERIAL_REQUIRED',
        }),
      }),
    );
    expect(tx.workStageDefinition.update).toHaveBeenCalledWith({
      where: { id: 'stage-new' },
      data: {
        activationMode: WorkStageActivationMode.FIELD_TRUE,
        activationFieldDefinitionId: 'field-new',
        activationExpectedValue: undefined,
      },
    });
  });
  it('rejects creation when an open draft already exists', async () => {
    const { service, tx } = createHarness();

    tx.workTypeVersion.findFirst.mockResolvedValueOnce({
      id: draftId,
      version: 2,
    });

    await expect(
      service.createDraft(user, office.id, definitionId, {}),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.workTypeVersion.create).not.toHaveBeenCalled();
  });

  it('requires a published source before creating another version', async () => {
    const { service, tx } = createHarness();

    tx.workTypeVersion.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await expect(
      service.createDraft(user, office.id, definitionId, {}),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.workTypeVersion.create).not.toHaveBeenCalled();
  });

  it('updates only a DRAFT version', async () => {
    const { service, tx } = createHarness();
    const existing = draftVersion();
    const updated = draftVersion({
      name: 'Routine Field Work',
      description: null,
    });

    tx.workTypeVersion.findFirst.mockResolvedValueOnce(existing);
    tx.workTypeVersion.update.mockResolvedValue(updated);

    await expect(
      service.updateDraft(user, office.id, definitionId, draftId, {
        name: 'Routine Field Work',
        description: null,
      }),
    ).resolves.toEqual({
      office,
      draft: updated,
    });

    expect(tx.workTypeVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: draftId,
        },
        data: {
          name: 'Routine Field Work',
          description: null,
        },
      }),
    );
  });

  it('does not mutate a published or retired version through the draft endpoint', async () => {
    const { service, tx } = createHarness();

    tx.workTypeVersion.findFirst.mockResolvedValueOnce(
      draftVersion({
        status: WorkTypeVersionStatus.PUBLISHED,
      }),
    );

    await expect(
      service.updateDraft(user, office.id, definitionId, draftId, {
        name: 'Do not change',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.workTypeVersion.update).not.toHaveBeenCalled();
  });

  it('rejects an empty draft update', async () => {
    const { service, prisma, tx } = createHarness();

    await expect(
      service.updateDraft(user, office.id, definitionId, draftId, {}),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.workTypeVersion.update).not.toHaveBeenCalled();
  });

  it('discards a draft without deleting published history', async () => {
    const { service, tx } = createHarness();
    const draft = draftVersion();

    tx.workTypeVersion.findFirst.mockResolvedValueOnce(draft);
    tx.workTypeVersion.delete.mockResolvedValue(draft);

    await expect(
      service.discardDraft(user, office.id, definitionId, draftId),
    ).resolves.toEqual({
      office,
      discardedDraft: {
        id: draftId,
        version: 2,
      },
    });

    expect(tx.workTypeVersion.delete).toHaveBeenCalledWith({
      where: {
        id: draftId,
      },
    });
  });

  it('does not publish an incomplete configuration', async () => {
    const { service, tx } = createHarness();

    tx.workTypeVersion.findFirst.mockResolvedValueOnce(draftVersion());
    tx.workTypeVersion.findUnique.mockResolvedValueOnce(
      emptyPublishedConfiguration(),
    );

    await expect(
      service.publishDraft(user, office.id, definitionId, draftId),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.workTypeVersion.findMany).not.toHaveBeenCalled();
    expect(tx.workTypeVersion.update).not.toHaveBeenCalled();
  });
  it('publishes a draft atomically and retires the previous published version', async () => {
    const { service, authorization, tx } = createHarness();
    const draft = draftVersion();
    const published = draftVersion({
      status: WorkTypeVersionStatus.PUBLISHED,
      publishedByAccountId: user.accountId,
      publishedAt: new Date('2026-09-05T01:00:00Z'),
    });

    tx.workTypeVersion.findFirst.mockResolvedValueOnce(draft);
    tx.workTypeVersion.findMany.mockResolvedValue([
      {
        id: 'published-1',
      },
    ]);
    tx.workTypeVersion.update
      .mockResolvedValueOnce({
        id: 'published-1',
      })
      .mockResolvedValueOnce(published);

    await expect(
      service.publishDraft(user, office.id, definitionId, draftId),
    ).resolves.toEqual({
      office,
      publishedVersion: published,
    });

    expect(authorization.assertCan).toHaveBeenCalledWith(
      user,
      CAPABILITIES.WORK_TYPE_PUBLISH,
      office.id,
      null,
    );

    expect(tx.workTypeVersion.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: 'published-1',
        },
        data: expect.objectContaining({
          status: WorkTypeVersionStatus.RETIRED,
          retiredByAccountId: user.accountId,
          retiredAt: expect.any(Date),
        }),
      }),
    );

    expect(tx.workTypeVersion.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: draftId,
        },
        data: expect.objectContaining({
          status: WorkTypeVersionStatus.PUBLISHED,
          publishedByAccountId: user.accountId,
          publishedAt: expect.any(Date),
          retiredByAccountId: null,
          retiredAt: null,
        }),
      }),
    );

    const retiredAt = tx.workTypeVersion.update.mock.calls[0][0].data.retiredAt;
    const publishedAt =
      tx.workTypeVersion.update.mock.calls[1][0].data.publishedAt;

    expect(publishedAt).toBe(retiredAt);
  });

  it('stops publishing when configuration already has multiple published versions', async () => {
    const { service, tx } = createHarness();

    tx.workTypeVersion.findFirst.mockResolvedValueOnce(draftVersion());
    tx.workTypeVersion.findMany.mockResolvedValue([
      { id: 'published-2' },
      { id: 'published-1' },
    ]);

    await expect(
      service.publishDraft(user, office.id, definitionId, draftId),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.workTypeVersion.update).not.toHaveBeenCalled();
  });

  it('rejects a definition that does not belong to the requested office', async () => {
    const { service, tx } = createHarness({
      lockRows: [],
    });

    await expect(
      service.createDraft(user, office.id, definitionId, {}),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.workTypeVersion.findFirst).not.toHaveBeenCalled();
  });

  it('does not enter a transaction when authorization rejects the mutation', async () => {
    const { service, prisma } = createHarness({
      assertCanError: new ForbiddenException(),
    });

    await expect(
      service.createDraft(user, office.id, definitionId, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
