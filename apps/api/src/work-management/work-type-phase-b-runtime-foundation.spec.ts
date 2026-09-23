import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

describe('Work Type Phase B runtime foundation', () => {
  const lifecycle = source(
    'src',
    'work-management',
    'work-lifecycle.service.ts',
  );
  const items = source('src', 'work-management', 'work-items.service.ts');
  const schema = source('prisma', 'schema.prisma');
  const migration = source(
    'prisma',
    'migrations',
    '20260921090000_work_completion_field_snapshot',
    'migration.sql',
  );

  it('keeps the existing Work lifecycle and template authority intact', () => {
    expect(lifecycle).toContain(
      'this.statusTransitions.assertCanSubmitCompletion(current.status)',
    );
    expect(lifecycle).toContain('WorkItemStatus.COMPLETED_PENDING_REVIEW');
    expect(lifecycle).toContain("'COMPLETION_SUBMITTED'");
    expect(items).toContain(
      'const template = version.template as WorkTypeTemplate',
    );
    expect(items).toContain('template === WorkTypeTemplate.ADMINISTRATIVE');
    expect(items).toContain('template === WorkTypeTemplate.TEAM_SALES');
  });

  it('validates completion Information against the Work-bound version and stores a snapshot', () => {
    expect(lifecycle).toContain('current.workTypeVersion.fields.filter');
    expect(lifecycle).toContain('validateWorkCompletionFields(');
    expect(lifecycle).toContain('validatedCompletionFields.persistedValues');
    expect(lifecycle).toContain(
      'fieldValuesSnapshot: completionSnapshotValue(',
    );
    expect(lifecycle).toContain('completionFieldCodes: snapshotValues.map');
    expect(lifecycle).toContain(
      'const dynamicCompletionContext = usesDynamicCompletionFields',
    );
    expect(lifecycle).toContain(
      '!current.workTypeVersion || !current.officeId',
    );
    expect(schema).toContain('fieldValuesSnapshot  Json?');
    expect(migration).toContain('ADD COLUMN "field_values_snapshot" JSONB');
  });

  it('preserves legacy Customer ID and RX columns only as compatibility mirrors', () => {
    expect(lifecycle).toContain("valuesByCode.get('CUSTOMER_ID')");
    expect(lifecycle).toContain("valuesByCode.get('RX_LEVEL_DBM')");
    expect(lifecycle).toContain('typeof effectiveCustomerId');
    expect(lifecycle).toContain('typeof effectiveRxLevel');
  });

  it('returns the bound field definitions and values on Work detail', () => {
    expect(items).toContain('fields: {');
    expect(items).toContain('sortOrder: true');
    expect(items).toContain('config: true');
    expect(items).toContain('fieldValuesSnapshot: true');
  });
});
