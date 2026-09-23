import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../context/AuthContext";
import { getOrganizationOffices } from "../services/organization-v3.service";
import {
  downloadWorkReportCsv,
  getLegacyDutyReportPage,
  getWorkReportContext,
  getWorkReportOverview,
  getWorkReportPrintPayload,
  getWorkReportTechnicalPerformance,
  getWorkReportWorkRecords,
} from "../services/work-reports.service";
import type {
  WorkReportLegacyDutyResponse,
  WorkReportStatus,
  WorkReportContext,
  WorkReportExportDataset,
  WorkReportOverview,
  WorkReportPrintPayload,
  WorkReportQuery,
  WorkReportTechnicalPerformance,
  WorkReportWorkRecords,
} from "../types/work-reports";

const STATUS_OPTIONS: WorkReportStatus[] = [
  "ASSIGNED",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "HELP_REQUESTED",
  "COMPLETED_PENDING_REVIEW",
  "REOPENED",
  "BLOCKED",
  "CLOSED",
  "CANCELLED",
];

type ReportView =
  | "OVERVIEW"
  | "TECHNICAL_PERFORMANCE"
  | "WORK_RECORDS"
  | "DUTY";

function label(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dateInput(value: Date): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function reportDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function defaultQuery(): WorkReportQuery {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 29);
  return { from: dateInput(from), to: dateInput(now) };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

type ReportPeriodPreset = "TODAY" | "LAST_7" | "LAST_30" | "CUSTOM";

function presetDates(preset: Exclude<ReportPeriodPreset, "CUSTOM">): {
  from: string;
  to: string;
} {
  const to = new Date();
  const from = new Date(to);
  from.setDate(
    from.getDate() - (preset === "TODAY" ? 0 : preset === "LAST_7" ? 6 : 29),
  );
  return { from: dateInput(from), to: dateInput(to) };
}

function reportReferenceDisplay(
  reference:
    | string
    | { label?: string | null; value?: string | null; display?: string | null },
): string {
  if (typeof reference === "string") return reference.trim();
  if (reference.display?.trim()) return reference.display.trim();
  const value = reference.value?.trim();
  const label = reference.label?.trim();
  return label && value ? `${label}: ${value}` : value || label || "";
}

function reportReferencesDisplay(
  references:
    | Array<
        | string
        | {
            label?: string | null;
            value?: string | null;
            display?: string | null;
          }
      >
    | null
    | undefined,
): string {
  const values = (references ?? []).map(reportReferenceDisplay).filter(Boolean);
  return values.length ? values.join(" · ") : "—";
}

function reportStatusTone(status: WorkReportStatus | string): string {
  if (status === "CANCELLED") return "muted";
  if (status === "CLOSED") return "success";
  if (status === "COMPLETED_PENDING_REVIEW") return "review";
  if (status === "IN_PROGRESS" || status === "ACKNOWLEDGED") {
    return "info";
  }
  if (status === "HELP_REQUESTED" || status === "REOPENED") {
    return "warning";
  }
  if (status === "BLOCKED") return "danger";
  return "neutral";
}

export function WorkReportsPage() {
  const { accessToken } = useAuth();
  const { t } = useTranslation("reports");
  const [offices, setOffices] = useState<
    Array<{ id: string; code: string; name: string }>
  >([]);
  const [officeId, setOfficeId] = useState("");
  const [context, setContext] = useState<WorkReportContext | null>(null);
  const [view, setView] = useState<ReportView>("OVERVIEW");
  const [periodPreset, setPeriodPreset] =
    useState<ReportPeriodPreset>("LAST_30");
  const [draft, setDraft] = useState<WorkReportQuery>(defaultQuery);
  const [query, setQuery] = useState<WorkReportQuery>(defaultQuery);
  const [overview, setOverview] = useState<WorkReportOverview | null>(null);
  const [records, setRecords] = useState<WorkReportWorkRecords | null>(null);
  const [technical, setTechnical] =
    useState<WorkReportTechnicalPerformance | null>(null);
  const [duty, setDuty] = useState<WorkReportLegacyDutyResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [preparingPrint, setPreparingPrint] = useState(false);
  const [printPayload, setPrintPayload] =
    useState<WorkReportPrintPayload | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    getOrganizationOffices(accessToken)
      .then((response) => {
        if (!active) return;
        const visible = response.data.filter((office) => office.isActive);
        setOffices(visible);
        setOfficeId((current) =>
          visible.some((office) => office.id === current)
            ? current
            : (visible[0]?.id ?? ""),
        );
      })
      .catch(
        (requestError: unknown) =>
          active && setError(errorMessage(requestError, t("errors.offices"))),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [accessToken, t]);

  useEffect(() => {
    if (!accessToken || !officeId) return;
    let active = true;
    getWorkReportContext(accessToken, officeId)
      .then((nextContext) => {
        if (!active) return;
        setError("");
        setContext(nextContext);
      })
      .catch(
        (requestError: unknown) =>
          active && setError(errorMessage(requestError, t("errors.context"))),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [accessToken, officeId, t]);

  useEffect(() => {
    if (!accessToken || !officeId || !context?.scope.availableActions.view)
      return;
    let active = true;
    const request =
      view === "OVERVIEW"
        ? getWorkReportOverview(accessToken, officeId, query).then((data) => ({
            kind: "overview" as const,
            data,
          }))
        : view === "TECHNICAL_PERFORMANCE"
          ? getWorkReportTechnicalPerformance(
              accessToken,
              officeId,
              query,
            ).then((data) => ({ kind: "technical" as const, data }))
          : view === "WORK_RECORDS"
            ? getWorkReportWorkRecords(accessToken, officeId, {
                ...query,
                page,
                limit: 25,
              }).then((data) => ({ kind: "records" as const, data }))
            : getLegacyDutyReportPage(accessToken, {
                officeId,
                from: query.from,
                to: query.to,
                orgUnitId: query.orgUnitId,
                operationalTeamId: query.operationalTeamId,
                search: query.search,
                page,
                limit: 25,
              }).then((data) => ({ kind: "duty" as const, data }));
    request
      .then((result) => {
        if (!active) return;
        setError("");
        if (result.kind === "overview") setOverview(result.data);
        if (result.kind === "technical") setTechnical(result.data);
        if (result.kind === "records") setRecords(result.data);
        if (result.kind === "duty") setDuty(result.data);
      })
      .catch(
        (requestError: unknown) =>
          active && setError(errorMessage(requestError, t("errors.report"))),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [
    accessToken,
    context?.scope.availableActions.view,
    officeId,
    page,
    query,
    t,
    view,
  ]);

  const canExport = Boolean(context?.scope.availableActions.export);
  const selectedOffice = offices.find((office) => office.id === officeId);
  const activeDataset: WorkReportExportDataset =
    view === "DUTY" ? "DUTY_ASSIGNMENTS" : view;

  const classicSummary = useMemo(() => {
    if (!overview) return [];
    return [
      ["Total Work", overview.totalWork],
      ["Active", overview.work.totals.activeAtEnd],
      ["In Progress", overview.workflow.inProgress],
      ["Need Review", overview.workflow.waitingForApproval],
      ["Overdue", overview.workflow.overdue],
      ["Completed", overview.workflow.completedDuring],
    ] as const;
  }, [overview]);

  function choosePeriodPreset(preset: ReportPeriodPreset): void {
    setPeriodPreset(preset);
    if (preset === "CUSTOM") return;
    setDraft((current) => ({ ...current, ...presetDates(preset) }));
  }

  function resetReportFilters(): void {
    const next = defaultQuery();
    setPeriodPreset("LAST_30");
    setDraft(next);
    setQuery(next);
    setPage(1);
    setError("");
    setNotice("");
  }

  function apply(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setPage(1);
    setQuery({ ...draft });
  }

  async function exportCsv(): Promise<void> {
    if (!accessToken || !officeId || !canExport) return;
    setExporting(true);
    setError("");
    try {
      const filename = await downloadWorkReportCsv(
        accessToken,
        officeId,
        activeDataset,
        query,
      );
      setNotice(t("notices.exported", { filename }));
    } catch (requestError: unknown) {
      setError(errorMessage(requestError, t("errors.export")));
    } finally {
      setExporting(false);
    }
  }

  async function printReport(): Promise<void> {
    if (!accessToken || !officeId || !canExport) return;
    setPreparingPrint(true);
    setError("");
    try {
      const payload = await getWorkReportPrintPayload(
        accessToken,
        officeId,
        activeDataset,
        query,
      );
      setPrintPayload(payload);
      window.setTimeout(() => window.print(), 0);
    } catch (requestError: unknown) {
      setError(errorMessage(requestError, t("errors.print")));
    } finally {
      setPreparingPrint(false);
    }
  }

  return (
    <main className="workspace-page work-reports-page report-v2-shell superadmin-report-parity">
      <header className="workspace-page__header report-v2-header superadmin-report-hero print:hidden">
        <div className="superadmin-report-hero__copy">
          <p className="workspace-page__eyebrow">OFFICE REPORTING</p>
          <h1>Reports</h1>
          <p>Read-only Work and Duty reporting for the selected Office.</p>
        </div>
        <div
          className="superadmin-report-header__meta"
          aria-label="Report access context"
        >
          <span className="is-read-only">Read-only oversight</span>
          {selectedOffice ? <span>{selectedOffice.name}</span> : null}
        </div>
      </header>

      <section className="workspace-card report-v2-filter-panel superadmin-report-controls print:hidden">
        <div
          className="performance-report-tabs report-v2-tabs work-report-tabs"
          role="tablist"
          aria-label={t("tabs.label")}
        >
          {(
            [
              "OVERVIEW",
              "TECHNICAL_PERFORMANCE",
              "WORK_RECORDS",
              "DUTY",
            ] as ReportView[]
          ).map((tab) => (
            <button
              key={tab}
              type="button"
              className={view === tab ? "is-active" : ""}
              onClick={() => {
                setView(tab);
                setPage(1);
              }}
            >
              {tab === "TECHNICAL_PERFORMANCE"
                ? "Performance Report"
                : t(`tabs.${tab}`)}
            </button>
          ))}
        </div>

        <form
          className="report-v2-filters work-report-filters superadmin-report-filters"
          onSubmit={apply}
        >
          <div className="superadmin-report-filter-heading">
            <strong>Filters</strong>
            <div className="report-v2-periods" aria-label="Report period">
              {(
                [
                  ["TODAY", "Today"],
                  ["LAST_7", "7 Days"],
                  ["LAST_30", "30 Days"],
                  ["CUSTOM", "Custom"],
                ] as Array<[ReportPeriodPreset, string]>
              ).map(([preset, presetLabel]) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={periodPreset === preset}
                  className={periodPreset === preset ? "is-active" : ""}
                  onClick={() => choosePeriodPreset(preset)}
                >
                  {presetLabel}
                </button>
              ))}
            </div>
          </div>
          <div className="superadmin-report-filter-grid">
            <label className="is-date">
              <span>{t("filters.from")}</span>
              <input
                type="date"
                value={draft.from ?? ""}
                max={draft.to ?? undefined}
                onChange={(event) => {
                  setPeriodPreset("CUSTOM");
                  setDraft((current) => ({
                    ...current,
                    from: event.target.value || undefined,
                  }));
                }}
              />
            </label>
            <label className="is-date">
              <span>{t("filters.to")}</span>
              <input
                type="date"
                value={draft.to ?? ""}
                min={draft.from ?? undefined}
                onChange={(event) => {
                  setPeriodPreset("CUSTOM");
                  setDraft((current) => ({
                    ...current,
                    to: event.target.value || undefined,
                  }));
                }}
              />
            </label>
            <label className="is-office">
              <span>{t("filters.office")}</span>
              <select
                value={officeId}
                onChange={(event) => {
                  setOfficeId(event.target.value);
                  setPage(1);
                }}
              >
                {offices.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.name}
                  </option>
                ))}
              </select>
            </label>
            {(view === "WORK_RECORDS" || view === "DUTY") && (
              <label className="is-search">
                <span>{t("filters.search")}</span>
                <input
                  value={draft.search ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      search: event.target.value || undefined,
                    }))
                  }
                  placeholder={
                    view === "DUTY"
                      ? "Employee, shift or location"
                      : t("filters.searchPlaceholder")
                  }
                />
              </label>
            )}
            {context && (
              <>
                <label>
                  <span>
                    {view === "DUTY"
                      ? t("columns.orgUnit")
                      : "Primary OrgUnit"}
                  </span>
                  <select
                    value={draft.orgUnitId ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        orgUnitId: event.target.value || undefined,
                        operationalTeamId: undefined,
                      }))
                    }
                  >
                    <option value="">{t("filters.all")}</option>
                    {context.filters.orgUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("filters.operationalTeam")}</span>
                  <select
                    value={draft.operationalTeamId ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        operationalTeamId: event.target.value || undefined,
                      }))
                    }
                  >
                    <option value="">{t("filters.all")}</option>
                    {context.filters.operationalTeams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>
                {view !== "DUTY" && (
                  <label>
                    <span>{t("filters.workType")}</span>
                    <select
                      value={draft.workTypeId ?? ""}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          workTypeId: event.target.value || undefined,
                        }))
                      }
                    >
                      <option value="">{t("filters.all")}</option>
                      {context.filters.workTypes.map((workType) => (
                        <option key={workType.id} value={workType.id}>
                          {workType.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {(view === "OVERVIEW" || view === "WORK_RECORDS") && (
                  <label>
                    <span>{t("filters.status")}</span>
                    <select
                      value={draft.status ?? ""}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          status: (event.target.value || undefined) as
                            | WorkReportStatus
                            | undefined,
                        }))
                      }
                    >
                      <option value="">{t("filters.all")}</option>
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {label(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
          </div>
          <div className="superadmin-report-filter-actions">
            <div className="superadmin-report-filter-actions__apply">
              <button
                type="button"
                className="is-secondary"
                onClick={resetReportFilters}
                disabled={loading}
              >
                Reset
              </button>
              <button
                type="submit"
                className="primary-button is-primary"
                disabled={loading || !officeId}
              >
                {loading ? t("actions.loading") : t("actions.apply")}
              </button>
            </div>
            <div className="superadmin-report-filter-actions__output">
              <button
                type="button"
                className="is-secondary"
                disabled={!canExport || exporting || loading}
                onClick={() => void exportCsv()}
              >
                {exporting ? t("actions.exporting") : t("actions.csv")}
              </button>
              <button
                type="button"
                className="is-secondary"
                disabled={!canExport || preparingPrint || loading}
                onClick={() => void printReport()}
              >
                {preparingPrint
                  ? t("actions.preparingPrint")
                  : t("actions.print")}
              </button>
            </div>
          </div>
        </form>
      </section>

      {error && (
        <p className="form-error print:hidden" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="form-success print:hidden" role="status">
          {notice}
        </p>
      )}
      {loading && (
        <p className="workspace-empty-state print:hidden">
          {t("states.loading")}
        </p>
      )}

      {!loading && view === "OVERVIEW" && overview && (
        <section className="work-report-content">
          <div className="report-v2-kpi-grid work-summary-grid">
            {classicSummary.map(([name, value], index) => (
              <article
                key={name}
                className={`superadmin-report-kpi-card ${
                  index === 0
                    ? "is-primary"
                    : name === "Overdue"
                      ? "is-danger"
                      : name === "Need Review"
                        ? "is-warning"
                        : name === "Completed"
                          ? "is-success"
                          : "is-neutral"
                }`}
              >
                <strong>{value}</strong>
                <span>{name}</span>
              </article>
            ))}
          </div>
          <article className="workspace-card superadmin-report-section">
            <header className="superadmin-report-card-header">
              <h2>
                {t("overview.workflowTitle", {
                  defaultValue: "Workflow status",
                })}
              </h2>
            </header>
            <div className="report-v2-kpi-grid work-summary-grid superadmin-workflow-grid">
              {[
                [
                  t("overview.newWork", { defaultValue: "New work" }),
                  overview.workflow.newWork,
                ],
                [
                  t("overview.inProgress", { defaultValue: "In progress" }),
                  overview.workflow.inProgress,
                ],
                [
                  t("overview.waitingForSales", {
                    defaultValue: "Waiting for Sales",
                  }),
                  overview.workflow.waitingForSales,
                ],
                [
                  t("overview.waitingForApproval", {
                    defaultValue: "Need review",
                  }),
                  overview.workflow.waitingForApproval,
                ],
                [
                  t("overview.returnedForCorrection", {
                    defaultValue: "Returned for correction",
                  }),
                  overview.workflow.returnedForCorrection,
                ],
                [t("columns.overdue"), overview.workflow.overdue],
                [
                  t("overview.completedDuring", {
                    defaultValue: "Completed during period",
                  }),
                  overview.workflow.completedDuring,
                ],
              ].map(([name, value]) => (
                <article
                  key={String(name)}
                  className={`superadmin-report-kpi-card ${
                    String(name).includes("Overdue")
                      ? "is-danger"
                      : String(name).includes("Sales")
                        ? "is-amber"
                        : String(name).includes("review")
                          ? "is-warning"
                          : String(name).includes("Completed")
                            ? "is-success"
                            : "is-neutral"
                  }`}
                >
                  <strong>{value}</strong>
                  <span>{name}</span>
                </article>
              ))}
            </div>
          </article>

          <article className="workspace-card superadmin-report-section superadmin-report-table-card">
            <header className="superadmin-report-card-header">
              <h2>{t("overview.teamTitle")}</h2>
            </header>
            {overview.teams.length > 0 ? (
              <div className="responsive-table">
                <table>
                  <thead>
                    <tr>
                      <th>{t("columns.team", { defaultValue: "Team" })}</th>
                      <th>{t("columns.orgUnit")}</th>
                      <th>
                        {t("overview.activeWork", { defaultValue: "Active" })}
                      </th>
                      <th>
                        {t("overview.inProgress", {
                          defaultValue: "In progress",
                        })}
                      </th>
                      <th>
                        {t("overview.waitingForApproval", {
                          defaultValue: "Need review",
                        })}
                      </th>
                      <th>{t("columns.overdue")}</th>
                      <th>{t("columns.completed")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.teams.map((row) => (
                      <tr key={row.teamId}>
                        <td>{row.name}</td>
                        <td>{row.orgUnitName}</td>
                        <td>{row.activeWork}</td>
                        <td>{row.inProgress}</td>
                        <td>{row.waitingForApproval}</td>
                        <td>{row.overdueWork}</td>
                        <td>{row.completedDuring}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="workspace-empty-state">
                {t("overview.noTeams", {
                  defaultValue:
                    "No team report rows are available for this scope and period.",
                })}
              </p>
            )}
          </article>
        </section>
      )}

      {!loading && view === "WORK_RECORDS" && records && (
        <section className="workspace-card work-report-content superadmin-report-section superadmin-report-table-card">
          <header className="superadmin-report-card-header">
            <h2>{t("records.title")}</h2>
          </header>
          {records.items.length === 0 ? (
            <p className="workspace-empty-state">
              No Work records match the selected filters.
            </p>
          ) : (
            <div className="responsive-table">
              <table>
              <thead>
                <tr>
                  <th>{t("columns.ticket")}</th>
                  <th>{t("columns.workType")}</th>
                  <th>{t("columns.ownerTeam")}</th>
                  <th>{t("columns.reference")}</th>
                  <th>{t("columns.date")}</th>
                  <th>{t("columns.status")}</th>
                </tr>
              </thead>
              <tbody>
                {records.items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.ticketNumber}</strong>
                    </td>
                    <td>
                      <strong>{row.workType.name}</strong>
                    </td>
                    <td>
                      {row.primaryOwner.name}
                      {row.executionTeams.length
                        ? ` / ${row.executionTeams.map((team) => team.name).join(", ")}`
                        : ""}
                    </td>
                    <td className="superadmin-record-reference">
                      {row.reference.display ?? "—"}
                    </td>
                    <td>{reportDate(row.date)}</td>
                    <td>
                      <span
                        className={`superadmin-report-status-badge is-${reportStatusTone(row.status)}`}
                      >
                        {label(row.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={records.page}
            totalPages={records.totalPages}
            setPage={setPage}
          />
        </section>
      )}

      {!loading && view === "TECHNICAL_PERFORMANCE" && technical && (
        <section className="workspace-card work-report-content superadmin-performance-report superadmin-report-section superadmin-report-table-card">
          <header className="superadmin-report-section-heading">
            <div>
              <span>NEPAL TELECOM</span>
              <h2>NTC Technical Performance Report</h2>
              <p>
                Technical Work only. Administrative Work is excluded from this
                report.
              </p>
            </div>
            <div className="superadmin-report-section-meta">
              <strong>{selectedOffice?.name ?? "Selected Office"}</strong>
              <span>
                {query.from ? reportDate(query.from) : "—"} – {query.to ? reportDate(query.to) : "—"}
              </span>
            </div>
          </header>
          {technical.rows.length === 0 ? (
            <div className="workspace-empty-state">
              No technical performance records match the selected filters.
            </div>
          ) : (
            <>
              <div className="responsive-table superadmin-performance-table">
                <table>
                  <thead>
                    <tr>
                      <th>S.N.</th>
                      <th>{t("columns.date")}</th>
                      <th>{t("columns.orgUnitTeam")}</th>
                      <th>{t("columns.supportStaff")}</th>
                      <th>{t("columns.otherStaff")}</th>
                      <th>{t("columns.ticket")}</th>
                      <th>{t("columns.pending")}</th>
                      <th>{t("columns.completed")}</th>
                      <th>{t("columns.serviceToken")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {technical.rows.map((row, index) => (
                      <tr
                        key={`${row.date}-${row.operationalTeam?.id ?? row.orgUnit.id}-${index}`}
                      >
                        <td>{index + 1}</td>
                        <td>{reportDate(row.date)}</td>
                        <td>
                          <strong>{row.orgUnit.name}</strong>
                          <small>
                            {row.operationalTeam?.name ?? t("technical.noTeam")}
                          </small>
                        </td>
                        <td>{row.supportStaff.length}</td>
                        <td>{row.otherStaff.length}</td>
                        <td>{row.total.tickets}</td>
                        <td>{row.total.pending}</td>
                        <td>{row.total.completed}</td>
                        <td className="superadmin-performance-reference">
                          {reportReferencesDisplay(row.references)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div
                className="superadmin-performance-cards"
                aria-label="Technical performance mobile view"
              >
                {technical.rows.map((row, index) => (
                  <article
                    key={`mobile-${row.date}-${row.operationalTeam?.id ?? row.orgUnit.id}-${index}`}
                  >
                    <header>
                      <div>
                        <span>{reportDate(row.date)}</span>
                        <strong>{row.orgUnit.name}</strong>
                        <small>
                          {row.operationalTeam?.name ?? t("technical.noTeam")}
                        </small>
                      </div>
                      <span>#{index + 1}</span>
                    </header>
                    <dl>
                      <div>
                        <dt>Tickets</dt>
                        <dd>{row.total.tickets}</dd>
                      </div>
                      <div>
                        <dt>Completed</dt>
                        <dd>{row.total.completed}</dd>
                      </div>
                      <div>
                        <dt>Pending</dt>
                        <dd>{row.total.pending}</dd>
                      </div>
                      <div>
                        <dt>Support Staff</dt>
                        <dd>{row.supportStaff.length}</dd>
                      </div>
                      <div>
                        <dt>Other Staff / Sales</dt>
                        <dd>{row.otherStaff.length}</dd>
                      </div>
                    </dl>
                    <div className="superadmin-performance-card__reference">
                      <span>{t("columns.serviceToken")}</span>
                      <strong>{reportReferencesDisplay(row.references)}</strong>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {!loading && view === "DUTY" && duty && (
        <section className="workspace-card work-report-content superadmin-report-section superadmin-report-table-card">
          <header className="superadmin-report-card-header">
            <h2>{t("tabs.DUTY")}</h2>
            <p>Planned Duty is scheduling data, not attendance.</p>
          </header>
          <div className="report-v2-kpi-grid work-summary-grid superadmin-duty-grid">
            <article className="superadmin-report-kpi-card is-primary">
              <strong>{duty.dutySummary?.scheduled ?? 0}</strong>
              <span>Scheduled</span>
            </article>
            <article className="superadmin-report-kpi-card is-neutral">
              <strong>{duty.dutySummary?.uniqueEmployees ?? 0}</strong>
              <span>Employees</span>
            </article>
            <article className="superadmin-report-kpi-card is-warning">
              <strong>{duty.dutySummary?.leaveDays ?? 0}</strong>
              <span>Leave</span>
            </article>
            <article className="superadmin-report-kpi-card is-danger">
              <strong>{duty.dutySummary?.cancelled ?? 0}</strong>
              <span>Cancelled</span>
            </article>
          </div>
          {(duty.sections.duty?.rows ?? []).length === 0 ? (
            <p className="workspace-empty-state">
              No Duty records match the selected filters.
            </p>
          ) : (
            <div className="responsive-table">
              <table>
              <thead>
                <tr>
                  <th>{t("columns.date")}</th>
                  <th>{t("columns.employee")}</th>
                  <th>{t("columns.shift")}</th>
                  <th>{t("columns.orgUnit")}</th>
                  <th>Operational Team</th>
                  <th>Supervisor</th>
                  <th>{t("columns.location")}</th>
                  <th>{t("columns.status")}</th>
                </tr>
              </thead>
              <tbody>
                {(duty.sections.duty?.rows ?? []).map((row) => (
                  <tr key={row.id}>
                    <td>{reportDate(row.dutyDate)}</td>
                    <td>
                      {row.employee}
                      <br />
                      <small>
                        {[row.employeeId, row.designation]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </td>
                    <td>
                      {row.shift}
                      <br />
                      <small>
                        {new Date(row.startsAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        –{" "}
                        {new Date(row.endsAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </td>
                    <td>{row.orgUnit?.name ?? "Office-wide"}</td>
                    <td>{row.operationalTeam?.name ?? "—"}</td>
                    <td>{row.supervisor || "—"}</td>
                    <td>
                      {row.reportingLocation || "—"}
                      {row.notes ? (
                        <>
                          <br />
                          <small>{row.notes}</small>
                        </>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={`superadmin-report-status-badge is-${
                          row.status === "Cancelled" ? "danger" : "neutral"
                        }`}
                      >
                        {row.status}
                      </span>
                      {row.cancellationReason ? (
                        <>
                          <br />
                          <small>{row.cancellationReason}</small>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={duty.sections.duty?.pagination.page ?? 1}
            totalPages={duty.sections.duty?.pagination.totalPages ?? 1}
            setPage={setPage}
          />
        </section>
      )}

      {printPayload && (
        <PrintPayload
          payload={printPayload}
          officeName={selectedOffice?.name ?? "NT Message Office"}
        />
      )}
    </main>
  );
}

function Pagination({
  page,
  totalPages,
  setPage,
}: {
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="work-report-pagination print:hidden">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => setPage(page + 1)}
      >
        Next
      </button>
    </div>
  );
}

function PrintPayload({
  payload,
  officeName,
}: {
  payload: WorkReportPrintPayload;
  officeName: string;
}) {
  if (payload.dataset === "DUTY_ASSIGNMENTS") {
    const duty = payload.content as WorkReportLegacyDutyResponse;
    const rows = duty.sections.duty?.rows ?? [];
    return (
      <section className="work-report-print-only">
        <header>
          <strong>Nepal Telecom</strong>
          <h1>{officeName}</h1>
          <p>
            Duty Report · {payload.period.from ?? "—"} –{" "}
            {payload.period.to ?? "—"} · Generated{" "}
            {new Date(payload.generatedAt).toLocaleString()}
          </p>
        </header>
        <p>Planned Duty is scheduling data, not attendance.</p>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Employee</th>
              <th>Shift</th>
              <th>Org Unit</th>
              <th>Team</th>
              <th>Supervisor</th>
              <th>Location</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.dutyDate}</td>
                <td>
                  {row.employee}
                  {row.designation ? ` · ${row.designation}` : ""}
                </td>
                <td>{row.shift}</td>
                <td>{row.orgUnit?.name ?? "Office-wide"}</td>
                <td>{row.operationalTeam?.name ?? "—"}</td>
                <td>{row.supervisor || "—"}</td>
                <td>{row.reportingLocation || "—"}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  return (
    <section className="work-report-print-only">
      <header>
        <strong>Nepal Telecom</strong>
        <h1>{officeName}</h1>
        <p>
          {label(payload.dataset)} · Generated{" "}
          {new Date(payload.generatedAt).toLocaleString()}
        </p>
      </header>
      <pre>{JSON.stringify(payload.content, null, 2)}</pre>
    </section>
  );
}
