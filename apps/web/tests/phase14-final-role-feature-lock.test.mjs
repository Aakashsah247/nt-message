import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [hierarchy, navigation, app, teamService, authorization] =
  await Promise.all([
    readFile(
      new URL(
        "../../api/src/organization/organization-hierarchy.service.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/components/layout/management-navigation.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../api/src/team-management/team-management.service.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../api/src/organization/organization-authorization.service.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

test("P14.3 locks stable hierarchy personas without restoring fixed account roles", () => {
  for (const kind of [
    "SUPER_ADMIN",
    "OFFICE_HEAD",
    "ORGANIZATION_HEAD",
    "ORG_UNIT_HEAD",
    "EMPLOYEE",
  ]) {
    assert.match(hierarchy, new RegExp(`'${kind}'`));
  }
  assert.match(hierarchy, /isOperationalTeamLead/);

  assert.doesNotMatch(hierarchy, /SENIOR_MANAGEMENT|TEAM_MANAGER/);
  assert.doesNotMatch(navigation, /SENIOR_MANAGEMENT|TEAM_MANAGER/);
});

test("P14.3 keeps Operational Team Lead separate from the formal hierarchy", () => {
  assert.match(hierarchy, /operationalTeamLeadAssignments/);
  assert.match(teamService, /operationalTeamLeadAssignment/);
  assert.doesNotMatch(teamService, /OrgLeadershipType\.TEAM_LEAD/);
  assert.match(teamService, /Team Management authority/);
  assert.match(teamService, /CAPABILITIES\.TEAM_MANAGE/);
});

test("P14.3 keeps Organization Management and Team Management as separate workspaces", () => {
  assert.match(navigation, /"Organization Management"[\s\S]*?"\/organization"/);
  assert.match(navigation, /"Team Management"[\s\S]*?"\/team-management"/);
  assert.match(app, /path="\/team-management"/);
  assert.doesNotMatch(
    app,
    /path="\/team-management"[\s\S]{0,180}Navigate to="\/organization"/,
  );
});

test("P14.3 keeps delegated workspaces separate from hierarchy-only account requests", () => {
  assert.match(hierarchy, /delegatedPermission\.findMany/);
  assert.match(hierarchy, /hasDelegatedWorkManagement/);
  assert.match(hierarchy, /hasDelegatedDutyManagement/);
  assert.match(hierarchy, /hasDelegatedReports/);
  assert.match(hierarchy, /accountRequests: isFormalManager/);
  assert.doesNotMatch(
    hierarchy,
    /accountRequests:[\s\S]{0,100}USERS_REQUEST_CREATE/,
  );
});

test("P14.3 preserves the Super Admin operational read-only boundary", () => {
  const superAdminContext = hierarchy.slice(
    hierarchy.indexOf("if (user.accountClass === AccountClass.SUPER_ADMIN)"),
    hierarchy.indexOf("const now = new Date();"),
  );
  assert.match(superAdminContext, /workOversight: true/);
  assert.match(superAdminContext, /workManagement: false/);
  assert.match(superAdminContext, /dutyRoster: false/);
  assert.match(superAdminContext, /teamManagement: false/);
  assert.match(superAdminContext, /reports: true/);
  assert.match(superAdminContext, /emergency: false/);

  const superAdminCapabilities = authorization.slice(
    authorization.indexOf("const SUPER_ADMIN_CAPABILITIES"),
    authorization.indexOf("@Injectable()"),
  );
  assert.doesNotMatch(superAdminCapabilities, /CAPABILITIES\.DUTY_MANAGE/);
  assert.doesNotMatch(superAdminCapabilities, /CAPABILITIES\.WORK_ASSIGN/);
  assert.doesNotMatch(superAdminCapabilities, /CAPABILITIES\.WORK_CANCEL/);
});
