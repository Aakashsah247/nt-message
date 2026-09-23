import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const employee = fs.readFileSync(path.join(root, "src/pages/EmployeeWorkPage.tsx"), "utf8");
const management = fs.readFileSync(path.join(root, "src/pages/ManagementWorkPage.tsx"), "utf8");
const helper = fs.readFileSync(path.join(root, "src/utils/work-completion-fields.ts"), "utf8");

test("Phase B Finish uses the Work-bound version while preserving historical compatibility", () => {
  assert.match(employee, /usesVersionBoundCompletion/);
  assert.match(employee, /fields: dynamicCompletion\.inputs/);
  assert.match(employee, /!usesVersionBoundCompletion && requiresCompletionCustomerId/);
  assert.match(management, /selectedUsesVersionBoundCompletion/);
  assert.match(management, /fields: dynamicCompletion\.inputs/);
  assert.match(management, /!usesVersionBoundCompletion && requiresCustomerId/);
});

test("Completion field selection follows Collect and Both completionMode", () => {
  assert.match(helper, /mode === "COMPLETION_ONLY" \|\| mode === "CREATION_AND_COMPLETION"/);
  assert.match(helper, /completionMode === "EDITABLE"/);
  assert.match(helper, /completionEditMode\(field\) === "READ_ONLY"/);
  assert.match(helper, /buildCompletionFieldDrafts/);
  assert.match(helper, /fieldValuesSnapshot/);
});

test("Creation-only fields never enter the version-bound Finish payload", () => {
  assert.match(helper, /completionFields\(fields\)/);
  assert.doesNotMatch(employee, /fields:\s*\[\s*\{\s*code:\s*"CUSTOMER_ID"/);
  assert.doesNotMatch(management, /fields:\s*\[\s*\{\s*code:\s*"RX_LEVEL_DBM"/);
});
