import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [appSource, layoutSource] = await Promise.all([
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(
    new URL("../src/components/layout/ManagementLayout.tsx", import.meta.url),
    "utf8",
  ),
]);

test("canonical management routes share one persistent workspace shell", () => {
  assert.match(
    appSource,
    /import \{ Navigate, Outlet, Route, Routes \} from "react-router"/,
  );
  assert.match(
    appSource,
    /<OrganizationWorkspaceProvider>\s*<ManagementLayout>\s*<Outlet \/>\s*<\/ManagementLayout>\s*<\/OrganizationWorkspaceProvider>/,
  );

  const shellStart = appSource.indexOf("<OrganizationWorkspaceProvider>\n            <ManagementLayout>");
  const messagingStart = appSource.indexOf('[\n        "/messages",', shellStart);
  assert.notEqual(shellStart, -1);
  assert.notEqual(messagingStart, -1);

  const canonicalWorkspaceRoutes = appSource.slice(shellStart, messagingStart);
  assert.equal(
    (canonicalWorkspaceRoutes.match(/<ManagementLayout>/g) ?? []).length,
    1,
    "canonical workspace routes must not remount a layout per page",
  );
  assert.match(canonicalWorkspaceRoutes, /path="\/dashboard"/);
  assert.match(canonicalWorkspaceRoutes, /path="\/work"/);
  assert.match(canonicalWorkspaceRoutes, /path="\/duty-management"/);
  assert.match(canonicalWorkspaceRoutes, /path="\/settings"/);
});

test("workspace shell delegates signed-out handling to nested route guards", () => {
  assert.match(
    layoutSource,
    /if \(!account\) \{[\s\S]{0,220}return children;[\s\S]{0,40}\}/,
  );
});
