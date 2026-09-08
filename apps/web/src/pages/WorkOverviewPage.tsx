import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useAuth } from "../context/AuthContext";
import { getOrganizationOffices } from "../services/organization-v3.service";
import { listWorkRuntimeV3 } from "../services/work-runtime-v3.service";
import type {
  WorkRuntimeV3OverviewWork,
  WorkRuntimeV3Status,
} from "../types/work-runtime-v3";

const BRANCH_TIME_ZONE = "Asia/Kathmandu";

type OverviewStatusFilter = "ALL" | WorkRuntimeV3Status;
export type WorkOverviewVariant = "OPERATIONAL" | "OVERSIGHT";

interface WorkOverviewPageProps {
  variant?: WorkOverviewVariant;
}

const STATUS_FILTERS: WorkRuntimeV3Status[] = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
];

const ACTIVE_STAGE_STATUSES = new Set([
  "READY",
  "IN_PROGRESS",
  "BLOCKED",
  "SUBMITTED",
  "RETURNED",
]);

function formatDateTime(value: string | null, language: string): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    language.startsWith("ne") ? "ne-NP" : "en-GB",
    {
      timeZone: BRANCH_TIME_ZONE,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(new Date(value));
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function matchesSearch(work: WorkRuntimeV3OverviewWork, query: string): boolean {
  if (!query) {
    return true;
  }

  const searchable = [
    work.ticketNumber,
    work.title,
    work.workTypeVersion.name,
    work.workTypeVersion.workTypeDefinition.code,
    work.primaryOwnerOrgUnit.name,
    work.primaryOwnerOrgUnit.code,
  ]
    .join(" ")
    .toLocaleLowerCase();

  return searchable.includes(query);
}

export function WorkOverviewPage({
  variant = "OPERATIONAL",
}: WorkOverviewPageProps = {}) {
  const { accessToken } = useAuth();
  const { t, i18n } = useTranslation("workspace");
  const [offices, setOffices] = useState<
    Array<{ id: string; code: string; name: string }>
  >([]);
  const [officeId, setOfficeId] = useState("");
  const [works, setWorks] = useState<WorkRuntimeV3OverviewWork[]>([]);
  const [statusFilter, setStatusFilter] =
    useState<OverviewStatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [loadingOffices, setLoadingOffices] = useState(Boolean(accessToken));
  const [loadingWork, setLoadingWork] = useState(false);
  const [error, setError] = useState("");
  const isOversight = variant === "OVERSIGHT";

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let active = true;
    const loadingTimer = window.setTimeout(() => {
      if (!active) {
        return;
      }
      setLoadingOffices(true);
      setError("");
    }, 0);

    getOrganizationOffices(accessToken)
      .then((response) => {
        if (!active) {
          return;
        }

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
          setOffices([]);
          setOfficeId("");
          setError(
            getErrorMessage(
              requestError,
              t("work.overview.loadError"),
            ),
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoadingOffices(false);
        }
      });

    return () => {
      active = false;
      window.clearTimeout(loadingTimer);
    };
  }, [accessToken, t]);

  const loadWork = useCallback(async () => {
    if (!accessToken || !officeId) {
      setWorks([]);
      return;
    }

    setLoadingWork(true);
    setError("");

    try {
      const response = await listWorkRuntimeV3(accessToken, officeId);
      setWorks(response.data);
    } catch (requestError: unknown) {
      setWorks([]);
      setError(
        getErrorMessage(
          requestError,
          t("work.overview.loadError"),
        ),
      );
    } finally {
      setLoadingWork(false);
    }
  }, [accessToken, officeId, t]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadWork();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadWork]);

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredWorks = useMemo(
    () =>
      works.filter(
        (work) =>
          (statusFilter === "ALL" || work.runtimeStatus === statusFilter) &&
          matchesSearch(work, normalizedSearch),
      ),
    [normalizedSearch, statusFilter, works],
  );

  const selectedOffice = offices.find((office) => office.id === officeId) ?? null;

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">
              {t(isOversight ? "work.oversight.eyebrow" : "work.overview.eyebrow")}
            </p>
            <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">
              {t(isOversight ? "work.oversight.title" : "work.overview.title")}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {t(
                isOversight
                  ? "work.oversight.description"
                  : "work.overview.description",
              )}
            </p>
          </div>

          {!isOversight ? (
            <Link
              to="/work/create"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
            >
              {t("work.overview.create")}
            </Link>
          ) : null}
        </div>
      </section>

      {error ? (
        <section
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800"
        >
          {error}
        </section>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,0.8fr)_minmax(280px,1.4fr)_minmax(180px,0.7fr)_auto] xl:items-end">
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
            {t("work.overview.office")}
            <select
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              value={officeId}
              onChange={(event) => setOfficeId(event.target.value)}
              disabled={loadingOffices || offices.length === 0}
            >
              {offices.map((office) => (
                <option key={office.id} value={office.id}>
                  {office.name} ({office.code})
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
            {t("work.overview.search")}
            <input
              type="search"
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("work.overview.searchPlaceholder")}
            />
          </label>

          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
            {t("work.overview.status")}
            <select
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as OverviewStatusFilter)
              }
            >
              <option value="ALL">{t("work.overview.allStatuses")}</option>
              {STATUS_FILTERS.map((status) => (
                <option key={status} value={status}>
                  {t(`work.status.${status}`)}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void loadWork()}
            disabled={loadingWork || !officeId}
          >
            {loadingWork
              ? t("work.overview.refreshing")
              : t("work.overview.refresh")}
          </button>
        </div>
      </section>

      {loadingOffices ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          {t("work.overview.loading")}
        </section>
      ) : offices.length === 0 ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center text-sm font-medium text-amber-900">
          {t("work.overview.noOffice")}
        </section>
      ) : loadingWork ? (
        <section
          aria-live="polite"
          className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm"
        >
          {t("work.overview.loading")}
        </section>
      ) : works.length === 0 ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h2 className="text-base font-bold text-slate-900">
            {t("work.overview.empty")}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {selectedOffice?.name ?? ""}
          </p>
        </section>
      ) : (
        <section className="space-y-3">
          <div className="flex flex-col gap-1 px-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-slate-700">
              {t("work.overview.count", { count: filteredWorks.length })}
            </p>
            <p className="text-xs text-slate-500">
              {selectedOffice
                ? `${selectedOffice.name} (${selectedOffice.code})`
                : ""}
            </p>
          </div>

          {filteredWorks.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
              {t("work.overview.noMatches")}
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredWorks.map((work) => {
                const activeStage =
                  work.runtimeStages.find((stage) =>
                    ACTIVE_STAGE_STATUSES.has(stage.status),
                  ) ?? null;

                return (
                  <article
                    key={work.id}
                    className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-200 hover:shadow-md sm:p-5"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-800">
                            {work.ticketNumber}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                            {t(`work.status.${work.runtimeStatus}`)}
                          </span>
                          {!isOversight && work.availableActions.length > 0 ? (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">
                              {t("work.overview.actionsAvailable", {
                                count: work.availableActions.length,
                              })}
                            </span>
                          ) : null}
                        </div>

                        <h2 className="mt-3 text-lg font-bold text-slate-950">
                          {work.title}
                        </h2>

                        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
                          <div>
                            <dt className="text-xs font-semibold text-slate-500">
                              {t("work.overview.workType")}
                            </dt>
                            <dd className="mt-1 font-semibold text-slate-900">
                              {work.workTypeVersion.name}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold text-slate-500">
                              {t("work.overview.owner")}
                            </dt>
                            <dd className="mt-1 font-semibold text-slate-900">
                              {work.primaryOwnerOrgUnit.name}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold text-slate-500">
                              {t("work.overview.stage")}
                            </dt>
                            <dd className="mt-1 font-semibold text-slate-900">
                              {activeStage?.name ??
                                t("work.overview.noActiveStage")}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold text-slate-500">
                              {t("work.overview.opened")}
                            </dt>
                            <dd className="mt-1 font-semibold text-slate-900">
                              {formatDateTime(
                                work.openedAt,
                                i18n.resolvedLanguage ?? i18n.language,
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold text-slate-500">
                              {t("work.overview.due")}
                            </dt>
                            <dd className="mt-1 font-semibold text-slate-900">
                              {formatDateTime(
                                work.dueAt,
                                i18n.resolvedLanguage ?? i18n.language,
                              )}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <Link
                        to={
                          isOversight
                            ? `/work/${work.officeId}/${work.id}?source=oversight`
                            : `/work/${work.officeId}/${work.id}`
                        }
                        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-bold text-sky-800 transition hover:bg-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
                      >
                        {t("work.overview.open")}
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
