import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import {
  OrgAssignmentSource,
  OrgMembershipType,
} from '../generated/prisma/client';

import { LegacyOrganizationCompatibilityService } from './legacy-organization-compatibility.service';

describe('LegacyOrganizationCompatibilityService', () => {
  function createPrisma() {
    return {
      office: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'office-patan',
          code: 'PATAN',
          name: 'Patan Telecom Office',
          isActive: true,
        }),
      },

      division: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'division-service',
        }),
      },

      department: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'department-outservice',
          divisionId: 'division-service',
        }),
      },

      departmentTeam: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'team-patan',
          departmentId: 'department-outservice',
        }),
      },

      legacyOrgUnitMapping: {
        findFirst: jest.fn(
          async ({
            where,
          }: {
            where: {
              legacyEntityType: string;
            };
          }) => {
            if (
              where.legacyEntityType === 'DIVISION'
            ) {
              return {
                orgUnitId: 'org-division-service',
              };
            }

            if (
              where.legacyEntityType ===
              'DEPARTMENT'
            ) {
              return {
                orgUnitId:
                  'org-department-outservice',
              };
            }

            if (where.legacyEntityType === 'TEAM') {
              return {
                orgUnitId: 'org-team-patan',
              };
            }

            return null;
          },
        ),

        findUnique: jest.fn(),
      },

      orgUnit: {
        findUnique: jest.fn(),
      },

      orgMembership: {
        findFirst: jest.fn(),
      },
    };
  }

  it('resolves a legacy Team to the complete V3 organization scope', async () => {
    const prisma = createPrisma();

    const service =
      new LegacyOrganizationCompatibilityService(
        prisma as unknown as PrismaService,
      );

    await expect(
      service.resolveLegacyScope({
        teamId: 'team-patan',
      }),
    ).resolves.toEqual({
      office: {
        id: 'office-patan',
        code: 'PATAN',
        name: 'Patan Telecom Office',
        isActive: true,
      },

      legacy: {
        divisionId: 'division-service',
        departmentId: 'department-outservice',
        teamId: 'team-patan',
      },

      orgUnits: {
        divisionOrgUnitId:
          'org-division-service',

        departmentOrgUnitId:
          'org-department-outservice',

        teamOrgUnitId: 'org-team-patan',

        mostSpecificOrgUnitId:
          'org-team-patan',
      },
    });
  });

  it('rejects inconsistent legacy Department and Team identifiers', async () => {
    const prisma = createPrisma();

    const service =
      new LegacyOrganizationCompatibilityService(
        prisma as unknown as PrismaService,
      );

    await expect(
      service.resolveLegacyScope({
        departmentId: 'other-department',
        teamId: 'team-patan',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fails closed when a required legacy mapping is missing', async () => {
    const prisma = createPrisma();

    prisma.legacyOrgUnitMapping.findFirst =
      jest.fn().mockResolvedValue(null);

    const service =
      new LegacyOrganizationCompatibilityService(
        prisma as unknown as PrismaService,
      );

    await expect(
      service.resolveLegacyScope({
        divisionId: 'division-service',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns no legacy identity for a future V3-only OrgUnit', async () => {
    const prisma = createPrisma();

    prisma.orgUnit.findUnique.mockResolvedValue({
      id: 'new-v3-unit',
      officeId: 'office-patan',
      parentOrgUnitId: null,
      code: 'NEW',
      name: 'New Unit',
      isActive: true,
      orgUnitType: {
        id: 'type-unit',
        code: 'UNIT',
        name: 'Unit',
        isTeam: false,
      },
    });

    prisma.legacyOrgUnitMapping.findUnique.mockResolvedValue(
      null,
    );

    const service =
      new LegacyOrganizationCompatibilityService(
        prisma as unknown as PrismaService,
      );

    const result =
      await service.resolveOrgUnitToLegacy(
        'new-v3-unit',
      );

    expect(result.isLegacyBackfilled).toBe(false);
    expect(result.legacy).toBeNull();
  });

  it('reads the current primary placement from V3 membership rather than legacy employee columns', async () => {
    const prisma = createPrisma();

    prisma.orgMembership.findFirst.mockResolvedValue({
      id: 'membership-1',
      employeeId: 'employee-1',
      officeId: 'office-patan',
      orgUnitId: 'org-department-outservice',

      membershipType:
        OrgMembershipType.PRIMARY,

      assignmentSource:
        OrgAssignmentSource.LEGACY_MIGRATION,

      startsAt: new Date(
        '2026-06-01T00:00:00.000Z',
      ),

      endsAt: null,

      office: {
        id: 'office-patan',
        code: 'PATAN',
        name: 'Patan Telecom Office',
        isActive: true,
      },

      orgUnit: {
        id: 'org-department-outservice',
        parentOrgUnitId:
          'org-division-service',
        code: 'OUTSERVICE',
        name: 'outside service manager',
        isActive: true,

        orgUnitType: {
          code: 'DEPARTMENT',
          name: 'Department',
          isTeam: false,
        },
      },
    });

    prisma.legacyOrgUnitMapping.findUnique.mockResolvedValue(
      {
        legacyEntityType: 'DEPARTMENT',
        legacyEntityId:
          'department-outservice',
      },
    );

    const service =
      new LegacyOrganizationCompatibilityService(
        prisma as unknown as PrismaService,
      );

    const result =
      await service.resolveCurrentPrimaryPlacement(
        'employee-1',
      );

    expect(result).not.toBeNull();

    expect(result?.membership.orgUnitId).toBe(
      'org-department-outservice',
    );

    expect(result?.legacy).toEqual({
      entityType: 'DEPARTMENT',
      entityId: 'department-outservice',
    });
  });
});
