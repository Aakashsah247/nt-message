import { readMessageAppRuntimeSourceSync } from "./message-app-runtime-source.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const directoryDetail = new URL(
  "../src/components/EmployeeDirectoryDetailPanel.tsx",
  import.meta.url,
);
const employeeController = new URL(
  "../../api/src/employees/employees.controller.ts",
  import.meta.url,
);

test("P12-F real announcement composer exposes Office, OrgUnit subtree and Official Group audiences", async () => {
  const source = await readMessageAppRuntimeSourceSync();

  assert.match(source, /listAnnouncementAudiences\(accessToken\)/);
  assert.match(source, /value=\"OFFICE\"/);
  assert.match(source, /value=\"ORG_UNIT\"/);
  assert.match(source, /value=\"OFFICIAL_GROUP\"/);
  assert.match(
    source,
    /includeDescendants:\s*event\.target\.value\s*===\s*["\']SUBTREE["\']/,
  );
  assert.doesNotMatch(
    source,
    /return \{\s*audienceType: \"OFFICIAL_GROUP\",\s*officialConversationId,/,
  );
});

test("P12-I directory no longer exposes legacy Super Admin Division/Department role mutation", async () => {
  const [detailSource, controllerSource] = await Promise.all([
    readFile(directoryDetail, "utf8"),
    readFile(employeeController, "utf8"),
  ]);

  assert.doesNotMatch(detailSource, /changeDirectoryEmployeeRole/);
  assert.doesNotMatch(detailSource, /listDirectoryOrganizationDivisions/);
  assert.doesNotMatch(detailSource, /listDirectoryOrganizationDepartments/);
  assert.doesNotMatch(detailSource, /dir-role-box/);
  assert.doesNotMatch(controllerSource, /@Patch\(':id\/role'\)/);
});
