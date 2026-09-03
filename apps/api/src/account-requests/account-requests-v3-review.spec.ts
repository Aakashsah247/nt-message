import type { AuthenticatedUser } from '../auth/types/auth.types';
import {
  AccountRequestActionType,
  AccountRequestLifecycleState,
  AccountRequestStatus,
  AccountRole,
  ActivationEmailDeliveryStatus,
  OrgAssignmentSource,
  OrgMembershipType,
} from '../generated/prisma/client';
import { AccountRequestsService } from './account-requests.service';

const superAdmin: AuthenticatedUser = {
  accountId: 'super-admin',
  sessionId: 'session-1',
  username: 'superadmin@example.com',
  role: AccountRole.SUPER_ADMIN,
};

const metadata = {
  ipAddress: '127.0.0.1',
  userAgent: 'jest',
};

function lifecycleMock() {
  return {
    assertTransition: jest.fn(),
  };
}

describe('AccountRequestsService V3 review/provision flow', () => {
  it('walks REQUESTED -> UNDER_REVIEW -> APPROVED -> PROVISIONED and creates the primary OrgMembership', async () => {
    const transaction = {
      accountRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'request-1',
          empId: 'NTC-3001',
          empName: 'Provisioned Employee',
          phoneNumber: '9812345678',
          officialEmail: 'provisioned@ntc.net.np',
          designation: 'Engineer',
          requestedRole: AccountRole.EMPLOYEE,
          lifecycleState: AccountRequestLifecycleState.REQUESTED,
          status: AccountRequestStatus.PENDING_APPROVAL,
          officeId: 'office-1',
          intendedOrgUnitId: 'unit-1',
          divisionId: null,
          departmentId: null,
          managementPositionId: null,
          office: {
            id: 'office-1',
            code: 'PATAN',
            name: 'Patan Telecom Office',
            isActive: true,
          },
          intendedOrgUnit: {
            id: 'unit-1',
            officeId: 'office-1',
            code: 'TECH',
            name: 'Technical',
            isActive: true,
            orgUnitType: {
              isActive: true,
            },
          },
          division: null,
          department: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({
          id: 'request-1',
          empId: 'NTC-3001',
          empName: 'Provisioned Employee',
          officialEmail: 'provisioned@ntc.net.np',
          requestedRole: AccountRole.EMPLOYEE,
          lifecycleState: AccountRequestLifecycleState.PROVISIONED,
          officeId: 'office-1',
          intendedOrgUnitId: 'unit-1',
          divisionId: null,
          departmentId: null,
          managementPositionId: null,
          employeeId: 'employee-1',
          revisionNumber: 1,
          status: AccountRequestStatus.APPROVED,
          activationEmailStatus: ActivationEmailDeliveryStatus.PENDING,
          activationEmailLastAttemptAt: null,
          activationEmailSentAt: null,
          activationEmailFailureCategory: null,
          rejectionReason: null,
          submittedAt: new Date(),
          reviewedAt: new Date(),
          updatedAt: new Date(),
        }),
      },
      employee: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'employee-1',
          empId: 'NTC-3001',
          empName: 'Provisioned Employee',
          phoneNumber: '9812345678',
          officialEmail: 'provisioned@ntc.net.np',
          divisionId: null,
          departmentId: null,
          department: 'Technical',
          designation: 'Engineer',
          status: 'ACTIVE',
          isActivated: false,
          createdAt: new Date(),
        }),
      },
      orgMembership: {
        create: jest.fn().mockResolvedValue({
          id: 'membership-1',
          officeId: 'office-1',
          orgUnitId: 'unit-1',
          membershipType: OrgMembershipType.PRIMARY,
          assignmentSource: OrgAssignmentSource.ACCOUNT_PROVISIONING,
          startsAt: new Date(),
        }),
      },
      accountRequestAction: {
        create: jest.fn().mockResolvedValue({ id: 'action-1' }),
      },
    };

    const prisma = {
      accountRequest: {
        findUnique: jest.fn().mockResolvedValue({
          officeId: 'office-1',
          intendedOrgUnitId: 'unit-1',
          requestedRole: AccountRole.EMPLOYEE,
          managementPositionId: null,
        }),
      },
      $transaction: jest.fn(
        async (
          callback: (value: typeof transaction) => Promise<unknown>,
        ) => callback(transaction),
      ),
    };

    const invitations = {
      prepareInvitation: jest.fn().mockReturnValue({
        rawToken: 'raw-token',
        tokenHash: 'token-hash',
        expiresAt: new Date(Date.now() + 60_000),
      }),
      queueInvitation: jest.fn().mockResolvedValue({
        id: 'invitation-1',
        accountRequestId: 'request-1',
        employeeId: 'employee-1',
        actorAccountId: 'super-admin',
        source: 'SUPER_ADMIN_APPROVAL',
        rawToken: 'raw-token',
        expiresAt: new Date(Date.now() + 60_000),
      }),
      deliverQueuedInvitation: jest.fn().mockResolvedValue({
        status: ActivationEmailDeliveryStatus.SENT,
        attemptedAt: new Date(),
        sentAt: new Date(),
        failureCategory: null,
      }),
    };

    const lifecycle = lifecycleMock();
    const service = new AccountRequestsService(
      prisma as never,
      invitations as never,
      {} as never,
      lifecycle as never,
    );

    await service.approveRequest(superAdmin, 'request-1', metadata);

    expect(lifecycle.assertTransition).toHaveBeenNthCalledWith(
      1,
      AccountRequestLifecycleState.REQUESTED,
      AccountRequestLifecycleState.UNDER_REVIEW,
    );
    expect(lifecycle.assertTransition).toHaveBeenNthCalledWith(
      2,
      AccountRequestLifecycleState.UNDER_REVIEW,
      AccountRequestLifecycleState.APPROVED,
    );
    expect(lifecycle.assertTransition).toHaveBeenNthCalledWith(
      3,
      AccountRequestLifecycleState.APPROVED,
      AccountRequestLifecycleState.PROVISIONED,
    );

    expect(transaction.orgMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeId: 'employee-1',
          officeId: 'office-1',
          orgUnitId: 'unit-1',
          membershipType: OrgMembershipType.PRIMARY,
          assignmentSource: OrgAssignmentSource.ACCOUNT_PROVISIONING,
          assignedByAccountId: 'super-admin',
        }),
      }),
    );

    expect(transaction.accountRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lifecycleState: AccountRequestLifecycleState.PROVISIONED,
          status: AccountRequestStatus.APPROVED,
          employeeId: 'employee-1',
        }),
      }),
    );

    expect(transaction.accountRequestAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AccountRequestActionType.PROVISIONED,
        }),
      }),
    );
  });

  it('returns only an UNDER_REVIEW request for correction', async () => {
    const transaction = {
      accountRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'request-2',
          lifecycleState: AccountRequestLifecycleState.UNDER_REVIEW,
          status: AccountRequestStatus.PENDING_APPROVAL,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'request-2',
          lifecycleState:
            AccountRequestLifecycleState.RETURNED_FOR_CORRECTION,
          status: AccountRequestStatus.REJECTED,
          rejectionReason: 'Correct the organization placement',
          reviewedAt: new Date(),
          updatedAt: new Date(),
        }),
      },
      accountRequestAction: {
        create: jest.fn().mockResolvedValue({ id: 'action-1' }),
      },
    };

    const prisma = {
      $transaction: jest.fn(
        async (
          callback: (value: typeof transaction) => Promise<unknown>,
        ) => callback(transaction),
      ),
    };
    const lifecycle = lifecycleMock();
    const service = new AccountRequestsService(
      prisma as never,
      {} as never,
      {} as never,
      lifecycle as never,
    );

    await service.returnForCorrection(
      superAdmin,
      'request-2',
      '  Correct the organization placement  ',
      metadata,
    );

    expect(lifecycle.assertTransition).toHaveBeenCalledWith(
      AccountRequestLifecycleState.UNDER_REVIEW,
      AccountRequestLifecycleState.RETURNED_FOR_CORRECTION,
    );
    expect(transaction.accountRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lifecycleState:
            AccountRequestLifecycleState.RETURNED_FOR_CORRECTION,
          status: AccountRequestStatus.REJECTED,
        }),
      }),
    );
  });

  it('records the review transition before rejecting a REQUESTED request', async () => {
    const transaction = {
      accountRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'request-3',
          lifecycleState: AccountRequestLifecycleState.REQUESTED,
          status: AccountRequestStatus.PENDING_APPROVAL,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'request-3',
          lifecycleState: AccountRequestLifecycleState.REJECTED,
          status: AccountRequestStatus.REJECTED,
        }),
      },
      accountRequestAction: {
        create: jest.fn().mockResolvedValue({ id: 'action-1' }),
      },
    };

    const prisma = {
      $transaction: jest.fn(
        async (
          callback: (value: typeof transaction) => Promise<unknown>,
        ) => callback(transaction),
      ),
    };
    const lifecycle = lifecycleMock();
    const service = new AccountRequestsService(
      prisma as never,
      {} as never,
      {} as never,
      lifecycle as never,
    );

    await service.rejectRequest(
      superAdmin,
      'request-3',
      'Duplicate official identity',
      metadata,
    );

    expect(lifecycle.assertTransition).toHaveBeenNthCalledWith(
      1,
      AccountRequestLifecycleState.REQUESTED,
      AccountRequestLifecycleState.UNDER_REVIEW,
    );
    expect(lifecycle.assertTransition).toHaveBeenNthCalledWith(
      2,
      AccountRequestLifecycleState.UNDER_REVIEW,
      AccountRequestLifecycleState.REJECTED,
    );
    expect(transaction.accountRequestAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AccountRequestActionType.REVIEW_STARTED,
        }),
      }),
    );
    expect(transaction.accountRequestAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AccountRequestActionType.REJECTED,
        }),
      }),
    );
  });
});
