#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
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

const FINAL_DESTRUCTIVE_MIGRATION =
  '20260913032500_remove_phase13_legacy_schema';

async function main() {
  const databaseUrl = requireDatabaseUrl();
  const cliDatabaseUrl = toPostgresCliUrl(databaseUrl);
  const outputDirectory = path.resolve(
    process.env.PHASE13_BACKUP_DIR || path.join(PROJECT_ROOT, 'deploy-backups'),
  );
  const backupFile = path.join(
    outputDirectory,
    `nt_message_phase13_pre_cutover_${timestampForFile()}.dump`,
  );

  ensurePostgresTool('pg_dump');
  ensurePostgresTool('pg_restore');
  fs.mkdirSync(outputDirectory, { recursive: true });

  console.log(`Phase 13 database backup target: ${redactDatabaseUrl(databaseUrl)}`);
  console.log(`Backup file: ${backupFile}`);

  run('pg_dump', [
    '--format=custom',
    '--file',
    backupFile,
    cliDatabaseUrl,
  ]);

  // A custom-format dump that pg_restore cannot enumerate is not accepted as a
  // cutover backup. This validates the archive structure without changing DB state.
  run('pg_restore', ['--list', backupFile], { capture: true });

  const checksum = await sha256File(backupFile);
  const checksumFile = `${backupFile}.sha256`;
  fs.writeFileSync(
    checksumFile,
    `${checksum}  ${path.basename(backupFile)}\n`,
    'utf8',
  );

  const metadata = {
    createdAt: new Date().toISOString(),
    database: redactDatabaseUrl(databaseUrl),
    backupFile: path.basename(backupFile),
    sha256: checksum,
    sourceCommit: optionalGitCommit(),
    rollbackBoundaryMigration: FINAL_DESTRUCTIVE_MIGRATION,
  };
  fs.writeFileSync(
    `${backupFile}.metadata.json`,
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  );

  console.log('Backup archive verification: PASS');
  console.log(`SHA-256: ${checksum}`);
  console.log(`Checksum file: ${checksumFile}`);
  console.log(`Metadata file: ${backupFile}.metadata.json`);
}

(async () => {
  try {
    await main();
  } catch (error) {
    console.error('Phase 13 database backup FAILED.');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
})();
