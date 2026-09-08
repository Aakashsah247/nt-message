import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useAuth } from "../context/AuthContext";
import { getOrganizationOffices } from "../services/organization-v3.service";
import {
  downloadLegacyDutyReportCsv,
  downloadWorkReportV3Csv,
  getLegacyDutyReportPage,
  getWorkReportV3Context,
  getWorkReportV3DutyCompatibility,
  getWorkReportV3Overview,
  getWorkReportV3PrintPayload,
  getWorkReportV3StageAnalysis,
  getWorkReportV3TechnicalPerformance,
  getWorkReportV3WorkRecords,
} from "../services/work-reports-v3.service";
import type {
  WorkReportLegacyDutyQuery,
  WorkReportLegacyDutyResponse,
  WorkReportLegacyDutyRow,
  WorkReportV3Context,
  WorkReportV3ExportDataset,
  WorkReportV3Overview,
  WorkReportV3PrintPayload,
  WorkReportV3Query,
  WorkReportV3RuntimeStatus,
  WorkReportV3ScopeType,
  WorkReportV3SlaState,
  WorkReportV3StageAnalysis,
  WorkReportV3StageAnalysisRow,
  WorkReportV3StageStatus,
  WorkReportV3TechnicalPerformance,
  WorkReportV3TechnicalPerformanceRow,
  WorkReportV3WorkRecord,
  WorkReportV3WorkRecords,
} from "../types/work-reports-v3";

const BRANCH_TIME_ZONE = "Asia/Kathmandu";
const PAGE_SIZE = 25;

type ReportView =
  | "OVERVIEW"
  | "TECHNICAL_PERFORMANCE"
  | "WORK_RECORDS"
  | "STAGE_SLA"
  | "DUTY";
type PeriodChoice = "TODAY" | "WEEK" | "MONTH" | "CUSTOM";
type OverviewKpiKey =
  | "total"
  | "open"
  | "inProgress"
  | "waiting"
  | "blocked"
  | "completed"
  | "cancelled"
  | "overdue"
  | "dueSoon";
type ReportColumnKey =
  | "sn"
  | "ticket"
  | "workType"
  | "ownerTeam"
  | "reference"
  | "date"
  | "status"
  | "actions"
  | "orgUnit"
  | "primaryOwner"
  | "participant"
  | "stages"
  | "completed"
  | "overdue"
  | "orgUnitTeam"
  | "supportStaff"
  | "otherStaff"
  | "pending"
  | "serviceToken"
  | "stage"
  | "responsibleOrgUnit"
  | "team"
  | "stageStatus"
  | "stageSla"
  | "workSla"
  | "active"
  | "waiting"
  | "blocked"
  | "employee"
  | "shift"
  | "department"
  | "location";
type ReportTranslation = ReturnType<typeof useTranslation>["t"];

const V3_VIEWS: Array<{ id: ReportView; dataset: WorkReportV3ExportDataset | null }> = [
  { id: "OVERVIEW", dataset: "OVERVIEW" },
  { id: "TECHNICAL_PERFORMANCE", dataset: "TECHNICAL_PERFORMANCE" },
  { id: "WORK_RECORDS", dataset: "WORK_RECORDS" },
  { id: "STAGE_SLA", dataset: "STAGE_SLA" },
  { id: "DUTY", dataset: null },
];

const RUNTIME_STATUSES: WorkReportV3RuntimeStatus[] = [
  "DRAFT",
  "OPEN",
  "IN_PROGRESS",
  "WAITING",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
];

const STAGE_STATUSES: WorkReportV3StageStatus[] = [
  "PENDING",
  "READY",
  "IN_PROGRESS",
  "BLOCKED",
  "SUBMITTED",
  "RETURNED",
  "COMPLETED",
  "SKIPPED",
  "CANCELLED",
];

const SLA_STATES: WorkReportV3SlaState[] = ["ON_TRACK", "DUE_SOON", "OVERDUE"];

function reportViewLabel(view: ReportView, t: ReportTranslation): string {
  switch (view) {
    case "OVERVIEW": return t("reports:tabs.OVERVIEW");
    case "TECHNICAL_PERFORMANCE": return t("reports:tabs.TECHNICAL_PERFORMANCE");
    case "WORK_RECORDS": return t("reports:tabs.WORK_RECORDS");
    case "STAGE_SLA": return t("reports:tabs.STAGE_SLA");
    case "DUTY": return t("reports:tabs.DUTY");
  }
}

function periodLabel(choice: PeriodChoice, t: ReportTranslation): string {
  switch (choice) {
    case "TODAY": return t("reports:period.TODAY");
    case "WEEK": return t("reports:period.WEEK");
    case "MONTH": return t("reports:period.MONTH");
    case "CUSTOM": return t("reports:period.CUSTOM");
  }
}

function scopeTypeLabel(type: WorkReportV3ScopeType, t: ReportTranslation): string {
  switch (type) {
    case "PERSONAL": return t("reports:scope.PERSONAL");
    case "TEAM": return t("reports:scope.TEAM");
    case "ORG_UNIT": return t("reports:scope.ORG_UNIT");
    case "ORG_UNIT_SUBTREE": return t("reports:scope.ORG_UNIT_SUBTREE");
    case "OFFICE": return t("reports:scope.OFFICE");
  }
}

function runtimeStatusLabel(status: WorkReportV3RuntimeStatus, t: ReportTranslation): string {
  switch (status) {
    case "DRAFT": return t("reports:status.runtime.DRAFT");
    case "OPEN": return t("reports:status.runtime.OPEN");
    case "IN_PROGRESS": return t("reports:status.runtime.IN_PROGRESS");
    case "WAITING": return t("reports:status.runtime.WAITING");
    case "BLOCKED": return t("reports:status.runtime.BLOCKED");
    case "COMPLETED": return t("reports:status.runtime.COMPLETED");
    case "CANCELLED": return t("reports:status.runtime.CANCELLED");
  }
}

function stageStatusLabel(status: WorkReportV3StageStatus, t: ReportTranslation): string {
  switch (status) {
    case "PENDING": return t("reports:status.stage.PENDING");
    case "READY": return t("reports:status.stage.READY");
    case "IN_PROGRESS": return t("reports:status.stage.IN_PROGRESS");
    case "BLOCKED": return t("reports:status.stage.BLOCKED");
    case "SUBMITTED": return t("reports:status.stage.SUBMITTED");
    case "RETURNED": return t("reports:status.stage.RETURNED");
    case "COMPLETED": return t("reports:status.stage.COMPLETED");
    case "SKIPPED": return t("reports:status.stage.SKIPPED");
    case "CANCELLED": return t("reports:status.stage.CANCELLED");
  }
}

function slaStateLabel(status: WorkReportV3SlaState, t: ReportTranslation): string {
  switch (status) {
    case "ON_TRACK": return t("reports:status.sla.ON_TRACK");
    case "DUE_SOON": return t("reports:status.sla.DUE_SOON");
    case "OVERDUE": return t("reports:status.sla.OVERDUE");
  }
}

function overviewKpiLabel(key: OverviewKpiKey, t: ReportTranslation): string {
  switch (key) {
    case "total": return t("reports:overview.kpi.total");
    case "open": return t("reports:overview.kpi.open");
    case "inProgress": return t("reports:overview.kpi.inProgress");
    case "waiting": return t("reports:overview.kpi.waiting");
    case "blocked": return t("reports:overview.kpi.blocked");
    case "completed": return t("reports:overview.kpi.completed");
    case "cancelled": return t("reports:overview.kpi.cancelled");
    case "overdue": return t("reports:overview.kpi.overdue");
    case "dueSoon": return t("reports:overview.kpi.dueSoon");
  }
}

function printTitleLabel(view: ReportView, t: ReportTranslation): string {
  switch (view) {
    case "OVERVIEW": return t("reports:print.title.OVERVIEW");
    case "TECHNICAL_PERFORMANCE": return t("reports:print.title.TECHNICAL_PERFORMANCE");
    case "WORK_RECORDS": return t("reports:print.title.WORK_RECORDS");
    case "STAGE_SLA": return t("reports:print.title.STAGE_SLA");
    case "DUTY": return t("reports:print.title.DUTY");
  }
}

function columnLabel(key: ReportColumnKey, t: ReportTranslation): string {
  switch (key) {
    case "sn": return t("reports:columns.sn");
    case "ticket": return t("reports:columns.ticket");
    case "workType": return t("reports:columns.workType");
    case "ownerTeam": return t("reports:columns.ownerTeam");
    case "reference": return t("reports:columns.reference");
    case "date": return t("reports:columns.date");
    case "status": return t("reports:columns.status");
    case "actions": return t("reports:columns.actions");
    case "orgUnit": return t("reports:columns.orgUnit");
    case "primaryOwner": return t("reports:columns.primaryOwner");
    case "participant": return t("reports:columns.participant");
    case "stages": return t("reports:columns.stages");
    case "completed": return t("reports:columns.completed");
    case "overdue": return t("reports:columns.overdue");
    case "orgUnitTeam": return t("reports:columns.orgUnitTeam");
    case "supportStaff": return t("reports:columns.supportStaff");
    case "otherStaff": return t("reports:columns.otherStaff");
    case "pending": return t("reports:columns.pending");
    case "serviceToken": return t("reports:columns.serviceToken");
    case "stage": return t("reports:columns.stage");
    case "responsibleOrgUnit": return t("reports:columns.responsibleOrgUnit");
    case "team": return t("reports:columns.team");
    case "stageStatus": return t("reports:columns.stageStatus");
    case "stageSla": return t("reports:columns.stageSla");
    case "workSla": return t("reports:columns.workSla");
    case "active": return t("reports:columns.active");
    case "waiting": return t("reports:columns.waiting");
    case "blocked": return t("reports:columns.blocked");
    case "employee": return t("reports:columns.employee");
    case "shift": return t("reports:columns.shift");
    case "department": return t("reports:columns.department");
    case "location": return t("reports:columns.location");
  }
}

function toDateInput(value: Date): string {
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function periodDates(choice: Exclude<PeriodChoice, "CUSTOM">): { from: string; to: string } {
  const today = new Date();
  const to = toDateInput(today);
  if (choice === "WEEK") {
    const from = new Date(today);
    from.setDate(from.getDate() - from.getDay());
    return { from: toDateInput(from), to };
  }
  if (choice === "MONTH") {
    return { from: toDateInput(new Date(today.getFullYear(), today.getMonth(), 1)), to };
  }
  return { from: to, to };
}

function formatDate(value: string | null | undefined, language: string): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00+05:45` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language.startsWith("ne") ? "ne-NP" : "en-GB", {
    timeZone: BRANCH_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null | undefined, language: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language.startsWith("ne") ? "ne-NP" : "en-GB", {
    timeZone: BRANCH_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatMinutes(
  value: number,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (value < 60) return t("reports:time.minutes", { minutes: value });
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes
    ? t("reports:time.hoursMinutes", { hours, minutes })
    : t("reports:time.hours", { hours });
}

function personList(
  people: Array<{ name: string; employeeId: string | null }>,
): string {
  if (people.length === 0) return "—";
  return people
    .map((person) => (person.employeeId ? `${person.name} (${person.employeeId})` : person.name))
    .join(", ");
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function cleanQuery(query: WorkReportV3Query): WorkReportV3Query {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== "" && value !== undefined),
  ) as WorkReportV3Query;
}

function statusTone(status: string): string {
  switch (status) {
    case "COMPLETED":
    case "ON_TRACK":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "OVERDUE":
    case "BLOCKED":
    case "CANCELLED":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "DUE_SOON":
    case "WAITING":
    case "SUBMITTED":
    case "RETURNED":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "IN_PROGRESS":
    case "READY":
      return "border-sky-200 bg-sky-50 text-sky-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function StatusPill({ label, status }: { label: string; status: string }) {
  return (
    <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone(status)}`}>
      {label}
    </span>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
  previousLabel,
  nextLabel,
  pageLabel,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  previousLabel: string;
  nextLabel: string;
  pageLabel: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-semibold text-slate-600">{pageLabel}</span>
      <div className="flex gap-2">
        <button
          type="button"
          className="min-h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
        >
          {previousLabel}
        </button>
        <button
          type="button"
          className="min-h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}

async function loadAllDutyRows(
  accessToken: string,
  query: WorkReportLegacyDutyQuery,
): Promise<WorkReportLegacyDutyResponse> {
  const first = await getLegacyDutyReportPage(accessToken, {
    ...query,
    page: 1,
    limit: 100,
  });
  const section = first.sections.duty;
  if (!section || section.pagination.totalPages <= 1) return first;

  const rows = [...section.rows];
  for (let page = 2; page <= section.pagination.totalPages; page += 1) {
    const next = await getLegacyDutyReportPage(accessToken, {
      ...query,
      page,
      limit: 100,
    });
    rows.push(...(next.sections.duty?.rows ?? []));
  }
  return {
    ...first,
    sections: {
      ...first.sections,
      duty: { ...section, rows },
    },
  };
}

export function WorkReportsPage() {
  const { account, accessToken } = useAuth();
  const { t, i18n } = useTranslation("reports");
  const today = useMemo(() => toDateInput(new Date()), []);
  const [offices, setOffices] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [officeId, setOfficeId] = useState("");
  const [context, setContext] = useState<WorkReportV3Context | null>(null);
  const [view, setView] = useState<ReportView>("OVERVIEW");
  const [periodChoice, setPeriodChoice] = useState<PeriodChoice>("TODAY");
  const [draft, setDraft] = useState<WorkReportV3Query>({ from: today, to: today, search: "" });
  const [applied, setApplied] = useState<WorkReportV3Query>({ from: today, to: today });
  const [overview, setOverview] = useState<WorkReportV3Overview | null>(null);
  const [records, setRecords] = useState<WorkReportV3WorkRecords | null>(null);
  const [technical, setTechnical] = useState<WorkReportV3TechnicalPerformance | null>(null);
  const [stageAnalysis, setStageAnalysis] = useState<WorkReportV3StageAnalysis | null>(null);
  const [duty, setDuty] = useState<WorkReportLegacyDutyResponse | null>(null);
  const [recordsPage, setRecordsPage] = useState(1);
  const [stagePage, setStagePage] = useState(1);
  const [dutyPage, setDutyPage] = useState(1);
  const [loadingOffices, setLoadingOffices] = useState(Boolean(accessToken));
  const [loadingContext, setLoadingContext] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preparingPrint, setPreparingPrint] = useState(false);
  const [printPayload, setPrintPayload] = useState<WorkReportV3PrintPayload | null>(null);
  const [printDuty, setPrintDuty] = useState<WorkReportLegacyDutyResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    const timeoutId = window.setTimeout(() => {
      if (!active) return;
      setLoadingOffices(true);
      void getOrganizationOffices(accessToken)
        .then((response) => {
          if (!active) return;
          const visible = response.data
            .filter((office) => office.isActive)
            .map((office) => ({ id: office.id, code: office.code, name: office.name }));
          setOffices(visible);
          setOfficeId((current) =>
            visible.some((office) => office.id === current) ? current : (visible[0]?.id ?? ""),
          );
        })
        .catch((requestError: unknown) => {
          if (!active) return;
          setError(getErrorMessage(requestError, t("reports:errors.offices")));
        })
        .finally(() => {
          if (active) setLoadingOffices(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [accessToken, t]);

  useEffect(() => {
    let active = true;
    const timeoutId = window.setTimeout(() => {
      if (!active) return;
      if (!accessToken || !officeId) {
        setContext(null);
        setLoadingContext(false);
        return;
      }

      setContext(null);
      setOverview(null);
      setRecords(null);
      setTechnical(null);
      setStageAnalysis(null);
      setDuty(null);
      setRecordsPage(1);
      setStagePage(1);
      setDutyPage(1);
      setLoadingContext(true);
      setError("");
      void Promise.all([
        getWorkReportV3Context(accessToken, officeId),
        getWorkReportV3DutyCompatibility(accessToken, officeId),
      ])
        .then(([reportContext]) => {
          if (!active) return;
          setContext(reportContext);
        })
        .catch((requestError: unknown) => {
          if (!active) return;
          setContext(null);
          setError(getErrorMessage(requestError, t("reports:errors.context")));
        })
        .finally(() => {
          if (active) setLoadingContext(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [accessToken, officeId, t]);

  const resetPages = useCallback(() => {
    setRecordsPage(1);
    setStagePage(1);
    setDutyPage(1);
  }, []);

  const loadReport = useCallback(async (
    nextView: ReportView = view,
    nextRecordsPage = recordsPage,
    nextStagePage = stagePage,
    nextDutyPage = dutyPage,
  ) => {
    if (!accessToken || !officeId || !context?.scope.availableActions.view) return;
    setLoadingReport(true);
    setError("");
    setNotice("");
    try {
      const query = cleanQuery(applied);
      if (nextView === "OVERVIEW") {
        setOverview(await getWorkReportV3Overview(accessToken, officeId, query));
      } else if (nextView === "WORK_RECORDS") {
        setRecords(await getWorkReportV3WorkRecords(accessToken, officeId, {
          ...query,
          page: nextRecordsPage,
          limit: PAGE_SIZE,
        }));
      } else if (nextView === "TECHNICAL_PERFORMANCE") {
        setTechnical(await getWorkReportV3TechnicalPerformance(accessToken, officeId, query));
      } else if (nextView === "STAGE_SLA") {
        setStageAnalysis(await getWorkReportV3StageAnalysis(accessToken, officeId, {
          ...query,
          page: nextStagePage,
          limit: PAGE_SIZE,
        }));
      } else {
        setDuty(await getLegacyDutyReportPage(accessToken, {
          from: query.from,
          to: query.to,
          search: query.search,
          page: nextDutyPage,
          limit: PAGE_SIZE,
        }));
      }
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, t("reports:errors.report")));
    } finally {
      setLoadingReport(false);
    }
  }, [accessToken, applied, context?.scope.availableActions.view, dutyPage, officeId, recordsPage, stagePage, t, view]);

  useEffect(() => {
    if (!context?.scope.availableActions.view) return;
    const timer = window.setTimeout(() => {
      void loadReport();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [context?.scope.availableActions.view, loadReport, view]);

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    const next = cleanQuery(draft);
    setApplied(next);
    resetPages();
  };

  const choosePeriod = (choice: PeriodChoice) => {
    setPeriodChoice(choice);
    if (choice === "CUSTOM") return;
    const range = periodDates(choice);
    setDraft((current) => ({ ...current, ...range }));
  };

  const changeView = (nextView: ReportView) => {
    setView(nextView);
    setError("");
    setNotice("");
    if (nextView === "WORK_RECORDS") setRecordsPage(1);
    if (nextView === "STAGE_SLA") setStagePage(1);
    if (nextView === "DUTY") setDutyPage(1);
  };

  const currentDataset = V3_VIEWS.find((item) => item.id === view)?.dataset ?? null;
  const canExport = Boolean(context?.scope.availableActions.export);
  const visibleViews = account?.role === "EMPLOYEE"
    ? V3_VIEWS.filter((item) => item.id !== "DUTY")
    : V3_VIEWS;

  const exportCsv = async () => {
    if (!accessToken || !officeId || !canExport) return;
    setExporting(true);
    setError("");
    setNotice("");
    try {
      if (view === "DUTY") {
        const filename = await downloadLegacyDutyReportCsv(accessToken, {
          from: applied.from,
          to: applied.to,
          search: applied.search,
        });
        setNotice(t("reports:notices.exported", { filename }));
      } else if (currentDataset) {
        const filename = await downloadWorkReportV3Csv(
          accessToken,
          officeId,
          currentDataset,
          cleanQuery(applied),
        );
        setNotice(t("reports:notices.exported", { filename }));
      }
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, t("reports:errors.export")));
    } finally {
      setExporting(false);
    }
  };

  const printReport = async () => {
    if (!accessToken || !officeId || !canExport) return;
    setPreparingPrint(true);
    setError("");
    setNotice("");
    try {
      if (view === "DUTY") {
        const allDuty = await loadAllDutyRows(accessToken, {
          from: applied.from,
          to: applied.to,
          search: applied.search,
        });
        setPrintDuty(allDuty);
        setPrintPayload(null);
      } else if (currentDataset) {
        const payload = await getWorkReportV3PrintPayload(
          accessToken,
          officeId,
          currentDataset,
          cleanQuery(applied),
        );
        setPrintPayload(payload);
        setPrintDuty(null);
      }
      window.setTimeout(() => window.print(), 80);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, t("reports:errors.print")));
    } finally {
      setPreparingPrint(false);
    }
  };

  const selectedOffice = offices.find((office) => office.id === officeId) ?? null;
  const scopeLabel = context ? scopeTypeLabel(context.scope.type, t) : "";

  return (
    <>
      <main className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5 print:hidden sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">{t("reports:eyebrow")}</p>
              <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">{t("reports:title")}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{t("reports:description")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
              {selectedOffice ? (
                <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-sky-800">
                  {selectedOffice.name} ({selectedOffice.code})
                </span>
              ) : null}
              {scopeLabel ? (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{scopeLabel}</span>
              ) : null}
            </div>
          </div>
        </section>

        {error ? (
          <section role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </section>
        ) : null}
        {notice ? (
          <section role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {notice}
          </section>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5" role="tablist" aria-label={t("reports:tabs.label")}>
            {visibleViews.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={view === item.id}
                className={`min-h-11 rounded-2xl px-3 py-2 text-sm font-bold transition ${
                  view === item.id
                    ? "bg-sky-700 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
                onClick={() => changeView(item.id)}
              >
                {reportViewLabel(item.id, t)}
              </button>
            ))}
          </div>
        </section>

        <form onSubmit={applyFilters} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                {t("reports:filters.office")}
                <select
                  className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  value={officeId}
                  onChange={(event) => setOfficeId(event.target.value)}
                  disabled={loadingOffices || offices.length === 0}
                >
                  {offices.map((office) => (
                    <option key={office.id} value={office.id}>{office.name} ({office.code})</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                {t("reports:filters.from")}
                <input
                  type="date"
                  className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  value={draft.from ?? ""}
                  onChange={(event) => {
                    setPeriodChoice("CUSTOM");
                    setDraft((current) => ({ ...current, from: event.target.value }));
                  }}
                />
              </label>

              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                {t("reports:filters.to")}
                <input
                  type="date"
                  className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  value={draft.to ?? ""}
                  onChange={(event) => {
                    setPeriodChoice("CUSTOM");
                    setDraft((current) => ({ ...current, to: event.target.value }));
                  }}
                />
              </label>

              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                {t("reports:filters.search")}
                <input
                  type="search"
                  className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  value={draft.search ?? ""}
                  onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))}
                  placeholder={t("reports:filters.searchPlaceholder")}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              {(["TODAY", "WEEK", "MONTH", "CUSTOM"] as PeriodChoice[]).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className={`min-h-10 rounded-xl border px-3 text-xs font-bold transition ${
                    periodChoice === choice
                      ? "border-sky-700 bg-sky-700 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  onClick={() => choosePeriod(choice)}
                >
                  {periodLabel(choice, t)}
                </button>
              ))}
            </div>
          </div>

          {view !== "DUTY" ? (
            <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
              <summary className="cursor-pointer text-sm font-bold text-slate-700">{t("reports:filters.more")}</summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {context?.filters.canFilterByOrgUnit ? (
                  <>
                    <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                      {t("reports:filters.primaryOwner")}
                      <select className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm" value={draft.orgUnitId ?? ""} onChange={(event) => setDraft((current) => ({ ...current, orgUnitId: event.target.value }))}>
                        <option value="">{t("reports:filters.all")}</option>
                        {context.filters.orgUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.code})</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                      {t("reports:filters.participant")}
                      <select className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm" value={draft.participantOrgUnitId ?? ""} onChange={(event) => setDraft((current) => ({ ...current, participantOrgUnitId: event.target.value }))}>
                        <option value="">{t("reports:filters.all")}</option>
                        {context.filters.orgUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.code})</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                      {t("reports:filters.responsibleOrgUnit")}
                      <select className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm" value={draft.responsibleOrgUnitId ?? ""} onChange={(event) => setDraft((current) => ({ ...current, responsibleOrgUnitId: event.target.value }))}>
                        <option value="">{t("reports:filters.all")}</option>
                        {context.filters.orgUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.code})</option>)}
                      </select>
                    </label>
                  </>
                ) : null}

                {context?.filters.canFilterByOperationalTeam ? (
                  <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                    {t("reports:filters.team")}
                    <select className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm" value={draft.operationalTeamId ?? ""} onChange={(event) => setDraft((current) => ({ ...current, operationalTeamId: event.target.value }))}>
                      <option value="">{t("reports:filters.all")}</option>
                      {context.filters.operationalTeams.filter((team) => team.isActive && !team.archivedAt).map((team) => <option key={team.id} value={team.id}>{team.name} ({team.code})</option>)}
                    </select>
                  </label>
                ) : null}

                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  {t("reports:filters.workType")}
                  <select className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm" value={draft.workTypeId ?? ""} onChange={(event) => setDraft((current) => ({ ...current, workTypeId: event.target.value }))}>
                    <option value="">{t("reports:filters.all")}</option>
                    {context?.filters.workTypes.filter((workType) => workType.isActive).map((workType) => <option key={workType.id} value={workType.id}>{workType.name}</option>)}
                  </select>
                </label>

                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  {t("reports:filters.workStatus")}
                  <select className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm" value={draft.runtimeStatus ?? ""} onChange={(event) => setDraft((current) => ({ ...current, runtimeStatus: (event.target.value || undefined) as WorkReportV3RuntimeStatus | undefined }))}>
                    <option value="">{t("reports:filters.all")}</option>
                    {RUNTIME_STATUSES.map((status) => <option key={status} value={status}>{runtimeStatusLabel(status, t)}</option>)}
                  </select>
                </label>

                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  {t("reports:filters.stageStatus")}
                  <select className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm" value={draft.stageStatus ?? ""} onChange={(event) => setDraft((current) => ({ ...current, stageStatus: (event.target.value || undefined) as WorkReportV3StageStatus | undefined }))}>
                    <option value="">{t("reports:filters.all")}</option>
                    {STAGE_STATUSES.map((status) => <option key={status} value={status}>{stageStatusLabel(status, t)}</option>)}
                  </select>
                </label>

                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  {t("reports:filters.sla")}
                  <select className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm" value={draft.slaState ?? ""} onChange={(event) => setDraft((current) => ({ ...current, slaState: (event.target.value || undefined) as WorkReportV3SlaState | undefined }))}>
                    <option value="">{t("reports:filters.all")}</option>
                    {SLA_STATES.map((status) => <option key={status} value={status}>{slaStateLabel(status, t)}</option>)}
                  </select>
                </label>
              </div>
            </details>
          ) : null}

          <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs font-medium text-slate-500">
              {context ? t("reports:scope.context", { scope: scopeLabel }) : t("reports:scope.loading")}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="min-h-11 rounded-xl bg-sky-700 px-5 text-sm font-bold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loadingContext || loadingReport || !context?.scope.availableActions.view}
              >
                {loadingReport ? t("reports:actions.loading") : t("reports:actions.apply")}
              </button>
              <button
                type="button"
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void exportCsv()}
                disabled={!canExport || exporting || loadingReport}
              >
                {exporting ? t("reports:actions.exporting") : t("reports:actions.csv")}
              </button>
              <button
                type="button"
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void printReport()}
                disabled={!canExport || preparingPrint || loadingReport}
              >
                {preparingPrint ? t("reports:actions.preparingPrint") : t("reports:actions.print")}
              </button>
            </div>
          </div>
        </form>

        {loadingOffices || loadingContext || (loadingReport && !overview && !records && !technical && !stageAnalysis && !duty) ? (
          <section role="status" aria-live="polite" className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm font-medium text-slate-500 shadow-sm">
            {t("reports:states.loading")}
          </section>
        ) : !context?.scope.availableActions.view ? (
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center">
            <h2 className="text-base font-bold text-amber-950">{t("reports:states.noPermissionTitle")}</h2>
            <p className="mt-2 text-sm text-amber-800">{t("reports:states.noPermission")}</p>
          </section>
        ) : (
          <ReportContent
            view={view}
            officeId={officeId}
            accountRole={account?.role}
            overview={overview}
            records={records}
            technical={technical}
            stageAnalysis={stageAnalysis}
            duty={duty}
            language={i18n.resolvedLanguage ?? i18n.language}
            t={t}
            onRecordsPage={setRecordsPage}
            onStagePage={setStagePage}
            onDutyPage={setDutyPage}
          />
        )}
      </main>

      <PrintableReport
        view={view}
        payload={printPayload}
        duty={printDuty}
        office={selectedOffice}
        period={{ from: applied.from ?? null, to: applied.to ?? null }}
        language={i18n.resolvedLanguage ?? i18n.language}
        t={t}
      />
    </>
  );
}

function ReportContent({
  view,
  officeId,
  accountRole,
  overview,
  records,
  technical,
  stageAnalysis,
  duty,
  language,
  t,
  onRecordsPage,
  onStagePage,
  onDutyPage,
}: {
  view: ReportView;
  officeId: string;
  accountRole: string | undefined;
  overview: WorkReportV3Overview | null;
  records: WorkReportV3WorkRecords | null;
  technical: WorkReportV3TechnicalPerformance | null;
  stageAnalysis: WorkReportV3StageAnalysis | null;
  duty: WorkReportLegacyDutyResponse | null;
  language: string;
  t: ReturnType<typeof useTranslation>["t"];
  onRecordsPage: (page: number) => void;
  onStagePage: (page: number) => void;
  onDutyPage: (page: number) => void;
}) {
  if (view === "OVERVIEW") {
    if (!overview) return <EmptyState t={t} />;
    const cards = [
      ["total", overview.totalWork, "border-sky-200 bg-sky-50"],
      ["open", overview.statuses.OPEN, "border-indigo-200 bg-indigo-50"],
      ["inProgress", overview.statuses.IN_PROGRESS, "border-cyan-200 bg-cyan-50"],
      ["waiting", overview.statuses.WAITING, "border-amber-200 bg-amber-50"],
      ["blocked", overview.statuses.BLOCKED, "border-rose-200 bg-rose-50"],
      ["completed", overview.statuses.COMPLETED, "border-emerald-200 bg-emerald-50"],
      ["cancelled", overview.statuses.CANCELLED, "border-slate-200 bg-slate-50"],
      ["overdue", overview.sla.overdue, "border-rose-200 bg-rose-50"],
      ["dueSoon", overview.sla.dueSoon, "border-amber-200 bg-amber-50"],
    ] as const;
    return (
      <div className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {cards.map(([key, value, tone]) => (
            <article key={key} className={`rounded-2xl border p-4 ${tone}`}>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-600">{overviewKpiLabel(key, t)}</p>
              <strong className="mt-2 block text-2xl font-black text-slate-950">{value}</strong>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-bold text-slate-950">{t("reports:overview.organizationTitle")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("reports:overview.organizationDescription")}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t("reports:columns.orgUnit")}</th>
                  <th className="px-4 py-3 text-right">{t("reports:columns.primaryOwner")}</th>
                  <th className="px-4 py-3 text-right">{t("reports:columns.participant")}</th>
                  <th className="px-4 py-3 text-right">{t("reports:columns.stages")}</th>
                  <th className="px-4 py-3 text-right">{t("reports:columns.completed")}</th>
                  <th className="px-4 py-3 text-right">{t("reports:columns.overdue")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.organizationPerformance.length ? overview.organizationPerformance.map((row) => (
                  <tr key={row.orgUnit.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3"><strong className="text-slate-900">{row.orgUnit.name}</strong><small className="ml-2 text-slate-500">{row.orgUnit.code}</small></td>
                    <td className="px-4 py-3 text-right font-semibold">{row.primaryOwnerWork}</td>
                    <td className="px-4 py-3 text-right font-semibold">{row.participantWork}</td>
                    <td className="px-4 py-3 text-right font-semibold">{row.responsibleStages}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">{row.completedWork}</td>
                    <td className="px-4 py-3 text-right font-semibold text-rose-700">{row.overdueWork}</td>
                  </tr>
                )) : <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={6}>{t("reports:states.empty")}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {overview.teamExecution.length ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-950">{t("reports:overview.teamTitle")}</h2>
                <p className="mt-1 text-sm text-slate-500">{t("reports:overview.teamDescription")}</p>
              </div>
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("reports:overview.teamExecutionOnly")}</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {overview.teamExecution.map((row) => (
                <article key={row.operationalTeam.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <strong className="block text-sm text-slate-900">{row.operationalTeam.name}</strong>
                  <span className="mt-1 block text-xs text-slate-500">{row.operationalTeam.code}</span>
                  <span className="mt-3 block text-xl font-black text-sky-700">{row.workCount}</span>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  if (view === "WORK_RECORDS") {
    if (!records) return <EmptyState t={t} />;
    return (
      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-950">{t("reports:records.title")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("reports:records.count", { count: records.total })}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t("reports:columns.ticket")}</th>
                <th className="px-4 py-3">{t("reports:columns.workType")}</th>
                <th className="px-4 py-3">{t("reports:columns.ownerTeam")}</th>
                <th className="px-4 py-3">{t("reports:columns.reference")}</th>
                <th className="px-4 py-3">{t("reports:columns.date")}</th>
                <th className="px-4 py-3">{t("reports:columns.status")}</th>
                <th className="px-4 py-3 text-right">{t("reports:columns.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.items.length ? records.items.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-bold text-slate-900">{row.ticketNumber}</td>
                  <td className="px-4 py-3">{row.workType.name}</td>
                  <td className="px-4 py-3"><strong className="block text-slate-800">{row.primaryOwner.name}</strong><small className="text-slate-500">{row.executionTeams.map((team) => team.name).join(", ") || t("reports:records.noTeam")}</small></td>
                  <td className="px-4 py-3">{row.reference.display ?? "—"}</td>
                  <td className="px-4 py-3">{formatDate(row.date, language)}</td>
                  <td className="px-4 py-3"><StatusPill status={row.status} label={runtimeStatusLabel(row.status, t)} /></td>
                  <td className="px-4 py-3 text-right">
                    <Link className="inline-flex min-h-9 items-center rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-bold text-sky-800 hover:bg-sky-100" to={`/work/${officeId}/${row.id}${accountRole === "SUPER_ADMIN" ? "?source=oversight" : ""}`}>{t("reports:actions.view")}</Link>
                  </td>
                </tr>
              )) : <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={7}>{t("reports:states.empty")}</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination page={records.page} totalPages={records.totalPages} onChange={onRecordsPage} previousLabel={t("reports:actions.previous")} nextLabel={t("reports:actions.next")} pageLabel={t("reports:pagination.page", { page: records.page, totalPages: records.totalPages })} />
      </section>
    );
  }

  if (view === "TECHNICAL_PERFORMANCE") {
    if (!technical) return <EmptyState t={t} />;
    return (
      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-bold text-slate-950">{t("reports:technical.title")}</h2>
          <p className="mt-1 text-sm text-slate-500">{t("reports:technical.description")}</p>
        </div>
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-3">
          <article className="rounded-2xl border border-sky-200 bg-sky-50 p-4"><span className="text-xs font-bold uppercase text-sky-700">{t("reports:columns.ticket")}</span><strong className="mt-1 block text-2xl text-slate-950">{technical.totals.total.tickets}</strong></article>
          <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><span className="text-xs font-bold uppercase text-amber-700">{t("reports:columns.pending")}</span><strong className="mt-1 block text-2xl text-slate-950">{technical.totals.total.pending}</strong></article>
          <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><span className="text-xs font-bold uppercase text-emerald-700">{t("reports:columns.completed")}</span><strong className="mt-1 block text-2xl text-slate-950">{technical.totals.total.completed}</strong></article>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">{t("reports:columns.sn")}</th><th className="px-4 py-3">{t("reports:columns.date")}</th><th className="px-4 py-3">{t("reports:columns.orgUnitTeam")}</th><th className="px-4 py-3">{t("reports:columns.supportStaff")}</th><th className="px-4 py-3">{t("reports:columns.otherStaff")}</th><th className="px-4 py-3 text-right">{t("reports:columns.ticket")}</th><th className="px-4 py-3 text-right">{t("reports:columns.pending")}</th><th className="px-4 py-3 text-right">{t("reports:columns.completed")}</th><th className="px-4 py-3">{t("reports:columns.serviceToken")}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {technical.rows.length ? technical.rows.map((row, index) => (
                <tr key={`${row.date}-${row.orgUnit.id}-${row.operationalTeam?.id ?? "none"}-${index}`}>
                  <td className="px-4 py-3">{index + 1}</td>
                  <td className="px-4 py-3">{formatDate(row.date, language)}</td>
                  <td className="px-4 py-3"><strong className="block text-slate-900">{row.orgUnit.name}</strong><small className="text-slate-500">{row.operationalTeam?.name ?? t("reports:technical.noTeam")}</small></td>
                  <td className="px-4 py-3 text-xs leading-5">{personList(row.supportStaff)}</td>
                  <td className="px-4 py-3 text-xs leading-5">{personList(row.otherStaff)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{row.total.tickets}</td>
                  <td className="px-4 py-3 text-right font-semibold text-amber-700">{row.total.pending}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700">{row.total.completed}</td>
                  <td className="px-4 py-3 text-xs leading-5">{row.references.join(", ") || "—"}</td>
                </tr>
              )) : <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={9}>{t("reports:states.empty")}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  if (view === "STAGE_SLA") {
    if (!stageAnalysis) return <EmptyState t={t} />;
    return (
      <div className="space-y-5">
        {stageAnalysis.summary.length ? (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {stageAnalysis.summary.map((row) => (
              <article key={row.orgUnit.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <strong className="block text-sm text-slate-900">{row.orgUnit.name}</strong>
                <span className="mt-1 block text-xs text-slate-500">{row.orgUnit.code}</span>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <span>{t("reports:stage.summary.total")} <b>{row.stageCount}</b></span>
                  <span>{t("reports:stage.summary.completed")} <b>{row.completedStages}</b></span>
                  <span>{t("reports:stage.summary.waiting")} <b>{row.waitingStages}</b></span>
                  <span className="text-rose-700">{t("reports:stage.summary.overdue")} <b>{row.overdueStages}</b></span>
                </div>
              </article>
            ))}
          </section>
        ) : null}
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4"><h2 className="text-base font-bold text-slate-950">{t("reports:stage.title")}</h2><p className="mt-1 text-sm text-slate-500">{t("reports:stage.description")}</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1250px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">{t("reports:columns.ticket")}</th><th className="px-4 py-3">{t("reports:columns.stage")}</th><th className="px-4 py-3">{t("reports:columns.responsibleOrgUnit")}</th><th className="px-4 py-3">{t("reports:columns.team")}</th><th className="px-4 py-3">{t("reports:columns.stageStatus")}</th><th className="px-4 py-3">{t("reports:columns.stageSla")}</th><th className="px-4 py-3">{t("reports:columns.workSla")}</th><th className="px-4 py-3 text-right">{t("reports:columns.active")}</th><th className="px-4 py-3 text-right">{t("reports:columns.waiting")}</th><th className="px-4 py-3 text-right">{t("reports:columns.blocked")}</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {stageAnalysis.items.length ? stageAnalysis.items.map((row) => (
              <tr key={row.id}><td className="px-4 py-3 font-bold text-slate-900">{row.workItem.ticketNumber}</td><td className="px-4 py-3"><strong className="block">{row.stage.name}</strong><small className="text-slate-500">{row.stage.code}</small></td><td className="px-4 py-3">{row.stage.responsibleOrgUnit.name}</td><td className="px-4 py-3">{row.stage.operationalTeams.map((team) => team.name).join(", ") || "—"}</td><td className="px-4 py-3"><StatusPill status={row.stage.status} label={stageStatusLabel(row.stage.status, t)} /></td><td className="px-4 py-3"><StatusPill status={row.stage.slaState} label={slaStateLabel(row.stage.slaState, t)} /></td><td className="px-4 py-3"><StatusPill status={row.workItem.workSlaState} label={slaStateLabel(row.workItem.workSlaState, t)} /></td><td className="px-4 py-3 text-right">{formatMinutes(row.durations.activeMinutes, t)}</td><td className="px-4 py-3 text-right">{formatMinutes(row.durations.waitingMinutes, t)}</td><td className="px-4 py-3 text-right">{formatMinutes(row.durations.blockedMinutes, t)}</td></tr>
                )) : <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={10}>{t("reports:states.empty")}</td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination page={stageAnalysis.page} totalPages={stageAnalysis.totalPages} onChange={onStagePage} previousLabel={t("reports:actions.previous")} nextLabel={t("reports:actions.next")} pageLabel={t("reports:pagination.page", { page: stageAnalysis.page, totalPages: stageAnalysis.totalPages })} />
        </section>
      </div>
    );
  }

  if (!duty) return <EmptyState t={t} />;
  const dutyRows = duty.sections.duty?.rows ?? [];
  const dutyPagination = duty.sections.duty?.pagination;
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>{t("reports:duty.compatibilityTitle")}</strong>
        <p className="mt-1 leading-6">{t("reports:duty.compatibility")}</p>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border border-sky-200 bg-sky-50 p-4"><span className="text-xs font-bold uppercase text-sky-700">{t("reports:duty.scheduled")}</span><strong className="mt-1 block text-2xl">{duty.dutySummary?.scheduled ?? 0}</strong></article>
        <article className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4"><span className="text-xs font-bold uppercase text-indigo-700">{t("reports:duty.people")}</span><strong className="mt-1 block text-2xl">{duty.dutySummary?.uniqueEmployees ?? 0}</strong></article>
        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><span className="text-xs font-bold uppercase text-amber-700">{t("reports:duty.leave")}</span><strong className="mt-1 block text-2xl">{duty.dutySummary?.leaveDays ?? 0}</strong></article>
        <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><span className="text-xs font-bold uppercase text-slate-600">{t("reports:duty.cancelled")}</span><strong className="mt-1 block text-2xl">{duty.dutySummary?.cancelled ?? 0}</strong></article>
      </section>
      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">{t("reports:columns.date")}</th><th className="px-4 py-3">{t("reports:columns.employee")}</th><th className="px-4 py-3">{t("reports:columns.shift")}</th><th className="px-4 py-3">{t("reports:columns.department")}</th><th className="px-4 py-3">{t("reports:columns.location")}</th><th className="px-4 py-3">{t("reports:columns.status")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {dutyRows.length ? dutyRows.map((row) => <DutyRow key={row.id} row={row} language={language} t={t} />) : <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={6}>{t("reports:states.empty")}</td></tr>}
            </tbody>
          </table>
        </div>
        {dutyPagination ? <Pagination page={dutyPagination.page} totalPages={dutyPagination.totalPages} onChange={onDutyPage} previousLabel={t("reports:actions.previous")} nextLabel={t("reports:actions.next")} pageLabel={t("reports:pagination.page", { page: dutyPagination.page, totalPages: dutyPagination.totalPages })} /> : null}
      </section>
    </div>
  );
}

function EmptyState({ t }: { t: ReturnType<typeof useTranslation>["t"] }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm font-medium text-slate-500 shadow-sm">{t("reports:states.empty")}</section>;
}

function DutyRow({ row, language, t }: { row: WorkReportLegacyDutyRow; language: string; t: ReturnType<typeof useTranslation>["t"] }) {
  return (
    <tr>
      <td className="px-4 py-3">{formatDate(row.dutyDate, language)}</td>
      <td className="px-4 py-3"><strong className="block text-slate-900">{row.employee}</strong><small className="text-slate-500">{row.employeeId ?? ""}</small></td>
      <td className="px-4 py-3"><strong className="block">{row.shift}</strong><small className="text-slate-500">{formatDateTime(row.startsAt, language)} – {formatDateTime(row.endsAt, language)}</small></td>
      <td className="px-4 py-3"><strong className="block">{row.department?.name ?? t("reports:duty.divisionDuty")}</strong><small className="text-slate-500">{row.division.name}</small></td>
      <td className="px-4 py-3">{row.reportingLocation || "—"}</td>
      <td className="px-4 py-3"><StatusPill status={row.cancelledAt ? "CANCELLED" : "OPEN"} label={row.cancelledAt ? t("reports:duty.cancelled") : t("reports:duty.scheduled")} /></td>
    </tr>
  );
}

function PrintableReport({
  view,
  payload,
  duty,
  office,
  period: fallbackPeriod,
  language,
  t,
}: {
  view: ReportView;
  payload: WorkReportV3PrintPayload | null;
  duty: WorkReportLegacyDutyResponse | null;
  office: { id: string; code: string; name: string } | null;
  period: { from: string | null; to: string | null };
  language: string;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const printOffice = payload?.office ?? office;
  const period = payload?.period ?? fallbackPeriod;
  const title = printTitleLabel(view, t);
  return (
    <section className="hidden bg-white text-slate-950 print:block print:w-full print:p-0 print:text-[9pt]">
      <header className="mb-5 border-b-2 border-slate-800 pb-3 text-center">
        <p className="text-[9pt] font-bold uppercase tracking-[0.18em] text-slate-600">{t("reports:print.organization")}</p>
        <h1 className="mt-1 font-serif text-[18pt] font-bold">{title}</h1>
        <p className="mt-1 text-[9pt] font-semibold text-slate-600">{printOffice ? `${printOffice.name} (${printOffice.code})` : t("reports:print.officeFallback")}</p>
        <div className="mt-2 flex justify-center gap-5 text-[8pt] text-slate-500">
          <span>{t("reports:print.period")}: {period?.from ? formatDate(period.from, language) : "—"} – {period?.to ? formatDate(period.to, language) : "—"}</span>
          <span>{t("reports:print.generated")}: {formatDateTime(payload?.generatedAt ?? duty?.generatedAt, language)}</span>
        </div>
      </header>
      {view === "OVERVIEW" && payload ? <PrintOverview data={payload.content as WorkReportV3Overview} t={t} /> : null}
      {view === "WORK_RECORDS" && payload ? <PrintWorkRecords rows={payload.content as WorkReportV3WorkRecord[]} language={language} t={t} /> : null}
      {view === "TECHNICAL_PERFORMANCE" && payload ? <PrintTechnical data={payload.content as WorkReportV3TechnicalPerformance} language={language} t={t} /> : null}
      {view === "STAGE_SLA" && payload ? <PrintStages rows={payload.content as WorkReportV3StageAnalysisRow[]} t={t} /> : null}
      {view === "DUTY" && duty ? <PrintDuty duty={duty} language={language} t={t} /> : null}
      <footer className="mt-5 border-t border-slate-300 pt-2 text-center text-[8pt] text-slate-500">{t("reports:print.footer")}</footer>
    </section>
  );
}

function PrintOverview({ data, t }: { data: WorkReportV3Overview; t: ReturnType<typeof useTranslation>["t"] }) {
  return (
    <>
      <table className="mb-5 w-full border-collapse text-center"><thead className="print:table-header-group"><tr>{(["total", "open", "inProgress", "waiting", "blocked", "completed", "overdue"] as OverviewKpiKey[]).map((key) => <th key={key} className="border border-slate-400 bg-slate-100 p-1.5">{overviewKpiLabel(key, t)}</th>)}</tr></thead><tbody><tr>{[data.totalWork, data.statuses.OPEN, data.statuses.IN_PROGRESS, data.statuses.WAITING, data.statuses.BLOCKED, data.statuses.COMPLETED, data.sla.overdue].map((value, index) => <td key={index} className="border border-slate-400 p-1.5 font-bold">{value}</td>)}</tr></tbody></table>
      <table className="w-full border-collapse"><thead className="print:table-header-group"><tr><th className="border border-slate-400 bg-slate-100 p-1.5 text-left">{t("reports:columns.orgUnit")}</th><th className="border border-slate-400 bg-slate-100 p-1.5">{t("reports:columns.primaryOwner")}</th><th className="border border-slate-400 bg-slate-100 p-1.5">{t("reports:columns.participant")}</th><th className="border border-slate-400 bg-slate-100 p-1.5">{t("reports:columns.stages")}</th><th className="border border-slate-400 bg-slate-100 p-1.5">{t("reports:columns.completed")}</th><th className="border border-slate-400 bg-slate-100 p-1.5">{t("reports:columns.overdue")}</th></tr></thead><tbody>{data.organizationPerformance.map((row) => <tr key={row.orgUnit.id}><td className="border border-slate-300 p-1.5">{row.orgUnit.name}</td><td className="border border-slate-300 p-1.5 text-center">{row.primaryOwnerWork}</td><td className="border border-slate-300 p-1.5 text-center">{row.participantWork}</td><td className="border border-slate-300 p-1.5 text-center">{row.responsibleStages}</td><td className="border border-slate-300 p-1.5 text-center">{row.completedWork}</td><td className="border border-slate-300 p-1.5 text-center">{row.overdueWork}</td></tr>)}</tbody></table>
    </>
  );
}

function PrintWorkRecords({ rows, language, t }: { rows: WorkReportV3WorkRecord[]; language: string; t: ReturnType<typeof useTranslation>["t"] }) {
  return <table className="w-full border-collapse"><thead className="print:table-header-group"><tr>{(["ticket", "workType", "ownerTeam", "reference", "date", "status"] as ReportColumnKey[]).map((key) => <th key={key} className="border border-slate-400 bg-slate-100 p-1.5 text-left">{columnLabel(key, t)}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="break-inside-avoid"><td className="border border-slate-300 p-1.5">{row.ticketNumber}</td><td className="border border-slate-300 p-1.5">{row.workType.name}</td><td className="border border-slate-300 p-1.5">{row.primaryOwner.name}{row.executionTeams.length ? ` / ${row.executionTeams.map((team) => team.name).join(", ")}` : ""}</td><td className="border border-slate-300 p-1.5">{row.reference.display ?? "—"}</td><td className="border border-slate-300 p-1.5">{formatDate(row.date, language)}</td><td className="border border-slate-300 p-1.5">{runtimeStatusLabel(row.status, t)}</td></tr>)}</tbody></table>;
}

function PrintTechnical({ data, language, t }: { data: WorkReportV3TechnicalPerformance; language: string; t: ReturnType<typeof useTranslation>["t"] }) {
  return <table className="w-full border-collapse"><thead className="print:table-header-group"><tr>{(["sn", "date", "orgUnitTeam", "supportStaff", "otherStaff", "ticket", "pending", "completed", "serviceToken"] as ReportColumnKey[]).map((key) => <th key={key} className="border border-slate-400 bg-slate-100 p-1 text-left">{columnLabel(key, t)}</th>)}</tr></thead><tbody>{data.rows.map((row: WorkReportV3TechnicalPerformanceRow, index) => <tr key={`${row.date}-${row.orgUnit.id}-${index}`} className="break-inside-avoid"><td className="border border-slate-300 p-1">{index + 1}</td><td className="border border-slate-300 p-1">{formatDate(row.date, language)}</td><td className="border border-slate-300 p-1">{row.orgUnit.name}{row.operationalTeam ? ` / ${row.operationalTeam.name}` : ""}</td><td className="border border-slate-300 p-1">{personList(row.supportStaff)}</td><td className="border border-slate-300 p-1">{personList(row.otherStaff)}</td><td className="border border-slate-300 p-1 text-center">{row.total.tickets}</td><td className="border border-slate-300 p-1 text-center">{row.total.pending}</td><td className="border border-slate-300 p-1 text-center">{row.total.completed}</td><td className="border border-slate-300 p-1">{row.references.join(", ") || "—"}</td></tr>)}</tbody></table>;
}

function PrintStages({ rows, t }: { rows: WorkReportV3StageAnalysisRow[]; t: ReturnType<typeof useTranslation>["t"] }) {
  return <table className="w-full border-collapse"><thead className="print:table-header-group"><tr>{(["ticket", "stage", "responsibleOrgUnit", "team", "stageStatus", "stageSla", "workSla", "active", "waiting", "blocked"] as ReportColumnKey[]).map((key) => <th key={key} className="border border-slate-400 bg-slate-100 p-1 text-left">{columnLabel(key, t)}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="break-inside-avoid"><td className="border border-slate-300 p-1">{row.workItem.ticketNumber}</td><td className="border border-slate-300 p-1">{row.stage.name}</td><td className="border border-slate-300 p-1">{row.stage.responsibleOrgUnit.name}</td><td className="border border-slate-300 p-1">{row.stage.operationalTeams.map((team) => team.name).join(", ") || "—"}</td><td className="border border-slate-300 p-1">{stageStatusLabel(row.stage.status, t)}</td><td className="border border-slate-300 p-1">{slaStateLabel(row.stage.slaState, t)}</td><td className="border border-slate-300 p-1">{slaStateLabel(row.workItem.workSlaState, t)}</td><td className="border border-slate-300 p-1 text-right">{formatMinutes(row.durations.activeMinutes, t)}</td><td className="border border-slate-300 p-1 text-right">{formatMinutes(row.durations.waitingMinutes, t)}</td><td className="border border-slate-300 p-1 text-right">{formatMinutes(row.durations.blockedMinutes, t)}</td></tr>)}</tbody></table>;
}

function PrintDuty({ duty, language, t }: { duty: WorkReportLegacyDutyResponse; language: string; t: ReturnType<typeof useTranslation>["t"] }) {
  const rows = duty.sections.duty?.rows ?? [];
  return <table className="w-full border-collapse"><thead className="print:table-header-group"><tr>{(["date", "employee", "shift", "department", "location", "status"] as ReportColumnKey[]).map((key) => <th key={key} className="border border-slate-400 bg-slate-100 p-1.5 text-left">{columnLabel(key, t)}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="break-inside-avoid"><td className="border border-slate-300 p-1.5">{formatDate(row.dutyDate, language)}</td><td className="border border-slate-300 p-1.5">{row.employee}</td><td className="border border-slate-300 p-1.5">{row.shift}</td><td className="border border-slate-300 p-1.5">{row.department?.name ?? row.division.name}</td><td className="border border-slate-300 p-1.5">{row.reportingLocation || "—"}</td><td className="border border-slate-300 p-1.5">{row.cancelledAt ? t("reports:duty.cancelled") : t("reports:duty.scheduled")}</td></tr>)}</tbody></table>;
}
