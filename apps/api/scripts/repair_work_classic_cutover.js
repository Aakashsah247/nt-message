#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { config } = require('dotenv');
const { Client } = require('pg');

config({ path: path.resolve(process.cwd(), '../../.env') });

const databaseUrl = process.env.DATABASE_URL;
const cutoverMigrations = [
  '20260919040000_restore_classic_work_management_v3',
  '20260919043000_canonical_work_type_templates',
  '20260919044000_remove_v3_work_runtime_discriminator',
];
const restoreMigration = cutoverMigrations[0];

if (!databaseUrl) {
  console.error('DATABASE_URL is required to repair the classic Work cutover.');
  process.exit(2);
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}

function assertMigrationSourceCompatibility() {
  const migrationRoot = path.resolve(process.cwd(), 'prisma/migrations');
  const restoreSql = fs.readFileSync(
    path.join(migrationRoot, restoreMigration, 'migration.sql'),
    'utf8',
  );
  const removeRuntimeSql = fs.readFileSync(
    path.join(
      migrationRoot,
      '20260919044000_remove_v3_work_runtime_discriminator',
      'migration.sql',
    ),
    'utf8',
  );

  const retiredPhase13Columns = [
    '"type"',
    '"division_id"',
    '"department_id"',
    '"assigned_team_id"',
    '"responsible_manager_account_id"',
  ];
  const leaked = retiredPhase13Columns.filter((column) =>
    restoreSql.includes(column),
  );
  if (leaked.length > 0) {
    throw new Error(
      `Cutover migration still references Phase-13-deleted Work columns: ${leaked.join(', ')}`,
    );
  }

  if (!restoreSql.includes(`WHERE item."status" = 'V3_RUNTIME'::"WorkItemStatus"`)) {
    throw new Error(
      'Cutover migration must convert only true native V3 Work rows.',
    );
  }
  if (restoreSql.includes('DELETE FROM "work_assignments"')) {
    throw new Error(
      'Cutover migration must not delete historical classic WorkAssignment rows.',
    );
  }
  if (!removeRuntimeSql.includes('ALTER TABLE "work_help_requests"')) {
    throw new Error(
      'Runtime discriminator cleanup must migrate work_help_requests.previous_status.',
    );
  }
  if (removeRuntimeSql.includes('ALTER TABLE "work_events"\n  ALTER COLUMN "previous_status"')) {
    throw new Error(
      'Runtime discriminator cleanup references nonexistent work_events.previous_status.',
    );
  }
}

async function readMigrationRows(client) {
  const result = await client.query(
    `SELECT migration_name, started_at, finished_at, rolled_back_at, logs
     FROM "_prisma_migrations"
     WHERE migration_name = ANY($1::text[])
     ORDER BY started_at`,
    [cutoverMigrations],
  );
  return result.rows;
}

async function preflightPreCutoverDatabase(client) {
  const columnsResult = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'work_items'`,
  );
  const columns = new Set(columnsResult.rows.map((row) => row.column_name));

  const required = [
    'office_id',
    'work_type_version_id',
    'primary_owner_org_unit_id',
    'runtime_status',
    'responsible_reviewer_account_id',
  ];
  const missing = required.filter((column) => !columns.has(column));
  if (missing.length > 0) {
    throw new Error(
      `Database is not at the expected Phase-13/V3 pre-cutover shape. Missing work_items columns: ${missing.join(', ')}`,
    );
  }

  const retired = [
    'type',
    'division_id',
    'department_id',
    'assigned_team_id',
    'responsible_manager_account_id',
  ];
  const unexpectedlyPresent = retired.filter((column) => columns.has(column));
  if (unexpectedlyPresent.length > 0) {
    throw new Error(
      `Database still contains retired WM-V2 Work columns and is not the expected Phase-13 baseline: ${unexpectedlyPresent.join(', ')}`,
    );
  }

  const enumResult = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_type type_record
       JOIN pg_enum enum_record ON enum_record.enumtypid = type_record.oid
       WHERE type_record.typname = 'WorkItemStatus'
         AND enum_record.enumlabel = 'V3_RUNTIME'
     ) AS has_v3_runtime`,
  );
  if (!enumResult.rows[0]?.has_v3_runtime) {
    throw new Error(
      'Expected pre-cutover WorkItemStatus.V3_RUNTIME is not present. Refusing to guess the database state.',
    );
  }

  const stateResult = await client.query(
    `SELECT
       COUNT(*)::bigint AS total_work,
       COUNT(*) FILTER (WHERE "status"::text = 'V3_RUNTIME')::bigint AS native_v3_work,
       COUNT(*) FILTER (WHERE "status"::text <> 'V3_RUNTIME')::bigint AS existing_classic_work,
       COUNT(*) FILTER (
         WHERE "office_id" IS NULL
            OR "work_type_version_id" IS NULL
            OR "primary_owner_org_unit_id" IS NULL
       )::bigint AS incomplete_v3_identity
     FROM "work_items"`,
  );
  const state = stateResult.rows[0];
  if (Number(state.incomplete_v3_identity) !== 0) {
    throw new Error(
      `Phase-13 Work identity reconciliation is incomplete (${state.incomplete_v3_identity} rows). Do not run the classic cutover.`,
    );
  }

  console.log('Pre-cutover database shape: PASS');
  console.table({
    totalWork: Number(state.total_work),
    nativeV3Work: Number(state.native_v3_work),
    existingClassicWork: Number(state.existing_classic_work),
    assignedOperationalTeamColumnAlreadyPresent: columns.has(
      'assigned_operational_team_id',
    ),
  });
}

async function latestUnresolvedFailures() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const rows = await readMigrationRows(client);
    return rows.filter((row) => !row.finished_at && !row.rolled_back_at);
  } finally {
    await client.end();
  }
}

async function main() {
  assertMigrationSourceCompatibility();
  console.log('Cutover migration source compatibility: PASS');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  let rows;
  try {
    rows = await readMigrationRows(client);
    const restoreFinished = rows.some(
      (row) =>
        row.migration_name === restoreMigration &&
        row.finished_at &&
        !row.rolled_back_at,
    );
    if (!restoreFinished) {
      await preflightPreCutoverDatabase(client);
    }
  } finally {
    await client.end();
  }

  const unresolved = rows.filter(
    (row) => !row.finished_at && !row.rolled_back_at,
  );
  for (const failed of unresolved) {
    console.log(`Detected unresolved failed migration: ${failed.migration_name}`);
    if (failed.logs) {
      console.log('Recorded Prisma failure (tail):');
      console.log(String(failed.logs).slice(-4000));
    }
    run('pnpm', [
      'exec',
      'prisma',
      'migrate',
      'resolve',
      '--rolled-back',
      failed.migration_name,
      '--schema',
      'prisma/schema.prisma',
    ]);
  }

  try {
    run('pnpm', [
      'exec',
      'prisma',
      'migrate',
      'deploy',
      '--schema',
      'prisma/schema.prisma',
    ]);
  } catch (error) {
    const failures = await latestUnresolvedFailures();
    for (const failure of failures) {
      if (failure.logs) {
        console.error(`\nLatest Prisma failure for ${failure.migration_name}:`);
        console.error(String(failure.logs).slice(-12000));
      }
    }
    throw error;
  }

  run(process.execPath, ['scripts/verify_work_classic_cutover.js']);
}

main().catch((error) => {
  console.error('\nClassic Work cutover recovery failed.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
