import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
}

test("P10-5 Reports page uses the V3 report contracts for Work reporting", async () => {
  const [page, service] = await Promise.all([
    source("pages/WorkReportsPage.tsx"),
    source("services/work-reports-v3.service.ts"),
  ]);

  assert.match(page, /getWorkReportV3Context/);
  assert.match(page, /getWorkReportV3Overview/);
  assert.match(page, /getWorkReportV3WorkRecords/);
  assert.match(page, /getWorkReportV3TechnicalPerformance/);
  assert.match(page, /getWorkReportV3StageAnalysis/);
  assert.match(service, /\/work-reports\/v3\/offices\/\$\{officeId\}/);
  assert.doesNotMatch(page, /getWorkReportSummary/);
});

test("P10-5 keeps Duty on compatibility reads while Work reports are V3", async () => {
  const [page, service] = await Promise.all([
    source("pages/WorkReportsPage.tsx"),
    source("services/work-reports-v3.service.ts"),
  ]);

  assert.match(page, /getWorkReportV3DutyCompatibility/);
  assert.match(page, /getLegacyDutyReportPage/);
  assert.match(page, /loadAllDutyRows/);
  assert.match(page, /t\("reports:duty\.compatibility"\)/);
  assert.match(service, /dataset:\s*"DUTY_ASSIGNMENTS"/);
});

test("P10-6 removes active legacy Work report clients and keeps only Duty compatibility", async () => {
  const [page, workService, reportService, legacyTypes] = await Promise.all([
    source("pages/WorkReportsPage.tsx"),
    source("services/work-management.service.ts"),
    source("services/work-reports-v3.service.ts"),
    source("types/work-management.ts"),
  ]);

  assert.doesNotMatch(page, /getWorkReportSummary|getWorkReportDrilldown|downloadWorkReportCsv/);
  assert.doesNotMatch(workService, /\/work-reports\/summary|\/work-reports\/drilldown|\/work-reports\/export/);
  assert.match(reportService, /getLegacyDutyReportPage/);
  assert.match(reportService, /downloadLegacyDutyReportCsv/);
  assert.doesNotMatch(legacyTypes, /WorkReportDrilldownWorkRow|WorkReportPerformanceSection|WorkReportSummary/);
});

test("P10-5 report actions are backend-driven and exports use full-dataset endpoints", async () => {
  const [page, service] = await Promise.all([
    source("pages/WorkReportsPage.tsx"),
    source("services/work-reports-v3.service.ts"),
  ]);

  assert.match(page, /context\?\.scope\.availableActions\.view/);
  assert.match(page, /context\?\.scope\.availableActions\.export/);
  assert.match(page, /getWorkReportV3PrintPayload/);
  assert.match(page, /downloadWorkReportV3Csv/);
  assert.match(service, /\/print-data/);
  assert.match(service, /\/export/);
  assert.doesNotMatch(page, /createWorkRuntimeV3|assignWorkRuntimeV3Stage|completeWorkRuntimeV3/);
});

test("P10-5 exposes all five report views and makes Operational Team an execution dimension", async () => {
  const page = await source("pages/WorkReportsPage.tsx");

  for (const view of ["OVERVIEW", "TECHNICAL_PERFORMANCE", "WORK_RECORDS", "STAGE_SLA", "DUTY"]) {
    assert.match(page, new RegExp(`"${view}"`));
  }
  assert.match(page, /overview\.teamExecution/);
  assert.match(page, /overview\.teamExecutionOnly/);
  assert.match(page, /filters\.operationalTeams/);
  assert.doesNotMatch(page, /orgUnitType\.isTeam/);
});

test("P10-5 uses bilingual report copy and removes obsolete report-specific CSS", async () => {
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
  assert.doesNotMatch(css, /report-v2-/);
  assert.doesNotMatch(css, /performance-report-page/);
  assert.deepEqual(Object.keys(JSON.parse(en)), Object.keys(JSON.parse(ne)));
});

test("P10-5 allows Employee personal report access through the canonical route and navigation", async () => {
  const [app, navigation] = await Promise.all([
    source("App.tsx"),
    source("components/layout/management-navigation.ts"),
  ]);

  const routeBlock = app.slice(app.indexOf('path="/work-reports"'), app.indexOf("</Route>", app.indexOf('path="/work-reports"')));
  assert.match(routeBlock, /"EMPLOYEE"/);
  const employeeStart = navigation.indexOf("const EMPLOYEE_NAVIGATION");
  const employeeEnd = navigation.indexOf("function getManagerNavigation", employeeStart);
  assert.match(navigation.slice(employeeStart, employeeEnd), /path:\s*"\/work-reports"/);
});
