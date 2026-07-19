import { buildAnnouncementVisibilityWhere } from './announcement-list-visibility';

describe('buildAnnouncementVisibilityWhere', () => {
  const receivedScope = {
    recipients: {
      some: {
        accountId: '51f11c68-b1a7-4d48-9ef7-41661eecf840',
      },
    },
  };

  it('uses only recipient visibility when the viewer has no management scope', () => {
    expect(
      buildAnnouncementVisibilityWhere(receivedScope, null),
    ).toEqual(receivedScope);
  });

  it('combines recipient and management visibility for authorized managers', () => {
    const managementScope = {
      createdByAccountId: '36979459-d182-49c5-a8ea-2af8778d3c94',
    };

    expect(
      buildAnnouncementVisibilityWhere(receivedScope, managementScope),
    ).toEqual({
      OR: [receivedScope, managementScope],
    });
  });

  it('never introduces a non-UUID sentinel into the Prisma query', () => {
    const result = buildAnnouncementVisibilityWhere(receivedScope, null);

    expect(JSON.stringify(result)).not.toContain(
      '__employee_has_no_management_scope__',
    );
  });
});
