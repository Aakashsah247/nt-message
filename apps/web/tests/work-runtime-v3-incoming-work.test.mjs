import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimeSource = await readFile(
  new URL("../src/pages/WorkRuntimeV3Page.tsx", import.meta.url),
  "utf8",
);
const incomingSource = await readFile(
  new URL("../src/pages/IncomingWorkPage.tsx", import.meta.url),
  "utf8",
);
const workspaceSource = await readFile(
  new URL("../src/pages/WorkStageWorkspacePage.tsx", import.meta.url),
  "utf8",
);

test("P9-D2 routes /incoming-work to a dedicated Incoming Work page", () => {
  assert.match(runtimeSource, /pathname === "\/incoming-work"/);
  assert.match(runtimeSource, /<IncomingWorkPage \/>/);
  assert.match(incomingSource, /\["ORG_UNIT"\]/);
  assert.doesNotMatch(incomingSource, /"MINE"/);
  assert.doesNotMatch(incomingSource, /"TEAM"/);
});

test("P9-D2 Incoming Work reuses the shared OrgUnit queue and action implementation", () => {
  assert.doesNotMatch(incomingSource, /work-runtime-v3\.service/);
  assert.doesNotMatch(incomingSource, /availableActions\.includes/);
  assert.match(workspaceSource, /listOrgUnitWorkRuntimeV3Stages/);
  assert.match(
    workspaceSource,
    /selectedStage\?\.availableActions\.includes\(action\)/,
  );
});

test("P9-D2 keeps canonical Work detail navigation in the shared workspace", () => {
  assert.match(
    workspaceSource,
    /to=\{`\/work\/\$\{officeId\}\/\$\{selectedStage\.workItemId\}`\}/,
  );
});
