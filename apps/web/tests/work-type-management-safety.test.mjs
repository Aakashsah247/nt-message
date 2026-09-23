import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [service, controller, hierarchy, capabilities, page, workItems, lifecycle, scope] = await Promise.all([
  readFile(new URL("../../api/src/work-management/work-type-v3.service.ts", import.meta.url), "utf8"),
  readFile(new URL("../../api/src/work-management/work-type-v3.controller.ts", import.meta.url), "utf8"),
  readFile(new URL("../../api/src/organization/organization-hierarchy.service.ts", import.meta.url), "utf8"),
  readFile(new URL("../../api/src/organization/organization-capabilities.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/WorkTypeManagementPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../api/src/work-management/work-items.service.ts", import.meta.url), "utf8"),
  readFile(new URL("../../api/src/work-management/work-lifecycle.service.ts", import.meta.url), "utf8"),
  readFile(new URL("../../api/src/work-management/work-scope.service.ts", import.meta.url), "utf8"),
]);

test("Work Type management supports scoped draft delegation without sharing publish authority", () => {
  assert.match(capabilities, /WORK_TYPE_MANAGEMENT[\s\S]*WORK_TYPE_VIEW[\s\S]*WORK_TYPE_DRAFT/);
  assert.doesNotMatch(capabilities, /WORK_TYPE_MANAGEMENT[\s\S]{0,220}WORK_TYPE_PUBLISH/);
  assert.match(service, /Work Type Management access is required to create a Work Type/);
  assert.match(service, /Delegated Work Type Management may change only Information fields on the eight permanent Work Types/);
  assert.match(service, /catalog activation and deactivation remain Head-controlled/);
  assert.match(service, /permanent catalog deletion remains Head-controlled/);
  assert.match(hierarchy, /hasDelegatedWorkTypeManagement/);
});

test("delegated editors can change permanent Work Type Information without receiving structural or publish controls", () => {
  assert.match(page, /informationOnlySystemDraft/);
  assert.match(page, /configurationPayload\(draft, editor, informationOnlySystemDraft\)/);
  assert.match(page, /Shared Work Type Management can edit Information fields for this permanent Work Type/);
  assert.match(page, /actions\.publish \? <button[\s\S]*Publish Work Type/);
  assert.match(page, /selectedDefinition\.isActive && actions\.publish/);
  assert.match(page, /Head-controlled/);
});

test("custom permanent deletion preserves historical versions while protecting the eight system types", () => {
  assert.match(controller, /permanentlyDeleteDefinition/);
  assert.match(service, /The eight system Work Types cannot be permanently deleted/);
  assert.match(service, /status: WorkTypeVersionStatus\.RETIRED/);
  assert.match(service, /Historical Work and retired versions are preserved/);
  assert.doesNotMatch(service, /workTypeDefinition\.delete\(/);
});

test("Primary Owner is creation authority only and descendant access is mandatory", () => {
  assert.match(service, /Primary Owner Divisions must use the specific OrgUnit creation scope/);
  assert.match(service, /include their descendant OrgUnits for Work creation access/);
  assert.match(service, /without Primary Owner Divisions must remain creatable by the Office Head/);
});

test("published Work Type Information drives the active classic lifecycle without changing review authority", () => {
  assert.match(workItems, /isWorkFieldCollectedAtCreation/);
  assert.doesNotMatch(workItems, /CLASSIC_RUNTIME_INTAKE_FIELD_CODES/);
  assert.doesNotMatch(workItems, /reconcileFixedRuntimeFields/);
  assert.match(workItems, /version\.fields\.filter/);
  assert.match(lifecycle, /Responsible Reviewer|responsibleReviewerAccountId/);
  assert.match(scope, /resolveResponsibleManager|resolveResponsibleReviewer|responsible/);
});
