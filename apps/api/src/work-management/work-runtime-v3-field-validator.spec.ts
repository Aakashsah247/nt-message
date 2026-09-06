import { BadRequestException } from '@nestjs/common';

import { WorkFieldType } from '../generated/prisma/client';
import { validateRuntimeIntakeFields } from './work-runtime-v3-field-validator';

const baseDefinition = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'SERVICE_TYPE',
  fieldType: WorkFieldType.SELECT,
  isRequired: true,
  stageDefinitionId: null,
  config: { options: ['DATA', 'VOICE'] },
};

describe('validateRuntimeIntakeFields', () => {
  it('normalizes and validates controlled intake values', () => {
    const result = validateRuntimeIntakeFields(
      [
        baseDefinition,
        {
          id: '22222222-2222-4222-8222-222222222222',
          code: 'RX_LEVEL',
          fieldType: WorkFieldType.DECIMAL,
          isRequired: false,
          stageDefinitionId: null,
          config: { min: -100, max: 20 },
        },
      ],
      [
        { code: 'SERVICE_TYPE', value: 'DATA' },
        { code: 'RX_LEVEL', value: -19.7 },
      ],
    );

    expect(result.valuesByCode.get('SERVICE_TYPE')).toBe('DATA');
    expect(result.valuesByCode.get('RX_LEVEL')).toBe(-19.7);
  });

  it('rejects a missing required intake field', () => {
    expect(() => validateRuntimeIntakeFields([baseDefinition], [])).toThrow(
      BadRequestException,
    );
  });

  it('rejects stage-bound values during Work creation', () => {
    expect(() =>
      validateRuntimeIntakeFields(
        [
          {
            ...baseDefinition,
            code: 'COMPLETION_SUMMARY',
            fieldType: WorkFieldType.LONG_TEXT,
            stageDefinitionId: '33333333-3333-4333-8333-333333333333',
          },
        ],
        [{ code: 'COMPLETION_SUMMARY', value: 'done' }],
      ),
    ).toThrow(BadRequestException);
  });

  it('requires timezone-aware ISO date-times', () => {
    const definition = {
      ...baseDefinition,
      code: 'VISIT_AT',
      fieldType: WorkFieldType.DATETIME,
      config: {},
    };

    expect(() =>
      validateRuntimeIntakeFields(
        [definition],
        [{ code: 'VISIT_AT', value: '2026-09-07T09:30:00' }],
      ),
    ).toThrow(BadRequestException);

    const result = validateRuntimeIntakeFields(
      [definition],
      [{ code: 'VISIT_AT', value: '2026-09-07T09:30:00+05:45' }],
    );

    expect(result.valuesByCode.get('VISIT_AT')).toBe(
      '2026-09-07T03:45:00.000Z',
    );
  });
});
