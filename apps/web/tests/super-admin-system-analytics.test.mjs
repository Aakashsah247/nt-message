import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(
  new URL("../src/components/SuperAdminSystemAnalyticsPanel.tsx", import.meta.url),
  "utf8",
);
const apiMonitoringService = readFileSync(
  new URL("../../api/src/monitoring/monitoring.service.ts", import.meta.url),
  "utf8",
);
const monitoringService = readFileSync(
  new URL("../src/services/monitoring.service.ts", import.meta.url),
  "utf8",
);
const monitoringTypes = readFileSync(
  new URL("../src/types/monitoring.ts", import.meta.url),
  "utf8",
);
const adminPage = readFileSync(
  new URL("../src/pages/AdminDashboardPage.tsx", import.meta.url),
  "utf8",
);
const english = JSON.parse(
  readFileSync(new URL("../src/i18n/locales/en/analytics.json", import.meta.url), "utf8"),
);
const nepali = JSON.parse(
  readFileSync(new URL("../src/i18n/locales/ne/analytics.json", import.meta.url), "utf8"),
);

test("Super Admin System Analytics uses governance data and never communication analytics", () => {
  assert.match(panel, /getSuperAdminMonitoring/);
  assert.match(panel, /getAdminAccountRequestSummary/);
  assert.doesNotMatch(panel, /getMessagingAnalytics/);
  assert.doesNotMatch(panel, /messagesByType|conversationsByType|attachmentsByType/);
});

test("Super Admin analytics route renders the dedicated system analytics panel", () => {
  assert.match(adminPage, /SuperAdminSystemAnalyticsPanel/);
  assert.doesNotMatch(adminPage, /MessagingAnalyticsPanel/);
});

test("System Analytics distinguishes current placements from historical records and audits V3 leadership", () => {
  assert.match(panel, /activePrimaryPlacements/);
  assert.match(panel, /historicalPlacementRecords/);
  assert.match(panel, /officesWithoutHead/);
  assert.match(panel, /orgUnitsWithoutHead/);
  assert.match(panel, /employeesWithoutPlacement/);
  assert.match(panel, /placementPending/);
  assert.match(monitoringTypes, /officeHeadsAssigned/);
  assert.match(monitoringTypes, /orgUnitHeadsAssigned/);
});

test("System Analytics handles zero account requests without claiming 100 percent completion", () => {
  assert.match(panel, /requests\.totalRequests === 0/);
  assert.match(panel, /governance\.noRequests/);
  assert.doesNotMatch(english.governance.noRequests, /100%/);
});

test("System Analytics supports today, 7-day and 30-day privacy-safe periods", () => {
  assert.match(panel, /SystemAnalyticsRangeDays/);
  assert.match(panel, /\[1, 7, 30\]/);
  assert.match(monitoringService, /days=\$\{days\}/);
  assert.match(apiMonitoringService, /\[1, 7, 30\]\.includes\(days\)/);
  assert.match(apiMonitoringService, /periodAccountRequests/);
  assert.match(monitoringTypes, /trend: Array/);
});

test("System Analytics includes emergency delivery health without private content", () => {
  assert.match(apiMonitoringService, /emergencyAlertRecipient\.findMany/);
  assert.match(apiMonitoringService, /EmergencyAlertRecipientStatus\.SENT/);
  assert.match(panel, /emergencyDelivery\.sent/);
  assert.match(panel, /emergencyDelivery\.failed/);
  assert.match(panel, /emergencyDelivery\.skippedNoPhone/);
  assert.doesNotMatch(panel, /messageLong|messageShort|phoneNumber/);
});

test("System Analytics keeps the privacy boundary explicit and bilingual", () => {
  assert.match(english.about.description, /does not expose message text/i);
  assert.match(nepali.about.description, /सन्देश पाठ/);
  assert.deepEqual(Object.keys(english).sort(), Object.keys(nepali).sort());
});

test("System Analytics keeps Nepal Telecom styling, compact responsive UI and motion safeguards", () => {
  const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  assert.match(css, /--analytics-blue:/);
  assert.match(css, /--analytics-gold:/);
  assert.match(css, /--analytics-red:/);
  assert.match(css, /analytics-commandbar/);
  assert.match(css, /analytics-office-table/);
  assert.match(css, /analytics-trend/);
  assert.match(css, /@keyframes analytics-fade-up/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
