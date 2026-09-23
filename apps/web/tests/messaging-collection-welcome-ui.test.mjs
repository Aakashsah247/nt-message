import { readMessageAppRuntimeSourceSync } from "./message-app-runtime-source.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const cssUrl = new URL(
  "../src/styles/messaging-workspace.css",
  import.meta.url,
);

test("collection landing pages reuse the professional Messages welcome canvas", async () => {
  const page = await readMessageAppRuntimeSourceSync();

  assert.equal(
    (
      page.match(
        /message-welcome-state message-collection-welcome-state--workspace/g,
      ) ?? []
    ).length,
    3,
  );
  assert.equal(
    (page.match(/message-welcome-brand message-collection-welcome-icon/g) ?? [])
      .length,
    3,
  );
  assert.match(page, /navigation\.archivedConversations/);
});

test("message request metrics keep counts and labels visually separated", async () => {
  const page = await readMessageAppRuntimeSourceSync();
  const css = await readFile(cssUrl, "utf8");

  assert.match(
    page,
    /<strong>\{messageRequests\.counts\.receivedPending\}<\/strong>\s*<span>\{t\("requestWorkspace\.received"\)\}<\/span>/,
  );
  assert.match(
    page,
    /<strong>\{messageRequests\.counts\.sentPending\}<\/strong>\s*<span>\{t\("requestWorkspace\.sent"\)\}<\/span>/,
  );
  assert.match(
    css,
    /\.message-collection-welcome-metrics\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
  );
});

test("collection landing treatment remains responsive and dark-theme aware", async () => {
  const css = await readFile(cssUrl, "utf8");

  assert.match(
    css,
    /theme-dark \.message-collection-welcome-metrics>span\s*\{[\s\S]*?background:\s*#182f3f;/,
  );
  assert.match(
    css,
    /@media \(max-width: 600px\)[\s\S]*?\.message-collection-welcome-metrics\s*\{[\s\S]*?grid-template-columns:\s*1fr;/,
  );
});
