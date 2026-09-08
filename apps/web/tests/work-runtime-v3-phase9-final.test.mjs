import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
}

test("P9-F Work execution keeps accessible selected states and live feedback", async () => {
  const [create, detail, workspace] = await Promise.all([
    source("pages/WorkRuntimeV3CreatePage.tsx"),
    source("pages/WorkRuntimeV3DetailPage.tsx"),
    source("pages/WorkStageWorkspacePage.tsx"),
  ]);

  assert.match(create, /role="alert"/);
  assert.match(detail, /role="alert"/);
  assert.match(detail, /role="status" aria-live="polite"/);
  assert.match(workspace, /role="alert"/);
  assert.match(workspace, /role="status" aria-live="polite"/);
  assert.match(workspace, /aria-pressed=\{queueMode === option\.value\}/);
  assert.match(workspace, /aria-pressed=\{selectedStageId === stage\.id\}/);
});

test("P9-F keeps the field-worker execution surface simple", async () => {
  const workspace = await source("pages/WorkStageWorkspacePage.tsx");

  assert.doesNotMatch(workspace, /work\.stageWorkspace\.assignmentMode/);
  assert.doesNotMatch(workspace, /work\.stageWorkspace\.stageVersion/);
  assert.doesNotMatch(workspace, /work\.stageWorkspace\.approval"/);
  assert.match(workspace, /\{formatStatus\(field\.code\)\}/);
  assert.match(workspace, /selectedStage\?\.availableActions\.includes\(action\)/);
  assert.doesNotMatch(workspace, /text-\[11px\]/);
});

test("P9-F retains responsive, canonical Phase 9 Work navigation", async () => {
  const [create, detail, workspace] = await Promise.all([
    source("pages/WorkRuntimeV3CreatePage.tsx"),
    source("pages/WorkRuntimeV3DetailPage.tsx"),
    source("pages/WorkStageWorkspacePage.tsx"),
  ]);

  for (const page of [create, detail, workspace]) {
    assert.match(page, /mx-auto w-full/);
    assert.match(page, /sm:/);
  }
  assert.match(create, /to="\/work"/);
  assert.match(detail, /fromOversight \? "\/work-oversight" : "\/work"/);
  assert.match(workspace, /to="\/work\/create"/);
  assert.match(workspace, /`\/work\/\$\{officeId\}\/\$\{selectedStage\.workItemId\}`/);
  assert.doesNotMatch(workspace, /\/work-runtime-v3\//);
});
