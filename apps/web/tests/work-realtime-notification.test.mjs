import { readMessageAppRuntimeSourceSync } from "./message-app-runtime-source.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Work realtime uses one app-level socket and page-level API reconciliation", async () => {
  const [main, bridge, employee, management, detail] = await Promise.all([
    read("src/main.tsx"),
    read("src/components/WorkRealtimeBridge.tsx"),
    read("src/pages/EmployeeWorkPage.tsx"),
    read("src/pages/ManagementWorkPage.tsx"),
    read("src/pages/WorkDetailPage.tsx"),
  ]);

  assert.match(main, /<WorkRealtimeBridge \/>/);
  assert.match(bridge, /socket\.on\("work:item-updated", handleWorkUpdate\)/);
  assert.match(bridge, /publishWorkRealtimeReconcile\(\)/);
  assert.match(employee, /WORK_REALTIME_EVENT/);
  assert.doesNotMatch(employee, /createMessagingSocket\(accessToken\)/);
  assert.match(management, /WORK_REALTIME_EVENT/);
  assert.doesNotMatch(management, /createMessagingSocket\(accessToken\)/);
  assert.match(detail, /payload\.workItemId !== workItemId/);
});

test("Work sound is attention-scoped and acknowledged or started Work stays silent", async () => {
  const [bridge, messageApp] = await Promise.all([
    read("src/components/WorkRealtimeBridge.tsx"),
    readMessageAppRuntimeSourceSync(),
  ]);

  assert.match(
    bridge,
    /if \(!payload\.audible \|\| payload\.actorAccountId === accountId\)/,
  );
  assert.match(bridge, /muteAllNotifications/);
  assert.match(bridge, /playNotificationTone\(\)/);
  assert.match(
    readMessageAppRuntimeSourceSync(),
    /payload\.notification\.type !== "WORK_ITEM"/,
  );
});
