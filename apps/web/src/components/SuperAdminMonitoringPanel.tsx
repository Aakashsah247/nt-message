import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FormEvent } from "react";

import {
  getSuperAdminActivityLogs,
  getSuperAdminMonitoring,
} from "../services/monitoring.service";
import type {
  ActivityEventType,
  MonitoringActivityLogQuery,
  MonitoringActivityLogRow,
  MonitoringActivityLogsResponse,
  MonitoringEmployeeRow,
  MonitoringStatus,
  SuperAdminMonitoringResponse,
} from "../types/monitoring";

interface SuperAdminMonitoringPanelProps {
  accessToken: string;
}

type MonitoringView = "OVERVIEW" | "LOGS" | "EMPLOYEE";
type MonitoringTone = "blue" | "green" | "amber" | "slate" | "red";
type MonitoringGlyphName =
  | "active"
  | "idle"
  | "offline"
  | "actions"
  | "emergency"
  | "refresh"
  | "privacy"
  | "retention"
  | "employee";

interface MonitoringFilterState {
  date: string;
  fromTime: string;
  toTime: string;
  accountId: string;
  role: string;
  department: string;
  eventType: ActivityEventType | "ALL";
  search: string;
}

const DEFAULT_LOG_LIMIT = 25;
const DEFAULT_FROM_TIME = "09:00";
const DEFAULT_TO_TIME = "18:00";
const ACTIVITY_EVENT_OPTIONS: Array<ActivityEventType | "ALL"> = [
  "ALL",
  "LOGIN",
  "LOGOUT",
  "PAGE_VIEW",
  "BUTTON_CLICK",
  "ACTIVE_HEARTBEAT",
  "IDLE_STARTED",
  "IDLE_HEARTBEAT",
  "ACTIVE_RESUMED",
  "EMERGENCY_ALERT_SENT",
  "SESSION_POLICY_LOGOUT",
];

function getTodayInputValue(): string {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);

  return localDate.toISOString().slice(0, 10);
}

function createDefaultFilters(): MonitoringFilterState {
  return {
    date: getTodayInputValue(),
    fromTime: DEFAULT_FROM_TIME,
    toTime: DEFAULT_TO_TIME,
    accountId: "ALL",
    role: "ALL",
    department: "ALL",
    eventType: "ALL",
    search: "",
  };
}

function formatDateTime(value: string | null, locale: string, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTime(value: string, locale: string, fallback: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusLabel(status: MonitoringStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function getEmployeeInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || "NT";
}

function isEmailIdentity(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function getEmployeeDisplayName(
  employee: MonitoringEmployeeRow,
  roleLabel?: string,
): string {
  // System-created identities can fall back to an email address. Present the
  // localized role as the readable heading while keeping the exact email visible below.
  return isEmailIdentity(employee.employeeName)
    ? roleLabel ?? formatLabel(employee.role)
    : employee.employeeName;
}

function getEmployeeContactLine(employee: MonitoringEmployeeRow): string | null {
  if (isEmailIdentity(employee.employeeName)) {
    return employee.employeeName;
  }

  return employee.designation;
}

function maskSessionLabel(value: string, fallback: string): string {
  if (!value) {
    return fallback;
  }

  if (value.length <= 7) {
    return value;
  }

  return `${value.slice(0, 4)}•••${value.slice(-3)}`;
}

function getActiveFilterCount(filters: MonitoringFilterState): number {
  let count = 0;

  if (filters.date !== getTodayInputValue()) count += 1;
  if (filters.fromTime !== DEFAULT_FROM_TIME) count += 1;
  if (filters.toTime !== DEFAULT_TO_TIME) count += 1;
  if (filters.accountId !== "ALL") count += 1;
  if (filters.role !== "ALL") count += 1;
  if (filters.department !== "ALL") count += 1;
  if (filters.eventType !== "ALL") count += 1;
  if (filters.search.trim()) count += 1;

  return count;
}

export function SuperAdminMonitoringPanel({
  accessToken,
}: SuperAdminMonitoringPanelProps) {
  const { t, i18n } = useTranslation("monitoring");
  const locale = i18n.resolvedLanguage === "ne" ? "ne-NP" : "en-GB";
  const [monitoring, setMonitoring] =
    useState<SuperAdminMonitoringResponse | null>(null);
  const [activityLogs, setActivityLogs] =
    useState<MonitoringActivityLogsResponse | null>(null);
  const [view, setView] = useState<MonitoringView>("OVERVIEW");
  const [draftFilters, setDraftFilters] = useState<MonitoringFilterState>(
    createDefaultFilters,
  );
  const [appliedFilters, setAppliedFilters] = useState<MonitoringFilterState>(
    createDefaultFilters,
  );
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState("");
  const [logsError, setLogsError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [logsRefreshKey, setLogsRefreshKey] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const hasLoadedMonitoring = useRef(false);

  useEffect(() => {
    if (!accessToken) {
      setError(t("errors.session"));
      setLoading(false);
      return;
    }

    let active = true;

    function loadMonitoring(): void {
      if (hasLoadedMonitoring.current) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      getSuperAdminMonitoring(accessToken)
        .then((response) => {
          if (!active) {
            return;
          }

          setMonitoring(response);
          setError("");
          hasLoadedMonitoring.current = true;
        })
        .catch((requestError: unknown) => {
          if (!active) {
            return;
          }

          setError(
            requestError instanceof Error
              ? requestError.message
              : t("errors.load"),
          );
        })
        .finally(() => {
          if (active) {
            setLoading(false);
            setRefreshing(false);
          }
        });
    }

    loadMonitoring();

    // The interval refreshes metadata only; private communication content is never requested.
    const intervalId = autoRefresh
      ? window.setInterval(loadMonitoring, 15_000)
      : undefined;

    return () => {
      active = false;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [accessToken, autoRefresh, refreshKey, t]);

  const activityQuery = useMemo<MonitoringActivityLogQuery>(
    () => ({
      date: appliedFilters.date,
      fromTime: appliedFilters.fromTime,
      toTime: appliedFilters.toTime,
      accountId:
        appliedFilters.accountId === "ALL"
          ? undefined
          : appliedFilters.accountId,
      role: appliedFilters.role === "ALL" ? undefined : appliedFilters.role,
      department:
        appliedFilters.department === "ALL"
          ? undefined
          : appliedFilters.department,
      eventType: appliedFilters.eventType,
      search: appliedFilters.search.trim() || undefined,
      page,
      limit: DEFAULT_LOG_LIMIT,
    }),
    [appliedFilters, page],
  );

  const monitoringReady = monitoring !== null;

  useEffect(() => {
    if (!accessToken || !monitoringReady || view === "OVERVIEW") {
      return;
    }

    let active = true;

    function loadActivityLogs(): void {
      setLogsLoading(true);
      getSuperAdminActivityLogs(accessToken, activityQuery)
        .then((response) => {
          if (!active) {
            return;
          }

          setActivityLogs(response);
          setLogsError("");
        })
        .catch((requestError: unknown) => {
          if (!active) {
            return;
          }

          setLogsError(
            requestError instanceof Error
              ? requestError.message
              : t("errors.logs"),
          );
        })
        .finally(() => {
          if (active) {
            setLogsLoading(false);
          }
        });
    }

    loadActivityLogs();

    // Detailed logs poll less frequently to limit database load while retaining freshness.
    const intervalId = autoRefresh
      ? window.setInterval(loadActivityLogs, 30_000)
      : undefined;

    return () => {
      active = false;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [
    accessToken,
    activityQuery,
    autoRefresh,
    logsRefreshKey,
    monitoringReady,
    view,
    t,
  ]);

  const sortedEmployees = useMemo(() => {
    const rows = monitoring?.employees ?? [];

    return [...rows].sort(compareMonitoringRows);
  }, [monitoring]);

  const roles = useMemo(
    () =>
      Array.from(new Set(sortedEmployees.map((employee) => employee.role))).sort(),
    [sortedEmployees, t],
  );

  const departments = useMemo(
    () =>
      Array.from(
        new Set(
          sortedEmployees
            .map(
              (employee) =>
                employee.department ?? employee.division ?? t("common.noUnit"),
            )
            .filter(Boolean),
        ),
      ).sort(),
    [sortedEmployees],
  );

  const selectedEmployee = useMemo(
    () =>
      sortedEmployees.find(
        (employee) => employee.accountId === appliedFilters.accountId,
      ) ?? null,
    [appliedFilters.accountId, sortedEmployees],
  );

  const activeFilterCount = useMemo(
    () => getActiveFilterCount(appliedFilters),
    [appliedFilters],
  );
  const invalidTimeRange = draftFilters.fromTime >= draftFilters.toTime;

  if (loading) {
    return (
      <section className="monitoring-panel monitoring-console monitoring-state">
        <div className="spinner" />
        <strong>{t("state.loadingTitle")}</strong>
        <p>{t("state.loadingDescription")}</p>
      </section>
    );
  }

  if (error && !monitoring) {
    return (
      <section
        className="monitoring-panel monitoring-console monitoring-state"
        role="alert"
      >
        <strong>{t("state.unavailable")}</strong>
        <p>{error}</p>
        <button
          type="button"
          onClick={() => setRefreshKey((current) => current + 1)}
        >
          {t("state.tryAgain")}
        </button>
      </section>
    );
  }

  if (!monitoring) {
    return null;
  }

  function updateDraftFilter<K extends keyof MonitoringFilterState>(
    key: K,
    value: MonitoringFilterState[K],
  ): void {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (invalidTimeRange) {
      return;
    }

    setAppliedFilters({ ...draftFilters, search: draftFilters.search.trim() });
    setPage(1);
  }

  function resetFilters(): void {
    const defaults = createDefaultFilters();

    if (view === "EMPLOYEE" && sortedEmployees.length > 0) {
      defaults.accountId = sortedEmployees[0].accountId;
    }

    setDraftFilters(defaults);
    setAppliedFilters(defaults);
    setPage(1);
  }

  function openEmployeeDetail(accountId: string): void {
    const nextFilters = {
      ...appliedFilters,
      accountId,
    };

    setDraftFilters(nextFilters);
    setAppliedFilters(nextFilters);
    setView("EMPLOYEE");
    setPage(1);
  }

  function changeView(nextView: MonitoringView): void {
    setView(nextView);
    setPage(1);

    if (
      nextView === "EMPLOYEE" &&
      appliedFilters.accountId === "ALL" &&
      sortedEmployees.length > 0
    ) {
      const accountId = sortedEmployees[0].accountId;
      setDraftFilters((current) => ({ ...current, accountId }));
      setAppliedFilters((current) => ({ ...current, accountId }));
    }
  }

  function refreshCurrentView(): void {
    setRefreshKey((current) => current + 1);
    if (view !== "OVERVIEW") {
      setLogsRefreshKey((current) => current + 1);
    }
  }

  return (
    <section
      className="monitoring-panel monitoring-console"
      aria-label={t("hero.aria")}
    >
      <header className="monitoring-console-header">
        <div className="monitoring-console-intro">
          <span className="monitoring-eyebrow">{t("hero.eyebrow")}</span>
          <h2>{t("hero.title")}</h2>
          <p>{monitoring.privacyNotice}</p>

          <div className="monitoring-boundary-note">
            <MonitoringGlyph name="privacy" />
            <div>
              <strong>{t("hero.metadataOnly")}</strong>
              <span>{t("hero.metadataDescription")}</span>
            </div>
          </div>
        </div>

        <aside className="monitoring-console-control-card">
          <div className="monitoring-control-heading">
            <MonitoringGlyph name="retention" />
            <div>
              <span>{t("hero.retention")}</span>
              <strong>
                {t("hero.retentionDetailed", { value: monitoring.retention.detailedActivityDays })}
              </strong>
              <small>
                {t("hero.retentionSummary", { value: monitoring.retention.dailySummaryDays })}
              </small>
            </div>
          </div>

          <div className="monitoring-refresh-status">
            <span className={autoRefresh ? "is-live" : "is-paused"}>
              <i />
              {autoRefresh ? t("controls.autoOn") : t("controls.autoPaused")}
            </span>
            <small>{t("hero.updated", { date: formatDateTime(monitoring.generatedAt, locale, t("common.notRecorded")) })}</small>
          </div>

          <div className="monitoring-control-actions">
            <button
              type="button"
              className="monitoring-secondary-button"
              onClick={() => setAutoRefresh((current) => !current)}
            >
              {autoRefresh ? t("controls.pause") : t("controls.resume")}
            </button>
            <button
              type="button"
              className="monitoring-primary-button"
              onClick={refreshCurrentView}
              disabled={refreshing || logsLoading}
            >
              <MonitoringGlyph name="refresh" />
              {refreshing || logsLoading ? t("controls.refreshing") : t("controls.refresh")}
            </button>
          </div>
        </aside>
      </header>

      {error && (
        <div className="monitoring-soft-warning" role="alert">
          {t("hero.latestRefreshFailed", { error })}
        </div>
      )}

      <section className="monitoring-summary-grid" aria-label={t("summary.aria")}>
        <MonitoringMetric
          label={t("summary.active")}
          value={monitoring.totals.active}
          description={t("summary.activeDescription")}
          glyph="active"
          tone="green"
        />
        <MonitoringMetric
          label={t("summary.idle")}
          value={monitoring.totals.idle}
          description={t("summary.idleDescription")}
          glyph="idle"
          tone="amber"
        />
        <MonitoringMetric
          label={t("summary.offline")}
          value={monitoring.totals.offline}
          description={t("summary.offlineDescription")}
          glyph="offline"
          tone="slate"
        />
        <MonitoringMetric
          label={t("summary.events")}
          value={monitoring.totals.actions}
          description={t("summary.eventsDescription")}
          glyph="actions"
          tone="blue"
        />
        <MonitoringMetric
          label={t("summary.emergency")}
          value={monitoring.totals.emergencyAlerts}
          description={t("summary.emergencyDescription")}
          glyph="emergency"
          tone="red"
        />
      </section>

      <nav className="monitoring-view-tabs" aria-label={t("views.aria")}>
        {(
          [
            ["OVERVIEW", t("views.overview"), t("views.overviewDescription")],
            ["LOGS", t("views.logs"), t("views.logsDescription")],
            ["EMPLOYEE", t("views.employee"), t("views.employeeDescription")],
          ] as Array<[MonitoringView, string, string]>
        ).map(([nextView, label, description]) => (
          <button
            key={nextView}
            type="button"
            className={view === nextView ? "active" : undefined}
            onClick={() => changeView(nextView)}
          >
            <strong>{label}</strong>
            <small>{description}</small>
          </button>
        ))}
      </nav>

      {view === "OVERVIEW" ? (
        <OverviewTable
          monitoring={monitoring}
          employees={sortedEmployees}
          onOpenEmployee={openEmployeeDetail}
        />
      ) : (
        <>
          <form
            className="monitoring-filter-card"
            aria-label={t("filters.aria")}
            onSubmit={applyFilters}
          >
            <header className="monitoring-filter-header">
              <div>
                <span>{t("filters.eyebrow")}</span>
                <h3>
                  {view === "EMPLOYEE"
                    ? t("filters.selectedEmployee")
                    : t("filters.systemSearch")}
                </h3>
                <p>{t("filters.description")}</p>
              </div>
              <div className="monitoring-filter-summary">
                <strong>{t("filters.active", { count: activeFilterCount })}</strong>
              </div>
            </header>

            <div className="monitoring-filter-grid">
              <label>
                {t("filters.date")}
                <input
                  type="date"
                  value={draftFilters.date}
                  onChange={(event) =>
                    updateDraftFilter("date", event.target.value)
                  }
                />
              </label>
              <label>
                {t("filters.from")}
                <input
                  type="time"
                  value={draftFilters.fromTime}
                  onChange={(event) =>
                    updateDraftFilter("fromTime", event.target.value)
                  }
                />
              </label>
              <label>
                {t("filters.to")}
                <input
                  type="time"
                  value={draftFilters.toTime}
                  onChange={(event) =>
                    updateDraftFilter("toTime", event.target.value)
                  }
                />
              </label>
              <label>
                {t("filters.employee")}
                <select
                  value={draftFilters.accountId}
                  onChange={(event) =>
                    updateDraftFilter("accountId", event.target.value)
                  }
                >
                  <option value="ALL" disabled={view === "EMPLOYEE"}>
                    {view === "EMPLOYEE" ? t("filters.chooseEmployee") : t("filters.allEmployees")}
                  </option>
                  {sortedEmployees.map((employee) => (
                    <option key={employee.accountId} value={employee.accountId}>
                      {employee.employeeName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("filters.role")}
                <select
                  value={draftFilters.role}
                  onChange={(event) =>
                    updateDraftFilter("role", event.target.value)
                  }
                >
                  <option value="ALL">{t("filters.allRoles")}</option>
                  {roles.map((roleOption) => (
                    <option key={roleOption} value={roleOption}>
                      {t(`role.${roleOption}`, { defaultValue: formatLabel(roleOption) })}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("filters.department")}
                <select
                  value={draftFilters.department}
                  onChange={(event) =>
                    updateDraftFilter("department", event.target.value)
                  }
                >
                  <option value="ALL">{t("filters.allDepartments")}</option>
                  {departments.map((departmentOption) => (
                    <option key={departmentOption} value={departmentOption}>
                      {departmentOption}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("filters.activity")}
                <select
                  value={draftFilters.eventType}
                  onChange={(event) =>
                    updateDraftFilter(
                      "eventType",
                      event.target.value as ActivityEventType | "ALL",
                    )
                  }
                >
                  {ACTIVITY_EVENT_OPTIONS.map((eventOption) => (
                    <option key={eventOption} value={eventOption}>
                      {eventOption === "ALL"
                        ? t("filters.allActivities")
                        : t(`event.${eventOption}`, { defaultValue: formatLabel(eventOption) })}
                    </option>
                  ))}
                </select>
              </label>
              <label className="monitoring-search-filter">
                {t("filters.searchSafe")}
                <input
                  type="search"
                  value={draftFilters.search}
                  placeholder={t("filters.placeholder")}
                  onChange={(event) =>
                    updateDraftFilter("search", event.target.value)
                  }
                />
              </label>
            </div>

            {invalidTimeRange && (
              <p className="monitoring-filter-error" role="alert">
                {t("filters.invalidTime")}
              </p>
            )}

            <footer className="monitoring-filter-actions">
              <div>
                <strong>{t("filters.timezone")}</strong>
                <span>{t("filters.officeDefault")}</span>
              </div>
              <button
                type="button"
                className="monitoring-secondary-button"
                onClick={resetFilters}
              >
                {t("filters.reset")}
              </button>
              <button
                type="submit"
                className="monitoring-primary-button"
                disabled={invalidTimeRange || logsLoading}
              >
                {t("filters.apply")}
              </button>
            </footer>
          </form>

          {view === "EMPLOYEE" && (
            <EmployeeDetailCard
              employee={selectedEmployee}
              logs={activityLogs?.records ?? []}
            />
          )}

          <ActivityLogTable
            logs={activityLogs}
            loading={logsLoading}
            error={logsError}
            page={page}
            onPageChange={setPage}
            title={
              view === "EMPLOYEE"
                ? t("logs.titleSelected")
                : t("logs.titleSystem")
            }
            description={
              view === "EMPLOYEE"
                ? t("logs.descriptionSelected")
                : t("logs.descriptionSystem")
            }
          />
        </>
      )}
    </section>
  );
}

function MonitoringMetric({
  label,
  value,
  description,
  glyph,
  tone,
}: {
  label: string;
  value: number;
  description: string;
  glyph: MonitoringGlyphName;
  tone: MonitoringTone;
}) {
  return (
    <article className={`monitoring-summary-card tone-${tone}`}>
      <div className="monitoring-summary-icon">
        <MonitoringGlyph name={glyph} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{formatNumber(value)}</strong>
        <small>{description}</small>
      </div>
    </article>
  );
}

function OverviewTable({
  monitoring,
  employees,
  onOpenEmployee,
}: {
  monitoring: SuperAdminMonitoringResponse;
  employees: MonitoringEmployeeRow[];
  onOpenEmployee: (accountId: string) => void;
}) {
  const { t, i18n } = useTranslation("monitoring");
  const locale = i18n.resolvedLanguage === "ne" ? "ne-NP" : "en-GB";
  return (
    <section className="monitoring-table-card monitoring-overview-card">
      <header>
        <div>
          <span className="monitoring-section-eyebrow">{t("overview.eyebrow")}</span>
          <h3>{t("overview.title")}</h3>
          <p>{t("overview.autoRefreshDescription")}</p>
        </div>

        <div className="monitoring-generated-at">
          <span>{t("overview.snapshot")}</span>
          <strong>{formatDateTime(monitoring.generatedAt, locale, t("common.notRecorded"))}</strong>
        </div>
      </header>

      {employees.length === 0 ? (
        <MonitoringEmptyState
          title={t("overview.emptyTitle")}
          description={t("overview.emptyDescription")}
        />
      ) : (
        <>
          <div className="monitoring-table-scroll monitoring-overview-table-wrap">
            <table className="monitoring-table monitoring-overview-table">
              <thead>
                <tr>
                  <th>{t("overview.employee")}</th>
                  <th>{t("overview.status")}</th>
                  <th>{t("overview.lastActivity")}</th>
                  <th>{t("overview.today")}</th>
                  <th>{t("overview.recorded")}</th>
                  <th>{t("overview.emergency")}</th>
                  <th>{t("overview.session")}</th>
                  <th aria-label={t("overview.tableAria")} />
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <MonitoringRow
                    key={employee.accountId}
                    employee={employee}
                    onOpen={() => onOpenEmployee(employee.accountId)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="monitoring-overview-cards" aria-label={t("overview.cardsAria")}>
            {employees.map((employee) => (
              <MonitoringEmployeeCard
                key={employee.accountId}
                employee={employee}
                onOpen={() => onOpenEmployee(employee.accountId)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function MonitoringRow({
  employee,
  onOpen,
}: {
  employee: MonitoringEmployeeRow;
  onOpen: () => void;
}) {
  const { t, i18n } = useTranslation("monitoring");
  const locale = i18n.resolvedLanguage === "ne" ? "ne-NP" : "en-GB";
  return (
    <tr>
      <td>
        <div className="monitoring-employee-identity">
          <span className="monitoring-avatar">
            {getEmployeeInitials(employee.employeeName)}
          </span>
          <span>
            <strong>{getEmployeeDisplayName(employee, t(`role.${employee.role}`, { defaultValue: formatLabel(employee.role) }))}</strong>
            {getEmployeeContactLine(employee) && (
              <small>{getEmployeeContactLine(employee)}</small>
            )}
            {!isEmailIdentity(employee.employeeName) && (
              <small>{t(`role.${employee.role}`, { defaultValue: formatLabel(employee.role) })}</small>
            )}
            <small>{employee.department ?? employee.division ?? t("common.noUnit")}</small>
          </span>
        </div>
      </td>
      <td>
        <span className={`monitoring-status ${employee.status.toLowerCase()}`}>
          {t(`status.${employee.status}`, { defaultValue: getStatusLabel(employee.status) })}
        </span>
      </td>
      <td>
        <strong>{formatDateTime(employee.lastActiveAt, locale, t("common.notRecorded"))}</strong>
        <small>{employee.currentPage ?? t("common.noPage")}</small>
      </td>
      <td>
        <strong>{t("overview.activeMinutes", { value: formatNumber(employee.totalActiveMinutesToday) })}</strong>
        <small>{t("overview.idleMinutes", { value: formatNumber(employee.idleMinutesToday) })}</small>
      </td>
      <td>
        <strong>{t("overview.actionsCount", { value: formatNumber(employee.actionsCount) })}</strong>
        <small>{t("overview.pageViewsCount", { value: formatNumber(employee.pagesVisited) })}</small>
      </td>
      <td>
        <strong>{formatNumber(employee.emergencyAlertsSent)}</strong>
        <small>{t("overview.alertsSent")}</small>
      </td>
      <td>
        <strong>{formatDateTime(employee.firstLoginAt, locale, t("common.notRecorded"))}</strong>
        <small>{t("overview.logout", { date: formatDateTime(employee.lastLogoutAt, locale, t("common.notRecorded")) })}</small>
      </td>
      <td>
        <button
          type="button"
          className="monitoring-row-action"
          onClick={onOpen}
        >
          {t("overview.viewEmployee")}
          <span aria-hidden="true">→</span>
        </button>
      </td>
    </tr>
  );
}

function MonitoringEmployeeCard({
  employee,
  onOpen,
}: {
  employee: MonitoringEmployeeRow;
  onOpen: () => void;
}) {
  const { t, i18n } = useTranslation("monitoring");
  const locale = i18n.resolvedLanguage === "ne" ? "ne-NP" : "en-GB";
  return (
    <article className="monitoring-employee-card">
      <header>
        <div className="monitoring-employee-identity">
          <span className="monitoring-avatar">
            {getEmployeeInitials(employee.employeeName)}
          </span>
          <span>
            <strong>{getEmployeeDisplayName(employee, t(`role.${employee.role}`, { defaultValue: formatLabel(employee.role) }))}</strong>
            {getEmployeeContactLine(employee) && (
              <small>{getEmployeeContactLine(employee)}</small>
            )}
            {!isEmailIdentity(employee.employeeName) && (
              <small>{t(`role.${employee.role}`, { defaultValue: formatLabel(employee.role) })}</small>
            )}
            <small>{employee.department ?? employee.division ?? t("common.noUnit")}</small>
          </span>
        </div>
        <span className={`monitoring-status ${employee.status.toLowerCase()}`}>
          {t(`status.${employee.status}`, { defaultValue: getStatusLabel(employee.status) })}
        </span>
      </header>

      <dl>
        <div>
          <dt>{t("overview.lastActivity")}</dt>
          <dd>{formatDateTime(employee.lastActiveAt, locale, t("common.notRecorded"))}</dd>
        </div>
        <div>
          <dt>{t("overview.currentPage")}</dt>
          <dd>{employee.currentPage ?? t("common.notRecorded")}</dd>
        </div>
        <div>
          <dt>{t("overview.activeIdle")}</dt>
          <dd>
            {t("employee.minutes", { value: formatNumber(employee.totalActiveMinutesToday) })} / {t("employee.minutes", { value: formatNumber(employee.idleMinutesToday) })}
          </dd>
        </div>
        <div>
          <dt>{t("overview.events")}</dt>
          <dd>{formatNumber(employee.actionsCount)}</dd>
        </div>
      </dl>

      <button type="button" className="monitoring-row-action" onClick={onOpen}>
        {t("overview.viewDetail")}
        <span aria-hidden="true">→</span>
      </button>
    </article>
  );
}

function ActivityLogTable({
  logs,
  loading,
  error,
  page,
  onPageChange,
  title,
  description,
}: {
  logs: MonitoringActivityLogsResponse | null;
  loading: boolean;
  error: string;
  page: number;
  onPageChange: (page: number) => void;
  title: string;
  description: string;
}) {
  const { t, i18n } = useTranslation("monitoring");
  const locale = i18n.resolvedLanguage === "ne" ? "ne-NP" : "en-GB";
  const total = logs?.pagination.total ?? 0;
  const firstRecord = total === 0 ? 0 : (page - 1) * DEFAULT_LOG_LIMIT + 1;
  const lastRecord = Math.min(page * DEFAULT_LOG_LIMIT, total);
  const totalPages = Math.max(logs?.pagination.totalPages ?? 1, 1);

  return (
    <section className="monitoring-table-card monitoring-log-card">
      <header>
        <div>
          <span className="monitoring-section-eyebrow">{t("logs.eyebrow")}</span>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <div className="monitoring-result-summary">
          {loading && <span className="monitoring-loading-dot">{t("logs.refreshing")}</span>}
          <strong>
            {total === 0
              ? t("logs.zero")
              : t("logs.showing", { first: firstRecord, last: lastRecord, total: formatNumber(total) })}
          </strong>
          <small>{logs ? t("logs.generated", { date: formatDateTime(logs.generatedAt, locale, t("common.notRecorded")) }) : t("logs.loadingShort")}</small>
        </div>
      </header>

      {error ? (
        <div className="monitoring-inline-state" role="alert">
          <strong>{t("logs.unavailable")}</strong>
          <span>{error}</span>
        </div>
      ) : loading && !logs ? (
        <div className="monitoring-inline-state">
          <div className="spinner" />
          <strong>{t("logs.loading")}</strong>
        </div>
      ) : (logs?.records ?? []).length === 0 ? (
        <MonitoringEmptyState
          title={t("logs.emptyTitle")}
          description={t("logs.emptyDescription")}
        />
      ) : (
        <>
          <div className="monitoring-table-scroll monitoring-log-table-wrap">
            <table className="monitoring-table monitoring-log-table">
              <thead>
                <tr>
                  <th>{t("logs.time")}</th>
                  <th>{t("overview.employee")}</th>
                  <th>{t("logs.scope")}</th>
                  <th>{t("logs.activity")}</th>
                  <th>{t("logs.details")}</th>
                  <th>{t("overview.status")}</th>
                  <th>{t("overview.session")}</th>
                </tr>
              </thead>
              <tbody>
                {logs?.records.map((record) => (
                  <ActivityLogRow key={record.id} record={record} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="monitoring-log-cards" aria-label={t("logs.cardsAria")}>
            {logs?.records.map((record) => (
              <ActivityLogCard key={record.id} record={record} />
            ))}
          </div>

          <div className="monitoring-pagination">
            <div>
              <strong>{t("common.page", { page: logs?.pagination.page ?? page })}</strong>
              <span>{t("common.ofPages", { total: totalPages })}</span>
            </div>
            <button
              type="button"
              onClick={() => onPageChange(Math.max(page - 1, 1))}
              disabled={page <= 1 || loading}
            >
              {t("common.previous")}
            </button>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(page + 1, totalPages))}
              disabled={page >= totalPages || loading}
            >
              {t("common.next")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function ActivityLogRow({ record }: { record: MonitoringActivityLogRow }) {
  const { t, i18n } = useTranslation("monitoring");
  const locale = i18n.resolvedLanguage === "ne" ? "ne-NP" : "en-GB";
  return (
    <tr>
      <td>
        <strong>{formatTime(record.occurredAt, locale, t("common.notRecorded"))}</strong>
        <small>{record.isOfficeHours ? t("common.officeHours") : t("common.afterHours")}</small>
      </td>
      <td>
        <strong>{record.employeeName}</strong>
        <small>{record.designation ?? t("common.noDesignation")}</small>
      </td>
      <td>
        <strong>{t(`role.${record.role}`, { defaultValue: formatLabel(record.role) })}</strong>
        <small>{record.department ?? t("common.noUnit")}</small>
      </td>
      <td>
        <span className={`monitoring-action-badge ${record.eventType.toLowerCase()}`}>
          {t(`event.${record.eventType}`, { defaultValue: formatLabel(record.eventType) })}
        </span>
        <small>{record.pageName ?? t("common.application")}</small>
      </td>
      <td>{record.details}</td>
      <td>
        <span className="monitoring-status active">{t(`status.${record.status}`, { defaultValue: formatLabel(record.status) })}</span>
      </td>
      <td>
        <code className="monitoring-session-code" title={t("common.maskedSession")}>
          {maskSessionLabel(record.sessionLabel, t("common.notRecorded"))}
        </code>
      </td>
    </tr>
  );
}

function ActivityLogCard({ record }: { record: MonitoringActivityLogRow }) {
  const { t, i18n } = useTranslation("monitoring");
  const locale = i18n.resolvedLanguage === "ne" ? "ne-NP" : "en-GB";
  return (
    <article className="monitoring-log-mobile-card">
      <header>
        <div>
          <strong>{record.employeeName}</strong>
          <span>{formatTime(record.occurredAt, locale, t("common.notRecorded"))} · {record.isOfficeHours ? t("common.officeHours") : t("common.afterHours")}</span>
        </div>
        <span className="monitoring-status active">{t(`status.${record.status}`, { defaultValue: formatLabel(record.status) })}</span>
      </header>

      <div className="monitoring-log-mobile-activity">
        <span className={`monitoring-action-badge ${record.eventType.toLowerCase()}`}>
          {t(`event.${record.eventType}`, { defaultValue: formatLabel(record.eventType) })}
        </span>
        <strong>{record.pageName ?? t("common.application")}</strong>
      </div>

      <p>{record.details}</p>

      <dl>
        <div>
          <dt>{t("common.role")}</dt>
          <dd>{t(`role.${record.role}`, { defaultValue: formatLabel(record.role) })}</dd>
        </div>
        <div>
          <dt>{t("common.department")}</dt>
          <dd>{record.department ?? t("common.noUnit")}</dd>
        </div>
        <div>
          <dt>{t("common.session")}</dt>
          <dd>{maskSessionLabel(record.sessionLabel, t("common.notRecorded"))}</dd>
        </div>
      </dl>
    </article>
  );
}

function EmployeeDetailCard({
  employee,
  logs,
}: {
  employee: MonitoringEmployeeRow | null;
  logs: MonitoringActivityLogRow[];
}) {
  const { t, i18n } = useTranslation("monitoring");
  const locale = i18n.resolvedLanguage === "ne" ? "ne-NP" : "en-GB";
  if (!employee) {
    return (
      <section className="monitoring-employee-detail empty">
        <MonitoringGlyph name="employee" />
        <strong>{t("employee.emptyTitle")}</strong>
        <span>{t("employee.emptyDescription")}</span>
      </section>
    );
  }

  const timelineLogs = logs.slice(0, 8);

  return (
    <section
      className="monitoring-employee-detail"
      aria-label={t("employee.aria")}
    >
      <header className="monitoring-employee-detail-header">
        <div className="monitoring-employee-identity">
          <span className="monitoring-avatar large">
            {getEmployeeInitials(employee.employeeName)}
          </span>
          <span>
            <span className="monitoring-section-eyebrow">{t("employee.eyebrow")}</span>
            <h3>{getEmployeeDisplayName(employee, t(`role.${employee.role}`, { defaultValue: formatLabel(employee.role) }))}</h3>
            {isEmailIdentity(employee.employeeName) && (
              <small className="monitoring-employee-contact">
                {employee.employeeName}
              </small>
            )}
            <p>
              {employee.department ?? employee.division ?? t("common.noUnit")} · {t(`role.${employee.role}`, { defaultValue: formatLabel(employee.role) })}
            </p>
          </span>
        </div>
        <span className={`monitoring-status ${employee.status.toLowerCase()}`}>
          {t(`status.${employee.status}`, { defaultValue: getStatusLabel(employee.status) })}
        </span>
      </header>

      <dl className="monitoring-employee-metrics">
        <div>
          <dt>{t("employee.activeToday")}</dt>
          <dd>{t("employee.minutes", { value: formatNumber(employee.totalActiveMinutesToday) })}</dd>
        </div>
        <div>
          <dt>{t("employee.idleToday")}</dt>
          <dd>{t("employee.minutes", { value: formatNumber(employee.idleMinutesToday) })}</dd>
        </div>
        <div>
          <dt>{t("employee.events")}</dt>
          <dd>{formatNumber(employee.actionsCount)}</dd>
        </div>
        <div>
          <dt>{t("employee.pageViews")}</dt>
          <dd>{formatNumber(employee.pagesVisited)}</dd>
        </div>
      </dl>

      <section className="monitoring-employee-session-grid">
        <div>
          <span>{t("employee.lastActive")}</span>
          <strong>{formatDateTime(employee.lastActiveAt, locale, t("common.notRecorded"))}</strong>
          <small>{employee.currentPage ?? t("common.noPage")}</small>
        </div>
        <div>
          <span>{t("employee.firstLogin")}</span>
          <strong>{formatDateTime(employee.firstLoginAt, locale, t("common.notRecorded"))}</strong>
          <small>{t("employee.lastLogout", {
            date: formatDateTime(employee.lastLogoutAt, locale, t("common.notRecorded")),
          })}</small>
        </div>
      </section>

      <div className="monitoring-employee-timeline">
        <header>
          <div>
            <strong>{t("employee.timeline")}</strong>
            <span>{t("employee.latestEvents", { value: Math.min(timelineLogs.length, 8) })}</span>
          </div>
        </header>

        {timelineLogs.length === 0 ? (
          <p>{t("employee.noActivity")}</p>
        ) : (
          <ol>
            {timelineLogs.map((record) => (
              <li key={record.id}>
                <time>{formatTime(record.occurredAt, locale, t("common.notRecorded"))}</time>
                <span className={`monitoring-action-badge ${record.eventType.toLowerCase()}`}>
                  {t(`event.${record.eventType}`, { defaultValue: formatLabel(record.eventType) })}
                </span>
                <div>
                  <strong>{record.pageName ?? t("common.application")}</strong>
                  <p>{record.details}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function MonitoringEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="monitoring-empty-state">
      <span aria-hidden="true">✓</span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function MonitoringGlyph({ name }: { name: MonitoringGlyphName }) {
  const commonProps = {
    "aria-hidden": true,
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "active":
      return (
        <svg {...commonProps}>
          <path d="M3 12h4l2-5 4 10 2-5h6" />
        </svg>
      );
    case "idle":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v5l3 2" />
        </svg>
      );
    case "offline":
      return (
        <svg {...commonProps}>
          <path d="M4 4l16 16" />
          <path d="M8.5 8.5A5 5 0 0 0 7 12c0 2.8 2.2 5 5 5 1.3 0 2.5-.5 3.4-1.3" />
          <path d="M15.5 8.5A5 5 0 0 0 12 7" />
        </svg>
      );
    case "actions":
      return (
        <svg {...commonProps}>
          <path d="M5 4h14v16H5z" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      );
    case "emergency":
      return (
        <svg {...commonProps}>
          <path d="M12 3l9 16H3z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...commonProps}>
          <path d="M20 6v5h-5" />
          <path d="M4 18v-5h5" />
          <path d="M18.5 10A7 7 0 0 0 6 7.5L4 11" />
          <path d="M5.5 14A7 7 0 0 0 18 16.5l2-3.5" />
        </svg>
      );
    case "retention":
      return (
        <svg {...commonProps}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" />
        </svg>
      );
    case "employee":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 21c.8-4.2 3.3-6.5 7.5-6.5s6.7 2.3 7.5 6.5" />
        </svg>
      );
    case "privacy":
    default:
      return (
        <svg {...commonProps}>
          <path d="M12 3l7 3v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6z" />
          <path d="M9.5 12l1.8 1.8 3.7-4" />
        </svg>
      );
  }
}

function compareMonitoringRows(
  first: MonitoringEmployeeRow,
  second: MonitoringEmployeeRow,
): number {
  const statusWeight: Record<MonitoringStatus, number> = {
    ACTIVE: 0,
    IDLE: 1,
    OFFLINE: 2,
  };

  const statusDifference =
    statusWeight[first.status] - statusWeight[second.status];

  if (statusDifference !== 0) {
    return statusDifference;
  }

  return first.employeeName.localeCompare(second.employeeName);
}
