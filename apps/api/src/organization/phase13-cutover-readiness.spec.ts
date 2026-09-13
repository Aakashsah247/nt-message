import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Phase 13 checkpoint 21 cutover and rollback lock', () => {
  it('exposes explicit backup, restore and cutover verification commands', () => {
    const packageJson = JSON.parse(source('package.json')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['phase13:backup-db']).toContain(
      'phase13_backup_database.js',
    );
    expect(packageJson.scripts['phase13:restore-db']).toContain(
      'phase13_restore_database.js',
    );
    expect(
      packageJson.scripts['db:verify-phase13-cutover-readiness'],
    ).toContain('verify_phase13_cutover_readiness.js');
    expect(packageJson.scripts['phase13:cutover-preflight']).toContain(
      'verify_phase13_schema_cleanup.js',
    );
    expect(packageJson.scripts['phase13:cutover-postflight']).toContain(
      'verify_phase13_cutover_readiness.js',
    );
  });

  it('creates a custom-format backup and verifies its archive plus checksum', () => {
    const backup = source('scripts/phase13_backup_database.js');

    expect(backup).toContain("'--format=custom'");
    expect(backup).toContain("run('pg_restore', ['--list', backupFile]");
    expect(backup).toContain('sha256File(backupFile)');
    expect(backup).toContain('.metadata.json');
  });

  it('protects restore behind an explicit target and destructive confirmation', () => {
    const restore = source('scripts/phase13_restore_database.js');

    expect(restore).toContain("'RESTORE_PHASE13_BACKUP'");
    expect(restore).toContain("'PHASE13_RESTORE_DATABASE_URL'");
    expect(restore).toContain("argument !== '--'");
    expect(restore).toContain('PHASE13_BACKUP_FILE');
    expect(restore).toContain("'--clean'");
    expect(restore).toContain("'--if-exists'");
    expect(restore).toContain("'--exit-on-error'");
    expect(restore).toContain("'--single-transaction'");
  });

  it('locks the migration-106 rollback boundary and forbids app-only rollback across it', () => {
    const runbook = source('../../deploy/PHASE13_CUTOVER_ROLLBACK.md');

    expect(runbook).toContain('20260913032500_remove_phase13_legacy_schema');
    expect(runbook).toContain('application rollback alone is forbidden');
    expect(runbook).toContain('prisma migrate deploy');
    expect(runbook).toContain('Never use `prisma migrate dev`');
    expect(runbook).toContain('RESTORE_PHASE13_BACKUP');
    expect(runbook).toContain('PHASE13_BACKUP_FILE=');
    expect(runbook).toContain('GET /api/v1/health/database');
    expect(runbook).toContain(
      'a pre-106 API will never be started against a post-106 database',
    );
  });
});
