import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/pages/ManagementDutyPage.tsx", import.meta.url), "utf8");
const service = await readFile(new URL("../src/services/work-management.service.ts", import.meta.url), "utf8");
const employee = await readFile(new URL("../src/pages/EmployeeDutyPage.tsx", import.meta.url), "utf8");
const dutyStyles = await readFile(new URL("../src/styles/work-main-parity.css", import.meta.url), "utf8");

test("P11-5 uses backend Duty access context instead of Super Admin mutation controls", () => {
  assert.match(service, /\/duty\/management\/access-context/);
  assert.match(page, /readOnlyOversight/);
  assert.match(page, /canAssignDuty/);
  assert.match(page, /canManageDuty/);
  assert.doesNotMatch(page, /account\?\.role === "SUPER_ADMIN"/);
});

test("P11-5 hides assignment mutation controls when Duty assign capability is absent", () => {
  assert.match(page, /canAssignDuty &&[\s\S]*Assign Duty/);
  assert.match(page, /view === "ASSIGNMENTS" && canAssignDuty/);
  assert.match(page, /disabled=!\{canAssignDuty\}|disabled=\{!canAssignDuty\}/);
});

test("P11-5 employee Duty copy prefers V3 team and OrgUnit context", () => {
  assert.match(employee, /visibleDuty\.operationalTeam\?\.name/);
  assert.match(employee, /visibleDuty\.orgUnit\?\.name/);
});


test("P11-5 scopes roster and assignment UX through OrgUnit and Operational Team", () => {
  assert.match(page, /All permitted Org Units/);
  assert.match(page, /All permitted teams/);
  assert.match(page, /orgUnitId: orgUnitId \|\| undefined/);
  assert.match(page, /operationalTeamId: operationalTeamId \|\| undefined/);
  assert.match(page, /orgUnitId: assignmentOrgUnitId \|\| undefined/);
  assert.match(page, /const assignmentScopeReady = Boolean\(assignmentOrgUnitId\)/);
  assert.doesNotMatch(page, /orgUnitId: orgUnitId \|\| accessContext\?\.primaryOrgUnitId/);
  assert.doesNotMatch(page, /All departments/);
});

test("Duty Roster actions survive secondary load failures and tab changes stay local", () => {
  assert.match(page, /const initialLoad = !hasLoadedRef\.current/);
  assert.match(page, /const accessResponse = await getDutyManagementAccessContext\(accessToken\);\s*setAccessContext\(accessResponse\);/);
  assert.match(page, /const loadHistory = useCallback/);
  assert.match(dutyStyles, /management-duty-tabs button\.is-active:hover,[\s\S]*management-duty-tabs button\.is-active:focus-visible[\s\S]*color: #fff/);
});
