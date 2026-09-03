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

test("organization people workspace uses only V3 membership contracts", () => {
  assert.match(service, /\/organization\/offices\/\$\{officeId\}\/people/);
  assert.match(service, /memberships\/transfer-primary/);
  assert.match(service, /memberships\/\$\{membershipId\}\/end/);
  assert.match(panel, /getEmployeeOrganizationMemberships/);
  assert.match(panel, /getOrganizationPeopleActions/);
  assert.doesNotMatch(panel, /directory\/employees/);
  assert.doesNotMatch(panel, /organization\/divisions/);
  assert.doesNotMatch(panel, /organization\/departments/);
  assert.doesNotMatch(panel, /ManagementPosition|SENIOR_MANAGEMENT|TEAM_MANAGER/);
});

test("people placement actions stay inline and translated", () => {
  assert.match(adminPanel, /OrganizationPeoplePanel/);
  assert.match(adminPanel, /workspaceView === "PEOPLE"/);
  assert.match(panel, /organization-inline-editor organization-people-editor/);
  assert.doesNotMatch(panel, /dialog|backdrop|aria-modal/i);
  assert.match(css, /\.organization-people-layout/);
  assert.deepEqual(Object.keys(en.tabs), Object.keys(ne.tabs));
  assert.deepEqual(Object.keys(en.people), Object.keys(ne.people));
  assert.deepEqual(
    Object.keys(en.people.membershipTypes),
    Object.keys(ne.people.membershipTypes),
  );
  assert.deepEqual(
    Object.keys(en.people.errors),
    Object.keys(ne.people.errors),
  );
});
