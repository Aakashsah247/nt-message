#!/usr/bin/env node

const path = require('node:path');
const { config } = require('dotenv');
const { Client } = require('pg');

config({ path: path.resolve(process.cwd(), '../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required to verify the Phase 13 account-class cutover.');
  process.exit(2);
}

const sql = `
SELECT
  COUNT(*)::bigint AS total_accounts,
  COUNT(*) FILTER (WHERE "account_class" = 'SUPER_ADMIN')::bigint AS system_admin_accounts,
  COUNT(*) FILTER (WHERE "account_class" = 'OFFICE_USER')::bigint AS office_user_accounts,
  COUNT(*) FILTER (
    WHERE "role" = 'SUPER_ADMIN' AND "account_class" <> 'SUPER_ADMIN'
  )::bigint AS super_admin_role_class_mismatch,
  COUNT(*) FILTER (
    WHERE "role" <> 'SUPER_ADMIN' AND "account_class" <> 'OFFICE_USER'
  )::bigint AS office_role_class_mismatch,
  COUNT(*) FILTER (
    WHERE "account_class" = 'OFFICE_USER' AND "employee_id" IS NULL
  )::bigint AS office_user_without_employee
FROM "accounts";
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
    if (counts.super_admin_role_class_mismatch !== 0) {
      failures.push(`${counts.super_admin_role_class_mismatch} Super Admin role/account-class mismatch(es)`);
    }
    if (counts.office_role_class_mismatch !== 0) {
      failures.push(`${counts.office_role_class_mismatch} Office role/account-class mismatch(es)`);
    }
    if (counts.office_user_without_employee !== 0) {
      failures.push(`${counts.office_user_without_employee} OFFICE_USER account(s) have no employee identity`);
    }
    if (counts.system_admin_accounts !== 1) {
      failures.push(`expected exactly 1 SUPER_ADMIN account class, found ${counts.system_admin_accounts}`);
    }
    if (counts.total_accounts !== counts.system_admin_accounts + counts.office_user_accounts) {
      failures.push('account-class totals do not reconcile to total accounts');
    }

    if (failures.length) {
      console.error('\nPhase 13 account-class verification FAILED:');
      for (const failure of failures) console.error(`- ${failure}`);
      process.exitCode = 1;
      return;
    }

    console.log('\nPhase 13 account-class verification passed.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Phase 13 account-class verification failed to run:', error);
  process.exitCode = 1;
});
