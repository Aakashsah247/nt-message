import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
}

const [app, workItems, parityService, controller] = await Promise.all([
  source("App.tsx"),
  readFile(new URL("../../api/src/work-management/work-items.service.ts", import.meta.url), "utf8"),
  source("services/work-main-parity.service.ts"),
  readFile(new URL("../../api/src/work-management/work-type-v3.controller.ts", import.meta.url), "utf8"),
]);

test("published Work Type Information is authoritative for active Work creation", () => {
  assert.match(app, /<WorkTypeManagementPage \/>/);
  assert.match(controller, /permanentlyDeleteDefinition/);
  assert.doesNotMatch(workItems, /fixedRuntimeWorkType/);
  assert.doesNotMatch(
    workItems,
    /Only the finalized eight classic Work Types are available in this compatibility runtime/,
  );
  assert.match(workItems, /status: WorkTypeVersionStatus\.PUBLISHED/);
  assert.match(workItems, /isWorkFieldCollectedAtCreation/);
  assert.match(workItems, /version\.fields\.filter/);
  assert.doesNotMatch(workItems, /fixedRuntimeFields/);
  assert.doesNotMatch(workItems, /reconcileFixedRuntimeFields/);
});

test("main-parity create still maps the finalized eight classic types to the V3 identity records", () => {
  for (const value of [
    "ROUTINE_TASK",
    "TROUBLE_TICKET",
    "MAINTENANCE",
    "NEW_CONNECTION",
    "UPDATE_SERVICES",
    "INSPECTION",
    "EMERGENCY_WORK",
    "ADMINISTRATIVE_TASK",
  ]) {
    assert.match(parityService, new RegExp(value));
  }
  assert.match(parityService, /MAIN_TO_CURRENT_TYPE/);
  assert.match(parityService, /modernCreateContext/);
});
