#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { config } = require('dotenv');
const { Client } = require('pg');

config({ path: path.resolve(process.cwd(), '../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required to verify Phase 13 cutover readiness.');
  process.exit(2);
}

const FINAL_DESTRUCTIVE_MIGRATION =
  '20260913032500_remove_phase13_legacy_schema';
const migrationsDirectory = path.resolve(process.cwd(), 'prisma', 'migrations');

function number(value) {
  return Number.parseInt(String(value), 10);
}

async function main() {
  const localMigrations = fs
    .readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const destructiveBoundaryIndex = localMigrations.indexOf(
    FINAL_DESTRUCTIVE_MIGRATION,
  );
  if (destructiveBoundaryIndex < 0) {
    throw new Error(
      `Required Phase 13 cutover boundary migration ${FINAL_DESTRUCTIVE_MIGRATION} is missing locally.`,
    );
  }
  const postBoundaryMigrations = localMigrations.slice(destructiveBoundaryIndex + 1);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const migrationResult = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::bigint AS applied,
        COUNT(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::bigint AS incomplete,
        COUNT(*) FILTER (
          WHERE migration_name = $1
            AND finished_at IS NOT NULL
            AND rolled_back_at IS NULL
        )::bigint AS destructive_boundary_applied
      FROM "_prisma_migrations"
    `, [FINAL_DESTRUCTIVE_MIGRATION]);

    const readinessResult = await client.query(`
      WITH readiness AS (
        SELECT
          (
            SELECT COUNT(*)
            FROM accounts
            WHERE account_class = 'SUPER_ADMIN'
          )::bigint AS super_admin_accounts,
          (
            SELECT COUNT(*)
            FROM accounts
            WHERE (account_class = 'SUPER_ADMIN' AND role <> 'SUPER_ADMIN')
               OR (account_class = 'OFFICE_USER' AND role <> 'EMPLOYEE')
          )::bigint AS account_class_role_mismatches,
          (
            SELECT COUNT(*)
            FROM employees e
            WHERE e.status = 'ACTIVE'
              AND e.employment_status = 'ACTIVE'
              AND e.archived_at IS NULL
              AND NOT EXISTS (
                SELECT 1
                FROM org_memberships membership
                WHERE membership.employee_id = e.id
                  AND membership.membership_type = 'PRIMARY'
                  AND membership.ends_at IS NULL
              )
          )::bigint AS active_employee_primary_membership_gaps,
          (
            SELECT COUNT(*)
            FROM org_units unit
            WHERE NOT EXISTS (
              SELECT 1
              FROM org_unit_closure closure
              WHERE closure.ancestor_org_unit_id = unit.id
                AND closure.descendant_org_unit_id = unit.id
                AND closure.depth = 0
            )
          )::bigint AS org_unit_self_closure_gaps,
          (
            SELECT COUNT(*)
            FROM work_items
            WHERE office_id IS NULL
               OR work_type_version_id IS NULL
               OR primary_owner_org_unit_id IS NULL
          )::bigint AS work_v3_context_gaps,
          (
            SELECT COUNT(*)
            FROM account_requests
            WHERE status <> 'REJECTED'
              AND (office_id IS NULL OR intended_org_unit_id IS NULL)
          )::bigint AS account_request_v3_scope_gaps,
          (
            (SELECT COUNT(*) FROM duty_shift_templates WHERE office_id IS NULL OR org_unit_id IS NULL)
            + (SELECT COUNT(*) FROM duty_schedule_series WHERE office_id IS NULL OR org_unit_id IS NULL)
            + (SELECT COUNT(*) FROM duty_assignments WHERE office_id IS NULL OR org_unit_id IS NULL)
            + (SELECT COUNT(*) FROM duty_coverage_requirements WHERE office_id IS NULL OR org_unit_id IS NULL)
            + (SELECT COUNT(*) FROM duty_exceptions WHERE office_id IS NULL OR org_unit_id IS NULL)
            + (SELECT COUNT(*) FROM duty_holidays WHERE office_id IS NULL)
          )::bigint AS duty_v3_scope_gaps,
          (
            SELECT COUNT(*)
            FROM conversations
            WHERE group_kind = 'OFFICIAL'
              AND (
                official_scope_type IS NULL
                OR official_office_id IS NULL
                OR official_membership_mode IS NULL
                OR (official_scope_type = 'ORG_UNIT' AND official_org_unit_id IS NULL)
              )
          )::bigint AS official_group_v3_scope_gaps,
          (
            SELECT COUNT(*)
            FROM announcements
            WHERE audience_type IN ('OFFICE', 'ORG_UNIT')
              AND (
                office_id IS NULL
                OR (audience_type = 'ORG_UNIT' AND org_unit_id IS NULL)
              )
          )::bigint AS announcement_v3_scope_gaps
      )
      SELECT * FROM readiness
    `);

    const migrationCounts = Object.fromEntries(
      Object.entries(migrationResult.rows[0]).map(([key, value]) => [key, number(value)]),
    );
    const readinessCounts = Object.fromEntries(
      Object.entries(readinessResult.rows[0]).map(([key, value]) => [key, number(value)]),
    );

    console.log('Phase 13 production cutover readiness');
    console.log(`Local migration directories: ${localMigrations.length}`);
    console.log(`Post-Phase-13 migrations: ${postBoundaryMigrations.length}`);
    console.table(migrationCounts);
    console.table(readinessCounts);

    const failures = [];
    if (migrationCounts.applied !== localMigrations.length) {
      failures.push(
        `applied migrations ${migrationCounts.applied} != local migrations ${localMigrations.length}`,
      );
    }
    if (migrationCounts.incomplete !== 0) {
      failures.push(`incomplete migrations: ${migrationCounts.incomplete}`);
    }
    if (migrationCounts.destructive_boundary_applied !== 1) {
      failures.push(
        `${FINAL_DESTRUCTIVE_MIGRATION} is not applied exactly once`,
      );
    }
    if (readinessCounts.super_admin_accounts !== 1) {
      failures.push(
        `expected exactly one Super Admin account, got ${readinessCounts.super_admin_accounts}`,
      );
    }
    for (const [name, value] of Object.entries(readinessCounts)) {
      if (name === 'super_admin_accounts') continue;
      if (value !== 0) failures.push(`${name}: ${value}`);
    }

    if (failures.length) {
      console.error('\nPhase 13 cutover readiness FAILED:');
      for (const failure of failures) console.error(`- ${failure}`);
      process.exitCode = 1;
      return;
    }

    console.log('\nPASS: database is ready for the Phase 13 post-migration cutover state.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Phase 13 cutover readiness verification failed to run.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
