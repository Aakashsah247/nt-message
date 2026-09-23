import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(
  new URL("../src/pages/WorkReportsPage.tsx", import.meta.url),
  "utf8",
);

test("UAT-REPORT-01 removes the retired Overview response collections", () => {
  assert.doesNotMatch(page, /organizationPerformance/);
  assert.doesNotMatch(page, /teamExecution/);
});

test("UAT-REPORT-01 renders the finalized V3 workflow and teams", () => {
  assert.match(page, /overview\.workflow\.newWork/);
  assert.match(page, /overview\.workflow\.waitingForSales/);
  assert.match(page, /overview\.workflow\.waitingForApproval/);
  assert.match(page, /overview\.workflow\.completedDuring/);
  assert.match(page, /overview\.teams\.length > 0/);
  assert.match(page, /overview\.teams\.map/);
  assert.match(page, /row\.orgUnitName/);
});

test("UAT-REPORT-01 is a contract correction rather than an optional-chain mask", () => {
  assert.doesNotMatch(page, /organizationPerformance\?\.map/);
  assert.doesNotMatch(page, /teamExecution\?\.map/);
});
