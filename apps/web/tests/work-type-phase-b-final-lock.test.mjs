import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const app = read("src/App.tsx");
const employee = read("src/pages/EmployeeWorkPage.tsx");
const management = read("src/pages/ManagementWorkPage.tsx");
const reports = read("src/pages/WorkReportsMainPage.tsx");
const reportService = read("../api/src/work-management/work-reports-classic.service.ts");
const lifecycle = read("../api/src/work-management/work-lifecycle.service.ts");
const workItems = read("../api/src/work-management/work-items.service.ts");

test("Phase B final lock keeps the restored old-model Create Work surface", () => {
  const createRoute = app.slice(
    app.indexOf('path="/work/create"'),
    app.indexOf('path="/work/:workItemId/edit"'),
  );
  assert.match(createRoute, /<ManagementWorkPage \/>/);
  assert.doesNotMatch(createRoute, /<WorkCreatePage \/>/);
});

test("new Work keeps the restored Create Work UI while published Information remains authoritative", () => {
  assert.match(management, /createInformationFields/);
  assert.match(management, /renderCreateInformationField/);
  assert.match(management, /createInformationFields\.map\(renderCreateInformationField\)/);
  assert.match(management, /workTypeVersionId: selectedCreateWorkType\.workTypeVersionId/);
  assert.match(management, /fields: configuredFields/);
  assert.match(workItems, /currentPublishedVersion/);
  assert.match(workItems, /This Work Type changed after this form was opened/);
});

test("Finish and review stay bound to the Work version and completion snapshot", () => {
  assert.match(management, /selectedUsesVersionBoundCompletion/);
  assert.match(management, /selectedWork\?\.workTypeVersion\?\.fields/);
  assert.match(management, /latestReport\?\.fieldValuesSnapshot/);
  assert.match(employee, /selectedItem\.workTypeVersion\?\.fields && report\.fieldValuesSnapshot/);
  assert.match(lifecycle, /dynamicCompletionContext/);
  assert.match(lifecycle, /fieldValuesSnapshot/);
});

test("Reports, CSV and print consume dynamic version-bound Information", () => {
  assert.match(reportService, /resolveReportInformation\(row\)/);
  assert.match(reportService, /'Information'/);
  assert.match(reportService, /Never use this fallback for version-bound Work/);
  assert.match(reports, /selectedRow\.information\.map/);
  assert.match(reports, /row\.information\.length > 0/);
});

test("Phase B preserves the fixed workflow templates while Information remains configurable", () => {
  const template = read("../api/src/work-management/fixed-work-type-template.ts");
  assert.match(template, /STANDARD/);
  assert.match(template, /TEAM_SALES/);
  assert.match(template, /ADMINISTRATIVE/);
  assert.match(lifecycle, /COMPLETED_PENDING_REVIEW/);
  assert.match(lifecycle, /INFORMATION_REQUESTED/);
});
