const fs = require('node:fs');
const path = require('node:path');

const apiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(apiRoot, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const finalReportPath = 'docs/hierarchy-work-v3/PHASE_13_FINAL_ARCHITECTURE_LOCK.md';
const cutoverRunbookPath = 'deploy/PHASE13_CUTOVER_ROLLBACK.md';
const sourceBackupScriptPath = 'scripts/create_source_backup.py';
const schemaPath = 'apps/api/prisma/schema.prisma';
const organizationAuthorizationSpecPath =
  'apps/api/src/organization/organization-authorization.service.spec.ts';
const organizationDelegationSpecPath =
  'apps/api/src/organization/organization-delegation.service.spec.ts';
const workScopeSpecPath = 'apps/api/src/work-management/work-scope.service.spec.ts';
const dutyAuthorizationSpecPath =
  'apps/api/src/work-management/duty-authorization.service.spec.ts';
const communicationLockSpecPath =
  'apps/api/src/conversations/communication-v3-architecture-lock.spec.ts';

for (const relativePath of [
  finalReportPath,
  cutoverRunbookPath,
  sourceBackupScriptPath,
  schemaPath,
  organizationAuthorizationSpecPath,
  organizationDelegationSpecPath,
  workScopeSpecPath,
  dutyAuthorizationSpecPath,
  communicationLockSpecPath,
]) {
  assert(
    fs.existsSync(path.join(repoRoot, relativePath)),
    `Required Phase 13 lock artifact is missing: ${relativePath}`,
  );
}

const report = read(finalReportPath);
const runbook = read(cutoverRunbookPath);
const backupScript = read(sourceBackupScriptPath);
const schema = read(schemaPath);
const organizationAuthorizationSpec = read(organizationAuthorizationSpecPath);
const organizationDelegationSpec = read(organizationDelegationSpecPath);
const workScopeSpec = read(workScopeSpecPath);
const dutyAuthorizationSpec = read(dutyAuthorizationSpecPath);
const communicationLockSpec = read(communicationLockSpecPath);

assert(
  report.includes('PHASE 13 — COMPLETE / FINAL ARCHITECTURE LOCK — 23/23'),
  'Final architecture report is missing the Phase 13 23/23 lock declaration.',
);
assert(
  report.includes('106 migrations'),
  'Final architecture report must record the locked migration count.',
);
assert(
  report.includes('114 / 114') && report.includes('674 / 674'),
  'Final architecture report must record the final API regression evidence.',
);
assert(
  report.includes('109 / 109') && report.includes('3066 / 3066'),
  'Final architecture report must record the final Web/i18n evidence.',
);
assert(
  runbook.includes('20260913032500_remove_phase13_legacy_schema'),
  'Cutover runbook must name the destructive migration boundary.',
);
assert(
  runbook.includes('application rollback alone is forbidden'),
  'Cutover runbook must preserve the destructive-boundary rollback rule.',
);

assert(
  organizationAuthorizationSpec.includes('keeps Super Admin Work access read-only'),
  'Missing Super Admin Work read-only authorization regression.',
);
assert(
  organizationAuthorizationSpec.includes('keeps Org Unit Head authority inside its own subtree'),
  'Missing Org Unit Head subtree-isolation regression.',
);
assert(
  organizationAuthorizationSpec.includes('gives a Deputy only the explicitly delegated capability'),
  'Missing Deputy capability-boundary regression.',
);
assert(
  organizationAuthorizationSpec.includes('does not let a finite delegated grant create authority beyond its expiry'),
  'Missing delegation-expiry regression.',
);
assert(
  organizationDelegationSpec.includes('does not allow Super Admin to create internal Office delegation'),
  'Missing Super Admin internal-delegation denial regression.',
);
assert(
  workScopeSpec.includes('denies Super Admin operational Work management'),
  'Missing Work runtime Super Admin mutation denial regression.',
);
assert(
  workScopeSpec.includes('rejects a target outside the authorized V3 OrgUnit scope'),
  'Missing cross-OrgUnit assignment-scope regression.',
);
assert(
  dutyAuthorizationSpec.includes('keeps Super Admin Duty access strictly read-only'),
  'Missing Duty Super Admin read-only regression.',
);
assert(
  communicationLockSpec.includes('P12-M communication V3 architecture lock'),
  'Missing communication V3 architecture-lock regression.',
);

for (const legacyModel of [
  'model Division ',
  'model Department ',
  'model DepartmentTeam ',
  'model ManagementPosition ',
  'model ManagementAssignment ',
]) {
  assert(!schema.includes(legacyModel), `Legacy Prisma model remains: ${legacyModel.trim()}`);
}

for (const requiredMarker of [
  'EXCLUDED_DIR_NAMES',
  'apps/api/storage',
  'apps/api/src/generated',
  'coverage',
  'node_modules',
  'is_env_secret',
  '.dump',
  '.sql.gz',
  'Sanitization verification: PASS',
]) {
  assert(
    backupScript.includes(requiredMarker),
    `Source-backup hygiene script is missing required exclusion marker: ${requiredMarker}`,
  );
}

console.log('Phase 13 final architecture lock verification');
console.log('===========================================');
console.log('Final architecture report: PASS');
console.log('Cutover/rollback boundary: PASS');
console.log('Authorization regression evidence: PASS');
console.log('Legacy schema model absence: PASS');
console.log('Source-package hygiene guard: PASS');
console.log('PASS: PHASE 13 — COMPLETE / FINAL ARCHITECTURE LOCK — 23/23');
