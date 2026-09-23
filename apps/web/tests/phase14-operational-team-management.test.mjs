import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const nav = fs.readFileSync(new URL("../src/components/layout/management-navigation.ts", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../src/pages/TeamManagementPage.tsx", import.meta.url), "utf8");
const editor = fs.readFileSync(new URL("../src/pages/TeamEditorPage.tsx", import.meta.url), "utf8");
const detail = fs.readFileSync(new URL("../src/pages/TeamDetailPage.tsx", import.meta.url), "utf8");
const service = fs.readFileSync(new URL("../src/services/team-management.service.ts", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("../../api/src/team-management/team-management.service.ts", import.meta.url), "utf8");

 test("P14.2 keeps Team Management as a dedicated V3 workspace", () => {
  assert.match(app, /path="\/team-management"/);
  assert.match(app, /WorkspaceFeatureRoute feature="teamManagement"/);
  assert.match(nav, /"Team Management"[\s\S]*?"\/team-management"/);
});

test("Team Management uses simple routed list, create, detail, edit and removed pages", () => {
  assert.match(app, /\/team-management\/new/);
  assert.match(app, /\/team-management\/removed/);
  assert.match(app, /\/team-management\/:teamId\/edit/);
  assert.match(app, /\/team-management\/:teamId/);
  assert.doesNotMatch(page, /v3\.orgUnit|v3\.reason|v3\.code/);
  assert.match(editor, /TeamHierarchySelector/);
  assert.match(detail, /deleteOperationalTeam/);
});

test("Operational Team APIs stay separate from formal hierarchy leadership", () => {
  assert.match(service, /\/team-management\/teams/);
  assert.match(api, /prisma\.operationalTeam/);
  assert.match(api, /operationalTeamMember/);
  assert.match(api, /operationalTeamLeadAssignment/);
  assert.doesNotMatch(api, /OrgLeadershipType\.TEAM_LEAD/);
});

test("Team Lead remains a selected member and may lead multiple teams", () => {
  assert.match(api, /assertLeadIsMember/);
  assert.match(editor, /One employee may lead more than one team|simple\.teamLeadHelp/);
  assert.doesNotMatch(api, /leadEmployeeId[\s\S]{0,100}unique/i);
});

test("Team membership follows the selected organization branch and supports multiple teams", () => {
  assert.match(api, /orgUnitClosure\.findMany/);
  assert.match(api, /branchOrgUnitIds/);
  assert.match(api, /operationalTeamMemberships:[\s\S]*endsAt: null/);
  assert.doesNotMatch(api, /Choose only active employees whose primary membership is in the selected OrgUnit/);
});

test("Team delete preserves history and removed teams can be restored", () => {
  assert.match(service, /method: "DELETE"/);
  assert.match(service, /\/restore/);
  assert.match(api, /Team deleted\. Existing Work and history remain unchanged/);
  assert.match(api, /restoreTeam/);
});

test("team administration accepts formal leadership or explicit Team Management delegation", () => {
  assert.match(api, /Team Management authority/);
  assert.match(api, /CAPABILITIES\.TEAM_MANAGE/);
  assert.match(api, /assertCanManageUnit/);
  assert.match(api, /system administrator does not manage Work teams/);
});
