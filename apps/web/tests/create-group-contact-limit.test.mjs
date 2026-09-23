import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [controller, page, en, ne] = await Promise.all([
  readFile(new URL("../src/pages/useMessageAppController.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/MessageAppPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/i18n/locales/en/messaging.json", import.meta.url), "utf8"),
  readFile(new URL("../src/i18n/locales/ne/messaging.json", import.meta.url), "utf8"),
]);

test("Create Group does not dump the full employee directory before search", () => {
  assert.match(
    controller,
    /searchMessagingContacts\([\s\S]*?groupSearch[\s\S]*?groupSearch\.trim\(\) \? 20 : 8/,
  );
  assert.doesNotMatch(
    controller,
    /searchMessagingContacts\(accessToken, groupSearch, 50\)/,
  );
});

test("Create Group explains how to find employees outside the initial result set", () => {
  assert.match(page, /searchForMoreEmployees/);
  assert.match(en, /"searchForMoreEmployees"/);
  assert.match(ne, /"searchForMoreEmployees"/);
});

test("Create Group contact loading survives a hard refresh of the route", () => {
  assert.match(
    controller,
    /const createPersonalGroupOpen =\s*createGroupMode && groupKind !== "OFFICIAL"/,
  );
  assert.match(
    controller,
    /setGroupDialogMode\(createGroupMode \? "CREATE" : null\)/,
  );
  assert.match(
    controller,
    /useState\(createGroupMode\)/,
  );
});

test("Create Group search keeps existing results visible while a new query loads", () => {
  assert.match(page, /groupContactsLoading && groupContacts\.length === 0/);
  assert.match(page, /message-create-group-searching-inline/);
});
