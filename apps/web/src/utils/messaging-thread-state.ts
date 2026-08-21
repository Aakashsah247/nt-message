import type { MessagingMessage } from "../types/messaging";

export const MESSAGE_THREAD_NEAR_BOTTOM_PX = 160;

export function isMessageThreadNearBottom(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  threshold = MESSAGE_THREAD_NEAR_BOTTOM_PX,
): boolean {
  return scrollHeight - scrollTop - clientHeight < threshold;
}

export function restorePrependedMessageScrollTop(
  previousScrollTop: number,
  previousScrollHeight: number,
  nextScrollHeight: number,
): number {
  const prependedHeight = Math.max(0, nextScrollHeight - previousScrollHeight);
  return previousScrollTop + prependedHeight;
}

export function restoreAnchoredMessageScrollTop(
  previousScrollTop: number,
  previousAnchorOffset: number,
  nextAnchorOffset: number,
): number {
  return Math.max(0, previousScrollTop + nextAnchorOffset - previousAnchorOffset);
}

function compareMessagesByTimeline(
  first: MessagingMessage,
  second: MessagingMessage,
): number {
  const sentAtDifference =
    new Date(first.sentAt).getTime() - new Date(second.sentAt).getTime();

  if (sentAtDifference !== 0) {
    return sentAtDifference;
  }

  return first.id.localeCompare(second.id);
}

/**
 * Silent refreshes revalidate only the latest server page. Merge that page
 * into already-loaded history instead of replacing older pages the user is
 * currently reading.
 */
export function mergeLatestMessagingPage(
  current: MessagingMessage[],
  latest: MessagingMessage[],
): MessagingMessage[] {
  if (current.length === 0) {
    return [...latest].sort(compareMessagesByTimeline);
  }

  const byId = new Map(current.map((message) => [message.id, message]));

  for (const message of latest) {
    byId.set(message.id, message);
  }

  return [...byId.values()].sort(compareMessagesByTimeline);
}
