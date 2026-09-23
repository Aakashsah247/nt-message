import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apiService = await readFile(
  new URL("../../api/src/organization/organization-delegation.service.ts", import.meta.url),
  "utf8",
);
const panel = await readFile(
  new URL("../src/components/organization/OrganizationDelegationPanel.tsx", import.meta.url),
  "utf8",
);

test("Shared Access employee candidates follow the selected OrgUnit scope", () => {
  assert.match(apiService, /resolveScopedOrgUnitIds/);
  assert.match(apiService, /orgUnitId: \{ in: scopedCandidateOrgUnitIds \}/);
  assert.match(apiService, /orgUnitId: \{ in: scopedGranteeOrgUnitIds \}/);
  assert.match(panel, /response\.candidates\.some/);
});
