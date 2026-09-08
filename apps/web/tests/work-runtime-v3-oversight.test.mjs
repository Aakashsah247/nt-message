import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimeSource = await readFile(
  new URL("../src/pages/WorkRuntimeV3Page.tsx", import.meta.url),
  "utf8",
);
const oversightSource = await readFile(
  new URL("../src/pages/WorkOversightPage.tsx", import.meta.url),
  "utf8",
);
const overviewSource = await readFile(
  new URL("../src/pages/WorkOverviewPage.tsx", import.meta.url),
  "utf8",
);
const detailSource = await readFile(
  new URL("../src/pages/WorkRuntimeV3DetailPage.tsx", import.meta.url),
  "utf8",
);

test("P9-E1 routes Work Oversight to a dedicated read-only page", () => {
  assert.match(runtimeSource, /pathname === "\/work-oversight"/);
  assert.match(runtimeSource, /<WorkOversightPage \/>/);
  assert.match(oversightSource, /<WorkOverviewPage variant="OVERSIGHT" \/>/);
  assert.doesNotMatch(oversightSource, /work-runtime-v3\.service/);
  assert.doesNotMatch(
    oversightSource,
    /completeWorkRuntimeV3|cancelWorkRuntimeV3|reopenWorkRuntimeV3|createWorkRuntimeV3/,
  );
});

test("P9-E1 reuses the V3 overview list and removes operational controls from oversight", () => {
  assert.match(overviewSource, /listWorkRuntimeV3/);
  assert.match(overviewSource, /variant === "OVERSIGHT"/);
  assert.match(overviewSource, /!isOversight \? \(/);
  assert.match(
    overviewSource,
    /!isOversight && work\.availableActions\.length > 0/,
  );
  assert.match(overviewSource, /\?source=oversight/);
});

test("P9-E1 Work Detail returns to oversight while backend actions remain authoritative", () => {
  assert.match(detailSource, /useSearchParams/);
  assert.match(detailSource, /searchParams\.get\("source"\) === "oversight"/);
  assert.match(detailSource, /fromOversight \? "\/work-oversight" : "\/work"/);
  assert.match(detailSource, /availableActions\.includes\("COMPLETE"\)/);
  assert.match(detailSource, /availableActions\.includes\("CANCEL"\)/);
  assert.match(detailSource, /availableActions\.includes\("REOPEN"\)/);
});
