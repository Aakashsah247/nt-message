import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";

import { useAuth } from "../context/AuthContext";
import { getOrganizationOffices } from "../services/organization-v3.service";
import {
  createWorkTypeDefinition,
  createWorkTypeDraft,
  discardWorkTypeDraft,
  getWorkType,
  getWorkTypeActions,
  getWorkTypeConfigurationContext,
  listWorkTypes,
  publishWorkTypeDraft,
  permanentlyDeleteWorkTypeDefinition,
  removeWorkTypeDefinition,
  replaceWorkTypeDraftConfiguration,
  restoreWorkTypeDefinition,
  updateWorkTypeDraft,
} from "../services/work-type-v3.service";
import type {
  ReplaceWorkTypeConfigurationInput,
  WorkFieldType,
  WorkTypeActions,
  WorkTypeConfigurationContextResponse,
  WorkTypeDefinitionDetail,
  WorkTypeDefinitionListItem,
  WorkTypeFieldDefinitionInput,
  WorkTypeTemplate,
  WorkTypeVersionDetail,
} from "../types/work-type-v3";

const EMPTY_ACTIONS: WorkTypeActions = { view: false, draft: false, publish: false };
const TEMPLATES: Array<{
  value: WorkTypeTemplate;
  label: string;
  summary: string;
  assignment: string;
  workflow: string;
  rules: string[];
}> = [
  {
    value: "STANDARD",
    label: "Standard",
    summary: "For Routine, Trouble Ticket, Maintenance, Inspection and Emergency Work.",
    assignment: "Main Team + optional Support Members + Responsible Reviewer",
    workflow: "Create → Assign → Acknowledge → Start → Finish → Review → Close",
    rules: [
      "Main execution is Team-owned.",
      "Support Members may come from another organization in the same Office.",
      "Responsible Reviewer is required at Work creation.",
      "Sales coordination is not part of this template.",
    ],
  },
  {
    value: "TEAM_SALES",
    label: "Team + Sales",
    summary: "For New Installation and Update Services.",
    assignment: "Main Team + required Sales Member + optional Support Members + Responsible Reviewer",
    workflow: "Create → Main Team + Sales → Execute → Finish → Review → Close",
    rules: [
      "Main Team keeps primary ownership.",
      "Sales Member is required and may belong to another Division/Department.",
      "Support Members may come from another organization in the same Office.",
      "Responsible Reviewer is required at Work creation.",
    ],
  },
  {
    value: "ADMINISTRATIVE",
    label: "Administrative",
    summary: "For Administrative Work assigned to a Team or Individual.",
    assignment: "Team or Individual + optional Support Members + Responsible Reviewer",
    workflow: "Create → Assign Team/Individual → Execute → Finish → Review → Close",
    rules: [
      "No Sales stage.",
      "Execution may be assigned to a Team or Individual.",
      "Responsible Reviewer is required at Work creation.",
      "Operational customer/network fields are not automatic unless added as Information fields.",
    ],
  },
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

const SYSTEM_WORK_TYPE_CODES = new Set([
  "ROUTINE_WORK",
  "TROUBLE_TICKET",
  "NETWORK_MAINTENANCE",
  "NEW_INSTALLATION",
  "UPDATE_SERVICES",
  "INSPECTION",
  "EMERGENCY_WORK",
  "ADMINISTRATIVE_WORK",
]);

type SetupSection = "details" | "information" | "assignment" | "workflow" | "rules" | "review";
type InformationPhase = "CREATION_ONLY" | "COMPLETION_ONLY" | "CREATION_AND_COMPLETION";
type CompletionMode = "READ_ONLY" | "EDITABLE";

interface EditableField {
  key: string;
  code: string;
  label: string;
  fieldType: WorkFieldType;
  isRequired: boolean;
  options: string[];
  allowOther: boolean;
  otherLabel: string;
  phase: InformationPhase;
  completionMode: CompletionMode;
  reportReference: boolean;
  preservedConfig: Record<string, unknown>;
}

interface EditorState {
  name: string;
  description: string;
  changeReason: string;
  template: WorkTypeTemplate;
  salesDisplayLabel: string;
  primaryOwnerOrgUnitIds: string[];
  registeredAtEnabled: boolean;
  fields: EditableField[];
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
}

function displayTemplateText(value: string, salesDisplayLabel: string): string {
  if (salesDisplayLabel === "Sales") return value;
  return value.replace(/Sales Member/g, salesDisplayLabel).replace(/Sales/g, salesDisplayLabel);
}

function templateForVersion(
  _definitionCode: string,
  version: WorkTypeVersionDetail,
): WorkTypeTemplate {
  return version.template;
}

function fieldPhase(field: WorkTypeVersionDetail["fields"][number]): InformationPhase {
  const config = field.config ?? {};
  if (config.collectionMode === "COMPLETION_ONLY") return "COMPLETION_ONLY";
  if (config.collectionMode === "CREATION_AND_COMPLETION") return "CREATION_AND_COMPLETION";
  return "CREATION_ONLY";
}

function editableField(field: WorkTypeVersionDetail["fields"][number]): EditableField {
  const config = field.config ?? {};
  const preservedConfig = Object.fromEntries(
    Object.entries(config).filter(
      ([key]) => !["collectionMode", "completionMode", "reportReference", "options", "allowOther", "otherLabel"].includes(key),
    ),
  );
  return {
    key: field.id,
    code: field.code,
    label: field.label,
    fieldType: field.fieldType,
    isRequired: field.isRequired,
    options: Array.isArray(config.options) ? config.options.filter((value): value is string => typeof value === "string") : [],
    allowOther: config.allowOther === true,
    otherLabel: typeof config.otherLabel === "string" ? config.otherLabel : "Other",
    phase: fieldPhase(field),
    completionMode: config.completionMode === "EDITABLE" ? "EDITABLE" : "READ_ONLY",
    reportReference: config.reportReference === true,
    preservedConfig,
  };
}

function editorFromDraft(
  definitionCode: string,
  draft: WorkTypeVersionDetail,
): EditorState {
  return {
    name: draft.name,
    description: draft.description ?? "",
    changeReason: draft.changeReason ?? "",
    template: templateForVersion(definitionCode, draft),
    salesDisplayLabel: draft.salesDisplayLabel?.trim() || "Sales",
    primaryOwnerOrgUnitIds: draft.creatorOrgUnits.map((item) => item.orgUnitId),
    registeredAtEnabled: draft.fields.some((field) => field.code === "REGISTERED_AT"),
    fields: draft.fields.filter((field) => field.code !== "REGISTERED_AT").map((field) => editableField(field)),
  };
}

function fieldInput(field: EditableField, index: number): WorkTypeFieldDefinitionInput {
  const options = field.options.map((item) => item.trim()).filter(Boolean);
  const config: Record<string, unknown> = { collectionMode: field.phase };

  const keepNumber = (key: string) => {
    const value = field.preservedConfig[key];
    if (typeof value === "number" && Number.isFinite(value)) config[key] = value;
  };
  if (["TEXT", "LONG_TEXT", "REFERENCE"].includes(field.fieldType)) {
    keepNumber("maxLength");
  } else if (["NUMBER", "DECIMAL"].includes(field.fieldType)) {
    keepNumber("min");
    keepNumber("max");
  } else if (field.fieldType === "MULTI_SELECT") {
    keepNumber("minSelections");
    keepNumber("maxSelections");
    if (typeof config.minSelections === "number" && config.minSelections > options.length) {
      delete config.minSelections;
    }
    if (typeof config.maxSelections === "number" && config.maxSelections > Math.max(options.length + (field.allowOther ? 1 : 0), 1)) {
      config.maxSelections = Math.max(options.length + (field.allowOther ? 1 : 0), 1);
    }
  }

  if (field.phase === "CREATION_AND_COMPLETION") {
    config.completionMode = field.completionMode;
  }
  if (field.reportReference) config.reportReference = true;
  if ((field.fieldType === "SELECT" || field.fieldType === "MULTI_SELECT") && options.length > 0) {
    config.options = options;
    if (field.allowOther) {
      config.allowOther = true;
      config.otherLabel = field.otherLabel.trim() || "Other";
    }
  }
  return {
    code: normalizeCode(field.code),
    label: field.label.trim(),
    fieldType: field.fieldType,
    isRequired: field.fieldType === "IMAGE" || field.fieldType === "FILE" ? false : field.isRequired,
    sortOrder: index,
    config,
  };
}

function configurationPayload(
  draft: WorkTypeVersionDetail,
  editor: EditorState,
  informationOnly = false,
): ReplaceWorkTypeConfigurationInput {
  return {
    template: informationOnly ? draft.template : editor.template,
    salesDisplayLabel: informationOnly
      ? draft.salesDisplayLabel
      : editor.template === "TEAM_SALES"
        ? editor.salesDisplayLabel.trim() || "Sales"
        : null,
    primaryOwnerOrgUnitId: informationOnly
      ? draft.primaryOwnerOrgUnitId
      : draft.primaryOwnerOrgUnitId ?? editor.primaryOwnerOrgUnitIds[0] ?? null,
    creatorCategories: informationOnly
      ? draft.creatorCategories
      : editor.primaryOwnerOrgUnitIds.length > 0
        ? ["OFFICE_HEAD", "ORG_UNIT_HEAD"]
        : ["OFFICE_HEAD"],
    creatorScope: informationOnly
      ? draft.creatorScope
      : editor.primaryOwnerOrgUnitIds.length > 0
        ? "SPECIFIC_ORG_UNITS"
        : "OFFICE_WIDE",
    creatorOrgUnits: informationOnly
      ? draft.creatorOrgUnits.map((item) => ({
          orgUnitId: item.orgUnitId,
          includeDescendants: item.includeDescendants,
        }))
      : editor.primaryOwnerOrgUnitIds.map((orgUnitId) => ({
          orgUnitId,
          includeDescendants: true,
        })),
    creatorAccounts: draft.creatorAccounts.map((item) => ({ accountId: item.accountId })),
    finalClosureMode: informationOnly
      ? draft.finalClosureMode
      : "PRIMARY_OWNER_HEAD",
    finalClosureLeadershipType: informationOnly
      ? draft.finalClosureLeadershipType
      : null,
    slaBasis: draft.slaBasis,
    overallSlaMinutes: draft.overallSlaMinutes,
    fields: [
      ...(editor.registeredAtEnabled
        ? [{
            code: "REGISTERED_AT",
            label: "Registered date and time",
            fieldType: "DATETIME" as WorkFieldType,
            isRequired: true,
            sortOrder: 5,
            config: { collectionMode: "CREATION_ONLY" },
          }]
        : []),
      ...editor.fields.map(fieldInput),
    ],
  };
}

const CONTACT_FIELD_CODES = new Set(["CUSTOMER_CONTACT_TYPE", "CUSTOMER_CONTACT_NUMBER"]);

const QUICK_FIELDS: Array<{ label: string; fields: Array<Pick<EditableField, "code" | "label" | "fieldType" | "isRequired"> & { options?: string[] }> }> = [
  { label: "Customer name", fields: [{ code: "CUSTOMER_NAME", label: "Customer name", fieldType: "TEXT", isRequired: true }] },
  { label: "Contact details", fields: [
    { code: "CUSTOMER_CONTACT_TYPE", label: "Contact type", fieldType: "SELECT", isRequired: true, options: ["MOBILE", "TELEPHONE"] },
    { code: "CUSTOMER_CONTACT_NUMBER", label: "Contact number", fieldType: "TEXT", isRequired: true },
  ] },
  { label: "Location", fields: [{ code: "LOCATION", label: "Location", fieldType: "TEXT", isRequired: true }] },
  { label: "Service number", fields: [{ code: "SERVICE_NUMBER", label: "Service number", fieldType: "REFERENCE", isRequired: true }] },
  { label: "Token number", fields: [{ code: "TOKEN_NUMBER", label: "Token number", fieldType: "REFERENCE", isRequired: true }] },
  { label: "CPC Serial", fields: [{ code: "CPC_SERIAL", label: "CPC Serial", fieldType: "REFERENCE", isRequired: true }] },
  { label: "OLT", fields: [{ code: "OLT", label: "OLT", fieldType: "REFERENCE", isRequired: true }] },
  { label: "FDC", fields: [{ code: "FDC_NAME", label: "FDC name", fieldType: "REFERENCE", isRequired: true }] },
  { label: "FAP", fields: [{ code: "FAP_NAME", label: "FAP name", fieldType: "REFERENCE", isRequired: true }] },
  { label: "Services", fields: [{ code: "SERVICE_TYPES", label: "Services", fieldType: "MULTI_SELECT", isRequired: true, options: ["DATA", "VOICE", "IPTV", "SIP"] }] },
];

function customFieldCode(): string {
  return `CUSTOM_${crypto.randomUUID().replace(/-/g, "").toUpperCase()}`;
}

function newEditableField(input: { code?: string; label: string; fieldType?: WorkFieldType; isRequired?: boolean; options?: string[] }): EditableField {
  return {
    key: crypto.randomUUID(),
    code: input.code ?? customFieldCode(),
    label: input.label,
    fieldType: input.fieldType ?? "TEXT",
    isRequired: input.isRequired ?? false,
    options: input.options ?? [],
    allowOther: false,
    otherLabel: "Other",
    phase: "CREATION_ONLY",
    completionMode: "READ_ONLY",
    reportReference: false,
    preservedConfig: {},
  };
}

function TemplateCard({ template, selected, onSelect, disabled = false }: {
  template: (typeof TEMPLATES)[number];
  selected: boolean;
  onSelect?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`rounded-2xl border p-4 text-left transition ${selected ? "border-nt-blue bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"} ${disabled ? "cursor-default" : ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <strong className="text-sm text-slate-950">{template.label}</strong>
        {selected ? <span className="rounded-full bg-nt-blue px-2 py-0.5 text-[11px] font-bold text-white">Selected</span> : null}
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">{template.summary}</p>
    </button>
  );
}

export function WorkTypeManagementPage() {
  const { accessToken, account } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const routeParams = useParams();
  const wildcardSegments = (routeParams["*"] ?? "").split("/").filter(Boolean);
  const wildcardDefinitionId = wildcardSegments[0];
  const workTypeDefinitionId =
    wildcardDefinitionId && wildcardDefinitionId !== "new" && wildcardDefinitionId !== "removed"
      ? decodeURIComponent(wildcardDefinitionId)
      : undefined;
  const [offices, setOffices] = useState<Array<{ id: string; code: string; name: string; isActive: boolean }>>([]);
  const [officeId, setOfficeId] = useState("");
  const [actions, setActions] = useState<WorkTypeActions>(EMPTY_ACTIONS);
  const [definitions, setDefinitions] = useState<WorkTypeDefinitionListItem[]>([]);
  const [configurationContext, setConfigurationContext] = useState<WorkTypeConfigurationContextResponse | null>(null);
  const [detail, setDetail] = useState<WorkTypeDefinitionDetail | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTemplate, setNewTemplate] = useState<WorkTypeTemplate>("STANDARD");
  const [draftReason, setDraftReason] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const isNewPage = location.pathname.endsWith("/new");
  const isRemovedPage = location.pathname.endsWith("/removed");
  const section: SetupSection = location.pathname.endsWith("/information") || location.pathname.endsWith("/form")
    ? "information"
    : location.pathname.endsWith("/assignment")
      ? "assignment"
      : location.pathname.endsWith("/workflow") || location.pathname.endsWith("/steps")
        ? "workflow"
        : location.pathname.endsWith("/rules")
          ? "rules"
          : location.pathname.endsWith("/review")
            ? "review"
            : "details";

  const selectedDefinition = useMemo(
    () => definitions.find((item) => item.id === workTypeDefinitionId) ?? null,
    [definitions, workTypeDefinitionId],
  );
  const routedDetail = detail?.id === workTypeDefinitionId ? detail : null;
  const draft = routedDetail?.versions.find((version) => version.status === "DRAFT") ?? null;
  const published = routedDetail?.versions.find((version) => version.status === "PUBLISHED") ?? null;
  const template = TEMPLATES.find((item) => item.value === editor?.template) ?? TEMPLATES[0];
  const editorSalesDisplayLabel = editor?.template === "TEAM_SALES"
    ? editor.salesDisplayLabel.trim() || "Sales"
    : "Sales";
  const informationOnlySystemDraft = Boolean(
    routedDetail &&
      actions.draft &&
      !actions.publish &&
      SYSTEM_WORK_TYPE_CODES.has(routedDetail.code),
  );
  const visibleDefinitions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return definitions.filter((definition) => {
      if (definition.isActive === isRemovedPage) return false;
      if (!term) return true;
      const names = [
        definition.currentPublishedVersion?.name,
        definition.currentDraftVersion?.name,
      ]
        .filter(Boolean)
        .join(" ");
      return `${definition.code} ${names}`.toLowerCase().includes(term);
    });
  }, [definitions, isRemovedPage, search]);

  useEffect(() => {
    if (!accessToken || !account?.id) return;
    let active = true;
    getOrganizationOffices(accessToken)
      .then((response) => {
        if (!active) return;
        const next = response.data.map((office) => ({ id: office.id, code: office.code, name: office.name, isActive: office.isActive }));
        const fallbackOfficeId = next.find((office) => office.isActive)?.id ?? next[0]?.id ?? "";
        setOffices(next);
        setOfficeId((current) => next.some((office) => office.id === current) ? current : fallbackOfficeId);
        if (!fallbackOfficeId) setLoading(false);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(getErrorMessage(requestError, "Offices could not be loaded."));
        setLoading(false);
      });
    return () => { active = false; };
  }, [accessToken, account?.id]);

  useEffect(() => {
    if (!accessToken || !officeId) return;
    let active = true;
    Promise.all([getWorkTypeActions(accessToken, officeId), listWorkTypes(accessToken, officeId)])
      .then(([actionResponse, listResponse]) => {
        if (!active) return;
        setActions(actionResponse.availableActions);
        setDefinitions(listResponse.data);
        setError("");
      })
      .catch((requestError) => active && setError(getErrorMessage(requestError, "Work Types could not be loaded.")))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [accessToken, officeId, refreshKey]);

  useEffect(() => {
    if (!accessToken || !officeId) return;
    let active = true;
    getWorkTypeConfigurationContext(accessToken, officeId)
      .then((response) => active && setConfigurationContext(response))
      .catch(() => active && setConfigurationContext(null));
    return () => { active = false; };
  }, [accessToken, officeId, refreshKey]);

  useEffect(() => {
    if (!accessToken || !officeId || !workTypeDefinitionId || isNewPage || isRemovedPage) return;
    let active = true;
    getWorkType(accessToken, officeId, workTypeDefinitionId)
      .then((response) => {
        if (!active) return;
        setDetail(response.workType);
        const currentDraft = response.workType.versions.find((version) => version.status === "DRAFT");
        setEditor(currentDraft ? editorFromDraft(response.workType.code, currentDraft) : null);
        setError("");
      })
      .catch((requestError) => active && setError(getErrorMessage(requestError, "Work Type could not be loaded.")));
    return () => { active = false; };
  }, [accessToken, officeId, workTypeDefinitionId, isNewPage, isRemovedPage, refreshKey]);

  function refresh(message: string) {
    setSuccess(message);
    setError("");
    setLoading(true);
    setRefreshKey((value) => value + 1);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !officeId || !actions.draft || !newName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const result = await createWorkTypeDefinition(accessToken, officeId, {
        template: newTemplate,
        name: newName.trim(),
        description: newDescription.trim() || null,
      });
      if (!result.definition?.id) throw new Error("Work Type was created without an identifier.");
      navigate(`/work-types/${result.definition.id}/information`);
      refresh("Work Type draft created with the selected fixed template.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Work Type could not be created."));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateDraft(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !officeId || !selectedDefinition || !actions.draft) return;
    setSaving(true);
    try {
      await createWorkTypeDraft(accessToken, officeId, selectedDefinition.id, { changeReason: draftReason.trim() || null });
      setDraftReason("");
      refresh("Draft created from the published version.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Draft could not be created."));
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft(): Promise<boolean> {
    if (!accessToken || !officeId || !detail || !draft || !editor) return false;
    const invalid = editor.fields.find((field) => !normalizeCode(field.code) || !field.label.trim());
    if (invalid) {
      setError("Every Information field needs a code and label.");
      return false;
    }
    setSaving(true);
    setError("");
    try {
      await updateWorkTypeDraft(accessToken, officeId, detail.id, draft.id, {
        ...(informationOnlySystemDraft
          ? {}
          : {
              name: editor.name.trim(),
              description: editor.description.trim() || null,
            }),
        changeReason: editor.changeReason.trim() || null,
      });
      await replaceWorkTypeDraftConfiguration(
        accessToken,
        officeId,
        detail.id,
        draft.id,
        configurationPayload(draft, editor, informationOnlySystemDraft),
      );
      refresh("Work Type saved. Assignment, Workflow, Rules and Review routing remain fixed by the template.");
      return true;
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Work Type could not be saved."));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publishDraft() {
    if (!accessToken || !officeId || !detail || !draft || !actions.publish) return;
    setSaving(true);
    setError("");
    try {
      const saved = await saveDraft();
      if (!saved) return;
      await publishWorkTypeDraft(accessToken, officeId, detail.id, draft.id);
      refresh("Work Type published.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Work Type could not be published."));
    } finally {
      setSaving(false);
    }
  }

  function addField() {
    if (!editor) return;
    setEditor({ ...editor, fields: [...editor.fields, newEditableField({ label: "New field" })] });
  }

  function addQuickField(label: string) {
    if (!editor) return;
    const quick = QUICK_FIELDS.find((item) => item.label === label);
    if (!quick) return;
    const existing = new Set(editor.fields.map((field) => field.code));
    const additions = quick.fields
      .filter((field) => !existing.has(field.code))
      .map((field) => newEditableField(field));
    if (additions.length === 0) return;
    setEditor({ ...editor, fields: [...editor.fields, ...additions] });
  }

  if (!accessToken) return <main className="management-page p-6"><p>Please sign in again.</p></main>;
  if (loading) return <main className="management-page grid min-h-[50vh] place-items-center p-6"><p className="text-sm font-semibold text-slate-600">Loading Work Types…</p></main>;

  const notice = error || success;
  if (isNewPage) {
    return (
      <main className="management-page mx-auto w-full max-w-5xl p-4 sm:p-6">
        <Link to="/work-types" className="text-sm font-bold text-nt-blue">← Back to Work Types</Link>
        <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h1 className="text-2xl font-black text-slate-950">Create Work Type</h1>
          <p className="mt-2 text-sm text-slate-600">Choose one fixed template. After creation, only Information fields are configurable.</p>
          {notice ? <p className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{notice}</p> : null}
          <form className="mt-6 space-y-6" onSubmit={handleCreate}>
            <div className="grid gap-3 md:grid-cols-3">
              {TEMPLATES.map((item) => <TemplateCard key={item.value} template={item} selected={newTemplate === item.value} onSelect={() => setNewTemplate(item.value)} />)}
            </div>
            <label className="grid gap-2"><span className="text-sm font-bold text-slate-800">Work Type name *</span><input className="min-h-11 rounded-xl border border-slate-300 px-3" value={newName} onChange={(event) => setNewName(event.target.value)} required /></label>
            <label className="grid gap-2"><span className="text-sm font-bold text-slate-800">Description</span><textarea className="min-h-28 rounded-xl border border-slate-300 p-3" value={newDescription} onChange={(event) => setNewDescription(event.target.value)} /></label>
            <div className="flex justify-end gap-3"><Link to="/work-types" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold">Cancel</Link><button disabled={saving} className="rounded-xl bg-nt-blue px-5 py-2.5 text-sm font-black text-white disabled:opacity-60">{saving ? "Creating…" : "Create Work Type"}</button></div>
          </form>
        </section>
      </main>
    );
  }

  if (!workTypeDefinitionId || isRemovedPage) {
    return (
      <main className="management-page mx-auto w-full max-w-7xl p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.15em] text-nt-blue">Work configuration</p><h1 className="mt-1 text-2xl font-black text-slate-950">Work Types</h1><p className="mt-1 text-sm text-slate-600">Three fixed workflow templates. Customize only the Information collected by each Work Type.</p></div>
          <div className="flex gap-2">{actions.draft && !isRemovedPage ? <Link to="/work-types/new" className="rounded-xl bg-nt-blue px-4 py-2.5 text-sm font-black text-white">New Work Type</Link> : null}<Link to={isRemovedPage ? "/work-types" : "/work-types/removed"} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold">{isRemovedPage ? "Active Work Types" : "Removed"}</Link></div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3"><select className="min-h-11 rounded-xl border border-slate-300 bg-white px-3" value={officeId} onChange={(event) => { setLoading(true); setOfficeId(event.target.value); }}>{offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}</select><input type="search" className="min-h-11 min-w-64 flex-1 rounded-xl border border-slate-300 px-3" placeholder="Search Work Types" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        {notice ? <p className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{notice}</p> : null}
        <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleDefinitions.map((definition) => {
            const publishedVersion = definition.currentPublishedVersion;
            const draftVersion = definition.currentDraftVersion;
            const version = publishedVersion ?? draftVersion;
            const statusLabel = publishedVersion
              ? draftVersion
                ? "Published · Draft pending"
                : "Published"
              : "Draft";
            return <article key={definition.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{definition.code}</p><h2 className="mt-1 text-lg font-black text-slate-950">{version?.name ?? definition.code}</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{statusLabel}</span></div><p className="mt-2 min-h-10 text-sm text-slate-600">{version?.description || "No description."}</p><div className="mt-4 flex gap-2">{definition.isActive ? <Link to={`/work-types/${definition.id}`} className="rounded-xl bg-nt-blue px-4 py-2 text-sm font-bold text-white">Open</Link> : !actions.publish ? <span className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-500">Head-controlled</span> : <button className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold" onClick={() => accessToken && restoreWorkTypeDefinition(accessToken, officeId, definition.id).then(() => refresh("Work Type restored."))}>Restore</button>}</div></article>;
          })}
        </section>
      </main>
    );
  }

  if (!routedDetail) return <main className="management-page grid min-h-[40vh] place-items-center p-6"><p className="text-sm font-semibold text-slate-600">{error || "Loading Work Type…"}</p></main>;
  if (!detail || !selectedDefinition) return <main className="management-page p-6"><p>{error || "Work Type was not found."}</p></main>;

  const tabs: Array<{ key: SetupSection; label: string }> = [
    { key: "details", label: "Details" },
    { key: "information", label: "Information" },
    { key: "assignment", label: "Assignment" },
    { key: "workflow", label: "Workflow" },
    { key: "rules", label: "Rules" },
    { key: "review", label: "Review & Publish" },
  ];
  const pathFor = (key: SetupSection) => key === "details" ? `/work-types/${detail.id}` : `/work-types/${detail.id}/${key}`;

  if (!draft || !editor) {
    return (
      <main className="management-page mx-auto w-full max-w-5xl p-4 sm:p-6">
        <Link to="/work-types" className="text-sm font-bold text-nt-blue">← Back to Work Types</Link>
        <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="text-2xl font-black">{published?.name ?? detail.code}</h1><p className="mt-2 text-sm text-slate-600">The published version is locked. Create a draft to change Information fields.</p>{actions.draft ? <form className="mt-5 flex flex-wrap gap-3" onSubmit={handleCreateDraft}><input className="min-h-11 flex-1 rounded-xl border border-slate-300 px-3" placeholder="Change reason" value={draftReason} onChange={(event) => setDraftReason(event.target.value)} /><button disabled={saving} className="rounded-xl bg-nt-blue px-4 py-2.5 text-sm font-black text-white">Create Draft</button></form> : null}</section>
      </main>
    );
  }

  return (
    <main className="management-page mx-auto w-full max-w-7xl p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><Link to="/work-types" className="text-sm font-bold text-nt-blue">← Back to Work Types</Link><h1 className="mt-2 text-2xl font-black text-slate-950">{editor.name}</h1><p className="mt-1 text-sm text-slate-600">Template: <strong>{template.label}</strong> · Draft V{draft.version}</p></div><div className="flex gap-2"><button disabled={saving} onClick={() => void saveDraft()} className="rounded-xl border border-nt-blue bg-white px-4 py-2.5 text-sm font-black text-nt-blue disabled:opacity-60">Save Draft</button>{actions.publish ? <button disabled={saving} onClick={() => void publishDraft()} className="rounded-xl bg-nt-blue px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">Publish</button> : null}</div></div>
      {notice ? <p className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{notice}</p> : null}
      <nav className="mt-5 flex gap-2 overflow-x-auto border-b border-slate-200 pb-3">{tabs.map((tab) => <Link key={tab.key} to={pathFor(tab.key)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-bold ${section === tab.key ? "bg-nt-blue text-white" : "bg-slate-100 text-slate-700"}`}>{tab.label}</Link>)}</nav>

      {section === "details" ? <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]"><div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Work Type identity</h2><p className="mt-1 text-sm text-slate-600">Name and template are fixed after creation. Edit Primary Owners, Registered Date & Time and Work Details from Information.</p><div className="mt-4 grid gap-4"><label className="grid gap-2"><span className="text-sm font-bold">Name</span><input disabled className="min-h-11 rounded-xl border border-slate-300 bg-slate-100 px-3" value={editor.name} /></label><label className="grid gap-2"><span className="text-sm font-bold">Description</span><textarea disabled className="min-h-28 rounded-xl border border-slate-300 bg-slate-100 p-3" value={editor.description} /></label><label className="grid gap-2"><span className="text-sm font-bold">Change reason</span><input className="min-h-11 rounded-xl border border-slate-300 px-3" value={editor.changeReason} onChange={(event) => setEditor({ ...editor, changeReason: event.target.value })} /></label></div></div><div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Fixed template</h2><p className="mt-1 text-sm text-slate-600">The selected template permanently owns Assignment, Sales, Support and lifecycle behavior for this Work Type.</p><div className="mt-4 grid gap-3">{TEMPLATES.map((item) => <TemplateCard key={item.value} template={item} selected={editor.template === item.value} disabled />)}</div></div></section> : null}

      {section === "information" ? (
        <section className="mt-5 space-y-5">
          {informationOnlySystemDraft ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
              Shared Work Type Management can edit Information fields for this permanent Work Type. Primary owners, fixed behavior, deactivation and publishing remain Head-controlled.
            </div>
          ) : null}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">Primary owners</h2>
            <p className="mt-1 text-sm text-slate-600">Primary owners control who may create this Work Type only. Office Head always has create access. Main assignment, Sales and Support remain independent.</p>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {(configurationContext?.orgUnits ?? []).filter((unit) => unit.orgUnitType.code === "DIVISION" && unit.isActive).map((unit) => (
                <label key={unit.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold">
                  <input
                    type="checkbox"
                    disabled={
                      informationOnlySystemDraft ||
                      (!configurationContext?.officeWideManagement &&
                        !configurationContext?.manageableDivisionOrgUnitIds.includes(unit.id))
                    }
                    checked={editor.primaryOwnerOrgUnitIds.includes(unit.id)}
                    onChange={(event) => setEditor({
                      ...editor,
                      primaryOwnerOrgUnitIds: event.target.checked
                        ? [...editor.primaryOwnerOrgUnitIds, unit.id]
                        : editor.primaryOwnerOrgUnitIds.filter((id) => id !== unit.id),
                    })}
                  />
                  <span>{unit.name}{!configurationContext?.officeWideManagement && !configurationContext?.manageableDivisionOrgUnitIds.includes(unit.id) ? " · Office Head controlled" : ""}</span>
                </label>
              ))}
            </div>
            {editor.primaryOwnerOrgUnitIds.length === 0 ? <p className="mt-3 text-sm font-semibold text-amber-700">No Division selected: only the Office Head may create this Work Type.</p> : null}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">Registered date & time</h2>
            <label className="mt-3 flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={editor.registeredAtEnabled} onChange={(event) => setEditor({ ...editor, registeredAtEnabled: event.target.checked })} />Collect Registered Date & Time for this Work Type</label>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><h2 className="text-lg font-black">Work details</h2><p className="mt-1 text-sm text-slate-600">Labels and input types are editable. Contact Details keeps the existing Mobile/Telephone control and validation.</p></div>
              <button type="button" onClick={addField} className="rounded-xl bg-nt-blue px-4 py-2.5 text-sm font-black text-white">+ Custom field</button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {QUICK_FIELDS.map((quick) => <button key={quick.label} type="button" onClick={() => addQuickField(quick.label)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700">+ {quick.label}</button>)}
            </div>
            <div className="mt-5 space-y-3">
              {editor.fields.map((field, index) => {
                const contactField = CONTACT_FIELD_CODES.has(field.code);
                return (
                  <article key={field.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <label className="grid gap-1"><span className="text-xs font-bold text-slate-600">Label</span><input className="min-h-10 rounded-lg border border-slate-300 px-3" value={field.label} onChange={(event) => setEditor({ ...editor, fields: editor.fields.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /></label>
                      <label className="grid gap-1"><span className="text-xs font-bold text-slate-600">Input type</span><select disabled={contactField} className="min-h-10 rounded-lg border border-slate-300 px-2 disabled:bg-slate-100" value={field.fieldType} onChange={(event) => setEditor({ ...editor, fields: editor.fields.map((item, i) => i === index ? { ...item, fieldType: event.target.value as WorkFieldType, options: [] } : item) })}>{FIELD_TYPES.map((type) => <option key={type}>{type}</option>)}</select>{contactField ? <small className="text-xs text-slate-500">Protected Contact Details control</small> : null}</label>
                      <label className="grid gap-1"><span className="text-xs font-bold text-slate-600">Collect</span><select className="min-h-10 rounded-lg border border-slate-300 px-2" value={field.phase} onChange={(event) => setEditor({ ...editor, fields: editor.fields.map((item, i) => i === index ? { ...item, phase: event.target.value as InformationPhase } : item) })}><option value="CREATION_ONLY">Creation</option><option value="COMPLETION_ONLY">Completion</option><option value="CREATION_AND_COMPLETION">Both</option></select></label>
                      {field.phase === "CREATION_AND_COMPLETION" ? <label className="grid gap-1"><span className="text-xs font-bold text-slate-600">At finish</span><select className="min-h-10 rounded-lg border border-slate-300 px-2" value={field.completionMode} onChange={(event) => setEditor({ ...editor, fields: editor.fields.map((item, i) => i === index ? { ...item, completionMode: event.target.value as CompletionMode } : item) })}><option value="READ_ONLY">Show saved value</option><option value="EDITABLE">Allow update</option></select></label> : null}
                      <div className="grid gap-1"><span className="text-xs font-bold text-slate-600">Report</span><label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold"><input type="checkbox" checked={field.reportReference} onChange={(event) => setEditor({ ...editor, fields: editor.fields.map((item, i) => ({ ...item, reportReference: i === index ? event.target.checked : event.target.checked ? false : item.reportReference })) })} />Report Reference</label></div>
                      <div className="flex items-end gap-2 xl:col-span-4"><label className="flex min-h-10 flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold"><input type="checkbox" checked={field.isRequired} onChange={(event) => setEditor({ ...editor, fields: editor.fields.map((item, i) => i === index ? { ...item, isRequired: event.target.checked } : item) })} />Required</label><button type="button" className="min-h-10 rounded-lg border border-red-200 bg-white px-3 text-sm font-bold text-red-700" onClick={() => setEditor({ ...editor, fields: editor.fields.filter((_, i) => i !== index) })}>Remove</button></div>
                    </div>
                    {(field.fieldType === "SELECT" || field.fieldType === "MULTI_SELECT") && !contactField ? <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]"><textarea className="min-h-24 rounded-lg border border-slate-300 px-3 py-2" value={field.options.join("\n")} onChange={(event) => setEditor({ ...editor, fields: editor.fields.map((item, i) => i === index ? { ...item, options: event.target.value.split("\n") } : item) })} placeholder="One option per line" /><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={field.allowOther} onChange={(event) => setEditor({ ...editor, fields: editor.fields.map((item, i) => i === index ? { ...item, allowOther: event.target.checked } : item) })} />Allow Other</label>{field.allowOther ? <input className="min-h-10 rounded-lg border border-slate-300 px-3" value={field.otherLabel} onChange={(event) => setEditor({ ...editor, fields: editor.fields.map((item, i) => i === index ? { ...item, otherLabel: event.target.value } : item) })} placeholder="Other label" /> : null}</div> : null}
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}


      {section === "assignment" ? (
        <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-nt-blue">Fixed by template</p>
          <h2 className="mt-1 text-xl font-black">Assignment</h2>
          <p className="mt-3 text-base font-bold text-slate-900">{displayTemplateText(template.assignment, editorSalesDisplayLabel)}</p>
          {editor.template === "TEAM_SALES" && !SYSTEM_WORK_TYPE_CODES.has(detail.code) ? (
            <div className="mt-5 max-w-xl rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="grid gap-1.5">
                <span className="text-sm font-black text-slate-800">Display label</span>
                <input
                  className="min-h-11 rounded-xl border border-slate-300 bg-white px-3"
                  type="text"
                  value={editor.salesDisplayLabel}
                  maxLength={80}
                  placeholder="Sales"
                  onChange={(event) =>
                    setEditor({ ...editor, salesDisplayLabel: event.target.value })
                  }
                />
              </label>
              <small className="mt-2 block text-xs leading-5 text-slate-500">
                Only the visible Sales label changes for this Work Type. Assignment, permissions, workflow and lifecycle remain unchanged.
              </small>
            </div>
          ) : null}
          <p className="mt-3 text-sm text-slate-600">
            Assignment modes remain fixed by the selected template. Runtime assignment follows the selected template and V3 OrgUnit/OperationalTeam authority.
          </p>
        </section>
      ) : null}
      {section === "workflow" ? <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-black uppercase tracking-wide text-nt-blue">Fixed by template</p><h2 className="mt-1 text-xl font-black">Workflow</h2><div className="mt-4 rounded-2xl bg-slate-50 p-5 text-center text-sm font-black text-slate-800">{displayTemplateText(template.workflow, editorSalesDisplayLabel)}</div><p className="mt-3 text-sm text-slate-600">Custom stages, stage dependencies, activation rules and approval-mode editors are removed from Work Type configuration.</p></section> : null}
      {section === "rules" ? <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-black uppercase tracking-wide text-nt-blue">Fixed by template</p><h2 className="mt-1 text-xl font-black">Rules</h2><ul className="mt-4 grid gap-3 md:grid-cols-2">{template.rules.map((rule) => <li key={rule} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">{displayTemplateText(rule, editorSalesDisplayLabel)}</li>)}</ul></section> : null}
      {section === "review" ? <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]"><div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-black">Review</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4"><dt className="text-xs font-bold text-slate-500">Work Type</dt><dd className="mt-1 font-black">{editor.name}</dd></div><div className="rounded-2xl bg-slate-50 p-4"><dt className="text-xs font-bold text-slate-500">Template</dt><dd className="mt-1 font-black">{template.label}</dd></div>{editor.template === "TEAM_SALES" && !SYSTEM_WORK_TYPE_CODES.has(detail.code) ? <div className="rounded-2xl bg-slate-50 p-4"><dt className="text-xs font-bold text-slate-500">Sales display label</dt><dd className="mt-1 font-black">{editor.salesDisplayLabel.trim() || "Sales"}</dd></div> : null}<div className="rounded-2xl bg-slate-50 p-4"><dt className="text-xs font-bold text-slate-500">Information fields</dt><dd className="mt-1 font-black">{editor.fields.length}</dd></div><div className="rounded-2xl bg-slate-50 p-4"><dt className="text-xs font-bold text-slate-500">Workflow</dt><dd className="mt-1 text-sm font-bold">{displayTemplateText(template.workflow, editorSalesDisplayLabel)}</dd></div></dl></div><aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="font-black">{actions.publish ? "Publish readiness" : "Draft for Head review"}</h3><p className="mt-2 text-sm text-slate-600">{actions.publish ? "Assignment, Workflow, Rules and final review routing are template-controlled. Information fields and the Team + Sales display label are the only presentation/configuration changes available here." : informationOnlySystemDraft ? "Save the Information-field draft for an authorized Head to review and publish. Fixed behavior, ownership and lifecycle controls remain unchanged." : "Save this draft for an authorized Head to review and publish. Publishing authority is not included in Shared Work Type Management."}</p><button disabled={saving} onClick={() => void saveDraft()} className="mt-5 w-full rounded-xl border border-nt-blue px-4 py-2.5 text-sm font-black text-nt-blue">Save Draft</button>{actions.publish ? <button disabled={saving} onClick={() => void publishDraft()} className="mt-2 w-full rounded-xl bg-nt-blue px-4 py-2.5 text-sm font-black text-white">Publish Work Type</button> : null}<button disabled={saving} onClick={() => accessToken && discardWorkTypeDraft(accessToken, officeId, detail.id, draft.id).then(() => refresh("Draft discarded."))} className="mt-2 w-full rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-700">Discard Draft</button>{selectedDefinition.isActive && actions.publish ? <button disabled={saving} onClick={() => accessToken && removeWorkTypeDefinition(accessToken, officeId, detail.id).then(() => { navigate("/work-types"); refresh("Work Type deactivated. Existing Work history is unchanged."); })} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700">Deactivate Work Type</button> : null}{actions.publish && !SYSTEM_WORK_TYPE_CODES.has(detail.code) ? <button disabled={saving} onClick={() => { if (!accessToken || !window.confirm("Permanently delete this custom Work Type from future use? Historical Work and old records will remain preserved.")) return; void permanentlyDeleteWorkTypeDefinition(accessToken, officeId, detail.id).then(() => { navigate("/work-types"); refresh("Custom Work Type permanently removed from future use. Historical records are preserved."); }).catch((requestError) => setError(getErrorMessage(requestError, "Custom Work Type could not be permanently deleted."))); }} className="mt-2 w-full rounded-xl border border-red-300 px-4 py-2.5 text-sm font-bold text-red-700">Permanently Delete Custom Work Type</button> : null}</aside></section> : null}
    </main>
  );
}
