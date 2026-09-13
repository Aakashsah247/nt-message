#!/usr/bin/env node

const path = require('node:path');
const { config } = require('dotenv');
const { Client } = require('pg');

config({ path: path.resolve(process.cwd(), '../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required to verify the Phase 13 runtime cutover.');
  process.exit(2);
}

const sql = `
SELECT
  COUNT(*) FILTER (
    WHERE "status" <> 'REJECTED'
      AND ("office_id" IS NULL OR "intended_org_unit_id" IS NULL)
  )::bigint AS active_request_missing_v3_scope,
  COUNT(*) FILTER (
    WHERE "office_id" IS NOT NULL
      AND "intended_org_unit_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "org_units" ou
        WHERE ou."id" = ar."intended_org_unit_id"
          AND ou."office_id" = ar."office_id"
      )
  )::bigint AS request_scope_mismatch,
  COUNT(*) FILTER (
    WHERE "management_position_id" IS NOT NULL
      AND "office_id" IS NOT NULL
      AND "intended_org_unit_id" IS NOT NULL
      AND "status" <> 'REJECTED'
  )::bigint AS active_v3_request_with_legacy_management_position
FROM "account_requests" ar;
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

    console.table(counts);

    const failures = [];
    if (counts.active_request_missing_v3_scope !== 0) {
      failures.push(`${counts.active_request_missing_v3_scope} active account request(s) are missing Office/OrgUnit scope`);
    }
    if (counts.request_scope_mismatch !== 0) {
      failures.push(`${counts.request_scope_mismatch} account request(s) point to an OrgUnit outside their Office`);
    }
    if (counts.active_v3_request_with_legacy_management_position !== 0) {
      failures.push(`${counts.active_v3_request_with_legacy_management_position} active V3 account request(s) still depend on a legacy management position`);
    }

    if (failures.length) {
      console.error('\nPhase 13 runtime-cutover verification FAILED:');
      for (const failure of failures) console.error(`- ${failure}`);
      process.exitCode = 1;
      return;
    }

    console.log('\nPhase 13 runtime-cutover verification passed.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Phase 13 runtime-cutover verification failed to run:', error);
  process.exitCode = 1;
});
