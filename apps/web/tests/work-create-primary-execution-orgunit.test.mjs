import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const page = fs.readFileSync(path.join(root, "src/pages/WorkCreatePage.tsx"), "utf8");
const types = fs.readFileSync(path.join(root, "src/types/work-management.ts"), "utf8");
const dto = fs.readFileSync(
  path.join(root, "../api/src/work-management/dto/create-work-item.dto.ts"),
  "utf8",
);

test("Create Work always submits a real Primary Execution OrgUnit UUID source", () => {
  assert.match(types, /primaryExecutionOrgUnitId: string;/);
  assert.match(dto, /@IsUUID\('4'\)[\s\S]*?primaryExecutionOrgUnitId!: string;/);
  assert.match(
    page,
    /const primaryExecutionOrgUnit =[\s\S]*?selectedTeam\?\.orgUnit[\s\S]*?selectedAssignee\?\.orgUnit[\s\S]*?selectedWorkType\?\.primaryOwnerOrgUnit/,
  );
  assert.match(
    page,
    /primaryExecutionOrgUnitId: primaryExecutionOrgUnit\.id/,
  );
});

test("Administrative individual Work derives its Main organization from the selected employee OrgUnit", () => {
  assert.match(page, /selectedAssignee\?\.orgUnit/);
  assert.match(page, /primaryExecutionOrgUnit\?\.name \?\? "Not selected"/);
});

test("Create Work keeps the Work Type owner only as the fallback organization", () => {
  const resolver = page.slice(
    page.indexOf("const primaryExecutionOrgUnit ="),
    page.indexOf("const mainExecutorAccountIds"),
  );
  assert.ok(resolver.indexOf("selectedTeam?.orgUnit") < resolver.indexOf("selectedWorkType?.primaryOwnerOrgUnit"));
  assert.ok(resolver.indexOf("selectedAssignee?.orgUnit") < resolver.indexOf("selectedWorkType?.primaryOwnerOrgUnit"));
});
