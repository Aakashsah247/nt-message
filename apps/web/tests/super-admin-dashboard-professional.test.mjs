import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readFileSync } from "node:fs";


const overview = await readFile(
  new URL("../src/components/SuperAdminDashboardOverview.tsx", import.meta.url),
  "utf8",
);

const panel = await readFile(
  new URL("../src/components/SuperAdminSystemAnalyticsPanel.tsx", import.meta.url),
  "utf8",
);

const css = await readFile(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);

test("Super Admin dashboard uses real monitoring and governance data", () => {
  const dashboard = readFileSync(
    new URL("../src/components/SuperAdminDashboardOverview.tsx", import.meta.url),
    "utf8",
  );
  assert.match(dashboard, /getSuperAdminMonitoring/);
  assert.match(dashboard, /getAdminAccountRequestSummary/);
  assert.match(dashboard, /Promise\.allSettled/);
  assert.match(dashboard, /organizationHealth/);
  assert.match(dashboard, /officeHealth/);
  assert.match(dashboard, /accountHealth/);
  assert.doesNotMatch(dashboard, /mode="dashboard"/);
  assert.doesNotMatch(dashboard, /SuperAdminSystemAnalyticsPanel/);
});

test("dashboard uses one authoritative attention total", () => {
  assert.match(panel, /dashboardAttentionTotal/);
  assert.match(panel, /dashboardAttentionItems\.reduce/);
});

test("dashboard is concise and role-correct", () => {
  assert.match(panel, /sa-dashboard__kpis/);
  assert.match(panel, /sa-dashboard-attention/);
  assert.match(panel, /sa-dashboard-offices/);
  assert.match(panel, /sa-dashboard-integrity/);
  assert.match(panel, /sa-dashboard-activity/);

  assert.doesNotMatch(
    overview,
    /work-oversight|work-reports/,
  );
});

test("dashboard uses Nepal Telecom design tokens and reduced motion", () => {
  assert.match(css, /--color-nt-blue/);
  assert.match(css, /--color-nt-gold/);
  assert.match(css, /\.sa-dashboard/);
  assert.match(css, /prefers-reduced-motion/);
});
