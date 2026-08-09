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
  divisionId: null,
  departmentId: null,
};

const seniorManager = {
  accountId: 'senior-manager',
  role: AccountRole.SENIOR_MANAGEMENT,
  divisionId: 'division-a',
  departmentId: null,
};

const teamManager = {
  accountId: 'team-manager',
  role: AccountRole.TEAM_MANAGER,
  divisionId: 'division-a',
  departmentId: 'department-a',
};

describe('announcement audience policy', () => {
  it('allows Super Admin across every audience type', () => {
    expect(
      getAnnouncementAudiencePolicyViolation(superAdmin, {
        audienceType: AnnouncementAudienceType.ORGANIZATION,
        divisionId: null,
        departmentId: null,
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

  it('does not let organizational authority bypass official-group membership role', () => {
    expect(
      getAnnouncementAudiencePolicyViolation(superAdmin, {
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

  it('rejects Employee publishing for every audience', () => {
    expect(
      getAnnouncementAudiencePolicyViolation(
        {
          accountId: 'employee',
          role: AccountRole.EMPLOYEE,
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
  it('allows an Admin creator and the Owner to modify an Admin-created announcement', () => {
    const creator = {
      id: 'team-manager',
      role: AccountRole.TEAM_MANAGER,
    };

    expect(canModifyAnnouncementByCreator(teamManager, creator)).toBe(true);
    expect(canModifyAnnouncementByCreator(superAdmin, creator)).toBe(true);
  });

  it('blocks another Admin from modifying an Admin-created announcement', () => {
    expect(
      canModifyAnnouncementByCreator(seniorManager, {
        id: 'team-manager',
        role: AccountRole.TEAM_MANAGER,
      }),
    ).toBe(false);
  });

  it('allows only the Owner creator to modify an Owner-created announcement', () => {
    const creator = {
      id: 'super-admin',
      role: AccountRole.SUPER_ADMIN,
    };

    expect(canModifyAnnouncementByCreator(superAdmin, creator)).toBe(true);
    expect(canModifyAnnouncementByCreator(seniorManager, creator)).toBe(false);
    expect(canModifyAnnouncementByCreator(teamManager, creator)).toBe(false);
  });
});
