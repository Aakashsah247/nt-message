import {
  buildMembershipMessageVisibilityWhere,
  buildViewerMessageVisibilityWhere,
  isMessageVisibleToParticipant,
} from './conversation-visibility';

describe('conversation visibility', () => {
  const joinedAt = new Date('2026-07-17T01:00:00.000Z');

  it('includes messages sent exactly when membership began', () => {
    const visibility = buildViewerMessageVisibilityWhere('account-1', {
      joinedAt,
      historyClearedAt: null,
    });

    expect(visibility).toEqual({
      sentAt: {
        gte: joinedAt,
      },
      hiddenForAccounts: {
        none: {
          accountId: 'account-1',
        },
      },
    });

    expect(
      isMessageVisibleToParticipant(joinedAt, {
        joinedAt,
        historyClearedAt: null,
      }),
    ).toBe(true);
  });

  it('excludes messages at or before the clear boundary', () => {
    const historyClearedAt = new Date('2026-07-17T02:00:00.000Z');
    const participant = {
      joinedAt,
      historyClearedAt,
    };

    expect(
      buildViewerMessageVisibilityWhere('account-1', participant).sentAt,
    ).toEqual({
      gt: historyClearedAt,
    });

    expect(isMessageVisibleToParticipant(historyClearedAt, participant)).toBe(
      false,
    );
    expect(
      isMessageVisibleToParticipant(
        new Date('2026-07-17T02:00:00.001Z'),
        participant,
      ),
    ).toBe(true);
  });

  it('builds independent boundaries for global message search', () => {
    const result = buildMembershipMessageVisibilityWhere({
      conversationId: 'conversation-1',
      joinedAt,
      historyClearedAt: new Date('2026-07-17T03:00:00.000Z'),
    });

    expect(result).toEqual({
      conversationId: 'conversation-1',
      sentAt: {
        gt: new Date('2026-07-17T03:00:00.000Z'),
      },
    });
  });
});
