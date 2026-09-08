import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";

import { useAuth } from "../context/AuthContext";
import {
  cancelWorkRuntimeV3,
  completeWorkRuntimeV3,
  getWorkRuntimeV3,
  getWorkRuntimeV3Actions,
  reopenWorkRuntimeV3,
} from "../services/work-runtime-v3.service";
import type {
  WorkRuntimeV3Work,
  WorkRuntimeV3WorkAction,
} from "../types/work-runtime-v3";

const BRANCH_TIME_ZONE = "Asia/Kathmandu";

function formatDateTime(
  value: string | null,
  language: string,
  notSet: string,
): string {
  if (!value) return notSet;
  return new Intl.DateTimeFormat(language.startsWith("ne") ? "ne-NP" : "en-GB", {
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

function formatValue(
  value: unknown,
  notSet: string,
  yes: string,
  no: string,
): string {
  if (value === null || value === undefined || value === "") return notSet;
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? yes : no;
  return String(value);
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function WorkRuntimeV3DetailPage() {
  const { accessToken } = useAuth();
  const { t, i18n } = useTranslation("workspace");
  const { officeId = "", workItemId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const notSet = t("work.detail.notSet");
  const fromOversight = searchParams.get("source") === "oversight";
  const backPath = fromOversight ? "/work-oversight" : "/work";
  const [work, setWork] = useState<WorkRuntimeV3Work | null>(null);
  const [availableActions, setAvailableActions] = useState<WorkRuntimeV3WorkAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [completionNote, setCompletionNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [reopenStageId, setReopenStageId] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  useEffect(() => {
    if (!accessToken || !officeId || !workItemId) return;
    let active = true;
    const loadingTimer = window.setTimeout(() => {
      if (!active) return;
      setLoading(true);
      setError("");
    }, 0);

    Promise.all([
      getWorkRuntimeV3(accessToken, officeId, workItemId),
      getWorkRuntimeV3Actions(accessToken, officeId, workItemId),
    ])
      .then(([response, actions]) => {
        if (!active) return;
        setWork(response);
        setAvailableActions(actions);
        setReopenStageId((current) =>
          response.runtimeStages.some(
            (stage) => stage.id === current && stage.status === "COMPLETED",
          )
            ? current
            : response.runtimeStages.find((stage) => stage.status === "COMPLETED")?.id ?? "",
        );
      })
      .catch((requestError: unknown) => {
        if (active) {
          setWork(null);
          setAvailableActions([]);
          setError(getErrorMessage(requestError, t("work.detail.loadError")));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      window.clearTimeout(loadingTimer);
    };
  }, [accessToken, officeId, t, workItemId]);

  async function refreshWork() {
    if (!accessToken || !officeId || !workItemId) return;
    const [response, actions] = await Promise.all([
      getWorkRuntimeV3(accessToken, officeId, workItemId),
      getWorkRuntimeV3Actions(accessToken, officeId, workItemId),
    ]);
    setWork(response);
    setAvailableActions(actions);
    setReopenStageId((current) =>
      response.runtimeStages.some(
        (stage) => stage.id === current && stage.status === "COMPLETED",
      )
        ? current
        : response.runtimeStages.find((stage) => stage.status === "COMPLETED")?.id ?? "",
    );
  }

  async function runWorkMutation(
    operation: () => Promise<unknown>,
    message: string,
  ) {
    setMutating(true);
    setError("");
    setSuccess("");
    try {
      await operation();
      await refreshWork();
      setSuccess(message);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, t("work.detail.actionError")));
    } finally {
      setMutating(false);
    }
  }

  function handleComplete() {
    if (!accessToken || !work) return;
    void runWorkMutation(
      () =>
        completeWorkRuntimeV3(accessToken, officeId, workItemId, {
          expectedWorkVersion: work.version,
          note: completionNote.trim() || undefined,
        }),
      t("work.detail.completeSuccess"),
    );
  }

  function handleCancel() {
    if (!accessToken || !work) return;
    if (cancelReason.trim().length < 2) {
      setError(t("work.detail.cancelReasonRequired"));
      return;
    }
    void runWorkMutation(
      () =>
        cancelWorkRuntimeV3(accessToken, officeId, workItemId, {
          expectedWorkVersion: work.version,
          reason: cancelReason.trim(),
        }),
      t("work.detail.cancelSuccess"),
    );
  }

  function handleReopen() {
    if (!accessToken || !work) return;
    if (!reopenStageId) {
      setError(t("work.detail.reopenStageRequired"));
      return;
    }
    if (reopenReason.trim().length < 2) {
      setError(t("work.detail.reopenReasonRequired"));
      return;
    }
    void runWorkMutation(
      () =>
        reopenWorkRuntimeV3(accessToken, officeId, workItemId, {
          expectedWorkVersion: work.version,
          stageId: reopenStageId,
          reason: reopenReason.trim(),
        }),
      t("work.detail.reopenSuccess"),
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">{t("work.detail.eyebrow")}</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">{t("work.detail.title")}</h1>
            <p className="mt-2 text-sm text-slate-600">{t("work.detail.description")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50" to={backPath}>
              {fromOversight ? t("work.detail.backToOversight") : t("work.detail.back")}
            </Link>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div>
      ) : null}

      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{success}</div>
      ) : null}

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm" aria-live="polite">{t("work.detail.loading")}</div>
      ) : work ? (
        <>
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-sky-700">{work.ticketNumber}</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">{work.title}</h2>
                <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-600">{work.description || t("work.detail.noDescription")}</p>
              </div>
              <span className="w-fit rounded-full bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800">{t(`work.status.${work.runtimeStatus}`, { defaultValue: formatStatus(work.runtimeStatus) })}</span>
            </div>

            <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-3"><dt className="text-xs font-semibold text-slate-500">{t("work.detail.workType")}</dt><dd className="mt-1 text-sm font-bold text-slate-900">{work.workTypeVersion.name} · V{work.workTypeVersion.version}</dd></div>
              <div className="rounded-2xl bg-slate-50 p-3"><dt className="text-xs font-semibold text-slate-500">{t("work.detail.primaryOwner")}</dt><dd className="mt-1 text-sm font-bold text-slate-900">{work.primaryOwnerOrgUnit.name}</dd></div>
              <div className="rounded-2xl bg-slate-50 p-3"><dt className="text-xs font-semibold text-slate-500">{t("work.detail.opened")}</dt><dd className="mt-1 text-sm font-bold text-slate-900">{formatDateTime(work.openedAt, language, notSet)}</dd></div>
              <div className="rounded-2xl bg-slate-50 p-3"><dt className="text-xs font-semibold text-slate-500">{t("work.detail.due")}</dt><dd className="mt-1 text-sm font-bold text-slate-900">{formatDateTime(work.dueAt, language, notSet)}</dd></div>
            </dl>
          </section>

          {availableActions.length > 0 ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">{t("work.detail.actions")}</h2>
                  <p className="mt-1 text-sm text-slate-500">{t("work.detail.actionsDescription")}</p>
                </div>
                <p className="text-xs font-semibold text-slate-500">{t("work.detail.workVersion", { version: work.version })}</p>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                {availableActions.includes("COMPLETE") ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <h3 className="text-sm font-bold text-emerald-950">{t("work.detail.finalCompletion")}</h3>
                    <textarea className="mt-3 min-h-20 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500" onChange={(event) => setCompletionNote(event.target.value)} placeholder={t("work.detail.completionNote")} value={completionNote} />
                    <button className="mt-3 w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={mutating} onClick={handleComplete} type="button">{t("work.detail.complete")}</button>
                  </div>
                ) : null}
                {availableActions.includes("CANCEL") ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
                    <h3 className="text-sm font-bold text-rose-950">{t("work.detail.cancel")}</h3>
                    <textarea className="mt-3 min-h-20 w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-500" onChange={(event) => setCancelReason(event.target.value)} placeholder={t("work.detail.cancelReason")} value={cancelReason} />
                    <button className="mt-3 w-full rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={mutating} onClick={handleCancel} type="button">{t("work.detail.cancel")}</button>
                  </div>
                ) : null}
                {availableActions.includes("REOPEN") ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                    <h3 className="text-sm font-bold text-amber-950">{t("work.detail.reopen")}</h3>
                    <select className="mt-3 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-500" onChange={(event) => setReopenStageId(event.target.value)} value={reopenStageId}>
                      <option value="">{t("work.detail.chooseCompletedStage")}</option>
                      {work.runtimeStages.filter((stage) => stage.status === "COMPLETED").map((stage) => (
                        <option key={stage.id} value={stage.id}>{stage.name}</option>
                      ))}
                    </select>
                    <textarea className="mt-3 min-h-20 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500" onChange={(event) => setReopenReason(event.target.value)} placeholder={t("work.detail.reopenReason")} value={reopenReason} />
                    <button className="mt-3 w-full rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={mutating || !reopenStageId} onClick={handleReopen} type="button">{t("work.detail.reopenAction")}</button>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="space-y-5">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-lg font-bold text-slate-950">{t("work.detail.workflowStages")}</h2>
                <div className="mt-4 space-y-3">
                  {work.runtimeStages.map((stage, index) => (
                    <div key={stage.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold text-slate-500">{t("work.detail.stageNumber", { number: index + 1 })} · {stage.code}</p>
                          <p className="mt-1 text-sm font-bold text-slate-950">{stage.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{stage.responsibleOrgUnit.name}</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">{t(`work.stageStatus.${stage.status}`, { defaultValue: formatStatus(stage.status) })}</span>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
                        <span>{t("work.detail.ready")}: {formatDateTime(stage.readyAt, language, notSet)}</span>
                        <span>{t("work.detail.started")}: {formatDateTime(stage.startedAt, language, notSet)}</span>
                        <span>{t("work.detail.completed")}: {formatDateTime(stage.completedAt, language, notSet)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-lg font-bold text-slate-950">{t("work.detail.history")}</h2>
                <div className="mt-4 space-y-3">
                  {[...work.events].reverse().map((event) => (
                    <div key={event.id} className="border-l-2 border-sky-200 pl-4">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-bold text-slate-900">{formatStatus(event.eventType)}</p>
                        <p className="text-xs text-slate-500">{formatDateTime(event.createdAt, language, notSet)}</p>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {event.workStage ? `${event.workStage.name} · ` : ""}
                        {event.actor?.employee?.empName ?? event.actor?.username ?? t("work.detail.system")}
                      </p>
                      {event.fromStageStatus || event.toStageStatus ? (
                        <p className="mt-1 text-xs text-slate-600">{t("work.detail.stage")}: {event.fromStageStatus ? t(`work.stageStatus.${event.fromStageStatus}`, { defaultValue: formatStatus(event.fromStageStatus) }) : "—"} → {event.toStageStatus ? t(`work.stageStatus.${event.toStageStatus}`, { defaultValue: formatStatus(event.toStageStatus) }) : "—"}</p>
                      ) : null}
                      {event.fromWorkStatus || event.toWorkStatus ? (
                        <p className="mt-1 text-xs text-slate-600">{t("work.detail.work")}: {event.fromWorkStatus ? t(`work.status.${event.fromWorkStatus}`, { defaultValue: formatStatus(event.fromWorkStatus) }) : "—"} → {event.toWorkStatus ? t(`work.status.${event.toWorkStatus}`, { defaultValue: formatStatus(event.toWorkStatus) }) : "—"}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-lg font-bold text-slate-950">{t("work.detail.participants")}</h2>
                <div className="mt-4 space-y-2">
                  {work.orgUnitParticipants.map((participant) => (
                    <div key={participant.id} className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-sm font-bold text-slate-900">{participant.orgUnit.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatStatus(participant.role)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-lg font-bold text-slate-950">{t("work.detail.fields")}</h2>
                <dl className="mt-4 space-y-3">
                  {work.fieldValues.length === 0 ? <p className="text-sm text-slate-500">{t("work.detail.noFields")}</p> : null}
                  {work.fieldValues.map((field) => (
                    <div key={field.id} className="rounded-2xl bg-slate-50 p-3">
                      <dt className="text-xs font-semibold text-slate-500">{field.fieldDefinition.label}</dt>
                      <dd className="mt-1 break-words text-sm font-bold text-slate-900">{formatValue(field.value, notSet, t("work.detail.yes"), t("work.detail.no"))}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {work.references.length > 0 ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <h2 className="text-lg font-bold text-slate-950">{t("work.detail.references")}</h2>
                  <div className="mt-4 space-y-2">
                    {work.references.map((reference) => (
                      <div key={reference.id} className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs font-semibold text-slate-500">{formatStatus(reference.referenceType)}</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">{reference.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </>
      ) : !error ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          {t("work.detail.unavailable")}
        </section>
      ) : null}
    </main>
  );
}
