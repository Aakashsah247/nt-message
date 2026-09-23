#!/usr/bin/env node

const { Client } = require('pg');
const { redactDatabaseUrl, requireDatabaseUrl } = require('./phase13_database_tools');

const DEFAULT_WORK_TYPE_CODES = [
  'ROUTINE_WORK',
  'TROUBLE_TICKET',
  'NETWORK_MAINTENANCE',
  'NEW_INSTALLATION',
  'UPDATE_SERVICES',
  'INSPECTION',
  'EMERGENCY_WORK',
  'ADMINISTRATIVE_WORK',
];

async function main() {
  const databaseUrl = requireDatabaseUrl();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(`
      WITH active_offices AS (
        SELECT id
        FROM offices
        WHERE is_active = true
      ),
      formal_type_gaps AS (
        SELECT office.id
        FROM active_offices office
        WHERE (
          SELECT COUNT(*)
          FROM org_unit_types type
          WHERE type.office_id = office.id
            AND type.code IN ('DIVISION','DEPARTMENT','SECTION','UNIT')
            AND type.is_active = true
            AND type.is_team = false
        ) <> 4
      ),
      placement_pending_type_gaps AS (
        SELECT office.id
        FROM active_offices office
        WHERE (
          SELECT COUNT(*)
          FROM org_unit_types type
          WHERE type.office_id = office.id
            AND type.code = 'PLACEMENT_PENDING'
            AND type.is_active = false
            AND type.is_team = false
        ) <> 1
      ),
      default_work_type_gaps AS (
        SELECT office.id
        FROM active_offices office
        WHERE EXISTS (
          SELECT 1
          FROM unnest($1::text[]) AS required(code)
          WHERE NOT EXISTS (
            SELECT 1
            FROM work_type_definitions definition
            WHERE definition.office_id = office.id
              AND definition.code = required.code
          )
        )
      )
      SELECT
        (SELECT COUNT(*)::int FROM accounts) AS accounts,
        (SELECT COUNT(*)::int FROM employees) AS employees,
        (SELECT COUNT(*)::int FROM accounts WHERE account_class = 'SUPER_ADMIN') AS super_admins,
        (SELECT COUNT(*)::int FROM active_offices) AS active_offices,
        (SELECT COUNT(*)::int FROM offices WHERE code = 'PATAN' AND is_active = true) AS patan_offices,
        (SELECT COUNT(*)::int FROM formal_type_gaps) AS formal_type_office_gaps,
        (SELECT COUNT(*)::int FROM placement_pending_type_gaps) AS placement_pending_type_office_gaps,
        (SELECT COUNT(*)::int FROM default_work_type_gaps) AS default_work_type_office_gaps,
        (SELECT COUNT(*)::int FROM employees WHERE department IS NOT NULL) AS legacy_department_values,
        (SELECT COUNT(*)::int FROM org_units unit
          WHERE NOT EXISTS (
            SELECT 1
            FROM org_unit_closure closure
            WHERE closure.ancestor_org_unit_id = unit.id
              AND closure.descendant_org_unit_id = unit.id
              AND closure.depth = 0
          )) AS org_unit_self_closure_gaps,
        (SELECT COUNT(*)::int FROM employees e
          WHERE e.status = 'ACTIVE' AND e.employment_status = 'ACTIVE' AND e.archived_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM org_memberships membership
              WHERE membership.employee_id = e.id
                AND membership.membership_type = 'PRIMARY'
                AND membership.ends_at IS NULL
            )) AS active_membership_gaps,
        (SELECT COUNT(*)::int FROM accounts
          WHERE (account_class = 'SUPER_ADMIN' AND role <> 'SUPER_ADMIN')
             OR (account_class = 'OFFICE_USER' AND role <> 'EMPLOYEE')) AS account_role_mismatches,
        (SELECT COUNT(*)::int FROM work_items
          WHERE office_id IS NULL
             OR work_type_version_id IS NULL
             OR primary_owner_org_unit_id IS NULL) AS work_context_gaps,
        (SELECT COUNT(*)::int FROM account_requests
          WHERE status <> 'REJECTED'
            AND (office_id IS NULL OR intended_org_unit_id IS NULL)) AS account_request_scope_gaps,
        (SELECT COUNT(*)::int FROM conversations
          WHERE group_kind = 'OFFICIAL'
            AND (
              official_scope_type IS NULL
              OR official_office_id IS NULL
              OR official_membership_mode IS NULL
              OR (official_scope_type = 'ORG_UNIT' AND official_org_unit_id IS NULL)
            )) AS official_group_scope_gaps,
        (SELECT COUNT(*)::int FROM announcements
          WHERE audience_type IN ('OFFICE', 'ORG_UNIT')
            AND (
              office_id IS NULL
              OR (audience_type = 'ORG_UNIT' AND org_unit_id IS NULL)
            )) AS announcement_scope_gaps,
        (SELECT COUNT(*)::int FROM operational_teams) AS operational_teams,
        (SELECT COUNT(*)::int FROM work_items) AS work_items,
        (SELECT COUNT(*)::int FROM work_type_definitions) AS work_type_definitions,
        (SELECT COUNT(*)::int FROM work_type_versions WHERE status = 'DRAFT') AS work_type_drafts,
        (SELECT COUNT(*)::int FROM work_field_definitions) AS work_type_fields,
        (SELECT COUNT(*)::int FROM work_stage_definitions) AS work_type_stages,
        (SELECT COUNT(*)::int FROM duty_assignments) AS duty_assignments,
        (SELECT COUNT(*)::int FROM conversations) AS conversations,
        (SELECT COUNT(*)::int FROM account_requests) AS account_requests,
        (SELECT COUNT(*)::int FROM delegated_permissions) AS delegated_permissions
    `, [DEFAULT_WORK_TYPE_CODES]);

    const counts = result.rows[0];
    console.log('Phase 15 V3 production-foundation verification');
    console.log(`Database: ${redactDatabaseUrl(databaseUrl)}`);
    console.table(counts);

    const failures = [];
    if (counts.accounts < 1) failures.push('no accounts remain');
    if (counts.employees < 1) failures.push('no employees remain');
    if (counts.super_admins !== 1) {
      failures.push(`expected one Super Admin, got ${counts.super_admins}`);
    }
    if (counts.active_offices < 1) failures.push('no active Office remains');
    if (counts.patan_offices !== 1) {
      failures.push(`expected one active PATAN Office, got ${counts.patan_offices}`);
    }

    for (const key of [
      'formal_type_office_gaps',
      'placement_pending_type_office_gaps',
      'default_work_type_office_gaps',
      'legacy_department_values',
      'org_unit_self_closure_gaps',
      'active_membership_gaps',
      'account_role_mismatches',
      'work_context_gaps',
      'account_request_scope_gaps',
      'official_group_scope_gaps',
      'announcement_scope_gaps',
    ]) {
      if (counts[key] !== 0) failures.push(`${key}: ${counts[key]}`);
    }

    if (failures.length) {
      console.error('\nPhase 15 V3 production-foundation verification FAILED:');
      for (const failure of failures) console.error(`- ${failure}`);
      process.exitCode = 1;
      return;
    }

    console.log(
      '\nPASS: active data may exist, and the database still satisfies the clean V3 production invariants.',
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Phase 15 V3 production-foundation verification failed to run.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
