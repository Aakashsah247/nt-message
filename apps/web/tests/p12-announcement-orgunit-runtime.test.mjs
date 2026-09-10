import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const typesUrl = new URL("../src/types/announcements.ts", import.meta.url);
const serviceUrl = new URL("../src/services/announcement.service.ts", import.meta.url);

test("P12-F exposes native Office and OrgUnit announcement audiences", async () => {
  const source = await readFile(typesUrl, "utf8");

  assert.match(source, /\| "OFFICE"/);
  assert.match(source, /\| "ORG_UNIT"/);
  assert.match(source, /canTargetOffice: boolean/);
  assert.match(source, /office: AnnouncementOffice/);
  assert.match(source, /orgUnits: Array</);
  assert.match(source, /includeDescendants: boolean/);
});

test("P12-F create contract forwards V3 announcement scope fields", async () => {
  const [typesSource, serviceSource] = await Promise.all([
    readFile(typesUrl, "utf8"),
    readFile(serviceUrl, "utf8"),
  ]);

  assert.match(typesSource, /officeId\?: string/);
  assert.match(typesSource, /orgUnitId\?: string/);
  assert.match(typesSource, /includeDescendants\?: boolean/);
  assert.match(serviceSource, /JSON\.stringify\(input\)/);
});
