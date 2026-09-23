#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const {
  PROJECT_ROOT,
  ensurePostgresTool,
  optionalGitCommit,
  redactDatabaseUrl,
  requireDatabaseUrl,
  run,
  sha256File,
  timestampForFile,
  toPostgresCliUrl,
} = require('./phase13_database_tools');

const CONFIRMATION = 'RESET_DUMMY_V3_DATA';
const PRESERVED_TABLES = new Set([
  '_prisma_migrations',
  'accounts',
  'employees',
  'super_admin_profiles',
]);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const SEED_TYPES = [
  ['DIVISION', 'Division', 'division', 10],
  ['DEPARTMENT', 'Department', 'department', 20],
  ['SECTION', 'Section', 'section', 30],
  ['UNIT', 'Unit', 'unit', 40],
];
const PLACEMENT_PENDING_TYPE = [
  'PLACEMENT_PENDING',
  'Placement Pending',
  'placement-pending-internal',
  9999,
];

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function assertSafeTarget(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, '');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing development-data reset while NODE_ENV=production.');
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `Refusing non-local database host ${parsed.hostname}. This reset is local-development only.`,
    );
  }
  if (databaseName !== 'nt_message') {
    throw new Error(
      `Expected local development database "nt_message", got "${databaseName || '(default)'}".`,
    );
  }
}

async function createBackup(databaseUrl) {
  const cliDatabaseUrl = toPostgresCliUrl(databaseUrl);
  const outputDirectory = path.resolve(
    process.env.PHASE15_RESET_BACKUP_DIR || path.join(PROJECT_ROOT, 'deploy-backups'),
  );
  const backupFile = path.join(
    outputDirectory,
    `nt_message_phase15_pre_dev_reset_${timestampForFile()}.dump`,
  );

  ensurePostgresTool('pg_dump');
  ensurePostgresTool('pg_restore');
  fs.mkdirSync(outputDirectory, { recursive: true });

  run('pg_dump', ['--format=custom', '--file', backupFile, cliDatabaseUrl]);
  run('pg_restore', ['--list', backupFile], { capture: true });

  const checksum = await sha256File(backupFile);
  fs.writeFileSync(
    `${backupFile}.sha256`,
    `${checksum}  ${path.basename(backupFile)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    `${backupFile}.metadata.json`,
    `${JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        database: redactDatabaseUrl(databaseUrl),
        backupFile: path.basename(backupFile),
        sha256: checksum,
        sourceCommit: optionalGitCommit(),
        purpose: 'Phase 15 development dummy-data reset; preserves accounts and employees',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  return backupFile;
}

async function readPreflight(client) {
  const result = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM accounts) AS accounts,
      (SELECT COUNT(*)::int FROM employees) AS employees,
      (SELECT COUNT(*)::int FROM accounts WHERE account_class = 'SUPER_ADMIN') AS super_admins,
      (SELECT COUNT(*)::int FROM org_units) AS org_units,
      (SELECT COUNT(*)::int FROM org_memberships) AS memberships,
      (SELECT COUNT(*)::int FROM operational_teams) AS operational_teams,
      (SELECT COUNT(*)::int FROM work_items) AS work_items,
      (SELECT COUNT(*)::int FROM work_type_definitions) AS work_type_definitions,
      (SELECT COUNT(*)::int FROM work_type_versions WHERE status = 'DRAFT') AS work_type_drafts,
      (SELECT COUNT(*)::int FROM work_field_definitions) AS work_type_fields,
      (SELECT COUNT(*)::int FROM work_stage_definitions) AS work_type_stages,
      (SELECT COUNT(*)::int FROM duty_assignments) AS duty_assignments,
      (SELECT COUNT(*)::int FROM conversations) AS conversations
  `);
  const officeHeadResult = await client.query(`
    SELECT DISTINCT e.id, e.emp_id, e.emp_name
    FROM org_leadership_assignments ola
    JOIN employees e ON e.id = ola.employee_id
    WHERE ola.leadership_type = 'OFFICE_HEAD'
      AND ola.is_acting = false
      AND e.status = 'ACTIVE'
      AND e.employment_status = 'ACTIVE'
      AND e.archived_at IS NULL
      AND ola.effective_from <= NOW()
      AND (ola.effective_until IS NULL OR ola.effective_until > NOW())
    ORDER BY e.emp_id
  `);
  return { counts: result.rows[0], officeHeads: officeHeadResult.rows };
}

async function listResetTables(client) {
  const result = await client.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  return result.rows
    .map((row) => row.tablename)
    .filter((table) => !PRESERVED_TABLES.has(table));
}

async function seedCleanFoundation(client, preservedOfficeHeadEmployeeId) {
  const officeId = crypto.randomUUID();
  const unassignedTypeId = crypto.randomUUID();
  const unassignedUnitId = crypto.randomUUID();

  await client.query(
    `INSERT INTO offices (id, code, name, name_key, is_active, sort_order, created_at, updated_at)
     VALUES ($1, 'PATAN', 'Patan Telecom Office', 'patan telecom office', true, 0, NOW(), NOW())`,
    [officeId],
  );

  for (const [code, name, nameKey, sortOrder] of SEED_TYPES) {
    await client.query(
      `INSERT INTO org_unit_types
        (id, office_id, code, name, name_key, is_team, is_active, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, false, true, $6, NOW(), NOW())`,
      [crypto.randomUUID(), officeId, code, name, nameKey, sortOrder],
    );
  }

  await client.query(
    `INSERT INTO org_unit_types
      (id, office_id, code, name, name_key, is_team, is_active, sort_order, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, false, false, $6, NOW(), NOW())`,
    [unassignedTypeId, officeId, ...PLACEMENT_PENDING_TYPE],
  );

  await client.query(
    `INSERT INTO org_units
      (id, office_id, org_unit_type_id, parent_org_unit_id, code, name, name_key, is_active, sort_order, created_at, updated_at)
     VALUES ($1, $2, $3, NULL, 'UNASSIGNED', 'Placement Pending', 'placement pending', true, 9999, NOW(), NOW())`,
    [unassignedUnitId, officeId, unassignedTypeId],
  );
  await client.query(
    `INSERT INTO org_unit_closure (ancestor_org_unit_id, descendant_org_unit_id, depth)
     VALUES ($1, $1, 0)`,
    [unassignedUnitId],
  );

  await client.query(`
    INSERT INTO org_memberships
      (id, employee_id, office_id, org_unit_id, membership_type, assignment_source,
       starts_at, ends_at, assigned_by_account_id, ended_by_account_id,
       assignment_reason, end_reason, created_at, updated_at)
    SELECT
      gen_random_uuid(), e.id, $1, $2, 'PRIMARY', 'SYSTEM', NOW(), NULL, NULL, NULL,
      'Phase 15 clean V3 reset: temporary placement pending reassignment', NULL, NOW(), NOW()
    FROM employees e
    WHERE e.status = 'ACTIVE'
      AND e.employment_status = 'ACTIVE'
      AND e.archived_at IS NULL
  `, [officeId, unassignedUnitId]);

  if (preservedOfficeHeadEmployeeId) {
    await client.query(
      `INSERT INTO org_leadership_assignments
        (id, employee_id, office_id, org_unit_id, leadership_type, assignment_source,
         is_acting, effective_from, effective_until, assigned_by_account_id,
         ended_by_account_id, assignment_reason, end_reason, created_at, updated_at)
       VALUES ($1, $2, $3, NULL, 'OFFICE_HEAD', 'SYSTEM', false, NOW(), NULL, NULL, NULL,
         'Phase 15 clean V3 reset: preserved existing Office Head', NULL, NOW(), NOW())`,
      [crypto.randomUUID(), preservedOfficeHeadEmployeeId, officeId],
    );
  }

  await client.query(`UPDATE employees SET department = NULL, updated_at = NOW()`);
  await client.query(`
    UPDATE accounts
    SET role = CASE
      WHEN account_class = 'SUPER_ADMIN' THEN 'SUPER_ADMIN'::"AccountRole"
      ELSE 'EMPLOYEE'::"AccountRole"
    END,
    updated_at = NOW()
  `);

  return { officeId, unassignedUnitId };
}

async function verifyPostReset(client, expected) {
  const result = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM accounts) AS accounts,
      (SELECT COUNT(*)::int FROM employees) AS employees,
      (SELECT COUNT(*)::int FROM accounts WHERE account_class = 'SUPER_ADMIN') AS super_admins,
      (SELECT COUNT(*)::int FROM offices) AS offices,
      (SELECT COUNT(*)::int FROM org_units) AS org_units,
      (SELECT COUNT(*)::int FROM org_unit_types
        WHERE is_active = true
          AND (is_team = true OR code NOT IN ('DIVISION','DEPARTMENT','SECTION','UNIT'))) AS non_formal_active_type_rows,
      (SELECT COUNT(*)::int FROM employees WHERE department IS NOT NULL) AS legacy_department_values,
      (SELECT COUNT(*)::int FROM operational_teams) AS operational_teams,
      (SELECT COUNT(*)::int FROM work_items) AS work_items,
      (SELECT COUNT(*)::int FROM work_type_definitions) AS work_type_definitions,
      (SELECT COUNT(*)::int FROM work_type_versions WHERE status = 'DRAFT') AS work_type_drafts,
      (SELECT COUNT(*)::int FROM work_field_definitions) AS work_type_fields,
      (SELECT COUNT(*)::int FROM work_stage_definitions) AS work_type_stages,
      (SELECT COUNT(*)::int FROM duty_assignments) AS duty_assignments,
      (SELECT COUNT(*)::int FROM conversations) AS conversations,
      (SELECT COUNT(*)::int FROM account_requests) AS account_requests,
      (SELECT COUNT(*)::int FROM delegated_permissions) AS delegated_permissions,
      (SELECT COUNT(*)::int FROM employees e
        WHERE e.status = 'ACTIVE' AND e.employment_status = 'ACTIVE' AND e.archived_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM org_memberships om
            WHERE om.employee_id = e.id AND om.membership_type = 'PRIMARY' AND om.ends_at IS NULL
          )) AS active_membership_gaps,
      (SELECT COUNT(*)::int FROM accounts
        WHERE (account_class = 'SUPER_ADMIN' AND role <> 'SUPER_ADMIN')
           OR (account_class = 'OFFICE_USER' AND role <> 'EMPLOYEE')) AS account_role_mismatches
  `);
  const counts = result.rows[0];
  const failures = [];
  if (counts.accounts !== expected.accounts) failures.push(`accounts changed: ${counts.accounts} != ${expected.accounts}`);
  if (counts.employees !== expected.employees) failures.push(`employees changed: ${counts.employees} != ${expected.employees}`);
  if (counts.super_admins !== expected.super_admins) failures.push(`Super Admin count changed: ${counts.super_admins} != ${expected.super_admins}`);
  if (counts.offices !== 1) failures.push(`expected 1 clean Office, got ${counts.offices}`);
  if (counts.org_units !== 1) failures.push(`expected only Placement Pending OrgUnit, got ${counts.org_units}`);
  if (counts.work_type_definitions !== 8) failures.push(`work_type_definitions: ${counts.work_type_definitions}`);
  if (counts.work_type_drafts !== 8) failures.push(`work_type_drafts: ${counts.work_type_drafts}`);
  if (counts.work_type_fields !== 86) failures.push(`work_type_fields: ${counts.work_type_fields}`);
  if (counts.work_type_stages !== 0) failures.push(`work_type_stages: ${counts.work_type_stages}`);
  for (const key of [
    'non_formal_active_type_rows',
    'legacy_department_values',
    'operational_teams',
    'work_items',
    'duty_assignments',
    'conversations',
    'account_requests',
    'delegated_permissions',
    'active_membership_gaps',
    'account_role_mismatches',
  ]) {
    if (counts[key] !== 0) failures.push(`${key}: ${counts[key]}`);
  }
  return { counts, failures };
}

async function main() {
  const execute = process.argv.includes('--execute');
  const databaseUrl = requireDatabaseUrl();
  assertSafeTarget(databaseUrl);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const preflight = await readPreflight(client);
    const resetTables = await listResetTables(client);
    console.log('Phase 15 development V3 data reset');
    console.log(`Database: ${redactDatabaseUrl(databaseUrl)}`);
    console.table(preflight.counts);
    console.log(`Tables to clear: ${resetTables.length}`);
    console.log('Preserved tables:', [...PRESERVED_TABLES].join(', '));
    console.log(
      `Current permanent Office Head candidate(s): ${preflight.officeHeads.length ? preflight.officeHeads.map((row) => `${row.emp_id} ${row.emp_name}`).join(', ') : 'none'}`,
    );

    if (preflight.counts.super_admins !== 1) {
      throw new Error(`Expected exactly one Super Admin before reset, found ${preflight.counts.super_admins}.`);
    }
    if (preflight.officeHeads.length > 1) {
      throw new Error('More than one active permanent Office Head exists. Resolve that before reset.');
    }

    if (!execute) {
      console.log('\nDRY RUN ONLY — no database rows were changed.');
      console.log(`To execute, set NT_MESSAGE_ALLOW_DEVELOPMENT_DATA_RESET=${CONFIRMATION} and rerun with --execute.`);
      return;
    }
    if (process.env.NT_MESSAGE_ALLOW_DEVELOPMENT_DATA_RESET !== CONFIRMATION) {
      throw new Error(`Execution requires NT_MESSAGE_ALLOW_DEVELOPMENT_DATA_RESET=${CONFIRMATION}.`);
    }

    console.log('\nCreating mandatory pre-reset database backup...');
    const backupFile = await createBackup(databaseUrl);
    console.log(`Backup verified: ${backupFile}`);

    const expected = {
      accounts: preflight.counts.accounts,
      employees: preflight.counts.employees,
      super_admins: preflight.counts.super_admins,
    };
    const preservedOfficeHeadEmployeeId = preflight.officeHeads[0]?.id ?? null;

    await client.query('BEGIN');
    try {
      if (resetTables.length) {
        const tableSql = resetTables.map(quoteIdentifier).join(', ');
        await client.query(`TRUNCATE TABLE ${tableSql} RESTART IDENTITY CASCADE`);
      }
      await seedCleanFoundation(client, preservedOfficeHeadEmployeeId);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    console.log('\nRestoring mandatory default Work Types...');
    run(
      'pnpm',
      ['--filter', 'api', 'run', 'db:ensure-default-work-types'],
      { cwd: PROJECT_ROOT },
    );

    const verification = await verifyPostReset(client, expected);
    console.table(verification.counts);
    if (verification.failures.length) {
      throw new Error(`Post-reset verification failed:\n- ${verification.failures.join('\n- ')}`);
    }

    console.log('\nPASS: dummy organization/operational data was reset while accounts and employees were preserved.');
    console.log('All active employees are temporarily placed in "Placement Pending" until you build the new V3 hierarchy and transfer them.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('\nPhase 15 development V3 data reset FAILED.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
