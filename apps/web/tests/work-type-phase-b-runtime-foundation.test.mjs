import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const mainService = fs.readFileSync(path.join(root, "src/services/work-main-parity.service.ts"), "utf8");
const managementService = fs.readFileSync(path.join(root, "src/services/work-management.service.ts"), "utf8");
const mainTypes = fs.readFileSync(path.join(root, "src/types/work-main-parity.ts"), "utf8");
const managementTypes = fs.readFileSync(path.join(root, "src/types/work-management.ts"), "utf8");

test("Phase B carries dynamic completion fields without removing legacy compatibility", () => {
  assert.match(mainService, /fields\?: Array<\{ code: string; value: unknown \}>/);
  assert.match(mainService, /formData\.set\("fields", JSON\.stringify\(payload\.fields\)\)/);
  assert.match(managementService, /fields\?: Array<\{ code: string; value: unknown \}>/);
  assert.match(mainService, /customerId\?: string/);
  assert.match(mainService, /rxLevelDbm\?: number/);
});

test("Phase B exposes version-bound definitions, values, and report snapshots", () => {
  assert.match(mainTypes, /WorkDynamicFieldDefinition/);
  assert.match(mainTypes, /fieldValuesSnapshot: Array<\{ code: string; value: unknown \}> \| null/);
  assert.match(mainTypes, /workTypeVersion\?: \{ id: string; version: number; name: string/);
  assert.match(mainTypes, /fieldValues\?: WorkDynamicFieldValue\[\]/);
  assert.match(managementTypes, /fields\?: Array<WorkCreateFieldDefinition/);
  assert.match(managementTypes, /fieldValuesSnapshot: Array<\{ code: string; value: unknown \}> \| null/);
  assert.match(mainService, /fieldValuesSnapshot: Array\.isArray\(report\.fieldValuesSnapshot\)/);
});
