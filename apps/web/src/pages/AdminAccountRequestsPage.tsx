import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { AdminRequestDetailPanel } from "../components/AdminRequestDetailPanel";
import { ProtectedAvatar } from "../components/ProtectedAvatar";
import { ManagementIcon } from "../components/layout/ManagementIcon";
import { useAuth } from "../context/AuthContext";
import {
  getAdminDepartments,
  getAdminDivisions,
} from "../services/admin-account.service";
import {
  getAdminAccountRequestSummary,
  listAdminAccountRequests,
} from "../services/account-request.service";
import type {
  AccountRequestStatus,
  AdminAccountRequestListItem,
  AdminAccountRequestListQuery,
  AdminAccountRequestSummaryResponse,
} from "../types/account-request";
import type { AdminDepartment, AdminDivision } from "../types/admin-account";
import type { AccountRole } from "../types/auth";

const PAGE_SIZE = 20;
const STATUS_OPTIONS: Array<{ value: AccountRequestStatus; labelKey: string }> = [
  { value: "PENDING_APPROVAL", labelKey: "common.pending" },
  { value: "APPROVED", labelKey: "common.approved" },
  { value: "REJECTED", labelKey: "common.rejected" },
  { value: "ACTIVATION_PENDING", labelKey: "common.activating" },
  { value: "ACTIVATED", labelKey: "common.activated" },
  { value: "DRAFT", labelKey: "common.draft" },
];
const VALID_STATUSES = new Set<AccountRequestStatus>(
  STATUS_OPTIONS.map((option) => option.value),
);

function parseStatus(value: string | null): AccountRequestStatus {
  return value && VALID_STATUSES.has(value as AccountRequestStatus)
    ? (value as AccountRequestStatus)
    : "PENDING_APPROVAL";
}

function fallbackFormatValue(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatValue(value: string, t: TFunction<"requests">): string {
  return t(`values.${value}`, {
    ns: "requests",
    defaultValue: fallbackFormatValue(value),
  });
}

function formatDate(
  value: string | null,
  locale: string,
  t: TFunction<"requests">,
): string {
  if (!value) {
    return t("common.notReviewed", { ns: "requests" });
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? t("common.notAvailable", { ns: "requests" })
    : new Intl.DateTimeFormat(locale === "ne" ? "ne-NP-u-ca-gregory" : "en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function getStatusClass(status: AccountRequestStatus): string {
  return status.toLowerCase().replaceAll("_", "-");
}

function getRequesterName(
  request: AdminAccountRequestListItem,
  t: TFunction<"requests">,
): string {
  return (
    request.requestedBy.employee?.empName ??
    request.requestedBy.username ??
    t("common.unknownRequester", { ns: "requests" })
  );
}

function getLifecycleText(
  request: AdminAccountRequestListItem,
  t: TFunction<"requests">,
): string {
  return t(`lifecycle.${request.status}`, {
    ns: "requests",
    defaultValue: t("lifecycle.DRAFT", { ns: "requests" }),
  });
}

function RequestEmployeeAvatar({
  request,
}: {
  request: AdminAccountRequestListItem;
}) {
  const { t } = useTranslation("requests");
  if (request.status !== "ACTIVATED") {
    return (
      <span
        className="admin-account-requests-page__request-avatar"
        aria-hidden="true"
      >
        {request.empName.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <ProtectedAvatar
      employeeId={request.employeeId}
      officialEmail={request.officialEmail}
      displayName={request.empName}
      className="admin-account-requests-page__request-avatar"
      ariaLabel={t("adminList.profileAria", { name: request.empName })}
    />
  );
}

export function AdminAccountRequestsPage() {
  const { t, i18n } = useTranslation("requests");
  const { accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = parseStatus(searchParams.get("status"));
  const selectedRequestId = searchParams.get("request");

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [requestedRole, setRequestedRole] = useState<AccountRole | "">("");
  const [divisionId, setDivisionId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [requests, setRequests] = useState<AdminAccountRequestListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [summary, setSummary] =
    useState<AdminAccountRequestSummaryResponse | null>(null);
  const [divisions, setDivisions] = useState<AdminDivision[]>([]);
  const [departments, setDepartments] = useState<AdminDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState("");
  const [organizationError, setOrganizationError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  useEffect(() => {
    // Debouncing avoids issuing a server request for every keystroke while the
    // Super Admin is still entering an employee or requester search term.
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [status]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let active = true;

    Promise.all([
      getAdminDivisions(accessToken),
      getAdminDepartments(accessToken),
    ])
      .then(([divisionResponse, departmentResponse]) => {
        if (!active) {
          return;
        }

        setDivisions(divisionResponse.data);
        setDepartments(departmentResponse.data);
        setOrganizationError("");
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setOrganizationError(
          requestError instanceof Error
            ? requestError.message
            : t("adminList.organizationError"),
        );
      });

    return () => {
      active = false;
    };
  }, [accessToken, t]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let active = true;
    setSummaryLoading(true);

    getAdminAccountRequestSummary(accessToken)
      .then((response) => {
        if (!active) {
          return;
        }

        setSummary(response);
      })
      .catch(() => {
        if (active) {
          setSummary(null);
        }
      })
      .finally(() => {
        if (active) {
          setSummaryLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, refreshKey]);

  const query = useMemo<AdminAccountRequestListQuery>(
    () => ({
      status,
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      requestedRole: requestedRole || undefined,
      divisionId: divisionId || undefined,
      departmentId: departmentId || undefined,
      // Date-only inputs are expanded to the complete local calendar day before
      // the API receives UTC timestamps, preventing midnight boundary omissions.
      dateFrom: dateFrom
        ? new Date(`${dateFrom}T00:00:00`).toISOString()
        : undefined,
      dateTo: dateTo
        ? new Date(`${dateTo}T23:59:59.999`).toISOString()
        : undefined,
    }),
    [
      dateFrom,
      dateTo,
      debouncedSearch,
      departmentId,
      divisionId,
      page,
      requestedRole,
      status,
    ],
  );

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let active = true;
    setLoading(true);

    listAdminAccountRequests(accessToken, query)
      .then((response) => {
        if (!active) {
          return;
        }

        setRequests(response.data);
        setTotal(response.pagination.total);
        setTotalPages(response.pagination.totalPages);
        setLastRefreshedAt(new Date().toISOString());
        setError("");
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setRequests([]);
        setTotal(0);
        setTotalPages(0);
        setError(
          requestError instanceof Error
            ? requestError.message
            : t("adminList.loadError"),
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, query, refreshKey, t]);

  const filteredDepartments = useMemo(
    () =>
      departments.filter(
        (department) =>
          department.isActive &&
          (!divisionId || department.division.id === divisionId),
      ),
    [departments, divisionId],
  );

  const activeFilterCount = [
    searchInput.trim(),
    requestedRole,
    divisionId,
    departmentId,
    dateFrom,
    dateTo,
  ].filter(Boolean).length;

  const firstResult = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(page * PAGE_SIZE, total);

  function changeStatus(nextStatus: AccountRequestStatus): void {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("status", nextStatus);
      next.delete("request");
      return next;
    });
  }

  function openRequest(requestId: string): void {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("status", status);
      next.set("request", requestId);
      return next;
    });
  }

  function closeRequest(): void {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("request");
      return next;
    });
  }

  function resetFilters(): void {
    setSearchInput("");
    setDebouncedSearch("");
    setRequestedRole("");
    setDivisionId("");
    setDepartmentId("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  function refreshRequests(): void {
    setRefreshKey((current) => current + 1);
  }

  return (
    <main className="management-page admin-account-requests-page">
      <header className="admin-account-requests-page__header">
        <div className="admin-account-requests-page__header-copy">
          <span>{t("adminList.eyebrow")}</span>
          <h1>{t("adminList.title")}</h1>
          <p>{t("adminList.description")}</p>
        </div>

        <div className="admin-account-requests-page__refresh">
          <span>
            {lastRefreshedAt
              ? t("adminList.updated", { date: formatDate(lastRefreshedAt, i18n.language, t) })
              : t("adminList.loadingQueue")}
          </span>
          <button type="button" onClick={refreshRequests} disabled={loading}>
            {loading ? t("adminList.refreshing") : t("adminList.refresh")}
          </button>
        </div>
      </header>

      <nav
        className="admin-account-requests-page__statuses"
        aria-label={t("adminList.statusAria")}
      >
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={status === option.value ? "active" : ""}
            aria-pressed={status === option.value}
            onClick={() => changeStatus(option.value)}
          >
            <span>{t(option.labelKey)}</span>
            <strong>
              {summaryLoading && !summary
                ? "—"
                : (summary?.counts[option.value] ?? 0)}
            </strong>
          </button>
        ))}
      </nav>

      <section
        className="admin-account-requests-page__filters"
        aria-label={t("adminList.filtersAria")}
      >
        <div className="admin-account-requests-page__filter-heading">
          <div>
            <ManagementIcon name="requests" />
            <span>
              <strong>{t("adminList.filtersTitle")}</strong>
              <small>
                {t("adminList.filterDescription", { status: formatValue(status, t).toLowerCase() })}
              </small>
            </span>
          </div>
          <span className="admin-account-requests-page__filter-count">
            {t("adminList.activeFilters", { count: activeFilterCount })}
          </span>
        </div>

        <label className="admin-account-requests-page__search">
          <span>{t("adminList.employeeOrRequester")}</span>
          <input
            type="search"
            value={searchInput}
            placeholder={t("adminList.searchPlaceholder")}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </label>

        <label>
          <span>{t("common.requestedRole")}</span>
          <select
            value={requestedRole}
            onChange={(event) => {
              setRequestedRole(event.target.value as AccountRole | "");
              setPage(1);
            }}
          >
            <option value="">{t("adminList.allRoles")}</option>
            <option value="EMPLOYEE">{t("common.employee")}</option>
            <option value="TEAM_MANAGER">{t("common.teamManager")}</option>
            <option value="SENIOR_MANAGEMENT">{t("common.seniorManagement")}</option>
          </select>
        </label>

        <label>
          <span>{t("common.division")}</span>
          <select
            value={divisionId}
            onChange={(event) => {
              const nextDivisionId = event.target.value;
              setDivisionId(nextDivisionId);
              setPage(1);

              if (
                departmentId &&
                !departments.some(
                  (department) =>
                    department.id === departmentId &&
                    (!nextDivisionId ||
                      department.division.id === nextDivisionId),
                )
              ) {
                setDepartmentId("");
              }
            }}
          >
            <option value="">{t("common.allDivisions")}</option>
            {divisions
              .filter((division) => division.isActive)
              .map((division) => (
                <option key={division.id} value={division.id}>
                  {division.name} ({division.code})
                </option>
              ))}
          </select>
        </label>

        <label>
          <span>{t("common.department")}</span>
          <select
            value={departmentId}
            onChange={(event) => {
              setDepartmentId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("common.allDepartments")}</option>
            {filteredDepartments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name} ({department.code})
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>{t("adminList.submittedFrom")}</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setDateFrom(event.target.value);
              setPage(1);
            }}
          />
        </label>

        <label>
          <span>{t("adminList.submittedTo")}</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(event) => {
              setDateTo(event.target.value);
              setPage(1);
            }}
          />
        </label>

        <button
          type="button"
          className="admin-account-requests-page__clear"
          onClick={resetFilters}
          disabled={activeFilterCount === 0}
        >
          {t("adminList.clearFilters")}
        </button>

        {organizationError && (
          <p
            className="admin-account-requests-page__filter-warning"
            role="status"
          >
            {t("adminList.filterWarning", { error: organizationError })}
          </p>
        )}
      </section>

      <section className="admin-account-requests-page__records">
        <header>
          <div>
            <span>{t("adminList.queue", { status: formatValue(status, t) })}</span>
            <h2>
              {t("adminList.requestCount", { count: total })}
            </h2>
          </div>
          {total > 0 ? (
            <small>
              {t("adminList.showing", { first: firstResult, last: lastResult, total })}
            </small>
          ) : (
            <small>{t("adminList.requestsInView", { count: 0 })}</small>
          )}
        </header>

        {!accessToken && (
          <div className="admin-request-error">
            {t("adminList.sessionUnavailable")}
          </div>
        )}
        {error && <div className="admin-request-error">{error}</div>}
        {loading && (
          <div className="admin-account-requests-page__state">
            <span
              className="admin-account-requests-page__loader"
              aria-hidden="true"
            />
            {t("adminList.loadingRequests")}
          </div>
        )}

        {!loading && !error && requests.length === 0 && (
          <div className="admin-account-requests-page__empty">
            <span aria-hidden="true">✓</span>
            <div>
              <strong>
                {activeFilterCount > 0
                  ? t("adminList.emptyFilteredTitle")
                  : t("adminList.queueClear", { status: formatValue(status, t) })}
              </strong>
              <p>
                {activeFilterCount > 0
                  ? t("adminList.emptyFilteredDescription")
                  : t("adminList.emptyStatusDescription")}
              </p>
            </div>
            {activeFilterCount > 0 && (
              <button type="button" onClick={resetFilters}>
                {t("adminList.resetFilters")}
              </button>
            )}
          </div>
        )}

        {!loading && !error && requests.length > 0 && (
          <>
            <div className="admin-account-requests-page__table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("adminList.tableEmployee")}</th>
                    <th>{t("adminList.tableRequest")}</th>
                    <th>{t("common.organization")}</th>
                    <th>{t("common.requestedBy")}</th>
                    <th>{t("common.lifecycle")}</th>
                    <th>{t("common.activationEmail")}</th>
                    <th>{t("common.submitted")}</th>
                    <th aria-label={t("common.actions")} />
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr key={request.id}>
                      <td>
                        <span className="admin-account-requests-page__employee-cell">
                          <RequestEmployeeAvatar request={request} />
                          <span>
                            <strong>{request.empName}</strong>
                            <small>{request.empId}</small>
                            <small>{request.officialEmail}</small>
                          </span>
                        </span>
                      </td>
                      <td>
                        <strong>{formatValue(request.requestedRole, t)}</strong>
                        <span>{t("adminList.revision", { number: request.revisionNumber })}</span>
                      </td>
                      <td>
                        <strong>
                          {request.department?.name ?? t("common.noDepartment")}
                        </strong>
                        <span>{request.division?.name ?? t("common.noDivision")}</span>
                      </td>
                      <td>
                        <strong>{getRequesterName(request, t)}</strong>
                        <span>{formatValue(request.requestedBy.role, t)}</span>
                      </td>
                      <td>
                        <span
                          className={`admin-status-badge ${getStatusClass(request.status)}`}
                        >
                          {formatValue(request.status, t)}
                        </span>
                        <small>{getLifecycleText(request, t)}</small>
                      </td>
                      <td>
                        <strong
                          className={`activation-delivery-status activation-delivery-status--${request.activationEmailStatus.toLowerCase()}`}
                        >
                          {formatValue(request.activationEmailStatus, t)}
                        </strong>
                        <span>
                          {request.activationEmailSentAt
                            ? t("adminList.sentDate", { date: formatDate(request.activationEmailSentAt, i18n.language, t) })
                            : request.activationEmailLastAttemptAt
                              ? t("adminList.attemptedDate", { date: formatDate(
                                  request.activationEmailLastAttemptAt,
                                  i18n.language,
                                  t,
                                ) })
                              : t("common.notAttempted")}
                        </span>
                      </td>
                      <td>
                        <strong>{formatDate(request.submittedAt, i18n.language, t)}</strong>
                        <span>
                          {request.reviewedAt
                            ? t("adminList.reviewedDate", { date: formatDate(request.reviewedAt, i18n.language, t) })
                            : t("common.notReviewed")}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => openRequest(request.id)}
                        >
                          {t("adminList.viewDetails")} <span aria-hidden="true">→</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="admin-account-requests-page__cards">
              {requests.map((request) => (
                <article key={request.id}>
                  <header>
                    <span className="admin-account-requests-page__mobile-identity">
                      <RequestEmployeeAvatar request={request} />
                      <span>
                        <strong>{request.empName}</strong>
                        <small>{request.empId}</small>
                      </span>
                    </span>
                    <span
                      className={`admin-status-badge ${getStatusClass(request.status)}`}
                    >
                      {formatValue(request.status, t)}
                    </span>
                  </header>
                  <dl>
                    <div>
                      <dt>{t("common.requestedRole")}</dt>
                      <dd>{formatValue(request.requestedRole, t)}</dd>
                    </div>
                    <div>
                      <dt>{t("common.organization")}</dt>
                      <dd>
                        {request.department?.name ??
                          request.division?.name ??
                          t("common.notAssigned")}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("common.activationEmail")}</dt>
                      <dd>{formatValue(request.activationEmailStatus, t)}</dd>
                    </div>
                    <div>
                      <dt>{t("common.requestedBy")}</dt>
                      <dd>{getRequesterName(request, t)}</dd>
                    </div>
                    <div>
                      <dt>{t("common.submitted")}</dt>
                      <dd>{formatDate(request.submittedAt, i18n.language, t)}</dd>
                    </div>
                  </dl>
                  <p>{getLifecycleText(request, t)}</p>
                  <button type="button" onClick={() => openRequest(request.id)}>
                    {t("adminList.viewRequestDetails")} <span aria-hidden="true">→</span>
                  </button>
                </article>
              ))}
            </div>
          </>
        )}

        {!loading && !error && totalPages > 1 && (
          <footer className="admin-pagination">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              {t("adminList.previous")}
            </button>
            <span>
              {t("adminList.page", { page, total: totalPages })}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              {t("adminList.next")}
            </button>
          </footer>
        )}
      </section>

      {selectedRequestId && accessToken && (
        <AdminRequestDetailPanel
          key={selectedRequestId}
          accessToken={accessToken}
          requestId={selectedRequestId}
          onRequestUpdated={refreshRequests}
          onClose={closeRequest}
        />
      )}
    </main>
  );
}
