import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../context/AuthContext";
import { getOrganizationOffices } from "../services/organization-v3.service";
import {
  createWorkTypeDraft,
  discardWorkTypeDraft,
  getWorkType,
  getWorkTypeActions,
  getWorkTypeConfigurationContext,
  listWorkTypes,
  publishWorkTypeDraft,
  replaceWorkTypeDraftConfiguration,
  updateWorkTypeDraft,
} from "../services/work-type-v3.service";
import type {
  ReplaceWorkTypeConfigurationInput,
  WorkFieldType,
  WorkFinalClosureMode,
  WorkLeadershipType,
  WorkSlaBasis,
  WorkStageActivationMode,
  WorkStageApprovalMode,
  WorkStageAssignmentMode,
  WorkStageResponsibleOrgUnitRule,
  WorkTypeActions,
  WorkTypeConfigurationCreatorAccount,
  WorkTypeConfigurationOrgUnit,
  WorkTypeCreatorCategory,
  WorkTypeCreatorScope,
  WorkTypeDefinitionDetail,
  WorkTypeDefinitionListItem,
  WorkTypeFieldDefinitionInput,
  WorkTypeStageDefinitionInput,
  WorkTypeStageDependencyInput,
  WorkTypeVersionDetail,
} from "../types/work-type-v3";

const EMPTY_ACTIONS: WorkTypeActions = {
  view: false,
  draft: false,
  publish: false,
};

const CREATOR_CATEGORIES: WorkTypeCreatorCategory[] = [
  "OFFICE_HEAD",
  "ORG_UNIT_HEAD",
  "TEAM_LEAD",
  "EMPLOYEE",
];

const CREATOR_SCOPES: WorkTypeCreatorScope[] = [
  "OFFICE_WIDE",
  "PRIMARY_OWNER_SUBTREE",
  "SPECIFIC_ORG_UNITS",
];

const FIELD_TYPES: WorkFieldType[] = [
  "TEXT",
  "LONG_TEXT",
  "NUMBER",
  "DECIMAL",
  "DATE",
  "DATETIME",
  "BOOLEAN",
  "SELECT",
  "MULTI_SELECT",
  "USER",
  "ORG_UNIT",
  "REFERENCE",
  "IMAGE",
  "FILE",
];

const RESPONSIBILITY_RULES: WorkStageResponsibleOrgUnitRule[] = [
  "PRIMARY_OWNER",
  "SPECIFIC_ORG_UNIT",
  "RUNTIME_REQUESTED_PARTICIPANT",
];

const ASSIGNMENT_MODES: WorkStageAssignmentMode[] = [
  "ORG_UNIT_QUEUE",
  "TEAM",
  "INDIVIDUAL",
  "ORG_UNIT_OR_TEAM",
  "ORG_UNIT_OR_USER",
  "RESPONSIBLE_ORG_UNIT_HEAD",
];

const APPROVAL_MODES: WorkStageApprovalMode[] = [
  "NONE",
  "RESPONSIBLE_ORG_UNIT_HEAD",
  "TEAM_LEAD",
  "SPECIFIC_LEADERSHIP",
  "OFFICE_HEAD",
];

const ACTIVATION_MODES: WorkStageActivationMode[] = [
  "ALWAYS",
  "MANUAL_WHEN_REQUIRED",
  "FIELD_TRUE",
  "FIELD_EQUALS",
];

const CLOSURE_MODES: WorkFinalClosureMode[] = [
  "AUTO_AFTER_REQUIRED_STAGES",
  "PRIMARY_OWNER_HEAD",
  "SPECIFIC_LEADERSHIP",
  "OFFICE_HEAD",
];

const LEADERSHIP_TYPES: WorkLeadershipType[] = [
  "OFFICE_HEAD",
  "ORG_UNIT_HEAD",
  "DEPUTY",
];

const SLA_BASES: WorkSlaBasis[] = [
  "CALENDAR_DURATION",
  "OFFICE_WORKING_DURATION",
];

type ConfirmationAction = "DISCARD" | "PUBLISH" | null;

interface EditableField extends WorkTypeFieldDefinitionInput {
  key: string;
  optionsText: string;
  minValue: string;
  maxValue: string;
  maxLength: string;
}

interface EditableStage extends WorkTypeStageDefinitionInput {
  key: string;
  expectedValueText: string;
}

interface EditableDependency extends WorkTypeStageDependencyInput {
  key: string;
}

interface DraftEditorState {
  name: string;
  description: string;
  changeReason: string;
  primaryOwnerOrgUnitId: string;
  creatorCategories: WorkTypeCreatorCategory[];
  creatorScope: WorkTypeCreatorScope;
  creatorOrgUnitIds: string[];
  creatorOrgUnitDescendants: Record<string, boolean>;
  creatorAccountIds: string[];
  finalClosureMode: WorkFinalClosureMode;
  finalClosureLeadershipType: WorkLeadershipType | "";
  slaBasis: WorkSlaBasis;
  overallSlaMinutes: string;
  fields: EditableField[];
  stages: EditableStage[];
  dependencies: EditableDependency[];
}

function randomKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
}

function toEditableField(
  field: WorkTypeVersionDetail["fields"][number],
  stages: WorkTypeVersionDetail["stages"],
): EditableField {
  const config = field.config ?? {};
  const options = Array.isArray(config.options)
    ? config.options.filter((item): item is string => typeof item === "string")
    : [];
  const stageCode = stages.find((stage) => stage.id === field.stageDefinitionId)?.code;

  return {
    key: field.id || randomKey("field"),
    code: field.code,
    label: field.label,
    fieldType: field.fieldType,
    isRequired: field.isRequired,
    sortOrder: field.sortOrder,
    stageCode,
    optionsText: options.join(", "),
    minValue: typeof config.min === "number" ? String(config.min) : "",
    maxValue: typeof config.max === "number" ? String(config.max) : "",
    maxLength: typeof config.maxLength === "number" ? String(config.maxLength) : "",
  };
}

function toEditableStage(
  stage: WorkTypeVersionDetail["stages"][number],
  fields: WorkTypeVersionDetail["fields"],
): EditableStage {
  const activationFieldCode = fields.find(
    (field) => field.id === stage.activationFieldDefinitionId,
  )?.code;

  return {
    key: stage.id || randomKey("stage"),
    code: stage.code,
    name: stage.name,
    description: stage.description,
    sortOrder: stage.sortOrder,
    isRequired: stage.isRequired,
    responsibleOrgUnitRule: stage.responsibleOrgUnitRule,
    responsibleOrgUnitId: stage.responsibleOrgUnitId,
    assignmentMode: stage.assignmentMode,
    approvalMode: stage.approvalMode,
    approvalLeadershipType: stage.approvalLeadershipType,
    activationMode: stage.activationMode,
    activationFieldCode,
    activationExpectedValue: undefined,
    expectedValueText:
      stage.activationExpectedValue === null ||
      stage.activationExpectedValue === undefined
        ? ""
        : String(stage.activationExpectedValue),
    slaMinutes: stage.slaMinutes,
  };
}

function editorFromDraft(draft: WorkTypeVersionDetail): DraftEditorState {
  const stageById = new Map(draft.stages.map((stage) => [stage.id, stage.code]));

  return {
    name: draft.name,
    description: draft.description ?? "",
    changeReason: draft.changeReason ?? "",
    primaryOwnerOrgUnitId: draft.primaryOwnerOrgUnitId ?? "",
    creatorCategories: [...draft.creatorCategories],
    creatorScope: draft.creatorScope,
    creatorOrgUnitIds: draft.creatorOrgUnits.map((item) => item.orgUnitId),
    creatorOrgUnitDescendants: Object.fromEntries(
      draft.creatorOrgUnits.map((item) => [item.orgUnitId, item.includeDescendants]),
    ),
    creatorAccountIds: draft.creatorAccounts.map((item) => item.accountId),
    finalClosureMode: draft.finalClosureMode,
    finalClosureLeadershipType: draft.finalClosureLeadershipType ?? "",
    slaBasis: draft.slaBasis,
    overallSlaMinutes: draft.overallSlaMinutes
      ? String(draft.overallSlaMinutes)
      : "",
    fields: draft.fields.map((field) => toEditableField(field, draft.stages)),
    stages: draft.stages.map((stage) => toEditableStage(stage, draft.fields)),
    dependencies: draft.stageDependencies.map((dependency) => ({
      key: dependency.id || randomKey("dependency"),
      stageCode: stageById.get(dependency.stageDefinitionId) ?? "",
      prerequisiteStageCode:
        stageById.get(dependency.prerequisiteStageId) ?? "",
    })),
  };
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseExpectedValue(value: string): string | number | boolean {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const numeric = Number(trimmed);
  return trimmed !== "" && Number.isFinite(numeric) ? numeric : trimmed;
}

function buildFieldConfig(field: EditableField): Record<string, unknown> | undefined {
  if (field.fieldType === "SELECT" || field.fieldType === "MULTI_SELECT") {
    const options = field.optionsText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return options.length > 0 ? { options } : undefined;
  }

  if (field.fieldType === "NUMBER" || field.fieldType === "DECIMAL") {
    const min = parseOptionalNumber(field.minValue);
    const max = parseOptionalNumber(field.maxValue);
    const config: Record<string, unknown> = {};
    if (min !== null) config.min = min;
    if (max !== null) config.max = max;
    return Object.keys(config).length > 0 ? config : undefined;
  }

  if (
    field.fieldType === "TEXT" ||
    field.fieldType === "LONG_TEXT" ||
    field.fieldType === "REFERENCE"
  ) {
    const maxLength = parseOptionalNumber(field.maxLength);
    return maxLength !== null ? { maxLength } : undefined;
  }

  return undefined;
}

function buildConfigurationPayload(editor: DraftEditorState): ReplaceWorkTypeConfigurationInput {
  return {
    primaryOwnerOrgUnitId: editor.primaryOwnerOrgUnitId || null,
    creatorCategories: editor.creatorCategories,
    creatorScope: editor.creatorScope,
    creatorOrgUnits: editor.creatorScope === "SPECIFIC_ORG_UNITS"
      ? editor.creatorOrgUnitIds.map((orgUnitId) => ({
          orgUnitId,
          includeDescendants: Boolean(editor.creatorOrgUnitDescendants[orgUnitId]),
        }))
      : [],
    creatorAccounts: editor.creatorAccountIds.map((accountId) => ({ accountId })),
    finalClosureMode: editor.finalClosureMode,
    finalClosureLeadershipType:
      editor.finalClosureMode === "SPECIFIC_LEADERSHIP"
        ? editor.finalClosureLeadershipType || null
        : null,
    slaBasis: editor.slaBasis,
    overallSlaMinutes: parseOptionalNumber(editor.overallSlaMinutes),
    fields: editor.fields.map((field, index) => ({
      code: normalizeCode(field.code),
      label: field.label.trim(),
      fieldType: field.fieldType,
      isRequired: Boolean(field.isRequired),
      sortOrder: index,
      config: buildFieldConfig(field),
      stageCode: field.stageCode || undefined,
    })),
    stages: editor.stages.map((stage, index) => ({
      code: normalizeCode(stage.code),
      name: stage.name.trim(),
      description: stage.description?.trim() || null,
      sortOrder: index,
      isRequired: Boolean(stage.isRequired),
      responsibleOrgUnitRule: stage.responsibleOrgUnitRule,
      responsibleOrgUnitId:
        stage.responsibleOrgUnitRule === "SPECIFIC_ORG_UNIT"
          ? stage.responsibleOrgUnitId || null
          : null,
      assignmentMode: stage.assignmentMode,
      approvalMode: stage.approvalMode,
      approvalLeadershipType:
        stage.approvalMode === "SPECIFIC_LEADERSHIP"
          ? stage.approvalLeadershipType || null
          : null,
      activationMode: stage.activationMode,
      activationFieldCode:
        stage.activationMode === "FIELD_TRUE" || stage.activationMode === "FIELD_EQUALS"
          ? stage.activationFieldCode || null
          : null,
      activationExpectedValue:
        stage.activationMode === "FIELD_EQUALS"
          ? parseExpectedValue(stage.expectedValueText)
          : undefined,
      slaMinutes: stage.slaMinutes ?? null,
    })),
    dependencies: editor.dependencies
      .filter((item) => item.stageCode && item.prerequisiteStageCode)
      .map((item) => ({
        stageCode: item.stageCode,
        prerequisiteStageCode: item.prerequisiteStageCode,
      })),
  };
}

function formatDate(value: string | null | undefined, locale: string, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function StatusBadge({ status }: { status: WorkTypeVersionDetail["status"] | "ACTIVE" | "INACTIVE" }) {
  const { t } = useTranslation("workTypes");
  const className = status === "PUBLISHED" || status === "ACTIVE"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : status === "DRAFT"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-slate-200 bg-slate-100 text-slate-600";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>
      {t(`labels.${status}`)}
    </span>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
      <strong className="block text-base text-nt-text">{title}</strong>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

export function WorkTypeManagementPage() {
  const { t, i18n } = useTranslation("workTypes");
  const { accessToken, account } = useAuth();
  const locale = i18n.resolvedLanguage === "ne" ? "ne-NP" : "en-GB";

  const [offices, setOffices] = useState<Array<{ id: string; code: string; name: string; isActive: boolean }>>([]);
  const [officeId, setOfficeId] = useState("");
  const [actions, setActions] = useState<WorkTypeActions>(EMPTY_ACTIONS);
  const [definitions, setDefinitions] = useState<WorkTypeDefinitionListItem[]>([]);
  const [selectedDefinitionId, setSelectedDefinitionId] = useState("");
  const [detail, setDetail] = useState<WorkTypeDefinitionDetail | null>(null);
  const [orgUnits, setOrgUnits] = useState<WorkTypeConfigurationOrgUnit[]>([]);
  const [creatorAccounts, setCreatorAccounts] = useState<WorkTypeConfigurationCreatorAccount[]>([]);
  const [editor, setEditor] = useState<DraftEditorState | null>(null);
  const [search, setSearch] = useState("");
  const [creatorSearch, setCreatorSearch] = useState("");
  const [loadedOfficesAccountId, setLoadedOfficesAccountId] = useState<string | null>(null);
  const [loadedOfficeRequestKey, setLoadedOfficeRequestKey] = useState<string | null>(null);
  const [loadedDetailRequestKey, setLoadedDetailRequestKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [draftReason, setDraftReason] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationAction>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const activeUnits = useMemo(
    () => orgUnits.filter((unit) => unit.isActive),
    [orgUnits],
  );
  const filteredCreatorAccounts = useMemo(() => {
    const term = creatorSearch.trim().toLowerCase();
    if (!term) return creatorAccounts;
    return creatorAccounts.filter((person) =>
      [
        person.empName,
        person.empId,
        person.designation ?? "",
        person.username ?? "",
      ].some((value) => value.toLowerCase().includes(term)),
    );
  }, [creatorAccounts, creatorSearch]);
  const filteredDefinitions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return definitions;
    return definitions.filter((definition) => {
      const name = definition.currentDraftVersion?.name ?? definition.currentPublishedVersion?.name ?? definition.code;
      return [definition.code, name]
        .some((value) => value.toLowerCase().includes(term));
    });
  }, [definitions, search]);

  const selectedDefinition = definitions.find((item) => item.id === selectedDefinitionId) ?? null;
  const draft = detail?.versions.find((version) => version.status === "DRAFT") ?? null;
  const published = detail?.versions.find((version) => version.status === "PUBLISHED") ?? null;
  const retired = detail?.versions.filter((version) => version.status === "RETIRED") ?? [];
  const sessionRequestKey = account?.id ?? null;
  const officeRequestKey = accessToken && sessionRequestKey && officeId
    ? `${sessionRequestKey}:${officeId}:${refreshVersion}`
    : null;
  const detailRequestKey = officeRequestKey && selectedDefinitionId
    ? `${officeRequestKey}:${selectedDefinitionId}`
    : null;
  const loading = Boolean(
    accessToken && sessionRequestKey && loadedOfficesAccountId !== sessionRequestKey,
  );
  const loadingOffice = Boolean(
    officeRequestKey && loadedOfficeRequestKey !== officeRequestKey,
  );
  const loadingDetail = Boolean(
    detailRequestKey && loadedDetailRequestKey !== detailRequestKey,
  );

  useEffect(() => {
    if (!accessToken) return;

    let active = true;
    getOrganizationOffices(accessToken)
      .then((response) => {
        if (!active) return;
        const visible = response.data.map((office) => ({
          id: office.id,
          code: office.code,
          name: office.name,
          isActive: office.isActive,
        }));
        setOffices(visible);
        setOfficeId((current) =>
          visible.some((office) => office.id === current)
            ? current
            : visible.find((office) => office.isActive)?.id || visible[0]?.id || "",
        );
        setError("");
      })
      .catch((requestError: unknown) => {
        if (active) setError(getErrorMessage(requestError, t("errors.loadOffices")));
      })
      .finally(() => {
        if (active && sessionRequestKey) {
          setLoadedOfficesAccountId(sessionRequestKey);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, sessionRequestKey, t]);

  useEffect(() => {
    if (!accessToken || !officeId || !officeRequestKey) return;

    let active = true;

    Promise.all([
      getWorkTypeActions(accessToken, officeId),
      listWorkTypes(accessToken, officeId),
      getWorkTypeConfigurationContext(accessToken, officeId),
    ])
      .then(([actionResponse, listResponse, configurationContext]) => {
        if (!active) return;
        setActions(actionResponse.availableActions);
        setDefinitions(listResponse.data);
        setDetail(null);
        setEditor(null);
        setOrgUnits(configurationContext.orgUnits);
        setCreatorAccounts(configurationContext.creatorAccounts);
        setSelectedDefinitionId((current) =>
          current && listResponse.data.some((item) => item.id === current)
            ? current
            : listResponse.data[0]?.id ?? "",
        );
      })
      .catch((requestError: unknown) => {
        if (active) {
          setDefinitions([]);
          setDetail(null);
          setEditor(null);
          setOrgUnits([]);
          setCreatorAccounts([]);
          setActions(EMPTY_ACTIONS);
          setError(getErrorMessage(requestError, t("errors.loadWorkTypes")));
        }
      })
      .finally(() => {
        if (active) setLoadedOfficeRequestKey(officeRequestKey);
      });

    return () => {
      active = false;
    };
  }, [accessToken, officeId, officeRequestKey, t]);

  useEffect(() => {
    if (!accessToken || !officeId || !selectedDefinitionId || !detailRequestKey) return;

    let active = true;

    getWorkType(accessToken, officeId, selectedDefinitionId)
      .then((response) => {
        if (!active) return;
        setDetail(response.workType);
        const currentDraft = response.workType.versions.find((version) => version.status === "DRAFT");
        setEditor(currentDraft ? editorFromDraft(currentDraft) : null);
        setError("");
      })
      .catch((requestError: unknown) => {
        if (active) setError(getErrorMessage(requestError, t("errors.loadDetail")));
      })
      .finally(() => {
        if (active) setLoadedDetailRequestKey(detailRequestKey);
      });

    return () => {
      active = false;
    };
  }, [accessToken, detailRequestKey, officeId, selectedDefinitionId, t]);

  function refresh(message: string): void {
    setSuccess(message);
    setError("");
    setConfirmation(null);
    setRefreshVersion((value) => value + 1);
  }

  async function handleCreateDraft(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!accessToken || !selectedDefinition || !officeId || !actions.draft) return;
    setSaving(true);
    setError("");
    try {
      await createWorkTypeDraft(accessToken, officeId, selectedDefinition.id, {
        changeReason: draftReason.trim() || null,
      });
      setDraftReason("");
      refresh(t("messages.draftCreated"));
    } catch (requestError) {
      setError(getErrorMessage(requestError, t("errors.createDraft")));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMetadata(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!accessToken || !officeId || !detail || !draft || !editor || !actions.draft) return;
    setSaving(true);
    setError("");
    try {
      await updateWorkTypeDraft(accessToken, officeId, detail.id, draft.id, {
        name: editor.name.trim(),
        description: editor.description.trim() || null,
        changeReason: editor.changeReason.trim() || null,
      });
      refresh(t("messages.metadataSaved"));
    } catch (requestError) {
      setError(getErrorMessage(requestError, t("errors.saveMetadata")));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveConfiguration(): Promise<void> {
    if (!accessToken || !officeId || !detail || !draft || !editor || !actions.draft) return;
    setSaving(true);
    setError("");
    try {
      await replaceWorkTypeDraftConfiguration(
        accessToken,
        officeId,
        detail.id,
        draft.id,
        buildConfigurationPayload(editor),
      );
      refresh(t("messages.configurationSaved"));
    } catch (requestError) {
      setError(getErrorMessage(requestError, t("errors.saveConfiguration")));
    } finally {
      setSaving(false);
    }
  }

  async function handleDiscard(): Promise<void> {
    if (!accessToken || !officeId || !detail || !draft || !actions.draft) return;
    if (confirmation !== "DISCARD") {
      setConfirmation("DISCARD");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await discardWorkTypeDraft(accessToken, officeId, detail.id, draft.id);
      refresh(t("messages.draftDiscarded"));
    } catch (requestError) {
      setError(getErrorMessage(requestError, t("errors.discardDraft")));
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish(): Promise<void> {
    if (!accessToken || !officeId || !detail || !draft || !actions.publish) return;
    if (confirmation !== "PUBLISH") {
      setConfirmation("PUBLISH");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await publishWorkTypeDraft(accessToken, officeId, detail.id, draft.id);
      refresh(t("messages.draftPublished"));
    } catch (requestError) {
      setError(getErrorMessage(requestError, t("errors.publishDraft")));
    } finally {
      setSaving(false);
    }
  }

  function updateEditor(patch: Partial<DraftEditorState>): void {
    setEditor((current) => current ? { ...current, ...patch } : current);
  }

  function updateFieldCode(index: number, nextCode: string): void {
    if (!editor) return;
    const previousCode = editor.fields[index]?.code;
    updateEditor({
      fields: editor.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, code: nextCode } : field,
      ),
      stages: previousCode
        ? editor.stages.map((stage) =>
            stage.activationFieldCode === previousCode
              ? { ...stage, activationFieldCode: nextCode }
              : stage,
          )
        : editor.stages,
    });
  }

  function removeField(index: number): void {
    if (!editor) return;
    const removedCode = editor.fields[index]?.code;
    updateEditor({
      fields: editor.fields.filter((_, fieldIndex) => fieldIndex !== index),
      stages: removedCode
        ? editor.stages.map((stage) =>
            stage.activationFieldCode === removedCode
              ? {
                  ...stage,
                  activationFieldCode: null,
                  activationExpectedValue: undefined,
                  expectedValueText: "",
                  activationMode: "ALWAYS",
                }
              : stage,
          )
        : editor.stages,
    });
  }

  function updateStageCode(index: number, nextCode: string): void {
    if (!editor) return;
    const previousCode = editor.stages[index]?.code;
    updateEditor({
      stages: editor.stages.map((stage, stageIndex) =>
        stageIndex === index ? { ...stage, code: nextCode } : stage,
      ),
      fields: previousCode
        ? editor.fields.map((field) =>
            field.stageCode === previousCode
              ? { ...field, stageCode: nextCode }
              : field,
          )
        : editor.fields,
      dependencies: previousCode
        ? editor.dependencies.map((dependency) => ({
            ...dependency,
            stageCode:
              dependency.stageCode === previousCode
                ? nextCode
                : dependency.stageCode,
            prerequisiteStageCode:
              dependency.prerequisiteStageCode === previousCode
                ? nextCode
                : dependency.prerequisiteStageCode,
          }))
        : editor.dependencies,
    });
  }

  function removeStage(index: number): void {
    if (!editor) return;
    const removedCode = editor.stages[index]?.code;
    updateEditor({
      stages: editor.stages.filter((_, stageIndex) => stageIndex !== index),
      fields: removedCode
        ? editor.fields.map((field) =>
            field.stageCode === removedCode
              ? { ...field, stageCode: undefined }
              : field,
          )
        : editor.fields,
      dependencies: removedCode
        ? editor.dependencies.filter(
            (dependency) =>
              dependency.stageCode !== removedCode &&
              dependency.prerequisiteStageCode !== removedCode,
          )
        : editor.dependencies,
    });
  }

  function addField(): void {
    if (!editor) return;
    updateEditor({
      fields: [...editor.fields, {
        key: randomKey("field"),
        code: "NEW_FIELD",
        label: t("editor.newField"),
        fieldType: "TEXT",
        isRequired: false,
        sortOrder: editor.fields.length,
        optionsText: "",
        minValue: "",
        maxValue: "",
        maxLength: "",
      }],
    });
  }

  function addStage(): void {
    if (!editor) return;
    updateEditor({
      stages: [...editor.stages, {
        key: randomKey("stage"),
        code: "NEW_STAGE",
        name: t("editor.newStage"),
        description: null,
        sortOrder: editor.stages.length,
        isRequired: true,
        responsibleOrgUnitRule: "PRIMARY_OWNER",
        responsibleOrgUnitId: null,
        assignmentMode: "ORG_UNIT_QUEUE",
        approvalMode: "NONE",
        approvalLeadershipType: null,
        activationMode: "ALWAYS",
        activationFieldCode: null,
        expectedValueText: "",
        slaMinutes: null,
      }],
    });
  }

  function addDependency(): void {
    if (!editor || editor.stages.length < 2) return;
    updateEditor({
      dependencies: [...editor.dependencies, {
        key: randomKey("dependency"),
        stageCode: editor.stages[1]?.code ?? "",
        prerequisiteStageCode: editor.stages[0]?.code ?? "",
      }],
    });
  }

  if (!accessToken) {
    return (
      <main className="management-page p-6">
        <EmptyState title={t("session.title")} description={t("session.description")} />
      </main>
    );
  }

  if (loading) {
    return (
      <main className="management-page grid min-h-[50vh] place-items-center p-6">
        <p className="text-sm font-semibold text-slate-600">{t("states.loading")}</p>
      </main>
    );
  }

  return (
    <main className="management-page overflow-y-auto bg-[linear-gradient(180deg,#f7fbff_0%,#eef5fb_100%)] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 pb-12">
        <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-nt-dark via-nt-deep to-nt-blue p-6 text-white shadow-xl shadow-slate-300/30 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">{t("hero.eyebrow")}</span>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{t("hero.title")}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100 sm:text-base">{t("hero.description")}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
                <span className="block text-xs text-blue-100">{t("summary.total")}</span>
                <strong className="mt-1 block text-2xl">{definitions.length}</strong>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
                <span className="block text-xs text-blue-100">{t("summary.published")}</span>
                <strong className="mt-1 block text-2xl">{definitions.filter((item) => item.currentPublishedVersion).length}</strong>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
                <span className="block text-xs text-blue-100">{t("summary.drafts")}</span>
                <strong className="mt-1 block text-2xl">{definitions.filter((item) => item.currentDraftVersion).length}</strong>
              </div>
            </div>
          </div>
        </header>

        {error ? (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-800">{error}</div>
        ) : null}
        {success ? (
          <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800">{success}</div>
        ) : null}

        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="self-start rounded-3xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-5">
            <div className="grid gap-3">
              <label className="grid gap-1.5 text-sm font-bold text-nt-text">
                <span>{t("filters.office")}</span>
                <select
                  value={officeId}
                  onChange={(event) => {
                    setSelectedDefinitionId("");
                    setDetail(null);
                    setEditor(null);
                    setError("");
                    setSuccess("");
                    setConfirmation(null);
                    setOfficeId(event.target.value);
                  }}
                  className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-nt-blue focus:ring-2 focus:ring-blue-100"
                >
                  {offices.map((office) => (
                    <option key={office.id} value={office.id}>{office.name}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-bold text-nt-text">
                <span>{t("filters.search")}</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("filters.searchPlaceholder")}
                  className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-nt-blue focus:ring-2 focus:ring-blue-100"
                />
              </label>
            </div>

            <div className="mt-4 space-y-2" aria-label={t("list.aria")}>
              {loadingOffice ? (
                <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-600">{t("states.loadingWorkTypes")}</p>
              ) : filteredDefinitions.length === 0 ? (
                <EmptyState title={t("states.noWorkTypes")} description={t("states.noWorkTypesDescription")} />
              ) : filteredDefinitions.map((definition) => {
                const selected = definition.id === selectedDefinitionId;
                const displayName = definition.currentDraftVersion?.name ?? definition.currentPublishedVersion?.name ?? definition.code;
                return (
                  <button
                    key={definition.id}
                    type="button"
                    onClick={() => {
                      setSelectedDefinitionId(definition.id);
                      setDetail(null);
                      setEditor(null);
                      setError("");
                      setSuccess("");
                      setConfirmation(null);
                    }}
                    className={`w-full rounded-2xl border p-4 text-left transition ${selected ? "border-nt-blue bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="block truncate text-sm text-nt-text">{displayName}</strong>
                        <span className="mt-1 block text-xs font-semibold text-slate-500">{definition.code}</span>
                      </div>
                      <StatusBadge status={definition.isActive ? "ACTIVE" : "INACTIVE"} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {definition.currentPublishedVersion ? <StatusBadge status="PUBLISHED" /> : null}
                      {definition.currentDraftVersion ? <StatusBadge status="DRAFT" /> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="min-w-0 space-y-5">
            {!selectedDefinitionId ? (
              <EmptyState title={t("states.selectWorkType")} description={t("states.selectWorkTypeDescription")} />
            ) : loadingDetail || !detail ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">{t("states.loadingDetail")}</div>
            ) : (
              <>
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={detail.isActive ? "ACTIVE" : "INACTIVE"} />
                        {published ? <StatusBadge status="PUBLISHED" /> : null}
                        {draft ? <StatusBadge status="DRAFT" /> : null}
                      </div>
                      <h2 className="mt-3 text-2xl font-black text-nt-text">{draft?.name ?? published?.name ?? detail.code}</h2>
                      <p className="mt-1 text-sm font-semibold text-slate-500">{detail.code}</p>
                      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{draft?.description ?? published?.description ?? t("detail.noDescription")}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                      <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">{t("detail.access")}</span>
                      <strong className="mt-1 block text-nt-text">
                        {actions.publish ? t("access.publish") : actions.draft ? t("access.draft") : t("access.readOnly")}
                      </strong>
                    </div>
                  </div>
                </section>

                {!draft && actions.draft ? (
                  <form onSubmit={handleCreateDraft} className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                      <label className="grid flex-1 gap-1.5 text-sm font-bold text-nt-text">
                        <span>{t("draft.reason")}</span>
                        <textarea
                          value={draftReason}
                          onChange={(event) => setDraftReason(event.target.value)}
                          maxLength={500}
                          rows={2}
                          placeholder={t("draft.reasonPlaceholder")}
                          className="rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-nt-blue focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                      <button disabled={saving} className="min-h-11 rounded-xl bg-nt-blue px-5 text-sm font-black text-white shadow-sm hover:bg-nt-deep disabled:opacity-60">
                        {t("actions.createDraft")}
                      </button>
                    </div>
                  </form>
                ) : null}

                {draft && editor ? (
                  <>
                    <form onSubmit={handleSaveMetadata} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <span className="text-xs font-black uppercase tracking-[0.14em] text-nt-blue">{t("metadata.eyebrow")}</span>
                          <h3 className="mt-1 text-xl font-black text-nt-text">{t("metadata.title", { version: draft.version })}</h3>
                        </div>
                        <button type="submit" disabled={saving || !actions.draft} className="min-h-10 rounded-xl bg-nt-blue px-4 text-sm font-black text-white hover:bg-nt-deep disabled:opacity-50">{t("actions.saveMetadata")}</button>
                      </div>
                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <label className="grid gap-1.5 text-sm font-bold text-nt-text">
                          <span>{t("metadata.name")}</span>
                          <input value={editor.name} onChange={(event) => updateEditor({ name: event.target.value })} maxLength={150} className="min-h-11 rounded-xl border border-slate-300 px-3 outline-none focus:border-nt-blue focus:ring-2 focus:ring-blue-100" />
                        </label>
                        <label className="grid gap-1.5 text-sm font-bold text-nt-text">
                          <span>{t("metadata.changeReason")}</span>
                          <input value={editor.changeReason} onChange={(event) => updateEditor({ changeReason: event.target.value })} maxLength={500} className="min-h-11 rounded-xl border border-slate-300 px-3 outline-none focus:border-nt-blue focus:ring-2 focus:ring-blue-100" />
                        </label>
                        <label className="grid gap-1.5 text-sm font-bold text-nt-text md:col-span-2">
                          <span>{t("metadata.description")}</span>
                          <textarea value={editor.description} onChange={(event) => updateEditor({ description: event.target.value })} maxLength={1000} rows={3} className="rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-nt-blue focus:ring-2 focus:ring-blue-100" />
                        </label>
                      </div>
                    </form>

                    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <span className="text-xs font-black uppercase tracking-[0.14em] text-nt-blue">{t("configuration.eyebrow")}</span>
                          <h3 className="mt-1 text-xl font-black text-nt-text">{t("configuration.title")}</h3>
                          <p className="mt-1 text-sm leading-6 text-slate-600">{t("configuration.description")}</p>
                        </div>
                        <button type="button" onClick={handleSaveConfiguration} disabled={saving || !actions.draft} className="min-h-11 rounded-xl bg-nt-blue px-5 text-sm font-black text-white hover:bg-nt-deep disabled:opacity-50">{t("actions.saveConfiguration")}</button>
                      </div>

                      <div className="mt-6 grid gap-4 lg:grid-cols-2">
                        <label className="grid gap-1.5 text-sm font-bold text-nt-text">
                          <span>{t("configuration.primaryOwner")}</span>
                          <select value={editor.primaryOwnerOrgUnitId} onChange={(event) => updateEditor({ primaryOwnerOrgUnitId: event.target.value })} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 outline-none focus:border-nt-blue focus:ring-2 focus:ring-blue-100">
                            <option value="">{t("common.select")}</option>
                            {activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.code})</option>)}
                          </select>
                        </label>
                        <label className="grid gap-1.5 text-sm font-bold text-nt-text">
                          <span>{t("configuration.creatorScope")}</span>
                          <select value={editor.creatorScope} onChange={(event) => updateEditor({ creatorScope: event.target.value as WorkTypeCreatorScope })} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 outline-none focus:border-nt-blue focus:ring-2 focus:ring-blue-100">
                            {CREATOR_SCOPES.map((scope) => <option key={scope} value={scope}>{t(`labels.${scope}`)}</option>)}
                          </select>
                        </label>
                      </div>

                      <fieldset className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <legend className="px-2 text-sm font-black text-nt-text">{t("configuration.creatorCategories")}</legend>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {CREATOR_CATEGORIES.map((category) => {
                            const checked = editor.creatorCategories.includes(category);
                            return (
                              <label key={category} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${checked ? "border-blue-300 bg-blue-50 text-nt-deep" : "border-slate-200 bg-white text-slate-600"}`}>
                                <input type="checkbox" checked={checked} onChange={() => updateEditor({ creatorCategories: checked ? editor.creatorCategories.filter((item) => item !== category) : [...editor.creatorCategories, category] })} />
                                {t(`labels.${category}`)}
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>

                      {editor.creatorScope === "SPECIFIC_ORG_UNITS" ? (
                        <div className="mt-5 rounded-2xl border border-slate-200 p-4">
                          <h4 className="text-sm font-black text-nt-text">{t("configuration.creatorOrgUnits")}</h4>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {activeUnits.map((unit) => {
                              const checked = editor.creatorOrgUnitIds.includes(unit.id);
                              return (
                                <div key={unit.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                  <label className="flex items-start gap-2 text-sm font-semibold text-nt-text">
                                    <input type="checkbox" className="mt-1" checked={checked} onChange={() => updateEditor({ creatorOrgUnitIds: checked ? editor.creatorOrgUnitIds.filter((id) => id !== unit.id) : [...editor.creatorOrgUnitIds, unit.id] })} />
                                    <span>{unit.name}<small className="block font-medium text-slate-500">{unit.code}</small></span>
                                  </label>
                                  {checked ? (
                                    <label className="mt-2 flex items-center gap-2 pl-6 text-xs font-semibold text-slate-600">
                                      <input type="checkbox" checked={Boolean(editor.creatorOrgUnitDescendants[unit.id])} onChange={(event) => updateEditor({ creatorOrgUnitDescendants: { ...editor.creatorOrgUnitDescendants, [unit.id]: event.target.checked } })} />
                                      {t("configuration.includeDescendants")}
                                    </label>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-5 rounded-2xl border border-slate-200 p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                              <h4 className="text-sm font-black text-nt-text">{t("configuration.creatorAccounts")}</h4>
                              <p className="mt-1 text-xs text-slate-500">{t("configuration.creatorAccountsDescription")}</p>
                            </div>
                            <input value={creatorSearch} onChange={(event) => setCreatorSearch(event.target.value)} placeholder={t("configuration.searchPeople")} className="min-h-10 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-nt-blue focus:ring-2 focus:ring-blue-100" />
                          </div>
                          <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
                            {filteredCreatorAccounts.map((person) => {
                              const checked = editor.creatorAccountIds.includes(person.accountId);
                              return (
                                <label key={person.accountId} className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 ${checked ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
                                  <input type="checkbox" className="mt-1" checked={checked} onChange={() => updateEditor({ creatorAccountIds: checked ? editor.creatorAccountIds.filter((id) => id !== person.accountId) : [...editor.creatorAccountIds, person.accountId] })} />
                                  <span className="text-sm font-semibold text-nt-text">{person.empName}<small className="block font-medium text-slate-500">{person.empId} · {person.username ?? t("common.notAvailable")}</small></span>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <label className="grid gap-1.5 text-sm font-bold text-nt-text">
                          <span>{t("configuration.closureMode")}</span>
                          <select value={editor.finalClosureMode} onChange={(event) => updateEditor({ finalClosureMode: event.target.value as WorkFinalClosureMode })} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3">
                            {CLOSURE_MODES.map((mode) => <option key={mode} value={mode}>{t(`labels.${mode}`)}</option>)}
                          </select>
                        </label>
                        {editor.finalClosureMode === "SPECIFIC_LEADERSHIP" ? (
                          <label className="grid gap-1.5 text-sm font-bold text-nt-text">
                            <span>{t("configuration.closureLeadership")}</span>
                            <select value={editor.finalClosureLeadershipType} onChange={(event) => updateEditor({ finalClosureLeadershipType: event.target.value as WorkLeadershipType })} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3">
                              <option value="">{t("common.select")}</option>
                              {LEADERSHIP_TYPES.map((type) => <option key={type} value={type}>{t(`labels.${type}`)}</option>)}
                            </select>
                          </label>
                        ) : null}
                        <label className="grid gap-1.5 text-sm font-bold text-nt-text">
                          <span>{t("configuration.slaBasis")}</span>
                          <select value={editor.slaBasis} onChange={(event) => updateEditor({ slaBasis: event.target.value as WorkSlaBasis })} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3">
                            {SLA_BASES.map((basis) => <option key={basis} value={basis}>{t(`labels.${basis}`)}</option>)}
                          </select>
                        </label>
                        <label className="grid gap-1.5 text-sm font-bold text-nt-text">
                          <span>{t("configuration.overallSla")}</span>
                          <input type="number" min="1" value={editor.overallSlaMinutes} onChange={(event) => updateEditor({ overallSlaMinutes: event.target.value })} className="min-h-11 rounded-xl border border-slate-300 px-3" placeholder={t("configuration.optionalMinutes")} />
                        </label>
                      </div>
                    </section>

                    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="text-xl font-black text-nt-text">{t("fields.title")}</h3>
                          <p className="mt-1 text-sm text-slate-600">{t("fields.description")}</p>
                        </div>
                        <button type="button" onClick={addField} disabled={!actions.draft} className="min-h-10 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-black text-nt-deep hover:bg-blue-100">{t("actions.addField")}</button>
                      </div>
                      <div className="mt-4 space-y-3">
                        {editor.fields.length === 0 ? <EmptyState title={t("fields.empty")} description={t("fields.emptyDescription")} /> : editor.fields.map((field, index) => (
                          <div key={field.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                              <label className="grid gap-1 text-xs font-bold text-slate-600"><span>{t("fields.code")}</span><input value={field.code} onChange={(event) => updateFieldCode(index, event.target.value)} className="min-h-10 rounded-lg border border-slate-300 px-2.5 text-sm" /></label>
                              <label className="grid gap-1 text-xs font-bold text-slate-600 xl:col-span-2"><span>{t("fields.label")}</span><input value={field.label} onChange={(event) => updateEditor({ fields: editor.fields.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} className="min-h-10 rounded-lg border border-slate-300 px-2.5 text-sm" /></label>
                              <label className="grid gap-1 text-xs font-bold text-slate-600"><span>{t("fields.type")}</span><select value={field.fieldType} onChange={(event) => updateEditor({ fields: editor.fields.map((item, itemIndex) => itemIndex === index ? { ...item, fieldType: event.target.value as WorkFieldType } : item) })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2.5 text-sm">{FIELD_TYPES.map((type) => <option key={type} value={type}>{t(`labels.${type}`)}</option>)}</select></label>
                              <label className="grid gap-1 text-xs font-bold text-slate-600"><span>{t("fields.stage")}</span><select value={field.stageCode ?? ""} onChange={(event) => updateEditor({ fields: editor.fields.map((item, itemIndex) => itemIndex === index ? { ...item, stageCode: event.target.value || undefined } : item) })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2.5 text-sm"><option value="">{t("fields.workLevel")}</option>{editor.stages.map((stage) => <option key={stage.key} value={stage.code}>{stage.name}</option>)}</select></label>
                            </div>
                            <div className="mt-3 flex flex-wrap items-end gap-3">
                              <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={Boolean(field.isRequired)} onChange={(event) => updateEditor({ fields: editor.fields.map((item, itemIndex) => itemIndex === index ? { ...item, isRequired: event.target.checked } : item) })} />{t("fields.required")}</label>
                              {(field.fieldType === "SELECT" || field.fieldType === "MULTI_SELECT") ? <label className="grid min-w-64 flex-1 gap-1 text-xs font-bold text-slate-600"><span>{t("fields.options")}</span><input value={field.optionsText} onChange={(event) => updateEditor({ fields: editor.fields.map((item, itemIndex) => itemIndex === index ? { ...item, optionsText: event.target.value } : item) })} placeholder={t("fields.optionsPlaceholder")} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2.5 text-sm" /></label> : null}
                              {(field.fieldType === "NUMBER" || field.fieldType === "DECIMAL") ? <><label className="grid gap-1 text-xs font-bold text-slate-600"><span>{t("fields.min")}</span><input value={field.minValue} onChange={(event) => updateEditor({ fields: editor.fields.map((item, itemIndex) => itemIndex === index ? { ...item, minValue: event.target.value } : item) })} className="min-h-10 w-28 rounded-lg border border-slate-300 bg-white px-2.5 text-sm" /></label><label className="grid gap-1 text-xs font-bold text-slate-600"><span>{t("fields.max")}</span><input value={field.maxValue} onChange={(event) => updateEditor({ fields: editor.fields.map((item, itemIndex) => itemIndex === index ? { ...item, maxValue: event.target.value } : item) })} className="min-h-10 w-28 rounded-lg border border-slate-300 bg-white px-2.5 text-sm" /></label></> : null}
                              {(field.fieldType === "TEXT" || field.fieldType === "LONG_TEXT" || field.fieldType === "REFERENCE") ? <label className="grid gap-1 text-xs font-bold text-slate-600"><span>{t("fields.maxLength")}</span><input type="number" min="1" value={field.maxLength} onChange={(event) => updateEditor({ fields: editor.fields.map((item, itemIndex) => itemIndex === index ? { ...item, maxLength: event.target.value } : item) })} className="min-h-10 w-28 rounded-lg border border-slate-300 bg-white px-2.5 text-sm" /></label> : null}
                              <button type="button" onClick={() => removeField(index)} className="ml-auto min-h-10 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-bold text-red-700 hover:bg-red-100">{t("actions.remove")}</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                      <div className="flex items-center justify-between gap-4">
                        <div><h3 className="text-xl font-black text-nt-text">{t("stages.title")}</h3><p className="mt-1 text-sm text-slate-600">{t("stages.description")}</p></div>
                        <button type="button" onClick={addStage} disabled={!actions.draft} className="min-h-10 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-black text-nt-deep hover:bg-blue-100">{t("actions.addStage")}</button>
                      </div>
                      <div className="mt-4 space-y-4">
                        {editor.stages.length === 0 ? <EmptyState title={t("stages.empty")} description={t("stages.emptyDescription")} /> : editor.stages.map((stage, index) => (
                          <div key={stage.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              <label className="grid gap-1 text-xs font-bold text-slate-600"><span>{t("stages.code")}</span><input value={stage.code} onChange={(event) => updateStageCode(index, event.target.value)} className="min-h-10 rounded-lg border border-slate-300 px-2.5 text-sm" /></label>
                              <label className="grid gap-1 text-xs font-bold text-slate-600"><span>{t("stages.name")}</span><input value={stage.name} onChange={(event) => updateEditor({ stages: editor.stages.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })} className="min-h-10 rounded-lg border border-slate-300 px-2.5 text-sm" /></label>
                              <label className="grid gap-1 text-xs font-bold text-slate-600"><span>{t("stages.responsibility")}</span><select value={stage.responsibleOrgUnitRule} onChange={(event) => updateEditor({ stages: editor.stages.map((item, itemIndex) => itemIndex === index ? { ...item, responsibleOrgUnitRule: event.target.value as WorkStageResponsibleOrgUnitRule } : item) })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2.5 text-sm">{RESPONSIBILITY_RULES.map((rule) => <option key={rule} value={rule}>{t(`labels.${rule}`)}</option>)}</select></label>
                              <label className="grid gap-1 text-xs font-bold text-slate-600"><span>{t("stages.assignment")}</span><select value={stage.assignmentMode} onChange={(event) => updateEditor({ stages: editor.stages.map((item, itemIndex) => itemIndex === index ? { ...item, assignmentMode: event.target.value as WorkStageAssignmentMode } : item) })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2.5 text-sm">{ASSIGNMENT_MODES.map((mode) => <option key={mode} value={mode}>{t(`labels.${mode}`)}</option>)}</select></label>
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              {stage.responsibleOrgUnitRule === "SPECIFIC_ORG_UNIT" ? <label className="grid gap-1 text-xs font-bold text-slate-600"><span>{t("stages.orgUnit")}</span><select value={stage.responsibleOrgUnitId ?? ""} onChange={(event) => updateEditor({ stages: editor.stages.map((item, itemIndex) => itemIndex === index ? { ...item, responsibleOrgUnitId: event.target.value || null } : item) })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2.5 text-sm"><option value="">{t("common.select")}</option>{activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label> : null}
                              <label className="grid gap-1 text-xs font-bold text-slate-600"><span>{t("stages.approval")}</span><select value={stage.approvalMode ?? "NONE"} onChange={(event) => updateEditor({ stages: editor.stages.map((item, itemIndex) => itemIndex === index ? { ...item, approvalMode: event.target.value as WorkStageApprovalMode } : item) })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2.5 text-sm">{APPROVAL_MODES.map((mode) => <option key={mode} value={mode}>{t(`labels.${mode}`)}</option>)}</select></label>
                              {stage.approvalMode === "SPECIFIC_LEADERSHIP" ? <label className="grid gap-1 text-xs font-bold text-slate-600"><span>{t("stages.approvalLeadership")}</span><select value={stage.approvalLeadershipType ?? ""} onChange={(event) => updateEditor({ stages: editor.stages.map((item, itemIndex) => itemIndex === index ? { ...item, approvalLeadershipType: event.target.value as WorkLeadershipType } : item) })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2.5 text-sm"><option value="">{t("common.select")}</option>{LEADERSHIP_TYPES.map((type) => <option key={type} value={type}>{t(`labels.${type}`)}</option>)}</select></label> : null}
                              <label className="grid gap-1 text-xs font-bold text-slate-600"><span>{t("stages.activation")}</span><select value={stage.activationMode ?? "ALWAYS"} onChange={(event) => updateEditor({ stages: editor.stages.map((item, itemIndex) => itemIndex === index ? { ...item, activationMode: event.target.value as WorkStageActivationMode } : item) })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2.5 text-sm">{ACTIVATION_MODES.map((mode) => <option key={mode} value={mode}>{t(`labels.${mode}`)}</option>)}</select></label>
                              {(stage.activationMode === "FIELD_TRUE" || stage.activationMode === "FIELD_EQUALS") ? <label className="grid gap-1 text-xs font-bold text-slate-600"><span>{t("stages.activationField")}</span><select value={stage.activationFieldCode ?? ""} onChange={(event) => updateEditor({ stages: editor.stages.map((item, itemIndex) => itemIndex === index ? { ...item, activationFieldCode: event.target.value || null } : item) })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2.5 text-sm"><option value="">{t("common.select")}</option>{editor.fields.map((field) => <option key={field.key} value={field.code}>{field.label}</option>)}</select></label> : null}
                              {stage.activationMode === "FIELD_EQUALS" ? <label className="grid gap-1 text-xs font-bold text-slate-600"><span>{t("stages.expectedValue")}</span><input value={stage.expectedValueText} onChange={(event) => updateEditor({ stages: editor.stages.map((item, itemIndex) => itemIndex === index ? { ...item, expectedValueText: event.target.value } : item) })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2.5 text-sm" /></label> : null}
                              <label className="grid gap-1 text-xs font-bold text-slate-600"><span>{t("stages.sla")}</span><input type="number" min="1" value={stage.slaMinutes ?? ""} onChange={(event) => updateEditor({ stages: editor.stages.map((item, itemIndex) => itemIndex === index ? { ...item, slaMinutes: event.target.value ? Number(event.target.value) : null } : item) })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2.5 text-sm" /></label>
                            </div>
                            <label className="mt-3 grid gap-1 text-xs font-bold text-slate-600"><span>{t("stages.descriptionLabel")}</span><textarea value={stage.description ?? ""} onChange={(event) => updateEditor({ stages: editor.stages.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item) })} rows={2} className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm" /></label>
                            <div className="mt-3 flex items-center gap-3"><label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={Boolean(stage.isRequired)} onChange={(event) => updateEditor({ stages: editor.stages.map((item, itemIndex) => itemIndex === index ? { ...item, isRequired: event.target.checked } : item) })} />{t("stages.required")}</label><button type="button" onClick={() => removeStage(index)} className="ml-auto min-h-10 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-bold text-red-700 hover:bg-red-100">{t("actions.remove")}</button></div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                      <div className="flex items-center justify-between gap-4"><div><h3 className="text-xl font-black text-nt-text">{t("dependencies.title")}</h3><p className="mt-1 text-sm text-slate-600">{t("dependencies.description")}</p></div><button type="button" onClick={addDependency} disabled={!actions.draft || editor.stages.length < 2} className="min-h-10 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-black text-nt-deep hover:bg-blue-100 disabled:opacity-50">{t("actions.addDependency")}</button></div>
                      <div className="mt-4 space-y-2">
                        {editor.dependencies.length === 0 ? <p className="rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-600">{t("dependencies.none")}</p> : editor.dependencies.map((dependency, index) => (
                          <div key={dependency.key} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end">
                            <label className="grid gap-1 text-xs font-bold text-slate-600"><span>{t("dependencies.prerequisite")}</span><select value={dependency.prerequisiteStageCode} onChange={(event) => updateEditor({ dependencies: editor.dependencies.map((item, itemIndex) => itemIndex === index ? { ...item, prerequisiteStageCode: event.target.value } : item) })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2.5 text-sm">{editor.stages.map((stage) => <option key={stage.key} value={stage.code}>{stage.name}</option>)}</select></label>
                            <span className="hidden pb-2 text-center text-sm font-black text-slate-400 sm:block">→</span>
                            <label className="grid gap-1 text-xs font-bold text-slate-600"><span>{t("dependencies.nextStage")}</span><select value={dependency.stageCode} onChange={(event) => updateEditor({ dependencies: editor.dependencies.map((item, itemIndex) => itemIndex === index ? { ...item, stageCode: event.target.value } : item) })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2.5 text-sm">{editor.stages.map((stage) => <option key={stage.key} value={stage.code}>{stage.name}</option>)}</select></label>
                            <button type="button" onClick={() => updateEditor({ dependencies: editor.dependencies.filter((_, itemIndex) => itemIndex !== index) })} className="min-h-10 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-bold text-red-700 hover:bg-red-100">{t("actions.remove")}</button>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                      <h3 className="text-xl font-black text-nt-text">{t("release.title")}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{actions.publish ? t("release.publishDescription") : t("release.draftOnlyDescription")}</p>
                      {confirmation ? (
                        <div className={`mt-4 rounded-2xl border p-4 ${confirmation === "PUBLISH" ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}>
                          <strong className="text-sm text-nt-text">{confirmation === "PUBLISH" ? t("release.confirmPublish") : t("release.confirmDiscard")}</strong>
                          <p className="mt-1 text-sm leading-6 text-slate-600">{confirmation === "PUBLISH" ? t("release.confirmPublishDescription") : t("release.confirmDiscardDescription")}</p>
                          <button type="button" onClick={() => setConfirmation(null)} className="mt-3 text-sm font-bold text-nt-blue hover:underline">{t("actions.cancel")}</button>
                        </div>
                      ) : null}
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button type="button" onClick={handleDiscard} disabled={saving || !actions.draft} className="min-h-11 rounded-xl border border-red-200 bg-red-50 px-5 text-sm font-black text-red-700 hover:bg-red-100 disabled:opacity-50">{confirmation === "DISCARD" ? t("actions.confirmDiscard") : t("actions.discardDraft")}</button>
                        {actions.publish ? <button type="button" onClick={handlePublish} disabled={saving} className="min-h-11 rounded-xl bg-nt-green px-5 text-sm font-black text-white shadow-sm hover:brightness-95 disabled:opacity-50">{confirmation === "PUBLISH" ? t("actions.confirmPublish") : t("actions.publishDraft")}</button> : null}
                      </div>
                    </section>
                  </>
                ) : null}

                {!draft && !actions.draft ? (
                  <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5 sm:p-6">
                    <strong className="text-base text-nt-deep">{t("readonly.title")}</strong>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{t("readonly.description")}</p>
                  </section>
                ) : null}

                {published ? (
                  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div><span className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">{t("published.eyebrow")}</span><h3 className="mt-1 text-xl font-black text-nt-text">{published.name} · v{published.version}</h3></div>
                      <StatusBadge status="PUBLISHED" />
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-2xl bg-slate-50 p-4"><span className="text-xs font-bold text-slate-500">{t("published.fields")}</span><strong className="mt-1 block text-2xl text-nt-text">{published.fields.length}</strong></div>
                      <div className="rounded-2xl bg-slate-50 p-4"><span className="text-xs font-bold text-slate-500">{t("published.stages")}</span><strong className="mt-1 block text-2xl text-nt-text">{published.stages.length}</strong></div>
                      <div className="rounded-2xl bg-slate-50 p-4"><span className="text-xs font-bold text-slate-500">{t("published.owner")}</span><strong className="mt-1 block truncate text-sm text-nt-text">{orgUnits.find((unit) => unit.id === published.primaryOwnerOrgUnitId)?.name ?? t("common.notSet")}</strong></div>
                      <div className="rounded-2xl bg-slate-50 p-4"><span className="text-xs font-bold text-slate-500">{t("published.publishedAt")}</span><strong className="mt-1 block text-sm text-nt-text">{formatDate(published.publishedAt, locale, t("common.notAvailable"))}</strong></div>
                    </div>
                  </section>
                ) : null}

                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <h3 className="text-xl font-black text-nt-text">{t("history.title")}</h3>
                  <p className="mt-1 text-sm text-slate-600">{t("history.description")}</p>
                  <div className="mt-4 space-y-2">
                    {detail.versions.map((version) => (
                      <div key={version.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div><div className="flex items-center gap-2"><strong className="text-sm text-nt-text">v{version.version} · {version.name}</strong><StatusBadge status={version.status} /></div><p className="mt-1 text-xs text-slate-500">{version.changeReason || t("history.noReason")}</p></div>
                        <div className="text-xs text-slate-500 sm:text-right"><span className="block">{t("history.created")}: {formatDate(version.createdAt, locale, t("common.notAvailable"))}</span>{version.publishedAt ? <span className="mt-1 block">{t("history.published")}: {formatDate(version.publishedAt, locale, t("common.notAvailable"))}</span> : null}</div>
                      </div>
                    ))}
                    {retired.length === 0 && detail.versions.length <= 1 ? <p className="rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-600">{t("history.noPrevious")}</p> : null}
                  </div>
                </section>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
