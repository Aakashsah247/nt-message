import { BadRequestException } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import {
  AccountClass,
  EmployeeStatus,
  EmploymentStatus,
  OrgMembershipType,
  WorkFieldType,
} from '../generated/prisma/client';

export interface WorkFieldInput {
  code: string;
  value: unknown;
}

type JsonScalar = string | number | boolean;
type NormalizedJsonValue = JsonScalar | JsonScalar[];

export interface WorkFieldDefinitionForValidation {
  id: string;
  code: string;
  fieldType: WorkFieldType;
  isRequired: boolean;
  stageDefinitionId: string | null;
  config: Prisma.JsonValue | null;
}

export type WorkFieldCollectionMode =
  | 'CREATION_ONLY'
  | 'COMPLETION_ONLY'
  | 'CREATION_AND_COMPLETION'
  | 'STAGE_ONLY';

const WORK_FIELD_COLLECTION_MODES = new Set<WorkFieldCollectionMode>([
  'CREATION_ONLY',
  'COMPLETION_ONLY',
  'CREATION_AND_COMPLETION',
  'STAGE_ONLY',
]);

export function workFieldCollectionMode(
  definition: WorkFieldDefinitionForValidation,
): WorkFieldCollectionMode {
  const config = configRecord(definition.config);
  const configured = config.collectionMode;
  if (
    typeof configured === 'string' &&
    WORK_FIELD_COLLECTION_MODES.has(configured as WorkFieldCollectionMode)
  ) {
    return configured as WorkFieldCollectionMode;
  }

  // Legacy versions predate collectionMode. A null stage was the creation
  // form; a bound stage belonged to that historical stage only.
  return definition.stageDefinitionId === null ? 'CREATION_ONLY' : 'STAGE_ONLY';
}

export function isWorkFieldCollectedAtCreation(
  definition: WorkFieldDefinitionForValidation,
): boolean {
  const mode = workFieldCollectionMode(definition);
  return mode === 'CREATION_ONLY' || mode === 'CREATION_AND_COMPLETION';
}

export function isWorkFieldCollectedAtCompletion(
  definition: WorkFieldDefinitionForValidation,
): boolean {
  const mode = workFieldCollectionMode(definition);
  return mode === 'COMPLETION_ONLY' || mode === 'CREATION_AND_COMPLETION';
}

export interface NormalizedWorkFieldValue {
  fieldDefinitionId: string;
  code: string;
  fieldType: WorkFieldType;
  value: NormalizedJsonValue;
}

export interface WorkIdentityFieldValue {
  code: string;
  fieldType: typeof WorkFieldType.USER | typeof WorkFieldType.ORG_UNIT;
  id: string;
}

export interface ValidatedWorkFieldSet {
  values: NormalizedWorkFieldValue[];
  valuesByCode: Map<string, NormalizedJsonValue>;
  identityValues: WorkIdentityFieldValue[];
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_WITH_ZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function configRecord(
  config: Prisma.JsonValue | null,
): Record<string, unknown> {
  return isRecord(config) ? config : {};
}

function optionalNumber(
  config: Record<string, unknown>,
  key: string,
): number | null {
  const value = config[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function optionalInteger(
  config: Record<string, unknown>,
  key: string,
): number | null {
  const value = optionalNumber(config, key);
  return value !== null && Number.isInteger(value) ? value : null;
}

function configuredOptions(config: Record<string, unknown>): string[] {
  const options = config.options;
  if (!Array.isArray(options)) {
    return [];
  }

  return options.filter((item): item is string => typeof item === 'string');
}

function allowsOther(config: Record<string, unknown>): boolean {
  return config.allowOther === true;
}

function assertTextLength(
  code: string,
  value: string,
  config: Record<string, unknown>,
): void {
  const maxLength = optionalInteger(config, 'maxLength');
  if (maxLength !== null && value.length > maxLength) {
    throw new BadRequestException(
      `Field ${code} must not exceed ${maxLength} characters.`,
    );
  }
}

function assertNumericRange(
  code: string,
  value: number,
  config: Record<string, unknown>,
): void {
  const min = optionalNumber(config, 'min');
  const max = optionalNumber(config, 'max');

  if (min !== null && value < min) {
    throw new BadRequestException(`Field ${code} must be at least ${min}.`);
  }
  if (max !== null && value > max) {
    throw new BadRequestException(`Field ${code} must not exceed ${max}.`);
  }
}

function normalizeSingleValue(
  definition: WorkFieldDefinitionForValidation,
  rawValue: unknown,
): NormalizedJsonValue {
  const config = configRecord(definition.config);
  const code = definition.code;

  switch (definition.fieldType) {
    case WorkFieldType.TEXT:
    case WorkFieldType.LONG_TEXT:
    case WorkFieldType.REFERENCE: {
      if (typeof rawValue !== 'string') {
        throw new BadRequestException(`Field ${code} must be text.`);
      }
      const value = rawValue.trim();
      if (value.length === 0) {
        throw new BadRequestException(`Field ${code} must not be empty.`);
      }
      assertTextLength(code, value, config);
      return value;
    }

    case WorkFieldType.NUMBER: {
      if (
        typeof rawValue !== 'number' ||
        !Number.isFinite(rawValue) ||
        !Number.isInteger(rawValue)
      ) {
        throw new BadRequestException(`Field ${code} must be an integer.`);
      }
      assertNumericRange(code, rawValue, config);
      return rawValue;
    }

    case WorkFieldType.DECIMAL: {
      if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
        throw new BadRequestException(`Field ${code} must be a finite number.`);
      }
      assertNumericRange(code, rawValue, config);
      return rawValue;
    }

    case WorkFieldType.DATE: {
      if (typeof rawValue !== 'string' || !DATE_ONLY.test(rawValue)) {
        throw new BadRequestException(`Field ${code} must use YYYY-MM-DD.`);
      }
      const parsed = new Date(`${rawValue}T00:00:00.000Z`);
      if (
        Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== rawValue
      ) {
        throw new BadRequestException(
          `Field ${code} contains an invalid date.`,
        );
      }
      return rawValue;
    }

    case WorkFieldType.DATETIME: {
      if (
        typeof rawValue !== 'string' ||
        !ISO_DATETIME_WITH_ZONE.test(rawValue)
      ) {
        throw new BadRequestException(
          `Field ${code} must use an ISO date and time with a timezone.`,
        );
      }
      const parsed = new Date(rawValue);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException(
          `Field ${code} contains an invalid date and time.`,
        );
      }
      return parsed.toISOString();
    }

    case WorkFieldType.BOOLEAN:
      if (typeof rawValue !== 'boolean') {
        throw new BadRequestException(`Field ${code} must be true or false.`);
      }
      return rawValue;

    case WorkFieldType.SELECT: {
      if (typeof rawValue !== 'string') {
        throw new BadRequestException(
          `Field ${code} must use one configured option.`,
        );
      }
      const value = rawValue.trim();
      if (value.length === 0) {
        throw new BadRequestException(`Field ${code} must not be empty.`);
      }
      const options = configuredOptions(config);
      if (!options.includes(value) && !allowsOther(config)) {
        throw new BadRequestException(
          `Field ${code} contains an unsupported option.`,
        );
      }
      return value;
    }

    case WorkFieldType.MULTI_SELECT: {
      if (!Array.isArray(rawValue)) {
        throw new BadRequestException(
          `Field ${code} must be a list of configured options.`,
        );
      }
      const values = rawValue.map((item) => {
        if (typeof item !== 'string' || item.trim().length === 0) {
          throw new BadRequestException(
            `Field ${code} contains an invalid option.`,
          );
        }
        return item.trim();
      });
      if (new Set(values).size !== values.length) {
        throw new BadRequestException(
          `Field ${code} must not contain duplicate options.`,
        );
      }
      const options = configuredOptions(config);
      if (
        values.some((value) => !options.includes(value)) &&
        !allowsOther(config)
      ) {
        throw new BadRequestException(
          `Field ${code} contains an unsupported option.`,
        );
      }
      const minSelections = optionalInteger(config, 'minSelections');
      const maxSelections = optionalInteger(config, 'maxSelections');
      if (minSelections !== null && values.length < minSelections) {
        throw new BadRequestException(
          `Field ${code} requires at least ${minSelections} selection(s).`,
        );
      }
      if (maxSelections !== null && values.length > maxSelections) {
        throw new BadRequestException(
          `Field ${code} allows at most ${maxSelections} selection(s).`,
        );
      }
      return values;
    }

    case WorkFieldType.USER:
    case WorkFieldType.ORG_UNIT:
      if (typeof rawValue !== 'string' || !UUID_V4.test(rawValue)) {
        throw new BadRequestException(
          `Field ${code} must contain a valid UUID.`,
        );
      }
      return rawValue.toLowerCase();

    case WorkFieldType.IMAGE:
    case WorkFieldType.FILE:
      throw new BadRequestException(
        `Field ${code} requires attachment runtime support and cannot be supplied through structured Work attachments.`,
      );
  }
}

function validateWorkFieldsForStage(
  definitions: WorkFieldDefinitionForValidation[],
  inputs: WorkFieldInput[],
  stageDefinitionId: string | null,
  contextLabel: 'intake' | 'stage',
): ValidatedWorkFieldSet {
  const scopedDefinitions = definitions.filter(
    (definition) => definition.stageDefinitionId === stageDefinitionId,
  );
  const allByCode = new Map(
    definitions.map((definition) => [definition.code, definition]),
  );
  const scopedByCode = new Map(
    scopedDefinitions.map((definition) => [definition.code, definition]),
  );
  const inputByCode = new Map<string, WorkFieldInput>();

  for (const input of inputs) {
    if (inputByCode.has(input.code)) {
      throw new BadRequestException(
        `Field ${input.code} was supplied more than once.`,
      );
    }

    const definition = allByCode.get(input.code);
    if (!definition) {
      throw new BadRequestException(`Unknown Work field ${input.code}.`);
    }

    if (definition.stageDefinitionId !== stageDefinitionId) {
      throw new BadRequestException(
        contextLabel === 'intake'
          ? `Field ${input.code} belongs to a Work stage and cannot be supplied at intake.`
          : `Field ${input.code} does not belong to this Work stage.`,
      );
    }

    inputByCode.set(input.code, input);
  }

  for (const definition of scopedDefinitions) {
    const attachmentField =
      definition.fieldType === WorkFieldType.IMAGE ||
      definition.fieldType === WorkFieldType.FILE;
    if (
      definition.isRequired &&
      !attachmentField &&
      !inputByCode.has(definition.code)
    ) {
      throw new BadRequestException(
        contextLabel === 'intake'
          ? `Required Work field ${definition.code} is missing.`
          : `Required stage field ${definition.code} is missing.`,
      );
    }
  }

  const values: NormalizedWorkFieldValue[] = [];
  const valuesByCode = new Map<string, NormalizedJsonValue>();
  const identityValues: WorkIdentityFieldValue[] = [];

  for (const [code, input] of inputByCode.entries()) {
    const definition = scopedByCode.get(code);
    if (!definition) {
      throw new BadRequestException(
        contextLabel === 'intake'
          ? `Unknown Work intake field ${code}.`
          : `Unknown Work stage field ${code}.`,
      );
    }

    const value = normalizeSingleValue(definition, input.value);
    values.push({
      fieldDefinitionId: definition.id,
      code,
      fieldType: definition.fieldType,
      value,
    });
    valuesByCode.set(code, value);

    if (
      definition.fieldType === WorkFieldType.USER ||
      definition.fieldType === WorkFieldType.ORG_UNIT
    ) {
      identityValues.push({
        code,
        fieldType: definition.fieldType,
        id: value as string,
      });
    }
  }

  values.sort((left, right) => left.code.localeCompare(right.code));

  return { values, valuesByCode, identityValues };
}

export function validateWorkIntakeFields(
  definitions: WorkFieldDefinitionForValidation[],
  inputs: WorkFieldInput[],
): ValidatedWorkFieldSet {
  const intakeDefinitions = definitions.filter(isWorkFieldCollectedAtCreation);
  return validateWorkFieldsForStage(intakeDefinitions, inputs, null, 'intake');
}

export function validateWorkFields(
  definitions: WorkFieldDefinitionForValidation[],
  stageDefinitionId: string,
  inputs: WorkFieldInput[],
): ValidatedWorkFieldSet {
  return validateWorkFieldsForStage(
    definitions,
    inputs,
    stageDefinitionId,
    'stage',
  );
}

export interface ExistingWorkFieldValue {
  fieldDefinitionId: string;
  code: string;
  value: unknown;
}

export interface ValidatedWorkCompletionFieldSet extends ValidatedWorkFieldSet {
  persistedValues: NormalizedWorkFieldValue[];
}

function completionMode(
  definition: WorkFieldDefinitionForValidation,
): 'READ_ONLY' | 'EDITABLE' {
  const config = configRecord(definition.config);
  return config.completionMode === 'EDITABLE' ? 'EDITABLE' : 'READ_ONLY';
}

export function validateWorkCompletionFields(
  definitions: WorkFieldDefinitionForValidation[],
  inputs: WorkFieldInput[],
  existingValues: ExistingWorkFieldValue[] = [],
): ValidatedWorkCompletionFieldSet {
  const completionDefinitions = definitions.filter(
    isWorkFieldCollectedAtCompletion,
  );
  const byCode = new Map(
    completionDefinitions.map((definition) => [definition.code, definition]),
  );
  const existingByCode = new Map(
    existingValues.map((value) => [value.code, value]),
  );
  const inputByCode = new Map<string, WorkFieldInput>();

  for (const input of inputs) {
    if (inputByCode.has(input.code)) {
      throw new BadRequestException(
        `Field ${input.code} was supplied more than once.`,
      );
    }
    const definition = byCode.get(input.code);
    if (!definition) {
      throw new BadRequestException(
        `Unknown Work completion field ${input.code}.`,
      );
    }
    if (
      workFieldCollectionMode(definition) === 'CREATION_AND_COMPLETION' &&
      completionMode(definition) === 'READ_ONLY'
    ) {
      throw new BadRequestException(
        `Field ${input.code} is read-only at completion and must use its saved creation value.`,
      );
    }
    inputByCode.set(input.code, input);
  }

  const values: NormalizedWorkFieldValue[] = [];
  const persistedValues: NormalizedWorkFieldValue[] = [];
  const valuesByCode = new Map<string, NormalizedJsonValue>();
  const identityValues: WorkIdentityFieldValue[] = [];

  for (const definition of completionDefinitions) {
    const mode = workFieldCollectionMode(definition);
    const input = inputByCode.get(definition.code);
    const existing = existingByCode.get(definition.code);
    let normalized: NormalizedJsonValue | undefined;
    let shouldPersist = false;

    if (input) {
      normalized = normalizeSingleValue(definition, input.value);
      shouldPersist = true;
    } else if (mode === 'CREATION_AND_COMPLETION' && existing) {
      normalized = normalizeSingleValue(definition, existing.value);
    }

    const attachmentField =
      definition.fieldType === WorkFieldType.IMAGE ||
      definition.fieldType === WorkFieldType.FILE;
    if (definition.isRequired && !attachmentField && normalized === undefined) {
      throw new BadRequestException(
        `Required Work completion field ${definition.code} is missing.`,
      );
    }

    if (normalized === undefined) continue;

    const item: NormalizedWorkFieldValue = {
      fieldDefinitionId: definition.id,
      code: definition.code,
      fieldType: definition.fieldType,
      value: normalized,
    };
    values.push(item);
    valuesByCode.set(definition.code, normalized);
    if (shouldPersist) persistedValues.push(item);

    if (
      definition.fieldType === WorkFieldType.USER ||
      definition.fieldType === WorkFieldType.ORG_UNIT
    ) {
      identityValues.push({
        code: definition.code,
        fieldType: definition.fieldType,
        id: normalized as string,
      });
    }
  }

  values.sort((left, right) => left.code.localeCompare(right.code));
  persistedValues.sort((left, right) => left.code.localeCompare(right.code));
  return { values, persistedValues, valuesByCode, identityValues };
}

export async function assertWorkIdentityFieldValues(
  tx: Prisma.TransactionClient,
  officeId: string,
  at: Date,
  identityValues: WorkIdentityFieldValue[],
): Promise<void> {
  const orgUnitIds = [
    ...new Set(
      identityValues
        .filter((item) => item.fieldType === WorkFieldType.ORG_UNIT)
        .map((item) => item.id),
    ),
  ];

  if (orgUnitIds.length > 0) {
    const count = await tx.orgUnit.count({
      where: { id: { in: orgUnitIds }, officeId, isActive: true },
    });
    if (count !== orgUnitIds.length) {
      throw new BadRequestException(
        'One or more OrgUnit field values are not active in this Office.',
      );
    }
  }

  const accountIds = [
    ...new Set(
      identityValues
        .filter((item) => item.fieldType === WorkFieldType.USER)
        .map((item) => item.id),
    ),
  ];

  if (accountIds.length > 0) {
    const count = await tx.account.count({
      where: {
        id: { in: accountIds },
        isEnabled: true,
        accountClass: { not: AccountClass.SUPER_ADMIN },
        employee: {
          is: {
            status: EmployeeStatus.ACTIVE,
            employmentStatus: EmploymentStatus.ACTIVE,
            archivedAt: null,
            orgMemberships: {
              some: {
                officeId,
                membershipType: OrgMembershipType.PRIMARY,
                startsAt: { lte: at },
                OR: [{ endsAt: null }, { endsAt: { gt: at } }],
              },
            },
          },
        },
      },
    });
    if (count !== accountIds.length) {
      throw new BadRequestException(
        'One or more user field values are not active members of this Office.',
      );
    }
  }
}

export function normalizeReferenceValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}
