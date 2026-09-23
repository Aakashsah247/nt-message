import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const directory = readFileSync(
  new URL("../src/components/EmployeeDirectory.tsx", import.meta.url),
  "utf8",
);
const directoryService = readFileSync(
  new URL("../src/services/directory.service.ts", import.meta.url),
  "utf8",
);
const messagingTypes = readFileSync(
  new URL("../src/types/messaging.ts", import.meta.url),
  "utf8",
);

test("P12-M locks communication analytics to Office and OrgUnit contracts", () => {
  assert.match(messagingTypes, /usersByOrgUnit/);
  assert.doesNotMatch(messagingTypes, /usersByDivision/);
  assert.doesNotMatch(messagingTypes, /usersByDepartment/);
});

test("P12-M keeps Directory scope and active query surface on Office and OrgUnit", () => {
  assert.match(directory, /list\.scope\.office/);
  assert.match(directory, /list\.scope\.orgUnit/);
  assert.doesNotMatch(directory, /list\.scope\.division/);
  assert.doesNotMatch(directory, /list\.scope\.department/);
  assert.doesNotMatch(directoryService, /query\.divisionId/);
  assert.doesNotMatch(directoryService, /query\.departmentId/);
});
