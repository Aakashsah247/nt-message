import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const employee = fs.readFileSync(path.join(root, "src/pages/EmployeeWorkPage.tsx"), "utf8");
const management = fs.readFileSync(path.join(root, "src/pages/ManagementWorkPage.tsx"), "utf8");
const detail = fs.readFileSync(path.join(root, "src/pages/WorkDetailPage.tsx"), "utf8");
const fields = fs.readFileSync(path.join(root, "src/utils/work-completion-fields.ts"), "utf8");

test("version-bound Work information renders from bound field definitions instead of fixed telecom columns", () => {
  assert.match(fields, /export function workInformationDisplayRows/);
  assert.match(fields, /completionCollectionMode\(field\) !== "STAGE_ONLY"/);
  assert.match(employee, /selectedInformationRows = workInformationDisplayRows/);
  assert.match(employee, /selectedInformationRows\.map\(\(row\)/);
  assert.match(management, /selectedInformationRows = workInformationDisplayRows/);
  assert.match(management, /selectedInformationRows\.map\(\(row\)/);
});

test("historical compatibility remains available when a Work has no version-bound Information", () => {
  assert.match(employee, /selectedInformationRows\.length > 0 \?/);
  assert.match(employee, /selectedItem\.customerName \?\? "Not recorded"/);
  assert.match(management, /selectedInformationRows\.length > 0 \?/);
  assert.match(management, /selectedWork\.customerName \?\? "Legacy record"/);
});

test("dedicated Work Detail already renders stored values by their bound field labels", () => {
  assert.match(detail, /work\.fieldValues\.map\(\(field\)/);
  assert.match(detail, /field\.fieldDefinition\.label/);
  assert.match(detail, /renderValue\(field\.value\)/);
});
