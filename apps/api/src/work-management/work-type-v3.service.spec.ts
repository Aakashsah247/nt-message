import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  WorkItemType,
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

function createService(overrides: {
  office?: unknown;
  definitions?: unknown[];
  versions?: unknown[];
  detail?: unknown;
  assertCanError?: Error;
  draft?: boolean;
  publish?: boolean;
} = {}) {
  const prisma = {
    office: {
      findUnique: jest.fn().mockResolvedValue(
        overrides.office === undefined ? office : overrides.office,
      ),
    },
    workTypeDefinition: {
      findMany: jest.fn().mockResolvedValue(overrides.definitions ?? []),
      findFirst: jest.fn().mockResolvedValue(overrides.detail ?? null),
    },
    workTypeVersion: {
      findMany: jest.fn().mockResolvedValue(overrides.versions ?? []),
    },
  } as unknown as PrismaService;

  const authorization = {
    assertCan: overrides.assertCanError
      ? jest.fn().mockRejectedValue(overrides.assertCanError)
      : jest.fn().mockResolvedValue(undefined),
    can: jest
      .fn()
      .mockImplementation(
        async (_user: AuthenticatedUser, capability: string) =>
          capability === CAPABILITIES.WORK_TYPE_DRAFT
            ? (overrides.draft ?? false)
            : capability === CAPABILITIES.WORK_TYPE_PUBLISH
              ? (overrides.publish ?? false)
              : false,
      ),
  } as unknown as OrganizationAuthorizationService;

  return {
    service: new WorkTypeV3Service(prisma, authorization),
    prisma,
    authorization,
  };
}

describe('WorkTypeV3Service', () => {
  it('returns server-authoritative work type actions', async () => {
    const { service, authorization } = createService({
      draft: true,
      publish: false,
    });

    await expect(
      service.getActionContext(user, office.id),
    ).resolves.toEqual({
      office,
      availableActions: {
        view: true,
        draft: true,
        publish: false,
      },
    });

    expect(authorization.assertCan).toHaveBeenCalledWith(
      user,
      CAPABILITIES.WORK_TYPE_VIEW,
      office.id,
      null,
    );
  });

  it('lists definitions with the latest published and draft versions', async () => {
    const definition = {
      id: 'definition-1',
      officeId: office.id,
      code: 'ROUTINE_WORK',
      legacyWorkItemType: WorkItemType.ROUTINE_TASK,
      isActive: true,
      sortOrder: 10,
      createdAt: new Date('2026-09-05T00:00:00Z'),
      updatedAt: new Date('2026-09-05T00:00:00Z'),
    };
    const published = {
      id: 'version-1',
      workTypeDefinitionId: definition.id,
      version: 1,
      status: WorkTypeVersionStatus.PUBLISHED,
      name: 'Routine Work',
      description: null,
      changeReason: 'Legacy backfill',
      publishedAt: new Date('2026-09-05T00:00:00Z'),
      createdAt: new Date('2026-09-05T00:00:00Z'),
      updatedAt: new Date('2026-09-05T00:00:00Z'),
    };
    const draft = {
      ...published,
      id: 'version-2',
      version: 2,
      status: WorkTypeVersionStatus.DRAFT,
      publishedAt: null,
    };

    const { service } = createService({
      definitions: [definition],
      versions: [draft, published],
    });

    const result = await service.list(user, office.id);

    expect(result.data).toEqual([
      expect.objectContaining({
        id: definition.id,
        currentPublishedVersion: published,
        currentDraftVersion: draft,
      }),
    ]);
  });

  it('does not expose work types without view authority', async () => {
    const { service } = createService({
      assertCanError: new ForbiddenException(),
    });

    await expect(
      service.list(user, office.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a definition from another office or an unknown definition', async () => {
    const { service } = createService({
      detail: null,
    });

    await expect(
      service.getById(user, office.id, 'definition-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an unknown office before reading configuration', async () => {
    const { service } = createService({
      office: null,
    });

    await expect(
      service.list(user, 'missing-office'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
