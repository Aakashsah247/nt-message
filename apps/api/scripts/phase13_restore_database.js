#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const {
  ensurePostgresTool,
  redactDatabaseUrl,
  requireDatabaseUrl,
  run,
  sha256File,
  toPostgresCliUrl,
} = require('./phase13_database_tools');

const REQUIRED_CONFIRMATION = 'RESTORE_PHASE13_BACKUP';

async function verifyChecksumIfPresent(backupFile) {
  const checksumFile = `${backupFile}.sha256`;
  if (!fs.existsSync(checksumFile)) {
    console.warn(
      `WARNING: ${path.basename(checksumFile)} is missing; archive structure will still be verified.`,
    );
    return;
  }

  const expected = fs.readFileSync(checksumFile, 'utf8').trim().split(/\s+/)[0];
  const actual = await sha256File(backupFile);
  if (!expected || expected !== actual) {
    throw new Error(
      `Backup checksum mismatch. Expected ${expected || '(missing)'}, got ${actual}.`,
    );
  }
  console.log(`Backup checksum verification: PASS (${actual})`);
}

async function main() {
  const backupArgument =
    process.argv.slice(2).find((argument) => argument !== '--') ||
    process.env.PHASE13_BACKUP_FILE;
  if (!backupArgument) {
    throw new Error(
      'Provide the custom-format dump path as the first argument or PHASE13_BACKUP_FILE.',
    );
  }

  if (process.env.PHASE13_RESTORE_CONFIRM !== REQUIRED_CONFIRMATION) {
    throw new Error(
      `Refusing destructive restore. Set PHASE13_RESTORE_CONFIRM=${REQUIRED_CONFIRMATION} only after the API is stopped and the target database is confirmed.`,
    );
  }

  const backupFile = path.resolve(backupArgument);
  if (!fs.existsSync(backupFile) || !fs.statSync(backupFile).isFile()) {
    throw new Error(`Backup file does not exist: ${backupFile}`);
  }

  // An explicit restore URL is mandatory. Falling back silently to DATABASE_URL
  // would make a rehearsal capable of overwriting the developer/production DB.
  const restoreDatabaseUrl = requireDatabaseUrl(
    'PHASE13_RESTORE_DATABASE_URL',
  );
  const cliDatabaseUrl = toPostgresCliUrl(restoreDatabaseUrl);

  ensurePostgresTool('pg_restore');
  run('pg_restore', ['--list', backupFile], { capture: true });
  await verifyChecksumIfPresent(backupFile);

  console.log(
    `RESTORE TARGET CONFIRMED: ${redactDatabaseUrl(restoreDatabaseUrl)}`,
  );
  console.log(
    'This restore replaces the target database contents. The API must remain stopped until validation completes.',
  );

  run('pg_restore', [
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--exit-on-error',
    '--single-transaction',
    '--dbname',
    cliDatabaseUrl,
    backupFile,
  ]);

  console.log('Phase 13 database restore completed successfully.');
  console.log('Keep the API stopped and run the rollback validation gate from the cutover runbook.');
}

(async () => {
  try {
    await main();
  } catch (error) {
    console.error('Phase 13 database restore FAILED.');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
})();
