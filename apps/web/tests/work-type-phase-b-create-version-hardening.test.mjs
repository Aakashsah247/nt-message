import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const createPage = fs.readFileSync(path.join(root, "src/pages/WorkCreatePage.tsx"), "utf8");
const managementPage = fs.readFileSync(path.join(root, "src/pages/ManagementWorkPage.tsx"), "utf8");
const service = fs.readFileSync(path.join(root, "src/services/work-main-parity.service.ts"), "utf8");
const types = fs.readFileSync(path.join(root, "src/types/work-main-parity.ts"), "utf8");

test("Create Work submits the exact published version selected when the form was opened", () => {
  assert.match(createPage, /workTypeVersionId: selectedWorkType\.workTypeVersionId/);
  assert.match(createPage, /Published version \{selectedWorkType\.version\}/);
});

test("Work Management captures and submits the exact version instead of resolving by type at submit", () => {
  assert.match(types, /workTypeVersionId: string;/);
  assert.match(managementPage, /workTypeVersionId: selectedCreateWorkType\.workTypeVersionId/);
  assert.match(service, /item\.workTypeVersionId === payload\.workTypeVersionId/);
  assert.match(service, /workTypeVersionId: payload\.workTypeVersionId/);
});

test("stale management forms stop instead of silently switching to a newer version", () => {
  assert.match(service, /This Work Type changed after this form was opened/);
  assert.doesNotMatch(service, /find\(\(item: any\) => item\.code === currentCode\);/);
});
