import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../src/", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("organization workspace exposes leadership as a third inline section", async () => {
  const panel = await source("components/AdminOrganizationPanel.tsx");
  const leadership = await source("components/organization/OrganizationLeadershipPanel.tsx");
  const css = await source("styles/organization-workspace.css");

  assert.match(panel, /"STRUCTURE" \| "PEOPLE" \| "LEADERSHIP"/);
  assert.match(panel, /<OrganizationLeadershipPanel/);
  assert.match(leadership, /ACTING_OFFICE_HEAD/);
  assert.match(leadership, /ACTING_ORG_UNIT_HEAD/);
  assert.match(leadership, /ACTING_TEAM_LEAD/);
  assert.match(leadership, /DEPUTY/);
  assert.match(leadership, /actingEnd/);
  assert.match(leadership, /protectedOfficeHead/);
  assert.match(leadership, /getOrganizationPeopleActions/);
  assert.doesNotMatch(leadership, /leadership\/office-head/);
  assert.doesNotMatch(leadership, /dialog|drawer|aria-modal|backdrop-filter/i);
  assert.match(css, /organization-leadership-workspace/);
});

test("leadership service uses v3 leadership history and mutation endpoints", async () => {
  const service = await source("services/organization-v3.service.ts");
  const types = await source("types/organization-v3.ts");

  assert.match(service, /\/organization\/offices\/\$\{officeId\}\/leadership/);
  assert.match(service, /method: "POST"/);
  assert.match(service, /leadership\/\$\{assignmentId\}\/end/);
  assert.match(types, /OrganizationLeadershipType/);
  assert.match(types, /OrganizationLeadershipRecord/);
  assert.match(types, /isActing: boolean/);
  assert.match(types, /effectiveUntil: string \| null/);
});
