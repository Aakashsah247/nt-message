import { WorkFinalClosureMode } from '../generated/prisma/client';
import {
  assertWorkTypeTemplate,
  FIXED_WORK_TYPE_TEMPLATES,
  WorkTypeTemplate,
} from './fixed-work-type-template';

describe('fixed Work Type templates', () => {
  it.each([
    WorkTypeTemplate.STANDARD,
    WorkTypeTemplate.TEAM_SALES,
    WorkTypeTemplate.ADMINISTRATIVE,
  ])('accepts the canonical %s template', (template) => {
    expect(assertWorkTypeTemplate(template)).toBe(template);
    expect(FIXED_WORK_TYPE_TEMPLATES[template].finalClosureMode).toBe(
      WorkFinalClosureMode.PRIMARY_OWNER_HEAD,
    );
  });

  it('keeps Standard team-owned without Sales', () => {
    expect(FIXED_WORK_TYPE_TEMPLATES.STANDARD).toMatchObject({
      teamRequired: true,
      allowsIndividualAssignment: false,
      requiresSalesMember: false,
    });
  });

  it('keeps Team + Sales team-owned with required Sales', () => {
    expect(FIXED_WORK_TYPE_TEMPLATES.TEAM_SALES).toMatchObject({
      teamRequired: true,
      allowsIndividualAssignment: false,
      requiresSalesMember: true,
    });
  });

  it('keeps Administrative assignable to a team or individual', () => {
    expect(FIXED_WORK_TYPE_TEMPLATES.ADMINISTRATIVE).toMatchObject({
      teamRequired: false,
      allowsIndividualAssignment: true,
      requiresSalesMember: false,
    });
  });

  it('rejects custom workflow template values', () => {
    expect(() => assertWorkTypeTemplate('CUSTOM')).toThrow();
  });
});
