import { DEFAULT_WORK_TYPE_TEMPLATES } from './default-work-type-catalog';
import { WorkTypeTemplate } from './fixed-work-type-template';

describe('Nepal Telecom default Work Type fixed-template validity', () => {
  it('keeps every default Work Type on one of the three supported classic templates', () => {
    const supported = new Set(Object.values(WorkTypeTemplate));

    expect(DEFAULT_WORK_TYPE_TEMPLATES).toHaveLength(8);
    for (const template of DEFAULT_WORK_TYPE_TEMPLATES) {
      expect(supported.has(template.template)).toBe(true);
      expect(template.fields.length).toBeGreaterThan(0);
    }
  });

  it('keeps Sales and Administrative defaults on their finalized templates', () => {
    const byCode = new Map(
      DEFAULT_WORK_TYPE_TEMPLATES.map((template) => [template.code, template]),
    );

    expect(byCode.get('NEW_INSTALLATION')?.template).toBe(
      WorkTypeTemplate.TEAM_SALES,
    );
    expect(byCode.get('UPDATE_SERVICES')?.template).toBe(
      WorkTypeTemplate.TEAM_SALES,
    );
    expect(byCode.get('ADMINISTRATIVE_WORK')?.template).toBe(
      WorkTypeTemplate.ADMINISTRATIVE,
    );

    for (const template of DEFAULT_WORK_TYPE_TEMPLATES) {
      if (
        template.code !== 'NEW_INSTALLATION' &&
        template.code !== 'UPDATE_SERVICES' &&
        template.code !== 'ADMINISTRATIVE_WORK'
      ) {
        expect(template.template).toBe(WorkTypeTemplate.STANDARD);
      }
    }
  });
});
