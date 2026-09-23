import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [navigation, app, homePath, hierarchy, authorization] = await Promise.all([
  readFile(new URL("../src/components/layout/management-navigation.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/utils/get-account-home-path.ts", import.meta.url), "utf8"),
  readFile(new URL("../../api/src/organization/organization-hierarchy.service.ts", import.meta.url), "utf8"),
  readFile(new URL("../../api/src/organization/organization-authorization.service.ts", import.meta.url), "utf8"),
]);

test("Office users return to a dedicated dashboard home", () => {
  assert.match(homePath, /OFFICE_USER|super-admin/);
  assert.match(homePath, /"\/dashboard"/);
  assert.match(app, /path="\/dashboard"/);
  assert.match(app, /<OfficeDashboardPage \/>/);
});

test("navigation is driven by the server workspace context", () => {
  assert.match(navigation, /OrganizationWorkspaceContext/);
  assert.match(navigation, /context\.features\.workManagement/);
  assert.match(navigation, /context\.features\.myWork/);
  assert.match(navigation, /context\.features\.dutyRoster/);
  assert.match(navigation, /context\.features\.myDuty/);
  assert.match(navigation, /Organization Management/);
  assert.doesNotMatch(navigation, /label: "Team Management"[\s\S]*path: "\/organization"/);
});

test("wrong Team Management to Organization compatibility redirect is removed", () => {
  assert.doesNotMatch(app, /path="\/team-management"[^\n]*Navigate to="\/organization"/);
});

test("workspace authority distinguishes hierarchy leadership from operational Team Lead", () => {
  assert.match(hierarchy, /'OFFICE_HEAD'/);
  assert.match(hierarchy, /'ORGANIZATION_HEAD'/);
  assert.match(hierarchy, /'ORG_UNIT_HEAD'/);
  assert.match(hierarchy, /isOperationalTeamLead/);
  assert.match(hierarchy, /operationalTeamLeadAssignments/);
  assert.match(hierarchy, /parentOrgUnitId === null/);
});

test("OrgUnit Heads regain scoped account-request creation authority", () => {
  const headCapabilities = authorization.slice(
    authorization.indexOf("const ORG_UNIT_HEAD_CAPABILITIES"),
    authorization.indexOf("const SUPER_ADMIN_CAPABILITIES"),
  );
  assert.match(headCapabilities, /CAPABILITIES\.USERS_REQUEST_CREATE/);
});

test("Office Head has management Work and Duty but no separate My Work or My Duty", () => {
  assert.match(hierarchy, /myWork: !isFormalManager/);
  assert.match(hierarchy, /myDuty: !isOfficeHead/);
  assert.match(hierarchy, /dutyRoster: canManageDuty/);
});
