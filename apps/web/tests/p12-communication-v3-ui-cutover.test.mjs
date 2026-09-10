import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../src/pages/MessageAppPage.tsx", import.meta.url);
const enUrl = new URL("../src/i18n/locales/en/messaging.json", import.meta.url);
const neUrl = new URL("../src/i18n/locales/ne/messaging.json", import.meta.url);

test("P12-I presents Office and OrgUnit communication context", async () => {
  const source = await readFile(pageUrl, "utf8");

  assert.match(source, /scope\.scopeType === "OFFICE"/);
  assert.match(source, /scope\.scopeType === "ORG_UNIT"/);
  assert.match(source, /employeeOrgContextLabel/);
  assert.match(source, /profileData\.official\?\.primaryOrgUnit/);
  assert.match(source, /profileData\.official\?\.orgUnitBreadcrumb/);
  assert.match(source, /scope\.scopeType === "OFFICE" \|\| scope\.scopeType === "ORG_UNIT"/);
  assert.doesNotMatch(
    source,
    /contact\.employee\?\.department\?\.name\s*\?\?\s*contact\.employee\?\.division\?\.name/,
  );
  assert.doesNotMatch(
    source,
    /peer\?\.employee\?\.department\?\.name\s*\?\?\s*peer\?\.employee\?\.division\?\.name/,
  );
});

test("P12-I keeps the new communication labels bilingual", async () => {
  const [en, ne] = await Promise.all([
    readFile(enUrl, "utf8").then(JSON.parse),
    readFile(neUrl, "utf8").then(JSON.parse),
  ]);

  for (const key of ["office", "orgUnit", "directMembers", "entireSubtree"]) {
    assert.equal(typeof en.groupInfo.scope[key], "string");
    assert.equal(typeof ne.groupInfo.scope[key], "string");
    assert.ok(en.groupInfo.scope[key].length > 0);
    assert.ok(ne.groupInfo.scope[key].length > 0);
  }
});
