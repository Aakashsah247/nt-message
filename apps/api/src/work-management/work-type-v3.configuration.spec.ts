import { BadRequestException } from '@nestjs/common';

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
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import type { ReplaceWorkTypeDraftConfigurationDto } from './dto/replace-work-type-draft-configuration.dto';
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

function baseDto(): ReplaceWorkTypeDraftConfigurationDto {
  return {
    primaryOwnerOrgUnitId: 'org-1',
    creatorCategories: [WorkTypeCreatorCategory.OFFICE_HEAD],
    creatorScope: WorkTypeCreatorScope.PRIMARY_OWNER_SUBTREE,
    creatorOrgUnits: [],
    creatorAccounts: [],
    finalClosureMode: WorkFinalClosureMode.AUTO_AFTER_REQUIRED_STAGES,
    finalClosureLeadershipType: null,
    slaBasis: WorkSlaBasis.CALENDAR_DURATION,
    overallSlaMinutes: 240,
    fields: [
      {
        code: 'MATERIAL_REQUIRED',
        label: 'Material required',
        fieldType: WorkFieldType.BOOLEAN,
        isRequired: false,
        sortOrder: 10,
      },
    ],
    stages: [
      {
        code: 'INTAKE',
        name: 'Intake',
        sortOrder: 10,
        isRequired: true,
        responsibleOrgUnitRule: WorkStageResponsibleOrgUnitRule.PRIMARY_OWNER,
        responsibleOrgUnitId: null,
        assignmentMode: WorkStageAssignmentMode.ORG_UNIT_QUEUE,
        approvalMode: WorkStageApprovalMode.NONE,
        approvalLeadershipType: null,
        activationMode: WorkStageActivationMode.ALWAYS,
      },
      {
        code: 'MATERIAL_SUPPORT',
        name: 'Material support',
        sortOrder: 20,
        isRequired: false,
        responsibleOrgUnitRule:
          WorkStageResponsibleOrgUnitRule.SPECIFIC_ORG_UNIT,
        responsibleOrgUnitId: 'org-2',
        assignmentMode: WorkStageAssignmentMode.ORG_UNIT_OR_USER,
        approvalMode: WorkStageApprovalMode.RESPONSIBLE_ORG_UNIT_HEAD,
        approvalLeadershipType: null,
        activationMode: WorkStageActivationMode.FIELD_TRUE,
        activationFieldCode: 'MATERIAL_REQUIRED',
      },
    ],
    dependencies: [
      {
        stageCode: 'MATERIAL_SUPPORT',
        prerequisiteStageCode: 'INTAKE',
      },
    ],
  };
}

function createHarness(
  options: {
    orgUnits?: string[];
    creatorAccounts?: Array<{
      id: string;
      role: AccountRole;
      isEnabled: boolean;
      membershipCount: number;
    }>;
  } = {},
) {
  const savedConfiguration = {
    id: draftId,
    workTypeDefinitionId: definitionId,
    version: 2,
    status: WorkTypeVersionStatus.DRAFT,
    name: 'New Installation',
    description: null,
    changeReason: 'Configure workflow',
    createdByAccountId: user.accountId,
    publishedByAccountId: null,
    retiredByAccountId: null,
    publishedAt: null,
    retiredAt: null,
    createdAt: new Date('2026-09-06T00:00:00Z'),
    updatedAt: new Date('2026-09-06T00:00:00Z'),
    primaryOwnerOrgUnitId: 'org-1',
    creatorCategories: [WorkTypeCreatorCategory.OFFICE_HEAD],
    creatorScope: WorkTypeCreatorScope.PRIMARY_OWNER_SUBTREE,
    finalClosureMode: WorkFinalClosureMode.AUTO_AFTER_REQUIRED_STAGES,
    finalClosureLeadershipType: null,
    slaBasis: WorkSlaBasis.CALENDAR_DURATION,
    overallSlaMinutes: 240,
    creatorOrgUnits: [],
    creatorAccounts: [],
    fields: [],
    stages: [],
    stageDependencies: [],
  };

  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: definitionId }]),
    $executeRaw: jest.fn().mockResolvedValue(0),
    workTypeVersion: {
      findFirst: jest.fn().mockResolvedValue({
        id: draftId,
        workTypeDefinitionId: definitionId,
        version: 2,
        status: WorkTypeVersionStatus.DRAFT,
      }),
      update: jest.fn().mockResolvedValue({ id: draftId }),
      findUnique: jest.fn().mockResolvedValue(savedConfiguration),
    },
    orgUnit: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
          (options.orgUnits ?? ['org-1', 'org-2'])
            .map((id) => ({ id }))
            .filter(({ id }) => where.id.in.includes(id)),
        ),
    },
    account: {
      findMany: jest.fn().mockImplementation(() =>
        (options.creatorAccounts ?? []).map((account) => ({
          id: account.id,
          role: account.role,
          isEnabled: account.isEnabled,
          employee: {
            orgMemberships: Array.from(
              { length: account.membershipCount },
              (_, index) => ({ id: `membership-${index}` }),
            ),
          },
        })),
      ),
    },
    workStageDependency: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    workStageDefinition: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: { code: string } }) =>
          Promise.resolve({ id: `stage-${data.code}` }),
        ),
      update: jest.fn().mockResolvedValue({}),
    },
    workFieldDefinition: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: { code: string } }) =>
          Promise.resolve({ id: `field-${data.code}` }),
        ),
    },
    workTypeCreatorOrgUnit: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    workTypeCreatorAccount: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
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
    assertCan: jest.fn().mockResolvedValue(undefined),
  } as unknown as OrganizationAuthorizationService;

  const sla = {
    assertUsableOfficeCalendar: jest.fn().mockResolvedValue(undefined),
  };

  return {
    service: new WorkTypeV3Service(prisma, authorization, sla as never),
    prisma,
    tx,
  };
}

describe('WorkTypeV3Service configuration', () => {
  it('replaces a draft configuration atomically and resolves stage/field codes to new IDs', async () => {
    const { service, tx } = createHarness();
    const dto = baseDto();

    await expect(
      service.replaceDraftConfiguration(
        user,
        office.id,
        definitionId,
        draftId,
        dto,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        office,
        draft: expect.objectContaining({ id: draftId }),
      }),
    );

    expect(tx.workTypeVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: draftId },
        data: expect.objectContaining({
          primaryOwnerOrgUnitId: 'org-1',
          creatorScope: WorkTypeCreatorScope.PRIMARY_OWNER_SUBTREE,
          overallSlaMinutes: 240,
        }),
      }),
    );

    expect(tx.workStageDefinition.create).toHaveBeenCalledTimes(2);
    expect(tx.workFieldDefinition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'MATERIAL_REQUIRED',
          workTypeVersionId: draftId,
        }),
      }),
    );
    expect(tx.workStageDefinition.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'stage-MATERIAL_SUPPORT' },
        data: expect.objectContaining({
          activationMode: WorkStageActivationMode.FIELD_TRUE,
          activationFieldDefinitionId: 'field-MATERIAL_REQUIRED',
        }),
      }),
    );
    expect(tx.workStageDependency.createMany).toHaveBeenCalledWith({
      data: [
        {
          workTypeVersionId: draftId,
          stageDefinitionId: 'stage-MATERIAL_SUPPORT',
          prerequisiteStageId: 'stage-INTAKE',
        },
      ],
    });
  });

  it('rejects cyclic stage dependencies before touching the database', async () => {
    const { service, prisma } = createHarness();
    const dto = baseDto();
    dto.dependencies.push({
      stageCode: 'INTAKE',
      prerequisiteStageCode: 'MATERIAL_SUPPORT',
    });

    await expect(
      service.replaceDraftConfiguration(
        user,
        office.id,
        definitionId,
        draftId,
        dto,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires FIELD_TRUE activation to reference a BOOLEAN field', async () => {
    const { service, prisma } = createHarness();
    const dto = baseDto();
    dto.fields[0].fieldType = WorkFieldType.TEXT;

    await expect(
      service.replaceDraftConfiguration(
        user,
        office.id,
        definitionId,
        draftId,
        dto,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires controlled options for SELECT fields', async () => {
    const { service, prisma } = createHarness();
    const dto = baseDto();
    dto.fields[0] = {
      code: 'CONTACT_TYPE',
      label: 'Contact type',
      fieldType: WorkFieldType.SELECT,
      isRequired: true,
      sortOrder: 10,
    };

    await expect(
      service.replaceDraftConfiguration(
        user,
        office.id,
        definitionId,
        draftId,
        dto,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects duplicate MULTI_SELECT options before touching the database', async () => {
    const { service, prisma } = createHarness();
    const dto = baseDto();
    dto.fields[0] = {
      code: 'SERVICE_TYPES',
      label: 'Services',
      fieldType: WorkFieldType.MULTI_SELECT,
      isRequired: true,
      sortOrder: 10,
      config: {
        options: ['DATA', 'VOICE', 'DATA'],
        minSelections: 1,
      },
    };

    await expect(
      service.replaceDraftConfiguration(
        user,
        office.id,
        definitionId,
        draftId,
        dto,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts bounded numeric and controlled choice field configuration', async () => {
    const { service } = createHarness();
    const dto = baseDto();
    dto.fields = [
      {
        code: 'CONTACT_TYPE',
        label: 'Contact type',
        fieldType: WorkFieldType.SELECT,
        isRequired: true,
        sortOrder: 10,
        config: { options: ['MOBILE', 'TELEPHONE'] },
      },
      {
        code: 'RX_LEVEL_DBM',
        label: 'RX Level',
        fieldType: WorkFieldType.DECIMAL,
        isRequired: true,
        sortOrder: 20,
        config: { min: -100, max: 20 },
      },
    ];
    dto.stages = [dto.stages[0]];
    dto.dependencies = [];

    await expect(
      service.replaceDraftConfiguration(
        user,
        office.id,
        definitionId,
        draftId,
        dto,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        office,
        draft: expect.objectContaining({ id: draftId }),
      }),
    );
  });

  it('rejects referenced OrgUnits that are outside the requested Office', async () => {
    const { service } = createHarness({ orgUnits: ['org-1'] });

    await expect(
      service.replaceDraftConfiguration(
        user,
        office.id,
        definitionId,
        draftId,
        baseDto(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects Super Admin as an explicit operational Work creator', async () => {
    const { service } = createHarness({
      creatorAccounts: [
        {
          id: 'super-admin-1',
          role: AccountRole.SUPER_ADMIN,
          isEnabled: true,
          membershipCount: 0,
        },
      ],
    });
    const dto = baseDto();
    dto.creatorAccounts = [{ accountId: 'super-admin-1' }];

    await expect(
      service.replaceDraftConfiguration(
        user,
        office.id,
        definitionId,
        draftId,
        dto,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
