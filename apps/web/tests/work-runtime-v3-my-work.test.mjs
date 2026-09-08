import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimeSource = await readFile(
  new URL("../src/pages/WorkRuntimeV3Page.tsx", import.meta.url),
  "utf8",
);
const myWorkSource = await readFile(
  new URL("../src/pages/MyWorkPage.tsx", import.meta.url),
  "utf8",
);
const workspaceSource = await readFile(
  new URL("../src/pages/WorkStageWorkspacePage.tsx", import.meta.url),
  "utf8",
);

test("P9-D1 routes /my-work to a dedicated My Work page", () => {
  assert.match(runtimeSource, /pathname === "\/my-work"/);
  assert.match(runtimeSource, /<MyWorkPage \/>/);
  assert.match(myWorkSource, /\["MINE", "TEAM"\]/);
  assert.doesNotMatch(myWorkSource, /"ORG_UNIT"/);
});

test("P9-D1 My Work reuses the shared stage action implementation", () => {
  assert.doesNotMatch(myWorkSource, /work-runtime-v3\.service/);
  assert.doesNotMatch(myWorkSource, /availableActions\.includes/);
  assert.match(workspaceSource, /listMyWorkRuntimeV3Stages/);
  assert.match(workspaceSource, /listTeamWorkRuntimeV3Stages/);
  assert.match(workspaceSource, /listOrgUnitWorkRuntimeV3Stages/);
  assert.match(
    workspaceSource,
    /selectedStage\?\.availableActions\.includes\(action\)/,
  );
});

test("P9-D1 keeps canonical create and Work detail navigation in the shared workspace", () => {
  assert.match(workspaceSource, /to="\/work\/create"/);
  assert.match(
    workspaceSource,
    /to=\{`\/work\/\$\{officeId\}\/\$\{selectedStage\.workItemId\}`\}/,
  );
});
