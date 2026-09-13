import { AccountClass } from '../generated/prisma/enums';
import { getActivationEmailResendPolicyViolation } from './account-request-activation-email-policy';

const request = {
  requestedByAccountId: 'requester-account',
  officeId: 'office-a',
  intendedOrgUnitId: 'org-unit-a',
};

const officeRequester = {
  accountId: 'requester-account',
  accountClass: AccountClass.OFFICE_USER,
  officeId: 'office-a',
  requestableOrgUnitIds: ['org-unit-a', 'org-unit-b'],
};

describe('activation email resend policy', () => {
  it('allows the Super Admin across Offices', () => {
    expect(
      getActivationEmailResendPolicyViolation(
        {
          accountId: 'super-admin',
          accountClass: AccountClass.SUPER_ADMIN,
          officeId: null,
          requestableOrgUnitIds: [],
        },
        request,
      ),
    ).toBeNull();
  });

  it('allows the original Office requester when current V3 scope still contains the intended OrgUnit', () => {
    expect(
      getActivationEmailResendPolicyViolation(officeRequester, request),
    ).toBeNull();
  });

  it('rejects a different Office requester', () => {
    expect(
      getActivationEmailResendPolicyViolation(
        {
          ...officeRequester,
          accountId: 'different-account',
        },
        request,
      ),
    ).toBe('NOT_ORIGINAL_REQUESTER');
  });

  it('rejects an Office requester whose current capability scope no longer contains the intended OrgUnit', () => {
    expect(
      getActivationEmailResendPolicyViolation(
        {
          ...officeRequester,
          requestableOrgUnitIds: ['org-unit-b'],
        },
        request,
      ),
    ).toBe('REQUEST_ORGANIZATION_OUT_OF_SCOPE');
  });

  it('rejects an Office requester from another Office', () => {
    expect(
      getActivationEmailResendPolicyViolation(
        {
          ...officeRequester,
          officeId: 'office-b',
        },
        request,
      ),
    ).toBe('REQUEST_ORGANIZATION_OUT_OF_SCOPE');
  });

  it('rejects compatibility requests that do not yet have canonical V3 Office/OrgUnit scope', () => {
    expect(
      getActivationEmailResendPolicyViolation(officeRequester, {
        ...request,
        officeId: null,
        intendedOrgUnitId: null,
      }),
    ).toBe('REQUEST_ORGANIZATION_OUT_OF_SCOPE');
  });
});
