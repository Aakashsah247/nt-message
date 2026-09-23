import { readFileSync } from 'node:fs';

import { WorkTypeTemplate } from './fixed-work-type-template';
import { DEFAULT_WORK_TYPE_TEMPLATES } from './default-work-type-catalog';

describe('Nepal Telecom default Work Type catalog', () => {
  it('keeps the finalized eight Work Types in the approved order', () => {
    expect(
      DEFAULT_WORK_TYPE_TEMPLATES.map(({ code, name }) => ({ code, name })),
    ).toEqual([
      { code: 'ROUTINE_WORK', name: 'Routine Work' },
      { code: 'TROUBLE_TICKET', name: 'Trouble Ticket' },
      { code: 'NETWORK_MAINTENANCE', name: 'Network Maintenance' },
      { code: 'NEW_INSTALLATION', name: 'New Installation' },
      { code: 'UPDATE_SERVICES', name: 'Update Services' },
      { code: 'INSPECTION', name: 'Inspection' },
      { code: 'EMERGENCY_WORK', name: 'Emergency Work' },
      { code: 'ADMINISTRATIVE_WORK', name: 'Administrative Work' },
    ]);
  });

  it('reconstructs the 86 business-specific configured fields without active workflow stages', () => {
    expect(
      DEFAULT_WORK_TYPE_TEMPLATES.reduce(
        (count, template) => count + template.fields.length,
        0,
      ),
    ).toBe(86);
    expect(
      DEFAULT_WORK_TYPE_TEMPLATES.every((template) =>
        Boolean(template.template),
      ),
    ).toBe(true);
  });

  it('keeps Administrative Work free of customer and network intake fields', () => {
    const administrative = DEFAULT_WORK_TYPE_TEMPLATES.find(
      (template) => template.code === 'ADMINISTRATIVE_WORK',
    );

    expect(administrative?.fields.map((field) => field.code)).toEqual([
      'TASK_TITLE',
      'TASK_DESCRIPTION',
    ]);
  });

  it('keeps Sales coordination on New Installation and Update Services only', () => {
    const salesTypes = DEFAULT_WORK_TYPE_TEMPLATES.filter(
      (template) => template.template === WorkTypeTemplate.TEAM_SALES,
    ).map((template) => template.code);

    expect(salesTypes).toEqual(['NEW_INSTALLATION', 'UPDATE_SERVICES']);
  });

  it('uses the execute path for the PostgreSQL advisory lock', () => {
    const source = readFileSync(__filename.replace('.spec.ts', '.ts'), 'utf8');

    expect(source).toContain('await tx.$executeRaw`');
    expect(source).not.toContain('await tx.$queryRaw`');
  });
});

describe('default Work Type Information collection rules', () => {
  const type = (code: string) => {
    const found = DEFAULT_WORK_TYPE_TEMPLATES.find(
      (item) => item.code === code,
    );
    if (!found) throw new Error(`Missing ${code}`);
    return found;
  };

  const field = (typeCode: string, fieldCode: string) => {
    const found = type(typeCode).fields.find((item) => item.code === fieldCode);
    if (!found) throw new Error(`Missing ${typeCode}.${fieldCode}`);
    return found;
  };

  const config = (typeCode: string, fieldCode: string) =>
    (field(typeCode, fieldCode).config ?? {}) as Record<string, unknown>;

  it('keeps the exact old-model default business field set for every permanent Work Type', () => {
    const codes = (typeCode: string) =>
      type(typeCode).fields.map((item) => item.code);
    const common = [
      'CUSTOMER_NAME',
      'CUSTOMER_CONTACT_TYPE',
      'CUSTOMER_CONTACT_NUMBER',
      'LOCATION',
      'REGISTERED_AT',
      'OLT',
      'FDC_NAME',
      'FAP_NAME',
    ];

    expect(codes('ROUTINE_WORK')).toEqual([
      ...common,
      'SERVICE_NUMBER',
      'RX_LEVEL_DBM',
    ]);
    expect(codes('TROUBLE_TICKET')).toEqual([
      ...common,
      'SERVICE_NUMBER',
      'SERVICE_TYPES',
      'OTHER_SERVICE_TEXT',
      'RX_LEVEL_DBM',
      'CUSTOMER_ID',
    ]);
    expect(codes('NETWORK_MAINTENANCE')).toEqual([
      ...common,
      'RX_LEVEL_DBM',
      'CUSTOMER_ID',
    ]);
    expect(codes('NEW_INSTALLATION')).toEqual([
      ...common,
      'TOKEN_NUMBER',
      'CPC_SERIAL',
      'SERVICE_TYPES',
      'OTHER_SERVICE_TEXT',
      'RX_LEVEL_DBM',
      'CUSTOMER_ID',
      'SALES_NOTE',
    ]);
    expect(codes('UPDATE_SERVICES')).toEqual([
      ...common,
      'SERVICE_NUMBER',
      'TOKEN_NUMBER',
      'SERVICE_TYPES',
      'OTHER_SERVICE_TEXT',
      'RX_LEVEL_DBM',
      'CUSTOMER_ID',
      'SALES_NOTE',
    ]);
    expect(codes('INSPECTION')).toEqual([
      ...common,
      'SERVICE_NUMBER',
      'RX_LEVEL_DBM',
    ]);
    expect(codes('EMERGENCY_WORK')).toEqual([
      ...common,
      'SERVICE_NUMBER',
      'RX_LEVEL_DBM',
      'CUSTOMER_ID',
    ]);
    expect(codes('ADMINISTRATIVE_WORK')).toEqual([
      'TASK_TITLE',
      'TASK_DESCRIPTION',
    ]);
  });

  it('preserves the old Finish Work saved facts as Both + read-only by default', () => {
    for (const code of [
      'CUSTOMER_NAME',
      'LOCATION',
      'OLT',
      'FDC_NAME',
      'FAP_NAME',
      'SERVICE_NUMBER',
    ]) {
      expect(config('TROUBLE_TICKET', code)).toMatchObject({
        collectionMode: 'CREATION_AND_COMPLETION',
        completionMode: 'READ_ONLY',
      });
    }

    for (const code of [
      'TOKEN_NUMBER',
      'CPC_SERIAL',
      'OLT',
      'FDC_NAME',
      'FAP_NAME',
    ]) {
      expect(config('NEW_INSTALLATION', code)).toMatchObject({
        collectionMode: 'CREATION_AND_COMPLETION',
        completionMode: 'READ_ONLY',
      });
    }
  });

  it('keeps contact, registered time and service choice creation-only', () => {
    for (const code of [
      'CUSTOMER_CONTACT_TYPE',
      'CUSTOMER_CONTACT_NUMBER',
      'REGISTERED_AT',
      'SERVICE_TYPES',
      'OTHER_SERVICE_TEXT',
    ]) {
      expect(config('NEW_INSTALLATION', code).collectionMode).toBe(
        'CREATION_ONLY',
      );
    }
  });

  it('keeps Customer ID and RX Level as configurable completion Information', () => {
    expect(config('NEW_INSTALLATION', 'CUSTOMER_ID').collectionMode).toBe(
      'COMPLETION_ONLY',
    );
    expect(config('NEW_INSTALLATION', 'RX_LEVEL_DBM')).toMatchObject({
      collectionMode: 'COMPLETION_ONLY',
      min: -100,
      max: 20,
    });
    expect(field('NETWORK_MAINTENANCE', 'CUSTOMER_ID').isRequired).toBe(false);
    expect(
      type('ROUTINE_WORK').fields.some((item) => item.code === 'CUSTOMER_ID'),
    ).toBe(false);
    expect(
      type('INSPECTION').fields.some((item) => item.code === 'CUSTOMER_ID'),
    ).toBe(false);
    expect(
      type('ADMINISTRATIVE_WORK').fields.some(
        (item) => item.code === 'RX_LEVEL_DBM',
      ),
    ).toBe(false);
  });

  it('keeps exactly one old-model report reference where the type has one', () => {
    const referenceCodes = (typeCode: string) =>
      type(typeCode)
        .fields.filter(
          (item) =>
            ((item.config ?? {}) as Record<string, unknown>).reportReference ===
            true,
        )
        .map((item) => item.code);

    expect(referenceCodes('ROUTINE_WORK')).toEqual(['SERVICE_NUMBER']);
    expect(referenceCodes('TROUBLE_TICKET')).toEqual(['SERVICE_NUMBER']);
    expect(referenceCodes('NEW_INSTALLATION')).toEqual(['TOKEN_NUMBER']);
    expect(referenceCodes('UPDATE_SERVICES')).toEqual(['TOKEN_NUMBER']);
    expect(referenceCodes('INSPECTION')).toEqual(['SERVICE_NUMBER']);
    expect(referenceCodes('EMERGENCY_WORK')).toEqual(['SERVICE_NUMBER']);
    expect(referenceCodes('NETWORK_MAINTENANCE')).toEqual([]);
    expect(referenceCodes('ADMINISTRATIVE_WORK')).toEqual([]);
  });
});
