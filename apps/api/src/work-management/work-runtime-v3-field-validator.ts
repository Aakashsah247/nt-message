import { BadRequestException } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { WorkFieldType } from '../generated/prisma/client';
import type { WorkRuntimeV3FieldInputDto } from './dto/create-work-runtime-v3.dto';

type JsonScalar = string | number | boolean;
type NormalizedJsonValue = JsonScalar | JsonScalar[];

export interface RuntimeFieldDefinitionForValidation {
  id: string;
  code: string;
  fieldType: WorkFieldType;
  isRequired: boolean;
  stageDefinitionId: string | null;
  config: Prisma.JsonValue | null;
}

export interface NormalizedRuntimeFieldValue {
  fieldDefinitionId: string;
  code: string;
  fieldType: WorkFieldType;
  value: NormalizedJsonValue;
}

export interface RuntimeIdentityFieldValue {
  code: string;
  fieldType: typeof WorkFieldType.USER | typeof WorkFieldType.ORG_UNIT;
  id: string;
}

export interface ValidatedRuntimeFieldSet {
  values: NormalizedRuntimeFieldValue[];
  valuesByCode: Map<string, NormalizedJsonValue>;
  identityValues: RuntimeIdentityFieldValue[];
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_WITH_ZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function configRecord(config: Prisma.JsonValue | null): Record<string, unknown> {
  return isRecord(config) ? config : {};
}

function optionalNumber(config: Record<string, unknown>, key: string): number | null {
  const value = config[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function optionalInteger(config: Record<string, unknown>, key: string): number | null {
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
  definition: RuntimeFieldDefinitionForValidation,
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
        throw new BadRequestException(`Field ${code} contains an invalid date.`);
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
        throw new BadRequestException(`Field ${code} contains an invalid date and time.`);
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
        throw new BadRequestException(`Field ${code} must use one configured option.`);
      }
      const value = rawValue.trim();
      const options = configuredOptions(config);
      if (!options.includes(value)) {
        throw new BadRequestException(`Field ${code} contains an unsupported option.`);
      }
      return value;
    }

    case WorkFieldType.MULTI_SELECT: {
      if (!Array.isArray(rawValue)) {
        throw new BadRequestException(`Field ${code} must be a list of configured options.`);
      }
      const values = rawValue.map((item) => {
        if (typeof item !== 'string' || item.trim().length === 0) {
          throw new BadRequestException(`Field ${code} contains an invalid option.`);
        }
        return item.trim();
      });
      if (new Set(values).size !== values.length) {
        throw new BadRequestException(`Field ${code} must not contain duplicate options.`);
      }
      const options = configuredOptions(config);
      if (values.some((value) => !options.includes(value))) {
        throw new BadRequestException(`Field ${code} contains an unsupported option.`);
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
        throw new BadRequestException(`Field ${code} must contain a valid UUID.`);
      }
      return rawValue.toLowerCase();

    case WorkFieldType.IMAGE:
    case WorkFieldType.FILE:
      throw new BadRequestException(
        `Field ${code} requires attachment runtime support and cannot be supplied during Phase 6 core intake.`,
      );
  }
}

export function validateRuntimeIntakeFields(
  definitions: RuntimeFieldDefinitionForValidation[],
  inputs: WorkRuntimeV3FieldInputDto[],
): ValidatedRuntimeFieldSet {
  const intakeDefinitions = definitions.filter(
    (definition) => definition.stageDefinitionId === null,
  );
  const allByCode = new Map(
    definitions.map((definition) => [definition.code, definition]),
  );
  const intakeByCode = new Map(
    intakeDefinitions.map((definition) => [definition.code, definition]),
  );
  const inputByCode = new Map<string, WorkRuntimeV3FieldInputDto>();

  for (const input of inputs) {
    if (inputByCode.has(input.code)) {
      throw new BadRequestException(`Field ${input.code} was supplied more than once.`);
    }
    const definition = allByCode.get(input.code);
    if (!definition) {
      throw new BadRequestException(`Unknown Work field ${input.code}.`);
    }
    if (definition.stageDefinitionId !== null) {
      throw new BadRequestException(
        `Field ${input.code} belongs to a Work stage and cannot be supplied at intake.`,
      );
    }
    inputByCode.set(input.code, input);
  }

  for (const definition of intakeDefinitions) {
    if (definition.isRequired && !inputByCode.has(definition.code)) {
      throw new BadRequestException(`Required Work field ${definition.code} is missing.`);
    }
  }

  const values: NormalizedRuntimeFieldValue[] = [];
  const valuesByCode = new Map<string, NormalizedJsonValue>();
  const identityValues: RuntimeIdentityFieldValue[] = [];

  for (const [code, input] of inputByCode.entries()) {
    const definition = intakeByCode.get(code);
    if (!definition) {
      throw new BadRequestException(`Unknown Work intake field ${code}.`);
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

export function normalizeReferenceValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}
