import type { AuthenticatedUser } from '../auth/types/auth.types';
import {
  AccountClass,
  AccountRequestOrganizationRole,
  AccountRole,
} from '../generated/prisma/client';
import { AccountRequestsService } from './account-requests.service';

const user: AuthenticatedUser = {
  accountId: 'requester-account',
  sessionId: 'session-1',
  username: 'requester.com',
  accountClass: AccountClass.OFFICE_USER,
  role: AccountRole.EMPLOYEE,
};

describe('AccountRequestsService V3 create flow', () => {
  it('persists Office + intended OrgUnit and does not encode leadership in the legacy role', async () => {
    const transaction = {
      orgUnit: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'org-unit-1',
        }),
      },
      accountRequest: {
        create: jest.fn().mockResolvedValue({
          id: 'request-1',
          empId: 'NTC-2001',
          requestedRole: AccountRole.EMPLOYEE,
          requestedOrganizationRole: AccountRequestOrganizationRole.EMPLOYEE,
          lifecycleState: 'REQUESTED',
          officeId: 'office-1',
          intendedOrgUnitId: 'org-unit-1',
        }),
      },
      accountRequestAction: {
        create: jest.fn().mockResolvedValue({
          id: 'action-1',
        }),
      },
    };

    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      accountRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(
        async (callback: (value: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };

    const requestAuthority = {
      resolveCreateTarget: jest.fn().mockResolvedValue({
        requesterId: 'requester-account',
        office: {
          id: 'office-1',
          code: 'PATAN',
          name: 'Patan Telecom Office',
        },
        requestedOrganizationRole: AccountRequestOrganizationRole.EMPLOYEE,
        intendedOrgUnit: {
          id: 'org-unit-1',
          code: 'TECH',
          name: 'Technical',
        },
      }),
    };

    const service = new AccountRequestsService(
      prisma as never,
      {} as never,
      requestAuthority as never,
      {} as never,
    );

    await service.createRequest(
      user,
      {
        officeId: 'office-1',
        intendedOrgUnitId: 'org-unit-1',
        requestedOrganizationRole: AccountRequestOrganizationRole.EMPLOYEE,
        empId: 'NTC-2001',
        empName: 'New Employee',
        phoneNumber: '9812345678',
        officialEmail: 'new.employee@ntc.net.np',
        designation: 'Engineer',
      },
      {
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
    );

    expect(requestAuthority.resolveCreateTarget).toHaveBeenCalledWith(user, {
      officeId: 'office-1',
      intendedOrgUnitId: 'org-unit-1',
      requestedOrganizationRole: AccountRequestOrganizationRole.EMPLOYEE,
    });

    expect(transaction.accountRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestedRole: AccountRole.EMPLOYEE,
          requestedOrganizationRole: AccountRequestOrganizationRole.EMPLOYEE,
          lifecycleState: 'REQUESTED',
          officeId: 'office-1',
          intendedOrgUnitId: 'org-unit-1',
          requestedByAccountId: 'requester-account',
        }),
      }),
    );
  });
});
