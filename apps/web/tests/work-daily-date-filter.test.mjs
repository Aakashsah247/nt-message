import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [adapter, employeeWork] = await Promise.all([
  readFile(new URL("../src/services/work-main-parity.service.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/EmployeeWorkPage.tsx", import.meta.url), "utf8"),
]);

test("daily Work filtering accepts both date-only and exact ISO boundaries", () => {
  assert.match(adapter, /function rangeBoundaryTime\(value: string, endOfDay: boolean\)/);
  assert.match(adapter, /const dateOnly = \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//);
  assert.match(adapter, /dateOnly[\s\S]*: normalized/);
  assert.match(adapter, /const fromTime = rangeBoundaryTime\(from, false\)/);
  assert.match(adapter, /const toTime = rangeBoundaryTime\(to, true\)/);
});

test("Completed Today uses the Work terminal timestamp and refreshes after the local day changes", () => {
  assert.match(
    adapter,
    /raw\.status === "CLOSED"[\s\S]*raw\.closedAt \?\? raw\.completedAt \?\? raw\.updatedAt/,
  );
  assert.match(
    adapter,
    /raw\.status === "CANCELLED"[\s\S]*raw\.cancelledAt \?\? raw\.updatedAt/,
  );
  assert.match(
    adapter,
    /dateInRange\(historyTimestamp\(raw\), query\.historyFrom, query\.historyTo\)/,
  );
  assert.match(employeeWork, /setInterval\([\s\S]*getLocalDayRange\(\)\.dayKey/);
  assert.match(employeeWork, /\[accessToken, dayKey, refreshKey\]/);
  assert.match(employeeWork, /historyFrom: range\.from/);
  assert.match(employeeWork, /historyTo: range\.to/);
});
