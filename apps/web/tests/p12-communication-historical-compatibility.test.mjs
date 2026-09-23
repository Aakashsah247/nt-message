import { readMessageAppRuntimeSourceSync } from "./message-app-runtime-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readMessageAppRuntimeSourceSync();
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

test("P12-K keeps historical message requests readable after the Phase 13 runtime cutover", () => {
  assert.doesNotMatch(messagingTypes, /"CROSS_DEPARTMENT"/);
  assert.doesNotMatch(messagingTypes, /"CROSS_DIVISION"/);
  assert.doesNotMatch(page, /reason === "CROSS_DIVISION"/);
  assert.doesNotMatch(page, /requestWorkspace\.reasons\.crossDepartment/);
  assert.match(page, /requestWorkspace\.reasons\.outsideOrgScope/);
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

  assert.match(announcementTypes, /"OFFICE" \| "ORG_UNIT" \| "OFFICIAL_GROUP"/);
  const createAnnouncement = announcementTypes.slice(
    announcementTypes.indexOf("export interface CreateAnnouncementInput"),
    announcementTypes.indexOf("export interface AnnouncementListResponse"),
  );
  assert.doesNotMatch(createAnnouncement, /divisionId\?: string/);
  assert.doesNotMatch(createAnnouncement, /departmentId\?: string/);
});
