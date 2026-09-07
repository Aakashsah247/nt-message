import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import { useAuth } from "../context/AuthContext";
import {
  getOrganizationOffices,
  getOrganizationPeople,
  getOrganizationTree,
} from "../services/organization-v3.service";
import {
  approveWorkRuntimeV3Stage,
  assignWorkRuntimeV3Stage,
  blockWorkRuntimeV3Stage,
  getWorkRuntimeV3Stage,
  listMyWorkRuntimeV3Stages,
  listOrgUnitWorkRuntimeV3Stages,
  listTeamWorkRuntimeV3Stages,
  resumeWorkRuntimeV3Stage,
  returnWorkRuntimeV3Stage,
  startWorkRuntimeV3Stage,
  submitWorkRuntimeV3Stage,
} from "../services/work-runtime-v3.service";
import type {
  WorkRuntimeV3AssignmentTargetType,
  WorkRuntimeV3Stage,
  WorkRuntimeV3StageAction,
  WorkRuntimeV3StageFieldDefinition,
} from "../types/work-runtime-v3";
import type {
  OrganizationPersonSummary,
  OrganizationUnitNode,
} from "../types/organization-v3";

const BRANCH_TIME_ZONE = "Asia/Kathmandu";

type QueueMode = "MINE" | "TEAM" | "ORG_UNIT";

const QUEUE_OPTIONS: Array<{ value: QueueMode; label: string; description: string }> = [
  { value: "MINE", label: "My stages", description: "Stages assigned directly to you." },
  { value: "TEAM", label: "Team queue", description: "Stages assigned to your current Team." },
  { value: "ORG_UNIT", label: "Incoming queue", description: "Stages waiting for your OrgUnit to coordinate." },
];

function formatDateTime(value: string | null): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BRANCH_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatStatus(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The Work runtime request could not be completed.";
}

function flattenOrganizationTree(nodes: OrganizationUnitNode[]): OrganizationUnitNode[] {
  return nodes.flatMap((node) => [node, ...flattenOrganizationTree(node.children)]);
}

function assignmentTargetTypes(stage: WorkRuntimeV3Stage): WorkRuntimeV3AssignmentTargetType[] {
  switch (stage.assignmentMode) {
    case "ORG_UNIT_QUEUE":
      return ["ORG_UNIT_QUEUE"];
    case "TEAM":
      return ["TEAM"];
    case "INDIVIDUAL":
      return ["ACCOUNT"];
    case "ORG_UNIT_OR_TEAM":
      return ["ORG_UNIT_QUEUE", "TEAM"];
    case "ORG_UNIT_OR_USER":
      return ["ORG_UNIT_QUEUE", "ACCOUNT"];
    case "RESPONSIBLE_ORG_UNIT_HEAD":
      return [];
  }
}

function selectOptions(field: WorkRuntimeV3StageFieldDefinition): Array<{ value: string; label: string }> {
  const raw = field.config?.options;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((option) => {
    if (typeof option === "string") return [{ value: option, label: option }];
    if (option && typeof option === "object") {
      const record = option as Record<string, unknown>;
      const value = typeof record.value === "string" ? record.value : typeof record.code === "string" ? record.code : null;
      if (!value) return [];
      const label = typeof record.label === "string" ? record.label : value;
      return [{ value, label }];
    }
    return [];
  });
}

function toRuntimeFieldValue(field: WorkRuntimeV3StageFieldDefinition, raw: string): unknown {
  switch (field.fieldType) {
    case "NUMBER":
    case "DECIMAL":
      return raw.trim() === "" ? null : Number(raw);
    case "BOOLEAN":
      return raw === "true";
    case "MULTI_SELECT":
      return raw.split(",").map((value) => value.trim()).filter(Boolean);
    case "DATETIME":
      return raw ? new Date(raw).toISOString() : raw;
    default:
      return raw;
  }
}

export function WorkRuntimeV3Page() {
  const { accessToken, account } = useAuth();
  const [offices, setOffices] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [officeId, setOfficeId] = useState("");
  const [queueMode, setQueueMode] = useState<QueueMode>("MINE");
  const [stages, setStages] = useState<WorkRuntimeV3Stage[]>([]);
  const [selectedStageId, setSelectedStageId] = useState("");
  const [selectedStage, setSelectedStage] = useState<WorkRuntimeV3Stage | null>(null);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [organizationUnits, setOrganizationUnits] = useState<OrganizationUnitNode[]>([]);
  const [organizationPeople, setOrganizationPeople] = useState<OrganizationPersonSummary[]>([]);
  const [assignmentTargetType, setAssignmentTargetType] = useState<WorkRuntimeV3AssignmentTargetType>("ORG_UNIT_QUEUE");
  const [assignmentTargetId, setAssignmentTargetId] = useState("");
  const [assignmentReason, setAssignmentReason] = useState("");
  const [submissionNote, setSubmissionNote] = useState("");
  const [stageFieldValues, setStageFieldValues] = useState<Record<string, string>>({});

  const isSuperAdmin = account?.role === "SUPER_ADMIN";
  const flatOrganizationUnits = useMemo(() => flattenOrganizationTree(organizationUnits), [organizationUnits]);

  const selectedQueue = useMemo(
    () => QUEUE_OPTIONS.find((option) => option.value === queueMode) ?? QUEUE_OPTIONS[0],
    [queueMode],
  );

  useEffect(() => {
    if (!accessToken) return;

    let active = true;
    getOrganizationOffices(accessToken)
      .then((response) => {
        if (!active) return;
        const visible = response.data
          .filter((office) => office.isActive)
          .map((office) => ({ id: office.id, code: office.code, name: office.name }));
        setOffices(visible);
        setOfficeId((current) =>
          visible.some((office) => office.id === current)
            ? current
            : visible[0]?.id ?? "",
        );
      })
      .catch((requestError: unknown) => {
        if (active) setError(getErrorMessage(requestError));
      });

    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !officeId || isSuperAdmin) return;
    let active = true;
    Promise.all([
      getOrganizationTree(accessToken, officeId),
      getOrganizationPeople(accessToken, officeId),
    ])
      .then(([treeResponse, peopleResponse]) => {
        if (!active) return;
        setOrganizationUnits(treeResponse.tree);
        setOrganizationPeople(peopleResponse.data);
      })
      .catch((requestError: unknown) => {
        if (active) setError(getErrorMessage(requestError));
      });
    return () => { active = false; };
  }, [accessToken, isSuperAdmin, officeId]);

  const loadQueue = useCallback(async () => {
    if (!accessToken || !officeId || isSuperAdmin) {
      setStages([]);
      setSelectedStageId("");
      setSelectedStage(null);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = queueMode === "MINE"
        ? await listMyWorkRuntimeV3Stages(accessToken, officeId)
        : queueMode === "TEAM"
          ? await listTeamWorkRuntimeV3Stages(accessToken, officeId)
          : await listOrgUnitWorkRuntimeV3Stages(accessToken, officeId);

      setStages(response);
      setSelectedStageId((current) =>
        response.some((stage) => stage.id === current)
          ? current
          : response[0]?.id ?? "",
      );
    } catch (requestError: unknown) {
      setStages([]);
      setSelectedStageId("");
      setSelectedStage(null);
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [accessToken, isSuperAdmin, officeId, queueMode]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadQueue();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadQueue]);

  useEffect(() => {
    if (!accessToken || !officeId || !selectedStageId || isSuperAdmin) {
      const timeoutId = window.setTimeout(() => {
        setSelectedStage(null);
      }, 0);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    let active = true;
    getWorkRuntimeV3Stage(accessToken, officeId, selectedStageId)
      .then((response) => {
        if (active) setSelectedStage(response);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setSelectedStage(null);
          setError(getErrorMessage(requestError));
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, isSuperAdmin, officeId, selectedStageId]);

  async function runMutation(
    action: () => Promise<WorkRuntimeV3Stage>,
    message: string,
  ): Promise<void> {
    setMutating(true);
    setError("");
    setSuccess("");
    try {
      const updated = await action();
      setSelectedStage(updated);
      setSuccess(message);
      setBlockReason("");
      setReviewNote("");
      setReturnReason("");
      await loadQueue();
      setSelectedStageId(updated.id);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError));
    } finally {
      setMutating(false);
    }
  }

  function hasAction(action: WorkRuntimeV3StageAction): boolean {
    return selectedStage?.availableActions.includes(action) ?? false;
  }

  const responsibleUnitIds = useMemo(() => {
    if (!selectedStage) return new Set<string>();
    const byParent = new Map<string | null, OrganizationUnitNode[]>();
    for (const unit of flatOrganizationUnits) {
      const siblings = byParent.get(unit.parentOrgUnitId) ?? [];
      siblings.push(unit);
      byParent.set(unit.parentOrgUnitId, siblings);
    }
    const ids = new Set<string>();
    const visit = (id: string) => {
      if (ids.has(id)) return;
      ids.add(id);
      for (const child of byParent.get(id) ?? []) visit(child.id);
    };
    visit(selectedStage.responsibleOrgUnitId);
    return ids;
  }, [flatOrganizationUnits, selectedStage]);

  const assignmentTeams = useMemo(
    () => flatOrganizationUnits.filter((unit) => unit.isActive && unit.orgUnitType.isTeam && responsibleUnitIds.has(unit.id)),
    [flatOrganizationUnits, responsibleUnitIds],
  );

  const assignmentPeople = useMemo(
    () => organizationPeople.filter((person) => {
      const membership = person.primaryMembership;
      return Boolean(
        person.employee.account?.isEnabled &&
        membership.orgUnitId &&
        responsibleUnitIds.has(membership.orgUnitId),
      );
    }),
    [organizationPeople, responsibleUnitIds],
  );

  function updateField(code: string, value: string): void {
    setStageFieldValues((current) => ({ ...current, [code]: value }));
  }

  function assignmentTargetTypeLabel(targetType: WorkRuntimeV3AssignmentTargetType): string {
    if (targetType === "ORG_UNIT_QUEUE") return "OrgUnit incoming queue";
    if (targetType === "TEAM") return "Team";
    return "Individual";
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Work Runtime V3</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">Stage execution workspace</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Work moves through OrgUnit-controlled stages. Actions shown here come from the backend for your current authority and assignment.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {!isSuperAdmin && (
              <Link
                to="/work-runtime-v3/create"
                className="inline-flex items-center justify-center rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-800"
              >
                Create Work
              </Link>
            )}
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              Office
            <select
              className="min-w-64 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-500"
              value={officeId}
              onChange={(event) => setOfficeId(event.target.value)}
            >
              {offices.map((office) => (
                <option key={office.id} value={office.id}>
                  {office.name} ({office.code})
                </option>
              ))}
            </select>
            </label>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{success}</div>
      ) : null}

      {isSuperAdmin ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Operational oversight is read-only</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Super Admin cannot execute, assign, approve, return, cancel, or reopen Work. The read-only Work oversight list is added in the next runtime UI milestone.
          </p>
        </section>
      ) : (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              {QUEUE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    queueMode === option.value
                      ? "border-sky-400 bg-sky-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                  onClick={() => setQueueMode(option.value)}
                >
                  <span className="block text-sm font-bold text-slate-950">{option.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{option.description}</span>
                </button>
              ))}
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <h2 className="font-bold text-slate-950">{selectedQueue?.label}</h2>
                  <p className="text-xs text-slate-500">{stages.length} active stage{stages.length === 1 ? "" : "s"}</p>
                </div>
                <button
                  type="button"
                  className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  onClick={() => void loadQueue()}
                  disabled={loading}
                >
                  {loading ? "Loading..." : "Refresh"}
                </button>
              </div>

              <div className="max-h-[680px] divide-y divide-slate-100 overflow-y-auto">
                {!loading && stages.length === 0 ? (
                  <div className="px-5 py-12 text-center text-sm text-slate-500">No active stages in this queue.</div>
                ) : null}
                {stages.map((stage) => (
                  <button
                    key={stage.id}
                    type="button"
                    className={`w-full px-4 py-4 text-left transition hover:bg-slate-50 ${selectedStageId === stage.id ? "bg-sky-50/70" : "bg-white"}`}
                    onClick={() => setSelectedStageId(stage.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-950">{stage.workItem.ticketNumber} · {stage.workItem.title}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{stage.name} · {stage.responsibleOrgUnit.name}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">{formatStatus(stage.status)}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Due: {formatDateTime(stage.dueAt)}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            {!selectedStage ? (
              <div className="grid min-h-80 place-items-center text-center text-sm text-slate-500">Select a stage to view its runtime details.</div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-sky-700">{selectedStage.workItem.ticketNumber}</p>
                    <h2 className="mt-1 text-xl font-bold text-slate-950">{selectedStage.workItem.title}</h2>
                    <p className="mt-2 text-sm text-slate-600">{selectedStage.name} · {selectedStage.responsibleOrgUnit.name}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      to={`/work-runtime-v3/offices/${officeId}/work-items/${selectedStage.workItemId}`}
                    >
                      Work detail
                    </Link>
                    <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800">Stage: {formatStatus(selectedStage.status)}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">Work: {formatStatus(selectedStage.workItem.runtimeStatus)}</span>
                  </div>
                </div>

                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <dt className="text-xs font-semibold text-slate-500">Assignment mode</dt>
                    <dd className="mt-1 text-sm font-bold text-slate-900">{formatStatus(selectedStage.assignmentMode)}</dd>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <dt className="text-xs font-semibold text-slate-500">Approval</dt>
                    <dd className="mt-1 text-sm font-bold text-slate-900">{formatStatus(selectedStage.approvalMode)}</dd>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <dt className="text-xs font-semibold text-slate-500">Stage version</dt>
                    <dd className="mt-1 text-sm font-bold text-slate-900">{selectedStage.version}</dd>
                  </div>
                </dl>

                {selectedStage.blockerReason ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Current blocker</p>
                    <p className="mt-2 text-sm text-amber-950">{selectedStage.blockerReason}</p>
                  </div>
                ) : null}

                <div>
                  <h3 className="text-sm font-bold text-slate-950">Current assignment</h3>
                  <div className="mt-2 rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                    {selectedStage.assignments[0]?.targetAccount?.employee?.empName
                      ?? selectedStage.assignments[0]?.targetOrgUnit?.name
                      ?? (selectedStage.assignments[0]?.targetType === "ORG_UNIT_QUEUE" ? "OrgUnit incoming queue" : "Not assigned")}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-950">Available actions</h3>

                  {hasAction("BLOCK") ? (
                    <div className="grid gap-2 rounded-2xl border border-slate-200 p-4 sm:grid-cols-[1fr_auto]">
                      <input
                        className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                        value={blockReason}
                        onChange={(event) => setBlockReason(event.target.value)}
                        placeholder="What is blocking this stage?"
                        maxLength={1000}
                      />
                      <button
                        type="button"
                        disabled={mutating || blockReason.trim().length < 2}
                        className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => void runMutation(
                          () => blockWorkRuntimeV3Stage(accessToken!, officeId, selectedStage.id, {
                            expectedStageVersion: selectedStage.version,
                            reason: blockReason.trim(),
                          }),
                          "Blocker recorded.",
                        )}
                      >
                        Record blocker
                      </button>
                    </div>
                  ) : null}

                  {hasAction("ASSIGN") ? (
                    <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
                      <div>
                        <h4 className="text-sm font-bold text-slate-950">Assign stage</h4>
                        <p className="mt-1 text-xs leading-5 text-slate-500">The responsible OrgUnit controls who executes this stage. The backend validates every target.</p>
                      </div>
                      {selectedStage.assignmentMode === "RESPONSIBLE_ORG_UNIT_HEAD" ? (
                        <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">The current responsible OrgUnit Head is resolved automatically.</p>
                      ) : (
                        <>
                          <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                            Assignment target
                            <select
                              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
                              value={assignmentTargetType}
                              onChange={(event) => {
                                setAssignmentTargetType(event.target.value as WorkRuntimeV3AssignmentTargetType);
                                setAssignmentTargetId("");
                              }}
                            >
                              {assignmentTargetTypes(selectedStage).map((targetType) => (
                                <option key={targetType} value={targetType}>{assignmentTargetTypeLabel(targetType)}</option>
                              ))}
                            </select>
                          </label>
                          {assignmentTargetType === "TEAM" ? (
                            <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                              Team
                              <select className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" value={assignmentTargetId} onChange={(event) => setAssignmentTargetId(event.target.value)}>
                                <option value="">Select Team</option>
                                {assignmentTeams.map((team) => <option key={team.id} value={team.id}>{team.name} ({team.code})</option>)}
                              </select>
                            </label>
                          ) : null}
                          {assignmentTargetType === "ACCOUNT" ? (
                            <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                              Employee
                              <select className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" value={assignmentTargetId} onChange={(event) => setAssignmentTargetId(event.target.value)}>
                                <option value="">Select employee</option>
                                {assignmentPeople.map((person) => person.employee.account ? (
                                  <option key={person.employee.account.id} value={person.employee.account.id}>{person.employee.empName} ({person.employee.empId})</option>
                                ) : null)}
                              </select>
                            </label>
                          ) : null}
                        </>
                      )}
                      <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                        {selectedStage.assignments.length > 0 ? "Reassignment reason" : "Assignment note (optional)"}
                        <input className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm" value={assignmentReason} onChange={(event) => setAssignmentReason(event.target.value)} maxLength={1000} />
                      </label>
                      <button
                        type="button"
                        className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                        disabled={mutating || (selectedStage.assignments.length > 0 && assignmentReason.trim().length < 2) || (selectedStage.assignmentMode !== "RESPONSIBLE_ORG_UNIT_HEAD" && assignmentTargetType !== "ORG_UNIT_QUEUE" && !assignmentTargetId)}
                        onClick={() => void runMutation(
                          () => assignWorkRuntimeV3Stage(accessToken!, officeId, selectedStage.id, {
                            expectedStageVersion: selectedStage.version,
                            ...(selectedStage.assignmentMode === "RESPONSIBLE_ORG_UNIT_HEAD" ? {} : { targetType: assignmentTargetType }),
                            ...(assignmentTargetType === "TEAM" && assignmentTargetId ? { targetOrgUnitId: assignmentTargetId } : {}),
                            ...(assignmentTargetType === "ACCOUNT" && assignmentTargetId ? { targetAccountId: assignmentTargetId } : {}),
                            reason: assignmentReason.trim() || undefined,
                          }),
                          "Stage assignment updated.",
                        )}
                      >
                        {selectedStage.assignments.length > 0 ? "Reassign stage" : "Assign stage"}
                      </button>
                    </div>
                  ) : null}

                  {hasAction("SUBMIT") ? (
                    <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
                      <div>
                        <h4 className="text-sm font-bold text-slate-950">Submit stage</h4>
                        <p className="mt-1 text-xs leading-5 text-slate-500">Complete the configured fields. Validation is enforced again by the backend.</p>
                      </div>
                      {selectedStage.stageDefinition.fields.map((field) => {
                        const value = stageFieldValues[field.code] ?? "";
                        const options = selectOptions(field);
                        return (
                          <label key={field.id} className="grid gap-1.5 text-xs font-semibold text-slate-600">
                            <span>{field.code}{field.isRequired ? " *" : ""}</span>
                            {field.fieldType === "LONG_TEXT" ? (
                              <textarea className="min-h-24 rounded-xl border border-slate-300 px-3 py-2.5 text-sm" value={value} onChange={(event) => updateField(field.code, event.target.value)} />
                            ) : field.fieldType === "BOOLEAN" ? (
                              <select className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" value={value} onChange={(event) => updateField(field.code, event.target.value)}>
                                <option value="">Select</option><option value="true">Yes</option><option value="false">No</option>
                              </select>
                            ) : field.fieldType === "SELECT" ? (
                              <select className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" value={value} onChange={(event) => updateField(field.code, event.target.value)}>
                                <option value="">Select</option>
                                {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                              </select>
                            ) : field.fieldType === "USER" ? (
                              <select className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" value={value} onChange={(event) => updateField(field.code, event.target.value)}>
                                <option value="">Select employee</option>
                                {organizationPeople.map((person) => person.employee.account ? <option key={person.employee.account.id} value={person.employee.account.id}>{person.employee.empName} ({person.employee.empId})</option> : null)}
                              </select>
                            ) : field.fieldType === "ORG_UNIT" ? (
                              <select className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" value={value} onChange={(event) => updateField(field.code, event.target.value)}>
                                <option value="">Select OrgUnit</option>
                                {flatOrganizationUnits.filter((unit) => unit.isActive).map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.code})</option>)}
                              </select>
                            ) : field.fieldType === "IMAGE" || field.fieldType === "FILE" ? (
                              <span className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Attachment-backed runtime fields are handled in the evidence milestone.</span>
                            ) : (
                              <input
                                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                                type={field.fieldType === "DATE" ? "date" : field.fieldType === "DATETIME" ? "datetime-local" : field.fieldType === "NUMBER" || field.fieldType === "DECIMAL" ? "number" : "text"}
                                value={value}
                                onChange={(event) => updateField(field.code, event.target.value)}
                                placeholder={field.fieldType === "MULTI_SELECT" ? "Comma-separated values" : undefined}
                              />
                            )}
                          </label>
                        );
                      })}
                      <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                        Submission note (optional)
                        <textarea className="min-h-20 rounded-xl border border-slate-300 px-3 py-2.5 text-sm" value={submissionNote} onChange={(event) => setSubmissionNote(event.target.value)} maxLength={4000} />
                      </label>
                      <button
                        type="button"
                        disabled={mutating || selectedStage.stageDefinition.fields.some((field) => field.isRequired && field.fieldType !== "IMAGE" && field.fieldType !== "FILE" && !(stageFieldValues[field.code] ?? "").trim())}
                        className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                        onClick={() => void runMutation(
                          () => submitWorkRuntimeV3Stage(accessToken!, officeId, selectedStage.id, {
                            expectedStageVersion: selectedStage.version,
                            note: submissionNote.trim() || undefined,
                            fields: selectedStage.stageDefinition.fields
                              .filter((field) => field.fieldType !== "IMAGE" && field.fieldType !== "FILE")
                              .filter((field) => (stageFieldValues[field.code] ?? "").trim() !== "")
                              .map((field) => ({ code: field.code, value: toRuntimeFieldValue(field, stageFieldValues[field.code] ?? "") })),
                          }),
                          "Stage submitted.",
                        )}
                      >Submit stage</button>
                    </div>
                  ) : null}

                  {hasAction("APPROVE") || hasAction("RETURN") ? (
                    <div className="space-y-2 rounded-2xl border border-slate-200 p-4">
                      <textarea
                        className="min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                        value={hasAction("RETURN") ? returnReason : reviewNote}
                        onChange={(event) => hasAction("RETURN") ? setReturnReason(event.target.value) : setReviewNote(event.target.value)}
                        placeholder={hasAction("RETURN") ? "Reason for returning this stage" : "Optional approval note"}
                      />
                      <div className="flex flex-wrap gap-2">
                        {hasAction("APPROVE") ? (
                          <button
                            type="button"
                            disabled={mutating}
                            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                            onClick={() => void runMutation(
                              () => approveWorkRuntimeV3Stage(accessToken!, officeId, selectedStage.id, {
                                expectedStageVersion: selectedStage.version,
                                note: reviewNote.trim() || undefined,
                              }),
                              "Stage approved.",
                            )}
                          >
                            Approve
                          </button>
                        ) : null}
                        {hasAction("RETURN") ? (
                          <button
                            type="button"
                            disabled={mutating || returnReason.trim().length < 2}
                            className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                            onClick={() => void runMutation(
                              () => returnWorkRuntimeV3Stage(accessToken!, officeId, selectedStage.id, {
                                expectedStageVersion: selectedStage.version,
                                reason: returnReason.trim(),
                              }),
                              "Stage returned for correction.",
                            )}
                          >
                            Return for correction
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {hasAction("START") ? (
                      <button
                        type="button"
                        disabled={mutating}
                        className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                        onClick={() => void runMutation(
                          () => startWorkRuntimeV3Stage(accessToken!, officeId, selectedStage.id, {
                            expectedStageVersion: selectedStage.version,
                          }),
                          "Stage started.",
                        )}
                      >
                        Start stage
                      </button>
                    ) : null}
                    {hasAction("RESUME") ? (
                      <button
                        type="button"
                        disabled={mutating}
                        className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                        onClick={() => void runMutation(
                          () => resumeWorkRuntimeV3Stage(accessToken!, officeId, selectedStage.id, {
                            expectedStageVersion: selectedStage.version,
                          }),
                          "Stage resumed.",
                        )}
                      >
                        Resume stage
                      </button>
                    ) : null}
                  </div>

                  {selectedStage.availableActions.length === 0 ? (
                    <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No runtime action is available to your account for this stage.</p>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
