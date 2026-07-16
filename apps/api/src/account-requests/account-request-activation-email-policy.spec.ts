import { AccountRole } from '../generated/prisma/enums';
import { getActivationEmailResendPolicyViolation } from './account-request-activation-email-policy';

const request = {
  requestedByAccountId: 'requester-account',
  requestedRole: AccountRole.TEAM_MANAGER,
  divisionId: 'division-a',
  departmentId: 'department-a',
};

describe('activation email resend policy', () => {
  it('allows the Super Admin across the organization', () => {
    expect(
      getActivationEmailResendPolicyViolation(
        {
          accountId: 'super-admin',
          role: AccountRole.SUPER_ADMIN,
          divisionId: null,
          departmentId: null,
        },
        request,
      ),
    ).toBeNull();
  });

  it('allows the original Senior Management requester in the same division', () => {
    expect(
      getActivationEmailResendPolicyViolation(
        {
          accountId: 'requester-account',
          role: AccountRole.SENIOR_MANAGEMENT,
          divisionId: 'division-a',
          departmentId: null,
        },
        request,
      ),
    ).toBeNull();
  });

  it('rejects a different Senior Management requester', () => {
    expect(
      getActivationEmailResendPolicyViolation(
        {
          accountId: 'different-account',
          role: AccountRole.SENIOR_MANAGEMENT,
          divisionId: 'division-a',
          departmentId: null,
        },
        request,
      ),
    ).toBe('NOT_ORIGINAL_REQUESTER');
  });

  it('rejects Senior Management for an Employee request', () => {
    expect(
      getActivationEmailResendPolicyViolation(
        {
          accountId: 'requester-account',
          role: AccountRole.SENIOR_MANAGEMENT,
          divisionId: 'division-a',
          departmentId: null,
        },
        {
          ...request,
          requestedRole: AccountRole.EMPLOYEE,
        },
      ),
    ).toBe('REQUEST_ROLE_OUT_OF_SCOPE');
  });

  it('rejects a Senior Management requester outside the request division', () => {
    expect(
      getActivationEmailResendPolicyViolation(
        {
          accountId: 'requester-account',
          role: AccountRole.SENIOR_MANAGEMENT,
          divisionId: 'division-b',
          departmentId: null,
        },
        request,
      ),
    ).toBe('REQUEST_ORGANIZATION_OUT_OF_SCOPE');
  });

  it('allows the original Team Manager requester for an Employee in the same department', () => {
    expect(
      getActivationEmailResendPolicyViolation(
        {
          accountId: 'requester-account',
          role: AccountRole.TEAM_MANAGER,
          divisionId: 'division-a',
          departmentId: 'department-a',
        },
        {
          ...request,
          requestedRole: AccountRole.EMPLOYEE,
        },
      ),
    ).toBeNull();
  });

  it('rejects a Team Manager request for the wrong role', () => {
    expect(
      getActivationEmailResendPolicyViolation(
        {
          accountId: 'requester-account',
          role: AccountRole.TEAM_MANAGER,
          divisionId: 'division-a',
          departmentId: 'department-a',
        },
        request,
      ),
    ).toBe('REQUEST_ROLE_OUT_OF_SCOPE');
  });

  it('rejects a Team Manager outside the request department', () => {
    expect(
      getActivationEmailResendPolicyViolation(
        {
          accountId: 'requester-account',
          role: AccountRole.TEAM_MANAGER,
          divisionId: 'division-a',
          departmentId: 'department-b',
        },
        {
          ...request,
          requestedRole: AccountRole.EMPLOYEE,
        },
      ),
    ).toBe('REQUEST_ORGANIZATION_OUT_OF_SCOPE');
  });

  it('rejects Employee accounts', () => {
    expect(
      getActivationEmailResendPolicyViolation(
        {
          accountId: 'requester-account',
          role: AccountRole.EMPLOYEE,
          divisionId: 'division-a',
          departmentId: 'department-a',
        },
        {
          ...request,
          requestedRole: AccountRole.EMPLOYEE,
        },
      ),
    ).toBe('ROLE_NOT_AUTHORIZED');
  });
});
