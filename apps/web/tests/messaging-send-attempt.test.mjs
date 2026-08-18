import assert from "node:assert/strict";
import test from "node:test";

import { resolveMessagingSendAttempt } from "../src/utils/messaging-send-attempt.ts";

test("reuses the client message ID for the same logical retry", () => {
  let generated = 0;
  const createId = () => `message-${++generated}`;

  const first = resolveMessagingSendAttempt(null, "conversation-a:text:hello", createId);
  const retry = resolveMessagingSendAttempt(first, "conversation-a:text:hello", createId);

  assert.strictEqual(retry, first);
  assert.equal(retry.clientMessageId, "message-1");
  assert.equal(generated, 1);
});

test("creates a new client message ID when the logical send changes", () => {
  let generated = 0;
  const createId = () => `message-${++generated}`;

  const first = resolveMessagingSendAttempt(null, "conversation-a:text:hello", createId);
  const changedText = resolveMessagingSendAttempt(
    first,
    "conversation-a:text:hello-again",
    createId,
  );
  const changedConversation = resolveMessagingSendAttempt(
    changedText,
    "conversation-b:text:hello-again",
    createId,
  );

  assert.equal(first.clientMessageId, "message-1");
  assert.equal(changedText.clientMessageId, "message-2");
  assert.equal(changedConversation.clientMessageId, "message-3");
  assert.equal(generated, 3);
});
