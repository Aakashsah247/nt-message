import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
}

const [navigation, app, hierarchy, contextTypes, dashboard, workPage] = await Promise.all([
  source("components/layout/management-navigation.ts"),
  source("App.tsx"),
  readFile(new URL("../../api/src/organization/organization-hierarchy.service.ts", import.meta.url), "utf8"),
  source("types/organization-v3.ts"),
  source("pages/OfficeDashboardPage.tsx"),
  source("pages/WorkPage.tsx"),
]);

test("Work navigation consolidates formal-manager queues into Work Management", () => {
  assert.match(navigation, /"Work Management"[\s\S]{0,100}"navigation\.items\.workManagement"[\s\S]{0,100}"\/work"/);
  assert.doesNotMatch(navigation, /"Incoming Work"|"\/incoming-work"|features\.incomingWork/);
  assert.doesNotMatch(app, /path="\/incoming-work"/);
  assert.doesNotMatch(workPage, /IncomingWorkPage|"\/incoming-work"/);
  assert.doesNotMatch(contextTypes, /incomingWork:/);
  assert.doesNotMatch(hierarchy, /incomingWork:/);
  assert.doesNotMatch(dashboard, /path: "\/incoming-work"/);
});

test("Work navigation keeps Team Management with operational workspaces", () => {
  assert.doesNotMatch(
    navigation,
    /officeItems\.push\([\s\S]{0,180}"Team Management"/,
  );
  assert.match(
    navigation,
    /if \(context\.features\.teamManagement\) \{[\s\S]{0,220}operationItems\.push[\s\S]{0,220}"Team Management"[\s\S]{0,120}"\/team-management"/,
  );
});

test("Work Types supports formal Head authority and explicit Work Type Management delegation", () => {
  assert.match(hierarchy, /hasDelegatedWorkTypeManagement/);
  assert.match(hierarchy, /workTypes:[\s\S]{0,120}isOfficeHead \|\| isOrganizationHead \|\| hasDelegatedWorkTypeManagement/);
  assert.match(navigation, /context\.features\.workTypes[\s\S]{0,220}"Work Types"[\s\S]{0,120}"\/work-types"/);
  assert.match(app, /path="\/work-types\/\*"[\s\S]{0,300}<WorkTypeManagementPage \/>/);
});

test("Operational Team Lead stays on employee Work pages and does not gain Work Management", () => {
  assert.match(hierarchy, /const canManageWork = isFormalManager \|\| hasDelegatedWorkManagement/);
  assert.doesNotMatch(hierarchy, /const canManageWork =[\s\S]{0,120}isOperationalTeamLead/);
  assert.match(hierarchy, /workManagement: canManageWork/);
  assert.match(hierarchy, /myWork: !isFormalManager/);
  assert.match(
    dashboard,
    /!isManager && snapshot\.context\.authority\.isOperationalTeamLead/,
  );
  assert.match(
    dashboard,
    /<Link to="\/my-work">\{t\("dashboardV3\.lead\.openTeamWork"\)\}<\/Link>/,
  );
  assert.doesNotMatch(
    dashboard,
    /isOperationalTeamLead[\s\S]{0,160}<Link to="\/work">/,
  );
});

test("Super Admin keeps read-only Work Oversight and Reports only", () => {
  const start = navigation.indexOf("const SUPER_ADMIN_NAVIGATION");
  const end = navigation.indexOf("export function getManagementNavigation", start);
  const admin = navigation.slice(start, end);

  assert.match(admin, /"Work Oversight"[\s\S]{0,100}"\/work-oversight"/);
  assert.match(admin, /"Reports"[\s\S]{0,100}"\/work-reports"/);
  assert.doesNotMatch(admin, /"Work Management"[\s\S]{0,100}"\/work"/);
  assert.doesNotMatch(admin, /"Duty Roster"|"Team Management"|"My Work"|"My Duty"/);
});

test("obsolete V3 runtime pages are physically removed", async () => {
  for (const page of [
    "../src/pages/IncomingWorkPage.tsx",
    "../src/pages/WorkRuntimeV3Page.tsx",
    "../src/pages/WorkRuntimeV3CreatePage.tsx",
    "../src/pages/WorkRuntimeV3DetailPage.tsx",
    "../src/pages/WorkStageWorkspacePage.tsx",
  ]) {
    await assert.rejects(access(new URL(page, import.meta.url)));
  }
});
