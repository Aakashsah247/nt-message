import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
  OrgAssignmentSource,
  OrgLeadershipType,
  OrgMembershipType,
} from '../generated/prisma/client';

import { CAPABILITIES } from './organization-capabilities';
import { OrganizationAuthorityService } from './organization-authority.service';
import { OrganizationAuthorizationService } from './organization-authorization.service';
import { OrganizationPeopleService } from './organization-people.service';

describe('OrganizationPeopleService', () => {
  const officeHeadUser = {
    accountId: 'office-head-account',
    role: AccountRole.EMPLOYEE,
  } as AuthenticatedUser;

  const superAdmin = {
    accountId: 'super-admin',
    role: AccountRole.SUPER_ADMIN,
  } as AuthenticatedUser;

  const activeEmployee = {
    id: 'employee-1',
    empId: 'E001',
    empName: 'Employee One',
    designation: 'Engineer',
    status: EmployeeStatus.ACTIVE,
    employmentStatus: EmploymentStatus.ACTIVE,
    archivedAt: null,
    account: {
      id: 'account-1',
      role: AccountRole.EMPLOYEE,
      isEnabled: true,
    },
  };

  function activeOffice() {
    return {
      id: 'office-1',
      code: 'PATAN',
      name: 'Patan Telecom Office',
      isActive: true,
    };
  }

  it('bootstraps initial Office membership while assigning the first Office Head', async () => {
    const transaction = {
      orgMembership: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'membership-1',
          officeId: 'office-1',
          orgUnitId: null,
          startsAt: new Date(),
        }),
      },
      orgLeadershipAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'leadership-1',
          leadershipType:
            OrgLeadershipType.OFFICE_HEAD,
        }),
      },
    };

    const prisma = {
      office: {
        findUnique: jest
          .fn()
          .mockResolvedValue(activeOffice()),
      },
      employee: {
        findUnique: jest
          .fn()
          .mockResolvedValue(activeEmployee),
      },
      $transaction: jest.fn(
        async (
          callback: (
            tx: typeof transaction,
          ) => Promise<unknown>,
        ) => callback(transaction),
      ),
    } as unknown as PrismaService;

    const authority = {
      assertPlatformAdmin: jest.fn(),
    } as unknown as OrganizationAuthorityService;

    const authorization = {
      assertCan: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrganizationAuthorizationService;

    const service =
      new OrganizationPeopleService(
        prisma,
        authority,
        authorization,
      );

    const result = await service.assignOfficeHead(
      superAdmin,
      'office-1',
      {
        employeeId: 'employee-1',
        reason: 'Initial Office Head bootstrap',
      },
    );

    expect(
      transaction.orgMembership.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        employeeId: 'employee-1',
        officeId: 'office-1',
        orgUnitId: null,
        membershipType: OrgMembershipType.PRIMARY,
        assignmentSource: OrgAssignmentSource.SYSTEM,
        assignedByAccountId: 'super-admin',
      }),
      select: expect.any(Object),
    });

    expect(
      transaction.orgLeadershipAssignment.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        employeeId: 'employee-1',
        officeId: 'office-1',
        orgUnitId: null,
        leadershipType:
          OrgLeadershipType.OFFICE_HEAD,
        assignmentSource: OrgAssignmentSource.SYSTEM,
        isActing: false,
        assignedByAccountId: 'super-admin',
      }),
    });

    expect(result.assignment.id).toBe('leadership-1');
  });

  it('does not allow a Super Admin employee identity inside office membership', async () => {
    const prisma = {
      office: {
        findUnique: jest
          .fn()
          .mockResolvedValue(activeOffice()),
      },
      employee: {
        findUnique: jest.fn().mockResolvedValue({
          ...activeEmployee,
          account: {
            id: 'super-admin',
            role: AccountRole.SUPER_ADMIN,
            isEnabled: true,
          },
        }),
      },
    } as unknown as PrismaService;

    const authority = {
      assertOfficeHead: jest
        .fn()
        .mockResolvedValue(undefined),
    } as unknown as OrganizationAuthorityService;

    const authorization = {
      assertCan: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrganizationAuthorizationService;

    const service =
      new OrganizationPeopleService(
        prisma,
        authority,
        authorization,
      );

    await expect(
      service.assignMembership(
        officeHeadUser,
        'office-1',
        {
          employeeId: 'employee-1',
          membershipType: OrgMembershipType.SECONDARY,
          reason: 'Temporary support placement',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects Team Lead assignment on a non-Team unit', async () => {
    const prisma = {
      office: {
        findUnique: jest
          .fn()
          .mockResolvedValue(activeOffice()),
      },
      employee: {
        findUnique: jest
          .fn()
          .mockResolvedValue(activeEmployee),
      },
      orgUnit: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'unit-1',
          officeId: 'office-1',
          code: 'SEC',
          name: 'Section',
          isActive: true,
          orgUnitType: {
            id: 'type-1',
            name: 'Section',
            isTeam: false,
            isActive: true,
          },
        }),
      },
    } as unknown as PrismaService;

    const authority = {
      assertOfficeHead: jest
        .fn()
        .mockResolvedValue(undefined),
    } as unknown as OrganizationAuthorityService;

    const authorization = {
      assertCan: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrganizationAuthorizationService;

    const service =
      new OrganizationPeopleService(
        prisma,
        authority,
        authorization,
      );

    await expect(
      service.assignLeadership(
        officeHeadUser,
        'office-1',
        {
          employeeId: 'employee-1',
          orgUnitId: 'unit-1',
          leadershipType:
            OrgLeadershipType.TEAM_LEAD,
          reason: 'Assign Team Lead',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('preserves the old primary placement when transferring internally', async () => {
    const oldStart = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    );

    const transaction = {
      orgMembership: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'old-membership',
          officeId: 'office-1',
          orgUnitId: 'old-unit',
          startsAt: oldStart,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'old-membership',
          endsAt: new Date(),
        }),
        create: jest.fn().mockResolvedValue({
          id: 'new-membership',
          orgUnitId: 'new-unit',
        }),
      },
    };

    const prisma = {
      office: {
        findUnique: jest
          .fn()
          .mockResolvedValue(activeOffice()),
      },
      employee: {
        findUnique: jest
          .fn()
          .mockResolvedValue(activeEmployee),
      },
      orgUnit: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'new-unit',
          officeId: 'office-1',
          code: 'NEW',
          name: 'New Unit',
          isActive: true,
          orgUnitType: {
            id: 'type-1',
            name: 'Unit',
            isTeam: false,
            isActive: true,
          },
        }),
      },
      orgMembership: {
        findFirst: jest.fn().mockResolvedValue({
          officeId: 'office-1',
          orgUnitId: 'old-unit',
        }),
      },
      $transaction: jest.fn(
        async (
          callback: (
            tx: typeof transaction,
          ) => Promise<unknown>,
        ) => callback(transaction),
      ),
    } as unknown as PrismaService;

    const authority = {
      assertOfficeHead: jest
        .fn()
        .mockResolvedValue(undefined),
    } as unknown as OrganizationAuthorityService;

    const authorization = {
      assertCan: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrganizationAuthorizationService;

    const service =
      new OrganizationPeopleService(
        prisma,
        authority,
        authorization,
      );

    await service.transferPrimaryMembership(
      officeHeadUser,
      'office-1',
      {
        employeeId: 'employee-1',
        orgUnitId: 'new-unit',
        reason: 'Internal organizational transfer',
      },
    );

    expect(authorization.assertCan).toHaveBeenNthCalledWith(
      1,
      officeHeadUser,
      CAPABILITIES.MEMBERSHIP_TRANSFER_INTERNAL,
      'office-1',
      'old-unit',
    );

    expect(authorization.assertCan).toHaveBeenNthCalledWith(
      2,
      officeHeadUser,
      CAPABILITIES.MEMBERSHIP_TRANSFER_INTERNAL,
      'office-1',
      'new-unit',
    );

    expect(
      transaction.orgMembership.update,
    ).toHaveBeenCalledWith({
      where: {
        id: 'old-membership',
      },
      data: expect.objectContaining({
        endsAt: expect.any(Date),
        endedByAccountId:
          'office-head-account',
        endReason:
          'Internal organizational transfer',
      }),
    });

    expect(
      transaction.orgMembership.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        employeeId: 'employee-1',
        officeId: 'office-1',
        orgUnitId: 'new-unit',
        membershipType: OrgMembershipType.PRIMARY,
        assignmentSource: OrgAssignmentSource.TRANSFER,
        assignedByAccountId:
          'office-head-account',
      }),
    });
  });
});
