import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspaceSource = await readFile(
  new URL("../src/pages/WorkStageWorkspacePage.tsx", import.meta.url),
  "utf8",
);
const myWorkSource = await readFile(
  new URL("../src/pages/MyWorkPage.tsx", import.meta.url),
  "utf8",
);
const incomingSource = await readFile(
  new URL("../src/pages/IncomingWorkPage.tsx", import.meta.url),
  "utf8",
);

test("P9-D3 stage execution uses bilingual workspace copy", () => {
  assert.match(workspaceSource, /useTranslation\("workspace"\)/);
  assert.match(workspaceSource, /work\.stageWorkspace\.availableActions/);
  assert.match(workspaceSource, /work\.stageWorkspace\.queues\.mine\.label/);
  assert.doesNotMatch(workspaceSource, />Work Runtime V3</);
  assert.doesNotMatch(workspaceSource, />Stage execution workspace</);
});

test("P9-D3 keeps My Work and Incoming Work page-specific shells without duplicating actions", () => {
  assert.match(myWorkSource, /pageKind="MY_WORK"/);
  assert.match(incomingSource, /pageKind="INCOMING_WORK"/);
  assert.doesNotMatch(myWorkSource, /work-runtime-v3\.service/);
  assert.doesNotMatch(incomingSource, /work-runtime-v3\.service/);
});

test("P9-D3 keeps stage actions backend-driven", () => {
  assert.match(
    workspaceSource,
    /selectedStage\?\.availableActions\.includes\(action\)/,
  );
  assert.match(workspaceSource, /hasAction\("ASSIGN"\)/);
  assert.match(workspaceSource, /hasAction\("SUBMIT"\)/);
  assert.match(workspaceSource, /hasAction\("APPROVE"\)/);
  assert.match(workspaceSource, /hasAction\("RETURN"\)/);
});
