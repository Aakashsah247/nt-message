import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [component, page, service, types, css] = await Promise.all([
  readFile(
    new URL("../src/components/EmergencyAlertButton.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src/pages/EmergencySmsPage.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../../api/src/emergency-alerts/emergency-alerts.service.ts", import.meta.url),
    "utf8",
  ),
  readFile(new URL("../src/types/emergency-alert.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/index.css", import.meta.url), "utf8"),
]);

test("Emergency SMS exposes independent language and quick/custom message controls", () => {
  assert.match(page, /useState<EmergencySmsLanguage>\("EN"\)/);
  assert.match(page, /useState<EmergencySmsMessageMode>\("QUICK"\)/);
  assert.match(page, /English/);
  assert.match(page, /नेपाली/);
  assert.match(page, /customMessage/);
  assert.match(types, /"SYSTEM_SUPPORT"/);
});

test("Emergency SMS V3 keeps office users in the sender office and allows Super Admin support", () => {
  assert.match(service, /accountClass: AccountClass\.SUPER_ADMIN/);
  assert.match(service, /officeId: senderOffice\.officeId/);
  assert.match(service, /membershipType: OrgMembershipType\.PRIMARY/);
  assert.match(service, /recipientOffice\?\.officeId === senderOfficeId/);
  assert.match(service, /official Super Admin support contact/);
});

test("Emergency SMS edits the existing UI instead of retaining obsolete severity UI", () => {
  assert.doesNotMatch(css, /\.emergency-alert-severity-grid/);
  assert.match(css, /\.emergency-alert-segmented/);
  assert.match(css, /@keyframes emergency-panel-in/);
  assert.match(css, /prefers-reduced-motion/);
});

test("Emergency SMS recipient picker shows selected identity and searchable V3 contacts", () => {
  assert.match(page, /emergency-alert-recipient-picker/);
  assert.match(page, /selectedContact\.displayName/);
  assert.match(page, /selectedContact\.authorityLabel/);
  assert.match(page, /selectedContact\.phoneDisplay/);
  assert.match(page, /searchContacts/);
  assert.doesNotMatch(page, /<select[\s>]/);
  assert.match(types, /phoneDisplay: string \| null/);
  assert.match(service, /phoneDisplay: phoneStatus\.phoneNumber/);
  assert.match(css, /\.emergency-alert-recipient-option/);
  assert.doesNotMatch(css, /\.emergency-alert-contact-card/);
});

test("Emergency SMS resolves Team Lead Office through the team OrgUnit", () => {
  assert.match(service, /orgUnit: \{ select: \{ officeId: true \} \}/);
  assert.match(service, /assignment\.team\.orgUnit\.officeId === senderOfficeId/);
  assert.doesNotMatch(service, /team\.officeId/);
});
