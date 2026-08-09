import {
  AccountRole,
  AnnouncementAudienceType,
  ConversationParticipantRole,
  OfficialGroupScopeType,
} from '../generated/prisma/enums';

export interface AnnouncementPolicyViewer {
  accountId: string;
  role: AccountRole;
  divisionId: string | null;
  departmentId: string | null;
}

export interface AnnouncementPolicyAudience {
  audienceType: AnnouncementAudienceType;
  divisionId: string | null;
  departmentId: string | null;
  officialScopeType?: OfficialGroupScopeType | null;
  officialDivisionId?: string | null;
  officialDepartmentId?: string | null;
  officialParticipantRole?: ConversationParticipantRole | null;
}

export interface AnnouncementCreatorPolicySubject {
  id: string;
  role: AccountRole;
}

/**
 * Announcement mutations are creator-owned. Super Admin may override an
 * announcement created by management, but management can never modify an
 * Owner/Super Admin announcement or another manager's announcement.
 */
export function canModifyAnnouncementByCreator(
  viewer: Pick<AnnouncementPolicyViewer, 'accountId' | 'role'>,
  creator: AnnouncementCreatorPolicySubject,
): boolean {
  if (viewer.role === AccountRole.EMPLOYEE) {
    return false;
  }

  if (creator.role === AccountRole.SUPER_ADMIN) {
    return viewer.accountId === creator.id;
  }

  return (
    viewer.accountId === creator.id ||
    viewer.role === AccountRole.SUPER_ADMIN
  );
}

export type AnnouncementAudiencePolicyViolation =
  | 'ROLE_NOT_AUTHORIZED'
  | 'ORGANIZATION_OUT_OF_SCOPE'
  | 'DIVISION_OUT_OF_SCOPE'
  | 'DEPARTMENT_OUT_OF_SCOPE'
  | 'OFFICIAL_GROUP_ROLE_REQUIRED'
  | 'OFFICIAL_GROUP_OUT_OF_SCOPE';

export function getAnnouncementAudiencePolicyViolation(
  viewer: AnnouncementPolicyViewer,
  audience: AnnouncementPolicyAudience,
): AnnouncementAudiencePolicyViolation | null {
  if (viewer.role === AccountRole.EMPLOYEE) {
    return 'ROLE_NOT_AUTHORIZED';
  }

  if (audience.audienceType === AnnouncementAudienceType.OFFICIAL_GROUP) {
    /*
     * Official announcements are operational group actions. Organizational
     * authority alone must not bypass the server-owned owner/admin role.
     */
    if (
      audience.officialParticipantRole !== ConversationParticipantRole.OWNER &&
      audience.officialParticipantRole !== ConversationParticipantRole.ADMIN
    ) {
      return 'OFFICIAL_GROUP_ROLE_REQUIRED';
    }
  }

  if (viewer.role === AccountRole.SUPER_ADMIN) {
    return null;
  }

  if (audience.audienceType === AnnouncementAudienceType.ORGANIZATION) {
    return 'ORGANIZATION_OUT_OF_SCOPE';
  }

  if (audience.audienceType === AnnouncementAudienceType.DIVISION) {
    return viewer.role === AccountRole.SENIOR_MANAGEMENT &&
      viewer.divisionId === audience.divisionId
      ? null
      : 'DIVISION_OUT_OF_SCOPE';
  }

  if (audience.audienceType === AnnouncementAudienceType.DEPARTMENT) {
    if (
      viewer.role === AccountRole.SENIOR_MANAGEMENT &&
      viewer.divisionId === audience.divisionId
    ) {
      return null;
    }

    return viewer.role === AccountRole.TEAM_MANAGER &&
      viewer.divisionId === audience.divisionId &&
      viewer.departmentId === audience.departmentId
      ? null
      : 'DEPARTMENT_OUT_OF_SCOPE';
  }

  /*
   * Official-group authorization follows the group's server-owned scope.
   * The browser cannot elevate access by supplying different organization IDs.
   */
  if (audience.officialScopeType === OfficialGroupScopeType.ORGANIZATION) {
    return 'OFFICIAL_GROUP_OUT_OF_SCOPE';
  }

  if (audience.officialScopeType === OfficialGroupScopeType.DIVISION) {
    return viewer.role === AccountRole.SENIOR_MANAGEMENT &&
      viewer.divisionId === audience.officialDivisionId
      ? null
      : 'OFFICIAL_GROUP_OUT_OF_SCOPE';
  }

  return (
    (viewer.role === AccountRole.SENIOR_MANAGEMENT &&
      viewer.divisionId === audience.officialDivisionId) ||
    (viewer.role === AccountRole.TEAM_MANAGER &&
      viewer.divisionId === audience.officialDivisionId &&
      viewer.departmentId === audience.officialDepartmentId)
  )
    ? null
    : 'OFFICIAL_GROUP_OUT_OF_SCOPE';
}
