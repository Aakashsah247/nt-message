import type { Prisma } from '../generated/prisma/client';

export interface ConversationVisibilityParticipant {
  joinedAt: Date;
  historyClearedAt: Date | null;
}

/**
 * Membership starts inclusively, while a clear boundary is exclusive.
 * A message committed after the clear action remains visible and can bring
 * a deleted private chat back into the participant's conversation list.
 */
export function buildVisibleMessageSentAtFilter(
  participant: ConversationVisibilityParticipant,
): NonNullable<Prisma.MessageWhereInput['sentAt']> {
  if (
    participant.historyClearedAt &&
    participant.historyClearedAt.getTime() >= participant.joinedAt.getTime()
  ) {
    return {
      gt: participant.historyClearedAt,
    };
  }

  return {
    gte: participant.joinedAt,
  };
}

/**
 * This is the canonical M19 visibility predicate. Every message-facing
 * endpoint must apply both the conversation boundary and existing
 * per-message "delete for me" records.
 */
export function buildViewerMessageVisibilityWhere(
  accountId: string,
  participant: ConversationVisibilityParticipant,
): Prisma.MessageWhereInput {
  return {
    sentAt: buildVisibleMessageSentAtFilter(participant),
    hiddenForAccounts: {
      none: {
        accountId,
      },
    },
  };
}

export function buildMembershipMessageVisibilityWhere(
  membership: ConversationVisibilityParticipant & {
    conversationId: string;
  },
): Prisma.MessageWhereInput {
  return {
    conversationId: membership.conversationId,
    sentAt: buildVisibleMessageSentAtFilter(membership),
  };
}

export function isMessageVisibleToParticipant(
  sentAt: Date,
  participant: ConversationVisibilityParticipant,
): boolean {
  if (sentAt.getTime() < participant.joinedAt.getTime()) {
    return false;
  }

  return participant.historyClearedAt
    ? sentAt.getTime() > participant.historyClearedAt.getTime()
    : true;
}
