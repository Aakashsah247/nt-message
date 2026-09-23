import { readMessageAppRuntimeSourceSync } from "./message-app-runtime-source.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = readMessageAppRuntimeSourceSync();
const css = fs.readFileSync(
  new URL("../src/styles/messaging-workspace.css", import.meta.url),
  "utf8",
);

test("Conversations header uses the restored neutral surface", () => {
  assert.match(page, /message-sidebar--conversation-home/);
  assert.doesNotMatch(page, /message-sidebar-controls/);
  assert.match(
    css,
    /\.message-sidebar\.message-sidebar--conversation-home \{[\s\S]*background: #ffffff/,
  );
  assert.doesNotMatch(
    css,
    /\.message-sidebar\.message-sidebar--conversation-home::before/,
  );
  assert.doesNotMatch(
    css,
    /linear-gradient\(145deg, #f6c447 0%, #f0b72d 58%, #e9aa1f 100%\)/,
  );
});

test("Conversations neutral surface keeps scoped blue-white controls", () => {
  assert.match(
    css,
    /\.message-app-shell \.message-new-button,[\s\S]*background: var\(--color-nt-gold\)/,
  );
  assert.match(
    css,
    /\.message-sidebar--conversation-home \.message-new-button,[\s\S]*background: #ffffff/,
  );
  assert.match(
    css,
    /\.message-app-shell \.message-conversation-filter-strip > button\.active[\s\S]*background: var\(--color-nt-gold\)/,
  );
  assert.match(
    css,
    /\.message-sidebar--conversation-home \.message-conversation-filter-strip > button\.active[\s\S]*background: #ffffff/,
  );
});
