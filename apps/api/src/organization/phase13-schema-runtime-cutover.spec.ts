import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Phase 13 checkpoint 20 runtime/schema cutover', () => {
  it('does not write or select dropped account-request management-position fields', () => {
    const content = source('src/account-requests/account-requests.service.ts');
    expect(content).not.toContain('managementPositionId');
    expect(content).not.toContain('managementPosition.');
  });

  it('does not use dropped fixed official-group hierarchy fields', () => {
    const content = source('src/conversations/conversations.service.ts');
    expect(content).not.toContain('officialDivisionId');
    expect(content).not.toContain('officialDepartmentId');
  });

  it('does not use dropped management-assignment models in employee lifecycle', () => {
    const content = source('src/employees/employees.service.ts');
    expect(content).not.toContain('managementAssignment.');
  });

  it('does not write retired Work compatibility columns', () => {
    expect(source('src/work-management/work-lifecycle.service.ts')).not.toContain(
      'requestedDepartmentId',
    );
    expect(source('src/work-management/work-runtime-v3.service.ts')).not.toMatch(
      /\btype:\s*null/,
    );
  });
});
