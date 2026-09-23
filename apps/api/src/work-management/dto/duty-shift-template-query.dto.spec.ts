import { validateSync } from 'class-validator';

import {
  DutyShiftTargetScope,
  DutyShiftTemplateQueryDto,
} from './duty-shift-template-query.dto';

function buildDto(
  values: Partial<DutyShiftTemplateQueryDto>,
): DutyShiftTemplateQueryDto {
  return Object.assign(new DutyShiftTemplateQueryDto(), values);
}

describe('DutyShiftTemplateQueryDto', () => {
  it('allows listing visible shift templates without a target scope filter', () => {
    expect(validateSync(buildDto({}))).toHaveLength(0);
  });

  it.each([DutyShiftTargetScope.OFFICE, DutyShiftTargetScope.ORG_UNIT])(
    'accepts supported target scope %s',
    (targetScope) => {
      const dto = buildDto({
        targetScope,
        ...(targetScope === DutyShiftTargetScope.ORG_UNIT
          ? { orgUnitId: '8f6e28d6-6b47-4e73-9b74-b50aa3a89f42' }
          : {}),
      });
      expect(validateSync(dto)).toHaveLength(0);
    },
  );

  it('rejects an invalid target scope when one is supplied', () => {
    const dto = buildDto({ targetScope: 'BRANCH' as DutyShiftTargetScope });
    expect(
      validateSync(dto).some((error) => error.property === 'targetScope'),
    ).toBe(true);
  });
});
