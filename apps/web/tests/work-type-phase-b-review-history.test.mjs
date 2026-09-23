import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const employee = fs.readFileSync(path.join(root, "src/pages/EmployeeWorkPage.tsx"), "utf8");
const management = fs.readFileSync(path.join(root, "src/pages/ManagementWorkPage.tsx"), "utf8");
const fields = fs.readFileSync(path.join(root, "src/utils/work-completion-fields.ts"), "utf8");

test("review renders the submitted snapshot using the Work-bound field definitions", () => {
  assert.match(fields, /completionReportDisplayRows/);
  assert.match(fields, /completionFields\(fields\)\.map/);
  assert.match(fields, /submitted\.has\(field\.code\)/);
  assert.match(management, /selectedCompletionReportRows/);
  assert.match(management, /row\.label/);
  assert.match(management, /row\.formatted/);
});

test("employee completion history shows version-bound submitted Information", () => {
  assert.match(employee, /completionReportDisplayRows/);
  assert.match(employee, /report\.fieldValuesSnapshot/);
  assert.match(employee, /aria-label="Submitted completion details"/);
});

test("historical reports keep the legacy review fallback instead of changing lifecycle behavior", () => {
  assert.match(management, /selectedCompletionReportRows\.length > 0 \|\| selectedCompletionUsesOperationalPackage/);
  assert.match(management, /latestReport\.customerId/);
  assert.match(management, /latestReport\.rxLevelDbm/);
  assert.match(management, /requestManagementWorkInformation/);
  assert.match(management, /closeManagementWorkItem/);
});
