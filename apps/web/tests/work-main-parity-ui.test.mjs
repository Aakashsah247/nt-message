import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const restore = readFileSync(new URL("../../../scripts/restore_main_work_ui.mjs", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../src/services/work-main-parity.service.ts", import.meta.url), "utf8");
const auth = readFileSync(new URL("../src/context/WorkMainParityAuthContext.ts", import.meta.url), "utf8");

test("canonical Work routes render the restored main-branch surfaces", () => {
  assert.match(app, /path="\/work"[\s\S]*?<ManagementWorkPage \/>/);
  assert.match(app, /path="\/work\/create"[\s\S]*?<ManagementWorkPage \/>/);
  assert.match(app, /path="\/my-work"[\s\S]*?<EmployeeWorkPage \/>/);
  assert.match(app, /path="\/work-reports"[\s\S]*?<WorkReportsRoutePage \/>/);
  assert.match(app, /import "\.\/styles\/work-main-parity\.css"/);
});

test("Work UI restoration uses the exact finalized Git main files", () => {
  for (const path of [
    "apps/web/src/pages/ManagementWorkPage.tsx",
    "apps/web/src/pages/EmployeeWorkPage.tsx",
    "apps/web/src/pages/WorkReportsPage.tsx",
    "apps/web/src/styles/work-management.css",
  ]) {
    assert.ok(restore.includes(`readMain('${path}')`) || restore.includes(`readMain(\"${path}\")`), path);
  }
  assert.match(restore, /git\("show", `\$\{reference\}:\$\{path\}`\)/);
  assert.match(restore, /work-main-parity\.service/);
  assert.match(restore, /work-main-parity/);
});

test("main Work compatibility keeps V3 authority and hierarchy authoritative", () => {
  assert.match(auth, /context\?\.authority\.isOfficeHead/);
  assert.match(auth, /context\?\.authority\.isOrgUnitHead/);
  assert.match(adapter, /getOrganizationWorkspaceContext/);
  assert.match(adapter, /getOrganizationTree/);
  assert.match(adapter, /\/work-items\/offices\/\$\{identity\.officeId\}/);
  assert.match(adapter, /mainOperationalTeamId/);
  assert.match(adapter, /responsibleReviewerAccountId/);
  assert.match(adapter, /departmentById\.get\(team\.ownerUnitId\)/);
});

test("My Work renders real V3 Operational Team members instead of assignment-derived counts", () => {
  assert.match(adapter, /raw\.members \?\? \[\]/);
  assert.match(adapter, /raw\.leadAssignments\?\.\[0\]\?\.employeeId/);
  assert.match(adapter, /_count: \{ members: members\.length \}/);
  assert.match(adapter, /members,/);
});


test("Work participant cards use protected profile-photo avatars with initials fallback", () => {
  const management = readFileSync(new URL("../src/pages/ManagementWorkPage.tsx", import.meta.url), "utf8");
  const employee = readFileSync(new URL("../src/pages/EmployeeWorkPage.tsx", import.meta.url), "utf8");

  for (const source of [management, employee]) {
    assert.match(source, /import \{ ProtectedAvatar \}/);
    assert.match(source, /accountId=\{person\.accountId\}/);
    assert.match(source, /employeeId=\{person\.employeeId\}/);
    assert.match(source, /accountId=\{personAccount\.id\}/);
    assert.match(source, /employeeId=\{personAccount\.employee\?\.id \?\? null\}/);
  }
});

test("completion evidence is platform-owned across all Work templates and closes on successful submit", () => {
  const employee = readFileSync(new URL("../src/pages/EmployeeWorkPage.tsx", import.meta.url), "utf8");

  assert.match(employee, /Optional evidence/);
  assert.match(employee, /Photos or PDF/);
  assert.match(employee, /accept="image\/jpeg,image\/png,image\/webp,application\/pdf"/);
  assert.match(employee, /files: completionFiles/);
  assert.match(employee, /setDialog\(null\)/);
  assert.doesNotMatch(employee, /selectedItem\.type[\s\S]{0,120}completionFiles/);
  assert.match(adapter, /const report = raw\.report \? mapCompletionReport/);
});
