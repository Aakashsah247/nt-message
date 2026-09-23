import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(
  new URL("../src/components/organization/OrganizationPeoplePanel.tsx", import.meta.url),
  "utf8",
);
const adminPanel = readFileSync(
  new URL("../src/components/AdminOrganizationPanel.tsx", import.meta.url),
  "utf8",
);
const service = readFileSync(
  new URL("../src/services/organization-v3.service.ts", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("../src/styles/organization-workspace.css", import.meta.url),
  "utf8",
);
const en = JSON.parse(readFileSync(
  new URL("../src/i18n/locales/en/organization.json", import.meta.url),
  "utf8",
));
const ne = JSON.parse(readFileSync(
  new URL("../src/i18n/locales/ne/organization.json", import.meta.url),
  "utf8",
));

test("organization placement actions reuse V3 membership contracts", () => {
  assert.match(service, /\/organization\/offices\/\$\{officeId\}\/people/);
  assert.match(service, /memberships\/transfer-primary/);
  assert.match(panel, /getOrganizationPeopleActions/);
  assert.match(panel, /transferPrimaryOrganizationMembership/);
  assert.match(panel, /assignOrganizationMembership/);
  assert.doesNotMatch(panel, /directory\/employees/);
  assert.doesNotMatch(panel, /organization\/divisions/);
  assert.doesNotMatch(panel, /organization\/departments/);
  assert.doesNotMatch(panel, /ManagementPosition|SENIOR_MANAGEMENT|TEAM_MANAGER/);
});

test("duplicate People workspace is removed and placement stays inside Structure", () => {
  assert.match(adminPanel, /OrganizationPeoplePanel/);
  assert.doesNotMatch(adminPanel, /workspaceView === "PEOPLE"/);
  assert.doesNotMatch(adminPanel, /tabs\.people/);
  assert.match(adminPanel, /unit=\{selectedUnit\}/);
  assert.match(adminPanel, /people=\{structurePeople\}/);
  assert.match(panel, /organization-unit-placement-editor/);
  assert.doesNotMatch(panel, /Person details|Past and current assignments|organization-person-detail-panel/);
  assert.match(css, /\.organization-unit-person-actions/);
  assert.deepEqual(Object.keys(en.tabs), Object.keys(ne.tabs));
  assert.deepEqual(Object.keys(en.people), Object.keys(ne.people));
  assert.deepEqual(Object.keys(en.people.errors), Object.keys(ne.people.errors));
});
