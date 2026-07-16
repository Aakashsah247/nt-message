import { AccountRole } from '../generated/prisma/enums';

export interface ActivationEmailResendActorScope {
  accountId: string;
  role: AccountRole;
  divisionId: string | null;
  departmentId: string | null;
}

export interface ActivationEmailResendRequestScope {
  requestedByAccountId: string;
  requestedRole: AccountRole;
  divisionId: string | null;
  departmentId: string | null;
}

export type ActivationEmailResendPolicyViolation =
  | 'ROLE_NOT_AUTHORIZED'
  | 'NOT_ORIGINAL_REQUESTER'
  | 'REQUEST_ROLE_OUT_OF_SCOPE'
  | 'REQUEST_ORGANIZATION_OUT_OF_SCOPE';

/**
 * Evaluates only persisted authorization facts: authenticated account identity,
 * stored requester ownership, requested role, and stored organization scope.
 * Browser-supplied role or scope data must never be passed into this policy.
 *
 * Employee eligibility, account state, approval state, and resend cooldown are
 * intentionally revalidated by the database-backed service in the same flow.
 */
export function getActivationEmailResendPolicyViolation(
  actor: ActivationEmailResendActorScope,
  request: ActivationEmailResendRequestScope,
): ActivationEmailResendPolicyViolation | null {
  // Super Admin authority is organization-wide, but employee eligibility and
  // request state are still validated by the service before an email is queued.
  if (actor.role === AccountRole.SUPER_ADMIN) {
    return null;
  }

  if (
    actor.role !== AccountRole.SENIOR_MANAGEMENT &&
    actor.role !== AccountRole.TEAM_MANAGER
  ) {
    return 'ROLE_NOT_AUTHORIZED';
  }

  // Managers may act only on requests they originally submitted; matching
  // organization scope alone is deliberately insufficient.
  if (request.requestedByAccountId !== actor.accountId) {
    return 'NOT_ORIGINAL_REQUESTER';
  }

  if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
    if (request.requestedRole !== AccountRole.TEAM_MANAGER) {
      return 'REQUEST_ROLE_OUT_OF_SCOPE';
    }

    if (
      !actor.divisionId ||
      request.divisionId !== actor.divisionId ||
      !request.departmentId
    ) {
      return 'REQUEST_ORGANIZATION_OUT_OF_SCOPE';
    }

    return null;
  }

  if (request.requestedRole !== AccountRole.EMPLOYEE) {
    return 'REQUEST_ROLE_OUT_OF_SCOPE';
  }

  if (
    !actor.divisionId ||
    !actor.departmentId ||
    request.divisionId !== actor.divisionId ||
    request.departmentId !== actor.departmentId
  ) {
    return 'REQUEST_ORGANIZATION_OUT_OF_SCOPE';
  }

  return null;
}
