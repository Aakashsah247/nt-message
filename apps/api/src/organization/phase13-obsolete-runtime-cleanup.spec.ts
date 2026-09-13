import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Phase 13 checkpoint 19 obsolete runtime cleanup', () => {
  it('removes legacy hierarchy relations from monitoring and notifications', () => {
    for (const file of [
      'src/monitoring/monitoring.service.ts',
      'src/work-management/duty-notifications.service.ts',
      'src/work-management/work-notifications.service.ts',
    ]) {
      const content = source(file);
      expect(content).not.toMatch(/\bdivision\s*:\s*\{/);
      expect(content).not.toMatch(/\bdepartmentUnit\s*:\s*\{/);
      expect(content).not.toMatch(/\.division\b|\.departmentUnit\b/);
      expect(content).toContain('orgMemberships');
    }
  });

  it('keeps messaging discovery and official-group management native to V3 scope', () => {
    const content = source('src/conversations/conversations.service.ts');
    expect(content).not.toContain('OfficialGroupScopeType.ORGANIZATION');
    expect(content).not.toMatch(/\bdepartmentUnit\s*:\s*\{/);
    expect(content).not.toMatch(/\bdivision\s*:\s*\{/);
    expect(content).toContain('OfficialGroupScopeType.OFFICE');
    expect(content).toContain('OfficialGroupScopeType.ORG_UNIT');
  });

  it('removes the runtime legacy work-type bridge', () => {
    const content = source('src/work-management/work-type-v3.service.ts');
    expect(content).not.toContain('legacyWorkItemType');
  });

  it('does not allow the old organization announcement audience at runtime', () => {
    const content = source('src/announcements/announcements.service.ts');
    expect(content).not.toContain('AnnouncementAudienceType.ORGANIZATION');
  });
});
