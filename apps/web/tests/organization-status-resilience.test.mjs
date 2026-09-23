import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apiUrl = new URL("../src/lib/api.ts", import.meta.url);
const serviceUrl = new URL(
  "../src/services/organization-v3.service.ts",
  import.meta.url,
);
const panelUrl = new URL(
  "../src/components/AdminOrganizationPanel.tsx",
  import.meta.url,
);
const hierarchyUrl = new URL(
  "../../api/src/organization/organization-hierarchy.service.ts",
  import.meta.url,
);

test("organization status change retries one interrupted idempotent request", async () => {
  const [api, service] = await Promise.all([
    readFile(apiUrl, "utf8"),
    readFile(serviceUrl, "utf8"),
  ]);

  assert.match(api, /export class ApiNetworkError extends Error/);
  assert.match(api, /throw new ApiNetworkError\(\)/);
  assert.match(service, /requestOrganizationUnitStatus/);
  assert.match(service, /if \(!isApiNetworkError\(error\)\)/);
  assert.match(service, /setTimeout\(resolve, 400\)/);
  assert.equal(service.includes("window.location.reload"), false);
});

test("organization status UI replaces raw Failed to fetch with localized connection feedback", async () => {
  const panel = await readFile(panelUrl, "utf8");

  assert.match(panel, /isApiNetworkError\(requestError\)/);
  assert.match(panel, /t\("errors\.connectionInterrupted"\)/);
  assert.equal(panel.includes('setEditorError("Failed to fetch")'), false);
});

test("unit status response does not wait for best-effort official-group synchronization", async () => {
  const hierarchy = await readFile(hierarchyUrl, "utf8");

  assert.match(hierarchy, /synchronizeOfficialGroupsAfterUnitStatus/);
  assert.match(
    hierarchy,
    /void this\.conversationsService\?\.synchronizeAllOfficialGroupsSafely/,
  );
  assert.doesNotMatch(
    hierarchy,
    /await this\.conversationsService\?\.synchronizeAllOfficialGroupsSafely\(\s*user\.accountId,\s*dto\.isActive \? 'ORG_UNIT_ACTIVATED'/,
  );
});
