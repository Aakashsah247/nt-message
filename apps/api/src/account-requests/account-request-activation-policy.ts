import {
  AccountRequestLifecycleState,
  AccountRole,
  OrgMembershipType,
} from '../generated/prisma/client';

export interface CanonicalActivationRequestScope {
  lifecycleState: AccountRequestLifecycleState;
  officeId: string | null;
  intendedOrgUnitId: string | null;
  requestedRole: AccountRole;
}

export interface CurrentPrimaryMembershipScope {
  officeId: string;
  orgUnitId: string | null;
  membershipType: OrgMembershipType;
  endsAt: Date | null;
}

/**
 * New hierarchy requests provision an ordinary Office account. Organizational
 * authority is assigned later through leadership/delegation, never by the
 * account role embedded in the activation token.
 */
export function isCanonicalOfficeActivationRequest(
  request: CanonicalActivationRequestScope,
): boolean {
  return Boolean(
    request.officeId &&
      request.intendedOrgUnitId &&
      request.requestedRole === AccountRole.EMPLOYEE &&
      (request.lifecycleState === AccountRequestLifecycleState.APPROVED ||
        request.lifecycleState === AccountRequestLifecycleState.PROVISIONED),
  );
}

export function primaryMembershipMatchesActivationScope(
  request: Pick<
    CanonicalActivationRequestScope,
    'officeId' | 'intendedOrgUnitId'
  >,
  membership: CurrentPrimaryMembershipScope | null | undefined,
): boolean {
  return Boolean(
    request.officeId &&
      request.intendedOrgUnitId &&
      membership &&
      membership.membershipType === OrgMembershipType.PRIMARY &&
      membership.endsAt === null &&
      membership.officeId === request.officeId &&
      membership.orgUnitId === request.intendedOrgUnitId,
  );
}