import { ForbiddenException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
  OrgAssignmentSource,
  OrgMembershipType,
} from '../generated/prisma/client';

import { CAPABILITIES } from './organization-capabilities';
import { OrganizationAuthorityService } from './organization-authority.service';
import { OrganizationAuthorizationService } from './organization-authorization.service';
import { OrganizationPeopleService } from './organization-people.service';

describe('OrganizationPeopleService UI read context', () => {
  const employeeUser = {
    accountId: 'employee-account',
    role: AccountRole.EMPLOYEE,
  } as AuthenticatedUser;

  const superAdminUser = {
    accountId: 'super-admin-account',
    role: AccountRole.SUPER_ADMIN,
  } as AuthenticatedUser;

  function authority() {
    return {
      assertCanViewOffice: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrganizationAuthorityService;
  }

  it('returns server-authoritative people actions without granting Super Admin mutation', async () => {
    const prisma = {
      orgUnit: {
        findFirst: jest.fn().mockResolvedValue({ id: 'unit-1' }),
      },
    } as unknown as PrismaService;

    const authorization = {
      can: jest.fn(
        async (
          _user: AuthenticatedUser,
          capability: string,
        ) =>
          capability === CAPABILITIES.MEMBERSHIP_VIEW ||
          capability === CAPABILITIES.LEADERSHIP_VIEW,
      ),
    } as unknown as OrganizationAuthorizationService;

    const service = new OrganizationPeopleService(
      prisma,
      authority(),
      authorization,
    );

    await expect(
      service.getPeopleActionContext(
        superAdminUser,
        'office-1',
        'unit-1',
      ),
    ).resolves.toEqual({
      officeId: 'office-1',
      orgUnitId: 'unit-1',
      availableActions: {
        viewMemberships: true,
        transferPrimary: false,
        assignSecondary: false,
        viewLeadership: true,
        assignLeadership: false,
        assignActing: false,
        assignDeputy: false,
      },
    });
  });

  it('lists active primary Office people from the V3 membership model', async () => {
    const prisma = {
      orgMembership: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'membership-2',
            officeId: 'office-1',
            orgUnitId: 'unit-2',
            membershipType: OrgMembershipType.PRIMARY,
            assignmentSource: OrgAssignmentSource.MANUAL,
            startsAt: new Date('2026-09-01T00:00:00.000Z'),
            employee: {
              id: 'employee-2',
              empId: 'NTC-1004',
              empName: 'Sunidhi Yadav',
              designation: 'Engineer',
              status: EmployeeStatus.ACTIVE,
              employmentStatus: EmploymentStatus.ACTIVE,
              isActivated: true,
              account: {
                id: 'account-2',
                username: 'ntc-1004',
                role: AccountRole.EMPLOYEE,
                isEnabled: true,
              },
            },
            orgUnit: {
              id: 'unit-2',
              code: 'TECH',
              name: 'Technical',
              isActive: true,
              orgUnitType: {
                id: 'type-1',
                code: 'DIVISION',
                name: 'Division',
                isTeam: false,
              },
            },
          },
          {
            id: 'membership-1',
            officeId: 'office-1',
            orgUnitId: null,
            membershipType: OrgMembershipType.PRIMARY,
            assignmentSource: OrgAssignmentSource.SYSTEM,
            startsAt: new Date('2026-09-01T00:00:00.000Z'),
            employee: {
              id: 'employee-1',
              empId: 'NTC-1002',
              empName: 'Aakash Sah',
              designation: 'Office Head',
              status: EmployeeStatus.ACTIVE,
              employmentStatus: EmploymentStatus.ACTIVE,
              isActivated: true,
              account: {
                id: 'account-1',
                username: 'ntc-1002',
                role: AccountRole.EMPLOYEE,
                isEnabled: true,
              },
            },
            orgUnit: null,
          },
        ]),
      },
    } as unknown as PrismaService;

    const authorization = {
      can: jest.fn().mockResolvedValue(true),
      visibleOrgUnitIds: jest.fn(),
    } as unknown as OrganizationAuthorizationService;

    const service = new OrganizationPeopleService(
      prisma,
      authority(),
      authorization,
    );

    const result = await service.listOfficePeople(
      superAdminUser,
      'office-1',
    );

    expect(result.scope).toEqual({
      officeWide: true,
      visibleOrgUnitIds: [],
    });
    expect(result.data.map((item) => item.employee.empId)).toEqual([
      'NTC-1002',
      'NTC-1004',
    ]);
    expect(result.data[0]?.primaryMembership.orgUnitId).toBeNull();
    expect(authorization.visibleOrgUnitIds).not.toHaveBeenCalled();
  });

  it('limits the people selector to the union of visible V3 membership and leadership scopes', async () => {
    const prisma = {
      orgMembership: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;

    const authorization = {
      can: jest.fn().mockResolvedValue(false),
      visibleOrgUnitIds: jest.fn(
        async (
          _user: AuthenticatedUser,
          capability: string,
        ) =>
          capability === CAPABILITIES.MEMBERSHIP_VIEW
            ? ['unit-1']
            : ['unit-1', 'unit-2'],
      ),
    } as unknown as OrganizationAuthorizationService;

    const service = new OrganizationPeopleService(
      prisma,
      authority(),
      authorization,
    );

    const result = await service.listOfficePeople(
      employeeUser,
      'office-1',
    );

    expect(result.scope).toEqual({
      officeWide: false,
      visibleOrgUnitIds: ['unit-1', 'unit-2'],
    });
    expect(prisma.orgMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgUnitId: {
            in: ['unit-1', 'unit-2'],
          },
        }),
      }),
    );
  });

  it('rejects people discovery when the viewer has no V3 people visibility', async () => {
    const prisma = {} as PrismaService;
    const authorization = {
      can: jest.fn().mockResolvedValue(false),
      visibleOrgUnitIds: jest.fn().mockResolvedValue([]),
    } as unknown as OrganizationAuthorizationService;

    const service = new OrganizationPeopleService(
      prisma,
      authority(),
      authorization,
    );

    await expect(
      service.listOfficePeople(employeeUser, 'office-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});