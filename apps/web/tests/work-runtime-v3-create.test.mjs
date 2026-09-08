import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const createSource = await readFile(
  new URL("../src/pages/WorkRuntimeV3CreatePage.tsx", import.meta.url),
  "utf8",
);

test("P9-C Create Work uses the V3 create contract and canonical Work routes", () => {
  assert.match(createSource, /getWorkRuntimeV3CreateContext/);
  assert.match(createSource, /createWorkRuntimeV3/);
  assert.match(createSource, /navigate\(`\/work\/\$\{officeId\}\/\$\{created\.id\}`\)/);
  assert.match(createSource, /to="\/work"/);
  assert.doesNotMatch(createSource, /\/work-runtime-v3\/offices\//);
  assert.doesNotMatch(createSource, /work-management\.service/);
});

test("P9-C Create Work uses bilingual workspace copy and removes developer-facing runtime wording", () => {
  assert.match(createSource, /useTranslation\("workspace"\)/);
  assert.match(createSource, /work\.create\.title/);
  assert.match(createSource, /work\.create\.submit/);
  assert.doesNotMatch(createSource, />Work Runtime V3</);
});

test("P9-C Create Work keeps Super Admin mutation controls absent", () => {
  assert.match(createSource, /isSuperAdmin/);
  assert.match(createSource, /Read-only operational access|work\.create\.readOnlyTitle/);
  assert.match(createSource, /if \(!accessToken \|\| !officeId \|\| !selectedWorkType \|\| isSuperAdmin\) return;/);
});
