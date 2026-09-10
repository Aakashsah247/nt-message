import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  new URL("../src/pages/MessageAppPage.tsx", import.meta.url),
  "utf8",
);
const messagingService = readFileSync(
  new URL("../src/services/messaging.service.ts", import.meta.url),
  "utf8",
);
const messagingTypes = readFileSync(
  new URL("../src/types/messaging.ts", import.meta.url),
  "utf8",
);
const announcementTypes = readFileSync(
  new URL("../src/types/announcements.ts", import.meta.url),
  "utf8",
);

test("P12-K keeps historical message-request reasons readable", () => {
  assert.match(messagingTypes, /"CROSS_DEPARTMENT"/);
  assert.match(messagingTypes, /"CROSS_DIVISION"/);
  assert.match(page, /reason === "CROSS_DIVISION"/);
  assert.match(page, /requestWorkspace\.reasons\.crossDepartment/);
});

test("P12-K removes legacy hierarchy targets from new communication writes", () => {
  const createOfficialGroup = messagingService.slice(
    messagingService.indexOf("export function createOfficialGroupConversation"),
    messagingService.indexOf("export function reconcileOfficialGroups"),
  );
  assert.doesNotMatch(createOfficialGroup, /divisionId\?: string/);
  assert.doesNotMatch(createOfficialGroup, /departmentId\?: string/);

  const createGroupStart = page.indexOf("async function handleCreateGroup");
  const createGroupHandler = page.slice(
    createGroupStart,
    createGroupStart + 5000,
  );
  assert.doesNotMatch(createGroupHandler, /scopeType === "DIVISION"/);
  assert.doesNotMatch(createGroupHandler, /scopeType === "DEPARTMENT"/);

  assert.match(
    announcementTypes,
    /"OFFICE" \| "ORG_UNIT" \| "OFFICIAL_GROUP"/,
  );
  const createAnnouncement = announcementTypes.slice(
    announcementTypes.indexOf("export interface CreateAnnouncementInput"),
    announcementTypes.indexOf("export interface AnnouncementListResponse"),
  );
  assert.doesNotMatch(createAnnouncement, /divisionId\?: string/);
  assert.doesNotMatch(createAnnouncement, /departmentId\?: string/);
});
