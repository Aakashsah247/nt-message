import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
}

const apiSource = (relativePath) =>
  readFile(new URL(`../../api/src/${relativePath}`, import.meta.url), "utf8");

test("P13-C account-request authority uses AccountClass and canonical OrgUnit scope", async () => {
  const [authority, createDto, resubmitDto] = await Promise.all([
    apiSource("account-requests/account-request-authority.service.ts"),
    apiSource("account-requests/dto/create-account-request.dto.ts"),
    apiSource("account-requests/dto/resubmit-account-request.dto.ts"),
  ]);

  assert.match(authority, /AccountClass\.OFFICE_USER/);
  assert.doesNotMatch(authority, /legacyDepartmentId|LegacyOrgUnitMapping|prisma\.department/);
  assert.match(createDto, /officeId!:\s*string/);
  assert.match(createDto, /intendedOrgUnitId!:\s*string/);
  assert.doesNotMatch(createDto, /departmentId|managementPositionId/);
  assert.match(resubmitDto, /intendedOrgUnitId\?:\s*string/);
  assert.doesNotMatch(resubmitDto, /departmentId|managementPositionId/);
});

test("P13-C account-class home routing replaces fixed-role home routing", async () => {
  const [homePath, roleHome, login] = await Promise.all([
    source("utils/get-account-home-path.ts"),
    source("components/RoleHome.tsx"),
    source("pages/LoginPage.tsx"),
  ]);

  assert.match(homePath, /SUPER_ADMIN/);
  assert.match(homePath, /OFFICE_USER|\/dashboard/);
  assert.doesNotMatch(homePath, /\/messages/);
  assert.doesNotMatch(homePath, /SENIOR_MANAGEMENT|TEAM_MANAGER|EMPLOYEE/);
  assert.match(roleHome, /getAccountHomePath\(account\.accountClass\)/);
  assert.match(login, /getAccountHomePath\(account\.accountClass\)/);
});

test("P13-C migration clears active V3 legacy management-position links without losing audit history", async () => {
  const migration = await readFile(
    new URL(
      "../../api/prisma/migrations/20260912023000_clear_active_v3_account_request_management_position/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /phase13LegacyManagementPositionId/);
  assert.match(migration, /account_request_actions/);
  assert.match(migration, /management_position_id" = NULL/);
  assert.match(migration, /office_id" IS NOT NULL/);
  assert.match(migration, /intended_org_unit_id" IS NOT NULL/);
  assert.match(migration, /status" <> 'REJECTED'/);
  assert.match(migration, /RAISE EXCEPTION/);
});


test("P13-C retires WM-V2 management query runtime and uses V3 Duty supervisor scope", async () => {
  const [workController, workModule, dutyController, dutyScope, dutyPage, dutyClient] =
    await Promise.all([
      apiSource("work-management/work-items.controller.ts"),
      apiSource("work-management/work-management.module.ts"),
      apiSource("work-management/duty-management.controller.ts"),
      apiSource("work-management/duty-scope-v3.service.ts"),
      source("pages/ManagementDutyPage.tsx"),
      source("services/work-management.service.ts"),
    ]);

  assert.doesNotMatch(workController, /management\/dashboard-summary|management\/organization-summary|management\/assignment-options/);
  assert.doesNotMatch(workModule, /WorkManagementQueryService/);
  assert.match(dutyController, /management\/supervisor-options/);
  assert.match(dutyScope, /listSupervisorOptions/);
  assert.match(dutyScope, /OrgLeadershipType\.OFFICE_HEAD/);
  assert.match(dutyScope, /OrgLeadershipType\.ORG_UNIT_HEAD/);
  assert.match(dutyScope, /operationalTeamLeadAssignment\.findMany/);
  assert.match(dutyClient, /\/duty\/management\/supervisor-options/);
  assert.match(dutyPage, /listDutySupervisorOptions/);
  assert.doesNotMatch(dutyPage, /listManagementAssignmentOptions/);
});

test("WorkScope keeps V3 organization authority while classic WorkItems is authoritative", async () => {
  const [workScope, workModule, workController] = await Promise.all([
    apiSource("work-management/work-scope.service.ts"),
    apiSource("work-management/work-management.module.ts"),
    apiSource("work-management/work-items.controller.ts"),
  ]);

  assert.match(workScope, /accountClass:\s*true/);
  assert.match(workScope, /orgMemberships:/);
  assert.match(workScope, /orgLeadershipAssignments:/);
  assert.match(workScope, /operationalTeamLeadAssignments:/);
  assert.match(workScope, /AccountClass\.SUPER_ADMIN/);
  assert.match(workScope, /OrgLeadershipType\.OFFICE_HEAD/);
  assert.match(workScope, /OrgLeadershipType\.ORG_UNIT_HEAD/);
  assert.doesNotMatch(workScope, /managementAssignments:/);
  assert.doesNotMatch(workScope, /ManagementPositionType/);
  assert.match(workModule, /WorkItemsService/);
  assert.match(workController, /WorkItemsService/);
  assert.match(workController, /CreateWorkItemDto/);
  assert.match(workController, /:workItemId\/acknowledge/);
  assert.match(workController, /:workItemId\/start/);
});

test("P13-C WorkScope authorization no longer uses Division or Department scope decisions", async () => {
  const workScope = await apiSource("work-management/work-scope.service.ts");

  assert.match(workScope, /primaryOwnerOrgUnitId/);
  assert.match(workScope, /orgUnitParticipants/);
  assert.match(workScope, /assignableOrgUnitIds/);
  assert.match(workScope, /operationalTeamLeadIds/);
  assert.doesNotMatch(workScope, /legacyDepartmentTeamId/);
  assert.match(workScope, /CAPABILITIES\.WORK_ASSIGN/);
  assert.match(workScope, /CAPABILITIES\.WORK_VIEW/);
  assert.doesNotMatch(workScope, /actor\.divisionId/);
  assert.doesNotMatch(workScope, /actor\.departmentId/);
  assert.doesNotMatch(workScope, /target\.employee\?\.divisionId/);
  assert.doesNotMatch(workScope, /target\.employee\?\.departmentId/);
});


test("P13-C Duty management oversight derives leadership targets from V3 scope", async () => {
  const [dutySchedule, dutyScope] = await Promise.all([
    apiSource("work-management/duty-schedule.service.ts"),
    apiSource("work-management/duty-scope-v3.service.ts"),
  ]);

  assert.match(dutySchedule, /managementDutyAccountIds\(user/);
  assert.match(dutySchedule, /user\.accountClass === AccountClass\.SUPER_ADMIN/);
  assert.doesNotMatch(dutySchedule, /employee:\s*\{\s*is:\s*\{\s*role:/);
  assert.match(dutyScope, /OrgLeadershipType\.OFFICE_HEAD/);
  assert.match(dutyScope, /OrgLeadershipType\.ORG_UNIT_HEAD/);
  assert.match(dutyScope, /operationalTeamLeadAssignment\.findMany/);
  assert.match(dutyScope, /accountClass:\s*AccountClass\.OFFICE_USER/);
});

test("P13-C Duty coverage configuration is native Office/OrgUnit scope", async () => {
  const [coverageService, createDto, updateDto, listDto, webTypes, webClient] =
    await Promise.all([
      apiSource("work-management/duty-coverage-requirements.service.ts"),
      apiSource("work-management/dto/create-duty-coverage-requirement.dto.ts"),
      apiSource("work-management/dto/update-duty-coverage-requirement.dto.ts"),
      apiSource("work-management/dto/list-duty-coverage-requirements-query.dto.ts"),
      source("types/work-management.ts"),
      source("services/work-management.service.ts"),
    ]);

  assert.match(coverageService, /officeId/);
  assert.match(coverageService, /orgUnitId/);
  assert.match(coverageService, /OrgUnit scope/);
  assert.doesNotMatch(coverageService, /legacyOrgUnitMapping|resolveLegacyCompatibilityScope/);
  assert.doesNotMatch(coverageService, /departmentId|divisionId|prisma\.department/);
  assert.match(createDto, /orgUnitId\?:\s*string/);
  assert.doesNotMatch(createDto, /departmentId|divisionId/);
  assert.match(updateDto, /orgUnitId\?:\s*string/);
  assert.doesNotMatch(updateDto, /departmentId|divisionId/);
  assert.match(listDto, /orgUnitId\?:\s*string/);
  assert.doesNotMatch(listDto, /departmentId|divisionId/);
  assert.match(webTypes, /DutyCoverageRequirementInput[\s\S]*orgUnitId:\s*string/);
  assert.match(webClient, /DutyCoverageRequirementQuery[\s\S]*orgUnitId\?:\s*string/);
});

test("P13-C Duty shift and holiday configuration uses Office/OrgUnit scope", async () => {
  const [dutySchedule, shiftDto, shiftQueryDto, holidayDto, holidayQueryDto, webTypes, webClient, dutyPage] =
    await Promise.all([
      apiSource("work-management/duty-schedule.service.ts"),
      apiSource("work-management/dto/create-duty-shift-template.dto.ts"),
      apiSource("work-management/dto/duty-shift-template-query.dto.ts"),
      apiSource("work-management/dto/create-duty-holiday.dto.ts"),
      apiSource("work-management/dto/list-duty-holidays-query.dto.ts"),
      source("types/work-management.ts"),
      source("services/work-management.service.ts"),
      source("pages/ManagementDutyPage.tsx"),
    ]);

  for (const dto of [shiftDto, shiftQueryDto, holidayDto, holidayQueryDto]) {
    assert.doesNotMatch(dto, /divisionId|departmentId/);
  }
  assert.match(shiftDto, /OFFICE[\s\S]*ORG_UNIT/);
  assert.match(holidayDto, /OFFICE[\s\S]*ORG_UNIT/);
  assert.match(dutySchedule, /resolveV3ConfigurationScope/);
  assert.match(dutySchedule, /officeId:\s*scope\.officeId/);
  assert.match(dutySchedule, /orgUnitId:\s*scope\.orgUnitId/);
  assert.match(webTypes, /DutyShiftScope = "OFFICE" \| "ORG_UNIT"/);
  assert.match(webTypes, /DutyHolidayScope = "OFFICE" \| "ORG_UNIT"/);
  assert.doesNotMatch(webClient, /targetScope\?: DutyShiftScope; divisionId/);
  assert.match(dutyPage, /One Org Unit/);
  assert.match(dutyPage, /manageableOrgUnits\.map\(\(orgUnit\)/);
  assert.doesNotMatch(dutyPage, /dutyOrgUnits/);
  assert.doesNotMatch(dutyPage, /Department or Division scope is for approved local closures/);
});

test("classic Work lifecycle routes are restored on the V3 organization model", async () => {
  const [controller, lifecycle, workModule] = await Promise.all([
    apiSource("work-management/work-items.controller.ts"),
    apiSource("work-management/work-lifecycle.service.ts"),
    apiSource("work-management/work-management.module.ts"),
  ]);

  for (const route of [
    /:workItemId\/acknowledge/,
    /:workItemId\/start/,
    /:workItemId\/sales\/send/,
    /:workItemId\/sales\/complete/,
    /:workItemId\/review\/close/,
    /:workItemId\/review\/reopen/,
    /:workItemId\/reassign/,
    /:workItemId\/support\/add/,
    /:workItemId\/support\/remove/,
  ]) {
    assert.match(controller, route);
  }

  assert.match(lifecycle, /async submitCompletion\(/);
  assert.match(lifecycle, /async requestMoreInformation\(/);
  assert.match(lifecycle, /async close\(/);
  assert.match(lifecycle, /async reopen\(/);
  assert.match(lifecycle, /async cancel\(/);
  assert.match(lifecycle, /async reassign\(/);
  assert.match(lifecycle, /async addSupport\(/);
  assert.match(lifecycle, /async removeSupport\(/);
  assert.match(lifecycle, /async sendToSales\(/);
  assert.match(lifecycle, /async completeSalesWork\(/);
  assert.match(workModule, /WorkItemsService/);
  assert.match(controller, /help-requests\/pending/);
  assert.match(lifecycle, /async requestHelp\(/);
  assert.match(lifecycle, /async respondToHelpRequest\(/);
  assert.doesNotMatch(lifecycle, /coordinateHelpRequest|Use V3 OrgUnit collaboration instead/);
});
