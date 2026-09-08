import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const detailSource = await readFile(
  new URL("../src/pages/WorkRuntimeV3DetailPage.tsx", import.meta.url),
  "utf8",
);

test("P9-C Work Detail uses canonical Work navigation and V3 detail contracts", () => {
  assert.match(detailSource, /getWorkRuntimeV3/);
  assert.match(detailSource, /getWorkRuntimeV3Actions/);
  assert.match(
    detailSource,
    /fromOversight \? "\/work-oversight" : "\/work"/,
  );
  assert.doesNotMatch(detailSource, /to="\/work-runtime-v3"/);
  assert.doesNotMatch(detailSource, /work-management\.service/);
});

test("P9-C Work Detail renders work-level mutations only from backend availableActions", () => {
  assert.match(detailSource, /availableActions\.includes\("COMPLETE"\)/);
  assert.match(detailSource, /availableActions\.includes\("CANCEL"\)/);
  assert.match(detailSource, /availableActions\.includes\("REOPEN"\)/);
  assert.doesNotMatch(detailSource, /account\?\.role/);
  assert.doesNotMatch(detailSource, /role ===/);
});

test("P9-C Work Detail uses bilingual workspace copy and removes developer-facing runtime wording", () => {
  assert.match(detailSource, /useTranslation\("workspace"\)/);
  assert.match(detailSource, /work\.detail\.title/);
  assert.match(detailSource, /work\.detail\.workflowStages/);
  assert.doesNotMatch(detailSource, />Work Runtime V3</);
});
