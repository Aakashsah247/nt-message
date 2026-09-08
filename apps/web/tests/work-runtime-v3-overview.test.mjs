import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const overviewSource = await readFile(
  new URL("../src/pages/WorkOverviewPage.tsx", import.meta.url),
  "utf8",
);
const runtimeSource = await readFile(
  new URL("../src/pages/WorkRuntimeV3Page.tsx", import.meta.url),
  "utf8",
);

test("P9-C Work Overview uses the V3 read contract and canonical Work routes", () => {
  assert.match(overviewSource, /listWorkRuntimeV3/);
  assert.match(overviewSource, /to=\{`\/work\/\$\{work\.officeId\}\/\$\{work\.id\}`\}/);
  assert.match(overviewSource, /to="\/work\/create"/);
  assert.doesNotMatch(overviewSource, /work-management\.service/);
  assert.doesNotMatch(overviewSource, /\/work-runtime-v3\/offices\//);
});

test("P9-C Work Overview keeps Work mutation controls backend-driven", () => {
  assert.match(overviewSource, /work\.availableActions\.length/);
  assert.doesNotMatch(overviewSource, /account\?\.role/);
  assert.doesNotMatch(overviewSource, /role ===/);
});

test("the canonical /work entry renders the dedicated overview while queue routes stay compatible", () => {
  assert.match(runtimeSource, /pathname === "\/work"/);
  assert.match(runtimeSource, /<WorkOverviewPage \/>/);
  assert.match(runtimeSource, /<WorkStageWorkspacePage \/>/);
  assert.match(runtimeSource, /to="\/work\/create"/);
  assert.match(
    runtimeSource,
    /to=\{`\/work\/\$\{officeId\}\/\$\{selectedStage\.workItemId\}`\}/,
  );
});
