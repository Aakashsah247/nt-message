import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaFile = new URL("../../api/prisma/schema.prisma", import.meta.url);
const migrationFile = new URL("../../api/prisma/migrations/20260912014000_add_final_account_class_foundation/migration.sql", import.meta.url);
const authServiceFile = new URL("../../api/src/auth/auth.service.ts", import.meta.url);
const tokenValidationFile = new URL("../../api/src/auth/services/access-token-validation.service.ts", import.meta.url);
const authTypesFile = new URL("../../api/src/auth/types/auth.types.ts", import.meta.url);
const webAuthTypesFile = new URL("../src/types/auth.ts", import.meta.url);

const [schema, migration, authService, tokenValidation, authTypes, webAuthTypes] =
  await Promise.all([
    readFile(schemaFile, "utf8"),
    readFile(migrationFile, "utf8"),
    readFile(authServiceFile, "utf8"),
    readFile(tokenValidationFile, "utf8"),
    readFile(authTypesFile, "utf8"),
    readFile(webAuthTypesFile, "utf8"),
  ]);

test("P13-B establishes SUPER_ADMIN/OFFICE_USER as the platform account class", () => {
  assert.match(schema, /enum AccountClass\s*\{[\s\S]*SUPER_ADMIN[\s\S]*OFFICE_USER[\s\S]*\}/);
  assert.match(schema, /accountClass\s+AccountClass\s+@default\(OFFICE_USER\)/);
  assert.match(migration, /WHEN "role" = 'SUPER_ADMIN'.*THEN 'SUPER_ADMIN'/s);
  assert.match(migration, /ELSE 'OFFICE_USER'/);
  assert.match(migration, /UPDATE "auth_sessions"[\s\S]*"revoked_at" = NOW\(\)/);
  assert.match(webAuthTypes, /export type AccountClass = "SUPER_ADMIN" \| "OFFICE_USER"/);
});

test("P13-B JWT identity carries accountClass instead of legacy hierarchy role", () => {
  assert.match(authTypes, /accountClass: AccountClass/);
  const accessPayloadType = authTypes.match(/export interface AccessTokenPayload \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.doesNotMatch(accessPayloadType, /role: AccountRole/);
  assert.match(authService, /const accessPayload = \{[\s\S]*accountClass,[\s\S]*type: 'access'/);
  assert.doesNotMatch(authService, /const accessPayload = \{[\s\S]*?\n\s*role,/);
  assert.match(tokenValidation, /payload\.accountClass !== session\.account\.accountClass/);
});

test("P13-B authentication stays independent from mutable leadership authority", () => {
  assert.doesNotMatch(authService, /managementAssignment/);
  assert.doesNotMatch(tokenValidation, /managementAssignment/);
  assert.doesNotMatch(authService, /orgLeadershipAssignment/);
  assert.doesNotMatch(authService, /operationalTeamLeadAssignment/);
  assert.doesNotMatch(tokenValidation, /orgLeadershipAssignment/);
  assert.doesNotMatch(tokenValidation, /operationalTeamLeadAssignment/);
});
