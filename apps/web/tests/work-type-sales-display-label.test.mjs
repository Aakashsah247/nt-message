import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const web = (path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");
const api = (path) => readFile(new URL(`../../api/src/work-management/${path}`, import.meta.url), "utf8");

test("custom Team + Sales exposes only an editable display label", async () => {
  const page = await web("pages/WorkTypeManagementPage.tsx");
  assert.match(page, /editor\.template === "TEAM_SALES" && !SYSTEM_WORK_TYPE_CODES\.has\(detail\.code\)/);
  assert.match(page, />Display label</);
  assert.match(page, /salesDisplayLabel/);
  assert.match(page, /Assignment, permissions, workflow and lifecycle remain unchanged/);
});

test("display alias is stored on the Work Type version while Sales runtime identifiers stay unchanged", async () => {
  const [service, items] = await Promise.all([
    api("work-type-v3.service.ts"),
    api("work-items.service.ts"),
  ]);
  assert.match(service, /configurationDto\.salesDisplayLabel/);
  assert.match(service, /published\.salesDisplayLabel/);
  assert.match(items, /version\.salesDisplayLabel/);
  assert.match(items, /salesMemberAccountId/);
  assert.match(items, /requiresSalesParticipant: template === WorkTypeTemplate\.TEAM_SALES/);
});

test("Create Work renders the selected Work Type display alias", async () => {
  const [page, detail, employee] = await Promise.all([
    web("pages/ManagementWorkPage.tsx"),
    web("pages/WorkDetailPage.tsx"),
    web("pages/EmployeeWorkPage.tsx"),
  ]);
  assert.match(page, /createSalesDisplayLabel/);
  assert.match(page, /\{createSalesDisplayLabel\} coordination/);
  assert.match(detail, /salesDisplayLabel/);
  assert.match(employee, /selectedSalesDisplayLabel/);
});
