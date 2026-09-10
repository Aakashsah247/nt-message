import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const types = new URL("../src/types/directory.ts", import.meta.url);
const list = new URL("../src/components/EmployeeDirectory.tsx", import.meta.url);
const detail = new URL("../src/components/EmployeeDirectoryDetailPanel.tsx", import.meta.url);

test("P12-H directory exposes Office, primary OrgUnit, breadcrumb and leadership", async () => {
  const [typeSource, listSource, detailSource] = await Promise.all([
    readFile(types, "utf8"),
    readFile(list, "utf8"),
    readFile(detail, "utf8"),
  ]);
  assert.match(typeSource, /primaryOrgUnit/);
  assert.match(typeSource, /orgUnitBreadcrumb/);
  assert.match(typeSource, /leadership/);
  assert.match(listSource, /orgUnitBreadcrumb/);
  assert.match(detailSource, /detail\.organization\.breadcrumb/);
  assert.doesNotMatch(detailSource, /detail\.organization\.divisionCode/);
});
