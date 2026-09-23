import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../src/pages/WorkTypeManagementPage.tsx", import.meta.url);

test("Work Type saves metadata and the fixed-template Information configuration together", async () => {
  const source = await readFile(pageUrl, "utf8");
  const saveStart = source.indexOf("async function saveDraft");
  const publishStart = source.indexOf("async function publishDraft", saveStart);
  assert.ok(saveStart >= 0 && publishStart > saveStart);
  const save = source.slice(saveStart, publishStart);
  assert.match(save, /updateWorkTypeDraft/);
  assert.match(save, /replaceWorkTypeDraftConfiguration/);
  assert.match(save, /configurationPayload\(draft, editor, informationOnlySystemDraft\)/);
  assert.match(save, /refresh\(/);
});

test("catalog-changing Work Type actions continue to refresh server state", async () => {
  const source = await readFile(pageUrl, "utf8");
  assert.match(source, /publishWorkTypeDraft/);
  assert.match(source, /discardWorkTypeDraft/);
  assert.match(source, /restoreWorkTypeDefinition/);
  assert.match(source, /removeWorkTypeDefinition/);
  assert.match(source, /setRefreshKey/);
});
