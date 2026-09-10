import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const messagePage = readFileSync(
  new URL("../src/pages/MessageAppPage.tsx", import.meta.url),
  "utf8",
);

test("P12-L keeps communication management controls backend-authoritative", () => {
  assert.match(
    messagePage,
    /const canCreateOfficialGroup = officialGroupCanCreate;/,
  );
  assert.match(
    messagePage,
    /const canManageSelectedAnnouncementGroup = Boolean\([\s\S]*selectedConversation\?\.groupKind === "OFFICIAL"[\s\S]*selectedConversation\.canManageGroup,[\s\S]*\);/,
  );
  assert.match(messagePage, /announcementDetail\.canManage/);
  assert.match(messagePage, /announcementDetail\.canEdit/);
  assert.match(messagePage, /announcementDetail\.canDelete/);
});

test("P12-L removes legacy account-role gating from announcement-group management", () => {
  const start = messagePage.indexOf(
    "const canManageSelectedAnnouncementGroup = Boolean(",
  );
  const end = messagePage.indexOf(
    "const destructiveConfirmationSubmitting",
    start,
  );

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const managementGate = messagePage.slice(start, end);
  assert.doesNotMatch(managementGate, /account\?\.role/);
  assert.doesNotMatch(
    managementGate,
    /SUPER_ADMIN|SENIOR_MANAGEMENT|TEAM_MANAGER/,
  );
});
