import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const employeePage = readFileSync(new URL('../src/pages/EmployeeWorkPage.tsx', import.meta.url), 'utf8');
const managementPage = readFileSync(new URL('../src/pages/ManagementWorkPage.tsx', import.meta.url), 'utf8');
const parityService = readFileSync(new URL('../src/services/work-main-parity.service.ts', import.meta.url), 'utf8');
const helpLabels = readFileSync(new URL('../src/utils/work-help.ts', import.meta.url), 'utf8');
const workItemsService = readFileSync(new URL('../../api/src/work-management/work-items.service.ts', import.meta.url), 'utf8');
const lifecycleService = readFileSync(new URL('../../api/src/work-management/work-lifecycle.service.ts', import.meta.url), 'utf8');


test('Need Help removes Safety, adds FAP maintenance, and requires a structured material choice', () => {
  assert.match(helpLabels, /FAP_MAINTENANCE: "FAP maintenance"/);
  assert.doesNotMatch(employeePage, /SELECTABLE_HELP_REASONS:[\s\S]*SAFETY_CONCERN/);
  assert.match(helpLabels, /STB: "STB"/);
  assert.match(helpLabels, /CPE: "CPE"/);
  assert.match(helpLabels, /DROP_FIBER: "Drop fiber"/);
  assert.match(managementPage, /<option value="FAP_MAINTENANCE">FAP maintenance<\/option>/);
  assert.doesNotMatch(managementPage, /<option value="SAFETY_CONCERN">/);
  assert.match(parityService, /materialType: payload\.materialType/);
});

test('manager Work detail receives and renders pending Help request purpose and note', () => {
  assert.match(workItemsService, /helpRequests:\s*\{[\s\S]*reason: true,[\s\S]*materialType: true,[\s\S]*note: true/);
  assert.match(managementPage, /selectedWork\?\.helpRequests\?\.filter\(\(request\) => request\.status === "PENDING"\)/);
  assert.match(managementPage, /WORK_HELP_REASON_LABELS\[request\.reason\]/);
  assert.match(managementPage, /WORK_HELP_MATERIAL_LABELS\[request\.materialType\]/);
  assert.match(managementPage, /management-work__help-request-note/);
  assert.match(managementPage, /\{request\.note\}/);
});

test('Help requested notification includes the operational purpose', () => {
  assert.match(lifecycleService, /body: `\$\{result\.workItem\.ticketNumber\}: \$\{purpose\}`/);
  assert.match(lifecycleService, /reason: dto\.reason/);
  assert.match(lifecycleService, /materialType: dto\.materialType/);
});
