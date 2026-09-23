import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Directory correction does not report success when no employee field changed", async () => {
  const panel = await source("apps/web/src/components/EmployeeDirectoryDetailPanel.tsx");

  assert.match(panel, /const identityChanged = Object\.keys\(identity\)\.length > 1/);
  assert.match(panel, /const designationChanged =/);
  assert.match(panel, /if \(!identityChanged && !designationChanged\)/);
  assert.match(panel, /detail\.correction\.noChanges/);
});

test("legacy malformed phones can be repaired without weakening new-phone validation", async () => {
  const normalizer = await source("apps/api/src/common/normalization/account-identity-normalization.ts");
  const correction = await source("apps/api/src/employees/employee-identity-correction.service.ts");
  const dto = await source("apps/api/src/employees/dto/correct-employee-identity.dto.ts");

  assert.match(normalizer, /tryNormalizeNepalPhoneNumber/);
  assert.match(normalizer, /return null;/);
  assert.match(correction, /tryNormalizeNepalPhoneNumber\(employee\.phoneNumber\)/);
  assert.match(dto, /\^\(\?:9\\d\{9\}\|9779\\d\{9\}\|\\\+9779\\d\{9\}\)\$/);
});

test("employee phone storage is canonical and unique only for active employment", async () => {
  const migration = await source("apps/api/prisma/migrations/20260916131000_enforce_employee_nepal_phone_integrity/migration.sql");
  const officePeople = await source("apps/api/src/organization/organization-people.service.ts");

  assert.match(migration, /NTC-008/);
  assert.match(migration, /\+9779817879609/);
  assert.match(migration, /employees_phone_number_nepal_e164_check/);
  assert.match(migration, /DROP INDEX IF EXISTS "employees_phone_number_key"/);
  assert.match(migration, /employees_active_phone_number_key/);
  assert.match(migration, /WHERE "employment_status" = 'ACTIVE'/);
  assert.match(migration, /CHECK \("phone_number" ~ '\^\\\+9779\[0-9\]\{9\}\$'\)/);
  assert.match(officePeople, /normalizeAccountIdentity/);
  assert.match(officePeople, /phoneLookupValues/);
});


test("historical ended-employment phones do not block a current employee phone", async () => {
  const accountRequests = await source("apps/api/src/account-requests/account-requests.service.ts");
  const correction = await source("apps/api/src/employees/employee-identity-correction.service.ts");
  const officePeople = await source("apps/api/src/organization/organization-people.service.ts");
  const schema = await source("apps/api/prisma/schema.prisma");

  assert.match(accountRequests, /employmentStatus: EmploymentStatus\.ACTIVE,[\s\S]{0,120}phoneNumber:/);
  assert.match(correction, /employmentStatus: EmploymentStatus\.ACTIVE,[\s\S]{0,120}phoneNumber:/);
  assert.match(officePeople, /employmentStatus: EmploymentStatus\.ACTIVE,[\s\S]{0,120}phoneNumber:/);
  assert.doesNotMatch(schema, /phoneNumber\s+String\s+@unique\(map: "employees_phone_number_key"\)/);
  assert.match(schema, /employees_active_phone_number_key partial unique index/);
});
