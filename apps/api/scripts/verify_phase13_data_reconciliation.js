#!/usr/bin/env node

const path = require('node:path');
const { config } = require('dotenv');
const { Client } = require('pg');

config({ path: path.resolve(process.cwd(), '../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required to verify Phase 13 legacy-data reconciliation.');
  process.exit(2);
}

const sql = `
WITH mapping_gaps AS (
  SELECT
    (
      SELECT COUNT(*)
      FROM "divisions" d
      WHERE NOT EXISTS (
        SELECT 1 FROM "legacy_org_unit_mappings" m
        WHERE m."legacy_entity_type" = 'DIVISION'
          AND m."legacy_entity_id" = d."id"
      )
    )::bigint AS division_mapping_gaps,
    (
      SELECT COUNT(*)
      FROM "departments" d
      WHERE NOT EXISTS (
        SELECT 1 FROM "legacy_org_unit_mappings" m
        WHERE m."legacy_entity_type" = 'DEPARTMENT'
          AND m."legacy_entity_id" = d."id"
      )
    )::bigint AS department_mapping_gaps,
    (
      SELECT COUNT(*)
      FROM "department_teams" t
      WHERE NOT EXISTS (
        SELECT 1 FROM "operational_teams" ot
        WHERE ot."legacy_department_team_id" = t."id"
      )
    )::bigint AS operational_team_gaps
),
people_gaps AS (
  SELECT
    (
      SELECT COUNT(*)
      FROM "employees" e
      WHERE NOT EXISTS (
        SELECT 1 FROM "org_memberships" m
        WHERE m."employee_id" = e."id"
          AND m."membership_type" = 'PRIMARY'
      )
    )::bigint AS employee_primary_history_gaps,
    (
      SELECT COUNT(*)
      FROM "employees" e
      WHERE e."status" = 'ACTIVE'
        AND e."employment_status" = 'ACTIVE'
        AND e."archived_at" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "org_memberships" m
          WHERE m."employee_id" = e."id"
            AND m."membership_type" = 'PRIMARY'
            AND m."ends_at" IS NULL
        )
    )::bigint AS active_employee_primary_gaps,
    (
      SELECT COUNT(*)
      FROM "department_team_members" legacy_member
      JOIN "operational_teams" team
        ON team."legacy_department_team_id" = legacy_member."team_id"
      WHERE NOT EXISTS (
        SELECT 1
        FROM "operational_team_members" member
        WHERE member."team_id" = team."id"
          AND member."employee_id" = legacy_member."employee_id"
      )
    )::bigint AS operational_team_member_gaps
),
runtime_gaps AS (
  SELECT
    (
      SELECT COUNT(*)
      FROM "work_items"
      WHERE "office_id" IS NULL
         OR "work_type_version_id" IS NULL
         OR "primary_owner_org_unit_id" IS NULL
         OR "runtime_status" IS NULL
    )::bigint AS work_v3_context_gaps,
    (
      SELECT COUNT(*)
      FROM "account_requests"
      WHERE "status" <> 'REJECTED'
        AND ("office_id" IS NULL OR "intended_org_unit_id" IS NULL)
    )::bigint AS account_request_v3_scope_gaps,
    (
      SELECT
        (SELECT COUNT(*) FROM "duty_shift_templates" WHERE "office_id" IS NULL OR "org_unit_id" IS NULL)
        + (SELECT COUNT(*) FROM "duty_schedule_series" WHERE "office_id" IS NULL OR "org_unit_id" IS NULL)
        + (SELECT COUNT(*) FROM "duty_assignments" WHERE "office_id" IS NULL OR "org_unit_id" IS NULL)
        + (SELECT COUNT(*) FROM "duty_coverage_requirements" WHERE "office_id" IS NULL OR "org_unit_id" IS NULL)
        + (SELECT COUNT(*) FROM "duty_exceptions" WHERE "office_id" IS NULL OR "org_unit_id" IS NULL)
        + (SELECT COUNT(*) FROM "duty_holidays" WHERE "office_id" IS NULL)
    )::bigint AS duty_v3_scope_gaps,
    (
      SELECT COUNT(*)
      FROM "conversations"
      WHERE "group_kind" = 'OFFICIAL'
        AND (
          "official_scope_type" IN ('ORGANIZATION', 'DIVISION', 'DEPARTMENT')
          OR "official_office_id" IS NULL
          OR "official_membership_mode" IS NULL
          OR ("official_scope_type" = 'ORG_UNIT' AND "official_org_unit_id" IS NULL)
        )
    )::bigint AS official_group_v3_scope_gaps,
    (
      SELECT COUNT(*)
      FROM "announcements"
      WHERE "audience_type" IN ('ORGANIZATION', 'DIVISION', 'DEPARTMENT')
         OR (
           "audience_type" IN ('OFFICE', 'ORG_UNIT')
           AND (
             "office_id" IS NULL
             OR ("audience_type" = 'ORG_UNIT' AND "org_unit_id" IS NULL)
           )
         )
    )::bigint AS announcement_v3_scope_gaps
)
SELECT *
FROM mapping_gaps, people_gaps, runtime_gaps;
`;

function asNumber(value) {
  return Number.parseInt(String(value), 10);
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = await client.query(sql);
    const counts = Object.fromEntries(
      Object.entries(result.rows[0]).map(([key, value]) => [key, asNumber(value)]),
    );

    console.log('Phase 13 legacy-data reconciliation');
    console.table(counts);

    const failures = Object.entries(counts).filter(([, value]) => value !== 0);
    if (failures.length) {
      console.error('\nPhase 13 legacy-data reconciliation FAILED:');
      for (const [name, value] of failures) {
        console.error(`- ${name}: ${value}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log('\nPASS: all legacy data required by the V3 runtime is fully reconciled.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Phase 13 legacy-data reconciliation verification failed to run.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
