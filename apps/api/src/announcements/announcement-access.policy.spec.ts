import {
  AccountRole,
  AnnouncementAudienceType,
  ConversationParticipantRole,
  OfficialGroupScopeType,
} from '../generated/prisma/enums';
import {
  canModifyAnnouncementByCreator,
  getAnnouncementAudiencePolicyViolation,
} from './announcement-access.policy';

const superAdmin = {
  accountId: 'super-admin',
  role: AccountRole.SUPER_ADMIN,
  isOfficeHead: false,
  divisionId: null,
  departmentId: null,
};

const officeHead = {
  accountId: 'office-head',
  role: AccountRole.EMPLOYEE,
  isOfficeHead: true,
  divisionId: 'division-a',
  departmentId: null,
};

const seniorManager = {
  accountId: 'senior-manager',
  role: AccountRole.SENIOR_MANAGEMENT,
  isOfficeHead: false,
  divisionId: 'division-a',
  departmentId: null,
};

const teamManager = {
  accountId: 'team-manager',
  role: AccountRole.TEAM_MANAGER,
  isOfficeHead: false,
  divisionId: 'division-a',
  departmentId: 'department-a',
};

describe('announcement audience policy', () => {
  it('denies Super Admin operational announcement audiences', () => {
    expect(
      getAnnouncementAudiencePolicyViolation(superAdmin, {
        audienceType: AnnouncementAudienceType.ORGANIZATION,
        divisionId: null,
        departmentId: null,
      }),
    ).toBe('ROLE_NOT_AUTHORIZED');
  });

  it('allows the active Office Head across Office announcement audiences', () => {
    expect(
      getAnnouncementAudiencePolicyViolation(officeHead, {
        audienceType: AnnouncementAudienceType.ORGANIZATION,
        divisionId: null,
        departmentId: null,
      }),
    ).toBeNull();
    expect(
      getAnnouncementAudiencePolicyViolation(officeHead, {
        audienceType: AnnouncementAudienceType.DEPARTMENT,
        divisionId: 'division-b',
        departmentId: 'department-b',
      }),
    ).toBeNull();
  });

  it('allows Senior Management only inside the assigned division', () => {
    expect(
      getAnnouncementAudiencePolicyViolation(seniorManager, {
        audienceType: AnnouncementAudienceType.DEPARTMENT,
        divisionId: 'division-a',
        departmentId: 'department-b',
      }),
    ).toBeNull();

    expect(
      getAnnouncementAudiencePolicyViolation(seniorManager, {
        audienceType: AnnouncementAudienceType.DIVISION,
        divisionId: 'division-b',
        departmentId: null,
      }),
    ).toBe('DIVISION_OUT_OF_SCOPE');
  });

  it('allows Team Manager only for the assigned department', () => {
    expect(
      getAnnouncementAudiencePolicyViolation(teamManager, {
        audienceType: AnnouncementAudienceType.DEPARTMENT,
        divisionId: 'division-a',
        departmentId: 'department-a',
      }),
    ).toBeNull();

    expect(
      getAnnouncementAudiencePolicyViolation(teamManager, {
        audienceType: AnnouncementAudienceType.DEPARTMENT,
        divisionId: 'division-a',
        departmentId: 'department-b',
      }),
    ).toBe('DEPARTMENT_OUT_OF_SCOPE');
  });

  it('uses the server-owned official-group scope', () => {
    expect(
      getAnnouncementAudiencePolicyViolation(teamManager, {
        audienceType: AnnouncementAudienceType.OFFICIAL_GROUP,
        divisionId: null,
        departmentId: null,
        officialScopeType: OfficialGroupScopeType.DEPARTMENT,
        officialDivisionId: 'division-a',
        officialDepartmentId: 'department-a',
        officialParticipantRole: ConversationParticipantRole.ADMIN,
      }),
    ).toBeNull();

    expect(
      getAnnouncementAudiencePolicyViolation(teamManager, {
        audienceType: AnnouncementAudienceType.OFFICIAL_GROUP,
        divisionId: null,
        departmentId: null,
        officialScopeType: OfficialGroupScopeType.ORGANIZATION,
        officialDivisionId: null,
        officialDepartmentId: null,
        officialParticipantRole: ConversationParticipantRole.ADMIN,
      }),
    ).toBe('OFFICIAL_GROUP_OUT_OF_SCOPE');
  });

  it('requires an active official-group owner or admin role', () => {
    const audience = {
      audienceType: AnnouncementAudienceType.OFFICIAL_GROUP,
      divisionId: null,
      departmentId: null,
      officialScopeType: OfficialGroupScopeType.DEPARTMENT,
      officialDivisionId: 'division-a',
      officialDepartmentId: 'department-a',
    };

    expect(
      getAnnouncementAudiencePolicyViolation(teamManager, {
        ...audience,
        officialParticipantRole: ConversationParticipantRole.OWNER,
      }),
    ).toBeNull();
    expect(
      getAnnouncementAudiencePolicyViolation(teamManager, {
        ...audience,
        officialParticipantRole: ConversationParticipantRole.ADMIN,
      }),
    ).toBeNull();
    expect(
      getAnnouncementAudiencePolicyViolation(teamManager, {
        ...audience,
        officialParticipantRole: ConversationParticipantRole.MEMBER,
      }),
    ).toBe('OFFICIAL_GROUP_ROLE_REQUIRED');
    expect(
      getAnnouncementAudiencePolicyViolation(teamManager, {
        ...audience,
        officialParticipantRole: null,
      }),
    ).toBe('OFFICIAL_GROUP_ROLE_REQUIRED');
  });

  it('does not let Office Head authority bypass official-group membership role', () => {
    expect(
      getAnnouncementAudiencePolicyViolation(officeHead, {
        audienceType: AnnouncementAudienceType.OFFICIAL_GROUP,
        divisionId: null,
        departmentId: null,
        officialScopeType: OfficialGroupScopeType.ORGANIZATION,
        officialDivisionId: null,
        officialDepartmentId: null,
        officialParticipantRole: ConversationParticipantRole.MEMBER,
      }),
    ).toBe('OFFICIAL_GROUP_ROLE_REQUIRED');
  });

  it('rejects a normal Employee publisher for every audience', () => {
    expect(
      getAnnouncementAudiencePolicyViolation(
        {
          accountId: 'employee',
          role: AccountRole.EMPLOYEE,
          isOfficeHead: false,
          divisionId: 'division-a',
          departmentId: 'department-a',
        },
        {
          audienceType: AnnouncementAudienceType.DEPARTMENT,
          divisionId: 'division-a',
          departmentId: 'department-a',
        },
      ),
    ).toBe('ROLE_NOT_AUTHORIZED');
  });
});

describe('announcement creator mutation policy', () => {
  it('lets the creator or Office Head modify a management announcement', () => {
    const creator = {
      id: 'team-manager',
      role: AccountRole.TEAM_MANAGER,
    };

    expect(canModifyAnnouncementByCreator(teamManager, creator)).toBe(true);
    expect(canModifyAnnouncementByCreator(officeHead, creator)).toBe(true);
  });

  it('blocks Super Admin from modifying an Office announcement', () => {
    expect(
      canModifyAnnouncementByCreator(superAdmin, {
        id: 'team-manager',
        role: AccountRole.TEAM_MANAGER,
      }),
    ).toBe(false);
  });

  it('blocks another manager from modifying a management announcement', () => {
    expect(
      canModifyAnnouncementByCreator(seniorManager, {
        id: 'team-manager',
        role: AccountRole.TEAM_MANAGER,
      }),
    ).toBe(false);
  });

  it('lets Office Head take over a historical Super Admin announcement', () => {
    const creator = {
      id: 'super-admin',
      role: AccountRole.SUPER_ADMIN,
    };

    expect(canModifyAnnouncementByCreator(officeHead, creator)).toBe(true);
    expect(canModifyAnnouncementByCreator(superAdmin, creator)).toBe(false);
    expect(canModifyAnnouncementByCreator(seniorManager, creator)).toBe(false);
  });
});
