import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
}

const [page, styles] = await Promise.all([
  source("pages/WorkPage.tsx"),
  source("styles/work-management.css"),
]);

test("Work Oversight uses the dedicated Nepal Telecom command-surface treatment", () => {
  assert.match(page, /work-oversight-readonly/);
  assert.match(page, /Read-only oversight/);
  assert.match(page, /Operational visibility without Work mutation/);
  assert.match(styles, /\.work-oversight-page \.workspace-page__header[\s\S]*linear-gradient\(118deg/);
  assert.match(styles, /--nt-gold: #f5b51b/);
  assert.match(styles, /--nt-red: #df2638/);
});

test("Work Oversight summary and work cards carry operational hierarchy without changing Work behavior", () => {
  assert.match(page, /work-summary-card--visible/);
  assert.match(page, /work-summary-card--review/);
  assert.match(page, /work-summary-card--overdue/);
  assert.match(page, /className=\{`work-list-card\$\{isOverdue \? " is-overdue" : ""\}`\}/);
  assert.match(page, /work-list-card__open/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test("Work Oversight motion remains restrained and reduced-motion safe", () => {
  assert.match(styles, /@keyframes ntOversightEnter/);
  assert.match(styles, /@keyframes ntOversightPulse/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.work-oversight-readonly__signal::after/);
});
