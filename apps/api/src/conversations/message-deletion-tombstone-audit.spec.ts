import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('message deletion tombstone audit migration', () => {
  const migration = readFileSync(
    resolve(
      process.cwd(),
      'prisma/migrations/20260921080000_message_deletion_tombstone_audit/migration.sql',
    ),
    'utf8',
  );

  it('captures message rows before hard deletion', () => {
    expect(migration).toContain('BEFORE DELETE ON "messages"');
    expect(migration).toContain('message_security_tombstones');
    expect(migration).toContain('OLD."text_signature"');
    expect(migration).toContain('OLD."text_content"');
  });

  it('keeps deletion evidence append-only', () => {
    expect(migration).toContain(
      'BEFORE UPDATE OR DELETE ON "message_security_tombstones"',
    );
    expect(migration).toContain(
      'Message security tombstones are append-only and cannot be modified or deleted.',
    );
  });
});
