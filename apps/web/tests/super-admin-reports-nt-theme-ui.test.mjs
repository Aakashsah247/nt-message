import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [page, css] = await Promise.all([
  readFile(new URL("../src/pages/WorkReportsPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/work-management.css", import.meta.url), "utf8"),
]);

test("Super Admin Reports keeps only essential report context in the hero", () => {
  assert.match(page, /superadmin-report-hero/);
  assert.match(page, /Read-only Work and Duty reporting for the selected Office/);
  assert.match(page, /Read-only oversight/);
  assert.doesNotMatch(page, /superadmin-report-toolbar__summary/);
  assert.doesNotMatch(page, /Multi-office oversight remains read only for Super Admin/);
});

test("Super Admin Reports keeps filters, search, and actions in one compact control system", () => {
  assert.match(page, /superadmin-report-filter-grid/);
  assert.match(page, /className="is-date"/);
  assert.match(page, /className="is-office"/);
  assert.match(page, /className="is-search"/);
  assert.match(page, /superadmin-report-filter-actions/);
  assert.match(page, /superadmin-report-filter-actions__apply/);
  assert.match(page, /superadmin-report-filter-actions__output/);
  assert.match(page, /setPeriodPreset\("CUSTOM"\)/);
  assert.match(page, />\s*Reset\s*</);
  assert.match(page, /t\("actions\.apply"\)/);
  assert.match(page, /t\("actions\.csv"\)/);
  assert.match(page, /t\("actions\.print"\)/);
});

test("Super Admin Reports removes repeated KPI helper copy and fixes empty report states", () => {
  assert.doesNotMatch(page, /Office-level oversight snapshot/);
  assert.doesNotMatch(page, /Current workflow distribution/);
  assert.match(page, /No Work records match the selected filters/);
  assert.match(page, /No Duty records match the selected filters/);
  assert.match(page, /if \(totalPages <= 1\) return null/);
});

test("Super Admin Reports uses Nepal Telecom colors, responsive filters, and restrained motion", () => {
  assert.match(css, /--nt-report-blue/);
  assert.match(css, /--nt-report-gold/);
  assert.match(css, /--nt-report-red/);
  assert.match(css, /\.superadmin-report-hero/);
  assert.match(css, /\.superadmin-report-filters\s*\{[\s\S]{0,180}grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.superadmin-report-filter-grid/);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.superadmin-report-filter-actions/);
  assert.match(css, /overflow-x: clip/);
  assert.match(css, /@keyframes nt-report-enter/);
  assert.match(css, /prefers-reduced-motion/);
});
