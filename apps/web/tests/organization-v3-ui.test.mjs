import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentUrl = new URL(
  "../src/components/AdminOrganizationPanel.tsx",
  import.meta.url,
);
const treeUrl = new URL(
  "../src/components/organization/OrganizationTree.tsx",
  import.meta.url,
);
const serviceUrl = new URL(
  "../src/services/organization-v3.service.ts",
  import.meta.url,
);
const cssUrl = new URL(
  "../src/styles/organization-workspace.css",
  import.meta.url,
);

test("P4-D1B uses recursive OrgUnit APIs and server-provided actions", async () => {
  const [component, tree, service] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(treeUrl, "utf8"),
    readFile(serviceUrl, "utf8"),
  ]);

  assert.match(tree, /export function OrganizationTree\(/);
  assert.match(tree, /<OrganizationTree/);
  assert.match(component, /getOrganizationActions/);
  assert.match(component, /selectedActions\.createChildUnit/);
  assert.match(component, /selectedActions\.renameUnit/);
  assert.match(component, /selectedActions\.moveUnit/);
  assert.match(component, /selectedActions\.changeUnitStatus/);
  assert.match(component, /selectedActions\.deactivationBlockers/);
  assert.match(component, /selectedActions\.deleteUnit/);
  assert.match(component, /selectedActions\.deleteBlockers/);
  assert.match(component, /getOrganizationPeople/);
  assert.match(tree, /organization-hierarchy-item/);

  for (const endpoint of [
    "/organization/offices",
    "/tree",
    "/actions",
    "/move",
    "/status",
  ]) {
    assert.equal(
      service.includes(endpoint),
      true,
      `V3 organization service must use ${endpoint}`,
    );
  }

  assert.match(service, /method: "DELETE"/);
});

test("P4-D1B removes legacy fixed hierarchy and overlay organization UI", async () => {
  const [component, css] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);

  for (const legacyToken of [
    "getAdminDivisions",
    "getAdminDepartments",
    "createAdminDivision",
    "createAdminDepartment",
    "deleteAdminDivision",
    "deleteAdminDepartment",
    "organization-dialog",
    "organization-drawer",
    "backdrop-filter",
  ]) {
    assert.equal(
      component.includes(legacyToken) || css.includes(legacyToken),
      false,
      `legacy organization token remains: ${legacyToken}`,
    );
  }
});

test("Create and manage unit actions use focused organization routes", async () => {
  const [component, app] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(app, /path="\/organization\/\*"/);
  assert.match(component, /onClick=\{\(\) => openCreate\(null\)\}/);
  assert.match(component, /"\/organization\/new"/);
  assert.match(component, /`\/organization\/units\/\$\{unitId\}`/);
  assert.match(component, /organization-unit-manager--route/);
  assert.match(component, /selectedUnit && !editorMode/);
  assert.match(component, /editorMode === "STATUS" && selectedUnit/);
  assert.match(component, /editorMode === "DELETE" && selectedUnit/);
  assert.doesNotMatch(component, /editorRef/);
});


test("Organization creation exposes only the finalized formal hierarchy types", async () => {
  const component = await readFile(componentUrl, "utf8");

  for (const code of ["DIVISION", "DEPARTMENT", "SECTION", "UNIT"]) {
    assert.match(component, new RegExp(`\\"${code}\\"`));
  }

  assert.match(component, /FORMAL_ORG_UNIT_TYPE_CODES\.has\(type\.code\)/);
  assert.doesNotMatch(component, /FORMAL_ORG_UNIT_TYPE_CODES[\s\S]{0,180}\"ORGANIZATION\"/);
  assert.doesNotMatch(component, /FORMAL_ORG_UNIT_TYPE_CODES[\s\S]{0,180}\"AREA\"/);
});


test("deactivation distinguishes empty units from units with active V3 blockers", async () => {
  const [component, en, ne] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(new URL("../src/i18n/locales/en/organization.json", import.meta.url), "utf8"),
    readFile(new URL("../src/i18n/locales/ne/organization.json", import.meta.url), "utf8"),
  ]);

  assert.match(component, /selectedCanDeactivate/);
  assert.match(component, /activeMemberships/);
  assert.match(component, /activeLeadershipAssignments/);
  assert.match(component, /activeChildUnits/);
  assert.match(component, /selectedUnit\.isActive && !selectedCanDeactivate/);
  assert.match(en, /Ready to deactivate/);
  assert.match(en, /Historical records will be preserved/);
  assert.match(ne, /पुराना अभिलेख सुरक्षित रहन्छन्/);
});


test("Placement Pending activation copy does not require its intentionally hidden internal type to be active", async () => {
  const [en, ne] = await Promise.all([
    readFile(new URL("../src/i18n/locales/en/organization.json", import.meta.url), "utf8"),
    readFile(new URL("../src/i18n/locales/ne/organization.json", import.meta.url), "utf8"),
  ]);

  assert.match(en, /return it to active organizational use/);
  assert.doesNotMatch(en, /unit type must be active first/);
  assert.match(ne, /माथिल्लो एकाइ पहिले सक्रिय हुनुपर्छ/);
});
