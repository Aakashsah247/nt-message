import type {
  WorkCompletionReport,
  WorkDynamicFieldDefinition,
  WorkDynamicFieldValue,
} from "../types/work-main-parity";

export type WorkCompletionFieldDrafts = Record<string, string>;

export interface WorkCompletionFieldInput {
  code: string;
  value: unknown;
}

type CollectionMode =
  | "CREATION_ONLY"
  | "COMPLETION_ONLY"
  | "CREATION_AND_COMPLETION"
  | "STAGE_ONLY";

type CompletionMode = "READ_ONLY" | "EDITABLE";

function config(field: WorkDynamicFieldDefinition): Record<string, unknown> {
  return field.config ?? {};
}

export function completionCollectionMode(
  field: WorkDynamicFieldDefinition,
): CollectionMode {
  const value = config(field).collectionMode;
  if (
    value === "CREATION_ONLY" ||
    value === "COMPLETION_ONLY" ||
    value === "CREATION_AND_COMPLETION" ||
    value === "STAGE_ONLY"
  ) {
    return value;
  }
  return field.stageDefinitionId === null ? "CREATION_ONLY" : "STAGE_ONLY";
}

export function completionEditMode(
  field: WorkDynamicFieldDefinition,
): CompletionMode {
  return config(field).completionMode === "EDITABLE" ? "EDITABLE" : "READ_ONLY";
}

export function completionFields(
  fields: WorkDynamicFieldDefinition[] | undefined,
): WorkDynamicFieldDefinition[] {
  return [...(fields ?? [])]
    .filter((field) => {
      const mode = completionCollectionMode(field);
      return mode === "COMPLETION_ONLY" || mode === "CREATION_AND_COMPLETION";
    })
    .sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code));
}

export function readOnlyCompletionFields(
  fields: WorkDynamicFieldDefinition[] | undefined,
): WorkDynamicFieldDefinition[] {
  return completionFields(fields).filter(
    (field) =>
      completionCollectionMode(field) === "CREATION_AND_COMPLETION" &&
      completionEditMode(field) === "READ_ONLY",
  );
}

export function editableCompletionFields(
  fields: WorkDynamicFieldDefinition[] | undefined,
): WorkDynamicFieldDefinition[] {
  return completionFields(fields).filter(
    (field) =>
      completionCollectionMode(field) === "COMPLETION_ONLY" ||
      completionEditMode(field) === "EDITABLE",
  );
}

function valueByCode(
  values: WorkDynamicFieldValue[] | undefined,
): Map<string, unknown> {
  return new Map((values ?? []).map((item) => [item.fieldDefinition.code, item.value]));
}

function snapshotByCode(
  report: Pick<WorkCompletionReport, "fieldValuesSnapshot"> | undefined,
): Map<string, unknown> {
  return new Map((report?.fieldValuesSnapshot ?? []).map((item) => [item.code, item.value]));
}

export function completionDisplayValue(
  field: WorkDynamicFieldDefinition,
  values: WorkDynamicFieldValue[] | undefined,
): unknown {
  return valueByCode(values).get(field.code);
}

function toDraftValue(field: WorkDynamicFieldDefinition, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (field.fieldType === "BOOLEAN") return typeof value === "boolean" ? String(value) : "";
  if (field.fieldType === "MULTI_SELECT") {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string").join(",")
      : "";
  }
  if (field.fieldType === "DATETIME" && typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
      return local.toISOString().slice(0, 16);
    }
  }
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function buildCompletionFieldDrafts(
  fields: WorkDynamicFieldDefinition[] | undefined,
  values: WorkDynamicFieldValue[] | undefined,
  requestedReport?: Pick<WorkCompletionReport, "fieldValuesSnapshot">,
): WorkCompletionFieldDrafts {
  const saved = valueByCode(values);
  const submitted = snapshotByCode(requestedReport);
  const drafts: WorkCompletionFieldDrafts = {};

  for (const field of editableCompletionFields(fields)) {
    const previous = submitted.has(field.code)
      ? submitted.get(field.code)
      : completionCollectionMode(field) === "CREATION_AND_COMPLETION"
        ? saved.get(field.code)
        : undefined;
    drafts[field.code] = toDraftValue(field, previous);
  }

  return drafts;
}

function configuredOptions(field: WorkDynamicFieldDefinition): string[] {
  const options = config(field).options;
  return Array.isArray(options)
    ? options.filter((option): option is string => typeof option === "string")
    : [];
}

function allowsOther(field: WorkDynamicFieldDefinition): boolean {
  return config(field).allowOther === true;
}

function optionalNumber(field: WorkDynamicFieldDefinition, key: string): number | null {
  const value = config(field)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalInteger(field: WorkDynamicFieldDefinition, key: string): number | null {
  const value = optionalNumber(field, key);
  return value !== null && Number.isInteger(value) ? value : null;
}

export function completionFieldOptions(field: WorkDynamicFieldDefinition): string[] {
  return configuredOptions(field);
}

export function completionFieldChoiceSettings(field: WorkDynamicFieldDefinition): {
  allowOther: boolean;
  otherLabel: string;
} {
  const otherLabel = config(field).otherLabel;
  return {
    allowOther: allowsOther(field),
    otherLabel:
      typeof otherLabel === "string" && otherLabel.trim().length > 0
        ? otherLabel.trim()
        : "Other",
  };
}

export function completionFieldConstraint(
  field: WorkDynamicFieldDefinition,
  key: "min" | "max" | "maxLength" | "minSelections" | "maxSelections",
): number | null {
  return key === "maxLength" || key === "minSelections" || key === "maxSelections"
    ? optionalInteger(field, key)
    : optionalNumber(field, key);
}

export function formatCompletionFieldValue(
  field: WorkDynamicFieldDefinition,
  value: unknown,
): string {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (field.fieldType === "DATETIME" && typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString();
  }
  return String(value);
}

export function validateAndBuildCompletionFieldInputs(
  fields: WorkDynamicFieldDefinition[] | undefined,
  drafts: WorkCompletionFieldDrafts,
): { inputs: WorkCompletionFieldInput[]; error: string | null } {
  const inputs: WorkCompletionFieldInput[] = [];

  for (const field of editableCompletionFields(fields)) {
    if (field.fieldType === "IMAGE" || field.fieldType === "FILE") continue;

    const raw = drafts[field.code] ?? "";
    const trimmed = raw.trim();
    if (!trimmed) {
      if (field.isRequired) {
        return { inputs: [], error: `${field.label} is required.` };
      }
      continue;
    }

    let value: unknown = trimmed;
    if (field.fieldType === "NUMBER" || field.fieldType === "DECIMAL") {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || (field.fieldType === "NUMBER" && !Number.isInteger(parsed))) {
        return {
          inputs: [],
          error: `${field.label} must be ${field.fieldType === "NUMBER" ? "a whole number" : "a valid number"}.`,
        };
      }
      const min = optionalNumber(field, "min");
      const max = optionalNumber(field, "max");
      if (min !== null && parsed < min) return { inputs: [], error: `${field.label} must be at least ${min}.` };
      if (max !== null && parsed > max) return { inputs: [], error: `${field.label} must not exceed ${max}.` };
      value = parsed;
    } else if (field.fieldType === "BOOLEAN") {
      value = trimmed === "true";
    } else if (field.fieldType === "MULTI_SELECT") {
      const values = raw.split(",").map((item) => item.trim()).filter(Boolean);
      const minSelections = optionalInteger(field, "minSelections");
      const maxSelections = optionalInteger(field, "maxSelections");
      if (minSelections !== null && values.length < minSelections) {
        return { inputs: [], error: `${field.label} requires at least ${minSelections} selection(s).` };
      }
      if (maxSelections !== null && values.length > maxSelections) {
        return { inputs: [], error: `${field.label} allows at most ${maxSelections} selection(s).` };
      }
      const options = configuredOptions(field);
      if (!allowsOther(field) && values.some((item) => !options.includes(item))) {
        return { inputs: [], error: `${field.label} contains an unsupported option.` };
      }
      value = values;
    } else if (field.fieldType === "SELECT") {
      const options = configuredOptions(field);
      if (!allowsOther(field) && !options.includes(trimmed)) {
        return { inputs: [], error: `${field.label} contains an unsupported option.` };
      }
    } else if (field.fieldType === "DATETIME") {
      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) {
        return { inputs: [], error: `${field.label} must contain a valid date and time.` };
      }
      value = parsed.toISOString();
    }

    const maxLength = optionalInteger(field, "maxLength");
    if (typeof value === "string" && maxLength !== null && value.length > maxLength) {
      return { inputs: [], error: `${field.label} must not exceed ${maxLength} characters.` };
    }

    inputs.push({ code: field.code, value });
  }

  return { inputs, error: null };
}

export interface WorkCompletionDisplayRow {
  code: string;
  label: string;
  value: unknown;
  formatted: string;
  missing: boolean;
}


const PLATFORM_INFORMATION_CODES = new Set([
  "COMPLETION_RESULT",
  "COMPLETION_SUMMARY",
  "MORE_WORK_REQUIRED",
]);

export function workInformationDisplayRows(
  fields: WorkDynamicFieldDefinition[] | undefined,
  values: WorkDynamicFieldValue[] | undefined,
): WorkCompletionDisplayRow[] {
  const saved = valueByCode(values);

  return [...(fields ?? [])]
    .filter(
      (field) =>
        !PLATFORM_INFORMATION_CODES.has(field.code) &&
        completionCollectionMode(field) !== "STAGE_ONLY",
    )
    .sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code))
    .map((field) => {
      const value = saved.get(field.code);
      const formatted = formatCompletionFieldValue(field, value);
      return {
        code: field.code,
        label: field.label,
        value,
        formatted,
        missing: formatted === "Not provided",
      };
    });
}

export function completionReportDisplayRows(
  fields: WorkDynamicFieldDefinition[] | undefined,
  values: WorkDynamicFieldValue[] | undefined,
  report: Pick<WorkCompletionReport, "fieldValuesSnapshot">,
): WorkCompletionDisplayRow[] {
  const submitted = snapshotByCode(report);
  const saved = valueByCode(values);

  return completionFields(fields).map((field) => {
    const value = submitted.has(field.code)
      ? submitted.get(field.code)
      : completionCollectionMode(field) === "CREATION_AND_COMPLETION"
        ? saved.get(field.code)
        : undefined;
    const formatted = formatCompletionFieldValue(field, value);
    return {
      code: field.code,
      label: field.label,
      value,
      formatted,
      missing: formatted === "Not provided",
    };
  });
}
