import { WorkFieldType } from '../generated/prisma/client';

/**
 * These values belong to the Work platform, not to an individual Work Type.
 * Historical published versions may still contain matching field definitions;
 * the runtime maps the platform completion payload back to those rows so old
 * Work stays readable without exposing duplicate inputs to users.
 */
export const WORK_FOUNDATION_COMPLETION_FIELD_CODES = [
  'COMPLETION_RESULT',
  'COMPLETION_SUMMARY',
  'MORE_WORK_REQUIRED',
] as const;

export type WorkFoundationCompletionFieldCode =
  (typeof WORK_FOUNDATION_COMPLETION_FIELD_CODES)[number];

const FOUNDATION_COMPLETION_CODE_SET = new Set<string>(
  WORK_FOUNDATION_COMPLETION_FIELD_CODES,
);

export function isWorkFoundationCompletionFieldCode(
  code: string,
): code is WorkFoundationCompletionFieldCode {
  return FOUNDATION_COMPLETION_CODE_SET.has(code);
}

export const WORK_SYSTEM_CONTROLLED_FIELD_CODES = [
  ...WORK_FOUNDATION_COMPLETION_FIELD_CODES,
  // Sales notes belong to the fixed Sales Coordination workflow. Customer ID
  // and RX Level are business Information fields and must stay configurable.
  'SALES_NOTE',
] as const;

const SYSTEM_CONTROLLED_CODE_SET = new Set<string>(
  WORK_SYSTEM_CONTROLLED_FIELD_CODES,
);

export function isWorkSystemControlledFieldCode(code: string): boolean {
  return SYSTEM_CONTROLLED_CODE_SET.has(code);
}

export const WORK_FOUNDATION_COMPLETION_FIELD_SHAPES = {
  COMPLETION_RESULT: WorkFieldType.SELECT,
  COMPLETION_SUMMARY: WorkFieldType.LONG_TEXT,
  MORE_WORK_REQUIRED: WorkFieldType.BOOLEAN,
} as const;
