import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(new URL("../src/pages/OfficeDashboardPage.tsx", import.meta.url), "utf8");
const hierarchy = readFileSync(new URL("../../api/src/organization/organization-hierarchy.service.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/manager-workspace.css", import.meta.url), "utf8");
const organizationTypes = readFileSync(new URL("../src/types/organization-v3.ts", import.meta.url), "utf8");

test("P15 dashboard uses operational data instead of architecture counters", () => {
  assert.match(dashboard, /listWorkItems/);
  assert.doesNotMatch(dashboard, /listWorkRuntimeV3|WorkRuntimeV3/);
  assert.match(dashboard, /getDutyManagementSummary/);
  assert.match(dashboard, /getMyDutySummary/);
  assert.match(dashboard, /getPersonalDashboardSummary/);
  assert.doesNotMatch(dashboard, /Derived from active V3 assignments/);
  assert.doesNotMatch(dashboard, /Office scope/);
});

test("P15 employee dashboard restores actionable daily Work and Duty context", () => {
  assert.match(dashboard, /dashboardV3\.metrics\.newWork/);
  assert.match(dashboard, /dashboardV3\.metrics\.dueToday/);
  assert.match(dashboard, /dashboardV3\.metrics\.completedToday/);
  assert.match(dashboard, /dashboardV3\.metrics\.needAttention/);
  assert.match(dashboard, /manager-home__duty-card/);
  assert.match(dashboard, /dashboardV3\.dutyCard\.openMyDuty/);
  assert.doesNotMatch(dashboard, /dashboardV3\.metrics\.teamResponsibility/);
  assert.doesNotMatch(dashboard, /dashboardV3\.metrics\.notifications/);
});

test("P15 dashboard exposes only the primary leaf placement instead of a hierarchy breadcrumb", () => {
  assert.match(hierarchy, /primaryPlacement/);
  assert.match(hierarchy, /membershipType === OrgMembershipType\.PRIMARY/);
  assert.match(organizationTypes, /primaryPlacement:/);
  assert.match(dashboard, /placement\?\.orgUnit\?\.name \?\? placement\?\.office\.name/);
  assert.match(dashboard, /manager-home__placement/);
  assert.doesNotMatch(dashboard, /breadcrumb|parentOrgUnitId.*placementLabel/i);
});

test("P15 Team Lead remains a conditional responsibility, not a permanent employee metric", () => {
  assert.match(hierarchy, /contextual employee assignment/);
  assert.match(hierarchy, /\('EMPLOYEE' as const\)/);
  assert.match(dashboard, /isOperationalTeamLead/);
  assert.match(dashboard, /manager-home__lead-responsibilities/);
  assert.match(dashboard, /dashboardV3\.lead/);
});

test("P15 dashboard uses Nepal Telecom theme, lightweight motion and responsive cards", () => {
  assert.match(dashboard, /manager-home__metrics/);
  assert.match(dashboard, /manager-home__dashboard-grid/);
  assert.doesNotMatch(dashboard, /manager-home__quick-actions/);
  assert.match(css, /manager-home__duty-card/);
  assert.match(css, /var\(--manager-gold\)/);
  assert.match(css, /var\(--manager-red\)/);
  assert.match(css, /@keyframes manager-dashboard-enter/);
  assert.match(css, /prefers-reduced-motion/);
});

test("P15 Office Head dashboard balances all major V3 workspace domains", () => {
  assert.match(dashboard, /listDirectoryEmployees/);
  assert.match(dashboard, /getOrganizationTree/);
  assert.match(dashboard, /manager-home__office-command-grid/);
  assert.match(dashboard, /manager-home__domain-card--people/);
  assert.match(dashboard, /manager-home__domain-card--work/);
  assert.match(dashboard, /manager-home__domain-card--duty/);
  assert.match(dashboard, /manager-home__domain-card--communication/);
  assert.match(dashboard, /manager-home__workspace-tools/);
  assert.match(dashboard, /features\.organizationManage/);
  assert.match(dashboard, /features\.accountRequests/);
  assert.match(dashboard, /features\.workManagement/);
  assert.match(dashboard, /features\.workTypes/);
  assert.match(dashboard, /features\.dutyRoster/);
  assert.match(dashboard, /features\.teamManagement/);
  assert.match(dashboard, /features\.reports/);
  assert.match(dashboard, /features\.messages/);
  assert.match(dashboard, /features\.settings/);
  assert.match(dashboard, /features\.emergency/);
  assert.match(dashboard, /EmergencyAlertButton/);
});

test("P15 scoped hierarchy Heads use the professional cross-feature V3 dashboard", () => {
  assert.match(dashboard, /isProfessionalHead = isOfficeHead \|\| isScopedHead/);
  assert.match(dashboard, /countScopedActiveOrgUnits/);
  assert.match(dashboard, /dashboardV3\.scopedHead/);
  assert.match(dashboard, /roleWithUnit/);
  assert.match(dashboard, /isHierarchyHead && context\.features\.directory/);
  assert.match(dashboard, /isHierarchyHead && context\.features\.organizationView/);
  assert.match(dashboard, /isProfessionalHead \? \(/);
  assert.match(dashboard, /features\.workTypes/);
  assert.match(dashboard, /features\.accountRequests/);
  assert.match(dashboard, /features\.dutyRoster/);
  assert.match(dashboard, /features\.teamManagement/);
  assert.match(dashboard, /features\.messages/);
  assert.match(dashboard, /features\.emergency/);
});
