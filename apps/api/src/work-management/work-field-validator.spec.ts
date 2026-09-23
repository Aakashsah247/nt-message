import { WorkFieldType } from '../generated/prisma/client';
import {
  isWorkFieldCollectedAtCompletion,
  isWorkFieldCollectedAtCreation,
  validateWorkCompletionFields,
  validateWorkIntakeFields,
  workFieldCollectionMode,
  type WorkFieldDefinitionForValidation,
} from './work-field-validator';

function definition(
  code: string,
  collectionMode:
    | 'CREATION_ONLY'
    | 'COMPLETION_ONLY'
    | 'CREATION_AND_COMPLETION',
  isRequired = true,
): WorkFieldDefinitionForValidation {
  return {
    id: `${code}-id`,
    code,
    fieldType: WorkFieldType.TEXT,
    isRequired,
    stageDefinitionId: null,
    config: { collectionMode },
  };
}

describe('Work field collection modes', () => {
  it('separates Creation, Completion and Both without reusing the old stage-null shortcut', () => {
    const creation = definition('CREATION_FIELD', 'CREATION_ONLY');
    const completion = definition('COMPLETION_FIELD', 'COMPLETION_ONLY');
    const both = definition('BOTH_FIELD', 'CREATION_AND_COMPLETION');

    expect(workFieldCollectionMode(creation)).toBe('CREATION_ONLY');
    expect(isWorkFieldCollectedAtCreation(creation)).toBe(true);
    expect(isWorkFieldCollectedAtCompletion(creation)).toBe(false);

    expect(isWorkFieldCollectedAtCreation(completion)).toBe(false);
    expect(isWorkFieldCollectedAtCompletion(completion)).toBe(true);

    expect(isWorkFieldCollectedAtCreation(both)).toBe(true);
    expect(isWorkFieldCollectedAtCompletion(both)).toBe(true);
  });

  it('does not require Completion-only fields while Work is being created', () => {
    const definitions = [
      definition('CUSTOMER_NAME', 'CREATION_ONLY'),
      definition('CUSTOMER_ID', 'COMPLETION_ONLY'),
      definition('OLT', 'CREATION_AND_COMPLETION'),
    ];

    expect(() =>
      validateWorkIntakeFields(definitions, [
        { code: 'CUSTOMER_NAME', value: 'Aakash' },
        { code: 'OLT', value: 'OLT-1' },
      ]),
    ).not.toThrow();
  });

  it('still requires a required Both field during Work creation', () => {
    const definitions = [definition('OLT', 'CREATION_AND_COMPLETION')];
    expect(() => validateWorkIntakeFields(definitions, [])).toThrow(
      'Required Work field OLT is missing.',
    );
  });

  it('rejects Completion-only values supplied through the creation payload', () => {
    const definitions = [
      definition('CUSTOMER_NAME', 'CREATION_ONLY'),
      definition('CUSTOMER_ID', 'COMPLETION_ONLY'),
    ];
    expect(() =>
      validateWorkIntakeFields(definitions, [
        { code: 'CUSTOMER_NAME', value: 'Aakash' },
        { code: 'CUSTOMER_ID', value: 'CID-1' },
      ]),
    ).toThrow('Unknown Work field CUSTOMER_ID.');
  });
  it('uses saved Both values at completion and never requires Creation-only fields', () => {
    const definitions = [
      definition('CUSTOMER_NAME', 'CREATION_ONLY'),
      definition('OLT', 'CREATION_AND_COMPLETION'),
      definition('CUSTOMER_ID', 'COMPLETION_ONLY'),
    ];

    const validated = validateWorkCompletionFields(
      definitions,
      [{ code: 'CUSTOMER_ID', value: 'CID-101' }],
      [{ fieldDefinitionId: 'OLT-id', code: 'OLT', value: 'OLT-1' }],
    );

    expect(validated.valuesByCode.get('OLT')).toBe('OLT-1');
    expect(validated.valuesByCode.get('CUSTOMER_ID')).toBe('CID-101');
    expect(validated.persistedValues.map((item) => item.code)).toEqual([
      'CUSTOMER_ID',
    ]);
  });

  it('rejects an attempt to overwrite a read-only Both field at completion', () => {
    const definitions = [definition('OLT', 'CREATION_AND_COMPLETION')];
    expect(() =>
      validateWorkCompletionFields(
        definitions,
        [{ code: 'OLT', value: 'OLT-2' }],
        [{ fieldDefinitionId: 'OLT-id', code: 'OLT', value: 'OLT-1' }],
      ),
    ).toThrow('Field OLT is read-only at completion');
  });

  it('requires Completion-only fields during completion', () => {
    const definitions = [definition('RX_LEVEL_DBM', 'COMPLETION_ONLY')];
    expect(() => validateWorkCompletionFields(definitions, [])).toThrow(
      'Required Work completion field RX_LEVEL_DBM is missing.',
    );
  });
});
