import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../src/pages/MessageAppPage.tsx", import.meta.url);
const englishCatalogUrl = new URL(
  "../src/i18n/locales/en/messaging.json",
  import.meta.url,
);
const nepaliCatalogUrl = new URL(
  "../src/i18n/locales/ne/messaging.json",
  import.meta.url,
);

const workspaceEnglishCatalogUrl = new URL(
  "../src/i18n/locales/en/workspace.json",
  import.meta.url,
);

function getPath(value, path) {
  return path.split(".").reduce((current, segment) => current?.[segment], value);
}

test("messaging shell uses the messaging namespace for bilingual navigation", async () => {
  const [source, english, nepali] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(englishCatalogUrl, "utf8").then(JSON.parse),
    readFile(nepaliCatalogUrl, "utf8").then(JSON.parse),
  ]);

  assert.match(source, /useTranslation\("messaging"\)/);

  const requiredKeys = [
    "navigation.chats",
    "navigation.announcements",
    "navigation.messageRequests",
    "navigation.groups",
    "navigation.starredMessages",
    "navigation.archived",
    "navigation.settings",
    "navigation.notifications",
    "navigation.backToWorkspace",
    "sidebar.eyebrow",
    "search.chats",
    "filters.unread",
    "filters.favorites",
    "filters.myLists",
    "conversationList.noneFound",
    "realtime.reconnecting",
  ];

  for (const key of requiredKeys) {
    assert.equal(typeof getPath(english, key), "string", `missing en:${key}`);
    assert.equal(typeof getPath(nepali, key), "string", `missing ne:${key}`);
    assert.match(source, new RegExp(`t\\(\\"${key.replaceAll(".", "\\.")}\\"`));
  }

  const shellStart = source.indexOf('<main\n      className={`message-app-shell');
  const shellEnd = source.indexOf('<section className="message-chat-panel">', shellStart);
  assert.notEqual(shellStart, -1, "messaging shell start must exist");
  assert.notEqual(shellEnd, -1, "messaging shell sidebar boundary must exist");
  const primaryShellSource = source.slice(shellStart, shellEnd);

  const forbiddenHardcodedShellPatterns = [
    'aria-label="Chats"',
    'aria-label="Official announcements"',
    'aria-label="Message requests"',
    'aria-label="Archived conversations"',
    'title="New conversation"',
    'title="New group"',
    'placeholder="Search chats"',
  ];

  for (const pattern of forbiddenHardcodedShellPatterns) {
    assert.equal(
      primaryShellSource.includes(pattern),
      false,
      `messaging shell still contains hard-coded UI text: ${pattern}`,
    );
  }
});


test("active conversation and composer use the messaging catalog", async () => {
  const source = await readFile(pageUrl, "utf8");

  for (const key of [
    "thread.loadOlder",
    "thread.jumpToLatest",
    "actionsMenu.reply",
    "actionsMenu.deleteForEveryone",
    "composer.messagePlaceholder",
    "composer.sendMessage",
    "messageSearch.title",
    "messageInfo.title",
    "sharedContent.title",
    "forward.title",
    "attachment.previewUnavailable",
    "location.stopSharing",
  ]) {
    assert.match(source, new RegExp(`t\\(\"${key.replaceAll(".", "\\.")}\"`));
  }

  assert.doesNotMatch(source, /placeholder="Type a message"/);
  assert.doesNotMatch(source, />Delete for everyone<\/span>/);
  assert.doesNotMatch(source, /aria-label="Jump to latest message"/);
});

test("remaining messaging workspaces use bilingual catalog keys", async () => {
  const [source, english, nepali] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(englishCatalogUrl, "utf8").then(JSON.parse),
    readFile(nepaliCatalogUrl, "utf8").then(JSON.parse),
  ]);

  const requiredKeys = [
    "profileWorkspace.title",
    "profileDetail.blockPrivateContact",
    "groupManagement.officialGroup",
    "groupManagement.addSelectedMembers",
    "groupCreateWorkspace.officialTitle",
    "listWorkspace.createList",
    "storageWorkspace.totalStorage",
    "notificationWorkspace.title",
    "announcementWorkspace.selectGroup",
    "messageSettings.tabs.privacy",
    "composer.emojiSections.smileys",
    "sharedContent.externalLink",
    "realtime.connected",
  ];

  for (const key of requiredKeys) {
    assert.equal(typeof getPath(english, key), "string", `missing en:${key}`);
    assert.equal(typeof getPath(nepali, key), "string", `missing ne:${key}`);
  }

  for (const pattern of [
    /\? "Conversation unmuted\\\." : "Conversation muted\\\."/,
    /\? "Add member"\s*:\s*"Manage group members"/,
    /\? "Marking\\\.\\\.\\\."\s*:\s*"Mark all read"/,
    /\? "Removing\\\.\\\.\\\."\s*:\s*"Remove seen"/,
    /\? "Create an official group"\s*:\s*"Create a personal group"/,
    /\? "Working\\\.\\\.\\\."\s*:\s*"Block private contact"/,
  ]) {
    assert.doesNotMatch(source, pattern);
  }
});


test("messaging helper keys stay in the messaging namespace", async () => {
  const [english, nepali, workspaceEnglish] = await Promise.all([
    readFile(englishCatalogUrl, "utf8").then(JSON.parse),
    readFile(nepaliCatalogUrl, "utf8").then(JSON.parse),
    readFile(workspaceEnglishCatalogUrl, "utf8").then(JSON.parse),
  ]);

  for (const key of ["starred.andMore_one", "starred.andMore_other"]) {
    assert.equal(typeof getPath(english, key), "string", `missing en:${key}`);
    assert.equal(typeof getPath(nepali, key), "string", `missing ne:${key}`);
  }

  assert.equal(workspaceEnglish.confirmation, undefined);
  assert.equal(workspaceEnglish.thread, undefined);
});
