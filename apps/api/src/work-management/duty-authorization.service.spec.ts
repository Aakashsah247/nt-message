import { ForbiddenException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
} from '../generated/prisma/client';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import { DutyAuthorizationService } from './duty-authorization.service';

describe('DutyAuthorizationService', () => {
  const employeeUser = {
    accountId: 'account-1',
    accountClass: AccountClass.OFFICE_USER,
    role: AccountRole.EMPLOYEE,
  } as AuthenticatedUser;
  const superAdmin = {
    accountId: 'super-admin',
    accountClass: AccountClass.SUPER_ADMIN,
    role: AccountRole.SUPER_ADMIN,
  } as AuthenticatedUser;

  function harness() {
    const prisma = {
      account: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'account-1',
          accountClass: AccountClass.OFFICE_USER,
          isEnabled: true,
          employee: {
            id: 'employee-1',
            status: EmployeeStatus.ACTIVE,
            employmentStatus: EmploymentStatus.ACTIVE,
            archivedAt: null,
          },
        }),
      },
      orgMembership: {
        findFirst: jest.fn().mockResolvedValue({
          officeId: 'office-1',
          orgUnitId: 'unit-1',
          office: { id: 'office-1', code: 'PATAN', name: 'Patan Office' },
        }),
      },
      operationalTeamLeadAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      orgUnit: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'unit-1',
            code: 'UNIT',
            name: 'Unit One',
            parentOrgUnitId: null,
          },
        ]),
      },
      operationalTeam: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const organizationAuthorization = {
      can: jest.fn().mockResolvedValue(false),
      assertCan: jest.fn().mockResolvedValue(undefined),
      visibleOrgUnitIds: jest
        .fn()
        .mockImplementation(async (_user, capability: string) =>
          capability === 'duty.manage' ? [] : ['unit-1'],
        ),
    };
    return {
      prisma,
      organizationAuthorization,
      service: new DutyAuthorizationService(
        prisma as unknown as PrismaService,
        organizationAuthorization as unknown as OrganizationAuthorizationService,
      ),
    };
  }

  it('keeps Super Admin Duty access strictly read-only', async () => {
    const h = harness();
    h.prisma.account.findUnique.mockResolvedValue({
      id: 'super-admin',
      accountClass: AccountClass.SUPER_ADMIN,
      isEnabled: true,
      employee: null,
    });

    await expect(h.service.getContext(superAdmin)).resolves.toEqual(
      expect.objectContaining({
        canView: true,
        canCreate: false,
        canAssign: false,
        canManage: false,
        readOnlyOversight: true,
      }),
    );
    await expect(
      h.service.assertCanUseManagement(superAdmin, 'duty.assign'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('exposes Office/OrgUnit duty capabilities from central authorization', async () => {
    const h = harness();
    h.organizationAuthorization.can.mockImplementation(
      async (_user, capability: string) => capability !== 'duty.create',
    );

    await expect(h.service.getContext(employeeUser)).resolves.toEqual(
      expect.objectContaining({
        officeId: 'office-1',
        primaryOrgUnitId: 'unit-1',
        orgUnits: [
          {
            id: 'unit-1',
            code: 'UNIT',
            name: 'Unit One',
            parentOrgUnitId: null,
          },
        ],
        operationalTeams: [],
        canView: true,
        canCreate: false,
        canAssign: true,
        canManage: true,
        readOnlyOversight: false,
      }),
    );
  });

  it('grants Team Lead only Team-scoped Duty assignment entry without configuration management', async () => {
    const h = harness();
    h.prisma.operationalTeamLeadAssignment.findMany.mockResolvedValue([
      { teamId: 'team-1', team: { orgUnitId: 'unit-1' } },
    ]);
    h.prisma.operationalTeam.findMany.mockResolvedValue([
      { id: 'team-1', code: 'TEAM', name: 'Team One', orgUnitId: 'unit-1' },
    ]);

    const context = await h.service.getContext(employeeUser);
    expect(context.operationalTeamLeadIds).toEqual(['team-1']);
    expect(context.operationalTeams).toEqual([
      { id: 'team-1', code: 'TEAM', name: 'Team One', orgUnitId: 'unit-1' },
    ]);
    expect(context.canView).toBe(true);
    expect(context.canAssign).toBe(true);
    expect(context.canManage).toBe(false);
    expect(context.canCreate).toBe(false);
  });
});
