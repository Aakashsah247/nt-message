import {
  AccountRole,
  AnnouncementAudienceType,
  ConversationParticipantRole,
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
  divisionId: null,
  departmentId: null,
};

const delegatedEmployee = {
  accountId: 'delegated-employee',
  role: AccountRole.EMPLOYEE,
  isOfficeHead: false,
  divisionId: null,
  departmentId: null,
};

describe('announcement audience policy', () => {
  it('denies Super Admin operational announcement audiences', () => {
    expect(
      getAnnouncementAudiencePolicyViolation(superAdmin, {
        audienceType: AnnouncementAudienceType.OFFICE,
        divisionId: null,
        departmentId: null,
        officeId: 'office-a',
        orgUnitId: null,
      }),
    ).toBe('ROLE_NOT_AUTHORIZED');
  });

  it('leaves Office/OrgUnit scope authorization to the canonical V3 service', () => {
    expect(
      getAnnouncementAudiencePolicyViolation(delegatedEmployee, {
        audienceType: AnnouncementAudienceType.ORG_UNIT,
        divisionId: null,
        departmentId: null,
        officeId: 'office-a',
        orgUnitId: 'unit-a',
        includeDescendants: true,
      }),
    ).toBeNull();
  });

  it('requires an active official-group owner or admin role', () => {
    const audience = {
      audienceType: AnnouncementAudienceType.OFFICIAL_GROUP,
      divisionId: null,
      departmentId: null,
      officeId: 'office-a',
      orgUnitId: 'unit-a',
    };

    expect(
      getAnnouncementAudiencePolicyViolation(delegatedEmployee, {
        ...audience,
        officialParticipantRole: ConversationParticipantRole.OWNER,
      }),
    ).toBeNull();
    expect(
      getAnnouncementAudiencePolicyViolation(delegatedEmployee, {
        ...audience,
        officialParticipantRole: ConversationParticipantRole.ADMIN,
      }),
    ).toBeNull();
    expect(
      getAnnouncementAudiencePolicyViolation(delegatedEmployee, {
        ...audience,
        officialParticipantRole: ConversationParticipantRole.MEMBER,
      }),
    ).toBe('OFFICIAL_GROUP_ROLE_REQUIRED');
    expect(
      getAnnouncementAudiencePolicyViolation(officeHead, {
        ...audience,
        officialParticipantRole: null,
      }),
    ).toBe('OFFICIAL_GROUP_ROLE_REQUIRED');
  });
});

describe('announcement creator mutation policy', () => {
  it('lets the creator modify an announcement when current scope authorization passes', () => {
    expect(
      canModifyAnnouncementByCreator(delegatedEmployee, {
        id: delegatedEmployee.accountId,
        role: AccountRole.EMPLOYEE,
      }),
    ).toBe(true);
  });

  it('lets Office Head take over historical announcements', () => {
    expect(
      canModifyAnnouncementByCreator(officeHead, {
        id: 'legacy-manager',
        role: AccountRole.TEAM_MANAGER,
      }),
    ).toBe(true);
    expect(
      canModifyAnnouncementByCreator(officeHead, {
        id: 'super-admin',
        role: AccountRole.SUPER_ADMIN,
      }),
    ).toBe(true);
  });

  it('never grants Super Admin announcement mutation authority', () => {
    expect(
      canModifyAnnouncementByCreator(superAdmin, {
        id: superAdmin.accountId,
        role: AccountRole.SUPER_ADMIN,
      }),
    ).toBe(false);
  });
});
