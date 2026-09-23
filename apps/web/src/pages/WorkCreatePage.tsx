import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { DualCalendarDateTimeInput } from "../components/work-management/DualCalendarDateTimeInput";
import { Link, useNavigate } from "react-router";

import { useAuth } from "../context/AuthContext";
import {
  getOrganizationOffices,
  getOrganizationPeople,
  getOrganizationTree,
} from "../services/organization-v3.service";
import {
  createWork,
  getWorkCreateContext,
} from "../services/work-management.service";
import type {
  OrganizationPersonSummary,
  OrganizationUnitNode,
} from "../types/organization-v3";
import { formatWorkDateTime, readWorkCalendarMode, writeWorkCalendarMode } from "../utils/work-calendar";
import type { WorkCalendarMode } from "../utils/nepal-calendar";
import type {
  WorkCreateFieldDefinition,
  WorkCreateWorkType,
  WorkReviewerCandidate,
  WorkSupportMemberCandidate,
} from "../types/work-management";

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function flattenOrganizationTree(
  nodes: OrganizationUnitNode[],
): OrganizationUnitNode[] {
  return nodes.flatMap((node) => [
    node,
    ...flattenOrganizationTree(node.children),
  ]);
}

function organizationUnitPathOptions(
  nodes: OrganizationUnitNode[],
  parentNames: string[] = [],
): Array<{ unit: OrganizationUnitNode; label: string }> {
  return nodes.flatMap((node) => {
    const path = [...parentNames, node.name];
    return [
      {
        unit: node,
        label: `${path.join(" / ")} · ${node.orgUnitType.name}`,
      },
      ...organizationUnitPathOptions(node.children, path),
    ];
  });
}

function organizationUnitScopeIds(
  units: OrganizationUnitNode[],
  rootOrgUnitId: string,
): Set<string> {
  if (!rootOrgUnitId) return new Set();
  const ids = new Set([rootOrgUnitId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const unit of units) {
      if (
        unit.parentOrgUnitId &&
        ids.has(unit.parentOrgUnitId) &&
        !ids.has(unit.id)
      ) {
        ids.add(unit.id);
        changed = true;
      }
    }
  }
  return ids;
}

function configuredOptions(field: WorkCreateFieldDefinition): string[] {
  const raw = field.config?.options;
  return Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === "string")
    : [];
}

function choiceSettings(field: WorkCreateFieldDefinition): { allowOther: boolean; otherLabel: string } {
  return {
    allowOther: field.config?.allowOther === true,
    otherLabel: typeof field.config?.otherLabel === "string" && field.config.otherLabel.trim()
      ? field.config.otherLabel.trim()
      : "Other",
  };
}

function toFieldValue(
  field: WorkCreateFieldDefinition,
  raw: string,
): unknown {
  switch (field.fieldType) {
    case "NUMBER":
    case "DECIMAL":
      return Number(raw);
    case "BOOLEAN":
      return raw === "true";
    case "MULTI_SELECT":
      return raw
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value && value !== "__OTHER__");
    case "DATETIME":
      return new Date(raw).toISOString();
    default:
      return raw === "__OTHER__" ? "" : raw;
  }
}

function inputType(field: WorkCreateFieldDefinition): string {
  if (field.fieldType === "NUMBER" || field.fieldType === "DECIMAL") {
    return "number";
  }
  if (field.fieldType === "DATE") return "date";
  if (field.fieldType === "DATETIME") return "datetime-local";
  return "text";
}

function createDefaultSchedule(): { plannedStartAt: string; dueAt: string } {
  const plannedStart = new Date();
  return {
    plannedStartAt: plannedStart.toISOString(),
    dueAt: new Date(plannedStart.getTime() + 4 * 60 * 60 * 1000).toISOString(),
  };
}

function deriveWorkTitle(
  workType: WorkCreateWorkType,
  fieldValues: Record<string, string>,
): string {
  const taskTitle = fieldValues.TASK_TITLE?.trim();
  if (taskTitle) return taskTitle.slice(0, 160);

  const identity =
    fieldValues.CUSTOMER_NAME?.trim() ||
    fieldValues.TOKEN_NUMBER?.trim() ||
    fieldValues.SERVICE_NUMBER?.trim() ||
    fieldValues.LOCATION?.trim();

  return (identity ? `${workType.name} - ${identity}` : workType.name).slice(
    0,
    160,
  );
}

function deriveDescription(fieldValues: Record<string, string>): string {
  return fieldValues.TASK_DESCRIPTION?.trim() ?? "";
}


function reviewerLabel(candidate: WorkReviewerCandidate): string {
  const acting = candidate.isActing ? "Acting " : "";
  return `${candidate.employeeName} · ${acting}${candidate.scopeName}`;
}

export function WorkCreatePage() {
  const navigate = useNavigate();
  const { t } = useTranslation("workspace");
  const { accessToken, account } = useAuth();
  const [offices, setOffices] = useState<
    Array<{ id: string; code: string; name: string }>
  >([]);
  const [officeId, setOfficeId] = useState("");
  const [workTypes, setWorkTypes] = useState<WorkCreateWorkType[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [organizationUnits, setOrganizationUnits] = useState<
    OrganizationUnitNode[]
  >([]);
  const [organizationPeople, setOrganizationPeople] = useState<
    OrganizationPersonSummary[]
  >([]);
  const [supportMemberCandidates, setSupportMemberCandidates] = useState<
    WorkSupportMemberCandidate[]
  >([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mainTeamId, setMainTeamId] = useState("");
  const [mainAssigneeAccountId, setMainAssigneeAccountId] = useState("");
  const [reviewerAccountId, setReviewerAccountId] = useState("");
  const [salesOrgUnitId, setSalesOrgUnitId] = useState("");
  const [salesMemberAccountId, setSalesMemberAccountId] = useState("");
  const [salesMemberSearch, setSalesMemberSearch] = useState("");
  const [supportOrgUnitId, setSupportOrgUnitId] = useState("");
  const [supportMemberAccountId, setSupportMemberAccountId] = useState("");
  const [supportMemberAccountIds, setSupportMemberAccountIds] = useState<string[]>([]);
  const [supportMemberSearch, setSupportMemberSearch] = useState("");
  const [initialSchedule] = useState(createDefaultSchedule);
  const [registeredAt, setRegisteredAt] = useState("");
  const [plannedStartAt, setPlannedStartAt] = useState(initialSchedule.plannedStartAt);
  const [dueAt, setDueAt] = useState(initialSchedule.dueAt);
  const [calendarMode, setCalendarMode] = useState<WorkCalendarMode>(() => readWorkCalendarMode());
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [requestId] = useState(() => crypto.randomUUID());
  const [loadingOffices, setLoadingOffices] = useState(Boolean(accessToken));
  const [loadingContext, setLoadingContext] = useState(false);
  const [contextLoaded, setContextLoaded] = useState(false);
  const [supportDataWarning, setSupportDataWarning] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createdWorkId, setCreatedWorkId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const isSuperAdmin = account?.accountClass === "SUPER_ADMIN";
  const selectedWorkType = useMemo(
    () =>
      workTypes.find(
        (workType) => workType.workTypeVersionId === selectedVersionId,
      ) ?? null,
    [selectedVersionId, workTypes],
  );
  const intakeFields = useMemo(
    () => selectedWorkType?.fields ?? [],
    [selectedWorkType],
  );
  const isAdministrativeWork = selectedWorkType?.code === "ADMINISTRATIVE_WORK";
  const salesDisplayLabel = selectedWorkType?.salesDisplayLabel?.trim() || "Sales";
  const selectedServiceTypes = useMemo(
    () =>
      (fieldValues.SERVICE_TYPES ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    [fieldValues.SERVICE_TYPES],
  );
  const visibleIntakeFields = useMemo(
    () =>
      intakeFields.filter(
        (field) =>
          field.code !== "OTHER_SERVICE_TEXT" ||
          selectedServiceTypes.includes("OTHER"),
      ),
    [intakeFields, selectedServiceTypes],
  );
  const flatUnits = useMemo(
    () => flattenOrganizationTree(organizationUnits),
    [organizationUnits],
  );
  const activeUnitOptions = useMemo(
    () =>
      organizationUnitPathOptions(organizationUnits).filter(
        ({ unit }) => unit.isActive,
      ),
    [organizationUnits],
  );
  const selectedTeam = useMemo(
    () =>
      selectedWorkType?.mainTeams.find((team) => team.id === mainTeamId) ?? null,
    [mainTeamId, selectedWorkType],
  );
  const selectedAssignee = useMemo(
    () => selectedWorkType?.mainAssigneeCandidates.find((person) => person.accountId === mainAssigneeAccountId) ?? null,
    [mainAssigneeAccountId, selectedWorkType],
  );
  const reviewerCandidates = useMemo(
    () =>
      selectedTeam?.reviewerCandidates ??
      selectedAssignee?.reviewerCandidates ??
      selectedWorkType?.reviewerCandidates ??
      [],
    [selectedAssignee, selectedTeam, selectedWorkType],
  );
  const primaryExecutionOrgUnit =
    selectedTeam?.orgUnit ??
    selectedAssignee?.orgUnit ??
    selectedWorkType?.primaryOwnerOrgUnit ??
    null;
  const mainExecutorAccountIds = useMemo(
    () =>
      new Set([
        ...(selectedTeam?.memberAccountIds ?? []),
        ...(selectedAssignee ? [selectedAssignee.accountId] : []),
      ]),
    [selectedAssignee, selectedTeam],
  );
  const salesScopeOrgUnitIds = useMemo(
    () => organizationUnitScopeIds(flatUnits, salesOrgUnitId),
    [flatUnits, salesOrgUnitId],
  );
  const supportScopeOrgUnitIds = useMemo(
    () => organizationUnitScopeIds(flatUnits, supportOrgUnitId),
    [flatUnits, supportOrgUnitId],
  );
  const eligibleSalesMembers = useMemo(() => {
    const query = salesMemberSearch.trim().toLowerCase();
    return supportMemberCandidates.filter((person) => {
      if (!person.orgUnit || !salesScopeOrgUnitIds.has(person.orgUnit.id)) return false;
      if (person.accountId === reviewerAccountId) return false;
      if (mainExecutorAccountIds.has(person.accountId)) return false;
      if (supportMemberAccountIds.includes(person.accountId)) return false;
      if (query && person.accountId !== salesMemberAccountId) {
        const haystack = `${person.employeeName} ${person.employeeCode} ${person.orgUnit.name}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [
    mainExecutorAccountIds,
    reviewerAccountId,
    salesMemberAccountId,
    salesMemberSearch,
    salesScopeOrgUnitIds,
    supportMemberAccountIds,
    supportMemberCandidates,
  ]);
  const selectedSalesMember = useMemo(
    () =>
      supportMemberCandidates.find(
        (person) => person.accountId === salesMemberAccountId,
      ) ?? null,
    [salesMemberAccountId, supportMemberCandidates],
  );
  const eligibleSupportMembers = useMemo(
    () => {
      const query = supportMemberSearch.trim().toLowerCase();
      return supportMemberCandidates.filter((person) => {
        if (!person.orgUnit || !supportScopeOrgUnitIds.has(person.orgUnit.id)) return false;
        if (person.accountId === reviewerAccountId) return false;
        if (person.accountId === salesMemberAccountId) return false;
        if (mainExecutorAccountIds.has(person.accountId)) return false;
        if (supportMemberAccountIds.includes(person.accountId)) return false;
        if (query) {
          const haystack = `${person.employeeName} ${person.employeeCode} ${person.orgUnit.name}`.toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return true;
      });
    },
    [
      mainExecutorAccountIds,
      reviewerAccountId,
      salesMemberAccountId,
      supportMemberAccountIds,
      supportMemberCandidates,
      supportMemberSearch,
      supportScopeOrgUnitIds,
    ],
  );

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    getOrganizationOffices(accessToken)
      .then((response) => {
        if (!active) return;
        const visible = response.data
          .filter((office) => office.isActive)
          .map((office) => ({
            id: office.id,
            code: office.code,
            name: office.name,
          }));
        setOffices(visible);
        setOfficeId((current) =>
          visible.some((office) => office.id === current)
            ? current
            : (visible[0]?.id ?? ""),
        );
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            getErrorMessage(requestError, "Office list could not be loaded."),
          );
        }
      })
      .finally(() => {
        if (active) setLoadingOffices(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !officeId || isSuperAdmin) return;
    let active = true;

    queueMicrotask(() => {
      if (!active) return;
      setLoadingContext(true);
      setContextLoaded(false);
      setSupportDataWarning("");
      setError("");
      setWorkTypes([]);
      setSelectedVersionId("");

      Promise.allSettled([
        getWorkCreateContext(accessToken, officeId),
        getOrganizationTree(accessToken, officeId),
        getOrganizationPeople(accessToken, officeId),
      ])
        .then(([contextResult, treeResult, peopleResult]) => {
        if (!active) return;

        if (contextResult.status === "fulfilled") {
          const createContext = contextResult.value;
          setWorkTypes(createContext.workTypes);
          setSupportMemberCandidates(createContext.supportMemberCandidates ?? []);
          setSelectedVersionId(
            createContext.workTypes[0]?.workTypeVersionId ?? "",
          );
          setContextLoaded(true);
        } else {
          setSupportMemberCandidates([]);
          setError(
            getErrorMessage(
              contextResult.reason,
              "Work Types could not be loaded for this Office.",
            ),
          );
        }

        const supportFailures: string[] = [];
        if (treeResult.status === "fulfilled") {
          setOrganizationUnits(treeResult.value.tree);
        } else {
          setOrganizationUnits([]);
          supportFailures.push("organization units");
        }

        if (peopleResult.status === "fulfilled") {
          setOrganizationPeople(peopleResult.value.data);
        } else {
          setOrganizationPeople([]);
          supportFailures.push("organization people");
        }

        if (supportFailures.length > 0) {
          setSupportDataWarning(
            `Work Types loaded, but ${supportFailures.join(" and ")} could not be loaded. Some organization or employee choices may be unavailable until you refresh.`,
          );
        }
      })
        .finally(() => {
          if (active) setLoadingContext(false);
        });
    });

    return () => {
      active = false;
    };
  }, [accessToken, isSuperAdmin, officeId]);

  function chooseWorkType(workTypeVersionId: string): void {
    setSelectedVersionId(workTypeVersionId);
    setStep(1);
    setFieldValues({});
    setMainTeamId("");
    setMainAssigneeAccountId("");
    setReviewerAccountId("");
    setSalesOrgUnitId("");
    setSalesMemberAccountId("");
    setSalesMemberSearch("");
    setSupportOrgUnitId("");
    setSupportMemberAccountId("");
    setSupportMemberAccountIds([]);
    setSupportMemberSearch("");
    const schedule = createDefaultSchedule();
    setRegisteredAt("");
    setPlannedStartAt(schedule.plannedStartAt);
    setDueAt(schedule.dueAt);
    setError("");
  }

  function updateField(code: string, value: string): void {
    setFieldValues((current) => {
      const next = { ...current, [code]: value };
      if (
        code === "SERVICE_TYPES" &&
        !value
          .split(",")
          .map((item) => item.trim())
          .includes("OTHER")
      ) {
        next.OTHER_SERVICE_TEXT = "";
      }
      return next;
    });
  }

  function validateDetails(): boolean {
    if (!selectedWorkType) {
      setError("Choose a Work Type first.");
      return false;
    }
    const missing = visibleIntakeFields.find(
      (field) =>
        field.isRequired && (fieldValues[field.code] ?? "").trim().length === 0,
    );
    if (missing) {
      setError(`${missing.label} is required.`);
      return false;
    }
    const incompleteOther = visibleIntakeFields.find((field) => {
      if (field.fieldType !== "SELECT" && field.fieldType !== "MULTI_SELECT") {
        return false;
      }
      const { allowOther } = choiceSettings(field);
      if (!allowOther) return false;
      return (fieldValues[field.code] ?? "")
        .split(",")
        .map((value) => value.trim())
        .includes("__OTHER__");
    });
    if (incompleteOther) {
      setError(`Enter the ${choiceSettings(incompleteOther).otherLabel.toLowerCase()} value for ${incompleteOther.label}.`);
      return false;
    }
    if (
      selectedServiceTypes.includes("OTHER") &&
      intakeFields.some((field) => field.code === "OTHER_SERVICE_TEXT") &&
      !(fieldValues.OTHER_SERVICE_TEXT ?? "").trim()
    ) {
      setError("Specify the other service.");
      return false;
    }
    setError("");
    return true;
  }

  function validateAssignment(nowMs: number): boolean {
    if (!selectedWorkType) return false;
    if (selectedWorkType.executionAssignmentMode === "TEAM") {
      if (selectedWorkType.mainTeams.length === 0) {
        setError(
          "No eligible Main Team with an active Responsible Reviewer is available under this Work Type owner.",
        );
        return false;
      }
      if (!selectedTeam) {
        setError("Choose the Main Team that will perform this Work.");
        return false;
      }
    }
    if (selectedWorkType.executionAssignmentMode === "TEAM_OR_USER") {
      if (selectedWorkType.mainTeams.length === 0 && selectedWorkType.mainAssigneeCandidates.length === 0) {
        setError("No eligible Team or individual assignee is available for this Work Type.");
        return false;
      }
      if ((selectedTeam ? 1 : 0) + (selectedAssignee ? 1 : 0) !== 1) {
        setError("Choose either one Main Team or one individual assignee.");
        return false;
      }
    }
    if (!reviewerAccountId) {
      setError("Choose one Responsible Reviewer.");
      return false;
    }
    if (selectedWorkType.requiresSalesParticipant && !salesOrgUnitId) {
      setError(`Choose the ${salesDisplayLabel} organization for this Work.`);
      return false;
    }
    if (selectedWorkType.requiresSalesParticipant && !salesMemberAccountId) {
      setError(`Choose the ${salesDisplayLabel} responsible for this Work.`);
      return false;
    }
    const registeredTime = registeredAt ? new Date(registeredAt).getTime() : Number.NaN;
    const plannedStartTime = plannedStartAt ? new Date(plannedStartAt).getTime() : Number.NaN;
    const dueTime = dueAt ? new Date(dueAt).getTime() : Number.NaN;

    if (!isAdministrativeWork && (!registeredAt || Number.isNaN(registeredTime))) {
      setError("Select the customer registration date and time.");
      return false;
    }
    if (!plannedStartAt || Number.isNaN(plannedStartTime)) {
      setError("Select a valid planned start date and time.");
      return false;
    }
    if (!dueAt || Number.isNaN(dueTime)) {
      setError("Select a valid due date and time.");
      return false;
    }
    if (!isAdministrativeWork && registeredTime > nowMs) {
      setError("Registered date and time cannot be in the future.");
      return false;
    }
    if (!isAdministrativeWork && plannedStartTime < registeredTime) {
      setError("Planned start cannot be earlier than the registered date and time.");
      return false;
    }
    if (dueTime <= nowMs) {
      setError("Due date and time must be in the future.");
      return false;
    }
    if (dueTime <= plannedStartTime) {
      setError("Due date and time must be later than the planned start.");
      return false;
    }
    setError("");
    return true;
  }

  function goToAssignment(): void {
    if (!validateDetails()) return;
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goToReview(): void {
    if (!validateAssignment(Date.now())) return;
    setStep(3);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addSupportMember(): void {
    if (!supportMemberAccountId) return;
    setSupportMemberAccountIds((current) =>
      current.includes(supportMemberAccountId)
        ? current
        : [...current, supportMemberAccountId],
    );
    setSupportMemberAccountId("");
  }

  async function submit(): Promise<void> {
    if (!accessToken || !officeId || !selectedWorkType || isSuperAdmin) return;
    if (createdWorkId || !validateDetails() || !validateAssignment(Date.now())) return;

    setSubmitting(true);
    setError("");
    try {
      const fields = visibleIntakeFields.flatMap((field) => {
        if (field.fieldType === "IMAGE" || field.fieldType === "FILE") {
          return [];
        }
        const raw = fieldValues[field.code] ?? "";
        if (raw.trim() === "") return [];
        return [{ code: field.code, value: toFieldValue(field, raw) }];
      });

      if (!primaryExecutionOrgUnit) {
        setError("Choose a valid Main organization before creating this Work.");
        return;
      }

      const created = await createWork(accessToken, officeId, {
        clientRequestId: requestId,
        workTypeVersionId: selectedWorkType.workTypeVersionId,
        primaryExecutionOrgUnitId: primaryExecutionOrgUnit.id,
        mainOperationalTeamId: selectedTeam?.id,
        mainAssigneeAccountId: selectedAssignee?.accountId,
        responsibleReviewerAccountId: reviewerAccountId,
        salesOrgUnitId: selectedWorkType.requiresSalesParticipant ? salesOrgUnitId : undefined,
        salesMemberAccountId: selectedWorkType.requiresSalesParticipant ? salesMemberAccountId : undefined,
        supportMemberAccountIds,
        title: deriveWorkTitle(selectedWorkType, fieldValues),
        description: deriveDescription(fieldValues) || undefined,
        registeredAt: isAdministrativeWork ? undefined : registeredAt,
        plannedStartAt,
        dueAt,
        fields,
      });
      setCreatedWorkId(created.workItem.id);

      navigate(`/work/${officeId}/${created.workItem.id}`);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Work could not be created."));
    } finally {
      setSubmitting(false);
    }
  }

  function renderField(field: WorkCreateFieldDefinition) {
    const value = fieldValues[field.code] ?? "";
    const options = configuredOptions(field);
    const label = `${field.label}${field.isRequired ? " *" : ""}`;

    if (field.fieldType === "IMAGE" || field.fieldType === "FILE") {
      return (
        <div key={field.id} className="work-create-field-note">
          <strong>{field.label}</strong>
          <span>Files can be added while the Work is being completed.</span>
        </div>
      );
    }

    if (field.fieldType === "LONG_TEXT") {
      return (
        <label key={field.id} className="work-create-field work-create-field--wide">
          <span>{label}</span>
          <textarea
            value={value}
            onChange={(event) => updateField(field.code, event.target.value)}
            rows={4}
          />
        </label>
      );
    }

    if (field.fieldType === "BOOLEAN") {
      return (
        <label key={field.id} className="work-create-field">
          <span>{label}</span>
          <select
            value={value}
            onChange={(event) => updateField(field.code, event.target.value)}
          >
            <option value="">Choose</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
      );
    }

    if (field.fieldType === "MULTI_SELECT") {
      const currentValues = value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const { allowOther, otherLabel } = choiceSettings(field);
      const configuredValues = currentValues.filter((item) => options.includes(item));
      const customValue =
        currentValues.find((item) => item !== "__OTHER__" && !options.includes(item)) ?? "";
      const otherSelected =
        allowOther && (currentValues.includes("__OTHER__") || Boolean(customValue));
      const configuredMax = field.config?.maxSelections;
      const maxSelections =
        typeof configuredMax === "number" &&
        Number.isInteger(configuredMax) &&
        configuredMax > 0
          ? configuredMax
          : null;
      const selectionCount = configuredValues.length + (otherSelected ? 1 : 0);
      const maximumReached =
        maxSelections !== null && selectionCount >= maxSelections;

      return (
        <fieldset key={field.id} className="work-create-field work-create-multi-select">
          <legend>{label}</legend>
          <div className="work-create-multi-select__options">
            {options.map((option) => {
              const checked = configuredValues.includes(option);
              return (
                <label
                  key={option}
                  className={`work-create-multi-select__option${checked ? " is-selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && maximumReached}
                    onChange={(event) => {
                      const nextConfiguredValues = event.currentTarget.checked
                        ? [...configuredValues, option]
                        : configuredValues.filter((item) => item !== option);
                      updateField(
                        field.code,
                        [
                          ...new Set(nextConfiguredValues),
                          ...(otherSelected ? [customValue || "__OTHER__"] : []),
                        ].join(","),
                      );
                    }}
                  />
                  <span>{option.replaceAll("_", " ")}</span>
                </label>
              );
            })}
            {allowOther ? (
              <label
                className={`work-create-multi-select__option${otherSelected ? " is-selected" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={otherSelected}
                  disabled={!otherSelected && maximumReached}
                  onChange={(event) =>
                    updateField(
                      field.code,
                      [
                        ...configuredValues,
                        ...(event.currentTarget.checked ? [customValue || "__OTHER__"] : []),
                      ].join(","),
                    )
                  }
                />
                <span>{otherLabel}</span>
              </label>
            ) : null}
          </div>
          {otherSelected ? (
            <input
              type="text"
              value={customValue}
              placeholder={otherLabel}
              onChange={(event) =>
                updateField(
                  field.code,
                  [...configuredValues, event.target.value.trim() || "__OTHER__"].join(","),
                )
              }
            />
          ) : null}
          <small>
            {maxSelections === null
              ? "Select all that apply."
              : `${selectionCount} of ${maxSelections} selected.`}
          </small>
        </fieldset>
      );
    }

    if (field.fieldType === "SELECT") {
      const { allowOther, otherLabel } = choiceSettings(field);
      const otherSelected = allowOther && value !== "" && value !== "__OTHER__" && !options.includes(value);
      const selectValue = otherSelected ? "__OTHER__" : value;
      return (
        <label key={field.id} className="work-create-field">
          <span>{label}</span>
          <select
            value={selectValue}
            onChange={(event) => updateField(field.code, event.currentTarget.value)}
          >
            <option value="">Choose</option>
            {options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}
            {allowOther ? <option value="__OTHER__">{otherLabel}</option> : null}
          </select>
          {otherSelected || value === "__OTHER__" ? (
            <input
              type="text"
              value={otherSelected ? value : ""}
              placeholder={otherLabel}
              onChange={(event) => updateField(field.code, event.target.value || "__OTHER__")}
            />
          ) : null}
        </label>
      );
    }

    if (field.fieldType === "USER") {
      return (
        <label key={field.id} className="work-create-field">
          <span>{label}</span>
          <select
            value={value}
            onChange={(event) => updateField(field.code, event.target.value)}
          >
            <option value="">Choose employee</option>
            {organizationPeople.flatMap((person) =>
              person.employee.account?.isEnabled
                ? [
                    <option
                      key={person.employee.account.id}
                      value={person.employee.account.id}
                    >
                      {person.employee.empName} ({person.employee.empId})
                    </option>,
                  ]
                : [],
            )}
          </select>
        </label>
      );
    }

    if (field.fieldType === "DATETIME") {
      return (
        <div key={field.id} className="work-create-field">
          <DualCalendarDateTimeInput
            id={`work-field-${field.id}`}
            label={label}
            value={value}
            required={field.isRequired}
            mode={calendarMode}
            showAlternate={false}
            onChange={(nextValue) => updateField(field.code, nextValue)}
          />
        </div>
      );
    }

    if (field.fieldType === "ORG_UNIT") {
      return (
        <label key={field.id} className="work-create-field">
          <span>{label}</span>
          <select
            value={value}
            onChange={(event) => updateField(field.code, event.target.value)}
          >
            <option value="">Choose organization</option>
            {flatUnits
              .filter((unit) => unit.isActive)
              .map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
          </select>
        </label>
      );
    }

    return (
      <label key={field.id} className="work-create-field">
        <span>{label}</span>
        <input
          type={inputType(field)}
          step={field.fieldType === "DECIMAL" ? "any" : undefined}
          value={value}
          onChange={(event) => updateField(field.code, event.target.value)}
        />
      </label>
    );
  }

  if (isSuperAdmin) {
    return (
      <main className="management-work-page">
        <section className="management-work-shell work-create-read-only">
          <p className="work-management-eyebrow">WORK MANAGEMENT</p>
          <h1>{t("work.create.readOnlyTitle")}</h1>
          <p>
            Office leadership creates, assigns, reviews and closes operational
            Work. System administration remains separate.
          </p>
          <Link className="work-button work-button--primary" to="/work">
            Back to Work oversight
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="management-work-page">
      <div className="management-work-shell work-create-shell mx-auto w-full">
        <header className="work-management-header work-create-header sm:items-start">
          <div>
            <p className="work-management-eyebrow">WORK MANAGEMENT</p>
            <h1>{t("work.create.title")}</h1>
            <p>Enter the Work, choose who will do it, then review before creating.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-300 bg-white p-1" aria-label="Work calendar system">
              {(["AD", "BS"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`min-h-9 rounded-lg px-3 text-xs font-bold ${calendarMode === mode ? "bg-sky-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                  aria-pressed={calendarMode === mode}
                  onClick={() => {
                    setCalendarMode(mode);
                    writeWorkCalendarMode(mode);
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
            <Link className="work-button work-button--ghost" to="/work">
              Back
            </Link>
          </div>
        </header>

        <nav className="work-create-steps" aria-label="Create Work steps">
          {([
            { number: 1, label: "Work details" },
            { number: 2, label: "Assignment & schedule" },
            { number: 3, label: "Review" },
          ] as const).map(({ number, label }) => (
            <button
              key={number}
              type="button"
              className={step === number ? "is-active" : step > number ? "is-done" : ""}
              onClick={() => {
                if (number === 1) setStep(1);
                if (number === 2 && validateDetails()) setStep(2);
                if (number === 3 && validateDetails() && validateAssignment(Date.now())) {
                  setStep(3);
                }
              }}
            >
              <span>{number}</span>
              <strong>{label}</strong>
            </button>
          ))}
        </nav>

        {error && (
          <div className="work-management-alert is-error" role="alert">
            {error}
            {createdWorkId && (
              <Link to={`/work/${officeId}/${createdWorkId}`}>Open Work</Link>
            )}
          </div>
        )}
        {supportDataWarning && (
          <div className="work-management-alert is-warning" role="status">
            {supportDataWarning}
          </div>
        )}

        {loadingOffices || loadingContext ? (
          <section className="work-management-empty" aria-live="polite">
            Loading Work setup…
          </section>
        ) : offices.length === 0 ? (
          <section className="work-management-empty">
            No active Office is available.
          </section>
        ) : (
          <section className="work-create-card">
            {step === 1 && (
              <div className="work-create-section">
                <div className="work-create-section__heading">
                  <span>1</span>
                  <div>
                    <h2>Work details</h2>
                    <p>Only fields required by the selected Work Type are shown.</p>
                  </div>
                </div>

                <div className="work-create-grid">
                  <label className="work-create-field">
                    <span>Office</span>
                    <select
                      value={officeId}
                      onChange={(event) => setOfficeId(event.target.value)}
                    >
                      {offices.map((office) => (
                        <option key={office.id} value={office.id}>
                          {office.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="work-create-field">
                    <span>Work Type</span>
                    <select
                      value={selectedVersionId}
                      onChange={(event) => chooseWorkType(event.target.value)}
                    >
                      {workTypes.map((workType) => (
                        <option
                          key={workType.workTypeVersionId}
                          value={workType.workTypeVersionId}
                        >
                          {workType.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {!selectedWorkType ? (
                  <div className="work-management-empty">
                    {contextLoaded
                      ? "No published Work Type is available for your scope. Configure and make a Work Type available first."
                      : "Work Type availability could not be loaded. Review the error above and refresh after the connection is restored."}
                  </div>
                ) : (
                  <div className="work-create-grid work-create-grid--fields">
                    {intakeFields.length > 0 ? (
                      visibleIntakeFields.map(renderField)
                    ) : (
                      <p className="work-create-help work-create-field--wide">
                        This Work Type has no intake fields. Continue to assignment.
                      </p>
                    )}
                  </div>
                )}

                <div className="work-create-actions">
                  <Link className="work-button work-button--ghost" to="/work">
                    Cancel
                  </Link>
                  <button
                    className="work-button work-button--primary"
                    type="button"
                    disabled={!selectedWorkType}
                    onClick={goToAssignment}
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {step === 2 && selectedWorkType && (
              <div className="work-create-section">
                <div className="work-create-section__heading">
                  <span>2</span>
                  <div>
                    <h2>Assignment & schedule</h2>
                    <p>Choose the working Team, reviewer, Sales Member when required, and optional Support Members.</p>
                  </div>
                </div>

                <div className="work-create-grid">
                  {selectedWorkType.executionAssignmentMode === "TEAM" ? (
                    <label className="work-create-field work-create-field--wide">
                      <span>Main Team *</span>
                      <select
                        value={mainTeamId}
                        onChange={(event) => {
                          setMainTeamId(event.target.value);
                          setMainAssigneeAccountId("");
                          setReviewerAccountId("");
                          setSalesOrgUnitId("");
                          setSalesMemberAccountId("");
                          setSalesMemberSearch("");
                          setSupportOrgUnitId("");
                          setSupportMemberAccountId("");
                          setSupportMemberAccountIds([]);
                          setSupportMemberSearch("");
                        }}
                      >
                        <option value="">Choose Main Team</option>
                        {selectedWorkType.mainTeams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name} · {team.orgUnit.name}
                          </option>
                        ))}
                      </select>
                      {selectedWorkType.mainTeams.length === 0 && (
                        <small>No active Team is available in your Work scope.</small>
                      )}
                    </label>
                  ) : selectedWorkType.executionAssignmentMode === "TEAM_OR_USER" ? (
                    <div className="work-create-field work-create-field--wide">
                      <span>Main Team or individual *</span>
                      <div className="work-create-grid">
                        <label className="work-create-field">
                          <span>Team</span>
                          <select value={mainTeamId} onChange={(event) => { setMainTeamId(event.target.value); if (event.target.value) setMainAssigneeAccountId(""); setReviewerAccountId(""); setSalesOrgUnitId(""); setSalesMemberAccountId(""); setSalesMemberSearch(""); setSupportOrgUnitId(""); setSupportMemberAccountId(""); setSupportMemberAccountIds([]); setSupportMemberSearch(""); }}>
                            <option value="">Choose Team</option>
                            {selectedWorkType.mainTeams.map((team) => <option key={team.id} value={team.id}>{team.name} · {team.orgUnit.name}</option>)}
                          </select>
                        </label>
                        <label className="work-create-field">
                          <span>Individual</span>
                          <select value={mainAssigneeAccountId} onChange={(event) => { const next = event.target.value; setMainAssigneeAccountId(next); if (next) setMainTeamId(""); setReviewerAccountId(""); setSalesOrgUnitId(""); setSalesMemberAccountId(""); setSalesMemberSearch(""); setSupportOrgUnitId(""); setSupportMemberAccountId(""); setSupportMemberAccountIds([]); setSupportMemberSearch(""); }}>
                            <option value="">Choose employee</option>
                            {selectedWorkType.mainAssigneeCandidates.map((person) => <option key={person.accountId} value={person.accountId}>{person.employeeName}{person.orgUnit?.name ? ` · ${person.orgUnit.name}` : ""}</option>)}
                          </select>
                        </label>
                      </div>
                      <small>Choose only one: a Team or an individual employee.</small>
                    </div>
                  ) : (
                    <div className="work-create-summary-line work-create-field--wide">
                      <span>Work organization</span>
                      <strong>{selectedWorkType.primaryOwnerOrgUnit.name}</strong>
                      <small>This Work starts in the organization queue and can be assigned from the Work page.</small>
                    </div>
                  )}

                  <label className="work-create-field work-create-field--wide">
                    <span>Responsible Reviewer *</span>
                    <select
                      value={reviewerAccountId}
                      onChange={(event) => {
                        const nextReviewer = event.target.value;
                        setReviewerAccountId(nextReviewer);
                        setSupportMemberAccountIds((current) =>
                          current.filter((accountId) => accountId !== nextReviewer),
                        );
                        if (salesMemberAccountId === nextReviewer) {
                          setSalesMemberAccountId("");
                        }
                      }}
                      disabled={
                        (selectedWorkType.executionAssignmentMode === "TEAM" && !selectedTeam) ||
                        (selectedWorkType.executionAssignmentMode === "TEAM_OR_USER" && !selectedTeam && !selectedAssignee)
                      }
                    >
                      <option value="">Choose Responsible Reviewer</option>
                      {reviewerCandidates.map((candidate) => (
                        <option key={candidate.accountId} value={candidate.accountId}>
                          {reviewerLabel(candidate)}
                        </option>
                      ))}
                    </select>
                    <small>
                      Only this selected Head can approve and close the finished Work. A Head in the performing Team is not offered here.
                    </small>
                  </label>

                  {selectedWorkType.requiresSalesParticipant && (
                    <div className="work-create-field work-create-field--wide">
                      <span>{salesDisplayLabel} coordination *</span>
                      <div className="work-create-grid">
                        <label className="work-create-field">
                          <span>{salesDisplayLabel} organization *</span>
                          <select
                            value={salesOrgUnitId}
                            onChange={(event) => {
                              setSalesOrgUnitId(event.target.value);
                              setSalesMemberAccountId("");
                              setSalesMemberSearch("");
                            }}
                          >
                            <option value="">Choose Division / Department / Unit</option>
                            {activeUnitOptions.map(({ unit, label }) => (
                              <option key={unit.id} value={unit.id}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <small>
                            Choose the {salesDisplayLabel} organization first. Members from that organization and its child units are then shown.
                          </small>
                        </label>
                        <label className="work-create-field">
                          <span>Find {salesDisplayLabel}</span>
                          <input
                            type="search"
                            value={salesMemberSearch}
                            onChange={(event) => setSalesMemberSearch(event.target.value)}
                            placeholder="Search by name, employee ID or unit"
                            disabled={!salesOrgUnitId}
                          />
                        </label>
                        <label className="work-create-field work-create-field--wide">
                          <span>{salesDisplayLabel} *</span>
                          <select
                            value={salesMemberAccountId}
                            onChange={(event) => {
                              const next = event.target.value;
                              setSalesMemberAccountId(next);
                              setSupportMemberAccountIds((current) =>
                                current.filter((accountId) => accountId !== next),
                              );
                            }}
                            disabled={!salesOrgUnitId}
                          >
                            <option value="">Choose {salesDisplayLabel}</option>
                            {eligibleSalesMembers.map((person) => (
                              <option key={person.accountId} value={person.accountId}>
                                {person.employeeName} ({person.employeeCode})
                                {person.orgUnit?.name ? ` · ${person.orgUnit.name}` : ""}
                              </option>
                            ))}
                          </select>
                          <small>
                            The selected {salesDisplayLabel} works on the same required coordination step. The Main Team cannot finish until {salesDisplayLabel} completes its part.
                          </small>
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="work-create-field work-create-field--wide">
                    <span>{t("work.create.supportMembers")}</span>
                    <div className="work-create-grid">
                      <label className="work-create-field">
                        <span>Support organization</span>
                        <select
                          value={supportOrgUnitId}
                          onChange={(event) => {
                            setSupportOrgUnitId(event.target.value);
                            setSupportMemberAccountId("");
                            setSupportMemberSearch("");
                          }}
                        >
                          <option value="">Choose Division / Department / Unit</option>
                          {activeUnitOptions.map(({ unit, label }) => (
                            <option key={unit.id} value={unit.id}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <small>
                          You may choose any organization in this Office, including another Division and its child units.
                        </small>
                      </label>
                      <label className="work-create-field">
                        <span>Find support member</span>
                        <input
                          type="search"
                          value={supportMemberSearch}
                          onChange={(event) => setSupportMemberSearch(event.target.value)}
                          placeholder="Search by name, employee ID or unit"
                          disabled={!supportOrgUnitId}
                        />
                      </label>
                    </div>
                    <div className="work-create-add-row">
                      <select
                        value={supportMemberAccountId}
                        onChange={(event) => setSupportMemberAccountId(event.target.value)}
                        disabled={!supportOrgUnitId}
                      >
                        <option value="">{t("work.create.chooseSupportMember")}</option>
                        {eligibleSupportMembers.map((person) => (
                          <option key={person.accountId} value={person.accountId}>
                            {person.employeeName} ({person.employeeCode})
                            {person.orgUnit?.name ? ` · ${person.orgUnit.name}` : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        className="work-button work-button--secondary"
                        type="button"
                        disabled={!supportMemberAccountId}
                        onClick={addSupportMember}
                      >
                        {t("work.create.addSupportMember")}
                      </button>
                    </div>
                    {supportMemberAccountIds.length > 0 && (
                      <div className="work-create-chips">
                        {supportMemberAccountIds.map((accountId) => {
                          const person = supportMemberCandidates.find(
                            (item) => item.accountId === accountId,
                          );
                          return (
                            <button
                              key={accountId}
                              type="button"
                              onClick={() =>
                                setSupportMemberAccountIds((current) =>
                                  current.filter((item) => item !== accountId),
                                )
                              }
                            >
                              {person?.employeeName ?? t("work.create.supportMemberFallback")}
                              {person?.orgUnit?.name ? ` · ${person.orgUnit.name}` : ""} ×
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <small>
                      Select an organization first so large Offices do not show every employee at once. Added Support Members assist the Main Team without becoming the owner or reviewer.
                    </small>
                  </div>

                  {!isAdministrativeWork ? (
                    <div className="work-create-field">
                      <DualCalendarDateTimeInput
                        id="work-registered-at"
                        label="Registered date & time"
                        value={registeredAt}
                        mode={calendarMode}
                        showAlternate={false}
                        required
                        max={new Date().toISOString()}
                        onChange={setRegisteredAt}
                      />
                    </div>
                  ) : null}

                  <div className="work-create-field">
                    <DualCalendarDateTimeInput
                      id="work-planned-start"
                      label="Planned start"
                      value={plannedStartAt}
                      mode={calendarMode}
                      showAlternate={false}
                      required
                      min={isAdministrativeWork ? undefined : registeredAt}
                      onChange={setPlannedStartAt}
                    />
                  </div>

                  <div className="work-create-field">
                    <DualCalendarDateTimeInput
                      id="work-due-at"
                      label="Due date & time"
                      value={dueAt}
                      mode={calendarMode}
                      showAlternate={false}
                      required
                      min={plannedStartAt}
                      onChange={setDueAt}
                    />
                    <small>Defaults to 4 hours after the initial planned start and remains editable before the Work is created.</small>
                  </div>
                </div>

                <div className="work-create-actions">
                  <button
                    className="work-button work-button--ghost"
                    type="button"
                    onClick={() => setStep(1)}
                  >
                    Back
                  </button>
                  <button
                    className="work-button work-button--primary"
                    type="button"
                    onClick={goToReview}
                  >
                    Review Work
                  </button>
                </div>
              </div>
            )}

            {step === 3 && selectedWorkType && (
              <div className="work-create-section">
                <div className="work-create-section__heading">
                  <span>3</span>
                  <div>
                    <h2>Review Work</h2>
                    <p>Check the important details before creating the Work.</p>
                  </div>
                </div>

                <div className="work-create-review">
                  <article>
                    <span>Work Type</span>
                    <strong>{selectedWorkType.name}</strong>
                    <small>Published version {selectedWorkType.version}</small>
                  </article>
                  <article>
                    <span>Main organization</span>
                    <strong>{primaryExecutionOrgUnit?.name ?? "Not selected"}</strong>
                  </article>
                  <article>
                    <span>Assigned to</span>
                    <strong>{selectedTeam?.name ?? selectedAssignee?.employeeName ?? "Organization queue"}</strong>
                  </article>
                  <article>
                    <span>Responsible Reviewer</span>
                    <strong>
                      {reviewerCandidates.find(
                        (candidate) => candidate.accountId === reviewerAccountId,
                      )?.employeeName ?? "Not selected"}
                    </strong>
                  </article>
                  {selectedWorkType.requiresSalesParticipant && (
                    <>
                      <article>
                        <span>{salesDisplayLabel} organization</span>
                        <strong>
                          {activeUnitOptions.find(({ unit }) => unit.id === salesOrgUnitId)?.label ??
                            "Not selected"}
                        </strong>
                      </article>
                      <article>
                        <span>{salesDisplayLabel}</span>
                        <strong>
                          {selectedSalesMember
                            ? `${selectedSalesMember.employeeName} (${selectedSalesMember.employeeCode})`
                            : "Not selected"}
                        </strong>
                      </article>
                    </>
                  )}
                  <article>
                    <span>Support Members</span>
                    <strong>
                      {supportMemberAccountIds.length > 0
                        ? supportMemberAccountIds
                            .map(
                              (accountId) => {
                                const person = supportMemberCandidates.find(
                                  (candidate) => candidate.accountId === accountId,
                                );
                                return person
                                  ? `${person.employeeName}${person.orgUnit?.name ? ` · ${person.orgUnit.name}` : ""}`
                                  : null;
                              },
                            )
                            .filter(Boolean)
                            .join(", ")
                        : "None"}
                    </strong>
                  </article>
                  {!isAdministrativeWork ? (
                    <article>
                      <span>Registered</span>
                      <strong>{formatWorkDateTime(registeredAt, "en", "Not set", calendarMode)}</strong>
                    </article>
                  ) : null}
                  <article>
                    <span>Planned start</span>
                    <strong>{formatWorkDateTime(plannedStartAt, "en", "Not set", calendarMode)}</strong>
                  </article>
                  <article>
                    <span>Due</span>
                    <strong>{formatWorkDateTime(dueAt, "en", "Not set", calendarMode)}</strong>
                  </article>
                </div>

                {visibleIntakeFields.length > 0 && (
                  <div className="work-create-review-fields">
                    <h3>Work information</h3>
                    <dl>
                      {visibleIntakeFields.flatMap((field) => {
                        const raw = fieldValues[field.code]?.trim();
                        return raw
                          ? [
                              <div key={field.id}>
                                <dt>{field.label}</dt>
                                <dd>{raw.replaceAll(",", ", ")}</dd>
                              </div>,
                            ]
                          : [];
                      })}
                    </dl>
                  </div>
                )}

                <div className="work-create-actions">
                  <button
                    className="work-button work-button--ghost"
                    type="button"
                    disabled={submitting}
                    onClick={() => setStep(2)}
                  >
                    Back
                  </button>
                  <button
                    className="work-button work-button--primary"
                    type="button"
                    disabled={submitting || Boolean(createdWorkId)}
                    onClick={() => void submit()}
                  >
                    {submitting ? "Creating…" : t("work.create.submit")}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
