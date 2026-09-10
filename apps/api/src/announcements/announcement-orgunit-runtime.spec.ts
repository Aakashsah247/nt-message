import type { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  AnnouncementAudienceType,
  ConversationParticipantRole,
  OfficialGroupMembershipMode,
  OfficialGroupScopeType,
} from '../generated/prisma/enums';
import type { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import type { MessagingEventsService } from '../realtime/messaging-events.service';
import { AnnouncementsService } from './announcements.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

const OFFICE_ID = '11111111-1111-4111-8111-111111111111';
const ORG_UNIT_ID = '22222222-2222-4222-8222-222222222222';
const CHILD_UNIT_ID = '33333333-3333-4333-8333-333333333333';
const ACCOUNT_ID = '44444444-4444-4444-8444-444444444444';

const viewer = {
  accountId: ACCOUNT_ID,
  username: 'employee.one',
  role: AccountRole.EMPLOYEE,
  employeeId: '55555555-5555-4555-8555-555555555555',
  officeId: OFFICE_ID,
  primaryOrgUnitId: ORG_UNIT_ID,
  isOfficeHead: false,
  divisionId: null,
  departmentId: null,
  displayName: 'Employee One',
  isEnabled: true,
};

function authorizationStub(input?: {
  canPublish?: boolean;
  visibleOrgUnitIds?: string[];
}) {
  return {
    can: jest.fn().mockResolvedValue(input?.canPublish ?? true),
    visibleOrgUnitIds: jest
      .fn()
      .mockResolvedValue(input?.visibleOrgUnitIds ?? [ORG_UNIT_ID]),
    isOfficeHead: jest.fn().mockResolvedValue(false),
  } as unknown as OrganizationAuthorizationService;
}

function service(
  prismaInput: object,
  authorization: OrganizationAuthorizationService = authorizationStub(),
) {
  return new AnnouncementsService(
    prismaInput as PrismaService,
    {} as MessagingEventsService,
    authorization,
  );
}

describe('P12-F announcement OrgUnit runtime', () => {
  it('resolves native Office and OrgUnit audiences without legacy hierarchy ids', async () => {
    const prisma = {
      office: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: OFFICE_ID, name: 'Patan Office' }),
      },
      orgUnit: {
        findFirst: jest.fn().mockResolvedValue({
          id: ORG_UNIT_ID,
          officeId: OFFICE_ID,
          name: 'Technical',
        }),
      },
    };
    const runtime = service(prisma) as unknown as {
      resolveAudience(
        input: object,
        actor: object,
      ): Promise<{
        audienceType: AnnouncementAudienceType;
        officeId: string;
        orgUnitId: string | null;
        includeDescendants: boolean;
        divisionId: string | null;
        departmentId: string | null;
      }>;
    };

    const office = await runtime.resolveAudience(
      {
        audienceType: AnnouncementAudienceType.OFFICE,
        officeId: OFFICE_ID,
      },
      viewer,
    );
    const orgUnit = await runtime.resolveAudience(
      {
        audienceType: AnnouncementAudienceType.ORG_UNIT,
        officeId: OFFICE_ID,
        orgUnitId: ORG_UNIT_ID,
        includeDescendants: true,
      },
      viewer,
    );

    expect(office).toMatchObject({
      audienceType: AnnouncementAudienceType.OFFICE,
      officeId: OFFICE_ID,
      orgUnitId: null,
      includeDescendants: false,
      divisionId: null,
      departmentId: null,
    });
    expect(orgUnit).toMatchObject({
      audienceType: AnnouncementAudienceType.ORG_UNIT,
      officeId: OFFICE_ID,
      orgUnitId: ORG_UNIT_ID,
      includeDescendants: true,
      divisionId: null,
      departmentId: null,
    });
  });

  it('uses OrgUnitClosure when publishing to an entire subtree', async () => {
    const accountFindMany = jest
      .fn()
      .mockResolvedValue([
        { id: ACCOUNT_ID },
        { id: '66666666-6666-4666-8666-666666666666' },
      ]);
    const runtime = service({
      orgUnitClosure: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { descendantOrgUnitId: ORG_UNIT_ID },
            { descendantOrgUnitId: CHILD_UNIT_ID },
          ]),
      },
      account: { findMany: accountFindMany },
    }) as unknown as {
      resolveRecipientAccountIds(announcement: object): Promise<string[]>;
    };

    const recipients = await runtime.resolveRecipientAccountIds({
      audienceType: AnnouncementAudienceType.ORG_UNIT,
      officeId: OFFICE_ID,
      orgUnitId: ORG_UNIT_ID,
      includeDescendants: true,
      officialConversationId: null,
    });

    expect(recipients).toEqual([
      ACCOUNT_ID,
      '66666666-6666-4666-8666-666666666666',
    ]);
    expect(accountFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isEnabled: true,
          employee: {
            is: expect.objectContaining({
              orgMemberships: {
                some: expect.objectContaining({
                  officeId: OFFICE_ID,
                  orgUnitId: { in: [ORG_UNIT_ID, CHILD_UNIT_ID] },
                }),
              },
            }),
          },
        }),
      }),
    );
  });

  it('does not let an exact OrgUnit delegation expand into descendant recipients', async () => {
    const authorization = authorizationStub({
      visibleOrgUnitIds: [ORG_UNIT_ID],
    });
    const runtime = service(
      {
        orgUnitClosure: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { descendantOrgUnitId: ORG_UNIT_ID },
              { descendantOrgUnitId: CHILD_UNIT_ID },
            ]),
        },
      },
      authorization,
    ) as unknown as {
      canPublishScope(
        actor: object,
        officeId: string,
        orgUnitId: string | null,
        includeDescendants: boolean,
      ): Promise<boolean>;
    };

    await expect(
      runtime.canPublishScope(viewer, OFFICE_ID, ORG_UNIT_ID, true),
    ).resolves.toBe(false);
  });

  it('allows a descendant-enabled authority to publish across its subtree', async () => {
    const authorization = authorizationStub({
      visibleOrgUnitIds: [ORG_UNIT_ID, CHILD_UNIT_ID],
    });
    const runtime = service(
      {
        orgUnitClosure: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { descendantOrgUnitId: ORG_UNIT_ID },
              { descendantOrgUnitId: CHILD_UNIT_ID },
            ]),
        },
      },
      authorization,
    ) as unknown as {
      canPublishScope(
        actor: object,
        officeId: string,
        orgUnitId: string | null,
        includeDescendants: boolean,
      ): Promise<boolean>;
    };

    await expect(
      runtime.canPublishScope(viewer, OFFICE_ID, ORG_UNIT_ID, true),
    ).resolves.toBe(true);
  });

  it('keeps official-group publication tied to current OWNER/ADMIN membership', async () => {
    const prisma = {
      conversation: {
        findFirst: jest.fn().mockResolvedValue({
          id: '77777777-7777-4777-8777-777777777777',
          title: 'Technical Office Group',
          officialScopeType: OfficialGroupScopeType.ORG_UNIT,
          officialDivisionId: null,
          officialDepartmentId: null,
          officialOfficeId: OFFICE_ID,
          officialOrgUnitId: ORG_UNIT_ID,
          officialMembershipMode: OfficialGroupMembershipMode.DIRECT_MEMBERS,
          participants: [{ role: ConversationParticipantRole.ADMIN }],
        }),
      },
      orgUnit: {
        findFirst: jest.fn().mockResolvedValue({ id: ORG_UNIT_ID }),
      },
    };
    const runtime = service(prisma) as unknown as {
      resolveAndAuthorizeAudience(
        actor: object,
        input: object,
      ): Promise<{ officialConversationId: string | null }>;
    };

    await expect(
      runtime.resolveAndAuthorizeAudience(viewer, {
        audienceType: AnnouncementAudienceType.OFFICIAL_GROUP,
        officialConversationId: '77777777-7777-4777-8777-777777777777',
      }),
    ).resolves.toMatchObject({
      officialConversationId: '77777777-7777-4777-8777-777777777777',
    });
  });

  it('never gives Super Admin operational publishing authority', async () => {
    const authorization = authorizationStub();
    const runtime = service({}, authorization) as unknown as {
      canPublishScope(
        actor: object,
        officeId: string,
        orgUnitId: string | null,
        includeDescendants: boolean,
      ): Promise<boolean>;
    };

    await expect(
      runtime.canPublishScope(
        { ...viewer, role: AccountRole.SUPER_ADMIN },
        OFFICE_ID,
        ORG_UNIT_ID,
        false,
      ),
    ).resolves.toBe(false);
    expect(authorization.can).not.toHaveBeenCalled();
  });
});
