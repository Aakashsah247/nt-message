import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Directory V3 keeps hierarchy Heads scoped and Team Lead outside formal leadership", async () => {
  const [service, types, list, detail] = await Promise.all([
    read("../api/src/directory/directory.service.ts"),
    read("src/types/directory.ts"),
    read("src/components/EmployeeDirectory.tsx"),
    read("src/components/EmployeeDirectoryDetailPanel.tsx"),
  ]);

  assert.match(service, /OrgLeadershipType\.OFFICE_HEAD/);
  assert.match(service, /OrgLeadershipType\.ORG_UNIT_HEAD/);
  assert.match(service, /orgUnitClosure/);
  assert.doesNotMatch(service, /OrgLeadershipType\.TEAM_LEAD/);
  assert.doesNotMatch(types, /\| "TEAM_LEAD"/);
  assert.match(list, /divisionHead/);
  assert.match(list, /departmentHead/);
  assert.match(list, /sectionHead/);
  assert.match(list, /unitHead/);
  assert.doesNotMatch(detail, /detail\.noDesignation/);
});

test("Super Admin Directory is office-wise and owns the real cross-office transfer", async () => {
  const [list, detail, service, app, navigation, controller, employeeService, dto, organizationPeople] = await Promise.all([
    read("src/components/EmployeeDirectory.tsx"),
    read("src/components/EmployeeDirectoryDetailPanel.tsx"),
    read("src/services/directory.service.ts"),
    read("src/App.tsx"),
    read("src/components/layout/management-navigation.ts"),
    read("../api/src/employees/employees.controller.ts"),
    read("../api/src/employees/employees.service.ts"),
    read("../api/src/employees/dto/end-employee-employment.dto.ts"),
    read("../api/src/organization/organization-people.service.ts"),
  ]);

  assert.match(list, /getOrganizationOffices/);
  assert.match(list, /officeId/);
  assert.match(list, /divisionId/);
  assert.match(list, /departmentId/);
  assert.match(detail, /transferDirectoryEmployeeOffice/);
  assert.match(service, /office-transfer/);
  assert.match(controller, /office-transfer/);
  assert.match(employeeService, /assignmentSource:\s*OrgAssignmentSource\.TRANSFER/);
  assert.match(employeeService, /revokedSessions/);
  assert.match(organizationPeople, /Cross-office transfer requires the dedicated office-transfer workflow/);
  assert.doesNotMatch(dto, /EmploymentStatus\.TRANSFERRED/);
  assert.doesNotMatch(navigation, /Employee Administration/);
  assert.doesNotMatch(app, /SuperAdminEmployeesPage/);
});

test("Directory V3 refreshes through realtime invalidation without broadcasting employee data", async () => {
  const [page, socket, events] = await Promise.all([
    read("src/pages/DirectoryPage.tsx"),
    read("src/services/messaging-socket.service.ts"),
    read("../api/src/realtime/messaging-events.service.ts"),
  ]);
  assert.match(socket, /"directory:changed"/);
  assert.match(page, /socket\.on\("directory:changed"/);
  assert.match(events, /emitDirectoryChanged/);
  assert.match(events, /contain no employee data/);
});


test("Directory shows only current permanent hierarchy leadership and keeps previous heads as history", async () => {
  const [directoryService, organizationPeople, migration] = await Promise.all([
    read("../api/src/directory/directory.service.ts"),
    read("../api/src/organization/organization-people.service.ts"),
    read("../api/prisma/migrations/20260916091500_exclusive_current_org_unit_heads/migration.sql"),
  ]);

  assert.match(directoryService, /assignment\.effectiveFrom <= now/);
  assert.match(directoryService, /assignment\.effectiveUntil > now/);
  assert.match(organizationPeople, /previousPermanentHeadsEnded/);
  assert.match(organizationPeople, /orgLeadershipAssignment\.updateMany/);
  assert.match(organizationPeople, /Reassigned as permanent Org Unit Head/);
  assert.match(migration, /ROW_NUMBER\(\) OVER/);
  assert.match(migration, /superseded by newer permanent Org Unit Head assignment/);
});

test("Directory current-record counter keeps label and count in separate columns", async () => {
  const css = await read("src/index.css");
  assert.match(
    css,
    /\.directory-total\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/,
  );
  assert.match(css, /\.directory-total strong\s*\{[\s\S]*justify-self:\s*end;/);
  assert.doesNotMatch(css, /\.directory-total__icon/);
});


test("Directory presents organization responsibility without duplicating the OrgUnit name", async () => {
  const [list, english, nepali] = await Promise.all([
    read("src/components/EmployeeDirectory.tsx"),
    read("src/i18n/locales/en/directory.json"),
    read("src/i18n/locales/ne/directory.json"),
  ]);

  assert.match(list, /getOrganizationRoleLabel/);
  assert.match(list, /list\.table\.organizationRole/);
  assert.match(list, /organizationRole\.employee/);
  assert.match(list, /organizationRole\.superAdmin/);
  assert.doesNotMatch(list, /getLeadershipLabel/);
  assert.doesNotMatch(list, /t\(`organizationRole\.\$\{key\}`, \{ unit:/);

  const en = JSON.parse(english);
  const ne = JSON.parse(nepali);
  assert.equal(en.list.table.organizationRole, "Organization Role");
  assert.equal(en.organizationRole.employee, "Employee");
  assert.equal(en.organizationRole.divisionHead, "Division Head");
  assert.equal(typeof ne.list.table.organizationRole, "string");
  assert.equal(typeof ne.organizationRole.employee, "string");
});
