import assert from "node:assert/strict";
import test from "node:test";

import {
  isMessageThreadNearBottom,
  mergeLatestMessagingPage,
  restoreAnchoredMessageScrollTop,
  restorePrependedMessageScrollTop,
} from "../src/utils/messaging-thread-state.ts";

function message(id, sentAt, textContent) {
  return {
    id,
    sentAt,
    textContent,
  };
}

test("detects whether the reader is close enough to the latest message", () => {
  assert.equal(isMessageThreadNearBottom(2000, 1400, 500), true);
  assert.equal(isMessageThreadNearBottom(2000, 1000, 500), false);
});

test("preserves the visible position when older messages are prepended", () => {
  assert.equal(restorePrependedMessageScrollTop(120, 1600, 2200), 720);
  assert.equal(restorePrependedMessageScrollTop(120, 1600, 1500), 120);
});

test("preserves the same visible message when its layout changes", () => {
  assert.equal(restoreAnchoredMessageScrollTop(900, 120, 152), 932);
  assert.equal(restoreAnchoredMessageScrollTop(28, 90, 40), 0);
});

test("silent latest-page refresh keeps older loaded history and updates duplicates", () => {
  const current = [
    message("old", "2026-08-16T08:00:00.000Z", "old"),
    message("same", "2026-08-16T09:00:00.000Z", "before"),
  ];
  const latest = [
    message("same", "2026-08-16T09:00:00.000Z", "after"),
    message("new", "2026-08-16T10:00:00.000Z", "new"),
  ];

  const merged = mergeLatestMessagingPage(current, latest);

  assert.deepEqual(
    merged.map((item) => item.id),
    ["old", "same", "new"],
  );
  assert.equal(merged.find((item) => item.id === "same")?.textContent, "after");
});
