import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AccountRole,
  AnnouncementAudienceType,
  ConversationParticipantRole,
} from '../generated/prisma/client';
import {
  canModifyAnnouncementByCreator,
  getAnnouncementAudiencePolicyViolation,
} from '../announcements/announcement-access.policy';
import { ConversationsService } from './conversations.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

const conversationsSource = readFileSync(
  join(__dirname, 'conversations.service.ts'),
  'utf8',
);
const announcementsSource = readFileSync(
  join(__dirname, '..', 'announcements', 'announcements.service.ts'),
  'utf8',
);
const authorizationSource = readFileSync(
  join(
    __dirname,
    '..',
    'organization',
    'organization-authorization.service.ts',
  ),
  'utf8',
);
const directorySource = readFileSync(
  join(__dirname, '..', 'directory', 'directory.service.ts'),
  'utf8',
);

function sourceSection(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Security regression source section not found: ${start}`);
  }

  return source.slice(startIndex, endIndex);
}

describe('P12-L communication V3 security boundaries', () => {
  it('keeps Super Admin read-only for official groups and announcements', () => {
    const superAdminCapabilities = sourceSection(
      authorizationSource,
      'const SUPER_ADMIN_CAPABILITIES',
      '@Injectable()',
    );

    expect(superAdminCapabilities).toContain('CAPABILITIES.ANNOUNCEMENT_VIEW');
    expect(superAdminCapabilities).toContain(
      'CAPABILITIES.OFFICIAL_GROUP_VIEW',
    );
    expect(superAdminCapabilities).not.toContain(
      'CAPABILITIES.ANNOUNCEMENT_PUBLISH',
    );
    expect(superAdminCapabilities).not.toContain(
      'CAPABILITIES.OFFICIAL_GROUP_MANAGE',
    );
  });

  it('keeps Office Head and Org Unit Head communication authority capability-driven', () => {
    const officeHeadCapabilities = sourceSection(
      authorizationSource,
      'const OFFICE_HEAD_CAPABILITIES',
      'const ORG_UNIT_HEAD_CAPABILITIES',
    );
    const orgUnitHeadCapabilities = sourceSection(
      authorizationSource,
      'const ORG_UNIT_HEAD_CAPABILITIES',
      'const SUPER_ADMIN_CAPABILITIES',
    );

    for (const section of [officeHeadCapabilities, orgUnitHeadCapabilities]) {
      expect(section).toContain('CAPABILITIES.ANNOUNCEMENT_PUBLISH');
      expect(section).toContain('CAPABILITIES.OFFICIAL_GROUP_MANAGE');
    }
  });

  it('keeps new first-contact decisions independent of Division/Department', () => {
    const messageRequestSection = sourceSection(
      conversationsSource,
      'private getMessageRequestReason(',
      'private serializeMessageRequest(',
    );

    expect(messageRequestSection).toContain('OUTSIDE_ORG_SCOPE');
    expect(messageRequestSection).toContain('PROTECTED_RECIPIENT');
    expect(messageRequestSection).not.toContain('CROSS_DIVISION');
    expect(messageRequestSection).not.toContain('CROSS_DEPARTMENT');
    expect(messageRequestSection).not.toContain('.divisionId');
    expect(messageRequestSection).not.toContain('.departmentId');
  });

  it('does not require legacy hierarchy assignment to access private messaging', () => {
    const viewerSection = sourceSection(
      conversationsSource,
      'private async getMessagingViewer(',
      'private serializeAccount(',
    );

    expect(viewerSection).not.toContain('AccountRole.SENIOR_MANAGEMENT');
    expect(viewerSection).not.toContain('AccountRole.TEAM_MANAGER');
    expect(viewerSection).not.toContain('active division assignment');
    expect(viewerSection).not.toContain('active department assignment');
  });

  it('keeps official-group and announcement writes free of legacy role equality', () => {
    const officialGroupSection = sourceSection(
      conversationsSource,
      'private async canManageOfficialGroupScope(',
      'private async getAuthorizedOfficialGroupScope(',
    );
    const announcementSection = sourceSection(
      announcementsSource,
      'private async canPublishScope(',
      'private async resolveRecipientAccountIds(',
    );

    expect(officialGroupSection).toContain('OFFICIAL_GROUP_MANAGE');
    expect(officialGroupSection).not.toContain('SENIOR_MANAGEMENT');
    expect(officialGroupSection).not.toContain('TEAM_MANAGER');
    expect(announcementSection).toContain('ANNOUNCEMENT_PUBLISH');
    expect(announcementSection).not.toContain('SENIOR_MANAGEMENT');
    expect(announcementSection).not.toContain('TEAM_MANAGER');
  });

  it('keeps Super Admin and ordinary members out of announcement mutation policy', () => {
    expect(
      getAnnouncementAudiencePolicyViolation(
        {
          accountId: 'super-admin',
          role: AccountRole.SUPER_ADMIN,
          isOfficeHead: false,
          divisionId: null,
          departmentId: null,
        },
        {
          audienceType: AnnouncementAudienceType.OFFICE,
          divisionId: null,
          departmentId: null,
          officeId: 'office-1',
        },
      ),
    ).toBe('ROLE_NOT_AUTHORIZED');

    expect(
      getAnnouncementAudiencePolicyViolation(
        {
          accountId: 'employee-1',
          role: AccountRole.EMPLOYEE,
          isOfficeHead: false,
          divisionId: null,
          departmentId: null,
        },
        {
          audienceType: AnnouncementAudienceType.OFFICIAL_GROUP,
          divisionId: null,
          departmentId: null,
          officeId: 'office-1',
          officialParticipantRole: ConversationParticipantRole.MEMBER,
        },
      ),
    ).toBe('OFFICIAL_GROUP_ROLE_REQUIRED');

    expect(
      canModifyAnnouncementByCreator(
        {
          accountId: 'super-admin',
          role: AccountRole.SUPER_ADMIN,
          isOfficeHead: false,
        },
        { id: 'creator-1', role: AccountRole.EMPLOYEE },
      ),
    ).toBe(false);
  });

  it('keeps Office Head group roles explicit without elevating Super Admin', () => {
    const service = Object.create(
      ConversationsService.prototype,
    ) as ConversationsService;
    const personalRole = (
      service as unknown as {
        getPersonalGroupMemberRole: (
          isOfficeHead: boolean,
        ) => ConversationParticipantRole;
      }
    ).getPersonalGroupMemberRole.bind(service);
    const officialRole = (
      service as unknown as {
        getOfficialGroupParticipantRole: (
          account: unknown,
          officeHeadAccountIds: ReadonlySet<string>,
          managerAccountIds: ReadonlySet<string>,
        ) => ConversationParticipantRole;
      }
    ).getOfficialGroupParticipantRole.bind(service);

    expect(personalRole(true)).toBe(ConversationParticipantRole.ADMIN);
    expect(personalRole(false)).toBe(ConversationParticipantRole.MEMBER);
    expect(
      officialRole(
        { id: 'office-head', role: AccountRole.EMPLOYEE },
        new Set(['office-head']),
        new Set(),
      ),
    ).toBe(ConversationParticipantRole.OWNER);
    expect(
      officialRole(
        { id: 'super-admin', role: AccountRole.SUPER_ADMIN },
        new Set(),
        new Set(),
      ),
    ).toBe(ConversationParticipantRole.MEMBER);
  });

  it('keeps message editing sender-only and Directory employee contact visibility limited', () => {
    const editSection = sourceSection(
      conversationsSource,
      'async editTextMessage(',
      'async reactToMessage(',
    );

    expect(editSection).toContain(
      'if (message.senderAccountId !== viewer.accountId)',
    );
    expect(editSection).toContain('You can edit only messages that you sent.');
    expect(directorySource).toContain(
      'account.accountClass === AccountClass.SUPER_ADMIN',
    );
    expect(directorySource).toContain(
      '(employee?.orgLeadershipAssignments.length ?? 0) > 0',
    );
    expect(directorySource).toContain(
      '(employee?.operationalTeamLeadAssignments.length ?? 0) > 0',
    );
    expect(directorySource).not.toContain('AccountRole.EMPLOYEE');
    expect(directorySource).toContain('officeId: viewer.officeId');
  });
});
