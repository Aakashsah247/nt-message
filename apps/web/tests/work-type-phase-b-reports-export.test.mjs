import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const apiRoot = path.resolve(root, "../api");
const reportsService = fs.readFileSync(
  path.join(apiRoot, "src/work-management/work-reports-classic.service.ts"),
  "utf8",
);
const reportsPage = fs.readFileSync(path.join(root, "src/pages/WorkReportsMainPage.tsx"), "utf8");
const parityService = fs.readFileSync(path.join(root, "src/services/work-main-parity.service.ts"), "utf8");
const parityTypes = fs.readFileSync(path.join(root, "src/types/work-main-parity.ts"), "utf8");

test("Work records resolve version-bound Information and preserve historical fallback", () => {
  assert.match(reportsService, /information: this\.resolveReportInformation\(row\)/);
  assert.match(reportsService, /private resolveReportInformation\(row: WorkRecord\)/);
  assert.match(reportsService, /if \(version && fields\.length > 0\)/);
  assert.match(reportsService, /if \(collectionMode === 'STAGE_ONLY'\) return \[\];/);
  assert.match(reportsService, /if \(configuredReference\?\.id === field\.id\) return \[\];/);
  assert.match(reportsService, /Historical Work predating WorkTypeVersion bindings keeps the classic/);
});

test("CSV and print use generic Information instead of fixed telecom report columns", () => {
  assert.match(reportsService, /'Information'/);
  assert.match(reportsService, /\(row\.information \?\? \[\]\)[\s\S]{0,80}\.map\(\(item\) => item\.display\)[\s\S]{0,40}\.join\('; '\)/);
  assert.doesNotMatch(reportsService, /'Customer',\s*'Location',\s*'CPC Serial',\s*'OLT',\s*'FDC',\s*'FAP'/);
  assert.match(reportsPage, /<th>Information<\/th>/);
  assert.match(
    reportsPage,
    /row\.information[\s\S]{0,100}\.map\(\(item\) => item\.display\)[\s\S]{0,80}\.join\(" · "\)/,
  );
});

test("report client carries dynamic Information to the detail drawer", () => {
  assert.match(parityTypes, /information: Array<\{ code: string; label: string; value: string; display: string \}>;/);
  assert.match(parityService, /information: Array\.isArray\(record\.information\) \? record\.information : \[\]/);
  assert.match(reportsPage, /selectedRow\.information\.map\(\(item\) => \(/);
  assert.match(
    reportsPage,
    /<dt>\{item\.label\}<\/dt>\s*<dd>\{item\.value\}<\/dd>/,
  );
});
