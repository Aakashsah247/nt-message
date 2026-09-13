import {
  AccountRole,
  AnnouncementAudienceType,
  ConversationParticipantRole,
  OfficialGroupScopeType,
} from '../generated/prisma/enums';

export interface AnnouncementPolicyViewer {
  accountId: string;
  role: AccountRole;
  isOfficeHead: boolean;
}

export interface AnnouncementPolicyAudience {
  audienceType: AnnouncementAudienceType;
  officeId?: string | null;
  orgUnitId?: string | null;
  includeDescendants?: boolean;
  officialScopeType?: OfficialGroupScopeType | null;
  officialOfficeId?: string | null;
  officialOrgUnitId?: string | null;
  officialParticipantRole?: ConversationParticipantRole | null;
}

export interface AnnouncementCreatorPolicySubject {
  id: string;
  role: AccountRole;
}

/**
 * Phase 12 authority: organizational authorization is evaluated by
 * OrganizationAuthorizationService. This helper controls only creator ownership
 * and the Office Head takeover rule for historical records.
 */
export function canModifyAnnouncementByCreator(
  viewer: Pick<
    AnnouncementPolicyViewer,
    'accountId' | 'role' | 'isOfficeHead'
  >,
  creator: AnnouncementCreatorPolicySubject,
): boolean {
  if (viewer.role === AccountRole.SUPER_ADMIN) {
    return false;
  }

  if (viewer.isOfficeHead) {
    return true;
  }

  if (creator.role === AccountRole.SUPER_ADMIN) {
    return false;
  }

  return viewer.accountId === creator.id;
}

export type AnnouncementAudiencePolicyViolation =
  | 'ROLE_NOT_AUTHORIZED'
  | 'OFFICIAL_GROUP_ROLE_REQUIRED';

/**
 * Scope authorization is intentionally not duplicated here. The service uses
 * the canonical V3 organization authorization capability for Office/OrgUnit
 * scope. Official-group publication additionally requires current OWNER/ADMIN
 * participation so a stale or client-supplied group id cannot elevate access.
 */
export function getAnnouncementAudiencePolicyViolation(
  viewer: AnnouncementPolicyViewer,
  audience: AnnouncementPolicyAudience,
): AnnouncementAudiencePolicyViolation | null {
  if (viewer.role === AccountRole.SUPER_ADMIN) {
    return 'ROLE_NOT_AUTHORIZED';
  }

  if (audience.audienceType === AnnouncementAudienceType.OFFICIAL_GROUP) {
    if (
      audience.officialParticipantRole !== ConversationParticipantRole.OWNER &&
      audience.officialParticipantRole !== ConversationParticipantRole.ADMIN
    ) {
      return 'OFFICIAL_GROUP_ROLE_REQUIRED';
    }
  }

  return null;
}
