import { ForbiddenException, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import { AccountRole, WorkTypeVersionStatus } from '../generated/prisma/client';
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

function createService(
  overrides: {
    office?: unknown;
    definitions?: unknown[];
    versions?: unknown[];
    detail?: unknown;
    orgUnits?: unknown[];
    memberships?: unknown[];
    leadership?: unknown[];
    visibleOrgUnitIds?: string[];
    assertCanError?: Error;
    draft?: boolean;
    publish?: boolean;
  } = {},
) {
  const prisma = {
    $transaction: jest.fn().mockResolvedValue({
      createdDefinitions: 0,
      createdDrafts: 0,
    }),
    office: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          overrides.office === undefined ? office : overrides.office,
        ),
    },
    workTypeDefinition: {
      findMany: jest.fn().mockResolvedValue(overrides.definitions ?? []),
      findFirst: jest.fn().mockResolvedValue(overrides.detail ?? null),
    },
    workTypeVersion: {
      findMany: jest.fn().mockResolvedValue(overrides.versions ?? []),
      findFirst: jest
        .fn()
        .mockResolvedValue({ creatorOrgUnits: [{ orgUnitId: 'division-1' }] }),
    },
    account: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ employeeId: 'employee-manager-1' }),
    },
    orgLeadershipAssignment: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          overrides.leadership ?? [
            { leadershipType: 'OFFICE_HEAD', orgUnitId: null, orgUnit: null },
          ],
        ),
    },
    orgUnit: {
      findMany: jest.fn().mockResolvedValue(overrides.orgUnits ?? []),
    },
    orgMembership: {
      findMany: jest.fn().mockResolvedValue(overrides.memberships ?? []),
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
    visibleOrgUnitIds: jest
      .fn()
      .mockResolvedValue(overrides.visibleOrgUnitIds ?? []),
  } as unknown as OrganizationAuthorizationService;

  const sla = {
    assertUsableOfficeCalendar: jest.fn().mockResolvedValue(undefined),
  };

  return {
    service: new WorkTypeV3Service(prisma, authorization, sla as never),
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

    await expect(service.getActionContext(user, office.id)).resolves.toEqual({
      office,
      availableActions: {
        view: true,
        draft: true,
        publish: false,
      },
    });

    expect(authorization.can).toHaveBeenCalledWith(
      user,
      CAPABILITIES.WORK_TYPE_VIEW,
      office.id,
      null,
    );
  });

  it('returns draft-only Work Type actions for an explicit Division-scoped delegation', async () => {
    const { service } = createService({
      draft: false,
      publish: false,
      leadership: [],
      visibleOrgUnitIds: ['division-1'],
      orgUnits: [{ id: 'division-1' }],
    });

    await expect(service.getActionContext(user, office.id)).resolves.toEqual({
      office,
      availableActions: {
        view: true,
        draft: true,
        publish: false,
      },
    });
  });

  it('returns Work Type configuration options without requiring organization-management APIs', async () => {
    const orgUnit = {
      id: 'unit-1',
      code: 'TECH',
      name: 'Technical',
      isActive: true,
      parentOrgUnitId: null,
      orgUnitType: {
        code: 'DIVISION',
        name: 'Division',
        isTeam: false,
      },
    };
    const membership = {
      orgUnitId: orgUnit.id,
      employee: {
        id: 'employee-1',
        empId: 'NTC-1001',
        empName: 'Employee One',
        designation: 'Engineer',
        account: {
          id: 'account-2',
          username: 'employee.one',
          role: AccountRole.EMPLOYEE,
          isEnabled: true,
        },
      },
    };

    const { service, prisma } = createService({
      draft: true,
      orgUnits: [orgUnit],
      memberships: [membership],
    });

    await expect(
      service.getConfigurationContext(user, office.id),
    ).resolves.toEqual({
      office,
      orgUnits: [orgUnit],
      creatorAccounts: [
        {
          accountId: 'account-2',
          username: 'employee.one',
          role: AccountRole.EMPLOYEE,
          employeeId: 'employee-1',
          empId: 'NTC-1001',
          empName: 'Employee One',
          designation: 'Engineer',
          primaryOrgUnitId: 'unit-1',
        },
      ],
      officeWideManagement: true,
      manageableDivisionOrgUnitIds: [],
    });

    expect(prisma.orgMembership.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.orgUnit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          officeId: office.id,
          orgUnitType: { isTeam: false },
        },
      }),
    );
  });

  it('keeps creator-account candidates hidden from read-only viewers', async () => {
    const { service, prisma } = createService({
      draft: false,
      orgUnits: [],
      memberships: [{ id: 'should-not-load' }],
    });

    await expect(
      service.getConfigurationContext(user, office.id),
    ).resolves.toEqual({
      office,
      orgUnits: [],
      creatorAccounts: [],
      officeWideManagement: false,
      manageableDivisionOrgUnitIds: [],
    });

    expect(prisma.orgMembership.findMany).not.toHaveBeenCalled();
  });

  it('lists definitions with the latest published and draft versions', async () => {
    const definition = {
      id: 'definition-1',
      officeId: office.id,
      code: 'ROUTINE_WORK',
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
      leadership: [],
      visibleOrgUnitIds: [],
      draft: false,
      publish: false,
    });

    await expect(service.list(user, office.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
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

    await expect(service.list(user, 'missing-office')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
