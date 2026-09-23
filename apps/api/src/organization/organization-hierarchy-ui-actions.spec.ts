import { ConflictException, ForbiddenException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import { AccountClass, AccountRole } from '../generated/prisma/client';

import { CAPABILITIES } from './organization-capabilities';
import { OrganizationAuthorityService } from './organization-authority.service';
import { OrganizationAuthorizationService } from './organization-authorization.service';
import { OrganizationHierarchyService } from './organization-hierarchy.service';

describe('OrganizationHierarchyService UI action context', () => {
  const employeeUser = {
    accountId: 'employee-account',
    accountClass: AccountClass.OFFICE_USER,
    role: AccountRole.EMPLOYEE,
  } as AuthenticatedUser;

  const superAdminUser = {
    accountId: 'super-admin-account',
    accountClass: AccountClass.SUPER_ADMIN,
    role: AccountRole.SUPER_ADMIN,
  } as AuthenticatedUser;

  it('derives unit actions from central capability authorization', async () => {
    const prisma = {
      orgUnit: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'unit-1',
          officeId: 'office-1',
        }),
      },
    } as unknown as PrismaService;

    const authority = {
      assertCanViewOffice: jest.fn().mockResolvedValue(undefined),
      assertOfficeHead: jest
        .fn()
        .mockRejectedValue(new ForbiddenException('Office Head only')),
    } as unknown as OrganizationAuthorityService;

    const authorization = {
      can: jest.fn(
        async (_user: AuthenticatedUser, capability: string) =>
          capability === CAPABILITIES.ORGANIZATION_CREATE_UNIT ||
          capability === CAPABILITIES.ORGANIZATION_RENAME_UNIT,
      ),
    } as unknown as OrganizationAuthorizationService;

    const service = new OrganizationHierarchyService(
      prisma,
      authority,
      authorization,
    );

    await expect(
      service.getAvailableActions(employeeUser, 'office-1', 'unit-1'),
    ).resolves.toEqual({
      officeId: 'office-1',
      orgUnitId: 'unit-1',
      availableActions: {
        createChildUnit: true,
        renameUnit: true,
        moveUnit: false,
        changeUnitStatus: false,
        deactivationBlockers: {
          activeChildUnits: 0,
          activeMemberships: 0,
          activeLeadershipAssignments: 0,
        },
        deleteUnit: false,
        deleteBlockers: [],
      },
    });

    expect(authority.assertCanViewOffice).toHaveBeenCalledWith(
      employeeUser,
      'office-1',
    );
    expect(authorization.can).toHaveBeenCalledTimes(4);
    expect(authorization.can).toHaveBeenCalledWith(
      employeeUser,
      CAPABILITIES.ORGANIZATION_CREATE_UNIT,
      'office-1',
      'unit-1',
    );
    expect(authorization.can).toHaveBeenCalledWith(
      employeeUser,
      CAPABILITIES.ORGANIZATION_RENAME_UNIT,
      'office-1',
      'unit-1',
    );
    expect(authorization.can).toHaveBeenCalledWith(
      employeeUser,
      CAPABILITIES.ORGANIZATION_MOVE_UNIT,
      'office-1',
      'unit-1',
    );
    expect(authorization.can).toHaveBeenCalledWith(
      employeeUser,
      CAPABILITIES.ORGANIZATION_DEACTIVATE_UNIT,
      'office-1',
      'unit-1',
    );
  });

  it('keeps Super Admin mutation actions hidden when central authorization denies them', async () => {
    const prisma = {} as PrismaService;

    const authority = {
      assertCanViewOffice: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrganizationAuthorityService;

    const authorization = {
      can: jest.fn().mockResolvedValue(false),
    } as unknown as OrganizationAuthorizationService;

    const service = new OrganizationHierarchyService(
      prisma,
      authority,
      authorization,
    );

    await expect(
      service.getAvailableActions(superAdminUser, 'office-1', null),
    ).resolves.toEqual({
      officeId: 'office-1',
      orgUnitId: null,
      availableActions: {
        createChildUnit: false,
        renameUnit: false,
        moveUnit: false,
        changeUnitStatus: false,
        deactivationBlockers: {
          activeChildUnits: 0,
          activeMemberships: 0,
          activeLeadershipAssignments: 0,
        },
        deleteUnit: false,
        deleteBlockers: [],
      },
    });

    expect(authority.assertCanViewOffice).toHaveBeenCalledWith(
      superAdminUser,
      'office-1',
    );
    expect(authorization.can).toHaveBeenCalledTimes(1);
    expect(authorization.can).toHaveBeenCalledWith(
      superAdminUser,
      CAPABILITIES.ORGANIZATION_CREATE_UNIT,
      'office-1',
      null,
    );
  });

  it('reports active deactivation blockers from the same server rules used by status mutation', async () => {
    const prisma = {
      orgUnit: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'unit-1',
          officeId: 'office-1',
          isActive: true,
        }),
        count: jest.fn().mockResolvedValue(1),
      },
      orgMembership: {
        count: jest.fn().mockResolvedValue(2),
      },
      orgLeadershipAssignment: {
        count: jest.fn().mockResolvedValue(1),
      },
    } as unknown as PrismaService;

    const authority = {
      assertCanViewOffice: jest.fn().mockResolvedValue(undefined),
      assertOfficeHead: jest
        .fn()
        .mockRejectedValue(new ForbiddenException('Office Head only')),
    } as unknown as OrganizationAuthorityService;

    const authorization = {
      can: jest.fn(
        async (_user: AuthenticatedUser, capability: string) =>
          capability === CAPABILITIES.ORGANIZATION_DEACTIVATE_UNIT,
      ),
    } as unknown as OrganizationAuthorizationService;

    const service = new OrganizationHierarchyService(
      prisma,
      authority,
      authorization,
    );

    const result = await service.getAvailableActions(
      employeeUser,
      'office-1',
      'unit-1',
    );

    expect(result.availableActions.deactivationBlockers).toEqual({
      activeChildUnits: 1,
      activeMemberships: 2,
      activeLeadershipAssignments: 1,
    });
  });

  it('allows permanent delete only for an empty unit when the user is Office Head', async () => {
    const prisma = {
      orgUnit: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'unit-1', officeId: 'office-1' })
          .mockResolvedValueOnce({
            id: 'unit-1',
            code: 'UNIT-1',
            name: 'Unit One',
            _count: {
              childOrgUnits: 0,
              memberships: 0,
              leadershipAssignments: 0,
              delegatedPermissions: 0,
              intendedAccountRequests: 0,
              primaryWorkTypeVersions: 0,
              workTypeCreatorRules: 0,
              workStageResponsibilities: 0,
              primaryOwnedWorkItems: 0,
              workParticipants: 0,
              collaborationRequestsFrom: 0,
              collaborationRequestsTo: 0,
              responsibleWorkStages: 0,
              workStageAssignmentTargets: 0,
              ownershipTransfersFrom: 0,
              ownershipTransfersTo: 0,
              operationalTeams: 0,
              dutyShiftTemplatesV3: 0,
              dutyScheduleSeriesV3: 0,
              dutyAssignmentsV3: 0,
              dutyCoverageV3: 0,
              dutyExceptionsV3: 0,
              dutyHolidaysV3: 0,
              officialGroupsV3: 0,
              announcementsV3: 0,
            },
          }),
      },
    } as unknown as PrismaService;

    const authority = {
      assertCanViewOffice: jest.fn().mockResolvedValue(undefined),
      assertOfficeHead: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrganizationAuthorityService;

    const authorization = {
      can: jest.fn().mockResolvedValue(true),
    } as unknown as OrganizationAuthorizationService;

    const service = new OrganizationHierarchyService(
      prisma,
      authority,
      authorization,
    );

    const result = await service.getAvailableActions(
      employeeUser,
      'office-1',
      'unit-1',
    );

    expect(result.availableActions.deleteUnit).toBe(true);
    expect(result.availableActions.deleteBlockers).toEqual([]);
  });
  it('blocks permanent delete when the unit still has linked history', async () => {
    const prisma = {
      orgUnit: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'unit-1',
          code: 'UNIT-1',
          name: 'Unit One',
          _count: {
            childOrgUnits: 0,
            memberships: 2,
            leadershipAssignments: 0,
            delegatedPermissions: 0,
            intendedAccountRequests: 0,
            primaryWorkTypeVersions: 0,
            workTypeCreatorRules: 0,
            workStageResponsibilities: 0,
            primaryOwnedWorkItems: 0,
            workParticipants: 0,
            collaborationRequestsFrom: 0,
            collaborationRequestsTo: 0,
            responsibleWorkStages: 0,
            workStageAssignmentTargets: 0,
            ownershipTransfersFrom: 0,
            ownershipTransfersTo: 0,
            operationalTeams: 0,
            dutyShiftTemplatesV3: 0,
            dutyScheduleSeriesV3: 0,
            dutyAssignmentsV3: 0,
            dutyCoverageV3: 0,
            dutyExceptionsV3: 0,
            dutyHolidaysV3: 0,
            officialGroupsV3: 0,
            announcementsV3: 0,
          },
        }),
        delete: jest.fn(),
      },
    } as unknown as PrismaService;

    const authority = {
      assertOfficeHead: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrganizationAuthorityService;

    const service = new OrganizationHierarchyService(
      prisma,
      authority,
      {} as OrganizationAuthorizationService,
    );

    await expect(
      service.deleteOrgUnit(employeeUser, 'office-1', 'unit-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      (prisma.orgUnit as unknown as { delete: jest.Mock }).delete,
    ).not.toHaveBeenCalled();
  });

  it('deletes an unused unit only after Office Head authorization', async () => {
    const prisma = {
      orgUnit: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'unit-1',
          code: 'UNIT-1',
          name: 'Unit One',
          _count: {
            childOrgUnits: 0,
            memberships: 0,
            leadershipAssignments: 0,
            delegatedPermissions: 0,
            intendedAccountRequests: 0,
            primaryWorkTypeVersions: 0,
            workTypeCreatorRules: 0,
            workStageResponsibilities: 0,
            primaryOwnedWorkItems: 0,
            workParticipants: 0,
            collaborationRequestsFrom: 0,
            collaborationRequestsTo: 0,
            responsibleWorkStages: 0,
            workStageAssignmentTargets: 0,
            ownershipTransfersFrom: 0,
            ownershipTransfersTo: 0,
            operationalTeams: 0,
            dutyShiftTemplatesV3: 0,
            dutyScheduleSeriesV3: 0,
            dutyAssignmentsV3: 0,
            dutyCoverageV3: 0,
            dutyExceptionsV3: 0,
            dutyHolidaysV3: 0,
            officialGroupsV3: 0,
            announcementsV3: 0,
          },
        }),
        delete: jest.fn().mockResolvedValue({ id: 'unit-1' }),
      },
    } as unknown as PrismaService;

    const authority = {
      assertOfficeHead: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrganizationAuthorityService;

    const service = new OrganizationHierarchyService(
      prisma,
      authority,
      {} as OrganizationAuthorizationService,
    );

    await expect(
      service.deleteOrgUnit(employeeUser, 'office-1', 'unit-1'),
    ).resolves.toEqual({
      message: 'Unit deleted successfully.',
      deletedOrgUnit: {
        id: 'unit-1',
        code: 'UNIT-1',
        name: 'Unit One',
      },
    });
    expect(authority.assertOfficeHead).toHaveBeenCalledWith(
      employeeUser,
      'office-1',
    );
    expect(
      (prisma.orgUnit as unknown as { delete: jest.Mock }).delete,
    ).toHaveBeenCalledWith({
      where: { id: 'unit-1' },
    });
  });
});
