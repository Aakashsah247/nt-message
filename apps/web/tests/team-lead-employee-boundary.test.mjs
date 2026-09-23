import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

const [hierarchy, workScope, workItems, workTypes, catalog, dashboard, reports] =
  await Promise.all([
    source("../../api/src/organization/organization-hierarchy.service.ts"),
    source("../../api/src/work-management/work-scope.service.ts"),
    source("../../api/src/work-management/work-items.service.ts"),
    source("../src/pages/WorkTypeManagementPage.tsx"),
    source("../../api/src/work-management/default-work-type-catalog.ts"),
    source("../src/pages/OfficeDashboardPage.tsx"),
    source("../../api/src/work-management/work-reports-classic.service.ts"),
  ]);

test("Team Lead remains an employee and does not unlock Work Management", () => {
  assert.match(
    hierarchy,
    /const canManageWork = isFormalManager \|\| hasDelegatedWorkManagement/,
  );
  assert.doesNotMatch(
    hierarchy,
    /const canManageWork =[\s\S]{0,120}isOperationalTeamLead/,
  );
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

test("Team Lead status does not grant Work assignment or management scope", () => {
  const managerGate = workScope.slice(
    workScope.indexOf("private assertOfficeOperationalManager"),
    workScope.indexOf("private accountHasOperationalManagementAuthority"),
  );
  assert.match(managerGate, /assignableOrgUnitIds/);
  assert.doesNotMatch(managerGate, /operationalTeamLeadIds/);

  const personalScope = workScope.slice(
    workScope.indexOf("buildVisibleWorkWhere"),
    workScope.indexOf("buildOrganizationHierarchyWorkWhere"),
  );
  assert.match(personalScope, /operationalTeamLeadIds/);
  assert.match(personalScope, /operationalTeamMemberIds/);
  assert.match(personalScope, /assignedOperationalTeamId/);
});

test("Team Lead can claim shared Main Team Work without becoming a Work creator category", () => {
  const creatorChoices = workTypes.slice(
    workTypes.indexOf("const CREATOR_CATEGORIES"),
    workTypes.indexOf("const CREATOR_SCOPES"),
  );
  assert.doesNotMatch(creatorChoices, /TEAM_LEAD/);
  assert.doesNotMatch(catalog, /WorkTypeCreatorCategory\.TEAM_LEAD/);

  assert.match(workItems, /Only a Main Team member can claim this Work/);
  assert.match(workItems, /assignedOperationalTeamId/);
  assert.match(workItems, /operationalTeamMember\.findFirst/);
});

test("Team Lead does not receive a special management report scope", () => {
  const contextBlock = reports.slice(
    reports.indexOf("async getContext"),
    reports.indexOf("async getOverview"),
  );
  assert.doesNotMatch(contextBlock, /operationalTeamLeadAssignment\.findMany/);
  assert.match(contextBlock, /operationalTeamIds/);
});
