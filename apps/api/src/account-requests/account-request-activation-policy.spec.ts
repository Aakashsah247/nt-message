import {
  AccountRequestLifecycleState,
  AccountRole,
  OrgMembershipType,
} from '../generated/prisma/client';
import {
  isCanonicalOfficeActivationRequest,
  primaryMembershipMatchesActivationScope,
} from './account-request-activation-policy';

const request = {
  lifecycleState: AccountRequestLifecycleState.PROVISIONED,
  officeId: 'office-a',
  intendedOrgUnitId: 'unit-a',
  requestedRole: AccountRole.EMPLOYEE,
};

describe('account request activation policy', () => {
  it('recognizes a provisioned V3 Office account request', () => {
    expect(isCanonicalOfficeActivationRequest(request)).toBe(true);
  });

  it('also recognizes an approved compatibility record before activation starts', () => {
    expect(
      isCanonicalOfficeActivationRequest({
        ...request,
        lifecycleState: AccountRequestLifecycleState.APPROVED,
      }),
    ).toBe(true);
  });

  it('requires the Office-user EMPLOYEE account role for canonical provisioning', () => {
    expect(
      isCanonicalOfficeActivationRequest({
        ...request,
        requestedRole: AccountRole.SUPER_ADMIN,
      }),
    ).toBe(false);
  });

  it('requires the submitted Office and intended OrgUnit', () => {
    expect(
      isCanonicalOfficeActivationRequest({ ...request, officeId: null }),
    ).toBe(false);
    expect(
      isCanonicalOfficeActivationRequest({
        ...request,
        intendedOrgUnitId: null,
      }),
    ).toBe(false);
  });

  it('requires an open PRIMARY membership in the exact Office and OrgUnit', () => {
    expect(
      primaryMembershipMatchesActivationScope(request, {
        officeId: 'office-a',
        orgUnitId: 'unit-a',
        membershipType: OrgMembershipType.PRIMARY,
        endsAt: null,
      }),
    ).toBe(true);

    expect(
      primaryMembershipMatchesActivationScope(request, {
        officeId: 'office-a',
        orgUnitId: 'unit-b',
        membershipType: OrgMembershipType.PRIMARY,
        endsAt: null,
      }),
    ).toBe(false);

    expect(
      primaryMembershipMatchesActivationScope(request, {
        officeId: 'office-a',
        orgUnitId: 'unit-a',
        membershipType: OrgMembershipType.SECONDARY,
        endsAt: null,
      }),
    ).toBe(false);
  });
});
