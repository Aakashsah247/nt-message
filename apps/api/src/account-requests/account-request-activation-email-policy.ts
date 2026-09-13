import { AccountClass } from '../generated/prisma/enums';

export interface ActivationEmailResendActorScope {
  accountId: string;
  accountClass: AccountClass;
  officeId: string | null;
  requestableOrgUnitIds: string[];
}

export interface ActivationEmailResendRequestScope {
  requestedByAccountId: string;
  officeId: string | null;
  intendedOrgUnitId: string | null;
}

export type ActivationEmailResendPolicyViolation =
  | 'ACCOUNT_CLASS_NOT_AUTHORIZED'
  | 'NOT_ORIGINAL_REQUESTER'
  | 'REQUEST_ORGANIZATION_OUT_OF_SCOPE';

/**
 * Evaluates persisted V3 authorization facts only. The caller resolves the
 * Office user's current users.request_create scope before invoking this policy.
 * Browser-supplied hierarchy or compatibility-role data must never be used.
 */
export function getActivationEmailResendPolicyViolation(
  actor: ActivationEmailResendActorScope,
  request: ActivationEmailResendRequestScope,
): ActivationEmailResendPolicyViolation | null {
  // Super Admin owns provisioning/identity administration and may resend an
  // activation invitation across Offices. Request/employee lifecycle checks
  // are still revalidated by the service before delivery is queued.
  if (actor.accountClass === AccountClass.SUPER_ADMIN) {
    return null;
  }

  if (actor.accountClass !== AccountClass.OFFICE_USER) {
    return 'ACCOUNT_CLASS_NOT_AUTHORIZED';
  }

  // Office users may resend only requests they originally submitted. Current
  // capability/scope must still include the request's intended OrgUnit.
  if (request.requestedByAccountId !== actor.accountId) {
    return 'NOT_ORIGINAL_REQUESTER';
  }

  if (
    !actor.officeId ||
    !request.officeId ||
    actor.officeId !== request.officeId ||
    !request.intendedOrgUnitId ||
    !actor.requestableOrgUnitIds.includes(request.intendedOrgUnitId)
  ) {
    return 'REQUEST_ORGANIZATION_OUT_OF_SCOPE';
  }

  return null;
}
