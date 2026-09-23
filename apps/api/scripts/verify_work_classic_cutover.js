#!/usr/bin/env node

const path = require('node:path');
const { config } = require('dotenv');
const { Client } = require('pg');

config({ path: path.resolve(process.cwd(), '../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required to verify the classic Work cutover.');
  process.exit(2);
}

const expectedMigrations = [
  '20260919040000_restore_classic_work_management_v3',
  '20260919043000_canonical_work_type_templates',
  '20260919044000_remove_v3_work_runtime_discriminator',
];

const stateSql = `
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'work_items'
      AND column_name = 'assigned_operational_team_id'
  ) AS has_main_team_column,
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'work_items'
      AND column_name = 'runtime_status'
  ) AS runtime_status_removed,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'work_type_versions'
      AND column_name = 'template'
  ) AS has_template_column,
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'work_items'
      AND column_name IN (
        'type',
        'division_id',
        'department_id',
        'assigned_team_id',
        'responsible_manager_account_id'
      )
  ) AS retired_work_columns_absent,
  NOT EXISTS (
    SELECT 1
    FROM pg_type type_record
    JOIN pg_enum enum_record ON enum_record.enumtypid = type_record.oid
    WHERE type_record.typname = 'WorkItemStatus'
      AND enum_record.enumlabel = 'V3_RUNTIME'
  ) AS v3_enum_removed,
  NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'enforce_work_collaboration_request_integrity'
  ) AS obsolete_function_removed,
  NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'work_collaboration_requests_integrity_trigger'
      AND NOT tgisinternal
  ) AS obsolete_trigger_removed;
`;

const countsSql = `
WITH expected_team AS (
  SELECT DISTINCT ON (stage."work_item_id")
    stage."work_item_id",
    assignment."target_operational_team_id"
  FROM "work_stages" stage
  JOIN "work_stage_assignments" assignment
    ON assignment."work_stage_id" = stage."id"
  WHERE stage."code" = 'EXECUTION'
    AND assignment."assignment_role" = 'PRIMARY'
    AND assignment."target_operational_team_id" IS NOT NULL
  ORDER BY
    stage."work_item_id",
    CASE WHEN assignment."ends_at" IS NULL THEN 0 ELSE 1 END,
    assignment."starts_at" DESC,
    assignment."created_at" DESC,
    assignment."id" DESC
),
active_work AS (
  SELECT item.*, version."template"
  FROM "work_items" item
  JOIN "work_type_versions" version
    ON version."id" = item."work_type_version_id"
  WHERE item."status"::text NOT IN ('CLOSED', 'CANCELLED')
)
SELECT
  (SELECT COUNT(*)::bigint
   FROM "work_items"
   WHERE "status"::text = 'V3_RUNTIME') AS v3_work_rows,
  (SELECT COUNT(*)::bigint
   FROM "work_activities"
   WHERE "from_status"::text = 'V3_RUNTIME'
      OR "to_status"::text = 'V3_RUNTIME') AS v3_activity_status_rows,
  (SELECT COUNT(*)::bigint
   FROM "work_help_requests"
   WHERE "previous_status"::text = 'V3_RUNTIME') AS v3_help_previous_status_rows,
  (SELECT COUNT(*)::bigint
   FROM "work_items"
   WHERE "office_id" IS NULL
      OR "work_type_version_id" IS NULL
      OR "primary_owner_org_unit_id" IS NULL) AS incomplete_org_context_rows,
  (SELECT COUNT(*)::bigint
   FROM "work_type_versions"
   WHERE "template" NOT IN ('STANDARD', 'TEAM_SALES', 'ADMINISTRATIVE')) AS invalid_template_rows,
  (SELECT COUNT(*)::bigint
   FROM expected_team expected
   JOIN "work_items" item ON item."id" = expected."work_item_id"
   WHERE item."assigned_operational_team_id" IS DISTINCT FROM expected."target_operational_team_id") AS main_team_mismatch_rows,
  (SELECT COUNT(*)::bigint
   FROM active_work
   WHERE "responsible_reviewer_account_id" IS NULL) AS active_missing_reviewer_rows,
  (SELECT COUNT(*)::bigint
   FROM active_work
   WHERE "template" <> 'ADMINISTRATIVE'
     AND "assigned_operational_team_id" IS NULL) AS active_operational_missing_team_rows,
  (SELECT COUNT(*)::bigint
   FROM active_work
   WHERE "template" <> 'ADMINISTRATIVE'
     AND "registered_at" IS NULL) AS active_operational_missing_registered_at_rows,
  (SELECT COUNT(*)::bigint
   FROM active_work
   WHERE "template" = 'TEAM_SALES'
     AND "sales_member_account_id" IS NULL) AS active_sales_missing_member_rows,
  (SELECT COUNT(*)::bigint
   FROM "work_items" item
   WHERE item."status"::text = 'COMPLETED_PENDING_REVIEW'
     AND NOT EXISTS (
       SELECT 1 FROM "work_completion_reports" report
       WHERE report."work_item_id" = item."id"
     )) AS pending_review_missing_report_rows,
  (SELECT COUNT(*)::bigint
   FROM active_work item
   WHERE EXISTS (
     SELECT 1
     FROM "work_assignments" assignment
     WHERE assignment."work_item_id" = item."id"
       AND assignment."assignee_account_id" = item."responsible_reviewer_account_id"
       AND assignment."ended_at" IS NULL
   )) AS reviewer_assignment_conflict_rows,
  (SELECT COUNT(*)::bigint
   FROM active_work item
   JOIN "accounts" reviewer
     ON reviewer."id" = item."responsible_reviewer_account_id"
   WHERE item."assigned_operational_team_id" IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM "operational_team_members" member
       WHERE member."team_id" = item."assigned_operational_team_id"
         AND member."employee_id" = reviewer."employee_id"
         AND member."starts_at" <= CURRENT_TIMESTAMP
         AND (member."ends_at" IS NULL OR member."ends_at" > CURRENT_TIMESTAMP)
     )) AS reviewer_team_conflict_rows;
`;

function toNumber(value) {
  return Number.parseInt(String(value), 10);
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const stateResult = await client.query(stateSql);
    const countsResult = await client.query(countsSql);
    const migrationResult = await client.query(
      `SELECT migration_name, started_at, finished_at, rolled_back_at, logs
       FROM "_prisma_migrations"
       WHERE migration_name = ANY($1::text[])
       ORDER BY migration_name, started_at`,
      [expectedMigrations],
    );

    const state = stateResult.rows[0];
    const counts = Object.fromEntries(
      Object.entries(countsResult.rows[0]).map(([key, value]) => [key, toNumber(value)]),
    );
    const applied = new Set(
      migrationResult.rows
        .filter((row) => row.finished_at && !row.rolled_back_at)
        .map((row) => row.migration_name),
    );
    const unresolvedFailures = migrationResult.rows.filter(
      (row) => !row.finished_at && !row.rolled_back_at,
    );

    const failures = [];
    for (const [key, value] of Object.entries(state)) {
      if (value !== true) failures.push(`${key} is not satisfied`);
    }
    for (const [key, value] of Object.entries(counts)) {
      if (value !== 0) failures.push(`${key}=${value}`);
    }
    for (const migrationName of expectedMigrations) {
      if (!applied.has(migrationName)) {
        failures.push(`migration not applied: ${migrationName}`);
      }
    }
    for (const row of unresolvedFailures) {
      failures.push(`unresolved failed migration: ${row.migration_name}`);
    }

    console.log('Classic Work cutover database verification');
    console.table({
      assignedOperationalTeamColumn: state.has_main_team_column,
      runtimeStatusRemoved: state.runtime_status_removed,
      workTypeTemplateColumn: state.has_template_column,
      retiredWorkColumnsAbsent: state.retired_work_columns_absent,
      v3EnumRemoved: state.v3_enum_removed,
      obsoleteCollaborationFunctionRemoved: state.obsolete_function_removed,
      obsoleteCollaborationTriggerRemoved: state.obsolete_trigger_removed,
      ...counts,
      unresolvedFailedMigrations: unresolvedFailures.length,
    });

    if (failures.length > 0) {
      for (const failure of failures) console.error(`FAIL: ${failure}`);
      process.exitCode = 1;
      return;
    }

    console.log('PASS: classic Work cutover database state is clean.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Classic Work cutover database verification failed.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
