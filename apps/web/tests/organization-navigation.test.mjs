import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const navigationUrl = new URL(
  "../src/components/layout/management-navigation.ts",
  import.meta.url,
);
const layoutUrl = new URL(
  "../src/components/layout/ManagementLayout.tsx",
  import.meta.url,
);
const serviceUrl = new URL(
  "../src/services/organization-v3.service.ts",
  import.meta.url,
);
const workspaceContextUrl = new URL(
  "../src/context/OrganizationWorkspaceContext.tsx",
  import.meta.url,
);

test("P4-D1C separates Super Admin viewer navigation from Office management", async () => {
  const [navigation, layout, service, workspaceContext] = await Promise.all([
    readFile(navigationUrl, "utf8"),
    readFile(layoutUrl, "utf8"),
    readFile(serviceUrl, "utf8"),
    readFile(workspaceContextUrl, "utf8"),
  ]);

  assert.match(navigation, /label: \"Office Organizations\"/);
  assert.match(navigation, /"Organization Management"/);
  assert.match(navigation, /path: \"\/organization\"/);
  assert.match(layout, /useOrganizationWorkspace/);
  assert.match(layout, /workspaceContext/);
  assert.match(workspaceContext, /getOrganizationWorkspaceContext/);
  assert.match(service, /\/organization\/workspace-context/);

  assert.doesNotMatch(
    navigation,
    /label: \"Organization\"[\s\S]{0,180}view: \"organization\"/,
  );
});

test("P4-D1C keeps normal employee navigation free of a static hierarchy-management link", async () => {
  const navigation = await readFile(navigationUrl, "utf8");

  assert.match(navigation, /if \(context\.features\.organizationView\)/);
  assert.match(navigation, /path: "\/organization"/);
  assert.doesNotMatch(navigation, /EMPLOYEE_NAVIGATION|OFFICE_MANAGEMENT_SECTION/);
});

test("Super Admin organization view is explicitly Office-wise and read only", async () => {
  const [panel, hierarchy] = await Promise.all([
    readFile(new URL("../src/components/AdminOrganizationPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../api/src/organization/organization-hierarchy.service.ts", import.meta.url), "utf8"),
  ]);

  assert.match(panel, /viewerAccountClass/);
  assert.match(panel, /isSuperAdmin \|\| offices\.length > 1/);
  assert.match(panel, /t\("hero\.viewOffice"\)/);
  assert.match(panel, /readonly\.superAdminDescription/);
  assert.match(hierarchy, /visibleOfficeIds === null/);
  assert.match(hierarchy, /user\.accountClass === AccountClass\.SUPER_ADMIN/);
  assert.match(hierarchy, /organizationManage: false/);
});
