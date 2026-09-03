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

test("P4-D1C separates Super Admin viewer navigation from Office management", async () => {
  const [navigation, layout, service] = await Promise.all([
    readFile(navigationUrl, "utf8"),
    readFile(layoutUrl, "utf8"),
    readFile(serviceUrl, "utf8"),
  ]);

  assert.match(navigation, /label: \"Organization Viewer\"/);
  assert.match(navigation, /label: \"Organization & People\"/);
  assert.match(navigation, /path: \"\/organization\"/);
  assert.match(navigation, /organizationMode !== \"MANAGE\"/);
  assert.match(layout, /getOrganizationNavigationContext/);
  assert.match(layout, /organizationNavigationMode/);
  assert.match(service, /\/organization\/navigation-context/);

  assert.doesNotMatch(
    navigation,
    /label: \"Organization\"[\s\S]{0,180}view: \"organization\"/,
  );
});

test("P4-D1C keeps normal employee navigation free of a static hierarchy-management link", async () => {
  const navigation = await readFile(navigationUrl, "utf8");

  const employeeStart = navigation.indexOf("const EMPLOYEE_NAVIGATION");
  const managerStart = navigation.indexOf("function getManagerNavigation");
  const employeeBlock = navigation.slice(employeeStart, managerStart);

  assert.equal(employeeBlock.includes('path: "/organization"'), false);
  assert.equal(employeeBlock.includes("OFFICE_MANAGEMENT_SECTION"), false);
});
