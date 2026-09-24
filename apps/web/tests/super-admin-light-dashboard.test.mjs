import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const dashboard = readFileSync(
  new URL("../src/components/SuperAdminDashboardOverview.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../src/styles/super-admin-workspace.css", import.meta.url),
  "utf8",
);
const english = JSON.parse(
  readFileSync(new URL("../src/i18n/locales/en/admin.json", import.meta.url), "utf8"),
);
const nepali = JSON.parse(
  readFileSync(new URL("../src/i18n/locales/ne/admin.json", import.meta.url), "utf8"),
);

test("Super Admin dashboard is a compact governance overview instead of a full analytics surface", () => {
  assert.match(dashboard, /getSuperAdminMonitoring\(accessToken, 7\)/);
  assert.match(dashboard, /getAdminAccountRequestSummary\(accessToken\)/);
  assert.match(dashboard, /super-admin-lite__kpis/);
  assert.match(dashboard, /super-admin-lite__actions/);
  assert.match(dashboard, /super-admin-lite__offices/);
  assert.match(dashboard, /super-admin-lite__recent/);
  assert.match(dashboard, /super-admin-lite__snapshot/);
  assert.doesNotMatch(dashboard, /SuperAdminSystemAnalyticsPanel/);
  assert.doesNotMatch(dashboard, /dashboardClean\.attentionSummary/);
});

test("Super Admin dashboard limits repeated detail and keeps recent administration concise", () => {
  assert.match(dashboard, /recentActivity\.slice\(0, 3\)/);
  assert.match(dashboard, /actionItems\.slice\(0, 4\)/);
  assert.match(dashboard, /officeHealth/);
  assert.match(dashboard, /emergencyHasIssue/);
});

test("Super Admin dashboard motion is restrained and reduced-motion safe", () => {
  assert.match(styles, /@keyframes sa-lite-rise/);
  assert.match(styles, /@keyframes sa-lite-spin/);
  assert.match(styles, /@keyframes sa-lite-shimmer/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /transition: border-color 180ms ease/);
});

test("Super Admin light dashboard copy stays bilingual", () => {
  assert.ok(english.dashboardLite);
  assert.ok(nepali.dashboardLite);
  assert.deepEqual(
    Object.keys(english.dashboardLite).sort(),
    Object.keys(nepali.dashboardLite).sort(),
  );
  assert.equal(english.dashboardLite.title, "Super Admin Dashboard");
  assert.equal(nepali.dashboardLite.title, "सुपर एडमिन ड्यासबोर्ड");
});
