import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const catalog = readFileSync(
  new URL("../../api/src/work-management/default-work-type-catalog.ts", import.meta.url),
  "utf8",
);
const catalogSpec = readFileSync(
  new URL("../../api/src/work-management/default-work-type-catalog.spec.ts", import.meta.url),
  "utf8",
);
const workTypeService = readFileSync(
  new URL("../../api/src/work-management/work-type-v3.service.ts", import.meta.url),
  "utf8",
);
const seed = readFileSync(
  new URL("../../api/prisma/seed.ts", import.meta.url),
  "utf8",
);
const resetScript = readFileSync(
  new URL("../../api/scripts/phase15_reset_development_data.js", import.meta.url),
  "utf8",
);
const createOfficeService = readFileSync(
  new URL("../../api/src/organization/organization-hierarchy.service.ts", import.meta.url),
  "utf8",
);

const FINALIZED_TYPES = [
  ["ROUTINE_WORK", "Routine Work"],
  ["TROUBLE_TICKET", "Trouble Ticket"],
  ["NETWORK_MAINTENANCE", "Network Maintenance"],
  ["NEW_INSTALLATION", "New Installation"],
  ["UPDATE_SERVICES", "Update Services"],
  ["INSPECTION", "Inspection"],
  ["EMERGENCY_WORK", "Emergency Work"],
  ["ADMINISTRATIVE_WORK", "Administrative Work"],
];

test("default Work Type catalog keeps the finalized eight Nepal Telecom types", () => {
  for (const [code, name] of FINALIZED_TYPES) {
    assert.match(catalog, new RegExp(`code: '${code}'`));
    assert.match(catalog, new RegExp(`name: '${name}'`));
  }

  assert.match(catalogSpec, /toBe\(86\)/, "backend spec must lock 86 business fields");
  assert.match(catalog, /WorkTypeTemplate\.TEAM_SALES/);
  assert.match(catalog, /ADMINISTRATIVE_WORK/);
});

test("the eight default Work Types keep the finalized business-field matrix on the fixed classic engine", () => {
  assert.match(catalog, /code: 'ROUTINE_WORK'[\s\S]*?fields: \[serviceNumber\(\)\]/);
  assert.match(catalog, /code: 'TROUBLE_TICKET'[\s\S]*?serviceNumber\(\), \.\.\.serviceTypes\(\)[\s\S]*?customerIdRequired: true/);
  assert.match(catalog, /code: 'NETWORK_MAINTENANCE'[\s\S]*?customerIdRequired: false/);
  assert.match(catalog, /code: 'NEW_INSTALLATION'[\s\S]*?tokenNumber\(\)[\s\S]*?code: 'CPC_SERIAL'[\s\S]*?\.\.\.serviceTypes\(\)[\s\S]*?sales: true/);
  assert.match(catalog, /code: 'UPDATE_SERVICES'[\s\S]*?serviceNumber\('Existing service number', false\)[\s\S]*?tokenNumber\(\)[\s\S]*?\.\.\.serviceTypes\(\)[\s\S]*?sales: true/);
  assert.match(catalog, /code: 'INSPECTION'[\s\S]*?fields: \[serviceNumber\(\)\]/);
  assert.match(catalog, /code: 'EMERGENCY_WORK'[\s\S]*?fields: \[serviceNumber\(\)\][\s\S]*?customerIdRequired: true/);
  assert.match(catalog, /code: 'ADMINISTRATIVE_WORK'[\s\S]*?code: 'TASK_TITLE'[\s\S]*?code: 'TASK_DESCRIPTION'/);
  assert.match(catalog, /options: \['DATA', 'VOICE', 'IPTV', 'SIP', 'OTHER'\]/);
  assert.match(catalog, /code: 'OTHER_SERVICE_TEXT'/);
});

test("default Work Types self-restore for page load, seed, new Office, and Phase 15 reset", () => {
  assert.match(workTypeService, /ensureDefaultWorkTypeCatalog\(tx, officeId\)/);
  assert.match(seed, /ensureDefaultWorkTypeCatalog\(tx, office\.id, actorAccountId\)/);
  assert.match(createOfficeService, /ensureDefaultWorkTypeCatalog\(/);
  assert.match(resetScript, /db:ensure-default-work-types/);
  assert.match(resetScript, /work_type_definitions !== 8/);
  assert.match(resetScript, /work_type_fields !== 86/);
  assert.match(resetScript, /work_type_stages !== 0/);
});
