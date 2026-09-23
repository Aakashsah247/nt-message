import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(
  new URL("../src/pages/ManagementWorkPage.tsx", import.meta.url),
  "utf8",
);

test("Work Management keeps the mounted workspace during background refreshes", () => {
  assert.match(page, /const overviewLoadedRef = useRef\(false\)/);
  assert.match(
    page,
    /if \(!overviewLoadedRef\.current\) \{\s*setLoading\(true\);\s*\}/,
  );
  assert.match(
    page,
    /overviewLoadedRef\.current = true;\s*setLoading\(false\);/,
  );
});

test("Work actions and realtime reconciliation still use refreshKey", () => {
  assert.match(
    page,
    /function refresh\(message\?: string\): void \{[\s\S]*setRefreshKey\(\(current\) => current \+ 1\)/,
  );
  assert.match(
    page,
    /window\.addEventListener\(WORK_REALTIME_EVENT, refresh\)/,
  );
});
