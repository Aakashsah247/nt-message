import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../src/${path}`, import.meta.url), "utf8");
}

async function apiSource(path) {
  return readFile(new URL(`../../api/src/work-management/${path}`, import.meta.url), "utf8");
}

test("Work Type builder exposes only fixed-template configuration", async () => {
  const [page, app] = await Promise.all([
    source("pages/WorkTypeManagementPage.tsx"),
    source("App.tsx"),
  ]);
  assert.match(app, /<WorkTypeManagementPage \/>/);
  assert.match(page, /Work details/);
  assert.match(page, /Fixed by template/);
  assert.doesNotMatch(page, /function addStage/);
  assert.doesNotMatch(page, /function addDependency/);
  assert.doesNotMatch(page, /activationExpectedValue/);
});

test("Work Type builder supports exactly three fixed templates", async () => {
  const [page, helper] = await Promise.all([
    source("pages/WorkTypeManagementPage.tsx"),
    apiSource("fixed-work-type-template.ts"),
  ]);
  for (const template of ["STANDARD", "TEAM_SALES", "ADMINISTRATIVE"]) {
    assert.match(page, new RegExp(`value: "${template}"`));
    assert.match(helper, new RegExp(`${template}`));
  }
  assert.doesNotMatch(page, /value: "CUSTOM"/);
  assert.match(helper, /assertWorkTypeTemplate/);
});

test("Information fields support quick add, editable controls, Other and protected Contact Details", async () => {
  const page = await source("pages/WorkTypeManagementPage.tsx");
  assert.match(page, /QUICK_FIELDS/);
  assert.match(page, /customFieldCode/);
  assert.match(page, /CUSTOM_/);
  assert.match(page, /allowOther/);
  assert.match(page, /otherLabel/);
  assert.match(page, /One option per line/);
  assert.match(page, /CREATION_ONLY/);
  assert.match(page, /COMPLETION_ONLY/);
  assert.match(page, /CREATION_AND_COMPLETION/);
  assert.match(page, /CONTACT_FIELD_CODES/);
  assert.match(page, /disabled=\{contactField\}/);
  assert.doesNotMatch(page, /STAGE_ONLY/);
});

test("Primary Owner is multi-Division create authority and registered date remains optional", async () => {
  const page = await source("pages/WorkTypeManagementPage.tsx");
  assert.match(page, /primaryOwnerOrgUnitIds/);
  assert.match(page, /orgUnitType\.code === "DIVISION"/);
  assert.match(page, /includeDescendants: true/);
  assert.match(page, /only the Office Head may create this Work Type/);
  assert.match(page, /registeredAtEnabled/);
  assert.match(page, /REGISTERED_AT/);
});

test("Team + Sales and Administrative templates keep fixed assignment semantics", async () => {
  const [page, helper] = await Promise.all([
    source("pages/WorkTypeManagementPage.tsx"),
    apiSource("fixed-work-type-template.ts"),
  ]);
  assert.match(page, /Main Team \+ required Sales Member/);
  assert.match(page, /Team or Individual/);
  assert.match(helper, /allowsIndividualAssignment: true/);
  assert.match(helper, /requiresSalesMember: true/);
  assert.match(helper, /teamRequired: true/);
});

test("Information editor preserves field validation config and exposes Both finish behavior", async () => {
  const page = await source("pages/WorkTypeManagementPage.tsx");
  assert.match(page, /preservedConfig/);
  assert.match(page, /completionMode/);
  assert.match(page, /Show saved value/);
  assert.match(page, /Allow update/);
  assert.match(page, /keepNumber\("min"\)/);
  assert.match(page, /keepNumber\("max"\)/);
  assert.match(page, /keepNumber\("maxLength"\)/);
});
