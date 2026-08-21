import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const settingsPage = readFileSync(new URL("../src/pages/SettingsPage.tsx", import.meta.url), "utf8");
const securityPage = readFileSync(new URL("../src/pages/SecurityPage.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/components/settings/SettingsShell.tsx", import.meta.url), "utf8");

test("language and security routes use the same account settings shell", () => {
  assert.match(settingsPage, /<SettingsShell activeSection="language">/);
  assert.match(securityPage, /<SettingsShell activeSection="security">/);
  assert.match(shell, /to="\/settings\/security"/);
  assert.match(shell, /to="\/settings"/);
  assert.doesNotMatch(securityPage, /security-page__header/);
  assert.doesNotMatch(securityPage, /security-page__identity/);
});
