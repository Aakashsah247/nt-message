import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [
  appSource,
  providerSource,
  sharedContextSource,
  layoutSource,
  featureRouteSource,
  dashboardSource,
  serviceSource,
] = await Promise.all([
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(
    new URL("../src/context/OrganizationWorkspaceContext.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src/context/organization-workspace-context.ts", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src/components/layout/ManagementLayout.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src/components/WorkspaceFeatureRoute.tsx", import.meta.url),
    "utf8",
  ),
  readFile(new URL("../src/pages/OfficeDashboardPage.tsx", import.meta.url), "utf8"),
  readFile(
    new URL("../src/services/organization-v3.service.ts", import.meta.url),
    "utf8",
  ),
]);

test("workspace context is owned once by the persistent management shell", () => {
  assert.match(
    appSource,
    /<OrganizationWorkspaceProvider>\s*<ManagementLayout>\s*<Outlet \/>/,
  );
  assert.match(layoutSource, /useOrganizationWorkspace/);
  assert.doesNotMatch(layoutSource, /getOrganizationWorkspaceContext/);
  assert.doesNotMatch(featureRouteSource, /getOrganizationWorkspaceContext/);
  assert.doesNotMatch(dashboardSource, /getOrganizationWorkspaceContext/);
});

test("workspace provider keeps Fast Refresh component exports isolated", () => {
  assert.match(providerSource, /export function OrganizationWorkspaceProvider/);
  assert.doesNotMatch(providerSource, /export function useOrganizationWorkspace/);
  assert.match(sharedContextSource, /export function useOrganizationWorkspace/);
});

test("token renewal preserves the last confirmed workspace context", () => {
  assert.match(
    providerSource,
    /context:\s*current\?\.accountId === accountId \? current\.context : null/,
  );
  assert.match(
    providerSource,
    /const currentResult = result\?\.accountId === accountId \? result : null/,
  );
  assert.doesNotMatch(providerSource, /result\?\.accessToken === accessToken/);
});

test("feature authorization consumes shared context and does not redirect on fetch failure", () => {
  assert.match(featureRouteSource, /const \{ context, loading, error, refresh \}/);
  assert.match(featureRouteSource, /Workspace access is temporarily unavailable/);
  assert.match(featureRouteSource, /return context\.features\[feature\]/);
  assert.doesNotMatch(featureRouteSource, /\.catch\([^)]*allowed: false/);
});

test("workspace context requests are deduplicated while in flight", () => {
  assert.match(serviceSource, /const workspaceContextRequests = new Map/);
  assert.match(serviceSource, /workspaceContextRequests\.get\(accessToken\)/);
  assert.match(serviceSource, /workspaceContextRequests\.set\(accessToken, request\)/);
  assert.match(serviceSource, /workspaceContextRequests\.delete\(accessToken\)/);
});

test("dashboard keeps its current snapshot when only the access token rotates", () => {
  assert.match(dashboardSource, /const accountId = account\?\.id \?\? null/);
  assert.match(dashboardSource, /const requestKey = accountId \? `\$\{accountId\}:\$\{refreshKey\}`/);
  assert.match(dashboardSource, /loadDashboard\(accessToken, workspaceContext, accountId\)/);
  assert.match(
    dashboardSource,
    /current\?\.requestKey === requestKey \? current\.snapshot : null/,
  );
  assert.doesNotMatch(dashboardSource, /`\$\{accessToken\}:\$\{refreshKey\}`/);
});
