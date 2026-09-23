import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [navigationSource, hierarchySource, appSource] = await Promise.all([
  readFile(new URL("../src/components/layout/management-navigation.ts", import.meta.url), "utf8"),
  readFile(new URL("../../api/src/organization/organization-hierarchy.service.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
]);

test("Office Head navigation removes personal Work and Duty through workspace features", () => {
  assert.match(hierarchySource, /const isFormalManager = isOfficeHead \|\| isOrgUnitHead/);
  assert.match(hierarchySource, /myWork: !isFormalManager/);
  assert.match(hierarchySource, /myDuty: !isOfficeHead/);
  assert.match(hierarchySource, /dutyRoster: canManageDuty/);
  assert.match(navigationSource, /context\.features\.workManagement/);
  assert.match(navigationSource, /context\.features\.dutyRoster/);
  assert.match(navigationSource, /context\.features\.myWork/);
  assert.match(navigationSource, /context\.features\.myDuty/);
});

test("Organization Management stays separate from dedicated Team Management", () => {
  assert.match(navigationSource, /Organization Management/);
  assert.match(navigationSource, /path: "\/organization"/);
  assert.doesNotMatch(
    navigationSource,
    /label: "Team Management"[\s\S]{0,160}path: "\/organization"/,
  );
  assert.doesNotMatch(
    appSource,
    /path="\/team-management"[^\n]*Navigate to="\/organization"/,
  );
});
