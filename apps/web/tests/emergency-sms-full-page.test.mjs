import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [app, trigger, page, layout, css] = await Promise.all([
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(
    new URL("../src/components/EmergencyAlertButton.tsx", import.meta.url),
    "utf8",
  ),
  readFile(new URL("../src/pages/EmergencySmsPage.tsx", import.meta.url), "utf8"),
  readFile(
    new URL("../src/components/layout/ManagementLayout.tsx", import.meta.url),
    "utf8",
  ),
  readFile(new URL("../src/index.css", import.meta.url), "utf8"),
]);

test("Emergency SMS is routed inside the same persistent workspace shell as Settings", () => {
  const shellStart = app.indexOf("<OrganizationWorkspaceProvider>");
  const emergencyStart = app.indexOf('path="/emergency-sms"', shellStart);
  const settingsStart = app.indexOf('path="/settings"', shellStart);

  assert.notEqual(shellStart, -1);
  assert.notEqual(emergencyStart, -1);
  assert.notEqual(settingsStart, -1);
  assert.ok(emergencyStart < settingsStart);
  assert.match(trigger, /navigate\("\/emergency-sms"\)/);
});

test("Emergency SMS keeps a normal workspace surface instead of a floating modal", () => {
  assert.match(page, /emergency-sms-page/);
  assert.match(page, /emergency-alert-panel--page/);
  assert.doesNotMatch(page, /emergency-alert-backdrop|aria-modal|role="dialog"/);
  assert.match(layout, /isEmergencyRoute/);
  assert.match(layout, /navigation\.sections\.emergency/);
});

test("Emergency sidebar state and responsive workspace styling are explicit", () => {
  assert.match(trigger, /location\.pathname === "\/emergency-sms"/);
  assert.match(trigger, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(css, /\.management-layout__emergency-button--active/);
  assert.match(css, /@media \(max-width: 720px\)/);
});
