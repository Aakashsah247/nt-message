import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const typesUrl = new URL("../src/types/messaging.ts", import.meta.url);
const serviceUrl = new URL("../src/services/messaging.service.ts", import.meta.url);
const pageUrl = new URL("../src/pages/MessageAppPage.tsx", import.meta.url);

test("P12-D exposes Office/OrgUnit official-group scopes and membership modes", async () => {
  const source = await readFile(typesUrl, "utf8");

  assert.match(source, /\| "OFFICE"/);
  assert.match(source, /\| "ORG_UNIT"/);
  assert.match(
    source,
    /OfficialGroupMembershipMode = "DIRECT_MEMBERS" \| "ENTIRE_SUBTREE"/,
  );
  assert.match(source, /officeId: string \| null/);
  assert.match(source, /orgUnitId: string \| null/);
  assert.match(source, /membershipMode: OfficialGroupMembershipMode \| null/);
});

test("P12-D create client forwards V3 official-group scope fields", async () => {
  const [serviceSource, pageSource] = await Promise.all([
    readFile(serviceUrl, "utf8"),
    readFile(pageUrl, "utf8"),
  ]);

  assert.match(serviceSource, /officeId\?: string/);
  assert.match(serviceSource, /orgUnitId\?: string/);
  assert.match(
    serviceSource,
    /membershipMode\?: "DIRECT_MEMBERS" \| "ENTIRE_SUBTREE"/,
  );
  assert.match(pageSource, /officeId: selectedOfficialGroupScope\.officeId/);
  assert.match(pageSource, /orgUnitId: selectedOfficialGroupScope\.orgUnitId/);
  assert.match(
    pageSource,
    /membershipMode: selectedOfficialGroupScope\.membershipMode/,
  );
});
