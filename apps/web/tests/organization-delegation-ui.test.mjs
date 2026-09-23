import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../src/", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("organization workspace exposes delegated access without legacy role gating", async () => {
  const panel = await source("components/AdminOrganizationPanel.tsx");
  const delegation = await source("components/organization/OrganizationDelegationPanel.tsx");
  const css = await source("styles/organization-workspace.css");

  assert.match(panel, /"DELEGATION"/);
  assert.match(panel, /<OrganizationDelegationPanel/);
  assert.match(delegation, /getOrganizationDelegationContext/);
  assert.match(delegation, /availableResponsibilities/);
  assert.match(delegation, /includeDescendants/);
  assert.match(delegation, /canRedelegate/);
  assert.match(delegation, /availableActions\.revoke/);
  assert.match(delegation, /RESPONSIBILITY_KEYS/);
  assert.match(delegation, /organizationDirectoryView/);
  assert.match(delegation, /organizationManagement/);
  assert.match(delegation, /workManagement/);
  assert.match(delegation, /dutyRosterManagement/);
  assert.match(delegation, /teamManagement/);
  assert.match(delegation, /reportsExport/);
  assert.match(delegation, /accountRequestCoordination/);
  assert.match(delegation, /officialCommunicationManagement/);
  assert.match(delegation, /organization-delegation-access-summary/);
  assert.match(delegation, /responsibilityCan/);
  assert.match(delegation, /responsibilityCannot/);
  assert.doesNotMatch(delegation, /SENIOR_MANAGEMENT|TEAM_MANAGER|SUPER_ADMIN/);
  assert.doesNotMatch(delegation, /type="text"[^>]*capability|name="capability"/i);
  assert.doesNotMatch(delegation, /dialog|drawer|aria-modal|backdrop-filter/i);
  assert.match(css, /organization-delegation-workspace/);
  assert.match(css, /repeat\(4, minmax\(0, 1fr\)\)/);
});

test("delegation service uses server context and create/revoke endpoints", async () => {
  const service = await source("services/organization-v3.service.ts");
  const types = await source("types/organization-v3.ts");

  assert.match(service, /delegations\/context/);
  assert.match(service, /\/delegations`/);
  assert.match(service, /delegations\/\$\{permissionId\}\/revoke/);
  assert.match(types, /OrganizationDelegationContextResponse/);
  assert.match(types, /OrganizationSharedResponsibility/);
  assert.match(types, /availableActions: \{/);
  assert.match(types, /revoke: boolean/);
});
