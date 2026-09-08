import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { useAuth } from "../context/AuthContext";
import {
  getOrganizationOffices,
  getOrganizationPeople,
  getOrganizationTree,
} from "../services/organization-v3.service";
import {
  createWorkRuntimeV3,
  getWorkRuntimeV3CreateContext,
} from "../services/work-runtime-v3.service";
import type {
  OrganizationPersonSummary,
  OrganizationUnitNode,
} from "../types/organization-v3";
import type {
  WorkRuntimeV3CreateFieldDefinition,
  WorkRuntimeV3CreateWorkType,
} from "../types/work-runtime-v3";

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function flattenOrganizationTree(nodes: OrganizationUnitNode[]): OrganizationUnitNode[] {
  return nodes.flatMap((node) => [node, ...flattenOrganizationTree(node.children)]);
}

function configuredOptions(field: WorkRuntimeV3CreateFieldDefinition): string[] {
  const raw = field.config?.options;
  return Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === "string")
    : [];
}

function toFieldValue(field: WorkRuntimeV3CreateFieldDefinition, raw: string): unknown {
  switch (field.fieldType) {
    case "NUMBER":
    case "DECIMAL":
      return Number(raw);
    case "BOOLEAN":
      return raw === "true";
    case "MULTI_SELECT":
      return raw.split(",").map((value) => value.trim()).filter(Boolean);
    case "DATETIME":
      return new Date(raw).toISOString();
    default:
      return raw;
  }
}

function inputType(field: WorkRuntimeV3CreateFieldDefinition): string {
  if (field.fieldType === "NUMBER" || field.fieldType === "DECIMAL") return "number";
  if (field.fieldType === "DATE") return "date";
  if (field.fieldType === "DATETIME") return "datetime-local";
  return "text";
}

export function WorkRuntimeV3CreatePage() {
  const navigate = useNavigate();
  const { accessToken, account } = useAuth();
  const { t } = useTranslation("workspace");
  const [offices, setOffices] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [officeId, setOfficeId] = useState("");
  const [workTypes, setWorkTypes] = useState<WorkRuntimeV3CreateWorkType[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [organizationUnits, setOrganizationUnits] = useState<OrganizationUnitNode[]>([]);
  const [organizationPeople, setOrganizationPeople] = useState<OrganizationPersonSummary[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [plannedStartAt, setPlannedStartAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [requestId] = useState(() => crypto.randomUUID());
  const [loadingOffices, setLoadingOffices] = useState(Boolean(accessToken));
  const [loadingContext, setLoadingContext] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isSuperAdmin = account?.role === "SUPER_ADMIN";
  const selectedWorkType = useMemo(
    () => workTypes.find((workType) => workType.workTypeVersionId === selectedVersionId) ?? null,
    [selectedVersionId, workTypes],
  );
  const intakeFields = selectedWorkType?.fields ?? [];
  const flatUnits = useMemo(() => flattenOrganizationTree(organizationUnits), [organizationUnits]);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    const loadingTimer = window.setTimeout(() => {
      if (active) setLoadingOffices(true);
    }, 0);
    getOrganizationOffices(accessToken)
      .then((response) => {
        if (!active) return;
        const visible = response.data
          .filter((office) => office.isActive)
          .map((office) => ({ id: office.id, code: office.code, name: office.name }));
        setOffices(visible);
        setOfficeId((current) => visible.some((office) => office.id === current)
          ? current
          : visible[0]?.id ?? "");
      })
      .catch((requestError: unknown) => {
        if (active) setError(getErrorMessage(requestError, t("work.create.loadOfficesError")));
      })
      .finally(() => {
        if (active) setLoadingOffices(false);
      });
    return () => {
      active = false;
      window.clearTimeout(loadingTimer);
    };
  }, [accessToken, t]);

  useEffect(() => {
    if (!accessToken || !officeId || isSuperAdmin) return;
    let active = true;
    const loadingTimer = window.setTimeout(() => {
      if (active) setLoadingContext(true);
    }, 0);
    Promise.all([
      getWorkRuntimeV3CreateContext(accessToken, officeId),
      getOrganizationTree(accessToken, officeId),
      getOrganizationPeople(accessToken, officeId),
    ])
      .then(([createContext, treeResponse, peopleResponse]) => {
        if (!active) return;
        setWorkTypes(createContext.workTypes);
        setOrganizationUnits(treeResponse.tree);
        setOrganizationPeople(peopleResponse.data);
        setSelectedVersionId((current) => createContext.workTypes.some(
          (workType) => workType.workTypeVersionId === current,
        ) ? current : createContext.workTypes[0]?.workTypeVersionId ?? "");
        setFieldValues({});
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setWorkTypes([]);
        setSelectedVersionId("");
        setError(getErrorMessage(requestError, t("work.create.loadContextError")));
      })
      .finally(() => {
        if (active) setLoadingContext(false);
      });
    return () => {
      active = false;
      window.clearTimeout(loadingTimer);
    };
  }, [accessToken, isSuperAdmin, officeId, t]);

  function updateField(code: string, value: string): void {
    setFieldValues((current) => ({ ...current, [code]: value }));
  }

  async function submit(): Promise<void> {
    if (!accessToken || !officeId || !selectedWorkType || isSuperAdmin) return;

    const missing = intakeFields.find((field) => {
      if (!field.isRequired) return false;
      return (fieldValues[field.code] ?? "").trim().length === 0;
    });
    if (missing) {
      setError(t("work.create.requiredField", { field: missing.label }));
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const fields = intakeFields.flatMap((field) => {
        if (field.fieldType === "IMAGE" || field.fieldType === "FILE") return [];
        const raw = fieldValues[field.code] ?? "";
        if (raw.trim() === "") return [];
        return [{ code: field.code, value: toFieldValue(field, raw) }];
      });

      const created = await createWorkRuntimeV3(accessToken, officeId, {
        clientRequestId: requestId,
        workTypeVersionId: selectedWorkType.workTypeVersionId,
        title: title.trim(),
        description: description.trim() || undefined,
        plannedStartAt: plannedStartAt ? new Date(plannedStartAt).toISOString() : undefined,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        fields,
      });

      navigate(`/work/${officeId}/${created.id}`);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, t("work.create.submitError")));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">{t("work.create.eyebrow")}</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">{t("work.create.title")}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {t("work.create.description")}
            </p>
          </div>
          <Link
            to="/work"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t("work.create.back")}
          </Link>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {error}
        </div>
      )}

      {isSuperAdmin ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">{t("work.create.readOnlyTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t("work.create.readOnlyDescription")}
          </p>
        </section>
      ) : loadingOffices ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm" aria-live="polite">
          {t("work.create.loadingOffices")}
        </section>
      ) : offices.length === 0 ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center text-sm font-medium text-amber-900">
          {t("work.create.noOffice")}
        </section>
      ) : (
        <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              {t("work.create.office")}
              <select
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-500"
                value={officeId}
                onChange={(event) => setOfficeId(event.target.value)}
                disabled={loadingOffices || offices.length === 0}
              >
                {offices.map((office) => (
                  <option key={office.id} value={office.id}>{office.name}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              {t("work.create.workType")}
              <select
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-500"
                value={selectedVersionId}
                disabled={loadingContext || workTypes.length === 0}
                onChange={(event) => {
                  setSelectedVersionId(event.target.value);
                  setFieldValues({});
                }}
              >
                {workTypes.map((workType) => (
                  <option key={workType.workTypeVersionId} value={workType.workTypeVersionId}>
                    {workType.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedWorkType ? (
            <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
              <p className="text-sm font-bold text-slate-900">{selectedWorkType.name}</p>
              <p className="mt-1 text-sm text-slate-600">
                {t("work.create.primaryOwner")}: {selectedWorkType.primaryOwnerOrgUnit.name} · {t("work.create.version")} {selectedWorkType.version}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              {loadingContext ? t("work.create.loadingWorkTypes") : t("work.create.noWorkTypes")}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700 md:col-span-2">
              {t("work.create.workTitle")}
              <input
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
                required
              />
            </label>

            <label className="grid gap-1.5 text-sm font-semibold text-slate-700 md:col-span-2">
              {t("work.create.workDescription")}
              <textarea
                className="min-h-28 rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={4000}
              />
            </label>

            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              {t("work.create.plannedStart")}
              <input
                type="datetime-local"
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                value={plannedStartAt}
                onChange={(event) => setPlannedStartAt(event.target.value)}
              />
            </label>

            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              {t("work.create.dueTime")}
              <input
                type="datetime-local"
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </label>
          </div>

          {intakeFields.length > 0 && (
            <div className="space-y-4 border-t border-slate-200 pt-5">
              <div>
                <h2 className="text-lg font-bold text-slate-950">{t("work.create.information")}</h2>
                <p className="mt-1 text-sm text-slate-600">{t("work.create.informationDescription")}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {intakeFields.map((field) => {
                  const value = fieldValues[field.code] ?? "";
                  const options = configuredOptions(field);

                  if (field.fieldType === "IMAGE" || field.fieldType === "FILE") {
                    return (
                      <div key={field.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        <span className="font-semibold">{field.label}</span>: {t("work.create.attachmentLater")}
                      </div>
                    );
                  }

                  if (field.fieldType === "LONG_TEXT") {
                    return (
                      <label key={field.id} className="grid gap-1.5 text-sm font-semibold text-slate-700 md:col-span-2">
                        {field.label}{field.isRequired ? " *" : ""}
                        <textarea
                          className="min-h-24 rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                          value={value}
                          onChange={(event) => updateField(field.code, event.target.value)}
                        />
                      </label>
                    );
                  }

                  if (field.fieldType === "BOOLEAN") {
                    return (
                      <label key={field.id} className="grid gap-1.5 text-sm font-semibold text-slate-700">
                        {field.label}{field.isRequired ? " *" : ""}
                        <select
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                          value={value}
                          onChange={(event) => updateField(field.code, event.target.value)}
                        >
                          <option value="">{t("work.create.select")}</option>
                          <option value="true">{t("work.create.yes")}</option>
                          <option value="false">{t("work.create.no")}</option>
                        </select>
                      </label>
                    );
                  }

                  if (field.fieldType === "SELECT" || field.fieldType === "MULTI_SELECT") {
                    return (
                      <label key={field.id} className="grid gap-1.5 text-sm font-semibold text-slate-700">
                        {field.label}{field.isRequired ? " *" : ""}
                        <select
                          multiple={field.fieldType === "MULTI_SELECT"}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                          value={field.fieldType === "MULTI_SELECT" ? value.split(",").filter(Boolean) : value}
                          onChange={(event) => {
                            const next = field.fieldType === "MULTI_SELECT"
                              ? Array.from(event.currentTarget.selectedOptions).map((option) => option.value).join(",")
                              : event.currentTarget.value;
                            updateField(field.code, next);
                          }}
                        >
                          {field.fieldType === "SELECT" && <option value="">{t("work.create.select")}</option>}
                          {options.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </label>
                    );
                  }

                  if (field.fieldType === "USER") {
                    return (
                      <label key={field.id} className="grid gap-1.5 text-sm font-semibold text-slate-700">
                        {field.label}{field.isRequired ? " *" : ""}
                        <select
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                          value={value}
                          onChange={(event) => updateField(field.code, event.target.value)}
                        >
                          <option value="">{t("work.create.selectUser")}</option>
                          {organizationPeople.flatMap((person) => person.employee.account?.isEnabled
                            ? [<option key={person.employee.account.id} value={person.employee.account.id}>{person.employee.empName} ({person.employee.empId})</option>]
                            : [])}
                        </select>
                      </label>
                    );
                  }

                  if (field.fieldType === "ORG_UNIT") {
                    return (
                      <label key={field.id} className="grid gap-1.5 text-sm font-semibold text-slate-700">
                        {field.label}{field.isRequired ? " *" : ""}
                        <select
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                          value={value}
                          onChange={(event) => updateField(field.code, event.target.value)}
                        >
                          <option value="">{t("work.create.selectOrgUnit")}</option>
                          {flatUnits.filter((unit) => unit.isActive).map((unit) => (
                            <option key={unit.id} value={unit.id}>{unit.name}</option>
                          ))}
                        </select>
                      </label>
                    );
                  }

                  return (
                    <label key={field.id} className="grid gap-1.5 text-sm font-semibold text-slate-700">
                      {field.label}{field.isRequired ? " *" : ""}
                      <input
                        type={inputType(field)}
                        step={field.fieldType === "DECIMAL" ? "any" : undefined}
                        className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                        value={value}
                        onChange={(event) => updateField(field.code, event.target.value)}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-end">
            <Link
              to="/work"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t("work.create.cancel")}
            </Link>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={submitting || !selectedWorkType || title.trim().length < 2}
              onClick={() => { void submit(); }}
            >
              {submitting ? t("work.create.creating") : t("work.create.submit")}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
