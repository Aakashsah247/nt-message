import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = fs.readFileSync(path.join(root, "src/pages/WorkDetailPage.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/styles/work-management.css"), "utf8");

test("Work detail uses the Nepal Telecom operational detail hierarchy", () => {
  assert.match(page, /className="workspace-page__header work-detail-hero"/);
  assert.match(page, /Current status/);
  assert.match(page, /work-detail-panel--responsibility/);
  assert.match(page, /work-detail-panel--information/);
  assert.match(page, /work-detail-section-heading/);
  assert.match(page, /work-activity-timeline/);
});

test("read-only Work detail does not render an empty Actions card", () => {
  assert.match(page, /const hasAvailableAction =/);
  assert.match(page, /\{hasAvailableAction && \(/);
  assert.match(page, /const canCancel =/);
});

test("Work detail styling keeps NT colors, motion, responsive layout and reduced-motion safety", () => {
  assert.match(css, /--work-detail-blue:\s*#063f73/);
  assert.match(css, /--work-detail-gold:\s*#f5b51b/);
  assert.match(css, /--work-detail-red:\s*#df2840/);
  assert.match(css, /@keyframes\s+work-detail-rise/);
  assert.match(css, /\.work-activity-entry:not\(:last-child\)::before/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /\.work-detail-page \*::before/);
  assert.match(css, /animation:\s*none !important/);
});
