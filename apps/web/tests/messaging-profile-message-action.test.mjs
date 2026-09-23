import { readMessageAppRuntimeSourceSync } from "./message-app-runtime-source.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = readMessageAppRuntimeSourceSync();

test("profile Message closes the full details rail for the already-selected private conversation", () => {
  const handler = page.match(
    /async function handleStartProfileConversation\(\): Promise<void> \{[\s\S]*?\n  \}\n\n  async function handleCreateConversation/,
  )?.[0];

  assert.ok(handler, "expected profile conversation handler");
  assert.match(handler, /selectedConversation\?\.type === "PRIVATE"/);
  assert.match(
    handler,
    /selectedPrivatePeer\?\.accountId === profileData\.accountId/,
  );
  assert.match(handler, /closeConversationDetailsPanel\(\);/);
  assert.match(
    handler,
    /requestAnimationFrame\(\(\) => composerRef\.current\?\.focus\(\)\)/,
  );
  assert.match(
    handler,
    /await loadConversations\(true, response\.data\.id\);[\s\S]{0,180}closeConversationDetailsPanel\(\);/,
  );
});

test("closing conversation details clears the grid-expansion state instead of leaving a blank third column", () => {
  const closer = page.match(
    /function closeConversationDetailsPanel\(\): void \{[\s\S]*?\n  \}/,
  )?.[0];

  assert.ok(closer, "expected full conversation details closer");
  assert.match(closer, /setDetailsPanelOpen\(false\)/);
  assert.match(closer, /setActiveUtilityPanel\(null\)/);
});
