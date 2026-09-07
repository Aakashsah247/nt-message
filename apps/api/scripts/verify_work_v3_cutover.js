#!/usr/bin/env node

const path = require('node:path');
const { config } = require('dotenv');
const { Client } = require('pg');

config({ path: path.resolve(process.cwd(), '../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required to verify the Work Runtime V3 cutover.');
  process.exit(2);
}

const sql = `
WITH work_counts AS (
  SELECT
    COUNT(*)::bigint AS total_work,
    COUNT(*) FILTER (WHERE "status" <> 'V3_RUNTIME')::bigint AS legacy_work,
    COUNT(*) FILTER (
      WHERE "status" <> 'V3_RUNTIME'
        AND "office_id" IS NOT NULL
        AND "work_type_version_id" IS NOT NULL
        AND "primary_owner_org_unit_id" IS NOT NULL
        AND "runtime_status" IS NOT NULL
    )::bigint AS legacy_bound,
    COUNT(*) FILTER (WHERE "status" = 'V3_RUNTIME')::bigint AS native_v3,
    COUNT(*) FILTER (
      WHERE "status" = 'V3_RUNTIME'
        AND "office_id" IS NOT NULL
        AND "work_type_version_id" IS NOT NULL
        AND "primary_owner_org_unit_id" IS NOT NULL
        AND "runtime_status" IS NOT NULL
        AND "type" IS NULL
        AND "division_id" IS NULL
        AND "department_id" IS NULL
        AND "assigned_team_id" IS NULL
        AND "sales_member_account_id" IS NULL
        AND "sales_coordination_status" IS NULL
        AND "sales_documents_sent_at" IS NULL
        AND "sales_completed_at" IS NULL
        AND "sales_completion_note" IS NULL
        AND "registered_at" IS NULL
        AND "parent_work_item_id" IS NULL
        AND "responsible_manager_account_id" IS NULL
    )::bigint AS native_v3_valid
  FROM "work_items"
),
participant_counts AS (
  SELECT COUNT(*)::bigint AS legacy_primary_owner
  FROM "work_items" work_item
  WHERE work_item."status" <> 'V3_RUNTIME'
    AND EXISTS (
      SELECT 1
      FROM "work_org_unit_participants" participant
      WHERE participant."work_item_id" = work_item."id"
        AND participant."org_unit_id" = work_item."primary_owner_org_unit_id"
        AND participant."role" = 'PRIMARY_OWNER'
        AND participant."ended_at" IS NULL
    )
),
event_counts AS (
  SELECT COUNT(*)::bigint AS legacy_backfill_event
  FROM "work_items" work_item
  WHERE work_item."status" <> 'V3_RUNTIME'
    AND EXISTS (
      SELECT 1
      FROM "work_events" event_record
      WHERE event_record."work_item_id" = work_item."id"
        AND event_record."details" ->> 'source' = 'WM_V2_COMPATIBILITY_BACKFILL'
    )
),
duplicate_counts AS (
  SELECT COUNT(*)::bigint AS duplicate_active_primary_owner
  FROM (
    SELECT participant."work_item_id"
    FROM "work_org_unit_participants" participant
    WHERE participant."role" = 'PRIMARY_OWNER'
      AND participant."ended_at" IS NULL
    GROUP BY participant."work_item_id"
    HAVING COUNT(*) > 1
  ) duplicate_work
)
SELECT
  work_counts.*,
  participant_counts.legacy_primary_owner,
  event_counts.legacy_backfill_event,
  duplicate_counts.duplicate_active_primary_owner
FROM work_counts, participant_counts, event_counts, duplicate_counts;
`;

function asNumber(value) {
  return Number.parseInt(String(value), 10);
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = await client.query(sql);
    const row = result.rows[0];
    const counts = Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, asNumber(value)]),
    );

    const failures = [];
    if (counts.legacy_bound !== counts.legacy_work) {
      failures.push(
        `legacy compatibility binding mismatch (${counts.legacy_bound}/${counts.legacy_work})`,
      );
    }
    if (counts.legacy_primary_owner !== counts.legacy_work) {
      failures.push(
        `legacy Primary Owner participant mismatch (${counts.legacy_primary_owner}/${counts.legacy_work})`,
      );
    }
    if (counts.legacy_backfill_event !== counts.legacy_work) {
      failures.push(
        `legacy compatibility event mismatch (${counts.legacy_backfill_event}/${counts.legacy_work})`,
      );
    }
    if (counts.native_v3_valid !== counts.native_v3) {
      failures.push(
        `native V3 context mismatch (${counts.native_v3_valid}/${counts.native_v3})`,
      );
    }
    if (counts.duplicate_active_primary_owner !== 0) {
      failures.push(
        `${counts.duplicate_active_primary_owner} Work item(s) have duplicate active Primary Owners`,
      );
    }

    console.log('Work Runtime V3 cutover reconciliation');
    console.table({
      totalWork: counts.total_work,
      legacyWork: counts.legacy_work,
      legacyBound: counts.legacy_bound,
      legacyPrimaryOwner: counts.legacy_primary_owner,
      legacyBackfillEvent: counts.legacy_backfill_event,
      nativeV3: counts.native_v3,
      nativeV3Valid: counts.native_v3_valid,
      duplicateActivePrimaryOwner: counts.duplicate_active_primary_owner,
    });

    if (failures.length > 0) {
      for (const failure of failures) console.error(`FAIL: ${failure}`);
      process.exitCode = 1;
      return;
    }

    console.log('PASS: Work Runtime V3 cutover reconciliation is clean.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Work Runtime V3 cutover verification failed.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
