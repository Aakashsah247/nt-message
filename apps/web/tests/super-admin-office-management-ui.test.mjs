import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [
  officesSource,
  officeHeadsSource,
  directoryDetailSource,
  organizationCss,
  organizationPeopleService,
  employeesService,
] = await Promise.all([
  readFile(
    new URL("../src/pages/SuperAdminOfficesPage.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src/pages/SuperAdminOfficeHeadsPage.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src/components/EmployeeDirectoryDetailPanel.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src/styles/organization-workspace.css", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../../api/src/organization/organization-people.service.ts", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../../api/src/employees/employees.service.ts", import.meta.url),
    "utf8",
  ),
]);

test("Super Admin Offices is a compact registry with an on-demand create flow", () => {
  assert.match(officesSource, /Office registry/);
  assert.match(officesSource, /Create office/);
  assert.match(officesSource, /currentPeopleCount/);
  assert.match(officesSource, /organization-admin-inline-create/);
  assert.doesNotMatch(officesSource, /organization-summary-grid/);
  assert.doesNotMatch(officesSource, /organization-admin-hero-stat/);
  assert.doesNotMatch(officesSource, /Registered offices<\/span>[\s\S]*Active offices/);
});

test("Office Head Management owns the complete permanent leadership lifecycle", () => {
  assert.match(officeHeadsSource, /organization-admin-scope-bar/);
  assert.match(officeHeadsSource, />Replace<\/button>/);
  assert.match(officeHeadsSource, />Transfer<\/button>/);
  assert.match(officeHeadsSource, />End assignment<\/button>/);
  assert.match(officeHeadsSource, /Assign existing member/);
  assert.match(officeHeadsSource, /Create new account/);
  assert.match(officeHeadsSource, /Transfer as Office Head/);
  assert.match(officeHeadsSource, /Previous Office Heads/);
  assert.match(officeHeadsSource, /normal activation, OTP and password setup/);
  assert.doesNotMatch(officeHeadsSource, /Provisioning locked/);
  assert.doesNotMatch(officeHeadsSource, /organization-workspace__hero/);
});

test("Office Head avatars reuse the protected Directory photo pipeline", () => {
  assert.match(officeHeadsSource, /import \{ ProtectedAvatar \}/);
  assert.match(
    officeHeadsSource,
    /employeeId=\{currentOfficeHead\.employee\.id\}[\s\S]*photoKey=\{currentOfficeHead\.employee\.profilePhotoKey\}/,
  );
  assert.match(organizationPeopleService, /profilePhotoKey: true/);
});

test("Office management follows the installed router package and render-purity rules", () => {
  assert.doesNotMatch(officeHeadsSource, /react-router-dom/);
  assert.doesNotMatch(directoryDetailSource, /react-router-dom/);
  assert.doesNotMatch(officeHeadsSource, /Date\.now\(\)/);
  assert.doesNotMatch(directoryDetailSource, /Date\.now\(\)/);
});

test("Directory keeps ordinary transfers but redirects active Office Heads to Office Head Management", () => {
  assert.match(directoryDetailSource, /isCurrentPermanentOfficeHead/);
  assert.match(directoryDetailSource, /\/super-admin\/office-heads/);
  assert.match(directoryDetailSource, /manageOfficeHead/);
  assert.match(employeesService, /This employee is not the current permanent Office Head/);
  assert.match(employeesService, /OFFICE_HEAD_TRANSFER/);
  assert.match(
    employeesService,
    /Resolve this employee Office Head assignment in Office Head Management before ending employment/,
  );
});

test("Office Head replacement and transfer preserve leadership history instead of overwriting it", () => {
  assert.match(organizationPeopleService, /async replaceOfficeHead\(/);
  assert.match(organizationPeopleService, /endReason: `Replaced:/);
  assert.match(organizationPeopleService, /OrgLeadershipType\.OFFICE_HEAD/);
  assert.match(organizationPeopleService, /Office-level placement for Office Head/);
  assert.match(employeesService, /sourceReplacementAssignment/);
  assert.match(employeesService, /destinationOfficeHeadAssignment/);
  assert.match(employeesService, /Office Head replacement during transfer/);
});

test("Super Admin office management keeps Nepal Telecom tokens, restrained motion, and no forbidden blur", () => {
  assert.match(organizationCss, /--organization-blue:\s*var\(--color-nt-blue/);
  assert.match(organizationCss, /--organization-gold:\s*var\(--color-nt-gold/);
  assert.match(organizationCss, /--organization-red:\s*var\(--color-nt-red/);
  assert.match(organizationCss, /\.organization-admin-registry-row:hover/);
  assert.match(organizationCss, /@keyframes organization-admin-page-enter/);
  assert.match(organizationCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(
    organizationCss.match(/\.organization-admin-page \{[\s\S]*?@keyframes organization-admin-page-enter/)?.[0] ?? "",
    /backdrop-filter/,
  );
});
