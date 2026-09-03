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
