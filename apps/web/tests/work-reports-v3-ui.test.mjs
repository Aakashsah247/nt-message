import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
}

const apiSource = (relativePath) =>
  readFile(new URL(`../../api/src/${relativePath}`, import.meta.url), "utf8");

test("Reports page uses classic Work report contracts", async () => {
  const [page, service, backend] = await Promise.all([
    source("pages/WorkReportsPage.tsx"),
    source("services/work-reports.service.ts"),
    apiSource("work-management/work-reports-classic.service.ts"),
  ]);

  assert.match(page, /getWorkReportContext/);
  assert.match(page, /getWorkReportOverview/);
  assert.match(page, /getWorkReportWorkRecords/);
  assert.match(page, /getWorkReportTechnicalPerformance/);
  assert.match(service, /\/work-reports\/offices\/\$\{officeId\}/);
  assert.match(backend, /WorkItemStatus\.COMPLETED_PENDING_REVIEW/);
  assert.match(backend, /assignedOperationalTeam/);
  assert.doesNotMatch(page, /Stage|STAGE_SLA|runtimeStatus|WorkRuntimeV3/);
  assert.doesNotMatch(service, /WorkReportV3|getWorkReportV3|\/v3\//);
});

test("Reports keeps Duty on the V3 Office, OrgUnit and Operational Team report path", async () => {
  const [page, service] = await Promise.all([
    source("pages/WorkReportsPage.tsx"),
    source("services/work-reports.service.ts"),
  ]);

  assert.match(page, /getLegacyDutyReportPage/);
  assert.match(page, /operationalTeamId/);
  assert.match(page, /Planned Duty is scheduling data, not attendance/);
  assert.doesNotMatch(page, /getWorkReportDutyCompatibility/);
  assert.match(service, /dataset:\s*"DUTY_ASSIGNMENTS"/);
});

test("legacy Work report clients remain retired while Duty uses its isolated scheduling endpoints", async () => {
  const [page, workService, reportService, legacyTypes] = await Promise.all([
    source("pages/WorkReportsPage.tsx"),
    source("services/work-management.service.ts"),
    source("services/work-reports.service.ts"),
    source("types/work-management.ts"),
  ]);

  assert.doesNotMatch(
    page,
    /getWorkReportSummary|getWorkReportDrilldown|downloadWorkReportCsv\(accessToken, query/,
  );
  assert.doesNotMatch(
    workService,
    /\/work-reports\/summary|\/work-reports\/drilldown|\/work-reports\/export/,
  );
  assert.match(reportService, /getLegacyDutyReportPage/);
  assert.match(reportService, /downloadLegacyDutyReportCsv/);
  assert.doesNotMatch(
    legacyTypes,
    /WorkReportDrilldownWorkRow|WorkReportPerformanceSection|WorkReportSummary/,
  );
});

test("report actions are backend-driven and exports use full-dataset endpoints", async () => {
  const [page, service] = await Promise.all([
    source("pages/WorkReportsPage.tsx"),
    source("services/work-reports.service.ts"),
  ]);

  assert.match(page, /context\?\.scope\.availableActions\.view/);
  assert.match(page, /context\?\.scope\.availableActions\.export/);
  assert.match(page, /getWorkReportPrintPayload/);
  assert.match(page, /downloadWorkReportCsv/);
  assert.match(service, /\/print-data/);
  assert.match(service, /\/export/);
  assert.doesNotMatch(
    page,
    /createWorkRuntimeV3|assignWorkRuntimeV3Stage|completeWorkRuntimeV3/,
  );
});

test("Reports exposes four final views and Operational Team remains the execution dimension", async () => {
  const page = await source("pages/WorkReportsPage.tsx");

  for (const view of [
    "OVERVIEW",
    "TECHNICAL_PERFORMANCE",
    "WORK_RECORDS",
    "DUTY",
  ]) {
    assert.match(page, new RegExp(`"${view}"`));
  }
  assert.doesNotMatch(page, /"STAGE_SLA"/);
  assert.match(page, /overview\.teams\.length > 0/);
  assert.match(page, /overview\.teams\.map/);
  assert.match(page, /row\.orgUnitName/);
  assert.doesNotMatch(page, /overview\.teamExecution/);
  assert.match(page, /context\.filters\.operationalTeams/);
  assert.doesNotMatch(page, /orgUnitType\.isTeam/);
});

test("Reports uses bilingual copy and the active shared report visual vocabulary", async () => {
  const [page, i18n, css, en, ne] = await Promise.all([
    source("pages/WorkReportsPage.tsx"),
    source("i18n/index.ts"),
    source("styles/work-management.css"),
    source("i18n/locales/en/reports.json"),
    source("i18n/locales/ne/reports.json"),
  ]);

  assert.match(page, /useTranslation\("reports"\)/);
  assert.match(i18n, /reportsEn/);
  assert.match(i18n, /reportsNe/);
  assert.match(page, /report-v2-shell/);
  assert.match(page, /report-v2-tabs/);
  assert.match(css, /UAT Super Admin Reports final workspace/);
  assert.match(css, /\.superadmin-report-parity \.report-v2-tabs/);
  assert.match(css, /--nt-report-blue/);
  assert.match(css, /--nt-report-gold/);
  assert.deepEqual(Object.keys(JSON.parse(en)), Object.keys(JSON.parse(ne)));
});

test("Reports stays backend-scoped while Super Admin has read-only oversight", async () => {
  const [app, navigation, hierarchy] = await Promise.all([
    source("App.tsx"),
    source("components/layout/management-navigation.ts"),
    apiSource("organization/organization-hierarchy.service.ts"),
  ]);

  const routeBlock = app.slice(
    app.indexOf('path="/work-reports"'),
    app.indexOf("</Route>", app.indexOf('path="/work-reports"')),
  );
  assert.match(routeBlock, /ALL_ACCOUNT_CLASSES/);
  assert.match(routeBlock, /WorkspaceFeatureRoute feature="reports"/);
  assert.match(navigation, /context\.features\.reports/);
  assert.match(navigation, /"\/work-reports"/);
  assert.match(hierarchy, /reports: isFormalManager \|\| hasDelegatedReports/);
  const superAdminContext = hierarchy.slice(
    hierarchy.indexOf("if (user.accountClass === AccountClass.SUPER_ADMIN)"),
    hierarchy.indexOf("const now = new Date();"),
  );
  assert.match(superAdminContext, /reports: true/);
});
