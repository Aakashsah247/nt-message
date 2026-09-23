import { readMessageAppRuntimeSourceSync } from "./message-app-runtime-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(url) {
  return readFileSync(url, "utf8");
}

const directoryService = read(
  new URL("../../api/src/directory/directory.service.ts", import.meta.url),
);
const directoryController = read(
  new URL("../../api/src/directory/directory.controller.ts", import.meta.url),
);
const directoryQueryDto = read(
  new URL(
    "../../api/src/directory/dto/list-directory-query.dto.ts",
    import.meta.url,
  ),
);
const directoryTypes = read(
  new URL("../src/types/directory.ts", import.meta.url),
);
const directoryList = read(
  new URL("../src/components/EmployeeDirectory.tsx", import.meta.url),
);
const directoryDetail = read(
  new URL(
    "../src/components/EmployeeDirectoryDetailPanel.tsx",
    import.meta.url,
  ),
);
const messagingTypes = read(
  new URL("../src/types/messaging.ts", import.meta.url),
);
const messagingPage = readMessageAppRuntimeSourceSync();
const conversationsService = read(
  new URL(
    "../../api/src/conversations/conversations.service.ts",
    import.meta.url,
  ),
);

test("P13-C Directory runtime no longer reads fixed hierarchy or management-position compatibility", () => {
  for (const source of [
    directoryService,
    directoryTypes,
    directoryList,
    directoryDetail,
  ]) {
    assert.doesNotMatch(source, /\bManagementPosition(Type)?\b/);
    assert.doesNotMatch(source, /\bcurrentPosition\b/);
    assert.doesNotMatch(source, /\beffectiveRole\b/);
  }

  assert.doesNotMatch(directoryService, /\bdivisionId\b|\bdepartmentId\b/);
  assert.doesNotMatch(directoryService, /managementAssignments/);
  assert.doesNotMatch(directoryQueryDto, /role\?:\s*AccountRole/);
  assert.doesNotMatch(directoryController, /@Roles\(/);
  assert.match(directoryService, /AccountClass\.SUPER_ADMIN/);
  assert.match(directoryService, /OrgMembershipType\.PRIMARY/);
  assert.match(directoryService, /orgLeadershipAssignments/);
});

test("P13-C Directory UI exposes account class, OrgUnit breadcrumb and organization responsibility instead of legacy role/position", () => {
  assert.match(directoryTypes, /accountClass:\s*AccountClass \| null/);
  assert.match(directoryTypes, /orgUnitBreadcrumb/);
  assert.match(
    directoryTypes,
    /leadership:\s*DirectoryLeadershipAssignment\[\]/,
  );
  assert.match(directoryList, /list\.table\.organizationRole/);
  assert.match(directoryDetail, /detail\.account\.accountClass/);
  assert.doesNotMatch(directoryList, /SENIOR_MANAGEMENT|TEAM_MANAGER/);
  assert.doesNotMatch(directoryDetail, /SENIOR_MANAGEMENT|TEAM_MANAGER/);
});

test("P13-C active messaging UI no longer branches on fixed cross-Division/Department request reasons", () => {
  assert.doesNotMatch(messagingTypes, /CROSS_DIVISION|CROSS_DEPARTMENT/);
  assert.doesNotMatch(messagingPage, /CROSS_DIVISION|CROSS_DEPARTMENT/);

  const start = conversationsService.indexOf(
    "private getMessageRequestReason(",
  );
  const end = conversationsService.indexOf("\n  private", start + 1);
  const runtimeReasonSection = conversationsService.slice(start, end);

  assert.doesNotMatch(runtimeReasonSection, /CROSS_DIVISION|CROSS_DEPARTMENT/);
  assert.match(runtimeReasonSection, /OUTSIDE_ORG_SCOPE/);
  assert.match(runtimeReasonSection, /PROTECTED_RECIPIENT/);
});
