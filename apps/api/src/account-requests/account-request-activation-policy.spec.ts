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
  managementPositionId: null,
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

  it.each([AccountRole.SENIOR_MANAGEMENT, AccountRole.TEAM_MANAGER])(
    'does not treat legacy %s authority as canonical account provisioning',
    (requestedRole) => {
      expect(
        isCanonicalOfficeActivationRequest({
          ...request,
          requestedRole,
        }),
      ).toBe(false);
    },
  );

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

  it('does not reinterpret a reserved legacy management position as V3 provisioning', () => {
    expect(
      isCanonicalOfficeActivationRequest({
        ...request,
        managementPositionId: 'legacy-position',
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