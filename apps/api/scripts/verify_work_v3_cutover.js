#!/usr/bin/env node

const path = require('node:path');
const { config } = require('dotenv');
const { Client } = require('pg');

config({ path: path.resolve(process.cwd(), '../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required to verify the Work V3 cutover.');
  process.exit(2);
}

const stateSql = `
SELECT
  NOT EXISTS (
    SELECT 1
    FROM pg_type type_record
    JOIN pg_enum enum_record ON enum_record.enumtypid = type_record.oid
    WHERE type_record.typname = 'WorkItemStatus'
      AND enum_record.enumlabel = 'V3_RUNTIME'
  ) AS v3_runtime_status_removed,
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'work_items'
      AND column_name = 'runtime_status'
  ) AS runtime_status_column_removed,
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
  ) AS retired_work_columns_removed;
`;

const countsSql = `
SELECT
  COUNT(*)::bigint AS total_work,
  COUNT(*) FILTER (
    WHERE "office_id" IS NULL
      OR "work_type_version_id" IS NULL
      OR "primary_owner_org_unit_id" IS NULL
  )::bigint AS incomplete_org_context_rows,
  (
    SELECT COUNT(*)::bigint
    FROM (
      SELECT participant."work_item_id"
      FROM "work_org_unit_participants" participant
      WHERE participant."role" = 'PRIMARY_OWNER'
        AND participant."ended_at" IS NULL
      GROUP BY participant."work_item_id"
      HAVING COUNT(*) > 1
    ) duplicate_work
  ) AS duplicate_active_primary_owner
FROM "work_items";
`;

function asNumber(value) {
  return Number.parseInt(String(value), 10);
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const [stateResult, countsResult] = await Promise.all([
      client.query(stateSql),
      client.query(countsSql),
    ]);
    const state = stateResult.rows[0];
    const counts = Object.fromEntries(
      Object.entries(countsResult.rows[0]).map(([key, value]) => [
        key,
        asNumber(value),
      ]),
    );

    const failures = [];
    for (const [key, value] of Object.entries(state)) {
      if (value !== true) failures.push(`${key} is not satisfied`);
    }
    if (counts.incomplete_org_context_rows !== 0) {
      failures.push(
        `${counts.incomplete_org_context_rows} Work item(s) are missing canonical Office/Work Type/Primary Owner context`,
      );
    }
    if (counts.duplicate_active_primary_owner !== 0) {
      failures.push(
        `${counts.duplicate_active_primary_owner} Work item(s) have duplicate active Primary Owners`,
      );
    }

    console.log('Work V3 post-cutover verification');
    console.table({
      v3RuntimeStatusRemoved: state.v3_runtime_status_removed,
      runtimeStatusColumnRemoved: state.runtime_status_column_removed,
      retiredWorkColumnsRemoved: state.retired_work_columns_removed,
      totalWork: counts.total_work,
      incompleteOrgContextRows: counts.incomplete_org_context_rows,
      duplicateActivePrimaryOwner: counts.duplicate_active_primary_owner,
    });

    if (failures.length > 0) {
      for (const failure of failures) console.error(`FAIL: ${failure}`);
      process.exitCode = 1;
      return;
    }

    console.log('PASS: Work V3 post-cutover state is clean.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Work V3 cutover verification failed.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
