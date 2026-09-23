const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..', '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

const hierarchy = read('apps/api/src/organization/organization-hierarchy.service.ts');
const authorization = read('apps/api/src/organization/organization-authorization.service.ts');
const teamService = read('apps/api/src/team-management/team-management.service.ts');
const navigation = read('apps/web/src/components/layout/management-navigation.ts');
const app = read('apps/web/src/App.tsx');

const checks = [
  ['workspace context keeps Super Admin operationally read-only', (() => {
    const start = hierarchy.indexOf('if (user.accountClass === AccountClass.SUPER_ADMIN)');
    const end = hierarchy.indexOf('const now = new Date();', start);
    const block = hierarchy.slice(start, end);
    return /workOversight: true/.test(block) && /workManagement: false/.test(block) && /dutyRoster: false/.test(block) && /teamManagement: false/.test(block) && /emergency: false/.test(block);
  })()],
  ['workspace context distinguishes top and lower OrgUnit leadership', /'ORGANIZATION_HEAD'/.test(hierarchy) && /'ORG_UNIT_HEAD'/.test(hierarchy)],
  ['workspace context recognizes Operational Team Lead as contextual employee authority', /operationalTeamLeadAssignments/.test(hierarchy) && /isOperationalTeamLead/.test(hierarchy) && /\('EMPLOYEE' as const\)/.test(hierarchy)],
  ['delegated capabilities feed workspace visibility', /delegatedPermission\.findMany/.test(hierarchy) && /hasDelegatedWorkManagement/.test(hierarchy) && /hasDelegatedDutyManagement/.test(hierarchy)],
  ['Team Management uses Operational Team runtime', /operationalTeamMember/.test(teamService) && /operationalTeamLeadAssignment/.test(teamService)],
  ['Team Lead is not restored as formal hierarchy management in Team Management', !/OrgLeadershipType\.TEAM_LEAD/.test(teamService)],
  ['Organization Management remains separate from Team Management', /"Organization Management"/.test(navigation) && /"\/organization"/.test(navigation) && /"Team Management"/.test(navigation) && /"\/team-management"/.test(navigation)],
  ['Team Management does not redirect to Organization & People', !/path="\/team-management"[\s\S]{0,180}Navigate to="\/organization"/.test(app)],
  ['old fixed management roles are absent from Phase 14 workspace runtime', !/SENIOR_MANAGEMENT|TEAM_MANAGER/.test(hierarchy + navigation + teamService)],
  ['Super Admin has no Work/Duty mutation capability set', !/const SUPER_ADMIN_CAPABILITIES[\s\S]*CAPABILITIES\.WORK_ASSIGN/.test(authorization.slice(authorization.indexOf('const SUPER_ADMIN_CAPABILITIES'), authorization.indexOf('@Injectable()'))) && !/const SUPER_ADMIN_CAPABILITIES[\s\S]*CAPABILITIES\.DUTY_MANAGE/.test(authorization.slice(authorization.indexOf('const SUPER_ADMIN_CAPABILITIES'), authorization.indexOf('@Injectable()')))],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed += 1;
}

if (failed > 0) {
  console.error(`\nPhase 14 role-feature lock failed: ${failed}/${checks.length} checks failed.`);
  process.exit(1);
}

console.log(`\nPhase 14 role-feature lock passed: ${checks.length}/${checks.length} checks.`);
