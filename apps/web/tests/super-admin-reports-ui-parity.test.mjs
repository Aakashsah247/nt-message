import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [page, mainPage, css] = await Promise.all([
  readFile(new URL("../src/pages/WorkReportsPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/WorkReportsMainPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/work-management.css", import.meta.url), "utf8"),
]);

test("Super Admin Reports uses the Office User report-v2 visual vocabulary", () => {
  for (const className of [
    "report-v2-shell",
    "report-v2-header",
    "report-v2-filter-panel",
    "report-v2-tabs",
    "report-v2-filters",
    "report-v2-kpi-grid",
  ]) {
    assert.match(page, new RegExp(className));
  }

  assert.match(mainPage, /report-v2-tabs/);
  assert.match(mainPage, /report-v2-filters/);
  assert.match(page, /superadmin-report-filter-actions/);
});

test("Super Admin Reports preserves the dedicated report logic and Office selector", () => {
  assert.match(page, /getWorkReportContext/);
  assert.match(page, /getWorkReportOverview/);
  assert.match(page, /value=\{officeId\}/);
});

test("Super Admin Reports uses the finalized Nepal Telecom report workspace", () => {
  assert.match(css, /UAT Super Admin Reports final workspace/);
  assert.match(css, /\.superadmin-report-parity \.report-v2-tabs/);
  assert.match(css, /--nt-report-blue/);
  assert.match(css, /--nt-report-gold/);
  assert.match(css, /@media\s*\(\s*max-width:\s*820px\s*\)/);
  assert.match(css, /@media\s*\(\s*max-width:\s*520px\s*\)/);
  assert.match(css, /prefers-reduced-motion/);
});
